import type { Camera } from "@babylonjs/core/Cameras/camera";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { SHIP_LAYER, type ShipMounts } from "./ranger";

/** A rectangle on screen as shares of the canvas, from its top left. */
export type ScreenRect = { left: number; top: number; width: number; height: number };

/** Where the two aft views sit over the windscreen: port on the left, starboard on the right. */
export const AFT_VIEWS: Record<"port" | "starboard", ScreenRect> = {
	port: { left: 0.015, top: 0.2, width: 0.25, height: 0.2 },
	starboard: { left: 0.735, top: 0.2, width: 0.25, height: 0.2 },
};

/** Everything but the ship. Babylon's default mask, without the ship's bit. */
const WORLD_LAYER = 0x0fffffff;
/**
 * Drawn on the chart and nowhere in the cockpit. The course line runs from under the pilot's seat, so
 * from there it is a wobbling streak across the windscreen. Orbit lines use this layer too.
 */
export const CHART_LAYER = 0x40000000;

/** Vertical field of view out the windscreen, wider than the chart's so the dash reads under the view. */
const WINDSCREEN_FOV = 1.15;
/** Wide enough that a side plume fits in its aft view from base to tip. */
const AFT_FOV = 1;
/**
 * The world is drawn from this far out, so its depth range still separates a moon from its planet.
 * Anything nearer is part of the ship, which the aft views draw after it with a near plane that fits the hull.
 */
const WORLD_NEAR = 0.02;
const WORLD_FAR = 9000;
const SHIP_NEAR = 0.0004;
const SHIP_FAR = 1;
/**
 * Seconds for the view of the world to catch up with the ship's turns, so it swings smoothly instead of
 * stepping with every course correction.
 */
const STEADY_SECONDS = 0.15;
/** A swing wider than this in one frame is a cut, and the view takes it at once. */
const STEADY_CUT = 1;
/**
 * How far the pilot can turn their head, in radians from straight ahead. Pitch is positive looking down,
 * and the head tips back further than it bows.
 */
const LOOK_YAW = 1.3;
const LOOK_UP = 0.6;
const LOOK_DOWN = 0.45;
/** Seconds for the head to catch up with a drag, so a flick turns it rather than jumping. */
const LOOK_SECONDS = 0.08;

type Rig = {
	mount: TransformNode;
	/** The world, then the ship over it if this view shows the hull. All share one position and viewport. */
	cameras: TargetCamera[];
	/** Flipped left to right, so an aft view reads like a mirror: the hull on the inside edge. */
	mirrored: boolean;
	/** Where the world camera faces: the mount's rotation, eased. */
	steady: Quaternion;
};

/** The pilot's head, turned by dragging across the windscreen. */
type Head = { yaw: number; pitch: number };

function clampHead(head: Head): Head {
	return {
		yaw: Math.max(-LOOK_YAW, Math.min(LOOK_YAW, head.yaw)),
		pitch: Math.max(-LOOK_UP, Math.min(LOOK_DOWN, head.pitch)),
	};
}

export type Cockpit = {
	/** Moves every cockpit camera onto its mount. Call once per frame, after the ship has been placed. */
	update: () => void;
	/** Draws the windscreen and both aft views instead of `chart`, or hands the screen back to it. */
	setActive: (on: boolean) => void;
};

export function createCockpit(scene: Scene, mounts: ShipMounts, chart: Camera, glow: GlowLayer): Cockpit {
	const engine = scene.getEngine();
	chart.layerMask = WORLD_LAYER | SHIP_LAYER | CHART_LAYER;

	const camera = (name: string, layer: number, fov: number, near: number, far: number, rect: ScreenRect | null) => {
		const made = new TargetCamera(name, Vector3.Zero(), scene, false);
		made.layerMask = layer;
		made.fov = fov;
		made.minZ = near;
		made.maxZ = far;
		made.rotationQuaternion = new Quaternion();
		if (rect) {
			made.viewport = new Viewport(rect.left, 1 - rect.top - rect.height, rect.width, rect.height);
		}
		return made;
	};

	const rig = (name: string, mount: TransformNode, fov: number, rect: ScreenRect | null, hull: boolean): Rig => ({
		mount,
		cameras: [
			camera(`${name}-world`, WORLD_LAYER, fov, WORLD_NEAR, WORLD_FAR, rect),
			...(hull ? [camera(`${name}-ship`, SHIP_LAYER, fov, SHIP_NEAR, SHIP_FAR, rect)] : []),
		],
		mirrored: hull,
		steady: new Quaternion(),
	});

	const windscreen = rig("cockpit-windscreen", mounts.eye, WINDSCREEN_FOV, null, false);
	const rigs = [
		windscreen,
		rig("cockpit-aft-port", mounts.port, AFT_FOV, AFT_VIEWS.port, true),
		rig("cockpit-aft-starboard", mounts.starboard, AFT_FOV, AFT_VIEWS.starboard, true),
	];
	// Each camera after the first clears depth only, so the ship always lands on top of the world it was drawn over.
	const cameras = rigs.flatMap((each) => each.cameras);
	const mirrored = new Set<Camera>(rigs.filter((each) => each.mirrored).flatMap((each) => each.cameras));
	// The glow costs a full pass per camera, and the aft views are too small to need it.
	const glowing = new Set<Camera>([chart, windscreen.cameras[0]]);
	// The world half of each aft view. The windscreen is drawn first and later cameras leave its color in
	// place, so without a clear the forward sky shows through the aft window behind the hull.
	const aftWorld = new Set<Camera>(rigs.filter((each) => each.mirrored).map((each) => each.cameras[0]));
	let active = false;

	// Dragging grabs the view: the world follows the pointer, so the head turns the other way.
	let aim: Head = { yaw: 0, pitch: 0 };
	let head: Head = { yaw: 0, pitch: 0 };
	let drag: { id: number; x: number; y: number } | null = null;
	const canvas = engine.getRenderingCanvas();
	const radiansPerPixel = () => WINDSCREEN_FOV / Math.max(1, canvas?.clientHeight ?? 1);
	const onDown = (event: PointerEvent) => {
		if (!active || drag || event.button !== 0) {
			return;
		}
		drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
	};
	const onMove = (event: PointerEvent) => {
		if (!drag || event.pointerId !== drag.id) {
			return;
		}
		const scale = radiansPerPixel();
		aim = clampHead({
			yaw: aim.yaw - (event.clientX - drag.x) * scale,
			pitch: aim.pitch - (event.clientY - drag.y) * scale,
		});
		drag.x = event.clientX;
		drag.y = event.clientY;
	};
	const onUp = (event: PointerEvent) => {
		if (drag && event.pointerId === drag.id) {
			drag = null;
		}
	};
	const onRecenter = () => {
		if (active) {
			aim = { yaw: 0, pitch: 0 };
		}
	};
	// A drag starts on the scene and follows the pointer anywhere, over the chrome and off the page.
	canvas?.addEventListener("pointerdown", onDown);
	canvas?.addEventListener("dblclick", onRecenter);
	window.addEventListener("pointermove", onMove);
	window.addEventListener("pointerup", onUp);
	window.addEventListener("pointercancel", onUp);
	scene.onDisposeObservable.addOnce(() => {
		canvas?.removeEventListener("pointerdown", onDown);
		canvas?.removeEventListener("dblclick", onRecenter);
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", onUp);
	});

	const position = new Vector3();
	const rotation = new Quaternion();
	const look = new Quaternion();
	const projection = new Matrix();
	const flip = Matrix.Scaling(-1, 1, 1);
	const flipped = new Matrix();

	// A mirrored projection turns every triangle's winding around, so those views cull the other face.
	scene.onBeforeCameraRenderObservable.add((current) => {
		glow.isEnabled = glowing.has(current);
		engine.cullBackFaces = mirrored.has(current) ? false : null;
		// scissorClear lives on the WebGL engine. The scene's engine handle is the wider base type.
		if (aftWorld.has(current) && engine instanceof Engine) {
			const view = current.viewport;
			const width = engine.getRenderWidth();
			const height = engine.getRenderHeight();
			engine.scissorClear(view.x * width, view.y * height, view.width * width, view.height * height, scene.clearColor);
		}
	});
	scene.onAfterCameraRenderObservable.add(() => {
		glow.isEnabled = true;
		engine.cullBackFaces = null;
	});

	const update = (snap = false) => {
		if (!active) {
			return;
		}
		const deltaSeconds = engine.getDeltaTime() / 1000;
		const ease = 1 - Math.exp(-deltaSeconds / STEADY_SECONDS);
		const turn = snap ? 1 : 1 - Math.exp(-deltaSeconds / LOOK_SECONDS);
		head = { yaw: head.yaw + (aim.yaw - head.yaw) * turn, pitch: head.pitch + (aim.pitch - head.pitch) * turn };
		Quaternion.RotationYawPitchRollToRef(head.yaw, head.pitch, 0, look);
		for (const each of rigs) {
			(each.mount.parent as TransformNode | null)?.computeWorldMatrix(true);
			each.mount.computeWorldMatrix(true);
			each.mount.getWorldMatrix().decompose(undefined, rotation, position);
			const swing = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(each.steady, rotation))));
			if (snap || swing > STEADY_CUT) {
				each.steady.copyFrom(rotation);
			} else {
				Quaternion.SlerpToRef(each.steady, rotation, ease, each.steady);
			}
			for (const view of each.cameras) {
				view.position.copyFrom(position);
				const facing = (view.rotationQuaternion ??= new Quaternion());
				if (each === windscreen) {
					each.steady.multiplyToRef(look, facing);
				} else {
					facing.copyFrom(view === each.cameras[0] ? each.steady : rotation);
				}
				if (each.mirrored) {
					// Set before the frame, because Babylon reads the projection before a camera's render hooks run.
					Matrix.PerspectiveFovLHToRef(
						view.fov,
						engine.getAspectRatio(view),
						view.minZ,
						view.maxZ,
						projection,
						true,
						engine.isNDCHalfZRange
					);
					flip.multiplyToRef(projection, flipped);
					view.freezeProjectionMatrix(flipped);
				}
			}
		}
	};

	return {
		update: () => update(),
		setActive(on) {
			active = on;
			drag = null;
			if (on) {
				aim = { yaw: 0, pitch: 0 };
				update(true);
				scene.activeCameras = cameras;
				scene.activeCamera = cameras[0];
			} else {
				scene.activeCameras = [];
				scene.activeCamera = chart;
			}
		},
	};
}

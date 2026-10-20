import type { Camera } from "@babylonjs/core/Cameras/camera";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { HULL_LENGTH, SHIP_LAYER, type ShipMounts } from "./ranger";

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
 * Drawn on the chart and not on the windscreen. A screen-width line from under the seat reads as a
 * streak across the glass, so the pilot sees chevrons on `PILOT_LAYER` instead. Orbit lines use this
 * layer too.
 */
export const CHART_LAYER = 0x40000000;
/** Course chevrons in front of the pilot. The windscreen draws them; the chart, the aft views, and the exterior camera do not. */
export const PILOT_LAYER = 0x20000000;

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
/** A second tap this soon, and this close to the first, looks ahead again. Outside, it returns behind the ship. */
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 24;
/** Vertical field of view for the camera outside the hull. Narrower than the windscreen, so the ship reads as a subject. */
const EXTERIOR_FOV = 0.85;
/**
 * Radians of orbit across one screen of drag. A swipe from edge to edge carries the camera halfway
 * around the ship.
 */
export const EXTERIOR_SWING = Math.PI;
/**
 * How far the exterior camera sits from the middle of the hull, in hull lengths.
 * Far enough to take in the stern plume, close enough that the ship fills the frame.
 */
const EXTERIOR_RANGE = 2.4;
export const EXTERIOR_RADIUS = HULL_LENGTH * EXTERIOR_RANGE;
/** Behind the ship, off to starboard and a little above, so the hull reads before the camera is swung. */
export const EXTERIOR_YAW = 0.55;
export const EXTERIOR_PITCH = 0.38;
/** Short of straight up and straight down, so the orbit does not flip over the hull. */
const EXTERIOR_PITCH_LIMIT = 1.15;

type Tap = { t: number; x: number; y: number };

/** Where the exterior camera sits around the hull. Yaw 0 is astern; positive yaw swings to starboard. Pitch is positive above the ship. */
export type ExteriorOrbit = { yaw: number; pitch: number };

/** The view the cockpit opens on, and the one a double tap outside returns to. */
export const EXTERIOR_HOME: ExteriorOrbit = { yaw: EXTERIOR_YAW, pitch: EXTERIOR_PITCH };

export type PilotViewpoint = "interior" | "exterior";

function wrapAngle(angle: number): number {
	const turn = Math.PI * 2;
	return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
}

function clampExteriorPitch(pitch: number): number {
	return Math.max(-EXTERIOR_PITCH_LIMIT, Math.min(EXTERIOR_PITCH_LIMIT, pitch));
}

/**
 * Camera offset in ship axes, in world units. The nose is +Z, so yaw 0 sits on -Z, astern.
 * The length stays `radius` at every angle.
 */
export function exteriorOffset(orbit: ExteriorOrbit, radius = EXTERIOR_RADIUS, result = new Vector3()): Vector3 {
	const pitch = clampExteriorPitch(orbit.pitch);
	const horizontal = Math.cos(pitch);
	return result.set(
		radius * Math.sin(orbit.yaw) * horizontal,
		radius * Math.sin(pitch),
		-radius * Math.cos(orbit.yaw) * horizontal
	);
}

/**
 * Dragging grabs the hull: it follows the pointer, so the camera swings the other way.
 * `dx` and `dy` are pixels, right and down. Pitch stops at the limit; yaw wraps.
 */
export function orbitFromDrag(orbit: ExteriorOrbit, dx: number, dy: number, scale: number): ExteriorOrbit {
	return {
		yaw: wrapAngle(orbit.yaw - dx * scale),
		pitch: clampExteriorPitch(orbit.pitch + dy * scale),
	};
}

/** A second still tap in the same place. The page no longer sees this as a double-tap zoom. */
export function isDoubleTap(previous: Tap | null, tap: Tap): boolean {
	if (!previous) {
		return false;
	}
	return tap.t - previous.t <= DOUBLE_TAP_MS && Math.hypot(tap.x - previous.x, tap.y - previous.y) <= DOUBLE_TAP_SLOP;
}

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
	/** Draws the cockpit instead of `chart`, or hands the screen back to it. */
	setActive: (on: boolean) => void;
	/**
	 * Interior is the windscreen and the aft views. Exterior orbits the hull.
	 * The exterior camera leaves out the course: chevrons and the path line stay on the windscreen.
	 */
	setViewpoint: (viewpoint: PilotViewpoint) => void;
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

	const rig = (
		name: string,
		mount: TransformNode,
		fov: number,
		rect: ScreenRect | null,
		hull: boolean,
		world: number = WORLD_LAYER
	): Rig => ({
		mount,
		cameras: [
			camera(`${name}-world`, world, fov, WORLD_NEAR, WORLD_FAR, rect),
			...(hull ? [camera(`${name}-ship`, SHIP_LAYER, fov, SHIP_NEAR, SHIP_FAR, rect)] : []),
		],
		mirrored: hull,
		steady: new Quaternion(),
	});

	const windscreen = rig(
		"cockpit-windscreen",
		mounts.eye,
		WINDSCREEN_FOV,
		null,
		false,
		WORLD_LAYER | PILOT_LAYER
	);
	// The world and the hull, and neither the course nor the orbit lines. Those are drawn on the glass.
	const exterior = camera("cockpit-exterior", WORLD_LAYER | SHIP_LAYER, EXTERIOR_FOV, WORLD_NEAR, WORLD_FAR, null);
	const rigs = [
		windscreen,
		rig("cockpit-aft-port", mounts.port, AFT_FOV, AFT_VIEWS.port, true),
		rig("cockpit-aft-starboard", mounts.starboard, AFT_FOV, AFT_VIEWS.starboard, true),
	];
	// Each camera after the first clears depth only, so the ship always lands on top of the world it was drawn over.
	const cameras = rigs.flatMap((each) => each.cameras);
	const mirrored = new Set<Camera>(rigs.filter((each) => each.mirrored).flatMap((each) => each.cameras));
	// The glow costs a full pass per camera, and the aft views are too small to need it.
	const glowing = new Set<Camera>([chart, windscreen.cameras[0], exterior]);
	// The world half of each aft view. The windscreen is drawn first and later cameras leave its color in
	// place, so without a clear the forward sky shows through the aft window behind the hull.
	const aftWorld = new Set<Camera>(rigs.filter((each) => each.mirrored).map((each) => each.cameras[0]));
	let active = false;
	let viewpoint: PilotViewpoint = "interior";

	// Dragging grabs the view: the world follows the pointer, so the head turns the other way.
	// A second tap in the same place looks ahead. The browser's double-tap zoom is the same gesture,
	// so this is recognized here instead of from a dblclick.
	let aim: Head = { yaw: 0, pitch: 0 };
	let head: Head = { yaw: 0, pitch: 0 };
	let aimOrbit: ExteriorOrbit = { ...EXTERIOR_HOME };
	let orbit: ExteriorOrbit = { ...EXTERIOR_HOME };
	let drag: { id: number; x: number; y: number; originX: number; originY: number } | null = null;
	let lastTap: Tap | null = null;
	const fingers = new Set<number>();
	const canvas = engine.getRenderingCanvas();
	const radiansPerPixel = () => {
		const height = Math.max(1, canvas?.clientHeight ?? 1);
		return viewpoint === "exterior" ? EXTERIOR_SWING / height : WINDSCREEN_FOV / height;
	};
	const onDown = (event: PointerEvent) => {
		fingers.add(event.pointerId);
		if (!active || event.button !== 0 || fingers.size > 1) {
			drag = null;
			lastTap = null;
			return;
		}
		if (drag) {
			return;
		}
		drag = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			originX: event.clientX,
			originY: event.clientY,
		};
	};
	const onMove = (event: PointerEvent) => {
		if (!drag || event.pointerId !== drag.id) {
			return;
		}
		const scale = radiansPerPixel();
		const dx = event.clientX - drag.x;
		const dy = event.clientY - drag.y;
		if (viewpoint === "exterior") {
			aimOrbit = orbitFromDrag(aimOrbit, dx, dy, scale);
		} else {
			aim = clampHead({ yaw: aim.yaw - dx * scale, pitch: aim.pitch - dy * scale });
		}
		drag.x = event.clientX;
		drag.y = event.clientY;
	};
	const onUp = (event: PointerEvent) => {
		fingers.delete(event.pointerId);
		if (!drag || event.pointerId !== drag.id) {
			return;
		}
		const originX = drag.originX;
		const originY = drag.originY;
		drag = null;
		if (!active || fingers.size > 0) {
			lastTap = null;
			return;
		}
		const moved = Math.hypot(event.clientX - originX, event.clientY - originY);
		if (moved > DOUBLE_TAP_SLOP) {
			lastTap = null;
			return;
		}
		const tap = { t: performance.now(), x: event.clientX, y: event.clientY };
		if (isDoubleTap(lastTap, tap)) {
			if (viewpoint === "exterior") {
				aimOrbit = { ...EXTERIOR_HOME };
			} else {
				aim = { yaw: 0, pitch: 0 };
			}
			lastTap = null;
		} else {
			lastTap = tap;
		}
	};
	const onCancel = (event: PointerEvent) => {
		fingers.delete(event.pointerId);
		if (drag && event.pointerId === drag.id) {
			drag = null;
			lastTap = null;
		}
	};
	// A drag starts on the scene and follows the pointer anywhere, over the chrome and off the page.
	canvas?.addEventListener("pointerdown", onDown);
	window.addEventListener("pointermove", onMove);
	window.addEventListener("pointerup", onUp);
	window.addEventListener("pointercancel", onCancel);
	scene.onDisposeObservable.addOnce(() => {
		canvas?.removeEventListener("pointerdown", onDown);
		window.removeEventListener("pointermove", onMove);
		window.removeEventListener("pointerup", onUp);
		window.removeEventListener("pointercancel", onCancel);
	});

	const position = new Vector3();
	const rotation = new Quaternion();
	const look = new Quaternion();
	const projection = new Matrix();
	const flip = Matrix.Scaling(-1, 1, 1);
	const flipped = new Matrix();
	const lookAt = new Vector3();
	const offset = new Vector3();
	const shifted = new Vector3();

	// The offset is in world units along the ship's axes. The hull's own scale must not shrink it.
	// setTarget aims the camera: a hand-built look rotation needs an up vector perpendicular to the
	// view, and the orbit's pitch is rarely that.
	const placeExterior = () => {
		const ship = mounts.eye.parent as TransformNode | null;
		if (!ship) {
			return;
		}
		ship.computeWorldMatrix(true);
		const world = ship.getWorldMatrix();
		Vector3.TransformCoordinatesToRef(mounts.hullCenter, world, lookAt);
		world.decompose(undefined, rotation, undefined);
		exteriorOffset(orbit, EXTERIOR_RADIUS, offset).applyRotationQuaternionToRef(rotation, shifted);
		exterior.position.copyFrom(lookAt).addInPlace(shifted);
		exterior.upVector.set(0, 1, 0);
		exterior.setTarget(lookAt);
	};

	const show = () => {
		if (!active) {
			scene.activeCameras = [];
			scene.activeCamera = chart;
			return;
		}
		if (viewpoint === "exterior") {
			scene.activeCameras = [exterior];
			scene.activeCamera = exterior;
			return;
		}
		scene.activeCameras = cameras;
		scene.activeCamera = cameras[0];
	};

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
		if (viewpoint === "exterior") {
			const yawStep = wrapAngle(aimOrbit.yaw - orbit.yaw);
			orbit = {
				yaw: wrapAngle(orbit.yaw + yawStep * turn),
				pitch: orbit.pitch + (aimOrbit.pitch - orbit.pitch) * turn,
			};
			placeExterior();
			return;
		}
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
				aimOrbit = { ...EXTERIOR_HOME };
				orbit = { ...EXTERIOR_HOME };
				update(true);
			}
			show();
		},
		setViewpoint(next) {
			if (viewpoint === next) {
				return;
			}
			viewpoint = next;
			drag = null;
			lastTap = null;
			if (active) {
				update(true);
				show();
			}
		},
	};
}

import type { Camera } from "@babylonjs/core/Cameras/camera";
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { Engine } from "@babylonjs/core/Engines/engine";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { COCKPIT_LAYER, HULL_LENGTH, SHIP_LAYER, type ShipMounts } from "./ranger";

/** A rectangle on screen as shares of the canvas, from its top left. */
export type ScreenRect = { left: number; top: number; width: number; height: number };

/**
 * The side-display rectangles from the flat console, as shares of a 1440×1024 screen.
 * The aft pictures are on the side screens, so these no longer place a viewport.
 */
export const AFT_VIEWS: Record<"port" | "starboard", ScreenRect> = {
	port: { left: 68 / 1440, top: 704 / 1024, width: 300 / 1440, height: 176 / 1024 },
	starboard: { left: 1068 / 1440, top: 704 / 1024, width: 300 / 1440, height: 176 / 1024 },
};

/** Everything but the ship. Babylon's default mask, without the ship's bit. */
const WORLD_LAYER = 0x0fffffff;
/**
 * Drawn on the chart and not on the windscreen. A screen-width line from under the seat reads as a
 * streak across the glass, so the pilot sees chevrons on `PILOT_LAYER` instead. Orbit lines use this
 * layer too.
 */
export const CHART_LAYER = 0x40000000;
/** Course chevrons in front of the pilot. The windscreen and the exterior camera draw them. The chart and the aft views do not. */
export const PILOT_LAYER = 0x20000000;

/** Vertical field of view out the windscreen, wider than the chart's so the dash reads under the view. */
const WINDSCREEN_FOV = 1.15;
/** Wide enough that a side plume fits in its aft view from base to tip. */
const AFT_FOV = 1;
/** Pixels across the picture drawn on a side screen. Height follows the glass. */
const FEED_WIDTH = 512;
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
	/**
	 * Width over height of the glass this view is drawn on.
	 * The canvas aspect would stretch the picture across a panel that is not the shape of the window.
	 */
	aspect: number | null;
};

/** The pilot's head, turned by dragging across the windscreen. */
type Head = { yaw: number; pitch: number };

function clampHead(head: Head): Head {
	return {
		yaw: Math.max(-LOOK_YAW, Math.min(LOOK_YAW, head.yaw)),
		pitch: Math.max(-LOOK_UP, Math.min(LOOK_DOWN, head.pitch)),
	};
}

/**
 * Width over height of a screen quad. The glass stands in the ship's space, so up is local Y.
 * The two lower corners are the bottom edge.
 */
function screenAspect(mesh: AbstractMesh): number | null {
	const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
	if (!positions || positions.length < 12) {
		return null;
	}
	const corners: Array<[number, number, number]> = [];
	for (let i = 0; i < positions.length; i += 3) {
		const point: [number, number, number] = [positions[i], positions[i + 1], positions[i + 2]];
		const known = corners.some(
			(corner) => Math.abs(corner[0] - point[0]) < 1e-5 && Math.abs(corner[1] - point[1]) < 1e-5 && Math.abs(corner[2] - point[2]) < 1e-5
		);
		if (!known) {
			corners.push(point);
		}
	}
	if (corners.length < 4) {
		return null;
	}
	corners.sort((a, b) => a[1] - b[1]);
	const bottom = corners.slice(0, 2);
	const top = corners.slice(-2);
	const span = (a: [number, number, number], b: [number, number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
	const width = span(bottom[0], bottom[1]);
	const low: [number, number, number] = [(bottom[0][0] + bottom[1][0]) / 2, (bottom[0][1] + bottom[1][1]) / 2, (bottom[0][2] + bottom[1][2]) / 2];
	const high: [number, number, number] = [(top[0][0] + top[1][0]) / 2, (top[0][1] + top[1][1]) / 2, (top[0][2] + top[1][2]) / 2];
	const height = span(low, high);
	if (width < 1e-5 || height < 1e-5) {
		return null;
	}
	return width / height;
}

/**
 * Draws this rig into the named screen. Both of its cameras write the same target: the world first,
 * then the hull over it. Without a screen the cameras stay off the frame, so they cannot cover the windscreen.
 */
function feed(scene: Scene, each: Rig, meshName: string): void {
	const mesh = scene.getMeshByName(meshName);
	const aspect = mesh ? screenAspect(mesh) : null;
	if (!mesh || aspect === null) {
		return;
	}
	each.aspect = aspect;
	const target = new RenderTargetTexture(
		`${meshName} feed`,
		{ width: FEED_WIDTH, height: Math.max(1, Math.round(FEED_WIDTH / aspect)) },
		scene,
		{ generateMipMaps: false, doNotChangeAspectRatio: true }
	);
	target.ignoreCameraViewport = true;
	target.wrapU = Texture.CLAMP_ADDRESSMODE;
	target.wrapV = Texture.CLAMP_ADDRESSMODE;
	target.clearColor = scene.clearColor.clone();
	for (const view of each.cameras) {
		view.outputRenderTarget = target;
	}
	const glass = new StandardMaterial(`${meshName} glass`, scene);
	glass.disableLighting = true;
	glass.diffuseColor = Color3.Black();
	glass.specularColor = Color3.Black();
	glass.ambientColor = Color3.Black();
	// The texture is the picture. A white emissive color would be added to it and the glass would clip to white.
	glass.emissiveColor = Color3.Black();
	glass.emissiveTexture = target;
	glass.useEmissiveAsIllumination = true;
	// The blockout glass is double sided. Culling the back would hide the picture if the normal faces away.
	glass.backFaceCulling = false;
	// The quad sits on the curved coaming. The same bias the blockout used, so the picture still wins a shared pixel.
	glass.zOffset = 2;
	mesh.material = glass;
}

const LABEL_AMBER = "#FCD34D";
const LABEL_FACE = "ui-sans-serif, system-ui, sans-serif";

/**
 * A name on an aft picture. The canvas top is the top of the glass. Canvas right is the inner top of
 * the port picture, and canvas left is the inner top of the starboard picture.
 */
export function paintFeedLabel(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	label: string,
	align: "left" | "right"
): void {
	context.clearRect(0, 0, width, height);
	const size = Math.max(14, Math.round(height * 0.055));
	const padX = Math.round(width * 0.04);
	const padY = Math.round(height * 0.08);
	context.font = `600 ${size}px ${LABEL_FACE}`;
	context.letterSpacing = `${Math.max(1, Math.round(size * 0.04))}px`;
	context.textBaseline = "top";
	context.textAlign = align;
	const x = align === "right" ? width - padX : padX;
	const textWidth = context.measureText(label).width;
	const chip = Math.round(size * 0.28);
	context.fillStyle = "rgba(5,8,14,0.72)";
	context.fillRect(align === "right" ? x - textWidth - chip : x - chip, padY - chip, textWidth + chip * 2, size + chip * 2);
	context.lineJoin = "round";
	context.lineWidth = Math.max(3, Math.round(size * 0.16));
	context.strokeStyle = "rgba(0,0,0,0.85)";
	context.strokeText(label, x, padY);
	context.fillStyle = LABEL_AMBER;
	context.fillText(label, x, padY);
}

/**
 * Lays the camera's name on the video. The left screen carries it at the upper right, the right
 * screen at the upper left, so both names sit toward the center glass. The plate is the screen
 * again, clear except for the words, and biased in front of the picture.
 */
function labelFeed(scene: Scene, glow: GlowLayer, meshName: string, label: string, align: "left" | "right"): void {
	const mesh = scene.getMeshByName(meshName);
	const aspect = mesh ? screenAspect(mesh) : null;
	if (!mesh || aspect === null || !(mesh instanceof Mesh)) {
		return;
	}
	const width = FEED_WIDTH;
	const height = Math.max(1, Math.round(width / aspect));
	const texture = new DynamicTexture(`${meshName} label`, { width, height }, scene, false);
	texture.hasAlpha = true;
	texture.getAlphaFromRGB = false;
	texture.wrapU = Texture.CLAMP_ADDRESSMODE;
	texture.wrapV = Texture.CLAMP_ADDRESSMODE;
	paintFeedLabel(texture.getContext() as CanvasRenderingContext2D, width, height, label, align);
	texture.update(false);

	// The same glass again, so the words share the video's corners. A copy in the picture's group
	// ties the depth test and the video paints over it. The next group clears depth and draws after,
	// and the clear parts of the texture leave the picture in the framebuffer.
	const plate = mesh.clone(`${meshName} label`, mesh.parent);
	if (!plate) {
		return;
	}
	plate.isPickable = false;
	plate.layerMask = mesh.layerMask;
	plate.renderingGroupId = 1;
	const ink = new StandardMaterial(`${meshName} label glass`, scene);
	ink.disableLighting = true;
	ink.diffuseColor = Color3.Black();
	ink.specularColor = Color3.Black();
	ink.ambientColor = Color3.Black();
	ink.emissiveColor = Color3.Black();
	ink.emissiveTexture = texture;
	ink.useEmissiveAsIllumination = true;
	ink.opacityTexture = texture;
	ink.transparencyMode = Material.MATERIAL_ALPHABLEND;
	ink.backFaceCulling = false;
	plate.material = ink;
	glow.addExcludedMesh(plate);
}

/** Draws one frame of the center screen. The canvas origin is the top left of the glass. */
export type CenterPaint = (context: CanvasRenderingContext2D, width: number, height: number) => void;

/**
 * Puts a picture on the center screen and returns the way to redraw it.
 * The shared screen material stays as it is; only this mesh gets the new glass.
 * A missing screen leaves the painter as a no-op.
 */
function centerGlass(scene: Scene): { paint: (paint: CenterPaint) => void; width: number; height: number } {
	const mesh = scene.getMeshByName("Cockpit MFD Center");
	const aspect = mesh ? screenAspect(mesh) : null;
	if (!mesh || aspect === null) {
		return { paint: () => {}, width: 0, height: 0 };
	}
	const width = 1024;
	const height = Math.max(1, Math.round(width / aspect));
	const texture = new DynamicTexture("Cockpit MFD Center picture", { width, height }, scene, false);
	texture.wrapU = Texture.CLAMP_ADDRESSMODE;
	texture.wrapV = Texture.CLAMP_ADDRESSMODE;
	const context = texture.getContext() as CanvasRenderingContext2D;
	context.fillStyle = "#050a12";
	context.fillRect(0, 0, width, height);
	// The screen's v runs top to bottom already, so the canvas is uploaded without a second flip.
	texture.update(false);
	const glass = new StandardMaterial("Cockpit MFD Center glass", scene);
	glass.disableLighting = true;
	glass.diffuseColor = Color3.Black();
	glass.specularColor = Color3.Black();
	glass.ambientColor = Color3.Black();
	glass.emissiveColor = Color3.Black();
	glass.emissiveTexture = texture;
	glass.useEmissiveAsIllumination = true;
	glass.backFaceCulling = false;
	glass.zOffset = 2;
	mesh.material = glass;
	mesh.isPickable = true;
	return {
		width,
		height,
		paint: (paint) => {
			paint(context, width, height);
			texture.update(false);
		},
	};
}

export type Cockpit = {
	/** Moves every cockpit camera onto its mount. Call once per frame, after the ship has been placed. */
	update: () => void;
	/** Draws the cockpit instead of `chart`, or hands the screen back to it. */
	setActive: (on: boolean) => void;
	/**
	 * Interior is the windscreen and the aft views. Exterior orbits the hull and draws the course chevrons.
	 * Aft views leave the course out.
	 */
	setViewpoint: (viewpoint: PilotViewpoint) => void;
	/**
	 * Kept so the console can still report where its glass sat.
	 * The aft pictures are on the side screens now, so the rectangles are not used.
	 */
	setAftRects: (rects: { port: ScreenRect; starboard: ScreenRect }) => void;
	/** Redraws the center screen. Does nothing when that glass is missing. */
	paintCenter: (paint: CenterPaint) => void;
	/** A tap on the center glass, in that picture's pixels from its top left. Interior view only. */
	onCenterTap: (listener: (point: { x: number; y: number; width: number; height: number }) => void) => () => void;
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
		aspect: null,
	});

	const windscreen = rig(
		"cockpit-windscreen",
		mounts.eye,
		WINDSCREEN_FOV,
		null,
		false,
		WORLD_LAYER | PILOT_LAYER
	);
	// The dash sits centimeters from the eye, inside the near plane that clips the world.
	// This camera is second, so it clears depth only and the panel lands on the world already drawn.
	windscreen.cameras.push(camera("cockpit-dash", COCKPIT_LAYER, WINDSCREEN_FOV, SHIP_NEAR, SHIP_FAR, null));
	// The world, the hull, and the course chevrons. Orbit lines stay on the chart.
	const exterior = camera("cockpit-exterior", WORLD_LAYER | SHIP_LAYER | PILOT_LAYER, EXTERIOR_FOV, WORLD_NEAR, WORLD_FAR, null);
	const aftPort = rig("cockpit-aft-port", mounts.port, AFT_FOV, null, true);
	const aftStarboard = rig("cockpit-aft-starboard", mounts.starboard, AFT_FOV, null, true);
	// The world pass and the hull pass share one picture. The second camera clears depth only, so the
	// plume lands on the sky already drawn. The dash camera is later in the frame and samples this.
	feed(scene, aftPort, "Cockpit MFD Port");
	feed(scene, aftStarboard, "Cockpit MFD Starboard");
	labelFeed(scene, glow, "Cockpit MFD Port", "AFT · PORT", "right");
	labelFeed(scene, glow, "Cockpit MFD Starboard", "AFT · STBD", "left");
	const centerTaps = new Set<(point: { x: number; y: number; width: number; height: number }) => void>();
	const center = centerGlass(scene);
	const paintCenter = center.paint;
	const rigs = [windscreen, aftPort, aftStarboard];
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
	// Straight ahead looks over the brow. The seat starts tipped down so the panel is in frame.
	const rest: Head = { yaw: 0, pitch: 0.3 };
	let aim: Head = { ...rest };
	let head: Head = { ...rest };
	let aimOrbit: ExteriorOrbit = { ...EXTERIOR_HOME };
	let orbit: ExteriorOrbit = { ...EXTERIOR_HOME };
	let drag: { id: number; x: number; y: number; originX: number; originY: number } | null = null;
	let glassPress: { id: number; x: number; y: number } | null = null;
	let lastTap: Tap | null = null;
	const fingers = new Set<number>();
	const canvas = engine.getRenderingCanvas();
	/** A point on the center glass, in its picture's pixels. Null when the tap misses the glass. */
	const glassPoint = (clientX: number, clientY: number): { x: number; y: number; width: number; height: number } | null => {
		const box = canvas?.getBoundingClientRect();
		if (!active || viewpoint !== "interior" || center.width < 1 || !box || box.width < 1 || box.height < 1) {
			return null;
		}
		const x = ((clientX - box.left) * engine.getRenderWidth()) / box.width;
		const y = ((clientY - box.top) * engine.getRenderHeight()) / box.height;
		const dash = windscreen.cameras[windscreen.cameras.length - 1];
		const hit = scene.pick(x, y, (mesh) => mesh.name === "Cockpit MFD Center", false, dash);
		const uv = hit?.hit ? hit.getTextureCoordinates() : null;
		// The glass's v already runs from the top of the picture downward.
		return uv ? { x: uv.x * center.width, y: uv.y * center.height, width: center.width, height: center.height } : null;
	};
	const radiansPerPixel = () => {
		const height = Math.max(1, canvas?.clientHeight ?? 1);
		return viewpoint === "exterior" ? EXTERIOR_SWING / height : WINDSCREEN_FOV / height;
	};
	const onDown = (event: PointerEvent) => {
		fingers.add(event.pointerId);
		if (!active || event.button !== 0 || fingers.size > 1) {
			drag = null;
			glassPress = null;
			lastTap = null;
			return;
		}
		if (drag || glassPress) {
			return;
		}
		if (glassPoint(event.clientX, event.clientY)) {
			glassPress = { id: event.pointerId, x: event.clientX, y: event.clientY };
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
		if (glassPress?.id === event.pointerId || !drag || event.pointerId !== drag.id) {
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
		if (glassPress?.id === event.pointerId) {
			const start = glassPress;
			glassPress = null;
			lastTap = null;
			if (!active || fingers.size > 0) {
				return;
			}
			if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > DOUBLE_TAP_SLOP) {
				return;
			}
			const point = glassPoint(event.clientX, event.clientY);
			if (point) {
				for (const listener of centerTaps) {
					listener(point);
				}
			}
			return;
		}
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
		if (glassPress?.id === event.pointerId) {
			glassPress = null;
			lastTap = null;
		}
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
		// The aft cameras fill their textures before the dash camera samples them. They draw to those
		// targets, not the canvas, and the windscreen underneath is already on the default framebuffer.
		const feeds = [aftPort, aftStarboard].filter((each) => each.cameras[0].outputRenderTarget);
		scene.activeCameras = [windscreen.cameras[0], ...feeds.flatMap((each) => each.cameras), ...windscreen.cameras.slice(1)];
		scene.activeCamera = windscreen.cameras[0];
	};

	// A mirrored projection turns every triangle's winding around, so those views cull the other face.
	scene.onBeforeCameraRenderObservable.add((current) => {
		glow.isEnabled = glowing.has(current);
		engine.cullBackFaces = mirrored.has(current) ? false : null;
		// scissorClear lives on the WebGL engine. The scene's engine handle is the wider base type.
		// A render target clears itself. Scissoring that camera would erase a rectangle of the picture.
		if (aftWorld.has(current) && !current.outputRenderTarget && engine instanceof Engine) {
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
						each.aspect ?? engine.getAspectRatio(view),
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
			glassPress = null;
			if (on) {
				aim = { ...rest };
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
			glassPress = null;
			lastTap = null;
			if (active) {
				update(true);
				show();
			}
		},
		setAftRects() {
			// The side screens carry the aft pictures. A rectangle on the page no longer places them.
		},
		paintCenter,
		onCenterTap(listener) {
			centerTaps.add(listener);
			return () => {
				centerTaps.delete(listener);
			};
		},
	};
}

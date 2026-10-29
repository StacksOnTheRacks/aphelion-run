import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Scene } from "@babylonjs/core/scene";

import { awayFrom, type LabelAnchor, type LabelFrame, type LabelSource } from "./labels";
import { trackPicks } from "./pointer";
import { attachChartCamera, nudgeChartZoom, tuneChartCamera, type ZoomDirection } from "./zoom";

/**
 * The Milky Way seen from above its north pole, with Sol and the systems around it.
 * Scene units are hundreds of light years. The galaxy's center is the origin and its disk is the XZ plane.
 * From above, +Z is up the screen and +X is right, so Sol sits below the center the way the usual map draws it.
 */

/** Sol is about 26,500 light years from the center. */
export const SOL_DISTANCE = 265;
export const SOL_POSITION = new Vector3(0, 0, -SOL_DISTANCE);
/** Every star system out to this many light years is shown. */
export const NEIGHBOR_RANGE = 12;
/**
 * At galaxy scale the neighbors would sit inside Sol's dot, so their distances are stretched: the edge
 * of the range is drawn this far from Sol. Directions, and distances relative to each other, stay true.
 */
export const NEIGHBOR_REACH = 60;

/** Spectral class of a system's brightest star, which sets the color of its marker. */
export type StarClass = "A" | "F" | "G" | "K" | "M";

export type NeighborSystem = {
	id: string;
	label: string;
	/** Light years from Sol. */
	distance: number;
	/** Galactic longitude in degrees: 0 points at the center, and it grows counterclockwise seen from above. */
	longitude: number;
	/** Galactic latitude in degrees: positive is north of the disk, toward the camera. */
	latitude: number;
	star: StarClass;
};

/**
 * Star systems within 12 light years, nearest first. Positions are converted from J2000 right ascension
 * and declination. Luhman 16 (6.5 ly), a pair of brown dwarfs, and WISE 0855−0714 (7.4 ly), smaller still,
 * are left out: neither is massive enough to burn hydrogen, so neither has a sun. Epsilon Indi stays, since
 * its brown dwarfs orbit a real star. Barnard's Star, Lalande 21185, Luyten 726-8, Lacaille 9352,
 * Struve 2398, and GJ 1061 are real stars in range that the game leaves off the map.
 */
export const NEIGHBORS: NeighborSystem[] = [
	{ id: "alpha-centauri", label: "Alpha Centauri", distance: 4.37, longitude: 315.7, latitude: -0.7, star: "G" },
	{ id: "wolf-359", label: "Wolf 359", distance: 7.86, longitude: 244.1, latitude: 56.1, star: "M" },
	{ id: "sirius", label: "Sirius", distance: 8.6, longitude: 227.2, latitude: -8.9, star: "A" },
	{ id: "ross-154", label: "Ross 154", distance: 9.7, longitude: 11.3, latitude: -10.3, star: "M" },
	{ id: "ross-248", label: "Ross 248", distance: 10.3, longitude: 110.0, latitude: -17.0, star: "M" },
	{ id: "epsilon-eridani", label: "Epsilon Eridani", distance: 10.47, longitude: 195.8, latitude: -48.0, star: "K" },
	{ id: "ross-128", label: "Ross 128", distance: 11.01, longitude: 270.1, latitude: 59.6, star: "M" },
	{ id: "ez-aquarii", label: "EZ Aquarii", distance: 11.11, longitude: 47.1, latitude: -57.0, star: "M" },
	{ id: "61-cygni", label: "61 Cygni", distance: 11.4, longitude: 82.3, latitude: -5.8, star: "K" },
	{ id: "procyon", label: "Procyon", distance: 11.46, longitude: 213.7, latitude: 13.0, star: "F" },
	{ id: "groombridge-34", label: "Groombridge 34", distance: 11.62, longitude: 116.7, latitude: -18.5, star: "M" },
	{ id: "dx-cancri", label: "DX Cancri", distance: 11.68, longitude: 197.0, latitude: 32.4, star: "M" },
	{ id: "epsilon-indi", label: "Epsilon Indi", distance: 11.87, longitude: 336.2, latitude: -48.0, star: "K" },
	{ id: "tau-ceti", label: "Tau Ceti", distance: 11.91, longitude: 173.1, latitude: -73.4, star: "G" },
];

/** Where a neighbor sits around Sol, at its true direction and its stretched distance. */
export function neighborPosition(system: NeighborSystem): Vector3 {
	const longitude = (system.longitude * Math.PI) / 180;
	const latitude = (system.latitude * Math.PI) / 180;
	const reach = (system.distance / NEIGHBOR_RANGE) * NEIGHBOR_REACH;
	const flat = Math.cos(latitude) * reach;
	return new Vector3(
		SOL_POSITION.x - Math.sin(longitude) * flat,
		Math.sin(latitude) * reach,
		SOL_POSITION.z + Math.cos(longitude) * flat
	);
}

const STAR_COLORS: Record<StarClass, Color3> = {
	A: new Color3(0.78, 0.85, 1),
	F: new Color3(0.96, 0.95, 0.9),
	G: new Color3(1, 0.9, 0.68),
	K: new Color3(1, 0.74, 0.5),
	M: new Color3(1, 0.56, 0.42),
};

/** Spiral arms are log spirals pitched about 12°. Along an arm, `phase` holds still as the radius grows. */
const ARM_PITCH = Math.tan((12 * Math.PI) / 180);
/** The Orion Spur, the short branch Sol sits in, is pitched more steeply. */
const SPUR_PITCH = Math.tan((25 * Math.PI) / 180);

/** Phase on a log spiral that winds outward clockwise seen from above, the way the Milky Way's arms trail. */
export function spiralPhase(x: number, z: number, pitch = ARM_PITCH): number {
	return Math.atan2(z, x) + Math.log(Math.max(1, Math.hypot(x, z))) / pitch;
}

/**
 * Four arms, a quarter turn of phase apart. Sol sits midway between the Sagittarius arm inside it and
 * the Perseus arm outside it, which puts those arms about 21,000 and 31,000 light years out.
 */
export const PERSEUS_PHASE = spiralPhase(SOL_POSITION.x, SOL_POSITION.z) + Math.PI / 4;
const SPUR_PHASE = spiralPhase(SOL_POSITION.x, SOL_POSITION.z, SPUR_PITCH);
const ARM_START = 140;
const ARM_END = 540;

/** The bar runs about 27° off the line from Sol to the center, its near end toward positive longitude. */
const BAR_ANGLE = (27 * Math.PI) / 180;
const BAR_AXIS = { x: Math.sin(BAR_ANGLE), z: Math.cos(BAR_ANGLE) };
const BAR_LENGTH = 70;
const BAR_WIDTH = 24;

const GALAXY_GLOW = 0.95;
const SKY_RADIUS = 9000;

const BONE = new Color3(0.91, 0.89, 0.85);
const AMBER = new Color3(0.99, 0.83, 0.3);

/** Opening shot: the whole galaxy, as the map shows it. Then the camera settles on Sol and its neighbors. */
const OPEN_TARGET = new Vector3(0, 0, -70);
const OPEN_RADIUS = 1300;
const OPEN_BETA = 0.04;
const SETTLE_BETA = 0.62;
const HOLD_SECONDS = 0.8;
const GLIDE_SECONDS = 3.4;
/** Pressing or scrolling during the glide hurries it to an end in this long. */
const HURRY_SECONDS = 0.6;
/**
 * How much of the screen's shorter side the range spans once the camera settles. Above 1, the far side of
 * the range leaves the frame; turning or zooming brings it back. A phone gives it more, since the names
 * need the room more than they need a margin around the range.
 */
const RING_FILL = 1.7;
const RING_FILL_NARROW = 1.9;
/** Below this many CSS pixels across, the screen's shorter side counts as narrow. */
const NARROW_PIXELS = 520;
const RING_MIN_PIXELS = 70;
/** Sol sits this share of the screen's height below the middle, leaving room for the title above the range. */
const SOL_DROP = 0.06;

/** Below this many pixels of range on screen, the neighbors' names would crowd, so they fade out. */
const LABEL_FADE_START = 50;
const LABEL_FADE_SPAN = 20;
/** Markers are drawn this wide on screen, in CSS pixels, so their rings sit just outside. */
const SOL_PIXELS = 11;
const NEIGHBOR_PIXELS = 6;
/** Sol catches the pointer this far from its center. */
const SOL_HIT_PIXELS = 22;
/** A neighbor catches the pointer this far from its center. */
const NEIGHBOR_HIT_PIXELS = 16;

export const SOL_ID = "sol";

export type SystemCard = {
	id: string;
	label: string;
	text: string;
	/** Portrait URL. The modal keeps the frame when this is absent. */
	image?: string;
	charted: boolean;
	/** Spectral class of the stand-in portrait. Sol has none. */
	star?: StarClass;
};

const STAR_KIND: Record<StarClass, string> = {
	A: "A white star",
	F: "A yellow-white star",
	G: "A yellow star",
	K: "An orange star",
	M: "A red star",
};

function lightYears(distance: number): string {
	return `${Number(distance.toFixed(2))} light years`;
}

/** The card for a system on the map, or null when the id is not one. */
export function systemCard(id: string): SystemCard | null {
	if (id === SOL_ID) {
		return {
			id: SOL_ID,
			label: "Sol",
			text: "Pilots base on its planets and moons, take energy from Sol, and sell the haul at Earth.",
			charted: true,
		};
	}
	const neighbor = NEIGHBORS.find((system) => system.id === id);
	if (!neighbor) {
		return null;
	}
	return {
		id: neighbor.id,
		label: neighbor.label,
		text: `${STAR_KIND[neighbor.star]}, ${lightYears(neighbor.distance)} from Sol. The star is on the map. The worlds around it are not.`,
		charted: false,
		star: neighbor.star,
	};
}

/** The modal's action. Only a charted system can be entered. */
export function systemCardAction(card: SystemCard): { label: string; enabled: boolean } {
	return card.charted ? { label: "Enter System", enabled: true } : { label: "Uncharted Space", enabled: false };
}

export type GalaxyDemo = LabelSource & {
	/** Calls back when a system is clicked or tapped. Returns a stop function. */
	onSelect: (listener: (id: string) => void) => () => void;
	/** One notch of the chart wheel. During the opening glide this only hurries the arrival. */
	zoom: (direction: ZoomDirection) => void;
};

/** `opening` plays the glide from the whole galaxy down to Sol. Without it the camera starts settled on Sol. */
export function createGalaxy(
	engine: Engine,
	scene: Scene,
	canvas: HTMLCanvasElement,
	{ opening }: { opening: boolean }
): GalaxyDemo {
	scene.clearColor = new Color4(0.005, 0.006, 0.015, 1);

	const still =
		!opening ||
		(typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
	const camera = new ArcRotateCamera("galaxy-camera", -Math.PI / 2, OPEN_BETA, OPEN_RADIUS, OPEN_TARGET.clone(), scene);
	camera.lowerRadiusLimit = 40;
	camera.upperRadiusLimit = 1600;
	camera.lowerBetaLimit = 0.01;
	camera.upperBetaLimit = 1.2;
	tuneChartCamera(camera);
	camera.minZ = 1;
	camera.maxZ = SKY_RADIUS * 2.5;
	scene.activeCamera = camera;

	buildSky(scene);
	buildDisk(scene);
	buildGalaxyStars(scene);
	const ring = buildRing(scene);
	buildMarkers(scene);

	const settledRadius = () => {
		const halfVertical = camera.fov / 2;
		const halfHorizontal = Math.atan(Math.tan(halfVertical) * engine.getAspectRatio(camera));
		const halfShort = Math.min(halfVertical, halfHorizontal);
		const shortPixels = Math.max(1, Math.min(canvas.clientWidth, canvas.clientHeight) / 2);
		const fill = shortPixels * 2 < NARROW_PIXELS ? RING_FILL_NARROW : RING_FILL;
		const ringPixels = Math.max(RING_MIN_PIXELS, shortPixels * fill);
		return (NEIGHBOR_REACH * shortPixels) / (ringPixels * Math.tan(halfShort));
	};

	let elapsed = 0;
	let glide = still ? 1 : 0;
	let hurryRate = 0;
	const settle = () => {
		camera.target.copyFrom(SOL_POSITION);
		camera.alpha = -Math.PI / 2;
		camera.beta = SETTLE_BETA;
		camera.radius = settledRadius();
		attachChartCamera(camera, canvas);
	};
	if (still) {
		settle();
	}

	const hurry = () => {
		if (glide < 1 && hurryRate === 0) {
			hurryRate = (1 - glide) / HURRY_SECONDS;
		}
	};
	canvas.addEventListener("pointerdown", hurry);
	canvas.addEventListener("wheel", hurry, { passive: true });
	scene.onDisposeObservable.add(() => {
		canvas.removeEventListener("pointerdown", hurry);
		canvas.removeEventListener("wheel", hurry);
	});

	const dropSol = (amount: number) => {
		camera.targetScreenOffset.y = -2 * SOL_DROP * amount * camera.radius * Math.tan(camera.fov / 2);
	};

	scene.onBeforeRenderObservable.add(() => {
		if (glide >= 1) {
			dropSol(1);
			return;
		}
		const deltaSeconds = engine.getDeltaTime() / 1000;
		elapsed += deltaSeconds;
		if (hurryRate > 0) {
			glide = Math.min(1, glide + hurryRate * deltaSeconds);
		} else if (elapsed > HOLD_SECONDS) {
			glide = Math.min(1, glide + deltaSeconds / GLIDE_SECONDS);
		}
		if (glide >= 1) {
			settle();
			return;
		}
		const eased = glide * glide * (3 - 2 * glide);
		Vector3.LerpToRef(OPEN_TARGET, SOL_POSITION, eased, camera.target);
		camera.radius = Math.exp(Math.log(OPEN_RADIUS) + (Math.log(settledRadius()) - Math.log(OPEN_RADIUS)) * eased);
		camera.beta = OPEN_BETA + (SETTLE_BETA - OPEN_BETA) * eased;
		dropSol(eased);
	});

	const neighborWorld = NEIGHBORS.map(neighborPosition);
	const projected = new Vector3();
	const sol = { x: 0, y: 0 };
	const project = (world: Vector3) => {
		const viewport = camera.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight);
		Vector3.ProjectToRef(world, Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport, projected);
		return projected.z >= 0 && projected.z <= 1;
	};

	const selectListeners = new Set<(id: string) => void>();
	const pickSystem = (x: number, y: number): string | null => {
		if (glide < 1) {
			return null;
		}
		let best: string | null = null;
		let bestDistance = Infinity;
		const consider = (id: string, world: Vector3, reach: number) => {
			if (!project(world)) {
				return;
			}
			const distance = Math.hypot(projected.x - x, projected.y - y);
			if (distance <= reach && distance < bestDistance) {
				best = id;
				bestDistance = distance;
			}
		};
		consider(SOL_ID, SOL_POSITION, SOL_HIT_PIXELS);
		neighborWorld.forEach((world, index) => consider(NEIGHBORS[index].id, world, NEIGHBOR_HIT_PIXELS));
		return best;
	};
	const picker = trackPicks(canvas, scene, pickSystem, (id) => {
		for (const listener of selectListeners) {
			listener(id);
		}
	});

	const labelListeners = new Set<(frame: LabelFrame) => void>();
	scene.onAfterRenderObservable.add(() => {
		const hovered = picker.update();
		project(SOL_POSITION);
		sol.x = projected.x;
		sol.y = projected.y;
		const solDepth = Vector3.Distance(camera.globalPosition, SOL_POSITION);
		const rangePixels = (NEIGHBOR_REACH / (solDepth * Math.tan(camera.fov / 2))) * (canvas.clientHeight / 2);
		const opacity = Math.min(1, Math.max(0, (rangePixels - LABEL_FADE_START) / LABEL_FADE_SPAN));
		ring.setAlpha(opacity);
		if (labelListeners.size === 0) {
			return;
		}
		const anchors: LabelAnchor[] = [{ id: SOL_ID, x: sol.x, y: sol.y, radius: SOL_PIXELS / 2, away: Math.PI / 2 }];
		neighborWorld.forEach((world, index) => {
			if (project(world)) {
				anchors.push({
					id: NEIGHBORS[index].id,
					x: projected.x,
					y: projected.y,
					radius: NEIGHBOR_PIXELS / 2,
					away: awayFrom(sol, projected.x, projected.y),
				});
			}
		});
		const frame: LabelFrame = { anchors, hovered, opacity };
		for (const listener of labelListeners) {
			listener(frame);
		}
	});

	return {
		onLabels(listener) {
			labelListeners.add(listener);
			return () => {
				labelListeners.delete(listener);
			};
		},
		onSelect(listener) {
			selectListeners.add(listener);
			return () => {
				selectListeners.delete(listener);
			};
		},
		zoom(direction) {
			if (glide < 1) {
				hurry();
				return;
			}
			nudgeChartZoom(camera, direction);
		},
	};
}

/**
 * Glow from the disk, the bar, and the arms, drawn on one flat plane. Arms carry dust lanes on their
 * inner edge and pink star-forming knots; the Orion Spur is a short branch through Sol.
 */
function buildDisk(scene: Scene): Mesh {
	const disk = MeshBuilder.CreateGround("galaxy-disk", { width: ARM_END * 2.4, height: ARM_END * 2.4 }, scene);
	const material = new ShaderMaterial(
		"galaxy-disk",
		scene,
		{
			vertexSource: `
				precision highp float;
				attribute vec3 position;
				uniform mat4 world;
				uniform mat4 worldViewProjection;
				varying vec2 vDisk;
				void main() {
					gl_Position = worldViewProjection * vec4(position, 1.0);
					vDisk = (world * vec4(position, 1.0)).xz;
				}
			`,
			fragmentSource: `
				precision highp float;
				varying vec2 vDisk;
				uniform float perseus;
				uniform float spur;
				uniform float armPitch;
				uniform float spurPitch;
				uniform vec2 sol;
				uniform vec2 barAxis;
				uniform float strength;
				float hash(vec2 p) {
					p = fract(p * vec2(123.34, 456.21));
					p += dot(p, p + 45.32);
					return fract(p.x * p.y);
				}
				float noise(vec2 p) {
					vec2 i = floor(p);
					vec2 f = fract(p);
					f = f * f * (3.0 - 2.0 * f);
					return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
				}
				float fbm(vec2 p) {
					float total = 0.0;
					float amplitude = 0.5;
					for (int i = 0; i < 5; i++) {
						total += amplitude * noise(p);
						p *= 2.03;
						amplitude *= 0.5;
					}
					return total;
				}
				void main() {
					float r = length(vDisk);
					float phi = atan(vDisk.y, vDisk.x);
					float logR = log(max(r, 1.0));
					float mottle = fbm(vDisk * 0.018);
					float fine = fbm(vDisk * 0.07 + 7.0);
					float wobble = (mottle - 0.5) * 0.9;
					float psi = phi + logR / armPitch + wobble;

					float disk = exp(-r / 150.0) * (1.0 - smoothstep(430.0, 600.0, r));
					float reach = smoothstep(110.0, 175.0, r) * (1.0 - smoothstep(470.0, 590.0, r));
					float major = pow(0.5 + 0.5 * cos(2.0 * (psi - perseus)), 10.0);
					float minor = pow(0.5 + 0.5 * cos(2.0 * (psi - perseus) - 3.14159), 14.0);
					float arms = (major + 0.6 * minor) * reach;
					float lane = pow(0.5 + 0.5 * cos(2.0 * (psi - perseus) - 0.45), 60.0) * reach;

					vec2 fromSol = vDisk - sol;
					float spurBand = pow(0.5 + 0.5 * cos(phi + logR / spurPitch - spur + wobble * 0.4), 90.0);
					float orion = spurBand * exp(-dot(fromSol, fromSol) / (2.0 * 75.0 * 75.0));

					vec2 q = vec2(dot(vDisk, barAxis), dot(vDisk, vec2(-barAxis.y, barAxis.x)));
					float bar = exp(-(q.x * q.x) / (2.0 * ${BAR_LENGTH.toFixed(1)} * ${BAR_LENGTH.toFixed(1)}) - (q.y * q.y) / (2.0 * ${BAR_WIDTH.toFixed(1)} * ${BAR_WIDTH.toFixed(1)}));
					float bulge = exp(-r * r / (2.0 * 45.0 * 45.0));
					float core = exp(-r * r / (2.0 * 10.0 * 10.0));
					float ellipse = length(vec2(q.x / 150.0, q.y / 95.0));
					float innerRing = exp(-pow((ellipse - 1.0) / 0.1, 2.0));

					vec3 color = vec3(0.28, 0.28, 0.5) * disk * (0.45 + 0.6 * mottle);
					float bright = 0.4 + 1.2 * exp(-r / 300.0);
					color += vec3(0.55, 0.62, 1.0) * (arms + 0.6 * orion) * (0.3 + 1.0 * fine) * bright;
					float knots = smoothstep(0.7, 0.86, fbm(vDisk * 0.22 + 3.0)) * (arms + orion);
					color += vec3(1.0, 0.32, 0.58) * knots * 0.8;
					color *= 1.0 - 0.7 * lane * smoothstep(0.35, 0.6, fine);
					color += vec3(1.0, 0.78, 0.5) * (bar * 0.9 + innerRing * 0.12 * disk * 4.0);
					color += vec3(1.0, 0.86, 0.62) * bulge * 0.8 + vec3(1.0, 0.95, 0.85) * core * 1.2;
					gl_FragColor = vec4(color * strength, 1.0);
				}
			`,
		},
		{
			attributes: ["position"],
			uniforms: ["world", "worldViewProjection", "perseus", "spur", "armPitch", "spurPitch", "sol", "barAxis", "strength"],
			needAlphaBlending: true,
		}
	);
	material.setFloat("perseus", PERSEUS_PHASE);
	material.setFloat("spur", SPUR_PHASE);
	material.setFloat("armPitch", ARM_PITCH);
	material.setFloat("spurPitch", SPUR_PITCH);
	material.setVector2("sol", new Vector2(SOL_POSITION.x, SOL_POSITION.z));
	material.setVector2("barAxis", new Vector2(BAR_AXIS.x, BAR_AXIS.z));
	material.setFloat("strength", GALAXY_GLOW);
	material.backFaceCulling = false;
	material.alphaMode = Constants.ALPHA_ADD;
	material.disableDepthWrite = true;
	disk.material = material;
	disk.isPickable = false;
	return disk;
}

type PointCloud = { positions: number[]; colors: number[]; sizes: number[] };

function addPoint(cloud: PointCloud, position: Vector3, color: Color3, level: number, size: number): void {
	cloud.positions.push(position.x, position.y, position.z);
	cloud.colors.push(color.r, color.g, color.b, level);
	cloud.sizes.push(size);
}

/** Stars thrown along the arms, the disk, the bar, and around Sol, so the glow has grain at every zoom. */
function buildGalaxyStars(scene: Scene): Mesh {
	const random = seededRandom(47);
	const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(Math.PI * 2 * random());
	const cloud: PointCloud = { positions: [], colors: [], sizes: [] };
	const point = new Vector3();
	const armColor = new Color3(0.78, 0.84, 1);
	const diskColor = new Color3(0.86, 0.86, 1);
	const coreColor = new Color3(1, 0.86, 0.62);
	const knotColor = new Color3(1, 0.42, 0.66);

	const onArm = (radius: number, spread: number) => {
		const major = random() < 0.65;
		const arm = (major ? 0 : Math.PI / 2) + (random() < 0.5 ? 0 : Math.PI);
		const angle = PERSEUS_PHASE + arm - Math.log(radius) / ARM_PITCH + gaussian() * spread;
		point.set(Math.cos(angle) * radius + gaussian() * 5, gaussian() * 2.5, Math.sin(angle) * radius + gaussian() * 5);
		return point;
	};

	for (let i = 0; i < 26000; i++) {
		const radius = ARM_START + (ARM_END - ARM_START) * Math.pow(random(), 1.3);
		addPoint(cloud, onArm(radius, 0.05), armColor, 0.2 + 0.7 * random() * random(), 1 + 1.4 * random() * random());
	}
	for (let i = 0; i < 12000; i++) {
		const radius = Math.min(ARM_END + 40, -Math.log(1 - random()) * 150);
		const angle = random() * Math.PI * 2;
		point.set(Math.cos(angle) * radius, gaussian() * 4, Math.sin(angle) * radius);
		addPoint(cloud, point, diskColor, 0.12 + 0.35 * random(), 1 + random());
	}
	for (let i = 0; i < 9000; i++) {
		const along = gaussian() * BAR_LENGTH * 0.8;
		const across = gaussian() * BAR_WIDTH;
		point.set(along * BAR_AXIS.x - across * BAR_AXIS.z, gaussian() * 8, along * BAR_AXIS.z + across * BAR_AXIS.x);
		addPoint(cloud, point, coreColor, 0.25 + 0.55 * random(), 1 + 1.2 * random());
	}
	for (let i = 0; i < 2500; i++) {
		const radius = Math.sqrt(random()) * NEIGHBOR_REACH * 1.8;
		const angle = random() * Math.PI * 2;
		point.set(SOL_POSITION.x + Math.cos(angle) * radius, gaussian() * 1.5, SOL_POSITION.z + Math.sin(angle) * radius);
		addPoint(cloud, point, diskColor, 0.15 + 0.45 * random() * random(), 1 + 1.2 * random() * random());
	}
	for (let i = 0; i < 500; i++) {
		const radius = 150 + 330 * random();
		addPoint(cloud, onArm(radius, 0.04), knotColor, 0.45 + 0.4 * random(), 2.2 + 2.2 * random());
	}
	return pointMesh(scene, "galaxy-stars", cloud);
}

/** Distant background stars, fixed to the camera so they never shift. */
function buildSky(scene: Scene): Mesh {
	const random = seededRandom(5);
	const cloud: PointCloud = { positions: [], colors: [], sizes: [] };
	const point = new Vector3();
	const white = new Color3(1, 1, 1);
	for (let i = 0; i < 2500; i++) {
		const y = random() * 2 - 1;
		const around = random() * Math.PI * 2;
		const flat = Math.sqrt(1 - y * y);
		point.set(Math.cos(around) * flat * SKY_RADIUS, y * SKY_RADIUS, Math.sin(around) * flat * SKY_RADIUS);
		addPoint(cloud, point, white, 0.08 + 0.3 * random() * random(), 1 + random());
	}
	const sky = pointMesh(scene, "galaxy-sky", cloud);
	sky.infiniteDistance = true;
	return sky;
}

/** Sol in amber with a soft halo, and each neighbor in the color of its brightest star. */
function buildMarkers(scene: Scene): Mesh {
	const cloud: PointCloud = { positions: [], colors: [], sizes: [] };
	addPoint(cloud, SOL_POSITION, AMBER, 0.35, 34);
	addPoint(cloud, SOL_POSITION, AMBER, 1, SOL_PIXELS);
	for (const neighbor of NEIGHBORS) {
		const position = neighborPosition(neighbor);
		const color = STAR_COLORS[neighbor.star];
		addPoint(cloud, position, color, 0.2, 18);
		addPoint(cloud, position, color, 0.95, NEIGHBOR_PIXELS);
	}
	return pointMesh(scene, "galaxy-markers", cloud);
}

/**
 * The edge of the range, as a faint circle in the disk's plane, and a stem from each neighbor down or
 * up to that plane, so height off the disk reads as height and not as distance. They fade with the names.
 */
function buildRing(scene: Scene): { setAlpha: (alpha: number) => void } {
	const circle: Vector3[] = [];
	for (let i = 0; i <= 180; i++) {
		const angle = (i / 180) * Math.PI * 2;
		circle.push(
			new Vector3(SOL_POSITION.x + Math.cos(angle) * NEIGHBOR_REACH, 0, SOL_POSITION.z + Math.sin(angle) * NEIGHBOR_REACH)
		);
	}
	const ring = MeshBuilder.CreateLines("neighbor-range", { points: circle, useVertexAlpha: true }, scene);
	ring.color = BONE;
	const stems = MeshBuilder.CreateLineSystem(
		"neighbor-stems",
		{
			lines: NEIGHBORS.map((neighbor) => {
				const top = neighborPosition(neighbor);
				return [top, new Vector3(top.x, 0, top.z)];
			}),
			useVertexAlpha: true,
		},
		scene
	);
	stems.color = BONE;
	for (const line of [ring, stems]) {
		line.isPickable = false;
	}
	return {
		setAlpha(alpha) {
			ring.alpha = 0.22 * alpha;
			stems.alpha = 0.22 * alpha;
			ring.isVisible = alpha > 0.01;
			stems.isVisible = alpha > 0.01;
		},
	};
}

/** One point per entry, sized in screen pixels, drawn as a single additive batch. */
function pointMesh(scene: Scene, name: string, cloud: PointCloud): Mesh {
	const mesh = new Mesh(name, scene);
	mesh.isUnIndexed = true;
	mesh.setVerticesData(VertexBuffer.PositionKind, new Float32Array(cloud.positions), false, 3);
	mesh.setVerticesData(VertexBuffer.ColorKind, new Float32Array(cloud.colors), false, 4);
	mesh.setVerticesData("starSize", new Float32Array(cloud.sizes), false, 1);
	const material = new ShaderMaterial(
		name,
		scene,
		{
			vertexSource: `
				precision highp float;
				attribute vec3 position;
				attribute vec4 color;
				attribute float starSize;
				uniform mat4 worldViewProjection;
				uniform float pixelRatio;
				varying vec4 vColor;
				void main() {
					gl_Position = worldViewProjection * vec4(position, 1.0);
					gl_PointSize = max(starSize * pixelRatio, 1.0);
					vColor = color;
				}
			`,
			fragmentSource: `
				precision highp float;
				varying vec4 vColor;
				void main() {
					float edge = length(gl_PointCoord - 0.5) * 2.0;
					float disc = 1.0 - smoothstep(0.35, 1.0, edge);
					gl_FragColor = vec4(vColor.rgb * vColor.a * disc * disc, 1.0);
				}
			`,
		},
		{ attributes: ["position", "color", "starSize"], uniforms: ["worldViewProjection", "pixelRatio"], needAlphaBlending: true }
	);
	material.setFloat("pixelRatio", 1 / scene.getEngine().getHardwareScalingLevel());
	material.pointsCloud = true;
	material.alphaMode = Constants.ALPHA_ADD;
	material.disableDepthWrite = true;
	mesh.material = material;
	mesh.alwaysSelectAsActiveMesh = true;
	mesh.isPickable = false;
	return mesh;
}

function seededRandom(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

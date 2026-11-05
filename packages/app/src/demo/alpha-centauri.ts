import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

import { palette } from "../palette";
import { daysSinceJ2000 } from "./ephemeris";
import { awayFrom, type LabelAnchor, type LabelFrame, type LabelSource } from "./labels";
import { trackPicks } from "./pointer";
import { attachChartCamera, tuneChartCamera } from "./zoom";

/**
 * Alpha Centauri as a chart, not a second Sol.
 *
 * Rigil Kentaurus and Toliman orbit a shared center. Their gap, period, and eccentricity are the real
 * ones, laid open the way Sol lays the ecliptic flat, so the two ellipses read from above. Proxima
 * really sits about 8,700 AU out, hundreds of times the pair's separation. It is drawn in, the way the
 * galaxy chart stretches neighbors that would otherwise sit inside Sol's dot, so the pair stays two
 * stars. Nothing major is confirmed around Rigil or Toliman, so those worlds are invented. Proxima d
 * and b are real. Proxima c is a candidate, and its path is dashed.
 *
 * The stars keep the real day count, so the pair creeps. An 11-day world on that same clock would not
 * move while someone looks, so the worlds run on a faster chart clock.
 */

/** Semi-major axis of the relative orbit, in scene units. The real mean gap is about 23 AU. */
export const BINARY_AXIS = 160;
export const BINARY_ECCENTRICITY = 0.519;
/** Published period, in Julian years. */
export const BINARY_PERIOD_YEARS = 79.91;
export const BINARY_PERIOD_DAYS = BINARY_PERIOD_YEARS * 365.25;
/** Periastron was 1955.66. Mean anomaly grows from there. */
export const BINARY_MEAN_AT_J2000 = ((2000 - 1955.66) / BINARY_PERIOD_YEARS) * Math.PI * 2;
/** Laid open. The real orbit is steeply inclined to us and would draw as a line. */
export const BINARY_TILT = (12 * Math.PI) / 180;
export const RIGIL_MASS = 1.0788;
export const TOLIMAN_MASS = 0.9092;

export const BINARY_PERIASTRON = BINARY_AXIS * (1 - BINARY_ECCENTRICITY);
export const BINARY_APASTRON = BINARY_AXIS * (1 + BINARY_ECCENTRICITY);

/**
 * Proxima's chart ellipse. The real separation is about 8,700 AU, roughly a hundred times what this
 * radius implies next to the pair.
 */
export const PROXIMA_AXIS = 520;
export const PROXIMA_ECCENTRICITY = 0.2;
/** Chosen so Proxima sits near the semi-major axis, at the edge of the opening frame. */
export const PROXIMA_ANOMALY = 1.77;
export const PROXIMA_TILT = (-8 * Math.PI) / 180;

/**
 * Real seconds per chart day for worlds and moons. Proxima b's 11-day period then takes about a
 * quarter hour, and the innermost moons take a few minutes. The stars do not use this clock.
 */
export const CHART_DAY_SECONDS = 80;

export type ChartPoint = { x: number; y: number; z: number };

export type ChartView =
	| "system"
	| "rigil"
	| "toliman"
	| "proxima"
	| "kentaurus"
	| "harbor"
	| "cinder"
	| "lumen"
	| "ember"
	| "moth"
	| "proxima-d"
	| "proxima-b"
	| "proxima-c"
	| "gleam"
	| "dust"
	| "thread";

const STARS = new Set<ChartView>(["rigil", "toliman", "proxima"]);
const MOONS = new Set<ChartView>(["gleam", "dust", "thread"]);

const LABEL: Record<Exclude<ChartView, "system">, string> = {
	rigil: "Rigil",
	toliman: "Toliman",
	proxima: "Proxima",
	kentaurus: "Kentaurus",
	harbor: "Harbor",
	cinder: "Cinder",
	lumen: "Lumen",
	ember: "Ember",
	moth: "Moth",
	"proxima-d": "Proxima d",
	"proxima-b": "Proxima b",
	"proxima-c": "Proxima c",
	gleam: "Gleam",
	dust: "Dust",
	thread: "Thread",
};

const NOTE: Partial<Record<Exclude<ChartView, "system">, string>> = {
	proxima: "Drawn in",
	kentaurus: "Invented",
	harbor: "Invented",
	cinder: "Invented",
	lumen: "Invented",
	ember: "Invented",
	moth: "Invented",
	"proxima-c": "Unconfirmed",
	gleam: "Invented",
	dust: "Invented",
	thread: "Invented",
};

const PARENT: Record<Exclude<ChartView, "system">, ChartView> = {
	rigil: "system",
	toliman: "system",
	proxima: "system",
	kentaurus: "system",
	harbor: "system",
	cinder: "rigil",
	lumen: "rigil",
	ember: "toliman",
	moth: "toliman",
	"proxima-d": "proxima",
	"proxima-b": "proxima",
	"proxima-c": "proxima",
	gleam: "lumen",
	dust: "moth",
	thread: "moth",
};

/** Proxima c is the unconfirmed candidate. Every other path is solid. */
export function orbitStyle(id: string): "solid" | "dashed" {
	return id === "proxima-c" ? "dashed" : "solid";
}

function wrap(angle: number): number {
	const turn = Math.PI * 2;
	return ((angle % turn) + turn) % turn;
}

/** True anomaly from mean anomaly, for a Kepler orbit of this eccentricity. */
export function trueAnomaly(meanAnomaly: number, eccentricity: number): number {
	const mean = wrap(meanAnomaly);
	let eccentric = mean + eccentricity * Math.sin(mean);
	for (let i = 0; i < 8; i++) {
		eccentric -= (eccentric - eccentricity * Math.sin(eccentric) - mean) / (1 - eccentricity * Math.cos(eccentric));
	}
	return wrap(
		2 *
			Math.atan2(
				Math.sqrt(1 + eccentricity) * Math.sin(eccentric / 2),
				Math.sqrt(1 - eccentricity) * Math.cos(eccentric / 2)
			)
	);
}

/** Distance from the focus at this true anomaly. */
export function orbitRadius(axis: number, eccentricity: number, anomaly: number): number {
	return (axis * (1 - eccentricity * eccentricity)) / (1 + eccentricity * Math.cos(anomaly));
}

function tilted(radius: number, angle: number, tilt: number): ChartPoint {
	const flat = Math.sin(angle) * radius;
	return { x: Math.cos(angle) * radius, y: flat * Math.sin(tilt), z: flat * Math.cos(tilt) };
}

export function chartDistance(point: ChartPoint): number {
	return Math.hypot(point.x, point.y, point.z);
}

export function chartGap(a: ChartPoint, b: ChartPoint): number {
	return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export type ChartStar = "rigil" | "toliman" | "proxima";

/**
 * Which stars can light a world. Proxima is drawn in from thousands of AU, so a chart distance to it
 * is not a distance light crosses. The pair lights the worlds of the pair. Proxima lights its own.
 */
export function chartStars(light: "pair" | "rigil" | "toliman" | "proxima"): ChartStar[] {
	return light === "proxima" ? ["proxima"] : ["rigil", "toliman"];
}

/**
 * Up to two stars, brightest first. Brightness is the inverse square of chart distance, so the nearer
 * star is the light and the farther one fills in proportion. The brightest has reach 1.
 */
export function starLight(from: ChartPoint, stars: readonly { id: ChartStar; at: ChartPoint }[]): { id: ChartStar; reach: number }[] {
	const ranked: { id: ChartStar; illuminance: number }[] = [];
	for (const star of stars) {
		const distance = chartGap(from, star.at);
		if (distance < 1e-3) {
			continue;
		}
		const illuminance = 1 / (distance * distance);
		const entry = { id: star.id, illuminance };
		if (ranked.length === 0 || illuminance > ranked[0].illuminance) {
			ranked.unshift(entry);
			if (ranked.length > 2) {
				ranked.length = 2;
			}
		} else if (ranked.length === 1) {
			ranked.push(entry);
		} else if (illuminance > ranked[1].illuminance) {
			ranked[1] = entry;
		}
	}
	const lead = ranked[0]?.illuminance ?? 0;
	if (lead <= 0) {
		return [];
	}
	return ranked.slice(0, 2).map((star) => ({ id: star.id, reach: star.illuminance / lead }));
}

/** Where the pair is for a mean anomaly. They stay opposite each other, and Rigil stays closer in. */
export function binaryPlaces(meanAnomaly: number): { rigil: ChartPoint; toliman: ChartPoint; separation: number } {
	const anomaly = trueAnomaly(meanAnomaly, BINARY_ECCENTRICITY);
	const separation = orbitRadius(BINARY_AXIS, BINARY_ECCENTRICITY, anomaly);
	const total = RIGIL_MASS + TOLIMAN_MASS;
	const rigil = tilted(separation * (TOLIMAN_MASS / total), anomaly + Math.PI, BINARY_TILT);
	const toliman = tilted(separation * (RIGIL_MASS / total), anomaly, BINARY_TILT);
	return { rigil, toliman, separation };
}

export function binaryMeanAnomaly(days: number): number {
	return wrap(BINARY_MEAN_AT_J2000 + (Math.PI * 2 * days) / BINARY_PERIOD_DAYS);
}

/** One star's ellipse, sampled in true anomaly so the line is even. */
export function starTrack(which: "rigil" | "toliman", steps = 180): ChartPoint[] {
	const share = which === "rigil" ? TOLIMAN_MASS / (RIGIL_MASS + TOLIMAN_MASS) : RIGIL_MASS / (RIGIL_MASS + TOLIMAN_MASS);
	const turn = which === "rigil" ? Math.PI : 0;
	const points: ChartPoint[] = [];
	for (let i = 0; i <= steps; i++) {
		const anomaly = (i / steps) * Math.PI * 2;
		const separation = orbitRadius(BINARY_AXIS, BINARY_ECCENTRICITY, anomaly);
		points.push(tilted(separation * share, anomaly + turn, BINARY_TILT));
	}
	return points;
}

export function proximaPlace(): ChartPoint {
	return tilted(orbitRadius(PROXIMA_AXIS, PROXIMA_ECCENTRICITY, PROXIMA_ANOMALY), PROXIMA_ANOMALY, PROXIMA_TILT);
}

export function proximaTrack(steps = 180): ChartPoint[] {
	const points: ChartPoint[] = [];
	for (let i = 0; i <= steps; i++) {
		const anomaly = (i / steps) * Math.PI * 2;
		points.push(tilted(orbitRadius(PROXIMA_AXIS, PROXIMA_ECCENTRICITY, anomaly), anomaly, PROXIMA_TILT));
	}
	return points;
}

/** Chart days since J2000, on the faster world clock. */
export function chartDays(unixMs: number): number {
	return daysSinceJ2000(unixMs) * (86_400 / CHART_DAY_SECONDS);
}

export function alphaPlaque(view: ChartView): { title: string; detail: string | null } {
	if (view === "system") {
		return { title: "Alpha Centauri", detail: null };
	}
	if (view === "rigil") {
		return { title: "Rigil Kentaurus", detail: null };
	}
	if (view === "toliman") {
		return { title: "Toliman", detail: null };
	}
	if (view === "proxima") {
		return { title: "Proxima Centauri", detail: null };
	}
	return { title: LABEL[view], detail: null };
}

export type ChartStep = { label: string; title: string; target: ChartView | "galaxy" };

/**
 * The corner step back, one level at a time, in the same words Sol uses.
 * Galaxy leaves the chart. System returns to the whole system. Sun returns to a star.
 * Planet returns to a world, the way a moon returns to its planet.
 */
export function alphaChartSteps(view: ChartView): ChartStep[] {
	if (view === "system") {
		return [{ label: "Galaxy", title: "Back to the galaxy", target: "galaxy" }];
	}
	const parent = PARENT[view];
	if (parent === "system") {
		return [{ label: "System", title: "Back to Alpha Centauri", target: "system" }];
	}
	if (STARS.has(parent)) {
		return [{ label: "Sun", title: `Back to ${LABEL[parent]}`, target: parent }];
	}
	return [{ label: "Planet", title: `Back to ${LABEL[parent]}`, target: parent }];
}

/** Bodies named on this chart. A star's worlds wait until that star is open, the way Sol's moons do. */
export function alphaLabels(view: ChartView): { id: ChartView; label: string; note?: string }[] {
	return namedOn(view).map((id) => ({ id, label: LABEL[id], note: NOTE[id] }));
}

function namedOn(view: ChartView): Exclude<ChartView, "system">[] {
	if (view === "system") {
		return ["rigil", "toliman", "proxima", "kentaurus", "harbor"];
	}
	if (view === "rigil") {
		return ["rigil", "cinder", "lumen"];
	}
	if (view === "toliman") {
		return ["toliman", "ember", "moth"];
	}
	if (view === "proxima") {
		return ["proxima", "proxima-d", "proxima-b", "proxima-c"];
	}
	if (view === "lumen") {
		return ["lumen", "gleam"];
	}
	if (view === "moth") {
		return ["moth", "dust", "thread"];
	}
	return [view];
}

type Rgb = [number, number, number];

type WorldSpec = {
	id: Exclude<ChartView, "system" | "rigil" | "toliman" | "proxima">;
	parent: ChartView | null;
	orbit: number;
	period: number;
	phase: number;
	tilt: number;
	diameter: number;
	colorA: Rgb;
	colorB: Rgb;
	bands: number;
	spots: number;
	seed: number;
	spin: number;
	light: "pair" | "rigil" | "toliman" | "proxima";
	/** A tinted ring. Without `giant`, a flat glowing band. With it, the structured ring in `buildGiantRing`. */
	ring?: { inner: number; outer: number; tilt: number; color: Rgb };
	/**
	 * A cold gas giant, drawn by `GIANT_FRAGMENT` instead of the striped sphere. The planet sits in the
	 * ring's tilted frame so its belts run parallel to the rings, and the two shade one another.
	 */
	giant?: GiantPalette;
};

/** Cloud tops of a cold giant. Muted on purpose: ammonia haze over tholin-stained belts. */
type GiantPalette = {
	/** Bright zones. */
	zone: Rgb;
	/** The shaded side of a zone. */
	zoneShade: Rgb;
	/** Belts, where the cloud deck is thin. */
	belt: Rgb;
	beltDeep: Rgb;
	/** High-latitude haze. */
	polar: Rgb;
	/** Veil that flattens contrast toward the limb. */
	haze: Rgb;
	/** A long-lived storm. */
	storm: Rgb;
};

const WORLDS: WorldSpec[] = [
	{
		id: "kentaurus",
		parent: null,
		orbit: 300,
		period: 70,
		phase: 0.4,
		tilt: BINARY_TILT,
		diameter: 12,
		// The path takes colorA. Cloud-top tan, not a signal color.
		colorA: [0.78, 0.64, 0.44],
		colorB: [0.5, 0.38, 0.27],
		bands: 0,
		spots: 0,
		seed: 1.2,
		// A giant turns fast. Three and a half minutes a day on the chart clock.
		spin: 2.4,
		light: "pair",
		// Saturn's proportions: a dusty inner ring close in, then a dense bright ring, a division, and an
		// outer ring. Tilted about as far as Saturn leans.
		ring: { inner: 7.6, outer: 14.4, tilt: 0.47, color: [1, 0.96, 0.88] },
		giant: {
			zone: [0.9, 0.82, 0.64],
			zoneShade: [0.76, 0.63, 0.45],
			belt: [0.58, 0.42, 0.3],
			beltDeep: [0.4, 0.29, 0.22],
			polar: [0.37, 0.41, 0.43],
			haze: [0.8, 0.72, 0.58],
			storm: [0.76, 0.5, 0.36],
		},
	},
	{
		id: "harbor",
		parent: null,
		orbit: 410,
		period: 140,
		phase: 2.1,
		tilt: BINARY_TILT,
		diameter: 5.4,
		colorA: [0.18, 0.62, 0.58],
		colorB: [0.86, 0.42, 0.24],
		bands: 3,
		spots: 0.85,
		seed: 2.4,
		spin: 1.2,
		light: "pair",
	},
	{
		id: "cinder",
		parent: "rigil",
		orbit: 28,
		period: 6,
		phase: 1.1,
		tilt: 0.35,
		diameter: 2.4,
		colorA: [1, 0.42, 0.32],
		colorB: [0.95, 0.72, 0.28],
		bands: 4,
		spots: 0.35,
		seed: 3.1,
		spin: 3,
		light: "rigil",
	},
	{
		id: "lumen",
		parent: "rigil",
		orbit: 52,
		period: 26,
		phase: 3.4,
		tilt: 0.22,
		diameter: 4.4,
		colorA: [0.98, 0.94, 0.82],
		colorB: [0.92, 0.74, 0.32],
		bands: 6,
		spots: 0.2,
		seed: 4.2,
		spin: 1.4,
		light: "rigil",
		ring: { inner: 3.1, outer: 5, tilt: 0.32, color: [1, 0.86, 0.48] },
	},
	{
		id: "ember",
		parent: "toliman",
		orbit: 26,
		period: 8,
		phase: 0.7,
		tilt: 0.4,
		diameter: 2.6,
		colorA: [0.72, 0.16, 0.08],
		colorB: [1, 0.46, 0.12],
		bands: 5,
		spots: 0.55,
		seed: 5.5,
		spin: 2.6,
		light: "toliman",
	},
	{
		id: "moth",
		parent: "toliman",
		orbit: 50,
		period: 32,
		phase: 4.2,
		tilt: 0.28,
		diameter: 3.8,
		colorA: [0.96, 0.86, 0.52],
		colorB: [0.82, 0.62, 0.28],
		bands: 7,
		spots: 0.45,
		seed: 6.3,
		spin: 1.1,
		light: "toliman",
	},
	{
		id: "proxima-d",
		parent: "proxima",
		orbit: 12,
		period: 5.2,
		phase: 0.3,
		tilt: 0.2,
		diameter: 1.35,
		colorA: [0.86, 0.16, 0.42],
		colorB: [1, 0.48, 0.28],
		bands: 8,
		spots: 0.4,
		seed: 7.1,
		spin: 4,
		light: "proxima",
	},
	{
		id: "proxima-b",
		parent: "proxima",
		orbit: 24,
		period: 11.2,
		phase: 2.6,
		tilt: 0.15,
		diameter: 3.4,
		colorA: [0.2, 0.66, 0.62],
		colorB: [0.72, 0.34, 0.22],
		bands: 3,
		spots: 0.7,
		seed: 8.4,
		spin: 1.6,
		light: "proxima",
	},
	{
		id: "proxima-c",
		parent: "proxima",
		orbit: 54,
		period: 1900,
		phase: 1.4,
		tilt: 0.5,
		diameter: 2.8,
		colorA: [0.42, 0.5, 0.62],
		colorB: [0.28, 0.34, 0.48],
		bands: 5,
		spots: 0.15,
		seed: 9.2,
		spin: 0.8,
		light: "proxima",
	},
	{
		id: "gleam",
		parent: "lumen",
		orbit: 7.6,
		period: 4,
		phase: 0.9,
		tilt: 0.5,
		diameter: 1.15,
		colorA: [0.96, 0.92, 0.78],
		colorB: [0.78, 0.7, 0.48],
		bands: 2,
		spots: 0.25,
		seed: 1.7,
		spin: 2,
		light: "rigil",
	},
	{
		id: "dust",
		parent: "moth",
		orbit: 6.4,
		period: 3.2,
		phase: 2.2,
		tilt: 0.35,
		diameter: 0.7,
		colorA: [0.9, 0.78, 0.48],
		colorB: [0.62, 0.48, 0.28],
		bands: 2,
		spots: 0.3,
		seed: 2.8,
		spin: 3,
		light: "toliman",
	},
	{
		id: "thread",
		parent: "moth",
		orbit: 10,
		period: 7.5,
		phase: 4.8,
		tilt: 0.55,
		diameter: 0.85,
		colorA: [0.84, 0.8, 0.7],
		colorB: [0.55, 0.48, 0.36],
		bands: 3,
		spots: 0.2,
		seed: 3.6,
		spin: 2.2,
		light: "toliman",
	},
];

const STAR_COLOR: Record<"rigil" | "toliman" | "proxima", Color3> = {
	rigil: new Color3(1, 0.94, 0.72),
	toliman: new Color3(1, 0.58, 0.26),
	proxima: new Color3(1, 0.28, 0.22),
};

const STAR_DIAMETER: Record<"rigil" | "toliman" | "proxima", number> = {
	rigil: 14,
	toliman: 11,
	proxima: 6,
};


const FLIGHT_SECONDS = 2.2;

type Pose = { alpha: number; beta: number; radius: number; target: Vector3 };

type Body = {
	id: Exclude<ChartView, "system">;
	node: TransformNode;
	mesh: Mesh;
	radius: number;
	parent: ChartView | null;
	orbit: number;
	period: number;
	phase: number;
	tilt: number;
	spin: number;
	material: ShaderMaterial | null;
	/** A giant's ring, lit by the same stars and shaded by the planet. */
	ringMaterial: ShaderMaterial | null;
	/** A giant turns inside its shader, so the tilted ring does not wobble. Other worlds turn their mesh. */
	turnsInShader: boolean;
	light: WorldSpec["light"] | "none";
};

type OrbitLine = { mesh: LinesMesh; scope: string; dim: number };

export type AlphaCentauriDemo = LabelSource & {
	/** Calls back with the chart now in frame, including once on subscribe. */
	onView: (listener: (view: ChartView) => void) => () => void;
	/** Flies the camera to a star, a world, or the whole system. */
	go: (view: ChartView) => void;
};

export function createAlphaCentauri(engine: Engine, scene: Scene, canvas: HTMLCanvasElement): AlphaCentauriDemo {
	scene.clearColor = new Color4(0, 0, 0, 1);
	const camera = new ArcRotateCamera("alpha-camera", -Math.PI / 2, 0.34, 1400, Vector3.Zero(), scene);
	camera.lowerBetaLimit = 0.05;
	camera.upperBetaLimit = 1.45;
	camera.minZ = 0.05;
	camera.maxZ = 8000;
	tuneChartCamera(camera);
	scene.activeCamera = camera;
	attachChartCamera(camera, canvas);

	const followSky = buildSky(scene);
	const bodies = new Map<Exclude<ChartView, "system">, Body>();
	const lines: OrbitLine[] = [];

	const anchorOf = (id: ChartView | null): TransformNode | null => {
		if (!id || id === "system") {
			return null;
		}
		return bodies.get(id)?.node ?? null;
	};

	const addLine = (name: string, radius: number, tilt: number, color: Color3, dashed: boolean, parent: TransformNode | null, scope: string, dim: number) => {
		const points: Vector3[] = [];
		const steps = 160;
		for (let i = 0; i <= steps; i++) {
			const angle = (i / steps) * Math.PI * 2;
			const point = tilted(radius, angle, tilt);
			points.push(new Vector3(point.x, point.y, point.z));
		}
		// Each chord must be longer than the dash pitch, or Babylon emits no vertices.
		const mesh = dashed
			? MeshBuilder.CreateDashedLines(name, { points, dashSize: 2, gapSize: 1.6, dashNb: 240 }, scene)
			: MeshBuilder.CreateLines(name, { points }, scene);
		mesh.color = color.clone().scale(dashed ? 1 : 0.75);
		mesh.isPickable = false;
		mesh.parent = parent;
		lines.push({ mesh, scope, dim });
	};

	const addPath = (name: string, path: ChartPoint[], color: Color3, scope: string, dim: number) => {
		const mesh = MeshBuilder.CreateLines(
			name,
			{ points: path.map((point) => new Vector3(point.x, point.y, point.z)) },
			scene
		);
		mesh.color = color.clone().scale(0.75);
		mesh.isPickable = false;
		lines.push({ mesh, scope, dim });
	};

	addLine("barycenter", 10, BINARY_TILT, new Color3(0.85, 0.75, 0.48), false, null, "system", 0.35);
	addPath("rigil-path", starTrack("rigil"), STAR_COLOR.rigil, "system", 1);
	addPath("toliman-path", starTrack("toliman"), STAR_COLOR.toliman, "system", 1);
	addPath("proxima-path", proximaTrack(), STAR_COLOR.proxima, "system", 1);

	const makeStar = (id: "rigil" | "toliman" | "proxima") => {
		const node = new TransformNode(id, scene);
		const mesh = MeshBuilder.CreateSphere(id, { diameter: STAR_DIAMETER[id], segments: 48 }, scene);
		const material = new StandardMaterial(id, scene);
		material.emissiveColor = STAR_COLOR[id];
		material.disableLighting = true;
		material.specularColor = Color3.Black();
		mesh.material = material;
		mesh.isPickable = false;
		mesh.parent = node;
		const corona = buildCorona(scene, id, STAR_DIAMETER[id], STAR_COLOR[id]);
		corona.parent = node;
		const body: Body = {
			id,
			node,
			mesh,
			radius: STAR_DIAMETER[id] / 2,
			parent: null,
			orbit: 0,
			period: 0,
			phase: 0,
			tilt: 0,
			spin: id === "proxima" ? 0.4 : 0.15,
			material: null,
			ringMaterial: null,
			turnsInShader: false,
			light: "none",
		};
		bodies.set(id, body);
	};
	makeStar("rigil");
	makeStar("toliman");
	makeStar("proxima");

	for (const spec of WORLDS) {
		const node = new TransformNode(spec.id, scene);
		node.parent = anchorOf(spec.parent);
		const mesh = MeshBuilder.CreateSphere(spec.id, { diameter: spec.diameter, segments: spec.giant ? 96 : 32 }, scene);
		const material = spec.giant ? giantMaterial(scene, spec, spec.giant) : worldMaterial(scene, spec);
		mesh.material = material;
		mesh.isPickable = false;
		let ringMaterial: ShaderMaterial | null = null;
		if (spec.giant) {
			// Planet and ring share one tilted frame, so the belts run parallel to the rings.
			const frame = new TransformNode(`${spec.id}-frame`, scene);
			frame.parent = node;
			frame.rotation.x = spec.ring?.tilt ?? 0;
			mesh.parent = frame;
			if (spec.ring) {
				ringMaterial = buildGiantRing(scene, spec, spec.ring, frame);
			}
		} else {
			mesh.parent = node;
			if (spec.ring) {
				buildRing(scene, spec.id, node, spec.ring);
			}
		}
		const parentNode = anchorOf(spec.parent);
		const scope = spec.parent === null || spec.parent === "system" ? "system" : STARS.has(spec.parent) ? spec.parent : spec.parent;
		if (!MOONS.has(spec.id)) {
			addLine(
				`${spec.id}-path`,
				spec.orbit,
				spec.tilt,
				new Color3(spec.colorA[0], spec.colorA[1], spec.colorA[2]),
				orbitStyle(spec.id) === "dashed",
				parentNode,
				scope,
				1
			);
		}
		bodies.set(spec.id, {
			id: spec.id,
			node,
			mesh,
			radius: spec.diameter / 2,
			parent: spec.parent,
			orbit: spec.orbit,
			period: spec.period,
			phase: spec.phase,
			tilt: spec.tilt,
			spin: spec.spin,
			material,
			ringMaterial,
			turnsInShader: Boolean(spec.giant),
			light: spec.light,
		});
	}

	const into = new Vector3();
	const keyDelta = new Vector3();
	const fillDelta = new Vector3();
	const rigilAt = new Vector3();
	const tolimanAt = new Vector3();
	const proximaAt = new Vector3();
	const here = new Vector3();
	const placeBody = (body: Body, spun: number) => {
		if (body.orbit === 0) {
			return;
		}
		const angle = body.phase + (Math.PI * 2 * spun) / body.period;
		const point = tilted(body.orbit, angle, body.tilt);
		body.node.position.set(point.x, point.y, point.z);
	};

	const worldOf = (node: TransformNode, out: Vector3) => {
		node.computeWorldMatrix(true);
		return out.copyFrom(node.absolutePosition);
	};

	const starAt: Record<ChartStar, Vector3> = { rigil: rigilAt, toliman: tolimanAt, proxima: proximaAt };
	const applyLight = (material: ShaderMaterial, from: Vector3, light: WorldSpec["light"]) => {
		const ranked = starLight(
			from,
			chartStars(light).map((id) => ({ id, at: starAt[id] }))
		);
		const put = (prefix: "key" | "fill", index: number) => {
			const star = ranked[index];
			if (!star) {
				material.setVector3(`${prefix}Dir`, Vector3.Up());
				material.setColor3(`${prefix}Color`, Color3.White());
				material.setFloat(`${prefix}Reach`, 0);
				return;
			}
			starAt[star.id].subtractToRef(from, prefix === "key" ? keyDelta : fillDelta);
			const delta = prefix === "key" ? keyDelta : fillDelta;
			delta.normalize();
			material.setVector3(`${prefix}Dir`, delta);
			material.setColor3(`${prefix}Color`, STAR_COLOR[star.id]);
			material.setFloat(`${prefix}Reach`, star.reach);
		};
		put("key", 0);
		put("fill", 1);
	};

	let view: ChartView = "system";
	let flight: { from: Pose; started: number; view: ChartView } | null = null;
	let labelOpacity = 1;
	const viewListeners = new Set<(next: ChartView) => void>();
	const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

	const focusNode = (next: ChartView): TransformNode | null => (next === "system" ? null : (bodies.get(next)?.node ?? null));

	const fitDistance = (orbit: number, alpha: number, beta: number, fill: number): number => {
		const aspect = engine.getAspectRatio(camera);
		if (!(aspect > 0) || !(orbit > 0)) {
			return Math.max(orbit * 4, 20);
		}
		const tanVertical = Math.tan(camera.fov / 2) * fill;
		const tanHorizontal = tanVertical * aspect;
		const back = new Vector3(Math.cos(alpha) * Math.sin(beta), Math.cos(beta), Math.sin(alpha) * Math.sin(beta));
		const forward = back.scale(-1);
		const right = Vector3.Cross(Vector3.Up(), forward);
		if (right.lengthSquared() < 1e-8) {
			return orbit * 4;
		}
		right.normalize();
		const up = Vector3.Cross(forward, right);
		const point = new Vector3();
		const fits = (distance: number) => {
			for (let i = 0; i < 48; i++) {
				const angle = (i / 48) * Math.PI * 2;
				point.set(Math.cos(angle) * orbit - back.x * distance, -back.y * distance, Math.sin(angle) * orbit - back.z * distance);
				const depth = Vector3.Dot(point, forward);
				if (
					depth <= 0 ||
					Math.abs(Vector3.Dot(point, right)) > depth * tanHorizontal ||
					Math.abs(Vector3.Dot(point, up)) > depth * tanVertical
				) {
					return false;
				}
			}
			return true;
		};
		let near = orbit * 0.25;
		let far = orbit * 24;
		for (let i = 0; i < 28; i++) {
			const middle = (near + far) / 2;
			if (fits(middle)) {
				far = middle;
			} else {
				near = middle;
			}
		}
		return far;
	};

	const poseFor = (next: ChartView): Pose => {
		const shot = framing(next);
		const node = focusNode(next);
		const target = node ? worldOf(node, into).clone() : Vector3.Zero();
		return {
			alpha: shot.alpha,
			beta: shot.beta,
			radius: fitDistance(shot.radius, shot.alpha, shot.beta, shot.fill),
			target,
		};
	};

	const applyLimits = (next: ChartView, radius: number) => {
		camera.lowerRadiusLimit = next === "system" ? radius * 0.22 : radius * 0.42;
		camera.upperRadiusLimit = next === "system" ? radius * 1.65 : radius;
	};

	const emit = () => {
		for (const listener of viewListeners) {
			listener(view);
		}
	};

	const go = (next: ChartView) => {
		if (next === view && !flight) {
			return;
		}
		view = next;
		const goal = poseFor(next);
		if (reduced) {
			camera.alpha = goal.alpha;
			camera.beta = goal.beta;
			camera.radius = goal.radius;
			camera.target.copyFrom(goal.target);
			applyLimits(next, goal.radius);
			flight = null;
			labelOpacity = 1;
		} else {
			flight = {
				from: { alpha: camera.alpha, beta: camera.beta, radius: camera.radius, target: camera.target.clone() },
				started: performance.now(),
				view: next,
			};
			camera.lowerRadiusLimit = 0.5;
			camera.upperRadiusLimit = 8000;
			labelOpacity = 0;
		}
		showLines(next);
		emit();
	};

	const showLines = (next: ChartView) => {
		for (const line of lines) {
			line.mesh.alpha = lineVisibility(line.scope, next) * line.dim;
			line.mesh.isVisible = line.mesh.alpha > 0.02;
		}
	};

	scene.onBeforeRenderObservable.add(() => {
		followSky(camera);
		const now = Date.now();
		const days = daysSinceJ2000(now);
		const pair = binaryPlaces(binaryMeanAnomaly(days));
		const rigil = bodies.get("rigil");
		const toliman = bodies.get("toliman");
		const proxima = bodies.get("proxima");
		if (!rigil || !toliman || !proxima) {
			return;
		}
		rigil.node.position.set(pair.rigil.x, pair.rigil.y, pair.rigil.z);
		toliman.node.position.set(pair.toliman.x, pair.toliman.y, pair.toliman.z);
		const proximaPoint = proximaPlace();
		proxima.node.position.set(proximaPoint.x, proximaPoint.y, proximaPoint.z);
		const spun = chartDays(now);
		for (const body of bodies.values()) {
			placeBody(body, spun);
			if (body.turnsInShader && body.material) {
				// Wrapped here: a float uniform cannot hold a turn count this large.
				body.material.setFloat("turn", (spun * body.spin) % (Math.PI * 2));
			} else {
				body.mesh.rotation.y = spun * body.spin;
			}
		}
		worldOf(rigil.node, rigilAt);
		worldOf(toliman.node, tolimanAt);
		worldOf(proxima.node, proximaAt);
		for (const body of bodies.values()) {
			if (!body.material) {
				continue;
			}
			const at = worldOf(body.node, here);
			if (body.light === "none") {
				continue;
			}
			for (const material of body.ringMaterial ? [body.material, body.ringMaterial] : [body.material]) {
				applyLight(material, at, body.light);
			}
		}
		if (flight) {
			const t = Math.min(1, (performance.now() - flight.started) / (FLIGHT_SECONDS * 1000));
			const eased = t * t * (3 - 2 * t);
			const goal = poseFor(flight.view);
			camera.alpha = lerpAngle(flight.from.alpha, goal.alpha, eased);
			camera.beta = flight.from.beta + (goal.beta - flight.from.beta) * eased;
			camera.radius = flight.from.radius + (goal.radius - flight.from.radius) * eased;
			Vector3.LerpToRef(flight.from.target, goal.target, eased, camera.target);
			labelOpacity = t < 0.62 ? 0 : (t - 0.62) / 0.38;
			if (t >= 1) {
				applyLimits(flight.view, goal.radius);
				flight = null;
				labelOpacity = 1;
			}
		} else {
			const node = focusNode(view);
			if (node) {
				camera.target.copyFrom(worldOf(node, into));
			}
		}
	});

	const projected = new Vector3();
	const project = (world: Vector3) => {
		const viewport = camera.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight);
		Vector3.ProjectToRef(world, Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport, projected);
		return projected.z >= 0 && projected.z <= 1;
	};

	const pickBody = (x: number, y: number): string | null => {
		if (flight) {
			return null;
		}
		let best: string | null = null;
		let bestDepth = Infinity;
		const named = new Set<string>(namedOn(view));
		for (const body of bodies.values()) {
			if (!named.has(body.id)) {
				continue;
			}
			const world = worldOf(body.node, into);
			if (!project(world)) {
				continue;
			}
			const depth = Math.max(0.001, Vector3.Distance(camera.globalPosition, world));
			const pixels = (body.radius / (depth * Math.tan(camera.fov / 2))) * (canvas.clientHeight / 2);
			const reach = Math.max(18, pixels);
			if (Math.hypot(projected.x - x, projected.y - y) > reach) {
				continue;
			}
			if (depth < bestDepth) {
				best = body.id;
				bestDepth = depth;
			}
		}
		return best;
	};
	const picker = trackPicks(canvas, scene, pickBody, (id) => {
		if (isChartBody(id)) {
			go(id);
		}
	});

	const labelListeners = new Set<(frame: LabelFrame) => void>();
	const anchorAt = new Vector3();
	scene.onAfterRenderObservable.add(() => {
		const hovered = picker.update();
		if (labelListeners.size === 0) {
			return;
		}
		const named = namedOn(view);
		const focus = focusNode(view);
		const origin = focus ? worldOf(focus, anchorAt) : Vector3.Zero();
		const originOnScreen = project(origin);
		const center = originOnScreen ? { x: projected.x, y: projected.y } : { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 };
		const anchors: LabelAnchor[] = [];
		for (const id of named) {
			const body = bodies.get(id);
			if (!body) {
				continue;
			}
			const world = worldOf(body.node, into);
			if (!project(world)) {
				continue;
			}
			const depth = Math.max(0.001, Vector3.Distance(camera.globalPosition, world));
			const pixels = (body.radius / (depth * Math.tan(camera.fov / 2))) * (canvas.clientHeight / 2);
			anchors.push({
				id,
				x: projected.x,
				y: projected.y,
				radius: Math.max(4, pixels),
				away: awayFrom(center, projected.x, projected.y),
			});
		}
		const frame: LabelFrame = { anchors, hovered, opacity: labelOpacity };
		for (const listener of labelListeners) {
			listener(frame);
		}
	});

	showLines("system");
	const opening = poseFor("system");
	camera.alpha = opening.alpha;
	camera.beta = opening.beta;
	camera.radius = opening.radius;
	camera.target.copyFrom(opening.target);
	applyLimits("system", opening.radius);

	return {
		onLabels(listener) {
			labelListeners.add(listener);
			return () => {
				labelListeners.delete(listener);
			};
		},
		onView(listener) {
			listener(view);
			viewListeners.add(listener);
			return () => {
				viewListeners.delete(listener);
			};
		},
		go,
	};
}

function framing(view: ChartView): { alpha: number; beta: number; radius: number; fill: number } {
	if (view === "system") {
		return { alpha: -Math.PI / 2, beta: 0.34, radius: PROXIMA_AXIS, fill: 1.35 };
	}
	const spec = WORLDS.find((world) => world.id === view);
	const children = WORLDS.filter((world) => world.parent === view);
	let radius: number;
	if (children.length > 0) {
		radius = Math.max(...children.map((child) => child.orbit)) * 1.28;
	} else if (spec?.ring) {
		radius = spec.ring.outer * 1.35;
	} else if (spec) {
		radius = spec.diameter * 1.8;
	} else {
		radius = STAR_DIAMETER[view as "rigil" | "toliman" | "proxima"] * 2;
	}
	const star = STARS.has(view);
	const alpha = view === "toliman" ? 2.1 : view === "proxima" ? -0.7 : view === "rigil" ? 0.45 : 0.3;
	return { alpha, beta: star ? 0.58 : 0.9, radius, fill: star ? 1.15 : 1.05 };
}

function lineVisibility(scope: string, view: ChartView): number {
	if (view === "system") {
		if (scope === "system") {
			return 1;
		}
		if (scope === "rigil" || scope === "toliman" || scope === "proxima") {
			return 0.4;
		}
		return 0;
	}
	if (STARS.has(view)) {
		return scope === view ? 1 : 0;
	}
	return 0;
}

function isChartBody(id: string): id is Exclude<ChartView, "system"> {
	return id in LABEL;
}

function lerpAngle(from: number, to: number, t: number): number {
	const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
	return from + delta * t;
}

const WORLD_VERTEX = `
	precision highp float;
	attribute vec3 position;
	attribute vec3 normal;
	uniform mat4 world;
	uniform mat4 worldViewProjection;
	varying vec3 vNormalW;
	varying vec3 vLocal;
	void main() {
		vLocal = normalize(position);
		vNormalW = normalize((world * vec4(normal, 0.0)).xyz);
		gl_Position = worldViewProjection * vec4(position, 1.0);
	}
`;

const WORLD_FRAGMENT = `
	precision highp float;
	varying vec3 vNormalW;
	varying vec3 vLocal;
	uniform vec3 colorA;
	uniform vec3 colorB;
	uniform float bands;
	uniform float spots;
	uniform float seed;
	uniform vec3 keyDir;
	uniform vec3 keyColor;
	uniform float keyReach;
	uniform vec3 fillDir;
	uniform vec3 fillColor;
	uniform float fillReach;
	float hash(vec3 p) {
		return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)) + seed) * 43758.5453);
	}
	void main() {
		float band = 0.5 + 0.5 * sin(vLocal.y * bands + seed);
		vec3 albedo = mix(colorA, colorB, clamp(band, 0.0, 1.0));
		float speck = smoothstep(0.62, 0.9, hash(floor(vLocal * 22.0 + seed)));
		float fine = smoothstep(0.72, 0.95, hash(floor(vLocal * 46.0)));
		albedo = mix(albedo, colorB, max(speck, fine * 0.6) * spots);
		vec3 n = normalize(vNormalW);
		float key = clamp(dot(n, normalize(keyDir)), 0.0, 1.0);
		float fill = clamp(dot(n, normalize(fillDir)), 0.0, 1.0);
		vec3 lit = albedo * (0.34 + keyColor * key * keyReach + fillColor * fill * fillReach);
		gl_FragColor = vec4(lit, 1.0);
	}
`;

function worldMaterial(scene: Scene, spec: WorldSpec): ShaderMaterial {
	const material = new ShaderMaterial(
		spec.id,
		scene,
		{ vertexSource: WORLD_VERTEX, fragmentSource: WORLD_FRAGMENT },
		{
			attributes: ["position", "normal"],
			uniforms: [
				"world",
				"worldViewProjection",
				"colorA",
				"colorB",
				"bands",
				"spots",
				"seed",
				"keyDir",
				"keyColor",
				"keyReach",
				"fillDir",
				"fillColor",
				"fillReach",
			],
		}
	);
	material.setColor3("colorA", new Color3(spec.colorA[0], spec.colorA[1], spec.colorA[2]));
	material.setColor3("colorB", new Color3(spec.colorB[0], spec.colorB[1], spec.colorB[2]));
	material.setFloat("bands", spec.bands);
	material.setFloat("spots", spec.spots);
	material.setFloat("seed", spec.seed);
	material.setVector3("keyDir", Vector3.Up());
	material.setColor3("keyColor", Color3.White());
	material.setFloat("keyReach", 0);
	material.setVector3("fillDir", Vector3.Up());
	material.setColor3("fillColor", Color3.White());
	material.setFloat("fillReach", 0);
	material.backFaceCulling = true;
	return material;
}

/**
 * Ring structure, shared by the ring and by the planet that wears its shadow.
 * `u` runs 0 to 1 from the ring's inner edge to its outer edge. The layout follows a real ring
 * system: a thin dusty inner ring, a dense bright ring, an empty division, a thinner outer ring with
 * one narrow gap, and ringlets that grade from broad to fine.
 */
const RING_GLSL = `
	float rHash(float x) {
		return fract(sin(x * 12.9898 + 4.1414) * 43758.5453);
	}
	float rNoise(float x) {
		float i = floor(x);
		float f = fract(x);
		f = f * f * (3.0 - 2.0 * f);
		return mix(rHash(i), rHash(i + 1.0), f);
	}
	float ringOpacity(float u) {
		float body = 0.17;
		body = mix(body, 0.88, smoothstep(0.17, 0.23, u));
		body = mix(body, 0.04, smoothstep(0.57, 0.61, u));
		body = mix(body, 0.62, smoothstep(0.66, 0.69, u));
		body *= smoothstep(0.0, 0.03, u);
		body *= 1.0 - smoothstep(0.965, 1.0, u);
		float gap = 1.0 - smoothstep(0.004, 0.012, abs(u - 0.925));
		body *= 1.0 - 0.95 * gap;
		float thin = smoothstep(0.12, 0.2, rNoise(u * 150.0 + 7.0));
		body *= mix(0.55, 1.0, thin);
		float fine = rNoise(u * 40.0) * 0.5 + rNoise(u * 110.0) * 0.38 + rNoise(u * 230.0) * 0.12;
		return clamp(body * (0.6 + 0.8 * fine), 0.0, 0.97);
	}
	vec3 ringColor(float u) {
		vec3 inner = vec3(0.3, 0.28, 0.26);
		vec3 dense = vec3(0.8, 0.75, 0.67);
		vec3 outer = vec3(0.68, 0.65, 0.6);
		vec3 color = mix(inner, dense, smoothstep(0.17, 0.23, u));
		color = mix(color, outer, smoothstep(0.6, 0.68, u));
		return color * (0.82 + 0.36 * rNoise(u * 55.0 + 3.0));
	}
`;

const GIANT_VERTEX = `
	precision highp float;
	attribute vec3 position;
	uniform mat4 world;
	uniform mat4 worldView;
	uniform mat4 worldViewProjection;
	uniform vec3 keyDir;
	uniform vec3 fillDir;
	varying vec3 vLocal;
	varying vec3 vNormalV;
	varying vec3 vPositionV;
	varying vec3 vKeyL;
	varying vec3 vFillL;
	void main() {
		// Light in the planet's own frame, where the ring plane is y = 0. The mesh is never rotated, so
		// the world matrix is the ring's tilt and nothing else.
		mat3 frame = mat3(world[0].xyz, world[1].xyz, world[2].xyz);
		vLocal = normalize(position);
		vKeyL = keyDir * frame;
		vFillL = fillDir * frame;
		vPositionV = (worldView * vec4(position, 1.0)).xyz;
		vNormalV = mat3(worldView[0].xyz, worldView[1].xyz, worldView[2].xyz) * vLocal;
		gl_Position = worldViewProjection * vec4(position, 1.0);
	}
`;

/**
 * Cloud tops of a cold giant.
 *
 * Zones and belts are a latitude profile of mixed scales, not a sine, so widths are uneven. The
 * profile is pushed sideways by turbulent noise, which is what roughens a belt's edge. Streaks are
 * stretched along the flow, eddies gather where a belt meets a zone, and one long-lived storm sits
 * in a belt with a pale collar. The poles go cooler and hazier. The limb darkens and the lit limb
 * picks up a thin haze. The terminator is soft, as it is where light scatters through a deep
 * atmosphere. The ring throws its shadow across the globe.
 */
const GIANT_FRAGMENT = `
	precision highp float;
	varying vec3 vLocal;
	varying vec3 vNormalV;
	varying vec3 vPositionV;
	varying vec3 vKeyL;
	varying vec3 vFillL;
	uniform vec3 zone;
	uniform vec3 zoneShade;
	uniform vec3 belt;
	uniform vec3 beltDeep;
	uniform vec3 polar;
	uniform vec3 haze;
	uniform vec3 storm;
	uniform float seed;
	uniform float turn;
	uniform float ringInner;
	uniform float ringOuter;
	uniform vec3 keyColor;
	uniform float keyReach;
	uniform vec3 fillColor;
	uniform float fillReach;
	${RING_GLSL}
	float hash(vec3 p) {
		p = fract(p * 0.3183099 + 0.1);
		p *= 17.0;
		return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
	}
	float noise(vec3 x) {
		vec3 i = floor(x);
		vec3 f = fract(x);
		f = f * f * (3.0 - 2.0 * f);
		return mix(
			mix(mix(hash(i), hash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
			mix(mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
			f.z
		);
	}
	float fbm(vec3 p) {
		float sum = 0.0;
		float amp = 0.5;
		for (int i = 0; i < 4; i++) {
			sum += amp * noise(p);
			p = p * 2.03 + 17.1;
			amp *= 0.5;
		}
		return sum / 0.9375;
	}
	// 1 at the center of an oval, falling past 1 outside its edge.
	float oval(float lat, float lon, float lat0, float lon0, float rx, float ry, out vec2 d) {
		float dl = atan(sin(lon - lon0), cos(lon - lon0)) * cos(lat0);
		d = vec2(dl / rx, (lat - lat0) / ry);
		return dot(d, d);
	}
	float ringShadow(vec3 point, vec3 toLight) {
		if (ringOuter <= ringInner || abs(toLight.y) < 0.02) {
			return 1.0;
		}
		float t = -point.y / toLight.y;
		if (t <= 0.0) {
			return 1.0;
		}
		vec3 hit = point + toLight * t;
		float u = (length(hit.xz) - ringInner) / (ringOuter - ringInner);
		if (u <= 0.0 || u >= 1.0) {
			return 1.0;
		}
		return 1.0 - 0.9 * ringOpacity(u) * smoothstep(0.02, 0.14, abs(toLight.y));
	}
	void main() {
		float c = cos(turn);
		float s = sin(turn);
		vec3 p = vec3(c * vLocal.x + s * vLocal.z, vLocal.y, -s * vLocal.x + c * vLocal.z);
		float lat = asin(clamp(p.y, -1.0, 1.0));
		float lon = atan(p.z, p.x);
		float polarness = smoothstep(0.8, 1.3, abs(lat));

		float shear = fbm(vec3(p.x * 2.6, p.z * 2.6, lat * 6.0 + seed)) - 0.5;
		float aw = lat + shear * 0.1 * (1.0 - polarness);
		float profile = 0.52 * noise(vec3(aw * 4.2, seed * 1.7, 0.5))
			+ 0.3 * noise(vec3(aw * 9.5, seed * 2.3, 1.5))
			+ 0.18 * noise(vec3(aw * 21.0, seed * 3.1, 2.5));
		float beltness = smoothstep(0.4, 0.6, profile);
		float edge = 4.0 * beltness * (1.0 - beltness);

		float streak = noise(vec3(p.x * 3.0, p.z * 3.0, aw * 52.0 + seed));
		float fineStreak = noise(vec3(p.x * 6.5, p.z * 6.5, aw * 125.0));
		float eddy = fbm(vec3(p.x * 10.0, p.z * 10.0, aw * 30.0 + seed * 2.0));

		vec3 zoneColor = mix(zoneShade, zone, smoothstep(0.25, 0.75, streak));
		vec3 beltColor = mix(beltDeep, belt, smoothstep(0.2, 0.8, fineStreak));
		vec3 color = mix(zoneColor, beltColor, beltness);
		color *= mix(1.0, 0.72 + 0.62 * eddy, edge * 0.85);
		color *= 0.93 + 0.14 * fineStreak;

		vec2 d;
		float e = oval(lat, lon, -0.36, 1.15, 0.34, 0.12, d);
		float whorl = 0.5 + 0.5 * sin(atan(d.y, d.x) * 2.0 - length(d) * 5.5 + 2.5 * noise(vec3(d * 2.2, seed)));
		color = mix(color, mix(storm * 0.82, storm * 1.12, whorl), (1.0 - smoothstep(0.4, 1.0, e)) * 0.88);
		color = mix(color, zone, smoothstep(0.85, 1.2, e) * (1.0 - smoothstep(1.2, 2.0, e)) * 0.38);
		float e2 = oval(lat, lon, 0.52, -2.1, 0.11, 0.05, d);
		color = mix(color, zone * 1.08, (1.0 - smoothstep(0.35, 1.0, e2)) * 0.8);

		color = mix(color, polar * (0.82 + 0.36 * noise(vec3(p.x * 4.0, p.z * 4.0, lat * 18.0))), polarness * 0.72);
		color = mix(color, haze, 0.14);

		vec3 view = normalize(-vPositionV);
		float mu = clamp(dot(normalize(vNormalV), view), 0.0, 1.0);
		float limb = 0.64 + 0.36 * pow(mu, 0.5);

		vec3 toKey = normalize(vKeyL);
		vec3 toFill = normalize(vFillL);
		float key = pow(clamp((dot(vLocal, toKey) + 0.12) / 1.12, 0.0, 1.0), 0.85);
		float fill = pow(clamp((dot(vLocal, toFill) + 0.12) / 1.12, 0.0, 1.0), 0.85);
		vec3 light = vec3(0.11, 0.115, 0.135)
			+ keyColor * key * keyReach * ringShadow(vLocal, toKey)
			+ fillColor * fill * fillReach * ringShadow(vLocal, toFill);
		vec3 rim = haze * pow(1.0 - mu, 3.0) * 0.4 * clamp(key * keyReach + fill * fillReach * 0.6, 0.0, 1.0);
		gl_FragColor = vec4(color * limb * light + rim, 1.0);
	}
`;

const RING_VERTEX = `
	precision highp float;
	attribute vec3 position;
	uniform mat4 world;
	uniform mat4 worldViewProjection;
	uniform vec3 keyDir;
	uniform vec3 fillDir;
	varying vec2 vPlane;
	varying vec3 vKeyL;
	varying vec3 vFillL;
	void main() {
		// Light in the ring's own frame: the disc is z = 0 and the planet sits at the origin.
		mat3 frame = mat3(world[0].xyz, world[1].xyz, world[2].xyz);
		vPlane = position.xy;
		vKeyL = keyDir * frame;
		vFillL = fillDir * frame;
		gl_Position = worldViewProjection * vec4(position, 1.0);
	}
`;

/**
 * Light that reaches the ring, from one star. A ring seen at a shallow angle by the star is dim, and
 * the planet's shadow cuts across the side facing away from it.
 */
const RING_FRAGMENT = `
	precision highp float;
	varying vec2 vPlane;
	varying vec3 vKeyL;
	varying vec3 vFillL;
	uniform vec3 tint;
	uniform float planetRadius;
	uniform float ringInner;
	uniform float ringOuter;
	uniform vec3 keyColor;
	uniform float keyReach;
	uniform vec3 fillColor;
	uniform float fillReach;
	${RING_GLSL}
	float reach(vec3 at, vec3 toLight) {
		float b = dot(at, toLight);
		float miss = sqrt(max(dot(at, at) - b * b, 0.0));
		float shadow = b < 0.0 ? smoothstep(0.93, 1.07, miss) : 1.0;
		return mix(0.16, 1.0, smoothstep(0.02, 0.55, abs(toLight.z))) * shadow;
	}
	void main() {
		vec2 q = vPlane / planetRadius;
		float u = (length(q) - ringInner) / (ringOuter - ringInner);
		if (u <= 0.0 || u >= 1.0) {
			discard;
		}
		float alpha = ringOpacity(u);
		if (alpha < 0.01) {
			discard;
		}
		vec3 at = vec3(q, 0.0);
		vec3 light = vec3(0.06, 0.062, 0.07)
			+ keyColor * keyReach * reach(at, normalize(vKeyL))
			+ fillColor * fillReach * reach(at, normalize(vFillL));
		gl_FragColor = vec4(ringColor(u) * tint * light, alpha);
	}
`;

const STAR_UNIFORMS = ["keyDir", "keyColor", "keyReach", "fillDir", "fillColor", "fillReach"];

/** Sets the lights to none, so a world is dark until the render loop aims it. */
function darkStars(material: ShaderMaterial): void {
	material.setVector3("keyDir", Vector3.Up());
	material.setColor3("keyColor", Color3.White());
	material.setFloat("keyReach", 0);
	material.setVector3("fillDir", Vector3.Up());
	material.setColor3("fillColor", Color3.White());
	material.setFloat("fillReach", 0);
}

function giantMaterial(scene: Scene, spec: WorldSpec, colors: GiantPalette): ShaderMaterial {
	const material = new ShaderMaterial(
		spec.id,
		scene,
		{ vertexSource: GIANT_VERTEX, fragmentSource: GIANT_FRAGMENT },
		{
			attributes: ["position"],
			uniforms: [
				"world",
				"worldView",
				"worldViewProjection",
				"zone",
				"zoneShade",
				"belt",
				"beltDeep",
				"polar",
				"haze",
				"storm",
				"seed",
				"turn",
				"ringInner",
				"ringOuter",
				...STAR_UNIFORMS,
			],
		}
	);
	const color = (rgb: Rgb) => new Color3(rgb[0], rgb[1], rgb[2]);
	const radius = spec.diameter / 2;
	material.setColor3("zone", color(colors.zone));
	material.setColor3("zoneShade", color(colors.zoneShade));
	material.setColor3("belt", color(colors.belt));
	material.setColor3("beltDeep", color(colors.beltDeep));
	material.setColor3("polar", color(colors.polar));
	material.setColor3("haze", color(colors.haze));
	material.setColor3("storm", color(colors.storm));
	material.setFloat("seed", spec.seed);
	material.setFloat("turn", 0);
	// In planet radii, so the shadow the ring throws lines up with the ring that is drawn.
	material.setFloat("ringInner", spec.ring ? spec.ring.inner / radius : 0);
	material.setFloat("ringOuter", spec.ring ? spec.ring.outer / radius : 0);
	darkStars(material);
	material.backFaceCulling = true;
	return material;
}

/**
 * A ring that blocks and takes light. It blends over the world behind it rather than adding to it,
 * so a dense band hides the planet and a dusty one dims it. Returns the material so the render loop
 * can aim the stars at it.
 */
function buildGiantRing(scene: Scene, spec: WorldSpec, ring: NonNullable<WorldSpec["ring"]>, frame: TransformNode): ShaderMaterial {
	const radius = spec.diameter / 2;
	const plane = MeshBuilder.CreatePlane(`${spec.id}-ring-disc`, { size: ring.outer * 2.1 }, scene);
	plane.parent = frame;
	plane.rotation.x = Math.PI / 2;
	const material = new ShaderMaterial(
		`${spec.id}-ring`,
		scene,
		{ vertexSource: RING_VERTEX, fragmentSource: RING_FRAGMENT },
		{
			attributes: ["position"],
			uniforms: ["world", "worldViewProjection", "tint", "planetRadius", "ringInner", "ringOuter", ...STAR_UNIFORMS],
			needAlphaBlending: true,
		}
	);
	material.setColor3("tint", new Color3(ring.color[0], ring.color[1], ring.color[2]));
	material.setFloat("planetRadius", radius);
	material.setFloat("ringInner", ring.inner / radius);
	material.setFloat("ringOuter", ring.outer / radius);
	darkStars(material);
	material.alphaMode = Constants.ALPHA_COMBINE;
	material.backFaceCulling = false;
	material.disableDepthWrite = true;
	plane.material = material;
	plane.isPickable = false;
	return material;
}

function buildCorona(scene: Scene, name: string, diameter: number, color: Color3): Mesh {
	const starRadius = diameter / 2;
	// Wider than the halo. A circle drawn on the plane sits inside the limb once the camera is close,
	// because perspective pushes the silhouette outside that circle. The glow is measured from the
	// line of sight instead, the way Sol's corona is.
	const corona = MeshBuilder.CreatePlane(`${name}-corona`, { size: diameter * 8 }, scene);
	const material = new ShaderMaterial(
		`${name}-corona`,
		scene,
		{
			vertexSource: `
				precision highp float;
				attribute vec3 position;
				uniform mat4 world;
				uniform mat4 worldViewProjection;
				varying vec3 vPositionW;
				void main() {
					vec4 worldPos = world * vec4(position, 1.0);
					vPositionW = worldPos.xyz;
					gl_Position = worldViewProjection * vec4(position, 1.0);
				}
			`,
			fragmentSource: `
				precision highp float;
				uniform vec3 eye;
				uniform vec3 starCenter;
				uniform float starRadius;
				uniform float haloWidth;
				uniform vec3 glowColor;
				varying vec3 vPositionW;
				void main() {
					vec3 ray = normalize(vPositionW - eye);
					float impact = length(cross(starCenter - eye, ray));
					float beyond = impact - starRadius;
					if (beyond <= 0.0) {
						gl_FragColor = vec4(0.0);
						return;
					}
					float t = clamp(beyond / haloWidth, 0.0, 1.0);
					float glow = exp(-t * 2.6);
					if (glow < 0.04) {
						discard;
					}
					gl_FragColor = vec4(glowColor * glow, glow);
				}
			`,
		},
		{
			attributes: ["position"],
			uniforms: ["world", "worldViewProjection", "eye", "starCenter", "starRadius", "haloWidth", "glowColor"],
			needAlphaBlending: true,
		}
	);
	material.setColor3("glowColor", color);
	material.setFloat("starRadius", starRadius);
	material.setFloat("haloWidth", starRadius * 2.6);
	material.alphaMode = Constants.ALPHA_ADD;
	material.backFaceCulling = false;
	material.disableDepthWrite = true;
	material.onBindObservable.add(() => {
		const effect = material.getEffect();
		if (!effect) {
			return;
		}
		scene.bindEyePosition(effect, "eye", true);
		const center = corona.getAbsolutePosition();
		const offset = scene.floatingOriginOffset;
		effect.setFloat3("starCenter", center.x - offset.x, center.y - offset.y, center.z - offset.z);
	});
	corona.material = material;
	corona.billboardMode = Mesh.BILLBOARDMODE_ALL;
	corona.isPickable = false;
	return corona;
}

function buildRing(scene: Scene, name: string, parent: TransformNode, ring: NonNullable<WorldSpec["ring"]>): void {
	const hinge = new TransformNode(`${name}-ring`, scene);
	hinge.parent = parent;
	hinge.rotation.x = ring.tilt;
	const size = ring.outer * 2.3;
	const plane = MeshBuilder.CreatePlane(`${name}-ring-disc`, { size }, scene);
	plane.parent = hinge;
	plane.rotation.x = Math.PI / 2;
	const material = new ShaderMaterial(
		`${name}-ring`,
		scene,
		{
			vertexSource: `
				precision highp float;
				attribute vec3 position;
				uniform mat4 worldViewProjection;
				varying vec2 vPlane;
				void main() {
					vPlane = position.xy;
					gl_Position = worldViewProjection * vec4(position, 1.0);
				}
			`,
			fragmentSource: `
				precision highp float;
				varying vec2 vPlane;
				uniform vec3 color;
				uniform float inner;
				uniform float outer;
				void main() {
					float radius = length(vPlane);
					float band = smoothstep(inner, inner + 0.35, radius) * (1.0 - smoothstep(outer - 0.45, outer, radius));
					float lanes = 0.62 + 0.38 * sin(radius * 2.4);
					gl_FragColor = vec4(color * lanes, band * 0.85);
				}
			`,
		},
		{
			attributes: ["position"],
			uniforms: ["worldViewProjection", "color", "inner", "outer"],
			needAlphaBlending: true,
		}
	);
	material.setColor3("color", new Color3(ring.color[0], ring.color[1], ring.color[2]));
	material.setFloat("inner", ring.inner);
	material.setFloat("outer", ring.outer);
	material.alphaMode = Constants.ALPHA_ADD;
	material.backFaceCulling = false;
	material.disableDepthWrite = true;
	plane.material = material;
	plane.isPickable = false;
}

/**
 * Alpha Centauri's sky, so it does not wear Sol's cool band.
 * The band crosses the charts. A copper cloud sits right of the opening view, an ion wisp to its left,
 * a second copper cloud by Toliman, and a nitrogen cloud by Rigil. The field stays black.
 *
 * Three plates. Stars are farthest and barely slip. The band is between. The clouds are nearest,
 * so a pan or a zoom carries them farther than the stars behind them.
 */
const VEIL_POLE = new Vector3(0.816, -0.157, 0.556).normalize();
const COPPER_AT = new Vector3(0.321, -0.91, 0.262).normalize();
const COPPER_TRAIL = new Vector3(0.034, -0.805, -0.592).normalize();
const ION_AT = new Vector3(-0.367, -0.817, 0.445).normalize();
const NITROGEN_AT = new Vector3(-0.592, -0.805, 0.013).normalize();
const SKY_RADIUS = 6000;
const FIELD_STARS = 2200;
const BAND_STARS = 1100;
const KNOT_STARS = 280;
/** Share of a pan, and of a zoom, that a plate takes. Far is slow. Near is quick. */
const SKY_FAR = { pan: 0.06, zoom: 0.08 };
const SKY_MID = { pan: 0.32, zoom: 0.28 };
const SKY_NEAR = { pan: 0.62, zoom: 0.5 };

const PARALLAX_GLSL = `
	uniform vec3 camRight;
	uniform vec3 camUp;
	uniform vec3 camForward;
	uniform vec2 shift;
	uniform float zoom;
	vec3 parallaxDir(vec3 dir) {
		dir = normalize(dir);
		float x = dot(dir, camRight);
		float y = dot(dir, camUp);
		float z = dot(dir, camForward);
		float mag = max(zoom, 0.25);
		x /= mag;
		y /= mag;
		float cy = cos(shift.x);
		float sy = sin(shift.x);
		float cp = cos(shift.y);
		float sp = sin(shift.y);
		float x2 = cy * x + sy * z;
		float z2 = -sy * x + cy * z;
		float y2 = cp * y + sp * z2;
		float z3 = -sp * y + cp * z2;
		return normalize(camRight * x2 + camUp * y2 + camForward * z3);
	}
`;

const PARALLAX_UNIFORMS = ["camRight", "camUp", "camForward", "shift", "zoom"];

type SkyPlate = { material: ShaderMaterial; pan: number; zoom: number };

function buildSky(scene: Scene): (camera: ArcRotateCamera) => void {
	const plates = [buildSkyStars(scene), buildVeil(scene, "band"), buildVeil(scene, "clouds")];
	const forward = new Vector3();
	const right = new Vector3();
	const up = new Vector3();
	const worldUp = new Vector3(0, 1, 0);
	const shift = new Vector2();
	let rest: { alpha: number; beta: number; radius: number } | null = null;
	return (camera) => {
		if (!rest) {
			rest = { alpha: camera.alpha, beta: camera.beta, radius: Math.max(camera.radius, 1) };
		}
		const alpha = camera.alpha;
		const beta = camera.beta;
		const sinb = Math.sin(beta);
		const cosb = Math.cos(beta);
		forward.set(-Math.cos(alpha) * sinb, -cosb, -Math.sin(alpha) * sinb);
		if (forward.lengthSquared() < 1e-8) {
			forward.set(0, -1, 0);
		} else {
			forward.normalize();
		}
		Vector3.CrossToRef(worldUp, forward, right);
		if (right.lengthSquared() < 1e-6) {
			right.set(1, 0, 0);
		} else {
			right.normalize();
		}
		Vector3.CrossToRef(forward, right, up);
		up.normalize();
		const panX = Math.atan2(Math.sin(alpha - rest.alpha), Math.cos(alpha - rest.alpha));
		const panY = beta - rest.beta;
		const ratio = rest.radius / Math.max(camera.radius, 1);
		for (const plate of plates) {
			shift.set(panX * plate.pan, panY * plate.pan);
			plate.material.setVector3("camRight", right);
			plate.material.setVector3("camUp", up);
			plate.material.setVector3("camForward", forward);
			plate.material.setVector2("shift", shift);
			plate.material.setFloat("zoom", Math.pow(ratio, plate.zoom));
		}
	};
}

function buildVeil(scene: Scene, plate: "band" | "clouds"): SkyPlate {
	const near = plate === "clouds";
	const sky = MeshBuilder.CreateSphere(near ? "alpha-clouds" : "alpha-band", { diameter: SKY_RADIUS * 2.1, segments: 48 }, scene);
	const material = new ShaderMaterial(
		near ? "alpha-clouds" : "alpha-band",
		scene,
		{
			vertexSource: `
				precision highp float;
				attribute vec3 position;
				uniform mat4 worldViewProjection;
				varying vec3 vDirection;
				void main() {
					gl_Position = worldViewProjection * vec4(position, 1.0);
					vDirection = position;
				}
			`,
			fragmentSource: `
				precision highp float;
				uniform vec3 pole;
				uniform vec3 copperAt;
				uniform vec3 copperTrail;
				uniform vec3 ionAt;
				uniform vec3 nitrogenAt;
				uniform vec3 bandColor;
				uniform vec3 copperColor;
				uniform vec3 ionColor;
				uniform vec3 nitrogenColor;
				uniform float plate;
				varying vec3 vDirection;
				${PARALLAX_GLSL}
				float hash(vec3 p) {
					p = fract(p * 0.3183099 + 0.1);
					p *= 17.0;
					return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
				}
				float noise(vec3 x) {
					vec3 i = floor(x);
					vec3 f = fract(x);
					f = f * f * (3.0 - 2.0 * f);
					return mix(
						mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
						mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
						f.z
					);
				}
				float knot(vec3 dir, vec3 at, float reach) {
					float angle = acos(clamp(dot(dir, at), -1.0, 1.0));
					return exp(-angle * angle / reach);
				}
				void main() {
					vec3 dir = parallaxDir(vDirection);
					float across = dot(dir, pole);
					float band = exp(-across * across / 0.05);
					float grain = 0.35 + 0.65 * noise(dir * 3.2);
					float fine = 0.55 + 0.45 * noise(dir * 9.0);
					float lane = smoothstep(0.42, 0.7, noise(dir * 4.5 + 1.4));
					float bandLight = band * grain * fine * (1.0 - 0.75 * lane);
					float copper = knot(dir, copperAt, 0.05) * (0.45 + 0.55 * noise(dir * 5.0));
					copper += knot(dir, copperTrail, 0.055) * (0.4 + 0.6 * noise(dir * 8.0));
					float ion = knot(dir, ionAt, 0.038) * (0.4 + 0.6 * noise(dir * 7.0 + 3.0));
					float nitrogen = knot(dir, nitrogenAt, 0.09) * (0.5 + 0.5 * noise(dir * 3.0));
					vec3 light;
					if (plate > 0.5) {
						light = copperColor * copper * 1.15;
						light += ionColor * ion * 0.95;
						light += nitrogenColor * nitrogen * 0.42;
					} else {
						light = bandColor * bandLight * 0.62;
					}
					gl_FragColor = vec4(light, 1.0);
				}
			`,
		},
		{
			attributes: ["position"],
			uniforms: [
				"worldViewProjection",
				"pole",
				"copperAt",
				"copperTrail",
				"ionAt",
				"nitrogenAt",
				"bandColor",
				"copperColor",
				"ionColor",
				"nitrogenColor",
				"plate",
				...PARALLAX_UNIFORMS,
			],
			needAlphaBlending: true,
		}
	);
	material.setVector3("pole", VEIL_POLE);
	material.setVector3("copperAt", COPPER_AT);
	material.setVector3("copperTrail", COPPER_TRAIL);
	material.setVector3("ionAt", ION_AT);
	material.setVector3("nitrogenAt", NITROGEN_AT);
	material.setColor3("bandColor", Color3.FromHexString(palette.amber));
	material.setColor3("copperColor", Color3.FromHexString(palette.copper));
	material.setColor3("ionColor", Color3.FromHexString(palette.ion));
	material.setColor3("nitrogenColor", Color3.FromHexString(palette.nitrogen));
	material.setFloat("plate", near ? 1 : 0);
	seatParallax(material);
	material.backFaceCulling = false;
	material.alphaMode = Constants.ALPHA_ADD;
	material.disableDepthWrite = true;
	sky.material = material;
	finishSky(sky, near ? 2 : 1);
	return { material, ...(near ? SKY_NEAR : SKY_MID) };
}

function buildSkyStars(scene: Scene): SkyPlate {
	const random = seeded(9);
	const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(Math.PI * 2 * random());
	const inPlane = COPPER_AT.subtract(VEIL_POLE.scale(Vector3.Dot(COPPER_AT, VEIL_POLE))).normalize();
	const side = Vector3.Cross(VEIL_POLE, inPlane).normalize();
	const total = FIELD_STARS + BAND_STARS + KNOT_STARS;
	const positions = new Float32Array(total * 3);
	const colors = new Float32Array(total * 4);
	const sizes = new Float32Array(total);
	const direction = new Vector3();

	for (let i = 0; i < total; i++) {
		if (i < FIELD_STARS) {
			const y = random() * 2 - 1;
			const around = random() * Math.PI * 2;
			const flat = Math.sqrt(1 - y * y);
			direction.set(Math.cos(around) * flat, y, Math.sin(around) * flat);
		} else if (i < FIELD_STARS + BAND_STARS) {
			const along = random() * Math.PI * 2;
			const across = gaussian() * 0.11;
			const ring = Math.cos(across);
			direction
				.copyFrom(inPlane)
				.scaleInPlace(Math.cos(along) * ring)
				.addInPlace(side.scale(Math.sin(along) * ring))
				.addInPlace(VEIL_POLE.scale(Math.sin(across)));
		} else {
			const at = i < FIELD_STARS + BAND_STARS + KNOT_STARS * 0.72 ? COPPER_AT : ION_AT;
			const axis = Math.abs(at.y) < 0.9 ? Vector3.Up() : Vector3.Right();
			const u = Vector3.Cross(at, axis).normalize();
			const v = Vector3.Cross(at, u).normalize();
			direction.copyFrom(at).addInPlace(u.scale(gaussian() * 0.16)).addInPlace(v.scale(gaussian() * 0.16));
		}
		direction.normalize().scaleInPlace(SKY_RADIUS);
		direction.toArray(positions, i * 3);

		const tint = skyTint(random());
		const inKnot = i >= FIELD_STARS + BAND_STARS;
		const bright = inKnot ? 0.55 + 0.45 * random() : 0.28 + 0.72 * Math.pow(random(), 0.85);
		colors.set([tint.r, tint.g, tint.b, 0.28 + 0.72 * bright], i * 4);
		sizes[i] = (inKnot ? 1.8 : 1.1) + (inKnot ? 2.4 : 2.1) * bright * bright;
	}

	const stars = new Mesh("alpha-sky", scene);
	stars.isUnIndexed = true;
	stars.setVerticesData(VertexBuffer.PositionKind, positions, false, 3);
	stars.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
	stars.setVerticesData("starSize", sizes, false, 1);
	const material = new ShaderMaterial(
		"alpha-sky",
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
				${PARALLAX_GLSL}
				void main() {
					vec3 dir = parallaxDir(position);
					gl_Position = worldViewProjection * vec4(dir * length(position), 1.0);
					gl_PointSize = max(starSize * pixelRatio, 1.0);
					vColor = color;
				}
			`,
			fragmentSource: `
				precision highp float;
				varying vec4 vColor;
				void main() {
					float edge = length(gl_PointCoord - 0.5) * 2.0;
					float disc = 1.0 - smoothstep(0.45, 1.0, edge);
					gl_FragColor = vec4(vColor.rgb * vColor.a * disc, 1.0);
				}
			`,
		},
		{
			attributes: ["position", "color", "starSize"],
			uniforms: ["worldViewProjection", "pixelRatio", ...PARALLAX_UNIFORMS],
			needAlphaBlending: true,
		}
	);
	material.setFloat("pixelRatio", typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
	seatParallax(material);
	material.pointsCloud = true;
	material.alphaMode = Constants.ALPHA_ADD;
	material.disableDepthWrite = true;
	stars.material = material;
	finishSky(stars, 0);
	return { material, ...SKY_FAR };
}

/** A plate before the first frame. Shift is none, so the opening view is the one that was drawn. */
function seatParallax(material: ShaderMaterial): void {
	const beta = 0.34;
	const sinb = Math.sin(beta);
	const cosb = Math.cos(beta);
	material.setVector3("camForward", new Vector3(0, -cosb, sinb));
	material.setVector3("camRight", new Vector3(1, 0, 0));
	material.setVector3("camUp", new Vector3(0, sinb, cosb));
	material.setVector2("shift", Vector2.Zero());
	material.setFloat("zoom", 1);
}

/** Bone, then the warm metals, then the two cool colors. The warm share is what separates this sky from Sol. */
function skyTint(pick: number): Color3 {
	if (pick < 0.42) {
		return Color3.FromHexString(palette.bone);
	}
	if (pick < 0.66) {
		return Color3.FromHexString(palette.amber);
	}
	if (pick < 0.84) {
		return Color3.FromHexString(palette.copper);
	}
	if (pick < 0.94) {
		return Color3.FromHexString(palette.ion);
	}
	return Color3.FromHexString(palette.nitrogen);
}

/** Follows the camera, draws before the chart, and is never picked. */
function finishSky(mesh: Mesh, order: number): Mesh {
	mesh.infiniteDistance = true;
	mesh.alphaIndex = order;
	mesh.alwaysSelectAsActiveMesh = true;
	mesh.isPickable = false;
	return mesh;
}

function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (1664525 * state + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

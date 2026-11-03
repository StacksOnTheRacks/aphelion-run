import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { Engine } from "@babylonjs/core/Engines/engine";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Scene } from "@babylonjs/core/scene";

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
 * Real seconds per chart day for worlds and moons. Proxima b's 11-day period then takes a few
 * minutes, long enough to read and short enough to see. The stars do not use this clock.
 */
export const CHART_DAY_SECONDS = 20;

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
	ring?: { inner: number; outer: number; tilt: number; color: Rgb };
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
		colorA: [0.12, 0.72, 0.7],
		colorB: [0.95, 0.78, 0.32],
		bands: 22,
		spots: 0,
		seed: 1.2,
		spin: 2.4,
		light: "pair",
		ring: { inner: 8, outer: 13, tilt: 0.45, color: [0.95, 0.78, 0.38] },
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

/** How far each star's light reaches. The pair's light stops short of Proxima. */
const PAIR_RANGE = 490;
const LOCAL_RANGE = 90;

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

	buildSky(scene);
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
		const mesh = MeshBuilder.CreateSphere(spec.id, { diameter: spec.diameter, segments: 32 }, scene);
		const material = worldMaterial(scene, spec);
		mesh.material = material;
		mesh.isPickable = false;
		mesh.parent = node;
		if (spec.ring) {
			buildRing(scene, spec.id, node, spec.ring);
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

	const aim = (material: ShaderMaterial, prefix: "key" | "fill", from: Vector3, to: Vector3, range: number, color: Color3) => {
		to.subtractToRef(from, prefix === "key" ? keyDelta : fillDelta);
		const delta = prefix === "key" ? keyDelta : fillDelta;
		const distance = delta.length();
		if (distance < 1e-3 || range <= 0) {
			material.setVector3(`${prefix}Dir`, Vector3.Up());
			material.setFloat(`${prefix}Reach`, 0);
			return;
		}
		delta.scaleInPlace(1 / distance);
		material.setVector3(`${prefix}Dir`, delta);
		material.setColor3(`${prefix}Color`, color);
		material.setFloat(`${prefix}Reach`, distance >= range ? 0 : 1 - distance / range);
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
			body.mesh.rotation.y = spun * body.spin;
		}
		worldOf(rigil.node, rigilAt);
		worldOf(toliman.node, tolimanAt);
		worldOf(proxima.node, proximaAt);
		for (const body of bodies.values()) {
			if (!body.material) {
				continue;
			}
			const at = worldOf(body.node, here);
			if (body.light === "pair") {
				aim(body.material, "key", at, rigilAt, PAIR_RANGE, STAR_COLOR.rigil);
				aim(body.material, "fill", at, tolimanAt, PAIR_RANGE, STAR_COLOR.toliman);
			} else if (body.light === "rigil") {
				aim(body.material, "key", at, rigilAt, LOCAL_RANGE, STAR_COLOR.rigil);
				aim(body.material, "fill", at, tolimanAt, PAIR_RANGE, STAR_COLOR.toliman);
			} else if (body.light === "toliman") {
				aim(body.material, "key", at, tolimanAt, LOCAL_RANGE, STAR_COLOR.toliman);
				aim(body.material, "fill", at, rigilAt, PAIR_RANGE, STAR_COLOR.rigil);
			} else if (body.light === "proxima") {
				aim(body.material, "key", at, proximaAt, LOCAL_RANGE, STAR_COLOR.proxima);
				aim(body.material, "fill", at, rigilAt, 0, STAR_COLOR.rigil);
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
		vec3 lit = albedo * (0.34 + keyColor * key * keyReach + fillColor * fill * fillReach * 0.85);
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

function buildCorona(scene: Scene, name: string, diameter: number, color: Color3): Mesh {
	const size = diameter * 5;
	const corona = MeshBuilder.CreatePlane(`${name}-corona`, { size }, scene);
	const material = new ShaderMaterial(
		`${name}-corona`,
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
				uniform vec3 glowColor;
				uniform float inner;
				void main() {
					float radius = length(vPlane);
					if (radius < inner) {
						discard;
					}
					float t = clamp((radius - inner) / (inner * 2.6), 0.0, 1.0);
					float glow = exp(-t * 2.6);
					if (glow < 0.04) {
						discard;
					}
					gl_FragColor = vec4(glowColor * glow, glow);
				}
			`,
		},
		{ attributes: ["position"], uniforms: ["worldViewProjection", "glowColor", "inner"], needAlphaBlending: true }
	);
	material.setColor3("glowColor", color);
	material.setFloat("inner", diameter / 2);
	material.alphaMode = Constants.ALPHA_ADD;
	material.backFaceCulling = false;
	material.disableDepthWrite = true;
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

function buildSky(scene: Scene): Mesh {
	const random = seeded(9);
	const positions: number[] = [];
	const colors: number[] = [];
	const sizes: number[] = [];
	const radius = 6000;
	for (let i = 0; i < 1600; i++) {
		const y = random() * 2 - 1;
		const around = random() * Math.PI * 2;
		const flat = Math.sqrt(1 - y * y);
		positions.push(Math.cos(around) * flat * radius, y * radius, Math.sin(around) * flat * radius);
		const tint = 0.75 + 0.25 * random();
		colors.push(tint, tint * (0.92 + 0.08 * random()), tint, 0.25 + 0.75 * random() * random());
		sizes.push(1 + random() * 1.6);
	}
	const mesh = new Mesh("alpha-sky", scene);
	mesh.isUnIndexed = true;
	mesh.setVerticesData(VertexBuffer.PositionKind, new Float32Array(positions), false, 3);
	mesh.setVerticesData(VertexBuffer.ColorKind, new Float32Array(colors), false, 4);
	mesh.setVerticesData("starSize", new Float32Array(sizes), false, 1);
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
		{
			attributes: ["position", "color", "starSize"],
			uniforms: ["worldViewProjection", "pixelRatio"],
			needAlphaBlending: true,
		}
	);
	material.alphaMode = Constants.ALPHA_ADD;
	material.disableDepthWrite = true;
	material.backFaceCulling = false;
	material.setFloat("pixelRatio", typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
	mesh.material = material;
	mesh.infiniteDistance = true;
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

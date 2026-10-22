import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Constants } from "@babylonjs/core/Engines/constants";
import { Engine } from "@babylonjs/core/Engines/engine";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";

import "@babylonjs/core/Meshes/thinInstanceMesh";

import {
	cameraWorldPosition,
	routeAroundBodies,
	type RingBody,
	type SphereBody,
} from "./camera-path";
import {
	EARTH_STATION_RADIUS,
	EARTH_WAREHOUSE_RADIUS,
	SATURN_RING_INNER_SCALE,
	SATURN_RING_OUTER_SCALE,
	SUN_OUTER_ORBIT,
	moonBases,
	moonOuterOrbitRadius,
	nearBody,
	outerOrbitRadius,
	planetBases,
	type BaseSlot,
	type Faction,
	type PlanetBaseInput,
} from "./bases";
import { daysSinceJ2000, greenwichAngle, moonLongitude, planetLongitude, type EphemerisPlanet } from "./ephemeris";
import { CLIMB_PACE, createJourney, hoverDeparture, type Dock, type Harbor, type JourneyPlan } from "./journey";
import { CHART_LAYER, createCockpit, type PilotViewpoint } from "./cockpit";
import { HULL_LENGTH, loadRanger } from "./ranger";
import { awayFrom, type LabelFrame, type LabelSource } from "./labels";
import type { NavBody, NavFix, NavPoint } from "./nav";
import type { ScanKind, ScanTarget } from "./scan";
import { createMoonTerrain } from "./moon-terrain";
import { trackPicks } from "./pointer";
import { attachChartCamera, nudgeChartZoom, tuneChartCamera, type ZoomDirection } from "./zoom";
import { curveClimbJoin, curveClimbStart, departureSpiral, planRoute, reversalPenalty, tangentHeading } from "./route";

type PlanetName = EphemerisPlanet;

/** A planet or the Sun: `<name>-outer` or `<name>-inner`. */
export type BodyOrbitView = `${PlanetName | "sun"}-${"outer" | "inner"}`;
/** A moon view id is `<planet>-<moon>-outer` or `<planet>-<moon>-inner`. */
export type MoonView = `${PlanetName}-${string}-${"outer" | "inner"}`;
export type DemoView = "system" | BodyOrbitView | MoonView;

type Focus = "sun" | PlanetName | string;

export type ViewStop = { view: DemoView; label: string };
export type ViewSubject = { label: string; stops: ViewStop[] };
export type ViewPlace = { label: string; subjects: ViewSubject[] };

type Shot = {
	focus: Focus;
	alpha: number;
	beta: number;
	radius: number;
	/** When set, distance is chosen so the focus body covers this share of the screen's shorter side. */
	fill?: number;
	/** When set, the camera also stands back far enough to keep a sphere this wide around the focus on screen. */
	reach?: number;
	/** When set, distance is the closest at which a circle this wide around the focus, in the planets' plane, fits the screen. */
	fitOrbit?: number;
	offset?: Vector3;
	/**
	 * Alpha is measured from the side of the body that faces the Sun, and the camera turns with the
	 * body as it orbits, so the day side and the edge of night stay in frame.
	 */
	sunRelative?: boolean;
	/** Orbit lines fade out on the way in, because up close they cut across the body's face. */
	closeUp?: boolean;
	/**
	 * After arrival, alpha advances with the craft the camera is following, so that craft holds still.
	 * With no craft chosen, it advances at this body's own satellite speed. The shot stays outside their
	 * orbit. Dragging still changes alpha, and the ride continues from there.
	 */
	ride?: boolean;
	/** Corona size relative to its close-up size. From far out the Sun is a dot without a bigger halo. */
	corona?: number;
};

const SHOTS: Record<string, Shot> = {
	"earth-outer": { focus: "earth", alpha: 0.9, beta: 0.8, radius: 156, sunRelative: true },
	// Far enough back that the station ring sits in frame beside the planet, outside that orbit.
	"earth-inner": {
		focus: "earth",
		alpha: 0.9,
		beta: 1.15,
		radius: 34,
		fill: 0.58,
		sunRelative: true,
		ride: true,
		closeUp: true,
	},
	"sun-outer": { focus: "sun", alpha: 0.55, beta: 1.05, radius: 110 },
};

/**
 * Same two framings Earth uses. Outer leaves the moon small, with room around it. Inner fills the
 * shorter side of the screen. Both hide orbit lines: a moon rides on its path, so the line would cut
 * across the moon at either distance.
 */
const MOON_OUTER_FILL = 0.28;
const MOON_INNER_FILL = 0.8;

function moonShot(focus: string, level: "outer" | "inner"): Shot {
	if (level === "outer") {
		return { focus, alpha: 0.9, beta: 0.8, radius: 0, fill: MOON_OUTER_FILL, sunRelative: true, closeUp: true };
	}
	return {
		focus,
		alpha: 0.9,
		beta: 1.15,
		radius: 0,
		fill: MOON_INNER_FILL,
		sunRelative: true,
		ride: true,
		closeUp: true,
	};
}

/** Share of the screen's shorter side the outermost moon orbit spans in a planet's outer shot. */
const MOON_REACH_FILL = 0.9;

/** Pulled back far enough to see the planet and every moon's whole orbit. */
function planetOuterShot(spec: PlanetSpec): Shot {
	const moonReach = spec.moons.reduce((far, moon) => Math.max(far, moon.orbit), 0);
	return {
		focus: spec.name,
		alpha: 0.9,
		beta: 0.8,
		radius: spec.diameter * 4,
		reach: moonReach || undefined,
		sunRelative: true,
	};
}

/** The old close framing: outside the warehouse halo, so the planet and what orbits it both fit. */
function planetInnerShot(spec: PlanetSpec): Shot {
	return {
		focus: spec.name,
		alpha: 0.9,
		beta: 1.2,
		radius: 0,
		fill: 0.7,
		sunRelative: true,
		ride: true,
		closeUp: true,
	};
}

/** Fraction of a body's own color left on its night side, so it reads against space. */
const NIGHT_SIDE = 0.07;
const SUNLIGHT = 1.15;

type Pose = {
	alpha: number;
	beta: number;
	radius: number;
	target: Vector3;
};

export type MoonSpec = {
	name: string;
	orbit: number;
	diameter: number;
	/** Photographed surface map in `public/textures`. Moons without one get invented terrain. */
	texture?: string;
	/** Real orbital period in Earth days. Negative orbits backwards. */
	period: number;
	/** Overrides the planet's moon plane. */
	plane?: number;
};

export type PlanetSpec = {
	name: PlanetName;
	orbit: number;
	diameter: number;
	color: Color3;
	texture?: string;
	/** Real rotation period in Earth days. Negative turns backwards. Earth follows the clock instead. */
	day?: number;
	path: Color3;
	moons: MoonSpec[];
	/** Moons orbit in a plane turned this far about the planet's X axis, the same turn as its tilt. */
	moonPlane?: number;
};

const MOON_GRAY = new Color3(0.62, 0.6, 0.58);
const MOON_PATH = new Color3(0.55, 0.55, 0.6);
/** Scales the satellites' and the ship's orbits. Planets and moons move at real speed. */
const ORBIT_PACE = 0.5;
/** Saturn's axial tilt, 26.7°. */
export const SATURN_TILT = 0.466;
/**
 * Earth's axial tilt, 23.44°. The axis leans toward ecliptic longitude 90° (+Z) and stays pointed there
 * all year, so the north pole faces the Sun in June and away from it in December.
 */
const EARTH_TILT = Matrix.RotationX(0.4091);
/** Iapetus orbits 15.5° off Saturn's equator, partway back toward the planets' plane. */
const IAPETUS_PLANE = SATURN_TILT - 0.27;
/**
 * Blue Marble reads dark on screen, so Earth's day map is scaled up. Its night-side ambient is scaled
 * down by the same factor, so the night side stays as dim as every other body's.
 */
const EARTH_DAY_BOOST = 1.35;
/** Earth and its clouds also take more of the sunlight, which lifts the slopes toward the terminator. */
const EARTH_SUNLIGHT = 1.25;

export const PLANETS: PlanetSpec[] = [
	{
		name: "mercury",
		orbit: 124,
		diameter: 8,
		color: new Color3(0.72, 0.68, 0.6),
		texture: "/textures/mercury.jpg",
		day: 58.646,
		path: new Color3(0.4, 0.38, 0.34),
		moons: [],
	},
	{
		name: "venus",
		orbit: 192,
		diameter: 12,
		color: new Color3(0.9, 0.76, 0.42),
		texture: "/textures/venus.jpg",
		day: -243.025,
		path: new Color3(0.5, 0.42, 0.24),
		moons: [],
	},
	{
		name: "earth",
		orbit: 272,
		diameter: 14,
		color: new Color3(0.32, 0.55, 0.9),
		texture: "/textures/earth-day.jpg",
		path: new Color3(0.28, 0.45, 0.7),
		// The Moon is placed from the ephemeris, not from this period.
		moons: [{ name: "moon", orbit: 52, diameter: 3.8, texture: "/textures/moon.jpg", period: 27.32 }],
	},
	{
		name: "mars",
		orbit: 360,
		diameter: 10,
		color: new Color3(0.75, 0.32, 0.18),
		texture: "/textures/mars.jpg",
		day: 1.026,
		path: new Color3(0.45, 0.24, 0.16),
		moons: [
			{ name: "phobos", orbit: 15, diameter: 0.7, period: 0.319 },
			{ name: "deimos", orbit: 20, diameter: 0.5, period: 1.263 },
		],
	},
	{
		name: "jupiter",
		orbit: 520,
		diameter: 34,
		color: new Color3(0.82, 0.62, 0.4),
		texture: "/textures/jupiter.jpg",
		day: 0.4135,
		path: new Color3(0.45, 0.36, 0.22),
		moons: [
			{ name: "io", orbit: 48, diameter: 2.4, period: 1.769 },
			{ name: "europa", orbit: 56, diameter: 2.1, period: 3.551 },
			{ name: "ganymede", orbit: 68, diameter: 3.5, period: 7.155 },
			{ name: "callisto", orbit: 80, diameter: 3.2, period: 16.689 },
		],
	},
	{
		name: "saturn",
		orbit: 700,
		diameter: 28,
		color: new Color3(0.86, 0.74, 0.48),
		texture: "/textures/saturn.jpg",
		// No spin: the tilted ring is attached to the planet and would wobble. The bands look the same turned.
		path: new Color3(0.48, 0.4, 0.22),
		moons: [
			{ name: "mimas", orbit: 68, diameter: 0.6, period: 0.942 },
			{ name: "enceladus", orbit: 73, diameter: 0.7, period: 1.37 },
			{ name: "tethys", orbit: 78, diameter: 1.1, period: 1.888 },
			{ name: "dione", orbit: 84, diameter: 1.2, period: 2.737 },
			{ name: "rhea", orbit: 90, diameter: 1.5, period: 4.518 },
			{ name: "titan", orbit: 102, diameter: 3.4, period: 15.945 },
			{ name: "iapetus", orbit: 114, diameter: 1.4, plane: IAPETUS_PLANE, period: 79.32 },
		],
		// The major moons orbit in the ring plane.
		moonPlane: SATURN_TILT,
	},
	{
		name: "uranus",
		orbit: 880,
		diameter: 18,
		color: new Color3(0.55, 0.86, 0.82),
		texture: "/textures/uranus.jpg",
		day: -0.7183,
		path: new Color3(0.28, 0.42, 0.42),
		moons: [
			{ name: "miranda", orbit: 24, diameter: 0.6, period: 1.413 },
			{ name: "ariel", orbit: 28, diameter: 1, period: 2.52 },
			{ name: "umbriel", orbit: 33, diameter: 1, period: 4.144 },
			{ name: "titania", orbit: 40, diameter: 1.3, period: 8.706 },
			{ name: "oberon", orbit: 46, diameter: 1.3, period: 13.463 },
		],
	},
	{
		name: "neptune",
		orbit: 1060,
		diameter: 18,
		color: new Color3(0.28, 0.38, 0.86),
		texture: "/textures/neptune.jpg",
		day: 0.6713,
		path: new Color3(0.2, 0.26, 0.5),
		moons: [
			{ name: "proteus", orbit: 23, diameter: 0.6, period: 1.122 },
			{ name: "triton", orbit: 30, diameter: 2.2, period: -5.877 },
			{ name: "nereid", orbit: 44, diameter: 0.5, period: 360.1 },
		],
	},
];

/** The whole system from nearly overhead, close enough that the outer orbit can leave the frame. */
SHOTS.system = {
	focus: "sun",
	alpha: -Math.PI / 2,
	beta: 0.28,
	radius: 0,
	fitOrbit: Math.max(...PLANETS.map((spec) => spec.orbit + spec.diameter / 2)),
	corona: 3,
};
/** Share of each screen axis the outermost orbit is framed to. Above 1, that orbit can leave the frame. */
const ORBIT_FIT_FILL = 1.35;

const PLANET_LABEL: Record<PlanetName, string> = {
	mercury: "Mercury",
	venus: "Venus",
	earth: "Earth",
	mars: "Mars",
	jupiter: "Jupiter",
	saturn: "Saturn",
	uranus: "Uranus",
	neptune: "Neptune",
};

function title(name: string): string {
	return name.charAt(0).toUpperCase() + name.slice(1);
}

function moonView(planet: PlanetName, moon: string, level: "outer" | "inner"): MoonView {
	return `${planet}-${moon}-${level}`;
}

function planetOrbitView(name: PlanetName, level: "outer" | "inner"): BodyOrbitView {
	return `${name}-${level}`;
}

function planetStops(name: PlanetName): ViewStop[] {
	return [
		{ view: planetOrbitView(name, "outer"), label: "Outer orbit" },
		{ view: planetOrbitView(name, "inner"), label: "Inner orbit" },
	];
}

/** Sun, then each planet outward. A planet with moons lists the planet first, then each moon. */
export const PLACES: ViewPlace[] = [
	{
		label: "Sun",
		subjects: [
			{
				label: "Sun",
				stops: [
					{ view: "sun-outer", label: "Outer orbit" },
					{ view: "sun-inner", label: "Inner orbit" },
				],
			},
		],
	},
	...PLANETS.map((spec): ViewPlace => {
		if (spec.name !== "earth") {
			SHOTS[planetOrbitView(spec.name, "outer")] = planetOuterShot(spec);
			SHOTS[planetOrbitView(spec.name, "inner")] = planetInnerShot(spec);
		}
		const subjects: ViewSubject[] = [
			{
				label: spec.moons.length > 0 ? "Planet" : PLANET_LABEL[spec.name],
				stops: planetStops(spec.name),
			},
		];
		for (const moon of spec.moons) {
			const outer = moonView(spec.name, moon.name, "outer");
			const inner = moonView(spec.name, moon.name, "inner");
			SHOTS[outer] = moonShot(moon.name, "outer");
			SHOTS[inner] = moonShot(moon.name, "inner");
			subjects.push({
				label: title(moon.name),
				stops: [
					{ view: outer, label: "Outer orbit" },
					{ view: inner, label: "Inner orbit" },
				],
			});
		}
		return { label: PLANET_LABEL[spec.name], subjects };
	}),
];

export const SUN_DIAMETER = 28;
/** Corona width as a multiple of the Sun's diameter. It fades out before the satellite band gets crowded. */
const CORONA_SCALE = 2.2;
/** The Sun turns once in about 25 days, in radians per second. */
const SUN_SPIN = (Math.PI * 2) / (25.38 * 86_400);
const SUNLIGHT_COLOR = new Color3(1, 0.95, 0.86);
export const SUN_INNER_RING = 24;
SHOTS["sun-inner"] = {
	focus: "sun",
	alpha: 0.35,
	beta: 1.25,
	radius: 40,
	fill: 0.8,
	ride: true,
	closeUp: true,
};
const OUTER_RING_COLOR = new Color3(0.55, 0.62, 0.75);
/** Earth's Moon is not a combat zone, so its shell is the neutral bone instead of the battle tint. */
const ZONE_BONE = Color3.FromHexString("#E8E4D9");
/** How far outside a zone the outer-orbit camera stands, so the shell reads as a boundary. */
const OUTER_VIEW_MARGIN = 1.25;
const ZONE_FADE_SECONDS = 0.35;
const INNER_RING_COLOR = new Color3(0.85, 0.55, 0.25);

const SATELLITE_COUNT = 300;
const SATELLITE_BAND_INNER = 19;
const SATELLITE_BAND_OUTER = 30;
const SATELLITE_SIZE = { width: 0.24, height: 0.04, depth: 0.12 };
/** Angular speed at radius r is SATELLITE_ORBIT_RATE / r^1.5, so inner satellites lap outer ones. */
const SATELLITE_ORBIT_RATE = 2.35;

type SatelliteOwner = "corporate" | "marauder" | "empty";

const SATELLITE_LOOK: Record<SatelliteOwner, { share: number; color: Color3; glow: Color3 }> = {
	corporate: { share: 0.35, color: new Color3(0.95, 0.78, 0.35), glow: new Color3(0.6, 0.42, 0.08) },
	marauder: { share: 0.3, color: new Color3(0.85, 0.25, 0.2), glow: new Color3(0.55, 0.08, 0.06) },
	empty: { share: 0.35, color: new Color3(0.72, 0.78, 0.86), glow: new Color3(0.3, 0.34, 0.42) },
};

const STAR_COUNT = 6000;
/** Extra stars packed into the Milky Way's band. */
const BAND_STAR_COUNT = 3500;
/** Inside the camera's far limit. The sky follows the camera, so this is not how far away stars look. */
const SKY_RADIUS = 7000;
/** Visual magnitudes: Sirius is about -1.5, the faintest dark-sky stars about 6.5. */
const STAR_BRIGHTEST = -1;
const STAR_FAINTEST = 6.5;
/** Star counts grow about threefold per magnitude (10^0.47). */
const STAR_GROWTH = 0.47;
/** The Milky Way's plane is steeply tilted to the planets' plane (about 60° in the real sky). */
const GALAXY_POLE = new Vector3(0.45, 0.4, 0.8);
const GALAXY_CENTER_HINT = new Vector3(0.5, -1, 0.2);
const MILKY_WAY_GLOW = 0.18;

/** How long a camera move takes. Arriving at the Sun is a little slower, because the zoom covers more distance. */
export const TRAVEL_SECONDS = 2.4;
export const SUN_TRAVEL_SECONDS = 3.6;

export function travelSeconds(view: DemoView): number {
	return view === "sun-outer" || view === "sun-inner" ? SUN_TRAVEL_SECONDS : TRAVEL_SECONDS;
}

const CAMERA_BETA_MIN = 0.05;
const CAMERA_BETA_MAX = Math.PI / 2 + 0.4;
const CAMERA_RADIUS_MIN = 3;
/** Far enough out that a phone held upright still fits Neptune's orbit across its width. */
const CAMERA_RADIUS_MAX = 7000;
/** Clearance off Saturn's ring plane. The mesh is flat, so this is what "missing the rings" means. */
const RING_HALF_HEIGHT = 0.7;

export function saturnRing(center: Vector3): RingBody {
	const planetRadius = PLANETS.find((spec) => spec.name === "saturn")!.diameter / 2;
	return {
		center: center.clone(),
		normal: new Vector3(0, Math.cos(SATURN_TILT), Math.sin(SATURN_TILT)),
		inner: planetRadius * SATURN_RING_INNER_SCALE,
		outer: planetRadius * SATURN_RING_OUTER_SCALE,
		halfHeight: RING_HALF_HEIGHT,
	};
}

function baseInput(spec: PlanetSpec): PlanetBaseInput {
	return {
		diameter: spec.diameter,
		moons: spec.moons.map((moon) => ({ orbit: moon.orbit, diameter: moon.diameter })),
		stationRadius: spec.name === "earth" ? EARTH_STATION_RADIUS : undefined,
		warehouseRadius: spec.name === "earth" ? EARTH_WAREHOUSE_RADIUS : undefined,
		homes: spec.name !== "earth",
		ringInnerScale: spec.name === "saturn" ? SATURN_RING_INNER_SCALE : undefined,
	};
}

/** Outer-orbit radius of the Sun, a planet, or a moon. The honeycomb sits on this circle. */
export function bodyOuterRadius(id: string): number {
	if (id === "sun") {
		return SUN_OUTER_ORBIT;
	}
	for (const spec of PLANETS) {
		if (spec.name === id) {
			return outerOrbitRadius(baseInput(spec));
		}
		for (const moon of spec.moons) {
			if (moon.name === id) {
				return moonOuterOrbitRadius(moon.diameter);
			}
		}
	}
	throw new Error(`No outer orbit for ${id}.`);
}

/**
 * A gravity assist passes this far outside the outer-orbit shell, as a multiple of that radius.
 * On the shell the curve and the honeycomb are the same line, and the grid fills the cockpit.
 */
const FLYBY_OUTSIDE = 1.1;

export function flybyRadius(spec: PlanetSpec | "sun"): number {
	return bodyOuterRadius(spec === "sun" ? "sun" : spec.name) * FLYBY_OUTSIDE;
}

/** A body a journey can leave from or fly to. `id` is "sun", a planet name, or a moon name. */
export type JourneyStop = { id: string; label: string; group?: string };

/** The Sun, then each planet followed by its moons. */
export const JOURNEY_STOPS: JourneyStop[] = [
	{ id: "sun", label: "Sun" },
	...PLANETS.flatMap((spec): JourneyStop[] => [
		{ id: spec.name, label: PLANET_LABEL[spec.name], group: PLANET_LABEL[spec.name] },
		...spec.moons.map((moon) => ({ id: moon.name, label: title(moon.name), group: PLANET_LABEL[spec.name] })),
	]),
];

function orbitView(id: string, level: "outer" | "inner"): DemoView {
	if (id === "sun") {
		return level === "outer" ? "sun-outer" : "sun-inner";
	}
	for (const spec of PLANETS) {
		if (spec.name === id) {
			return planetOrbitView(spec.name, level);
		}
		const moon = spec.moons.find((candidate) => candidate.name === id);
		if (moon) {
			return moonView(spec.name, moon.name, level);
		}
	}
	throw new Error(`No ${level} orbit view for ${id}.`);
}

/** The outer orbit of a journey stop, by `JourneyStop` id. */
export function stopView(id: string): DemoView {
	return orbitView(id, "outer");
}

/**
 * Which id a click names. A craft usually wins, so a station opens the inner orbit it circles.
 * A craft that belongs to the body under the pointer does not: the click is on that body.
 */
export function choosePick(craft: { id: string; host: string } | null, bodyId: string | null): string | null {
	if (craft && bodyId && craft.host === bodyId) {
		return bodyId;
	}
	return craft?.id ?? bodyId;
}

/** A body the pointer can pick, and the view a click on it opens: that body's outer orbit. */
export type BodyTarget = { id: string; label: string; view: DemoView };

const SUN_TARGET: BodyTarget = { id: "sun", label: "Sun", view: "sun-outer" };

function planetTarget(spec: PlanetSpec): BodyTarget {
	return { id: spec.name, label: PLANET_LABEL[spec.name], view: planetOrbitView(spec.name, "outer") };
}

function moonTarget(spec: PlanetSpec, moon: MoonSpec): BodyTarget {
	return { id: moon.name, label: title(moon.name), view: moonView(spec.name, moon.name, "outer") };
}

/** From the whole system, the Sun and the planets. Beside a planet, its moons. Nothing beside the Sun or a moon. */
export function bodyTargets(view: DemoView): BodyTarget[] {
	if (view === "system") {
		return [SUN_TARGET, ...PLANETS.map(planetTarget)];
	}
	const spec = PLANETS.find(
		(candidate) => view === planetOrbitView(candidate.name, "outer") || view === planetOrbitView(candidate.name, "inner")
	);
	return spec ? spec.moons.map((moon) => moonTarget(spec, moon)) : [];
}

/** A body by id, and the view a click on it opens. */
export function bodyTarget(id: string): BodyTarget {
	if (id === "sun") {
		return SUN_TARGET;
	}
	for (const spec of PLANETS) {
		if (spec.name === id) {
			return planetTarget(spec);
		}
		const moon = spec.moons.find((candidate) => candidate.name === id);
		if (moon) {
			return moonTarget(spec, moon);
		}
	}
	throw new Error(`No body named ${id}.`);
}

/** The bodies a scan can name from this view: the bodies a click would open, and the body the view is on. */
export function scanTargets(view: DemoView): BodyTarget[] {
	const targets = bodyTargets(view);
	const here = viewTrail(view).filter((body) => !body.id.endsWith("-stop")).at(-1);
	return here && !targets.some((target) => target.id === here.id) ? [here, ...targets] : targets;
}

function bodyKind(id: string): ScanKind {
	if (id === "sun") {
		return "star";
	}
	return PLANETS.some((spec) => spec.name === id) ? "planet" : "moon";
}

/** The bodies between the whole system and this view, outermost first: the planet, then its moon. */
export function viewTrail(view: DemoView): BodyTarget[] {
	const here = (trail: BodyTarget[]): BodyTarget[] =>
		view.endsWith("-inner") ? [...trail, { id: `${view}-stop`, label: "Inner orbit", view }] : trail;
	if (view === "sun-outer" || view === "sun-inner") {
		return here([SUN_TARGET]);
	}
	for (const spec of PLANETS) {
		if (view === planetOrbitView(spec.name, "outer") || view === planetOrbitView(spec.name, "inner")) {
			return here([planetTarget(spec)]);
		}
		for (const moon of spec.moons) {
			if (view === moonView(spec.name, moon.name, "outer") || view === moonView(spec.name, moon.name, "inner")) {
				return here([planetTarget(spec), moonTarget(spec, moon)]);
			}
		}
	}
	return [];
}

/** Bodies this chart is on, outermost first. The inner-orbit crumb is not a body. */
function chartBodies(view: DemoView): BodyTarget[] {
	return viewTrail(view).filter((body) => !body.id.endsWith("-stop"));
}

/** What a framing names: the bodies, and the one host whose orbiting craft are named. */
export type ScanScope = { bodies: BodyTarget[]; craftHost: string | null };

/**
 * What this framing names.
 * The system chart names the Sun and the planets, and never a craft.
 * A planet or the Sun, while the camera is still outside the close orbit, names that body and, for a
 * planet, its moons. Nothing orbiting them is named.
 * A moon chart, an inner orbit, or a camera that has come in to the close orbit names the focused
 * body and the craft that orbit it. Moons of a zoomed planet drop off.
 */
export function scanScope(view: DemoView, close: boolean): ScanScope {
	if (view === "system") {
		return { bodies: scanTargets(view), craftHost: null };
	}
	const focus = chartBodies(view).at(-1);
	if (!focus) {
		return { bodies: [], craftHost: null };
	}
	const wide = !close && view.endsWith("-outer") && chartBodies(view).length === 1;
	if (wide) {
		return { bodies: scanTargets(view), craftHost: null };
	}
	return { bodies: [focus], craftHost: focus.id };
}

/**
 * How near the camera must be before a planet or the Sun is framed on that one body.
 * The same stand-off a moon's outer orbit uses: `filled` is the distance at which the body covers
 * `MOON_OUTER_FILL` of the shorter side, and the camera also stays outside the outer-orbit shell.
 */
export function closeOrbitDistance(filled: number, outerRadius: number): number {
	return Math.max(filled, outerRadius * OUTER_VIEW_MARGIN);
}

/** How far back past the close orbit a chart may drift before it names the family again. */
export const CLOSE_HOLD = 0.08;

/** True while the camera is inside the close orbit, holding a little past it once it has come in. */
export function holdClose(radius: number, closeRadius: number, wasClose: boolean): boolean {
	return radius <= (wasClose ? closeRadius * (1 + CLOSE_HOLD) : closeRadius);
}

export type ChartTarget = DemoView | "galaxy" | "ship" | "wide";

/** One corner step: the word on the button, and where it goes. `ship` is the ship's inner orbit. */
export type ChartButton = { label: string; target: ChartTarget };

/**
 * The corner steps for a chart, top to bottom.
 * The system chart has Home, to the ship's orbit, and Galaxy, to leave Sol.
 * A planet or the Sun steps back to the system. A moon steps back to its planet.
 * An inner orbit steps back to that same place: a planet's own outer orbit, or its planet's when the
 * orbit belongs to a moon. The Sun's inner orbit steps back to the Sun.
 */
export function chartButtons(view: DemoView): ChartButton[] {
	if (view === "system") {
		return [
			{ label: "Home", target: "ship" },
			{ label: "Galaxy", target: "galaxy" },
		];
	}
	if (view === "sun-outer") {
		return [{ label: "System", target: "system" }];
	}
	if (view === "sun-inner") {
		return [{ label: "Sun", target: "sun-outer" }];
	}
	for (const spec of PLANETS) {
		const outer = planetOrbitView(spec.name, "outer");
		if (view === outer) {
			return [{ label: "System", target: "system" }];
		}
		if (view === planetOrbitView(spec.name, "inner")) {
			return [{ label: "Planet", target: outer }];
		}
		for (const moon of spec.moons) {
			if (view === moonView(spec.name, moon.name, "outer") || view === moonView(spec.name, moon.name, "inner")) {
				return [{ label: "Planet", target: outer }];
			}
		}
	}
	return [{ label: "System", target: "system" }];
}

/**
 * The step back from a planet's close framing, when that planet has moons.
 * It pulls the camera out to the wide chart. Null on the Sun, a moon, and a planet with no moons.
 */
export function wideChartStep(view: DemoView): ChartButton | null {
	for (const spec of PLANETS) {
		if (view === planetOrbitView(spec.name, "outer") && spec.moons.length > 0) {
			return { label: "Planet", target: "wide" };
		}
	}
	return null;
}

/**
 * How far the wheel may move once the camera has arrived.
 * The system chart can pull back. An outer orbit can come in to its inner orbit and no farther out
 * than the shot it arrived on. An inner orbit stays on that shot.
 */
export function wheelLimits(view: DemoView, arrived: number, closer: number, chartFar: number): { near: number; far: number } {
	if (view.endsWith("-inner")) {
		return { near: arrived, far: arrived };
	}
	return { near: Math.min(arrived, closer), far: view === "system" ? chartFar : arrived };
}

/** A body and where it is on screen, in CSS pixels from the canvas's top left. */
type BodySpot = { target: BodyTarget; x: number; y: number; radius: number };

/** A scan names no more than this many things, the nearest to the camera. */
export const SCAN_LIMIT = 10;

function bodyFound(id: string): ScanTarget {
	return { id, host: id, kind: bodyKind(id) };
}

/** Whether the straight line between two points passes through a sphere. */
export function blocked(from: Vector3, to: Vector3, center: Vector3, radius: number): boolean {
	const line = to.subtract(from);
	const length = line.length();
	if (length < 1e-9) {
		return false;
	}
	const along = Vector3.Dot(center.subtract(from), line) / length;
	if (along <= 0 || along >= length) {
		return false;
	}
	const nearest = from.add(line.scale(along / length));
	return Vector3.DistanceSquared(nearest, center) < radius * radius;
}

/** Bodies smaller than this on screen still catch the pointer this far from their center. */
const MIN_HIT_PIXELS = 14;
/** Names fade in over this long once the camera arrives, and out as fast when it leaves. */
const LABEL_FADE_SECONDS = 0.3;

export type JourneyBody = {
	id: string;
	center: Vector3;
	radius: number;
	/** Radius of the orbit its bases ride, or the Sun's inner orbit. A climb starts here when the body has no bases. */
	halo: number;
	/** Outer-orbit radius. The burn leaves and arrives on this circle. */
	outer: number;
	/** World positions of its bases right now. A ship leaves from the one nearest its destination. */
	bases: Vector3[];
};

/** Every body where it is at one moment: the Sun, each planet, and each moon. */
export type JourneyLayout = { bodies: JourneyBody[] };

/** Where a docked ship is, which way its satellite circles, and how fast it is already moving. */
export type Departure = { at: Vector3; turn: number; speed?: number };

/**
 * From one body to another, in three parts. The ship climbs slowly from the base nearest the
 * destination out to a tangent on the origin's outer orbit, burns fast along that tangent to a
 * tangent on the destination's outer orbit, and then drops inward to dock there. When `depart` is
 * set the ship is already docked at the origin, and the climb starts from there instead.
 *
 * The climb leaves with the orbit. It eases outward while it keeps turning the way the satellite
 * circles, and meets the burn along the outer orbit. Heading back against the orbit is taken only
 * when that way out is shorter by more than half a lap, since reversing throws away the speed the
 * ship already has. A ship that is not docked circles the way the bases do, counterclockwise.
 * The burn always arrives the same way, so the ship is already facing the dock it will settle onto.
 *
 * Every planet that is not an end of the trip may give an assist, and so may the Sun. An assist passes
 * just outside that body's outer orbit, and the ship is still burning, so the pass is not a place it
 * can be attacked. A course that would cross the Sun takes that pass, so the burn wraps the Sun in
 * the planets' plane instead of cutting through it.
 */
export function planJourney(layout: JourneyLayout, fromId: string, toId: string, depart?: Departure): JourneyPlan {
	const byId = new Map(layout.bodies.map((body) => [body.id, body]));
	const from = byId.get(fromId);
	const to = byId.get(toId);
	const saturnBody = byId.get("saturn");
	if (!from || !to || !saturnBody) {
		throw new Error(`No journey from ${fromId} to ${toId}.`);
	}

	const spheres = layout.bodies.map((body) => ({ center: body.center, radius: body.radius }));
	const rings = [saturnRing(saturnBody.center)];
	const sunBody = byId.get("sun");
	const candidates = [
		...(sunBody && fromId !== "sun" && toId !== "sun"
			? [{ name: "Sun", center: sunBody.center, flyby: flybyRadius("sun") }]
			: []),
		...PLANETS.filter((spec) => spec.name !== fromId && spec.name !== toId).flatMap((spec) => {
			const body = byId.get(spec.name);
			return body ? [{ name: PLANET_LABEL[spec.name], center: body.center, flyby: flybyRadius(spec) }] : [];
		}),
	];

	const nearestBase = () =>
		from.bases.reduce((best, base) =>
			Vector3.DistanceSquared(base, to.center) < Vector3.DistanceSquared(best, to.center) ? base : best
		);
	const origin =
		depart?.at ??
		(from.bases.length > 0 ? nearestBase() : from.center.add(flatToward(from.center, to.center).scale(from.halo)));
	const orbitTurn = depart?.turn || 1;
	const radius = Math.hypot(origin.x - from.center.x, origin.z - from.center.z);

	const option = (turn: number) => {
		const cruise = planRoute({
			start: from.center,
			end: to.center,
			startRadius: from.outer,
			endRadius: to.outer,
			startTurn: turn,
			endTurn: 1,
			candidates,
			spheres,
			rings,
		});
		const spiral = departureSpiral(from.center, origin, cruise.points[0], turn, rings);
		const opened = curveClimbStart(spiral, tangentHeading(from.center, origin, orbitTurn), spheres, rings, from.center);
		const joined = curveClimbJoin(opened, cruise, spheres, rings, from.center);
		return { cruise: joined.route, climb: joined.climb };
	};
	const withOrbit = option(orbitTurn);
	const againstOrbit = option(-orbitTurn);
	const chosen =
		pathLength(againstOrbit.climb) + reversalPenalty(radius) < pathLength(withOrbit.climb) ? againstOrbit : withOrbit;

	return {
		climb: chosen.climb,
		cruise: chosen.cruise,
		arrive: { id: toId, turn: chosen.cruise.endTurn || 1 },
		departSpeed: depart?.speed ?? CLIMB_PACE,
	};
}

function pathLength(points: Vector3[]): number {
	let length = 0;
	for (let i = 1; i < points.length; i++) {
		length += Vector3.Distance(points[i - 1], points[i]);
	}
	return length;
}

/** Unit direction from `from` toward `to`, flattened into the planets' plane. */
function flatToward(from: Vector3, to: Vector3): Vector3 {
	const direction = new Vector3(to.x - from.x, 0, to.z - from.z);
	return direction.lengthSquared() < 1e-12 ? new Vector3(1, 0, 0) : direction.normalize();
}

type Flight = {
	points: Vector3[];
	cumulative: number[];
	total: number;
	endWorld: Vector3;
	fromTarget: Vector3;
};

type MoonBody = {
	mesh: Mesh;
	orbit: number;
	period: number;
	/** Where the moon was at J2000. Made up: only Earth's Moon is placed from real data. */
	phase: number;
	plane: Matrix;
	turn: Quaternion;
	radius: number;
	/** Follows the moon without spinning, so bases stay in orbit instead of sticking to the surface. */
	baseAnchor: TransformNode;
	/** Bakes an invented surface at full detail for a close view. */
	sharpen?: () => void;
};

type PlanetBody = {
	spec: PlanetSpec;
	mesh: Mesh;
	/** Follows the planet without turning with it, so moon paths and orbit rings stay put. */
	anchor: TransformNode;
	moons: MoonBody[];
};

export type EnvironmentDemo = LabelSource & {
	go: (view: DemoView) => void;
	/** The chart on screen. */
	view: () => DemoView;
	/**
	 * Opens the inner orbit of the body the ship is at and rides with the ship.
	 * The chart learns the view through `onSelect`.
	 */
	home: () => void;
	/** Calls back when the chart is sent to a body, by View or by Home. Returns a stop function. */
	onSelect: (listener: (target: BodyTarget) => void) => () => void;
	/**
	 * While on, the scene names what is near the camera through `onScanFound`, and a click names what it
	 * lands on through `onScan`. Only what was named can be picked. A body click is entered by the chart.
	 * A craft click is left for the card.
	 */
	setScanning: (on: boolean) => void;
	onScan: (listener: (target: ScanTarget) => void) => () => void;
	/**
	 * Calls back with what the framing names, nearest the camera first and at most `SCAN_LIMIT`.
	 * The system chart names the Sun and the planets. A wide planet chart names the planet and its moons.
	 * A moon chart, an inner orbit, or a planet zoomed in to one body names that body and the craft
	 * orbiting it. The set is found again as the camera swings and zooms, and the callback runs when the
	 * named ids change. Empty while not scanning or while the camera is still flying to a view.
	 */
	onScanFound: (listener: (found: ScanTarget[]) => void) => () => void;
	/** Takes the camera to a scanned body's outer orbit, or rides alongside a scanned craft. On a wide planet or Sun chart, View of that body comes in to the close framing instead. */
	visit: (target: ScanTarget) => void;
	/** Pulls a close planet chart back out to the wide shot, where the moons are named. */
	widen: () => void;
	/**
	 * Calls back with whether the camera is in the close framing, where a single body and what orbits
	 * it are named. The callback runs when that changes, and once when the listener is added.
	 */
	onFraming: (listener: (close: boolean) => void) => () => void;
	/**
	 * Flies the ship from where it sits, its dock or its orbit at Earth, to the target's body and docks
	 * it there: with the target itself when that is a craft. `onDone` runs once it has docked.
	 */
	travel: (target: ScanTarget, onDone: () => void) => void;
	/** Ends the flight early and clears it. */
	land: () => void;
	/** Puts the camera in the ranger's cockpit, with both aft views, or back on the chart where it left. */
	setPiloting: (on: boolean) => void;
	/**
	 * Interior looks out the windscreen. Exterior orbits the hull and leaves the course undrawn.
	 * Takes effect while piloting; the chart stays put until then.
	 */
	setViewpoint: (viewpoint: PilotViewpoint) => void;
	/** One notch of the chart wheel, held to this chart's limits. Ignored in the cockpit and while the camera is flying. */
	zoom: (direction: ZoomDirection) => void;
	/** Calls back every frame while piloting with where the ship is in the system. Returns a stop function. */
	onNav: (listener: (fix: NavFix) => void) => () => void;
};

export async function createEnvironment(
	engine: Engine,
	scene: Scene,
	canvas: HTMLCanvasElement,
	options?: { atShip?: boolean }
): Promise<EnvironmentDemo> {
	scene.clearColor = new Color4(0.02, 0.03, 0.07, 1);

	const start = SHOTS.system;
	const camera = new ArcRotateCamera("demo-camera", start.alpha, start.beta, start.radius, Vector3.Zero(), scene);
	camera.lowerBetaLimit = CAMERA_BETA_MIN;
	camera.upperBetaLimit = CAMERA_BETA_MAX;
	camera.lowerRadiusLimit = CAMERA_RADIUS_MIN;
	camera.upperRadiusLimit = CAMERA_RADIUS_MAX;
	camera.minZ = 0.1;
	camera.maxZ = 9000;
	tuneChartCamera(camera);
	attachChartCamera(camera, canvas);
	scene.activeCamera = camera;

	const sunlight = new PointLight("sunlight", Vector3.Zero(), scene);
	sunlight.intensity = SUNLIGHT;
	sunlight.diffuse = SUNLIGHT_COLOR;
	sunlight.specular = SUNLIGHT_COLOR;
	scene.ambientColor = new Color3(1, 1, 1);

	const glow = new GlowLayer("glow", scene);
	glow.intensity = 0.7;

	const orbitLines: LinesMesh[] = [];
	const addOrbit = (name: string, radius: number, color: Color3, parent?: TransformNode, tilt = 0) => {
		const line = buildOrbit(scene, name, radius, color);
		line.parent = parent ?? null;
		line.rotation.x = tilt;
		glow.addExcludedMesh(line);
		orbitLines.push(line);
		return line;
	};

	for (const sky of buildStarfield(scene)) {
		glow.addExcludedMesh(sky);
	}
	const sun = buildSun(scene);
	glow.addExcludedMesh(sun.corona);
	const sunOuterRing = addOrbit("sun-outer-ring", SUN_OUTER_ORBIT, OUTER_RING_COLOR);
	addOrbit("sun-inner-ring", SUN_INNER_RING, INNER_RING_COLOR);

	const terrain = createMoonTerrain(scene, { color: SUNLIGHT_COLOR, strength: SUNLIGHT, night: NIGHT_SIDE });
	const moonByName = new Map<string, MoonBody>();
	const bodies: PlanetBody[] = PLANETS.map((spec) => {
		const mesh = buildPlanet(scene, spec.name, spec.diameter, spec.color, spec.texture);
		addOrbit(`${spec.name}-path`, spec.orbit, spec.path);
		const anchor = new TransformNode(`${spec.name}-anchor`, scene);
		const moons = spec.moons.map((moon, index) => {
			const tilt = moon.plane ?? spec.moonPlane ?? 0;
			addOrbit(`${moon.name}-path`, moon.orbit, MOON_PATH, anchor, tilt);
			const invented = terrain.build(moon.name, moon.diameter);
			const body = invented?.mesh ?? buildPlanet(scene, moon.name, moon.diameter, MOON_GRAY, moon.texture);
			const turn = new Quaternion();
			body.rotationQuaternion = turn;
			const orbiter: MoonBody = {
				mesh: body,
				orbit: moon.orbit,
				period: moon.period,
				phase: index * 2.4,
				plane: Matrix.RotationX(tilt),
				turn,
				radius: moon.diameter / 2,
				baseAnchor: new TransformNode(`${moon.name}-bases`, scene),
				sharpen: invented?.sharpen,
			};
			moonByName.set(moon.name, orbiter);
			return orbiter;
		});
		return { spec, mesh, anchor, moons };
	});

	const earth = bodies.find((body) => body.spec.name === "earth");
	const saturn = bodies.find((body) => body.spec.name === "saturn");
	if (!earth || !saturn) {
		throw new Error("The system is missing Earth or Saturn.");
	}
	const moon = earth.moons[0];
	const nearSide = mapCenterAngle(moon.mesh);
	// The middle of the Blue Marble map is the Greenwich meridian.
	const greenwich = mapCenterAngle(earth.mesh);
	const earthTurn = new Quaternion();
	earth.mesh.rotationQuaternion = earthTurn;
	dressEarth(scene, earth.mesh, earth.spec.diameter);

	glow.addExcludedMesh(buildSaturnRing(scene, saturn.mesh, saturn.spec.diameter / 2));
	addOrbit("earth-inner-ring", EARTH_STATION_RADIUS, INNER_RING_COLOR, earth.anchor);

	const crafts: Craft[] = [];
	const spinningBases = buildHabitats(scene, bodies, crafts);
	const ranger = await loadRanger(scene, camera);
	let shipAngle = 1.2;
	const idlePoint = new Vector3();
	const idleHeading = new Vector3();
	const player: Craft = {
		id: "player-ship",
		host: "earth",
		view: planetOrbitView("earth", "inner"),
		kind: "ship",
		reach: HULL_LENGTH / 2,
		marker: () => ranger.beacon(),
		rate: 0.35 * ORBIT_PACE,
		angle: () => shipAngle,
		position: (out) => out.copyFrom(ranger.position),
	};
	crafts.push(player);

	const swarm = buildSatelliteSwarm(scene, crafts);

	/** The Sun's satellites, or the bases and stations circling a planet or moon. */
	const harborOf = (id: string): Harbor => {
		const outer = bodyOuterRadius(id);
		if (id === "sun") {
			return { docks: swarm.docks, outer };
		}
		const planet = bodies.find((body) => body.spec.name === id);
		const anchor = planet?.anchor ?? moonByName.get(id)?.baseAnchor;
		const docks = spinningBases
			.filter((base) => base.mesh.parent === anchor)
			.map((base): Dock => ({ position: () => base.mesh.position.clone(), rate: BASE_SPIN * ORBIT_PACE }));
		if (planet === saturn) {
			const { normal, inner, outer: ringOuter, halfHeight } = saturnRing(Vector3.Zero());
			return { docks, outer, ring: { normal, inner, outer: ringOuter, halfHeight } };
		}
		return { docks, outer };
	};

	/** One craft to dock with, by craft id: a base, a station, or a collector. */
	const dockById = new Map(swarm.dockById);
	for (const base of spinningBases) {
		dockById.set(base.mesh.name, { position: () => base.mesh.position.clone(), rate: BASE_SPIN * ORBIT_PACE });
	}

	const journey = createJourney(scene, camera, glow, harborOf, ranger);
	const cockpit = createCockpit(scene, ranger.mounts, camera, glow);
	// The ship is Earth's until it docks somewhere else. Home opens that body's inner orbit.
	const berthPlayer = () => {
		const docked = journey.docked();
		player.host = docked?.id ?? "earth";
		player.view = docked ? orbitView(docked.id, "inner") : planetOrbitView("earth", "inner");
	};

	const journeyBody = (id: string, center: Vector3, radius: number, anchor: TransformNode): JourneyBody => {
		const riding = spinningBases.filter((base) => base.mesh.parent === anchor);
		return {
			id,
			center: center.clone(),
			radius,
			halo: riding[0]?.radius ?? radius * 1.5,
			outer: bodyOuterRadius(id),
			// World matrices refresh at render, so add the anchor's position by hand.
			bases: riding.map((base) => anchor.position.add(base.mesh.position)),
		};
	};

	const journeyLayout = (): JourneyLayout => {
		const layout: JourneyBody[] = [
			{
				id: "sun",
				center: Vector3.Zero(),
				radius: SUN_DIAMETER / 2,
				halo: SUN_INNER_RING,
				outer: SUN_OUTER_ORBIT,
				bases: [],
			},
		];
		for (const body of bodies) {
			layout.push(journeyBody(body.spec.name, body.mesh.position, body.spec.diameter / 2, body.anchor));
			body.moons.forEach((orbiter, index) => {
				const id = body.spec.moons[index].name;
				layout.push(journeyBody(id, orbiter.mesh.position, orbiter.radius, orbiter.baseAnchor));
			});
		}
		return { bodies: layout };
	};

	let from = snapshot(camera);
	let flight: Flight | null = null;
	let active: DemoView = "system";
	let travel = 1;
	let moveSeconds = TRAVEL_SECONDS;
	/** The screen shows the cockpit. The chart camera keeps its place, so it is where it was on the way back. */
	let piloting = false;
	/** Names what is near. A click opens that thing's card. It does not move the camera. */
	let scanning = true;
	let found: ScanTarget[] = [];
	/** The chart has come in to the close orbit, so the hold band applies on the way back out. */
	let namingCraft = false;
	const framingListeners = new Set<(close: boolean) => void>();
	const publishFraming = (close: boolean) => {
		if (namingCraft === close) {
			return;
		}
		namingCraft = close;
		for (const listener of framingListeners) {
			listener(close);
		}
	};
	/** A radius move that stays on this chart: in to the close framing, or back out to the wide shot. */
	let dolly: { from: number; to: number; t: number } | null = null;
	/** How visible the names are. They drop out the moment the camera leaves and fade back in on arrival. */
	let labelFade = 0;
	let linesFrom = 1;
	let linesNow = 1;
	let coronaFrom = start.corona ?? 1;
	let coronaNow = coronaFrom;
	sun.setCorona(coronaNow);

	const setOrbitLines = (amount: number) => {
		linesNow = amount;
		for (const line of orbitLines) {
			line.alpha = line === sunOuterRing ? amount * (1 - (zones[0]?.fade ?? 0)) : amount;
			line.isVisible = line.alpha > 0.01;
		}
	};

	const setCorona = (size: number) => {
		coronaNow = size;
		sun.setCorona(size);
	};

	const zones: ZoneShell[] = [];
	const addZone = (name: string, view: DemoView, radius: number, color: Color3, parent: TransformNode | null) => {
		const zone = buildZone(scene, name, view, radius, color, zones.length);
		zone.shell.parent = parent;
		glow.addExcludedMesh(zone.shell);
		zones.push(zone);
	};
	addZone("sun", "sun-outer", SUN_OUTER_ORBIT, OUTER_RING_COLOR, null);
	for (const body of bodies) {
		addZone(
			body.spec.name,
			planetOrbitView(body.spec.name, "outer"),
			bodyOuterRadius(body.spec.name),
			OUTER_RING_COLOR,
			body.anchor
		);
		body.moons.forEach((orbiter, index) => {
			const moon = body.spec.moons[index];
			addZone(
				moon.name,
				moonView(body.spec.name, moon.name, "outer"),
				moonOuterOrbitRadius(moon.diameter),
				moon.name === "moon" ? ZONE_BONE : OUTER_RING_COLOR,
				orbiter.baseAnchor
			);
		});
	}

	/**
	 * On the chart, the shell of the body whose outer orbit is on screen, and only once the camera has
	 * arrived. The Sun's outer-orbit line gives way to its shell, so the boundary is never a hard circle.
	 * In the cockpit the shells follow the ship: a pilot sees the honeycomb of each body they are near.
	 */
	const origin = Vector3.Zero();
	let zoneClock = 0;
	const fadeZones = (deltaSeconds: number) => {
		zoneClock += deltaSeconds;
		const step = deltaSeconds / ZONE_FADE_SECONDS;
		for (const zone of zones) {
			const center = (zone.shell.parent as TransformNode | null)?.position ?? origin;
			const showing = piloting ? nearBody(ranger.position, center, zone.radius) : travel >= 1 && active === zone.view;
			const target = showing ? 1 : 0;
			zone.fade = zone.fade < target ? Math.min(target, zone.fade + step) : Math.max(target, zone.fade - step);
			const shown = zone.fade > 0.01;
			zone.shell.setEnabled(shown);
			if (shown) {
				zone.material.setFloat("fade", zone.fade);
				zone.material.setFloat("time", zoneClock);
			}
		}
		setOrbitLines(linesNow);
	};

	const planetNamed = (name: PlanetName): PlanetBody => {
		const body = bodies.find((candidate) => candidate.spec.name === name);
		if (!body) {
			throw new Error(`The system is missing ${name}.`);
		}
		return body;
	};

	const focusPosition = (focus: Focus): Vector3 => {
		if (focus === "sun") {
			return Vector3.Zero();
		}
		const moon = moonByName.get(focus);
		if (moon) {
			return moon.mesh.position;
		}
		return planetNamed(focus as PlanetName).mesh.position;
	};

	// The ship's azimuth around whatever it orbits, so Home can sit on it instead of a fixed angle.
	player.angle = () => {
		const center = focusPosition(player.host);
		return Math.atan2(ranger.position.z - center.z, ranger.position.x - center.x);
	};

	const focusRadius = (focus: Focus): number => {
		if (focus === "sun") {
			return SUN_DIAMETER / 2;
		}
		const moon = moonByName.get(focus);
		if (moon) {
			return moon.radius;
		}
		return planetNamed(focus as PlanetName).spec.diameter / 2;
	};

	const fillDistance = (bodyRadius: number, fill: number): number => {
		const halfVertical = camera.fov / 2;
		const halfHorizontal = Math.atan(Math.tan(halfVertical) * engine.getAspectRatio(camera));
		const halfShort = Math.min(halfVertical, halfHorizontal);
		return bodyRadius / Math.sin(halfShort * fill);
	};

	/** Closest distance at which a flat circle around the target, seen from this angle, fits both screen axes. */
	const fitDistance = (orbit: number, alpha: number, beta: number, fill: number): number => {
		const tanVertical = Math.tan(camera.fov / 2) * fill;
		const tanHorizontal = Math.tan(camera.fov / 2) * engine.getAspectRatio(camera) * fill;
		const back = new Vector3(Math.cos(alpha) * Math.sin(beta), Math.cos(beta), Math.sin(alpha) * Math.sin(beta));
		const forward = back.scale(-1);
		const right = Vector3.Cross(Vector3.Up(), forward).normalize();
		const up = Vector3.Cross(forward, right);
		const point = new Vector3();
		const fits = (distance: number) => {
			for (let i = 0; i < 64; i++) {
				const angle = (i / 64) * Math.PI * 2;
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
		let near = orbit * 0.5;
		let far = orbit * 20;
		for (let i = 0; i < 40; i++) {
			const middle = (near + far) / 2;
			if (fits(middle)) {
				far = middle;
			} else {
				near = middle;
			}
		}
		return far;
	};

	const goalFor = (view: DemoView): Pose => {
		const shot = SHOTS[view];
		const target = focusPosition(shot.focus).clone();
		if (shot.offset) {
			target.addInPlace(shot.offset);
		}
		let alpha = shot.alpha;
		if (shot.sunRelative) {
			alpha += sunAngle(focusPosition(shot.focus)) + Math.PI;
		}
		let radius = shot.fill ? fillDistance(focusRadius(shot.focus), shot.fill) : shot.radius;
		if (shot.reach) {
			radius = Math.max(radius, fillDistance(shot.reach, MOON_REACH_FILL));
		}
		// The arrival framing stays outside the zone, so the shell reads as a boundary around the body.
		if (view.endsWith("-outer")) {
			radius = Math.max(radius, bodyOuterRadius(shot.focus) * OUTER_VIEW_MARGIN);
		}
		if (shot.fitOrbit) {
			radius = fitDistance(shot.fitOrbit, alpha, shot.beta, ORBIT_FIT_FILL);
		}
		return { alpha, beta: shot.beta, radius, target };
	};
	camera.radius = goalFor("system").radius;

	const moonTurn = new Matrix();
	const earthSpin = new Matrix();
	// Scene angles are ecliptic longitudes: +X points at the March equinox and +Y is ecliptic north,
	// so angles grow counterclockwise when seen from above, the way the planets really go.
	const placeBodies = (deltaSeconds: number) => {
		const days = daysSinceJ2000(Date.now());
		for (const body of bodies) {
			const angle = planetLongitude(body.spec.name, days);
			body.mesh.position.set(Math.cos(angle) * body.spec.orbit, 0, Math.sin(angle) * body.spec.orbit);
			body.anchor.position.copyFrom(body.mesh.position);
			if (body === earth) {
				// Turn about the pole first, then lean the pole over.
				Matrix.RotationYToRef(greenwich - greenwichAngle(days), earthSpin);
				earthSpin.multiplyToRef(EARTH_TILT, earthSpin);
				Quaternion.FromRotationMatrixToRef(earthSpin, earthTurn);
			} else if (body.spec.day) {
				body.mesh.rotation.y = -wrapAngle((Math.PI * 2 * days) / body.spec.day);
			}
			for (const orbiter of body.moons) {
				const orbitAngle =
					orbiter === moon ? moonLongitude(days) : orbiter.phase + (Math.PI * 2 * days) / orbiter.period;
				Vector3.TransformCoordinatesFromFloatsToRef(
					Math.cos(orbitAngle) * orbiter.orbit,
					0,
					Math.sin(orbitAngle) * orbiter.orbit,
					orbiter.plane,
					orbiter.mesh.position
				);
				orbiter.mesh.position.addInPlace(body.mesh.position);
				orbiter.baseAnchor.position.copyFrom(orbiter.mesh.position);
				// Tidal lock: the near side always faces the planet, so a moon turns once per orbit,
				// about the axis of its own orbit plane.
				Matrix.RotationYToRef(nearSide - (orbitAngle + Math.PI), moonTurn);
				moonTurn.multiplyToRef(orbiter.plane, moonTurn);
				Quaternion.FromRotationMatrixToRef(moonTurn, orbiter.turn);
			}
		}

		if (!journey.ship()) {
			shipAngle += deltaSeconds * 0.35 * ORBIT_PACE;
			idlePoint.set(
				earth.mesh.position.x + Math.cos(shipAngle) * EARTH_STATION_RADIUS,
				0,
				earth.mesh.position.z + Math.sin(shipAngle) * EARTH_STATION_RADIUS
			);
			idleHeading.set(-Math.sin(shipAngle), 0, Math.cos(shipAngle));
			ranger.drive("impulse", 0);
			ranger.place(idlePoint, idleHeading, deltaSeconds);
		}

		for (const base of spinningBases) {
			base.angle += deltaSeconds * BASE_SPIN * ORBIT_PACE;
			base.mesh.position.set(Math.cos(base.angle) * base.radius, 0, Math.sin(base.angle) * base.radius);
			base.mesh.rotation.y = -base.angle;
		}

		swarm.update(deltaSeconds * ORBIT_PACE);
		sun.update(deltaSeconds);
	};

	const sphereObstacles = (): SphereBody[] => {
		const obstacles: SphereBody[] = [{ center: Vector3.Zero(), radius: SUN_DIAMETER / 2 }];
		for (const body of bodies) {
			obstacles.push({ center: body.mesh.position.clone(), radius: body.spec.diameter / 2 });
			for (const orbiter of body.moons) {
				obstacles.push({ center: orbiter.mesh.position.clone(), radius: orbiter.radius });
			}
		}
		return obstacles;
	};

	const ringObstacles = (): RingBody[] => [saturnRing(saturn.mesh.position)];

	const widenCamera = () => {
		camera.lowerBetaLimit = 0.0001;
		camera.upperBetaLimit = Math.PI - 0.0001;
		camera.lowerRadiusLimit = 0.05;
		camera.upperRadiusLimit = 50000;
		camera.minZ = 0.1;
		camera.inertialAlphaOffset = 0;
		camera.inertialBetaOffset = 0;
		camera.inertialRadiusOffset = 0;
		camera.inertialPanningX = 0;
		camera.inertialPanningY = 0;
	};

	/** The inner-orbit shot of a body view. */
	const innerViewOf = (view: DemoView): DemoView =>
		view.endsWith("-inner") ? view : (view.replace(/-outer$/, "-inner") as DemoView);

	/**
	 * Closest a scroll may bring the camera, and no closer than the shot it arrived on.
	 * From the system the camera stays outside every planet, so an outer orbit is a click.
	 * From a body it stops at that body's inner orbit, short of the surface.
	 */
	const closestRadius = (view: DemoView): number => {
		const arrived = goalFor(view).radius;
		if (view === "system") {
			let outside = goalFor("sun-outer").radius;
			for (const spec of PLANETS) {
				outside = Math.max(outside, spec.orbit + goalFor(planetOrbitView(spec.name, "outer")).radius);
			}
			return Math.min(arrived, outside);
		}
		return Math.min(arrived, goalFor(innerViewOf(view)).radius);
	};
	camera.lowerRadiusLimit = closestRadius("system");

	const restoreCamera = () => {
		camera.lowerBetaLimit = CAMERA_BETA_MIN;
		camera.upperBetaLimit = CAMERA_BETA_MAX;
		const arrived = goalFor(active).radius;
		const limits = wheelLimits(active, arrived, closestRadius(active), CAMERA_RADIUS_MAX);
		camera.lowerRadiusLimit = limits.near;
		camera.upperRadiusLimit = limits.far;
		if (camera.radius < limits.near || camera.radius > limits.far) {
			camera.inertialRadiusOffset = 0;
			camera.radius = Math.min(limits.far, Math.max(limits.near, camera.radius));
		}
	};

	const applyWorld = (position: Vector3, target: Vector3) => {
		const offset = position.subtract(target);
		let radius = offset.length();
		if (radius < 0.05) {
			radius = 0.05;
		}
		const beta = Math.min(
			Math.PI - 0.0001,
			Math.max(0.0001, Math.acos(Math.min(1, Math.max(-1, offset.y / radius))))
		);
		camera.target.copyFrom(target);
		camera.radius = radius;
		camera.beta = beta;
		camera.alpha = Math.atan2(offset.z, offset.x);
	};

	const makeFlight = (fromPose: Pose, goal: Pose): Flight => {
		const startWorld = cameraWorldPosition(fromPose.alpha, fromPose.beta, fromPose.radius, fromPose.target);
		const endWorld = cameraWorldPosition(goal.alpha, goal.beta, goal.radius, goal.target);
		const points = routeAroundBodies(startWorld, endWorld, sphereObstacles(), ringObstacles());
		const cumulative = [0];
		for (let i = 1; i < points.length; i++) {
			cumulative.push(cumulative[i - 1] + Vector3.Distance(points[i - 1], points[i]));
		}
		return {
			points,
			cumulative,
			total: cumulative[cumulative.length - 1],
			endWorld,
			fromTarget: fromPose.target.clone(),
		};
	};

	/** The craft a click chose. While its inner orbit is on screen, the camera keeps its azimuth. */
	let riding: Craft | null = null;
	/** Set by a click, then taken by the next camera move when that move opens the craft's view. */
	let chosen: Craft | null = null;

	scene.onBeforeRenderObservable.add(() => {
		const deltaSeconds = engine.getDeltaTime() / 1000;
		const before = sunAngle(focusPosition(SHOTS[active].focus));
		placeBodies(deltaSeconds);
		journey.update(deltaSeconds, focusPosition);
		cockpit.update();
		// An arrival can open another view from inside the update, so the shot is read after it.
		const shot = SHOTS[active];
		fadeZones(deltaSeconds);

		if (travel >= 1) {
			camera.minZ = 0.1;
			restoreCamera();
			if (dolly) {
				dolly.t = Math.min(1, dolly.t + deltaSeconds / TRAVEL_SECONDS);
				const eased = dolly.t * dolly.t * (3 - 2 * dolly.t);
				camera.radius = dolly.from + (dolly.to - dolly.from) * eased;
				if (dolly.t >= 1) {
					dolly = null;
					if (!piloting) {
						attachChartCamera(camera, canvas);
					}
				}
			}
			if (shot.ride) {
				camera.target.copyFrom(focusPosition(shot.focus));
				// The ship is placed by the journey, so its angle is read from where it is. Other craft
				// advance on their own rate.
				if (riding?.id === "player-ship") {
					camera.alpha = riding.angle();
				} else {
					camera.alpha += (riding?.view === active ? riding.rate : rideSpeed(shot.focus)) * deltaSeconds;
				}
				return;
			}
			if (shot.focus !== "sun") {
				camera.target.copyFrom(focusPosition(shot.focus));
			}
			if (shot.sunRelative) {
				camera.alpha += wrapAngle(sunAngle(focusPosition(shot.focus)) - before);
			}
			return;
		}

		const goal = goalFor(active);
		// Arrive on the craft's own azimuth, which keeps moving during the flight.
		if (riding?.view === active) {
			goal.alpha = riding.angle();
		}
		travel = Math.min(1, travel + deltaSeconds / moveSeconds);
		const eased = travel * travel * (3 - 2 * travel);
		if (travel >= 1 || !flight) {
			camera.alpha = goal.alpha;
			camera.beta = goal.beta;
			camera.radius = goal.radius;
			camera.target.copyFrom(goal.target);
			camera.minZ = 0.1;
			restoreCamera();
			if (!piloting) {
				attachChartCamera(camera, canvas);
			}
		} else {
			widenCamera();
			const liveEnd = cameraWorldPosition(goal.alpha, goal.beta, goal.radius, goal.target);
			const position = pointAlong(flight, eased).add(liveEnd.subtract(flight.endWorld).scale(eased));
			applyWorld(position, Vector3.Lerp(flight.fromTarget, goal.target, eased));
		}
		const linesGoal = shot.closeUp ? 0 : 1;
		setOrbitLines(linesFrom + (linesGoal - linesFrom) * eased);
		const coronaGoal = shot.corona ?? 1;
		setCorona(coronaFrom + (coronaGoal - coronaFrom) * eased);
	});

	const animateTo = (view: DemoView) => {
		riding = chosen?.view === view ? chosen : null;
		chosen = null;
		dolly = null;
		clearScan();
		camera.detachControl();
		widenCamera();
		from = snapshot(camera);
		linesFrom = linesNow;
		coronaFrom = coronaNow;
		active = view;
		moveSeconds = travelSeconds(view);
		travel = 0;
		// Positions come from the clock, so refresh them before the path is measured against the bodies.
		placeBodies(0);
		moonByName.get(SHOTS[view].focus)?.sharpen?.();
		flight = makeFlight(from, goalFor(view));
	};

	const hitRadius = (id: string): number =>
		id === "saturn" ? (saturn.spec.diameter / 2) * SATURN_RING_OUTER_SCALE : focusRadius(id);

	const projected = new Vector3();
	const spotFor = (target: BodyTarget): BodySpot | null => {
		const center = focusPosition(target.id);
		const viewport = camera.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight);
		Vector3.ProjectToRef(center, Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport, projected);
		if (projected.z < 0 || projected.z > 1) {
			return null;
		}
		const depth = Vector3.Distance(camera.globalPosition, center);
		const radius = (hitRadius(target.id) / (depth * Math.tan(camera.fov / 2))) * (canvas.clientHeight / 2);
		return { target, x: projected.x, y: projected.y, radius };
	};

	/** Extra pixels around a named craft, so a small dot can still be clicked. */
	const CRAFT_HIT_PAD = 10;
	const craftById = new Map(crafts.map((craft) => [craft.id, craft]));
	const craftPoint = new Vector3();

	/** A craft on screen, with its radius in CSS pixels. Null when it is behind the camera. */
	const craftSpot = (craft: Craft): { x: number; y: number; radius: number } | null => {
		const viewport = camera.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight);
		const world = craft.position(craftPoint);
		Vector3.ProjectToRef(world, Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport, projected);
		if (projected.z < 0 || projected.z > 1) {
			return null;
		}
		const depth = Vector3.Distance(camera.globalPosition, world);
		const radius = craft.marker?.() ?? (craft.reach / (depth * Math.tan(camera.fov / 2))) * (canvas.clientHeight / 2);
		return { x: projected.x, y: projected.y, radius };
	};

	const craftFound = (craft: Craft): ScanTarget => ({
		id: craft.id,
		host: craft.host,
		kind: craft.kind as ScanKind,
		owner: craft.owner,
	});

	const clearScan = () => {
		publishFraming(false);
		if (found.length > 0) {
			found = [];
			for (const listener of foundListeners) {
				listener(found);
			}
		}
	};

	/** True when both lists name the same things. Order does not matter: craft swap rank as they move. */
	const sameFound = (left: ScanTarget[], right: ScanTarget[]): boolean => {
		if (left.length !== right.length) {
			return false;
		}
		const ids = (list: ScanTarget[]) => list.map((target) => target.id).sort();
		const a = ids(left);
		const b = ids(right);
		return a.every((id, index) => id === b[index]);
	};

	/**
	 * What this framing names that is on screen and not behind a body, nearest the camera first.
	 * A body counts from its surface. Craft are named only for the focused body, and only once the
	 * camera is in on that body. A swing changes which of them are near.
	 */
	const runScan = (): ScanTarget[] => {
		const eye = camera.globalPosition;
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		const viewport = camera.viewport.toGlobal(width, height);
		const onScreen = (world: Vector3) => {
			Vector3.ProjectToRef(world, Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport, projected);
			return projected.z >= 0 && projected.z <= 1 && projected.x >= 0 && projected.x <= width && projected.y >= 0 && projected.y <= height;
		};
		const focus = chartBodies(active).at(-1);
		if (focus) {
			const standOff = closeOrbitDistance(
				fillDistance(focusRadius(focus.id), MOON_OUTER_FILL),
				bodyOuterRadius(focus.id)
			);
			publishFraming(holdClose(camera.radius, standOff, namingCraft));
		} else {
			publishFraming(false);
		}
		const scope = scanScope(active, namingCraft);
		const named = new Set(scope.bodies.map((body) => body.id));
		const occluders = scanTargets(active).map((target) => ({
			center: focusPosition(target.id),
			radius: focusRadius(target.id),
		}));
		const seen: { target: ScanTarget; distance: number }[] = [];
		for (const body of scope.bodies) {
			const center = focusPosition(body.id);
			if (onScreen(center)) {
				const radius = focusRadius(body.id);
				seen.push({ target: bodyFound(body.id), distance: Math.max(0, Vector3.Distance(eye, center) - radius) });
			}
		}
		if (scope.craftHost && named.has(scope.craftHost)) {
			for (const craft of crafts) {
				if (craft === player || craft.host !== scope.craftHost) {
					continue;
				}
				const at = craft.position(craftPoint);
				if (!onScreen(at) || occluders.some((body) => blocked(eye, at, body.center, body.radius))) {
					continue;
				}
				seen.push({ target: craftFound(craft), distance: Vector3.Distance(eye, at) });
			}
		}
		return seen
			.sort((a, b) => a.distance - b.distance)
			.slice(0, SCAN_LIMIT)
			.map((entry) => entry.target);
	};

	/**
	 * The named craft nearest the point. The whole-system map names bodies only. A craft that was not
	 * named cannot be picked, however large it is.
	 */
	const craftAt = (x: number, y: number): Craft | null => {
		if (!scanning || piloting || travel < 1 || active === "system") {
			return null;
		}
		const candidates = found.flatMap((target) => craftById.get(target.id) ?? []);
		let best: Craft | null = null;
		let bestScore = 1;
		for (const craft of candidates) {
			const spot = craftSpot(craft);
			if (!spot) {
				continue;
			}
			const score = Math.hypot(spot.x - x, spot.y - y) / (spot.radius + CRAFT_HIT_PAD);
			if (score <= bestScore) {
				best = craft;
				bestScore = score;
			}
		}
		return best;
	};

	/** The named body nearest the point, measured against how big each one is on screen. */
	const hitAt = (x: number, y: number): BodySpot | null => {
		if (!scanning || piloting || travel < 1) {
			return null;
		}
		const scanned = new Set(found.map((target) => target.id));
		const targets = scanTargets(active).filter((target) => scanned.has(target.id));
		let best: BodySpot | null = null;
		let bestScore = 1;
		for (const target of targets) {
			const spot = spotFor(target);
			if (!spot) {
				continue;
			}
			const score = Math.hypot(spot.x - x, spot.y - y) / Math.max(spot.radius + 4, MIN_HIT_PIXELS);
			if (score <= bestScore) {
				best = spot;
				bestScore = score;
			}
		}
		return best;
	};

	const selectListeners = new Set<(target: BodyTarget) => void>();
	const scanListeners = new Set<(target: ScanTarget) => void>();
	const foundListeners = new Set<(found: ScanTarget[]) => void>();
	const picker = trackPicks(
		canvas,
		scene,
		(x, y) => {
			if (!scanning) {
				return null;
			}
			berthPlayer();
			const craft = craftAt(x, y);
			const body = hitAt(x, y)?.target.id ?? null;
			// The body the view is on is named along with the craft that circle it, so the craft wins.
			return craft?.id ?? body;
		},
		(id) => {
			if (!scanning) {
				return;
			}
			const craft = craftById.get(id);
			const target = craft ? craftFound(craft) : bodyFound(id);
			for (const listener of scanListeners) {
				listener(target);
			}
		}
	);

	// Bodies move under a still pointer and under their names, so both are found again every frame.
	const labelListeners = new Set<(frame: LabelFrame) => void>();
	const center = { x: 0, y: 0 };
	scene.onAfterRenderObservable.add(() => {
		const step = engine.getDeltaTime() / 1000 / LABEL_FADE_SECONDS;
		labelFade = !piloting && travel >= 1 ? Math.min(1, labelFade + step) : 0;
		if (scanning && !piloting && travel >= 1) {
			const next = runScan();
			if (!sameFound(next, found)) {
				found = next;
				for (const listener of foundListeners) {
					listener(found);
				}
			}
		}
		const hovered = picker.update();
		if (labelListeners.size === 0) {
			return;
		}
		const viewport = camera.viewport.toGlobal(canvas.clientWidth, canvas.clientHeight);
		Vector3.ProjectToRef(focusPosition(SHOTS[active].focus), Matrix.IdentityReadOnly, scene.getTransformMatrix(), viewport, projected);
		center.x = projected.x;
		center.y = projected.y;
		const anchors = (scanning ? found : []).flatMap((target) => {
			const craft = craftById.get(target.id);
			const spot = craft ? craftSpot(craft) : spotFor(bodyTarget(target.id));
			return spot
				? [{ id: target.id, x: spot.x, y: spot.y, radius: spot.radius, away: awayFrom(center, spot.x, spot.y) }]
				: [];
		});
		const frame: LabelFrame = { anchors, hovered, opacity: labelFade };
		for (const listener of labelListeners) {
			listener(frame);
		}
	});

	const navListeners = new Set<(fix: NavFix) => void>();
	const navEdge = Math.max(...PLANETS.map((spec) => spec.orbit));
	/** The course in the plane, made once per flight. */
	const navCourse: { from: readonly Vector3[] | null; points: NavPoint[] } = { from: null, points: [] };
	scene.onAfterRenderObservable.add(() => {
		if (!piloting || navListeners.size === 0) {
			return;
		}
		const navBodies: NavBody[] = [{ id: "sun", x: 0, z: 0, radius: SUN_DIAMETER / 2, outer: SUN_OUTER_ORBIT, parent: null }];
		for (const body of bodies) {
			const id = body.spec.name;
			const at = body.mesh.position;
			navBodies.push({ id, x: at.x, z: at.z, radius: body.spec.diameter / 2, outer: bodyOuterRadius(id), parent: null });
			body.moons.forEach((orbiter, index) => {
				const moonId = body.spec.moons[index].name;
				const moonAt = orbiter.mesh.position;
				navBodies.push({ id: moonId, x: moonAt.x, z: moonAt.z, radius: orbiter.radius, outer: bodyOuterRadius(moonId), parent: id });
			});
		}
		const heading = journey.ship()?.heading ?? idleHeading;
		const course = journey.course();
		if (course && course.points !== navCourse.from) {
			navCourse.from = course.points;
			navCourse.points = course.points.map((point) => ({ x: point.x, z: point.z }));
		}
		const fix: NavFix = {
			ship: { x: ranger.position.x, z: ranger.position.z, hx: heading.x, hz: heading.z },
			bodies: navBodies,
			edge: navEdge,
			course: course ? { points: navCourse.points, progress: course.progress } : null,
		};
		for (const listener of navListeners) {
			listener(fix);
		}
	});

	placeBodies(0);
	picker.setIdleCursor("crosshair");
	if (options?.atShip) {
		berthPlayer();
		active = player.view;
		riding = player;
		const goal = goalFor(player.view);
		goal.alpha = player.angle();
		camera.alpha = goal.alpha;
		camera.beta = goal.beta;
		camera.radius = goal.radius;
		camera.target.copyFrom(goal.target);
		const shot = SHOTS[player.view];
		setOrbitLines(shot.closeUp ? 0 : 1);
		setCorona(shot.corona ?? 1);
		restoreCamera();
	}

	const closeRadiusFor = (id: string) =>
		closeOrbitDistance(fillDistance(focusRadius(id), MOON_OUTER_FILL), bodyOuterRadius(id));

	/** Moves the camera's distance, staying on this chart. The wheel comes back when it arrives. */
	const beginDolly = (to: number) => {
		if (Math.abs(camera.radius - to) < 0.05) {
			camera.radius = to;
			return;
		}
		camera.detachControl();
		camera.inertialRadiusOffset = 0;
		dolly = { from: camera.radius, to, t: 0 };
	};

	return {
		go: animateTo,
		view: () => active,
		home() {
			berthPlayer();
			chosen = player;
			for (const listener of selectListeners) {
				listener({ id: player.host, label: player.host, view: player.view });
			}
		},
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
		setScanning(on) {
			scanning = on;
			picker.setIdleCursor(on ? "crosshair" : "");
			clearScan();
		},
		onScan(listener) {
			scanListeners.add(listener);
			return () => {
				scanListeners.delete(listener);
			};
		},
		onScanFound(listener) {
			foundListeners.add(listener);
			listener(found);
			return () => {
				foundListeners.delete(listener);
			};
		},
		visit(target) {
			const craft = craftById.get(target.id);
			if (!craft) {
				const focus = chartBodies(active).at(-1)?.id;
				// Already on this body. A wide planet or Sun chart comes in. Anywhere closer stays put.
				if (focus === target.id) {
					if (active === `${target.id}-outer` && !namingCraft) {
						beginDolly(closeRadiusFor(target.id));
					}
					return;
				}
			}
			const place = craft ? { id: craft.host, label: craft.host, view: craft.view } : bodyTarget(target.id);
			// The listener starts the camera move, which takes the craft chosen here.
			chosen = craft ?? null;
			for (const listener of selectListeners) {
				listener(place);
			}
		},
		widen() {
			beginDolly(goalFor(active).radius);
		},
		onFraming(listener) {
			framingListeners.add(listener);
			listener(namingCraft);
			return () => {
				framingListeners.delete(listener);
			};
		},
		travel(target, onDone) {
			placeBodies(0);
			// Undocked and not flying, the ship is circling Earth, the way the bases turn.
			const docked = journey.docked();
			const fromId = docked?.id ?? "earth";
			const at = docked?.position ?? ranger.position.clone();
			const turn = docked?.turn ?? 1;
			const home = journeyLayout().bodies.find((body) => body.id === fromId);
			const origin =
				docked?.dock && home ? home.center.add(hoverDeparture(docked.dock, home.outer)) : at;
			const radius = home ? Math.hypot(origin.x - home.center.x, origin.z - home.center.z) : 0;
			const rate = docked?.rate ?? 0.35 * ORBIT_PACE;
			const depart = { at: origin, turn, speed: Math.abs(rate) * radius };
			const plan = planJourney(journeyLayout(), fromId, target.host, depart);
			const dock = target.id === target.host ? undefined : dockById.get(target.id);
			journey.start(
				{
					...plan,
					arrive: { ...plan.arrive, dock },
					departDock: docked?.dock,
					departBody: docked?.dock ? fromId : undefined,
				},
				onDone
			);
		},
		land: journey.stop,
		setPiloting(on) {
			if (piloting === on) {
				return;
			}
			piloting = on;
			ranger.setPiloted(on);
			cockpit.setActive(on);
			journey.setPiloting(on);
			if (on) {
				camera.detachControl();
			} else if (travel >= 1) {
				attachChartCamera(camera, canvas);
			}
		},
		setViewpoint: cockpit.setViewpoint,
		zoom(direction) {
			if (piloting || travel < 1 || dolly) {
				return;
			}
			nudgeChartZoom(camera, direction);
		},
		onNav(listener) {
			navListeners.add(listener);
			return () => {
				navListeners.delete(listener);
			};
		},
	};
}

function pointAlong(flight: Flight, amount: number): Vector3 {
	if (flight.total < 1e-4) {
		return flight.points[0].clone();
	}
	const distance = flight.total * amount;
	let index = 1;
	while (index < flight.cumulative.length - 1 && flight.cumulative[index] < distance) {
		index += 1;
	}
	const span = flight.cumulative[index] - flight.cumulative[index - 1];
	const local = span < 1e-6 ? 0 : (distance - flight.cumulative[index - 1]) / span;
	return Vector3.Lerp(flight.points[index - 1], flight.points[index], local);
}

function snapshot(camera: ArcRotateCamera): Pose {
	return {
		alpha: camera.alpha,
		beta: camera.beta,
		radius: camera.radius,
		target: camera.target.clone(),
	};
}

function wrapAngle(angle: number): number {
	return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Direction from the Sun to a point, in the same angle convention as the camera's alpha. */
function sunAngle(position: Vector3): number {
	return Math.atan2(position.z, position.x);
}

/**
 * Stars and the Milky Way's glow, both centered on the camera so they never shift as it moves.
 * Returns the meshes so the caller can keep them out of the glow layer.
 */
function buildStarfield(scene: Scene): Mesh[] {
	const pole = GALAXY_POLE.normalizeToNew();
	const center = GALAXY_CENTER_HINT.subtract(pole.scale(Vector3.Dot(GALAXY_CENTER_HINT, pole))).normalize();
	return [buildMilkyWay(scene, pole, center), buildStars(scene, pole, center)];
}

/**
 * One point per star, drawn as a single batch. Point size is in screen pixels, so stars stay sharp
 * at every zoom. Magnitudes follow the real sky: each step fainter has about three times as many stars.
 */
function buildStars(scene: Scene, pole: Vector3, center: Vector3): Mesh {
	const random = seededRandom(31);
	const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(Math.PI * 2 * random());
	const side = Vector3.Cross(pole, center);
	const total = STAR_COUNT + BAND_STAR_COUNT;
	const positions = new Float32Array(total * 3);
	const colors = new Float32Array(total * 4);
	const sizes = new Float32Array(total);
	const direction = new Vector3();

	for (let i = 0; i < total; i++) {
		let brightest = STAR_BRIGHTEST;
		if (i < STAR_COUNT) {
			const y = random() * 2 - 1;
			const around = random() * Math.PI * 2;
			const flat = Math.sqrt(1 - y * y);
			direction.set(Math.cos(around) * flat, y, Math.sin(around) * flat);
		} else {
			// Band stars crowd toward the galaxy's center and are mostly too faint to pick out alone.
			const along = random() < 0.5 ? random() * Math.PI * 2 : gaussian() * 0.9;
			const across = gaussian() * (0.05 + 0.06 * Math.exp(-along * along));
			const ring = Math.cos(across);
			direction
				.copyFrom(center)
				.scaleInPlace(Math.cos(along) * ring)
				.addInPlace(side.scale(Math.sin(along) * ring))
				.addInPlace(pole.scale(Math.sin(across)));
			brightest = 2.5;
		}
		direction.normalize().scaleInPlace(SKY_RADIUS);
		direction.toArray(positions, i * 3);

		const low = Math.pow(10, STAR_GROWTH * brightest);
		const high = Math.pow(10, STAR_GROWTH * STAR_FAINTEST);
		const magnitude = Math.log10(low + random() * (high - low)) / STAR_GROWTH;
		const bright = (STAR_FAINTEST - magnitude) / (STAR_FAINTEST - STAR_BRIGHTEST);

		const tint = starTint(random());
		const level = 0.22 + 0.78 * Math.pow(bright, 1.4);
		colors.set([tint.r, tint.g, tint.b, level], i * 4);
		sizes[i] = 1.3 + 3.2 * Math.pow(bright, 2.2);
	}

	const stars = new Mesh("stars", scene);
	// Without indices Babylon skips the mesh unless it is marked as unindexed.
	stars.isUnIndexed = true;
	stars.setVerticesData(VertexBuffer.PositionKind, positions, false, 3);
	stars.setVerticesData(VertexBuffer.ColorKind, colors, false, 4);
	stars.setVerticesData("starSize", sizes, false, 1);

	const material = new ShaderMaterial(
		"stars",
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
					float disc = 1.0 - smoothstep(0.45, 1.0, edge);
					gl_FragColor = vec4(vColor.rgb * vColor.a * disc, 1.0);
				}
			`,
		},
		{ attributes: ["position", "color", "starSize"], uniforms: ["worldViewProjection", "pixelRatio"], needAlphaBlending: true }
	);
	material.setFloat("pixelRatio", 1 / scene.getEngine().getHardwareScalingLevel());
	material.pointsCloud = true;
	material.alphaMode = Constants.ALPHA_ADD;
	material.disableDepthWrite = true;
	stars.material = material;
	return finishSky(stars);
}

/** Mostly white, some pale blue, some warm; real star colors are faint at a glance. */
function starTint(pick: number): Color3 {
	if (pick < 0.55) {
		return new Color3(1, 1, 1);
	}
	if (pick < 0.75) {
		return new Color3(0.8, 0.88, 1);
	}
	if (pick < 0.9) {
		return new Color3(1, 0.94, 0.82);
	}
	return new Color3(1, 0.8, 0.6);
}

/** Soft, uneven light along the galaxy's plane, brightest toward its center. */
function buildMilkyWay(scene: Scene, pole: Vector3, center: Vector3): Mesh {
	const sky = MeshBuilder.CreateSphere("milky-way", { diameter: SKY_RADIUS * 2.1, segments: 48 }, scene);
	const material = new ShaderMaterial(
		"milky-way",
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
				uniform vec3 center;
				uniform vec3 tint;
				uniform float strength;
				varying vec3 vDirection;
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
				void main() {
					vec3 direction = normalize(vDirection);
					float across = dot(direction, pole);
					float fromCenter = acos(clamp(dot(direction, center), -1.0, 1.0));
					float core = exp(-fromCenter * fromCenter / 0.9);
					float width = 0.08 + 0.07 * core;
					float band = exp(-across * across / (2.0 * width * width));
					float mottle = 0.55 * noise(direction * 5.0) + 0.45 * noise(direction * 13.0);
					float rift = smoothstep(0.5, 0.75, noise(direction * 8.0 + 3.0)) * exp(-across * across / 0.0015);
					float light = band * (0.35 + 0.65 * core) * (0.4 + mottle) * (1.0 - 0.55 * rift);
					gl_FragColor = vec4(tint * light * strength, 1.0);
				}
			`,
		},
		{ attributes: ["position"], uniforms: ["worldViewProjection", "pole", "center", "tint", "strength"], needAlphaBlending: true }
	);
	material.setVector3("pole", pole);
	material.setVector3("center", center);
	material.setColor3("tint", new Color3(0.62, 0.66, 0.8));
	material.setFloat("strength", MILKY_WAY_GLOW);
	material.backFaceCulling = false;
	material.alphaMode = Constants.ALPHA_ADD;
	material.disableDepthWrite = true;
	sky.material = material;
	return finishSky(sky);
}

/** Follows the camera, draws before every other see-through mesh, and is never culled or picked. */
function finishSky(mesh: Mesh): Mesh {
	mesh.infiniteDistance = true;
	mesh.alphaIndex = 0;
	mesh.alwaysSelectAsActiveMesh = true;
	mesh.isPickable = false;
	return mesh;
}

type SunBody = {
	corona: Mesh;
	setCorona(size: number): void;
	update(deltaSeconds: number): void;
};

function buildSun(scene: Scene): SunBody {
	const material = new StandardMaterial("sun", scene);
	material.emissiveColor = Color3.Black();
	material.emissiveTexture = buildSunSurface(scene);
	material.disableLighting = true;
	// Fresnel darkens by how square the surface faces the camera. From the cockpit that facing
	// point sits off the disc, so the whole photosphere shades like a lit ball. The rim follows the
	// silhouette instead.
	new SunLimbPlugin(material);
	const sun = MeshBuilder.CreateSphere("sun", { diameter: SUN_DIAMETER, segments: 64 }, scene);
	sun.material = material;
	sun.isPickable = false;

	// Wider than the halo so the ring still reaches past the limb when the camera is close. A flat
	// texture paints the glow at the Sun's radius, and perspective puts the limb outside that circle.
	const corona = MeshBuilder.CreatePlane("corona", { size: SUN_DIAMETER * CORONA_SCALE * 3 }, scene);
	const coronaMaterial = new ShaderMaterial(
		"corona",
		scene,
		{
			vertexSource: `
				precision highp float;
				attribute vec3 position;
				uniform mat4 world;
				uniform mat4 worldViewProjection;
				varying vec3 vPositionW;
				varying vec2 vPlane;
				void main() {
					vec4 worldPos = world * vec4(position, 1.0);
					vPositionW = worldPos.xyz;
					vPlane = position.xy;
					gl_Position = worldViewProjection * vec4(position, 1.0);
				}
			`,
			fragmentSource: `
				precision highp float;
				uniform vec3 eye;
				uniform vec3 sunCenter;
				uniform float sunRadius;
				uniform float haloWidth;
				varying vec3 vPositionW;
				varying vec2 vPlane;
				void main() {
					vec3 ray = normalize(vPositionW - eye);
					float impact = length(cross(sunCenter - eye, ray));
					float beyond = impact - sunRadius;
					if (beyond <= 0.0) {
						gl_FragColor = vec4(0.0);
						return;
					}
					float t = clamp(beyond / haloWidth, 0.0, 1.0);
					float glow = exp(-t * 5.5);
					float ang = atan(vPlane.y, vPlane.x);
					float stream = pow(abs(sin(ang * 9.0)), 8.0) * exp(-t * 2.2);
					vec3 color = vec3(1.0, 0.86, 0.62) * glow * 0.55 + vec3(1.0, 0.7, 0.35) * stream * 0.08;
					gl_FragColor = vec4(color, 1.0);
				}
			`,
		},
		{
			attributes: ["position"],
			uniforms: ["world", "worldViewProjection", "eye", "sunCenter", "sunRadius", "haloWidth"],
			needAlphaBlending: true,
		}
	);
	coronaMaterial.alphaMode = Constants.ALPHA_ADD;
	coronaMaterial.backFaceCulling = false;
	coronaMaterial.disableDepthWrite = true;
	coronaMaterial.setFloat("sunRadius", SUN_DIAMETER / 2);
	// The scene is drawn around the camera, so the eye and the Sun both arrive shifted by the same offset.
	coronaMaterial.onBindObservable.add(() => {
		const effect = coronaMaterial.getEffect();
		if (effect) {
			scene.bindEyePosition(effect, "eye", true);
			const offset = scene.floatingOriginOffset;
			effect.setFloat3("sunCenter", -offset.x, -offset.y, -offset.z);
		}
	});
	corona.material = coronaMaterial;
	corona.billboardMode = Mesh.BILLBOARDMODE_ALL;
	corona.isPickable = false;

	let elapsed = 0;
	let size = 1;
	const applyCorona = (span: number) => {
		corona.scaling.setAll(span);
		const width = (SUN_DIAMETER / 2) * (CORONA_SCALE * span - 1);
		coronaMaterial.setFloat("haloWidth", Math.max(width, 0.001));
	};
	applyCorona(1);
	return {
		corona,
		setCorona(next) {
			size = next;
		},
		update(deltaSeconds) {
			elapsed += deltaSeconds;
			sun.rotation.y += SUN_SPIN * deltaSeconds;
			applyCorona(size * (1 + 0.01 * Math.sin(elapsed * 0.7)));
		},
	};
}

/**
 * Reddens the outer part of the visible disc. The measure is how far the line of sight passes from
 * the Sun's center, so the rim stays on the silhouette from the system chart and from beside it.
 */
class SunLimbPlugin extends MaterialPluginBase {
	constructor(material: StandardMaterial) {
		super(material, "SunLimb", 200, { SUN_LIMB: false });
		this._enable(true);
	}

	override getClassName(): string {
		return "SunLimbPlugin";
	}

	override prepareDefines(defines: MaterialDefines): void {
		defines["SUN_LIMB"] = true;
	}

	override isReadyForSubMesh(): boolean {
		return true;
	}

	override getUniforms() {
		return {
			ubo: [{ name: "sunCenter", size: 3, type: "vec3" }],
			fragment: "#ifdef SUN_LIMB\nuniform vec3 sunCenter;\n#endif",
		};
	}

	// The scene is drawn around the camera, so the Sun's center arrives shifted away from the origin.
	override bindForSubMesh(uniformBuffer: UniformBuffer): void {
		const offset = this._material.getScene().floatingOriginOffset;
		uniformBuffer.updateFloat3("sunCenter", -offset.x, -offset.y, -offset.z);
	}

	override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
		if (shaderType !== "fragment") {
			return null;
		}
		const sunRadius = SUN_DIAMETER / 2;
		return {
			CUSTOM_FRAGMENT_BEFORE_FOG: `
				#ifdef SUN_LIMB
				float sunImpact = length(cross(vPositionW - sunCenter, viewDirectionW));
				float sunRho = clamp(sunImpact / ${sunRadius.toFixed(1)}, 0.0, 1.0);
				float sunMu = sqrt(1.0 - sunRho * sunRho);
				color.rgb *= mix(vec3(1.0, 0.45, 0.12), vec3(1.0), pow(sunMu, 0.6)) * (0.55 + 0.45 * sunMu);
				#endif
			`,
		};
	}
}

/** Mottled surface: bright and dark cells, plus a few small spots near the equator. */
function buildSunSurface(scene: Scene): DynamicTexture {
	const width = 1024;
	const height = 512;
	const texture = new DynamicTexture("sun-surface", { width, height }, scene, true);
	const context = texture.getContext();
	const random = seededRandom(11);
	context.fillStyle = "rgb(255, 226, 158)";
	context.fillRect(0, 0, width, height);

	const blot = (x: number, y: number, radius: number, rgb: string, alpha: number) => {
		const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
		gradient.addColorStop(0, `rgba(${rgb}, ${alpha})`);
		gradient.addColorStop(1, `rgba(${rgb}, 0)`);
		context.fillStyle = gradient;
		context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
	};

	for (let i = 0; i < 9000; i++) {
		const bright = random() > 0.5;
		blot(
			random() * width,
			random() * height,
			2 + random() * 4,
			bright ? "255, 250, 225" : "240, 168, 84",
			0.12 + random() * 0.16
		);
	}
	for (let i = 0; i < 5; i++) {
		const x = random() * width;
		const y = height * (0.38 + random() * 0.24);
		blot(x, y, 7 + random() * 5, "210, 110, 40", 0.45);
		blot(x, y, 2 + random() * 2, "110, 45, 12", 0.65);
	}
	texture.update(false);
	return texture;
}

function buildPlanet(scene: Scene, name: string, diameter: number, color: Color3, texture?: string | Texture): Mesh {
	const material = new StandardMaterial(name, scene);
	if (texture) {
		material.diffuseTexture = typeof texture === "string" ? surfaceMap(scene, texture) : texture;
		material.diffuseColor = Color3.White();
		material.ambientColor = Color3.White().scale(NIGHT_SIDE);
	} else {
		material.diffuseColor = color;
		material.ambientColor = color.scale(NIGHT_SIDE);
	}
	material.specularColor = new Color3(0.05, 0.05, 0.05);
	const planet = MeshBuilder.CreateSphere(name, { diameter, segments: texture ? 64 : 48 }, scene);
	planet.material = material;
	return planet;
}

/**
 * Direction, as an angle around the vertical axis in the sphere's own space, of the point where the
 * middle of its surface map lands. On a moon map that point is the middle of the side facing the planet.
 */
function mapCenterAngle(sphere: Mesh): number {
	const positions = sphere.getVerticesData(VertexBuffer.PositionKind);
	const uvs = sphere.getVerticesData(VertexBuffer.UVKind);
	if (!positions || !uvs) {
		throw new Error(`${sphere.name} has no surface coordinates.`);
	}
	let closest = 0;
	let closestDistance = Infinity;
	for (let i = 0; i < uvs.length / 2; i++) {
		const distance = (uvs[i * 2] - 0.5) ** 2 + (uvs[i * 2 + 1] - 0.5) ** 2;
		if (distance < closestDistance) {
			closestDistance = distance;
			closest = i;
		}
	}
	return Math.atan2(positions[closest * 3 + 2], positions[closest * 3]);
}

/** A world map (twice as wide as tall) oriented so north is up on a Babylon sphere. */
function surfaceMap(scene: Scene, url: string): Texture {
	const texture = new Texture(url, scene);
	orientMap(texture);
	return texture;
}

function orientMap(texture: Texture): void {
	texture.uScale = -1;
	texture.vScale = -1;
}

/** City lights on the night side, plus a cloud shell. The cloud map is a single snapshot, so it turns with the ground. */
function dressEarth(scene: Scene, earth: Mesh, diameter: number): void {
	const material = earth.material as StandardMaterial;
	if (material.diffuseTexture) {
		material.diffuseTexture.level = EARTH_DAY_BOOST;
	}
	material.ambientColor = Color3.White().scale(NIGHT_SIDE / EARTH_DAY_BOOST);
	material.diffuseColor = Color3.White().scale(EARTH_SUNLIGHT);
	new NightLightsPlugin(material, new Texture("/textures/earth-night.jpg", scene));

	const cloudMap = surfaceMap(scene, "/textures/earth-clouds.jpg");
	cloudMap.getAlphaFromRGB = true;
	const cloudMaterial = new StandardMaterial("earth-clouds", scene);
	cloudMaterial.diffuseTexture = cloudMap;
	cloudMaterial.opacityTexture = cloudMap;
	cloudMaterial.diffuseColor = Color3.White().scale(EARTH_SUNLIGHT);
	cloudMaterial.ambientColor = Color3.White().scale(NIGHT_SIDE);
	cloudMaterial.specularColor = Color3.Black();
	cloudMaterial.alpha = 0.9;

	const clouds = MeshBuilder.CreateSphere("earth-clouds", { diameter: diameter * 1.012, segments: 64 }, scene);
	clouds.material = cloudMaterial;
	clouds.parent = earth;
	clouds.isPickable = false;
}

/**
 * Adds a lights texture only where the surface faces away from the Sun.
 * A plain emissive texture would glow on the day side too.
 */
class NightLightsPlugin extends MaterialPluginBase {
	constructor(
		material: StandardMaterial,
		private readonly lights: Texture
	) {
		super(material, "NightLights", 200, { NIGHT_LIGHTS: false });
		this._enable(true);
	}

	override getClassName(): string {
		return "NightLightsPlugin";
	}

	override prepareDefines(defines: MaterialDefines): void {
		defines["NIGHT_LIGHTS"] = true;
	}

	override isReadyForSubMesh(): boolean {
		return this.lights.isReady();
	}

	override getSamplers(samplers: string[]): void {
		samplers.push("nightLightsSampler");
	}

	override getUniforms() {
		return {
			ubo: [{ name: "sunCenter", size: 3, type: "vec3" }],
			fragment: "#ifdef NIGHT_LIGHTS\nuniform vec3 sunCenter;\n#endif",
		};
	}

	// The scene is drawn around the camera, so the Sun's center arrives shifted away from the origin.
	override bindForSubMesh(uniformBuffer: UniformBuffer): void {
		uniformBuffer.setTexture("nightLightsSampler", this.lights);
		const offset = this._material.getScene().floatingOriginOffset;
		uniformBuffer.updateFloat3("sunCenter", -offset.x, -offset.y, -offset.z);
	}

	override hasTexture(texture: BaseTexture): boolean {
		return texture === this.lights;
	}

	override getActiveTextures(activeTextures: BaseTexture[]): void {
		activeTextures.push(this.lights);
	}

	override getCustomCode(shaderType: string): { [pointName: string]: string } | null {
		if (shaderType !== "fragment") {
			return null;
		}
		return {
			CUSTOM_FRAGMENT_DEFINITIONS: "uniform sampler2D nightLightsSampler;",
			CUSTOM_FRAGMENT_BEFORE_FOG: `
				#ifdef NIGHT_LIGHTS
				float sunFacing = dot(normalW, normalize(sunCenter - vPositionW));
				float night = 1.0 - smoothstep(-0.12, 0.08, sunFacing);
				// The NASA map also shades dark land faintly; the floor keeps only the cities.
				vec3 cities = max(texture2D(nightLightsSampler, vDiffuseUV).rgb - 0.12, 0.0) * 1.15;
				color.rgb += cities * night;
				#endif
			`,
		};
	}
}

type ZoneShell = {
	view: DemoView;
	shell: Mesh;
	material: ShaderMaterial;
	fade: number;
	/** Outer-orbit radius. A pilot inside `LOCAL_REACH` of this sees the honeycomb. */
	radius: number;
};

function buildOrbit(scene: Scene, name: string, radius: number, color: Color3): LinesMesh {
	const points: Vector3[] = [];
	const steps = 180;
	for (let i = 0; i <= steps; i++) {
		const angle = (i / steps) * Math.PI * 2;
		points.push(new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
	}
	const ring = MeshBuilder.CreateLines(name, { points }, scene);
	ring.color = color.clone().scale(0.45);
	ring.isPickable = false;
	// The chart draws these. Cockpit cameras leave this layer out, so a pilot never sees an orbit line.
	ring.layerMask = CHART_LAYER;
	return ring;
}

/** Hexagons along each edge of the icosahedron the zone honeycomb is folded over. */
const ZONE_HEX_FREQUENCY = 5;

/** GLSL that keeps whichever of the icosahedron's 20 faces a direction falls on. */
function icosahedronFacePicks(): string {
	const phi = (1 + Math.sqrt(5)) / 2;
	const raw = [
		[-1, phi, 0],
		[1, phi, 0],
		[-1, -phi, 0],
		[1, -phi, 0],
		[0, -1, phi],
		[0, 1, phi],
		[0, -1, -phi],
		[0, 1, -phi],
		[phi, 0, -1],
		[phi, 0, 1],
		[-phi, 0, -1],
		[-phi, 0, 1],
	];
	// Neighbors on the unnormalized icosahedron are exactly 2 apart.
	const touching = (a: number[], b: number[]) => Math.abs(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) - 2) < 1e-6;
	const vec = (v: number[]) => {
		const length = Math.hypot(v[0], v[1], v[2]);
		return `vec3(${v.map((c) => (c / length).toFixed(6)).join(", ")})`;
	};
	const picks: string[] = [];
	for (let i = 0; i < raw.length; i++) {
		for (let j = i + 1; j < raw.length; j++) {
			for (let k = j + 1; k < raw.length; k++) {
				if (touching(raw[i], raw[j]) && touching(raw[j], raw[k]) && touching(raw[i], raw[k])) {
					picks.push(`face(direction, ${vec(raw[i])}, ${vec(raw[j])}, ${vec(raw[k])}, best, a, b, c);`);
				}
			}
		}
	}
	return picks.join("\n");
}

/**
 * A see-through honeycomb over the outer orbit, so the boundary reads from any angle without fogging the
 * body inside. The hexagons are folded over an icosahedron, so they stay even across the whole sphere;
 * its twelve corners close as pentagons. Mostly faint: a sweep circles the pole leaving a fading wake,
 * and a broad glow drifts over the sphere, so some part of the honeycomb is always brightening and
 * another dimming. The far side shows through, dimmer, and the silhouette glows faintly so the outline holds.
 */
function buildZone(scene: Scene, name: string, view: DemoView, radius: number, color: Color3, seed: number): ZoneShell {
	const material = new ShaderMaterial(
		`${name}-zone`,
		scene,
		{
			vertexSource: `
				precision highp float;
				attribute vec3 position;
				attribute vec3 normal;
				uniform mat4 world;
				uniform mat4 worldViewProjection;
				varying vec3 vLocal;
				varying vec3 vWorld;
				varying vec3 vNormal;
				void main() {
					gl_Position = worldViewProjection * vec4(position, 1.0);
					vLocal = position;
					vWorld = (world * vec4(position, 1.0)).xyz;
					vNormal = mat3(world) * normal;
				}
			`,
			fragmentSource: `
				#extension GL_OES_standard_derivatives : enable
				precision highp float;
				uniform vec3 eye;
				uniform vec3 tint;
				uniform float time;
				uniform float fade;
				uniform float seed;
				uniform float pixelRatio;
				varying vec3 vLocal;
				varying vec3 vWorld;
				varying vec3 vNormal;
				const float TAU = 6.2831853;

				void face(vec3 d, vec3 p0, vec3 p1, vec3 p2, inout float best, inout vec3 a, inout vec3 b, inout vec3 c) {
					float facing = dot(d, normalize(p0 + p1 + p2));
					if (facing > best) {
						best = facing;
						a = p0;
						b = p1;
						c = p2;
					}
				}

				void main() {
					vec3 direction = normalize(vLocal);
					float around = atan(direction.z, direction.x) / TAU + 0.5;

					// The face this direction falls on, flattened onto that face's plane. Hexagon centers sit
					// on a triangular lattice that shares its points along every edge with the next face.
					float best = -2.0;
					vec3 a = vec3(0.0);
					vec3 b = vec3(0.0);
					vec3 c = vec3(0.0);
					${icosahedronFacePicks()}
					vec3 n = normalize(a + b + c);
					vec3 onFace = direction * (dot(a, n) / dot(direction, n));
					vec3 xAxis = normalize(b - a);
					vec3 yAxis = normalize(c - a - dot(c - a, xAxis) * xAxis);
					float cellsPerUnit = ${ZONE_HEX_FREQUENCY.toFixed(1)} / length(b - a);
					vec2 cell = vec2(dot(onFace - a, xAxis), dot(onFace - a, yAxis)) * cellsPerUnit;

					// The nearest hexagon center, from the two rectangular halves of the triangular lattice.
					const vec2 ROW = vec2(1.0, 1.7320508);
					vec2 even = cell - ROW * floor(cell / ROW + 0.5);
					vec2 odd = cell - ROW * (floor(cell / ROW) + 0.5);
					vec2 local = abs(dot(even, even) < dot(odd, odd) ? even : odd);
					float toEdge = 0.5 - max(local.x, dot(local, vec2(0.5, 0.8660254)));

					// 1 on a cell wall about one CSS pixel wide. The scale comes from the sphere, not the
					// face, so it does not jump at a fold. Walls fade before they crowd at the silhouette.
					float perPixel = length(fwidth(direction)) * cellsPerUnit * pixelRatio;
					float lattice = (1.0 - smoothstep(0.0, perPixel, toEdge)) * (1.0 - smoothstep(0.25, 0.5, perPixel));

					// The sweep: a bright edge circling the pole with a wake that fades behind it.
					float t = time + seed * 17.0;
					float behind = fract(t * 0.05 - around);
					float sweep = max(exp(-behind * 6.0), exp(-(1.0 - behind) * 90.0));
					sweep *= 0.55 + 0.45 * cos(direction.y * 2.2 + t * 0.4);

					// The drift: a broad glow wandering over the sphere on a tilted path.
					vec3 toward = normalize(vec3(cos(t * 0.17), 0.55 * sin(t * 0.11), sin(t * 0.17)));
					float drift = pow(max(dot(direction, toward), 0.0), 4.0);

					vec3 view = normalize(eye - vWorld);
					float facing = abs(dot(normalize(vNormal), view));
					float rim = pow(1.0 - facing, 3.0);

					float near = gl_FrontFacing ? 1.0 : 0.3;
					// The sweep and the drift are a hint of where the border is, so neither reaches a glow
					// bright enough to read as a surface.
					float lit = 0.05 + 0.4 * drift + 0.45 * sweep;
					vec3 color = tint * (lattice * lit + rim * (0.08 + 0.16 * drift) + sweep * 0.012);
					color += vec3(0.1) * lattice * sweep * sweep;
					gl_FragColor = vec4(color * near * fade, 1.0);
				}
			`,
		},
		{
			attributes: ["position", "normal"],
			uniforms: ["world", "worldViewProjection", "eye", "tint", "time", "fade", "seed", "pixelRatio"],
			needAlphaBlending: true,
		}
	);
	// The scene is drawn around the camera, and `world` arrives shifted with it. The eye has to be shifted to match.
	material.onBindObservable.add(() => {
		const effect = material.getEffect();
		if (effect) {
			scene.bindEyePosition(effect, "eye", true);
		}
	});
	material.setColor3("tint", color);
	material.setFloat("seed", seed);
	material.setFloat("fade", 0);
	material.setFloat("time", 0);
	material.setFloat("pixelRatio", 1 / scene.getEngine().getHardwareScalingLevel());
	material.backFaceCulling = false;
	material.alphaMode = Constants.ALPHA_ADD;
	material.disableDepthWrite = true;
	const shell = MeshBuilder.CreateSphere(`${name}-zone`, { diameter: radius * 2, segments: 48 }, scene);
	shell.material = material;
	shell.isPickable = false;
	shell.setEnabled(false);
	return { view, shell, material, fade: 0, radius };
}

/**
 * A flat band whose map runs from the inner edge (left of the image) to the outer edge (right).
 * Radii are the real ring's proportions: 1.24 to 2.27 planet radii.
 */
function buildSaturnRing(scene: Scene, saturn: Mesh, planetRadius: number): Mesh {
	const inner = planetRadius * SATURN_RING_INNER_SCALE;
	const outer = planetRadius * SATURN_RING_OUTER_SCALE;
	const steps = 160;
	const positions: number[] = [];
	const normals: number[] = [];
	const uvs: number[] = [];
	const indices: number[] = [];
	for (let i = 0; i <= steps; i++) {
		const angle = (i / steps) * Math.PI * 2;
		const cos = Math.cos(angle);
		const sin = Math.sin(angle);
		positions.push(cos * inner, 0, sin * inner, cos * outer, 0, sin * outer);
		normals.push(0, 1, 0, 0, 1, 0);
		uvs.push(0, 0.5, 1, 0.5);
		if (i < steps) {
			const a = i * 2;
			indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
		}
	}
	// The bands run parallel to the ring. Tilt the sphere's own shape rather than the mesh, so each
	// moon path attached to Saturn sets its own plane (Iapetus is not in the ring plane).
	saturn.bakeTransformIntoVertices(Matrix.RotationX(SATURN_TILT));

	const ring = new Mesh("saturn-ring", scene);
	const data = new VertexData();
	data.positions = positions;
	data.normals = normals;
	data.uvs = uvs;
	data.indices = indices;
	data.applyToMesh(ring);

	const map = new Texture("/textures/saturn_ring_alpha.png", scene);
	map.hasAlpha = true;
	const material = new StandardMaterial("saturn-ring", scene);
	material.diffuseTexture = map;
	material.useAlphaFromDiffuseTexture = true;
	material.backFaceCulling = false;
	material.twoSidedLighting = true;
	material.ambientColor = Color3.White().scale(NIGHT_SIDE);
	material.specularColor = Color3.Black();
	// Sunlight strikes the ring at a shallow angle; ice scatters more light than a flat surface would.
	material.emissiveColor = new Color3(0.32, 0.32, 0.32);
	ring.material = material;
	ring.parent = saturn;
	ring.rotation.x = SATURN_TILT;
	ring.isPickable = false;
	return ring;
}

/** Radians per second before the game-speed scale. Slow enough that a base reads as orbiting, not as a moon. */
const BASE_SPIN = 0.06;

/** Angular speed of the craft the inner camera rides with. Matches the satellites or bases already in the scene. */
function rideSpeed(focus: Focus): number {
	if (focus === "sun") {
		return (ORBIT_PACE * SATELLITE_ORBIT_RATE) / Math.pow(SUN_INNER_RING, 1.5);
	}
	return BASE_SPIN * ORBIT_PACE;
}

type SpinningBase = {
	mesh: Mesh;
	angle: number;
	radius: number;
};

/** A craft circling a body. A click opens that body's inner orbit and the camera rides with this craft. */
type Craft = {
	id: string;
	host: string;
	view: DemoView;
	kind: Exclude<ScanKind, "star" | "planet" | "moon"> | "ship";
	owner?: SatelliteOwner;
	/** Half the craft's longest side, in world units, for the pointer. */
	reach: number;
	/** Radius of a screen-space marker in CSS pixels. Used instead of `reach` while that marker is drawn. */
	marker?: () => number | null;
	/** Radians per second the craft advances around its host. */
	rate: number;
	/** Azimuth around the host, in the same convention as the camera's alpha. */
	angle: () => number;
	position: (out: Vector3) => Vector3;
};

function buildHabitats(scene: Scene, bodies: PlanetBody[], crafts: Craft[]): SpinningBase[] {
	const materials = factionMaterials(scene);
	const spinning: SpinningBase[] = [];
	for (const body of bodies) {
		const placed = planetBases({
			diameter: body.spec.diameter,
			moons: body.spec.moons.map((moon) => ({ orbit: moon.orbit, diameter: moon.diameter })),
			stationRadius: body.spec.name === "earth" ? EARTH_STATION_RADIUS : undefined,
			homes: body.spec.name !== "earth",
			ringInnerScale: body.spec.name === "saturn" ? SATURN_RING_INNER_SCALE : undefined,
		});
		const inner = planetOrbitView(body.spec.name, "inner");
		addBaseSlots(scene, body.anchor, placed.warehouses, materials, `${body.spec.name}-warehouse`, spinning, crafts, body.spec.name, inner, "home");
		addBaseSlots(scene, body.anchor, placed.stations, materials, `${body.spec.name}-station`, spinning, crafts, body.spec.name, inner, "station");
		for (const moon of body.moons) {
			addBaseSlots(
				scene,
				moon.baseAnchor,
				moonBases(moon.radius * 2),
				materials,
				`${moon.mesh.name}-base`,
				spinning,
				crafts,
				moon.mesh.name,
				moonView(body.spec.name, moon.mesh.name, "inner"),
				"home"
			);
		}
	}
	return spinning;
}

function factionMaterials(scene: Scene): Record<Faction, StandardMaterial> {
	const materials = {} as Record<Faction, StandardMaterial>;
	for (const faction of ["corporate", "marauder"] as const) {
		const look = SATELLITE_LOOK[faction];
		const material = new StandardMaterial(`bases-${faction}`, scene);
		material.diffuseColor = look.color;
		material.emissiveColor = look.glow;
		material.specularColor = new Color3(0.2, 0.2, 0.2);
		materials[faction] = material;
	}
	return materials;
}

function addBaseSlots(
	scene: Scene,
	parent: TransformNode,
	slots: BaseSlot[],
	materials: Record<Faction, StandardMaterial>,
	name: string,
	spinning: SpinningBase[],
	crafts: Craft[],
	host: string,
	view: DemoView,
	kind: "home" | "station"
): void {
	slots.forEach((slot, index) => {
		const mesh = MeshBuilder.CreateBox(`${name}-${slot.faction}-${index}`, slot.size, scene);
		mesh.material = materials[slot.faction];
		mesh.parent = parent;
		mesh.isPickable = false;
		mesh.position.set(Math.cos(slot.angle) * slot.radius, 0, Math.sin(slot.angle) * slot.radius);
		mesh.rotation.y = -slot.angle;
		const craft: SpinningBase = { mesh, angle: slot.angle, radius: slot.radius };
		spinning.push(craft);
		crafts.push({
			id: mesh.name,
			host,
			view,
			kind,
			owner: slot.faction,
			reach: Math.max(slot.size.width, slot.size.depth) / 2,
			rate: BASE_SPIN * ORBIT_PACE,
			angle: () => craft.angle,
			position: (out) => out.copyFrom(mesh.getAbsolutePosition()),
		});
	});
}

type SatelliteOrbit = {
	radius: number;
	angle: number;
	speed: number;
	tilt: number;
	phase: number;
};

/**
 * Every satellite of one owner is a thin instance of a single box, so hundreds cost three draw calls.
 * Their matrices are rewritten each frame as they orbit.
 */
function buildSatelliteSwarm(
	scene: Scene,
	crafts: Craft[]
): { update: (deltaSeconds: number) => void; docks: Dock[]; dockById: Map<string, Dock> } {
	const random = seededRandom(7);
	const owners = Object.keys(SATELLITE_LOOK) as SatelliteOwner[];
	const groups = owners.map((owner) => {
		const look = SATELLITE_LOOK[owner];
		const count = Math.round(SATELLITE_COUNT * look.share);
		const material = new StandardMaterial(`satellites-${owner}`, scene);
		material.diffuseColor = look.color;
		material.emissiveColor = look.glow;
		material.specularColor = new Color3(0.2, 0.2, 0.2);

		const mesh = MeshBuilder.CreateBox(`satellites-${owner}`, SATELLITE_SIZE, scene);
		mesh.material = material;
		mesh.isPickable = false;
		mesh.alwaysSelectAsActiveMesh = true;

		const orbits: SatelliteOrbit[] = [];
		for (let i = 0; i < count; i++) {
			const radius = SATELLITE_BAND_INNER + random() * (SATELLITE_BAND_OUTER - SATELLITE_BAND_INNER);
			orbits.push({
				radius,
				angle: random() * Math.PI * 2,
				speed: SATELLITE_ORBIT_RATE / Math.pow(radius, 1.5),
				tilt: (random() - 0.5) * 0.08,
				phase: random() * Math.PI * 2,
			});
		}

		const matrices = new Float32Array(count * 16);
		mesh.thinInstanceSetBuffer("matrix", matrices, 16, false);
		orbits.forEach((orbit, index) => {
			crafts.push({
				id: `${mesh.name}-${index}`,
				host: "sun",
				view: "sun-inner",
				kind: "collector",
				owner,
				reach: Math.max(SATELLITE_SIZE.width, SATELLITE_SIZE.depth) / 2,
				rate: orbit.speed * ORBIT_PACE,
				angle: () => orbit.angle,
				position: (out) =>
					out.set(
						Math.cos(orbit.angle) * orbit.radius,
						Math.sin(orbit.angle + orbit.phase) * orbit.radius * orbit.tilt,
						Math.sin(orbit.angle) * orbit.radius
					),
			});
		});
		return { mesh, orbits, matrices };
	});

	const scale = Vector3.One();
	const rotation = new Quaternion();
	const position = new Vector3();
	const matrix = new Matrix();

	const place = (orbit: SatelliteOrbit, out: Vector3) =>
		out.set(
			Math.cos(orbit.angle) * orbit.radius,
			Math.sin(orbit.angle + orbit.phase) * orbit.radius * orbit.tilt,
			Math.sin(orbit.angle) * orbit.radius
		);

	const update = (deltaSeconds: number) => {
		for (const group of groups) {
			group.orbits.forEach((orbit, index) => {
				orbit.angle += orbit.speed * deltaSeconds;
				place(orbit, position);
				Quaternion.RotationYawPitchRollToRef(-orbit.angle, 0, 0, rotation);
				Matrix.ComposeToRef(scale, rotation, position, matrix);
				matrix.copyToArray(group.matrices, index * 16);
			});
			group.mesh.thinInstanceBufferUpdated("matrix");
		}
	};

	update(0);
	const dockById = new Map<string, Dock>();
	for (const group of groups) {
		group.orbits.forEach((orbit, index) => {
			dockById.set(`${group.mesh.name}-${index}`, {
				position: () => place(orbit, new Vector3()),
				rate: orbit.speed * ORBIT_PACE,
			});
		});
	}
	return { update, docks: [...dockById.values()], dockById };
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

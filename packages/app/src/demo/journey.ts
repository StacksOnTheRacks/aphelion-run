import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Constants } from "@babylonjs/core/Engines/constants";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import {
	GreasedLineMeshColorDistributionType,
	GreasedLineMeshMaterialType,
	type IGreasedLineMaterial,
} from "@babylonjs/core/Materials/GreasedLine/greasedLineMaterialInterfaces";
import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGreasedLine } from "@babylonjs/core/Meshes/Builders/greasedLineBuilder";
import type { GreasedLineBaseMesh } from "@babylonjs/core/Meshes/GreasedLine/greasedLineBaseMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Scene } from "@babylonjs/core/scene";

import { MINE_SIZE } from "./bases";
import type { RingBody } from "./camera-path";
import { CHART_LAYER, PILOT_LAYER } from "./cockpit";
import { planCruise, type CruiseCorner, type CruiseProfile } from "./cruise";
import { HULL_LENGTH, type ShipModel } from "./ranger";
import { MAX_YAW, headingAt, pointAt, type Route, type RouteKind } from "./route";

/**
 * A ship flying a planned trip. Leaving a dock, it eases out to a hover, then climbs to the origin's
 * outer orbit. It burns up to the chosen coast speed, crosses with the engine lit and no exhaust, and burns again
 * to arrive. The drop keeps that idle until the ship eases in to dock. A pad is met from above. A mine or collector
 * is met from behind. Once coupled, the hull shifts so the muzzle sits on the access port's axis
 * and the laser fires straight into the opening. The climb and the drop
 * each take the same time on every body; speed eases so the handoff into the cruise does not jump.
 * The line ahead is bright where the engine is lit and dull on the coast. It shortens as the ship
 * goes. It is drawn at a fixed width on screen, so the route reads from the whole-system view and
 * from beside a planet alike. From the cockpit, and from outside the hull, the course is a run of
 * chevrons that fade with distance. The climb out to the outer orbit, and the drop in to dock, stay
 * clear of them. Nothing here moves the camera.
 *
 * The clock does not depend on the camera. Soft undock, the climb, the drop, and soft dock each last
 * a fixed time. The cruise lasts as long as the chosen speed takes to cover it. The path is fixed
 * when the trip starts. A server can sample the same schedule without a viewport.
 */

/** Fastest coast the drive will build, in world units per second. */
export const JOURNEY_PACE = 14;
/**
 * Speed at the outer orbit, where a climb meets the burn and a drop leaves it, in world units per
 * second. A long spiral is faster in the middle and comes back to this at the rim.
 */
export const CLIMB_PACE = 3;
/** The climb out to the outer orbit, and the drop back in, each take this long. */
export const ORBIT_LEG_SECONDS = 7;
/** Soft undock and soft dock: the ease between the coupled pose and a hover. */
export const SOFT_DOCK_SECONDS = 3;
/**
 * How far a coupled ship sits above a pad, in world units. One hull. The hover is twice this,
 * and both shrink when the gap out to the outer orbit is smaller than the hull. A mine or collector
 * uses this same length as the slide along its orbit between the coupled pose and the hover.
 */
export const HULL_CLEARANCE = 0.04;
/**
 * Space between a mine's trailing face and the ship's nose when the ship is coupled.
 * The pilot's eye sits just behind the nose, and the windscreen clips the world 0.02 out. A gap
 * this short of the hull keeps the whole craft past that clip through a full head turn. Any closer
 * and looking aside cuts the face into a wall across the glass.
 */
const TRAIL_GAP = 0.03;

/**
 * World rise along the ecliptic normal. `coupled` is the docked pose and `hover` is the pose the
 * climb leaves from. Neither grows with the camera, so a far chart cannot park the ship above a moon.
 * Mines and collectors do not rise: they use `trailDistance`.
 */
export function poseRise(dockRadius: number, outerRadius: number, kind: "coupled" | "hover"): number {
	const wanted = kind === "hover" ? HULL_CLEARANCE * 2 : HULL_CLEARANCE;
	if (!(outerRadius > dockRadius)) {
		return wanted;
	}
	return Math.min(wanted, (outerRadius - dockRadius) * 0.15);
}

/**
 * How far behind a mine or collector the ship sits, along the orbit. Coupled leaves the nose clear
 * of the surface by enough that the sphere stays whole out the windscreen. Hover is one hull
 * further aft, and docking slides between the two.
 */
export function trailDistance(kind: "coupled" | "hover"): number {
	const coupled = MINE_SIZE.depth / 2 + HULL_LENGTH / 2 + TRAIL_GAP;
	return kind === "hover" ? coupled + HULL_CLEARANCE : coupled;
}

/** Ship pose relative to the body. Pads rise in Y. A trail mount lags behind on the same circle. */
function poseOn(at: Vector3, dock: Dock, outer: number, kind: "coupled" | "hover"): Vector3 {
	if (dock.mount === "trail") {
		return lagOnOrbit(at, dock.rate, trailDistance(kind));
	}
	const posed = at.clone();
	posed.y += poseRise(Math.hypot(posed.x, posed.z), outer, kind);
	return posed;
}

/** Where the ship sits relative to the body, for `dock` where it is now. */
export function berthPoint(dock: Dock, outer: number, kind: "coupled" | "hover"): Vector3 {
	return poseOn(dock.position(), dock, outer, kind);
}

/** Which way a craft at `relative` is circling. Level, in the plane of the orbit. */
function orbitHeadingOf(relative: Vector3, rate: number): Vector3 {
	const angle = Math.atan2(relative.z, relative.x);
	const turn = Math.sign(rate) || 1;
	return new Vector3(-Math.sin(angle) * turn, 0, Math.cos(angle) * turn);
}

/**
 * Coupled pose behind a mine or collector. The hull sits on the tangent through the craft,
 * `distance` back, shifted so `muzzle` lies on that line. The heading points along it,
 * into the access port, and the laser fires straight through the opening.
 * `muzzle` is in world units along the ship's axes: +Z nose, +X starboard, +Y up.
 */
export function trailAlignment(
	at: Vector3,
	rate: number,
	distance: number,
	muzzle: Vector3
): { point: Vector3; heading: Vector3 } {
	const heading = orbitHeadingOf(at, rate);
	const right = Vector3.Cross(Vector3.Up(), heading);
	if (right.lengthSquared() > 1e-8) {
		right.normalize();
	} else {
		right.set(1, 0, 0);
	}
	const point = at
		.subtract(heading.scale(distance))
		.subtract(right.scale(muzzle.x))
		.subtract(Vector3.Up().scale(muzzle.y));
	return { point, heading };
}

/** Coupled at `share` 0, hover at `share` 1. Soft dock eases the other way. */
function easedPose(dock: Dock, outer: number, share: number): Vector3 {
	const t = smoothstep(0, 1, Math.min(1, Math.max(0, share)));
	const at = dock.position();
	if (dock.mount === "trail") {
		const coupled = trailDistance("coupled");
		const hover = trailDistance("hover");
		return lagOnOrbit(at, dock.rate, coupled + (hover - coupled) * t);
	}
	const radius = Math.hypot(at.x, at.z);
	const coupled = poseRise(radius, outer, "coupled");
	const hover = poseRise(radius, outer, "hover");
	const posed = at.clone();
	posed.y += coupled + (hover - coupled) * t;
	return posed;
}

/** Same radius and height as `at`, `distance` back along the orbit. */
function lagOnOrbit(at: Vector3, rate: number, distance: number): Vector3 {
	const radius = Math.hypot(at.x, at.z);
	if (radius < 1e-6) {
		return at.clone();
	}
	const turn = Math.sign(rate) || 1;
	return yawAround(at, -(turn * distance) / radius);
}
/** The ship swings at least this far around the body on the way in, so it closes on its dock from behind. */
export const APPROACH_MIN_SWEEP = 0.8;
/** Kept for the energy figures. The cruise itself is no longer clamped to this range. */
export const JOURNEY_MIN_SECONDS = 16;
export const JOURNEY_MAX_SECONDS = 120;

/**
 * A speed curve that starts at `v0`, ends at `v1`, and covers `length` in `seconds`. A sine hump in
 * the middle makes up whatever the ends do not cover. When the ends are already faster than the path
 * allows, both scale down and the hump is flat, so the ship never snaps to a higher speed.
 */
type LegProfile = { seconds: number; length: number; v0: number; v1: number; amplitude: number };

function legProfile(seconds: number, length: number, startSpeed: number, endSpeed: number): LegProfile {
	const v0 = Math.max(0, startSpeed);
	const v1 = Math.max(0, endSpeed);
	if (seconds < 1e-6 || length < 1e-6) {
		return { seconds, length, v0, v1, amplitude: 0 };
	}
	const needed = length / seconds;
	const ends = (v0 + v1) / 2;
	if (ends <= needed + 1e-6) {
		return { seconds, length, v0, v1, amplitude: (Math.PI / 2) * (needed - ends) };
	}
	const scale = ends > 1e-6 ? needed / ends : 0;
	return { seconds, length, v0: v0 * scale, v1: v1 * scale, amplitude: 0 };
}

function legSpeed(t: number, profile: LegProfile): number {
	if (profile.seconds < 1e-6) {
		return profile.v1;
	}
	const tau = Math.min(1, Math.max(0, t / profile.seconds));
	return profile.v0 + (profile.v1 - profile.v0) * tau + profile.amplitude * Math.sin(Math.PI * tau);
}

/** Distance covered by `t`. At `profile.seconds` this is `profile.length`. */
function legDistance(t: number, profile: LegProfile): number {
	if (profile.length < 1e-6) {
		return 0;
	}
	if (profile.seconds < 1e-6) {
		return profile.length;
	}
	const tau = Math.min(1, Math.max(0, t / profile.seconds));
	const covered =
		profile.seconds *
		(profile.v0 * tau +
			(profile.v1 - profile.v0) * tau * tau * 0.5 +
			(profile.amplitude * (1 - Math.cos(Math.PI * tau))) / Math.PI);
	return Math.min(profile.length, Math.max(0, covered));
}

/** Seconds to cover `total` at the ship's maximum coast. The cruise a player flies can be slower. */
export function journeySeconds(total: number): number {
	return Math.max(0, total / JOURNEY_PACE);
}

/** How long a climb of `length` takes. Every climb that has anywhere to go takes `ORBIT_LEG_SECONDS`. */
export function climbDuration(length: number, _departSpeed: number): number {
	return length < 1e-6 ? 0 : ORBIT_LEG_SECONDS;
}

/**
 * Distance covered `t` seconds into a climb that eases from `departSpeed` toward `CLIMB_PACE`.
 * At `climbDuration` this is `length`. A short climb scales both speeds down so it still fills the leg.
 */
export function climbDistance(t: number, length: number, departSpeed: number): number {
	return legDistance(t, legProfile(climbDuration(length, departSpeed), length, departSpeed, CLIMB_PACE));
}

/**
 * How far along a climb the ship is after `t` seconds, and the speed it exits at.
 * Tight bends are flown no faster than `MAX_YAW`. Spare time is spent on the straighter parts,
 * and the whole climb still lasts `ORBIT_LEG_SECONDS`.
 */
export function climbPace(
	points: Vector3[],
	departSpeed: number
): { distance: (t: number) => number; endSpeed: number } {
	const segments = yawCaps(points);
	const total = segments.reduce((sum, segment) => sum + segment.length, 0);
	const seconds = climbDuration(total, departSpeed);
	if (seconds < 1e-6 || total < 1e-6) {
		return { distance: () => 0, endSpeed: Math.max(0, departSpeed) };
	}
	const speedsFor = (scale: number, capFactor: number) => {
		let covered = 0;
		return segments.map((segment) => {
			const mid = covered + segment.length * 0.5;
			covered += segment.length;
			const profile = legProfile(seconds, total, departSpeed, CLIMB_PACE);
			const wanted = legSpeed((mid / total) * seconds, profile) * scale;
			const cap = segment.cap * capFactor;
			return Math.min(cap, Math.max(wanted, 0.02 * capFactor));
		});
	};
	const duration = (speeds: number[]) =>
		segments.reduce((sum, segment, index) => sum + segment.length / Math.max(speeds[index], 1e-4), 0);
	let lo = 0;
	let hi = 1;
	let capFactor = 1;
	if (duration(speedsFor(hi, 1)) > seconds) {
		while (hi < 64 && duration(speedsFor(hi, 1)) > seconds) {
			lo = hi;
			hi *= 2;
		}
		if (duration(speedsFor(hi, 1)) > seconds) {
			capFactor = duration(speedsFor(1e6, 1)) / seconds;
			hi = 1e6;
			lo = 1e6;
		}
	}
	for (let attempt = 0; attempt < 28; attempt++) {
		const mid = (lo + hi) / 2;
		if (duration(speedsFor(mid, capFactor)) > seconds) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	const speeds = speedsFor(hi, capFactor);
	const endSpeed = speeds.length > 0 ? speeds[speeds.length - 1] : departSpeed;
	return {
		endSpeed,
		distance(t: number) {
			const elapsed = Math.min(Math.max(0, t), seconds);
			let left = elapsed;
			let covered = 0;
			for (let index = 0; index < segments.length; index++) {
				const speed = Math.max(speeds[index], 1e-4);
				const span = segments[index].length / speed;
				if (left <= span) {
					return Math.min(total, covered + speed * left);
				}
				left -= span;
				covered += segments[index].length;
			}
			return total;
		},
	};
}

/** Fastest speed on each segment that keeps the heading blend inside `MAX_YAW`. */
function yawCaps(points: Vector3[]): { length: number; cap: number }[] {
	const steps: { length: number; dir: Vector3 }[] = [];
	for (let i = 1; i < points.length; i++) {
		const delta = points[i].subtract(points[i - 1]);
		const length = delta.length();
		steps.push({ length, dir: length < 1e-8 ? new Vector3(0, 0, 1) : delta.scale(1 / length) });
	}
	return steps.map((step, index) => {
		let cap = Infinity;
		const consider = (other: number) => {
			const angle = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(step.dir, steps[other].dir))));
			if (angle < 1e-4) {
				return;
			}
			const blend = Math.min(step.length, steps[other].length);
			cap = Math.min(cap, (MAX_YAW * Math.max(blend, 1e-4)) / angle);
		};
		if (index > 0) {
			consider(index - 1);
		}
		if (index + 1 < steps.length) {
			consider(index + 1);
		}
		return { length: step.length, cap };
	});
}

/** How long each part of a trip lasts. The sum is the clock a server and the client both sample. */
export type FlightSchedule = {
	undockSeconds: number;
	climbSeconds: number;
	cruiseSeconds: number;
	dropSeconds: number;
	dockSeconds: number;
	total: number;
};

/**
 * Phase lengths for a trip. Soft undock and soft dock are three seconds when the ship is coupled.
 * The climb and the drop are seven seconds when they have somewhere to go. `cruiseSeconds` is the
 * coasting cruise, burns included.
 */
export function flightSchedule(
	coupled: boolean,
	climbLength: number,
	departSpeed: number,
	cruiseSeconds: number,
	docks: boolean
): FlightSchedule {
	const undockSeconds = coupled ? SOFT_DOCK_SECONDS : 0;
	const climbSeconds = climbDuration(climbLength, departSpeed);
	const dropSeconds = docks ? ORBIT_LEG_SECONDS : 0;
	const dockSeconds = docks ? SOFT_DOCK_SECONDS : 0;
	return {
		undockSeconds,
		climbSeconds,
		cruiseSeconds,
		dropSeconds,
		dockSeconds,
		total: undockSeconds + climbSeconds + cruiseSeconds + dropSeconds + dockSeconds,
	};
}

/**
 * Where the ship is on the climb and the burn, `elapsed` seconds after the climb starts.
 * The same inputs always return the same pose. The drop is planned separately, at arrival.
 */
export function legPose(plan: JourneyPlan, elapsed: number): { point: Vector3; heading: Vector3 } {
	const pace = climbPace(plan.climb, plan.departSpeed);
	const climbLength = polylineLength(plan.climb);
	const climbSeconds = climbDuration(climbLength, plan.departSpeed);
	const profile = cruiseProfile(plan);
	const distance =
		elapsed <= climbSeconds
			? pace.distance(elapsed)
			: climbLength + profile.distanceAt(Math.max(0, elapsed - climbSeconds));
	const path = stitch(plan);
	const along = Math.min(Math.max(0, distance), path.total);
	return { point: pointAt(path, along), heading: headingAt(path, along) };
}

/**
 * The body the burn ends at, and the way the ship is turning around it when it gets there. With `dock`
 * set the ship docks with that craft; without it, with whichever of the body's craft it reaches first.
 */
export type Arrival = { id: string; turn: number; dock?: Dock };

/**
 * A trip in three parts. `climb` is the slow walk from a base, or from the craft the ship is docked
 * with, out to the departure tangent. `cruise` is the coast, with burns only where the velocity
 * changes. `arrive` is where that cruise ends; the drop to a dock is planned on arrival, because
 * the craft keep moving.
 */
export type JourneyPlan = {
	climb: Vector3[];
	cruise: Route;
	arrive: Arrival;
	/** Speed the ship is already moving when the climb starts. The climb eases from here toward `CLIMB_PACE`. */
	departSpeed: number;
	/** Coast speed chosen in the planner. Absent selects the slow end. */
	coastSpeed?: number;
	/** The craft being left, when the ship is coupled. Absent when it is only circling. */
	departDock?: Dock;
	/** Body `departDock` circles. */
	departBody?: string;
};

/** Heading changes along a cruise. A corner that touches an assist arc is free. */
export function cornersAlong(route: Route): CruiseCorner[] {
	const corners: CruiseCorner[] = [];
	for (let i = 0; i < route.kinds.length - 1; i++) {
		const into = route.points[i + 1].subtract(route.points[i]);
		const out = route.points[i + 2].subtract(route.points[i + 1]);
		if (into.lengthSquared() < 1e-12 || out.lengthSquared() < 1e-12) {
			continue;
		}
		const dot = Math.min(1, Math.max(-1, Vector3.Dot(into.normalize(), out.normalize())));
		const turn = Math.acos(dot);
		if (turn < 1e-4) {
			continue;
		}
		corners.push({
			at: route.cumulative[i + 1],
			turn,
			assist: route.kinds[i] === "assist" || route.kinds[i + 1] === "assist",
		});
	}
	return corners;
}

/** The coasting cruise for `plan`. A missing speed, or one below the handoff, selects the slow end. */
export function cruiseProfile(plan: JourneyPlan, coastSpeed = plan.coastSpeed ?? 0): CruiseProfile {
	const pace = climbPace(plan.climb, plan.departSpeed);
	// The climb may be sped up or slowed so it still lasts seven seconds. The cruise is priced from
	// the orbital handoff, which is the speed the ship is already carrying, not that animation pace.
	const handoff = Math.min(pace.endSpeed, CLIMB_PACE);
	return planCruise(plan.cruise.total, cornersAlong(plan.cruise), coastSpeed, handoff, JOURNEY_PACE);
}

/** A craft a ship can dock with. */
export type Dock = {
	/** Where it is now, relative to the center of the body it circles. */
	position: () => Vector3;
	/** How fast it circles that body, radians per second, counterclockwise seen from above. */
	rate: number;
	/**
	 * `trail` is a mine or collector: the ship sits just behind it on the same orbit.
	 * Absent docks are pads, and the ship sits above them.
	 */
	mount?: "trail";
};

/** A ring around the body, centered on it. */
export type HarborRing = Omit<RingBody, "center">;

/** What a ship can dock with at one body, and the ring it must not cut through on the way in. */
export type Harbor = { docks: Dock[]; ring?: HarborRing; /** Outer-orbit radius. The dock rise is capped against this. */ outer?: number };

/**
 * The drop from the outer orbit to one dock. It is laid out around the dock as it moves: the angle
 * between the ship and the dock closes to zero while the radius eases in, so the ship ends riding
 * alongside the dock however fast it circles.
 */
export type Approach = {
	dock: Dock;
	/** Where the ship met the outer orbit, relative to the body. */
	from: Vector3;
	/** Angle from the dock to the ship at the start, around the body. */
	lead: number;
	/** How fast that angle closes at the start, per whole approach. It matches the speed the ship arrived at. */
	closing: number;
	seconds: number;
	/** Which side of the ring plane the ship crosses the ring on: +1 along the ring's normal, -1 against it. */
	side: number;
	ring?: HarborRing;
	/** Unit direction the burn was traveling when it arrived. The drop curves off this onto the spiral. */
	heading?: Vector3;
	/** Shape parameter at each listed time. Absent until the drop has been timed. */
	warp?: { times: number[]; params: number[] };
};

/** One ring thickness off the plane, matching the climb and the burn. */
const RING_LIFT = 2;
/** How far outside the ring's edge the ship starts to lift, in world units. */
const RING_LIFT_MARGIN = 3;
/** Line width on screen, in CSS pixels. */
const AHEAD_WIDTH = 3;
/** An assist is a free turn, so its stretch of the line is drawn at this share of the width. */
const ASSIST_WIDTH = 0.5;
/** Longest piece of the drawn line, in world units. The cockpit looks down it from on board. */
const AHEAD_STEP = 2;

const AMBER = Color3.FromHexString("#FCD34D");
/** The coast and a gravity assist. Dimmer than a burn, so the engine-off stretches read as such. */
const COAST = Color3.FromHexString("#8C6E3A");

/** First chevron sits this far ahead of the ship, so the wide end of the nearest mark is still on the glass. */
export const MARK_GAP = 8;
/**
 * Chevrons are this far apart along the course. A gap between marks keeps each one a separate arrow,
 * and the chain is dense enough that a fast burn does not strobe.
 */
export const MARK_SPACING = 10;
/** How long each chevron is, along the course. Short enough to read as one arrow, not a ribbon. */
export const MARK_LENGTH = 5.5;
/** A chevron this far ahead of the ship has faded out. */
export const MARK_REACH = 100;
/** Alpha of a mark at the ship. The first mark, a gap ahead, is a little under this. */
export const MARK_NEAR_ALPHA = 0.7;

/** One chevron on the course ahead of the ship. */
export type CourseMark = {
	/** The near end still in front of the ship. The rest of the mark may already be behind it. */
	point: Vector3;
	/** Unit direction of travel there. The point of the chevron faces this way. */
	heading: Vector3;
	/** Translucency at `point`: nearly solid up close, zero at `MARK_REACH`. */
	alpha: number;
	/** Along the course, where the opening was planted. The arms are full width here. */
	opening: number;
	/** Along the course, where the visible part starts. Never behind the cockpit gap. */
	from: number;
	/** Along the course, where the point is. */
	tip: number;
};

/** Alpha of a chevron `ahead` world units in front of the ship. Zero at `MARK_REACH`. */
export function markAlpha(ahead: number): number {
	if (ahead >= MARK_REACH || ahead < 0) {
		return 0;
	}
	return MARK_NEAR_ALPHA * (1 - ahead / MARK_REACH);
}

/**
 * Chevrons on `route` ahead of a ship `distance` along it. They start a gap in front, so the nearest
 * is not inside the cockpit, and stop at the end of the course or at `MARK_REACH`, whichever is closer.
 * Marks are planted on the course, so the ship flies through them instead of dragging them along.
 */
export function courseMarks(route: Route, distance: number): CourseMark[] {
	if (route.total <= 0) {
		return [];
	}
	const along = Math.min(route.total, Math.max(0, distance));
	const gapAt = along + MARK_GAP;
	const reachAt = Math.min(route.total, along + MARK_REACH);
	if (gapAt >= reachAt) {
		return [];
	}
	// A mark stays up until the ship passes its point, so a long chevron slides under the seat
	// instead of vanishing the moment its opening does.
	let opening = Math.floor((gapAt - MARK_LENGTH) / MARK_SPACING) * MARK_SPACING;
	while (opening + MARK_LENGTH <= gapAt) {
		opening += MARK_SPACING;
	}
	const marks: CourseMark[] = [];
	for (; opening < reachAt - 1e-4 && opening < route.total; opening += MARK_SPACING) {
		const tip = Math.min(route.total, opening + MARK_LENGTH);
		const from = Math.max(opening, gapAt);
		if (from >= tip - 1e-4) {
			continue;
		}
		const alpha = markAlpha(from - along);
		if (alpha <= 0) {
			break;
		}
		marks.push({
			point: pointAt(route, from),
			heading: headingAt(route, from),
			alpha,
			opening,
			from,
			tip,
		});
	}
	return marks;
}

export type Journey = {
	start: (plan: JourneyPlan, onDone: () => void) => void;
	/** Ends the flight without calling `onDone` and leaves the ship on the dock it left. */
	stop: () => void;
	/** Couples the ship to a dock with no flight. The next update keeps it there as the dock moves. */
	berth: (bodyId: string, dock: Dock) => void;
	/**
	 * Leaves the dock and any flight. The ship is no longer placed here; `bodyId` stays as the body
	 * it is circling until the next berth or trip.
	 */
	release: (bodyId: string) => void;
	update: (deltaSeconds: number, centerOf: (id: string) => Vector3) => void;
	/** Where the ship is docked, which way that satellite circles, and how fast. Null while a trip is underway. */
	docked: () => { id: string; position: Vector3; turn: number; rate: number; dock?: Dock } | null;
	/**
	 * The body whose planetary chart Locate opens. While a burn is underway this is the dock the
	 * ship left. Once the ship is coupled, it is the body it is coupled to.
	 */
	host: () => string | null;
	/** Where the ship is and which way it is heading, while a trip is under way or the ship is berthed. */
	ship: () => { position: Vector3; heading: Vector3 } | null;
	/**
	 * The line being flown, how far along the whole clock the ship is, and the seconds left on it.
	 * Null once docked.
	 */
	course: () => { points: readonly Vector3[]; progress: number; remaining: number; total: number } | null;
	/** Seconds the main engine was lit. The climb, the coast, the drop, and a dock spend none. */
	onPhoton: (listener: (seconds: number) => void) => () => void;
	/** The photon cruise has finished and the ship is on the drop or already docked. */
	onCruiseDone: (listener: () => void) => () => void;
	/** Shows course chevrons on the windscreen and from outside the hull while the cruise is underway. */
	setPiloting: (on: boolean) => void;
};

type Flight = {
	plan: JourneyPlan;
	path: Route;
	climbLength: number;
	climbSeconds: number;
	cruiseLength: number;
	cruiseSeconds: number;
	departSpeed: number;
	/** Speed the climb actually exits at. The cruise burns up from here and back down to it. */
	handoff: number;
	/** Burns, coast, and clock for the chosen speed. */
	profile: CruiseProfile;
	departDock?: Dock;
	departBody?: string;
	schedule: FlightSchedule;
	/** Seconds since the trip started, across undock, climb, burn, drop, and soft dock. */
	clock: number;
	elapsed: number;
	phase: "undock" | "transit" | "approach" | "soft-dock" | "docked";
	/** Distance along the climb after `t` seconds. The burn's handoff is this pace's exit speed. */
	alongClimb: (t: number) => number;
	/** Null when the body has nothing to dock with: the ship stays where it arrived. */
	approach: Approach | null;
	/** Seconds since the ship reached the outer orbit. */
	since: number;
	/** Where the ship was last frame, relative to the body. Its heading follows from the step. */
	last: Vector3;
	heading: Vector3;
	/** Which way the satellite the ship docked with circles: +1 counterclockwise. */
	turn: number;
	onDone: () => void;
	ahead: GreasedLineBaseMesh;
};

export function createJourney(
	scene: Scene,
	_camera: Camera,
	glow: GlowLayer,
	harborOf: (id: string) => Harbor,
	ship: ShipModel
): Journey {
	const engine = scene.getEngine();
	let flight: Flight | null = null;
	/** The dock the ship is coupled to between trips. A flight does not clear it, so a recall can return. */
	let berthed: { bodyId: string; dock: Dock } | null = null;
	/** The body the ship circles after it leaves a dock and before the next berth or trip. */
	let orbiting: string | null = null;
	const berthHeading = new Vector3(1, 0, 0);
	const photonListeners = new Set<(seconds: number) => void>();
	const cruiseListeners = new Set<() => void>();
	let piloting = false;
	const chevrons = buildChevrons(scene);
	glow.addExcludedMesh(chevrons);

	const pixelRatio = () => 1 / engine.getHardwareScalingLevel();

	const hideChevrons = () => {
		chevrons.setEnabled(false);
	};

	const showChevrons = (route: Route, distance: number) => {
		if (!piloting) {
			hideChevrons();
			return;
		}
		const marks = courseMarks(route, distance);
		if (marks.length === 0 || !writeChevrons(chevrons, route, distance, marks)) {
			hideChevrons();
			return;
		}
		chevrons.setEnabled(true);
	};

	const clear = () => {
		hideChevrons();
		if (!flight) {
			return;
		}
		flight.ahead.dispose(false, true);
		flight = null;
	};

	const placeShip = (position: Vector3, heading: Vector3, deltaSeconds: number) => {
		if (!flight) {
			return;
		}
		const cruiseT = flight.elapsed - flight.climbSeconds;
		// Lit from the first burn through the drop. A coast, and the drop after the last burn, are
		// photon at zero: the fan and the bell stay on, and the exhaust does not. The climb is before
		// that, and a dock is after.
		const onCruise = flight.phase === "transit" && cruiseT >= 0 && cruiseT < flight.profile.seconds;
		const lit = onCruise || flight.phase === "approach";
		ship.drive(lit ? "photon" : "impulse", onCruise ? flight.profile.burn(cruiseT) : 0);
		ship.place(position, heading, deltaSeconds);
	};

	const orbitHeading = orbitHeadingOf;

	/** Seconds of a frame that fall inside a burn. The coast, the climb, and the drop add nothing. */
	const thrustOverlap = (before: number, after: number, climb: number, spans: { start: number; end: number }[]) => {
		let sum = 0;
		for (const span of spans) {
			const start = climb + span.start;
			const end = climb + span.end;
			sum += Math.max(0, Math.min(after, end) - Math.max(before, start));
		}
		return sum;
	};

	const notifyPhoton = (seconds: number) => {
		if (seconds <= 0) {
			return;
		}
		for (const listener of photonListeners) {
			listener(seconds);
		}
	};

	const notifyCruise = () => {
		for (const listener of cruiseListeners) {
			listener();
		}
	};

	/** Keeps the hull on a dock that is not part of a flight. `dock.position` is relative to the body. */
	const placeBerthed = (deltaSeconds: number, centerOf: (id: string) => Vector3) => {
		if (!berthed) {
			return;
		}
		const center = centerOf(berthed.bodyId);
		const outer = harborOf(berthed.bodyId).outer ?? 0;
		if (berthed.dock.mount === "trail") {
			const aligned = trailAlignment(berthed.dock.position(), berthed.dock.rate, trailDistance("coupled"), ship.muzzle);
			berthHeading.copyFrom(aligned.heading);
			ship.drive("impulse", 0);
			ship.place(center.add(aligned.point), aligned.heading, deltaSeconds);
			return;
		}
		const relative = berthPoint(berthed.dock, outer, "coupled");
		const heading = orbitHeading(relative, berthed.dock.rate);
		berthHeading.copyFrom(heading);
		ship.drive("impulse", 0);
		ship.place(center.add(relative), heading, deltaSeconds);
	};

	/** The arrival dock becomes the berth a later recall returns to. */
	const rememberBerth = (current: Flight) => {
		const dock = current.approach?.dock;
		if (!dock) {
			return;
		}
		berthed = { bodyId: current.plan.arrive.id, dock };
		berthHeading.copyFrom(current.heading);
	};

	const placeCoupled = (current: Flight, center: Vector3, dock: Dock, outer: number, share: number, deltaSeconds: number) => {
		if (dock.mount === "trail") {
			const at = dock.position();
			const coupled = trailAlignment(at, dock.rate, trailDistance("coupled"), ship.muzzle);
			const hoverPoint = lagOnOrbit(at, dock.rate, trailDistance("hover"));
			const hoverHeading = orbitHeading(hoverPoint, dock.rate);
			const t = smoothstep(0, 1, Math.min(1, Math.max(0, share)));
			const relative = Vector3.Lerp(coupled.point, hoverPoint, t);
			const blended = Vector3.Lerp(coupled.heading, hoverHeading, t);
			const heading = blended.lengthSquared() > 1e-8 ? blended.normalize() : coupled.heading;
			current.heading = heading;
			current.last = relative;
			placeShip(center.add(relative), heading, deltaSeconds);
			return;
		}
		const relative = easedPose(dock, outer, share);
		const heading = orbitHeading(relative, dock.rate);
		current.heading = heading;
		current.last = relative;
		placeShip(center.add(relative), heading, deltaSeconds);
	};

	const arrive = (current: Flight, center: Vector3) => {
		const end = current.path.points[current.path.points.length - 1];
		current.ahead.setEnabled(false);
		hideChevrons();
		current.last = end.subtract(center);
		current.heading = headingAt(current.path, current.path.total);
		current.since = 0;
		const harbor = harborOf(current.plan.arrive.id);
		const dock = current.plan.arrive.dock;
		const arrivalSpeed = Math.min(current.handoff, CLIMB_PACE);
		current.approach = planApproach(
			current.last,
			current.plan.arrive.turn || 1,
			dock ? { ...harbor, docks: [dock] } : harbor,
			current.heading,
			arrivalSpeed
		);
		current.turn = Math.sign(current.approach?.dock.rate ?? 0) || Math.sign(current.plan.arrive.turn) || 1;
		current.phase = current.approach ? "approach" : "docked";
	};

	const settle = (current: Flight, deltaSeconds: number, center: Vector3) => {
		const approach = current.approach;
		if (!approach) {
			placeShip(center.add(current.last), current.heading, deltaSeconds);
			return;
		}
		if (current.phase === "approach" || current.phase === "soft-dock") {
			current.since += deltaSeconds;
		}
		const outer = harborOf(current.plan.arrive.id).outer ?? 0;
		if (current.phase === "soft-dock" || current.phase === "docked") {
			placeCoupled(current, center, approach.dock, outer, 1 - current.since / SOFT_DOCK_SECONDS, deltaSeconds);
			return;
		}
		const dock = berthPoint(approach.dock, outer, "hover");
		const relative = approachPoint(approach, current.since, dock);
		const step = relative.subtract(current.last);
		if (step.lengthSquared() > 1e-12) {
			current.heading = step.normalize();
		}
		current.last = relative;
		placeShip(center.add(relative), current.heading, deltaSeconds);
	};

	return {
		start(plan, onDone) {
			orbiting = null;
			clear();
			const path = stitch(plan);
			const climbLength = polylineLength(plan.climb);
			const pace = climbPace(plan.climb, plan.departSpeed);
			const profile = cruiseProfile(plan);
			const ahead = buildAhead(scene, path, pixelRatio(), climbLength, profile.spans);
			glow.addExcludedMesh(ahead);
			const coupled = plan.departDock != null && plan.departBody != null;
			const docks = harborOf(plan.arrive.id).docks.length > 0 || plan.arrive.dock != null;
			flight = {
				plan,
				path,
				climbLength,
				climbSeconds: climbDuration(climbLength, plan.departSpeed),
				cruiseLength: plan.cruise.total,
				cruiseSeconds: profile.seconds,
				departSpeed: plan.departSpeed,
				handoff: pace.endSpeed,
				profile,
				alongClimb: pace.distance,
				departDock: plan.departDock,
				departBody: plan.departBody,
				schedule: flightSchedule(coupled, climbLength, plan.departSpeed, profile.seconds, docks),
				clock: 0,
				elapsed: 0,
				phase: coupled ? "undock" : "transit",
				approach: null,
				since: 0,
				last: Vector3.Zero(),
				heading: headingAt(path, 0),
				turn: 1,
				onDone,
				ahead,
			};
			// A coupled ship stays on its dock until the first update. The climb already starts at the hover.
			if (!coupled) {
				const position = pointAt(path, 0);
				placeShip(position, headingAt(path, 0), 0);
			}
		},
		stop: clear,
		berth(bodyId, dock) {
			orbiting = null;
			berthed = { bodyId, dock };
		},
		release(bodyId) {
			clear();
			berthed = null;
			orbiting = bodyId;
		},
		docked() {
			if (flight) {
				if (flight.phase !== "docked") {
					return null;
				}
				return {
					id: flight.plan.arrive.id,
					position: ship.position.clone(),
					turn: flight.turn,
					rate: flight.approach?.dock.rate ?? 0,
					dock: flight.approach?.dock,
				};
			}
			if (!berthed) {
				return null;
			}
			return {
				id: berthed.bodyId,
				position: ship.position.clone(),
				turn: Math.sign(berthed.dock.rate) || 1,
				rate: berthed.dock.rate,
				dock: berthed.dock,
			};
		},
		host() {
			if (flight && flight.phase !== "docked") {
				return flight.departBody ?? berthed?.bodyId ?? orbiting;
			}
			if (flight?.phase === "docked") {
				return flight.plan.arrive.id;
			}
			return berthed?.bodyId ?? orbiting;
		},
		ship() {
			if (flight) {
				return { position: ship.position.clone(), heading: flight.heading.clone() };
			}
			return berthed ? { position: ship.position.clone(), heading: berthHeading.clone() } : null;
		},
		course() {
			if (!flight || flight.phase === "docked") {
				return null;
			}
			const total = flight.schedule.total;
			const span = Math.max(total, 1e-6);
			return {
				points: flight.path.points,
				progress: Math.min(1, flight.clock / span),
				remaining: Math.max(0, total - flight.clock),
				total,
			};
		},
		update(deltaSeconds, centerOf) {
			if (!flight) {
				placeBerthed(deltaSeconds, centerOf);
				return;
			}
			flight.clock += deltaSeconds;
			const departDock = flight.departDock;
			const departBody = flight.departBody;
			let joinedBurn = false;
			if (flight.phase === "undock" && departDock && departBody) {
				const current = flight;
				current.since += deltaSeconds;
				const center = centerOf(departBody);
				const outer = harborOf(departBody).outer ?? 0;
				placeCoupled(current, center, departDock, outer, current.since / SOFT_DOCK_SECONDS, deltaSeconds);
				if (current.since < SOFT_DOCK_SECONDS) {
					return;
				}
				joinedBurn = true;
				current.phase = "transit";
				current.elapsed = current.since - SOFT_DOCK_SECONDS;
				current.since = 0;
			}
			if (flight.phase !== "transit") {
				hideChevrons();
				const current = flight;
				settle(current, deltaSeconds, centerOf(current.plan.arrive.id));
				if (current.phase === "approach" && current.approach && current.since >= current.approach.seconds) {
					current.phase = "soft-dock";
					current.since = 0;
				}
				if (current.phase === "soft-dock" && current.since >= SOFT_DOCK_SECONDS) {
					current.phase = "docked";
					rememberBerth(current);
					current.onDone();
				}
				return;
			}

			const before = flight.elapsed;
			if (!joinedBurn) {
				flight.elapsed += deltaSeconds;
			}
			notifyPhoton(thrustOverlap(before, flight.elapsed, flight.climbSeconds, flight.profile.thrust));
			const distance = distanceAt(flight);
			if (flight.elapsed >= flight.climbSeconds + flight.cruiseSeconds) {
				notifyCruise();
				const current = flight;
				arrive(current, centerOf(current.plan.arrive.id));
				settle(current, 0, centerOf(current.plan.arrive.id));
				if (current.phase === "docked") {
					rememberBerth(current);
					current.onDone();
				}
				return;
			}

			const resolution = new Vector2(engine.getRenderWidth(), engine.getRenderHeight());
			const material = flight.ahead.greasedLineMaterial as IGreasedLineMaterial;
			if (!material.resolution.equals(resolution)) {
				material.resolution = resolution;
			}
			const span = Math.max(flight.path.total, 1e-6);
			material.visibility = 1 - Math.min(1, distance / span);
			const along = Math.min(distance, flight.path.total);
			flight.heading = headingAt(flight.path, along);
			placeShip(pointAt(flight.path, along), flight.heading, deltaSeconds);
			// The climb leaves an orbit for the outer orbit, and docking is the drop after the burn.
			// Chevrons are the road on the burn itself.
			if (flight.elapsed <= flight.climbSeconds) {
				hideChevrons();
			} else {
				showChevrons(flight.path, along);
			}
		},
		onPhoton(listener) {
			photonListeners.add(listener);
			return () => {
				photonListeners.delete(listener);
			};
		},
		onCruiseDone(listener) {
			cruiseListeners.add(listener);
			return () => {
				cruiseListeners.delete(listener);
			};
		},
		setPiloting(on) {
			piloting = on;
			if (!on) {
				hideChevrons();
			}
		},
	};
}

function distanceAt(flight: Flight): number {
	if (flight.elapsed <= flight.climbSeconds) {
		return flight.alongClimb(flight.elapsed);
	}
	return flight.climbLength + flight.profile.distanceAt(flight.elapsed - flight.climbSeconds);
}

/**
 * Picks the dock the ship reaches by swinging forward the least, but at least `APPROACH_MIN_SWEEP`,
 * and plans the drop to it. A craft closer than that is skipped when another sits further ahead.
 * With only one craft that close, the lead extends to the minimum sweep, and it does not add a full
 * extra lap. `from` is where the ship met the outer orbit, relative to the body, and `turn` the way
 * it was circling. `arrival`, when set, is the heading the burn came in on. `arrivalSpeed` is how
 * fast the burn was going; the drop leaves at that speed. Null when the body has nothing to dock with.
 *
 * The drop always takes `ORBIT_LEG_SECONDS`. Speed eases from the arrival speed down to the dock's
 * orbital speed, faster in the middle when the spiral is long.
 */
export function planApproach(
	from: Vector3,
	turn: number,
	harbor: Harbor,
	arrival?: Vector3,
	arrivalSpeed = CLIMB_PACE
): Approach | null {
	const radius = Math.hypot(from.x, from.z);
	const shipRate = (turn * Math.max(0, arrivalSpeed)) / Math.max(radius, 1e-6);
	const fromAngle = Math.atan2(from.z, from.x);
	type Choice = { dock: Dock; at: Vector3; gap: number; closingRate: number; direction: number };
	let qualified: Choice | null = null;
	let nearest: Choice | null = null;
	for (const dock of harbor.docks) {
		const at = dock.position();
		const closingRate = shipRate - dock.rate;
		const direction = Math.sign(closingRate) || turn || 1;
		const gap = positiveAngle(direction * (Math.atan2(at.z, at.x) - fromAngle));
		const choice: Choice = { dock, at, gap, closingRate: direction * Math.abs(closingRate), direction };
		if (!nearest || gap < nearest.gap) {
			nearest = choice;
		}
		if (gap >= APPROACH_MIN_SWEEP && (!qualified || gap < qualified.gap)) {
			qualified = choice;
		}
	}
	const best = qualified ?? (nearest ? { ...nearest, gap: APPROACH_MIN_SWEEP } : null);
	if (!best) {
		return null;
	}
	const dockRadius = Math.hypot(best.at.x, best.at.z);
	const length = Math.hypot(radius - dockRadius, ((radius + dockRadius) / 2) * best.gap, from.y - best.at.y);
	const seconds = ORBIT_LEG_SECONDS;
	// A cubic that ends still stays on one side of the dock only while its starting slope is under three times the gap.
	const closing = best.direction * Math.min(Math.abs(best.closingRate) * seconds, 3 * best.gap);
	const heading = arrival && arrival.lengthSquared() > 1e-8 ? arrival.normalize() : undefined;
	const approach: Approach = {
		dock: best.dock,
		from: from.clone(),
		lead: -best.direction * best.gap,
		closing,
		seconds,
		side: 1,
		heading,
	};
	if (harbor.ring) {
		approach.ring = harbor.ring;
	}
	approach.warp = timeWarp(approach, best.at, length, arrivalSpeed);
	if (harbor.ring) {
		approach.side = ringSide(approach, best.at);
	}
	return approach;
}

/** Share of the drop spent curving off the burn's heading onto the spiral. */
const APPROACH_BLEND = 0.22;

/**
 * Where the ship is `elapsed` seconds into an approach, relative to the body, given where the dock
 * is right now. Past the end it sits on the dock.
 */
export function approachPoint(approach: Approach, elapsed: number, dock: Vector3): Vector3 {
	const u = shapeParameter(approach, elapsed);
	const spiral = spiralPoint(approach, u, dock);
	return blendHeading(approach, u, dock, spiral);
}

/** How far into the drop a lead that was extended past the ship's angle slides onto that spiral. */
const LEAD_BLEND = 0.18;

function spiralPoint(approach: Approach, u: number, dock: Vector3): Vector3 {
	const swept = sweptPoint(approach, u, dock);
	if (u <= 1e-6) {
		return approach.from.clone();
	}
	if (Vector3.DistanceSquared(sweptPoint(approach, 0, dock), approach.from) <= 1e-4 || u >= LEAD_BLEND) {
		return swept;
	}
	return Vector3.Lerp(approach.from, swept, smoothstep(0, 1, u / LEAD_BLEND));
}

function sweptPoint(approach: Approach, u: number, dock: Vector3): Vector3 {
	const ease = u * u * (3 - 2 * u);
	const from = approach.from;
	const fromRadius = Math.hypot(from.x, from.z);
	const dockRadius = Math.hypot(dock.x, dock.z);
	const radius = fromRadius + (dockRadius - fromRadius) * ease;
	// Cubic Hermite from `lead` to 0: it leaves at the arrival's closing rate and ends at rest beside the dock.
	const offset = approach.lead * (2 * u * u * u - 3 * u * u + 1) + approach.closing * (u * u * u - 2 * u * u + u);
	const angle = Math.atan2(dock.z, dock.x) + offset;
	const point = new Vector3(Math.cos(angle) * radius, from.y + (dock.y - from.y) * ease, Math.sin(angle) * radius);
	return approach.ring ? liftOverRing(point, approach.ring, approach.side, dockRadius) : point;
}

/** Curves the first part of the drop off `heading` onto the spiral, then rides the spiral. */
function blendHeading(approach: Approach, u: number, dock: Vector3, spiral: Vector3): Vector3 {
	const heading = approach.heading;
	if (!heading || u <= 1e-6 || u >= APPROACH_BLEND) {
		return spiral;
	}
	const probe = 0.004;
	const ahead = spiralPoint(approach, probe, dock);
	const prime = ahead.subtract(approach.from).scale(1 / probe);
	const primeLength = prime.length();
	if (primeLength < 1e-6) {
		return spiral;
	}
	const aimed = heading.scale(primeLength);
	if (Vector3.Dot(aimed, prime) > 0.999 * primeLength * primeLength) {
		return spiral;
	}
	const fade = u * (1 - u / APPROACH_BLEND) ** 2;
	return spiral.add(aimed.subtract(prime).scale(fade));
}

function shapeParameter(approach: Approach, elapsed: number): number {
	const warp = approach.warp;
	if (!warp || warp.times.length < 2) {
		return Math.min(1, Math.max(0, elapsed / Math.max(approach.seconds, 1e-6)));
	}
	const times = warp.times;
	const params = warp.params;
	if (elapsed <= times[0]) {
		return params[0];
	}
	const last = times.length - 1;
	if (elapsed >= times[last]) {
		return params[last];
	}
	let lo = 0;
	let hi = last;
	while (hi - lo > 1) {
		const mid = (lo + hi) >> 1;
		if (times[mid] <= elapsed) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	const span = times[hi] - times[lo];
	const t = span < 1e-8 ? 0 : (elapsed - times[lo]) / span;
	return params[lo] + (params[hi] - params[lo]) * t;
}

/**
 * Times the drop so it takes `ORBIT_LEG_SECONDS` and the world speed follows the leg profile: arrival
 * speed at the outer orbit, the dock's orbital speed at the end, and a hump in the middle when the
 * spiral is long. Each step is chosen so the ship actually covers that speed, and once it arrives it
 * rides with the dock for whatever time is left.
 */
function timeWarp(
	approach: Approach,
	dock0: Vector3,
	length: number,
	arrivalSpeed: number
): { times: number[]; params: number[] } {
	const dockRadius = Math.hypot(dock0.x, dock0.z);
	const dockSpeed = Math.abs(approach.dock.rate) * dockRadius;
	const steps = 64;
	const dt = ORBIT_LEG_SECONDS / steps;
	// The chord estimate is shorter than the eased spiral, so the hump grows until the shape finishes
	// on time. The ends stay at the arrival speed and the dock's speed.
	const fly = (lengthScale: number) => {
		const profile = legProfile(ORBIT_LEG_SECONDS, Math.max(length, 1e-4) * lengthScale, arrivalSpeed, dockSpeed);
		const params = [0];
		let u = 0;
		for (let step = 0; step < steps; step++) {
			const t = step * dt;
			if (u >= 1 - 1e-5) {
				params.push(1);
				continue;
			}
			const desired = Math.max(legSpeed(t, profile), coastSpeed(approach, dock0, u, t));
			const w = stepRate(approach, dock0, u, t, dt, desired);
			u = Math.min(1, u + w * dt);
			params.push(u);
		}
		return params;
	};
	let scale = 1;
	let params = fly(scale);
	if (params[steps] < 0.995) {
		let lo = 1;
		let hi = 2;
		while (hi < 8 && fly(hi)[steps] < 0.995) {
			lo = hi;
			hi *= 2;
		}
		for (let attempt = 0; attempt < 6; attempt++) {
			const mid = (lo + hi) / 2;
			if (fly(mid)[steps] < 0.995) {
				lo = mid;
			} else {
				hi = mid;
			}
		}
		scale = hi;
		params = fly(scale);
	}
	const times = params.map((_, index) => (index / steps) * ORBIT_LEG_SECONDS);
	params[steps] = 1;
	approach.seconds = ORBIT_LEG_SECONDS;
	return { times, params };
}

/** World speed when the shape parameter is held still and only the dock keeps turning. */
function coastSpeed(approach: Approach, dock0: Vector3, u: number, t: number): number {
	const sample = 0.02;
	return Vector3.Distance(posed(approach, u, dock0, t), posed(approach, u, dock0, t + sample)) / sample;
}

/**
 * How fast the shape parameter must move so the ship covers `desired` world units a second over this
 * step. Measured across the whole step, so the flat start of the ease cannot demand an infinite rate.
 */
function stepRate(approach: Approach, dock0: Vector3, u: number, t: number, dt: number, desired: number): number {
	const speedFor = (w: number) => {
		const left = posed(approach, u, dock0, t);
		const right = posed(approach, Math.min(1, u + w * dt), dock0, t + dt);
		return Vector3.Distance(left, right) / dt;
	};
	const maxW = (1 - u) / Math.max(dt, 1e-6);
	if (speedFor(0) >= desired - 1e-3) {
		return 0;
	}
	let lo = 0;
	let hi = Math.min(maxW, 0.2);
	while (hi < maxW - 1e-6 && speedFor(hi) < desired) {
		hi = Math.min(maxW, hi * 2);
	}
	if (speedFor(hi) < desired) {
		return hi;
	}
	for (let attempt = 0; attempt < 14; attempt++) {
		const mid = (lo + hi) / 2;
		if (speedFor(mid) < desired) {
			lo = mid;
		} else {
			hi = mid;
		}
	}
	return (lo + hi) / 2;
}

function posed(approach: Approach, u: number, dock0: Vector3, t: number): Vector3 {
	const dock = yawAround(dock0, approach.dock.rate * t);
	return blendHeading(approach, u, dock, spiralPoint(approach, u, dock));
}

function yawAround(point: Vector3, angle: number): Vector3 {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	return new Vector3(point.x * cos - point.z * sin, point.y, point.x * sin + point.z * cos);
}

/** Hover pose, relative to the body, `SOFT_DOCK_SECONDS` after `dock` where it is now. The climb starts here. */
export function hoverDeparture(dock: Dock, outer: number): Vector3 {
	const later = yawAround(dock.position(), dock.rate * SOFT_DOCK_SECONDS);
	return poseOn(later, dock, outer, "hover");
}

/**
 * Moves a point along the ring's normal until it clears the ring plane, but only where it sits over
 * the ring itself. Moving along the normal leaves the distance from the ring's axis alone, so the
 * lift fades in and out without ever touching the ring.
 */
function liftOverRing(point: Vector3, ring: HarborRing, side: number, dockRadius: number): Vector3 {
	const normal = ring.normal.normalizeToNew();
	const height = Vector3.Dot(point, normal);
	const across = Math.sqrt(Math.max(0, point.lengthSquared() - height * height));
	const innerMargin = Math.max(1e-3, Math.min(RING_LIFT_MARGIN, (ring.inner - dockRadius) * 0.6));
	const over =
		smoothstep(ring.inner - innerMargin, ring.inner, across) * (1 - smoothstep(ring.outer, ring.outer + RING_LIFT_MARGIN, across));
	if (over <= 0) {
		return point;
	}
	const clear = ring.halfHeight * RING_LIFT;
	const lifted = side * softMax(side * height, clear, ring.halfHeight);
	return point.add(normal.scale((lifted - height) * over));
}

/** The side of the ring plane the unlifted path mostly crosses on, so the lift is as small as it can be. */
function ringSide(approach: Approach, dockNow: Vector3): number {
	const ring = approach.ring!;
	const normal = ring.normal.normalizeToNew();
	const flat = { ...approach, ring: undefined };
	let sum = 0;
	for (let i = 0; i <= 48; i++) {
		const elapsed = (i / 48) * approach.seconds;
		const turn = approach.dock.rate * elapsed;
		const dock = new Vector3(
			dockNow.x * Math.cos(turn) - dockNow.z * Math.sin(turn),
			dockNow.y,
			dockNow.x * Math.sin(turn) + dockNow.z * Math.cos(turn)
		);
		const point = approachPoint(flat, elapsed, dock);
		const height = Vector3.Dot(point, normal);
		const across = Math.sqrt(Math.max(0, point.lengthSquared() - height * height));
		if (across >= ring.inner && across <= ring.outer) {
			sum += height;
		}
	}
	return sum < 0 ? -1 : 1;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/** A max with its corner rounded over `soft`, so the lifted path has no kink. */
function softMax(a: number, b: number, soft: number): number {
	return 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + soft * soft));
}

/** An angle wrapped into [0, 2π). */
function positiveAngle(angle: number): number {
	const full = Math.PI * 2;
	return ((angle % full) + full) % full;
}

/** The climb and the burn as one line. The shared point where they meet is kept once. */
function stitch(plan: JourneyPlan): Route {
	const points: Vector3[] = [];
	const kinds: RouteKind[] = [];
	const push = (point: Vector3, kind: RouteKind | null) => {
		if (points.length > 0 && Vector3.DistanceSquared(point, points[points.length - 1]) <= 1e-8) {
			return;
		}
		if (points.length > 0) {
			kinds.push(kind ?? "burn");
		}
		points.push(point.clone());
	};
	for (let i = 0; i < plan.climb.length; i++) {
		push(plan.climb[i], i === 0 ? null : "burn");
	}
	for (let i = 0; i < plan.cruise.points.length; i++) {
		push(plan.cruise.points[i], i === 0 ? "burn" : plan.cruise.kinds[i - 1]);
	}
	if (points.length < 2) {
		const origin = (points[0] ?? Vector3.Zero()).clone();
		points.splice(0, points.length, origin, new Vector3(origin.x + 0.01, origin.y, origin.z));
		kinds.splice(0, kinds.length, "burn");
	}
	const cumulative = [0];
	for (let i = 1; i < points.length; i++) {
		cumulative.push(cumulative[i - 1] + Vector3.Distance(points[i - 1], points[i]));
	}
	return {
		points,
		kinds,
		cumulative,
		total: cumulative[cumulative.length - 1],
		assists: plan.cruise.assists,
		startTurn: plan.cruise.startTurn,
		endTurn: plan.cruise.endTurn,
	};
}

function polylineLength(points: Vector3[]): number {
	let length = 0;
	for (let i = 1; i < points.length; i++) {
		length += Vector3.Distance(points[i - 1], points[i]);
	}
	return length;
}

/**
 * Seconds from leaving the dock to being down on the next one. A faster coast shortens the cruise.
 * The climb, the drop, and the soft dock stay the same length.
 */
export function tripSeconds(plan: JourneyPlan, coastSpeed = plan.coastSpeed ?? 0): number {
	const cruiseSeconds = cruiseProfile(plan, coastSpeed).seconds;
	const coupled = plan.departDock != null && plan.departBody != null;
	const docks = plan.arrive.dock != null;
	return flightSchedule(coupled, polylineLength(plan.climb), plan.departSpeed, cruiseSeconds, docks).total;
}

/**
 * Each chevron lies under the course. The opening is just below the point, so the arrow stays in the
 * lower windscreen: wide above the dashboard, with the chain receding toward the horizon.
 */
const MARK_NEAR_DROP = 1.35;
const MARK_FAR_DROP = 0.85;
/** Width of one arm's outer edge at the opening. The two arms make a wide forward point. */
const MARK_HALF_WIDTH = 3;
/** Thickness of an arm at the opening. The arms meet at the point. */
const MARK_STROKE = 1;
/** Samples along one chevron. Enough that a bend does not cut the corner. */
const MARK_STEPS = 8;

/** The windscreen's course. Unlit amber, see-through, and kept off the chart and the aft views. */
function buildChevrons(scene: Scene): Mesh {
	const mesh = new Mesh("journey-chevrons", scene);
	const material = new StandardMaterial("journey-chevrons", scene);
	material.disableLighting = true;
	material.diffuseColor = Color3.Black();
	material.ambientColor = Color3.Black();
	material.emissiveColor = Color3.White();
	material.specularColor = Color3.Black();
	material.backFaceCulling = false;
	material.disableDepthWrite = true;
	material.alphaMode = Constants.ALPHA_COMBINE;
	material.transparencyMode = Material.MATERIAL_ALPHABLEND;
	mesh.material = material;
	mesh.useVertexColors = true;
	mesh.hasVertexAlpha = true;
	mesh.isPickable = false;
	mesh.layerMask = PILOT_LAYER;
	mesh.setEnabled(false);
	return mesh;
}

/** Far marks are written first, so a nearer chevron blends over the one beyond it. */
function writeChevrons(mesh: Mesh, route: Route, distance: number, marks: CourseMark[]): boolean {
	const right = new Vector3();
	const up = new Vector3();
	const positions: number[] = [];
	const colors: number[] = [];
	const indices: number[] = [];
	for (let markIndex = marks.length - 1; markIndex >= 0; markIndex--) {
		const mark = marks[markIndex];
		const span = mark.tip - mark.from;
		if (span < 1e-4) {
			continue;
		}
		const base = positions.length / 3;
		const samples = MARK_STEPS + 1;
		for (let step = 0; step < samples; step++) {
			// The tip is first, so the nearer quads are drawn over it.
			const along = mark.tip - (span * step) / MARK_STEPS;
			const share = (along - mark.opening) / MARK_LENGTH;
			const outer = MARK_HALF_WIDTH * (1 - share);
			const inner = Math.max(0, outer - MARK_STROKE * (1 - share));
			const drop = MARK_NEAR_DROP + (MARK_FAR_DROP - MARK_NEAR_DROP) * share;
			const center = pointAt(route, along);
			markBasis(headingAt(route, along), right, up);
			const alpha = markAlpha(along - distance);
			for (const side of [1, -1]) {
				for (const lateral of [outer, inner]) {
					const x = side * lateral;
					positions.push(
						center.x + right.x * x - up.x * drop,
						center.y + right.y * x - up.y * drop,
						center.z + right.z * x - up.z * drop
					);
					colors.push(AMBER.r, AMBER.g, AMBER.b, alpha);
				}
			}
		}
		// Four corners per sample: right outer, right inner, left outer, left inner.
		for (let step = 0; step < MARK_STEPS; step++) {
			for (const arm of [0, 2]) {
				const a = base + step * 4 + arm;
				const b = a + 1;
				const c = a + 4;
				const d = b + 4;
				indices.push(a, c, d, a, d, b);
			}
		}
	}
	if (positions.length === 0) {
		return false;
	}
	mesh.setVerticesData(VertexBuffer.PositionKind, positions, true, 3);
	mesh.setVerticesData(VertexBuffer.ColorKind, colors, true, 4);
	mesh.setIndices(indices);
	return true;
}

/** `right` and `up` for a chevron whose point faces `heading`. World up stays up, unless the course is vertical. */
function markBasis(heading: Vector3, right: Vector3, up: Vector3): void {
	const steep = Math.abs(heading.y) > 0.95;
	const ax = steep ? 1 : 0;
	const ay = steep ? 0 : 1;
	right.set(ay * heading.z, -ax * heading.z, ax * heading.y - ay * heading.x);
	if (right.lengthSquared() < 1e-8) {
		right.set(1, 0, 0);
	} else {
		right.normalize();
	}
	up.set(
		heading.y * right.z - heading.z * right.y,
		heading.z * right.x - heading.x * right.z,
		heading.x * right.y - heading.y * right.x
	);
}

/**
 * The way ahead, built from the end backwards: visibility shows a line from its first point, so
 * reversing it shows the part between the ship and the destination. Burns are bright. The coast
 * and the assist arcs are dull. `climbLength` is where the cruise starts along `route`.
 */
function buildAhead(
	scene: Scene,
	route: Route,
	pixelRatio: number,
	climbLength: number,
	spans: { from: number; to: number }[]
): GreasedLineBaseMesh {
	const fine = subdivide(route, climbLength, spans);
	const points = fine.points.reverse();
	const kinds = fine.kinds.reverse();
	const lit = fine.hot.reverse();
	const widths: number[] = [];
	const colors: Color3[] = [];
	for (let i = 0; i < points.length; i++) {
		const before = kinds[i - 1];
		const after = kinds[i];
		// Arc ends keep the full width, so a pass narrows over its first step and widens over its last.
		const width = before === "assist" && after === "assist" ? ASSIST_WIDTH : 1;
		widths.push(width, width);
		const thrust = lit[i] ?? lit[i - 1];
		colors.push(thrust ? AMBER : COAST);
	}
	const line = CreateGreasedLine(
		"journey-ahead",
		{ points, widths },
		{
			materialType: GreasedLineMeshMaterialType.MATERIAL_TYPE_SIMPLE,
			sizeAttenuation: true,
			width: AHEAD_WIDTH * pixelRatio,
			useColors: true,
			colors,
			colorDistributionType: GreasedLineMeshColorDistributionType.COLOR_DISTRIBUTION_TYPE_SEGMENT,
			visibility: 1,
		},
		scene
	);
	line.isPickable = false;
	line.layerMask = CHART_LAYER;
	return line;
}

/**
 * The course cut into pieces no longer than `AHEAD_STEP`. A screen-width line smears a segment that
 * runs behind the camera into a wedge, and a close chart camera can sit right on the course.
 */
function subdivide(
	route: Route,
	climbLength: number,
	spans: { from: number; to: number }[]
): { points: Vector3[]; kinds: RouteKind[]; hot: boolean[] } {
	const points: Vector3[] = [route.points[0].clone()];
	const kinds: RouteKind[] = [];
	const hot: boolean[] = [];
	let covered = 0;
	const burning = (distance: number) => {
		const along = distance - climbLength;
		return spans.some((span) => along >= span.from - 1e-4 && along <= span.to + 1e-4);
	};
	for (let i = 0; i < route.kinds.length; i++) {
		const from = route.points[i];
		const to = route.points[i + 1];
		const length = Vector3.Distance(from, to);
		const pieces = Math.max(1, Math.ceil(length / AHEAD_STEP));
		const step = length / pieces;
		for (let piece = 1; piece <= pieces; piece++) {
			const next = covered + step;
			points.push(Vector3.Lerp(from, to, piece / pieces));
			kinds.push(route.kinds[i]);
			hot.push(burning((covered + next) / 2));
			covered = next;
		}
	}
	return { points, kinds, hot };
}

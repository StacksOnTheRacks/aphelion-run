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

import type { RingBody } from "./camera-path";
import { CHART_LAYER, PILOT_LAYER } from "./cockpit";
import type { ShipModel } from "./ranger";
import { headingAt, pointAt, type Route, type RouteKind } from "./route";

/**
 * A ship flying a planned trip. It climbs slowly out to the origin's outer orbit, burns fast along
 * the bright line to the destination's outer orbit, slowing as it arrives, then drops slowly inward
 * to dock with one of the craft circling there, and rides with it until the next trip. The bright
 * line is the way ahead and shortens as the ship goes. It is drawn at a fixed width on screen, so the
 * route reads from the whole-system view and from beside a planet alike. From the cockpit the burn is
 * a run of chevrons that fade with distance. The climb out to the outer orbit, and the drop in to dock,
 * stay clear of them. Nothing here moves the camera.
 */

/** World units a ship covers per second on a fast burn, on average. Neptune to the Sun takes about 80 seconds. */
export const JOURNEY_PACE = 14;
/** World units a ship covers per second while climbing out to the outer orbit. */
export const CLIMB_PACE = 3;
/** Average speed of the drop from the outer orbit to a dock. Slower than the climb, so the arrival reads as settling in. */
export const APPROACH_PACE = 1.8;
/** Even a short drop takes this long. */
export const APPROACH_MIN_SECONDS = 10;
/** The ship swings at least this far around the body on the way in, so it closes on its dock from behind. */
export const APPROACH_MIN_SWEEP = 0.8;
/** A hop between neighbours still lasts long enough to watch; the longest burns are capped. */
export const JOURNEY_MIN_SECONDS = 16;
export const JOURNEY_MAX_SECONDS = 120;

export function journeySeconds(total: number): number {
	return Math.min(JOURNEY_MAX_SECONDS, Math.max(JOURNEY_MIN_SECONDS, total / JOURNEY_PACE));
}

/**
 * Speed `t` seconds into a burn. It starts and ends at the climb speed and peaks in the middle.
 * The peak is chosen so the burn still covers `length` in `seconds`. A burn already slower than the
 * climb, because the trip is short, stays at that one speed.
 */
export function cruiseSpeed(t: number, length: number, seconds: number): number {
	if (seconds < 1e-6) {
		return CLIMB_PACE;
	}
	const average = length / seconds;
	if (average <= CLIMB_PACE) {
		return average;
	}
	const along = Math.min(1, Math.max(0, t / seconds));
	const peak = CLIMB_PACE + (average - CLIMB_PACE) * (Math.PI / 2);
	return CLIMB_PACE + (peak - CLIMB_PACE) * Math.sin(Math.PI * along);
}

/** How far along a burn the ship is after `t` seconds. At `t === seconds` this is `length`. */
export function cruiseDistance(t: number, length: number, seconds: number): number {
	if (seconds < 1e-6) {
		return length;
	}
	const clamped = Math.min(seconds, Math.max(0, t));
	const average = length / seconds;
	if (average <= CLIMB_PACE) {
		return average * clamped;
	}
	const peak = CLIMB_PACE + (average - CLIMB_PACE) * (Math.PI / 2);
	const rise = peak - CLIMB_PACE;
	return CLIMB_PACE * clamped + rise * (seconds / Math.PI) * (1 - Math.cos((Math.PI * clamped) / seconds));
}

/** Share of a climb spent easing from dock speed up to the burn. The rest holds climb speed. */
const CLIMB_EASE = 0.4;

/** How long a climb of `length` takes when it starts at `departSpeed` and eases up to climb speed. */
export function climbDuration(length: number, departSpeed: number): number {
	if (length < 1e-6) {
		return 0;
	}
	const v0 = Math.max(0, departSpeed);
	const v1 = CLIMB_PACE;
	if (Math.abs(v1 - v0) < 1e-3) {
		return length / v1;
	}
	const easeLength = CLIMB_EASE * length;
	const easeTime = easeLength / ((v0 + v1) / 2);
	return easeTime + (length - easeLength) / v1;
}

/**
 * Distance covered `t` seconds into a climb that eases from `departSpeed` to climb speed.
 * At `climbDuration` this is `length`.
 */
export function climbDistance(t: number, length: number, departSpeed: number): number {
	if (length < 1e-6) {
		return 0;
	}
	const v0 = Math.max(0, departSpeed);
	const v1 = CLIMB_PACE;
	const clamped = Math.max(0, t);
	if (Math.abs(v1 - v0) < 1e-3) {
		return Math.min(length, v1 * clamped);
	}
	const easeLength = CLIMB_EASE * length;
	const easeTime = easeLength / ((v0 + v1) / 2);
	if (clamped >= easeTime) {
		return Math.min(length, easeLength + v1 * (clamped - easeTime));
	}
	const u = clamped / easeTime;
	const smoothIntegral = u * u * u - 0.5 * u * u * u * u;
	return v0 * clamped + (v1 - v0) * easeTime * smoothIntegral;
}

/**
 * The body the burn ends at, and the way the ship is turning around it when it gets there. With `dock`
 * set the ship docks with that craft; without it, with whichever of the body's craft it reaches first.
 */
export type Arrival = { id: string; turn: number; dock?: Dock };

/**
 * A trip in three parts. `climb` is the slow walk from a base, or from the craft the ship is docked
 * with, out to the departure tangent. `cruise` is the fast burn. `arrive` is where the burn ends; the
 * drop to a dock is planned on arrival, because the craft keep moving.
 */
export type JourneyPlan = {
	climb: Vector3[];
	cruise: Route;
	arrive: Arrival;
	/** Speed the ship is already moving when the climb starts. The climb eases from here up to `CLIMB_PACE`. */
	departSpeed: number;
};

/** A craft a ship can dock with. */
export type Dock = {
	/** Where it is now, relative to the center of the body it circles. */
	position: () => Vector3;
	/** How fast it circles that body, radians per second, counterclockwise seen from above. */
	rate: number;
};

/** A ring around the body, centered on it. */
export type HarborRing = Omit<RingBody, "center">;

/** What a ship can dock with at one body, and the ring it must not cut through on the way in. */
export type Harbor = { docks: Dock[]; ring?: HarborRing };

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

/** A docked ship sits this far above its dock on screen, in CSS pixels, so the dock stays in sight. */
const DOCK_RISE_PIXELS = 6;
/** How far off the ring plane the ship passes, as a multiple of the ring's half height. */
const RING_LIFT = 2.4;
/** How far outside the ring's edge the ship starts to lift, in world units. */
const RING_LIFT_MARGIN = 3;
/** Line width on screen, in CSS pixels. */
const AHEAD_WIDTH = 3;
/** An assist costs less, so its stretch of the line is drawn at this share of the width. */
const ASSIST_WIDTH = 0.5;
/** Longest piece of the drawn line, in world units. The cockpit looks down it from on board. */
const AHEAD_STEP = 2;

const AMBER = Color3.FromHexString("#FCD34D");
const ENERGY = Color3.FromHexString("#F5E6C8");

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
	/** Clears the ship and the line without calling `onDone`. */
	stop: () => void;
	update: (deltaSeconds: number, centerOf: (id: string) => Vector3) => void;
	/** Where the ship is docked, which way that satellite circles, and how fast, once a trip has arrived. */
	docked: () => { id: string; position: Vector3; turn: number; rate: number } | null;
	/** Where the ship is and which way it is heading, while a trip is under way or docked. */
	ship: () => { position: Vector3; heading: Vector3 } | null;
	/** The line being flown and how far along it the ship is, from 0 to 1. Null once the burn has ended. */
	course: () => { points: readonly Vector3[]; progress: number } | null;
	/** Shows course chevrons on the windscreen while a burn is underway. */
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
	elapsed: number;
	phase: "transit" | "approach" | "docked";
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
	camera: Camera,
	glow: GlowLayer,
	harborOf: (id: string) => Harbor,
	ship: ShipModel
): Journey {
	const engine = scene.getEngine();
	let flight: Flight | null = null;
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

	const worldPerPixel = (position: Vector3) => {
		const cssHeight = engine.getRenderHeight() / pixelRatio();
		return (2 * Vector3.Distance(camera.globalPosition, position) * Math.tan(camera.fov / 2)) / cssHeight;
	};

	const placeShip = (position: Vector3, heading: Vector3, deltaSeconds: number) => {
		if (!flight) {
			return;
		}
		const powered = flight.phase === "transit" && flight.elapsed > flight.climbSeconds;
		ship.drive(powered ? "photon" : "impulse", powered ? photonBurn(flight) : 0);
		ship.place(position, heading, deltaSeconds);
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
		current.approach = planApproach(
			current.last,
			current.plan.arrive.turn || 1,
			dock ? { ...harbor, docks: [dock] } : harbor,
			current.heading
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
		if (current.phase === "approach") {
			current.since += deltaSeconds;
		}
		const dock = approach.dock.position();
		dock.y += DOCK_RISE_PIXELS * worldPerPixel(center.add(dock));
		const relative = approachPoint(approach, current.since, dock);
		if (current.phase === "docked" && approach.dock.rate !== 0) {
			const angle = Math.atan2(relative.z, relative.x);
			const turn = Math.sign(approach.dock.rate);
			current.heading = new Vector3(-Math.sin(angle) * turn, 0, Math.cos(angle) * turn);
		} else {
			const step = relative.subtract(current.last);
			if (step.lengthSquared() > 1e-12) {
				current.heading = step.normalize();
			}
		}
		current.last = relative;
		placeShip(center.add(relative), current.heading, deltaSeconds);
	};

	return {
		start(plan, onDone) {
			clear();
			const path = stitch(plan);
			const ahead = buildAhead(scene, path, pixelRatio());
			glow.addExcludedMesh(ahead);
			flight = {
				plan,
				path,
				climbLength: polylineLength(plan.climb),
				climbSeconds: climbDuration(polylineLength(plan.climb), plan.departSpeed),
				cruiseLength: plan.cruise.total,
				cruiseSeconds: journeySeconds(plan.cruise.total),
				departSpeed: plan.departSpeed,
				elapsed: 0,
				phase: "transit",
				approach: null,
				since: 0,
				last: Vector3.Zero(),
				heading: headingAt(path, 0),
				turn: 1,
				onDone,
				ahead,
			};
			const position = pointAt(path, 0);
			placeShip(position, headingAt(path, 0), 0);
		},
		stop: clear,
		docked() {
			if (!flight || flight.phase !== "docked") {
				return null;
			}
			return {
				id: flight.plan.arrive.id,
				position: ship.position.clone(),
				turn: flight.turn,
				rate: flight.approach?.dock.rate ?? 0,
			};
		},
		ship() {
			return flight ? { position: ship.position.clone(), heading: flight.heading.clone() } : null;
		},
		course() {
			if (!flight || flight.phase !== "transit") {
				return null;
			}
			const progress = Math.min(1, distanceAt(flight) / Math.max(flight.path.total, 1e-6));
			return { points: flight.path.points, progress };
		},
		update(deltaSeconds, centerOf) {
			if (!flight) {
				return;
			}
			if (flight.phase !== "transit") {
				hideChevrons();
				const current = flight;
				settle(current, deltaSeconds, centerOf(current.plan.arrive.id));
				if (current.phase === "approach" && current.approach && current.since >= current.approach.seconds) {
					current.phase = "docked";
					current.onDone();
				}
				return;
			}

			flight.elapsed += deltaSeconds;
			const distance = distanceAt(flight);
			if (flight.elapsed >= flight.climbSeconds + flight.cruiseSeconds) {
				const current = flight;
				arrive(current, centerOf(current.plan.arrive.id));
				settle(current, 0, centerOf(current.plan.arrive.id));
				if (current.phase === "docked") {
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
		return climbDistance(flight.elapsed, flight.climbLength, flight.departSpeed);
	}
	return flight.climbLength + cruiseDistance(flight.elapsed - flight.climbSeconds, flight.cruiseLength, flight.cruiseSeconds);
}

/**
 * Picks the dock the ship reaches by swinging forward the least, but at least `APPROACH_MIN_SWEEP`,
 * and plans the drop to it. `from` is where the ship met the outer orbit, relative to the body, and
 * `turn` the way it was circling. `arrival`, when set, is the heading the burn came in on; the drop
 * curves off it onto the spiral. Null when the body has nothing to dock with.
 *
 * Speed eases from the arrival's climb pace down to the dock's orbital speed. The shape of the drop
 * is unchanged: radius eases in, and the angle closes from one side.
 */
export function planApproach(from: Vector3, turn: number, harbor: Harbor, arrival?: Vector3): Approach | null {
	const radius = Math.hypot(from.x, from.z);
	const shipRate = (turn * CLIMB_PACE) / Math.max(radius, 1e-6);
	const fromAngle = Math.atan2(from.z, from.x);
	let best: { dock: Dock; at: Vector3; gap: number; closingRate: number } | null = null;
	for (const dock of harbor.docks) {
		const at = dock.position();
		const closingRate = shipRate - dock.rate;
		const direction = Math.sign(closingRate) || turn;
		let gap = positiveAngle(direction * (Math.atan2(at.z, at.x) - fromAngle));
		if (gap < APPROACH_MIN_SWEEP) {
			gap += Math.PI * 2;
		}
		if (!best || gap < best.gap) {
			best = { dock, at, gap, closingRate: direction * Math.abs(closingRate) };
		}
	}
	if (!best) {
		return null;
	}
	const direction = Math.sign(best.closingRate) || turn;
	const dockRadius = Math.hypot(best.at.x, best.at.z);
	const length = Math.hypot(radius - dockRadius, ((radius + dockRadius) / 2) * best.gap, from.y - best.at.y);
	const seconds = Math.max(APPROACH_MIN_SECONDS, length / APPROACH_PACE);
	// A cubic that ends still stays on one side of the dock only while its starting slope is under three times the gap.
	const closing = direction * Math.min(Math.abs(best.closingRate) * seconds, 3 * best.gap);
	const heading = arrival && arrival.lengthSquared() > 1e-8 ? arrival.normalize() : undefined;
	const approach: Approach = {
		dock: best.dock,
		from: from.clone(),
		lead: -direction * best.gap,
		closing,
		seconds,
		side: 1,
		heading,
	};
	if (harbor.ring) {
		approach.ring = harbor.ring;
	}
	approach.warp = timeWarp(approach, best.at);
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

function spiralPoint(approach: Approach, u: number, dock: Vector3): Vector3 {
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
 * Times the drop so speed eases from climb pace down to the dock's orbital speed, or up to it when
 * the dock is faster. The shape parameter still runs from 0 to 1. Time stretches when the spiral
 * cannot be flown that slowly, and the ship holds on the dock once it arrives.
 */
function timeWarp(approach: Approach, dock0: Vector3): { times: number[]; params: number[] } {
	const v0 = CLIMB_PACE;
	const dockRadius = Math.hypot(dock0.x, dock0.z);
	const v1 = Math.abs(approach.dock.rate) * dockRadius;
	const ceiling = Math.max(v0, v1);
	const times = [0];
	const params = [0];
	let u = 0;
	let t = 0;
	let previous = ceiling;
	for (let step = 0; step < 480 && u < 1 - 1e-4; step++) {
		const ease = v1 + (v0 - v1) * (1 - u);
		const coast = Math.min(ceiling, coastSpeed(approach, dock0, u, t));
		const target = Math.min(previous, Math.max(ease, coast));
		let w = warpRate(approach, dock0, u, t, target);
		if (w < 1e-4) {
			w = warpRate(approach, dock0, u, t, Math.min(ceiling, coast + 0.08));
		}
		if (w < 1e-4) {
			w = 0.004;
		}
		const du = Math.min(1 / 64, 1 - u);
		t += du / w;
		u = Math.min(1, u + du);
		times.push(t);
		params.push(u);
		previous = target;
	}
	const duration = Math.max(approach.seconds, t);
	approach.seconds = duration;
	const end = params.length - 1;
	if (params[end] > 0.98 && params[end] < 1) {
		params[end] = 1;
	}
	if (times[end] < duration - 1e-3 && params[end] >= 1 - 1e-6) {
		times.push(duration);
		params.push(1);
	}
	return { times, params };
}

/** World speed when the shape parameter is held still and only the dock keeps turning. */
function coastSpeed(approach: Approach, dock0: Vector3, u: number, t: number): number {
	const sample = 0.02;
	return Vector3.Distance(posed(approach, u, dock0, t), posed(approach, u, dock0, t + sample)) / sample;
}

/** How fast the shape parameter must move for the ship to travel at `desired` world units a second. */
function warpRate(approach: Approach, dock0: Vector3, u: number, t: number, desired: number): number {
	const speedAt = (w: number) => {
		const sample = 0.02;
		const left = posed(approach, u, dock0, t);
		const right = posed(approach, Math.min(1, u + w * sample), dock0, t + sample);
		return Vector3.Distance(left, right) / sample;
	};
	const slow = speedAt(0);
	if (slow >= desired - 1e-3) {
		return 0;
	}
	let lo = 0;
	let hi = 0.5;
	if (speedAt(hi) < desired) {
		return hi;
	}
	for (let attempt = 0; attempt < 10; attempt++) {
		const mid = (lo + hi) / 2;
		if (speedAt(mid) < desired) {
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
 * reversing it shows the part between the ship and the destination.
 */
function buildAhead(scene: Scene, route: Route, pixelRatio: number): GreasedLineBaseMesh {
	const fine = subdivide(route);
	const points = fine.points.reverse();
	const kinds = fine.kinds.reverse();
	const widths: number[] = [];
	const colors: Color3[] = [];
	for (let i = 0; i < points.length; i++) {
		const before = kinds[i - 1];
		const after = kinds[i];
		// Arc ends keep the full width, so a pass narrows over its first step and widens over its last.
		const width = before === "assist" && after === "assist" ? ASSIST_WIDTH : 1;
		widths.push(width, width);
		colors.push((after ?? before) === "assist" ? ENERGY : AMBER);
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
function subdivide(route: Route): { points: Vector3[]; kinds: RouteKind[] } {
	const points: Vector3[] = [route.points[0].clone()];
	const kinds: RouteKind[] = [];
	for (let i = 0; i < route.kinds.length; i++) {
		const from = route.points[i];
		const to = route.points[i + 1];
		const pieces = Math.max(1, Math.ceil(Vector3.Distance(from, to) / AHEAD_STEP));
		for (let piece = 1; piece <= pieces; piece++) {
			points.push(Vector3.Lerp(from, to, piece / pieces));
			kinds.push(route.kinds[i]);
		}
	}
	return { points, kinds };
}

/** How hard the main engine is working on a photon burn: quiet at the climb speed, full at the peak. */
function photonBurn(flight: Flight): number {
	const t = flight.elapsed - flight.climbSeconds;
	const speed = cruiseSpeed(t, flight.cruiseLength, flight.cruiseSeconds);
	const average = flight.cruiseSeconds < 1e-6 ? speed : flight.cruiseLength / flight.cruiseSeconds;
	const peak =
		average <= CLIMB_PACE ? Math.max(average, 1e-6) : CLIMB_PACE + (average - CLIMB_PACE) * (Math.PI / 2);
	return Math.min(1, Math.max(0, speed / peak));
}

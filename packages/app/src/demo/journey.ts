import type { Camera } from "@babylonjs/core/Cameras/camera";
import type { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import {
	GreasedLineMeshColorDistributionType,
	GreasedLineMeshMaterialType,
	type IGreasedLineMaterial,
} from "@babylonjs/core/Materials/GreasedLine/greasedLineMaterialInterfaces";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector2, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateGreasedLine } from "@babylonjs/core/Meshes/Builders/greasedLineBuilder";
import type { GreasedLineBaseMesh } from "@babylonjs/core/Meshes/GreasedLine/greasedLineBaseMesh";
import type { Scene } from "@babylonjs/core/scene";

import type { RingBody } from "./camera-path";
import { CHART_LAYER } from "./cockpit";
import type { ShipModel } from "./ranger";
import { headingAt, pointAt, type Route, type RouteKind } from "./route";

/**
 * A ship flying a planned trip. It climbs slowly out to the origin's outer orbit, burns fast along
 * the bright line to the destination's outer orbit, slowing as it arrives, then drops slowly inward
 * to dock with one of the craft circling there, and rides with it until the next trip. The bright
 * line is the way ahead and shortens as the ship goes. It is drawn at a fixed width on screen, so the
 * route reads from the whole-system view and from beside a planet alike. Nothing here moves the camera.
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

export type Journey = {
	start: (plan: JourneyPlan, onDone: () => void) => void;
	/** Clears the ship and the line without calling `onDone`. */
	stop: () => void;
	update: (deltaSeconds: number, centerOf: (id: string) => Vector3) => void;
	/** Where the ship is docked, and which way that satellite circles, once a trip has arrived. */
	docked: () => { id: string; position: Vector3; turn: number } | null;
	/** Where the ship is and which way it is heading, while a trip is under way or docked. */
	ship: () => { position: Vector3; heading: Vector3 } | null;
	/** The line being flown and how far along it the ship is, from 0 to 1. Null once the burn has ended. */
	course: () => { points: readonly Vector3[]; progress: number } | null;
};

type Flight = {
	plan: JourneyPlan;
	path: Route;
	climbLength: number;
	climbSeconds: number;
	cruiseLength: number;
	cruiseSeconds: number;
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

	const pixelRatio = () => 1 / engine.getHardwareScalingLevel();

	const clear = () => {
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
		current.last = end.subtract(center);
		current.heading = headingAt(current.path, current.path.total);
		current.since = 0;
		const harbor = harborOf(current.plan.arrive.id);
		const dock = current.plan.arrive.dock;
		current.approach = planApproach(current.last, current.plan.arrive.turn || 1, dock ? { ...harbor, docks: [dock] } : harbor);
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
				climbSeconds: polylineLength(plan.climb) / CLIMB_PACE,
				cruiseLength: plan.cruise.total,
				cruiseSeconds: journeySeconds(plan.cruise.total),
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
			return { id: flight.plan.arrive.id, position: ship.position.clone(), turn: flight.turn };
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
		},
	};
}

function distanceAt(flight: Flight): number {
	if (flight.elapsed <= flight.climbSeconds) {
		return CLIMB_PACE * flight.elapsed;
	}
	return flight.climbLength + cruiseDistance(flight.elapsed - flight.climbSeconds, flight.cruiseLength, flight.cruiseSeconds);
}

/**
 * Picks the dock the ship reaches by swinging forward the least, but at least `APPROACH_MIN_SWEEP`,
 * and plans the drop to it. `from` is where the ship met the outer orbit, relative to the body, and
 * `turn` the way it was circling. Null when the body has nothing to dock with.
 */
export function planApproach(from: Vector3, turn: number, harbor: Harbor): Approach | null {
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
	const approach: Approach = { dock: best.dock, from: from.clone(), lead: -direction * best.gap, closing, seconds, side: 1 };
	if (harbor.ring) {
		approach.ring = harbor.ring;
		approach.side = ringSide(approach, best.at);
	}
	return approach;
}

/**
 * Where the ship is `elapsed` seconds into an approach, relative to the body, given where the dock
 * is right now. Past the end it sits on the dock.
 */
export function approachPoint(approach: Approach, elapsed: number, dock: Vector3): Vector3 {
	const u = Math.min(1, Math.max(0, elapsed / approach.seconds));
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

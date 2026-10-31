import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { BODY_SCALE, SPEED_SCALE, SYSTEM_SCALE } from "./bases";
import { routeAroundBodies, segmentHitsRing, segmentHitsSphere, type RingBody, type SphereBody } from "./camera-path";

/**
 * A ship's course from one point to another in the planets' plane (y = 0).
 *
 * Either end may be a circle instead of a point: the outer orbit the ship is leaving or joining.
 * The course meets that circle along a tangent, so the burn does not cut through the orbit. Of the
 * ways to turn onto and off those circles, the shorter course is the one flown.
 *
 * A body that sits near the way ahead is taken as a gravity assist: the course bends toward it,
 * wraps around it at its flyby radius with the body on the inside of the turn, and leaves toward
 * the next pass. The arc is where that body does the work, so it is the cheap part of the course.
 * Every straight leg between passes is routed around whatever bodies stand in the way.
 */

export type RouteKind = "burn" | "assist";

export type AssistCandidate = {
	name: string;
	center: Vector3;
	/** Radius of the pass around the body. */
	flyby: number;
};

export type RouteInput = {
	start: Vector3;
	end: Vector3;
	/** Radius of the circle the course leaves. 0 leaves from `start` itself. */
	startRadius?: number;
	/** Radius of the circle the course joins. 0 arrives at `end` itself. */
	endRadius?: number;
	/** When set, the course leaves the start circle turning only this way: +1 counterclockwise. */
	startTurn?: number;
	/** When set, the course joins the end circle turning only this way: +1 counterclockwise. */
	endTurn?: number;
	candidates: AssistCandidate[];
	spheres: SphereBody[];
	rings: RingBody[];
};

export type Route = {
	points: Vector3[];
	/** One per segment: `kinds[i]` is the segment from `points[i]` to `points[i + 1]`. */
	kinds: RouteKind[];
	cumulative: number[];
	total: number;
	/** Names of the bodies the course passes for an assist, in the order they are reached. */
	assists: string[];
	/** +1 counterclockwise, -1 clockwise, 0 when that end is a point. */
	startTurn: number;
	endTurn: number;
};

/** A pass is taken only when going by the planet adds at most this share to the distance left. */
export const MAX_DETOUR = 0.15;
/** A pass that bends the course further than this is not one gravity can give. */
export const MAX_TURN = (75 * Math.PI) / 180;

const ARC_STEP = (3 * Math.PI) / 180;
/**
 * About a third of a radian per second. A handoff at this rate still reads as one turn from the cockpit.
 * `HANDOFF_SPEED` matches `CLIMB_PACE` in journey.ts, and `BURN_SPEED` matches `JOURNEY_PACE`.
 */
export const MAX_YAW = Math.PI / 9;
const HANDOFF_SPEED = 3 * SYSTEM_SCALE;
const BURN_SPEED = 14 * SYSTEM_SCALE * SPEED_SCALE;

type Circle = { center: Vector3; radius: number; turn: number };

export function planRoute(input: RouteInput): Route {
	const startRadius = input.startRadius ?? 0;
	const endRadius = input.endRadius ?? 0;
	const startTurns = input.startTurn !== undefined ? [input.startTurn] : startRadius > 0 ? [1, -1] : [0];
	const endTurns = input.endTurn !== undefined ? [input.endTurn] : endRadius > 0 ? [1, -1] : [0];
	let best: Route | undefined;
	for (const startTurn of startTurns) {
		for (const endTurn of endTurns) {
			const route = planTurns(input, startTurn, endTurn);
			if (!best || route.total < best.total) {
				best = route;
			}
		}
	}
	return best ?? planTurns(input, 0, 0);
}

/** One choice of which way the end circles turn. Drops any assist that cannot be joined. */
function planTurns(input: RouteInput, startTurn: number, endTurn: number): Route {
	let chosen = pickAssists(input.start, input.end, input.candidates);
	for (;;) {
		const built = buildCourse(input, chosen, startTurn, endTurn);
		if (built.route) {
			return built.route;
		}
		if (chosen.length === 0) {
			return fallbackRoute(input, startTurn, endTurn);
		}
		chosen = chosen.filter((_, index) => index !== built.failed);
	}
}

/** A straight join, used only when the circles cannot share a tangent. Points land on each rim. */
function fallbackRoute(input: RouteInput, startTurn: number, endTurn: number): Route {
	const points = [rimPoint(input.start, input.startRadius ?? 0, input.end), rimPoint(input.end, input.endRadius ?? 0, input.start)];
	const total = Vector3.Distance(points[0], points[1]);
	return { points, kinds: ["burn"], cumulative: [0, total], total, assists: [], startTurn, endTurn };
}

/** The point on the horizontal circle at `center` in the direction of `toward`, or the center when the radius is 0. */
function rimPoint(center: Vector3, radius: number, toward: Vector3): Vector3 {
	if (radius <= 0) {
		return center.clone();
	}
	const flat = new Vector3(toward.x - center.x, 0, toward.z - center.z);
	const direction = flat.lengthSquared() < 1e-12 ? new Vector3(1, 0, 0) : flat.normalize();
	return new Vector3(center.x + direction.x * radius, center.y, center.z + direction.z * radius);
}

/** Where the ship is, `distance` along the course. */
export function pointAt(route: Route, distance: number): Vector3 {
	const index = segmentAt(route, distance);
	const span = route.cumulative[index + 1] - route.cumulative[index];
	const local = span < 1e-9 ? 0 : (clampDistance(route, distance) - route.cumulative[index]) / span;
	return Vector3.Lerp(route.points[index], route.points[index + 1], Math.min(1, Math.max(0, local)));
}

/**
 * Unit tangent of the course, `distance` along it. A fillet is a run of short segments, so the tangent
 * turns across each corner instead of snapping: halfway along the shorter neighbor before the corner
 * to halfway along it after. Fillets keep those corners small, so this blend is the tangent of the arc.
 */
export function headingAt(route: Route, distance: number): Vector3 {
	const index = segmentAt(route, distance);
	const along = clampDistance(route, distance);
	const here = segmentDirection(route, index);
	const start = route.cumulative[index];
	const end = route.cumulative[index + 1];
	if (index > 0) {
		const half = Math.min(end - start, start - route.cumulative[index - 1]) / 2;
		if (half > 1e-9 && along < start + half) {
			return turnBetween(segmentDirection(route, index - 1), here, 0.5 + (along - start) / (2 * half));
		}
	}
	if (index < route.kinds.length - 1) {
		const half = Math.min(end - start, route.cumulative[index + 2] - end) / 2;
		if (half > 1e-9 && along > end - half) {
			return turnBetween(here, segmentDirection(route, index + 1), (along - end + half) / (2 * half));
		}
	}
	return here;
}

function segmentDirection(route: Route, index: number): Vector3 {
	const direction = route.points[index + 1].subtract(route.points[index]);
	if (direction.lengthSquared() < 1e-12) {
		return new Vector3(1, 0, 0);
	}
	return direction.normalize();
}

/** `from` turned toward `to` by `share`, kept a unit vector. A full reversal does not blend and takes `to`. */
function turnBetween(from: Vector3, to: Vector3, share: number): Vector3 {
	const blended = Vector3.Lerp(from, to, Math.min(1, Math.max(0, share)));
	return blended.lengthSquared() < 1e-12 ? to.clone() : blended.normalize();
}

/** Index of the segment that holds `distance`. */
export function segmentAt(route: Route, distance: number): number {
	const clamped = clampDistance(route, distance);
	let index = 0;
	while (index < route.kinds.length - 1 && route.cumulative[index + 1] < clamped) {
		index += 1;
	}
	return index;
}

function clampDistance(route: Route, distance: number): number {
	return Math.min(route.total, Math.max(0, distance));
}

/**
 * Walks from the start toward the end, taking each body whose pass is cheap enough, farthest
 * from the end first. Each accepted pass becomes the point the next one is measured from.
 */
function pickAssists(start: Vector3, end: Vector3, candidates: AssistCandidate[]): AssistCandidate[] {
	const startLeft = Vector3.Distance(start, end);
	const ahead = candidates
		.filter((candidate) => Vector3.Distance(candidate.center, end) < startLeft)
		.sort((a, b) => Vector3.Distance(b.center, end) - Vector3.Distance(a.center, end));

	const chosen: AssistCandidate[] = [];
	let from = start;
	for (const candidate of ahead) {
		const remaining = Vector3.Distance(from, end);
		const inbound = Vector3.Distance(from, candidate.center);
		const onward = Vector3.Distance(candidate.center, end);
		if (onward >= remaining || inbound <= candidate.flyby * 1.05 || onward <= candidate.flyby * 1.05) {
			continue;
		}
		if (inbound + onward - remaining > MAX_DETOUR * remaining) {
			continue;
		}
		if (turnAngle(from, candidate.center, end) > MAX_TURN) {
			continue;
		}
		chosen.push(candidate);
		from = candidate.center;
	}
	return chosen;
}

type Built = { route: Route; failed?: undefined } | { route?: undefined; failed: number };

function buildCourse(input: RouteInput, assists: AssistCandidate[], startTurn: number, endTurn: number): Built {
	const startRadius = input.startRadius ?? 0;
	const endRadius = input.endRadius ?? 0;
	const centers = [input.start, ...assists.map((assist) => assist.center), input.end];
	const circles: Circle[] = centers.map((center, index) => {
		if (index === 0) {
			return { center, radius: startRadius, turn: startRadius > 0 ? startTurn : 0 };
		}
		if (index === centers.length - 1) {
			return { center, radius: endRadius, turn: endRadius > 0 ? endTurn : 0 };
		}
		const bend = cross2(center.subtract(centers[index - 1]), centers[index + 1].subtract(center));
		return { center, radius: assists[index - 1].flyby, turn: bend >= 0 ? 1 : -1 };
	});

	const tangents: { leave: Vector3; arrive: Vector3 }[] = [];
	for (let i = 0; i < circles.length - 1; i++) {
		const tangent = tangentBetween(circles[i], circles[i + 1]);
		if (!tangent) {
			// Two passes too close to share a straight leg: drop the later one, or the earlier at the end.
			return { failed: Math.min(i, assists.length - 1) };
		}
		tangents.push(tangent);
	}

	const points: Vector3[] = [];
	const kinds: RouteKind[] = [];
	const push = (point: Vector3, kind: RouteKind) => {
		if (points.length === 0) {
			points.push(point.clone());
			return;
		}
		if (Vector3.DistanceSquared(point, points[points.length - 1]) > 1e-8) {
			points.push(point.clone());
			kinds.push(kind);
		}
	};

	if (startRadius === 0) {
		push(input.start, "burn");
	}
	for (let i = 0; i < tangents.length; i++) {
		const { leave, arrive } = tangents[i];
		const leg = [leave, ...routeAroundBodies(leave, arrive, input.spheres, input.rings), arrive];
		for (const point of leg) {
			push(point, "burn");
		}
		const next = circles[i + 1];
		if (i + 1 < circles.length - 1) {
			for (const point of arcPoints(next, tangents[i].arrive, tangents[i + 1].leave)) {
				push(point, "assist");
			}
		}
	}
	if (endRadius === 0) {
		push(input.end, "burn");
	}

	const cumulative = [0];
	for (let i = 1; i < points.length; i++) {
		cumulative.push(cumulative[i - 1] + Vector3.Distance(points[i - 1], points[i]));
	}
	return {
		route: {
			points,
			kinds,
			cumulative,
			total: cumulative[cumulative.length - 1],
			assists: assists.map((assist) => assist.name),
			startTurn: startRadius > 0 ? startTurn : 0,
			endTurn: endRadius > 0 ? endTurn : 0,
		},
	};
}

/**
 * The straight leg that leaves circle `a` and meets circle `b`, each travelled in its own turn
 * direction. A circle travelled counterclockwise (turn 1) keeps its center on the left of the leg.
 */
function tangentBetween(a: Circle, b: Circle): { leave: Vector3; arrive: Vector3 } | null {
	const dx = b.center.x - a.center.x;
	const dz = b.center.z - a.center.z;
	const distance = Math.hypot(dx, dz);
	const offset = b.turn * b.radius - a.turn * a.radius;
	if (distance < 1e-9 || Math.abs(offset) >= distance) {
		return null;
	}
	const bearing = Math.atan2(dz, dx);
	const spread = Math.acos(offset / distance);
	for (const angle of [bearing + spread, bearing - spread]) {
		const nx = Math.cos(angle);
		const nz = Math.sin(angle);
		// Direction of travel along the leg: the normal turned a quarter clockwise.
		if (dx * nz - dz * nx <= 0) {
			continue;
		}
		return {
			leave: new Vector3(a.center.x - a.turn * a.radius * nx, a.center.y, a.center.z - a.turn * a.radius * nz),
			arrive: new Vector3(b.center.x - b.turn * b.radius * nx, b.center.y, b.center.z - b.turn * b.radius * nz),
		};
	}
	return null;
}

function arcPoints(circle: Circle, from: Vector3, to: Vector3): Vector3[] {
	const start = Math.atan2(from.z - circle.center.z, from.x - circle.center.x);
	const finish = Math.atan2(to.z - circle.center.z, to.x - circle.center.x);
	let sweep = finish - start;
	if (circle.turn > 0) {
		while (sweep < 0) {
			sweep += Math.PI * 2;
		}
	} else {
		while (sweep > 0) {
			sweep -= Math.PI * 2;
		}
	}
	const steps = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP));
	const points: Vector3[] = [];
	for (let i = 0; i <= steps; i++) {
		const angle = start + sweep * (i / steps);
		points.push(
			new Vector3(
				circle.center.x + Math.cos(angle) * circle.radius,
				circle.center.y,
				circle.center.z + Math.sin(angle) * circle.radius
			)
		);
	}
	return points;
}

/**
 * The cost of a climb that heads against the orbit, in world units. Reversing throws away the speed
 * the ship already has and builds it the other way, which costs as much as flying halfway around the
 * orbit it is already on. Swinging around with the orbit is the cheaper departure until the swing
 * costs more than that.
 */
export function reversalPenalty(radius: number): number {
	return Math.PI * Math.max(0, radius);
}

/**
 * The slow climb from a dock out to where the burn leaves the outer orbit. The ship keeps turning
 * `turn` (+1 counterclockwise): it starts along the orbit it is on, eases outward, and arrives along
 * the outer orbit headed the way the burn leaves. A ring in the way is crossed above or below it.
 */
export function departureSpiral(center: Vector3, from: Vector3, to: Vector3, turn: number, rings: RingBody[]): Vector3[] {
	const a0 = Math.atan2(from.z - center.z, from.x - center.x);
	const a1 = Math.atan2(to.z - center.z, to.x - center.x);
	const r0 = Math.hypot(from.x - center.x, from.z - center.z);
	const r1 = Math.hypot(to.x - center.x, to.z - center.z);
	const direction = turn >= 0 ? 1 : -1;
	const sweep = sweepToward(a0, a1, direction);
	const steps = Math.max(8, Math.ceil(Math.max(sweep, Math.abs(r1 - r0) / Math.max(r0, 1)) / ARC_STEP));
	const points: Vector3[] = [];
	for (let i = 0; i <= steps; i++) {
		const u = i / steps;
		const radius = r0 + (r1 - r0) * ease(u);
		const angle = a0 + direction * sweep * u;
		points.push(
			new Vector3(center.x + Math.cos(angle) * radius, from.y + (to.y - from.y) * u, center.z + Math.sin(angle) * radius)
		);
	}
	points[0] = from.clone();
	points[points.length - 1] = to.clone();
	return liftSpiral(points, rings);
}

/** Sweep from `from` to `to` in the direction of `turn`, in [0, 2π). */
function sweepToward(from: number, to: number, turn: number): number {
	const full = Math.PI * 2;
	const raw = turn * (to - from);
	return ((raw % full) + full) % full;
}

/** Zero slope at both ends, so a climb leaves and arrives along its orbit. */
function ease(u: number): number {
	return u * u * (3 - 2 * u);
}

/** One ring thickness off the plane: two half-heights. The burn, the climb, and the drop share this. */
const RING_CLEARANCE = 2;
/** How far outside a ring's edge the climb starts to rise, in world units. Grows with the ring. */
const RING_FADE = 3 * BODY_SCALE;

function liftSpiral(points: Vector3[], rings: RingBody[]): Vector3[] {
	let lifted = points;
	for (const ring of rings) {
		const start = acrossRing(lifted[0], ring);
		const innerMargin = Math.max(1e-3, Math.min(RING_FADE, (ring.inner - start.across) * 0.6));
		const side = spiralRingSide(lifted, ring);
		lifted = lifted.map((point, index) =>
			index === 0 || index === lifted.length - 1 ? point : liftPoint(point, ring, side, innerMargin)
		);
	}
	return lifted;
}

/** The side of the ring the climb mostly crosses on, so the whole rise stays to one side of it. */
function spiralRingSide(points: Vector3[], ring: RingBody): number {
	let sum = 0;
	for (const point of points) {
		const { height, across } = acrossRing(point, ring);
		if (across >= ring.inner && across <= ring.outer) {
			sum += height;
		}
	}
	return sum < 0 ? -1 : 1;
}

function liftPoint(point: Vector3, ring: RingBody, side: number, innerMargin: number): Vector3 {
	const { height, across, normal } = acrossRing(point, ring);
	const over =
		smoothstep(ring.inner - innerMargin, ring.inner, across) * (1 - smoothstep(ring.outer, ring.outer + RING_FADE, across));
	if (over <= 0) {
		return point;
	}
	const clear = ring.halfHeight * RING_CLEARANCE;
	const lifted = side * softMax(side * height, clear, ring.halfHeight);
	return point.add(normal.scale((lifted - height) * over));
}

function acrossRing(point: Vector3, ring: RingBody): { height: number; across: number; normal: Vector3 } {
	const normal = ring.normal.normalizeToNew();
	const offset = point.subtract(ring.center);
	const height = Vector3.Dot(offset, normal);
	return { height, across: Math.sqrt(Math.max(0, offset.lengthSquared() - height * height)), normal };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	if (edge1 === edge0) {
		return x >= edge1 ? 1 : 0;
	}
	const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

/** A max with its corner rounded over `soft`, so the lifted path has no kink. */
function softMax(a: number, b: number, soft: number): number {
	return 0.5 * (a + b + Math.sqrt((a - b) * (a - b) + soft * soft));
}

/** A heading gap smaller than this is already a smooth join. */
const GENTLE_GAP = (5 * Math.PI) / 180;

/**
 * Fillet radius at `speed` that yaws at `MAX_YAW`, shrunk so the turn fits in `zone`.
 * A small moon's zone is a fraction of a world unit, so the radius shrinks with it.
 */
export function turnRadius(speed: number, zone: number): number {
	const fromSpeed = Math.max(speed, 0.05) / MAX_YAW;
	// Pace grew with the system and the shell with the body, so the turn needs the same
	// fraction of the zone it had before those two scales diverged. The coast is faster
	// than this handoff; burn fillets ask for that speed and this clamp still limits them.
	const fit = Math.max(zone * 0.35 * (SYSTEM_SCALE / BODY_SCALE), 0.02 * BODY_SCALE);
	return Math.min(fromSpeed, fit);
}

/** Radial span of a climb, or the chord when the path is not around `center`. */
function zoneSpan(points: Vector3[], center?: Vector3): number {
	if (points.length < 2) {
		return 1;
	}
	if (center) {
		const inner = Math.hypot(points[0].x - center.x, points[0].z - center.z);
		const outer = Math.hypot(points[points.length - 1].x - center.x, points[points.length - 1].z - center.z);
		const span = Math.abs(outer - inner);
		if (span > 0.05) {
			return span;
		}
	}
	return Math.max(0.05, Vector3.Distance(points[0], points[points.length - 1]));
}

/** Unit tangent of the orbit through `point`. `turn` +1 is counterclockwise seen from above. */
export function tangentHeading(center: Vector3, point: Vector3, turn: number): Vector3 {
	const rx = point.x - center.x;
	const rz = point.z - center.z;
	const len = Math.hypot(rx, rz);
	if (len < 1e-9) {
		return new Vector3(0, 0, turn >= 0 ? 1 : -1);
	}
	const dir = turn >= 0 ? 1 : -1;
	return new Vector3((-rz / len) * dir, 0, (rx / len) * dir);
}

/**
 * Replaces the start of a climb when it does not leave along `heading`. The ship is facing along the
 * orbit it is docked to; a departure the other way curves off that heading instead of snapping around.
 * A curve that would cut a body or a ring is tightened until it stays clear, and the original climb
 * is kept when even a tight curve cannot.
 */
export function curveClimbStart(
	points: Vector3[],
	heading: Vector3,
	spheres: SphereBody[],
	rings: RingBody[],
	center?: Vector3
): Vector3[] {
	if (points.length < 2) {
		return points;
	}
	const way = points[1].subtract(points[0]);
	if (way.lengthSquared() < 1e-10) {
		return points;
	}
	const aimed = heading.lengthSquared() < 1e-10 ? way.normalize() : heading.normalize();
	const gap = Math.acos(clampUnit(Vector3.Dot(way.normalize(), aimed)));
	if (gap < GENTLE_GAP) {
		return points;
	}
	if (center) {
		const opened = openDeparture(points, aimed, center, spheres, rings);
		if (opened) {
			return opened;
		}
	}
	const total = polylineLength(points);
	const radius = turnRadius(HANDOFF_SPEED, zoneSpan(points, center));
	for (const scale of [1, 1.7, 2.6, 0.6]) {
		for (const flip of [false, true]) {
			const reach = Math.min(total * 0.7, radius * Math.max(gap, 0.35) * scale);
			const curved = replacePrefix(points, aimed, reach, scale, flip);
			if (curved && !polylineHits(curved, spheres, rings)) {
				return curved;
			}
		}
	}
	return points;
}

/**
 * Curves the handoff where a climb meets a burn. The burn still begins on the outer orbit. The climb
 * arrives there along the burn's first heading, and a short pitched hop just after that point is
 * filleted in place. A curve that would cut a body or a ring is tightened back toward the corner,
 * and the original join is kept when that still cannot clear.
 */
export function curveClimbJoin(
	climb: Vector3[],
	route: Route,
	spheres: SphereBody[],
	rings: RingBody[],
	center?: Vector3
): { climb: Vector3[]; route: Route } {
	if (climb.length < 2 || route.points.length < 2 || route.total < 0.5) {
		return { climb, route };
	}
	const burnStep = route.points[1].subtract(route.points[0]);
	if (burnStep.lengthSquared() < 1e-10) {
		return { climb, route };
	}
	const burnHeading = burnStep.normalize();
	const climbLen = polylineLength(climb);
	const radius = turnRadius(HANDOFF_SPEED, zoneSpan(climb, center));
	const reach = Math.min(climbLen * 0.45, Math.max(radius * 2, radius));
	const leave = pointBeforeEnd(climb, Math.min(reach, climbLen * 0.7));
	let nextClimb = climb;
	if (leave && Vector3.DistanceSquared(leave.point, route.points[0]) > 1e-4) {
		const gap = Math.acos(clampUnit(Vector3.Dot(leave.heading, burnHeading)));
		if (gap >= GENTLE_GAP) {
			for (const scale of [1, 1.7, 2.6, 0.6]) {
				for (const flip of [false, true]) {
					const curve = headingCurve(leave.point, leave.heading, route.points[0], burnHeading, scale, flip);
					if (!curve) {
						continue;
					}
					const shaped = dedupePoints([...leave.before, ...curve]);
					if (shaped.length >= 2 && !polylineHits(shaped, spheres, rings)) {
						nextClimb = shaped;
						break;
					}
				}
				if (nextClimb !== climb) {
					break;
				}
			}
		}
	}
	const filleted = filletCruisePrefix(route, spheres, rings);
	return { climb: dropSlivers(nextClimb), route: filleted };
}

function dropSlivers(points: Vector3[]): Vector3[] {
	if (points.length < 3) {
		return points;
	}
	const kept = [points[0]];
	for (let i = 1; i < points.length - 1; i++) {
		if (Vector3.Distance(points[i], kept[kept.length - 1]) >= 0.002 * BODY_SCALE) {
			kept.push(points[i]);
		}
	}
	const last = points[points.length - 1];
	if (Vector3.Distance(last, kept[kept.length - 1]) < 0.002 * BODY_SCALE) {
		kept[kept.length - 1] = last;
	} else {
		kept.push(last);
	}
	return kept;
}

function dropRouteSlivers(points: Vector3[], kinds: RouteKind[]): { points: Vector3[]; kinds: RouteKind[] } {
	const keptPoints = [points[0].clone()];
	const keptKinds: RouteKind[] = [];
	for (let i = 1; i < points.length; i++) {
		const close = Vector3.Distance(points[i], keptPoints[keptPoints.length - 1]) < 0.02;
		if (close && i < points.length - 1) {
			continue;
		}
		if (close && keptPoints.length > 1) {
			keptPoints[keptPoints.length - 1] = points[i].clone();
			continue;
		}
		keptKinds.push(kinds[Math.min(i - 1, kinds.length - 1)] ?? "burn");
		keptPoints.push(points[i].clone());
	}
	if (keptPoints.length < 2 || keptKinds.length !== keptPoints.length - 1) {
		return { points, kinds };
	}
	return { points: keptPoints, kinds: keptKinds };
}

/** Rounds sharp burn corners, leaving assist arcs on their flyby circle and the first point on the outer orbit. */
function filletCruisePrefix(route: Route, spheres: SphereBody[], rings: RingBody[]): Route {
	let points = route.points.map((point) => point.clone());
	let kinds = route.kinds.slice();
	const ideal = turnRadius(BURN_SPEED, Math.max(zoneSpan(points), 1));
	for (let guard = 0; guard < 24; guard++) {
		let changed = false;
		for (let i = 1; i < points.length - 1; i++) {
			if (kinds[i - 1] === "assist" || kinds[i] === "assist") {
				continue;
			}
			const incoming = points[i].subtract(points[i - 1]);
			const outgoing = points[i + 1].subtract(points[i]);
			const inLen = incoming.length();
			const outLen = outgoing.length();
			if (inLen < 1e-6 || outLen < 1e-6) {
				continue;
			}
			const tIn = incoming.scale(1 / inLen);
			const tOut = outgoing.scale(1 / outLen);
			const gap = Math.acos(clampUnit(Vector3.Dot(tIn, tOut)));
			if (gap < GENTLE_GAP || gap > Math.PI * 0.92) {
				continue;
			}
			let radius = ideal;
			for (let attempt = 0; attempt < 5; attempt++) {
				const trim = radius * Math.tan(gap / 2);
				if (trim < 0.002 || trim > inLen * 0.45 || trim > outLen * 0.45) {
					radius *= 0.55;
					continue;
				}
				const arc = circularFillet(points[i], tIn, tOut, radius, trim, gap);
				if (!arc) {
					radius *= 0.55;
					continue;
				}
				const nextPoints = dedupePoints([...points.slice(0, i), ...arc, ...points.slice(i + 1)]);
				const added = nextPoints.length - (points.length - 1);
				const nextKinds = [...kinds.slice(0, i - 1), ...new Array(Math.max(0, added)).fill(kinds[i - 1] ?? "burn"), ...kinds.slice(i)];
				if (nextKinds.length !== nextPoints.length - 1) {
					radius *= 0.55;
					continue;
				}
				if (!polylineHits(nextPoints, spheres, rings)) {
					points = nextPoints;
					kinds = nextKinds as RouteKind[];
					changed = true;
					break;
				}
				radius *= 0.55;
			}
			if (changed) {
				break;
			}
		}
		if (!changed) {
			break;
		}
	}
	if (points.length < 2 || kinds.length !== points.length - 1) {
		return route;
	}
	const cleaned = dropRouteSlivers(points, kinds);
	return rebuildRoute(route, cleaned.points, cleaned.kinds);
}

function circularFillet(
	corner: Vector3,
	tIn: Vector3,
	tOut: Vector3,
	radius: number,
	trim: number,
	gap: number
): Vector3[] | null {
	const axis = Vector3.Cross(tIn, tOut);
	if (axis.lengthSquared() < 1e-10) {
		return null;
	}
	axis.normalize();
	const start = corner.subtract(tIn.scale(trim));
	const toward = Vector3.Cross(axis, tIn);
	if (toward.lengthSquared() < 1e-10) {
		return null;
	}
	const center = start.add(toward.normalize().scale(radius));
	const from = start.subtract(center);
	const steps = Math.max(2, Math.ceil(gap / ARC_STEP));
	const points: Vector3[] = [];
	for (let i = 0; i <= steps; i++) {
		points.push(center.add(rotateAround(from, axis, gap * (i / steps))));
	}
	points[0] = start;
	points[points.length - 1] = corner.add(tOut.scale(trim));
	return points;
}

function rotateAround(vector: Vector3, axis: Vector3, angle: number): Vector3 {
	const cos = Math.cos(angle);
	const sin = Math.sin(angle);
	const cross = Vector3.Cross(axis, vector);
	const along = Vector3.Dot(axis, vector);
	return vector.scale(cos).add(cross.scale(sin)).add(axis.scale(along * (1 - cos)));
}

/**
 * Turns off the docked heading onto the climb's turn, bulging away from the body, then climbs from
 * there. A reverse departure is a curve out of the dock instead of a snap onto the opposite tangent.
 */
function openDeparture(
	points: Vector3[],
	heading: Vector3,
	center: Vector3,
	spheres: SphereBody[],
	rings: RingBody[]
): Vector3[] | null {
	const radial = points[0].subtract(center);
	const first = points[1].subtract(points[0]);
	if (first.lengthSquared() < 1e-10) {
		return null;
	}
	const turn = Math.sign(radial.x * first.z - radial.z * first.x) || 1;
	const goal = points[points.length - 1];
	const base = turnRadius(HANDOFF_SPEED, zoneSpan(points, center));
	for (const radius of [base, base * 0.65, base * 1.35]) {
		const arc = turnOntoOrbit(center, points[0], heading, turn, radius);
		if (!arc || arc.length < 2) {
			continue;
		}
		const spiral = departureSpiral(center, arc[arc.length - 1], goal, turn, rings);
		const spiralLength = polylineLength(spiral);
		const tail = spiralLength < 0.5 ? [goal] : spiral;
		if (tail.length > 1 && !joinIsGentle(arc, tail)) {
			continue;
		}
		const stitched = dedupePoints([...arc.slice(0, -1), ...tail]);
		if (stitched.length >= 2 && Vector3.Distance(stitched[stitched.length - 1], goal) < 1e-4 && !polylineHits(stitched, spheres, rings)) {
			return stitched;
		}
	}
	return null;
}

/** Sweeps `heading` until it lines up with the orbit through the ship. A large reversal turns outward and keeps that direction. */
function turnOntoOrbit(center: Vector3, from: Vector3, fromHeading: Vector3, turn: number, radius: number): Vector3[] | null {
	const up = new Vector3(0, 1, 0);
	const step = (1.5 * Math.PI) / 180;
	let heading = new Vector3(fromHeading.x, 0, fromHeading.z);
	if (heading.lengthSquared() < 1e-8) {
		return null;
	}
	heading = heading.normalize();
	const local = tangentHeading(center, from, turn);
	if (Vector3.Dot(heading, local) > Math.cos(GENTLE_GAP)) {
		return null;
	}
	const dir = departureTurn(from, heading, local, center, radius);
	let pos = from.clone();
	const points = [from.clone()];
	const maxSteps = Math.ceil((Math.PI * 1.35) / step) + 1;
	for (let i = 0; i < maxSteps; i++) {
		const here = tangentHeading(center, pos, turn);
		const cross = heading.x * here.z - heading.z * here.x;
		const remain = Math.atan2(cross, clampUnit(Vector3.Dot(heading, here)));
		if (Math.abs(remain) <= step) {
			if (radius * Math.abs(remain) >= 0.05) {
				const mid = rotateAround(heading, up, remain * 0.5);
				pos = new Vector3(pos.x + mid.x * radius * Math.abs(remain), from.y, pos.z + mid.z * radius * Math.abs(remain));
				points.push(pos.clone());
			}
			return points.length >= 2 ? points : null;
		}
		const delta = dir * step;
		const mid = rotateAround(heading, up, delta * 0.5);
		pos = new Vector3(pos.x + mid.x * radius * step, from.y, pos.z + mid.z * radius * step);
		heading = rotateAround(heading, up, delta).normalize();
		points.push(pos.clone());
	}
	return null;
}

/** +1 turns with a positive rotation about world up. Big reversals bulge away from the body. */
function departureTurn(from: Vector3, heading: Vector3, local: Vector3, center: Vector3, radius: number): number {
	const gain = (dir: number) => {
		const mid = rotateAround(heading, new Vector3(0, 1, 0), dir * ARC_STEP * 0.5);
		const next = from.add(new Vector3(mid.x, 0, mid.z).scale(radius * ARC_STEP));
		return Vector3.DistanceSquared(next, center);
	};
	const outward = gain(1) >= gain(-1) ? 1 : -1;
	const cross = heading.x * local.z - heading.z * local.x;
	const gap = Math.acos(clampUnit(Vector3.Dot(heading, local)));
	if (gap > Math.PI * 0.5 || Math.abs(cross) < 0.02) {
		return outward;
	}
	return cross > 0 ? 1 : -1;
}

function joinIsGentle(arc: Vector3[], spiral: Vector3[]): boolean {
	if (!curveIsGentle(arc)) {
		return false;
	}
	const incoming = arc[arc.length - 1].subtract(arc[arc.length - 2]);
	const outgoing = spiral[1].subtract(spiral[0]);
	if (incoming.length() < 0.002 || outgoing.length() < 0.002) {
		return false;
	}
	return Vector3.Dot(incoming.normalize(), outgoing.normalize()) > Math.cos((25 * Math.PI) / 180);
}

function replacePrefix(points: Vector3[], heading: Vector3, reach: number, scale: number, flip: boolean): Vector3[] | null {
	const cut = pointAlongPoints(points, reach);
	if (!cut) {
		return null;
	}
	const curve = headingCurve(points[0], heading, cut.point, cut.heading, scale, flip);
	if (!curve) {
		return null;
	}
	return dedupePoints([...curve, ...cut.rest]);
}

/**
 * A curve that leaves `from` along `fromHeading` and arrives at `to` along `toHeading`.
 * Both ends keep those tangents, so the join does not grow a kink when the curve is pulled onto `to`.
 * `scale` widens the turn. `flip` tries the other handle balance when one bulge cuts a body.
 */
function headingCurve(
	from: Vector3,
	fromHeading: Vector3,
	to: Vector3,
	toHeading: Vector3,
	scale: number,
	flip = false
): Vector3[] | null {
	const distance = to.subtract(from).length();
	if (distance < 1e-4) {
		return null;
	}
	const fromH = fromHeading.normalize();
	const toH = toHeading.normalize();
	const gap = Math.acos(clampUnit(Vector3.Dot(fromH, toH)));
	const radius =
		Math.max(turnRadius(HANDOFF_SPEED, Math.max(distance, 0.05)), distance / Math.max(gap, 0.2)) * Math.max(scale, 0.35);
	const handle = Math.min(distance * 0.48, Math.max(distance * 0.18, radius * Math.tan(Math.min(gap, 1.2) / 2)));
	const out = handle * (flip ? 0.65 : 1);
	const inn = handle * (flip ? 1 : 0.65);
	const p1 = from.add(fromH.scale(out));
	const p2 = to.subtract(toH.scale(inn));
	const steps = Math.max(8, Math.ceil(Math.max(gap, 0.25) / ARC_STEP));
	const points: Vector3[] = [];
	for (let i = 0; i <= steps; i++) {
		points.push(bezierPoint(from, p1, p2, to, i / steps));
	}
	if (!curveIsGentle(points) || !tangentMatches(points, fromH, toH)) {
		return null;
	}
	return points;
}

/** Cubic Bezier. The first step lies along `p1 - p0` and the last along `p3 - p2`. */
function bezierPoint(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, t: number): Vector3 {
	const u = 1 - t;
	return p0.scale(u * u * u).add(p1.scale(3 * u * u * t)).add(p2.scale(3 * u * t * t)).add(p3.scale(t * t * t));
}

/** The curve actually leaves on `fromH` and arrives on `toH`. */
function tangentMatches(points: Vector3[], fromH: Vector3, toH: Vector3): boolean {
	const left = points[1].subtract(points[0]);
	const arrived = points[points.length - 1].subtract(points[points.length - 2]);
	if (left.lengthSquared() < 1e-10 || arrived.lengthSquared() < 1e-10) {
		return false;
	}
	const limit = Math.cos(GENTLE_GAP);
	return Vector3.Dot(left.normalize(), fromH) >= limit && Vector3.Dot(arrived.normalize(), toH) >= limit;
}

function curveIsGentle(points: Vector3[]): boolean {
	let previous: Vector3 | null = null;
	for (let i = 1; i < points.length; i++) {
		const step = points[i].subtract(points[i - 1]);
		const len = step.length();
		if (len < 0.002) {
			return false;
		}
		const heading = step.scale(1 / len);
		if (previous && Vector3.Dot(previous, heading) < Math.cos((25 * Math.PI) / 180)) {
			return false;
		}
		previous = heading;
	}
	return true;
}

function pointAlongPoints(
	points: Vector3[],
	distance: number
): { point: Vector3; heading: Vector3; rest: Vector3[] } | null {
	let left = Math.max(0, distance);
	for (let i = 1; i < points.length; i++) {
		const step = points[i].subtract(points[i - 1]);
		const len = step.length();
		if (len < 1e-8) {
			continue;
		}
		if (left <= len) {
			const t = left / len;
			const point = Vector3.Lerp(points[i - 1], points[i], t);
			const rest = t > 1 - 1e-4 ? points.slice(i) : [point, ...points.slice(i)];
			return { point, heading: step.normalize(), rest };
		}
		left -= len;
	}
	return null;
}

function pointBeforeEnd(
	points: Vector3[],
	distance: number
): { point: Vector3; heading: Vector3; before: Vector3[] } | null {
	const total = polylineLength(points);
	const at = Math.max(0, total - distance);
	let covered = 0;
	for (let i = 1; i < points.length; i++) {
		const step = points[i].subtract(points[i - 1]);
		const len = step.length();
		if (len < 1e-8) {
			continue;
		}
		if (covered + len >= at - 1e-6) {
			const t = len < 1e-8 ? 0 : (at - covered) / len;
			const point = Vector3.Lerp(points[i - 1], points[i], Math.min(1, Math.max(0, t)));
			const before = t < 1e-4 ? points.slice(0, i) : [...points.slice(0, i), point];
			return { point, heading: step.normalize(), before };
		}
		covered += len;
	}
	return null;
}

function rebuildRoute(route: Route, points: Vector3[], kinds: RouteKind[]): Route {
	const cumulative = [0];
	for (let i = 1; i < points.length; i++) {
		cumulative.push(cumulative[i - 1] + Vector3.Distance(points[i - 1], points[i]));
	}
	return { ...route, points, kinds, cumulative, total: cumulative[cumulative.length - 1] ?? 0 };
}

function dedupePoints(points: Vector3[]): Vector3[] {
	const kept: Vector3[] = [];
	for (const point of points) {
		if (kept.length === 0 || Vector3.DistanceSquared(point, kept[kept.length - 1]) > 1e-8) {
			kept.push(point.clone());
		}
	}
	return kept;
}

function polylineLength(points: Vector3[]): number {
	let length = 0;
	for (let i = 1; i < points.length; i++) {
		length += Vector3.Distance(points[i - 1], points[i]);
	}
	return length;
}

function polylineHits(points: Vector3[], spheres: SphereBody[], rings: RingBody[]): boolean {
	for (let i = 1; i < points.length; i++) {
		for (const sphere of spheres) {
			if (segmentHitsSphere(points[i - 1], points[i], sphere.center, sphere.radius)) {
				return true;
			}
		}
		for (const ring of rings) {
			if (segmentHitsRing(points[i - 1], points[i], ring)) {
				return true;
			}
		}
	}
	return false;
}

function clampUnit(value: number): number {
	return Math.min(1, Math.max(-1, value));
}

/** How far the course bends at `at`, going from `from` toward `to`. */
export function turnAngle(from: Vector3, at: Vector3, to: Vector3): number {
	const inbound = at.subtract(from);
	const outbound = to.subtract(at);
	const cosine = Vector3.Dot(inbound, outbound) / Math.max(1e-12, inbound.length() * outbound.length());
	return Math.acos(Math.min(1, Math.max(-1, cosine)));
}

/** Positive when `b` turns counterclockwise from `a`, seen from above, in the same sense as the planets' angles. */
export function cross2(a: Vector3, b: Vector3): number {
	return a.x * b.z - a.z * b.x;
}

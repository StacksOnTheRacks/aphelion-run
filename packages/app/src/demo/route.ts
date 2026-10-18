import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { routeAroundBodies, type RingBody, type SphereBody } from "./camera-path";

/**
 * A ship's course from one point to another in the planets' plane (y = 0).
 *
 * Either end may be a circle instead of a point: the outer orbit the ship is leaving or joining.
 * The course meets that circle along a tangent, so the burn does not cut through the orbit. Of the
 * ways to turn onto and off those circles, the shorter course is the one flown.
 *
 * A planet that sits near the way ahead is taken as a gravity assist: the course bends toward it,
 * wraps around it at its flyby radius with the planet on the inside of the turn, and leaves toward
 * the next pass. The arc is where the planet does the work, so it is the cheap part of the course.
 * Every straight leg between passes is routed around whatever bodies stand in the way.
 */

export type RouteKind = "burn" | "assist";

export type AssistCandidate = {
	name: string;
	center: Vector3;
	/** Radius of the pass around the planet. */
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
	/** Names of the planets the course passes for an assist, in the order they are reached. */
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
/** Height of the climb out of a ring's gap, as a share of the ring's outer radius. */
const RING_CLIMB = 0.5;

type Circle = { center: Vector3; radius: number; turn: number };

export function planRoute(input: RouteInput): Route {
	const startRadius = input.startRadius ?? 0;
	const endRadius = input.endRadius ?? 0;
	const startTurns = input.startTurn !== undefined ? [input.startTurn] : startRadius > 0 ? [1, -1] : [0];
	const endTurns = endRadius > 0 ? [1, -1] : [0];
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
 * Unit direction of travel, `distance` along the course. Arcs are runs of short straight segments, so
 * the heading turns across each corner instead of snapping there: from halfway along the shorter
 * neighbor before the corner to halfway along it after. A long straight beside a corner only bends at its end.
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
 * Walks from the start toward the end, taking each planet whose pass is cheap enough, farthest
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
		const climb = climbOutOfRings(leave, arrive, input.rings);
		const descend = climbOutOfRings(arrive, leave, input.rings);
		const leg = [
			leave,
			...routeAroundBodies(climb ?? leave, descend ?? arrive, input.spheres, input.rings),
			arrive,
		];
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

/**
 * A point inside a ring's gap (Saturn's bases sit there) cannot leave along the planets' plane, because
 * that plane cuts the tilted ring. This is the point straight up the ring's axis, on the side the leg
 * is heading, high enough that the rest of the leg stays clear of the ring.
 */
function climbOutOfRings(point: Vector3, toward: Vector3, rings: RingBody[]): Vector3 | null {
	for (const ring of rings) {
		const normal = ring.normal.normalize();
		const offset = point.subtract(ring.center);
		const height = Vector3.Dot(offset, normal);
		const radial = offset.subtract(normal.scale(height)).length();
		const lift = ring.outer * RING_CLIMB;
		if (radial >= ring.inner || Math.abs(height) >= lift) {
			continue;
		}
		const side = Math.sign(Vector3.Dot(toward.subtract(ring.center), normal)) || 1;
		return point.add(normal.scale(side * lift - height));
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

/** How far off a ring's plane a crossing must pass, as a multiple of the ring's thickness. */
const RING_CLEARANCE = 2.4;
/** How far outside a ring's edge the climb starts to rise, in world units. */
const RING_FADE = 3;

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

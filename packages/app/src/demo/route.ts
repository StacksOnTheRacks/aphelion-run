import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { routeAroundBodies, type RingBody, type SphereBody } from "./camera-path";

/**
 * A ship's course from one point to another in the planets' plane (y = 0).
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
};

/** A pass is taken only when going by the planet adds at most this share to the distance left. */
export const MAX_DETOUR = 0.15;
/** A pass that bends the course further than this is not one gravity can give. */
export const MAX_TURN = (75 * Math.PI) / 180;
/** Flyby radius, in planet radii. */
export const FLYBY_SCALE = 2.5;

const ARC_STEP = (3 * Math.PI) / 180;
/** Height of the climb out of a ring's gap, as a share of the ring's outer radius. */
const RING_CLIMB = 0.5;

type Circle = { center: Vector3; radius: number; turn: number };

export function planRoute(input: RouteInput): Route {
	let chosen = pickAssists(input.start, input.end, input.candidates);
	for (;;) {
		const built = buildCourse(input, chosen);
		if (built.route) {
			return built.route;
		}
		if (chosen.length === 0) {
			const points = [input.start.clone(), input.end.clone()];
			const total = Vector3.Distance(input.start, input.end);
			return { points, kinds: ["burn"], cumulative: [0, total], total, assists: [] };
		}
		chosen = chosen.filter((_, index) => index !== built.failed);
	}
}

/** Where the ship is, `distance` along the course. */
export function pointAt(route: Route, distance: number): Vector3 {
	const index = segmentAt(route, distance);
	const span = route.cumulative[index + 1] - route.cumulative[index];
	const local = span < 1e-9 ? 0 : (clampDistance(route, distance) - route.cumulative[index]) / span;
	return Vector3.Lerp(route.points[index], route.points[index + 1], Math.min(1, Math.max(0, local)));
}

/** Unit direction of travel, `distance` along the course. */
export function headingAt(route: Route, distance: number): Vector3 {
	const index = segmentAt(route, distance);
	const direction = route.points[index + 1].subtract(route.points[index]);
	if (direction.lengthSquared() < 1e-12) {
		return new Vector3(1, 0, 0);
	}
	return direction.normalize();
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

function buildCourse(input: RouteInput, assists: AssistCandidate[]): Built {
	const centers = [input.start, ...assists.map((assist) => assist.center), input.end];
	const circles: Circle[] = centers.map((center, index) => {
		if (index === 0 || index === centers.length - 1) {
			return { center, radius: 0, turn: 0 };
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

	push(input.start, "burn");
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
	push(input.end, "burn");

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

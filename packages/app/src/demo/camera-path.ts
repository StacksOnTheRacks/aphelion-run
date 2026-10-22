import { Vector3 } from "@babylonjs/core/Maths/math.vector";

/**
 * A camera move is a polyline in world space. Where the straight line would enter a planet, a moon,
 * the Sun, or Saturn's rings, the line is replaced by an arc that stays outside the body.
 */

export type SphereBody = { center: Vector3; radius: number };

export type RingBody = {
	center: Vector3;
	/** Unit normal of the ring plane. */
	normal: Vector3;
	inner: number;
	outer: number;
	/** How far off the ring plane still counts as passing through the ring. */
	halfHeight: number;
};

const ARC_STEP = (8 * Math.PI) / 180;
const MAX_PASSES = 16;

/** ArcRotateCamera position: target + (r cos α sin β, r cos β, r sin α sin β). */
export function cameraWorldPosition(alpha: number, beta: number, radius: number, target: Vector3): Vector3 {
	const sinBeta = Math.sin(beta);
	return target.add(
		new Vector3(radius * Math.cos(alpha) * sinBeta, radius * Math.cos(beta), radius * Math.sin(alpha) * sinBeta)
	);
}

export function routeAroundBodies(start: Vector3, end: Vector3, spheres: SphereBody[], rings: RingBody[]): Vector3[] {
	let points = [start.clone(), end.clone()];
	if (Vector3.DistanceSquared(start, end) < 1e-8) {
		return points;
	}

	let best = points;
	let bestHits = countHits(points, spheres, rings);

	for (let pass = 0; pass < MAX_PASSES && bestHits > 0; pass++) {
		const next: Vector3[] = [points[0].clone()];
		let changed = false;
		for (let i = 0; i < points.length - 1; i++) {
			const from = points[i];
			const to = points[i + 1];
			const block = firstBlocker(from, to, spheres, rings);
			if (!block) {
				next.push(to.clone());
				continue;
			}
			changed = true;
			const inserted =
				block.kind === "sphere" ? swingAroundSphere(from, to, block.body) : swingAroundRing(from, to, block.body);
			const waypoint = inserted ?? [
				block.kind === "sphere"
					? sphereFallback(from, to, block.body)
					: ringFallback(from, to, block.body),
			];
			for (const point of waypoint) {
				next.push(point);
			}
			next.push(to.clone());
		}
		points = dedupe(next);
		if (!changed || points.length > 240) {
			break;
		}
		const hits = countHits(points, spheres, rings);
		if (hits < bestHits) {
			best = points;
			bestHits = hits;
		}
	}

	return bestHits === 0 ? points : best;
}

export function segmentHitsSphere(from: Vector3, to: Vector3, center: Vector3, radius: number): boolean {
	return distanceToSegment(center, from, to) < radius - 1e-4;
}

export function segmentHitsRing(from: Vector3, to: Vector3, ring: RingBody): boolean {
	return ringEntry(from, to, ring) !== null;
}

function countHits(points: Vector3[], spheres: SphereBody[], rings: RingBody[]): number {
	let hits = 0;
	for (let i = 0; i < points.length - 1; i++) {
		for (const sphere of spheres) {
			if (segmentHitsSphere(points[i], points[i + 1], sphere.center, sphere.radius)) {
				hits += 1;
			}
		}
		for (const ring of rings) {
			if (segmentHitsRing(points[i], points[i + 1], ring)) {
				hits += 1;
			}
		}
	}
	return hits;
}

type Block = { kind: "sphere"; at: number; body: SphereBody } | { kind: "ring"; at: number; body: RingBody };

function firstBlocker(from: Vector3, to: Vector3, spheres: SphereBody[], rings: RingBody[]): Block | null {
	let best: Block | null = null;
	for (const body of spheres) {
		const at = sphereEntry(from, to, body.center, body.radius);
		if (at !== null && (best === null || at < best.at)) {
			best = { kind: "sphere", at, body };
		}
	}
	for (const body of rings) {
		const at = ringEntry(from, to, body);
		if (at !== null && (best === null || at < best.at)) {
			best = { kind: "ring", at, body };
		}
	}
	return best;
}

function swingAroundSphere(from: Vector3, to: Vector3, body: SphereBody): Vector3[] | null {
	const center = body.center;
	const fromDistance = Vector3.Distance(from, center);
	const toDistance = Vector3.Distance(to, center);
	if (fromDistance <= body.radius * 1.002) {
		return [pushedOut(from, center, body.radius)];
	}
	if (toDistance <= body.radius * 1.002) {
		return [pushedOut(to, center, body.radius)];
	}

	const swing = swingRadius(body.radius, Math.min(fromDistance, toDistance));
	const arcs = circleArcs(from, to, center, swing, body.radius);
	return shortestClear(from, to, arcs, (path) => !pathHitsSphere(path, center, body.radius));
}

function swingAroundRing(from: Vector3, to: Vector3, ring: RingBody): Vector3[] | null {
	if (pointInRing(from, ring)) {
		return [exitRing(from, ring)];
	}
	if (pointInRing(to, ring)) {
		return [exitRing(to, ring)];
	}

	const basis = ringBasis(ring);
	const radius = ring.outer + Math.max(0.8, ring.halfHeight);
	const fromAngle = planarAngle(from, ring.center, basis);
	const toAngle = planarAngle(to, ring.center, basis);
	const clear = ring.halfHeight * 2;
	const lifts = [0, clear, -clear];
	const arcs: Vector3[][] = [];
	for (const lift of lifts) {
		const origin = ring.center.add(basis.n.scale(lift));
		for (const direction of [1, -1]) {
			arcs.push(sampleArc(fromAngle, toAngle, direction, radius, origin, basis.u, basis.v, ring.outer));
		}
	}
	const projectedFrom = projectToPlane(from, ring.center, basis.n);
	const projectedTo = projectToPlane(to, ring.center, basis.n);
	if (
		Vector3.Distance(projectedFrom, ring.center) > radius &&
		Vector3.Distance(projectedTo, ring.center) > radius
	) {
		arcs.push(...circleArcs(projectedFrom, projectedTo, ring.center, radius, ring.outer));
	}
	return shortestClear(from, to, arcs, (path) => !pathHitsRing(path, ring));
}

function shortestClear(
	from: Vector3,
	to: Vector3,
	arcs: Vector3[][],
	clear: (path: Vector3[]) => boolean
): Vector3[] | null {
	let best: Vector3[] | null = null;
	let bestLength = Infinity;
	for (const arc of arcs) {
		const path = [from, ...arc, to];
		if (!clear(path)) {
			continue;
		}
		const length = pathLength(path);
		if (length < bestLength) {
			best = arc;
			bestLength = length;
		}
	}
	return best;
}

function circleArcs(from: Vector3, to: Vector3, center: Vector3, radius: number, keepOut: number): Vector3[][] {
	const normal = planeNormal(from, to, center);
	let xAxis = from.subtract(center);
	xAxis = xAxis.subtract(normal.scale(Vector3.Dot(xAxis, normal)));
	if (xAxis.lengthSquared() < 1e-8) {
		xAxis = Vector3.Cross(normal, to.subtract(from));
	}
	xAxis.normalize();
	const yAxis = Vector3.Cross(normal, xAxis).normalize();
	const fromPlane = projectAxes(from, center, xAxis, yAxis);
	const toPlane = projectAxes(to, center, xAxis, yAxis);
	const fromTangents = tangentAngles(fromPlane.x, fromPlane.y, radius);
	const toTangents = tangentAngles(toPlane.x, toPlane.y, radius);
	if (!fromTangents || !toTangents) {
		return [];
	}

	const arcs: Vector3[][] = [];
	for (const fromSide of [0, 1]) {
		for (const toSide of [0, 1]) {
			for (const direction of [1, -1]) {
				arcs.push(
					sampleArc(fromTangents[fromSide], toTangents[toSide], direction, radius, center, xAxis, yAxis, keepOut)
				);
			}
		}
	}
	return arcs;
}

function sampleArc(
	fromAngle: number,
	toAngle: number,
	direction: number,
	radius: number,
	center: Vector3,
	xAxis: Vector3,
	yAxis: Vector3,
	keepOut: number
): Vector3[] {
	let sweep = toAngle - fromAngle;
	if (direction > 0) {
		while (sweep < 0) {
			sweep += Math.PI * 2;
		}
	} else {
		while (sweep > 0) {
			sweep -= Math.PI * 2;
		}
	}
	// A straight chord of the arc has to stay outside the body, so a tight margin needs shorter steps.
	const ratio = radius <= keepOut ? 0.999 : Math.min(0.999, keepOut / radius);
	const maxStep = 2 * Math.acos(ratio) * 0.8;
	const step = Math.min(ARC_STEP, Math.max((2 * Math.PI) / 180, maxStep));
	const steps = Math.max(1, Math.ceil(Math.abs(sweep) / step));
	const points: Vector3[] = [];
	for (let i = 0; i <= steps; i++) {
		const angle = fromAngle + sweep * (i / steps);
		points.push(center.add(xAxis.scale(Math.cos(angle) * radius)).add(yAxis.scale(Math.sin(angle) * radius)));
	}
	return points;
}

function tangentAngles(x: number, y: number, radius: number): [number, number] | null {
	const distance = Math.hypot(x, y);
	if (distance <= radius * 1.0001) {
		return null;
	}
	const bearing = Math.atan2(y, x);
	const offset = Math.acos(Math.min(1, radius / distance));
	return [bearing + offset, bearing - offset];
}

function swingRadius(bodyRadius: number, nearest: number): number {
	const pad = Math.min(1.75, Math.max(0.25, bodyRadius * 0.14));
	const ceiling = nearest * 0.98;
	if (ceiling <= bodyRadius * 1.01) {
		return bodyRadius + (nearest - bodyRadius) * 0.45;
	}
	return Math.min(bodyRadius + pad, ceiling);
}

function pushedOut(point: Vector3, center: Vector3, radius: number): Vector3 {
	const offset = point.subtract(center);
	if (offset.lengthSquared() < 1e-8) {
		return center.add(new Vector3(0, radius * 1.2, 0));
	}
	return center.add(offset.normalize().scale(radius * 1.12));
}

function sphereFallback(from: Vector3, to: Vector3, body: SphereBody): Vector3 {
	const span = to.subtract(from);
	const denom = Math.max(span.lengthSquared(), 1e-8);
	const t = Math.min(1, Math.max(0, Vector3.Dot(body.center.subtract(from), span) / denom));
	const closest = Vector3.Lerp(from, to, t);
	let away = closest.subtract(body.center);
	if (away.lengthSquared() < 1e-6) {
		away = Vector3.Cross(span, new Vector3(0, 1, 0));
		if (away.lengthSquared() < 1e-6) {
			away = new Vector3(0, 1, 0);
		}
	}
	const pad = Math.min(1.75, Math.max(0.3, body.radius * 0.2));
	return body.center.add(away.normalize().scale(body.radius + pad));
}

function ringFallback(from: Vector3, to: Vector3, ring: RingBody): Vector3 {
	const basis = ringBasis(ring);
	const mid = Vector3.Lerp(from, to, 0.5);
	const height = Vector3.Dot(mid.subtract(ring.center), basis.n);
	let radial = mid.subtract(ring.center).subtract(basis.n.scale(height));
	if (radial.lengthSquared() < 1e-6) {
		radial = basis.u.clone();
	}
	const fromHeight = Vector3.Dot(from.subtract(ring.center), basis.n);
	const toHeight = Vector3.Dot(to.subtract(ring.center), basis.n);
	const sign = fromHeight * toHeight > 0 ? Math.sign(fromHeight) : Math.sign(basis.n.y) || 1;
	return ring.center
		.add(radial.normalize().scale(ring.outer + 1.5))
		.add(basis.n.scale(sign * ring.halfHeight * 2));
}

function exitRing(point: Vector3, ring: RingBody): Vector3 {
	const normal = ring.normal.normalize();
	const height = Vector3.Dot(point.subtract(ring.center), normal);
	const sign = height >= 0 ? 1 : -1;
	return point.add(normal.scale(sign * ring.halfHeight * 2 - height));
}

function pathHitsSphere(points: Vector3[], center: Vector3, radius: number): boolean {
	for (let i = 0; i < points.length - 1; i++) {
		if (segmentHitsSphere(points[i], points[i + 1], center, radius)) {
			return true;
		}
	}
	return false;
}

function pathHitsRing(points: Vector3[], ring: RingBody): boolean {
	for (let i = 0; i < points.length - 1; i++) {
		if (segmentHitsRing(points[i], points[i + 1], ring)) {
			return true;
		}
	}
	return false;
}

function sphereEntry(from: Vector3, to: Vector3, center: Vector3, radius: number): number | null {
	if (!segmentHitsSphere(from, to, center, radius)) {
		return null;
	}
	const span = to.subtract(from);
	const offset = from.subtract(center);
	const a = span.lengthSquared();
	const b = 2 * Vector3.Dot(offset, span);
	const c = offset.lengthSquared() - radius * radius;
	if (c <= 1e-4) {
		return 0;
	}
	if (a < 1e-12) {
		return null;
	}
	const discriminant = b * b - 4 * a * c;
	if (discriminant < 0) {
		return null;
	}
	const root = (-b - Math.sqrt(discriminant)) / (2 * a);
	return Math.min(1, Math.max(0, root));
}

function ringEntry(from: Vector3, to: Vector3, ring: RingBody): number | null {
	const normal = ring.normal.normalize();
	const offset = from.subtract(ring.center);
	const span = to.subtract(from);
	const startHeight = Vector3.Dot(offset, normal);
	const heightDelta = Vector3.Dot(span, normal);
	const half = ring.halfHeight;
	let windowStart = 0;
	let windowEnd = 1;
	if (Math.abs(heightDelta) < 1e-9) {
		if (Math.abs(startHeight) > half) {
			return null;
		}
	} else {
		const enter = (-half - startHeight) / heightDelta;
		const exit = (half - startHeight) / heightDelta;
		windowStart = Math.max(0, Math.min(enter, exit));
		windowEnd = Math.min(1, Math.max(enter, exit));
		if (windowStart > windowEnd) {
			return null;
		}
	}

	const planarFrom = offset.subtract(normal.scale(startHeight));
	const planarSpan = span.subtract(normal.scale(heightDelta));
	const a = planarSpan.lengthSquared();
	const b = 2 * Vector3.Dot(planarFrom, planarSpan);
	const c = planarFrom.lengthSquared();
	const inner2 = ring.inner * ring.inner;
	const outer2 = ring.outer * ring.outer;
	if (a < 1e-10) {
		return c >= inner2 && c <= outer2 ? windowStart : null;
	}

	const outerRoots = quadraticRoots(a, b, c - outer2);
	if (outerRoots.length < 2) {
		return null;
	}
	const insideOuterStart = Math.max(windowStart, Math.min(outerRoots[0], outerRoots[1]));
	const insideOuterEnd = Math.min(windowEnd, Math.max(outerRoots[0], outerRoots[1]));
	if (insideOuterStart > insideOuterEnd) {
		return null;
	}

	const innerRoots = quadraticRoots(a, b, c - inner2);
	if (innerRoots.length < 2) {
		return insideOuterStart;
	}
	const holeStart = Math.min(innerRoots[0], innerRoots[1]);
	const holeEnd = Math.max(innerRoots[0], innerRoots[1]);
	if (insideOuterStart < holeStart - 1e-6) {
		return insideOuterStart;
	}
	if (holeEnd < insideOuterEnd - 1e-6) {
		return Math.max(insideOuterStart, holeEnd);
	}
	return null;
}

function pointInRing(point: Vector3, ring: RingBody): boolean {
	const normal = ring.normal.normalize();
	const offset = point.subtract(ring.center);
	const height = Vector3.Dot(offset, normal);
	if (Math.abs(height) > ring.halfHeight) {
		return false;
	}
	const radial = offset.subtract(normal.scale(height)).length();
	return radial > ring.inner && radial < ring.outer;
}

function quadraticRoots(a: number, b: number, c: number): number[] {
	const discriminant = b * b - 4 * a * c;
	if (discriminant < 0) {
		return [];
	}
	const root = Math.sqrt(discriminant);
	return [(-b - root) / (2 * a), (-b + root) / (2 * a)];
}

function planeNormal(from: Vector3, to: Vector3, center: Vector3): Vector3 {
	const span = to.subtract(from);
	let normal = Vector3.Cross(span, center.subtract(from));
	if (normal.lengthSquared() < 1e-8) {
		const up = Math.abs(span.normalize().y) > 0.95 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
		normal = Vector3.Cross(span, up);
	}
	return normal.normalize();
}

function ringBasis(ring: RingBody): { n: Vector3; u: Vector3; v: Vector3 } {
	const n = ring.normal.normalize();
	const helper = Math.abs(n.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
	const u = Vector3.Cross(helper, n).normalize();
	const v = Vector3.Cross(n, u).normalize();
	return { n, u, v };
}

function planarAngle(point: Vector3, origin: Vector3, basis: { n: Vector3; u: Vector3; v: Vector3 }): number {
	const offset = point.subtract(origin);
	const height = Vector3.Dot(offset, basis.n);
	const planar = offset.subtract(basis.n.scale(height));
	return Math.atan2(Vector3.Dot(planar, basis.v), Vector3.Dot(planar, basis.u));
}

function projectToPlane(point: Vector3, origin: Vector3, normal: Vector3): Vector3 {
	const offset = point.subtract(origin);
	return point.subtract(normal.scale(Vector3.Dot(offset, normal)));
}

function projectAxes(point: Vector3, center: Vector3, xAxis: Vector3, yAxis: Vector3): { x: number; y: number } {
	const offset = point.subtract(center);
	return { x: Vector3.Dot(offset, xAxis), y: Vector3.Dot(offset, yAxis) };
}

function distanceToSegment(point: Vector3, from: Vector3, to: Vector3): number {
	const span = to.subtract(from);
	const denom = span.lengthSquared();
	if (denom < 1e-12) {
		return Vector3.Distance(point, from);
	}
	const t = Math.min(1, Math.max(0, Vector3.Dot(point.subtract(from), span) / denom));
	return Vector3.Distance(point, from.add(span.scale(t)));
}

function pathLength(points: Vector3[]): number {
	let length = 0;
	for (let i = 1; i < points.length; i++) {
		length += Vector3.Distance(points[i - 1], points[i]);
	}
	return length;
}

function dedupe(points: Vector3[]): Vector3[] {
	const kept: Vector3[] = [points[0]];
	for (let i = 1; i < points.length; i++) {
		if (Vector3.DistanceSquared(points[i], kept[kept.length - 1]) > 1e-6) {
			kept.push(points[i]);
		}
	}
	return kept;
}

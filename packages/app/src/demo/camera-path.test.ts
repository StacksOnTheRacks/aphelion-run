import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import {
	cameraWorldPosition,
	routeAroundBodies,
	segmentHitsRing,
	type RingBody,
	type SphereBody,
} from "./camera-path";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

function minSphereDistance(points: Vector3[], center: Vector3): number {
	let min = Infinity;
	for (let i = 0; i < points.length - 1; i++) {
		min = Math.min(min, distanceToSegment(center, points[i], points[i + 1]));
	}
	return min;
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

function clearsSphere(points: Vector3[], sphere: SphereBody): boolean {
	return minSphereDistance(points, sphere.center) >= sphere.radius - 1e-3;
}

function clearsRing(points: Vector3[], ring: RingBody): boolean {
	for (let i = 0; i < points.length - 1; i++) {
		if (segmentHitsRing(points[i], points[i + 1], ring)) {
			return false;
		}
	}
	return true;
}

function endsMatch(path: Vector3[], start: Vector3, end: Vector3): boolean {
	return Vector3.Distance(path[0], start) < 1e-3 && Vector3.Distance(path[path.length - 1], end) < 1e-3;
}

const sun: SphereBody = { center: Vector3.Zero(), radius: 14 };
const neptune: SphereBody = { center: new Vector3(530, 0, 0), radius: 9 };
const moon: SphereBody = { center: new Vector3(20, 0, 8), radius: 0.25 };

const through = routeAroundBodies(new Vector3(-40, 0, 0), new Vector3(40, 0, 0), [sun], []);
expect(through.length > 2, "a line through the Sun should swing around it");
expect(clearsSphere(through, sun), `path through the Sun still clips it (clearance ${minSphereDistance(through, sun.center)})`);
expect(endsMatch(through, new Vector3(-40, 0, 0), new Vector3(40, 0, 0)), "swing should keep its endpoints");

const missing = routeAroundBodies(new Vector3(-40, 40, 0), new Vector3(40, 40, 0), [sun], []);
expect(missing.length === 2, "a line that misses every body should stay straight");

const opposite = routeAroundBodies(new Vector3(-16, 0, 0), new Vector3(16, 0, 0), [sun], []);
expect(clearsSphere(opposite, sun), "opposite sides of the Sun should swing clear");

const closeMoon = routeAroundBodies(
	moon.center.add(new Vector3(0.4, 0.2, 0)),
	moon.center.add(new Vector3(-0.35, 0.15, 0.1)),
	[moon],
	[]
);
expect(clearsSphere(closeMoon, moon), `close moon swing clips (clearance ${minSphereDistance(closeMoon, moon.center)})`);

const system = cameraWorldPosition(-Math.PI / 2, 0.28, 1600, Vector3.Zero());
const neptuneShot = neptune.center.add(new Vector3(12, 8, -6));
const approach = routeAroundBodies(system, neptuneShot, [sun, neptune], []);
expect(clearsSphere(approach, sun), "system to Neptune should miss the Sun");
expect(clearsSphere(approach, neptune), "system to Neptune should miss Neptune");

const ring: RingBody = {
	center: Vector3.Zero(),
	normal: new Vector3(0, 1, 0),
	inner: 17,
	outer: 32,
	halfHeight: 0.7,
};
const throughRing = routeAroundBodies(new Vector3(-60, 0, 24), new Vector3(60, 0, 24), [sun], [ring]);
expect(clearsSphere(throughRing, sun), "ring crossing should still miss the Sun");
expect(clearsRing(throughRing, ring), "a chord through the rings should swing around them");
expect(segmentHitsRing(new Vector3(-60, 0, 24), new Vector3(60, 0, 24), ring), "test chord should actually hit the ring");

const aboveRing = routeAroundBodies(new Vector3(-60, 6, 24), new Vector3(60, 6, 24), [], [ring]);
expect(aboveRing.length === 2, "a path above the rings should stay straight");

let randomClips = 0;
const cluster: SphereBody[] = [
	sun,
	{ center: new Vector3(80, 0, 10), radius: 6 },
	{ center: new Vector3(-30, 4, 50), radius: 4 },
	{ center: new Vector3(10, -2, -40), radius: 3 },
	moon,
];
for (let i = 0; i < 80; i++) {
	const start = randomOutside(cluster, i);
	const end = randomOutside(cluster, i + 100);
	const path = routeAroundBodies(start, end, cluster, [ring]);
	if (!endsMatch(path, start, end)) {
		randomClips += 1;
		continue;
	}
	for (const sphere of cluster) {
		if (!clearsSphere(path, sphere)) {
			randomClips += 1;
			break;
		}
	}
	if (!clearsRing(path, ring)) {
		randomClips += 1;
	}
}
expect(randomClips === 0, `${randomClips} random paths still clip a body or the rings`);

function randomOutside(spheres: SphereBody[], seed: number): Vector3 {
	const random = mulberry(seed);
	for (let attempt = 0; attempt < 20; attempt++) {
		const point = new Vector3((random() - 0.5) * 200, (random() - 0.5) * 40, (random() - 0.5) * 200);
		const inside = spheres.some((sphere) => Vector3.Distance(point, sphere.center) <= sphere.radius + 0.5);
		const inRing =
			Math.abs(point.y) <= ring.halfHeight &&
			Math.hypot(point.x, point.z) > ring.inner &&
			Math.hypot(point.x, point.z) < ring.outer;
		if (!inside && !inRing) {
			return point;
		}
	}
	return new Vector3(0, 80, 0);
}

function mulberry(seed: number): () => number {
	let state = seed + 1;
	return () => {
		state = (state * 1664525 + 1013904223) % 4294967296;
		return state / 4294967296;
	};
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("camera path clears bodies");

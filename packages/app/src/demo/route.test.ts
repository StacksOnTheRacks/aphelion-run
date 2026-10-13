import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

import { EARTH_STATION_RADIUS, SATURN_RING_INNER_SCALE, moonBases, planetBases } from "./bases";
import { segmentHitsRing, segmentHitsSphere, type RingBody, type SphereBody } from "./camera-path";
import {
	JOURNEY_STOPS,
	PLANETS,
	SUN_DIAMETER,
	SUN_INNER_RING,
	flybyRadius,
	planJourney,
	saturnRing,
	type JourneyBody,
	type JourneyLayout,
} from "./environment";
import { daysSinceJ2000, moonLongitude, planetLongitude } from "./ephemeris";
import { JOURNEY_MAX_SECONDS, JOURNEY_MIN_SECONDS, journeySeconds } from "./journey";
import { cross2, headingAt, planRoute, pointAt, type AssistCandidate, type Route } from "./route";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

function near(a: Vector3, b: Vector3, tolerance = 1e-4): boolean {
	return Vector3.Distance(a, b) <= tolerance;
}

function checkShape(route: Route, start: Vector3, end: Vector3, name: string): void {
	expect(near(route.points[0], start), `${name}: starts at the start`);
	expect(near(route.points[route.points.length - 1], end), `${name}: ends at the end`);
	expect(route.kinds.length === route.points.length - 1, `${name}: one kind per segment`);
	expect(Math.abs(route.cumulative[route.cumulative.length - 1] - route.total) < 1e-6, `${name}: total is the summed length`);
}

/** Every assist segment rides its planet's flyby circle, and the course turns toward the planet. */
function checkArcs(route: Route, candidates: AssistCandidate[], name: string): void {
	const used = candidates.filter((candidate) => route.assists.includes(candidate.name));
	for (let i = 0; i < route.kinds.length; i++) {
		if (route.kinds[i] !== "assist") {
			continue;
		}
		const from = route.points[i];
		const to = route.points[i + 1];
		const host = used.reduce((best, candidate) =>
			Vector3.Distance(candidate.center, from) < Vector3.Distance(best.center, from) ? candidate : best
		);
		for (const point of [from, to]) {
			const off = Math.abs(Vector3.Distance(point, host.center) - host.flyby);
			expect(off < 1e-3, `${name}: assist point sits on ${host.name}'s flyby radius (off by ${off.toFixed(4)})`);
		}
		if (i + 1 < route.kinds.length && route.kinds[i + 1] === "assist") {
			const here = to.subtract(from);
			const next = route.points[i + 2].subtract(to);
			const turn = Math.sign(cross2(here, next));
			const side = Math.sign(cross2(here, host.center.subtract(from)));
			expect(turn === side, `${name}: ${host.name} is on the inside of the turn`);
		}
	}
}

function checkClear(route: Route, spheres: SphereBody[], rings: RingBody[], name: string): void {
	for (let i = 0; i < route.points.length - 1; i++) {
		const from = route.points[i];
		const to = route.points[i + 1];
		for (const sphere of spheres) {
			if (segmentHitsSphere(from, to, sphere.center, sphere.radius)) {
				failures.push(`${name}: segment ${i} cuts through a body at ${sphere.center.toString()}`);
			}
		}
		for (const ring of rings) {
			if (segmentHitsRing(from, to, ring)) {
				failures.push(`${name}: segment ${i} cuts through Saturn's rings`);
			}
		}
	}
}

// A planet straight across the way is wrapped; one well off it is not.
{
	const start = new Vector3(1000, 0, 0);
	const end = new Vector3(24, 0, 0);
	const onLine: AssistCandidate = { name: "On line", center: new Vector3(500, 0, 10), flyby: 12.5 };
	const offLine: AssistCandidate = { name: "Off line", center: new Vector3(500, 0, 420), flyby: 12.5 };
	const candidates = [onLine, offLine];
	const route = planRoute({
		start,
		end,
		candidates,
		spheres: candidates.map((candidate) => ({ center: candidate.center, radius: 5 })),
		rings: [],
	});
	checkShape(route, start, end, "two candidates");
	expect(route.assists.includes("On line"), "a planet on the direct line is taken as an assist");
	expect(!route.assists.includes("Off line"), "a planet far off the line is not");
	expect(route.kinds.includes("assist"), "an assist leaves assist segments on the course");
	checkArcs(route, candidates, "two candidates");

	const middle = pointAt(route, route.total / 2);
	expect(Number.isFinite(middle.x) && Number.isFinite(middle.z), "a point halfway along is a real point");
	const heading = headingAt(route, 0);
	expect(Math.abs(heading.length() - 1) < 1e-6, "the heading is a unit vector");
	expect(near(pointAt(route, -5), start) && near(pointAt(route, route.total + 5), end), "positions clamp to the ends");
}

// Two planets on alternating sides make the course bend both ways.
{
	const start = new Vector3(1000, 0, 0);
	const end = new Vector3(24, 0, 0);
	const candidates: AssistCandidate[] = [
		{ name: "Left", center: new Vector3(700, 0, 40), flyby: 20 },
		{ name: "Right", center: new Vector3(350, 0, -30), flyby: 15 },
	];
	const route = planRoute({ start, end, candidates, spheres: [], rings: [] });
	checkShape(route, start, end, "zigzag");
	expect(route.assists.join(",") === "Left,Right", "a course can take more than one assist, in order");
	checkArcs(route, candidates, "zigzag");
}

// With nothing to pass, the course is a single straight burn.
{
	const start = new Vector3(0, 0, 900);
	const end = new Vector3(0, 0, 24);
	const route = planRoute({ start, end, candidates: [], spheres: [], rings: [] });
	checkShape(route, start, end, "direct");
	expect(route.kinds.every((kind) => kind === "burn"), "a course with no assists is all burn");
}

function layoutAt(days: number, spin: number): JourneyLayout {
	const ring = (center: Vector3, slots: { angle: number; radius: number }[]) =>
		slots.map((slot) =>
			center.add(new Vector3(Math.cos(slot.angle + spin) * slot.radius, 0, Math.sin(slot.angle + spin) * slot.radius))
		);
	const bodies: JourneyBody[] = [
		{ id: "sun", center: Vector3.Zero(), radius: SUN_DIAMETER / 2, halo: SUN_INNER_RING, bases: [] },
	];
	for (const spec of PLANETS) {
		const angle = planetLongitude(spec.name, days);
		const center = new Vector3(Math.cos(angle) * spec.orbit, 0, Math.sin(angle) * spec.orbit);
		const placed = planetBases({
			diameter: spec.diameter,
			moons: spec.moons.map((moon) => ({ orbit: moon.orbit, diameter: moon.diameter })),
			stationRadius: spec.name === "earth" ? EARTH_STATION_RADIUS : undefined,
			homes: spec.name !== "earth",
			ringInnerScale: spec.name === "saturn" ? SATURN_RING_INNER_SCALE : undefined,
		});
		const slots = [...placed.warehouses, ...placed.stations];
		bodies.push({ id: spec.name, center, radius: spec.diameter / 2, halo: slots[0].radius, bases: ring(center, slots) });
		spec.moons.forEach((moon, index) => {
			const orbitAngle =
				spec.name === "earth" ? moonLongitude(days) : index * 2.4 + (Math.PI * 2 * days) / moon.period;
			const plane = Matrix.RotationX(moon.plane ?? spec.moonPlane ?? 0);
			const local = new Vector3(Math.cos(orbitAngle) * moon.orbit, 0, Math.sin(orbitAngle) * moon.orbit);
			const moonCenter = Vector3.TransformCoordinates(local, plane).addInPlace(center);
			const moonSlots = moonBases(moon.diameter);
			bodies.push({
				id: moon.name,
				center: moonCenter,
				radius: moon.diameter / 2,
				halo: moonSlots[0].radius,
				bases: ring(moonCenter, moonSlots),
			});
		});
	}
	return { bodies };
}

const PLANET_IDS = new Set<string>(PLANETS.map((spec) => spec.name));

function checkJourney(layout: JourneyLayout, fromId: string, toId: string, name: string): Route {
	const route = planJourney(layout, fromId, toId);
	const from = layout.bodies.find((body) => body.id === fromId)!;
	const to = layout.bodies.find((body) => body.id === toId)!;
	const start = route.points[0];
	const end = route.points[route.points.length - 1];
	if (from.bases.length > 0) {
		expect(from.bases.some((base) => near(base, start)), `${name}: leaves from a base`);
	} else {
		expect(Math.abs(Vector3.Distance(start, from.center) - from.halo) < 1e-6, `${name}: leaves from the inner orbit`);
	}
	const flat = Math.hypot(end.x - to.center.x, end.z - to.center.z);
	expect(Math.abs(flat - to.halo) < 1e-6 && Math.abs(end.y - to.center.y) < 1e-6, `${name}: arrives on the base orbit`);
	expect(route.kinds.length === route.points.length - 1, `${name}: one kind per segment`);

	const candidates: AssistCandidate[] = PLANETS.filter((spec) => spec.name !== fromId && spec.name !== toId).map(
		(spec) => ({
			name: spec.name.charAt(0).toUpperCase() + spec.name.slice(1),
			center: layout.bodies.find((body) => body.id === spec.name)!.center,
			flyby: flybyRadius(spec),
		})
	);
	const spheres = layout.bodies.map((body) => ({ center: body.center, radius: body.radius }));
	const saturn = layout.bodies.find((body) => body.id === "saturn")!;
	checkClear(route, spheres, [saturnRing(saturn.center)], name);
	checkArcs(route, candidates, name);
	expect(route.assists.every((assist) => assist.toLowerCase() !== fromId && assist.toLowerCase() !== toId), `${name}: neither end is an assist`);
	return route;
}

const FIRST_DAY = daysSinceJ2000(Date.UTC(2026, 9, 12));

// Neptune to the Sun, weekly for two years, with Neptune's bases at four turns around it.
{
	let runs = 0;
	let assisted = 0;
	for (let week = 0; week < 104; week++) {
		for (const spin of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
			const days = FIRST_DAY + week * 7;
			const route = checkJourney(layoutAt(days, spin), "neptune", "sun", `Neptune to Sun, day ${days.toFixed(0)}, spin ${spin.toFixed(2)}`);
			runs += 1;
			if (route.assists.length > 0) {
				assisted += 1;
			}
		}
	}
	console.log(`Neptune to Sun: ${runs} runs, ${assisted} with an assist`);
}

// Every pair of stops, on a few dates months apart.
{
	let runs = 0;
	let passes = 0;
	for (const offset of [0, 97, 211]) {
		const days = FIRST_DAY + offset;
		const layout = layoutAt(days, offset * 0.37);
		for (const from of JOURNEY_STOPS) {
			for (const to of JOURNEY_STOPS) {
				if (from.id === to.id) {
					continue;
				}
				const route = checkJourney(layout, from.id, to.id, `${from.label} to ${to.label}, day ${days.toFixed(0)}`);
				runs += 1;
				passes += route.assists.length;
			}
		}
	}
	expect(JOURNEY_STOPS.filter((stop) => PLANET_IDS.has(stop.id)).length === 8, "every planet is a stop");
	console.log(`All pairs: ${runs} runs, ${passes} assist passes`);
}

// Saturn's bases sit in the gap inside its tilted rings, so leaving or arriving must climb clear of them.
for (let step = 0; step < 24; step++) {
	const spin = (step / 24) * Math.PI * 2;
	const layout = layoutAt(FIRST_DAY + step * 13, spin);
	for (const other of ["sun", "earth", "jupiter", "titan", "neptune"]) {
		checkJourney(layout, "saturn", other, `Saturn to ${other}, spin ${spin.toFixed(2)}`);
		checkJourney(layout, other, "saturn", `${other} to Saturn, spin ${spin.toFixed(2)}`);
	}
}

{
	expect(journeySeconds(0) === JOURNEY_MIN_SECONDS, "a short hop still lasts the minimum");
	expect(Math.abs(journeySeconds(1120) - 40) < 1, "Neptune to the Sun takes about 40 seconds");
	expect(journeySeconds(1e6) === JOURNEY_MAX_SECONDS, "the longest trips are capped");
}

if (failures.length > 0) {
	for (const failure of failures.slice(0, 40)) {
		console.error(failure);
	}
	if (failures.length > 40) {
		console.error(`...and ${failures.length - 40} more`);
	}
	process.exit(1);
}

console.log("routes start and end where asked, wrap the planets they pass, and clear every body");

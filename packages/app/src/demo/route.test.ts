import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

import {
	BODY_SCALE,
	EARTH_STATION_RADIUS,
	SATURN_RING_INNER_SCALE,
	SYSTEM_SCALE,
	DOCK_SIZE,
	MINE_SIZE,
	moonBases,
	moonOuterOrbitRadius,
	planetBases,
} from "./bases";
import { segmentHitsRing, segmentHitsSphere, type RingBody, type SphereBody } from "./camera-path";
import {
	JOURNEY_STOPS,
	PLANETS,
	SUN_DIAMETER,
	SUN_INNER_RING,
	bodyOuterRadius,
	flybyRadius,
	planJourney,
	saturnRing,
	type JourneyBody,
	type JourneyLayout,
} from "./environment";
import { daysSinceJ2000, moonLongitude, planetLongitude } from "./ephemeris";
import { HULL_LENGTH } from "./ranger";
import {
	APPROACH_MIN_SWEEP,
	CLIMB_PACE,
	HULL_CLEARANCE,
	JOURNEY_PACE,
	ORBIT_LEG_SECONDS,
	SOFT_DOCK_SECONDS,
	approachPoint,
	berthPoint,
	climbDistance,
	climbDuration,
	cruiseProfile,
	flightSchedule,
	hoverDeparture,
	journeySeconds,
	legPose,
	planApproach,
	poseRise,
	trailAlignment,
	trailDistance,
	tripSeconds,
	type Approach,
	type Dock,
} from "./journey";
import { MAX_YAW, cross2, curveClimbJoin, curveClimbStart, departureSpiral, headingAt, planRoute, pointAt, reversalPenalty, tangentHeading, type AssistCandidate, type Route } from "./route";

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

function checkClear(points: Vector3[], spheres: SphereBody[], rings: RingBody[], name: string): void {
	for (let i = 0; i < points.length - 1; i++) {
		const from = points[i];
		const to = points[i + 1];
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
	let sharpest = 0;
	let previous = headingAt(route, 0);
	for (let step = 1; step <= 20000; step++) {
		const next = headingAt(route, (route.total * step) / 20000);
		sharpest = Math.max(sharpest, Math.acos(Math.min(1, Vector3.Dot(previous, next))));
		previous = next;
	}
	expect(sharpest < (0.5 * Math.PI) / 180, `the heading turns through the arcs without snapping (${sharpest} rad)`);
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

// A course aimed through the Sun wraps it as an assist, in the planets' plane, instead of crossing the disk.
{
	const sun: AssistCandidate = { name: "Sun", center: Vector3.Zero(), flyby: flybyRadius("sun") };
	const start = new Vector3(900, 0, 0);
	const end = new Vector3(-640, 0, 8);
	const route = planRoute({
		start,
		end,
		candidates: [sun],
		spheres: [{ center: Vector3.Zero(), radius: SUN_DIAMETER / 2 }],
		rings: [],
	});
	checkShape(route, start, end, "through the sun");
	expect(route.assists.join(",") === "Sun", "the Sun is taken as a gravity assist");
	expect(route.kinds.includes("assist"), "the pass around the Sun is an assist");
	checkArcs(route, [sun], "through the sun");
	const approach = closestFlatApproach(route.points, Vector3.Zero());
	expect(
		approach >= bodyOuterRadius("sun"),
		`the course stays outside the Sun's outer orbit (closest ${approach.toFixed(2)})`
	);
	expect(route.points.every((point) => Math.abs(point.y) < 1e-6), "the pass around the Sun stays in the planets' plane");
}

// A burn between two outer orbits leaves and arrives along a tangent.
{
	const start = new Vector3(0, 2, 0);
	const end = new Vector3(240, 5, 30);
	const route = planRoute({
		start,
		end,
		startRadius: 18,
		endRadius: 26,
		candidates: [],
		spheres: [],
		rings: [],
	});
	expect(Math.abs(flatDistance(route.points[0], start) - 18) < 1e-3, "the burn starts on the origin circle");
	expect(Math.abs(flatDistance(route.points[route.points.length - 1], end) - 26) < 1e-3, "the burn ends on the destination circle");
	expect(isTangent(route.points[0], route.points[1], start), "the burn leaves the origin along a tangent");
	const last = route.points.length - 1;
	expect(isTangent(route.points[last], route.points[last - 1], end), "the burn joins the destination along a tangent");
	expect(route.startTurn === 1 || route.startTurn === -1, "the origin circle has a turn");
	expect(route.endTurn === 1 || route.endTurn === -1, "the destination circle has a turn");
}

function flatDistance(point: Vector3, center: Vector3): number {
	return Math.hypot(point.x - center.x, point.z - center.z);
}

/** The segment stays outside the horizontal circle, so a dodge still leaves the orbit instead of cutting through it. */
function staysOutside(point: Vector3, other: Vector3, center: Vector3, radius: number): boolean {
	for (let i = 0; i <= 8; i++) {
		const t = i / 8;
		const x = point.x + (other.x - point.x) * t;
		const z = point.z + (other.z - point.z) * t;
		if (Math.hypot(x - center.x, z - center.z) < radius - 0.05) {
			return false;
		}
	}
	return true;
}

/** Closest the polyline comes to `center` in the planets' plane. A hop over a body still counts as crossing it. */
function closestFlatApproach(points: Vector3[], center: Vector3): number {
	let best = Infinity;
	for (let i = 0; i < points.length - 1; i++) {
		const from = points[i];
		const to = points[i + 1];
		const dx = to.x - from.x;
		const dz = to.z - from.z;
		const lengthSquared = dx * dx + dz * dz;
		const t =
			lengthSquared < 1e-12
				? 0
				: Math.min(1, Math.max(0, ((center.x - from.x) * dx + (center.z - from.z) * dz) / lengthSquared));
		best = Math.min(best, Math.hypot(from.x + dx * t - center.x, from.z + dz * t - center.z));
	}
	return best;
}

function isTangent(point: Vector3, other: Vector3, center: Vector3): boolean {
	const radialX = point.x - center.x;
	const radialZ = point.z - center.z;
	const headingX = other.x - point.x;
	const headingZ = other.z - point.z;
	const scale = Math.hypot(radialX, radialZ) * Math.hypot(headingX, headingZ);
	if (scale < 1e-8) {
		return false;
	}
	return Math.abs(radialX * headingX + radialZ * headingZ) <= 1e-3 * scale;
}

function layoutAt(days: number, spin: number): JourneyLayout {
	const ring = (center: Vector3, slots: { angle: number; radius: number }[]) =>
		slots.map((slot) =>
			center.add(new Vector3(Math.cos(slot.angle + spin) * slot.radius, 0, Math.sin(slot.angle + spin) * slot.radius))
		);
	const bodies: JourneyBody[] = [
		{ id: "sun", center: Vector3.Zero(), radius: SUN_DIAMETER / 2, halo: SUN_INNER_RING, outer: bodyOuterRadius("sun"), bases: [] },
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
		bodies.push({
			id: spec.name,
			center,
			radius: spec.diameter / 2,
			halo: slots[0].radius,
			outer: bodyOuterRadius(spec.name),
			bases: ring(center, slots),
		});
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
				outer: bodyOuterRadius(moon.name),
				bases: ring(moonCenter, moonSlots),
			});
		});
	}
	return { bodies };
}

const PLANET_IDS = new Set<string>(PLANETS.map((spec) => spec.name));

function checkJourney(layout: JourneyLayout, fromId: string, toId: string, name: string): Route {
	const plan = planJourney(layout, fromId, toId);
	const route = plan.cruise;
	const from = layout.bodies.find((body) => body.id === fromId)!;
	const to = layout.bodies.find((body) => body.id === toId)!;
	const start = route.points[0];
	const end = route.points[route.points.length - 1];
	expect(plan.climb.length > 0, `${name}: has a climb`);
	if (from.bases.length > 0) {
		expect(from.bases.some((base) => near(base, plan.climb[0])), `${name}: climb starts at a base`);
	} else {
		expect(
			Math.abs(Vector3.Distance(plan.climb[0], from.center) - from.halo) < 1e-4,
			`${name}: climb starts on the inner orbit`
		);
	}
	expect(near(plan.climb[plan.climb.length - 1], start), `${name}: climb meets the burn`);
	expect(Math.abs(flatDistance(start, from.center) - from.outer) < 1e-2, `${name}: burn starts on the outer orbit`);
	expect(Math.abs(flatDistance(end, to.center) - to.outer) < 1e-2, `${name}: burn ends on the outer orbit`);
	expect(staysOutside(start, route.points[1], from.center, from.outer), `${name}: burn does not cut back into the origin orbit`);
	expect(
		staysOutside(end, route.points[route.points.length - 2], to.center, to.outer),
		`${name}: burn does not cut into the destination orbit`
	);
	expect(plan.arrive.id === toId && plan.arrive.turn === route.endTurn, `${name}: arrives turning the way the burn ends`);
	expect(route.endTurn === 1, `${name}: arrives with the inner orbit`);
	for (let i = route.points.length - 1; i > 0; i--) {
		const flat = new Vector3(route.points[i].x - route.points[i - 1].x, 0, route.points[i].z - route.points[i - 1].z);
		if (flat.lengthSquared() < 0.25) {
			continue;
		}
		const prograde = tangentHeading(to.center, route.points[i], 1);
		expect(Vector3.Dot(flat.normalize(), prograde) > 0.5, `${name}: arrival heads with the inner orbit`);
		break;
	}
	expect(route.kinds.length === route.points.length - 1, `${name}: one kind per segment`);

	const candidates = assistCandidates(layout, fromId, toId);
	const spheres = layout.bodies.map((body) => ({ center: body.center, radius: body.radius }));
	const saturn = layout.bodies.find((body) => body.id === "saturn")!;
	const flown = [...plan.climb];
	for (const point of route.points) {
		if (flown.length === 0 || !near(flown[flown.length - 1], point)) {
			flown.push(point);
		}
	}
	checkClear(flown, spheres, [saturnRing(saturn.center)], name);
	checkSteady(flown, name);
	checkArcs(route, candidates, name);
	const sunApproach = closestFlatApproach(flown, Vector3.Zero());
	expect(
		sunApproach >= SUN_DIAMETER / 2 - 0.05,
		`${name}: the course stays clear of the Sun in the planets' plane (closest ${sunApproach.toFixed(2)})`
	);
	expect(route.assists.every((assist) => assist.toLowerCase() !== fromId && assist.toLowerCase() !== toId), `${name}: neither end is an assist`);
	return route;
}

/** The view out the windscreen turns through every corner of the climb and the burn, flown as one line. */
function checkSteady(points: Vector3[], name: string): void {
	const cumulative = [0];
	for (let i = 1; i < points.length; i++) {
		cumulative.push(cumulative[i - 1] + Vector3.Distance(points[i - 1], points[i]));
	}
	const total = cumulative[cumulative.length - 1];
	const kinds = points.slice(1).map(() => "burn" as const);
	const flown: Route = { points, kinds, cumulative, total, assists: [], startTurn: 0, endTurn: 0 };
	const nudge = total * 1e-7;
	let sharpest = 0;
	for (const corner of cumulative.slice(1, -1)) {
		const before = headingAt(flown, corner - nudge);
		const after = headingAt(flown, corner + nudge);
		sharpest = Math.max(sharpest, Math.acos(Math.min(1, Vector3.Dot(before, after))));
	}
	expect(sharpest < 0.05, `${name}: the heading does not snap at a corner (${sharpest.toFixed(3)} rad)`);
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

// A docked ship climbs out from its dock, not from a base.
{
	const layout = layoutAt(FIRST_DAY, 0);
	const earth = layout.bodies.find((body) => body.id === "earth")!;
	const dock = earth.center.add(new Vector3(0, 0.4, EARTH_STATION_RADIUS));
	const plan = planJourney(layout, "earth", "mars", { at: dock, turn: 1 });
	expect(near(plan.climb[0], dock), "leaving a dock starts at the dock");
	expect(near(plan.climb[plan.climb.length - 1], plan.cruise.points[0]), "the burn leaves from the end of the climb");
}

// A climb eases outward and only turns the way it was asked, so it can leave with the orbit.
{
	const center = new Vector3(5, 2, -3);
	const from = center.add(new Vector3(10, 0.4, 0));
	const to = center.add(new Vector3(0, 0, 22));
	const spiral = departureSpiral(center, from, to, 1, []);
	expect(near(spiral[0], from), "a climb starts at the dock");
	expect(near(spiral[spiral.length - 1], to), "a climb ends where the burn leaves");
	let swept = 0;
	for (let i = 1; i < spiral.length; i++) {
		const before = Math.hypot(spiral[i - 1].x - center.x, spiral[i - 1].z - center.z);
		const after = Math.hypot(spiral[i].x - center.x, spiral[i].z - center.z);
		expect(after + 1e-6 >= before, "a climb never falls back toward the body");
		const step = angleBetween(spiral[i].subtract(center), spiral[i - 1].subtract(center));
		expect(step >= -1e-6, "a climb only turns the way it was asked");
		swept += step;
	}
	expect(swept > 1 && swept < 2, "a quarter turn ahead is climbed forward, not the long way around");
}

// Leaving against the orbit is taken only when it beats swinging around by more than half a lap.
{
	const layout = layoutAt(FIRST_DAY, 0);
	const earth = layout.bodies.find((body) => body.id === "earth")!;
	const mars = layout.bodies.find((body) => body.id === "mars")!;
	const saturn = layout.bodies.find((body) => body.id === "saturn")!;
	const candidates = assistCandidates(layout, "earth", "mars");
	const spheres = layout.bodies.map((body) => ({ center: body.center, radius: body.radius }));
	const rings = [saturnRing(saturn.center)];
	const cost = (at: Vector3, turn: number) => {
		const cruise = planRoute({
			start: earth.center,
			end: mars.center,
			startRadius: earth.outer,
			endRadius: mars.outer,
			startTurn: turn,
			endTurn: 1,
			candidates,
			spheres,
			rings,
		});
		const spiral = departureSpiral(earth.center, at, cruise.points[0], turn, rings);
		const opened = curveClimbStart(spiral, tangentHeading(earth.center, at, 1), spheres, rings, earth.center);
		const joined = curveClimbJoin(opened, cruise, spheres, rings, earth.center);
		const climb = joined.climb;
		const radius = Math.hypot(at.x - earth.center.x, at.z - earth.center.z);
		return pathLength(climb) + (turn === 1 ? 0 : reversalPenalty(radius));
	};
	let withTheOrbit = 0;
	let againstTheOrbit = 0;
	for (let step = 0; step < 24; step++) {
		const angle = (step / 24) * Math.PI * 2;
		const at = earth.center.add(new Vector3(Math.cos(angle) * EARTH_STATION_RADIUS, 0.2, Math.sin(angle) * EARTH_STATION_RADIUS));
		const name = `Earth departure at ${angle.toFixed(2)}`;
		const plan = planJourney(layout, "earth", "mars", { at, turn: 1 });
		const swept = netSweep(earth.center, plan.climb);
		expect(Math.sign(swept) === plan.cruise.startTurn || Math.abs(swept) < 0.05, `${name}: the climb turns the way the burn leaves`);
		const withCost = cost(at, 1);
		const againstCost = cost(at, -1);
		const chosen = plan.cruise.startTurn === 1 ? withCost : againstCost;
		const other = plan.cruise.startTurn === 1 ? againstCost : withCost;
		expect(chosen <= other + 1e-4, `${name}: the climb taken is the cheaper way off the orbit`);
		if (plan.cruise.startTurn === 1) {
			withTheOrbit += 1;
		} else {
			againstTheOrbit += 1;
		}
	}
	expect(withTheOrbit > 0 && againstTheOrbit > 0, "both ways off the orbit win somewhere around it");
	console.log(`Earth departures: ${withTheOrbit} with the orbit, ${againstTheOrbit} against it`);
}

function pathLength(points: Vector3[]): number {
	let length = 0;
	for (let i = 1; i < points.length; i++) {
		length += Vector3.Distance(points[i - 1], points[i]);
	}
	return length;
}

/** Net turn of a path around `center`, counterclockwise positive. */
function netSweep(center: Vector3, points: Vector3[]): number {
	let swept = 0;
	for (let i = 1; i < points.length; i++) {
		swept += angleBetween(points[i].subtract(center), points[i - 1].subtract(center));
	}
	return swept;
}

/** Docks spread evenly on one circle, all turning at one rate, positioned by a shared clock. */
function dockRing(count: number, radius: number, rate: number, clock: { now: number }, height = 0): Dock[] {
	return Array.from({ length: count }, (_, index) => {
		const start = (index / count) * Math.PI * 2;
		return {
			rate,
			position: () =>
				new Vector3(Math.cos(start + rate * clock.now) * radius, height, Math.sin(start + rate * clock.now) * radius),
		};
	});
}

/** Flies a whole approach, frame by frame, and returns the path with the dock's last position. */
function flyApproach(approach: Approach, clock: { now: number }): { path: Vector3[]; dock: Vector3 } {
	const path: Vector3[] = [];
	const steps = 240;
	for (let i = 0; i <= steps; i++) {
		clock.now = (i / steps) * approach.seconds;
		path.push(approachPoint(approach, clock.now, approach.dock.position()));
	}
	return { path, dock: approach.dock.position() };
}

/** Angle from `b` to `a` around the vertical axis, in (-π, π]. */
function angleBetween(a: Vector3, b: Vector3): number {
	return Math.atan2(Math.sin(Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x)), Math.cos(Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x)));
}

// The drop from the outer orbit starts where the burn ended, settles onto a dock, and stays between the two circles.
for (const docks of [8, 2, 1]) {
	for (const turn of [1, -1]) {
		for (let step = 0; step < 12; step++) {
			const name = `approach to ${docks} docks, turn ${turn}, step ${step}`;
			const clock = { now: 0 };
			const outer = 31;
			const angle = (step / 12) * Math.PI * 2;
			const from = new Vector3(Math.cos(angle) * outer, 0, Math.sin(angle) * outer);
			const approach = planApproach(from, turn, { docks: dockRing(docks, 11, 0.06, clock, 0.3) })!;
			expect(approach !== null, `${name}: finds a dock`);
			const { path, dock } = flyApproach(approach, clock);
			expect(near(path[0], from, 1e-3), `${name}: starts where the burn ended`);
			expect(near(path[path.length - 1], dock, 1e-3), `${name}: ends on the dock`);
			expect(approach.seconds === ORBIT_LEG_SECONDS, `${name}: takes seven seconds`);
			expect(Math.abs(approach.lead) >= APPROACH_MIN_SWEEP - 1e-9, `${name}: swings at least the minimum`);
			expect(Math.abs(approach.lead) < Math.PI * 2, `${name}: does not add a full extra lap`);
			let previous = 0;
			let unwrapped = 0;
			for (let i = 0; i < path.length; i++) {
				const radius = Math.hypot(path[i].x, path[i].z);
				expect(radius <= outer + 1e-6 && radius >= 11 - 1e-6, `${name}: stays between the outer orbit and the dock`);
				clock.now = (i / (path.length - 1)) * approach.seconds;
				const offset = angleBetween(path[i], approach.dock.position());
				if (i === 0) {
					const matchesLead = Math.abs(Math.sin(offset - approach.lead)) < 1e-3;
					unwrapped = matchesLead ? approach.lead : offset;
				} else {
					unwrapped += Math.atan2(Math.sin(offset - previous), Math.cos(offset - previous));
				}
				previous = offset;
				expect(unwrapped * Math.sign(approach.lead) >= -1e-2, `${name}: closes on the dock from one side, without passing it`);
			}
			expect(Math.abs(unwrapped) < 0.05, `${name}: closes the lead (${unwrapped.toFixed(3)})`);
		}
	}
}

{
	const smallestMoon = Math.min(...PLANETS.flatMap((spec) => spec.moons.map((moon) => moon.diameter)));
	expect(HULL_LENGTH < smallestMoon / 10, "the hull stays under a tenth of the smallest moon");
	expect(HULL_LENGTH < DOCK_SIZE.width && DOCK_SIZE.width === DOCK_SIZE.depth, "a dock is a square the ship can sit on");
	expect(DOCK_SIZE.width < HULL_LENGTH * 1.5, "a dock is not much longer than the ship");
	expect(DOCK_SIZE.height < DOCK_SIZE.width / 4, "a dock stays a thin plate");
}

for (const spec of PLANETS) {
	const outer = bodyOuterRadius(spec.name);
	const flyby = flybyRadius(spec);
	expect(flyby > outer, `${spec.name} assist stands off the honeycomb`);
	for (const moon of spec.moons) {
		const shell = moon.orbit - moonOuterOrbitRadius(moon.diameter);
		expect(flyby < shell, `${spec.name} assist stays inside ${moon.name}'s honeycomb (flyby ${flyby.toFixed(2)}, shell ${shell.toFixed(2)})`);
	}
}

{
	const flyby = flybyRadius("sun");
	const mercury = PLANETS.find((spec) => spec.name === "mercury")!;
	const mercuryShell = mercury.orbit - bodyOuterRadius("mercury");
	expect(flyby > bodyOuterRadius("sun"), "the Sun's assist stands off its outer orbit");
	expect(flyby < mercuryShell, `the Sun's assist stays inside Mercury's orbit (flyby ${flyby.toFixed(2)}, shell ${mercuryShell.toFixed(2)})`);
}

function assistCandidates(layout: JourneyLayout, fromId: string, toId: string): AssistCandidate[] {
	const candidates: AssistCandidate[] = [];
	if (fromId !== "sun" && toId !== "sun") {
		const sun = layout.bodies.find((body) => body.id === "sun")!;
		candidates.push({ name: "Sol", center: sun.center, flyby: flybyRadius("sun") });
	}
	for (const spec of PLANETS) {
		if (spec.name === fromId || spec.name === toId) {
			continue;
		}
		candidates.push({
			name: spec.name.charAt(0).toUpperCase() + spec.name.slice(1),
			center: layout.bodies.find((body) => body.id === spec.name)!.center,
			flyby: flybyRadius(spec),
		});
	}
	return candidates;
}

// Saturn's bases sit inside its tilted rings, so the drop to them must pass over the ring, not through it.
{
	const saturn = PLANETS.find((spec) => spec.name === "saturn")!;
	const { normal, inner, outer, halfHeight } = saturnRing(Vector3.Zero());
	const ring = { normal, inner, outer, halfHeight };
	const slots = planetBases({
		diameter: saturn.diameter,
		moons: saturn.moons.map((moon) => ({ orbit: moon.orbit, diameter: moon.diameter })),
		ringInnerScale: SATURN_RING_INNER_SCALE,
	}).warehouses;
	const zone = bodyOuterRadius("saturn");
	for (const turn of [1, -1]) {
		for (let step = 0; step < 36; step++) {
			const name = `Saturn approach, turn ${turn}, step ${step}`;
			const clock = { now: 0 };
			const angle = (step / 36) * Math.PI * 2;
			const from = new Vector3(Math.cos(angle) * zone, 0, Math.sin(angle) * zone);
			const approach = planApproach(from, turn, { docks: dockRing(slots.length, slots[0].radius, 0.06, clock), ring })!;
			const { path, dock } = flyApproach(approach, clock);
			expect(near(path[path.length - 1], dock, 1e-3), `${name}: ends on the dock`);
			checkClear(path, [{ center: Vector3.Zero(), radius: saturn.diameter / 2 }], [{ center: Vector3.Zero(), ...ring }], name);
		}
	}
}

{
	expect(journeySeconds(0) === 0, "a zero-length course takes no time at cruise pace");
	expect(
		Math.abs(journeySeconds(1120 * SYSTEM_SCALE) - 40) < 1e-6,
		"at maximum coast, Neptune to the Sun is 40 seconds of pace"
	);
	expect(journeySeconds(1e6) === 1e6 / JOURNEY_PACE, "a long course is not capped");
}

{
	const departSpeed = 0.4;
	// Long enough that the ends stay at dock speed and climb pace, and the middle makes up the rest.
	const length = (departSpeed + CLIMB_PACE) * ORBIT_LEG_SECONDS;
	const duration = climbDuration(length, departSpeed);
	expect(duration === ORBIT_LEG_SECONDS, "a climb takes seven seconds");
	expect(SOFT_DOCK_SECONDS === 3, "soft dock and undock take three seconds");
	expect(Math.abs(climbDistance(duration, length, departSpeed) - length) < 1e-3, "a climb covers its length");
	const dt = 0.02;
	expect(
		Math.abs(climbDistance(dt, length, departSpeed) / dt - departSpeed) < 0.08 * SYSTEM_SCALE,
		"a climb starts at dock speed"
	);
	const endSpeed = (length - climbDistance(duration - dt, length, departSpeed)) / dt;
	expect(Math.abs(endSpeed - CLIMB_PACE) < 0.2, "a climb is at burn speed when the burn starts");
	let previous = departSpeed;
	for (let i = 1; i <= 16; i++) {
		const t = (i / 16) * duration;
		const speed =
			(climbDistance(t, length, departSpeed) - climbDistance(((i - 1) / 16) * duration, length, departSpeed)) /
			(duration / 16);
		expect(
			Math.abs(speed - previous) < CLIMB_PACE,
			`climb speed does not jump (${speed.toFixed(2)} after ${previous.toFixed(2)})`
		);
		previous = speed;
	}
}

{
	const length = 2;
	const departSpeed = 2;
	const duration = climbDuration(length, departSpeed);
	const dt = 0.02;
	const startSpeed = climbDistance(dt, length, departSpeed) / dt;
	const endSpeed = (length - climbDistance(duration - dt, length, departSpeed)) / dt;
	expect(startSpeed < departSpeed + 0.05, "a short climb does not start faster than the ship was going");
	expect(endSpeed < CLIMB_PACE - 0.5, "a short climb reaches the burn slower than the usual handoff");
}

{
	const layout = layoutAt(FIRST_DAY, 0);
	const earth = layout.bodies.find((body) => body.id === "earth")!;
	let retrograde = 0;
	for (let step = 0; step < 24; step++) {
		const angle = (step / 24) * Math.PI * 2;
		const at = earth.center.add(new Vector3(Math.cos(angle) * EARTH_STATION_RADIUS, 0.2, Math.sin(angle) * EARTH_STATION_RADIUS));
		const plan = planJourney(layout, "earth", "mars", { at, turn: 1, speed: 0.5 });
		expect(Math.abs(plan.departSpeed - 0.5) < 1e-9, "a departure keeps the speed the ship already has");
		expect(plan.cruise.endTurn === 1, "a departure still arrives with the inner orbit");
		if (plan.cruise.startTurn !== -1) {
			continue;
		}
		retrograde += 1;
		const stepOut = plan.climb[1].subtract(plan.climb[0]);
		const dockHeading = tangentHeading(earth.center, plan.climb[0], 1);
		expect(
			Vector3.Dot(stepOut.normalize(), dockHeading) > 0.85,
			`a retrograde departure at ${angle.toFixed(2)} curves off the docked heading`
		);
		let worst = 0;
		for (let i = 2; i < plan.climb.length; i++) {
			const before = plan.climb[i - 1].subtract(plan.climb[i - 2]);
			const after = plan.climb[i].subtract(plan.climb[i - 1]);
			if (before.length() < 0.02 || after.length() < 0.02) {
				continue;
			}
			const turn = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(before.normalize(), after.normalize()))));
			worst = Math.max(worst, turn / after.length());
		}
		expect(worst < 1.25, `a retrograde departure at ${angle.toFixed(2)} turns gently (${worst.toFixed(2)} rad/unit)`);
		for (let i = 1; i < plan.climb.length; i++) {
			expect(
				!segmentHitsSphere(plan.climb[i - 1], plan.climb[i], earth.center, earth.radius),
				`a retrograde departure at ${angle.toFixed(2)} stays clear of Earth`
			);
		}
	}
	expect(retrograde > 0, "some departures still leave against the orbit");
}

{
	const outer = 31 * SYSTEM_SCALE;
	const dockRadius = 11 * SYSTEM_SCALE;
	const dockRate = 0.03;
	const clock = { now: 0 };
	const from = new Vector3(outer, 0, 0);
	const approach = planApproach(from, 1, { docks: dockRing(4, dockRadius, dockRate, clock, 0.2) })!;
	const { path } = flyApproach(approach, clock);
	expect(approach.seconds === ORBIT_LEG_SECONDS, "a drop takes seven seconds");
	expect(Math.abs(approach.lead) < Math.PI * 2, "a drop does not add a full extra lap");
	const dockSpeed = dockRate * dockRadius;
	let previous = 0;
	const samples = 12;
	for (let i = 0; i < samples; i++) {
		const index = Math.round((i / samples) * (path.length - 2));
		const next = Math.min(path.length - 1, index + Math.max(1, Math.round((path.length - 1) / samples)));
		const speed = path[next].subtract(path[index]).length() / (((next - index) * approach.seconds) / (path.length - 1));
		if (i === 0) {
			expect(
				Math.abs(speed - CLIMB_PACE) < 0.9 * SYSTEM_SCALE,
				`a drop leaves at climb speed (${speed.toFixed(2)})`
			);
		} else {
			expect(
				Math.abs(speed - previous) < 8 * SYSTEM_SCALE,
				`a drop does not jump (${speed.toFixed(2)} after ${previous.toFixed(2)})`
			);
		}
		previous = speed;
	}
	const lateSpeed =
		path[path.length - 1].subtract(path[path.length - 2]).length() / (approach.seconds / (path.length - 1));
	expect(Math.abs(lateSpeed - dockSpeed) < 1.2, `a drop settles near dock speed (${lateSpeed.toFixed(2)}, dock ${dockSpeed.toFixed(2)})`);
	let reversed = false;
	for (let i = 1; i < path.length; i++) {
		const step = path[i].subtract(path[i - 1]);
		if (step.lengthSquared() < 1e-8) {
			continue;
		}
		const angle = Math.atan2(path[i].z, path[i].x);
		const tangent = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
		if (Vector3.Dot(step.normalize(), tangent) < 0.15) {
			reversed = true;
		}
	}
	expect(!reversed, "a prograde drop keeps the nose with the inner orbit");
}

{
	const layout = layoutAt(FIRST_DAY, 0);
	const plan = planJourney(layout, "titan", "saturn");
	const saturn = layout.bodies.find((body) => body.id === "saturn")!;
	const ring = saturnRing(saturn.center);
	const joined = [...plan.climb];
	let covered = 0;
	for (const point of plan.cruise.points) {
		const previous = joined[joined.length - 1];
		const step = Vector3.Distance(previous, point);
		if (covered > 8) {
			break;
		}
		joined.push(point);
		covered += step;
	}
	let worst = 0;
	for (let i = 2; i < joined.length; i++) {
		const before = joined[i - 1].subtract(joined[i - 2]);
		const after = joined[i].subtract(joined[i - 1]);
		if (before.length() < 0.02 || after.length() < 0.02) {
			continue;
		}
		const turn = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(before.normalize(), after.normalize()))));
		worst = Math.max(worst, turn / after.length());
	}
	expect(worst < 1.25, `a Titan climb meets the burn gently (${worst.toFixed(2)} rad/unit)`);
	for (let i = 1; i < joined.length; i++) {
		expect(!segmentHitsSphere(joined[i - 1], joined[i], saturn.center, saturn.radius), "a Titan climb stays clear of Saturn");
		expect(!segmentHitsRing(joined[i - 1], joined[i], ring), "a Titan climb stays clear of Saturn's rings");
	}
}

/** Largest yaw, radians per second, along the climb and the start of the burn. */
function maxYaw(plan: Parameters<typeof legPose>[0], seconds: number): number {
	const dt = 0.02;
	let worst = 0;
	let previous = legPose(plan, 0).heading;
	const steps = Math.max(1, Math.ceil(seconds / dt));
	for (let i = 1; i <= steps; i++) {
		const heading = legPose(plan, Math.min(seconds, i * dt)).heading;
		const gap = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(previous, heading))));
		worst = Math.max(worst, gap / dt);
		previous = heading;
	}
	return worst;
}

// A small moon's climb stays in its zone and on its plane. The dock rise is a hull, not a camera offset.
{
	const layout = layoutAt(FIRST_DAY, 0);
	const deimos = layout.bodies.find((body) => body.id === "deimos")!;
	const at = deimos.bases[0];
	const plan = planJourney(layout, "deimos", "mars", { at, turn: 1, speed: 0.05 });
	const hover = poseRise(deimos.halo, deimos.outer, "hover");
	const coupled = poseRise(deimos.halo, deimos.outer, "coupled");
	expect(coupled <= hover + 1e-9, "the hover sits at least as high as the coupled pose");
	expect(
		Math.abs(hover - HULL_CLEARANCE * 2) < 1e-9,
		`a small moon's hover is a full hull clearance (${hover.toFixed(3)})`
	);
	expect(hover <= (deimos.outer - deimos.halo) * 0.15 + 1e-6, "the rise is capped by the gap to the outer orbit");
	for (const point of plan.climb) {
		const flat = flatDistance(point, deimos.center);
		expect(flat < deimos.outer * 1.35, `a Deimos climb stays near the moon (${flat.toFixed(2)}, outer ${deimos.outer.toFixed(2)})`);
		const off = Math.abs(point.y - deimos.center.y);
		expect(off < 0.2, `a Deimos climb stays on the moon's plane (off by ${off.toFixed(3)})`);
	}
	{
		const yaw = maxYaw(plan, ORBIT_LEG_SECONDS);
		expect(yaw < MAX_YAW * 1.35, `a small-moon climb stays under the yaw cap (${yaw.toFixed(3)} vs ${(MAX_YAW * 1.35).toFixed(3)})`);
	}
}

// The clock is fixed, and sampling it twice lands on the same pose. The burn ends on the outer orbit.
{
	const layout = layoutAt(FIRST_DAY, 0);
	const earth = layout.bodies.find((body) => body.id === "earth")!;
	const mars = layout.bodies.find((body) => body.id === "mars")!;
	const at = earth.bases[0] ?? earth.center.add(new Vector3(EARTH_STATION_RADIUS, 0, 0));
	const plan = planJourney(layout, "earth", "mars", { at, turn: 1, speed: 0.4 });
	const length = plan.climb.reduce(
		(sum, _point, index) => (index === 0 ? 0 : sum + Vector3.Distance(plan.climb[index - 1], plan.climb[index])),
		0
	);
	const profile = cruiseProfile(plan);
	const clock = flightSchedule(true, length, plan.departSpeed, profile.seconds, true);
	expect(clock.undockSeconds === SOFT_DOCK_SECONDS, "undock is three seconds");
	expect(clock.climbSeconds === ORBIT_LEG_SECONDS, "the climb is seven seconds");
	expect(clock.dropSeconds === ORBIT_LEG_SECONDS, "the drop is seven seconds");
	expect(clock.dockSeconds === SOFT_DOCK_SECONDS, "soft dock is three seconds");
	expect(
		Math.abs(clock.total - (clock.undockSeconds + clock.climbSeconds + clock.cruiseSeconds + clock.dropSeconds + clock.dockSeconds)) <
			1e-9,
		"the clock is the sum of the phases"
	);
	const berth: Dock = { position: () => Vector3.Zero(), rate: 1 };
	const flown = { ...plan, departDock: berth, departBody: "earth", arrive: { ...plan.arrive, dock: berth } };
	expect(Math.abs(tripSeconds(flown, profile.speed) - clock.total) < 1e-6, "travel time is that clock once the ship is coupled");
	const slower = tripSeconds(flown, cruiseProfile(plan, 0).speed);
	expect(tripSeconds(flown, profile.maxSpeed) < slower, "a faster coast shortens the trip");
	const burnEnd = clock.climbSeconds + clock.cruiseSeconds;
	const pose = legPose(plan, burnEnd);
	const again = legPose(plan, burnEnd);
	expect(near(pose.point, again.point), "sampling the burn twice matches");
	expect(near(pose.heading, again.heading), "the heading matches the second sample");
	expect(near(pose.point, plan.cruise.points[plan.cruise.points.length - 1], 1e-2), "the burn ends where the cruise ends");
	const from = pose.point.subtract(mars.center);
	const dockClock = { now: 0 };
	const approach = planApproach(
		from,
		plan.arrive.turn || 1,
		{ docks: dockRing(4, mars.halo, 0.03, dockClock), outer: mars.outer },
		pose.heading
	)!;
	expect(approach.seconds === ORBIT_LEG_SECONDS, "the planned drop takes seven seconds");
	const { dock } = flyApproach(approach, dockClock);
	const raised = dock.clone();
	raised.y += poseRise(Math.hypot(dock.x, dock.z), mars.outer, "hover");
	expect(near(approachPoint(approach, approach.seconds, raised), raised, 1e-3), "the drop ends on the destination hover");
	const dockedRise = poseRise(Math.hypot(dock.x, dock.z), mars.outer, "coupled");
	const hoverRise = poseRise(Math.hypot(dock.x, dock.z), mars.outer, "hover");
	expect(hoverRise - dockedRise < 0.05, "soft dock only closes the hull clearance");
}

// A mine or collector is met from behind on its own orbit. The nose points along the path at the craft.
{
	const radius = 11;
	const rate = 0.06;
	const at = new Vector3(radius, 0.2, 0);
	const mine: Dock = { rate, mount: "trail", position: () => at.clone() };
	const coupled = berthPoint(mine, 20, "coupled");
	const hover = berthPoint(mine, 20, "hover");
	const arc = (point: Vector3) => Math.abs(angleBetween(point, at)) * radius;
	expect(Math.abs(Math.hypot(coupled.x, coupled.z) - radius) < 1e-6, "a coupled ship stays on the mine's orbit");
	expect(Math.abs(coupled.y - at.y) < 1e-9, "a coupled ship stays at the mine's height");
	expect(Math.abs(Math.hypot(hover.x, hover.z) - radius) < 1e-6, "a hover stays on the mine's orbit");
	expect(Math.abs(hover.y - at.y) < 1e-9, "a hover stays at the mine's height");
	expect(Math.abs(arc(coupled) - trailDistance("coupled")) < 1e-4, "coupled sits just behind the craft");
	expect(Math.abs(arc(hover) - trailDistance("hover")) < 1e-4, "hover sits further back along the orbit");
	expect(trailDistance("hover") - trailDistance("coupled") > 0.03, "undock slides aft along the orbit");
	const noseGap = arc(coupled) - MINE_SIZE.depth / 2 - HULL_LENGTH / 2;
	expect(noseGap >= 0.03 && noseGap < HULL_LENGTH, "the nose stays back far enough that a head turn does not slice the craft");
	const ahead = new Vector3(0, 0, Math.sign(rate));
	const toCraft = at.subtract(coupled);
	expect(Vector3.Dot(ahead, toCraft) > 0.9 * toCraft.length(), "the nose points at the craft ahead");
	const slide = hover.subtract(coupled);
	const radial = new Vector3(coupled.x, 0, coupled.z).normalize();
	expect(Math.abs(slide.y) < 1e-9, "docking slides along the orbit, not up");
	expect(Math.abs(Vector3.Dot(slide, radial)) < slide.length() * 0.05, "the slide stays on the circle");
	const retrograde: Dock = { rate: -rate, mount: "trail", position: () => at.clone() };
	const behind = berthPoint(retrograde, 20, "coupled");
	expect(behind.z > 0.02, "a retrograde craft is still met from behind");
	const left = hoverDeparture(mine, 20);
	expect(Math.abs(left.y - at.y) < 1e-6, "leaving a mine stays at its height");
	expect(Math.abs(Math.hypot(left.x, left.z) - radius) < 1e-4, "leaving a mine stays on its orbit");
	const pad: Dock = { rate, position: () => at.clone() };
	const raised = berthPoint(pad, 20, "coupled");
	expect(Math.abs(raised.x - at.x) < 1e-9 && Math.abs(raised.z - at.z) < 1e-9 && raised.y > at.y, "a pad still lifts the ship above it");
}

// Coupled to a mine or collector, the muzzle — not the hull center — lies on the port axis, so the laser fires straight into the opening.
{
	const radius = 11;
	const at = new Vector3(radius, 0.2, 0);
	const muzzle = new Vector3(0.001, -0.009, 0.004);
	const distance = trailDistance("coupled");
	for (const rate of [0.06, -0.06]) {
		const aligned = trailAlignment(at, rate, distance, muzzle);
		const right = Vector3.Cross(Vector3.Up(), aligned.heading).normalize();
		const muzzleAt = aligned.point.add(right.scale(muzzle.x)).add(Vector3.Up().scale(muzzle.y));
		const fromCraft = muzzleAt.subtract(at);
		const along = Vector3.Dot(fromCraft, aligned.heading);
		const lateral = fromCraft.subtract(aligned.heading.scale(along));
		const name = rate > 0 ? "prograde" : "retrograde";
		expect(lateral.length() < 1e-6, `${name}: the muzzle sits on the line through the craft`);
		expect(along < -distance + 0.01, `${name}: the muzzle is behind the craft`);
		expect(Math.abs(aligned.heading.y) < 1e-9, `${name}: the shot stays level with the opening`);
		const ahead = at.subtract(aligned.point);
		expect(Vector3.Dot(ahead, aligned.heading) > 0.99 * ahead.length(), `${name}: the nose points straight at the craft`);
		expect(
			Math.abs(Math.hypot(aligned.point.x, aligned.point.z) - radius) > 0.0001,
			`${name}: the hull sits on the port axis, off the circle`
		);
	}
}

// Retrograde departures and ordinary climbs yaw no faster than the cap.
{
	const layout = layoutAt(FIRST_DAY, 0);
	const earth = layout.bodies.find((body) => body.id === "earth")!;
	let checked = 0;
	for (let step = 0; step < 24; step++) {
		const angle = (step / 24) * Math.PI * 2;
		const at = earth.center.add(new Vector3(Math.cos(angle) * EARTH_STATION_RADIUS, 0, Math.sin(angle) * EARTH_STATION_RADIUS));
		const plan = planJourney(layout, "earth", "mars", { at, turn: 1, speed: 0.5 });
		const yaw = maxYaw(plan, ORBIT_LEG_SECONDS);
		let turn = 0;
		for (let i = 2; i < plan.climb.length; i++) {
			const before = plan.climb[i - 1].subtract(plan.climb[i - 2]);
			const after = plan.climb[i].subtract(plan.climb[i - 1]);
			const bl = before.length();
			const al = after.length();
			if (bl < 1e-6 || al < 1e-6) continue;
			turn += Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(before.scale(1 / bl), after.scale(1 / al)))));
		}
		// The floor is the yaw cap, or the climb's own turn spread across the seven seconds when
		// that turn cannot be made any slower. A kink sits well above either one.
		const floor = Math.max(MAX_YAW, turn / ORBIT_LEG_SECONDS);
		expect(yaw < floor * 1.5, `an Earth climb at ${angle.toFixed(2)} stays under the yaw cap (${yaw.toFixed(2)} vs ${floor.toFixed(2)})`);
		checked += 1;
	}
	expect(checked === 24, "every Earth departure was timed");
}

// Saturn's clearance is one ring thickness along the ring normal, added on top of the planar path.
// An ecliptic point already sits off the tilted ring plane, so the check is the extra lift, not that height.
{
	const layout = layoutAt(FIRST_DAY, 0);
	const saturn = layout.bodies.find((body) => body.id === "saturn")!;
	const ring = saturnRing(saturn.center);
	const inside = saturn.center.add(new Vector3(ring.inner * 0.85, 0, 0));
	const outside = saturn.center.add(new Vector3(ring.outer + 6 * BODY_SCALE, 0, 0));
	for (const turn of [1, -1]) {
		const lifted = departureSpiral(saturn.center, inside, outside, turn, [ring]);
		const plain = departureSpiral(saturn.center, inside, outside, turn, []);
		expect(lifted.length === plain.length, "the ring lift does not add corners");
		let worst = 0;
		for (let i = 0; i < lifted.length; i++) {
			worst = Math.max(worst, Vector3.Distance(lifted[i], plain[i]));
		}
		expect(worst < ring.halfHeight * 3, `a Saturn climb lifts by about one thickness (${worst.toFixed(2)})`);
		expect(Vector3.Distance(lifted[0], inside) < 1e-4, "the lift leaves the dock where it was");
	}
	for (const other of ["earth", "titan"]) {
		for (const [fromId, toId] of [
			["saturn", other],
			[other, "saturn"],
		] as const) {
			const plan = planJourney(layout, fromId, toId);
			const flown = [...plan.climb, ...plan.cruise.points];
			for (let i = 1; i < flown.length; i++) {
				expect(!segmentHitsRing(flown[i - 1], flown[i], ring), `${fromId} to ${toId} misses Saturn's rings`);
			}
		}
	}
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

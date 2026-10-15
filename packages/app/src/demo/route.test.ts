import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

import { EARTH_STATION_RADIUS, SATURN_RING_INNER_SCALE, moonBases, planetBases } from "./bases";
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
import {
	APPROACH_MIN_SECONDS,
	APPROACH_MIN_SWEEP,
	CLIMB_PACE,
	JOURNEY_MAX_SECONDS,
	JOURNEY_MIN_SECONDS,
	approachPoint,
	cruiseDistance,
	cruiseSpeed,
	journeySeconds,
	planApproach,
	type Approach,
	type Dock,
} from "./journey";
import { cross2, departureSpiral, headingAt, planRoute, pointAt, reversalPenalty, type AssistCandidate, type Route } from "./route";

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
	const flown = [...plan.climb];
	for (const point of route.points) {
		if (flown.length === 0 || !near(flown[flown.length - 1], point)) {
			flown.push(point);
		}
	}
	checkClear(flown, spheres, [saturnRing(saturn.center)], name);
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
	const candidates: AssistCandidate[] = PLANETS.filter((spec) => spec.name !== "earth" && spec.name !== "mars").map((spec) => ({
		name: spec.name,
		center: layout.bodies.find((body) => body.id === spec.name)!.center,
		flyby: flybyRadius(spec),
	}));
	const spheres = layout.bodies.map((body) => ({ center: body.center, radius: body.radius }));
	const rings = [saturnRing(saturn.center)];
	const cost = (at: Vector3, turn: number) => {
		const cruise = planRoute({
			start: earth.center,
			end: mars.center,
			startRadius: earth.outer,
			endRadius: mars.outer,
			startTurn: turn,
			candidates,
			spheres,
			rings,
		});
		const climb = departureSpiral(earth.center, at, cruise.points[0], turn, rings);
		return pathLength(climb) + (turn === 1 ? 0 : reversalPenalty(EARTH_STATION_RADIUS));
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
			expect(approach.seconds >= APPROACH_MIN_SECONDS, `${name}: takes its time`);
			expect(Math.abs(approach.lead) >= APPROACH_MIN_SWEEP - 1e-9, `${name}: swings around before docking`);
			let previous = 0;
			let unwrapped = approach.lead;
			for (let i = 0; i < path.length; i++) {
				const radius = Math.hypot(path[i].x, path[i].z);
				expect(radius <= outer + 1e-6 && radius >= 11 - 1e-6, `${name}: stays between the outer orbit and the dock`);
				clock.now = (i / (path.length - 1)) * approach.seconds;
				const offset = angleBetween(path[i], approach.dock.position());
				if (i === 0) {
					expect(Math.abs(Math.sin(offset - approach.lead)) < 1e-6, `${name}: starts the lead away from the dock`);
				} else {
					unwrapped += Math.atan2(Math.sin(offset - previous), Math.cos(offset - previous));
				}
				previous = offset;
				expect(unwrapped * Math.sign(approach.lead) >= -1e-3, `${name}: closes on the dock from one side, without passing it`);
			}
			expect(Math.abs(unwrapped) < 1e-3, `${name}: closes the whole lead`);
			const first = path[1].subtract(path[0]).length() / (approach.seconds / 240);
			expect(Math.abs(first - CLIMB_PACE) < 0.6, `${name}: leaves the outer orbit at the arrival speed (${first.toFixed(2)})`);
		}
	}
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
	const cruise = 800;
	const seconds = journeySeconds(cruise);
	expect(Math.abs(cruiseSpeed(0, cruise, seconds) - CLIMB_PACE) < 1e-6, "a burn starts at the slow speed");
	expect(Math.abs(cruiseSpeed(seconds, cruise, seconds) - CLIMB_PACE) < 1e-6, "a burn ends at the slow speed");
	expect(cruiseSpeed(seconds / 2, cruise, seconds) > CLIMB_PACE, "a burn is fastest in the middle");
	expect(Math.abs(cruiseDistance(seconds, cruise, seconds) - cruise) < 1e-3, "a burn covers its length in the planned time");
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

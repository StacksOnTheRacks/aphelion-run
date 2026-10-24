import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { isDoubleTap } from "./cockpit";
import { viewPlaque } from "./view-plaque";
import type { ScanTarget } from "./scan";
import { isPick } from "./pointer";
import { WHEEL_ZOOM_FRACTION, wheelNotch } from "./zoom";
import {
	JOURNEY_STOPS,
	PLACES,
	PLANETS,
	SCAN_LIMIT,
	SUN_TRAVEL_SECONDS,
	TRAVEL_SECONDS,
	CLOSE_HOLD,
	blocked,
	bodyTarget,
	bodyTargets,
	chartButtons,
	choosePick,
	closeOrbitDistance,
	holdClose,
	scanScope,
	scanTargets,
	wideChartStep,
	stopView,
	travelSeconds,
	viewTrail,
	wheelLimits,
} from "./environment";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

for (const place of PLACES) {
	for (const subject of place.subjects) {
		const labels = subject.stops.map((stop) => stop.label);
		const name = `${place.label} / ${subject.label}`;
		expect(labels.includes("Outer orbit"), `${name} has an Outer orbit stop`);
		expect(labels.includes("Inner orbit"), `${name} has an Inner orbit stop`);
	}
}

expect(travelSeconds("sun-outer") === SUN_TRAVEL_SECONDS, "arriving at the Sun's outer orbit is the slower zoom");
expect(travelSeconds("sun-inner") === SUN_TRAVEL_SECONDS, "arriving at the Sun's inner orbit is the slower zoom");
expect(travelSeconds("mercury-outer") === TRAVEL_SECONDS, "a planet arrival keeps the normal pace");
expect(travelSeconds("system") === TRAVEL_SECONDS, "the pull back to the system keeps the normal pace");
expect(travelSeconds("sun-inner") > travelSeconds("jupiter-outer"), "a Sun arrival takes longer than a planet arrival");

const systemTargets = bodyTargets("system");
expect(systemTargets.length === PLANETS.length + 1, "the whole system offers the Sun and every planet");
expect(systemTargets[0]?.id === "sun" && systemTargets[0].view === "sun-outer", "the Sun opens its outer orbit");
expect(
	bodyTargets("jupiter-outer").map((target) => target.id).join() === "io,europa,ganymede,callisto",
	"beside Jupiter, its four moons can be picked"
);
expect(bodyTargets("earth-outer")[0]?.view === "earth-moon-outer", "beside Earth, the Moon opens its outer orbit");
expect(bodyTargets("mercury-outer").length === 0, "Mercury has no moons to pick");
expect(bodyTargets("sun-outer").length === 0, "nothing is picked beside the Sun");
expect(bodyTargets("saturn-titan-outer").length === 0, "nothing is picked beside a moon");

for (const target of [...systemTargets, ...PLANETS.flatMap((spec) => bodyTargets(`${spec.name}-outer`))]) {
	const trail = viewTrail(target.view);
	expect(trail[trail.length - 1]?.id === target.id, `the trail to ${target.label} ends at ${target.label}`);
	expect(target.view.endsWith("-outer"), `${target.label} opens an outer orbit`);
}
expect(viewTrail("system").length === 0, "the whole system has no body in its trail");
expect(
	viewTrail("saturn-titan-outer").map((body) => body.label).join(" › ") === "Saturn › Titan",
	"a moon's trail runs through its planet"
);
expect(viewTrail("saturn-titan-outer")[0]?.view === "saturn-outer", "the planet's crumb opens the planet's outer orbit");
expect(
	viewTrail("earth-inner").map((body) => body.label).join(" › ") === "Earth › Inner orbit",
	"a planet's inner orbit sits under the planet"
);
expect(viewTrail("earth-inner")[0]?.view === "earth-outer", "the planet's crumb leaves the inner orbit for the outer one");
expect(
	viewTrail("saturn-titan-inner").map((body) => body.label).join(" › ") === "Saturn › Titan › Inner orbit",
	"a moon's inner orbit sits under the moon"
);
expect(viewTrail("sun-inner")[0]?.view === "sun-outer", "the Sun's crumb leaves its inner orbit for the outer one");

for (const stop of JOURNEY_STOPS) {
	const view = stopView(stop.id);
	expect(view.endsWith("-outer"), `arriving at ${stop.label} opens an outer orbit`);
	expect(viewTrail(view).at(-1)?.id === stop.id, `arriving at ${stop.label} lands on ${stop.label}`);
}
expect(stopView("titan") === "saturn-titan-outer", "arriving at a moon opens that moon's outer orbit");

expect(scanTargets("system").map((target) => target.id).join() === systemTargets.map((target) => target.id).join(), "a scan of the whole system offers the same bodies");
expect(scanTargets("jupiter-outer")[0]?.id === "jupiter", "a scan beside Jupiter can pick Jupiter itself");
expect(scanTargets("jupiter-outer").length === 5, "a scan beside Jupiter offers Jupiter and its four moons");
expect(scanTargets("saturn-titan-inner").map((target) => target.id).join() === "titan", "a scan in Titan's inner orbit offers Titan");
expect(scanTargets("sun-outer").map((target) => target.id).join() === "sun", "a scan beside the Sun offers the Sun");

const named = (view: Parameters<typeof scanScope>[0], close: boolean) =>
	scanScope(view, close).bodies.map((body) => body.id).join();
const family = systemTargets.map((target) => target.id).join();
expect(named("system", true) === family && scanScope("system", true).craftHost === null, "the system chart names the Sun and the planets at any zoom");
expect(
	named("jupiter-outer", false) === "jupiter,io,europa,ganymede,callisto" && scanScope("jupiter-outer", false).craftHost === null,
	"a wide planet chart names the planet and its moons, and nothing orbiting them"
);
expect(
	named("jupiter-outer", true) === "jupiter" && scanScope("jupiter-outer", true).craftHost === "jupiter",
	"a zoomed planet chart names the planet and what orbits it"
);
expect(
	named("saturn-titan-outer", false) === "titan" && scanScope("saturn-titan-outer", false).craftHost === "titan",
	"a moon chart names the moon and what orbits it"
);
expect(
	named("saturn-titan-inner", false) === "titan" && scanScope("saturn-titan-inner", false).craftHost === "titan",
	"a moon's inner orbit names the moon and what orbits it"
);
expect(
	named("earth-inner", false) === "earth" && scanScope("earth-inner", false).craftHost === "earth",
	"a planet's inner orbit names the planet and what orbits it"
);
expect(named("sun-outer", false) === "sun" && scanScope("sun-outer", false).craftHost === null, "the Sun names no collectors while the camera is wide");
expect(named("sun-outer", true) === "sun" && scanScope("sun-outer", true).craftHost === "sun", "the Sun names its collectors once the camera is close");
expect(scanScope("sun-inner", false).craftHost === "sun", "the Sun's inner orbit names its collectors");
expect(named("mercury-outer", false) === "mercury" && scanScope("mercury-outer", false).craftHost === null, "a moonless planet names itself until the camera comes in");

expect(closeOrbitDistance(12, 40) === 50, "the close orbit stands a margin outside the outer shell");
expect(closeOrbitDistance(90, 40) === 90, "the close orbit stays back far enough for the body to fill the moon framing");
const edge = 100;
expect(holdClose(edge, edge, false), "arriving on the close orbit counts as close");
expect(!holdClose(edge + 0.1, edge, false), "outside the close orbit the family stays named");
expect(holdClose(edge * (1 + CLOSE_HOLD), edge, true), "a chart that came in stays close through the hold band");
expect(!holdClose(edge * (1 + CLOSE_HOLD) + 0.01, edge, true), "past the hold band the family names return");

const ship = { id: "player-ship", host: "dione" };
expect(choosePick(ship, "dione") === "dione", "a click on Dione stays on Dione while the ship is docked there");
expect(choosePick(ship, null) === "player-ship", "the docked ship is the click when the pointer is not on a body");
expect(
	choosePick({ id: "saturn-station", host: "saturn" }, "dione") === "saturn-station",
	"a craft of another body still takes the click"
);
expect(choosePick(null, "dione") === "dione", "a body with nothing in front of it is the click");

expect(bodyTarget("titan").view === "saturn-titan-outer", "a body found by id opens its outer orbit");
expect(bodyTarget("sun").view === "sun-outer" && bodyTarget("mars").label === "Mars", "the Sun and planets are found by id");

const origin = new Vector3(0, 0, 0);
const far = new Vector3(10, 0, 0);
expect(blocked(origin, far, new Vector3(5, 0.5, 0), 1), "a body across the line of sight blocks it");
expect(!blocked(origin, far, new Vector3(5, 2, 0), 1), "a body beside the line of sight does not");
expect(!blocked(origin, far, new Vector3(12, 0, 0), 1), "a body beyond the target does not");
expect(!blocked(origin, far, new Vector3(-3, 0, 0), 1), "a body behind the eye does not");
expect(SCAN_LIMIT === 10, "a scan names at most ten things");

const systemSteps = chartButtons("system");
expect(systemSteps.map((button) => button.label).join() === "Home,Galaxy", "the system chart offers Home, then Galaxy");
expect(systemSteps[0]?.target === "ship", "Home opens the ship's chart");
expect(bodyTarget("earth").view === "earth-outer", "an Earth station's planetary chart is Earth's outer orbit");
expect(bodyTarget("sun").view === "sun-outer", "a Sun collector's planetary chart is the Sun's outer orbit");
expect(bodyTarget("triton").view === "neptune-triton-outer", "a moon dock's planetary chart is that moon's outer orbit");

const corporateStation: ScanTarget = {
	id: "earth-station-corporate-0",
	host: "earth",
	kind: "station",
	owner: "corporate",
};
expect(viewPlaque("system", false, null).title === "Sol System", "the system chart is Sol System");
expect(viewPlaque("system", false, null).detail === null, "the plaque has no ship status");
expect(viewPlaque("neptune-outer", false, null).title === "Neptune System", "a wide planet chart names that system");
expect(viewPlaque("sun-outer", false, null).title === "Sun System", "the Sun's wide chart names the Sun's system");
expect(viewPlaque("earth-outer", false, null).title === "Earth System", "Earth's wide chart names Earth's system");
expect(viewPlaque("neptune-outer", true, null).title === "Neptune", "a planet zoomed in names the planet");
expect(viewPlaque("neptune-triton-outer", false, null).title === "Triton", "a moon chart names the moon");
expect(viewPlaque("earth-inner", false, null).title === "Earth", "an inner orbit names the body");
expect(viewPlaque("earth-outer", false, corporateStation).title === "Corporate station", "riding a craft names that craft");
expect(systemSteps[1]?.target === "galaxy", "Galaxy leaves Sol");
expect(
	chartButtons("earth-outer")[0]?.label === "System" && chartButtons("earth-outer")[0]?.target === "system",
	"a planet steps back to the system"
);
expect(chartButtons("sun-outer")[0]?.label === "System", "the Sun steps back to the system");
expect(
	chartButtons("earth-inner")[0]?.label === "Planet" && chartButtons("earth-inner")[0]?.target === "earth-outer",
	"an orbit steps back to its planet"
);
expect(
	chartButtons("saturn-titan-outer")[0]?.label === "Planet" && chartButtons("saturn-titan-outer")[0]?.target === "saturn-outer",
	"a moon steps back to its planet"
);
expect(chartButtons("saturn-titan-inner")[0]?.target === "saturn-outer", "a moon's orbit steps back to the planet");
expect(
	chartButtons("sun-inner")[0]?.label === "Sun" && chartButtons("sun-inner")[0]?.target === "sun-outer",
	"the Sun's orbit steps back to the Sun"
);
expect(chartButtons("jupiter-outer").length === 1, "a planet view has one step");
expect(wideChartStep("jupiter-outer")?.label === "Planet" && wideChartStep("jupiter-outer")?.target === "wide", "a close planet chart steps back out to the planet");
expect(wideChartStep("mercury-outer") === null, "a moonless planet has no moons to step back to");
expect(wideChartStep("saturn-titan-outer") === null, "a moon chart steps back with its own button");
expect(wideChartStep("sun-outer") === null, "the Sun does not step back to moons");

const planetWheel = wheelLimits("earth-outer", 100, 40, 7000);
expect(planetWheel.near === 40 && planetWheel.far === 100, "a planet view can come in, and cannot pull back past its shot");
const innerWheel = wheelLimits("earth-inner", 30, 10, 7000);
expect(innerWheel.near === 30 && innerWheel.far === 30, "an inner orbit holds its shot");
const moonWheel = wheelLimits("saturn-titan-inner", 12, 4, 7000);
expect(moonWheel.near === 12 && moonWheel.far === 12, "a moon's inner orbit holds its shot");
const systemWheel = wheelLimits("system", 2000, 800, 7000);
expect(systemWheel.near === 800 && systemWheel.far === 7000, "the system chart can still pull back");
expect(wheelLimits("mars-outer", 50, 80, 7000).near === 50, "the near limit stays on the arrived shot when that is closer");

const inward = 100 - wheelNotch(100, "in");
const outward = 100 - wheelNotch(100, "out");
expect(inward < 100 && inward > 100 * (1 - WHEEL_ZOOM_FRACTION), "one zoom notch moves closer by just under two percent");
expect(outward > 100 && outward < 100 * (1 + WHEEL_ZOOM_FRACTION) + 1, "one zoom notch moves farther by about two percent");
expect(Math.abs(wheelNotch(200, "in")) > Math.abs(wheelNotch(100, "in")), "a zoom notch scales with the camera's distance");
expect(isPick({ x: 10, y: 10 }, { x: 12, y: 11 }, false), "a still finger is a tap");
expect(!isPick({ x: 10, y: 10 }, { x: 20, y: 10 }, false), "a finger that moved is a drag");
expect(!isPick({ x: 10, y: 10 }, { x: 10, y: 10 }, true), "a pinch is not a tap");
expect(!isPick(null, { x: 10, y: 10 }, false), "a release without a press is not a tap");
expect(isDoubleTap({ t: 0, x: 40, y: 40 }, { t: 200, x: 48, y: 44 }), "a second tap in the same place looks ahead");
expect(!isDoubleTap(null, { t: 200, x: 40, y: 40 }), "the first tap does not look ahead");
expect(!isDoubleTap({ t: 0, x: 40, y: 40 }, { t: 400, x: 40, y: 40 }), "a late second tap does not look ahead");
expect(!isDoubleTap({ t: 0, x: 40, y: 40 }, { t: 100, x: 80, y: 40 }), "a second tap elsewhere does not look ahead");

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("every body has both orbits, the camera pace holds, and the corner steps back one view");

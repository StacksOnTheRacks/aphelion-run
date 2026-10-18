import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import {
	JOURNEY_STOPS,
	PLACES,
	PLANETS,
	SCAN_LIMIT,
	SUN_TRAVEL_SECONDS,
	TRAVEL_SECONDS,
	blocked,
	bodyTarget,
	bodyTargets,
	choosePick,
	scanTargets,
	stopView,
	travelSeconds,
	viewTrail,
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

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("every body has both orbits, the camera pace holds, and every pick opens an outer orbit");

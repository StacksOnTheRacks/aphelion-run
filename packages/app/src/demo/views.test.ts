import {
	PLACES,
	PLANETS,
	SUN_TRAVEL_SECONDS,
	TRAVEL_SECONDS,
	bodyTargets,
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

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("every body has both orbits, the camera pace holds, and every pick opens an outer orbit");

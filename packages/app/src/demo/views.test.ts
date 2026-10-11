import {
	PLACES,
	REST_MS,
	SUN_TRAVEL_SECONDS,
	TRAVEL_SECONDS,
	tourStepDelay,
	travelSeconds,
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

expect(REST_MS === 5000, "the tour rests 5 seconds after a move arrives");
expect(travelSeconds("sun-outer") === SUN_TRAVEL_SECONDS, "arriving at the Sun's outer orbit is the slower zoom");
expect(travelSeconds("sun-inner") === SUN_TRAVEL_SECONDS, "arriving at the Sun's inner orbit is the slower zoom");
expect(travelSeconds("mercury-outer") === TRAVEL_SECONDS, "a planet arrival keeps the normal pace");
expect(travelSeconds("system") === TRAVEL_SECONDS, "the pull back to the system keeps the normal pace");
expect(travelSeconds("sun-inner") > travelSeconds("jupiter-outer"), "a Sun arrival takes longer than a planet arrival");
expect(
	tourStepDelay("sun-inner") - travelSeconds("sun-inner") * 1000 === REST_MS,
	"the longer Sun move still rests 5 seconds after it arrives",
);
expect(
	tourStepDelay("mars-inner") - travelSeconds("mars-inner") * 1000 === REST_MS,
	"a planet move rests 5 seconds after it arrives",
);

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("every body has both orbits, and the tour timing holds");

import { COLLECTOR_CHARGE, STARTING_ENERGY, burnEnergy, cruiseCost, freshSession, siphonEnergy } from "./energy";
import { JOURNEY_MAX_SECONDS, JOURNEY_MIN_SECONDS } from "./journey";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

expect(cruiseCost(JOURNEY_MIN_SECONDS) === 64, "the shortest cruise costs 64");
expect(cruiseCost(JOURNEY_MAX_SECONDS) === 480, "the longest cruise costs 480");
expect(cruiseCost(21) === 84, "a 21 second cruise costs 84");

const quoted = cruiseCost(21);
let energy = STARTING_ENERGY;
for (let step = 0; step < 21; step++) {
	energy = burnEnergy(energy, STARTING_ENERGY, quoted, 1);
}
expect(energy === STARTING_ENERGY - quoted, "a cruise lands on the quoted remainder");
expect(burnEnergy(energy, STARTING_ENERGY, quoted, 5) === energy, "the burn does not pass the quoted remainder");

const partial = burnEnergy(STARTING_ENERGY, STARTING_ENERGY, quoted, 0.25);
expect(partial === STARTING_ENERGY - 1, "a quarter second of cruise spends one energy");

const filled = siphonEnergy(100, COLLECTOR_CHARGE, 10);
expect(filled.ship === 350 && filled.collector === COLLECTOR_CHARGE - 250, "ten seconds of siphon moves 250");
const drained = siphonEnergy(100, 10, 5);
expect(drained.ship === 110 && drained.collector === 0, "a siphon stops when the collector is empty");
const empty = siphonEnergy(100, 0, 5);
expect(empty.ship === 100 && empty.collector === 0, "an empty collector gives nothing");

const session = freshSession();
expect(session.energy === STARTING_ENERGY, "a new session starts with 1,000 energy");
expect(session.dockId === "earth-station-corporate-0", "a new session berths at Earth's corporate station");
expect(session.siphoning === false && Object.keys(session.collectors).length === 0, "a new session has full collectors and is not siphoning");

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("a cruise spends its quote, and a siphon stops when the collector is empty");

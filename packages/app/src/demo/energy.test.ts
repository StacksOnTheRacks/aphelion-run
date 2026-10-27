import { COLLECTOR_CHARGE, CARGO_CAPACITY, ENERGY_CAPACITY, MINE_FULL, STARTING_ENERGY, burnEnergy, cruiseCost, depositAtHome, drawFromDock, emptyCargo, freshSession, siphonEnergy } from "./energy";
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
expect(
	session.siphoning === false && session.siphonId === null && Object.keys(session.collectors).length === 0,
	"a new session has full collectors and is not siphoning"
);
expect(
	session.cargo.hydrogen === 0 &&
		session.cargo.ore === 0 &&
		session.cargo.nitrogen === 0 &&
		session.cargo.carbon === 0 &&
		session.base.hydrogen === 0 &&
		session.base.ore === 0 &&
		session.base.nitrogen === 0 &&
		session.base.carbon === 0,
	"a new session carries no mined cargo and the home stockpile is empty"
);

const capped = siphonEnergy(90, 100, 10, 25, 100);
expect(capped.ship === 100 && capped.collector === 90, "a siphon stops when the ship is full");

const fresh = { energy: STARTING_ENERGY, cargo: emptyCargo() };
let mining = { ...fresh, cargo: emptyCargo() };
let remaining = MINE_FULL;
let steps = 0;
while (steps < 200) {
	const drawn = drawFromDock(mining, { kind: "generator", resource: "ore", remaining }, 1);
	mining = { energy: drawn.energy, cargo: drawn.cargo };
	remaining = drawn.remaining;
	steps += 1;
	if (drawn.release) {
		break;
	}
}
expect(steps === 80 && mining.cargo.ore === CARGO_CAPACITY && remaining === MINE_FULL, "a full ore mine fills the hold in 80 seconds and then resets");
expect(mining.energy === STARTING_ENERGY, "mining ore does not change the energy tank");

const mined = drawFromDock(fresh, { kind: "generator", resource: "hydrogen", remaining: MINE_FULL }, 10);
expect(mined.release === false && mined.cargo.hydrogen === 250 && mined.remaining === MINE_FULL - 250, "ten seconds at a mine moves 250");
const nextVisit = drawFromDock(
	{ energy: STARTING_ENERGY, cargo: mined.cargo },
	{ kind: "generator", resource: "hydrogen", remaining: MINE_FULL },
	10
);
expect(nextVisit.cargo.hydrogen === 500 && nextVisit.remaining === MINE_FULL - 250, "the next visit starts from a full mine and keeps cargo already aboard");

const sun = { energy: STARTING_ENERGY, cargo: emptyCargo() };
let tank = sun.energy;
let collector = COLLECTOR_CHARGE;
let sunSteps = 0;
let sunRelease = false;
while (sunSteps < 200) {
	const drawn = drawFromDock({ energy: tank, cargo: sun.cargo }, { kind: "collector", remaining: collector }, 1);
	tank = drawn.energy;
	collector = drawn.remaining;
	sunSteps += 1;
	sunRelease = drawn.release;
	if (drawn.release) {
		break;
	}
}
expect(
	sunRelease && sunSteps === 80 && tank === ENERGY_CAPACITY && collector === MINE_FULL,
	"a full collector tops the energy tank off from the starting load and then resets"
);

const alreadyFull = drawFromDock({ energy: ENERGY_CAPACITY, cargo: emptyCargo() }, { kind: "collector", remaining: MINE_FULL }, 5);
expect(alreadyFull.release && alreadyFull.energy === ENERGY_CAPACITY && alreadyFull.remaining === MINE_FULL, "a full tank leaves the collector at once and the collector refills");

const parked = depositAtHome(mining.cargo, emptyCargo());
expect(parked.cargo.ore === 0 && parked.base.ore === CARGO_CAPACITY, "docking at home moves ore into the stockpile and clears the hold");
expect(parked.cargo.hydrogen === 0 && parked.base.hydrogen === 0, "only the cargo aboard is deposited");
const again = depositAtHome(emptyCargo(), parked.base);
expect(again.base.ore === CARGO_CAPACITY, "an empty hold does not change the stockpile");

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("a cruise spends its quote, a siphon stops when the source is empty or the ship is full, and home keeps the ore");

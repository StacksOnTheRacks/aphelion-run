import { cruiseCost } from "./energy";
import { COAST_ABOVE_ORBIT, CRUISE_ACCEL, coastLimits, planCruise, type CruiseCorner } from "./cruise";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

const orbit = 3;
const shipMax = 14;
const straight: CruiseCorner[] = [];

{
	const slow = planCruise(2000, straight, orbit + COAST_ABOVE_ORBIT, orbit, shipMax);
	const fast = planCruise(2000, straight, shipMax, orbit, shipMax);
	expect(fast.speed > slow.speed, "the fast coast is the quicker one");
	expect(fast.cost > slow.cost, "a faster coast costs more");
	expect(fast.spans.length === 2 && slow.spans.length === 2, "a straight course burns to speed up and to slow down");
	expect(slow.thrusting(0.01) && !slow.thrusting(slow.seconds / 2), "the engine is thrusting at the start and not in the middle");
	expect(fast.thrusting(fast.seconds - 0.01), "the engine is lit again to arrive");
}

{
	const short = planCruise(400, straight, 8, orbit, shipMax);
	const long = planCruise(2000, straight, 8, orbit, shipMax);
	expect(short.speed === long.speed, "the same setting holds on a longer course");
	expect(short.cost === long.cost, "a longer coast does not add energy");
	expect(long.coastSeconds > short.coastSeconds, "the extra distance is flown without thrust");
	expect(short.cost === cruiseCost(short.thrustSeconds), "the quote is the burn rate times the thrust");
}

{
	const corner: CruiseCorner = { at: 500, turn: Math.PI / 2, assist: false };
	const assisted: CruiseCorner = { at: 500, turn: Math.PI / 2, assist: true };
	const powered = planCruise(1000, [corner], 10, orbit, shipMax);
	const free = planCruise(1000, [assisted], 10, orbit, shipMax);
	expect(powered.cost > free.cost, "an assist costs less than the same turn under thrust");
	expect(powered.spans.length === 3 && free.spans.length === 2, "a powered turn is its own burn");
}

{
	const limits = coastLimits(10, straight, orbit, shipMax);
	expect(limits.max < shipMax, "a short path cannot be flown at the ship maximum");
	expect(limits.min <= limits.max, "the slider still has a low end");
	expect(limits.min < orbit + COAST_ABOVE_ORBIT + 1e-6, "the floor does not sit above a speed the path can reach");
	const flown = planCruise(10, straight, shipMax, orbit, shipMax);
	expect(flown.speed === limits.max, "asking for the maximum flies the fastest coast that fits");
	expect(Math.abs(flown.distanceAt(flown.seconds) - 10) < 1e-3, "the cruise still covers the short path");
}

{
	const flown = planCruise(800, straight, shipMax, orbit, shipMax);
	expect(Math.abs(flown.distanceAt(flown.seconds) - 800) < 1e-3, "a burn covers its length in the planned time");
	expect(Math.abs(flown.distanceAt(0)) < 1e-6, "the cruise starts at the beginning");
	const depart = flown.spans[0];
	const distance = Math.abs(depart.endSpeed * depart.endSpeed - depart.startSpeed * depart.startSpeed) / (2 * CRUISE_ACCEL);
	expect(Math.abs(depart.to - depart.from - distance) < 1e-3, "the opening burn is as long as the change in speed");
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

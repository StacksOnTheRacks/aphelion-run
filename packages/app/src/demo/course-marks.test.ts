import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { LANE_GAP, LANE_MIN_REACH, LANE_NEAR_ALPHA, LANE_SECONDS, PULSE_PERIOD, courseLane, laneAlpha, laneReach } from "./journey";
import { type Route } from "./route";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

function route(points: Vector3[]): Route {
	const cumulative = [0];
	for (let i = 1; i < points.length; i++) {
		cumulative.push(cumulative[i - 1] + Vector3.Distance(points[i - 1], points[i]));
	}
	return {
		points,
		kinds: points.slice(1).map(() => "burn"),
		cumulative,
		total: cumulative[cumulative.length - 1],
		assists: [],
		startTurn: 0,
		endTurn: 0,
	};
}

const straight = route([new Vector3(0, 0, 0), new Vector3(5000, 0, 0)]);
const slow = 20;
const fast = 168;

expect(laneAlpha(0, 100) === LANE_NEAR_ALPHA, "the lane is nearly solid at the ship");
expect(laneAlpha(100, 100) === 0, "the lane has faded out at its reach");
expect(laneAlpha(50, 100) > laneAlpha(80, 100), "the lane dims with distance");
expect(laneReach(slow) === LANE_MIN_REACH, "a slow coast still shows the shortest lane");
expect(laneReach(fast) === fast * LANE_SECONDS, "a fast coast shows the same seconds of course");

{
	const distance = 40;
	const lane = courseLane(straight, distance, fast, 0.13)!;
	expect(lane != null, "a long course has a lane");
	expect(Math.abs(lane.from - (distance + LANE_GAP)) < 1e-6, "the lane starts a gap ahead of the ship");
	expect(Math.abs(lane.to - (distance + laneReach(fast))) < 1e-6, "the lane runs out to its reach");
	expect(lane.pulses.length > 2, "pulses run down the lane");
	let previous = Infinity;
	for (const pulse of lane.pulses) {
		expect(pulse.along >= lane.from - 1e-6 && pulse.along < lane.to, "a pulse sits on the lane");
		expect(pulse.along < previous, "pulses are listed far first, so a near one draws over the one beyond");
		previous = pulse.along;
	}
}

// A pulse comes toward the ship at the same rate in seconds, whatever the coast.
for (const speed of [slow, fast]) {
	const reach = laneReach(speed);
	const before = courseLane(straight, 0, speed, 1)!;
	const after = courseLane(straight, 0, speed, 1 + PULSE_PERIOD * 0.25)!;
	const near = (lane: NonNullable<ReturnType<typeof courseLane>>) => Math.min(...lane.pulses.map((pulse) => pulse.along));
	const moved = near(after) - near(before);
	const expected = -((reach - LANE_GAP) / LANE_SECONDS) * PULSE_PERIOD * 0.25;
	expect(moved < 0, `a pulse comes toward the ship at ${speed}`);
	expect(Math.abs(moved - expected) < 1e-6, `a pulse crosses the lane in ${LANE_SECONDS}s at ${speed}`);
}

{
	const lane = courseLane(straight, straight.total - LANE_GAP * 0.5, fast, 0);
	expect(lane === null, "with less than a gap of course left, nothing is drawn ahead");
}

{
	const lane = courseLane(straight, straight.total - 200, fast, 0)!;
	expect(Math.abs(lane.to - straight.total) < 1e-6, "near the end the lane stops at the destination");
}

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("the course lane runs a fixed number of seconds ahead, fades with distance, and its pulses sweep at the same pace at any speed");

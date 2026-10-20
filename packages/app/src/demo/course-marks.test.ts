import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { MARK_GAP, MARK_LENGTH, MARK_NEAR_ALPHA, MARK_REACH, MARK_SPACING, courseMarks, markAlpha } from "./journey";
import { headingAt, pointAt, type Route } from "./route";

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

/** How far `point` is along `course`, for the two fixtures below. */
function alongOf(course: Route, point: Vector3): number {
	let best = 0;
	let bestDistance = Infinity;
	for (let i = 0; i < course.kinds.length; i++) {
		const from = course.points[i];
		const to = course.points[i + 1];
		const span = course.cumulative[i + 1] - course.cumulative[i];
		const share = span < 1e-9 ? 0 : Math.min(1, Math.max(0, Vector3.Dot(point.subtract(from), to.subtract(from)) / (span * span)));
		const nearest = Vector3.Lerp(from, to, share);
		const gap = Vector3.Distance(point, nearest);
		if (gap < bestDistance) {
			bestDistance = gap;
			best = course.cumulative[i] + share * span;
		}
	}
	return best;
}

const straight = route([new Vector3(0, 0, 0), new Vector3(200, 0, 0)]);
const bend = route([new Vector3(0, 0, 0), new Vector3(50, 0, 0), new Vector3(50, 0, 120)]);

expect(markAlpha(0) === MARK_NEAR_ALPHA, "a mark at the ship would be nearly solid");
expect(markAlpha(MARK_REACH) === 0, "a mark at the reach has faded out");
expect(markAlpha(MARK_REACH + 1) === 0, "past the reach the course leaves no mark");

{
	const distance = 4;
	const marks = courseMarks(straight, distance);
	expect(marks.length > 1, "a long straight course carries a run of chevrons");
	let previous = Infinity;
	for (const mark of marks) {
		const along = alongOf(straight, mark.point);
		const ahead = along - distance;
		expect(Vector3.Distance(mark.point, pointAt(straight, along)) < 1e-4, "a chevron sits on the course");
		expect(ahead >= MARK_GAP - 1e-4, "a chevron starts ahead of the ship");
		expect(ahead < MARK_REACH, "a chevron stops short of the reach");
		expect(Math.abs(mark.point.y) < 1e-6 && Math.abs(mark.point.z) < 1e-6, "a straight course keeps its chevrons on the line");
		expect(Vector3.Dot(mark.heading, new Vector3(1, 0, 0)) > 0.999, "on a straight course a chevron points along it");
		expect(Math.abs(mark.alpha - markAlpha(ahead)) < 1e-6, "a chevron fades with how far ahead it is");
		expect(mark.alpha < previous, "farther chevrons are dimmer");
		previous = mark.alpha;
	}
	const first = alongOf(straight, marks[0].point);
	expect(first < distance + MARK_GAP + MARK_SPACING, "the first chevron is the next one ahead, not a gap later");
	expect(marks[marks.length - 1].alpha < MARK_NEAR_ALPHA * (MARK_SPACING / MARK_REACH + 0.05), "the last chevron is nearly gone");
}

{
	const distance = 20;
	const marks = courseMarks(straight, distance);
	expect(marks.length > 0, "chevrons remain on a long burn");
	for (const mark of marks) {
		expect(mark.from >= distance + MARK_GAP - 1e-4, "nothing inside the gap is drawn");
		expect(mark.tip > mark.from, "each chevron still has a point ahead of where it is drawn");
		expect(mark.opening >= distance || mark.tip > distance + MARK_GAP, "a mark under the ship stays only while its point is still ahead");
	}
}

{
	const marks = courseMarks(straight, straight.total - MARK_GAP * 0.5);
	expect(marks.length === 0, "with less than a gap of course left, nothing is drawn ahead");
}

{
	const distance = 30;
	const marks = courseMarks(bend, distance);
	expect(marks.length > 0, "a bend still has chevrons on the leg ahead");
	let sawTurn = false;
	for (const mark of marks) {
		const along = alongOf(bend, mark.point);
		expect(Vector3.Distance(mark.point, pointAt(bend, along)) < 1e-4, "a chevron on a bend stays on the course");
		expect(Vector3.Dot(mark.heading, headingAt(bend, along)) > 0.999, "a chevron points along the heading at its point");
		expect(along >= distance + MARK_GAP - 1e-4, "chevrons on a bend stay ahead of the ship");
		if (along > 80) {
			sawTurn = true;
			expect(mark.heading.z > 0.9 && mark.heading.x < 0.1, "past the corner a chevron points down the new leg");
		}
	}
	expect(sawTurn, "the reach after the corner includes the new leg");
}

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("course chevrons sit ahead on the route, point along it, and fade out with distance");

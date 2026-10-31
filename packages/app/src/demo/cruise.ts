/**
 * A coasting cruise. The engine burns to change velocity and is not thrusting while the speed holds.
 * The climb hands the ship off already moving; the floor of the slider sits just above that.
 * A faster coast costs more because the burns that reach it and leave it are larger.
 */

import { SPEED_SCALE, SYSTEM_SCALE } from "./bases";
import { cruiseCost } from "./energy";

/** World units per second squared. Grows with the system and the drive, so the burn up to pace takes the same time. */
export const CRUISE_ACCEL = 2.5 * SYSTEM_SCALE * SPEED_SCALE;
/** How far above the handoff speed the slowest offered coast sits. */
export const COAST_ABOVE_ORBIT = 1;
/** A heading change smaller than this is still a straight line. */
const TURN_DEAD = (2 * Math.PI) / 180;

/** A corner on the cruise. An assist bends for free. */
export type CruiseCorner = {
	/** Distance along the cruise. */
	at: number;
	/** Absolute heading change, in radians. */
	turn: number;
	/** Gravity makes this turn. */
	assist: boolean;
};

/** One stretch where the main engine is lit, measured along the cruise. */
export type ThrustSpan = {
	from: number;
	to: number;
	startSpeed: number;
	endSpeed: number;
};

/** The burns, the coast, and the clock for one chosen speed. */
export type CruiseProfile = {
	speed: number;
	minSpeed: number;
	maxSpeed: number;
	/** Seconds the main engine is lit. */
	thrustSeconds: number;
	/** Seconds the main engine is dark while the cruise is underway. */
	coastSeconds: number;
	/** Seconds from the start of the cruise to its end. */
	seconds: number;
	/** Whole energy the burns spend. */
	cost: number;
	spans: ThrustSpan[];
	/** Cruise-relative intervals where the main engine is lit. */
	thrust: { start: number; end: number }[];
	distanceAt: (t: number) => number;
	thrusting: (t: number) => boolean;
	/** Main-engine strength, 1 while a burn is underway and 0 on the coast. */
	burn: (t: number) => number;
};

/** Slowest and fastest coast whose burns fit on a cruise of `length`. */
export function coastLimits(
	length: number,
	corners: CruiseCorner[],
	orbitSpeed: number,
	shipMax: number
): { min: number; max: number } {
	const cap = Math.max(orbitSpeed, shipMax);
	let max = cap;
	if (!fits(length, corners, cap, orbitSpeed)) {
		let lo = orbitSpeed;
		let hi = cap;
		for (let step = 0; step < 28; step++) {
			const mid = (lo + hi) / 2;
			if (fits(length, corners, mid, orbitSpeed)) {
				lo = mid;
			} else {
				hi = mid;
			}
		}
		max = fits(length, corners, lo, orbitSpeed) ? lo : orbitSpeed;
	}
	const min = Math.min(max, orbitSpeed + COAST_ABOVE_ORBIT);
	return { min, max };
}

/**
 * The cruise flown at `wanted`. The speed is held inside the range that fits on `length`.
 * Passing a speed at or below the handoff selects the slow end.
 */
export function planCruise(
	length: number,
	corners: CruiseCorner[],
	wanted: number,
	orbitSpeed: number,
	shipMax: number
): CruiseProfile {
	const limits = coastLimits(length, corners, orbitSpeed, shipMax);
	const speed = Math.min(limits.max, Math.max(limits.min, wanted));
	const laid = layoutSpans(length, corners, speed, orbitSpeed) ?? layoutSpans(length, [], speed, orbitSpeed);
	const spans = laid ?? [];
	const depart = burnDistance(orbitSpeed, speed);
	const arrive = burnDistance(speed, orbitSpeed);
	const mid = Math.max(0, length - depart - arrive);
	const tDepart = burnTime(orbitSpeed, speed);
	const tArrive = burnTime(speed, orbitSpeed);
	const tMid = speed > 1e-6 ? mid / speed : 0;
	const seconds = tDepart + tMid + tArrive;
	const thrustSeconds = spans.reduce((sum, span) => sum + burnTime(span.startSpeed, span.endSpeed) + turnTime(span), 0);
	const coastSeconds = Math.max(0, seconds - thrustSeconds);
	const thrust = spans.map((span) => ({ start: timeAtDistance(span.from), end: timeAtDistance(span.to) }));

	function timeAtDistance(distance: number): number {
		if (distance <= 1e-8) {
			return 0;
		}
		if (distance >= length - 1e-8) {
			return seconds;
		}
		if (distance <= depart + 1e-8) {
			return timeUnderAccel(orbitSpeed, CRUISE_ACCEL, distance);
		}
		if (distance <= depart + mid + 1e-8) {
			return tDepart + (distance - depart) / Math.max(speed, 1e-6);
		}
		const into = distance - depart - mid;
		return tDepart + tMid + timeUnderAccel(speed, -CRUISE_ACCEL, into);
	}

	function distanceAt(t: number): number {
		if (t <= 0 || length <= 1e-8) {
			return 0;
		}
		if (t >= seconds) {
			return length;
		}
		if (t <= tDepart) {
			return orbitSpeed * t + 0.5 * CRUISE_ACCEL * t * t;
		}
		if (t <= tDepart + tMid) {
			return depart + speed * (t - tDepart);
		}
		const u = t - tDepart - tMid;
		return depart + mid + speed * u - 0.5 * CRUISE_ACCEL * u * u;
	}

	function thrusting(t: number): boolean {
		return thrust.some((span) => t >= span.start - 1e-6 && t <= span.end + 1e-6);
	}

	return {
		speed,
		minSpeed: limits.min,
		maxSpeed: limits.max,
		thrustSeconds,
		coastSeconds,
		seconds,
		cost: cruiseCost(thrustSeconds),
		spans,
		thrust,
		distanceAt,
		thrusting,
		burn: (t) => (thrusting(t) ? 1 : 0),
	};
}

/** A speed-change burn has different end speeds. A turn burn does not, and its time is the span at `speed`. */
function turnTime(span: ThrustSpan): number {
	if (Math.abs(span.endSpeed - span.startSpeed) > 1e-6) {
		return 0;
	}
	const distance = Math.max(0, span.to - span.from);
	return span.startSpeed > 1e-6 ? distance / span.startSpeed : 0;
}

function fits(length: number, corners: CruiseCorner[], speed: number, orbitSpeed: number): boolean {
	if (speed < orbitSpeed - 1e-6) {
		return false;
	}
	if (length <= 1e-6) {
		return speed <= orbitSpeed + 1e-6;
	}
	return layoutSpans(length, corners, speed, orbitSpeed) !== null;
}

/**
 * Departure burn, arrival burn, and a burn for each powered corner. Null when those stretches
 * overlap or run off the cruise. Assist corners are left out.
 */
function layoutSpans(
	length: number,
	corners: CruiseCorner[],
	speed: number,
	orbitSpeed: number
): ThrustSpan[] | null {
	const depart = burnDistance(orbitSpeed, speed);
	const arrive = burnDistance(speed, orbitSpeed);
	if (depart + arrive > length + 1e-4) {
		return null;
	}
	const open = depart;
	const close = length - arrive;
	const turns: { from: number; to: number }[] = [];
	const powered = corners
		.filter((corner) => !corner.assist && corner.turn > TURN_DEAD && corner.at > 1e-3 && corner.at < length - 1e-3)
		.sort((a, b) => a.at - b.at);
	for (const corner of powered) {
		const distance = turnDistance(speed, corner.turn);
		if (distance <= 1e-6) {
			continue;
		}
		let from = corner.at - distance / 2;
		let to = corner.at + distance / 2;
		if (from < open) {
			to += open - from;
			from = open;
		}
		if (to > close) {
			from -= to - close;
			to = close;
		}
		if (from < open - 1e-4 || to - from < distance - 1e-3) {
			return null;
		}
		const previous = turns[turns.length - 1];
		if (previous && from < previous.to - 1e-4) {
			return null;
		}
		turns.push({ from, to });
	}
	const spans: ThrustSpan[] = [];
	if (depart > 1e-4) {
		spans.push({ from: 0, to: depart, startSpeed: orbitSpeed, endSpeed: speed });
	}
	for (const turn of turns) {
		spans.push({ from: turn.from, to: turn.to, startSpeed: speed, endSpeed: speed });
	}
	if (arrive > 1e-4) {
		spans.push({ from: length - arrive, to: length, startSpeed: speed, endSpeed: orbitSpeed });
	}
	return spans;
}

function burnDistance(from: number, to: number): number {
	return Math.abs(to * to - from * from) / (2 * CRUISE_ACCEL);
}

function burnTime(from: number, to: number): number {
	return Math.abs(to - from) / CRUISE_ACCEL;
}

function turnDistance(speed: number, turn: number): number {
	const delta = 2 * speed * Math.sin(turn / 2);
	return speed * (delta / CRUISE_ACCEL);
}

/** Seconds to cover `distance` starting at `speed` with constant `accel`. `accel` may be negative. */
function timeUnderAccel(speed: number, accel: number, distance: number): number {
	if (distance <= 1e-8) {
		return 0;
	}
	const disc = speed * speed + 2 * accel * distance;
	if (disc < 0 || Math.abs(accel) < 1e-8) {
		return speed > 1e-6 ? distance / speed : 0;
	}
	const root = Math.sqrt(disc);
	const t = accel > 0 ? (-speed + root) / accel : (-speed + root) / accel;
	return Math.max(0, t);
}

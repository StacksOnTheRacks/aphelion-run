import { LOCAL_REACH } from "./bases";
import { JOURNEY_STOPS } from "./environment";

export { LOCAL_REACH };

/** A place in the planets' plane, in world units. The Sun is the origin. */
export type NavPoint = { x: number; z: number };

export type NavBody = NavPoint & {
	id: string;
	radius: number;
	/** Outer-orbit radius: where a ship counts as being at this body. */
	outer: number;
	/** The planet a moon circles. Null for the Sun and the planets. */
	parent: string | null;
};

/** The ship's place in the system, as the dashboard draws it. */
export type NavFix = {
	/** `hx` and `hz` are the heading, a unit vector in the plane. */
	ship: NavPoint & { hx: number; hz: number };
	/** The Sun, the planets, and their moons. */
	bodies: NavBody[];
	/** Radius of the outermost planet's orbit: the edge of the system map. */
	edge: number;
	/** The line being flown and how far along it the ship is, while it is burning. */
	course: { points: NavPoint[]; progress: number } | null;
};

/** Beyond the outermost orbit the map stops growing, and the ship sits on its rim. */
const SYSTEM_OVERRUN = 1.08;

/**
 * Where a point lands on a round system map of `radius`, with the Sun in the middle and +Z up. Distance
 * is squeezed by its square root, so the inner planets clear the Sun and Neptune still fits.
 */
export function systemPoint(point: NavPoint, edge: number, radius: number): { x: number; y: number } {
	const distance = Math.hypot(point.x, point.z);
	if (distance < 1e-9 || edge <= 0) {
		return { x: 0, y: 0 };
	}
	const scale = (radius * Math.sqrt(Math.min(distance, edge * SYSTEM_OVERRUN) / edge)) / distance;
	return { x: point.x * scale, y: -point.z * scale };
}

/** Where a point lands on a round map of `radius` around `body`, with its reach on the rim. */
export function localPoint(point: NavPoint, body: NavBody, radius: number): { x: number; y: number } {
	const scale = radius / (body.outer * LOCAL_REACH);
	return { x: (point.x - body.x) * scale, y: -(point.z - body.z) * scale };
}

/** The Sun or planet the ship is at, measured against each one's outer orbit. Null out in the open. */
export function localBody(fix: NavFix): NavBody | null {
	let best: NavBody | null = null;
	let bestShare = LOCAL_REACH;
	for (const body of fix.bodies) {
		if (body.parent !== null || body.outer <= 0) {
			continue;
		}
		const share = Math.hypot(fix.ship.x - body.x, fix.ship.z - body.z) / body.outer;
		if (share <= bestShare) {
			best = body;
			bestShare = share;
		}
	}
	return best;
}

/** Compass bearing of the heading in whole degrees: 0 is +Z, up the map, and 90 is +X. */
export function bearing(fix: NavFix): number {
	const degrees = Math.round((Math.atan2(fix.ship.hx, fix.ship.hz) * 180) / Math.PI);
	return ((degrees % 360) + 360) % 360;
}

export function bodyLabel(id: string): string {
	return JOURNEY_STOPS.find((stop) => stop.id === id)?.label ?? id;
}

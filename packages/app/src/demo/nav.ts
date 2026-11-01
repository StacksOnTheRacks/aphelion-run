import { LOCAL_REACH } from "./bases";
import { JOURNEY_STOPS, PLANETS } from "./environment";
import { PLANET_YIELDS, type Mineral } from "./generators";

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
	/**
	 * The line being flown, how far along the clock the ship is, where it is headed, the seconds
	 * left on that clock, and the energy spent so far, sampled across the trip. `spending` is true
	 * on a frame where the tank fell. Null once the ship is down.
	 */
	course: {
		points: NavPoint[];
		progress: number;
		name: string;
		remaining: number;
		total: number;
		spent: readonly number[];
		spending: boolean;
	} | null;
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

const MINERAL_NAME: Record<Mineral, string> = {
	hydrogen: "Hydrogen",
	ore: "Ore",
	nitrogen: "Nitrogen",
	carbon: "Carbon",
};

/** A mine the ship can cruise to. The id matches the dock in the system. */
export type ChartMine = {
	id: string;
	host: string;
	resource: Mineral;
	label: string;
};

export type MineChartMoon = {
	id: string;
	label: string;
	mines: ChartMine[];
};

/** A planet that has mines of its own, or moons that do, with its distance from the ship. */
export type MineChartPlanet = {
	id: string;
	label: string;
	distance: number;
	mines: ChartMine[];
	moons: MineChartMoon[];
};

/** One line of the planning list. A planet or moon can be opened to show what is grouped under it. */
export type MineRow = {
	kind: "planet" | "moon" | "mine";
	id: string;
	label: string;
	depth: number;
	open: boolean;
};

function mineFor(host: string, resource: Mineral): ChartMine {
	return {
		id: `${host}-generator-${resource}`,
		host,
		resource,
		label: `${MINERAL_NAME[resource]} mine`,
	};
}

/** Every mine, in planet order. Earth's Moon is absent: that body yields nothing. */
function allMines(): ChartMine[] {
	const mines: ChartMine[] = [];
	for (const spec of PLANETS) {
		const yields = PLANET_YIELDS[spec.name] ?? [];
		for (const resource of yields) {
			mines.push(mineFor(spec.name, resource));
		}
		for (const moon of spec.moons) {
			for (const resource of yields) {
				mines.push(mineFor(moon.name, resource));
			}
		}
	}
	return mines;
}

const MINE_CATALOG = allMines();

export function findMine(id: string): ChartMine | null {
	return MINE_CATALOG.find((mine) => mine.id === id) ?? null;
}

/**
 * Planets that have a mine, nearest the ship first. Moons that have mines sit under their planet.
 * A planet with nothing to mine, such as Earth, is left out. Distance uses the body's place on the
 * fix, or its orbit along +X when the fix has not placed it yet.
 */
export function nearbyMineChart(fix: NavFix): MineChartPlanet[] {
	const groups: MineChartPlanet[] = [];
	for (const spec of PLANETS) {
		const yields = PLANET_YIELDS[spec.name] ?? [];
		const mines = yields.map((resource) => mineFor(spec.name, resource));
		const moons: MineChartMoon[] = [];
		for (const moon of spec.moons) {
			const moonMines = yields.map((resource) => mineFor(moon.name, resource));
			if (moonMines.length > 0) {
				moons.push({ id: moon.name, label: bodyLabel(moon.name), mines: moonMines });
			}
		}
		if (mines.length === 0 && moons.length === 0) {
			continue;
		}
		const body = fix.bodies.find((candidate) => candidate.id === spec.name);
		const at = body ?? { x: spec.orbit, z: 0 };
		groups.push({
			id: spec.name,
			label: bodyLabel(spec.name),
			distance: Math.hypot(fix.ship.x - at.x, fix.ship.z - at.z),
			mines,
			moons,
		});
	}
	groups.sort((left, right) => left.distance - right.distance || left.label.localeCompare(right.label));
	return groups;
}

/** The list as it reads. A null open set unfolds the nearest planet and leaves every moon closed. */
export function mineRows(chart: readonly MineChartPlanet[], open: readonly string[] | null): MineRow[] {
	const opened = new Set(open ?? (chart[0] ? [chart[0].id] : []));
	const rows: MineRow[] = [];
	for (const planet of chart) {
		const planetOpen = opened.has(planet.id);
		rows.push({ kind: "planet", id: planet.id, label: planet.label, depth: 0, open: planetOpen });
		if (!planetOpen) {
			continue;
		}
		for (const mine of planet.mines) {
			rows.push({ kind: "mine", id: mine.id, label: mine.label, depth: 1, open: false });
		}
		for (const moon of planet.moons) {
			const moonOpen = opened.has(moon.id);
			rows.push({ kind: "moon", id: moon.id, label: moon.label, depth: 1, open: moonOpen });
			if (!moonOpen) {
				continue;
			}
			for (const mine of moon.mines) {
				rows.push({ kind: "mine", id: mine.id, label: mine.label, depth: 2, open: false });
			}
		}
	}
	return rows;
}

/** Opens or closes a planet or moon. The first change keeps the nearest planet open unless that was the row. */
export function toggleMineOpen(chart: readonly MineChartPlanet[], open: readonly string[] | null, id: string): string[] {
	const current = new Set(open ?? (chart[0] ? [chart[0].id] : []));
	if (current.has(id)) {
		current.delete(id);
	} else {
		current.add(id);
	}
	return [...current];
}

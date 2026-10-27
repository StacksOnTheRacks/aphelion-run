/**
 * Energy and mined cargo. These figures belong to the demo. The brief still sets no amounts.
 * A photon cruise spends the burn rate for each second it runs. Docking at a collector or a mine
 * draws from it until the source is empty or the ship is full for that resource. Leaving the dock
 * fills the source again. A collector's draw lands in the energy tank. A mine's draw lands in cargo.
 */

import type { Mineral } from "./generators";

/** Energy aboard a new ship. */
export const STARTING_ENERGY = 1000;
/** Energy spent per second of the photon cruise. The impulse legs spend nothing. */
export const BURN_RATE = 4;
/** Energy or mineral moved per second from a docked source into the ship. */
export const SIPHON_RATE = 25;
/** Energy a collector holds, and the load a mine holds, until a ship draws it down. */
export const COLLECTOR_CHARGE = 2000;
/** A mine's full load. The same figure as a collector, since the yields name the mineral and not an amount. */
export const MINE_FULL = COLLECTOR_CHARGE;
/** How much of one mineral the hold can carry. One full mine fills an empty container. */
export const CARGO_CAPACITY = MINE_FULL;
/**
 * How much energy the tank can hold. The starting tank plus one full collector, so the first
 * visit to a collector fills it and the ship leaves.
 */
export const ENERGY_CAPACITY = STARTING_ENERGY + MINE_FULL;
/** The corporate station on Earth's inner ring. A new game berths here. */
export const STARTING_DOCK_ID = "earth-station-corporate-0";

/** Minerals a mine can yield, in the order the hold lists them. */
export const MINERALS: readonly Mineral[] = ["hydrogen", "ore", "nitrogen", "carbon"];

/** Units of each mineral. */
export type Cargo = Record<Mineral, number>;

/** What survives leaving Sol and coming back, until the page is reloaded. */
export type SolSession = {
	energy: number;
	dockId: string;
	/** Collectors and mines that are below a full load. A missing id is still full. */
	collectors: Record<string, number>;
	/** The source being drawn. Null when the ship is not drawing. */
	siphonId: string | null;
	siphoning: boolean;
	/** Mined minerals in the ship's hold. */
	cargo: Cargo;
	/** Mined minerals deposited at the home base. */
	base: Cargo;
};

/** An empty mineral ledger. */
export function emptyCargo(): Cargo {
	return { hydrogen: 0, ore: 0, nitrogen: 0, carbon: 0 };
}

/** A ledger with any missing mineral filled in as empty. */
export function cargoFrom(partial?: Partial<Cargo> | null): Cargo {
	const cargo = emptyCargo();
	if (!partial) {
		return cargo;
	}
	for (const mineral of MINERALS) {
		cargo[mineral] = partial[mineral] ?? 0;
	}
	return cargo;
}

export function freshSession(): SolSession {
	return {
		energy: STARTING_ENERGY,
		dockId: STARTING_DOCK_ID,
		collectors: {},
		siphonId: null,
		siphoning: false,
		cargo: emptyCargo(),
		base: emptyCargo(),
	};
}

/** Whole energy a cruise of `cruiseSeconds` costs at `rate` per second. */
export function cruiseCost(cruiseSeconds: number, rate = BURN_RATE): number {
	return Math.round(rate * cruiseSeconds);
}

/**
 * Energy left after another `seconds` of cruise. The burn stops at the quoted remainder,
 * `departEnergy - cost`, so the live spend and the quote meet.
 */
export function burnEnergy(
	energy: number,
	departEnergy: number,
	cost: number,
	seconds: number,
	rate = BURN_RATE
): number {
	return Math.max(departEnergy - cost, energy - rate * seconds);
}

/**
 * Moves a resource from a source into the ship for `seconds`. Stops when the source is empty
 * or the ship reaches `capacity`. With no capacity, the ship can take the whole source.
 */
export function siphonEnergy(
	ship: number,
	collector: number,
	seconds: number,
	rate = SIPHON_RATE,
	capacity = Number.POSITIVE_INFINITY
): { ship: number; collector: number } {
	const room = Math.max(0, capacity - ship);
	const moved = Math.min(Math.max(0, collector), Math.max(0, rate * seconds), room);
	return { ship: ship + moved, collector: collector - moved };
}

const SETTLED = 1e-3;

/** A dock the ship can draw from. A collector fills the energy tank. A generator fills one cargo container. */
export type DrawSource = {
	kind: "collector" | "generator";
	resource?: Mineral;
	remaining: number;
};

/**
 * One stretch of drawing while docked. `release` means the source is empty or the ship is full,
 * and `remaining` is full again so the next visit starts over.
 */
export function drawFromDock(
	hold: { energy: number; cargo: Cargo },
	source: DrawSource,
	seconds: number
): { energy: number; cargo: Cargo; remaining: number; release: boolean } {
	if (source.kind === "collector") {
		const next = siphonEnergy(hold.energy, source.remaining, seconds, SIPHON_RATE, ENERGY_CAPACITY);
		const release = next.collector <= SETTLED || next.ship >= ENERGY_CAPACITY - SETTLED;
		return {
			energy: next.ship,
			cargo: hold.cargo,
			remaining: release ? MINE_FULL : next.collector,
			release,
		};
	}
	const resource = source.resource;
	if (!resource) {
		return { energy: hold.energy, cargo: hold.cargo, remaining: MINE_FULL, release: true };
	}
	const next = siphonEnergy(hold.cargo[resource], source.remaining, seconds, SIPHON_RATE, CARGO_CAPACITY);
	const cargo: Cargo = { ...hold.cargo, [resource]: next.ship };
	const release = next.collector <= SETTLED || next.ship >= CARGO_CAPACITY - SETTLED;
	return {
		energy: hold.energy,
		cargo,
		remaining: release ? MINE_FULL : next.collector,
		release,
	};
}

/**
 * Moves mined cargo into the home stockpile and clears the hold. Energy stays aboard:
 * a collector already poured it into the tank, and the tank is what the ship flies on.
 */
export function depositAtHome(cargo: Cargo, base: Cargo): { cargo: Cargo; base: Cargo } {
	const next = emptyCargo();
	for (const mineral of MINERALS) {
		next[mineral] = base[mineral] + cargo[mineral];
	}
	return { cargo: emptyCargo(), base: next };
}

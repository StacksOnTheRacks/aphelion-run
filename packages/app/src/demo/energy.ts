/**
 * Energy aboard the ship. These figures belong to the demo. The brief still sets no amounts.
 * A photon cruise spends the burn rate for each second it runs. Any collector fills the ship
 * once the ship is docked at the Sun, until that collector is empty or the pilot stops.
 */

/** Energy aboard a new ship. */
export const STARTING_ENERGY = 1000;
/** Energy spent per second of the photon cruise. The impulse legs spend nothing. */
export const BURN_RATE = 4;
/** Energy moved per second from a collector into the ship. */
export const SIPHON_RATE = 25;
/** Energy a collector holds until a ship siphons it. */
export const COLLECTOR_CHARGE = 2000;
/** The corporate station on Earth's inner ring. A new game berths here. */
export const STARTING_DOCK_ID = "earth-station-corporate-0";

/** What survives leaving Sol and coming back, until the page is reloaded. */
export type SolSession = {
	energy: number;
	dockId: string;
	/** Collectors that are below a full charge. A missing id is still full. */
	collectors: Record<string, number>;
	/** The collector being siphoned. Null when the siphon is off. */
	siphonId: string | null;
	siphoning: boolean;
};

export function freshSession(): SolSession {
	return {
		energy: STARTING_ENERGY,
		dockId: STARTING_DOCK_ID,
		collectors: {},
		siphonId: null,
		siphoning: false,
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

/** Moves energy from a collector into the ship for `seconds`, and stops when the collector is empty. */
export function siphonEnergy(
	ship: number,
	collector: number,
	seconds: number,
	rate = SIPHON_RATE
): { ship: number; collector: number } {
	const moved = Math.min(Math.max(0, collector), Math.max(0, rate * seconds));
	return { ship: ship + moved, collector: collector - moved };
}

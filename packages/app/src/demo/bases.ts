/**
 * Where warehouse bases and Earth's energy stations sit. Layout only: no Babylon types, so the
 * clearance rules can be checked without starting the scene.
 *
 * A planet's warehouses ride a halo between the surface and the innermost moon. Mercury and Venus
 * have no moons, so the halo is a fixed multiple of the radius. Saturn's moons sit outside the
 * rings, so its halo uses the gap inside the ring instead. Earth uses the two rings already drawn
 * in the scene: warehouses on the outer ring, faction stations on the inner ring.
 */

export type Faction = "corporate" | "marauder";

export type BoxSize = { width: number; height: number; depth: number };

export type BaseSlot = {
	faction: Faction;
	/** Angle around the host, radians. */
	angle: number;
	/** Distance from the host's center. Width of the box points along this radius. */
	radius: number;
	size: BoxSize;
};

export type PlanetBaseInput = {
	diameter: number;
	moons: { orbit: number; diameter: number }[];
	/** Earth: warehouses sit on the drawn outer ring. */
	warehouseRadius?: number;
	/** Earth: one station per faction on the drawn inner ring. */
	stationRadius?: number;
	/** Saturn: warehouses stay inside this multiple of the planet radius, clear of the rings. */
	ringInnerScale?: number;
};

/** Warehouses per faction on a planet. Eight total, alternating around the halo. */
export const PLANET_BASES_PER_FACTION = 4;
/** One base per faction on a moon. */
export const MOON_BASES_PER_FACTION = 1;
/** Mercury and Venus: halo radius as a multiple of the planet radius. */
export const NO_MOON_HALO_SCALE = 1.8;
/** Saturn's rings, in planet radii. Matches the ring mesh. */
export const SATURN_RING_INNER_SCALE = 1.24;
export const SATURN_RING_OUTER_SCALE = 2.27;
/** Earth's drawn rings. Warehouses outside, stations inside. */
export const EARTH_WAREHOUSE_RADIUS = 16;
export const EARTH_STATION_RADIUS = 11;

/** Small against the planet, on the order of a solar collector. Width is the radial extent. */
export const WAREHOUSE_SIZE: BoxSize = { width: 0.18, height: 0.05, depth: 0.3 };
/** Larger than a warehouse, still small against Earth. */
export const STATION_SIZE: BoxSize = { width: 0.32, height: 0.09, depth: 0.52 };

/** Long side stays near a tenth of the moon, so a base reads as a craft beside it. */
const MOON_BASE_WIDTH = 0.07;

export function warehouseRadius(input: PlanetBaseInput): number {
	if (input.warehouseRadius != null) {
		return input.warehouseRadius;
	}
	const surface = input.diameter / 2;
	if (input.ringInnerScale != null) {
		return (surface + surface * input.ringInnerScale) / 2;
	}
	if (input.moons.length === 0) {
		return surface * NO_MOON_HALO_SCALE;
	}
	const innermost = Math.min(...input.moons.map((moon) => moon.orbit));
	return (surface + innermost) / 2;
}

export function moonBaseSize(diameter: number): BoxSize {
	const width = diameter * MOON_BASE_WIDTH;
	return { width, height: width * 0.3, depth: width * 1.6 };
}

/** Center of the base sits one box-width off the surface, so the inner face clears the moon. */
export function moonBaseRadius(diameter: number): number {
	return diameter / 2 + moonBaseSize(diameter).width;
}

export function radialReach(size: BoxSize): number {
	return size.width / 2;
}

export function planetBases(input: PlanetBaseInput): { warehouses: BaseSlot[]; stations: BaseSlot[] } {
	const radius = warehouseRadius(input);
	return {
		warehouses: ring(PLANET_BASES_PER_FACTION, radius, WAREHOUSE_SIZE),
		stations:
			input.stationRadius == null ? [] : ring(1, input.stationRadius, STATION_SIZE),
	};
}

export function moonBases(diameter: number): BaseSlot[] {
	return ring(MOON_BASES_PER_FACTION, moonBaseRadius(diameter), moonBaseSize(diameter));
}

function ring(perFaction: number, radius: number, size: BoxSize): BaseSlot[] {
	const count = perFaction * 2;
	const slots: BaseSlot[] = [];
	for (let i = 0; i < count; i++) {
		slots.push({
			faction: i % 2 === 0 ? "corporate" : "marauder",
			angle: (i / count) * Math.PI * 2,
			radius,
			size,
		});
	}
	return slots;
}

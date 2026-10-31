/**
 * Where warehouse bases, Earth's energy stations, and outer orbits sit. Layout only: no Babylon
 * types, so the clearance rules can be checked without starting the scene.
 *
 * A planet's warehouse halo is the ring mines sit outside: between the surface and the innermost
 * moon. Mercury and Venus have no moons, so the halo is a fixed multiple of the radius. Saturn's
 * moons sit outside the rings, so its halo uses the gap inside the ring instead. The demo places
 * no home on a planet. Earth holds the two faction stations. The ship's home is the corporate
 * station there. Earth's Moon keeps one corporate base, and it is not that home.
 *
 * The outer orbit is the battle surface and the circle ships burn between. The honeycomb sits on
 * it. It stays outside the bases and Saturn's rings, and inside the innermost moon's own outer
 * orbit, so two zones never meet. A moon's outer orbit is its own. The inner orbit sits just
 * inside that shell. A ship that has finished at a mine stays on the dock until it is moved.
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
	/** Earth: the drawn outer ring. Approach only; no homes sit on it. */
	warehouseRadius?: number;
	/** Earth: one station per faction on the drawn inner ring. */
	stationRadius?: number;
	/** Homes: warehouse, bay, bank, dock. Earth has none. */
	homes?: boolean;
	/** Saturn: warehouses stay inside this multiple of the planet radius, clear of the rings. */
	ringInnerScale?: number;
};

/** Warehouses per faction on a planet. Eight total, alternating around the halo. */
export const PLANET_BASES_PER_FACTION = 4;
/** One base per faction on a moon. */
export const MOON_BASES_PER_FACTION = 1;
/**
 * Bodies, moon orbits, and local shells, relative to ships, docks, and mines.
 * The hull stays a fixed length, so a craft reads small on a moon.
 */
export const BODY_SCALE = 4;
/**
 * Heliocentric orbits. Larger than the body scale so neighboring moon systems still miss when both
 * sit on the near side. Cruise pace includes this factor; `SPEED_SCALE` shortens the coast further.
 */
export const SYSTEM_SCALE = 6;
/**
 * Extra pace on top of the system scale. Coasts across the enlarged system were still long,
 * so the drive runs twice as fast. The 3s dock and 7s climb clocks do not use this.
 */
export const SPEED_SCALE = 2;
/** Mercury and Venus: halo radius as a multiple of the planet radius. */
export const NO_MOON_HALO_SCALE = 1.8;
/** Saturn's rings, in planet radii. Matches the ring mesh. */
export const SATURN_RING_INNER_SCALE = 1.24;
export const SATURN_RING_OUTER_SCALE = 2.27;
/** Clearance past Earth's station ring, so the Moon's homes sit outside the approach. */
export const EARTH_WAREHOUSE_RADIUS = 16 * BODY_SCALE;
export const EARTH_STATION_RADIUS = 11 * BODY_SCALE;
/** The Sun's outer orbit. Ships arrive here; the collectors sit further in. */
export const SUN_OUTER_ORBIT = 44 * BODY_SCALE;
/** A moon's outer orbit, in moon radii. Wide enough to clear its bases, narrow enough that neighbors stay apart. */
export const MOON_OUTER_ORBIT_SCALE = 3;
/** A ship this many outer-orbit radii from a body or closer is at that body. */
export const LOCAL_REACH = 1.6;
/** Mercury and Venus: outer orbit as a multiple of the planet radius. */
export const NO_MOON_OUTER_SCALE = 2.5;
/** A pass stays this far outside Saturn's rings. */
export const SATURN_FLYBY_MARGIN = 3 * BODY_SCALE;
/**
 * The inner orbit is this far inside the battle honeycomb, as a fraction of the outer radius.
 * On the shell the ship and the grid are the same surface.
 */
export const INNER_ORBIT_INSET = 0.04;

/**
 * Homes and stations. Width is the radial extent. The pad is a thin square a little longer than
 * the ship: the hull is 0.04 long and about 0.009 across.
 */
export const DOCK_SIZE: BoxSize = { width: 0.05, height: 0.008, depth: 0.05 };

/**
 * Mines and collectors. Width is across the orbit, depth is along it, toward the ship.
 * Half as wide as a landing pad and a little deeper. Both are drawn as a sphere of this depth,
 * so the ship still meets the surface it used to meet on the block.
 */
export const MINE_SIZE: BoxSize = {
	width: DOCK_SIZE.width * 0.5,
	height: DOCK_SIZE.width * 0.5,
	depth: DOCK_SIZE.depth * 1.3,
};

/** Outer orbit of a moon: three moon radii, clear of the bases on its surface. */
export function moonOuterOrbitRadius(diameter: number): number {
	return (diameter / 2) * MOON_OUTER_ORBIT_SCALE;
}

/**
 * Pushes each moon out from the one inside it until the open gap between their honeycombs is at
 * least as wide as the two shells together. The innermost moon stays on its body-scaled orbit.
 * `moons` are already in order, nearest the planet first, with diameters and baseline orbits scaled.
 */
export function spacedMoonOrbits(moons: { orbit: number; diameter: number }[]): number[] {
	const orbits = moons.map((moon) => moon.orbit);
	for (let index = 1; index < orbits.length; index++) {
		const shells =
			moonOuterOrbitRadius(moons[index - 1].diameter) + moonOuterOrbitRadius(moons[index].diameter);
		const apart = orbits[index - 1] + 2 * shells;
		if (orbits[index] < apart) {
			orbits[index] = apart;
		}
	}
	return orbits;
}

/** Inner orbit: just inside the battle honeycomb on `outer`. */
export function innerOrbitRadius(outer: number): number {
	return outer * (1 - INNER_ORBIT_INSET);
}

/**
 * Outer orbit of a planet. With moons, the midpoint between the base orbit and the inner edge of
 * the innermost moon's zone. Saturn also stays outside its rings. Without moons, a fixed multiple
 * of the radius.
 */
export function outerOrbitRadius(input: PlanetBaseInput): number {
	const surface = input.diameter / 2;
	if (input.moons.length === 0) {
		return surface * NO_MOON_OUTER_SCALE;
	}
	const base = Math.max(warehouseRadius(input), input.stationRadius ?? 0);
	let innerEdge = Infinity;
	for (const moon of input.moons) {
		innerEdge = Math.min(innerEdge, moon.orbit - moonOuterOrbitRadius(moon.diameter));
	}
	let radius = (base + innerEdge) / 2;
	if (input.ringInnerScale != null) {
		radius = Math.max(radius, surface * SATURN_RING_OUTER_SCALE + SATURN_FLYBY_MARGIN);
	}
	return radius;
}

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

/** The pad's inner face sits this far off the moon, so the box clears the sphere. */
const MOON_PAD_GAP = 0.02;

/** Center of a moon pad: half a pad out from the surface, plus the clearance gap. */
export function moonBaseRadius(diameter: number): number {
	return diameter / 2 + DOCK_SIZE.width / 2 + MOON_PAD_GAP;
}

export function radialReach(size: BoxSize): number {
	return size.width / 2;
}

/** True when `ship` is close enough to a body's center that a pilot there should see its honeycomb. */
export function nearBody(
	ship: { x: number; y: number; z: number },
	center: { x: number; y: number; z: number },
	outer: number
): boolean {
	if (outer <= 0) {
		return false;
	}
	const dx = ship.x - center.x;
	const dy = ship.y - center.y;
	const dz = ship.z - center.z;
	const reach = outer * LOCAL_REACH;
	return dx * dx + dy * dy + dz * dz <= reach * reach;
}

export function planetBases(input: PlanetBaseInput): { warehouses: BaseSlot[]; stations: BaseSlot[] } {
	return {
		warehouses:
			input.homes === false ? [] : ring(PLANET_BASES_PER_FACTION, warehouseRadius(input), DOCK_SIZE),
		stations: input.stationRadius == null ? [] : ring(1, input.stationRadius, DOCK_SIZE),
	};
}

export function moonBases(diameter: number): BaseSlot[] {
	return ring(MOON_BASES_PER_FACTION, moonBaseRadius(diameter), DOCK_SIZE);
}

/** One corporate base on Earth's Moon. The ship's home is Earth's station. Both use the dock pad. */
export function playerHome(diameter: number): BaseSlot {
	return {
		faction: "corporate",
		angle: 0,
		radius: moonBaseRadius(diameter),
		size: DOCK_SIZE,
	};
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

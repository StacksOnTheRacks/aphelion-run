/**
 * Mine docks from the generators table. One gray box per mineral, on the inner orbit.
 * A moon uses its planet's yield. The Sun's collectors and Earth's station are already
 * in the scene, and the Moon yields nothing.
 *
 * The ring sits outside the home bases and inside the outer orbit. Saturn's stays in
 * the gap inside the rings, with the warehouses.
 */

import {
	WAREHOUSE_SIZE,
	moonBaseRadius,
	moonBaseSize,
	moonOuterOrbitRadius,
	outerOrbitRadius,
	radialReach,
	warehouseRadius,
	type BoxSize,
	type PlanetBaseInput,
} from "./bases";

export type Mineral = "hydrogen" | "ore" | "nitrogen" | "carbon";

export type GeneratorSlot = {
	resource: Mineral;
	/** Angle around the host, radians. Width of the box points along this radius. */
	angle: number;
	radius: number;
	size: BoxSize;
};

/**
 * Mine rows on the generators tab, in that order. Earth is absent: it sells energy
 * and yields nothing a ship can mine.
 */
export const PLANET_YIELDS: Record<string, readonly Mineral[]> = {
	mercury: ["ore", "hydrogen"],
	venus: ["ore", "nitrogen", "carbon"],
	mars: ["ore", "carbon", "hydrogen"],
	jupiter: ["hydrogen", "ore"],
	saturn: ["hydrogen", "nitrogen", "carbon"],
	uranus: ["hydrogen", "nitrogen", "carbon"],
	neptune: ["hydrogen", "nitrogen", "carbon"],
};

/** A box, small against a planet, on the order of a warehouse. Shrunk when the ring is narrow. */
const GENERATOR_CAP: BoxSize = { width: 0.22, height: 0.14, depth: 0.22 };

function boxFor(room: number): BoxSize {
	const width = Math.min(GENERATOR_CAP.width, Math.max(room * 0.5, 0));
	return { width, height: Math.min(GENERATOR_CAP.height, width * 0.65), depth: width };
}

/** Open annulus the generator ring can use: outside the homes, inside the outer orbit or the rings. */
function planetRoom(input: PlanetBaseInput): { inner: number; outer: number } {
	const homeOuter = warehouseRadius(input) + radialReach(WAREHOUSE_SIZE);
	const surface = input.diameter / 2;
	const limit = input.ringInnerScale != null ? surface * input.ringInnerScale : outerOrbitRadius(input);
	return { inner: homeOuter, outer: limit };
}

function moonRoom(diameter: number): { inner: number; outer: number } {
	const size = moonBaseSize(diameter);
	return {
		inner: moonBaseRadius(diameter) + radialReach(size),
		outer: moonOuterOrbitRadius(diameter),
	};
}

function place(resources: readonly Mineral[], room: { inner: number; outer: number }): GeneratorSlot[] {
	const size = boxFor(room.outer - room.inner);
	const radius = (room.inner + room.outer) / 2;
	return resources.map((resource, index) => ({
		resource,
		angle: ((index + 0.5) / resources.length) * Math.PI * 2,
		radius,
		size,
	}));
}

/** One dock per mineral the planet yields. None for Earth. */
export function planetGeneratorSlots(planet: string, input: PlanetBaseInput): GeneratorSlot[] {
	const resources = PLANET_YIELDS[planet];
	return resources ? place(resources, planetRoom(input)) : [];
}

/** The same mines as the planet. Earth's Moon has none. */
export function moonGeneratorSlots(planet: string, diameter: number): GeneratorSlot[] {
	const resources = PLANET_YIELDS[planet];
	return resources ? place(resources, moonRoom(diameter)) : [];
}

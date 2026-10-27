/**
 * Mine docks from the generators table. One gray box per mineral, inside the inner orbit.
 * A moon uses its planet's yield. The Sun's collectors and Earth's station are already
 * in the scene, and the Moon yields nothing.
 *
 * The ring sits outside the base halo and inside the outer orbit. Saturn's stays in
 * the gap inside the rings. A mine is narrower across the orbit than a landing pad, longer along
 * it, and tall enough that the face the ship meets is square.
 */

import {
	DOCK_SIZE,
	MINE_SIZE,
	moonBaseRadius,
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

/** Open annulus the generator ring can use: outside the homes, inside the outer orbit or the rings. */
function planetRoom(input: PlanetBaseInput): { inner: number; outer: number } {
	const homeOuter = warehouseRadius(input) + radialReach(DOCK_SIZE);
	const surface = input.diameter / 2;
	const limit = input.ringInnerScale != null ? surface * input.ringInnerScale : outerOrbitRadius(input);
	return { inner: homeOuter, outer: limit };
}

function moonRoom(diameter: number): { inner: number; outer: number } {
	return {
		inner: moonBaseRadius(diameter) + radialReach(DOCK_SIZE),
		outer: moonOuterOrbitRadius(diameter),
	};
}

function place(resources: readonly Mineral[], room: { inner: number; outer: number }): GeneratorSlot[] {
	const radius = (room.inner + room.outer) / 2;
	return resources.map((resource, index) => ({
		resource,
		angle: ((index + 0.5) / resources.length) * Math.PI * 2,
		radius,
		size: MINE_SIZE,
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

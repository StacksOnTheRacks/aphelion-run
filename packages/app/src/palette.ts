/**
 * Aphelion Run's colors. Energy is one metal: gold when it is light, bronze when it
 * is a body. A collector is bronze. It is not a separate orange.
 *
 * Paint from this list. Star colors on the galaxy chart are spectral types and stay
 * off it. The style bible repeats the named set.
 */

export const palette = {
	/** The board. It stays empty. */
	field: "#000000",
	/** Panels, and the floor of the cockpit. */
	void: "#07080A",
	/** A raised plate. */
	plate: "#11141A",
	/** Hairlines. */
	rule: "#2C3340",
	/** Type, edges, a quiet hull. A carbon mine wears this, not gold. */
	bone: "#E8E4D9",
	/** Inactive metal. */
	ash: "#9AA3B2",
	/** A label that is not a signal. */
	sand: "#A89060",

	/** The core of a plume, before it becomes gold. */
	whiteHot: "#FFF8EC",
	/** The hottest point of a burn, and a selected highlight. */
	flare: "#FFF3C4",
	/** Energy. Bars, links, a cursor, the haul, the burn. */
	gold: "#FFD73D",
	/** Light moving along a course. */
	pulse: "#FFE7A3",
	/** The body of a plume and a mining beam. */
	beam: "#F0D08A",
	/** The shade under gold. */
	amber: "#E8B23A",
	/** A collector's body, and the warm end of a flame. The gold, held as metal. */
	bronze: "#C48A2E",
	/** A coast. Energy that is not burning. */
	umber: "#8C6E3A",
	/** Engaged. The deep end of the gold. */
	ember: "#A67C20",

	/** Hydrogen. The one cool color. */
	ion: "#7ED4F0",
	/** Ore. Dug metal, not a collector. */
	copper: "#C46A3A",
	/** Nitrogen. Dusty, so it does not lamp. */
	nitrogen: "#7C89D6",
} as const;

export type PaletteName = keyof typeof palette;

/** Carbon has no color of its own. It wears bone, so a mine is not a second sun. */
export const CARBON = palette.bone;

/** The mark for each yield. Icons and their glow use this, and nothing else. */
export const elementColor = {
	hydrogen: palette.ion,
	ore: palette.copper,
	nitrogen: palette.nitrogen,
	carbon: CARBON,
	energy: palette.gold,
} as const;

export type ElementId = keyof typeof elementColor;

/** Energy tokens, light to deep. Hue stays on the gold. Copper is the only warmer read. */
export const ENERGY = [
	palette.flare,
	palette.gold,
	palette.pulse,
	palette.beam,
	palette.amber,
	palette.bronze,
	palette.umber,
	palette.ember,
] as const;

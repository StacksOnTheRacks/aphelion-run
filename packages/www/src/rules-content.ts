export const EXCEPTIONS = ["Sun", "Earth"] as const;

export type WorldYield = {
	name: string;
	materials: string[];
};

/** A planet and its moons share one yield. Earth and the Sun are the exceptions. */
export const WORLDS: WorldYield[] = [
	{ name: "Mercury", materials: ["Ore", "Water"] },
	{ name: "Venus", materials: ["Ore", "Nitrogen", "Carbon"] },
	{ name: "Mars", materials: ["Ore", "Carbon", "Water"] },
	{ name: "Jupiter", materials: ["Hydrogen", "Ore", "Water"] },
	{ name: "Saturn", materials: ["Hydrogen", "Nitrogen", "Carbon", "Water"] },
	{ name: "Uranus", materials: ["Hydrogen", "Nitrogen", "Carbon", "Water"] },
	{ name: "Neptune", materials: ["Hydrogen", "Nitrogen", "Carbon", "Water"] },
];

export const ROUTES = [
	{
		title: "Fill",
		steps: "Home → Sun → home warehouse",
		body: "The ship siphons a collector until it is empty, or until another load would leave it short of the energy to depart. It stays exposed while it siphons and until it leaves the inner orbit.",
	},
	{
		title: "Sell",
		steps: "Home warehouse → Earth station → home bank",
		body: "A pilot sells only at their own faction's station. The station pays cash onto the ship for the surplus above the burn home. That cash is banked only at home, and banked cash can finish an improvement sooner.",
	},
	{
		title: "Supply",
		steps: "Home → a world, to mine → home",
		body: "A planet and its moons share one yield. The ship mines that yield at the planet or at any of its moons, including the home world. Materials have weight. A ship is not loaded past what it can lift home on the wide path today.",
	},
];

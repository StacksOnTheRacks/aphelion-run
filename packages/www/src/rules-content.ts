export const EXCEPTIONS = ["Sun", "Earth"] as const;

export type WorldYield = {
	name: string;
	minerals: string[];
};

/** A planet and its moons share one yield. Earth and the Sun are the exceptions. */
export const WORLDS: WorldYield[] = [
	{ name: "Mercury", minerals: ["Ore", "Water"] },
	{ name: "Venus", minerals: ["Ore", "Nitrogen", "Carbon"] },
	{ name: "Mars", minerals: ["Ore", "Carbon", "Water"] },
	{ name: "Jupiter", minerals: ["Hydrogen", "Ore", "Water"] },
	{ name: "Saturn", minerals: ["Hydrogen", "Nitrogen", "Carbon", "Water"] },
	{ name: "Uranus", minerals: ["Hydrogen", "Nitrogen", "Carbon", "Water"] },
	{ name: "Neptune", minerals: ["Hydrogen", "Nitrogen", "Carbon", "Water"] },
];

export const ROUTES = [
	{
		title: "Fill",
		steps: "Home → Sun → home warehouse",
		body: "The ship siphons a collector in the inner orbit until it is empty, or until another load would leave it short of the energy to depart. An attack pulls it to the outer orbit. When the siphon stops, the ship undocks there, and it can be attacked until it leaves.",
	},
	{
		title: "Sell",
		steps: "Home warehouse → Earth station → home bank",
		body: "The ship sells at Earth's black market. The station pays Solscrip onto the ship for the surplus above the burn home. That Solscrip is banked only at home. Banked Solscrip can finish an improvement sooner, and it can buy another ship.",
	},
	{
		title: "Supply",
		steps: "Home → a world, to mine → home",
		body: "A planet and its moons share one yield. The ship mines that yield at the planet or at any of its moons, including the home world. Minerals have weight. A ship is not loaded past what it can lift home on the wide path today.",
	},
];

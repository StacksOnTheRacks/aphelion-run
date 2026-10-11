export const EXCEPTIONS = ["Sun", "Earth"] as const;

export type ShipPart = {
	name: string;
	role: string;
	mineral?: { name: string; body: string; note: string };
	bodies: string[];
};

export const PARTS: ShipPart[] = [
	{
		name: "Hull, armor, and guns",
		role: "The ship's strength in a fight, and the plate a repair bay puts back.",
		mineral: {
			name: "Hydrogen metal",
			body: "Jupiter",
			note: "Under the clouds, hydrogen is pressed into a metal. The scoops bring it up and it stays solid.",
		},
		bodies: ["Jupiter", "Mercury", "Mars", "Phobos", "Deimos"],
	},
	{
		name: "Siphon modules",
		role: "How fast a ship drinks a harvesting satellite.",
		mineral: {
			name: "Helium rain",
			body: "Saturn",
			note: "Helium falls through the sky in droplets.",
		},
		bodies: ["Saturn", "Moon", "Ganymede", "Proteus"],
	},
	{
		name: "Shields",
		role: "What a close pass wears down, and what a fight spends.",
		mineral: {
			name: "Mantle ice",
			body: "Uranus",
			note: "The hot ice under the clouds is lifted out and kept.",
		},
		bodies: [
			"Uranus",
			"Europa",
			"Callisto",
			"Mimas",
			"Enceladus",
			"Tethys",
			"Dione",
			"Rhea",
			"Miranda",
			"Ariel",
			"Umbriel",
			"Titania",
			"Oberon",
			"Nereid",
		],
	},
	{
		name: "Energy tanks",
		role: "How much solar energy the ship can hold. The burn spends that same store.",
		bodies: ["Venus", "Io"],
	},
	{
		name: "Electronic warfare",
		role: "The light fittings. Marauder ships are built around them.",
		mineral: {
			name: "Storm tar",
			body: "Neptune",
			note: "Heat and wind draw carbon out of the methane.",
		},
		bodies: ["Neptune", "Titan", "Iapetus", "Triton"],
	},
];

export const ROUTES = [
	{
		title: "Fill",
		steps: "Home → Sun → home warehouse",
		body: "The ship siphons a satellite until it is empty, or until another load would leave it short of the energy to depart. It stays exposed while it siphons and until it leaves the inner orbit.",
	},
	{
		title: "Sell",
		steps: "Home warehouse → Earth station → home bank",
		body: "A pilot sells only at their own faction's station. The station pays cash onto the ship for the surplus above the burn home. That cash is banked only at home.",
	},
	{
		title: "Supply",
		steps: "Home → a body that yields what the ship lacks → home",
		body: "Cash buys that body's yield at a base there. Materials have weight. The base will not sell a load the ship cannot lift home on the wide path today.",
	},
];

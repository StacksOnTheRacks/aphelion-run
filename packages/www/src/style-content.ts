export type StyleChapter = {
	id: string;
	kicker: string;
	title: string;
	paragraphs: string[];
};

export type StyleSwatch = {
	group: "Field" | "Energy" | "Reads";
	name: string;
	hex: string;
	role: string;
};

export type StyleYield = {
	name: string;
	look: string;
};

export type StyleRead = {
	must: string;
	how: string;
};

/**
 * How the game should look. No prices, no amounts, no class drawings yet.
 */
export const STYLE: StyleChapter[] = [
	{
		id: "field",
		kicker: "The field",
		title: "Black space, and the planets",
		paragraphs: [
			"Space is black. The planets already carry the scenery. A ship, a warehouse, and a station sit in that field as volumes. If a shape has to be dressed up before it holds, the shape is wrong.",
			"Type is bone-colored. Gold is the energy: a kicker, a link, a cursor, the burn. A collector is bronze, that same gold held as a body, not a separate orange. Hulls that are not collecting stay quiet.",
		],
	},
	{
		id: "ships",
		kicker: "Ships",
		title: "Read the silhouette first",
		paragraphs: [
			"Class is a shape before it is a mark. Miner, Warship, Explorer, and Hauler are the classes. Their silhouettes are not designed yet.",
			"Load shows in how the ship sits. Heavy sits like it costs. Light is a tank and a spine. Solscrip has no weight, so a ship coming home from Earth still sits light, carrying the payout.",
			"On the system map a ship can be a mark. In the terminal it can be a schematic. In a battle replay it can be a body. Those are three jobs, and they can be three drawings.",
		],
	},
	{
		id: "places",
		kicker: "Places",
		title: "Keep the box a box",
		paragraphs: [
			"A warehouse is a volume in orbit. The dock, the bay, and the bank live in that volume. Earth's black market is a larger station, and it is still architecture. The planet does the rest.",
			"Europa and Callisto are the same kind of place: a dock on a yield. One warehouse language covers the moons.",
		],
	},
	{
		id: "terminal",
		kicker: "The terminal",
		title: "The same face on a phone and a desk",
		paragraphs: [
			"The terminal is the type and the layout of an interface, on a phone and on a desk. Tracked, wide letter-spacing, small type. It stays readable at arm's length. A phone opens every place a desk opens. It shows what the trip costs and what the return costs.",
		],
	},
	{
		id: "far",
		kicker: "How far",
		title: "What has to be readable",
		paragraphs: [
			"A player has to read class, load, place, and commodity. Class silhouettes are not designed yet. The rest can wait.",
		],
	},
];

export const NEVER = [
	"A second warm color beside the gold. A collector is bronze, not orange.",
	"Carnival lighting, and lens flare used as decoration.",
	"Skulls, neon, or a pirate flag on a hull.",
	"Jewel-cut icons for the yields.",
	"Chrome that exists to shine.",
	"A unique station design for every moon.",
];

export const PALETTE: StyleSwatch[] = [
	{ group: "Field", name: "Field", hex: "#000000", role: "The board. It stays empty." },
	{ group: "Field", name: "Void", hex: "#07080A", role: "Panels, and the floor of the cockpit." },
	{ group: "Field", name: "Bone", hex: "#E8E4D9", role: "Type, edges, a quiet hull. A carbon mine wears this, not gold." },
	{ group: "Field", name: "Sand", hex: "#A89060", role: "A label that is not a signal." },
	{ group: "Field", name: "Ash", hex: "#9AA3B2", role: "Inactive metal." },
	{ group: "Energy", name: "Flare", hex: "#FFF3C4", role: "The hottest point of a burn." },
	{ group: "Energy", name: "Gold", hex: "#FFD73D", role: "Energy. Bars, links, a cursor, the haul and the burn." },
	{ group: "Energy", name: "Amber", hex: "#E8B23A", role: "The shade under gold." },
	{ group: "Energy", name: "Bronze", hex: "#C48A2E", role: "A collector's body. The gold, held as metal." },
	{ group: "Energy", name: "Ember", hex: "#A67C20", role: "Engaged. The deep end of the gold." },
	{ group: "Reads", name: "Ion", hex: "#7ED4F0", role: "Hydrogen. The one cool color." },
	{ group: "Reads", name: "Copper", hex: "#C46A3A", role: "Ore. Dug metal, not a collector." },
	{ group: "Reads", name: "Nitrogen", hex: "#7C89D6", role: "Nitrogen. Dusty, so it does not lamp." },
];

export const YIELDS: StyleYield[] = [
	{ name: "Hydrogen metal", look: "Dull, pressed, and it stays solid." },
	{ name: "Helium rain", look: "Pale. A droplet, heavier than it looks." },
	{ name: "Mantle ice", look: "Milky. Kept after the lift from the clouds." },
	{ name: "Storm tar", look: "Black. Carbon pulled out of weather." },
	{ name: "Energy", look: "Held light. The haul, and the burn." },
	{ name: "Solscrip", look: "No weight, and no shine of its own." },
];

export const READ: StyleRead[] = [
	{ must: "Class", how: "Silhouette first, once a class has a drawing. Those drawings are not made yet." },
	{ must: "Load", how: "How the ship sits. Heavy costs. Light is a tank and a spine." },
	{ must: "Place", how: "Warehouse, bay, dock, and Earth's one station. Volumes in orbit." },
	{ must: "Commodity", how: "How the mineral looks in the hand and in the hold." },
];

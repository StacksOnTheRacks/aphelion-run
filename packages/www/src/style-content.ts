export type StyleChapter = {
	id: string;
	kicker: string;
	title: string;
	paragraphs: string[];
};

export type StyleSwatch = {
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
 * How the game should look. No prices, no amounts, no fiction outside the two named factions.
 */
export const STYLE: StyleChapter[] = [
	{
		id: "field",
		kicker: "The field",
		title: "Black space, and the planets",
		paragraphs: [
			"Space is black. The planets already carry the scenery. A ship, a warehouse, and a station sit in that field as volumes. If a shape has to be dressed up before it holds, the shape is wrong.",
			"Type is bone-colored. Amber shows up on a kicker, a link, a cursor. Hulls stay quiet.",
		],
	},
	{
		id: "factions",
		kicker: "Two designs",
		title: "One harvest, two yards",
		paragraphs: [
			"Sol Systems flies from blueprints. The same plates, the same tanks, the same siphon geometry, scaled. A contractor's ship looks licensed. It is planar and ceremonial, the way issued equipment looks.",
			"Ashland Marauders build from the same harvest. They have hull metal, ice, tar, rain. They do not have the drawings. Their ships come out of a yard that never saw a Sol stamp.",
		],
	},
	{
		id: "ships",
		kicker: "Ships",
		title: "Read the silhouette first",
		paragraphs: [
			"Faction is a shape before it is a mark. Sol is aligned. A Marauder ship uses the same kit, bolted at other angles.",
			"Load shows in how the ship sits. Heavy sits like it costs. Light is a tank and a spine. Cash has no weight, so a ship coming home from Earth still sits light, carrying the payout.",
			"On the system map a ship can be a mark. In the terminal it can be a schematic. In a battle replay it can be a body. Those are three jobs, and they can be three drawings.",
		],
	},
	{
		id: "places",
		kicker: "Places",
		title: "Keep the box a box",
		paragraphs: [
			"A warehouse is a volume in orbit. The dock, the bay, and the bank live in that volume. Earth stations are larger, one per faction, and they are still architecture. A faction mark tells them apart. The planet does the rest.",
			"Europa and Callisto are the same kind of place: a dock on a yield. One warehouse language covers the moons.",
		],
	},
	{
		id: "terminal",
		kicker: "The terminal",
		title: "Issued, or done without a license",
		paragraphs: [
			"The phone is a terminal. Sol's is issued: tracked, wide letter-spacing, small type. The Marauder terminal does the same job without a license. Both stay readable at arm's length.",
		],
	},
	{
		id: "far",
		kicker: "How far",
		title: "What has to be readable",
		paragraphs: [
			"A player has to read faction, load, place, and commodity. The rest can wait. Ship classes can wait until a run has been flown in grey and still felt like a run.",
		],
	},
];

export const NEVER = [
	"Carnival lighting, and lens flare used as decoration.",
	"Skulls, neon, or a jolly roger on Marauder hulls.",
	"Jewel-cut icons for the yields.",
	"Chrome that exists to shine.",
	"A unique station design for every moon.",
];

export const PALETTE: StyleSwatch[] = [
	{ name: "Field", hex: "#000000", role: "The board. It stays empty." },
	{ name: "Bone", hex: "#E8E4D9", role: "Type, edges, a quiet hull." },
	{ name: "Amber", hex: "#FCD34D", role: "Kickers, links, a cursor." },
	{ name: "Sol mark", hex: "#C4A35A", role: "A license, read from the outer orbit." },
	{ name: "Oxide", hex: "#6B3A32", role: "A Marauder mark. The color of ash." },
	{ name: "Energy", hex: "#F5E6C8", role: "Held light. The haul and the burn." },
];

export const YIELDS: StyleYield[] = [
	{ name: "Hydrogen metal", look: "Dull, pressed, and it stays solid." },
	{ name: "Helium rain", look: "Pale. A droplet, heavier than it looks." },
	{ name: "Mantle ice", look: "Milky. Kept after the lift from the clouds." },
	{ name: "Storm tar", look: "Black. Carbon pulled out of weather." },
	{ name: "Energy", look: "Held light. The haul, and the burn." },
	{ name: "Cash", look: "No weight, and no shine of its own." },
];

export const READ: StyleRead[] = [
	{ must: "Faction", how: "Silhouette first. A mark when the shape is too far away." },
	{ must: "Load", how: "How the ship sits. Heavy costs. Light is a tank and a spine." },
	{ must: "Place", how: "Warehouse, bay, dock, two Earth stations. Volumes in orbit." },
	{ must: "Commodity", how: "How the material looks in the hand and in the hold." },
];

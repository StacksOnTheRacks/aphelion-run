export type StoryChapter = {
	id: string;
	kicker: string;
	title: string;
	paragraphs: string[];
};

/**
 * The setting, and nothing past it. No prices, no amounts, no company name.
 * Routes, yields, and the fight live with the rules.
 */
export const STORY: StoryChapter[] = [
	{
		id: "player",
		kicker: "The player",
		title: "A human, in space",
		paragraphs: [
			"The time is far ahead. How far is not set. The player is a human who lives in space and starts with one ship. The ship mines, and it fights.",
		],
	},
	{
		id: "energy",
		kicker: "Energy",
		title: "Taken from the sun, sold at Earth",
		paragraphs: [
			"Satellites hang in the inner orbit of a system's sun and store solar energy. One galaxy-wide company owns them. The company is not named. Siphoning a satellite is theft, as that company sees it.",
			"Energy is spent to travel. It is sold for Solscrip on the black market. Minerals and energy share one cargo unit. One of either takes one space in the hold. Solscrip takes none. Each system has one planet that sells energy and yields nothing else. In Sol, that planet is Earth.",
		],
	},
	{
		id: "ships",
		kicker: "The ship",
		title: "One hull, then another",
		paragraphs: [
			"The classes are Miner, Warship, Explorer, and Hauler. Each class has five variants. Those names are not locked yet. Each variant is read on storage capacity, siphon speed, weapon strength, speed adjusted by weight, and energy burn rate.",
			"The player starts with one ship. Another ship is bought with Solscrip at Earth's black market.",
		],
	},
	{
		id: "crossing",
		kicker: "The crossing",
		title: "Impulse, then the photon rocket",
		paragraphs: [
			"Within the inner orbit the ship moves on a slow impulse rocket. Once the path out of that orbit is done, a photon rocket carries the ship between bodies. Each system has a wormhole at its edge. A ship leaves through its own and arrives through the target's. Other systems cannot be entered yet.",
			"Before a departure, the player always sees what the trip costs and what the return costs.",
		],
	},
];

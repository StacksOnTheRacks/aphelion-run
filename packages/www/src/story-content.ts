export type StoryChapter = {
	id: string;
	kicker: string;
	title: string;
	paragraphs: string[];
};

/**
 * Why both factions fly. No prices, no amounts, no factions beyond the two named in the brief.
 */
export const STORY: StoryChapter[] = [
	{
		id: "earth",
		kicker: "Earth",
		title: "In the not too distant future...",
		paragraphs: [
			"Seven hundred years from now, Humanity is split between two societal classes that share a sky and nothing else. What remains of humanity after the 3rd world war lives within city size domes of luxury or in the slums outside them. Advanced energy has increased technological advancement, but has not improved humanity's greed and need for control.",
			"Only the wealthy can pay the legal market price, and they have their own energy based economies within their domes. The Ashlands are the slums: polluted, forgotten, but full of people. Medical bays and factories in the Ashlands run on the same thing as those in the domes. Energy is humanity's lifeblood.",
		],
	},
	{
		id: "sun",
		kicker: "The Sun",
		title: "The source...of everything.",
		paragraphs: [
			"Humanity can now cross a distance near the speed of light, and it can store more energy than ever before. Humanity is pre-stellar, but not yet interstellar. They have not yet left the solar system, but they are close, having populated bases in orbit around the celestial bodies in the solar system.",
			"The inter-planetary energy business is booming. Satellites hang in the inner orbit and fill until a pilot drains one. Then they wait on the Sun, and the pilots move on. That orbit is not a home. It is the only place the energy comes from, and it is where a full ship can be taken. A haul that cannot be fought for is not a haul.",
		],
	},
	{
		id: "ssi",
		kicker: "Sol Systems",
		title: "Why a contractor flies",
		paragraphs: [
			"Sol Systems is the mega-corporation that controls the energy trade on Earth, and placement of solar satellites. Sol Systems owns the satellites in the inner orbit of the Sun, and the legal right to the harvest and harvesting technology. But Sol is ever greedy. Sol does not accept the risk of paying for ships when pirates exist, and it will not defend one. What Sol does do is provide blueprints for ships and weaponry to contractors. Contractors can build their own ships and weapons, but they must use Sol's blueprints. Every pilot on either side is an independent contractor, risking their own capital and their own life-just to live.",
			"Contractors must fly to continue living within the domes. Maurauders must fly to continue living in the Ashlands. Pilots fly for the harvest. The pilot who brings the energy in is the one who gets paid. The pilot who loses it on the road is the one who paid for the trip.",
		],
	},
	{
		id: "marauders",
		kicker: "The Ashlands",
		title: "Why a Marauder flies",
		paragraphs: [
			"The Ashland Marauders are pirates, rogue pilots, and outcasts who are not licensed to fly for Sol Systems. They are not legally permitted to mine on a Sol satellite, but they don't follow the law. This stolen energy is sold on a black market. That black-market sale is why the route is worth the fight. Energy on the black market is sold to the Ashlands. Energy on the legal market is sold to the domes.",
			"Marauder ships are built from the same materials as a contractor's ship, but not from the same designs. Marauders are adept engineers as well, and have invented their own weapons and defenses.",
		],
	},
	{
		id: "work",
		kicker: "The route",
		title: "Travelling between home and the Sun",
		paragraphs: [
			"The work is done entirely in space. You set a home base on a planet or moon, and you fly to the Sun to harvest energy. You can then fly to Earth to sell the energy and buy materials to improve your ship or to build another one. You then fly to your home base to build your ship, and you fly back to the Sun to harvest more energy. You then fly to Earth to sell the energy and buy materials to build your ship, and you repeat the process. You don't have to fly to Earth every time you collect energy, you can take it to your home base and store it. Energy stored in the home base can be used to power more trips, but when the base warehouse is full, you have to sell it on an Earth market to make room for more.",
			"The ship fills at a satellite and unloads into the warehouse at home. It carries that energy to its own faction's station at Earth and brings the cash home to the bank. It spends the cash at some other world, on the material the home does not yield, and hauls that material back. Every burn is paid in energy from the warehouse. A pilot who wants anything the home cannot give still has to go back to the Sun.",
			"Energy must be spent wisely, so the gravity of planets and moons can be used to a players advantage. A ship can be boosted by a low orbit swing around a planet or moon, and based on the alignment of planets, routes will change at different times of the year. The best routes are the ones that are profitable and that are easy to execute.",
		],
	},
	{
		id: "home",
		kicker: "A home",
		title: "Where you choose to live",
		paragraphs: [
			"A base can orbit any planet or moon besides Earth or the Sun. The Sun has harvesting satellites and no bases. Sol does not permit pilot bases in Earth's orbit either. The base contains the warehouse, the repair bay, and the space dock. The ship is improved there, and only there.",
			"Where it sits is a choice about how much of the haul a direct burn will eat. Mercury is the cheap hop to the Sun. The Moon is the cheap hop to Earth's market, and the Moon is not a combat zone. Venus sits between them. A base from Mars outward pays more for the same burn.",
			"Battles happen where ships are most vulnerable. Any ship sitting in inner orbit of any planet or moon is an attack target. The only defense is a cloak. Cloaks cause a ship to consume energy faster while away from base, but they also make a ship impossible to detect by other ships. Cloaked ships can be detected by scan, but they cannot be attacked. Energy burn must account for the amount of cloak needed to perform a trip.",
			"Players still have to visit every world that yields something their home world lacks. The planets keep moving. The one that can bend a course this month is what makes a long trip possible, and a close pass wears the ship down. A pass in the wrong month saves nothing. Next month it is a different planet.",
		],
	},
	{
		id: "yields",
		kicker: "The outer system",
		title: "Why you go that far",
		paragraphs: [
			"The Sun is where energy is mined. Earth is where energy is sold. There are no resources to mine on Earth, so Earth satellites function as trading stations.Those two are the only bodies that yield nothing a ship is built from, and cannot be used as a base.",
			"Everywhere else yields at least one material but no more than two. A base receives its own materials, free, incrementally. Each body has a primary element it offers, and possibly another at lesser quanities.  A visitor buys from those yields. No yield stands in for another, and no faction owns one.",
			"The giant planets have no ground to stand on. They are still why a pilot goes that far, because each one holds something a ship can carry, scooped from orbit. Under Jupiter, hydrogen is pressed into a metal the scoops bring up and keep: hydrogen metal, for hull, armor, and guns. On Saturn, helium falls through the sky in droplets: helium rain, for the siphon modules that decide how fast a satellite can be drunk. Under Uranus, hot ice is lifted out and kept: mantle ice, for shields. Over Neptune, heat and wind draw carbon out of the methane: storm tar, for electronic warfare, the fittings Marauder ships are built around.",
			"The worlds between those giants feed the same parts with yields of their own. Living on one of them does not excuse the rest. Every step of a ship's strength spends all of it, and the free stream at home is only home's share.",
		],
	},
	{
		id: "price",
		kicker: "Two markets",
		title: "Who the price starves",
		paragraphs: [
			"Only a finished transfer at an Earth station changes the price. Energy sitting in a warehouse does not. A fight that steals a cargo before the transfer finishes is not a delivery.",
			"A pilot sells only at their own station. Sol Systems deliveries move the legal price. Ashland Marauder deliveries move the black-market price. Flood the legal station and the corporate payouts fall. The domes buy the surplus. The slums go without power. Stolen energy then pays more, more pilots run as Marauders, the legal supply thins, and the legal price rises again.",
			"Pilots hold a haul at home and sell when their own side's price is high. That high price is the premium. Selling into the flood is how the premium dies. The station pays cash onto the ship. It is banked only at home, and until then the other faction can take it.",
		],
	},
	{
		id: "loss",
		kicker: "The fight",
		title: "What either side can lose",
		paragraphs: [
			"Ships are never destroyed. A beaten pilot is sent home to the repair bay. The winner takes the energy and the cash that were aboard, and scrap from the wreck. The trip home does not deliver the cargo.",
			"Energy has weight. Materials have weight. Cash does not. A full ship of either faction turns slowly and fires slowly. The run out of Earth with the payout aboard is a light ship in a combat zone, and that is as true of an armored frigate as it is of a Marauder. Manage the weight or lose the route. Win the fight or lose the haul. Neither design skips that.",
			"Repairs are made at home, from the same materials the ship was built from. The free stream covers only the home world's share. Missing a material delays the work. It does not, by itself, keep the ship from flying.",
		],
	},
];

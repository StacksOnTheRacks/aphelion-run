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
		title: "Two cities, one sky",
		paragraphs: [
			"Seven hundred years from now, Earth is two cities that share a sky and nothing else. Wars and disease made the world this small. What remains of humanity lives above the poison, or under it.",
			"The domes are clean because power is bought and kept. Only the well-off can pay the legal price. The Ashlands are the slums below: polluted, forgotten, and still full of people. A room there stays breathable only while the scrubbers run. Medical bays and factories down there run on the same thing. Energy is what still decides which life a person gets.",
		],
	},
	{
		id: "sun",
		kicker: "The Sun",
		title: "The only place it comes from",
		paragraphs: [
			"The fast ships already exist. Humanity can cross a distance near the speed of light, and it can store more energy than any earlier century. It cannot put a shell around the Sun. People cannot live in that orbit, and they do not want to.",
			"What is new is the harvest. Satellites hang in the inner orbit and fill until a pilot drinks one empty. Then they wait on the Sun, and the pilots move on. That orbit is not a home. It is the only place the energy comes from, and it is where a full ship can be taken. A haul that cannot be fought for is not a haul.",
		],
	},
	{
		id: "ssi",
		kicker: "Sol Systems",
		title: "Why a contractor flies",
		paragraphs: [
			"Sol Systems holds the legal right to that harvest. It prices energy so the domes can pay and the Ashlands cannot. It will not give a pilot a ship, and it will not stand behind one. Every pilot on either side is an independent contractor, risking their own capital.",
			"A contractor flies anyway. The domes will buy a finished legal haul, and the company will not carry it. The frigate is armored to keep a cargo through a hit and still come home. That armor is paid for by the sale. The pilot who brings the energy in is the one who gets paid. The pilot who loses it on the road is the one who paid for the trip.",
		],
	},
	{
		id: "marauders",
		kicker: "The Ashlands",
		title: "Why a Marauder flies",
		paragraphs: [
			"The Ashland Marauders are pirates, rogue pilots, and people out of the slums who will not wait on a market built to exclude them. They steal energy because the legal station will not sell it to the bays, the factories, and the scrubbers. They sell it when the domes have already bought the surplus and the slums have gone dark. That black-market sale is why the route is worth the fight.",
			"Their ships are built from the same materials as a contractor's frigate, and not from the same design. A Marauder hull is cut to look like a weapon, and the fittings that matter are the ones for electronic warfare. Looks do not settle anything. A contractor who only armors up, and never reads what the ship can still lift, loses the cargo before anyone fires. A Marauder who can only attack, and cannot get the haul home, brings the Ashlands nothing. Both sides have to be good at resource management and good at the battle. The power between them plays out there.",
		],
	},
	{
		id: "work",
		kicker: "The route",
		title: "One home, one ship",
		paragraphs: [
			"The work is played entirely in space. You have one home and one ship, whichever flag you fly.",
			"The ship fills at a satellite and unloads into the warehouse at home. It carries that energy to its own faction's station at Earth and brings the cash home to the bank. It spends the cash at some other world, on the material the home does not yield, and hauls that material back. Every burn is paid in energy from the warehouse. A pilot who wants anything the home cannot give still has to go back to the Sun.",
			"These are not the near-light runs. The planets are already moving at tens of kilometers a second, and a contractor's burn is a change on that order. Spending the cargo to cross the system near the speed of light would burn the profit, so the haulers ride the orbits. The other faction is on the same road. A full ship is loot.",
		],
	},
	{
		id: "home",
		kicker: "A home",
		title: "Where you choose to live",
		paragraphs: [
			"A home can orbit any planet or any moon. It cannot orbit the Sun. The Sun has harvesting satellites and no bases. The home is the warehouse, the repair bay, and the bank. The ship is improved there, and only there.",
			"Where it sits is a choice about how much of the haul a direct burn will eat. Mercury is the cheap hop to the Sun. The Moon is the cheap hop to Earth's market, and the Moon is not a combat zone. Venus sits between them. A base from Mars outward pays more for the same burn.",
			"Earth's orbit is a fight for as long as the ship remains in it. Cash stays aboard until it is banked at home, and any opposing pilot in that orbit can try to take it. Leaving is what ends the hunt. That is why a pilot who means to keep the payout lives on the Moon, beside the market, and not in the orbit where the stations are.",
			"An inner home still has to visit every world that yields something it lacks. The planets keep moving. The one that can bend a course this month is what makes a long trip possible, and a close pass wears the ship down. A pass in the wrong month saves nothing. Next month it is a different planet.",
		],
	},
	{
		id: "yields",
		kicker: "The outer system",
		title: "Why you go that far",
		paragraphs: [
			"The Sun is where energy is mined. Earth is where energy is sold. Those two are the only bodies that yield nothing a ship is built from.",
			"Everywhere else yields one material, and only that one. A base receives its own, free. A visitor buys that yield and nothing else. A moon is not a share of its planet. No yield stands in for another, and no faction owns one. Two pilots can base on the same body, and each receives the stream.",
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
			"Ships are never destroyed. A beaten pilot is sent home to the repair bay. The winner takes the energy and the cash that were aboard, and scrap from the wreck. The trip home does not deliver the cargo. If that home sits in Earth's orbit, the ship comes back into a fight.",
			"Energy has weight. Materials have weight. Cash does not. A full ship of either faction turns slowly and fires slowly. The run out of Earth with the payout aboard is a light ship in a combat zone, and that is as true of an armored frigate as it is of a Marauder. Manage the weight or lose the route. Win the fight or lose the haul. Neither design skips that.",
			"Repairs are made at home, from the same materials the ship was built from. The free stream covers only the home world's share. Missing a material delays the work. It does not, by itself, keep the ship from flying.",
		],
	},
];

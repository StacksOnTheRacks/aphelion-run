export type StoryChapter = {
	id: string;
	kicker: string;
	title: string;
	paragraphs: string[];
};

/**
 * The universe, told from the brief. No prices, no amounts, no factions beyond the two named there.
 */
export const STORY: StoryChapter[] = [
	{
		id: "earth",
		kicker: "Earth",
		title: "Two cities on one world",
		paragraphs: [
			"Seven hundred years from now, humanity is smaller than it was. Wars and disease have cut the population down. What remains lives in two places that barely acknowledge each other.",
			"Above the poison, the corporate domes are clean. Power is reliable there, and only the well-off can pay for it. Below the domes, the Ashlands are the slums: polluted, forgotten, and still full of people. Their medical bays, their factories, and the air scrubbers that keep a room breathable all run on energy the legal market will not sell them.",
		],
	},
	{
		id: "sun",
		kicker: "The Sun",
		title: "A new and volatile industry",
		paragraphs: [
			"The fast ships exist. Humanity can cross a distance near the speed of light, and it can store more energy than any earlier century. It is nowhere near a machine that could enclose the Sun. People cannot live in orbit around it, and they do not want to.",
			"Harvesting the Sun directly is new. Satellites hang in the inner orbit and fill until a ship drinks them empty. Then they have to recharge from the Sun, and the pilots move on to another. The work is dangerous. The orbit beside the fire is not a place to make a home.",
		],
	},
	{
		id: "ssi",
		kicker: "Sol Systems",
		title: "The legal monopoly",
		paragraphs: [
			"Sol Systems, Inc. holds the legal right to that harvest. It prices energy so high that the domes can buy it and the Ashlands cannot. It will not give a pilot a ship, and it will not insure one.",
			"Every pilot in the system is an independent contractor, on either side, risking their own capital. An SSI contractor flies a heavily armored cargo frigate, built to take a hit and still come home with the haul.",
		],
	},
	{
		id: "marauders",
		kicker: "The Ashlands",
		title: "The other fleet",
		paragraphs: [
			"The Ashland Marauders are a loose network of pirates, rogue pilots, and freedom fighters out of the slums. They steal energy to power black-market medical bays, weapon factories, and the air scrubbers.",
			"Their ships are jury-rigged. They are built to be light, fast, and hard to pin down, and the fittings that matter most are the ones for electronic warfare.",
		],
	},
	{
		id: "work",
		kicker: "The work",
		title: "One home, one ship",
		paragraphs: [
			"The life is played entirely in space. You have one home base and one ship.",
			"The ship runs three hauls. It fills at a harvesting satellite and unloads into the warehouse at home. It carries that energy to its own faction's station at Earth and brings the cash home to the bank. It spends the cash at some other world, on the material the home does not yield, and hauls that material home.",
			"Every one of those burns is paid in energy taken from the warehouse. A pilot who wants anything the home cannot give still has to keep going back to the Sun.",
			"These haulers do not fly the near-light runs. The planets are already moving at tens of kilometers a second, and a contractor's burn is a change on that order. Spending the cargo to cross the system near the speed of light would burn the profit, so the ships ride the orbits.",
		],
	},
	{
		id: "home",
		kicker: "A home",
		title: "Where you choose to live",
		paragraphs: [
			"A home can orbit any planet or any moon. It cannot orbit the Sun. The Sun has harvesting satellites and no bases. The home is the warehouse, the repair bay, and the bank. Improvements to the ship are built there, and only there.",
			"Where it sits is a choice about distance. A direct burn costs less stored energy between closer orbits. Mercury is the cheap hop to the Sun. The Moon is the cheap hop to Earth's market, and the Moon is not a combat zone. Venus sits between them. A base from Mars outward pays more for the same direct burn.",
			"Earth's orbit is a fight for as long as the ship remains in it. Cash stays on the ship until it is banked at home, and any opposing pilot in Earth's inner or outer orbit can try to take it. Leaving that orbit is what ends the hunt. That is why a contractor lives beside Earth, on the Moon, rather than in Earth's orbit.",
			"An inner home stays ahead on a direct burn. It still has to visit every world that yields something it lacks. The planets keep moving. The one that can bend a course this month is what makes a long trip affordable, and next month it is a different planet. A close pass on a good alignment spends less energy and arrives sooner, and it wears the ship. A pass in the wrong month saves nothing.",
		],
	},
	{
		id: "yields",
		kicker: "The yields",
		title: "What each world will give you",
		paragraphs: [
			"The Sun is where energy is mined. Earth is where energy is sold. Those two are the only bodies that yield nothing a ship is built from.",
			"Everywhere else yields one material, and only that one. A base receives its body's yield steadily, free, into the warehouse. It receives no other body's. A moon is not a share of its planet. No yield stands in for another. No faction owns a material: two pilots can base on the same body, and each receives the stream. What a visitor buys is a separate stock.",
			"The giant planets have no ground to mine. Each one still has a material a ship can carry, scooped from orbit, taken from what that planet is already thought to hold and changed so it can be hauled.",
			"Under Jupiter's clouds, hydrogen is pressed into a metal. The scoops bring it up and it stays solid. Hull, armor, and guns are built from that hydrogen metal, together with what Mercury, Mars, Phobos, and Deimos yield.",
			"On Saturn, helium falls through the sky in droplets. Siphon modules, the part that decides how fast a ship can drink a satellite, are built from that helium rain, together with the Moon, Ganymede, and Proteus.",
			"Under the clouds of Uranus, hot ice is lifted out and kept. Shields are built from that mantle ice, together with Europa, Callisto, and the icy moons of Saturn, Uranus, and Neptune.",
			"Heat and wind over Neptune draw carbon out of the methane. That storm tar, together with Titan, Iapetus, and Triton, builds the electronic warfare and the light fittings. Marauder ships are built around them.",
			"The tanks that hold the solar energy are built from what Venus and Io yield.",
			"Every step up in strength spends every body's yield. The free stream at home is only that body's share. A pilot who lives on Europa still docks at Callisto, at Mimas, and at every other world on the list. The same is true of every home.",
		],
	},
	{
		id: "price",
		kicker: "Earth's market",
		title: "The price, and who it starves",
		paragraphs: [
			"Only a finished transfer at an Earth station changes the price of energy. Energy sitting in a warehouse does not. A fight that steals a cargo before the transfer finishes is not a delivery, so it does not move the price.",
			"A pilot sells only at their own faction's station. SSI deliveries move the legal price. Marauder deliveries move the black-market price. When contractors flood the legal station, the price drops and the corporate payouts fall. The domes buy up the surplus. The slums go without power. Black-market demand spikes, stolen energy pays more, and more pilots run as Marauders. Legal supply thins, the legal price rises, and the cycle starts again.",
			"Pilots hold energy at home and sell when their side's price is high. That high price is the premium. Selling into a flood is how the premium disappears. The station pays cash onto the ship. The cash is banked only at home, and until then it can be taken.",
		],
	},
	{
		id: "loss",
		kicker: "A fight",
		title: "What you can lose",
		paragraphs: [
			"Ships are never destroyed. A beaten ship is sent home to the repair bay. The winner takes the energy and the cash that were aboard, and scrap from the wreck. The trip home does not deliver the cargo. If that home is in Earth's orbit, the ship returns to a combat zone.",
			"Energy has weight. Materials have weight. Cash does not. A ship full of energy or materials turns slowly and fires slowly. A ship carrying cash and little else fights at its full strength, which is why the run out of Earth's orbit, with the whole payout aboard, is a light ship in a fight.",
			"Repairs and improvements are made at home, from the same materials the ship is built from. The free stream covers only the home world's share. The rest waits on what the ship has brought back. Missing a material delays that work. It does not, by itself, keep the ship from flying.",
		],
	},
];

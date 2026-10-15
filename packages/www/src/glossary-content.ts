export type GlossaryEntry = {
	term: string;
	id: string;
	body: string;
	also?: string[];
};

export type GlossarySection = {
	id: string;
	kicker: string;
	title: string;
	intro?: string;
	entries: GlossaryEntry[];
};

/**
 * The words we use. No prices, no amounts, no fiction outside the two named factions.
 */
export const GLOSSARY: GlossarySection[] = [
	{
		id: "world",
		kicker: "World",
		title: "Who flies, and who they fly for",
		entries: [
			{
				term: "Ashland Marauders",
				id: "marauders",
				body: "Pirates, rogue pilots, and outcasts who are not licensed to fly for Sol Systems. They siphon collectors anyway, and sell that energy on the black market to the Ashlands. Their ships are built from the same materials as a contractor's, from their own designs.",
				also: ["Marauder"],
			},
			{
				term: "Ashlands",
				id: "ashlands",
				body: "The slums outside the domes. Polluted, forgotten, and full of people. Medical bays and factories there run on the same energy as the domes. A Marauder flies to keep living here.",
			},
			{
				term: "Contractor",
				id: "contractor",
				body: "A pilot licensed to fly for Sol Systems. They build from Sol's blueprints, risk their own ship, and sell at the legal station. A contractor flies to keep living in the domes.",
			},
			{
				term: "Domes",
				id: "domes",
				body: "City-size habitats of the wealthy on Earth. They pay the legal market price. Energy sold at a Sol Systems station goes here.",
			},
			{
				term: "Pilot",
				id: "pilot",
				body: "Anyone who flies, contractor or Marauder. Every pilot is an independent contractor. Sol does not pay for the ship, and it will not defend one.",
			},
			{
				term: "Sol Systems",
				id: "sol",
				body: "The mega-corporation that controls the energy trade on Earth and the placement of collectors. It owns every collector, and the legal right to the harvest. It provides blueprints. It does not provide ships.",
				also: ["Sol"],
			},
		],
	},
	{
		id: "places",
		kicker: "Places",
		title: "Where a ship can sit",
		entries: [
			{
				term: "Bank",
				id: "bank",
				body: "At home. Cash from an Earth sale is banked only here. Until then it sits on the ship, and the other faction can take it.",
			},
			{
				term: "Base",
				id: "base",
				body: "A dock on a world. A pilot mines that world's yield here, at the planet or at a moon. A base does not hand the yield over, and it does not sell materials.",
			},
			{
				term: "Collector",
				id: "collector",
				body: "A Sol Systems satellite in the Sun's inner orbit. It absorbs energy from the Sun until a ship siphons it. Sol owns every collector. When one is drained, it waits on the Sun, and the pilots move on.",
				also: ["harvesting satellite", "solar satellite"],
			},
			{
				term: "Combat zone",
				id: "combat-zone",
				body: "The outer orbit of any planet or moon, except the Moon. A ship sitting there can be attacked. A ship burning between bodies cannot. A ship on a mine can be pulled out to that orbit to fight, and it goes back if it wins. A cloaked ship cannot be attacked. A dry ship cannot attack. It can be attacked.",
			},
			{
				term: "Gravity boom",
				id: "gravity-boom",
				body: "A boom on the home base. It works the pull along its length as the base orbits, and feeds a slow stream of energy into the warehouse. Every home gets the same rate. It does not replace a haul from the Sun.",
			},
			{
				term: "Home",
				id: "home",
				body: "A player's one place. It holds the warehouse, the repair bay, the bank, and the space dock. Ships are built and improved only here. It can orbit any planet or moon except Earth. It cannot orbit the Sun.",
				also: ["home base"],
			},
			{
				term: "Inner orbit",
				id: "inner-orbit",
				body: "The low zone beside a body, where the work is. At the Sun, this is where the collectors sit. At Earth, this is where the two stations sit. At a planet or moon, this is where a ship mines. The fight is not fought here.",
			},
			{
				term: "Outer orbit",
				id: "outer-orbit",
				body: "The battle surface. The same ring at every body a ship can fight at. A moon's outer orbit is its own, not the planet's. A ship sitting here can be attacked. A ship that finishes a mine, or undocks early, comes out here. At the Sun, a ship arrives here and scans inward. Travel between bodies is a fast burn from outer orbit to outer orbit. Moving between the inner orbit and the outer orbit is slow.",
			},
			{
				term: "Repair bay",
				id: "repair-bay",
				body: "At home. A beaten ship is sent here. Repairs spend the same materials the ship was built from. Missing a material delays the work. The ship can still fly.",
			},
			{
				term: "Space dock",
				id: "space-dock",
				body: "At home. Ships are built here, and only here.",
			},
			{
				term: "Station",
				id: "station",
				body: "One of the two faction docks in Earth's inner orbit. A pilot sells only at their own. The station pays cash onto the ship for the surplus above the burn home. It does not store energy, and it does not bank cash.",
				also: ["Earth station", "trading station"],
			},
			{
				term: "Warehouse",
				id: "warehouse",
				body: "At home. Energy from a collector is unloaded here, and materials mined aboard are unloaded here, and energy is spent from here on later burns. When the warehouse is full of energy, it has to be sold at a station to make room. Water is stored apart from that energy. A full energy store does not block a water unload.",
			},
			{
				term: "World",
				id: "world-yield",
				body: "A planet and its moons. They share one yield. A pilot mines that yield at the planet or at any of its moons and gets the same materials either way.",
			},
		],
	},
	{
		id: "run",
		kicker: "The run",
		title: "What a ship does",
		entries: [
			{
				term: "Alignment",
				id: "alignment",
				body: "Where the planets sit today. It decides the cost of a path, and which body can bend a course. Next month it is a different planet.",
			},
			{
				term: "Assist",
				id: "assist",
				body: "A close pass that lets a planet's gravity change the ship's speed, so the burn costs less. Any planet can be that pass, and only when it sits where its gravity bends the course. A course can use more than one planet.",
				also: ["gravity assist"],
			},
			{
				term: "Burn",
				id: "burn",
				body: "The energy a route spends. That energy is the same store the ship hauls and sells. A ship cannot depart unless the energy aboard covers the route. Heavier cargo makes the same route cost more. Travel between bodies is a fast burn from outer orbit to outer orbit. Moving between the inner orbit and the outer orbit is slow.",
				also: ["delta-v"],
			},
			{
				term: "Cloak",
				id: "cloak",
				body: "The only defense away from home. Other ships cannot see a cloaked ship. A scan can. A cloaked ship cannot be attacked. The cloak spends energy faster, and a trip has to budget for it.",
			},
			{
				term: "Close pass",
				id: "close-pass",
				body: "A path that comes in near a planet to take an assist. On a good alignment it spends less energy and arrives sooner. It wears the shields and hull. In the wrong month it saves nothing.",
			},
			{
				term: "Delivery",
				id: "delivery",
				body: "A finished transfer at a station. Only a delivery moves that faction's price. Energy in a warehouse is not a delivery. A haul stolen before the transfer finishes is not a delivery.",
			},
			{
				term: "Fill",
				id: "fill",
				body: "The route home → Sun → home warehouse. The ship siphons a collector and unloads into the warehouse.",
				also: ["harvest"],
			},
			{
				term: "Recall",
				id: "recall",
				body: "What happens to a beaten ship. It is sent home to the repair bay. The victor takes the energy and the cash that were aboard, and scrap from the wreck. The recall does not deliver a cargo. Ships are never destroyed.",
			},
			{
				term: "Reserve",
				id: "reserve",
				body: "The energy a ship keeps to pay the burn home, or the burn to the next stop. Siphoning stops before another load would drop the ship under today's reserve. The station buys only the surplus above the burn home.",
			},
			{
				term: "Scan",
				id: "scan",
				body: "From the outer orbit, a look inward. At the Sun it shows which collectors are occupied, and by whom. A scan can see a cloaked ship.",
			},
			{
				term: "Sell",
				id: "sell",
				body: "The route home warehouse → station → home bank. A pilot sells only at their own station.",
			},
			{
				term: "Siphon",
				id: "siphon",
				body: "The act of moving energy from a collector onto a ship. How fast a ship siphons is its siphon level, set by its siphon modules.",
			},
			{
				term: "Supply",
				id: "supply",
				body: "The route home → a world, to mine → home. A planet and its moons share one yield. The ship mines it at the planet or at any of its moons, including the home world. Materials have weight. A ship is not loaded past what it can lift home on the wide path today. An empty mine undocks the ship to the outer orbit. If it was not sent home, it stays there with the cargo.",
			},
			{
				term: "Terminal",
				id: "terminal",
				body: "Flights, sell orders, repairs, and the next path, including the departure from a collector. One place among the others. A phone opens it, and opens every other place.",
			},
			{
				term: "Transfer",
				id: "transfer",
				body: "The sale at a station. It takes time. An attack pulls the ship out to the outer orbit. If the ship wins, it goes back and the transfer continues. If it loses before the transfer finishes, the cargo is still energy, and the victor takes it. When it finishes, the station pays cash onto the ship and undocks it into the outer orbit.",
			},
			{
				term: "Wide path",
				id: "wide-path",
				body: "A course that stays clear of the planet. It spends the full reserve and leaves the hull alone.",
			},
		],
	},
	{
		id: "ship",
		kicker: "The ship",
		title: "What it is made of, and how it sits",
		entries: [
			{
				term: "Electronic warfare",
				id: "electronic-warfare",
				body: "The light fittings. Marauder ships are built around them.",
			},
			{
				term: "Energy tanks",
				id: "energy-tanks",
				body: "How much energy the ship can hold. The burn spends that same store.",
			},
			{
				term: "Heavy",
				id: "heavy",
				body: "A ship carrying a lot of energy or materials. It turns slowly and its guns cycle slowly. The same burn costs more.",
			},
			{
				term: "Hull, armor, and guns",
				id: "hull",
				body: "The ship's strength in a fight, and the plate a repair bay puts back.",
			},
			{
				term: "Light",
				id: "light",
				body: "A ship carrying little saleable energy, and few materials. Fast, and it fires quickly. The run out to the Sun, and the run home from Earth with cash, are light. Cash has no weight.",
			},
			{
				term: "Scrap",
				id: "scrap",
				body: "Taken from a wreck after a fight, along with the energy and cash that were aboard.",
			},
			{
				term: "Shields",
				id: "shields",
				body: "What a close pass wears down, and what a fight spends.",
			},
			{
				term: "Siphon modules",
				id: "siphon-modules",
				body: "The fittings that set siphon level, and so how fast a ship drinks a collector.",
				also: ["siphon level"],
			},
		],
	},
	{
		id: "materials",
		kicker: "Materials",
		title: "What a body yields",
		intro: "A world is a planet and its moons. They share one yield. Ships are built and improved from hydrogen, ore, nitrogen, and carbon. Water is consumed. The same material is the same wherever it is mined. No faction owns one.",
		entries: [
			{
				term: "Carbon",
				id: "carbon",
				body: "A material ships are built and improved from. Yielded by Venus, Mars, Saturn, Uranus, and Neptune.",
			},
			{
				term: "Cash",
				id: "cash",
				body: "Paid onto the ship at a station, for energy sold. Banked only at home. Banked cash can finish an improvement sooner. It does not buy materials, and it does not shorten a repair. Cash has no weight.",
			},
			{
				term: "Energy",
				id: "energy",
				body: "Mined from collectors, stored in the warehouse, spent on burns, sold at a station. Energy has weight. Humanity's lifeblood.",
			},
			{
				term: "Hydrogen",
				id: "hydrogen",
				body: "A material ships are built and improved from. Yielded by Jupiter, Saturn, Uranus, and Neptune.",
			},
			{
				term: "Nitrogen",
				id: "nitrogen",
				body: "A material ships are built and improved from. Yielded by Venus, Saturn, Uranus, and Neptune.",
			},
			{
				term: "Ore",
				id: "ore",
				body: "A material ships are built and improved from. Yielded by Mercury, Venus, Mars, and Jupiter.",
			},
			{
				term: "Water",
				id: "water",
				body: "Consumed at the home base, at one rate for the fleet, whether or not the pilot is online. A ship in the repair bay does not count. A route does not spend it. When the base is dry, a ship can depart only for a world that yields it. A ship already sent finishes its route. A sale at Earth is not allowed while the base is dry. A dry ship cannot attack. It can be attacked. Not spent to build a ship. Yielded by Mercury, Mars, Jupiter, Saturn, Uranus, and Neptune.",
			},
			{
				term: "Yield",
				id: "yield",
				body: "What a world gives. The Sun yields energy, into collectors. Earth yields nothing a ship can mine, and the Moon shares that. Every other world yields the materials named for it. The pilot mines them there, including at home.",
			},
		],
	},
	{
		id: "market",
		kicker: "The market",
		title: "What a sale does",
		entries: [
			{
				term: "Black-market price",
				id: "black-market",
				body: "What a Marauder delivery pays. Marauder deliveries move this price. When the legal price drops, the slums go without power, and this price rises.",
			},
			{
				term: "Blueprint",
				id: "blueprint",
				body: "Sol's drawings for ships and weapons. A contractor must use them. Marauders have their own.",
			},
			{
				term: "Legal price",
				id: "legal-price",
				body: "What a Sol Systems delivery pays. Contractor deliveries move this price. Flood the legal station and the payouts fall. The domes buy the surplus.",
			},
			{
				term: "Premium",
				id: "premium",
				body: "A high price on your own side. Pilots hold energy in the warehouse and sell when that price is high. Selling into a flood is how the premium dies.",
			},
		],
	},
];

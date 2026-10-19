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
 * The words we use. No prices, no amounts, no company name.
 */
export const GLOSSARY: GlossarySection[] = [
	{
		id: "world",
		kicker: "World",
		title: "Who flies",
		entries: [
			{
				term: "Energy company",
				id: "energy-company",
				body: "The galaxy-wide company that owns the collectors. It is not named. Siphoning a collector is theft, as that company sees it.",
			},
			{
				term: "Pilot",
				id: "pilot",
				body: "A human who lives in space and starts with one ship. The ship mines, and it fights.",
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
				body: "At home. Solscrip from an Earth sale is banked only here. Until then it sits on the ship, and another pilot can take it.",
			},
			{
				term: "Base",
				id: "base",
				body: "A dock on a world. A pilot mines that world's yield here, at the planet or at a moon. A base does not hand the yield over, and it does not sell minerals.",
			},
			{
				term: "Black market",
				id: "black-market",
				body: "The one planet in a system that sells energy and yields nothing else. In Sol, that planet is Earth. The station there pays Solscrip onto the ship.",
			},
			{
				term: "Collector",
				id: "collector",
				body: "A satellite in the Sun's inner orbit, owned by the energy company. The company is not named. It absorbs energy from the Sun until a ship siphons it. Siphoning one is theft, as that company sees it. When one is drained, it waits on the Sun, and the pilots move on.",
				also: ["harvesting satellite", "solar satellite"],
			},
			{
				term: "Combat zone",
				id: "combat-zone",
				body: "The outer orbit of any planet or moon, except the Moon. A ship sitting there can be attacked. A ship on a photon burn between bodies cannot. A ship in that outer orbit can challenge a ship that is mining, or a ship sitting idle there. A depleted mine or a finished Earth sale puts the ship back in that idle orbit. A cloaked ship cannot be attacked. A dry ship cannot attack. It can be attacked.",
			},
			{
				term: "Gravity boom",
				id: "gravity-boom",
				body: "A boom on the home base. It works the pull along its length as the base orbits, and feeds a slow stream of energy into the warehouse. Every home gets the same rate. It does not replace a haul from the Sun. It is one piece of static base equipment, with the warehouse, the repair bay, the dock, and the water store.",
			},
			{
				term: "Home",
				id: "home",
				body: "A player's one place. It holds the warehouse, the repair bay, the bank, and the space dock. Ships are improved and repaired only here. It can orbit any planet or moon except Earth. It cannot orbit the Sun.",
				also: ["home base"],
			},
			{
				term: "Inner orbit",
				id: "inner-orbit",
				body: "The low zone beside a body, where the work is. Travel here is a slow impulse rocket. At the Sun, this is where the collectors sit. At Earth, this is where the black market sits. At a planet or moon, this is where a ship mines. The fight is not fought here.",
			},
			{
				term: "Outer orbit",
				id: "outer-orbit",
				body: "The battle surface. The same ring at every body a ship can fight at. A moon's outer orbit is its own, not the planet's. A ship sitting here can be attacked. A ship that finishes a mine, or a sale, or undocks early, comes out here. At the Sun, a ship arrives here and scans inward. Travel between bodies is a photon rocket from outer orbit to outer orbit. Moving between the inner orbit and the outer orbit is the slow impulse.",
			},
			{
				term: "Repair bay",
				id: "repair-bay",
				body: "At home. A beaten ship is sent here. Repairs spend the same minerals the ship was improved from. Missing a mineral delays the work. The ship can still fly.",
			},
			{
				term: "Space dock",
				id: "space-dock",
				body: "At home. Ships are improved and repaired here, and only here. A new hull is bought at Earth's black market.",
			},
			{
				term: "Station",
				id: "station",
				body: "The black market dock in Earth's inner orbit. The station pays Solscrip onto the ship for the surplus above the burn home. It does not store energy, and it does not bank Solscrip.",
				also: ["Earth station", "trading station"],
			},
			{
				term: "Warehouse",
				id: "warehouse",
				body: "At home. Energy from a collector is unloaded here, and minerals mined aboard are unloaded here, and energy is spent from here on later burns. When the warehouse is full of energy, it has to be sold at the station to make room. Water is stored apart from that energy. A full energy store does not block a water unload.",
			},
			{
				term: "Wormhole",
				id: "wormhole",
				body: "A departure at the edge of a system. A ship leaves through its own and arrives through the target's. Other systems cannot be entered yet. What the hop costs is not set. It is not a camera surface.",
			},
			{
				term: "World",
				id: "world-yield",
				body: "A planet and its moons. They share one yield. A pilot mines that yield at the planet or at any of its moons and gets the same minerals either way.",
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
				body: "A close pass that lets a planet's gravity change the ship's speed, so the burn costs less. The Sun and any planet can be that pass, and only when it sits where its gravity bends the course. A course can use more than one.",
				also: ["gravity assist"],
			},
			{
				term: "Burn",
				id: "burn",
				body: "The energy a route spends. That energy is the same store the ship hauls and sells, counted in the same cargo units as a mineral. A ship cannot depart unless the energy aboard covers the route. A fuller hold makes the same route cost more. Travel between bodies is a photon rocket from outer orbit to outer orbit. Moving between the inner orbit and the outer orbit is a slow impulse rocket.",
				also: ["delta-v"],
			},
			{
				term: "Cargo",
				id: "cargo",
				body: "Minerals and energy share one count. One of either takes one space in the hold. Solscrip does not. A full hold is what makes a ship heavy. This sets no amounts. Before a departure, the player always sees what the trip costs and what the return costs.",
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
				body: "A finished transfer at Earth's station. Whether a delivery moves the price is not decided. Energy in a warehouse is not a delivery. A haul stolen before the transfer finishes is not a delivery.",
			},
			{
				term: "Fill",
				id: "fill",
				body: "The route home → Sun → home warehouse. The ship siphons a collector and unloads into the warehouse.",
				also: ["harvest"],
			},
			{
				term: "Impulse rocket",
				id: "impulse",
				body: "The slow drive inside an inner orbit, and the slow move between an inner orbit and its outer orbit.",
				also: ["impulse"],
			},
			{
				term: "Photon rocket",
				id: "photon-rocket",
				body: "The drive between bodies, once the path out of an orbit is done. A ship on that burn cannot be attacked. Alignment and a gravity assist still change what the burn costs.",
			},
			{
				term: "Recall",
				id: "recall",
				body: "What happens to a beaten ship. It is sent home to the repair bay. The victor takes the energy and the Solscrip that were aboard, and scrap from the wreck. The recall does not deliver a cargo. Ships are never destroyed.",
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
				body: "The route home warehouse → Earth's black market → home bank.",
			},
			{
				term: "Siphon",
				id: "siphon",
				body: "The act of moving energy from a collector onto a ship. The energy company treats it as theft. How fast a ship siphons is its siphon level, set by its siphon modules.",
			},
			{
				term: "Supply",
				id: "supply",
				body: "The route home → a world, to mine → home. A planet and its moons share one yield. The ship mines it at the planet or at any of its moons, including the home world. Minerals have weight. A ship is not loaded past what it can lift home on the wide path today. An empty mine undocks the ship to the outer orbit. If it was not sent home, it stays there with the cargo.",
			},
			{
				term: "Terminal",
				id: "terminal",
				body: "Flights, sell orders, repairs, and the next path, including the departure from a collector. It shows what the trip costs and what the return costs. One place among the others. A phone opens it, and opens every other place.",
			},
			{
				term: "Transfer",
				id: "transfer",
				body: "The sale at Earth's station. It takes time. An attack pulls the ship out to the outer orbit. If the ship wins, it goes back and the transfer continues. If it loses before the transfer finishes, the cargo is still energy, and the victor takes it. When it finishes, the station pays Solscrip onto the ship and undocks it into the outer orbit.",
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
				term: "Energy tanks",
				id: "energy-tanks",
				body: "How much energy the ship can hold. The burn spends that same store. Storage capacity is an axis of ship class.",
			},
			{
				term: "Explorer",
				id: "explorer",
				body: "A ship class with five variants. The variants are siblings. It is read on the same five axes as the other classes. Numbers are not locked.",
			},
			{
				term: "Hauler",
				id: "hauler",
				body: "A ship class with five variants. The variants are siblings. It is read on the same five axes as the other classes. Numbers are not locked.",
			},
			{
				term: "Heavy",
				id: "heavy",
				body: "A ship carrying a lot of energy or minerals. It turns slowly and its guns cycle slowly. The same burn costs more. Speed is adjusted by that weight.",
			},
			{
				term: "Hull, armor, and guns",
				id: "hull",
				body: "The ship's strength in a fight, and the plate a repair bay puts back. Weapon strength is an axis of ship class.",
			},
			{
				term: "Light",
				id: "light",
				body: "A ship carrying little saleable energy, and few minerals. Fast, and it fires quickly. The run out to the Sun, and the run home from Earth with Solscrip, are light. Solscrip has no weight.",
			},
			{
				term: "Miner",
				id: "miner",
				body: "A ship class with five variants. The variants are siblings. It is read on the same five axes as the other classes. Numbers are not locked.",
			},
			{
				term: "Scrap",
				id: "scrap",
				body: "Taken from a wreck after a fight, along with the energy and Solscrip that were aboard.",
			},
			{
				term: "Shields",
				id: "shields",
				body: "What a close pass wears down, and what a fight spends.",
			},
			{
				term: "Ship class",
				id: "ship-class",
				body: "Miner, Warship, Explorer, or Hauler. Each class has five variants. The axes are storage capacity, siphon speed, weapon strength, speed adjusted by weight, and energy burn rate. A ship also carries one siphon, one thruster, one drill, and one cloak. Those parts can be replaced, and each can be upgraded to level 10. Numbers are not locked. The player starts with one ship. Another is bought with Solscrip at the black market.",
			},
			{
				term: "Siphon modules",
				id: "siphon-modules",
				body: "The fittings that set siphon level, and so how fast a ship drinks a collector.",
				also: ["siphon level"],
			},
			{
				term: "Warship",
				id: "warship",
				body: "A ship class with five variants. The variants are siblings. It is read on the same five axes as the other classes. Numbers are not locked.",
			},
		],
	},
	{
		id: "minerals",
		kicker: "Minerals",
		title: "What a body yields",
		intro: "A world is a planet and its moons. They share one yield. Ships are improved and repaired from hydrogen, ore, nitrogen, and carbon. A new hull is bought with Solscrip. Water is consumed. The same mineral is the same wherever it is mined.",
		entries: [
			{
				term: "Carbon",
				id: "carbon",
				body: "A mineral ships are improved and repaired from. Yielded by Venus, Mars, Saturn, Uranus, and Neptune.",
			},
			{
				term: "Energy",
				id: "energy",
				body: "Taken from collectors, stored in the warehouse, spent on burns, sold at Earth's black market. Counted in the same cargo units as a mineral. One of either takes one space in the hold.",
			},
			{
				term: "Hydrogen",
				id: "hydrogen",
				body: "A mineral ships are improved and repaired from. Yielded by Jupiter, Saturn, Uranus, and Neptune.",
			},
			{
				term: "Nitrogen",
				id: "nitrogen",
				body: "A mineral ships are improved and repaired from. Yielded by Venus, Saturn, Uranus, and Neptune.",
			},
			{
				term: "Ore",
				id: "ore",
				body: "A mineral ships are improved and repaired from. Yielded by Mercury, Venus, Mars, and Jupiter.",
			},
			{
				term: "Solscrip",
				id: "solscrip",
				body: "The currency. Paid onto the ship at Earth's black market, for energy sold. Banked only at home. Banked Solscrip can finish an improvement sooner, and it can buy another ship. It does not buy minerals, and it does not shorten a repair. Solscrip has no weight.",
				also: ["cash"],
			},
			{
				term: "Water",
				id: "water",
				body: "Consumed at the home base, at one rate for the fleet, whether or not the pilot is online. A ship in the repair bay does not count. A route does not spend it. When the base is dry, a ship can depart only for a world that yields it. A ship already sent finishes its route. A sale at Earth is not allowed while the base is dry. A dry ship cannot attack. It can be attacked. Not spent to build a ship. Yielded by Mercury, Mars, Jupiter, Saturn, Uranus, and Neptune.",
			},
			{
				term: "Yield",
				id: "yield",
				body: "What a world gives. The Sun yields energy, into collectors. Earth yields nothing a ship can mine, and the Moon shares that. Every other world yields the minerals named for it. The pilot mines them there, including at home.",
			},
		],
	},
];

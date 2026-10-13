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
				body: "A dock on a yielding body. Residents receive that body's free stream. A visiting ship can buy the stock. A base does not hand over energy, and it does not pay cash for materials.",
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
				body: "The inner orbit of any planet or moon, except the Moon. A ship sitting there can be attacked. A cloaked ship cannot.",
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
				body: "The low zone beside a body. At the Sun, this is where the collectors sit. At Earth, this is where the two stations sit. At any other planet or moon, a ship sitting here can be attacked, except at the Moon.",
			},
			{
				term: "Outer orbit",
				id: "outer-orbit",
				body: "The staging ring. At the Sun, a ship arrives here and scans inward. At Earth, ships come in here on the way to the stations. At a planet or moon, it is the approach.",
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
				body: "At home. Energy from a collector is unloaded here, and spent from here on later burns. The free stream arrives here. When the warehouse is full, energy has to be sold at a station to make room.",
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
				body: "The energy a route spends. That energy is the same store the ship hauls and sells. A ship cannot depart unless the energy aboard covers the route. Heavier cargo makes the same route cost more.",
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
				body: "The route home → a body that yields what the ship lacks → home. Cash buys that yield at a base there. Materials have weight. The base will not sell a load the ship cannot lift home on the wide path today.",
			},
			{
				term: "Terminal",
				id: "terminal",
				body: "The phone. Check flights, set sell orders, manage repairs, plot the next path, including the departure from a collector.",
			},
			{
				term: "Transfer",
				id: "transfer",
				body: "The sale at a station. It takes time. If the ship is beaten before it finishes, the cargo is still energy, and the victor takes it. When it finishes, the station pays cash onto the ship and undocks it into the inner orbit.",
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
				body: "The light fittings. Marauder ships are built around them. They spend storm tar, and the yields of Titan, Iapetus, and Triton.",
			},
			{
				term: "Energy tanks",
				id: "energy-tanks",
				body: "How much energy the ship can hold. The burn spends that same store. They spend the yields of Venus and Io. Those yields have no name yet.",
			},
			{
				term: "Heavy",
				id: "heavy",
				body: "A ship carrying a lot of energy or materials. It turns slowly and its guns cycle slowly. The same burn costs more.",
			},
			{
				term: "Hull, armor, and guns",
				id: "hull",
				body: "The ship's strength in a fight, and the plate a repair bay puts back. They spend hydrogen metal, and the yields of Mercury, Mars, Phobos, and Deimos.",
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
				body: "What a close pass wears down, and what a fight spends. They spend mantle ice, and the yields of Europa, Callisto, Mimas, Enceladus, Tethys, Dione, Rhea, Miranda, Ariel, Umbriel, Titania, Oberon, and Nereid.",
			},
			{
				term: "Siphon modules",
				id: "siphon-modules",
				body: "The fittings that set siphon level, and so how fast a ship drinks a collector. They spend helium rain, and the yields of the Moon, Ganymede, and Proteus.",
				also: ["siphon level"],
			},
		],
	},
	{
		id: "materials",
		kicker: "Materials",
		title: "What a body yields",
		intro: "Every yielding body offers one material, or two. A primary, and sometimes a second in a lesser quantity. The second is not named yet. No yield stands in for another. No faction owns one.",
		entries: [
			{
				term: "Cash",
				id: "cash",
				body: "Paid onto the ship at a station, for energy sold. Banked only at home. Spent at other bodies, on the materials they yield. Cash has no weight.",
			},
			{
				term: "Energy",
				id: "energy",
				body: "Mined from collectors, stored in the warehouse, spent on burns, sold at a station. Energy has weight. Humanity's lifeblood.",
			},
			{
				term: "Free stream",
				id: "free-stream",
				body: "The home body's yield, arriving a little at a time into the warehouse, at no cost. It is only that body's share. Visitors buy from a separate stock.",
			},
			{
				term: "Helium rain",
				id: "helium-rain",
				body: "Scooped from Saturn. Helium falls through the sky in droplets. Spent on siphon modules. Also yielded by the Moon, Ganymede, and Proteus.",
			},
			{
				term: "Hydrogen metal",
				id: "hydrogen-metal",
				body: "Scooped from Jupiter. Under the clouds, hydrogen is pressed into a metal. The scoops bring it up and it stays solid. Spent on hull, armor, and guns. Also yielded by Mercury, Mars, Phobos, and Deimos.",
			},
			{
				term: "Mantle ice",
				id: "mantle-ice",
				body: "Scooped from Uranus. The hot ice under the clouds is lifted out and kept. Spent on shields. Also yielded by Europa, Callisto, Mimas, Enceladus, Tethys, Dione, Rhea, Miranda, Ariel, Umbriel, Titania, Oberon, and Nereid.",
			},
			{
				term: "Storm tar",
				id: "storm-tar",
				body: "Scooped from Neptune. Heat and wind draw carbon out of the methane. Spent on electronic warfare. Also yielded by Titan, Iapetus, and Triton.",
			},
			{
				term: "Yield",
				id: "yield",
				body: "What a body gives. The Sun yields energy, into collectors. Earth yields nothing a ship is built from. Every other body yields one material or two. A visitor buys it. A resident receives the free stream.",
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

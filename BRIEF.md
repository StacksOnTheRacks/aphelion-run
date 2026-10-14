# Aphelion Run

Product brief. This is the current description of the game. How this version is built is in [STRATEGY.md](STRATEGY.md). Discussion continues from here.

## 1. Executive summary

- **Logline:** A cross-platform, asynchronous space strategy game where players navigate a live, moving solar system to contest a dwindling network of solar harvesting satellites — either to secure corporate profits or deliver a stolen lifeline to Earth's slums.
- **Genre:** Asynchronous space strategy, with economy and fleet management.
- **Platform:** The same game on a wide PC screen and a tall phone screen.
- **Setting:** 700 years in the future, after the 3rd world war. Humanity has not left the solar system. Bases orbit its planets and moons.

## 2. World and factions

Seven hundred years from now, what remains of humanity after the 3rd world war is split between two classes that share a sky and nothing else. The wealthy live in city-size domes of luxury and pay the legal market price. They run energy-based economies inside those domes. The Ashlands are the slums outside: polluted, forgotten, and full of people. Medical bays and factories there run on the same energy as the domes. Advanced energy has raised the technology. It has not changed the greed or the need for control. Energy is the lifeblood.

Humanity can cross a distance near the speed of light, and it can store more energy than ever before. It is pre-stellar, not yet interstellar. It has not left the solar system. It has populated bases in orbit around the bodies there. The Sun's inner orbit is not one of those homes. Satellites hang there and fill until a pilot drains one. That harvest is the inter-planetary energy business, and it is where a full ship can be taken.

Sol Systems will not pay for a ship while pirates exist, and it will not defend one. It does provide the blueprints. Every pilot in both factions is an independent contractor, risking their own capital and their own life.

- **Sol Systems:** The mega-corporation that controls the energy trade on Earth and the placement of solar satellites. It owns the satellites in the Sun's inner orbit, and the legal right to the harvest and the harvesting technology. Contractors build their own ships and weapons, and they must use Sol's blueprints. A contractor flies to keep living in the domes. The pilot who brings the energy in is the one who gets paid.
- **Ashland Marauders:** Pirates, rogue pilots, and outcasts who are not licensed to fly for Sol Systems. They are not legally permitted to mine a Sol satellite, and they do it anyway. Stolen energy is sold on the black market to the Ashlands. Legal energy is sold to the domes. A Marauder flies to keep living in the Ashlands. Their ships are built from the same materials as a contractor's, and not from the same designs. Marauders are engineers, and they have invented their own weapons and defenses.

## 3. Core gameplay loop

The game is played entirely in space. Each player has one home base. Ships are built and improved at that base, and a pilot can build another. The home base orbits a planet or a moon. It cannot orbit Earth or the Sun. The Sun has harvesting satellites and no bases. Sol does not permit pilot bases in Earth's orbit. Earth's satellites are trading stations.

The ship runs three routes. It fills at the Sun and unloads into the home warehouse. It hauls energy from that warehouse to an Earth station and brings the cash home to the bank. It mines at a body, including the home body, and hauls those materials home. Every one of those burns is paid in energy taken from the home warehouse, so a pilot who wants materials still has to keep going to the Sun.

Home → Sun → home warehouse. Home warehouse → Earth station → home bank. Home → a body, to mine → home warehouse.

A surplus of energy is worth more as cash when that pilot's price on Earth is high. Materials are not bought with that cash. A pilot mines them at the body, and the load still has to be flown home. The energy spent flying it is gone.

### Home base

The home base is the energy warehouse, the repair bay, the bank, and the space dock. Ships are improved there, and built there, and only there. It can orbit any planet or moon except Earth. It cannot orbit the Sun.

Energy hauled from the Sun can be stored in the warehouse and spent on later trips. The pilot does not have to sell on Earth after every harvest. When the warehouse is full, the energy has to be sold at an Earth market to make room for more. Water is stored apart from that energy. A full energy store does not block a water unload.

A gravity boom on the base works the pull along its length as the base orbits, and feeds a slow stream of energy into the warehouse. Every home gets the same rate, so where the home sits does not change it. The stream can cover a departure if the pilot waits. It does not replace a haul from the Sun.

A base does not receive materials on its own. The pilot mines the home world's yield the same as any other world's. The Sun and Earth are the only exceptions, and neither can hold a pilot base. The Sun is where energy is mined. Earth is where energy is sold. The giant planets are mined from orbit, and their gravity still makes a close pass cheaper when they sit in the right part of their orbit.

No faction owns a material. Two pilots of either faction can base on the same body. Each mines it. Neither is given it.

Where the home sits is a choice about distance, and that location is the home's only advantage. A direct burn costs less stored energy between closer orbits, so Mercury is the cheap hop to the Sun and the Moon is the cheap hop to Earth's market. The Moon is not a combat zone. Venus sits between them. A base from Mars outward pays more for the same direct burn. The inner bases stay ahead on a direct burn. They still mine their own world's yield. It is not given to them. The planet that can bend the course this month is what makes a given trip affordable, and that planet changes as the orbits move.

### Materials

A world is a planet and its moons. They share one yield. A pilot mines that yield at the planet or at any of its moons and gets the same materials either way.

The materials are hydrogen, ore, nitrogen, carbon, and water. Ships are built and improved from hydrogen, ore, nitrogen, and carbon. Water is consumed. The same material is the same wherever it is mined. This brief sets no amounts.

- **Mercury** yields ore and water.
- **Venus** yields ore, nitrogen, and carbon.
- **Mars** yields ore, carbon, and water.
- **Jupiter** yields hydrogen, ore, and water.
- **Saturn** yields hydrogen, nitrogen, carbon, and water.
- **Uranus** yields hydrogen, nitrogen, carbon, and water.
- **Neptune** yields hydrogen, nitrogen, carbon, and water.

The Sun yields energy. Earth yields nothing a ship can mine. The Moon shares Earth's yield, so it yields nothing either. A pilot mines the home world's yield to have it. The base does not hand it over.

The home base drinks water at one rate, whether or not the pilot is online. The rate follows the fleet. A ship locked in the repair bay does not count. A ship on a route does not drink, and the route does not spend water. When the base is dry, a ship can depart only for a world that yields water. A ship already sent finishes its route. A sale at Earth is not allowed while the base is dry. A dry ship cannot attack. It can be attacked.

### Mining

A pilot mines a yield at the body that offers it. The ship goes there. Materials are not bought, and they are not traded. The Earth station pays cash for energy. It does not sell materials.

Materials go aboard the ship. They have weight. A body does not hand over energy. A ship is not loaded past what it can lift home on the wide path today, so it can always leave. If the return grows more expensive after the load, the ship waits in that orbit until the alignment cheapens it. A wait in an inner orbit can be attacked, unless the ship is cloaked. The Moon is not a combat zone.

Cash comes from energy sold at Earth, or from cash taken off a beaten ship. It is banked at home. It does not buy materials. Banked cash can be spent to finish an improvement sooner. It does not supply a missing material, and it does not shorten a repair.

### Launch and orbital alignment

The board is a top-down map of the solar system. Planets orbit the Sun at realistic relative speeds, so the path from a home base to the Sun, to Earth, and out to any other body changes every day. So does which planet can bend that path.

- The player reads the current alignment and plots a trajectory.
- Once a ship is sent, it moves along that line on the map.

### Delta-v

Delta-v is the change in speed a route demands. The ship pays it by burning stored energy. That energy is the same store it hauls and sells, so a burn spends cargo.

These runs are orbital transfers. The planets already move at tens of kilometers per second, and a contractor's burn is a change on that order. Spending the cargo to cross the system near the speed of light would burn the profit, so these haulers do not fly that way.

A ship cannot depart unless the energy aboard covers the route it is about to fly. The cost depends on the orbit it is in, the orbit it is going to, how much energy it is carrying, and whether a planet on the path can bend the course. The cost of a direct transfer is set by the two orbits, which is why an inner base stays cheaper. Where the planets sit decides whether that direct path is open today, and whether a third body can cheapen it.

Cash has no weight. The drive still needs energy to leave. The Earth station buys only the surplus above the burn home. A ship that arrives with nothing above that reserve can leave, and it has nothing to sell.

- **Stuck:** Below the reserve, the ship stays in its current orbit. At the Sun, if the satellite still holds energy, the ship keeps siphoning until it can leave. If the satellite is empty, the ship stays idle and can be attacked until the alignment makes the departure cheap enough. At home, the ship waits until the warehouse can cover the departure, or until the alignment makes it cheaper. At a body, the ship was not loaded past what it can lift, and it waits out a bad alignment there.
- **Heavier costs more:** The same change in speed takes more energy when the ship is carrying more energy or more materials. Past a point the cargo is so heavy that what is left cannot buy the trip. Siphoning stops before that point even if the satellite still holds energy. That is why a drained satellite is not always a full ship.
- **Assist:** A gravity assist is the efficient burn. The ship is already moving at orbital speed, and a close pass lets a planet's gravity change that speed, so the engines spend less stored energy to reach the next orbit. Any planet can be that pass. It works only when the planet is in the part of its orbit that bends the ship toward the destination. A course can use more than one planet. Venus and the other inner planets bend courses toward the Sun and across the inner system. Jupiter, Saturn, Uranus, and Neptune bend courses outward, including the course in to that planet's own moons. A pilot bound the other way uses the same pass. A close pass in the wrong month saves nothing. A wide path stays clear of the planet, spends the full reserve, and leaves the hull alone. A close path on a good alignment spends less energy, arrives sooner, and wears the shields and hull down.
- **Recall:** A defeated ship is still sent home to the repair bay. The victor takes the energy and the cash that were aboard. The recall does not deliver a cargo.

### Outer orbit and inner orbit

At the Sun, space is split in two:

- **Outer orbit:** A stable staging area. The player can scan the inner orbit and see which satellites are occupied, and by whom.
- **Inner orbit:** The low zone beside the Sun, where the harvesting satellites are.

The same split exists at the planets and moons. A ship sitting in the inner orbit of any planet or moon is an attack target. The Moon is the exception: it is not a combat zone.

A cloak is the only defense. While a ship is away from base, a cloak makes it consume energy faster. Other ships cannot detect it. A scan can. A cloaked ship cannot be attacked. The energy a trip costs has to include the cloak the pilot means to run.

### The Earth sale

Earth has no mineable resources and no pilot bases. Its satellites are trading stations. The outer orbit is the approach. The inner orbit holds the faction stations. A player sells only at their own faction's station. The transfer takes time. If the ship is defeated before the transfer finishes, the cargo is still energy, and the victor takes it. When the transfer finishes, the station pays cash onto the ship for the surplus above the burn home and undocks it into the inner orbit. The station does not store energy, and it does not bank cash.

That cash stays on the ship until the ship reaches its home base and banks it. Until then, the other faction can take it wherever an attack is allowed: the inner orbit of a planet or moon, and not the Moon. A defeat sends the loser home to repair and gives the victor whatever unbanked cash or energy was aboard. Stolen cash is not banked either. The thief has to carry it to their own home. The Moon is the cheap hop to Earth's market, and it is not a combat zone, which is why a pilot who means to stay near the market lives there.

### Satellites

Each satellite holds a finite pool of solar energy. When it is drained, it must recharge from the Sun, and players move on to another.

Ships fight with their stats. The player does not steer the shots. A battle can finish while the player is away.

- **Harvest:** Dock at an empty or allied satellite and siphon until it is empty, or until another load would drop the ship under the reserve for today's departure. When the siphon stops, the ship is idle in the inner orbit with its haul aboard, and it can be attacked. A departure plotted from the terminal is flown when the siphon stops. The ship stays exposed while it siphons and until it leaves the inner orbit. A ship with no departure plotted stays on the empty satellite.
- **Attack:** Drop onto a satellite held by the other faction, or onto a ship idle there. If the attacker wins, they take the energy and the cash that were aboard, plus scrap from the wreck. The defender is sent home to the repair bay. The recall does not deliver a cargo.

## 4. Payload penalty

Combat power falls as cargo weight rises, so a full hauler is weaker than an empty ship.

Active combat power = hull strength + component bonuses + crew skills − payload weight.

Energy has weight. Materials have weight. Cash does not. The same weight raises the energy a burn consumes.

- **Light:** A ship carrying little saleable energy, and few materials, is fast and fires quickly. The run out to the Sun, and the run home from Earth with cash, are light. The drive still keeps a reserve for the burn. With an empty tank, the ship cannot depart. The cash ship fights at full strength, and it is carrying the whole payout.
- **Heavy:** Siphoned energy makes the ship heavy. So does a hold full of materials. It turns slowly and its guns cycle slowly, on the way home to the warehouse, on the way to an Earth station, and on the way home from a mine. The player has to leave the Sun while the leftover energy can still pay for the trip.

## 5. Repair and recovery

Ships are never permanently destroyed.

- A defeated ship is sent back to the player's home base and locked in the repair bay. A home is never in Earth's orbit.
- Repairs and improvements are made at the home bay. They spend the materials that part is built from. Each material, including what the home world offers, waits on what the ship has mined and brought back. Missing a material delays that work. It does not by itself keep the ship from flying.
- Banked cash can be spent to finish an improvement sooner. It does not supply a missing material, and it does not shorten a repair.
- Repair time depends on the ship. A big cargo frigate takes longer than a light interceptor.
- A damaged ship that won, or survived, can be sent home early to repair before the next run.

## 6. The market

Only a completed transfer at an Earth station changes the price of energy on Earth. Energy sitting in a home warehouse does not.

- A player sells at their own faction's station. Sol Systems deliveries move the legal price. Marauder deliveries move the black-market price.
- If Sol Systems contractors deliver a flood of energy, the legal price drops and corporate payouts fall.
- When the legal price drops, the domes buy up the surplus and the slums go without power. Black-market demand spikes.
- Stolen energy then pays more, so more players run as Marauders. Legal supply falls, the legal price rises, and the cycle starts again.
- A fight that steals energy before the transfer finishes is not a delivery, so it does not move the price.
- The station pays cash onto the ship. That cash is banked only at the home base. Banked cash can finish an improvement sooner. It does not buy materials. Materials are mined at the body that yields them. Materials are not bought or sold at Earth. This brief sets no amounts.
- Players hold energy in the home warehouse and sell when their side's price is high. That high price is the premium. Selling into a flood is how the premium disappears.

## 7. Screens

The phone and the PC play the same game. A tall layout and a wide layout are two arrangements of the same places. Flying, trading, repairing, plotting, and watching a fight are all available on both.

A player is in one place at a time. The places are listed below. Which transitions release the current view and load the next one is not settled. [STRATEGY.md](STRATEGY.md) holds that rule.

- **Galaxy:** The Milky Way from above, with Sol among fourteen real star systems within 12 light years. Systems known to have no star, like the brown dwarfs Luhman 16 and WISE 0855−0714, are left out. Only Sol can be entered. The others are real stars whose contents will be mostly invented.
- **System:** The moving map. Orbits, homes, and the ships readable from here.
- **Outer orbit:** Staging at a body. The scan inward. The approach.
- **Inner orbit:** Collectors, stations, and ships close enough to fight or dock.
- **Base:** The warehouse, the repair bay, the bank, and the dock.
- **Terminal:** Flights, sell orders, repairs, and the next path, including the departure from a collector. It shows what that path costs in energy with today's alignment, whether the ship has enough aboard to depart, what the warehouse holds, and whether a load mined at the destination still leaves enough energy to come home.
- **Battle:** The playback of a fight, so the player can see how the ship, the shields, and the crew performed.

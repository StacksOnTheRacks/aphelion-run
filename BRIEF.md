# Aphelion Run

Product brief. This is the current description of the game. How this version is built is in [STRATEGY.md](STRATEGY.md). Discussion continues from here.

## 1. Executive summary

- **Logline:** A cross-platform, asynchronous space strategy game where a human in space flies one ship through a live solar system, siphons solar satellites, mines the worlds, sells energy for Solscrip on Earth's black market, and can be attacked in outer orbit.
- **Genre:** Asynchronous space strategy, with economy and fleet management.
- **Platform:** The same game on a wide PC screen and a tall phone screen.
- **Setting:** Far in the future. How far is not set. The player lives in space.

## 2. World

The time is far ahead. How far is not set. The player is a human who lives in space and starts with one ship. The ship mines, and it fights.

Satellites hang in the inner orbit of a system's sun and store solar energy. One galaxy-wide company owns them. The company is not named. Siphoning a satellite is theft, as that company sees it. Energy is spent to travel. It is sold for Solscrip on the black market. Minerals and energy share one cargo unit. One of either takes one space in the hold. Solscrip takes none. A full hold is what makes a ship heavy. This brief sets no amounts.

Each system has one planet that sells energy and yields nothing else. In Sol, that planet is Earth. Play stays in Sol. Other systems cannot be entered yet.

## 3. Core gameplay loop

The game is played entirely in space. Each player has one home base and starts with one ship. Another ship is bought with Solscrip at Earth's black market. Minerals are not the way a new hull is obtained. Ships are improved and repaired at the home base, and only there. The home base orbits a planet or a moon. It cannot orbit Earth or the Sun. The Sun has harvesting satellites and no bases. Earth's satellite is the black market.

The ship runs three routes. It fills at the Sun and unloads into the home warehouse. It hauls energy from that warehouse to Earth's black market and brings the Solscrip home to the bank. It mines at a body, including the home body, and hauls those minerals home. Every one of those burns is paid in energy taken from the home warehouse, so a pilot who wants minerals still has to keep going to the Sun.

Home → Sun → home warehouse. Home warehouse → Earth station → home bank. Home → a body, to mine → home warehouse.

A surplus of energy can be sold for Solscrip. Minerals are not bought with that Solscrip. A pilot mines them at the body, and the load still has to be flown home. The energy spent flying it is gone.

### Ships

The classes are Miner, Warship, Explorer, and Hauler. Each class has five variants. The variants are siblings: different numbers, close to the others in that class. The names are not locked here.

Each variant is read on five axes, and on hull strength apart from the weapons. This brief sets no numbers.

- Storage capacity
- Siphon speed
- Weapon strength
- Speed, adjusted by weight
- Energy burn rate

Weighted strength is the hull's starting strength, plus what leveling the ship adds, plus the strength of the weapons, minus the weight of the cargo.

A ship carries one siphon, one thruster, one drill, and one cloak. Any of those can be replaced with a newer part. The new part does not keep the old part's levels. Each part can be upgraded to level 10.

### Home base

The home base is the energy warehouse, the repair bay, the bank, and the space dock. Ships are improved there, and repaired there, and only there. It can orbit any planet or moon except Earth. It cannot orbit the Sun.

Energy hauled from the Sun can be stored in the warehouse and spent on later trips. The pilot does not have to sell on Earth after every harvest. When the warehouse is full, the energy has to be sold at Earth's black market to make room for more.

A gravity boom on the base works the pull along its length as the base orbits, and feeds a slow stream of energy into the warehouse. Every home gets the same rate, so where the home sits does not change it. The stream can cover a departure if the pilot waits. It does not replace a haul from the Sun.

Base equipment is static. A piece is built, then upgraded, and it is not swapped for a different piece. The pieces are the gravity boom, the warehouse, the repair bay, and the dock. Each can be upgraded to level 100. The base itself advances only when every piece has reached the same step of ten. Base level 2 requires every piece at level 10. Base level 3 requires every piece at level 20. That continues until every piece is at level 100.

A base does not receive minerals on its own. The pilot mines the home world's yield the same as any other world's. The Sun and Earth are the only exceptions, and neither can hold a pilot base. The Sun is where energy is mined. Earth is where energy is sold. The giant planets are mined from orbit, and their gravity still makes a close pass cheaper when they sit in the right part of their orbit.

Two pilots can base on the same body. Each mines it. Neither is given it.

Where the home sits is a choice about distance, and that location is the home's only advantage. A direct burn costs less stored energy between closer orbits, so Mercury is the cheap hop to the Sun and the Moon is the cheap hop to Earth's market. The Moon is not a combat zone. Venus sits between them. A base from Mars outward pays more for the same direct burn. The inner bases stay ahead on a direct burn. They still mine their own world's yield. It is not given to them. The planet that can bend the course this month is what makes a given trip affordable, and that planet changes as the orbits move.

### Minerals

A world is a planet and its moons. They share one yield. A pilot mines that yield at the planet or at any of its moons and gets the same minerals either way.

The minerals are hydrogen, ore, nitrogen, and carbon. Ships are improved and repaired from all four. The same mineral is the same wherever it is mined. Water is not a mineral. Ice is mined as hydrogen, and the oxygen in that ice is not tracked. This brief sets no amounts.

- **Mercury** yields hydrogen and ore.
- **Venus** yields ore, nitrogen, and carbon.
- **Mars** yields hydrogen, ore, and carbon.
- **Jupiter** yields hydrogen and ore.
- **Saturn** yields hydrogen, nitrogen, and carbon.
- **Uranus** yields hydrogen, nitrogen, and carbon.
- **Neptune** yields hydrogen, nitrogen, and carbon.

The Sun yields energy. Earth yields nothing a ship can mine. The Moon shares Earth's yield, so it yields nothing either. A pilot mines the home world's yield to have it. The base does not hand it over.

### Mining

A pilot mines a yield at the body that offers it. The ship goes there. Minerals are not bought, and they are not traded. The Earth station pays Solscrip for energy. It does not sell minerals.

Minerals go aboard the ship. They have weight. A body does not hand over energy. A ship is not loaded past what it can lift home on the wide path today, so it can always leave. If the return grows more expensive after the load, the ship waits in the outer orbit until the alignment cheapens it. A wait there can be attacked, unless the ship is cloaked. The Moon is not a combat zone.

Solscrip comes from energy sold at Earth, or from Solscrip taken off a beaten ship. It is banked at home. It does not buy minerals. Banked Solscrip can be spent to finish an improvement sooner. It does not supply a missing mineral, and it does not shorten a repair. It can buy another ship at the black market.

### Launch and orbital alignment

The board is a top-down map of the solar system. Planets orbit the Sun at realistic relative speeds, so the path from a home base to the Sun, to Earth, and out to any other body changes every day. So does which planet can bend that path.

- The player reads the current alignment and plots a trajectory.
- Once a ship is sent, it moves along that line on the map.
- Before a departure, the player always sees what the trip costs and what the return costs.

### Delta-v

Delta-v is the change in speed a route demands. The ship pays it by burning stored energy. That energy is the same store it hauls and sells, so a burn spends cargo. One energy takes one space in the hold, the same as one mineral.

These runs are orbital transfers. The planets already move at tens of kilometers per second. Within the inner orbit the ship moves on a slow impulse rocket. Once the path out of that orbit is done, a photon rocket carries the ship between bodies. Alignment and a gravity assist still change what that burn costs.

A ship cannot depart unless the energy aboard covers the route it is about to fly. The cost depends on the orbit it is in, the orbit it is going to, how much energy it is carrying, and whether a planet on the path can bend the course. The cost of a direct transfer is set by the two orbits, which is why an inner base stays cheaper. Where the planets sit decides whether that direct path is open today, and whether a third body can cheapen it.

Solscrip has no weight. The drive still needs energy to leave. The Earth station buys only the surplus above the burn home. A ship that arrives with nothing above that reserve can leave, and it has nothing to sell.

- **Stuck:** Below the reserve, the ship stays in its current orbit. At the Sun, if the satellite still holds energy, the ship keeps siphoning until it can leave. If the satellite is empty, the ship undocks to the outer orbit and can be attacked until the alignment makes the departure cheap enough. At home, the ship waits until the warehouse can cover the departure, or until the alignment makes it cheaper. At a body, the ship was not loaded past what it can lift, and it waits out a bad alignment in the outer orbit.
- **Heavier costs more:** The same change in speed takes more energy when the ship is carrying more energy or more minerals. Past a point the cargo is so heavy that what is left cannot buy the trip. Siphoning stops before that point even if the satellite still holds energy. That is why a drained satellite is not always a full ship.
- **Assist:** A gravity assist is the efficient burn. The ship is already moving at orbital speed, and a close pass lets a planet's gravity change that speed, so the engines spend less stored energy to reach the next orbit. The Sun and any planet can be that pass. It works only when the planet is in the part of its orbit that bends the ship toward the destination. A course can use more than one planet. Venus and the other inner planets bend courses toward the Sun and across the inner system. Jupiter, Saturn, Uranus, and Neptune bend courses outward, including the course in to that planet's own moons. A pilot bound the other way uses the same pass. A close pass in the wrong month saves nothing. A wide path stays clear of the planet, spends the full reserve, and leaves the hull alone. A close path on a good alignment spends less energy, arrives sooner, and wears the shields and hull down.
- **Recall:** A defeated ship is still sent home to the repair bay. The victor takes the energy and the Solscrip that were aboard. The recall does not deliver a cargo.

Each system has a wormhole at its edge. A ship leaving for another system travels to that wormhole and arrives at the wormhole of the target system. Other systems cannot be entered yet. What that hop costs is not set.

### Outer orbit and inner orbit

Every body has the same two orbits. A moon's outer orbit is its own battle surface, not the planet's.

- **Outer orbit:** The battle surface. A ship sitting here can be attacked. A ship on a photon burn between bodies cannot. From here the player can scan the inner orbit.
- **Inner orbit:** The work. Mining, docking, and siphoning happen here. The fight is not fought here. Travel inside it is the slow impulse rocket.

Travel between bodies is a photon burn from outer orbit to outer orbit. Moving between the inner orbit and the outer orbit is the slow impulse.

A ship in an outer orbit can challenge a ship that is mining that body, or a ship sitting idle in that outer orbit. The challenge pulls a mining ship out to the outer orbit, and the work pauses. If the ship wins, it goes back and continues. If it loses, it goes home to the repair bay.

A mine that runs empty undocks the ship to the outer orbit. If the ship was sent home, it leaves from there. If it was not, it stays in the outer orbit with the cargo, and it can be attacked. Undocking before the mine is empty does the same: the ship comes out with whatever it has. A finished sale at Earth does the same: the ship undocks into the outer orbit and can be attacked.

A siphon works the same way as a mine. An attack pulls the ship out to the outer orbit, and the siphon pauses. If the ship wins, it goes back and continues. If it loses, it goes home.

The Moon is the exception: it is not a combat zone.

A cloak is the only defense. While a ship is away from base, a cloak makes it consume energy faster. Other ships cannot detect it. A scan can. A cloaked ship cannot be attacked. The energy a trip costs has to include the cloak the pilot means to run.

### The Earth sale

Earth has no mineable resources and no pilot bases. Its satellite is the black market. The outer orbit is where a ship can be attacked. The inner orbit holds the station. The transfer takes time. An attack pulls the ship out to the outer orbit. If the ship wins, it goes back and the transfer continues. If it loses before the transfer finishes, the cargo is still energy, and the victor takes it. When the transfer finishes, the station pays Solscrip onto the ship for the surplus above the burn home and undocks it into the outer orbit. The station does not store energy, and it does not bank Solscrip.

That Solscrip stays on the ship until the ship reaches its home base and banks it. Until then, another pilot can take it wherever an attack is allowed: the outer orbit of a planet or moon, and not the Moon. A defeat sends the loser home to repair and gives the victor whatever unbanked Solscrip or energy was aboard. Stolen Solscrip is not banked either. The thief has to carry it to their own home. The Moon is the cheap hop to Earth's market, and it is not a combat zone, which is why a pilot who means to stay near the market lives there.

### Satellites

Each satellite holds a finite pool of solar energy, counted in the same cargo units as a mineral. The satellites belong to one galaxy-wide company. The company is not named. Siphoning one is theft, as that company sees it. When a satellite is drained, it must recharge from the Sun, and players move on to another.

Ships fight with their stats. The player does not steer the shots. A battle can finish while the player is away.

- **Harvest:** Dock at a collector and siphon until it is empty, or until another load would drop the ship under the reserve for today's departure. When the siphon stops, the ship undocks to the outer orbit with its haul. A departure plotted from the terminal is flown from there. A ship with no departure plotted stays in the outer orbit and can be attacked. An attack during the siphon pulls the ship out to the outer orbit, and the siphon pauses. If the ship wins, it goes back and continues. If it loses, it goes home. Undocking early brings the ship out with whatever it has.
- **Attack:** The fight is in the outer orbit, including a ship pulled out from a mine, a collector, or the station. A ship in that outer orbit can challenge a ship that is mining, or a ship sitting idle there after a mine runs empty or a sale finishes. A ship on a photon burn cannot be attacked. If the attacker wins, they take the energy and the Solscrip that were aboard, plus scrap from the wreck. The defender is sent home to the repair bay. The recall does not deliver a cargo.

## 4. Payload penalty

Combat power falls as cargo weight rises, so a full hauler is weaker than an empty ship.

Active combat power = hull strength + component bonuses + crew skills − payload weight.

Energy and minerals take the same space and the same weight, one cargo unit each. Solscrip does not. More units aboard raise the energy a burn consumes. Speed is adjusted by that weight.

- **Light:** A ship carrying little saleable energy, and few minerals, is fast and fires quickly. The run out to the Sun, and the run home from Earth with Solscrip, are light. The drive still keeps a reserve for the burn. With an empty tank, the ship cannot depart. The Solscrip ship fights at full strength, and it is carrying the whole payout.
- **Heavy:** Siphoned energy makes the ship heavy. So does a hold full of minerals. It turns slowly and its guns cycle slowly, on the way home to the warehouse, on the way to Earth's station, and on the way home from a mine. The player has to leave the Sun while the leftover energy can still pay for the trip.

## 5. Repair and recovery

Ships are never permanently destroyed.

- A defeated ship is sent back to the player's home base and locked in the repair bay. A home is never in Earth's orbit.
- Repairs and improvements are made at the home bay. They spend the minerals that part is built from. Each mineral, including what the home world offers, waits on what the ship has mined and brought back. Missing a mineral delays that work. It does not by itself keep the ship from flying.
- Banked Solscrip can be spent to finish an improvement sooner. It does not supply a missing mineral, and it does not shorten a repair. Another ship is bought with Solscrip at the black market. Minerals do not buy that hull.
- Repair time depends on the ship. A big cargo frigate takes longer than a light interceptor.
- A damaged ship that won, or survived, can be sent home early to repair before the next run.

## 6. The market

Earth is the black market in Sol. It is the one planet in this system that sells energy and yields nothing a ship can mine. Each other system has one such planet. Those systems cannot be entered yet.

Energy is sold at Earth's station for Solscrip. Solscrip is the currency. It is not cargo. This brief sets no prices. Whether a completed sale moves the price is not decided. Energy sitting in a home warehouse is not a sale.

- The transfer takes time. An attack pulls the ship out to the outer orbit. If the ship wins, it goes back and the transfer continues. If it loses before the transfer finishes, the cargo is still energy, and the victor takes it. That theft is not a completed sale.
- When the transfer finishes, the station pays Solscrip onto the ship for the surplus above the burn home and undocks the ship into the outer orbit. The ship can be attacked there. The station does not store energy, and it does not bank Solscrip.
- That Solscrip is banked only at the home base. Until then another pilot can take it. Stolen Solscrip is not banked either. The thief has to carry it home.
- Banked Solscrip can finish an improvement sooner, and it can buy another ship. It does not buy minerals. Minerals are mined at the body that yields them. Minerals are not bought or sold at Earth.
- Players hold energy in the home warehouse and sell when they choose. When the warehouse is full, the energy has to be sold to make room.

## 7. Screens

The phone and the PC play the same game. A tall layout and a wide layout are two arrangements of the same places. Flying, trading, repairing, plotting, and watching a fight are all available on both.

A player is in one place at a time. The places are listed below. How a player moves among the map surfaces, and which transitions release the current view and load the next one, is in [docs/surfaces.md](docs/surfaces.md). [STRATEGY.md](STRATEGY.md) holds the load rule.

- **Galaxy:** The Milky Way from above, with Sol among fourteen real star systems within 12 light years. Systems known to have no star, like the brown dwarfs Luhman 16 and WISE 0855−0714, are left out. Zoom in and zoom out are limited. A tap or a click on a system opens a popup. Only Sol can be entered. The others are real stars whose contents will be mostly invented. Each system has a wormhole at its edge. That hop is not a surface yet.
- **System:** The whole system. A tap on a planet or the Sun opens that body's outer orbit.
- **Planet outer orbit:** The planet and its moons. A tap on a moon opens that moon's outer orbit. This is the planet's battle surface.
- **Moon outer orbit:** The same framing as a planet's outer orbit, for that moon. It is its own battle surface, not the planet's.
- **Inner orbit:** The work. Mining, docking, and siphoning happen here, on a slow impulse rocket. The fight is not fought here. How a player gets here from an outer orbit is not settled, and zoom is not the way.
- **Base:** The warehouse, the repair bay, the bank, and the dock.
- **Terminal:** Flights, sell orders, repairs, and the next path, including the departure from a collector. It shows what that path costs with today's alignment, and what the return costs, whether the ship has enough aboard to depart, what the warehouse holds, and whether a load mined at the destination still leaves enough energy to come home.
- **Battle:** The playback of a fight, so the player can see how the ship, the shields, and the crew performed.

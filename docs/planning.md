# What still has to be decided

The brief already fixes the loop, the one black market, the three routes, outer orbit as the fight and inner orbit as the work, payload, repair, and that a ship is never destroyed. The player starts with one ship. Another ship is bought with Solscrip. Minerals improve and repair a ship. They do not buy a new hull. [STRATEGY.md](../STRATEGY.md) already fixes that the server owns the ships, the burns, and the fights, and that one place is on screen at a time.

This note is the rest. A blank here becomes a special case in code.

## Decided

- **Server clock.** The game needs a durable server clock. It may not exist yet. Travel, mining, siphoning, repair, the gravity boom, collector recharge, and the market all read it, including while the player is away. Lambda is unlikely to be that clock. An invocation does not keep time between calls. [STRATEGY.md](../STRATEGY.md) records the same limit.
- **Amounts vary.** Rates and capacities are not one fixed table. A starting value can exist, and the variant can change it. The classes are Miner, Warship, Explorer, and Hauler, five variants each. The axes are storage capacity, siphon speed, weapon strength, speed adjusted by weight, and energy burn rate. Hull strength is separate from the weapons. A ship carries one siphon, one thruster, one drill, and one cloak. Names and numbers are not locked. A ship has a siphon rate, and that rate can be improved. Raising it raises how fast the ship consumes a collector.
- **Units.** Minerals and energy share one cargo unit. One of either takes one space in the hold. Solscrip takes none, and it has no weight. The currency is Solscrip. No rates and no prices.
- **One market.** Earth is the black market in Sol. It yields nothing a ship can mine. Each other system has one such planet. Those systems cannot be entered yet. Whether a completed sale moves the price is not decided.
- **Travel names.** Inner orbit is a slow impulse rocket. Between bodies, a photon rocket. Alignment and a gravity assist still change the cost. Each system has a wormhole at its edge. The player always sees the trip and the return before departure.
- **Galaxy paths.** The galaxy shows active travel paths between systems. [surfaces.md](surfaces.md).

## Settle these before adding rules

- **Inner orbit entry.** [surfaces.md](surfaces.md). Zoom must stay a way to look. The brief already says a player in the outer orbit can scan inward. That sentence is not a chosen control.
- **The company name.** One galaxy-wide company owns the satellites. Siphoning one is theft, as that company sees it. The company is not named.
- **Whether the price moves.** A completed sale at Earth pays Solscrip. Whether that sale moves the price of energy is open. Do not invent a cycle for it.
- **Class numbers.** The four classes, five variants each, the five axes, hull strength, and the four ship parts are named as a structure. The variant names and the amounts are a feel pass in the math workbook. They are not locked.
- **More than one ship in flight.** The player starts with one ship and can buy another with Solscrip. It is open whether they can be in flight at the same time, and which one the player is looking at.
- **What the wormhole costs.** The hop is named. Other systems cannot be entered yet. The cost of leaving through one wormhole and arriving through another is not set.

## What varies

Amounts are rates and capacities, and they move. The brief sets no starting values. Each of these is a relationship that ship class, an upgrade, or the state of the world can change.

- Siphon rate: how fast a ship drinks a collector. Improving the rate increases consumption. The starting rate can differ by ship class.
- Mineral yield: how fast a mine pays, when it runs empty, and when it returns. The same mineral is the same wherever it is mined, so the rate belongs to the mineral, or the brief has to say otherwise. The starting rate can still differ by ship class.
- Which mineral each ship part spends, and how many. Missing one delays the work and does not ground the ship. Solscrip can shorten an upgrade and cannot replace the mineral or shorten a repair. Both of those need a time and a price.
- Warehouse size for energy, and for each mineral.
- Cargo. One mineral and one energy take the same space and the same weight. Solscrip does not. More units aboard raise the burn and lower combat power. The formula in the brief is hull + component bonuses + crew skills − payload weight. Components and crew skills are named and not defined.
- Burn cost from the orbit left, the orbit joined, the mass aboard, and whether a planet on the path can bend the course today. A ship cannot depart under the reserve. A siphon stops before the leftover energy cannot buy the trip. Both need the cost function. The wormhole hop needs one too, when a system can be entered.
- Collector capacity and how fast an empty one refills from the Sun.
- Gravity boom rate. Every home gets the same rate. It can cover a departure if the pilot waits. It does not replace a haul from the Sun. The wait and the haul need to be comparable. More home equipment comes later and is not listed.
- Energy price: the starting price in Solscrip per cargo unit, how far one completed sale moves it, if a sale moves it at all, and whether the price has a floor. A theft before the transfer finishes does not complete a sale. Solscrip paid is only the surplus above the burn home.

## Orders

Every order needs a start, a duration on the clock, what an attack does to it, and what is true when it finishes. The ones the loop already names:

- Place a home. Once, or movable later. Any planet or moon except Earth and the Sun. Two pilots can share a body. The brief does not say how many homes a body can hold, or whether a pilot can change home.
- Buy a ship. The player starts with one. Another is bought with Solscrip at Earth's black market. It is open whether they can be in flight at the same time, and which one the player is looking at.
- Plot a path. The player reads today’s alignment and chooses direct or assisted, cloak or not, and when to leave. The terminal shows the cost of the trip and of the return. The terminal is where that choice is made. The choices themselves are not a screen yet.
- Mine, siphon, sell, undock, bank, repair, upgrade. An attack pulls a ship out of a mine, a collector, or the station to the outer orbit and pauses the work. A win continues. A loss sends the ship home and does not deliver the cargo. A depleted mine or a finished sale leaves the ship idle in the outer orbit, where it can be attacked.
- Recall and early return. A defeated ship is sent home. A damaged ship that is still flying can be sent home early.

A new player needs a starting home, a starting ship, and enough energy and minerals to take the first trip. None of that is written.

## Combat that can finish alone

Fights resolve with the player away. Before that can be built:

- Who may start a fight. A ship in an outer orbit can challenge a ship that is mining that body, or a ship sitting idle in that outer orbit. Not the Moon. Not a ship on a photon burn between bodies. Not a cloaked ship. A scan can find a cloak. The scan’s cost, range, and chance are open.
- Which ship is the target when several share an orbit.
- Weapons, hit chance, range, and how long a fight takes. The player does not steer the shots. Weapon strength is an axis of ship class. The number is not set.
- What scrap is, and what it is spent on. The victor takes the energy, the Solscrip, and scrap. Stolen Solscrip is not banked until that pilot carries it home.
- What the playback has to show: the ship, the shields, and the crew. Shields are worn down by a close pass and spent in a fight. Their numbers are open.
- Two fights at once, and a ship that is already in one.

## The market

Earth pays Solscrip for energy. There is one station. Whether a completed sale moves the price is open. A theft before the transfer finishes is not a sale.

That needs the price numbers above, if a price moves at all, a warehouse big enough that holding is a choice, and a reason a pilot sometimes cannot wait. It does not need a mineral exchange. Minerals are not bought or sold.

## Other systems, when the brief allows them

The galaxy already draws real stars and refuses to enter them. A wormhole at the edge of each system is how a ship would leave. A vast set of systems is a content shape, not a new ruleset. Each new body is another place that loads on its own.

Before the first one can be entered, decide:

- What the wormhole costs, and that the terminal can show the trip and the return.
- Whether its energy is sold at that system's own black-market planet. Each system has one planet that sells energy and yields nothing else. A second market that pays for energy changes what the Earth sale is.
- Who authors the yields. The minerals and the counting rules in [solar-system-minerals.md](solar-system-minerals.md) are the pattern. Invented worlds still have to obey it, or the same mineral stops being the same mineral.
- What a season adds. Success, in the strategy, is further seasons and further places and players who stay. A season needs a list of new places and the rules those places are allowed to break. The storyline that frames those places is still thin, and that is on purpose.

## What the player has to be able to read

On a phone and on a desk, the same orders. For each surface, what is labeled, what a tap does, and what stays hidden until a scan or a terminal:

- Galaxy: systems, the popup, and, once trips exist, the paths. The wormhole is not a surface yet.
- System: bodies and the ships readable from that far out.
- Outer orbit: who can be attacked, and the way inward once that way exists.
- Inner orbit: collectors, the Earth station, mines, and the player’s own ships.
- Base and terminal: warehouse, bank, repair, and the cost of the next path with today’s alignment, including the return.
- Battle: the playback.

Zoom limits on the galaxy are already a rule. Zoom inside Sol must not become the way a surface changes.

## A loop that can be tested

The game is holdable when a pilot can do this, leave, and come back to a result:

Place a home. Mine minerals, including at home. Haul energy from the Sun. Spend energy to fly, and read the trip and the return before leaving. Sell at Earth's black market when the warehouse needs room or the price is worth it. Bank the Solscrip. Be attacked, or cloak, on an outer orbit that allows it, including while idle after a mine or a sale. Repair from mined minerals. Upgrade. Buy another ship when the Solscrip is there. Find the planets in a different place the next day, and have that change the cost of the same trip.

Until the server clock, the variable rates, the orders, and the inner-orbit entry exist, that loop cannot be played.

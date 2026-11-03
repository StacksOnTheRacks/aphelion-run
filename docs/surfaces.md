# Play surfaces

A player is in one place at a time. These are the map surfaces. Base, terminal, and battle are places too, and they are not one of these views. How the camera looks around inside a surface is separate from how the player changes surface. Zoom looks. It does not change the place.

Which of these release the current scene and load the next one is still open. The galaxy and the system are separate loads today. Everything inside Sol is one scene, and the camera moves between its surfaces. [STRATEGY.md](../STRATEGY.md) holds that rule.

## Galaxy

The Milky Way from above. Sol sits among fourteen real star systems within 12 light years. Systems known to have no star are left out.

Zoom in and zoom out are limited. Turning the view is allowed. A tap or a click on a system opens a popup over the galaxy. The popup is already in the game. Sol’s popup can enter the system. Alpha Centauri’s popup can enter its chart. Every other system’s popup says the space is uncharted and cannot be entered.

Active travel paths between systems are visible on this view.

## System

The whole system: the Sun, the planets, and the orbits readable from here.

A tap on a planet or the Sun opens that body’s outer orbit. A moon is not a target from here. Moons are picked from the planet’s outer orbit.

Leaving Sol returns to the galaxy, and that crossing loads the galaxy again.

Each system has a wormhole at its edge. A ship leaves through its own and arrives through the target's. That hop is not a camera surface. Alpha Centauri can be entered as a chart. Play stays in Sol. Other systems cannot be entered yet.

## Planet outer orbit

The planet and its moons. A tap on a moon opens that moon’s outer orbit. A tap on the planet comes in on the planet and stays on this chart. Zoom does the same. That framing is the one a moon chart uses: close enough to read the outer orbit. Planet, the corner step, pulls back out.

While the camera is still wide enough to take in the moons, the names are the planet and its moons. Nothing orbiting either is named. Once the camera comes in to that close orbit, the names are the planet and the craft that orbit it. The moons drop off.

This is the planet’s battle surface. A ship sitting here can be attacked. A ship on a photon burn between bodies cannot.

The Sun’s outer orbit uses this same role. Ships arrive there. The collectors sit further in. They belong to one galaxy-wide company. The company is not named. Siphoning one is theft, as that company sees it. Outside the close orbit the chart names the Sun. Inside it, the chart names the collectors too.

## Moon outer orbit

The same visual rules as a planet’s outer orbit. The current sky uses the same camera angles, frames the moon with room around it, and hides the orbit line that would cut across it. The moon arrives already framed on its own, so the names are the moon and the craft that orbit it.

A moon’s outer orbit is its own battle surface, not the planet’s. Earth’s Moon is the exception: it is not a combat zone.

## Inner orbit

Every body has one, including each moon and the Sun. Mining, docking, and siphoning happen here. The fight is not fought here. An attack pulls the ship out to the outer orbit, and the work pauses. Earth's inner orbit holds the black market, the one station where energy is sold for Solscrip. Earth yields nothing else.

Moving between the inner orbit and the outer orbit is an impulse rocket. A departure counts down five seconds, then the ship spends seven seconds leaving along its orbit. The cruise lasts as long as the chosen speed takes to cover the course, and that burn is what spends energy. Arriving spends seven seconds coming in along the orbit to the dock. A ship on that burn cannot be attacked. A ship in an outer orbit can challenge a ship that is mining that body. The honeycomb is that battle shell. A depleted mine, or a full hold, leaves the ship idle at that collector or mine until the player moves it. The source refills when the ship leaves. A finished Earth sale puts the ship in the inner orbit.

Open: there is no chosen way to go from a planet or moon outer orbit into its inner orbit. Zoom looks in at what orbits the body and stays on the chart the player is already on. On a planet, a moon, or the Sun, the wheel comes a little inside the inner-orbit framing and no farther. An inner orbit can come in that same step and cannot pull back. The system chart does not. A click on a mine, a collector, or the home base opens its card. View on that card is another zoom level: the camera holds on that craft, with the body it orbits in the frame and a ship when one is docked there. The camera can move around the craft and cannot zoom. Back, in the lower right, returns to the chart the player came from.

Whatever replaces it has to be the same action on a phone and on a desk, and it has to work when the player wants to look inward before choosing a craft. Changing the zoom must keep the player on the surface they are already on.

## Places that are not these views

- **Base.** The warehouse, the repair bay, the bank, and the dock. Ships are improved and repaired only here. Another hull is bought with Solscrip at Earth's black market.
- **Terminal.** Flights, sell orders, repairs, and the next path, including the departure from a collector. It shows what that path costs with today’s alignment, and what the return costs, whether the ship has enough aboard to depart, what the warehouse holds, and whether a load mined at the destination still leaves enough energy to come home.
- **Battle.** The playback of a fight.

The chart is the only view the player works from. The exterior camera stays in the scene so a later battle or another event can be framed on the hull from outside. Nothing in the ship list enters that camera.

The chart names what the framing is about, at most the ten nearest the camera, and only those can be picked. The system chart names the Sun and the planets. A planet chart names the planet and its moons until a tap or the wheel comes in on the planet, and then it names the planet and what orbits it. A moon chart names that moon and what orbits it. Swinging the camera names what comes around into view. A tap on the Sun, a planet, or a moon goes there. A tap on a home base, a station, a mine, or a collector opens a card. View, on a mine, a collector, or the home base, holds the camera on that craft. Travel To counts down five seconds, which can be cancelled, and then flies from wherever the ship sits. It is offered only while the ship is in orbit or docked, and not for the body the ship already orbits. A ship in flight cannot be rerouted.

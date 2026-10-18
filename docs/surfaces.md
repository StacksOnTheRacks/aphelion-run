# Play surfaces

A player is in one place at a time. These are the map surfaces. Base, terminal, and battle are places too, and they are not one of these views. How the camera looks around inside a surface is separate from how the player changes surface. Zoom looks. It does not change the place.

Which of these release the current scene and load the next one is still open. The galaxy and the system are separate loads today. Everything inside Sol is one scene, and the camera moves between its surfaces. [STRATEGY.md](../STRATEGY.md) holds that rule.

## Galaxy

The Milky Way from above. Sol sits among fourteen real star systems within 12 light years. Systems known to have no star are left out.

Zoom in and zoom out are limited. Turning the view is allowed. A tap or a click on a system opens a popup over the galaxy. The popup is already in the game. Sol’s popup can enter the system. Every other system’s popup says the space is uncharted and cannot be entered.

Active travel paths between systems are visible on this view.

## System

The whole system: the Sun, the planets, and the orbits readable from here.

A tap on a planet or the Sun opens that body’s outer orbit. A moon is not a target from here. Moons are picked from the planet’s outer orbit.

Leaving Sol returns to the galaxy, and that crossing loads the galaxy again.

Each system has a wormhole at its edge. A ship leaves through its own and arrives through the target's. That hop is not a camera surface. Other systems cannot be entered yet.

## Planet outer orbit

The planet and its moons. A tap on a moon opens that moon’s outer orbit.

This is the planet’s battle surface. A ship sitting here can be attacked. A ship on a photon burn between bodies cannot. From here the player can scan the inner orbit. That scan is named in the brief. It is not yet a control.

The Sun’s outer orbit uses this same role. Ships arrive there. The collectors sit further in. They belong to one galaxy-wide company. The company is not named. Siphoning one is theft, as that company sees it.

## Moon outer orbit

The same visual rules as a planet’s outer orbit. The current sky uses the same camera angles, frames the moon with room around it, and hides the orbit line that would cut across it.

A moon’s outer orbit is its own battle surface, not the planet’s. Earth’s Moon is the exception: it is not a combat zone.

## Inner orbit

Every body has one, including each moon and the Sun. Mining, docking, and siphoning happen here. The fight is not fought here. An attack pulls the ship out to the outer orbit, and the work pauses. Earth's inner orbit holds the black market, the one station where energy is sold for Solscrip. Earth yields nothing else.

Moving between the inner orbit and the outer orbit is a slow impulse rocket. Travel between bodies is a photon rocket from outer orbit to outer orbit. A ship on that burn cannot be attacked. A ship in an outer orbit can challenge a ship that is mining that body, or a ship sitting idle in that outer orbit. A depleted mine or a finished Earth sale puts the ship back in that idle orbit.

Open: there is no chosen way to go from a planet or moon outer orbit into its inner orbit. Zoom is the way the camera can get closer today, and it is the wrong mechanism. A click on a base, a station, or a collector currently flies the camera into the inner orbit and rides with that craft. That is also a stand-in. The replacement has not been decided.

Whatever replaces it has to be the same action on a phone and on a desk, and it has to work when the player wants to look inward before choosing a craft. Changing the zoom must keep the player on the surface they are already on.

## Places that are not these views

- **Base.** The warehouse, the repair bay, the bank, and the dock. Ships are improved and repaired only here. Another hull is bought with Solscrip at Earth's black market.
- **Terminal.** Flights, sell orders, repairs, and the next path, including the departure from a collector. It shows what that path costs with today’s alignment, and what the return costs, whether the ship has enough aboard to depart, what the warehouse holds, and whether a load mined at the destination still leaves enough energy to come home.
- **Battle.** The playback of a fight.

Chart and Pilot are camera modes, not surfaces. Chart is the system view above. Pilot puts the camera at the pilot's seat, looking out the windscreen, with an aft view on each side placed so the side thrusters show when they fire. The ranger has no modelled cabin, so the windscreen shows space and nothing of the ship. Dragging turns the pilot's head within a neck's reach, and a double click looks ahead again. A dashboard under the windscreen shows where the ship is: the whole system on one dial, the body it is at with its moons on another, and its bearing, course, and how far along the run it is. While piloting, the breadcrumb and scanning are hidden. One button in the lower right switches to whichever mode is not showing, at any time, in flight or docked.

Bodies and craft are not named on the chart. Scan sits beside the mode button in Chart. It names what is near: the bodies this view offers, the body it is on, and the craft circling any of them, at most the ten nearest the camera. Only those can be picked while it is on, so a craft too small to see can still be reached. A pick, on the scene or by its name, opens a card. View takes the camera to a body's outer orbit, or alongside a craft. Travel To counts down five seconds, which can be cancelled, and then flies from wherever the ship sits. It is offered only while the ship is in orbit or docked, and not for the body the ship already orbits. A ship in flight cannot be rerouted.

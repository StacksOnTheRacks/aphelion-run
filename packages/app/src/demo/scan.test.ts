import { STARTING_DOCK_ID } from "./energy";
import {
	DEPARTURE_SECONDS,
	bodyScan,
	destinationName,
	scanCard,
	recallMove,
	scanLabel,
	showsCard,
	secondsLeft,
	targetYields,
	travelAction,
	viewAction,
	type ScanTarget,
} from "./scan";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

const mars = bodyScan("mars");
const titan = bodyScan("titan");
const sun = bodyScan("sun");
const marsHome: ScanTarget = { id: "mars-warehouse-corporate-0", host: "mars", kind: "home", owner: "corporate" };
const earthStation: ScanTarget = { id: "earth-station-marauder-1", host: "earth", kind: "station", owner: "marauder" };
const collector: ScanTarget = { id: "satellites-empty-4", host: "sun", kind: "collector", owner: "empty" };
const marsOre: ScanTarget = { id: "mars-generator-ore", host: "mars", kind: "generator", resource: "ore" };
const phobosHydrogen: ScanTarget = { id: "phobos-generator-hydrogen", host: "phobos", kind: "generator", resource: "hydrogen" };

expect(sun.kind === "star" && mars.kind === "planet" && titan.kind === "moon", "a body's kind follows from its id");
expect(mars.host === "mars", "a body is its own host");

expect(scanCard(mars).label === "Mars" && scanCard(mars).kind === "Planet", "a planet's card names it");
expect(scanCard(titan).text.includes("Saturn"), "a moon's card names its planet");
expect(scanCard(marsHome).label === "Mars home base", "a home base is named for its body");
expect(scanCard(marsHome).owner === "Corporate", "a craft's card shows who holds it");
expect(scanCard(earthStation).label === "Earth station", "Earth's station is named for Earth");
expect(scanCard(collector).owner === "Unoccupied", "an empty collector reads as unoccupied");
expect(scanCard(marsOre).kind === "Generator" && scanCard(marsOre).label === "Ore mine", "a generator is named for its mineral");
expect(scanCard(marsOre).text.includes("ore") && scanCard(marsOre).text.includes("Mars"), "a generator's card says where it mines");
expect(scanCard(phobosHydrogen).label === "Hydrogen mine", "a moon's generator is named for its mineral");
expect(scanCard(mars).owner === undefined, "a body has no owner");

expect(targetYields(bodyScan("neptune")).join() === "hydrogen,nitrogen,carbon", "Neptune lists every mineral mined there");
expect(targetYields(bodyScan("triton")).join() === targetYields(bodyScan("neptune")).join(), "a moon yields what its planet yields");
expect(targetYields(bodyScan("moon")).length === 0 && targetYields(bodyScan("earth")).length === 0, "Earth and its Moon yield nothing");
expect(targetYields(sun).join() === "energy" && targetYields(collector).join() === "energy", "Sol and its collectors give energy");
expect(targetYields(marsOre).join() === "ore", "a mine yields its own mineral");
expect(destinationName(sun) === "Sol", "the star reads as Sol");
expect(destinationName(collector) === "a collector at Sol", "a collector reads with the body it circles");
expect(destinationName(earthStation) === "Earth's station", "the station reads as Earth's");
expect(destinationName(marsOre) === "the ore mine at Mars", "a generator reads as that mineral's mine");
expect(destinationName(phobosHydrogen) === "the hydrogen mine at Phobos", "a moon generator names the moon");

const idleAtEarth = { at: "earth", departing: false };
expect(travelAction(mars, idleAtEarth).enabled, "a ship at Earth can travel to Mars");
expect(travelAction(mars, idleAtEarth).label === "Travel To", "the action is Travel To");
expect(travelAction(marsHome, idleAtEarth).enabled, "a ship at Earth can travel to a craft at Mars");
expect(!travelAction(bodyScan("earth"), idleAtEarth).enabled, "a ship cannot travel to the body it is at");
expect(!travelAction(earthStation, idleAtEarth).enabled, "a trip within one body's orbit is not offered");
expect(!travelAction(mars, { at: null, departing: false }).enabled, "a ship in flight is not re-routed");
expect(travelAction(mars, { at: null, departing: false }).label === "En route", "a ship in flight says it is en route");
expect(!travelAction(mars, { at: "earth", departing: true }).enabled, "a second course cannot be set during the countdown");
expect(travelAction(bodyScan("earth"), { at: "titan", departing: false }).enabled, "a ship docked at Titan can head home");
expect(
	travelAction(mars, { at: "earth", departing: false, energy: 1000 }, 84).label === "Travel · 84",
	"a trip the ship can afford shows its cost"
);
expect(
	!travelAction(mars, { at: "earth", departing: false, energy: 40 }, 84).enabled &&
		travelAction(mars, { at: "earth", departing: false, energy: 40 }, 84).label === "Need 84",
	"a trip the ship cannot cover stays on the card"
);

const homeBase: ScanTarget = { id: STARTING_DOCK_ID, host: "earth", kind: "home", owner: "corporate" };
expect(scanCard(homeBase).label === "Home base" && scanCard(homeBase).kind === "Home base", "the starting station is the home base");
expect(scanCard(homeBase).owner === undefined, "the home base is not labeled as just another faction craft");
expect(scanCard(homeBase).text.includes("Recall"), "the home base says Recall returns there");
expect(destinationName(homeBase) === "home base", "a trip to the home base reads as home");
expect(scanLabel(homeBase) === "Home base", "the home base is named on the scene");

const homeRecall = { homeId: homeBase.id, homeHost: "earth", energy: 1000, cost: 40 };
expect(
	!recallMove({ ...homeRecall, dockId: homeBase.id, dockHost: "earth", departingTo: null, inFlight: false }).enabled,
	"Recall stays off while the ship is at home"
);
expect(
	recallMove({ ...homeRecall, dockId: "mars-warehouse-corporate-0", dockHost: "mars", departingTo: null, inFlight: false }).move === "depart",
	"Recall from another body sets a course home"
);
expect(
	recallMove({ ...homeRecall, dockId: "earth-station-marauder-1", dockHost: "earth", departingTo: null, inFlight: false }).move === "hop",
	"Recall from Earth's other station moves the ship onto the home dock"
);
expect(
	recallMove({ ...homeRecall, dockId: "mars-warehouse-corporate-0", dockHost: "mars", departingTo: homeBase.id, inFlight: false }).move === "cancel",
	"a countdown that is already headed home can be cancelled"
);
expect(
	recallMove({ ...homeRecall, dockId: "mars-warehouse-corporate-0", dockHost: "mars", departingTo: null, inFlight: true }).move === "abort-depart",
	"Recall during a trip away from home aborts it and heads home"
);
expect(
	!recallMove({ ...homeRecall, energy: 10, dockId: "mars-warehouse-corporate-0", dockHost: "mars", departingTo: null, inFlight: false }).enabled,
	"Recall stays off when the ship cannot pay for the cruise home"
);

expect(scanLabel(mars) === "Mars", "a scanned body is named on the scene");
expect(scanLabel(collector) === "Unoccupied collector", "a scanned collector reads by who holds it");
expect(scanLabel(marsHome) === "Corporate home base", "a scanned home base reads by who holds it");
expect(scanLabel(earthStation) === "Marauder station", "a scanned station reads by who holds it");
expect(scanLabel(marsOre) === "Ore mine", "a scanned generator reads by its mineral");

expect(!showsCard(mars) && !showsCard(titan) && !showsCard(sun), "a body is entered on click");
expect(showsCard(marsHome) && showsCard(earthStation) && showsCard(collector), "a home, a station, or a collector opens its card");
expect(showsCard(marsOre) && showsCard(phobosHydrogen), "a generator opens its card");
expect(travelAction(marsOre, idleAtEarth).enabled, "a ship at Earth can travel to a mine at Mars");

expect(viewAction(mars, "system").enabled, "a body can be viewed from the whole system");
expect(viewAction(mars, "mars-outer").enabled && viewAction(mars, "mars-outer").label === "View", "a wide planet chart can come in on the planet");
expect(!viewAction(mars, "mars-outer", true).enabled && viewAction(mars, "mars-outer", true).label === "In view", "a planet already framed close is in view");
expect(!viewAction(titan, "saturn-titan-outer").enabled, "a moon chart is already the direct view");
expect(viewAction(mars, "mars-inner").enabled, "from a body's inner orbit, View steps back out to its outer orbit");
expect(viewAction(collector, "sun-inner").enabled, "a craft can always be ridden alongside");
expect(viewAction(sun, "sun-outer").enabled, "the Sun's wide chart can come in on the Sun");
expect(!viewAction(sun, "sun-outer", true).enabled, "the Sun already framed close is in view");

const start = 1_000_000;
const ends = start + DEPARTURE_SECONDS * 1000;
expect(DEPARTURE_SECONDS === 5, "the countdown is five seconds");
expect(secondsLeft(ends, start) === 5, "the countdown starts at five");
expect(secondsLeft(ends, start + 1) === 5, "five holds until a whole second has gone");
expect(secondsLeft(ends, start + 4_100) === 1, "the last second reads one");
expect(secondsLeft(ends, ends) === 0, "the countdown ends at zero");
expect(secondsLeft(ends, ends + 500) === 0, "a late tick still reads zero");

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log(
	"scan cards name what was picked, View goes where the camera is not, Travel To leaves only from a dock or Earth, and the countdown runs five seconds"
);

import { centerFrame, centerHit, centerPage, navTargets, type NavControls } from "../nav-glass";
import { LOCAL_REACH, bearing, bodyLabel, findMine, localBody, localPoint, mineRows, nearbyMineChart, systemPoint, toggleMineOpen, type NavBody, type NavFix } from "./nav";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

const sun: NavBody = { id: "sun", x: 0, z: 0, radius: 14, outer: 40, parent: null };
const earth: NavBody = { id: "earth", x: 300, z: 0, radius: 4, outer: 20, parent: null };
const moon: NavBody = { id: "moon", x: 310, z: 0, radius: 1, outer: 4, parent: "earth" };
const neptune: NavBody = { id: "neptune", x: 0, z: -1000, radius: 6, outer: 30, parent: null };

function fixAt(x: number, z: number, hx = 0, hz = 1): NavFix {
	return { ship: { x, z, hx, hz }, bodies: [sun, earth, moon, neptune], edge: 1000, course: null };
}

const center = systemPoint({ x: 0, z: 0 }, 1000, 70);
expect(center.x === 0 && center.y === 0, "the Sun sits in the middle of the system map");
const rim = systemPoint({ x: 1000, z: 0 }, 1000, 70);
expect(Math.abs(rim.x - 70) < 1e-9 && Math.abs(rim.y) < 1e-9, "the outermost orbit lands on the rim");
const up = systemPoint({ x: 0, z: 250 }, 1000, 70);
expect(up.y < 0 && Math.abs(up.y + 35) < 1e-9, "+Z is up the map, and a quarter of the way out reads halfway");
const beyond = systemPoint({ x: 5000, z: 0 }, 1000, 70);
expect(beyond.x < 80, "a point past the outermost orbit stays near the rim");

const onRim = localPoint({ x: earth.x + earth.outer * LOCAL_REACH, z: earth.z }, earth, 60);
expect(Math.abs(onRim.x - 60) < 1e-9, "a body's reach lands on the rim of its local map");

expect(localBody(fixAt(311, 0))?.id === "earth", "a ship by a moon is at that moon's planet");
expect(localBody(fixAt(25, 0))?.id === "sun", "a ship near the Sun is at the Sun");
expect(localBody(fixAt(600, 600)) === null, "a ship between the bodies is in open space");

expect(bearing(fixAt(0, 0, 0, 1)) === 0, "heading up the map is a bearing of 0");
expect(bearing(fixAt(0, 0, 1, 0)) === 90, "heading +X is a bearing of 90");
expect(bearing(fixAt(0, 0, -1, 0)) === 270, "heading -X is a bearing of 270");

expect(bodyLabel("earth") === "Earth" && bodyLabel("sun") === "Sol", "bodies read by their names");

const glass = centerFrame(1024, 420);
const onTab = (index: number) => centerHit(1024, 420, glass.tabs[index].rect.x + 6, glass.tabs[index].rect.y + 6, "nav");
expect(onTab(0) === null && onTab(1) === null && onTab(2) === null, "the mode marks are not controls");
expect(centerPage(false) === "nav" && centerPage(true) === "mining", "drawing switches the glass to mining, and stopping returns it to navigation");
expect(
	centerHit(1024, 420, glass.content.x + glass.content.w - 8, glass.content.y + 8, "nav") === null,
	"navigation has no recall control"
);
expect(centerHit(1024, 420, glass.content.x + 8, glass.content.y + 8, "nav") === null, "the chart itself is not a control");

const chart = nearbyMineChart(fixAt(0, 0));
expect(chart[0]?.id === "mercury", "the nearest mine-bearing planet leads the list");
expect(chart.every((planet) => planet.id !== "earth"), "a planet with no mines is left out");
expect(!chart.some((planet) => planet.moons.some((moon) => moon.id === "moon")), "Earth's Moon has no mines to group");
const mars = chart.find((planet) => planet.id === "mars");
expect(mars?.moons[0]?.id === "phobos" && mars.moons[0].mines[0]?.id === "phobos-generator-ore", "moons group under their planet, and mines group under the moon");
expect(
	chart[0]?.mines.map((mine) => mine.id).join() === "mercury-generator-ore,mercury-generator-hydrogen",
	"a planet's own mines follow its yields"
);
expect(findMine("mars-generator-carbon")?.host === "mars", "a mine id is the dock the ship travels to");
const folded = mineRows(chart, null);
expect(folded[0]?.id === "mercury" && folded[0].open && folded[1]?.kind === "mine", "the nearest planet starts open on its mines");
expect(!folded.some((row) => row.kind === "moon" && row.open), "moons start closed");
expect(toggleMineOpen(chart, null, "phobos").includes("phobos") && toggleMineOpen(chart, null, "phobos").includes("mercury"), "opening a moon keeps the planet that was already open");
expect(!toggleMineOpen(chart, null, "mercury").includes("mercury"), "the nearest planet can be closed");

const planning: NavControls = { open: null, scroll: 0, selected: null, offer: null, blocked: null, countdown: null };
const targets = navTargets(1024, 420, fixAt(0, 0), planning);
const planetRow = targets?.rows.find((row) => row.kind === "planet");
const mineRow = targets?.rows.find((row) => row.kind === "mine");
const planetHit = planetRow ? centerHit(1024, 420, planetRow.rect.x + 8, planetRow.rect.y + 8, "nav", { fix: fixAt(0, 0), controls: planning, energy: 1000 }) : null;
const mineHit = mineRow ? centerHit(1024, 420, mineRow.rect.x + 8, mineRow.rect.y + 8, "nav", { fix: fixAt(0, 0), controls: planning, energy: 1000 }) : null;
expect(planetHit?.type === "toggle" && planetHit.id === "mercury", "a planet row opens and closes");
expect(mineHit?.type === "mine" && mineHit.id === "mercury-generator-ore", "a mine row is the one that can be traveled to");
expect(
	centerHit(1024, 420, glass.tabs[0].rect.x + 6, glass.tabs[0].rect.y + 6, "nav", { fix: fixAt(0, 0), controls: planning, energy: 1000 }) === null,
	"the mode marks stay labels while planning"
);

const offered: NavControls = {
	...planning,
	selected: "mercury-generator-ore",
	offer: { name: "Ore mine", speed: 4, minSpeed: 1, maxSpeed: 9, seconds: 90, cost: 120, reserve: 40 },
};
const offerTargets = navTargets(1024, 420, fixAt(0, 0), offered);
const slow = offerTargets?.speed
	? centerHit(1024, 420, offerTargets.speed.x + 1, offerTargets.speed.y + 4, "nav", { fix: fixAt(0, 0), controls: offered, energy: 1000 })
	: null;
const fast = offerTargets?.speed
	? centerHit(1024, 420, offerTargets.speed.x + offerTargets.speed.w - 1, offerTargets.speed.y + 4, "nav", { fix: fixAt(0, 0), controls: offered, energy: 1000 })
	: null;
const depart = offerTargets?.depart
	? centerHit(1024, 420, offerTargets.depart.x + 8, offerTargets.depart.y + 8, "nav", { fix: fixAt(0, 0), controls: offered, energy: 1000 })
	: null;
const poor = offerTargets?.depart
	? centerHit(1024, 420, offerTargets.depart.x + 8, offerTargets.depart.y + 8, "nav", { fix: fixAt(0, 0), controls: offered, energy: 10 })
	: null;
const notch = offerTargets?.slower
	? centerHit(1024, 420, offerTargets.slower.x + 4, offerTargets.slower.y + 4, "nav", { fix: fixAt(0, 0), controls: offered, energy: 1000 })
	: null;
expect(slow?.type === "speed" && fast?.type === "speed" && slow.speed < fast.speed, "the track sets the coast speed");
expect(notch?.type === "speed" && notch.speed === 3.9, "a step lowers the coast by a tenth");
expect(depart?.type === "depart", "a coast the tank can pay is locked from the glass");
expect(poor === null, "a coast the tank cannot pay is not a control");

const counting: NavControls = { ...planning, countdown: { seconds: 4, name: "Ore mine" } };
expect(navTargets(1024, 420, fixAt(0, 0), counting) === null, "the countdown is not a list");
const underway = fixAt(0, 0);
underway.course = {
	points: [
		{ x: 0, z: 0 },
		{ x: 10, z: 0 },
	],
	progress: 0.2,
	name: "Mercury",
	remaining: 40,
	total: 80,
	spent: [],
	spending: false,
};
expect(centerHit(1024, 420, glass.content.x + 8, glass.content.y + 8, "nav", { fix: underway, controls: planning, energy: 1000 }) === null, "en route does not take a course");

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("the dashboard maps squeeze the system onto a dial, find the body the ship is at, and read its bearing");

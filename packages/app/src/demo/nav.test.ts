import { centerFrame, centerHit, centerPage } from "../nav-glass";
import { LOCAL_REACH, bearing, bodyLabel, localBody, localPoint, systemPoint, type NavBody, type NavFix } from "./nav";

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
const home = centerHit(1024, 420, glass.home.x + 8, glass.home.y + 8, "nav");
expect(home?.kind === "home", "home sits on the navigation page");
expect(centerHit(1024, 420, glass.home.x + 8, glass.home.y + 8, "mining") === null, "home is not a control on the mining page");
expect(centerHit(1024, 420, glass.content.x + 8, glass.content.y + 8, "nav") === null, "the chart itself is not a control");

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("the dashboard maps squeeze the system onto a dial, find the body the ship is at, and read its bearing");

import type { NavBody, NavFix } from "./demo/nav";
import { holdStock, paintCenterPanel } from "./nav-glass";
import { travelShare } from "./travel-clock";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

const sun: NavBody = { id: "sun", x: 0, z: 0, radius: 14, outer: 40, parent: null };
const earth: NavBody = { id: "earth", x: 300, z: 0, radius: 4, outer: 20, parent: null };
const moon: NavBody = { id: "moon", x: 310, z: 0, radius: 1, outer: 4, parent: "earth" };

function fixAt(x: number, z: number): NavFix {
	return { ship: { x, z, hx: 0, hz: 1 }, bodies: [sun, earth, moon], edge: 1000, course: null };
}

function recordingContext(): { context: CanvasRenderingContext2D; texts: string[]; sweeps: () => number; arcs: () => number } {
	const texts: string[] = [];
	let sweeps = 0;
	let arcs = 0;
	const gradient = { addColorStop() {} };
	const context = new Proxy({} as CanvasRenderingContext2D, {
		get(_target, prop) {
			if (prop === "fillText") {
				return (text: string) => {
					texts.push(String(text));
				};
			}
			if (prop === "measureText") {
				return (text: string) => ({ width: String(text).length * 8 });
			}
			if (prop === "arc") {
				return () => {
					arcs += 1;
				};
			}
			if (prop === "createConicGradient") {
				return () => {
					sweeps += 1;
					return gradient;
				};
			}
			if (prop === "createLinearGradient") {
				return () => gradient;
			}
			return () => {};
		},
		set() {
			return true;
		},
	});
	return { context, texts, sweeps: () => sweeps, arcs: () => arcs };
}

Object.assign(globalThis, {
	window: {
		matchMedia: () => ({ matches: false }),
	},
});

const stock = holdStock(1000, { Ore: 12 });
const nav = { page: "nav" as const };
expect(
	stock.energy === 1000 &&
		stock.energyCapacity === 3000 &&
		stock.cargo === 12 &&
		stock.cargoCapacity === 2000 &&
		stock.counts.map((line) => `${line.label}:${line.amount}`).join() === "Hydrogen:0,Ore:12,Nitrogen:0,Carbon:0",
	"the hold lists energy, one shared cargo total, and each mineral count"
);

{
	const drawn = recordingContext();
	paintCenterPanel(drawn.context, 1024, 328, fixAt(600, 600), stock, nav);
	const openSpace = drawn.texts.filter((text) => text === "OPEN SPACE");
	expect(drawn.texts.includes("SOL"), "open space shows the system dial");
	expect(openSpace.length === 1, "open space is only the place reading, not a second dial");
	expect(drawn.sweeps() === 1, "the system dial is the one that sweeps");
	expect(!drawn.texts.includes("HOME"), "navigation has no recall control");
	expect(drawn.texts.includes("HOLD") && drawn.texts.includes("ORE") && drawn.texts.includes("12"), "navigation lists what is in the hold");
	expect(drawn.texts.includes("HYDROGEN") && drawn.texts.includes("0"), "an empty mineral still shows its count");
	expect(!drawn.texts.includes("ENERGY") && !drawn.texts.includes("FUEL"), "the tank and the burn chart stay off until they apply");
}

{
	const drawn = recordingContext();
	paintCenterPanel(drawn.context, 1024, 328, fixAt(300, 0), stock, nav);
	expect(drawn.texts.includes("EARTH") && drawn.texts.includes("EARTH ORBIT"), "at a body the dial is that orbit");
	expect(!drawn.texts.includes("SOL") && !drawn.texts.includes("OPEN SPACE"), "the system dial and the open-space chart stay off");
	expect(drawn.sweeps() === 0, "the local dial does not sweep");
}

{
	const drawn = recordingContext();
	paintCenterPanel(drawn.context, 1024, 328, fixAt(300, 0), stock, { page: "mining" });
	expect(drawn.sweeps() === 0, "the mining page does not sweep");
	expect(drawn.texts.includes("ENERGY") && drawn.texts.includes("1,000"), "the hold shows the energy aboard");
	expect(drawn.texts.includes("ORE") && drawn.texts.includes("12"), "a counted mineral shows in the hold");
	expect(drawn.texts.includes("CARGO") && drawn.texts.includes("12"), "the minerals share one cargo total");
	expect(drawn.texts.includes("HYDROGEN") && drawn.texts.includes("0"), "an empty mineral still shows its count");
	expect(!drawn.texts.includes("HOME"), "mining has no recall control");
}

{
	const drawn = recordingContext();
	paintCenterPanel(drawn.context, 1024, 328, fixAt(300, 0), stock, { page: "battle" });
	expect(drawn.texts.includes("STANDBY") && drawn.texts.includes("NO WEAPONS ARE FITTED"), "battle is the standby page");
	expect(drawn.sweeps() === 0, "the standby page does not sweep");
}

{
	const idle = recordingContext();
	const flying = recordingContext();
	const underway: NavFix = {
		...fixAt(600, 600),
		course: {
			points: [
				{ x: 300, z: 0 },
				{ x: 600, z: 600 },
			],
			progress: 0.3,
			name: "Mars",
			remaining: 84,
			total: 120,
			spent: [0, 4, 12, 20, 24],
		},
	};
	paintCenterPanel(idle.context, 1024, 328, fixAt(600, 600), stock, nav);
	paintCenterPanel(flying.context, 1024, 328, underway, stock, nav);
	expect(flying.texts.includes("1:24"), "a trip shows the time left");
	expect(flying.texts.includes("MARS"), "the course name stays on the panel");
	expect(flying.texts.includes("FUEL") && flying.texts.includes("24"), "the burn chart sits with the clock and reads the energy spent");
	expect(!idle.texts.includes("1:24") && !idle.texts.includes("FUEL"), "a berthed ship has no travel clock and no burn chart");
	expect(flying.arcs() === idle.arcs() + 2, "the countdown is a ring around the time");
	expect(travelShare(84, 120) === 0.7, "the ring is the share of the trip still ahead");
	expect(travelShare(0, 120) === 0, "an arrived trip leaves the ring empty");
	expect(travelShare(200, 120) === 1, "the ring does not pass a full turn");
	expect(travelShare(10, 0) === 0, "a trip with no length draws no share");
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

console.log("the center glass swaps pages, the dial follows the ship, and both pages list the hold");

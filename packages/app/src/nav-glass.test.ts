import type { NavBody, NavFix } from "./demo/nav";
import { holdStock, paintCenterPanel } from "./nav-glass";

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

function recordingContext(): { context: CanvasRenderingContext2D; texts: string[]; sweeps: () => number } {
	const texts: string[] = [];
	let sweeps = 0;
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
	return { context, texts, sweeps: () => sweeps };
}

Object.assign(globalThis, {
	window: {
		matchMedia: () => ({ matches: false }),
	},
});

const stock = holdStock(1000, { Ore: 12 });
expect(
	stock.energy === 1000 &&
		stock.containers.map((line) => `${line.label}:${line.amount}`).join() === "Hydrogen:0,Ore:12,Nitrogen:0,Carbon:0",
	"the hold lists energy and the mineral containers, empty until counted"
);

{
	const drawn = recordingContext();
	paintCenterPanel(drawn.context, 1024, 328, fixAt(600, 600), stock);
	const openSpace = drawn.texts.filter((text) => text === "OPEN SPACE");
	expect(drawn.texts.includes("SOL"), "open space shows the system dial");
	expect(openSpace.length === 1, "open space is only the place reading, not a second dial");
	expect(drawn.sweeps() === 1, "the system dial is the one that sweeps");
	expect(drawn.texts.includes("ENERGY") && drawn.texts.includes("1,000"), "the hold shows the energy aboard");
	expect(drawn.texts.includes("ORE") && drawn.texts.includes("12"), "a counted mineral shows in the hold");
	expect(drawn.texts.includes("HYDROGEN") && drawn.texts.includes("0"), "an empty container still shows");
}

{
	const drawn = recordingContext();
	paintCenterPanel(drawn.context, 1024, 328, fixAt(300, 0), stock);
	expect(drawn.texts.includes("EARTH") && drawn.texts.includes("EARTH ORBIT"), "at a body the dial is that orbit");
	expect(!drawn.texts.includes("SOL") && !drawn.texts.includes("OPEN SPACE"), "the system dial and the open-space chart stay off");
	expect(drawn.sweeps() === 0, "the local dial does not sweep");
	expect(drawn.texts.includes("1,000"), "the hold stays up beside the local dial");
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

console.log("the center dial swaps with the ship, and the hold lists the containers");

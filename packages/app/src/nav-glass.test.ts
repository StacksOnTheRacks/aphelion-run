import { nearbyMineChart, type NavBody, type NavFix } from "./demo/nav";
import { holdStock, paintCenterPanel, type NavControls } from "./nav-glass";
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
	const nearest = nearbyMineChart(fixAt(600, 600))[0];
	paintCenterPanel(drawn.context, 1024, 328, fixAt(600, 600), stock, nav);
	expect(drawn.texts.includes("NAV PLANNING"), "a ship with no course is planning");
	expect(drawn.texts.includes(nearest.label.toUpperCase()), "planning lists the nearest planet");
	expect(drawn.texts.includes(nearest.mines[0].label.toUpperCase()), "the nearest planet opens onto its mines");
	expect(!drawn.texts.includes("OPEN SPACE") && !drawn.texts.includes("SOL"), "planning does not draw the system dial");
	expect(drawn.sweeps() === 0, "planning does not sweep");
	expect(!drawn.texts.includes("HOME"), "navigation has no recall control");
	expect(drawn.texts.includes("12") && drawn.texts.filter((text) => text === "0").length === 3, "navigation counts what is in the cargo");
	expect(!drawn.texts.includes("CARGO") && !drawn.texts.includes("ORE") && !drawn.texts.includes("HYDROGEN"), "the cargo strip has no labels");
	expect(!drawn.texts.includes("HOLD"), "the cargo strip is not labeled hold");
	expect(drawn.texts.includes("ENERGY") && drawn.texts.includes("1,000"), "navigation shows the energy aboard");
	expect(!drawn.texts.includes("FUEL") && !drawn.texts.includes("RUN") && !drawn.texts.includes("LEFT"), "the gauge is energy, and the run line is gone");
	expect(drawn.texts.includes("SELECT A MINE"), "planning waits for a mine");
}

{
	const drawn = recordingContext();
	paintCenterPanel(drawn.context, 1024, 328, fixAt(300, 0), stock, nav);
	expect(drawn.texts.includes("NAV PLANNING") && !drawn.texts.includes("EARTH ORBIT"), "at a body the glass is still planning");
	expect(!drawn.texts.includes("SOL") && !drawn.texts.includes("OPEN SPACE"), "the system dial and the open-space chart stay off");
	expect(drawn.sweeps() === 0, "planning does not sweep");
}

{
	const drawn = recordingContext();
	paintCenterPanel(drawn.context, 1024, 328, fixAt(300, 0), stock, { page: "mining" });
	expect(drawn.sweeps() === 0, "the mining page does not sweep");
	expect(drawn.texts.includes("NO CONTACT"), "mining with no dock names that");
	expect(drawn.texts.includes("12") && drawn.texts.filter((text) => text === "0").length === 3, "mining still counts the cargo");
	expect(!drawn.texts.includes("CARGO") && !drawn.texts.includes("ORE") && !drawn.texts.includes("HYDROGEN"), "the cargo strip has no labels");
	expect(!drawn.texts.includes("HOME"), "mining has no recall control");
}

{
	const drawn = recordingContext();
	paintCenterPanel(drawn.context, 1024, 328, fixAt(300, 0), stock, {
		page: "mining",
		source: { kind: "generator", resource: "ore", remaining: 1500, capacity: 2000 },
	});
	expect(drawn.texts.includes("MINE") && drawn.texts.includes("REMAINING") && drawn.texts.includes("1,500"), "mining shows the load still in the dock");
	expect(drawn.texts.includes("CONTAINED") && drawn.texts.includes("2,000"), "mining shows the load the dock contained");
	expect(drawn.texts.includes("ORE"), "mining names the dock in the header");
	expect(drawn.texts.includes("12") && !drawn.texts.includes("CARGO") && !drawn.texts.includes("HYDROGEN"), "mining keeps the cargo counts and drops their names");
}

{
	const drawn = recordingContext();
	paintCenterPanel(drawn.context, 1024, 328, fixAt(300, 0), stock, { page: "battle" });
	expect(drawn.texts.includes("STANDBY") && drawn.texts.includes("NO WEAPONS ARE FITTED"), "battle is the standby page");
	expect(drawn.texts.includes("12") && drawn.texts.filter((text) => text === "0").length === 3, "battle counts the cargo too");
	expect(!drawn.texts.includes("CARGO") && !drawn.texts.includes("ORE"), "the cargo strip has no labels");
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
			spending: true,
		},
	};
	paintCenterPanel(idle.context, 1024, 328, fixAt(600, 600), stock, nav);
	paintCenterPanel(flying.context, 1024, 328, underway, stock, nav);
	expect(flying.texts.includes("EN ROUTE"), "a course already set is en route");
	expect(!flying.texts.includes("NAV PLANNING") && !idle.texts.includes("EN ROUTE"), "planning and en route are the two nav states");
	expect(flying.texts.includes("1:24"), "a trip shows the time left");
	expect(flying.texts.includes("MARS"), "the course name stays on the panel");
	expect(flying.texts.includes("ENERGY") && flying.texts.includes("1,000"), "the energy gauge stays up during a trip");
	expect(!flying.texts.includes("FUEL") && !flying.texts.includes("LEFT") && !flying.texts.includes("RUN") && !flying.texts.includes("30%"), "the gauge is not fuel and the run line is gone");
	expect(!flying.texts.includes("24"), "the gauge does not plot the energy spent");
	expect(!idle.texts.includes("1:24") && idle.texts.includes("ENERGY") && idle.texts.includes("1,000"), "a berthed ship has no travel clock and still shows its energy");
	expect(!idle.texts.includes("FUEL") && !idle.texts.includes("RUN"), "a berthed ship has no fuel gauge and no run line");
	expect(flying.arcs() > idle.arcs(), "the en route clock adds rings the planning list does not draw");
	expect(travelShare(84, 120) === 0.7, "the ring is the share of the trip still ahead");
	expect(travelShare(0, 120) === 0, "an arrived trip leaves the ring empty");
	expect(travelShare(200, 120) === 1, "the ring does not pass a full turn");
	expect(travelShare(10, 0) === 0, "a trip with no length draws no share");
}

{
	const drawn = recordingContext();
	const countdown: NavControls = {
		open: null,
		scroll: 0,
		selected: null,
		offer: null,
		blocked: null,
		countdown: { seconds: 5, name: "Ore mine" },
	};
	paintCenterPanel(drawn.context, 1024, 328, fixAt(600, 600), stock, { page: "nav", nav: countdown });
	expect(drawn.texts.includes("NAV PLANNING") && drawn.texts.includes("DEPARTING") && drawn.texts.includes("5"), "a locked coast counts down before the ship moves");
	expect(drawn.texts.includes("ORE MINE"), "the countdown names the mine");
	expect(!drawn.texts.includes("SELECT A MINE") && drawn.sweeps() === 0, "the list and the dial wait until the countdown is over");
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

console.log("the center glass swaps pages, the dial follows the ship, and every page counts the cargo");

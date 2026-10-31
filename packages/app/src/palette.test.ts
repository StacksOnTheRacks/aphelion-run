import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { CARBON, elementColor, ENERGY, palette, type ElementId } from "./palette";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

/** Hue in degrees. A near-gray is unstable, so callers skip low saturation. */
function hueAndSat(hex: string): { hue: number; sat: number } {
	const n = Number.parseInt(hex.slice(1), 16);
	const rf = ((n >> 16) & 255) / 255;
	const gf = ((n >> 8) & 255) / 255;
	const bf = (n & 255) / 255;
	const max = Math.max(rf, gf, bf);
	const min = Math.min(rf, gf, bf);
	const d = max - min;
	const sat = max === 0 ? 0 : d / max;
	if (d === 0) {
		return { hue: 0, sat };
	}
	let h = 0;
	if (max === rf) {
		h = ((gf - bf) / d) % 6;
	} else if (max === gf) {
		h = (bf - rf) / d + 2;
	} else {
		h = (rf - gf) / d + 4;
	}
	return { hue: (h * 60 + 360) % 360, sat };
}

for (const hex of ENERGY) {
	const { hue, sat } = hueAndSat(hex);
	if (sat < 0.2) {
		continue;
	}
	expect(hue >= 34 && hue <= 52, `${hex} stays on the gold, hue ${hue.toFixed(1)}`);
}

const bronze = hueAndSat(palette.bronze);
const copper = hueAndSat(palette.copper);
expect(copper.hue < bronze.hue - 8, "ore stays redder than a collector");
expect(copper.hue >= 16 && copper.hue <= 26, "ore stays copper");

const ion = hueAndSat(palette.ion);
expect(ion.hue >= 180 && ion.hue <= 210, "hydrogen stays the one cool color");
const nitrogen = hueAndSat(palette.nitrogen);
expect(nitrogen.hue >= 220 && nitrogen.hue <= 250, "nitrogen stays a dusty blue");
expect(CARBON === palette.bone, "carbon wears bone");
expect(elementColor.hydrogen === palette.ion, "hydrogen wears ion");
expect(elementColor.ore === palette.copper, "ore wears copper");
expect(elementColor.nitrogen === palette.nitrogen, "nitrogen wears its own blue");
expect(elementColor.carbon === CARBON, "the carbon mark wears bone");
expect(elementColor.energy === palette.gold, "energy wears gold");

const ICON_FILE: Record<ElementId, string> = {
	hydrogen: "helium-3.svg",
	ore: "rare-ore.svg",
	nitrogen: "oxygen.svg",
	carbon: "plasma.svg",
	energy: "sun.svg",
};
const iconDir = join(import.meta.dirname, "../public/hud");
for (const id of Object.keys(ICON_FILE) as ElementId[]) {
	const svg = readFileSync(join(iconDir, ICON_FILE[id]), "utf8");
	expect(svg.includes(`stroke="${elementColor[id]}"`), `${id} icon is stroked in ${elementColor[id]}`);
	if (id !== "energy") {
		expect(!svg.toLowerCase().includes("#ffd73d"), `${id} icon leaves the gold to energy`);
	}
}

/** Colors that split the gold into a second warm paint. */
const FORBIDDEN = ["#C8641E", "#E07A2E", "#E9A92A", "#ED6617", "#FCD34D", "#E2B15A", "#6C7CFF"];

function filesIn(dir: string): string[] {
	const found: string[] = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			found.push(...filesIn(path));
		} else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts")) {
			found.push(path);
		}
	}
	return found;
}

const root = join(import.meta.dirname, ".");
for (const path of filesIn(root)) {
	const text = readFileSync(path, "utf8");
	for (const hex of FORBIDDEN) {
		expect(!text.toLowerCase().includes(hex.toLowerCase()), `${path} still uses ${hex}`);
	}
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

import { PILOT_MIN_HEIGHT, PILOT_MIN_WIDTH, pilotViewportFits } from "./pilot-viewport";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

{
	expect(pilotViewportFits(1440, 900), "a desktop window has room for the cockpit");
	expect(pilotViewportFits(PILOT_MIN_WIDTH, PILOT_MIN_HEIGHT), "the large-tablet size is the smallest that fits");
	expect(pilotViewportFits(1024, 768), "a large tablet in landscape fits");
	expect(pilotViewportFits(768, 1024), "a large tablet in portrait fits");
}

{
	expect(!pilotViewportFits(390, 844), "a phone in portrait is too narrow");
	expect(!pilotViewportFits(844, 390), "a phone on its side is wide enough and still too short");
	expect(!pilotViewportFits(932, 430), "a large phone on its side stays on the chart");
	expect(!pilotViewportFits(PILOT_MIN_WIDTH - 1, 900), "one pixel under the width stays on the chart");
	expect(!pilotViewportFits(1280, PILOT_MIN_HEIGHT - 1), "a short window stays on the chart");
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

console.log("the cockpit fits a desktop or a large tablet, and not a phone");

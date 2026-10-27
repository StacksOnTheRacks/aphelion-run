import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { EXTERIOR_HOME, EXTERIOR_RADIUS, exteriorOffset, orbitFromDrag, paintFeedLabel } from "./cockpit";
import { CANOPY_GLASS, canopyGlassAlpha } from "./ranger";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

function lengthOf(point: Vector3): number {
	return Math.hypot(point.x, point.y, point.z);
}

{
	const astern = exteriorOffset({ yaw: 0, pitch: 0 });
	expect(Math.abs(astern.x) < 1e-9 && Math.abs(astern.y) < 1e-9 && astern.z < 0, "yaw zero sits on the tail");
	expect(Math.abs(lengthOf(astern) - EXTERIOR_RADIUS) < 1e-6, "the tail view is one radius out");
}

{
	const home = exteriorOffset(EXTERIOR_HOME);
	expect(home.z < 0, "the camera starts astern");
	expect(home.y > 0, "the camera starts above the ship");
	expect(home.x > 0, "the camera starts to starboard");
	expect(Math.abs(lengthOf(home) - EXTERIOR_RADIUS) < 1e-6, "the opening view stays one radius out");
}

{
	const quarter = exteriorOffset({ yaw: 1.2, pitch: 0.4 });
	expect(quarter.x > 0 && quarter.y > 0, "a starboard climb sits up and to the right");
	expect(Math.abs(lengthOf(quarter) - EXTERIOR_RADIUS) < 1e-6, "an angled orbit stays on the sphere");
}

{
	const swung = orbitFromDrag(EXTERIOR_HOME, 10, 0, 0.01);
	expect(swung.yaw < EXTERIOR_HOME.yaw, "dragging right swings the camera to port, so the hull follows the pointer");
	const raised = orbitFromDrag(EXTERIOR_HOME, 0, 10, 0.01);
	expect(raised.pitch > EXTERIOR_HOME.pitch, "dragging down raises the camera, so the hull follows the pointer");
}

{
	const once = orbitFromDrag({ yaw: 0, pitch: 0 }, 0, 100, 1);
	const twice = orbitFromDrag(once, 0, 100, 1);
	expect(twice.pitch === once.pitch, "pitch stops and stays stopped");
	expect(once.pitch > 1 && once.pitch < Math.PI / 2, "the stop is short of straight up");
	const wrapped = orbitFromDrag({ yaw: 3, pitch: 0 }, -100, 0, 0.1);
	expect(wrapped.yaw <= Math.PI && wrapped.yaw >= -Math.PI, "yaw stays on one turn");
}

function recordingContext(): { context: CanvasRenderingContext2D; marks: { text: string; x: number; y: number }[] } {
	const marks: { text: string; x: number; y: number }[] = [];
	const context = new Proxy({} as CanvasRenderingContext2D, {
		get(_target, prop) {
			if (prop === "fillText" || prop === "strokeText") {
				return (text: string, x: number, y: number) => {
					if (prop === "fillText") {
						marks.push({ text: String(text), x, y });
					}
				};
			}
			if (prop === "measureText") {
				return (text: string) => ({ width: String(text).length * 8 });
			}
			return () => {};
		},
		set() {
			return true;
		},
	});
	return { context, marks };
}

{
	const port = recordingContext();
	paintFeedLabel(port.context, 400, 240, "AFT · PORT", "right");
	const starboard = recordingContext();
	paintFeedLabel(starboard.context, 400, 240, "AFT · STBD", "left");
	const portMark = port.marks.find((mark) => mark.text === "AFT · PORT");
	const starboardMark = starboard.marks.find((mark) => mark.text === "AFT · STBD");
	expect(!!portMark && portMark.x > 300 && portMark.y < 40, "the port name is drawn on the canvas corner that lands upper right");
	expect(!!starboardMark && starboardMark.x < 40 && starboardMark.y < 40, "the starboard name is drawn on the canvas corner that lands upper left");
}

{
	const through = canopyGlassAlpha(1);
	const edge = canopyGlassAlpha(0);
	const halfway = canopyGlassAlpha(0.5);
	expect(Math.abs(through - CANOPY_GLASS.faceAlpha) < 1e-9, "looking through the pane stays at the clear alpha");
	expect(Math.abs(edge - CANOPY_GLASS.rimAlpha) < 1e-9, "a grazing angle shows the rim");
	expect(halfway > through && halfway < edge, "the rim strengthens as the pane turns away");
}

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}

console.log("exterior orbit sits astern of the hull and swings with a drag, the aft names sit on the inner corners, and the canopy rim strengthens toward a grazing edge");

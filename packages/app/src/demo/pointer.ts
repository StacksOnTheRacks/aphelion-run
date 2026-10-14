import type { Scene } from "@babylonjs/core/scene";

/** A press that moves farther than this is a drag of the camera, not a click. */
const CLICK_SLOP_PIXELS = 6;

export type Picker = {
	/** Finds the body under a still pointer again, since bodies move. Call once per frame. */
	update: () => string | null;
};

/**
 * Clicks and taps on the canvas, and the hover under a mouse. `pick` names the body at a point in CSS
 * pixels from the canvas's top left, or null. Listeners come off when the scene is disposed.
 */
export function trackPicks(
	canvas: HTMLCanvasElement,
	scene: Scene,
	pick: (x: number, y: number) => string | null,
	onPick: (id: string) => void
): Picker {
	let pointer: { x: number; y: number } | null = null;
	let press: { x: number; y: number } | null = null;
	let hovered: string | null = null;

	const at = (event: PointerEvent) => {
		const box = canvas.getBoundingClientRect();
		return { x: event.clientX - box.left, y: event.clientY - box.top };
	};
	const onPointerMove = (event: PointerEvent) => {
		const point = at(event);
		const dragging = press && Math.hypot(point.x - press.x, point.y - press.y) > CLICK_SLOP_PIXELS;
		pointer = dragging ? null : point;
	};
	const onPointerDown = (event: PointerEvent) => {
		press = at(event);
	};
	const onPointerUp = (event: PointerEvent) => {
		const start = press;
		const point = at(event);
		press = null;
		if (start && Math.hypot(point.x - start.x, point.y - start.y) <= CLICK_SLOP_PIXELS) {
			const id = pick(point.x, point.y);
			if (id) {
				onPick(id);
			}
		}
		// A finger leaves nothing behind to hover with.
		pointer = event.pointerType === "mouse" ? point : null;
	};
	const onPointerLeave = () => {
		pointer = null;
		press = null;
	};
	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointerup", onPointerUp);
	canvas.addEventListener("pointerleave", onPointerLeave);
	scene.onDisposeObservable.add(() => {
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointerup", onPointerUp);
		canvas.removeEventListener("pointerleave", onPointerLeave);
		canvas.style.cursor = "";
	});

	return {
		update() {
			const id = pointer ? pick(pointer.x, pointer.y) : null;
			if (id !== hovered) {
				hovered = id;
				canvas.style.cursor = id ? "pointer" : "";
			}
			return id;
		},
	};
}

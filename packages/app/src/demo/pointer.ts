import type { Scene } from "@babylonjs/core/scene";

/** A press that moves farther than this is a drag of the camera, not a click. */
const CLICK_SLOP_PIXELS = 6;

/**
 * A release picks when this press never grew a second finger and the pointer stayed put.
 * A second finger is a pinch, and neither finger of that gesture is a tap.
 */
export function isPick(
	start: { x: number; y: number } | null,
	end: { x: number; y: number },
	pinched: boolean
): boolean {
	if (!start || pinched) {
		return false;
	}
	return Math.hypot(end.x - start.x, end.y - start.y) <= CLICK_SLOP_PIXELS;
}

export type Picker = {
	/** Finds the body under a still pointer again, since bodies move. Call once per frame. */
	update: () => string | null;
	/** The cursor over the canvas while nothing pickable is under it. */
	setIdleCursor: (cursor: string) => void;
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
	let idle = "";
	const active = new Set<number>();
	let pinched = false;

	const at = (event: PointerEvent) => {
		const box = canvas.getBoundingClientRect();
		return { x: event.clientX - box.left, y: event.clientY - box.top };
	};
	const onPointerMove = (event: PointerEvent) => {
		if (pinched || active.size > 1) {
			pointer = null;
			return;
		}
		const point = at(event);
		const dragging = press && Math.hypot(point.x - press.x, point.y - press.y) > CLICK_SLOP_PIXELS;
		pointer = dragging ? null : point;
	};
	const onPointerDown = (event: PointerEvent) => {
		active.add(event.pointerId);
		if (active.size > 1) {
			pinched = true;
			press = null;
			pointer = null;
			return;
		}
		press = at(event);
	};
	const release = (event: PointerEvent, choose: boolean) => {
		active.delete(event.pointerId);
		if (pinched) {
			press = null;
			pointer = null;
			if (active.size === 0) {
				pinched = false;
			}
			return;
		}
		const start = press;
		const point = at(event);
		press = null;
		if (choose && isPick(start, point, false)) {
			const id = pick(point.x, point.y);
			if (id) {
				onPick(id);
			}
		}
		// A finger leaves nothing behind to hover with.
		pointer = event.pointerType === "mouse" ? point : null;
	};
	const onPointerUp = (event: PointerEvent) => {
		release(event, true);
	};
	const onPointerCancel = (event: PointerEvent) => {
		release(event, false);
	};
	const onPointerLeave = () => {
		pointer = null;
		press = null;
		active.clear();
		pinched = false;
	};
	canvas.addEventListener("pointermove", onPointerMove);
	canvas.addEventListener("pointerdown", onPointerDown);
	canvas.addEventListener("pointerup", onPointerUp);
	canvas.addEventListener("pointercancel", onPointerCancel);
	canvas.addEventListener("pointerleave", onPointerLeave);
	scene.onDisposeObservable.add(() => {
		canvas.removeEventListener("pointermove", onPointerMove);
		canvas.removeEventListener("pointerdown", onPointerDown);
		canvas.removeEventListener("pointerup", onPointerUp);
		canvas.removeEventListener("pointercancel", onPointerCancel);
		canvas.removeEventListener("pointerleave", onPointerLeave);
		canvas.style.cursor = "";
	});

	return {
		update() {
			const id = pointer ? pick(pointer.x, pointer.y) : null;
			if (id !== hovered) {
				hovered = id;
				canvas.style.cursor = id ? "pointer" : idle;
			}
			return id;
		},
		setIdleCursor(cursor) {
			idle = cursor;
			if (!hovered) {
				canvas.style.cursor = cursor;
			}
		},
	};
}

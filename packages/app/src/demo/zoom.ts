import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

/** Closer or farther, one notch of the chart wheel. */
export type ZoomDirection = "in" | "out";

/**
 * Share of the current distance one wheel notch travels.
 * A standard notch is a 100-pixel wheel delta, which Babylon scales by this fraction.
 */
export const WHEEL_ZOOM_FRACTION = 0.02;

/**
 * How far one mouse-wheel notch moves the camera, in world units.
 * Positive moves closer. This is the delta Babylon adds for a 100-pixel notch
 * when the wheel uses `WHEEL_ZOOM_FRACTION`.
 */
export function wheelNotch(radius: number, direction: ZoomDirection): number {
	const wheelDelta = direction === "in" ? 100 : -100;
	const scaled = wheelDelta * 0.01 * WHEEL_ZOOM_FRACTION * radius;
	return wheelDelta > 0 ? scaled / (1 + WHEEL_ZOOM_FRACTION) : scaled * (1 + WHEEL_ZOOM_FRACTION);
}

/**
 * One finger turns the chart. Two fingers only zoom, and a spread moves closer.
 * `pinchDeltaPercentage` matches the wheel, and applies when natural pinch is off.
 */
export function tuneChartCamera(camera: ArcRotateCamera): void {
	camera.panningSensibility = 0;
	camera.wheelDeltaPercentage = WHEEL_ZOOM_FRACTION;
	camera.pinchDeltaPercentage = WHEEL_ZOOM_FRACTION;
	camera.useNaturalPinchZoom = true;
}

/** The chart camera takes the pointer, and the browser does not pan or pinch the page. */
export function attachChartCamera(camera: ArcRotateCamera, canvas: HTMLCanvasElement): void {
	camera.attachControl(canvas, false);
}

/** Feeds one wheel notch into the camera. The wheel's near and far limits still hold it. */
export function nudgeChartZoom(camera: ArcRotateCamera, direction: ZoomDirection): void {
	camera.movement.zoomAccumulatedPixels += wheelNotch(camera.radius, direction);
}

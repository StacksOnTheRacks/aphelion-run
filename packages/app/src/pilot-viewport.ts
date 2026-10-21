/**
 * The cockpit lays two aft views across the windscreen and a dashboard along the bottom.
 * A desktop clears that, and so does a large tablet in either orientation. A phone does not:
 * portrait is narrower than `PILOT_MIN_WIDTH`, and landscape is shorter than `PILOT_MIN_HEIGHT`.
 */
export const PILOT_MIN_WIDTH = 768;
export const PILOT_MIN_HEIGHT = 600;

/** The viewport that `pilotViewportFits` describes, for `matchMedia` and the Pilot control. */
export const PILOT_VIEWPORT = `(min-width: ${PILOT_MIN_WIDTH}px) and (min-height: ${PILOT_MIN_HEIGHT}px)`;

/** Whether a viewport this size has room for the cockpit. `width` and `height` are CSS pixels. */
export function pilotViewportFits(width: number, height: number): boolean {
	return width >= PILOT_MIN_WIDTH && height >= PILOT_MIN_HEIGHT;
}

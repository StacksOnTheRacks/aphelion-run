/**
 * Names laid over a scene. Every body in view gets a ring and a short leader line out to its name, and
 * the names are placed so they stay on screen and clear of each other, of other bodies, and of the chrome.
 * All positions are CSS pixels from the canvas's top left.
 */

/** A body on screen. `away` is the direction its name prefers, in screen radians (0 is right, y grows down). */
export type LabelAnchor = { id: string; x: number; y: number; radius: number; away: number };

/** What a scene reports after every frame. `opacity` fades every name at once, during camera moves or far zooms. */
export type LabelFrame = { anchors: LabelAnchor[]; hovered: string | null; opacity: number };

/** A scene whose bodies carry names. Returns a stop function. */
export type LabelSource = { onLabels: (listener: (frame: LabelFrame) => void) => () => void };

export type Rect = { left: number; top: number; right: number; bottom: number };

export type LabelPlacement = {
	id: string;
	x: number;
	y: number;
	/** Radius of the ring drawn around the body. */
	ring: number;
	/** The leader line, from the ring's edge out to the name. */
	from: { x: number; y: number };
	to: { x: number; y: number };
	box: Rect;
	/** Which candidate was used, so the next frame can keep it while it still fits. */
	choice: number;
};

/** The ring sits this far outside the body and is never smaller than `RING_MIN`. */
const RING_GAP = 4;
const RING_MIN = 6;
/** Names keep this far from the screen's edge and from each other. */
const EDGE = 4;
const SPACING = 6;

/** Leader lengths and turns away from the preferred direction, cheapest first. */
const LEADERS = [16, 36, 64, 104];
const TURNS = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 1.9, -1.9, 2.5, -2.5, Math.PI];
const CANDIDATES = TURNS.flatMap((turn, turnIndex) =>
	LEADERS.map((length, lengthIndex) => ({ turn, length, cost: turnIndex + lengthIndex * 2.5 }))
).sort((a, b) => a.cost - b.cost);

export function ringRadius(radius: number): number {
	return Math.max(RING_MIN, radius + RING_GAP);
}

function overlap(a: Rect, b: Rect): number {
	const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
	const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
	return width > 0 && height > 0 ? width * height : 0;
}

function circleOverlap(box: Rect, x: number, y: number, radius: number): number {
	const nearX = Math.min(Math.max(x, box.left), box.right);
	const nearY = Math.min(Math.max(y, box.top), box.bottom);
	const inside = radius - Math.hypot(nearX - x, nearY - y);
	return inside > 0 ? inside * inside : 0;
}

/** Points along a leader line, enough to catch it running through a name. */
function leaderPoints(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] {
	return [0.2, 0.4, 0.6, 0.8, 1].map((t) => ({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }));
}

function inside(rect: Rect, point: { x: number; y: number }): boolean {
	return point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
}

/** What a leader line running through a name costs, in the same units as overlapping area. */
const CROSSING = 60;

function grow(rect: Rect, by: number): Rect {
	return { left: rect.left - by, top: rect.top - by, right: rect.right + by, bottom: rect.bottom + by };
}

function candidate(anchor: LabelAnchor, ring: number, size: { width: number; height: number }, index: number) {
	const { turn, length } = CANDIDATES[index];
	const angle = anchor.away + turn;
	const dx = Math.cos(angle);
	const dy = Math.sin(angle);
	const from = { x: anchor.x + dx * ring, y: anchor.y + dy * ring };
	const to = { x: anchor.x + dx * (ring + length), y: anchor.y + dy * (ring + length) };
	const left = dx >= 0 ? to.x : to.x - size.width;
	const top = to.y - size.height / 2;
	return { from, to, box: { left, top, right: left + size.width, bottom: top + size.height } };
}

/**
 * Places names in `anchors` order, so earlier anchors win the best spots. Each takes the cheapest
 * candidate that touches nothing, or keeps last frame's choice while that still touches nothing, so names
 * do not jump while the camera turns. When nothing fits, the least crowded candidate is used.
 */
export function placeLabels(
	anchors: LabelAnchor[],
	sizes: Map<string, { width: number; height: number }>,
	bounds: { width: number; height: number },
	keepOut: Rect[],
	previous: Map<string, number>
): LabelPlacement[] {
	const screen: Rect = { left: EDGE, top: EDGE, right: bounds.width - EDGE, bottom: bounds.height - EDGE };
	const rings = anchors.map((anchor) => ringRadius(anchor.radius));
	const placed: Rect[] = [];
	const leaders: { x: number; y: number }[] = [];
	const result: LabelPlacement[] = [];

	anchors.forEach((anchor, anchorIndex) => {
		const size = sizes.get(anchor.id);
		if (!size) {
			return;
		}
		const ring = rings[anchorIndex];
		const crowding = ({ box, from, to }: ReturnType<typeof candidate>): number => {
			const padded = grow(box, SPACING);
			let total = 0;
			for (const point of leaders) {
				if (inside(padded, point)) {
					total += CROSSING;
				}
			}
			for (const point of leaderPoints(from, to)) {
				for (const other of placed) {
					if (inside(other, point)) {
						total += CROSSING;
					}
				}
			}
			const offscreen =
				Math.max(0, screen.left - box.left) +
				Math.max(0, box.right - screen.right) +
				Math.max(0, screen.top - box.top) +
				Math.max(0, box.bottom - screen.bottom);
			total += offscreen * size.height * 4;
			for (const other of placed) {
				total += overlap(padded, other);
			}
			for (const zone of keepOut) {
				total += overlap(padded, zone);
			}
			anchors.forEach((other, otherIndex) => {
				total += circleOverlap(padded, other.x, other.y, rings[otherIndex]);
			});
			return total;
		};

		let best = -1;
		let bestCrowding = Infinity;
		let bestShape: ReturnType<typeof candidate> | null = null;
		const kept = previous.get(anchor.id);
		if (kept !== undefined && kept < CANDIDATES.length) {
			const shape = candidate(anchor, ring, size, kept);
			if (crowding(shape) === 0) {
				best = kept;
				bestCrowding = 0;
				bestShape = shape;
			}
		}
		for (let index = 0; index < CANDIDATES.length && bestCrowding > 0; index++) {
			const shape = candidate(anchor, ring, size, index);
			const crowd = crowding(shape);
			if (crowd < bestCrowding) {
				best = index;
				bestCrowding = crowd;
				bestShape = shape;
			}
		}
		if (!bestShape) {
			return;
		}
		placed.push(bestShape.box);
		leaders.push(...leaderPoints(bestShape.from, bestShape.to));
		result.push({ id: anchor.id, x: anchor.x, y: anchor.y, ring, ...bestShape, choice: best });
	});
	return result;
}

/** Screen direction from `center` toward a point, or `fallback` when the two sit together. */
export function awayFrom(center: { x: number; y: number }, x: number, y: number, fallback = -Math.PI / 4): number {
	const dx = x - center.x;
	const dy = y - center.y;
	return Math.hypot(dx, dy) < 2 ? fallback : Math.atan2(dy, dx);
}

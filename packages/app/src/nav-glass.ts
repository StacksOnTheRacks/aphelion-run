import { CARGO_CAPACITY, ENERGY_CAPACITY } from "./demo/energy";
import { LOCAL_REACH, bearing, bodyLabel, findMine, localBody, localPoint, mineRows, nearbyMineChart, systemPoint, type MineRow, type NavBody, type NavFix } from "./demo/nav";
import { routeCommit } from "./demo/scan";
import { elementColor, palette, type ElementId } from "./palette";
import { formatTravelTime, travelShare } from "./travel-clock";

const AMBER = palette.gold;
const BONE = palette.bone;
/** CSS pixels across each round map on the flat console. The center glass scales this drawing up. */
export const MAP_SIZE = 148;
/** One turn of the sweep across the system map, in seconds. */
const SWEEP_SECONDS = 6;

const FACE = "ui-sans-serif, system-ui, sans-serif";

/** Sizes the canvas to the screen's pixels and returns a context drawing in CSS pixels from the center. */
function prepare(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
	const ratio = window.devicePixelRatio || 1;
	const pixels = Math.round(MAP_SIZE * ratio);
	if (canvas.width !== pixels) {
		canvas.width = pixels;
		canvas.height = pixels;
	}
	const context = canvas.getContext("2d");
	if (!context) {
		return null;
	}
	context.setTransform(ratio, 0, 0, ratio, 0, 0);
	context.clearRect(0, 0, MAP_SIZE, MAP_SIZE);
	context.translate(MAP_SIZE / 2, MAP_SIZE / 2);
	return context;
}

/** The frame both maps share: a rim with ticks every 30°, heavier at the four quarters. */
function drawRim(context: CanvasRenderingContext2D, radius: number): void {
	context.strokeStyle = "rgba(252,211,77,0.35)";
	context.lineWidth = 1;
	context.beginPath();
	context.arc(0, 0, radius, 0, Math.PI * 2);
	context.stroke();
	for (let step = 0; step < 12; step++) {
		const angle = (step * Math.PI) / 6;
		const inner = radius - (step % 3 === 0 ? 6 : 3);
		context.beginPath();
		context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
		context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
		context.stroke();
	}
}

/** The ship: a chevron pointing along its heading. */
function drawShip(context: CanvasRenderingContext2D, x: number, y: number, fix: NavFix): void {
	const angle = Math.atan2(-fix.ship.hz, fix.ship.hx);
	context.save();
	context.translate(x, y);
	context.rotate(angle);
	context.shadowColor = AMBER;
	context.shadowBlur = 6;
	context.fillStyle = AMBER;
	context.beginPath();
	context.moveTo(6, 0);
	context.lineTo(-4, 4);
	context.lineTo(-2, 0);
	context.lineTo(-4, -4);
	context.closePath();
	context.fill();
	context.restore();
}

function drawCourse(
	context: CanvasRenderingContext2D,
	fix: NavFix,
	place: (point: { x: number; z: number }) => { x: number; y: number }
): void {
	if (!fix.course || fix.course.points.length < 2) {
		return;
	}
	context.strokeStyle = "rgba(252,211,77,0.55)";
	context.lineWidth = 1;
	context.setLineDash([3, 3]);
	context.beginPath();
	fix.course.points.forEach((point, index) => {
		const at = place(point);
		if (index === 0) {
			context.moveTo(at.x, at.y);
		} else {
			context.lineTo(at.x, at.y);
		}
	});
	context.stroke();
	context.setLineDash([]);
	const end = place(fix.course.points[fix.course.points.length - 1]);
	context.strokeStyle = AMBER;
	context.strokeRect(end.x - 3, end.y - 3, 6, 6);
}

/** Draws the system map in `MAP_SIZE` units, scaled so it fills a circle of `size` pixels. The context origin is the center. */
function renderSystem(context: CanvasRenderingContext2D, size: number, fix: NavFix, local: NavBody | null, seconds: number | null): void {
	const scale = size / MAP_SIZE;
	context.save();
	context.scale(scale, scale);
	const radius = MAP_SIZE / 2 - 4;
	const inner = radius - 8;
	const place = (point: { x: number; z: number }) => systemPoint(point, fix.edge, inner);

	if (seconds !== null) {
		const angle = ((seconds % SWEEP_SECONDS) / SWEEP_SECONDS) * Math.PI * 2;
		const sweep = context.createConicGradient(angle, 0, 0);
		sweep.addColorStop(0, "rgba(252,211,77,0.16)");
		sweep.addColorStop(0.12, "rgba(252,211,77,0)");
		sweep.addColorStop(1, "rgba(252,211,77,0)");
		context.fillStyle = sweep;
		context.beginPath();
		context.arc(0, 0, radius, 0, Math.PI * 2);
		context.fill();
	}
	drawRim(context, radius);

	const planets = fix.bodies.filter((body) => body.parent === null && body.id !== "sun");
	context.strokeStyle = "rgba(232,228,217,0.14)";
	for (const planet of planets) {
		const at = place(planet);
		context.beginPath();
		context.arc(0, 0, Math.hypot(at.x, at.y), 0, Math.PI * 2);
		context.stroke();
	}

	drawCourse(context, fix, place);

	context.fillStyle = AMBER;
	context.shadowColor = AMBER;
	context.shadowBlur = 8;
	context.beginPath();
	context.arc(0, 0, 3, 0, Math.PI * 2);
	context.fill();
	context.shadowBlur = 0;

	for (const planet of planets) {
		const at = place(planet);
		context.fillStyle = planet === local ? AMBER : BONE;
		context.beginPath();
		context.arc(at.x, at.y, planet === local ? 2.5 : 1.8, 0, Math.PI * 2);
		context.fill();
	}

	const ship = place(fix.ship);
	drawShip(context, ship.x, ship.y, fix);
	context.restore();
}

/** Draws the local map in `MAP_SIZE` units, scaled so it fills a circle of `size` pixels. The context origin is the center. */
function renderLocal(context: CanvasRenderingContext2D, size: number, fix: NavFix, local: NavBody): void {
	const scale = size / MAP_SIZE;
	context.save();
	context.scale(scale, scale);
	const radius = MAP_SIZE / 2 - 4;
	drawRim(context, radius);

	const inner = radius - 4;
	const place = (point: { x: number; z: number }) => localPoint(point, local, inner);
	const reach = inner / (local.outer * LOCAL_REACH);

	context.save();
	context.beginPath();
	context.arc(0, 0, radius - 1, 0, Math.PI * 2);
	context.clip();

	context.strokeStyle = "rgba(252,211,77,0.3)";
	context.setLineDash([2, 4]);
	context.beginPath();
	context.arc(0, 0, local.outer * reach, 0, Math.PI * 2);
	context.stroke();
	context.setLineDash([]);

	const moons = fix.bodies.filter((body) => body.parent === local.id);
	context.strokeStyle = "rgba(232,228,217,0.12)";
	for (const moon of moons) {
		const at = place(moon);
		context.beginPath();
		context.arc(0, 0, Math.hypot(at.x, at.y), 0, Math.PI * 2);
		context.stroke();
	}

	drawCourse(context, fix, place);

	context.fillStyle = local.id === "sun" ? AMBER : "rgba(232,228,217,0.85)";
	context.beginPath();
	context.arc(0, 0, Math.max(3, local.radius * reach), 0, Math.PI * 2);
	context.fill();

	context.fillStyle = BONE;
	for (const moon of moons) {
		const at = place(moon);
		context.beginPath();
		context.arc(at.x, at.y, Math.max(1.5, moon.radius * reach), 0, Math.PI * 2);
		context.fill();
	}
	context.restore();

	const ship = place(fix.ship);
	const distance = Math.hypot(ship.x, ship.y);
	const pinned = distance > radius - 6 ? (radius - 6) / distance : 1;
	drawShip(context, ship.x * pinned, ship.y * pinned, fix);
	context.restore();
}

export function drawSystem(canvas: HTMLCanvasElement, fix: NavFix, local: NavBody | null, seconds: number | null): void {
	const context = prepare(canvas);
	if (!context) {
		return;
	}
	renderSystem(context, MAP_SIZE, fix, local, seconds);
}

export function drawLocal(canvas: HTMLCanvasElement, fix: NavFix, local: NavBody): void {
	const context = prepare(canvas);
	if (!context) {
		return;
	}
	renderLocal(context, MAP_SIZE, fix, local);
}

/** Minerals the hold can carry, in the order the header strip counts them. */
export const CARGO_LABELS = ["Hydrogen", "Ore", "Nitrogen", "Carbon"] as const;

export type CargoLabel = (typeof CARGO_LABELS)[number];

/**
 * Energy aboard, and the shared hold. Energy has its own tank. The minerals are counts in one store,
 * and their sum is the cargo against that store's limit. An uncounted mineral is empty.
 */
export type HoldStock = {
	energy: number;
	energyCapacity: number;
	/** Mineral units aboard, of any mix. */
	cargo: number;
	cargoCapacity: number;
	counts: readonly { label: string; amount: number }[];
};

/** The hold as the center screen draws it. Minerals default to empty until they are counted aboard. */
export function holdStock(energy: number, minerals: Partial<Record<CargoLabel, number>> = {}): HoldStock {
	const counts = CARGO_LABELS.map((label) => ({ label, amount: minerals[label] ?? 0 }));
	return {
		energy,
		energyCapacity: ENERGY_CAPACITY,
		cargo: counts.reduce((sum, line) => sum + line.amount, 0),
		cargoCapacity: CARGO_CAPACITY,
		counts,
	};
}

function amountLabel(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}

function fit(context: CanvasRenderingContext2D, text: string, width: number): string {
	if (context.measureText(text).width <= width) {
		return text;
	}
	let cut = text;
	while (cut.length > 1 && context.measureText(`${cut}…`).width > width) {
		cut = cut.slice(0, -1);
	}
	return `${cut}…`;
}

function track(context: CanvasRenderingContext2D, font: number): void {
	context.letterSpacing = `${Math.max(1, Math.round(font * 0.12))}px`;
}

/** The center glass follows the ship. Battle is reserved until its rules exist. */
export type CenterPage = "nav" | "mining" | "battle";

/** Mining while the ship is drawing from a dock. Otherwise navigation. */
export function centerPage(mining: boolean): CenterPage {
	return mining ? "mining" : "nav";
}

/** What a docked collector or mine still holds, and what it held when full. */
export type SiphonSource = {
	kind: "collector" | "generator";
	resource: ElementId;
	/** Load still in the dock. Falls as the ship draws. */
	remaining: number;
	/** Load the dock held when it was full. */
	capacity: number;
};

type Rect = { x: number; y: number; w: number; h: number };

type CenterFrame = {
	header: Rect;
	content: Rect;
	tabs: { page: CenterPage; label: string; rect: Rect }[];
	gap: number;
};

const PAGES: { page: CenterPage; label: string }[] = [
	{ page: "nav", label: "Nav" },
	{ page: "mining", label: "Mining" },
	{ page: "battle", label: "Battle" },
];

const PAGE_TITLE: Record<CenterPage, string> = {
	nav: "Navigation",
	mining: "Mining",
	battle: "Battle",
};

/** The header, the page, and the tab row, in the glass's pixels. */
export function centerFrame(width: number, height: number): CenterFrame {
	const pad = Math.max(12, Math.round(Math.min(width, height) * 0.045));
	const gap = Math.max(8, Math.round(pad * 0.55));
	const tabH = Math.max(36, Math.round(height * 0.16));
	const headerH = Math.max(26, Math.round(height * 0.11));
	const header: Rect = { x: pad, y: pad, w: width - pad * 2, h: headerH };
	const tabsTop = height - pad - tabH;
	const content: Rect = {
		x: pad,
		y: header.y + header.h + gap,
		w: width - pad * 2,
		h: Math.max(1, tabsTop - gap - (header.y + header.h + gap)),
	};
	const tabW = (content.w - gap * (PAGES.length - 1)) / PAGES.length;
	return {
		header,
		content,
		gap,
		tabs: PAGES.map((entry, index) => ({
			page: entry.page,
			label: entry.label,
			rect: { x: content.x + index * (tabW + gap), y: tabsTop, w: tabW, h: tabH },
		})),
	};
}

/** The coast on offer for the mine the pilot picked. */
export type NavCourseOffer = {
	name: string;
	speed: number;
	minSpeed: number;
	maxSpeed: number;
	seconds: number;
	cost: number;
	reserve: number;
};

/**
 * What the pilot has open on the planning list. A null `open` unfolds the nearest planet.
 * `countdown` is the wait after the coast is locked, before the ship moves.
 */
export type NavControls = {
	open: readonly string[] | null;
	scroll: number;
	selected: string | null;
	offer: NavCourseOffer | null;
	/** Why the selected mine cannot be a coast, such as a mine in the ship's own orbit. */
	blocked: string | null;
	countdown: { seconds: number; name: string } | null;
};

export const IDLE_NAV: NavControls = {
	open: null,
	scroll: 0,
	selected: null,
	offer: null,
	blocked: null,
	countdown: null,
};

/** A tap on the planning list, the speed track, or the depart control. */
export type CenterAction =
	| { type: "toggle"; id: string }
	| { type: "mine"; id: string }
	| { type: "scroll"; dir: -1 | 1 }
	| { type: "speed"; speed: number }
	| { type: "depart" };

const PLAN_ROW = 26;
const PLAN_SCROLL = 28;

export type NavTargets = {
	rows: { id: string; kind: MineRow["kind"]; rect: Rect }[];
	up: Rect | null;
	down: Rect | null;
	slower: Rect | null;
	faster: Rect | null;
	speed: Rect | null;
	depart: Rect | null;
};

/** How far the planning list can scroll on this glass. */
export function navScrollMax(width: number, height: number, rowCount: number): number {
	const list = listColumn(centerFrame(width, height)).list;
	return scrollMax(list.h, rowCount);
}

/**
 * Hit targets for Nav Planning. Null once the ship is en route or the departure countdown is up,
 * because those glasses are not picked.
 */
export function navTargets(width: number, height: number, fix: NavFix, controls: NavControls): NavTargets | null {
	return planGeometry(width, height, fix, controls)?.targets ?? null;
}

/**
 * Nav Planning is the page that takes a tap: a planet or moon opens, a mine is chosen, the track
 * sets the coast, and depart locks it. The mode marks stay labels. En route and the countdown do not pick.
 * With no planning model, nothing on the glass is a control.
 */
export function centerHit(
	width: number,
	height: number,
	x: number,
	y: number,
	page: CenterPage,
	nav?: { fix: NavFix; controls: NavControls; energy: number } | null
): CenterAction | null {
	if (page !== "nav" || !nav) {
		return null;
	}
	const targets = navTargets(width, height, nav.fix, nav.controls);
	if (!targets) {
		return null;
	}
	for (const row of targets.rows) {
		if (!inside(row.rect, x, y)) {
			continue;
		}
		return row.kind === "mine" ? { type: "mine", id: row.id } : { type: "toggle", id: row.id };
	}
	if (targets.up && inside(targets.up, x, y)) {
		return { type: "scroll", dir: -1 };
	}
	if (targets.down && inside(targets.down, x, y)) {
		return { type: "scroll", dir: 1 };
	}
	const offer = nav.controls.offer;
	if (offer && targets.slower && inside(targets.slower, x, y)) {
		const speed = stepped(offer.speed, -1, offer.minSpeed, offer.maxSpeed);
		return speed === offer.speed ? null : { type: "speed", speed };
	}
	if (offer && targets.faster && inside(targets.faster, x, y)) {
		const speed = stepped(offer.speed, 1, offer.minSpeed, offer.maxSpeed);
		return speed === offer.speed ? null : { type: "speed", speed };
	}
	if (offer && targets.speed && inside(targets.speed, x, y)) {
		return { type: "speed", speed: speedAlong(targets.speed, x, offer.minSpeed, offer.maxSpeed) };
	}
	if (offer && targets.depart && inside(targets.depart, x, y) && routeCommit(nav.energy, offer.cost, offer.reserve).enabled) {
		return { type: "depart" };
	}
	return null;
}

function inside(rect: Rect, x: number, y: number): boolean {
	return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

function stepped(speed: number, dir: -1 | 1, min: number, max: number): number {
	const next = Math.round((speed + dir * 0.1) * 10) / 10;
	return Math.max(min, Math.min(max, next));
}

function speedAlong(rect: Rect, x: number, min: number, max: number): number {
	const span = max - min;
	if (span < 0.05) {
		return min;
	}
	const t = Math.max(0, Math.min(1, (x - rect.x) / Math.max(1, rect.w)));
	const stepped = Math.round((min + t * span) * 10) / 10;
	return Math.max(min, Math.min(max, stepped));
}

function listColumn(frame: CenterFrame): { list: Rect; detail: Rect } {
	const { content, gap } = frame;
	const listW = Math.round(content.w * 0.56);
	const list: Rect = { x: content.x, y: content.y, w: listW, h: content.h };
	const detailX = list.x + list.w + gap;
	return { list, detail: { x: detailX, y: content.y, w: content.x + content.w - detailX, h: content.h } };
}

function scrollMax(listH: number, rowCount: number): number {
	const fit = Math.max(1, Math.floor(listH / PLAN_ROW));
	const overflow = rowCount > fit;
	const capacity = overflow ? Math.max(1, Math.floor((listH - PLAN_SCROLL - 6) / PLAN_ROW)) : fit;
	return Math.max(0, rowCount - capacity);
}

function planGeometry(
	width: number,
	height: number,
	fix: NavFix,
	controls: NavControls
): { targets: NavTargets; rows: MineRow[]; detail: Rect; list: Rect } | null {
	if (fix.course || controls.countdown) {
		return null;
	}
	const frame = centerFrame(width, height);
	const { list, detail } = listColumn(frame);
	const rows = mineRows(nearbyMineChart(fix), controls.open);
	const max = scrollMax(list.h, rows.length);
	const start = Math.max(0, Math.min(controls.scroll, max));
	const overflow = max > 0;
	const buttonTop = list.y + list.h - PLAN_SCROLL;
	const viewH = overflow ? buttonTop - 6 - list.y : list.h;
	const capacity = Math.max(1, Math.floor(viewH / PLAN_ROW));
	const visible = rows.slice(start, start + capacity);
	const targets: NavTargets = {
		rows: visible.map((row, index) => ({
			id: row.id,
			kind: row.kind,
			rect: { x: list.x, y: list.y + index * PLAN_ROW, w: list.w, h: PLAN_ROW },
		})),
		up: overflow && start > 0 ? { x: list.x, y: buttonTop, w: list.w / 2 - 4, h: PLAN_SCROLL } : null,
		down: overflow && start < max ? { x: list.x + list.w / 2 + 4, y: buttonTop, w: list.w / 2 - 4, h: PLAN_SCROLL } : null,
		slower: null,
		faster: null,
		speed: null,
		depart: null,
	};
	const offer = controls.offer;
	if (offer && detail.w > 40) {
		const block = detailBlock(detail);
		if (offer.maxSpeed - offer.minSpeed >= 0.05) {
			targets.slower = block.slower;
			targets.faster = block.faster;
			targets.speed = block.speed;
		}
		targets.depart = block.depart;
	}
	return { targets, rows: visible, detail, list };
}

/** The speed steps, the track between them, and the depart control, in the detail column. */
function detailBlock(detail: Rect): { slower: Rect; faster: Rect; speed: Rect; depart: Rect } {
	const trackTop = detail.y + 78;
	const step = 28;
	const gap = 8;
	const departH = Math.max(32, Math.round(detail.h * 0.16));
	return {
		slower: { x: detail.x, y: trackTop - 4, w: step, h: 26 },
		faster: { x: detail.x + detail.w - step, y: trackTop - 4, w: step, h: 26 },
		speed: { x: detail.x + step + gap, y: trackTop, w: Math.max(20, detail.w - (step + gap) * 2), h: 18 },
		depart: { x: detail.x, y: detail.y + detail.h - departH, w: detail.w, h: departH },
	};
}

function chamfer(context: CanvasRenderingContext2D, rect: Rect, cut: number): void {
	const { x, y, w, h } = rect;
	const c = Math.min(cut, w / 3, h / 3);
	context.beginPath();
	context.moveTo(x + c, y);
	context.lineTo(x + w - c, y);
	context.lineTo(x + w, y + c);
	context.lineTo(x + w, y + h - c);
	context.lineTo(x + w - c, y + h);
	context.lineTo(x + c, y + h);
	context.lineTo(x, y + h - c);
	context.lineTo(x, y + c);
	context.closePath();
}

function vertical(context: CanvasRenderingContext2D, rect: Rect, top: string, bottom: string): CanvasGradient {
	const gradient = context.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
	gradient.addColorStop(0, top);
	gradient.addColorStop(1, bottom);
	return gradient;
}

function plate(context: CanvasRenderingContext2D, rect: Rect, fill: CanvasGradient | string, stroke: string, cut: number): void {
	chamfer(context, rect, cut);
	context.fillStyle = fill;
	context.fill();
	context.strokeStyle = stroke;
	context.lineWidth = 1.5;
	context.stroke();
}

/**
 * The center glass. Nav plans a course until one is locked, then reads en route: the dial, the travel
 * clock, and the energy still in the tank. Cargo is a strip of marks and counts in the header, on every
 * page. Mining shows the dock being drawn down.
 * Drawn in the glass texture's pixels, with the top of the canvas at the top of the screen.
 */
export function paintCenterPanel(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	fix: NavFix,
	stock: HoldStock,
	screen: { page: CenterPage; source?: SiphonSource | null; nav?: NavControls | null }
): void {
	const source = screen.source ?? null;
	const nav = screen.nav ?? IDLE_NAV;
	const frame = centerFrame(width, height);
	context.setTransform(1, 0, 0, 1, 0, 0);
	context.clearRect(0, 0, width, height);
	const ground = context.createLinearGradient(0, 0, 0, height);
	ground.addColorStop(0, "#14110C");
	ground.addColorStop(1, "#07080A");
	context.fillStyle = ground;
	context.fillRect(0, 0, width, height);
	const sheen = context.createLinearGradient(0, 0, width * 0.5, height);
	sheen.addColorStop(0, "rgba(255,215,61,0.07)");
	sheen.addColorStop(0.4, "rgba(255,255,255,0)");
	context.fillStyle = sheen;
	context.fillRect(0, 0, width, height);

	const heading = screen.page === "nav" ? navHeading(fix, nav) : { title: PAGE_TITLE[screen.page], note: statusNote(screen.page, source) };
	paintHeader(context, frame, heading.title, heading.note, stock);
	if (screen.page === "nav") {
		if (fix.course) {
			paintNav(context, frame, fix, stock);
		} else if (nav.countdown) {
			paintCountdown(context, frame.content, nav.countdown);
		} else {
			paintPlanning(context, width, height, fix, stock, nav);
		}
	} else if (screen.page === "mining") {
		paintMining(context, frame.content, source);
	} else {
		paintBattle(context, frame.content);
	}
	for (const tab of frame.tabs) {
		paintTab(context, tab.rect, tab.label, tab.page === screen.page);
	}

	const rule = context.createLinearGradient(0, 0, width, 0);
	rule.addColorStop(0, "rgba(255,215,61,0.15)");
	rule.addColorStop(0.5, "rgba(255,215,61,0.75)");
	rule.addColorStop(1, "rgba(255,215,61,0.15)");
	context.strokeStyle = rule;
	context.lineWidth = 2;
	context.strokeRect(1, 1, width - 2, height - 2);
}

function statusNote(page: CenterPage, source: SiphonSource | null): string {
	if (page === "mining") {
		return source ? yieldName(source.resource) : "Siphon";
	}
	return "Standby";
}

function navHeading(fix: NavFix, controls: NavControls): { title: string; note: string } {
	if (fix.course) {
		return { title: "En route", note: fix.course.name };
	}
	if (controls.countdown) {
		return { title: "Nav planning", note: "Departing" };
	}
	const picked = controls.selected ? findMine(controls.selected)?.label : null;
	return { title: "Nav planning", note: picked ?? "Nearby" };
}

function paintHeader(
	context: CanvasRenderingContext2D,
	frame: CenterFrame,
	title: string,
	note: string,
	stock: HoldStock
): void {
	const { header } = frame;
	const size = Math.max(13, Math.round(header.h * 0.62));
	const heading = title.toUpperCase();
	const titleY = header.y + (header.h - size) / 2;
	write(context, heading, size, AMBER, "left", header.x, titleY, 700);
	const stripLeft = paintCargoStrip(context, header, stock);
	const noteSize = Math.round(size * 0.72);
	const gap = Math.max(12, Math.round(header.h * 0.4));
	context.font = `700 ${size}px ${FACE}`;
	track(context, size);
	const noteLeft = header.x + context.measureText(heading).width + gap;
	const noteRight = stripLeft - gap;
	if (noteRight - noteLeft > 24) {
		write(context, fitAt(context, note.toUpperCase(), noteSize, noteRight - noteLeft), noteSize, "rgba(232,228,217,0.45)", "right", noteRight, header.y + (header.h - noteSize) / 2, 600);
	}
	const y = frame.header.y + frame.header.h;
	const fade = context.createLinearGradient(frame.header.x, y, frame.header.x + frame.header.w, y);
	fade.addColorStop(0, "rgba(255,215,61,0)");
	fade.addColorStop(0.5, "rgba(255,215,61,0.45)");
	fade.addColorStop(1, "rgba(255,215,61,0)");
	context.strokeStyle = fade;
	context.lineWidth = 1;
	context.beginPath();
	context.moveTo(frame.header.x, y);
	context.lineTo(frame.header.x + frame.header.w, y);
	context.stroke();
}

/** A ring of the time still left, with the clock drawn in the middle. Full at departure, empty on arrival. */
function paintTravelClock(
	context: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	radius: number,
	remaining: number,
	total: number
): void {
	const share = travelShare(remaining, total);
	const width = Math.max(3, radius * 0.14);
	context.save();
	context.beginPath();
	context.arc(cx, cy, radius, 0, Math.PI * 2);
	context.strokeStyle = "rgba(255,215,61,0.2)";
	context.lineWidth = width;
	context.lineCap = "butt";
	context.stroke();
	if (share > 0) {
		context.beginPath();
		context.arc(cx, cy, radius, -Math.PI / 2, -Math.PI / 2 + share * Math.PI * 2);
		context.strokeStyle = "#FFD73D";
		context.lineCap = share > 0.985 ? "butt" : "round";
		context.stroke();
	}
	const label = formatTravelTime(remaining);
	let size = Math.max(10, Math.round(radius * (label.length > 5 ? 0.38 : 0.48)));
	context.letterSpacing = "0px";
	context.textAlign = "center";
	context.textBaseline = "middle";
	context.fillStyle = "#FFD73D";
	context.font = `700 ${size}px ${FACE}`;
	while (size > 8 && context.measureText(label).width > radius * 1.65) {
		size -= 1;
		context.font = `700 ${size}px ${FACE}`;
	}
	context.fillText(label, cx, cy);
	context.restore();
}

const ENERGY_TITLE = 12;

/** Width of the energy column, enough for the word and the count. */
function energyColumnWidth(context: CanvasRenderingContext2D, remaining: number): number {
	const amountSize = Math.round(ENERGY_TITLE * 1.15);
	context.font = `600 ${ENERGY_TITLE}px ${FACE}`;
	track(context, ENERGY_TITLE);
	const label = context.measureText("ENERGY").width;
	context.font = `700 ${amountSize}px ${FACE}`;
	track(context, amountSize);
	const amount = context.measureText(amountLabel(remaining)).width;
	return Math.ceil(Math.max(label, amount, 28) + 8);
}

/**
 * Energy still in the tank, as a vertical stack of segments filled from the bottom.
 * The lit segments and the number pulse while the engine is spending, and hold steady on a coast.
 */
function paintEnergyGauge(
	context: CanvasRenderingContext2D,
	rect: Rect,
	remaining: number,
	capacity: number,
	spending: boolean
): void {
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const title = ENERGY_TITLE;
	const amountSize = Math.round(title * 1.15);
	const wave = spending && !reduce ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(performance.now() / 240)) : 1;
	const cx = rect.x + rect.w / 2;
	write(context, "ENERGY", title, "rgba(232,228,217,0.45)", "center", cx, rect.y, 600);
	context.save();
	context.globalAlpha = wave;
	write(context, amountLabel(remaining), amountSize, AMBER, "center", cx, rect.y + title + 2, 700);
	context.restore();
	const top = rect.y + title + amountSize + 10;
	const plotH = Math.max(8, rect.y + rect.h - top);
	const plotW = Math.max(10, Math.min(22, rect.w * 0.4));
	const plot: Rect = { x: rect.x + (rect.w - plotW) / 2, y: top, w: plotW, h: plotH };
	const segments = 12;
	const gap = Math.max(2, Math.round(plot.h * 0.012));
	const segH = (plot.h - gap * (segments - 1)) / segments;
	const share = capacity > 0 ? Math.max(0, Math.min(1, remaining / capacity)) : 0;
	const lit = Math.round(share * segments);
	for (let index = 0; index < segments; index++) {
		const on = index < lit;
		const y = plot.y + plot.h - (index + 1) * segH - index * gap;
		context.save();
		context.globalAlpha = on ? wave : 1;
		context.fillStyle = on ? "#FFD73D" : "rgba(255,215,61,0.12)";
		context.fillRect(plot.x, y, plot.w, Math.max(1, segH));
		context.restore();
	}
}

/** HUD resource marks, in the same paths the warehouse icons use. View box is 18. */
const CARGO_MARK: Record<CargoLabel, readonly string[]> = {
	Hydrogen: [
		"M16.5 9C16.5 10.6569 13.1421 12 9 12C4.85786 12 1.5 10.6569 1.5 9C1.5 7.34315 4.85786 6 9 6C13.1421 6 16.5 7.34315 16.5 9Z",
		"M12.75 15.4952C11.3151 16.3236 8.47299 14.0872 6.40192 10.5C4.33086 6.91281 3.81512 3.33324 5.25 2.50481C6.68488 1.67638 9.52701 3.91281 11.5981 7.5C13.6691 11.0872 14.1849 14.6668 12.75 15.4952Z",
		"M5.25 15.4952C3.81512 14.6668 4.33086 11.0872 6.40192 7.5C8.47299 3.91281 11.3151 1.67638 12.75 2.50481C14.1849 3.33324 13.6691 6.91281 11.5981 10.5C9.52701 14.0872 6.68488 16.3236 5.25 15.4952Z",
		"M9.75 9C9.75 9.41421 9.41421 9.75 9 9.75C8.58579 9.75 8.25 9.41421 8.25 9C8.25 8.58579 8.58579 8.25 9 8.25C9.41421 8.25 9.75 8.58579 9.75 9Z",
	],
	Ore: ["M9 15.75H6L2.25 6.75L9 1.5L15.75 6.75L12 15.75H9ZM9 1.5L6 6.75M9 1.5L12 6.75M15.75 6.75H12M9 15.75L6 6.75M9 15.75L12 6.75M2.25 6.75H6M6 6.75H12"],
	Nitrogen: [
		"M9 1.5C7.5 4.5 3.75 8.25 3.75 11.25C3.75 12.6424 4.30312 13.9777 5.28769 14.9623C6.27226 15.9469 7.60761 16.5 9 16.5C10.3924 16.5 11.7277 15.9469 12.7123 14.9623C13.6969 13.9777 14.25 12.6424 14.25 11.25C14.25 8.25 10.5 4.5 9 1.5Z",
	],
	Carbon: ["M10.5 1.5L3 10.5H8.25L7.5 16.5L15 6.75H9.75L10.5 1.5Z"],
};

const MARK_BOX = 18;

function yieldName(resource: ElementId): string {
	return resource === "energy" ? "Energy" : resource.charAt(0).toUpperCase() + resource.slice(1);
}

function isCargoLabel(label: string): label is CargoLabel {
	return (CARGO_LABELS as readonly string[]).includes(label);
}

/** One HUD resource mark. A missing Path2D leaves the count to stand on its own. */
function drawMark(context: CanvasRenderingContext2D, label: CargoLabel, x: number, y: number, size: number): void {
	if (typeof Path2D === "undefined") {
		return;
	}
	context.save();
	context.translate(x, y);
	context.scale(size / MARK_BOX, size / MARK_BOX);
	context.strokeStyle = elementColor[label.toLowerCase() as ElementId];
	context.lineWidth = 1.5;
	context.lineCap = "round";
	context.lineJoin = "round";
	for (const path of CARGO_MARK[label]) {
		context.stroke(new Path2D(path));
	}
	context.restore();
}

/** The sun mark from the HUD, for a collector's energy. View box is 20. */
function drawEnergyMark(context: CanvasRenderingContext2D, x: number, y: number, size: number): void {
	if (typeof Path2D === "undefined") {
		return;
	}
	context.save();
	context.translate(x, y);
	context.scale(size / 20, size / 20);
	context.strokeStyle = elementColor.energy;
	context.fillStyle = elementColor.energy;
	context.lineWidth = 1.6;
	context.lineCap = "round";
	context.stroke(new Path2D("M10 1.7V4.1M10 15.9V18.3M1.7 10H4.1M15.9 10H18.3M4.15 4.15L5.85 5.85M14.15 14.15L15.85 15.85M15.85 4.15L14.15 5.85M5.85 14.15L4.15 15.85"));
	context.beginPath();
	context.arc(10, 10, 2.55, 0, Math.PI * 2);
	context.fill();
	context.restore();
}

/** The dark diamond the HUD sets behind a resource mark. */
function paintMarkPlate(context: CanvasRenderingContext2D, x: number, y: number, box: number): void {
	const inset = box * 0.18;
	const side = box - inset * 2;
	const cx = x + box / 2;
	const cy = y + box / 2;
	context.save();
	context.translate(cx, cy);
	context.rotate(Math.PI / 4);
	const fill = context.createLinearGradient(-side / 2, -side / 2, side / 2, side / 2);
	fill.addColorStop(0, "#3A2E12");
	fill.addColorStop(1, "#0B0A07");
	context.fillStyle = fill;
	context.fillRect(-side / 2, -side / 2, side, side);
	context.strokeStyle = "rgba(255,215,61,0.3)";
	context.lineWidth = 1;
	context.strokeRect(-side / 2, -side / 2, side, side);
	context.restore();
}

/** A hairline between two counts, fading at the top and bottom the way the HUD strip does. */
function paintStripRule(context: CanvasRenderingContext2D, x: number, y: number, height: number): void {
	const fade = context.createLinearGradient(x, y, x, y + height);
	fade.addColorStop(0, "rgba(255,215,61,0)");
	fade.addColorStop(0.5, "rgba(255,215,61,0.35)");
	fade.addColorStop(1, "rgba(255,215,61,0)");
	context.strokeStyle = fade;
	context.lineWidth = 1;
	context.beginPath();
	context.moveTo(x, y);
	context.lineTo(x, y + height);
	context.stroke();
}

/**
 * Minerals aboard, as one row in the header: a mark and a count, and no name.
 * The same row the warehouse uses, counting what is in the ship. Returns the strip's left edge.
 */
function paintCargoStrip(context: CanvasRenderingContext2D, header: Rect, stock: HoldStock): number {
	const countSize = Math.max(11, Math.round(header.h * 0.36));
	const box = Math.max(14, Math.min(18, header.h - 8));
	const iconGap = 4;
	const ruleGap = 6;
	const ruleH = Math.max(8, Math.round(box * 0.65));
	const items = stock.counts.map((line) => {
		const amount = amountLabel(line.amount);
		context.font = `700 ${countSize}px ${FACE}`;
		track(context, countSize);
		return { line, amount, width: Math.max(context.measureText(amount).width, countSize * 1.15) };
	});
	let total = 0;
	items.forEach((item, index) => {
		if (index > 0) {
			total += ruleGap + 1 + ruleGap;
		}
		total += box + iconGap + item.width;
	});
	const right = header.x + header.w;
	let x = right - total;
	const left = x;
	const top = header.y + (header.h - box) / 2;
	const textY = header.y + (header.h - countSize) / 2;
	const ruleTop = header.y + (header.h - ruleH) / 2;
	items.forEach((item, index) => {
		if (index > 0) {
			x += ruleGap;
			paintStripRule(context, x, ruleTop, ruleH);
			x += 1 + ruleGap;
		}
		if (isCargoLabel(item.line.label)) {
			paintMarkPlate(context, x, top, box);
			const mark = Math.round(box * 0.62);
			drawMark(context, item.line.label, x + (box - mark) / 2, top + (box - mark) / 2, mark);
		}
		x += box + iconGap;
		write(context, item.amount, countSize, AMBER, "left", x, textY, 700);
		x += item.width;
	});
	return left;
}

/** Nearby planets, with moons and mines grouped beneath the one that is open, and the coast for the mine picked. */
function paintPlanning(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	fix: NavFix,
	stock: HoldStock,
	controls: NavControls
): void {
	const geometry = planGeometry(width, height, fix, controls);
	if (!geometry) {
		return;
	}
	const { targets, rows, detail, list } = geometry;
	context.save();
	context.beginPath();
	context.rect(list.x, list.y, list.w, list.h);
	context.clip();
	rows.forEach((row, index) => {
		const rect = targets.rows[index]?.rect;
		if (!rect) {
			return;
		}
		const selected = row.kind === "mine" && row.id === controls.selected;
		if (selected) {
			context.fillStyle = "rgba(255,215,61,0.16)";
			context.fillRect(rect.x, rect.y, rect.w, rect.h);
		}
		const indent = 14 + row.depth * 16;
		const ink = selected || row.kind === "planet" ? AMBER : BONE;
		const size = row.kind === "planet" ? 13 : 12;
		const textY = rect.y + (rect.h - size) / 2;
		let textX = rect.x + indent;
		if (row.kind !== "mine") {
			write(context, row.open ? "▾" : "▸", size, ink, "left", textX, textY, 700);
			textX += 16;
		}
		write(context, row.label.toUpperCase(), size, ink, "left", textX, textY, row.kind === "planet" ? 700 : 600);
	});
	context.restore();
	if (targets.up) {
		paintPlanButton(context, targets.up, "Up", true);
	}
	if (targets.down) {
		paintPlanButton(context, targets.down, "Down", true);
	}
	paintPlanDetail(context, detail, stock, controls);
}

function paintPlanButton(context: CanvasRenderingContext2D, rect: Rect, label: string, enabled: boolean): void {
	plate(context, rect, enabled ? "#221C10" : "#14110C", enabled ? "rgba(255,215,61,0.45)" : "rgba(255,215,61,0.18)", 6);
	const size = Math.max(11, Math.round(rect.h * 0.38));
	write(context, label.toUpperCase(), size, enabled ? AMBER : "rgba(232,228,217,0.35)", "center", rect.x + rect.w / 2, rect.y + (rect.h - size) / 2, 700);
}

function paintPlanDetail(context: CanvasRenderingContext2D, detail: Rect, stock: HoldStock, controls: NavControls): void {
	const name = controls.selected ? findMine(controls.selected)?.label : null;
	let y = detail.y;
	const term = 12;
	const value = 16;
	write(context, "ENERGY", term, "rgba(232,228,217,0.45)", "left", detail.x, y, 600);
	write(context, amountLabel(stock.energy), value, AMBER, "right", detail.x + detail.w, y - 2, 700);
	y += 28;
	if (!name) {
		write(context, "SELECT A MINE", value, AMBER, "left", detail.x, y, 700);
		write(context, "SPEED SETS THE COAST", term, "rgba(232,228,217,0.45)", "left", detail.x, y + 24, 600);
		return;
	}
	write(context, name.toUpperCase(), value, BONE, "left", detail.x, y, 700);
	y += 26;
	if (!controls.offer) {
		write(context, (controls.blocked ?? "No coast").toUpperCase(), term, "rgba(232,228,217,0.45)", "left", detail.x, y, 600);
		return;
	}
	const offer = controls.offer;
	write(context, `CRUISE  ${offer.speed.toFixed(1)}`, term, "rgba(232,228,217,0.45)", "left", detail.x, y, 600);
	const block = detailBlock(detail);
	if (offer.maxSpeed - offer.minSpeed >= 0.05) {
		paintPlanButton(context, block.slower, "−", offer.speed > offer.minSpeed + 0.05);
		paintPlanButton(context, block.faster, "+", offer.speed < offer.maxSpeed - 0.05);
		paintSpeedTrack(context, block.speed, offer);
	}
	y = block.speed.y + block.speed.h + 10;
	write(context, `TIME  ${formatTravelTime(offer.seconds)}`, term, BONE, "left", detail.x, y, 600);
	y += 18;
	write(context, `BURNS  ${amountLabel(offer.cost)}`, term, AMBER, "left", detail.x, y, 600);
	const commit = routeCommit(stock.energy, offer.cost, offer.reserve);
	paintPlanButton(context, block.depart, commit.label, commit.enabled);
}

function paintSpeedTrack(context: CanvasRenderingContext2D, rect: Rect, offer: NavCourseOffer): void {
	const y = rect.y + rect.h / 2;
	context.strokeStyle = "rgba(255,215,61,0.28)";
	context.lineWidth = 4;
	context.lineCap = "round";
	context.beginPath();
	context.moveTo(rect.x + 2, y);
	context.lineTo(rect.x + rect.w - 2, y);
	context.stroke();
	const span = Math.max(0.05, offer.maxSpeed - offer.minSpeed);
	const t = Math.max(0, Math.min(1, (offer.speed - offer.minSpeed) / span));
	const thumb = rect.x + 2 + t * (rect.w - 4);
	context.fillStyle = AMBER;
	context.beginPath();
	context.arc(thumb, y, 6, 0, Math.PI * 2);
	context.fill();
}

/** The wait after a coast is locked, before the ship is en route. */
function paintCountdown(context: CanvasRenderingContext2D, area: Rect, countdown: { seconds: number; name: string }): void {
	const cx = area.x + area.w / 2;
	const number = Math.max(48, Math.round(area.h * 0.42));
	write(context, String(Math.max(0, countdown.seconds)), number, AMBER, "center", cx, area.y + area.h * 0.18, 700);
	const name = Math.max(14, Math.round(area.h * 0.08));
	write(context, countdown.name.toUpperCase(), name, BONE, "center", cx, area.y + area.h * 0.68, 700);
	write(context, "DEPARTING", 12, "rgba(232,228,217,0.45)", "center", cx, area.y + area.h * 0.68 + name + 8, 600);
}

function paintNav(context: CanvasRenderingContext2D, frame: CenterFrame, fix: NavFix, stock: HoldStock): void {
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const seconds = reduce ? null : performance.now() / 1000;
	const local = localBody(fix);
	const { content, gap } = frame;
	const clock = fix.course && fix.course.total > 0 ? fix.course : null;
	const gaugeW = energyColumnWidth(context, stock.energy);
	const timerBox = clock ? Math.min(content.h * 0.92, content.h) : 0;
	const reserved = gap + gaugeW + (timerBox > 0 ? gap + timerBox : 0);
	const map = Math.min(content.h, Math.max(64, content.w - reserved - gap - 140));
	const discX = content.x;
	const discY = content.y + (content.h - map) / 2;
	const cx = discX + map / 2;
	const cy = discY + map / 2;

	context.save();
	context.beginPath();
	context.arc(cx, cy, map / 2 - 1, 0, Math.PI * 2);
	context.clip();
	context.fillStyle = "#07080A";
	context.fillRect(discX, discY, map, map);
	context.translate(cx, cy);
	if (local) {
		renderLocal(context, map, fix, local);
	} else {
		renderSystem(context, map, fix, null, seconds);
	}
	context.restore();
	context.beginPath();
	context.arc(cx, cy, map / 2 - 1, 0, Math.PI * 2);
	context.strokeStyle = "rgba(255,215,61,0.55)";
	context.lineWidth = Math.max(1.5, map / MAP_SIZE);
	context.stroke();

	const caption = Math.max(11, Math.round(map * 0.075));
	write(context, (local ? bodyLabel(local.id) : "Sol").toUpperCase(), caption, AMBER, "center", cx, cy + map * 0.34, 700);

	const textX = discX + map + gap;
	const right = content.x + content.w;
	const gaugeX = right - gaugeW;
	const timerX = timerBox > 0 ? gaugeX - gap - timerBox : gaugeX;
	const readW = Math.max(1, timerX - gap - textX);
	const term = Math.max(11, Math.round(content.h * 0.055));
	const value = Math.max(13, Math.round(content.h * 0.078));
	const rowGap = Math.round(content.h * 0.035);
	const line = (size: number) => size + 3;
	const block = line(term) + line(value) + rowGap;
	const rows = block * 3 - rowGap;
	let y = content.y + Math.max(0, (content.h - rows) / 2);
	const readings = [
		{ term: "Local", value: local ? `${bodyLabel(local.id)} orbit` : "Open space" },
		{ term: "Bearing", value: `${String(bearing(fix)).padStart(3, "0")}°` },
		{ term: "Course", value: fix.course?.name ?? "Holding" },
	];
	for (const reading of readings) {
		write(context, reading.term.toUpperCase(), term, "rgba(232,228,217,0.42)", "left", textX, y, 400);
		y += line(term);
		write(context, fitAt(context, reading.value.toUpperCase(), value, readW), value, BONE, "left", textX, y, 700);
		y += line(value) + rowGap;
	}

	if (clock && timerBox > 0) {
		const timerY = content.y + (content.h - timerBox) / 2;
		paintTravelClock(context, timerX + timerBox / 2, timerY + timerBox / 2, timerBox / 2 - 3, clock.remaining, clock.total);
	}
	paintEnergyGauge(
		context,
		{ x: gaugeX, y: content.y, w: gaugeW, h: content.h },
		stock.energy,
		stock.energyCapacity,
		clock?.spending ?? false
	);
}

/** A collector's dish, or a mine's body, filled to the load it still holds. */
function paintVessel(context: CanvasRenderingContext2D, rect: Rect, source: SiphonSource): void {
	const share = source.capacity > 0 ? Math.max(0, Math.min(1, source.remaining / source.capacity)) : 0;
	const ink = elementColor[source.resource];
	const cx = rect.x + rect.w / 2;
	const cy = rect.y + rect.h / 2;
	if (source.kind === "collector") {
		const radius = Math.min(rect.w, rect.h) * 0.36;
		context.beginPath();
		context.arc(cx, cy, radius, 0, Math.PI * 2);
		context.strokeStyle = "rgba(255,215,61,0.55)";
		context.lineWidth = 1.5;
		context.stroke();
		context.save();
		context.beginPath();
		context.arc(cx, cy, radius - 5, 0, Math.PI * 2);
		context.clip();
		const well = radius * 2 - 10;
		const fillTop = cy + radius - 5 - well * share;
		context.fillStyle = ink;
		context.globalAlpha = 0.38;
		context.fillRect(cx - radius, fillTop, radius * 2, Math.max(0, well * share));
		context.restore();
		context.beginPath();
		context.arc(cx, cy, radius * 0.72, 0, Math.PI * 2);
		context.strokeStyle = "rgba(255,215,61,0.28)";
		context.lineWidth = 1;
		context.stroke();
		drawEnergyMark(context, cx - 9, cy - 9, 18);
		return;
	}
	const body: Rect = { x: rect.x + rect.w * 0.22, y: rect.y + rect.h * 0.18, w: rect.w * 0.56, h: rect.h * 0.64 };
	context.save();
	chamfer(context, body, 8);
	context.clip();
	context.fillStyle = ink;
	context.globalAlpha = 0.38;
	context.fillRect(body.x, body.y + body.h * (1 - share), body.w, body.h * share);
	context.restore();
	context.save();
	chamfer(context, body, 8);
	context.strokeStyle = "rgba(255,215,61,0.55)";
	context.lineWidth = 1.5;
	context.stroke();
	context.restore();
	const boreW = body.w * 0.28;
	const bore: Rect = { x: body.x + (body.w - boreW) / 2, y: body.y - body.h * 0.08, w: boreW, h: body.h * 0.16 };
	context.strokeStyle = "rgba(255,215,61,0.7)";
	context.lineWidth = 1.5;
	context.strokeRect(bore.x, bore.y, bore.w, bore.h);
	const mineral = yieldName(source.resource);
	if (isCargoLabel(mineral)) {
		const mark = Math.max(14, Math.round(body.w * 0.28));
		drawMark(context, mineral, body.x + (body.w - mark) / 2, body.y + body.h * 0.38, mark);
	}
}

/** The dock being drawn, with the load it still holds beside the load it contained. */
function paintMining(context: CanvasRenderingContext2D, area: Rect, source: SiphonSource | null): void {
	if (!source) {
		const title = Math.max(16, Math.round(area.h * 0.12));
		const body = Math.max(11, Math.round(area.h * 0.07));
		const cx = area.x + area.w / 2;
		const cy = area.y + area.h * 0.42;
		write(context, "NO CONTACT", title, AMBER, "center", cx, cy, 700);
		write(context, "DOCK TO DRAW", body, "rgba(168,144,96,0.95)", "center", cx, cy + title + 8, 600);
		return;
	}
	const gap = Math.max(8, Math.round(area.w * 0.03));
	const drawing = Math.min(area.h * 0.92, area.w * 0.42);
	const box: Rect = { x: area.x, y: area.y + (area.h - drawing) / 2, w: drawing, h: drawing };
	paintVessel(context, box, source);
	const textX = box.x + box.w + gap;
	const textW = Math.max(1, area.x + area.w - textX);
	const term = Math.max(11, Math.round(area.h * 0.07));
	const value = Math.max(16, Math.round(area.h * 0.12));
	const line = (size: number) => size + 4;
	let y = area.y + Math.max(0, (area.h - (line(term) + line(value)) * 2 - term) / 2);
	write(context, source.kind === "collector" ? "COLLECTOR" : "MINE", term, "rgba(232,228,217,0.42)", "left", textX, y, 600);
	y += line(term);
	const readings = [
		{ term: "Remaining", value: amountLabel(source.remaining), ink: AMBER },
		{ term: "Contained", value: amountLabel(source.capacity), ink: BONE },
	];
	for (const reading of readings) {
		write(context, reading.term.toUpperCase(), term, "rgba(232,228,217,0.42)", "left", textX, y, 400);
		y += line(term);
		write(context, fitAt(context, reading.value, value, textW), value, reading.ink, "left", textX, y, 700);
		y += line(value);
	}
}

function paintBattle(context: CanvasRenderingContext2D, area: Rect): void {
	const cx = area.x + area.w / 2;
	const cy = area.y + area.h * 0.42;
	const arm = Math.max(8, Math.round(area.h * 0.06));
	context.save();
	context.translate(cx, cy);
	context.rotate(Math.PI / 4);
	context.strokeStyle = "rgba(255,215,61,0.7)";
	context.lineWidth = 1.5;
	context.strokeRect(-arm, -arm, arm * 2, arm * 2);
	context.restore();
	const title = Math.max(18, Math.round(area.h * 0.14));
	const body = Math.max(12, Math.round(area.h * 0.07));
	write(context, "STANDBY", title, AMBER, "center", cx, cy + arm + title, 700);
	write(context, "NO WEAPONS ARE FITTED", body, "rgba(168,144,96,0.95)", "center", cx, cy + arm + title + body + 10, 600);
}

function paintTab(context: CanvasRenderingContext2D, rect: Rect, label: string, selected: boolean): void {
	const fill = selected ? vertical(context, rect, palette.flare, palette.bronze) : vertical(context, rect, "#221C10", "#0C0B08");
	plate(context, rect, fill, selected ? "rgba(255,243,196,0.95)" : "rgba(255,215,61,0.32)", 8);
	const size = Math.max(12, Math.round(rect.h * 0.38));
	const ink = selected ? "#1A1200" : AMBER;
	write(context, label.toUpperCase(), size, ink, "center", rect.x + rect.w / 2, rect.y + (rect.h - size) / 2, 700);
}

function write(
	context: CanvasRenderingContext2D,
	text: string,
	size: number,
	color: string,
	align: CanvasTextAlign,
	x: number,
	y: number,
	weight: 400 | 600 | 700
): void {
	context.font = `${weight} ${size}px ${FACE}`;
	context.fillStyle = color;
	context.textAlign = align;
	context.textBaseline = "top";
	track(context, size);
	context.fillText(text, x, y);
}

function fitAt(context: CanvasRenderingContext2D, text: string, size: number, width: number): string {
	context.font = `700 ${size}px ${FACE}`;
	track(context, size);
	return fit(context, text, width);
}

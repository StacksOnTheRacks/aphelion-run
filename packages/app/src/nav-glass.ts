import { CARGO_CAPACITY, ENERGY_CAPACITY } from "./demo/energy";
import { LOCAL_REACH, bearing, bodyLabel, localBody, localPoint, systemPoint, type NavBody, type NavFix } from "./demo/nav";
import { formatTravelTime, travelShare } from "./travel-clock";

const AMBER = "#FCD34D";
const BONE = "#E8E4D9";
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

/** Minerals the hold can carry, in the order the center screen lists them. */
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

/** Nothing on the center glass takes a tap. The mode marks are labels. */
export function centerHit(_width: number, _height: number, _x: number, _y: number, _page: CenterPage): null {
	return null;
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
 * The center glass. Nav keeps the course dial, the travel clock, the fuel spent on that trip,
 * and the minerals in the hold. Mining shows the same hold while the ship is drawing.
 * Drawn in the glass texture's pixels, with the top of the canvas at the top of the screen.
 */
export function paintCenterPanel(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	fix: NavFix,
	stock: HoldStock,
	screen: { page: CenterPage }
): void {
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

	paintHeader(context, frame, screen.page, fix);
	if (screen.page === "nav") {
		paintNav(context, frame, fix, stock);
	} else if (screen.page === "mining") {
		paintMining(context, frame.content, stock);
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

function paintHeader(context: CanvasRenderingContext2D, frame: CenterFrame, page: CenterPage, fix: NavFix): void {
	const size = Math.max(13, Math.round(frame.header.h * 0.62));
	write(context, PAGE_TITLE[page].toUpperCase(), size, AMBER, "left", frame.header.x, frame.header.y + (frame.header.h - size) / 2, 700);
	const note = page === "nav" ? (fix.course?.name ?? "Holding") : page === "mining" ? "Hold" : "Standby";
	write(context, note.toUpperCase(), Math.round(size * 0.72), "rgba(232,228,217,0.45)", "right", frame.header.x + frame.header.w, frame.header.y + (frame.header.h - size) / 2, 600);
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

/** Energy spent so far on the trip, sampled across the clock. Flat while the engine is dark. */
function paintFuelChart(context: CanvasRenderingContext2D, rect: Rect, samples: readonly number[]): void {
	const title = Math.max(11, Math.round(rect.h * 0.14));
	write(context, "FUEL", title, "rgba(232,228,217,0.45)", "left", rect.x, rect.y, 600);
	const latest = samples.length > 0 ? samples[samples.length - 1] : 0;
	write(context, amountLabel(latest), title, AMBER, "right", rect.x + rect.w, rect.y, 700);
	const top = rect.y + title + 8;
	const plot: Rect = { x: rect.x, y: top, w: rect.w, h: Math.max(8, rect.y + rect.h - top) };
	context.strokeStyle = "rgba(255,215,61,0.22)";
	context.lineWidth = 1;
	context.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.w - 1, plot.h - 1);
	const series = samples.length === 0 ? [0, 0] : samples.length === 1 ? [samples[0], samples[0]] : samples;
	const peak = Math.max(1, ...series);
	const pointAt = (index: number) => ({
		x: plot.x + (index / (series.length - 1)) * plot.w,
		y: plot.y + plot.h - 3 - (series[index] / peak) * (plot.h - 6),
	});
	context.beginPath();
	series.forEach((_, index) => {
		const point = pointAt(index);
		if (index === 0) {
			context.moveTo(point.x, plot.y + plot.h);
			context.lineTo(point.x, point.y);
		} else {
			context.lineTo(point.x, point.y);
		}
	});
	const end = pointAt(series.length - 1);
	context.lineTo(end.x, plot.y + plot.h);
	context.closePath();
	const wash = context.createLinearGradient(plot.x, plot.y, plot.x, plot.y + plot.h);
	wash.addColorStop(0, "rgba(255,215,61,0.35)");
	wash.addColorStop(1, "rgba(255,215,61,0.02)");
	context.fillStyle = wash;
	context.fill();
	context.beginPath();
	series.forEach((_, index) => {
		const point = pointAt(index);
		if (index === 0) {
			context.moveTo(point.x, point.y);
		} else {
			context.lineTo(point.x, point.y);
		}
	});
	context.strokeStyle = "#FFD73D";
	context.lineWidth = 2;
	context.lineJoin = "round";
	context.stroke();
}

/** Minerals aboard. Energy stays in its own tank and is not a hold count. */
function paintHoldCounts(context: CanvasRenderingContext2D, rect: Rect, stock: HoldStock): void {
	const title = Math.max(11, Math.round(rect.h * 0.09));
	write(context, "HOLD", title, "rgba(232,228,217,0.45)", "left", rect.x, rect.y, 600);
	const rows = Math.max(1, stock.counts.length);
	const rowH = (rect.h - title - 8) / rows;
	const size = Math.max(11, Math.min(18, Math.round(rowH * 0.42)));
	stock.counts.forEach((line, index) => {
		const y = rect.y + title + 10 + index * rowH + (rowH - size) / 2;
		write(context, line.label.toUpperCase(), size, "rgba(232,228,217,0.5)", "left", rect.x, y, 600);
		write(context, amountLabel(line.amount), size, line.amount > 0 ? AMBER : BONE, "right", rect.x + rect.w, y, 700);
	});
}

function paintNav(context: CanvasRenderingContext2D, frame: CenterFrame, fix: NavFix, stock: HoldStock): void {
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const seconds = reduce ? null : performance.now() / 1000;
	const local = localBody(fix);
	const { content, gap } = frame;
	const holdW = Math.max(120, Math.min(200, Math.round(content.w * 0.18)));
	const clock = fix.course && fix.course.total > 0 ? fix.course : null;
	let timerBox = 0;
	let chartW = 0;
	if (clock) {
		timerBox = Math.min(content.h * 0.92, content.h);
		chartW = Math.max(96, Math.min(timerBox * 1.35, Math.round(content.w * 0.22)));
	}
	const reserved = holdW + (timerBox > 0 ? gap + timerBox + gap + chartW : 0) + gap;
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
	const holdX = right - holdW;
	const chartX = timerBox > 0 ? holdX - gap - chartW : holdX;
	const timerX = timerBox > 0 ? chartX - gap - timerBox : holdX;
	const readW = Math.max(1, timerX - gap - textX);
	const term = Math.max(11, Math.round(content.h * 0.055));
	const value = Math.max(13, Math.round(content.h * 0.078));
	const rowGap = Math.round(content.h * 0.035);
	const bar = Math.max(4, Math.round(content.h * 0.02));
	const line = (size: number) => size + 3;
	const block = line(term) + line(value) + rowGap;
	const rows = block * 3 + line(term) + bar;
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
	const progress = fix.course ? Math.floor(fix.course.progress * 100) : null;
	write(context, "RUN", term, "rgba(232,228,217,0.42)", "left", textX, y, 400);
	write(context, progress === null ? "—" : `${progress}%`, term, AMBER, "right", textX + readW, y, 600);
	y += line(term);
	context.fillStyle = "rgba(255,215,61,0.12)";
	context.fillRect(textX, y, readW, bar);
	const fill = context.createLinearGradient(textX, y, textX + readW, y);
	fill.addColorStop(0, "#C8641E");
	fill.addColorStop(1, "#FFD73D");
	context.fillStyle = fill;
	context.fillRect(textX, y, readW * ((progress ?? 0) / 100), bar);

	if (clock && timerBox > 0) {
		const timerY = content.y + (content.h - timerBox) / 2;
		paintTravelClock(context, timerX + timerBox / 2, timerY + timerBox / 2, timerBox / 2 - 3, clock.remaining, clock.total);
		paintFuelChart(context, { x: chartX, y: timerY, w: chartW, h: timerBox }, clock.spent);
	}
	paintHoldCounts(context, { x: holdX, y: content.y, w: holdW, h: content.h }, stock);
}

function paintMeter(
	context: CanvasRenderingContext2D,
	area: Rect,
	y: number,
	rowH: number,
	row: { label: string; amount: number; capacity: number; ink: string }
): void {
	const label = Math.max(11, Math.round(rowH * 0.34));
	const barH = Math.max(7, Math.round(rowH * 0.28));
	const amount = amountLabel(row.amount);
	const share = row.capacity > 0 ? Math.max(0, Math.min(1, row.amount / row.capacity)) : 0;
	write(context, row.label.toUpperCase(), label, "rgba(232,228,217,0.5)", "left", area.x, y, 600);
	write(context, amount, label, row.ink, "right", area.x + area.w, y, 700);
	const barY = y + label + Math.max(4, Math.round((rowH - label - barH) / 2));
	context.fillStyle = "rgba(255,215,61,0.1)";
	context.fillRect(area.x, barY, area.w, barH);
	if (share > 0) {
		const fill = context.createLinearGradient(area.x, barY, area.x + area.w, barY);
		fill.addColorStop(0, "#C8641E");
		fill.addColorStop(0.7, "#E9A92A");
		fill.addColorStop(1, "#FFD73D");
		context.fillStyle = fill;
		context.fillRect(area.x, barY, Math.max(2, area.w * share), barH);
	}
	context.fillStyle = "rgba(255,215,61,0.35)";
	for (const tick of [0.25, 0.5, 0.75]) {
		context.fillRect(area.x + area.w * tick, barY, 1, barH);
	}
}

function paintMining(context: CanvasRenderingContext2D, area: Rect, stock: HoldStock): void {
	const meters = [
		{ label: "Energy", amount: stock.energy, capacity: stock.energyCapacity, ink: AMBER },
		{ label: "Cargo", amount: stock.cargo, capacity: stock.cargoCapacity, ink: BONE },
	];
	const gap = Math.max(6, Math.round(area.h * 0.02));
	const countH = Math.max(18, Math.round(area.h * 0.12));
	const countsH = countH * stock.counts.length;
	const meterSpace = Math.max(meters.length * 28, area.h - countsH - gap);
	const meterH = (meterSpace - gap) / meters.length;
	meters.forEach((row, index) => {
		paintMeter(context, area, area.y + index * (meterH + gap), meterH, row);
	});
	const countsTop = area.y + meters.length * (meterH + gap);
	const countSize = Math.max(11, Math.round(countH * 0.55));
	stock.counts.forEach((line, index) => {
		const y = countsTop + index * countH + (countH - countSize) / 2;
		write(context, line.label.toUpperCase(), countSize, "rgba(232,228,217,0.5)", "left", area.x, y, 600);
		write(context, amountLabel(line.amount), countSize, BONE, "right", area.x + area.w, y, 700);
	});
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
	const fill = selected ? vertical(context, rect, "#FFF0A8", "#C8941A") : vertical(context, rect, "#221C10", "#0C0B08");
	plate(context, rect, fill, selected ? "rgba(255,240,168,0.95)" : "rgba(255,215,61,0.32)", 8);
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

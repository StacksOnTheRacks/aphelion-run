import { CARGO_CAPACITY, ENERGY_CAPACITY } from "./demo/energy";
import { LOCAL_REACH, bearing, bodyLabel, localBody, localPoint, systemPoint, type NavBody, type NavFix } from "./demo/nav";

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

/** Energy aboard, and the other containers. An uncounted mineral is empty. Amounts sit against capacity. */
export type HoldStock = {
	energy: number;
	energyCapacity: number;
	containers: readonly { label: string; amount: number; capacity: number }[];
};

/** The hold as the center screen draws it. Minerals default to empty until they are counted aboard. */
export function holdStock(energy: number, minerals: Partial<Record<CargoLabel, number>> = {}): HoldStock {
	return {
		energy,
		energyCapacity: ENERGY_CAPACITY,
		containers: CARGO_LABELS.map((label) => ({ label, amount: minerals[label] ?? 0, capacity: CARGO_CAPACITY })),
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

/** What Home can do this moment. `detail` is the short line under the control. */
export type CenterHome = { enabled: boolean; detail: string };

export type CenterHit = { kind: "home" };

type Rect = { x: number; y: number; w: number; h: number };

type CenterFrame = {
	header: Rect;
	content: Rect;
	home: Rect;
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

/** The header, the page, and the tab row, in the glass's pixels. Home sits on the nav page. */
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
	const homeW = Math.max(96, Math.round(content.w * 0.2));
	return {
		header,
		content,
		gap,
		home: { x: content.x + content.w - homeW, y: content.y, w: homeW, h: content.h },
		tabs: PAGES.map((entry, index) => ({
			page: entry.page,
			label: entry.label,
			rect: { x: content.x + index * (tabW + gap), y: tabsTop, w: tabW, h: tabH },
		})),
	};
}

function inside(rect: Rect, x: number, y: number): boolean {
	return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

/** Home on the navigation page. The mode marks are not controls. */
export function centerHit(width: number, height: number, x: number, y: number, page: CenterPage): CenterHit | null {
	const frame = centerFrame(width, height);
	if (page === "nav" && inside(frame.home, x, y)) {
		return { kind: "home" };
	}
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
 * The center glass. Nav keeps the course dial and sets a course home. Mining shows the hold
 * while the ship is drawing. The mode marks follow that, and only Home takes a tap.
 * Drawn in the glass texture's pixels, with the top of the canvas at the top of the screen.
 */
export function paintCenterPanel(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	fix: NavFix,
	stock: HoldStock,
	screen: { page: CenterPage; home: CenterHome }
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
		paintNav(context, frame, fix, screen.home);
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

function paintNav(context: CanvasRenderingContext2D, frame: CenterFrame, fix: NavFix, home: CenterHome): void {
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const seconds = reduce ? null : performance.now() / 1000;
	const local = localBody(fix);
	const { content, home: homeRect, gap } = frame;
	const map = Math.min(content.h, homeRect.x - gap - content.x);
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
	const textW = Math.max(1, homeRect.x - gap - textX);
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
		write(context, fitAt(context, reading.value.toUpperCase(), value, textW), value, BONE, "left", textX, y, 700);
		y += line(value) + rowGap;
	}
	const progress = fix.course ? Math.floor(fix.course.progress * 100) : null;
	write(context, "RUN", term, "rgba(232,228,217,0.42)", "left", textX, y, 400);
	write(context, progress === null ? "—" : `${progress}%`, term, AMBER, "right", textX + textW, y, 600);
	y += line(term);
	context.fillStyle = "rgba(255,215,61,0.12)";
	context.fillRect(textX, y, textW, bar);
	const fill = context.createLinearGradient(textX, y, textX + textW, y);
	fill.addColorStop(0, "#C8641E");
	fill.addColorStop(1, "#FFD73D");
	context.fillStyle = fill;
	context.fillRect(textX, y, textW * ((progress ?? 0) / 100), bar);

	paintHome(context, homeRect, home);
}

function paintHome(context: CanvasRenderingContext2D, rect: Rect, home: CenterHome): void {
	const fill = home.enabled ? vertical(context, rect, "#FFF0A8", "#C8941A") : vertical(context, rect, "#1C1810", "#0C0B08");
	plate(context, rect, fill, home.enabled ? "rgba(255,240,168,0.9)" : "rgba(255,215,61,0.28)", 12);
	const title = Math.max(16, Math.round(rect.h * 0.16));
	const detail = Math.max(10, Math.round(rect.h * 0.075));
	const ink = home.enabled ? "#1A1200" : "rgba(255,215,61,0.45)";
	const sub = home.enabled ? "rgba(26,18,0,0.72)" : "rgba(168,144,96,0.9)";
	write(context, "HOME", title, ink, "center", rect.x + rect.w / 2, rect.y + rect.h * 0.38, 700);
	write(context, fitAt(context, home.detail.toUpperCase(), detail, rect.w - 16), detail, sub, "center", rect.x + rect.w / 2, rect.y + rect.h * 0.58, 600);
}

function paintMining(context: CanvasRenderingContext2D, area: Rect, stock: HoldStock): void {
	const rows = [
		{ label: "Energy", amount: stock.energy, capacity: stock.energyCapacity },
		...stock.containers.map((container) => ({ label: container.label, amount: container.amount, capacity: container.capacity })),
	];
	const gap = Math.max(6, Math.round(area.h * 0.025));
	const rowH = (area.h - gap * (rows.length - 1)) / rows.length;
	const label = Math.max(11, Math.round(rowH * 0.34));
	const barH = Math.max(7, Math.round(rowH * 0.28));
	rows.forEach((row, index) => {
		const y = area.y + index * (rowH + gap);
		const amount = amountLabel(row.amount);
		const share = row.capacity > 0 ? Math.max(0, Math.min(1, row.amount / row.capacity)) : 0;
		write(context, row.label.toUpperCase(), label, "rgba(232,228,217,0.5)", "left", area.x, y, 600);
		write(context, amount, label, row.label === "Energy" ? AMBER : BONE, "right", area.x + area.w, y, 700);
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

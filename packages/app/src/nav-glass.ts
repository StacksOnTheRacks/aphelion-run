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

/** Energy aboard, and the other containers. An uncounted mineral is empty. */
export type HoldStock = {
	energy: number;
	containers: readonly { label: string; amount: number }[];
};

/** The hold as the center screen draws it. Minerals default to empty until they are counted aboard. */
export function holdStock(energy: number, minerals: Partial<Record<CargoLabel, number>> = {}): HoldStock {
	return {
		energy,
		containers: CARGO_LABELS.map((label) => ({ label, amount: minerals[label] ?? 0 })),
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

/**
 * The hold, in the square the local chart used to occupy. Energy is the large figure. The other
 * containers are listed under it.
 */
function paintHold(context: CanvasRenderingContext2D, x: number, top: number, width: number, height: number, stock: HoldStock): void {
	const head = Math.max(12, Math.round(height * 0.05));
	const term = Math.max(12, Math.round(height * 0.042));
	const energySize = Math.max(20, Math.round(height * 0.1));
	const gap = Math.round(height * 0.04);
	const rowGap = Math.round(height * 0.028);
	const line = (size: number) => size + 3;
	const rows = stock.containers.length;
	const block =
		line(head) + gap + line(term) + line(energySize) + gap + rows * line(term) + Math.max(0, rows - 1) * rowGap;
	let y = top + Math.max(gap, (height - block) / 2);
	const pad = Math.round(width * 0.1);
	const left = x + pad;
	const rightEdge = x + width - pad;
	const room = width - pad * 2;

	const write = (text: string, size: number, color: string, align: CanvasTextAlign, atX: number, atY: number, weight: 400 | 600 | 700) => {
		context.font = `${weight} ${size}px ${FACE}`;
		context.fillStyle = color;
		context.textAlign = align;
		context.textBaseline = "top";
		track(context, size);
		context.fillText(text, atX, atY);
	};

	write("HOLD", head, AMBER, "left", left, y, 600);
	y += line(head) + gap;
	write("ENERGY", term, "rgba(232,228,217,0.45)", "left", left, y, 400);
	y += line(term);
	context.font = `700 ${energySize}px ${FACE}`;
	write(fit(context, amountLabel(stock.energy), room), energySize, AMBER, "left", left, y, 700);
	y += line(energySize) + gap;

	for (const container of stock.containers) {
		context.font = `600 ${term}px ${FACE}`;
		const amount = amountLabel(container.amount);
		const labelRoom = room - context.measureText(amount).width - 8;
		context.font = `400 ${term}px ${FACE}`;
		write(fit(context, container.label.toUpperCase(), labelRoom), term, "rgba(232,228,217,0.45)", "left", left, y, 400);
		write(amount, term, BONE, "right", rightEdge, y, 600);
		y += line(term) + rowGap;
	}
}

/**
 * The center display. One dial on the left: the system while the ship is between bodies, and that
 * body's orbit while the ship is there. The readings sit in the middle. The hold is on the right.
 * Drawn in the glass texture’s pixels, with the top of the canvas at the top of the screen.
 */
export function paintCenterPanel(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
	fix: NavFix,
	stock: HoldStock
): void {
	const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const seconds = reduce ? null : performance.now() / 1000;
	const local = localBody(fix);

	context.setTransform(1, 0, 0, 1, 0, 0);
	context.clearRect(0, 0, width, height);
	context.fillStyle = "#050a12";
	context.fillRect(0, 0, width, height);
	context.strokeStyle = "rgba(255,215,61,0.25)";
	context.lineWidth = 2;
	context.strokeRect(1, 1, width - 2, height - 2);
	const sheen = context.createLinearGradient(0, 0, width * 0.45, 0);
	sheen.addColorStop(0, "rgba(255,255,255,0.08)");
	sheen.addColorStop(0.45, "rgba(255,255,255,0)");
	context.fillStyle = sheen;
	context.fillRect(0, 0, width, height);

	const column = Math.round(width * 0.28);
	const gap = Math.round(width * 0.02);
	const map = Math.min(Math.round(height * 0.9), Math.floor((width - column - gap * 2) / 2));
	const row = map * 2 + column + gap * 2;
	const origin = (width - row) / 2;
	const top = (height - map) / 2;
	const right = origin + map + gap + column + gap;

	const disc = (x: number, draw: (context: CanvasRenderingContext2D) => void) => {
		const cx = x + map / 2;
		const cy = top + map / 2;
		context.save();
		context.beginPath();
		context.arc(cx, cy, map / 2 - 1, 0, Math.PI * 2);
		context.clip();
		context.fillStyle = "#050a12";
		context.fillRect(x, top, map, map);
		context.translate(cx, cy);
		draw(context);
		context.restore();
		context.beginPath();
		context.arc(cx, cy, map / 2 - 1, 0, Math.PI * 2);
		context.strokeStyle = "rgba(252,211,77,0.45)";
		context.lineWidth = Math.max(1, map / MAP_SIZE);
		context.stroke();
	};

	if (local) {
		disc(origin, (drawn) => renderLocal(drawn, map, fix, local));
	} else {
		disc(origin, (drawn) => renderSystem(drawn, map, fix, null, seconds));
	}

	const caption = Math.max(11, Math.round(map * 0.07));
	context.save();
	context.font = `600 ${caption}px ${FACE}`;
	context.fillStyle = AMBER;
	context.textAlign = "center";
	context.textBaseline = "middle";
	track(context, caption);
	context.fillText((local ? bodyLabel(local.id) : "Sol").toUpperCase(), origin + map / 2, top + map * 0.86);
	context.restore();

	paintHold(context, right, top, map, map, stock);

	const termSize = Math.max(12, Math.round(height * 0.046));
	const valueSize = Math.max(14, Math.round(height * 0.062));
	const rowGap = Math.round(height * 0.04);
	const bar = Math.max(4, Math.round(height * 0.016));
	const line = (size: number) => size + 3;
	const block = line(termSize) + line(valueSize) + rowGap;
	const run = line(termSize) + bar;
	const rows = block * 3 + run;
	let y = (height - rows) / 2;
	const x = origin + map + gap;
	const progress = fix.course ? Math.floor(fix.course.progress * 100) : null;
	const readings = [
		{ term: "Local", value: local ? `${bodyLabel(local.id)} orbit` : "Open space" },
		{ term: "Bearing", value: `${String(bearing(fix)).padStart(3, "0")}°` },
		{ term: "Course", value: fix.course?.name ?? "Holding" },
	];

	context.textBaseline = "top";
	for (const reading of readings) {
		context.font = `400 ${termSize}px ${FACE}`;
		context.fillStyle = "rgba(232,228,217,0.45)";
		context.textAlign = "left";
		track(context, termSize);
		context.fillText(reading.term.toUpperCase(), x, y);
		y += line(termSize);
		context.font = `600 ${valueSize}px ${FACE}`;
		context.fillStyle = BONE;
		track(context, valueSize);
		context.fillText(fit(context, reading.value.toUpperCase(), column), x, y);
		y += line(valueSize) + rowGap;
	}

	context.font = `400 ${termSize}px ${FACE}`;
	context.fillStyle = "rgba(232,228,217,0.45)";
	context.textAlign = "left";
	track(context, termSize);
	context.fillText("RUN", x, y);
	context.textAlign = "right";
	context.fillText(progress === null ? "—" : `${progress}%`, x + column, y);
	y += line(termSize);
	context.fillStyle = "rgba(232,228,217,0.1)";
	context.fillRect(x, y, column, bar);
	context.fillStyle = "#ffd73d";
	context.fillRect(x, y, column * ((progress ?? 0) / 100), bar);
}

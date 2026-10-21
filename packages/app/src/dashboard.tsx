"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import type { EnvironmentDemo } from "./demo/environment";
import { LOCAL_REACH, bearing, bodyLabel, localBody, localPoint, systemPoint, type NavBody, type NavFix } from "./demo/nav";

const AMBER = "#FCD34D";
const BONE = "#E8E4D9";
/** CSS pixels across each round map. */
const MAP_SIZE = 148;
/** One turn of the sweep across the system map, in seconds. */
const SWEEP_SECONDS = 6;

/** `place` is the body the ship is at, or null out between them. */
type Readout = { place: string | null; bearing: string; progress: number | null };

/**
 * The console under the windscreen: the whole system on the left, the body the ship is at on the right,
 * and the readouts between them. `course` names where the ship is bound. Below a wide screen it sits
 * above the lower-left view buttons.
 */
export function Dashboard({ system, course }: { system: EnvironmentDemo; course: string | null }) {
	const systemRef = useRef<HTMLCanvasElement>(null);
	const localRef = useRef<HTMLCanvasElement>(null);
	const [readout, setReadout] = useState<Readout>({ place: null, bearing: "—", progress: null });

	useEffect(() => {
		const still = window.matchMedia("(prefers-reduced-motion: reduce)");
		return system.onNav((fix) => {
			const local = localBody(fix);
			const systemCanvas = systemRef.current;
			const localCanvas = localRef.current;
			if (systemCanvas) {
				drawSystem(systemCanvas, fix, local, still.matches ? null : performance.now() / 1000);
			}
			if (localCanvas) {
				drawLocal(localCanvas, fix, local);
			}
			const next: Readout = {
				place: local ? bodyLabel(local.id) : null,
				bearing: `${String(bearing(fix)).padStart(3, "0")}°`,
				progress: fix.course ? Math.floor(fix.course.progress * 100) : null,
			};
			setReadout((last) =>
				last.place === next.place && last.bearing === next.bearing && last.progress === next.progress ? last : next
			);
		});
	}, [system]);

	return (
		<section
			aria-label="Navigation"
			className="pointer-events-none absolute inset-x-0 bottom-[6.75rem] z-10 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6 lg:bottom-0"
		>
			<div
				className="relative flex items-stretch gap-4 rounded-sm border border-amber-300/20 bg-[#05070c]/75 px-4 py-3 shadow-[0_0_24px_rgba(252,211,77,0.08)] backdrop-blur-sm"
				style={{
					backgroundImage: "repeating-linear-gradient(0deg, rgba(232,228,217,0.035) 0 1px, transparent 1px 3px)",
				}}
			>
				{["top-0 left-0 border-t border-l", "top-0 right-0 border-t border-r", "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"].map(
					(corner) => (
						<span key={corner} aria-hidden className={`absolute h-3 w-3 border-amber-300 ${corner}`} />
					)
				)}
				<MapPane label="Sol" canvasRef={systemRef} />
				<dl className="hidden w-40 flex-col justify-center gap-2.5 font-mono text-[10px] tracking-[0.2em] uppercase sm:flex">
					<Reading term="Local" value={readout.place ? `${readout.place} orbit` : "Open space"} />
					<Reading term="Bearing" value={readout.bearing} />
					<Reading term="Course" value={course ?? "Holding"} />
					<div>
						<dt className="flex justify-between text-[#E8E4D9]/45">
							<span>Run</span>
							<span>{readout.progress === null ? "—" : `${readout.progress}%`}</span>
						</dt>
						<dd className="mt-1.5 h-1 w-full overflow-hidden bg-[#E8E4D9]/10">
							<div className="h-full bg-amber-300" style={{ width: `${readout.progress ?? 0}%` }} />
						</dd>
					</div>
				</dl>
				<MapPane label={readout.place ?? "Open space"} canvasRef={localRef} />
			</div>
		</section>
	);
}

function MapPane({ label, canvasRef }: { label: string; canvasRef: RefObject<HTMLCanvasElement> }) {
	return (
		<div className="relative" style={{ width: MAP_SIZE, height: MAP_SIZE }}>
			<canvas ref={canvasRef} aria-hidden width={MAP_SIZE} height={MAP_SIZE} className="h-full w-full" />
			<span className="absolute top-0 left-0 font-mono text-[9px] tracking-[0.22em] text-amber-300/80 uppercase">{label}</span>
		</div>
	);
}

function Reading({ term, value }: { term: string; value: string }) {
	return (
		<div>
			<dt className="text-[#E8E4D9]/45">{term}</dt>
			<dd className="mt-0.5 truncate text-amber-300">{value}</dd>
		</div>
	);
}

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

function drawCourse(context: CanvasRenderingContext2D, fix: NavFix, place: (point: { x: number; z: number }) => { x: number; y: number }): void {
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

function drawSystem(canvas: HTMLCanvasElement, fix: NavFix, local: NavBody | null, seconds: number | null): void {
	const context = prepare(canvas);
	if (!context) {
		return;
	}
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
}

function drawLocal(canvas: HTMLCanvasElement, fix: NavFix, local: NavBody | null): void {
	const context = prepare(canvas);
	if (!context) {
		return;
	}
	const radius = MAP_SIZE / 2 - 4;
	drawRim(context, radius);

	if (!local) {
		// Out between the bodies there is nothing near to draw: the ship, centered, pointing its way.
		context.strokeStyle = "rgba(232,228,217,0.14)";
		for (const ring of [0.33, 0.66]) {
			context.beginPath();
			context.arc(0, 0, radius * ring, 0, Math.PI * 2);
			context.stroke();
		}
		drawShip(context, 0, 0, fix);
		return;
	}

	const inner = radius - 4;
	const place = (point: { x: number; z: number }) => localPoint(point, local, inner);
	const scale = inner / (local.outer * LOCAL_REACH);

	context.save();
	context.beginPath();
	context.arc(0, 0, radius - 1, 0, Math.PI * 2);
	context.clip();

	context.strokeStyle = "rgba(252,211,77,0.3)";
	context.setLineDash([2, 4]);
	context.beginPath();
	context.arc(0, 0, local.outer * scale, 0, Math.PI * 2);
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
	context.arc(0, 0, Math.max(3, local.radius * scale), 0, Math.PI * 2);
	context.fill();

	context.fillStyle = BONE;
	for (const moon of moons) {
		const at = place(moon);
		context.beginPath();
		context.arc(at.x, at.y, Math.max(1.5, moon.radius * scale), 0, Math.PI * 2);
		context.fill();
	}
	context.restore();

	const ship = place(fix.ship);
	const reach = Math.hypot(ship.x, ship.y);
	const pinned = reach > radius - 6 ? (radius - 6) / reach : 1;
	drawShip(context, ship.x * pinned, ship.y * pinned, fix);
}

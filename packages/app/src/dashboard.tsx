"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Inter } from "next/font/google";

import type { PilotViewpoint, ScreenRect } from "./demo/cockpit";
import type { EnvironmentDemo } from "./demo/environment";
import { bearing, bodyLabel, localBody } from "./demo/nav";
import { HudTile } from "./hud";
import { MAP_SIZE, drawLocal, drawSystem, holdStock, type HoldStock } from "./nav-glass";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"] });

/** `place` is the body the ship is at, or null out between them. */
type Readout = { place: string | null; bearing: string; progress: number | null };

/** The console is drawn at the cockpit design size, then scaled to the window. */
const STAGE_W = 1440;
/** The combiner sits this far above the panel, in the glareshield notch. */
const COMBINER_LIFT = 70;
const PANEL_H = 464;
const STAGE_H = PANEL_H + COMBINER_LIFT;
/** The header plaque. Scaling leaves at least this much of the window above the console. */
const HEADER_H = 36;

const AFT_KEYS = ["ZOOM", "GAIN", "IR", "FRZ"] as const;
const AFT_KEYS_LOWER = ["PAN", "TRK", "REC"] as const;
const NAV_KEYS = ["NAV", "SOL", "EARTH", "RUN", "SYS"] as const;
const NAV_KEYS_LOWER = ["TAC", "COM", "AFT", "DCLT", "MENU"] as const;
const LAMPS = ["FUEL", "HYD", "O2", "He-3", "SHLD", "COMM"] as const;
const TOGGLES = [
	{ label: "LTS", left: 200 },
	{ label: "DEFOG", left: 250 },
	{ label: "ARM", left: 300 },
] as const;

/** The aft glass, in the panel's own pixels. The mask cuts these out so the cameras show through. */
const GLASS_TOP = 144;
const GLASS_W = 300;
const GLASS_H = 176;
const PORT_GLASS = 68;
const STBD_GLASS = 1068;

function consoleScale(width: number, height: number): number {
	const byWidth = width / STAGE_W;
	const byHeight = Math.max(0, height - HEADER_H) / STAGE_H;
	return Math.min(byWidth, byHeight);
}

/**
 * The console under the windscreen. Side displays hold the aft cameras and the center display holds the
 * chart and the hold. Exit and the view switch sit in the same screen corner as the chart step, apart from
 * the plate. The bezel keys, lamps, and toggles are drawn and do not act. The plate is the design size,
 * scaled to the window, and sits on the bottom edge.
 */
export function Dashboard({
	system,
	course,
	viewpoint,
	onAftRects,
}: {
	system: EnvironmentDemo;
	course: string | null;
	viewpoint: PilotViewpoint;
	onAftRects: (rects: { port: ScreenRect; starboard: ScreenRect }) => void;
}) {
	const chartRef = useRef<HTMLCanvasElement>(null);
	const portRef = useRef<HTMLDivElement>(null);
	const stbdRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(1);
	const [readout, setReadout] = useState<Readout>({ place: null, bearing: "—", progress: null });
	const [stock, setStock] = useState<HoldStock>(() => stockOf(system.hold()));
	const live = viewpoint === "interior";
	const maskId = `aft-glass-${useId().replace(/:/g, "")}`;

	useLayoutEffect(() => {
		const apply = () => setScale(consoleScale(window.innerWidth, window.innerHeight));
		apply();
		window.addEventListener("resize", apply);
		return () => window.removeEventListener("resize", apply);
	}, []);

	useLayoutEffect(() => {
		const port = portRef.current;
		const stbd = stbdRef.current;
		const canvas = port?.ownerDocument.querySelector("canvas:not([aria-hidden])");
		if (!port || !stbd || !(canvas instanceof HTMLCanvasElement)) {
			return;
		}
		const share = (glass: HTMLElement): ScreenRect | null => {
			const box = canvas.getBoundingClientRect();
			const rect = glass.getBoundingClientRect();
			if (box.width < 1 || box.height < 1 || rect.width < 1 || rect.height < 1) {
				return null;
			}
			return {
				left: (rect.left - box.left) / box.width,
				top: (rect.top - box.top) / box.height,
				width: rect.width / box.width,
				height: rect.height / box.height,
			};
		};
		const publish = () => {
			const portRect = share(port);
			const starboard = share(stbd);
			if (portRect && starboard) {
				onAftRects({ port: portRect, starboard });
			}
		};
		publish();
		const observer = new ResizeObserver(publish);
		observer.observe(canvas);
		window.addEventListener("resize", publish);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", publish);
		};
	}, [onAftRects, scale, live]);

	useEffect(() => {
		const still = window.matchMedia("(prefers-reduced-motion: reduce)");
		return system.onNav((fix) => {
			const local = localBody(fix);
			const chart = chartRef.current;
			if (chart) {
				if (local) {
					drawLocal(chart, fix, local);
				} else {
					drawSystem(chart, fix, null, still.matches ? null : performance.now() / 1000);
				}
			}
			const aboard = stockOf(system.hold());
			setStock((last) => (sameStock(last, aboard) ? last : aboard));
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
		<div className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 flex items-end justify-center ${inter.className}`}>
			<div
				className="relative shrink-0"
				style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})`, transformOrigin: "bottom center" }}
			>
				<div className="absolute top-[70px] left-0 h-[464px] w-[1440px]">
					<svg width="0" height="0" className="absolute">
						<defs>
							<mask id={maskId} maskUnits="objectBoundingBox" maskContentUnits="objectBoundingBox" x="0" y="0" width="1" height="1">
								<rect width="1" height="1" fill="white" />
								<rect x={PORT_GLASS / STAGE_W} y={GLASS_TOP / PANEL_H} width={GLASS_W / STAGE_W} height={GLASS_H / PANEL_H} fill="black" />
								<rect x={STBD_GLASS / STAGE_W} y={GLASS_TOP / PANEL_H} width={GLASS_W / STAGE_W} height={GLASS_H / PANEL_H} fill="black" />
							</mask>
						</defs>
					</svg>
					<div
						className="absolute inset-0"
						style={
							live
								? { maskImage: `url(#${maskId})`, WebkitMaskImage: `url(#${maskId})` }
								: undefined
						}
					>
					<div className="absolute top-[96px] left-0 h-[368px] w-[1440px] bg-gradient-to-b from-[#1b2029] to-[#0a0c10]" />
					<img
						src="/hud/center-pedestal.svg"
						alt=""
						width={700}
						height={360}
						className="pointer-events-none absolute top-[104px] left-[370px]"
					/>
					<div className="absolute top-[104px] left-0 h-10 w-[1440px] bg-gradient-to-b from-black/70 to-transparent" />
					<img
						src="/hud/glareshield.svg"
						alt=""
						width={1440}
						height={112}
						className="pointer-events-none absolute top-0 left-0"
					/>
					<Lamp label={"MASTER\nCAUTION"} className="absolute top-[71px] left-[528px] h-[26px] w-[70px]" />
					<Lamp label={"MASTER\nARM"} className="absolute top-[71px] left-[842px] h-[26px] w-[70px]" />

					<SideDisplay left={50} />
					<SideDisplay left={1050} />

					<div className="absolute top-[116px] left-[420px] h-[262px] w-[600px] rounded-[10px] border-2 border-[#2c3340] bg-[#0a0c11] drop-shadow-[0_6px_8px_rgba(0,0,0,0.63)]">
						<KeyRow labels={NAV_KEYS} className="top-1.5" />
						<section
							aria-label="Navigation"
							className="absolute top-7 left-[22px] h-[200px] w-[552px] overflow-hidden rounded-[3px] border border-[rgba(255,215,61,0.25)] bg-[#050a12]"
						>
							<div className="absolute top-3 left-3.5 flex h-[174px] w-[522px] items-center gap-4 px-4 py-3">
								<MapPane label={readout.place ?? "Sol"} canvasRef={chartRef} />
								<dl className="flex w-40 flex-col justify-center gap-2.5 text-[10px] tracking-[1.6px] uppercase">
									<Reading term="Local" value={readout.place ? `${readout.place} orbit` : "Open space"} />
									<Reading term="Bearing" value={readout.bearing} />
									<Reading term="Course" value={course ?? "Holding"} />
									<div>
										<dt className="flex justify-between text-[#E8E4D9]/45">
											<span>Run</span>
											<span>{readout.progress === null ? "—" : `${readout.progress}%`}</span>
										</dt>
										<dd className="mt-1.5 h-1 w-full overflow-hidden bg-[#E8E4D9]/10">
											<div className="h-full bg-[#ffd73d]" style={{ width: `${readout.progress ?? 0}%` }} />
										</dd>
									</div>
								</dl>
								<HoldPane stock={stock} />
							</div>
							<div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/[0.08] via-transparent via-45% to-transparent" />
						</section>
						<KeyRow labels={NAV_KEYS_LOWER} className="top-[235px]" />
						<Screws spots={[[4, 4], [587, 4], [4, 249], [587, 249]]} />
					</div>

					<div aria-hidden className="absolute top-[396px] left-[420px] flex w-[600px] justify-center gap-3">
						{LAMPS.map((label) => (
							<Lamp key={label} label={label} className="h-[22px] w-[84px]" />
						))}
					</div>

					<div aria-hidden className="absolute top-[372px] left-[50px] flex h-7 w-[120px] items-center justify-center rounded-[3px] border border-[#2c3340] bg-[#11141a]">
						<span className="text-[11px] font-semibold tracking-[2.4px] text-[rgba(232,228,217,0.45)]">RANGER</span>
					</div>
					{TOGGLES.map((toggle) => (
						<Toggle key={toggle.label} label={toggle.label} left={toggle.left} />
					))}

					</div>
					<AftGlass left={PORT_GLASS} title="AFT  ·  PORT" titleClass="right-3.5 text-right" feedRef={portRef} live={live} />
					<AftGlass left={STBD_GLASS} title="AFT  ·  STBD" titleClass="left-3.5" feedRef={stbdRef} live={live} />
				</div>
				<img
					src="/hud/hud-combiner.svg"
					alt=""
					width={168}
					height={78}
					className="pointer-events-none absolute top-0 left-[636px]"
				/>
			</div>
		</div>
	);
}

/**
 * Exit and the view switch, in the lower right. The view switch matches the chart step. Exit stays the
 * smaller plate beside it. The same pair is used in the cockpit and outside the ship.
 */
export function PilotCornerDock({
	viewpoint,
	onExit,
	onToggleViewpoint,
}: {
	viewpoint: PilotViewpoint;
	onExit: () => void;
	onToggleViewpoint: () => void;
}) {
	return (
		<div className={`pointer-events-none absolute right-3 bottom-3 z-10 min-[900px]:right-6 min-[900px]:bottom-6 ${inter.className}`}>
			<PilotCorner viewpoint={viewpoint} onExit={onExit} onToggleViewpoint={onToggleViewpoint} />
		</div>
	);
}

function PilotCorner({
	viewpoint,
	onExit,
	onToggleViewpoint,
}: {
	viewpoint: PilotViewpoint;
	onExit: () => void;
	onToggleViewpoint: () => void;
}) {
	const outside = viewpoint === "exterior";
	return (
		<div className="flex items-end gap-3">
			<HudTile compact label="Exit" ariaLabel="Exit to the chart" title="Back to the chart" onClick={onExit} />
			<HudTile
				label={outside ? "Interior" : "Exterior"}
				icon="/hud/crosshair.svg"
				ariaLabel={outside ? "Switch to interior view" : "Switch to exterior view"}
				title={outside ? "Back in the cockpit" : "Outside the ship"}
				onClick={onToggleViewpoint}
			/>
		</div>
	);
}

/** The bezel around an aft display. The glass itself sits outside the mask, so the camera can show through. */
function SideDisplay({ left }: { left: number }) {
	return (
		<div
			aria-hidden
			className="absolute top-[116px] h-[234px] w-[340px] rounded-[10px] border-2 border-[#2c3340] bg-[#0a0c11] drop-shadow-[0_6px_8px_rgba(0,0,0,0.63)]"
			style={{ left }}
		>
			<KeyRow labels={AFT_KEYS} className="top-1.5" />
			<KeyRow labels={AFT_KEYS_LOWER} className="top-[211px]" />
			<Screws spots={[[4, 4], [327, 4], [4, 221], [327, 221]]} />
		</div>
	);
}

function AftGlass({
	left,
	title,
	titleClass,
	feedRef,
	live,
}: {
	left: number;
	title: string;
	titleClass: string;
	feedRef: RefObject<HTMLDivElement>;
	live: boolean;
}) {
	return (
		<div
			ref={feedRef}
			aria-hidden
			className={`absolute h-[176px] w-[300px] overflow-hidden rounded-[3px] ${live ? "bg-transparent" : "bg-[#07080c]"}`}
			style={{ left, top: GLASS_TOP }}
		>
			<p className={`absolute top-[11px] text-[10px] font-semibold tracking-[1.6px] whitespace-nowrap text-[#ffd73d] ${titleClass}`}>{title}</p>
			<span className="absolute inset-0 rounded-[3px] border border-[rgba(255,215,61,0.6)]" />
		</div>
	);
}

function KeyRow({ labels, className }: { labels: readonly string[]; className: string }) {
	return (
		<div aria-hidden className={`absolute inset-x-0 flex items-start justify-center gap-4 ${className}`}>
			{labels.map((label) => (
				<span
					key={label}
					className="flex h-[14px] w-[38px] items-center justify-center rounded-[3px] border border-[#3a4352] bg-[#1f2530] text-[7px] font-semibold text-[rgba(255,215,61,0.7)]"
				>
					{label}
				</span>
			))}
		</div>
	);
}

function Lamp({ label, className }: { label: string; className: string }) {
	return (
		<span
			aria-hidden
			className={`flex items-center justify-center rounded-[2px] border border-[rgba(255,215,61,0.25)] bg-[#16120a] text-center text-[7px] leading-[9px] font-semibold text-[rgba(255,215,61,0.55)] ${className}`}
		>
			<span>
				{label.split("\n").map((line) => (
					<span key={line} className="block">
						{line}
					</span>
				))}
			</span>
		</span>
	);
}

function Toggle({ label, left }: { label: string; left: number }) {
	return (
		<div aria-hidden className="absolute top-[368px] h-[46px] w-4" style={{ left }}>
			<img src="/hud/toggle-base.svg" alt="" width={16} height={16} className="absolute top-3 left-0" />
			<span className="absolute top-0 left-1.5 h-[18px] w-1 rounded-[2px] bg-[#9aa3b2]" />
			<span className="absolute top-[34px] left-1/2 w-7 -translate-x-1/2 text-center text-[7px] font-semibold text-[rgba(232,228,217,0.45)]">
				{label}
			</span>
		</div>
	);
}

function Screws({ spots }: { spots: readonly (readonly [number, number])[] }) {
	return spots.map(([x, y]) => (
		<img key={`${x}-${y}`} src="/hud/screw.svg" alt="" width={5} height={5} className="pointer-events-none absolute" style={{ left: x, top: y }} />
	));
}

function MapPane({ label, canvasRef }: { label: string; canvasRef: RefObject<HTMLCanvasElement> }) {
	return (
		<div
			className="relative shrink-0 overflow-hidden rounded-full border border-[rgba(252,211,77,0.45)] bg-[#050a12]"
			style={{ width: MAP_SIZE, height: MAP_SIZE }}
		>
			<canvas ref={canvasRef} aria-hidden width={MAP_SIZE} height={MAP_SIZE} className="h-full w-full" />
			<span className="absolute inset-x-0 bottom-[19px] text-center text-[10px] font-semibold tracking-[1.6px] text-[#fcd34d] uppercase">
				{label}
			</span>
		</div>
	);
}

/** Energy in its own tank, then the shared hold: one fill for every mineral, and a count of each. */
function HoldPane({ stock }: { stock: HoldStock }) {
	const meters = [
		{ label: "Energy", amount: stock.energy, capacity: stock.energyCapacity },
		{ label: "Cargo", amount: stock.cargo, capacity: stock.cargoCapacity },
	];
	return (
		<section aria-label="Hold" className="flex shrink-0 flex-col justify-center gap-1.5" style={{ width: MAP_SIZE, height: MAP_SIZE }}>
			<p className="text-[10px] font-semibold tracking-[1.6px] text-[#fcd34d] uppercase">Hold</p>
			<ul className="flex flex-col gap-1.5">
				{meters.map((line) => {
					const amount = Math.round(line.amount);
					const capacity = Math.max(1, Math.round(line.capacity));
					const share = Math.max(0, Math.min(100, (amount / capacity) * 100));
					return (
						<li key={line.label}>
							<p className="flex items-baseline justify-between gap-2 text-[10px] tracking-[1.2px] uppercase">
								<span className="text-[#E8E4D9]/45">{line.label}</span>
								<span className={line.label === "Energy" ? "text-[#fcd34d]" : "text-[#e8e4d9]"}>
									{amount.toLocaleString("en-US")}
								</span>
							</p>
							<div
								className="mt-0.5 h-1.5 w-full overflow-hidden bg-[#E8E4D9]/10"
								role="img"
								aria-label={`${line.label}, ${amount.toLocaleString("en-US")} of ${capacity.toLocaleString("en-US")}`}
							>
								<div className="h-full bg-[#ffd73d]" style={{ width: `${share}%` }} />
							</div>
						</li>
					);
				})}
			</ul>
			<ul aria-label="Cargo" className="flex flex-col gap-0.5">
				{stock.counts.map((line) => {
					const amount = Math.round(line.amount);
					return (
						<li key={line.label} className="flex items-baseline justify-between gap-2 text-[10px] tracking-[1.2px] uppercase">
							<span className="text-[#E8E4D9]/45">{line.label}</span>
							<span className="text-[#e8e4d9]">{amount.toLocaleString("en-US")}</span>
						</li>
					);
				})}
			</ul>
		</section>
	);
}

function stockOf(hold: { energy: number; cargo: { hydrogen: number; ore: number; nitrogen: number; carbon: number } }): HoldStock {
	return holdStock(hold.energy, {
		Hydrogen: hold.cargo.hydrogen,
		Ore: hold.cargo.ore,
		Nitrogen: hold.cargo.nitrogen,
		Carbon: hold.cargo.carbon,
	});
}

function sameStock(left: HoldStock, right: HoldStock): boolean {
	if (Math.round(left.energy) !== Math.round(right.energy) || Math.round(left.cargo) !== Math.round(right.cargo)) {
		return false;
	}
	return left.counts.every((line, index) => Math.round(line.amount) === Math.round(right.counts[index]?.amount ?? -1));
}

function Reading({ term, value }: { term: string; value: string }) {
	return (
		<div>
			<dt className="text-[#E8E4D9]/45">{term}</dt>
			<dd className="mt-0.5 truncate text-[#e8e4d9]">{value}</dd>
		</div>
	);
}


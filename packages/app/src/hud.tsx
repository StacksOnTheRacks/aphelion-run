"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Inter, Rajdhani } from "next/font/google";

import { CARGO_CAPACITY, ENERGY_CAPACITY, type MineClock } from "./demo/energy";
import { CommandBarPlate, CREST_WING, CrestPlate, FleetPlate, ShipPlate, StepPlate } from "./hud-plates";
import { elementColor, type ElementId, palette } from "./palette";
import { formatTravelTime, travelShare, type TravelClock } from "./travel-clock";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"] });
const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["600", "700"] });

/** The corner step carries the mark of the place it opens. The same four words in every system. */
const STEP_ICON: Record<string, string> = {
	System: "/hud/system.svg",
	Galaxy: "/hud/galaxy.svg",
	Planet: "/hud/planet.svg",
	Sun: "/hud/sun.svg",
};

/** Which corners of a plate are cut, in CSS pixels. A corner left out stays square so the plate can sit flush on a screen edge. */
export type HousingCut = { tl?: number; tr?: number; bl?: number; br?: number };

/**
 * The plate shared by the HUD: a dark gold gradient, a hairline, and a brighter stroke along the edge
 * that was machined. The cut stays a fixed size as the plate grows with its label.
 */
export function Housing({
	cut,
	highlight,
	border = "all",
	bleed = false,
}: {
	cut: HousingCut;
	highlight?: "top" | "bottom" | "left";
	/** `bottom` strokes only the lower edge. `except-bottom` and `except-top` leave that edge open so a plate can sit on the screen. */
	border?: "all" | "bottom" | "except-bottom" | "except-top";
	/** Pull the fill past the top and sides, so a plate on the screen edge cannot leave a hairline of the scene. */
	bleed?: boolean;
}) {
	const ref = useRef<SVGSVGElement>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const gradientId = `housing-${useId().replace(/:/g, "")}`;

	useLayoutEffect(() => {
		const svg = ref.current;
		if (!svg) {
			return;
		}
		const measure = () => {
			const next = { w: svg.clientWidth, h: svg.clientHeight };
			setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(svg);
		return () => observer.disconnect();
	}, []);

	const fitted = clampCut(cut, size.w, size.h);
	const rule = `url(#${gradientId}-rule)`;
	const inner = { tl: inset(fitted.tl), tr: inset(fitted.tr), bl: inset(fitted.bl), br: inset(fitted.br) };

	return (
		<svg ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible">
			{size.w > 0 && size.h > 0 ? (
				<>
					<path d={platePath(size.w, size.h, fitted, bleed ? 1 : 0)} fill={`url(#${gradientId})`} />
					<path d={platePath(size.w, size.h, fitted, bleed ? 1 : 0)} fill={`url(#${gradientId}-sheen)`} />
					{border === "all" ? (
						<>
							<path d={platePath(size.w, size.h, fitted, 0, 0.5)} fill="none" stroke={rule} />
							{size.w > 24 && size.h > 24 ? (
								<path d={platePath(size.w, size.h, inner, 0, 3.5)} fill="none" stroke={HUD.gold} strokeOpacity={0.1} />
							) : null}
						</>
					) : null}
					{border === "bottom" ? <path d={edgePath(size.w, size.h, fitted, "bottom")} fill="none" stroke={rule} /> : null}
					{border === "except-bottom" ? <path d={openBottomPath(size.w, size.h, fitted)} fill="none" stroke={rule} /> : null}
					{border === "except-top" ? <path d={openTopPath(size.w, size.h, fitted)} fill="none" stroke={rule} /> : null}
					{highlight ? (
						<path
							d={edgePath(size.w, size.h, fitted, highlight)}
							fill="none"
							stroke={`url(#${gradientId}-edge)`}
							strokeWidth={1.25}
							style={{ filter: "drop-shadow(0 0 3px rgba(255, 190, 60, 0.55))" }}
						/>
					) : null}
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2={size.h} gradientUnits="userSpaceOnUse">
							<stop offset="0" stopColor="#2E2612" stopOpacity="0.98" />
							<stop offset="0.45" stopColor="#15120A" stopOpacity="0.97" />
							<stop offset="1" stopColor="#07080A" stopOpacity="0.96" />
						</linearGradient>
						<radialGradient
							id={`${gradientId}-sheen`}
							cx={size.w / 2}
							cy={highlight === "bottom" ? size.h : 0}
							r={Math.max(size.w, size.h) * 0.6}
							gradientUnits="userSpaceOnUse"
						>
							<stop offset="0" stopColor={HUD.amber} stopOpacity="0.14" />
							<stop offset="1" stopColor={HUD.amber} stopOpacity="0" />
						</radialGradient>
						<linearGradient id={`${gradientId}-rule`} x1="0" y1="0" x2={size.w} y2="0" gradientUnits="userSpaceOnUse">
							<stop offset="0" stopColor={HUD.gold} stopOpacity="0.22" />
							<stop offset="0.5" stopColor={HUD.gold} stopOpacity="0.6" />
							<stop offset="1" stopColor={HUD.gold} stopOpacity="0.22" />
						</linearGradient>
						<linearGradient
							id={`${gradientId}-edge`}
							x1="0"
							y1="0"
							x2={highlight === "left" ? 0 : size.w}
							y2={highlight === "left" ? size.h : 0}
							gradientUnits="userSpaceOnUse"
						>
							<stop offset="0" stopColor={HUD.amber} stopOpacity="0.35" />
							<stop offset="0.5" stopColor={HUD.gold} />
							<stop offset="1" stopColor={HUD.amber} stopOpacity="0.35" />
						</linearGradient>
					</defs>
				</>
			) : null}
		</svg>
	);
}

/** The HUD keeps to these. Gold carries every signal; amber only shades it; ember marks what is engaged. All three are the same gold. */
export const HUD = {
	gold: palette.gold,
	amber: palette.amber,
	ember: palette.ember,
	sand: palette.sand,
} as const;

/** A cut, carried 3px inside the plate for the inner rule. */
function inset(cut: number): number {
	return cut ? Math.max(0, cut - 1.5) : 0;
}

/** Chamfered corners as a clip path, for the small solid parts that do not need a measured plate. */
function chamfer(px: number, corners: "all" | "tr-bl" = "all"): string {
	const c = `${px}px`;
	return corners === "all"
		? `polygon(${c} 0, calc(100% - ${c}) 0, 100% ${c}, 100% calc(100% - ${c}), calc(100% - ${c}) 100%, ${c} 100%, 0 calc(100% - ${c}), 0 ${c})`
		: `polygon(0 0, calc(100% - ${c}) 0, 100% ${c}, 100% 100%, ${c} 100%, 0 calc(100% - ${c}))`;
}

/** The text treatment for a gold title: a light top falling into amber. */
const GOLD_TEXT = "bg-gradient-to-b from-[#FFF3C4] via-[#FFD73D] to-[#E8B23A] bg-clip-text text-transparent";

/** A diamond ornament set between gold rules. */
function Diamond({ className = "", lit = false }: { className?: string; lit?: boolean }) {
	return (
		<span
			aria-hidden
			className={`inline-block size-[5px] shrink-0 rotate-45 ${lit ? "bg-gradient-to-br from-[#FFD73D] to-[#A67C20] shadow-[0_0_6px_rgba(196,138,46,0.7)]" : "bg-[#FFD73D]/55"} ${className}`}
		/>
	);
}

/** A count short enough for the header: exact under ten thousand, then k and M. */
function shortCount(value: number): string {
	const n = Math.round(value);
	if (Math.abs(n) < 10_000) {
		return n.toLocaleString("en-US");
	}
	return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n).toLowerCase().replace("m", "M");
}

/** Resource marks, by lowercase resource name. The warehouse strip and the scene tags share them. */
export const RESOURCE_ICON: Record<ElementId, string> = {
	hydrogen: "/hud/helium-3.svg",
	ore: "/hud/rare-ore.svg",
	nitrogen: "/hud/oxygen.svg",
	carbon: "/hud/plasma.svg",
	energy: "/hud/sun.svg",
};

function elementGlow(hex: string): string {
	const n = Number.parseInt(hex.slice(1), 16);
	const red = (n >> 16) & 255;
	const green = (n >> 8) & 255;
	const blue = n & 255;
	return `drop-shadow(0 0 2px rgba(${red},${green},${blue},0.7))`;
}

/** A yield's mark, in that element's color. The file carries the stroke; the glow follows it. */
export function ResourceMark({ id, className = "" }: { id: string; className?: string }) {
	const key = id.toLowerCase();
	if (!isElement(key)) {
		return null;
	}
	return <img src={RESOURCE_ICON[key]} alt="" draggable={false} className={className} style={{ filter: elementGlow(elementColor[key]) }} />;
}

function isElement(id: string): id is ElementId {
	return id in elementColor;
}

/**
 * A chamfered corner control: a mark in a diamond medallion over its label, with a lit rule along the foot.
 * `compact` drops the medallion for a short word control.
 */
export function HudTile({
	label,
	icon,
	title,
	onClick,
	ariaLabel,
	compact = false,
}: {
	label: string;
	icon?: string;
	title?: string;
	onClick: () => void;
	ariaLabel?: string;
	compact?: boolean;
}) {
	return (
		<button
			type="button"
			title={title}
			aria-label={ariaLabel}
			onClick={onClick}
			className={`group pointer-events-auto relative isolate flex flex-col items-center justify-center font-bold uppercase transition-[filter,transform] duration-150 hover:brightness-110 active:translate-y-px focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none motion-reduce:transition-none ${compact ? "size-14 text-[11px] tracking-[1.5px]" : "size-20 gap-2 text-[11px] tracking-[1.6px] min-[900px]:size-[88px]"}`}
		>
			<Housing cut={compact ? { tl: 9, br: 9 } : { tl: 14, br: 14, tr: 4, bl: 4 }} highlight="bottom" />
			{icon && !compact ? (
				<span className="relative flex size-9 items-center justify-center">
					<span
						aria-hidden
						className="absolute inset-[5px] rotate-45 border border-[#FFD73D]/50 bg-gradient-to-br from-[#3A2E12] to-[#0B0A07] shadow-[0_0_10px_rgba(233,169,42,0.25)] transition-colors group-hover:border-[#FFD73D]/90"
					/>
					<img src={icon} alt="" width={18} height={18} className="relative" />
				</span>
			) : null}
			<span className={GOLD_TEXT}>{label}</span>
		</button>
	);
}

function clampCut(cut: HousingCut, width: number, height: number): Required<HousingCut> {
	const limit = Math.max(0, Math.min(width, height) / 2 - 1);
	const cap = (value?: number) => Math.min(value ?? 0, limit);
	return { tl: cap(cut.tl), tr: cap(cut.tr), bl: cap(cut.bl), br: cap(cut.br) };
}

/**
 * A closed outline. `bleed` pulls the top and sides past the box so a plate on the screen edge
 * covers the hairline the scene would otherwise show. The bottom stays on the box, where the stroke is.
 */
function platePath(width: number, height: number, cut: Required<HousingCut>, bleed = 0, inset = 0): string {
	const x0 = inset - bleed;
	const y0 = inset - bleed;
	const x1 = width - inset + bleed;
	const y1 = height - inset;
	return [
		`M${x0 + cut.tl} ${y0}`,
		`H${x1 - cut.tr}`,
		cut.tr ? `L${x1} ${y0 + cut.tr}` : "",
		`V${y1 - cut.br}`,
		cut.br ? `L${x1 - cut.br} ${y1}` : "",
		`H${x0 + cut.bl}`,
		cut.bl ? `L${x0} ${y1 - cut.bl}` : "",
		`V${y0 + cut.tl}`,
		cut.tl ? `L${x0 + cut.tl} ${y0}` : "",
		"Z",
	].join("");
}

/** The brighter stroke along one machined edge, including the cuts at its ends. */
function edgePath(width: number, height: number, cut: Required<HousingCut>, edge: "top" | "bottom" | "left"): string {
	const x0 = 0.5;
	const y0 = 0.5;
	const x1 = width - 0.5;
	const y1 = height - 0.5;
	if (edge === "top") {
		return `M${x0 + cut.tl} ${y0}H${x1 - cut.tr}${cut.tr ? `L${x1} ${y0 + cut.tr}` : ""}`;
	}
	if (edge === "bottom") {
		const start = cut.bl ? `M${x0} ${y1 - cut.bl}L${x0 + cut.bl} ${y1}` : `M${x0} ${y1}`;
		return `${start}H${x1 - cut.br}${cut.br ? `L${x1} ${y1 - cut.br}` : ""}`;
	}
	return `M${x0} ${y0 + cut.tl}V${y1 - cut.bl}${cut.bl ? `L${x0 + cut.bl} ${y1}` : ""}`;
}

/** The outline of a plate with the top edge left open. */
function openTopPath(width: number, height: number, cut: Required<HousingCut>): string {
	const x0 = 0.5;
	const y0 = 0.5;
	const x1 = width - 0.5;
	const y1 = height - 0.5;
	return [
		`M${x0} ${y0 + cut.tl}`,
		`V${y1 - cut.bl}`,
		cut.bl ? `L${x0 + cut.bl} ${y1}` : "",
		`H${x1 - cut.br}`,
		cut.br ? `L${x1} ${y1 - cut.br}` : "",
		`V${y0 + cut.tr}`,
	].join("");
}

/** The outline of a plate with the bottom edge left open. */
function openBottomPath(width: number, height: number, cut: Required<HousingCut>): string {
	const x0 = 0.5;
	const y0 = 0.5;
	const x1 = width - 0.5;
	const y1 = height - 0.5;
	const start = cut.bl ? `M${x0 + cut.bl} ${y1}L${x0} ${y1 - cut.bl}` : `M${x0} ${y1}`;
	return [
		start,
		`V${y0 + cut.tl}`,
		cut.tl ? `L${x0 + cut.tl} ${y0}` : "",
		`H${x1 - cut.tr}`,
		cut.tr ? `L${x1} ${y0 + cut.tr}` : "",
		`V${y1 - cut.br}`,
		cut.br ? `L${x1 - cut.br} ${y1}` : "",
	].join("");
}

/** One mined resource in the home stockpile, as the upper-right strip counts it. */
export type WarehouseHolding = { id: string; label: string; amount: number };

/** The fleet. The bar shows the active ship; the list is every ship the pilot can take. */
const SHIPS = [{ id: "ranger", name: "Ranger", portrait: "/hud/ranger.png" }] as const;

type ShipId = (typeof SHIPS)[number]["id"];
type Ship = (typeof SHIPS)[number];

export type HudAction = {
	onClick: () => void;
	title: string;
	disabled?: boolean;
	pressed?: boolean;
};

export type HudPlace = {
	title: string;
	detail: string | null;
};

export type HudAnchors = {
	header: RefObject<HTMLDivElement>;
	location: RefObject<HTMLDivElement>;
	warehouse: RefObject<HTMLDivElement>;
	ships: RefObject<HTMLDivElement>;
	system: RefObject<HTMLDivElement>;
};

/** The regions names on the scene stay clear of. */
export function useHudAnchors(): { anchors: HudAnchors; keepOut: RefObject<HTMLElement>[] } {
	const header = useRef<HTMLDivElement>(null);
	const location = useRef<HTMLDivElement>(null);
	const warehouse = useRef<HTMLDivElement>(null);
	const ships = useRef<HTMLDivElement>(null);
	const system = useRef<HTMLDivElement>(null);
	const anchors = useMemo(
		() => ({ header, location, warehouse, ships, system }),
		[header, location, warehouse, ships, system]
	);
	const keepOut = useMemo(() => [header, location, warehouse, ships, system], [header, location, warehouse, ships, system]);
	return { anchors, keepOut };
}

/** Wide layout. The phone stacks the crest under the ship and parks the stores at the lower left. */
function useDesktop(): boolean {
	const [desktop, setDesktop] = useState(false);
	useLayoutEffect(() => {
		const query = window.matchMedia("(min-width: 900px)");
		const apply = () => setDesktop(query.matches);
		apply();
		query.addEventListener("change", apply);
		return () => query.removeEventListener("change", apply);
	}, []);
	return desktop;
}

/**
 * The play chrome over the chart. The ship, the place, and the home stores share the top edge.
 * The ship sits at the upper left. Its fleet list drops down from that plate, and the two become one
 * surface while the list is open. The place is a crest in the center that carries its name.
 * Stores sit in the top bar on a desktop and at the lower left on a phone. The chart step sits at the
 * lower right. While the ship is traveling, the time left and its ring sit on the portrait. While it is
 * drawing, that ring counts down in the yield's color. A mine wears its element. A collector wears gold.
 * One ship is listed: the ranger.
 */
export function Hud({
	anchors,
	location,
	status,
	energy,
	cargo,
	holdings,
	locate,
	recall,
	steps = [],
	leading,
	corner,
	fleet = true,
	travel = null,
	mining = null,
}: {
	anchors: HudAnchors;
	location: HudPlace;
	/** Where the ship is, in a short line. Derived from the trip and the draw when omitted. */
	status?: string;
	/** Energy aboard the active ship. */
	energy: number;
	/** Mineral units in the active ship's hold, of any mix. */
	cargo: number;
	/** Mined resources deposited at the home base. */
	holdings: readonly WarehouseHolding[];
	locate: HudAction;
	recall: HudAction;
	/** The chart steps that sit in the lower right. Empty on the galaxy. */
	steps?: { label: string; title: string; onClick: () => void }[];
	/** A control drawn to the left of `corner`. */
	leading?: ReactNode;
	/** Drawn at the lower right when the chart step is not. */
	corner?: ReactNode;
	/** The active ship and its list. Hidden when another console takes the bottom edge. */
	fleet?: boolean;
	/** Time left on the trip underway. Hidden when the ship is down. */
	travel?: TravelClock | null;
	/** Time left until a mine or collector empties, or the ship is full. Hidden when the ship is not drawing. */
	mining?: MineClock | null;
}) {
	const [shipsOpen, setShipsOpen] = useState(false);
	const [activeShipId, setActiveShipId] = useState<ShipId>("ranger");
	const activeShip = SHIPS.find((ship) => ship.id === activeShipId) ?? SHIPS[0];
	const desktop = useDesktop();
	const readout = status ?? shipStatus(travel, mining);

	return (
		<div
			className={`pointer-events-none absolute z-10 ${inter.className}`}
			style={{
				top: "env(safe-area-inset-top)",
				right: "env(safe-area-inset-right)",
				bottom: "env(safe-area-inset-bottom)",
				left: "env(safe-area-inset-left)",
			}}
		>
			<div ref={anchors.header} className="absolute inset-x-0 top-0 hidden h-10 min-[900px]:block">
				<CommandBarPlate />
			</div>

			<LocationCrest place={location} desktop={desktop} crestRef={anchors.location} />

			<div
				ref={anchors.warehouse}
				className="absolute bottom-4 left-3 z-20 min-[900px]:bottom-auto min-[900px]:left-auto min-[900px]:right-0 min-[900px]:top-0 min-[900px]:h-10"
			>
				<HomeStores holdings={holdings} />
			</div>

			{fleet ? (
				<div ref={anchors.ships} className="absolute top-0 left-0 z-30 w-full min-[900px]:w-[280px]">
					<ShipModule
						ship={activeShip}
						open={shipsOpen}
						desktop={desktop}
						readout={readout}
						energy={energy}
						cargo={cargo}
						locate={locate}
						recall={recall}
						travel={travel}
						mining={mining}
						onToggle={() => setShipsOpen((open) => !open)}
					/>
					{shipsOpen ? (
						<FleetList
							ship={activeShip}
							desktop={desktop}
							energy={energy}
							cargo={cargo}
							travel={travel}
							mining={mining}
							onPick={(id) => {
								setActiveShipId(id);
								setShipsOpen(false);
							}}
						/>
					) : null}
				</div>
			) : null}

			{steps.length > 0 ? (
				<div ref={anchors.system} className="absolute right-3 bottom-4 z-30 flex flex-col items-end gap-2 min-[900px]:right-6 min-[900px]:bottom-6">
					{steps.map((step) => (
						<ChartStep key={step.label} label={step.label} title={step.title} onClick={step.onClick} />
					))}
				</div>
			) : (
				<div ref={anchors.system} className={corner ? "absolute right-6 bottom-6 z-30 flex items-end gap-3" : "hidden"}>
					{leading}
					{corner}
				</div>
			)}
		</div>
	);
}

/** A line for the ship when the caller does not send one. */
function shipStatus(travel: TravelClock | null, mining: MineClock | null): string {
	if (travel) {
		return `En route · ${travel.name}`;
	}
	if (mining) {
		return mining.resource === "energy" ? "Drawing energy" : `Drawing ${mining.resource}`;
	}
	return "Holding";
}

function ShipModule({
	ship,
	open,
	desktop,
	readout,
	energy,
	cargo,
	locate,
	recall,
	travel,
	mining,
	onToggle,
}: {
	ship: Ship;
	open: boolean;
	desktop: boolean;
	/** Where the ship is. Read aloud with the ship's name; not drawn. */
	readout: string;
	energy: number;
	cargo: number;
	locate: HudAction;
	recall: HudAction;
	travel: TravelClock | null;
	mining: MineClock | null;
	onToggle: () => void;
}) {
	return (
		<div
			role="group"
			aria-label={`${ship.name}, active ship, ${readout}`}
			className="pointer-events-auto relative flex h-12 w-full items-center gap-2.5 pr-2.5 pl-2"
		>
			<ShipPlate open={open} desktop={desktop} />
			<ShipPortrait ship={ship} travel={travel} mining={mining} />
			<p className={`${rajdhani.className} min-w-0 truncate text-[16px] leading-none font-bold tracking-[0.12em] uppercase ${GOLD_TEXT}`}>
				{ship.name}
			</p>
			<CapacityBars energy={energy} cargo={cargo} />
			<div className="ml-auto flex items-center gap-[5px]">
				<ShipAction label="Locate" action={locate} icon="/hud/locate.svg" />
				<ShipAction label="Recall" action={recall} icon="/hud/recall.svg" />
				<ShipButton label={open ? "Hide ships" : "Show ships"} expanded={open} engaged={open} onClick={onToggle}>
					<ChevronDown up={open} />
				</ShipButton>
			</div>
		</div>
	);
}

function FleetList({
	ship,
	desktop,
	energy,
	cargo,
	travel,
	mining,
	onPick,
}: {
	ship: Ship;
	desktop: boolean;
	energy: number;
	cargo: number;
	travel: TravelClock | null;
	mining: MineClock | null;
	onPick: (id: ShipId) => void;
}) {
	return (
		<div className="pointer-events-auto relative flex flex-col gap-2.5 pt-3 pr-4 pb-3.5 pl-3">
			<FleetPlate desktop={desktop} />
			<div className="flex items-center gap-2">
				<Diamond />
				<p className="text-[10px] font-bold tracking-[0.18em] text-[#A89060] uppercase">
					Fleet <span className="text-[#FFD73D] tabular-nums">1 / {SHIPS.length}</span>
				</p>
				<span aria-hidden className="h-px flex-1 bg-gradient-to-r from-[#FFD73D]/35 to-transparent" />
			</div>
			<ul aria-label="Ships" className="flex flex-col gap-1.5">
				{SHIPS.map((listed) => {
					const active = listed.id === ship.id;
					return (
						<li key={listed.id}>
							<button
								type="button"
								aria-current={active ? "true" : undefined}
								onClick={() => onPick(listed.id)}
								className={`relative flex w-full items-center gap-2.5 px-2.5 py-2 text-left focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none ${active ? "bg-gradient-to-r from-[#A67C20]/25 via-[#2A1F08]/80 to-transparent before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-gradient-to-b before:from-[#FFD73D] before:to-[#A67C20] before:content-['']" : "hover:bg-[#FFD73D]/5"}`}
							>
								<ShipPortrait ship={listed} travel={active ? travel : null} mining={active ? mining : null} />
								<div className="min-w-0 flex-1">
									<p className={`${rajdhani.className} truncate text-[16px] leading-none font-bold tracking-[0.12em] uppercase ${GOLD_TEXT}`}>
										{listed.name}
									</p>
									<span className="mt-1.5 flex items-center gap-2">
										<HoldMeter label="Energy" amount={energy} capacity={ENERGY_CAPACITY} tone="energy" />
										<HoldMeter label="Cargo" amount={cargo} capacity={CARGO_CAPACITY} tone="cargo" />
									</span>
								</div>
								{active ? (
									<span className="border border-[#FFD73D]/50 bg-[#FFD73D]/10 px-1.5 py-0.5 text-[8px] font-semibold tracking-[0.14em] text-[#FFD73D] uppercase">
										Active
									</span>
								) : null}
							</button>
						</li>
					);
				})}
			</ul>
			<p className="text-[9.5px] text-[#A89060]/80">Choose a ship to make it active. The list closes when you pick one.</p>
		</div>
	);
}

/** Energy and cargo, read from the bottom, with no written labels. */
function CapacityBars({ energy, cargo }: { energy: number; cargo: number }) {
	return (
		<span className="flex items-center gap-[3px]">
			<CapacityBar label="Energy" amount={energy} capacity={ENERGY_CAPACITY} tone="energy" />
			<CapacityBar label="Cargo" amount={cargo} capacity={CARGO_CAPACITY} tone="cargo" />
		</span>
	);
}

function CapacityBar({
	label,
	amount,
	capacity,
	tone,
}: {
	label: string;
	amount: number;
	capacity: number;
	tone: "energy" | "cargo";
}) {
	const segments = 9;
	const fill = Math.max(0, Math.min(1, amount / Math.max(1, capacity)));
	const lit = Math.round(fill * segments);
	const on = tone === "energy" ? "bg-[#FFD73D]" : "bg-[#7ED4F0]";
	const off = tone === "energy" ? "bg-[#FFD73D]/15" : "bg-[#7ED4F0]/20";
	return (
		<span
			role="meter"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={Math.round(capacity)}
			aria-valuenow={Math.round(amount)}
			aria-valuetext={`${Math.round(amount).toLocaleString("en-US")} of ${Math.round(capacity).toLocaleString("en-US")}`}
			className="flex flex-col-reverse gap-px"
		>
			{Array.from({ length: segments }, (_, index) => (
				<span key={index} aria-hidden className={`block h-[2px] w-[5px] ${index < lit ? on : off}`} />
			))}
		</span>
	);
}

function LocationCrest({ place, desktop, crestRef }: { place: HudPlace; desktop: boolean; crestRef: RefObject<HTMLDivElement> }) {
	return (
		<div
			ref={crestRef}
			role="status"
			aria-live="polite"
			className="absolute top-[54px] left-1/2 z-10 w-max max-w-full -translate-x-1/2 min-[900px]:top-0 min-[900px]:max-w-[calc(100%-38rem)] min-[1180px]:max-w-[calc(100%-53rem)]"
		>
			<div
				className="relative flex h-8 min-w-[280px] flex-col items-center pt-1.5 min-[900px]:h-11 min-[900px]:min-w-[440px] min-[900px]:pt-[7px]"
				style={{ paddingInline: (desktop ? CREST_WING.desktop : CREST_WING.phone) + (desktop ? 36 : 28) }}
			>
				<CrestPlate desktop={desktop} />
				<div className="flex min-w-0 items-center gap-3">
					{desktop ? <Bracket /> : null}
					<p
						className={`${rajdhani.className} min-w-0 truncate text-[18px] leading-none font-bold tracking-[0.22em] uppercase min-[900px]:text-[20px] ${GOLD_TEXT}`}
						style={{ filter: "drop-shadow(0 0 5px rgba(255, 190, 60, 0.35))" }}
					>
						{place.title}
					</p>
					{desktop ? <Bracket flip /> : null}
				</div>
				{desktop ? <BearingTicks /> : null}
			</div>
		</div>
	);
}

function Bracket({ flip = false }: { flip?: boolean }) {
	return (
		<svg width="7" height="18" viewBox="0 0 7 18" aria-hidden className="shrink-0">
			<path d={flip ? "M0.5 0.5H6V17.5H0.5" : "M6.5 0.5H1V17.5H6.5"} fill="none" stroke="#FFD73D" strokeOpacity="0.55" />
		</svg>
	);
}

function BearingTicks() {
	return (
		<span aria-hidden className="mt-1 flex h-1.5 items-end gap-1">
			{Array.from({ length: 31 }, (_, index) => {
				const mid = index === 15;
				const big = index % 5 === 0;
				return <span key={index} className={`w-px ${mid ? "h-1.5 bg-[#FFD73D]/90" : big ? "h-1 bg-[#FFD73D]/45" : "h-0.5 bg-[#FFD73D]/[0.22]"}`} />;
			})}
		</span>
	);
}

function HomeStores({ holdings }: { holdings: readonly WarehouseHolding[] }) {
	return (
		<>
			<div className="pointer-events-auto relative hidden h-10 items-center pr-2 min-[900px]:flex">
				<ul aria-label="Warehouse" className="flex items-center">
					{holdings.map((item, index) => (
						<li key={item.id} className="flex items-center">
							{index > 0 ? <span aria-hidden className="h-[18px] w-px bg-gradient-to-b from-transparent via-[#FFD73D]/35 to-transparent" /> : null}
							<StoreReadout item={item} labeled />
						</li>
					))}
				</ul>
			</div>
			<div className="pointer-events-auto relative w-[168px] px-2.5 py-2 min-[900px]:hidden">
				<Housing cut={{ tr: 14 }} highlight="bottom" />
				<ul aria-label="Warehouse" className="grid grid-cols-2 gap-x-2 gap-y-1">
					{holdings.map((item) => (
						<li key={item.id}>
							<StoreReadout item={item} />
						</li>
					))}
				</ul>
			</div>
		</>
	);
}

/** The bar seats each mark in a socket ringed in its element's color. The phone plate shows the bare mark. */
function StoreReadout({ item, labeled = false }: { item: WarehouseHolding; labeled?: boolean }) {
	const amount = shortCount(item.amount);
	const key = item.label.toLowerCase();
	const ring = isElement(key) ? elementColor[key] : HUD.gold;
	return (
		<span
			className={`flex items-center ${labeled ? "gap-2 px-3" : "gap-1.5"}`}
			title={item.label}
			aria-label={`${item.label}, ${Math.round(item.amount).toLocaleString("en-US")}`}
		>
			{labeled ? (
				<span aria-hidden className="relative grid size-6 shrink-0 place-items-center">
					<span className="absolute inset-1 rounded-[2px] border bg-[#1A160C]" style={{ borderColor: `${ring}55` }} />
					<ResourceMark id={item.label} className="relative size-3.5" />
				</span>
			) : (
				<ResourceMark id={item.label} className="size-[13px] shrink-0" />
			)}
			<span className="min-w-0">
				<span className="block text-[12px] leading-none font-bold text-[#E8E4D9] tabular-nums min-[900px]:text-[13px]">{amount}</span>
				{labeled ? (
					<span className="mt-[3px] hidden text-[7.5px] leading-none font-semibold tracking-[0.18em] text-[#A89060] uppercase min-[1180px]:block">
						{item.label}
					</span>
				) : null}
			</span>
		</span>
	);
}

const STEP_KICKER: Record<string, string> = {
	Back: "Previous view",
};

function ChartStep({ label, title, onClick }: { label: string; title: string; onClick: () => void }) {
	const icon = STEP_ICON[label];
	return (
		<button
			type="button"
			title={title}
			aria-label={title}
			onClick={onClick}
			className="pointer-events-auto relative flex h-14 w-[168px] items-center gap-1.5 pr-2 pl-1.5 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none min-[900px]:h-16 min-[900px]:w-[228px] min-[900px]:gap-2.5 min-[900px]:pr-3.5 min-[900px]:pl-2"
		>
			<StepPlate />
			<StepDial icon={icon} />
			<span className="min-w-0 flex-1 text-left">
				<span className="block truncate text-[7.5px] font-semibold tracking-[0.16em] text-[#A89060] uppercase min-[900px]:text-[8.5px] min-[900px]:tracking-[0.18em]">
					{STEP_KICKER[label] ?? "Return to"}
				</span>
				<span className={`${rajdhani.className} block truncate text-[18px] leading-none font-bold tracking-[0.14em] uppercase min-[900px]:text-[22px] ${GOLD_TEXT}`}>
					{label}
				</span>
			</span>
			<ChevronRight />
		</button>
	);
}

function StepDial({ icon }: { icon?: string }) {
	const gradientId = `dial-${useId().replace(/:/g, "")}`;
	const ticks = Array.from({ length: 28 }, (_, index) => {
		const angle = (index / 28) * Math.PI * 2;
		const major = index % 7 === 0;
		const outer = 24;
		const inner = major ? 20.5 : 22.2;
		return {
			x1: 26 + Math.cos(angle) * outer,
			y1: 26 + Math.sin(angle) * outer,
			x2: 26 + Math.cos(angle) * inner,
			y2: 26 + Math.sin(angle) * inner,
			major,
		};
	});
	return (
		<span className="relative grid size-11 shrink-0 place-items-center min-[900px]:size-[52px]">
			<svg viewBox="0 0 52 52" className="absolute inset-0" aria-hidden>
				{ticks.map((tick, index) => (
					<line
						key={index}
						x1={tick.x1}
						y1={tick.y1}
						x2={tick.x2}
						y2={tick.y2}
						stroke="#FFD73D"
						strokeOpacity={tick.major ? 0.6 : 0.25}
					/>
				))}
				<circle cx="26" cy="26" r="17" fill="#0B0A07" stroke="#FFD73D" strokeOpacity="0.45" />
				<path d="M9 26A17 17 0 0 1 26 9" fill="none" stroke={`url(#${gradientId})`} strokeWidth="1.75" strokeLinecap="round" />
				<defs>
					<linearGradient id={gradientId} x1="0" y1="0" x2="52" y2="52" gradientUnits="userSpaceOnUse">
						<stop offset="0" stopColor="#FFF3C4" />
						<stop offset="1" stopColor="#A67C20" />
					</linearGradient>
				</defs>
			</svg>
			{icon ? (
				<img src={icon} alt="" width={16} height={16} className="relative size-4" />
			) : (
				<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="relative">
					<path d="M9 4L5 8l4 4" fill="none" stroke="#FFD73D" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			)}
		</span>
	);
}

function ChevronDown({ up }: { up: boolean }) {
	return (
		<svg width="12" height="12" viewBox="0 0 16 16" aria-hidden className={`shrink-0 ${up ? "rotate-180" : ""}`}>
			<path d="M3.5 5.5L8 10l4.5-4.5" fill="none" stroke="#0B0800" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function ChevronRight() {
	return (
		<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0">
			<path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="#FFD73D" strokeOpacity="0.7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}

function ShipPortrait({
	ship,
	travel = null,
	mining = null,
}: {
	ship: Ship;
	travel?: TravelClock | null;
	mining?: MineClock | null;
}) {
	const clock = travel
		? { remaining: travel.remaining, total: travel.total, color: "#FFD73D", label: `${formatTravelTime(travel.remaining)} remaining` }
		: mining
			? {
					remaining: mining.remaining,
					total: mining.total,
					color: elementColor[mining.resource],
					label: `${formatTravelTime(mining.remaining)} until the ${mining.resource === "energy" ? "collector" : mining.resource} draw stops`,
				}
			: null;
	return (
		<span className="relative size-9 shrink-0">
			<span
				className="absolute inset-0 bg-gradient-to-br from-[#FFD73D] via-[#E8B23A]/60 to-[#A67C20] p-px"
				style={{ clipPath: chamfer(6.5, "tr-bl") }}
			>
				<img
					src={ship.portrait}
					alt=""
					width={36}
					height={36}
					className="size-full bg-[#0B0A07] object-cover"
					style={{ clipPath: chamfer(6, "tr-bl") }}
				/>
			</span>
			{clock ? <PortraitClock remaining={clock.remaining} total={clock.total} color={clock.color} label={clock.label} /> : null}
		</span>
	);
}

/** A draining ring over the portrait. Travel and a collector are gold. A mine wears the yield's color. */
function PortraitClock({ remaining, total, color, label }: { remaining: number; total: number; color: string; label: string }) {
	const text = formatTravelTime(remaining);
	const share = travelShare(remaining, total);
	const radius = 15.5;
	const turn = 2 * Math.PI * radius;
	return (
		<span role="timer" aria-label={label} className="pointer-events-none absolute inset-0">
			<svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden>
				<circle cx="18" cy="18" r={radius} fill="none" stroke="rgba(7,8,10,0.45)" strokeWidth="2.25" />
				<circle cx="18" cy="18" r={radius} fill="none" stroke={color} strokeOpacity="0.28" strokeWidth="1.25" />
				{share > 0 ? (
					<circle
						cx="18"
						cy="18"
						r={radius}
						fill="none"
						stroke={color}
						strokeWidth="1.25"
						strokeLinecap={share > 0.985 ? "butt" : "round"}
						strokeDasharray={`${turn * share} ${turn}`}
					/>
				) : null}
			</svg>
			<span
				aria-hidden
				className={`absolute inset-0 flex items-center justify-center font-bold tabular-nums drop-shadow-[0_1px_1px_rgba(0,0,0,0.95)] ${text.length > 5 ? "text-[5.5px]" : "text-[7px]"}`}
				style={{ color }}
			>
				{text}
			</span>
		</span>
	);
}

/** How full one store is. Energy is gold. Cargo is the cool hold color, so the two bars stay distinct. */
function HoldMeter({
	label,
	amount,
	capacity,
	tone,
}: {
	label: string;
	amount: number;
	capacity: number;
	tone: "energy" | "cargo";
}) {
	const fill = Math.max(0, Math.min(1, amount / Math.max(1, capacity)));
	const track = tone === "energy" ? "bg-[#FFD73D]/[0.12]" : "bg-[#7ED4F0]/30";
	const bar =
		tone === "energy"
			? "bg-gradient-to-r from-[#A67C20] via-[#E8B23A] to-[#FFD73D]"
			: "bg-gradient-to-r from-[#2A6A80] via-[#4AA8C8] to-[#7ED4F0]";
	return (
		<span
			role="meter"
			aria-label={label}
			aria-valuemin={0}
			aria-valuemax={Math.round(capacity)}
			aria-valuenow={Math.round(amount)}
			aria-valuetext={`${Math.round(amount).toLocaleString("en-US")} of ${Math.round(capacity).toLocaleString("en-US")}`}
			className={`block h-[3px] w-[72px] overflow-hidden min-[900px]:w-[52px] ${track}`}
			style={{ clipPath: chamfer(1.5) }}
		>
			<span className={`block h-full ${bar}`} style={{ width: `${fill * 100}%` }} />
		</span>
	);
}

function ShipAction({ label, action, icon }: { label: string; action: HudAction; icon: string }) {
	return (
		<ShipButton label={label} title={action.title} pressed={action.pressed} engaged={action.pressed === true} disabled={action.disabled} onClick={action.onClick}>
			<img src={icon} alt="" width={14} height={14} />
		</ShipButton>
	);
}

/** A gold key on the ship plate. Engaged reads pressed in. */
function ShipButton({
	label,
	title,
	pressed,
	expanded,
	engaged,
	disabled,
	onClick,
	children,
}: {
	label: string;
	title?: string;
	pressed?: boolean;
	expanded?: boolean;
	engaged: boolean;
	disabled?: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			title={title}
			aria-label={label}
			aria-pressed={pressed}
			aria-expanded={expanded}
			disabled={disabled}
			onClick={onClick}
			className={`flex size-[30px] shrink-0 items-center justify-center rounded-[2px] transition-[filter,transform] duration-150 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none motion-reduce:transition-none min-[900px]:size-[26px] ${engaged ? "bg-gradient-to-b from-[#E8B23A] to-[#A67C20] shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]" : "bg-gradient-to-b from-[#FFF3C4] via-[#FFD73D] via-45% to-[#C48A2E] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-2px_0_rgba(120,84,16,0.45)]"} ${disabled ? "cursor-not-allowed opacity-40 saturate-50" : "hover:brightness-110 active:translate-y-px"}`}
		>
			{children}
		</button>
	);
}

"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Inter } from "next/font/google";

import { ENERGY_CAPACITY } from "./demo/energy";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"] });

/** The corner step carries the mark of the place it opens. */
const STEP_ICON: Record<string, string> = {
	System: "/hud/system.svg",
	Galaxy: "/hud/galaxy.svg",
	Planet: "/hud/planet.svg",
	Sun: "/hud/sun.svg",
	Sol: "/hud/sun.svg",
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

/** The HUD keeps to these. Gold carries every signal; amber only shades it; ember marks what is engaged. */
export const HUD = {
	gold: "#FFD73D",
	amber: "#E9A92A",
	ember: "#C8641E",
	sand: "#A89060",
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
const GOLD_TEXT = "bg-gradient-to-b from-[#FFF0A8] via-[#FFD73D] to-[#E9A92A] bg-clip-text text-transparent";

/** A diamond ornament set between gold rules. */
function Diamond({ className = "", lit = false }: { className?: string; lit?: boolean }) {
	return (
		<span
			aria-hidden
			className={`inline-block size-[5px] shrink-0 rotate-45 ${lit ? "bg-gradient-to-br from-[#FFD73D] to-[#C8641E] shadow-[0_0_6px_rgba(232,140,40,0.7)]" : "bg-[#FFD73D]/55"} ${className}`}
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
export const RESOURCE_ICON: Record<string, string> = {
	hydrogen: "/hud/helium-3.svg",
	ore: "/hud/rare-ore.svg",
	nitrogen: "/hud/oxygen.svg",
	carbon: "/hud/plasma.svg",
	energy: "/hud/sun.svg",
};

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
const SHIPS = [{ id: "ranger", name: "Ranger", role: "Explorer", portrait: "/hud/ranger.png" }] as const;

type ShipId = (typeof SHIPS)[number]["id"];

export type HudAction = {
	onClick: () => void;
	title: string;
	disabled?: boolean;
	pressed?: boolean;
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

/**
 * The play chrome over the scene. A full-width header sits on the top edge. The place is a plaque fixed
 * to that edge, a little taller than the header row, so its bottom drops below the row. Holdings sit in
 * the row on a desktop and just under the plaque on a phone. The active ship
 * sits flush on the lower left, open along the bottom edge, with pilot, locate, and recall on its row. That bar opens into the fleet; choosing
 * a ship makes it active and closes the list. The chart's step back sits at the lower right, in the
 * chamfered control. `leading` and `corner` can take that corner over.
 * One ship is listed: the ranger.
 */
export function Hud({
	anchors,
	location,
	energy,
	holdings,
	pilot,
	locate,
	recall,
	steps = [],
	leading,
	corner,
	fleet = true,
}: {
	anchors: HudAnchors;
	location: { title: string; detail: string | null };
	/** Energy aboard the active ship. */
	energy: number;
	/** Mined resources deposited at the home base. */
	holdings: readonly WarehouseHolding[];
	pilot: HudAction;
	locate: HudAction;
	recall: HudAction;
	/** The chart steps that used to sit in the lower right. Empty while piloting, and on the galaxy. */
	steps?: { label: string; title: string; onClick: () => void }[];
	/** A control drawn to the left of `corner`. */
	leading?: ReactNode;
	/** Drawn at the lower right when the chart step is not. The exterior view uses it for the way back into the cockpit. */
	corner?: ReactNode;
	/** The active ship and its list. Off in the cockpit, where the console takes the bottom edge. */
	fleet?: boolean;
}) {
	const [shipsOpen, setShipsOpen] = useState(false);
	const [activeShipId, setActiveShipId] = useState<ShipId>("ranger");
	const activeShip = SHIPS.find((ship) => ship.id === activeShipId) ?? SHIPS[0];

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
			<div className="absolute inset-x-0 top-0">
				<div ref={anchors.header} className="pointer-events-none absolute inset-x-0 top-0 h-8 min-[900px]:h-7">
					<Housing cut={{}} border="bottom" bleed />
				</div>
				<div
					ref={anchors.location}
					role="status"
					aria-live="polite"
					className="pointer-events-auto absolute top-0 left-1/2 z-10 isolate flex h-10 max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 px-3.5 min-[900px]:h-9 min-[900px]:max-w-[min(24rem,calc(100%-36rem))] min-[900px]:px-4"
				>
					<Housing cut={{ bl: 14, br: 14 }} highlight="bottom" border="except-top" />
					<Diamond className="hidden min-[900px]:inline-block" />
					<p
						className={`truncate text-sm font-semibold min-[900px]:text-[13px] min-[900px]:font-bold min-[900px]:tracking-[2px] min-[900px]:uppercase ${GOLD_TEXT}`}
					>
						{location.title}
					</p>
					{location.detail ? (
						<p className="flex min-w-0 items-center gap-1.5 border-l border-[#FFD73D]/20 pl-2 text-[11px] font-normal text-[#a89060] min-[900px]:text-[10px] min-[900px]:tracking-[1px] min-[900px]:uppercase">
							<img src="/hud/status-dot.svg" alt="" width={12} height={12} className="shrink-0" />
							<span className="truncate">{location.detail}</span>
						</p>
					) : null}
					<Diamond className="hidden min-[900px]:inline-block" />
				</div>
				<div ref={anchors.warehouse} className="absolute top-10 right-0 min-[900px]:top-1">
					<div className="pointer-events-auto relative isolate flex h-6 items-center pr-2.5 min-[900px]:h-5">
						<span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-[#1A160C]/80 to-[#1A160C]/90 min-[900px]:hidden" />
						<ul aria-label="Warehouse" className="flex items-center">
							{holdings.map((item, index) => {
								const amount = Math.round(item.amount).toLocaleString("en-US");
								const icon = RESOURCE_ICON[item.label.toLowerCase()];
								return (
									<li key={item.id} title={item.label} className="group flex items-center" aria-label={`${item.label}, ${amount}`}>
										{index > 0 ? <span aria-hidden className="mx-1.5 h-2.5 w-px bg-gradient-to-b from-transparent via-[#FFD73D]/35 to-transparent" /> : null}
										<span aria-hidden className="relative mr-1 flex size-4 shrink-0 items-center justify-center">
											<span className="absolute inset-[3px] rotate-45 bg-gradient-to-br from-[#3A2E12] to-[#0B0A07] ring-1 ring-[#FFD73D]/30 transition-shadow group-hover:ring-[#FFD73D]/70" />
											{icon ? (
												<img src={icon} alt="" width={10} height={10} className="relative drop-shadow-[0_0_3px_rgba(233,169,42,0.6)]" />
											) : (
												<span className="relative text-[8px] font-bold text-[#a89060]">{item.label.charAt(0)}</span>
											)}
										</span>
										<span aria-hidden className="min-w-[2ch] text-[11px] leading-none font-bold tracking-[0.3px] text-[#ffd73d] tabular-nums">
											{shortCount(item.amount)}
										</span>
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			</div>

			{fleet ? (
				<div ref={anchors.ships} className="absolute bottom-0 left-0 w-[min(286px,calc(100%-6.5rem))] min-[900px]:w-[352px] min-[900px]:max-w-[calc(100%-8rem)]">
					{shipsOpen ? (
						<div className="pointer-events-auto relative isolate flex w-full flex-col gap-1.5 p-2 min-[900px]:gap-1 min-[900px]:p-1.5">
							<Housing cut={{ tr: 14 }} highlight="top" border="except-bottom" />
							<div className="flex items-center gap-2 pl-1">
								<Diamond />
								<p className="text-[10px] font-bold tracking-[2px] text-[#a89060] uppercase">
									Fleet <span className="text-[#ffd73d] tabular-nums">{SHIPS.length}</span>
								</p>
								<span aria-hidden className="h-px flex-1 bg-gradient-to-r from-[#FFD73D]/35 to-transparent" />
								<button
									type="button"
									aria-expanded
									aria-label="Hide ships"
									onClick={() => setShipsOpen(false)}
									className="flex size-8 items-center justify-center focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none min-[900px]:h-6 min-[900px]:w-7"
								>
									<img src="/hud/chevron-down.svg" alt="" width={16} height={16} />
								</button>
							</div>
							<ul aria-label="Ships" className="flex flex-col gap-1.5">
								{SHIPS.map((ship) => {
									const active = ship.id === activeShip.id;
									return (
										<li key={ship.id}>
											<button
												type="button"
												aria-current={active ? "true" : undefined}
												onClick={() => {
													setActiveShipId(ship.id);
													setShipsOpen(false);
												}}
												className={`relative flex w-full items-center justify-start gap-2.5 p-2 text-left focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none min-[900px]:px-2 min-[900px]:py-1.5 ${active ? "bg-gradient-to-r from-[#C8641E]/25 via-[#2A1F08]/80 to-transparent before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-gradient-to-b before:from-[#FFD73D] before:to-[#C8641E] before:content-['']" : "hover:bg-[#FFD73D]/5"}`}
											>
												<ShipPortrait ship={ship} listed />
												<ShipName ship={ship} energy={energy} listed />
											</button>
										</li>
									);
								})}
							</ul>
						</div>
					) : (
						<div role="group" aria-label={`${activeShip.name}, active ship`} className="pointer-events-auto relative isolate flex h-[58px] w-full items-center gap-2 p-2 min-[900px]:h-[52px] min-[900px]:py-1.5 min-[900px]:pr-2.5 min-[900px]:pl-2">
							<Housing cut={{ tr: 14 }} highlight="top" border="except-bottom" />
							<ShipPortrait ship={activeShip} />
							<ShipName ship={activeShip} energy={energy} />
							<ShipAction label="Pilot" action={pilot} icon="/hud/pilot.svg" />
							<ShipAction label="Locate" action={locate} icon="/hud/locate.svg" />
							<ShipAction label="Recall" action={recall} icon="/hud/recall.svg" />
							<button
								type="button"
								aria-expanded={false}
								aria-label="Show ships"
								onClick={() => setShipsOpen(true)}
								className="flex size-7 shrink-0 items-center justify-center focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
							>
								<img src="/hud/ships-chevron.svg" alt="" width={16} height={16} />
							</button>
						</div>
					)}
				</div>
			) : null}

			{steps.length > 0 ? (
				<div ref={anchors.system} className="absolute right-3 bottom-3 flex flex-col items-end gap-2 min-[900px]:right-6 min-[900px]:bottom-6">
					{steps.map((step) => (
						<HudTile
							key={step.label}
							label={step.label}
							title={step.title}
							onClick={step.onClick}
							icon={STEP_ICON[step.label] ?? "/hud/settings.svg"}
						/>
					))}
				</div>
			) : (
				<div ref={anchors.system} className={corner ? "absolute right-6 bottom-6 flex items-end gap-3" : "hidden"}>
					{leading}
					{corner}
				</div>
			)}
		</div>
	);
}

function ShipPortrait({ ship, listed = false }: { ship: (typeof SHIPS)[number]; listed?: boolean }) {
	return (
		<span
			className={`shrink-0 bg-gradient-to-br from-[#FFD73D] via-[#E9A92A]/60 to-[#C8641E] p-px ${listed ? "size-9" : "size-10"}`}
			style={{ clipPath: chamfer(listed ? 6 : 8, "tr-bl") }}
		>
			<img
				src={ship.portrait}
				alt=""
				width={40}
				height={40}
				className="size-full bg-[#0B0A07] object-cover"
				style={{ clipPath: chamfer(listed ? 5.5 : 7.5, "tr-bl") }}
			/>
		</span>
	);
}

function ShipName({ ship, energy }: { ship: (typeof SHIPS)[number]; energy: number; listed?: boolean }) {
	const amount = Math.round(energy).toLocaleString("en-US");
	const fill = Math.max(0, Math.min(1, energy / ENERGY_CAPACITY));
	return (
		<div className="min-w-0 flex-1">
			<p className={`truncate text-sm font-bold tracking-[0.6px] uppercase min-[900px]:text-[12px] min-[900px]:tracking-[1.4px] ${GOLD_TEXT}`}>
				{ship.name}
			</p>
			<p className="mt-0.5 flex items-center gap-1.5 text-[9px] tracking-[1px] text-[#a89060] uppercase">
				<span className="truncate">{ship.role}</span>
				<span aria-hidden className="h-[3px] min-w-6 flex-1 overflow-hidden bg-[#FFD73D]/[0.12]" style={{ clipPath: chamfer(1.5) }}>
					<span
						className="block h-full bg-gradient-to-r from-[#C8641E] via-[#E9A92A] to-[#FFD73D] transition-[width] duration-500 motion-reduce:transition-none"
						style={{ width: `${fill * 100}%` }}
					/>
				</span>
				<span className="font-semibold text-[#ffd73d] tabular-nums">
					<span className="sr-only">Energy </span>
					{amount}
				</span>
			</p>
		</div>
	);
}

function ShipAction({ label, action, icon }: { label: string; action: HudAction; icon: string }) {
	const engaged = action.pressed === true;
	return (
		<button
			type="button"
			title={action.title}
			aria-label={label}
			aria-pressed={action.pressed}
			disabled={action.disabled}
			onClick={action.onClick}
			style={{ clipPath: chamfer(6, "tr-bl") }}
			className={`flex size-[34px] shrink-0 items-center justify-center transition-[filter,transform] duration-150 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none motion-reduce:transition-none min-[900px]:size-8 ${engaged ? "bg-gradient-to-b from-[#E9A92A] to-[#C8641E] shadow-[inset_0_2px_4px_rgba(0,0,0,0.35)]" : "bg-gradient-to-b from-[#FFF0A8] via-[#FFD73D] to-[#C8941A] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-2px_0_rgba(120,70,10,0.45)]"} ${action.disabled ? "cursor-not-allowed opacity-40 saturate-50" : "hover:brightness-110 active:translate-y-px"}`}
		>
			<img src={icon} alt="" width={16} height={16} />
		</button>
	);
}

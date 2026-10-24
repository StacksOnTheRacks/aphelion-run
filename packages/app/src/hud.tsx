"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"] });

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
}: {
	cut: HousingCut;
	highlight?: "top" | "bottom" | "left";
	/** `bottom` strokes only the lower edge. `except-bottom` and `except-top` leave that edge open so a plate can sit on the screen. */
	border?: "all" | "bottom" | "except-bottom" | "except-top";
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

	return (
		<svg ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible">
			{size.w > 0 && size.h > 0 ? (
				<>
					<path
						d={platePath(size.w, size.h, fitted)}
						fill={`url(#${gradientId})`}
						stroke={border === "all" ? "#FFD73D" : "none"}
						strokeOpacity={0.48}
					/>
					{border === "bottom" ? (
						<path d={edgePath(size.w, size.h, fitted, "bottom")} fill="none" stroke="#FFD73D" strokeOpacity={0.48} />
					) : null}
					{border === "except-bottom" ? (
						<path d={openBottomPath(size.w, size.h, fitted)} fill="none" stroke="#FFD73D" strokeOpacity={0.48} />
					) : null}
					{border === "except-top" ? (
						<path d={openTopPath(size.w, size.h, fitted)} fill="none" stroke="#FFD73D" strokeOpacity={0.48} />
					) : null}
					{highlight ? (
						<path d={edgePath(size.w, size.h, fitted, highlight)} fill="none" stroke="#FFD73D" strokeOpacity={0.85} />
					) : null}
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2={size.h} gradientUnits="userSpaceOnUse">
							<stop offset="0" stopColor="#292413" stopOpacity="0.98" />
							<stop offset="0.4" stopColor="#16140B" stopOpacity="0.97" />
							<stop offset="1" stopColor="#07080A" stopOpacity="0.96" />
						</linearGradient>
					</defs>
				</>
			) : null}
		</svg>
	);
}

function clampCut(cut: HousingCut, width: number, height: number): Required<HousingCut> {
	const limit = Math.max(0, Math.min(width, height) / 2 - 1);
	const cap = (value?: number) => Math.min(value ?? 0, limit);
	return { tl: cap(cut.tl), tr: cap(cut.tr), bl: cap(cut.bl), br: cap(cut.br) };
}

/** A closed outline, inset half a pixel so the centered stroke stays inside the plate. */
function platePath(width: number, height: number, cut: Required<HousingCut>): string {
	const x0 = 0.5;
	const y0 = 0.5;
	const x1 = width - 0.5;
	const y1 = height - 0.5;
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

/**
 * Figures from the HUD design. The warehouse has no ledger yet, so the strip shows these holdings
 * until energy and minerals are counted. The published site serves these icons from its own public
 * folder. The copies beside this package are for the game dev server.
 */
const HOLDINGS = [
	{ id: "helium-3", label: "Helium-3", amount: 4200, icon: "/hud/helium-3.svg" },
	{ id: "oxygen", label: "Oxygen", amount: 1850, icon: "/hud/oxygen.svg" },
	{ id: "rare-ore", label: "Rare ore", amount: 320, icon: "/hud/rare-ore.svg" },
	{ id: "plasma", label: "Plasma cells", amount: 45, icon: "/hud/plasma.svg" },
] as const;

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
 * the row on a desktop and just under the plaque on a phone, and slide off the right edge. The active ship
 * sits flush on the lower left, open along the bottom edge, with pilot, locate, and recall on its row. That bar opens into the fleet; choosing
 * a ship makes it active and closes the list. The chart's step back sits at the lower right, in the
 * chamfered control. In the cockpit that corner holds the exterior view, with Exit on its left.
 * One ship is listed: the ranger.
 */
export function Hud({
	anchors,
	location,
	pilot,
	locate,
	recall,
	steps = [],
	leading,
	corner,
}: {
	anchors: HudAnchors;
	location: { title: string; detail: string | null };
	pilot: HudAction;
	locate: HudAction;
	recall: HudAction;
	/** The chart steps that used to sit in the lower right. Empty while piloting, and on the galaxy. */
	steps?: { label: string; title: string; onClick: () => void }[];
	/** A cockpit control drawn to the left of `corner`, such as the way back to the chart. */
	leading?: ReactNode;
	/** Replaces the ship list. In the cockpit this is the exterior control, on the lower right. */
	corner?: ReactNode;
}) {
	const [shipsOpen, setShipsOpen] = useState(false);
	const [activeShipId, setActiveShipId] = useState<ShipId>("ranger");
	const activeShip = SHIPS.find((ship) => ship.id === activeShipId) ?? SHIPS[0];
	const [holdingsOpen, setHoldingsOpen] = useState(true);

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
					<Housing cut={{}} border="bottom" />
				</div>
				<div
					ref={anchors.location}
					role="status"
					aria-live="polite"
					className="pointer-events-auto absolute top-0 left-1/2 z-10 isolate flex h-10 max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-2 px-3.5 min-[900px]:h-9 min-[900px]:max-w-[min(24rem,calc(100%-36rem))] min-[900px]:px-4"
				>
					<Housing cut={{ bl: 10, br: 10 }} highlight="bottom" border="except-top" />
					<img src="/hud/map-pin.svg" alt="" width={18} height={18} className="shrink-0" />
					<p className="truncate text-sm font-semibold text-[#ffd73d] min-[900px]:text-[13px] min-[900px]:font-bold min-[900px]:tracking-[1.5px] min-[900px]:uppercase">
						{location.title}
					</p>
					{location.detail ? (
						<p className="flex min-w-0 items-center gap-1.5 text-[11px] font-normal text-[#a89060] min-[900px]:text-[10px] min-[900px]:tracking-[0.8px] min-[900px]:uppercase">
							<img src="/hud/status-dot.svg" alt="" width={14} height={14} className="shrink-0" />
							<span className="truncate">{location.detail}</span>
						</p>
					) : null}
				</div>
				<div ref={anchors.warehouse} className="absolute top-10 right-0 min-[900px]:top-1">
					<div
						className={`pointer-events-auto relative flex h-6 items-center pr-2 transition-transform duration-300 ease-out motion-reduce:transition-none min-[900px]:h-5 ${holdingsOpen ? "translate-x-0" : "translate-x-[calc(100%-1.25rem)]"}`}
					>
						<button
							type="button"
							aria-expanded={holdingsOpen}
							aria-label={holdingsOpen ? "Hide warehouse" : "Show warehouse"}
							onClick={() => setHoldingsOpen((value) => !value)}
							className="flex size-5 shrink-0 items-center justify-center focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
						>
							<img
								src="/hud/chevron-right.svg"
								alt=""
								width={12}
								height={12}
								className={`transition-transform duration-300 motion-reduce:transition-none ${holdingsOpen ? "" : "rotate-180"}`}
							/>
						</button>
						<span aria-hidden className="mx-1.5 h-3.5 w-px shrink-0 bg-[rgba(255,215,61,0.2)] min-[900px]:hidden" />
						<ul aria-label="Warehouse" className="flex items-center gap-2">
							{HOLDINGS.map((item) => {
								const amount = item.amount.toLocaleString("en-US");
								return (
									<li key={item.id} className="flex items-center gap-1" aria-label={`${item.label}, ${amount}`}>
										<img src={item.icon} alt="" width={14} height={14} className="size-[13px] shrink-0 min-[900px]:size-3.5" />
										<span aria-hidden className="text-[10px] font-bold tracking-[0.4px] text-[#ffd73d]">
											{amount}
										</span>
									</li>
								);
							})}
						</ul>
					</div>
				</div>
			</div>

			{corner ? null : (
				<div ref={anchors.ships} className="absolute bottom-0 left-0 w-[min(286px,calc(100%-6.5rem))] min-[900px]:w-[352px] min-[900px]:max-w-[calc(100%-8rem)]">
					{shipsOpen ? (
						<div className="pointer-events-auto relative isolate flex w-full flex-col gap-1.5 p-2 min-[900px]:gap-1 min-[900px]:p-1.5">
							<Housing cut={{ tr: 10 }} highlight="top" border="except-bottom" />
							<div className="flex justify-end">
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
												className={`flex w-full items-center justify-center gap-3 rounded-[3px] p-2 text-left focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none min-[900px]:justify-start min-[900px]:gap-2.5 min-[900px]:px-2 min-[900px]:py-1.5 ${active ? "border border-[rgba(92,74,0,0.6)] bg-gradient-to-r from-[rgba(42,30,0,0.8)] to-[rgba(26,19,0,0.7)] min-[900px]:rounded-[0_3px_3px_0] min-[900px]:border-y-0 min-[900px]:border-r-0 min-[900px]:border-l-2 min-[900px]:border-[rgba(107,85,0,0.9)] min-[900px]:from-[#2a1f00] min-[900px]:to-[#1a1200]" : "hover:bg-white/5"}`}
											>
												<ShipPortrait ship={ship} listed />
												<ShipName ship={ship} listed />
											</button>
										</li>
									);
								})}
							</ul>
						</div>
					) : (
						<div role="group" aria-label={`${activeShip.name}, active ship`} className="pointer-events-auto relative isolate flex h-[58px] w-full items-center gap-2 p-2 min-[900px]:h-[52px] min-[900px]:py-1.5 min-[900px]:pr-2.5 min-[900px]:pl-2">
							<Housing cut={{ tr: 10 }} highlight="top" border="except-bottom" />
							<ShipPortrait ship={activeShip} />
							<ShipName ship={activeShip} />
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
			)}

			{steps.length > 0 ? (
				<div ref={anchors.system} className="absolute right-3 bottom-3 flex flex-col items-end gap-2 min-[900px]:right-6 min-[900px]:bottom-6">
					{steps.map((step) => (
						<button
							key={step.label}
							type="button"
							title={step.title}
							onClick={step.onClick}
							className="pointer-events-auto isolate relative flex size-20 flex-col items-center justify-center gap-1.5 text-[13px] font-bold tracking-[1px] text-[#ffd73d] uppercase hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none min-[900px]:size-[88px] min-[900px]:gap-1.5 min-[900px]:text-[11px]"
						>
							<Housing cut={{ tl: 12, tr: 12, bl: 12, br: 12 }} />
							<img src="/hud/settings.svg" alt="" width={20} height={20} />
							{step.label}
						</button>
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
		<img
			src={ship.portrait}
			alt=""
			width={40}
			height={40}
			className={`size-10 shrink-0 object-cover ${listed ? "rounded-full min-[900px]:size-9 min-[900px]:rounded-[3px]" : "rounded-full min-[900px]:rounded"}`}
		/>
	);
}

function ShipName({ ship, listed = false }: { ship: (typeof SHIPS)[number]; listed?: boolean }) {
	return (
		<div className={listed ? "min-w-0 min-[900px]:flex-1" : "min-w-0 flex-1"}>
			<p className="truncate text-sm font-bold text-[#ffd73d] min-[900px]:text-[13px] min-[900px]:tracking-[0.3px]">{ship.name}</p>
			<p className="truncate text-[10px] tracking-[0.5px] text-[#a89060] uppercase">{ship.role}</p>
		</div>
	);
}

function ShipAction({ label, action, icon }: { label: string; action: HudAction; icon: string }) {
	return (
		<button
			type="button"
			title={action.title}
			aria-label={label}
			aria-pressed={action.pressed}
			disabled={action.disabled}
			onClick={action.onClick}
			className={`flex size-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[3px] bg-gradient-to-b from-[#ffe44d] to-[#c89a00] shadow-[inset_0_1px_2px_rgba(255,255,255,0.25)] focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none min-[900px]:size-8 min-[900px]:rounded-[0_3px_0_0] ${action.disabled ? "cursor-not-allowed opacity-[0.45] min-[900px]:opacity-35" : "hover:brightness-110"}`}
		>
			<img src={icon} alt="" width={16} height={16} />
		</button>
	);
}

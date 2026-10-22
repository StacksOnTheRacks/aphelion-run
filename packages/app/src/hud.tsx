"use client";

import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"] });

/** The plate shared by every HUD region: a dark gold field, a hairline, and a blur over the scene. */
const plate =
	"border border-[#6b4f00] bg-[rgba(17,13,0,0.6)] backdrop-blur-[12px] lg:border-[#6b5500] lg:bg-[rgba(15,18,0,0.8)]";

/**
 * Figures from the HUD design. The warehouse has no ledger yet, so the strip shows these holdings
 * until energy and minerals are counted.
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
	location: RefObject<HTMLDivElement>;
	warehouse: RefObject<HTMLDivElement>;
	ships: RefObject<HTMLDivElement>;
	system: RefObject<HTMLDivElement>;
};

/** The four regions names on the scene stay clear of. */
export function useHudAnchors(): { anchors: HudAnchors; keepOut: RefObject<HTMLElement>[] } {
	const location = useRef<HTMLDivElement>(null);
	const warehouse = useRef<HTMLDivElement>(null);
	const ships = useRef<HTMLDivElement>(null);
	const system = useRef<HTMLDivElement>(null);
	const anchors = useMemo(() => ({ location, warehouse, ships, system }), [location, warehouse, ships, system]);
	const keepOut = useMemo(() => [location, warehouse, ships, system], [location, warehouse, ships, system]);
	return { anchors, keepOut };
}

/**
 * The play chrome over the scene. The place is a short bar flush with the top, kept clear of the warehouse.
 * The warehouse sits on the right and slides off that edge. The lower left is the active ship, with
 * pilot, locate, and recall on its row. That bar opens into the fleet; choosing a ship makes it active
 * and closes the list. The chart's step back sits at the lower right, in the round control. In the
 * cockpit that corner holds the same round control for the exterior view, with Exit on its left. One ship is listed: the ranger.
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
	/** Replaces the ship list. In the cockpit this is the round exterior control, on the lower right. */
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
			<div
				ref={anchors.location}
				role="status"
				aria-live="polite"
				className={`${plate} pointer-events-auto absolute top-0 left-1/2 flex h-10 max-w-[min(24rem,calc(100%-1.5rem))] -translate-x-1/2 items-center gap-2 rounded-b px-3.5 min-[900px]:max-w-[min(24rem,calc(100%-36rem))]`}
			>
				<img src="/hud/map-pin.svg" alt="" width={18} height={18} className="shrink-0" />
				<p className="truncate text-sm font-semibold text-[#ffd73d]">{location.title}</p>
				{location.detail ? (
					<p className="flex min-w-0 items-center gap-1.5 text-xs font-normal text-[#a89060]">
						<img src="/hud/status-dot.svg" alt="" width={8} height={8} className="shrink-0" />
						<span className="truncate">{location.detail}</span>
					</p>
				) : null}
			</div>

			<div ref={anchors.warehouse} className="absolute top-10 right-0 min-[900px]:top-0">
				<div
					className={`${plate} pointer-events-auto flex items-center rounded-l transition-transform duration-300 ease-out motion-reduce:transition-none ${holdingsOpen ? "translate-x-0" : "translate-x-[calc(100%-2rem)]"}`}
				>
					<button
						type="button"
						aria-expanded={holdingsOpen}
						aria-label={holdingsOpen ? "Hide warehouse" : "Show warehouse"}
						onClick={() => setHoldingsOpen((value) => !value)}
						className="flex h-8 w-8 shrink-0 items-center justify-center focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
					>
						<img
							src="/hud/chevron-up.svg"
							alt=""
							width={12}
							height={12}
							className={`transition-transform duration-300 motion-reduce:transition-none ${holdingsOpen ? "rotate-90" : "-rotate-90"}`}
						/>
					</button>
					<ul aria-label="Warehouse" className="flex items-center gap-2 pr-2.5">
						{HOLDINGS.map((item) => {
							const amount = item.amount.toLocaleString("en-US");
							return (
								<li key={item.id} className="flex items-center gap-1" aria-label={`${item.label}, ${amount}`}>
									<img src={item.icon} alt="" width={14} height={14} />
									<span aria-hidden className="text-[11px] font-semibold text-[#ffd73d]">
										{amount}
									</span>
								</li>
							);
						})}
					</ul>
				</div>
			</div>

			{corner ? null : (
				<div ref={anchors.ships} className="absolute bottom-0 left-12 w-[min(22rem,calc(100%-10.5rem))]">
					{shipsOpen ? (
						<div className={`${plate} pointer-events-auto flex w-full flex-col gap-1.5 rounded-tr p-2`}>
							<div className="flex justify-end">
								<button
									type="button"
									aria-expanded
									aria-label="Hide ships"
									onClick={() => setShipsOpen(false)}
									className="flex size-7 items-center justify-center focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
								>
									<img src="/hud/chevron-up.svg" alt="" width={12} height={12} className="rotate-180" />
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
												className={`flex w-full items-center gap-3 rounded-sm p-2 text-left focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none ${active ? "border border-[#5c4a00] bg-[#1c1400]" : "hover:bg-white/5"}`}
											>
												<ShipPortrait ship={ship} />
												<ShipName ship={ship} />
											</button>
										</li>
									);
								})}
							</ul>
						</div>
					) : (
						<div role="group" aria-label={`${activeShip.name}, active ship`} className={`${plate} pointer-events-auto flex w-full items-center gap-2 rounded-tr p-2`}>
							<ShipPortrait ship={activeShip} />
							<ShipName ship={activeShip} />
							<ShipAction label="Pilot" action={pilot}>
								<PilotIcon />
							</ShipAction>
							<ShipAction label="Locate" action={locate}>
								<LocateIcon />
							</ShipAction>
							<ShipAction label="Recall" action={recall}>
								<RecallIcon />
							</ShipAction>
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
				<div ref={anchors.system} className="absolute right-4 bottom-4 flex flex-col items-end gap-2 lg:right-6 lg:bottom-6">
					{steps.map((step) => (
						<button
							key={step.label}
							type="button"
							title={step.title}
							onClick={step.onClick}
							className={`${plate} pointer-events-auto flex size-[88px] flex-col items-center justify-center gap-2 rounded-full text-base font-semibold text-[#ffd73d] hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none lg:size-24`}
						>
							<img src="/hud/settings.svg" alt="" width={20} height={20} />
							{step.label}
						</button>
					))}
				</div>
			) : (
				<div
					ref={anchors.system}
					className={
						corner
							? "absolute right-4 bottom-4 flex items-end gap-3 lg:right-6 lg:bottom-6"
							: "hidden"
					}
				>
					{leading}
					{corner}
				</div>
			)}
		</div>
	);
}

function ShipPortrait({ ship }: { ship: (typeof SHIPS)[number] }) {
	return (
		<img src={ship.portrait} alt="" width={40} height={40} className="size-10 shrink-0 rounded-2xl object-cover" />
	);
}

function ShipName({ ship }: { ship: (typeof SHIPS)[number] }) {
	return (
		<div className="min-w-0 flex-1">
			<p className="truncate text-sm font-semibold text-[#ffd73d]">{ship.name}</p>
			<p className="truncate text-[11px] text-[#a89060]">{ship.role}</p>
		</div>
	);
}

function ShipAction({ label, action, children }: { label: string; action: HudAction; children: ReactNode }) {
	return (
		<button
			type="button"
			title={action.title}
			aria-label={label}
			aria-pressed={action.pressed}
			disabled={action.disabled}
			onClick={action.onClick}
			className={`flex size-8 shrink-0 items-center justify-center rounded-sm bg-[#ffd73d] text-[#0b0800] focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none ${action.disabled ? "cursor-not-allowed opacity-40" : "hover:bg-[#ffe98a]"}`}
		>
			{children}
		</button>
	);
}

function PilotIcon() {
	return (
		<svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
			<path d="M1.5 11.5 8 3.5l6.5 8" strokeLinejoin="round" />
			<path d="M4.5 11.5h7" strokeLinecap="round" />
			<path d="M8 7.5v4" strokeLinecap="round" />
		</svg>
	);
}

function LocateIcon() {
	return (
		<svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
			<circle cx="8" cy="8" r="3" />
			<path d="M8 1.75v2.25M8 12v2.25M1.75 8h2.25M12 8h2.25" strokeLinecap="round" />
		</svg>
	);
}

function RecallIcon() {
	return (
		<svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
			<path d="M6.5 4.5 3.5 7.5l3 3" strokeLinecap="round" strokeLinejoin="round" />
			<path d="M4 7.5h6.25a2.75 2.75 0 0 0 0-5.5H8" strokeLinecap="round" />
		</svg>
	);
}

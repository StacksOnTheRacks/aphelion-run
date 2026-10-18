"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AFT_VIEWS, type ScreenRect } from "./demo/cockpit";
import { viewTrail, type DemoView, type EnvironmentDemo } from "./demo/environment";
import {
	DEPARTURE_SECONDS,
	destinationName,
	placeName,
	scanCard,
	scanLabel,
	secondsLeft,
	travelAction,
	viewAction,
	type ScanTarget,
} from "./demo/scan";
import { Dashboard } from "./dashboard";
import { GameChrome } from "./game-chrome";
import { ScanModal } from "./scan-card";
import { SpaceLabels, type LabelItem } from "./space-labels";

type Mode = "chart" | "pilot";

/**
 * Sol, and the chrome over it. A button bar at the bottom center steps back up the zoom — galaxy, then
 * Sol, then a planet, then its moon. The name of the place on screen recenters the camera above it.
 * The galaxy itself has no bar. Selecting a body on the scene opens its outer orbit. Selecting a craft
 * orbiting a body opens that body's inner orbit, and the camera rides around with the craft. Escape
 * goes back up one step.
 *
 * Nothing on the scene is named until a scan. Scan names the nearest bodies and craft in view, and a
 * pick, on the scene or by its name, opens a card: View takes the camera there, and Travel To counts
 * down and then flies the ship there from wherever it sits.
 *
 * The lower right switches the camera between the chart and the ranger's cockpit. The cockpit has no
 * labels, picks, or zoom bar: it is for watching the trip, with a dashboard of where the ship is in
 * the system. Dragging turns the pilot's head.
 */
export function SystemPlace({ system, onLeave }: { system: EnvironmentDemo; onLeave: () => void }) {
	const chromeRef = useRef<HTMLDivElement>(null);
	const barRef = useRef<HTMLOListElement>(null);
	const controlsRef = useRef<HTMLDivElement>(null);
	const keepOut = useMemo(() => [chromeRef, barRef, controlsRef], []);
	const [view, setView] = useState<DemoView>("system");
	const [mode, setMode] = useState<Mode>("chart");
	const [scanning, setScanning] = useState(false);
	const [found, setFound] = useState<ScanTarget[]>([]);
	const [scanned, setScanned] = useState<ScanTarget | null>(null);
	const [departure, setDeparture] = useState<{ target: ScanTarget; endsAt: number } | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [flight, setFlight] = useState<ScanTarget | null>(null);
	const [docked, setDocked] = useState<ScanTarget | null>(null);
	const trail = viewTrail(view);
	const piloting = mode === "pilot";

	const go = useCallback(
		(next: DemoView) => {
			setView(next);
			system.go(next);
		},
		[system]
	);

	useEffect(() => system.onSelect((target) => go(target.view)), [system, go]);
	useEffect(
		() =>
			system.onScan((target) => {
				setScanned(target);
				setScanning(false);
			}),
		[system]
	);
	useEffect(() => system.onScanFound(setFound), [system]);
	useEffect(() => system.setScanning(scanning), [system, scanning]);
	useEffect(() => system.setPiloting(piloting), [system, piloting]);

	const launch = useCallback(
		(target: ScanTarget) => {
			setDeparture(null);
			setFlight(target);
			setDocked(null);
			system.travel(target, () => {
				setFlight(null);
				setDocked(target);
			});
		},
		[system]
	);

	useEffect(() => {
		if (!departure) {
			return;
		}
		const tick = window.setInterval(() => {
			const time = Date.now();
			setNow(time);
			if (secondsLeft(departure.endsAt, time) === 0) {
				window.clearInterval(tick);
				launch(departure.target);
			}
		}, 100);
		return () => window.clearInterval(tick);
	}, [departure, launch]);

	const ship = { at: flight ? null : (docked?.host ?? "earth"), departing: departure !== null };
	const bound = departure?.target ?? flight;

	const labels = useMemo<LabelItem[]>(() => {
		if (piloting || !scanning) {
			return [];
		}
		return found.map((target) => {
			const label = scanLabel(target);
			return {
				id: target.id,
				label,
				action: `Scan ${label}`,
				onSelect: () => {
					setScanned(target);
					setScanning(false);
				},
			};
		});
	}, [found, piloting, scanning]);

	const upRef = useRef<() => void>(() => {});
	upRef.current = () => {
		if (scanned) {
			return;
		}
		if (scanning) {
			setScanning(false);
		} else if (piloting) {
			setMode("chart");
		} else if (view !== "system") {
			go(trail.length > 1 ? trail[trail.length - 2].view : "system");
		}
	};
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			const field = event.target instanceof HTMLElement && event.target.closest("select, input, textarea");
			if (event.key === "Escape" && !field) {
				upRef.current();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const crumbs: { label: string; onSelect: () => void; current?: boolean }[] = [
		{ label: "Galaxy", onSelect: onLeave },
		{ label: "Sol", onSelect: () => go("system"), current: view === "system" },
		...trail.map((body, index) => ({
			label: body.label,
			onSelect: () => go(body.view),
			current: index === trail.length - 1,
		})),
	];

	const togglePilot = () => {
		setScanning(false);
		setScanned(null);
		setMode(piloting ? "chart" : "pilot");
	};

	const stop = () => {
		system.land();
		setFlight(null);
		setDocked(null);
	};

	return (
		<>
			<SpaceLabels source={system} items={labels} title="Scanned" keepOut={keepOut} />
			<GameChrome ref={chromeRef}>
				<ShipStatus
					departure={departure ? { target: departure.target, seconds: secondsLeft(departure.endsAt, now) } : null}
					flight={flight}
					docked={docked}
					onCancel={() => setDeparture(null)}
					onStop={stop}
				/>
			</GameChrome>
			{piloting ? <AftFrames /> : null}
			{piloting ? <Dashboard system={system} course={bound ? scanCard(bound).label : null} /> : null}
			{piloting ? null : (
				<nav
					aria-label="Breadcrumb"
					className="pointer-events-none absolute inset-x-0 bottom-[4.25rem] z-10 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6 lg:bottom-0"
				>
					<ol
						ref={barRef}
						className="pointer-events-auto flex max-w-full overflow-x-auto rounded-2xl border border-[#E8E4D9]/20 bg-black/60 text-[11px] tracking-[0.22em] uppercase backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
					>
						{crumbs.map((crumb, index) => (
							<li key={crumb.label} className={`flex shrink-0 ${index > 0 ? "border-l border-[#E8E4D9]/20" : ""}`}>
								<button
									type="button"
									onClick={crumb.onSelect}
									aria-current={crumb.current ? "page" : undefined}
									title={crumb.current ? "Recenter" : undefined}
									className={`px-4 py-2.5 whitespace-nowrap transition-colors focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:ring-inset focus-visible:outline-none ${
										crumb.current
											? "text-amber-300 hover:bg-white/10"
											: "text-[#E8E4D9]/70 hover:bg-white/10 hover:text-[#E8E4D9]"
									}`}
								>
									{crumb.label}
								</button>
							</li>
						))}
					</ol>
				</nav>
			)}
			<div
				ref={controlsRef}
				className="pointer-events-none absolute right-0 bottom-0 z-10 flex flex-col items-end gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6"
			>
				{scanning ? (
					<p role="status" className="text-[11px] tracking-[0.22em] text-amber-300 uppercase [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
						Select a body or craft
					</p>
				) : null}
				<div className="pointer-events-auto flex items-center gap-2 text-[11px] tracking-[0.22em] uppercase">
					{piloting ? null : (
						<button
							type="button"
							aria-pressed={scanning}
							onClick={() => setScanning(!scanning)}
							title={scanning ? "Stop scanning" : "Scan a body or craft"}
							className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 backdrop-blur transition-colors focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none ${
								scanning
									? "border-amber-300 bg-amber-300 text-black hover:bg-amber-200"
									: "border-[#E8E4D9]/20 bg-black/60 text-[#E8E4D9]/80 hover:bg-white/10 hover:text-[#E8E4D9]"
							}`}
						>
							<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
								<circle cx="8" cy="8" r="5" />
								<path d="M8 1v3M8 12v3M1 8h3M12 8h3" strokeLinecap="round" />
							</svg>
							Scan
						</button>
					)}
					<button
						type="button"
						onClick={togglePilot}
						aria-label={piloting ? "Switch to chart view" : "Switch to pilot view"}
						title={piloting ? "Back to the chart" : "Into the cockpit"}
						className="flex items-center gap-2 rounded-2xl border border-[#E8E4D9]/20 bg-black/60 px-4 py-2.5 text-[#E8E4D9]/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-[#E8E4D9] focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
					>
						{piloting ? (
							<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
								<circle cx="8" cy="8" r="6" />
								<ellipse cx="8" cy="8" rx="6" ry="2.2" />
								<circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
							</svg>
						) : (
							<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
								<path d="M2 11.5 4 5h8l2 6.5" strokeLinejoin="round" />
								<path d="M2 11.5h12M8 5v2.5" strokeLinecap="round" />
							</svg>
						)}
						{piloting ? "Chart" : "Pilot"}
					</button>
				</div>
			</div>
			{scanned ? (
				<ScanModal
					card={scanCard(scanned)}
					view={viewAction(scanned, view)}
					travel={travelAction(scanned, ship)}
					onClose={() => setScanned(null)}
					onView={() => {
						system.visit(scanned);
						setScanned(null);
					}}
					onTravel={() => {
						setDeparture({ target: scanned, endsAt: Date.now() + DEPARTURE_SECONDS * 1000 });
						setNow(Date.now());
						setScanned(null);
					}}
				/>
			) : null}
		</>
	);
}

/** Where the ship is, under the title: holding, counting down to leave, flying, or docked. */
function ShipStatus({
	departure,
	flight,
	docked,
	onCancel,
	onStop,
}: {
	departure: { target: ScanTarget; seconds: number } | null;
	flight: ScanTarget | null;
	docked: ScanTarget | null;
	onCancel: () => void;
	onStop: () => void;
}) {
	let text: string;
	let action: { label: string; onClick: () => void } | null = null;
	if (departure) {
		text = `Departing for ${destinationName(departure.target)} in ${departure.seconds}`;
		action = { label: "Cancel", onClick: onCancel };
	} else if (flight) {
		text = `En route to ${destinationName(flight)}.`;
		action = { label: "Stop", onClick: onStop };
	} else if (docked) {
		text =
			docked.id === docked.host
				? `Docked with a satellite of ${placeName(docked.host)}.`
				: `Docked at ${destinationName(docked)}.`;
	} else {
		text = "In orbit at Earth.";
	}
	return (
		<div className="mt-3 flex flex-wrap items-center gap-3">
			<p role="status" aria-live="polite" className="text-sm leading-relaxed text-white/60">
				{text}
			</p>
			{action ? (
				<button
					type="button"
					onClick={action.onClick}
					className="pointer-events-auto rounded-xl border border-[#E8E4D9]/20 bg-black/50 px-3 py-1 text-[11px] tracking-[0.22em] text-amber-300 uppercase backdrop-blur transition-colors hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
				>
					{action.label}
				</button>
			) : null}
		</div>
	);
}

/** A frame and a name around each aft view. The views themselves are drawn by the scene, under these. */
function AftFrames() {
	const frames: { label: string; rect: ScreenRect }[] = [
		{ label: "Port aft", rect: AFT_VIEWS.port },
		{ label: "Starboard aft", rect: AFT_VIEWS.starboard },
	];
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0">
			{frames.map((frame) => (
				<div
					key={frame.label}
					className="absolute rounded-md border border-[#E8E4D9]/30 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
					style={{
						left: `${frame.rect.left * 100}%`,
						top: `${frame.rect.top * 100}%`,
						width: `${frame.rect.width * 100}%`,
						height: `${frame.rect.height * 100}%`,
					}}
				>
					<span className="absolute -top-5 left-0 text-[10px] tracking-[0.22em] text-[#E8E4D9]/70 uppercase [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
						{frame.label}
					</span>
				</div>
			))}
		</div>
	);
}

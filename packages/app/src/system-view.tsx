"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AFT_VIEWS, type ScreenRect } from "./demo/cockpit";
import { chartButtons, wideChartStep, type ChartButton, type DemoView, type EnvironmentDemo } from "./demo/environment";
import {
	DEPARTURE_SECONDS,
	destinationName,
	placeName,
	scanCard,
	scanLabel,
	showsCard,
	secondsLeft,
	travelAction,
	viewAction,
	type ScanTarget,
} from "./demo/scan";
import { Dashboard } from "./dashboard";
import { GameChrome } from "./game-chrome";
import { ScanModal } from "./scan-card";
import { SpaceLabels, type LabelItem } from "./space-labels";
import { ZoomControls } from "./zoom-controls";

type Mode = "chart" | "pilot";

const STEP_TITLE: Record<string, string> = {
	Home: "Your ship's orbit",
	Galaxy: "Back to the galaxy",
	System: "Back to the system",
	Planet: "Back to the planet",
	Sun: "Back to the Sun",
};

const cornerClass =
	"pointer-events-auto touch-manipulation flex items-center gap-2 rounded-2xl border border-[#E8E4D9]/20 bg-black/60 px-4 py-2.5 text-[11px] tracking-[0.22em] text-[#E8E4D9]/80 uppercase backdrop-blur transition-colors hover:bg-white/10 hover:text-[#E8E4D9] focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none";

/**
 * Sol, and the chrome over it. Names follow the framing: a wide planet chart names the planet and its
 * moons, and a chart on one body names that body and what orbits it. A pick on a body goes there.
 * A pick on a home base, a station, or a collector opens a card: View rides alongside it, and Travel
 * To counts down and then flies the ship there from wherever it sits. The cockpit has no names and
 * no picks.
 *
 * The lower right is Pilot, or Chart while piloting, on every Sol chart including the system. Above it,
 * one step back: System from a planet or the Sun, Planet from a moon or from an inner orbit. The system
 * chart's steps are Home, which opens the ship's orbit, and Galaxy, which leaves Sol. Escape takes the
 * same step as the top button. Dragging turns the pilot's head.
 */
export function SystemPlace({ system, onLeave }: { system: EnvironmentDemo; onLeave: () => void }) {
	const chromeRef = useRef<HTMLDivElement>(null);
	const controlsRef = useRef<HTMLDivElement>(null);
	const zoomRef = useRef<HTMLDivElement>(null);
	const keepOut = useMemo(() => [chromeRef, controlsRef, zoomRef], []);
	const [view, setView] = useState<DemoView>(() => system.view());
	const [mode, setMode] = useState<Mode>("chart");
	const [found, setFound] = useState<ScanTarget[]>([]);
	const [scanned, setScanned] = useState<ScanTarget | null>(null);
	const [departure, setDeparture] = useState<{ target: ScanTarget; endsAt: number } | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [flight, setFlight] = useState<ScanTarget | null>(null);
	const [docked, setDocked] = useState<ScanTarget | null>(null);
	const [close, setClose] = useState(false);
	const piloting = mode === "pilot";
	const back = close ? wideChartStep(view) : null;
	const steps = back ? [back] : chartButtons(view);

	const go = useCallback(
		(next: DemoView) => {
			setView(next);
			system.go(next);
		},
		[system]
	);

	const pick = useCallback(
		(target: ScanTarget) => {
			if (showsCard(target)) {
				setScanned(target);
				return;
			}
			setScanned(null);
			system.visit(target);
		},
		[system]
	);

	useEffect(() => system.onSelect((target) => go(target.view)), [system, go]);
	useEffect(() => system.onScan(pick), [system, pick]);
	useEffect(() => system.onScanFound(setFound), [system]);
	useEffect(() => system.onFraming(setClose), [system]);
	useEffect(() => system.setScanning(!piloting), [system, piloting]);
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
		if (piloting) {
			return [];
		}
		return found.map((target) => {
			const label = scanLabel(target);
			return {
				id: target.id,
				label,
				onSelect: () => pick(target),
			};
		});
	}, [found, piloting, pick]);

	const take = useCallback(
		(button: ChartButton) => {
			if (button.target === "galaxy") {
				onLeave();
			} else if (button.target === "ship") {
				system.home();
			} else if (button.target === "wide") {
				system.widen();
			} else {
				go(button.target);
			}
		},
		[go, onLeave, system]
	);

	const upRef = useRef<() => void>(() => {});
	upRef.current = () => {
		if (scanned) {
			return;
		}
		if (piloting) {
			setMode("chart");
		} else {
			const step = steps[0];
			if (step) {
				take(step);
			}
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

	const togglePilot = () => {
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
			{piloting ? <AftFrames /> : <ZoomControls ref={zoomRef} onZoom={system.zoom} />}
			{piloting ? <Dashboard system={system} course={bound ? scanCard(bound).label : null} /> : null}
			<div
				ref={controlsRef}
				className="pointer-events-none absolute right-0 bottom-0 z-10 flex flex-col items-end gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-6"
			>
				{piloting
					? null
					: steps.map((button) => (
							<button
								key={button.label}
								type="button"
								onClick={() => take(button)}
								title={STEP_TITLE[button.label]}
								className={cornerClass}
							>
								{button.label}
							</button>
						))}
				<button
					type="button"
					onClick={togglePilot}
					aria-label={piloting ? "Switch to chart view" : "Switch to pilot view"}
					title={piloting ? "Back to the chart" : "Into the cockpit"}
					className={cornerClass}
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
			{scanned ? (
				<ScanModal
					card={scanCard(scanned)}
					view={viewAction(scanned, view, close)}
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
					className="pointer-events-auto touch-manipulation rounded-xl border border-[#E8E4D9]/20 bg-black/50 px-3 py-1 text-[11px] tracking-[0.22em] text-amber-300 uppercase backdrop-blur transition-colors hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
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

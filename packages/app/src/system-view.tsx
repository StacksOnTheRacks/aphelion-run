"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { AFT_VIEWS, type PilotViewpoint, type ScreenRect } from "./demo/cockpit";
import { chartButtons, viewTrail, wideChartStep, type ChartButton, type DemoView, type EnvironmentDemo } from "./demo/environment";
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
import { Housing, Hud, useHudAnchors } from "./hud";
import { PILOT_VIEWPORT } from "./pilot-viewport";
import { ScanModal } from "./scan-card";
import { SpaceLabels, type LabelItem } from "./space-labels";

type Mode = "chart" | "pilot";

const STEP_TITLE: Record<string, string> = {
	Home: "Your ship's orbit",
	Galaxy: "Back to the galaxy",
	System: "Back to the system",
	Planet: "Back to the planet",
	Sun: "Back to the Sun",
};

/**
 * Sol, and the chrome over it. Names follow the framing: a wide planet chart names the planet and its
 * moons, and a chart on one body names that body and what orbits it. A pick on a body goes there.
 * A pick on a home base, a station, or a collector opens a card: View rides alongside it, and Travel
 * To counts down and then flies the ship there from wherever it sits. The cockpit has no names and
 * no picks.
 *
 * The HUD reads the place, the warehouse, and the ranger. Pilot enters the cockpit on a desktop or a
 * large tablet. The ship list then leaves. The chamfered control becomes the exterior view, and Exit sits to its left. A phone stays on the
 * chart, and shrinking the window below that leaves the cockpit. Locate opens the ship's orbit.
 * Recall cancels a countdown or stops a burn.
 * The lower right, on a chart, is one step back: System from a planet or the Sun, Planet from a moon
 * or from an inner orbit, and Galaxy from the system. It stays down while piloting. Escape takes the
 * first chart step, Home on the system chart and otherwise that lower-right step, and leaves the
 * cockpit for the chart. Dragging turns the pilot's head, or swings the exterior camera around the ship.
 */
export function SystemPlace({ system, onLeave }: { system: EnvironmentDemo; onLeave: () => void }) {
	const { anchors, keepOut } = useHudAnchors();
	const [view, setView] = useState<DemoView>(() => system.view());
	const [mode, setMode] = useState<Mode>("chart");
	const [viewpoint, setViewpoint] = useState<PilotViewpoint>("interior");
	const [found, setFound] = useState<ScanTarget[]>([]);
	const [scanned, setScanned] = useState<ScanTarget | null>(null);
	const [departure, setDeparture] = useState<{ target: ScanTarget; endsAt: number } | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [flight, setFlight] = useState<ScanTarget | null>(null);
	const [docked, setDocked] = useState<ScanTarget | null>(null);
	const [close, setClose] = useState(false);
	const pilotFits = usePilotFits();
	const piloting = mode === "pilot" && pilotFits;
	const back = close ? wideChartStep(view) : null;
	const steps = back ? [back] : chartButtons(view);
	// Home is Locate. The rest of the chart steps stay in the lower right.
	const trail = steps.filter((button) => button.target !== "ship");

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
	useEffect(() => {
		if (!pilotFits && mode === "pilot") {
			setViewpoint("interior");
			setMode("chart");
		}
	}, [pilotFits, mode]);
	useEffect(() => system.setViewpoint(viewpoint), [system, viewpoint]);

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
		const focus = viewTrail(view).filter((body) => !body.id.endsWith("-stop")).at(-1);
		return found.map((target) => {
			const label = scanLabel(target);
			return {
				id: target.id,
				label,
				onSelect: () => pick(target),
				current: target.id === focus?.id,
			};
		});
	}, [found, piloting, pick, view]);

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
			setViewpoint("interior");
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
		if (!pilotFits && !piloting) {
			return;
		}
		setScanned(null);
		if (piloting) {
			setViewpoint("interior");
		}
		setMode(piloting ? "chart" : "pilot");
	};

	const stop = () => {
		system.land();
		setFlight(null);
		setDocked(null);
	};

	const recall = () => {
		if (departure) {
			setDeparture(null);
			return;
		}
		if (flight) {
			stop();
		}
	};

	const location = shipLocation(
		departure ? { target: departure.target, seconds: secondsLeft(departure.endsAt, now) } : null,
		flight,
		docked
	);

	return (
		<>
			<SpaceLabels source={system} items={labels} title="Scanned" keepOut={keepOut} />
			{piloting && viewpoint === "interior" ? <AftFrames /> : null}
			{piloting ? <Dashboard system={system} course={bound ? scanCard(bound).label : null} /> : null}
			<Hud
				anchors={anchors}
				location={location}
				pilot={{
					onClick: togglePilot,
					disabled: !pilotFits && !piloting,
					pressed: piloting,
					title: piloting ? "Back to the chart" : pilotFits ? "Into the cockpit" : "The cockpit needs a larger screen",
				}}
				locate={{ onClick: () => take({ label: "Home", target: "ship" }), title: "Your ship's orbit" }}
				recall={{
					onClick: recall,
					disabled: departure === null && flight === null,
					title: departure ? "Cancel departure" : flight ? "Stop and hold" : "The ship is holding",
				}}
				steps={
					piloting
						? []
						: trail.map((button) => ({
								label: button.label,
								title: STEP_TITLE[button.label] ?? button.label,
								onClick: () => take(button),
							}))
				}
				leading={
					piloting ? (
						<button
							type="button"
							onClick={togglePilot}
							aria-label="Exit to the chart"
							title="Back to the chart"
							className="pointer-events-auto relative isolate flex size-14 items-center justify-center text-[12px] font-bold tracking-[1px] text-[#ffd73d] uppercase hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
						>
							<Housing cut={{ tl: 10, tr: 10, bl: 10, br: 10 }} />
							Exit
						</button>
					) : null
				}
				corner={
					piloting ? (
						<button
							type="button"
							onClick={() => setViewpoint(viewpoint === "interior" ? "exterior" : "interior")}
							aria-label={viewpoint === "interior" ? "Switch to exterior view" : "Switch to interior view"}
							title={viewpoint === "interior" ? "Outside the ship" : "Back in the cockpit"}
							className="pointer-events-auto relative isolate flex size-24 flex-col items-center justify-center gap-2 text-sm font-semibold text-[#ffd73d] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:outline-none"
						>
							<Housing cut={{ tl: 10, tr: 10, bl: 10, br: 10 }} />
							<img src="/hud/crosshair.svg" alt="" width={20} height={20} />
							{viewpoint === "interior" ? "Exterior" : "Interior"}
						</button>
					) : null
				}
			/>
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

/** The cockpit is offered on a desktop or a large tablet, and taken away when the window shrinks below that. */
function usePilotFits(): boolean {
	return useSyncExternalStore(
		(onChange) => {
			const media = window.matchMedia(PILOT_VIEWPORT);
			media.addEventListener("change", onChange);
			return () => media.removeEventListener("change", onChange);
		},
		() => window.matchMedia(PILOT_VIEWPORT).matches,
		() => false
	);
}

/** The location bar: the place on the left, and what the ship is doing there. */
function shipLocation(
	departure: { target: ScanTarget; seconds: number } | null,
	flight: ScanTarget | null,
	docked: ScanTarget | null
): { title: string; detail: string } {
	if (departure) {
		return { title: destinationName(departure.target), detail: `Departing in ${departure.seconds}` };
	}
	if (flight) {
		return { title: destinationName(flight), detail: "En route" };
	}
	if (docked) {
		return {
			title: placeName(docked.host),
			detail: docked.id === docked.host ? "With a satellite" : destinationName(docked),
		};
	}
	return { title: "Earth", detail: "In orbit" };
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

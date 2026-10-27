"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { PilotViewpoint } from "./demo/cockpit";
import { chartButtons, viewTrail, wideChartStep, type ChartButton, type DemoView, type EnvironmentDemo } from "./demo/environment";
import {
	DEPARTURE_SECONDS,
	scanCard,
	recallMove,
	scanLabel,
	showsCard,
	secondsLeft,
	travelAction,
	viewAction,
	type ScanTarget,
} from "./demo/scan";
import { viewPlaque } from "./demo/view-plaque";
import { PilotCornerDock } from "./dashboard";
import { holdStock, paintCenterPanel, type CargoLabel } from "./nav-glass";
import { Hud, useHudAnchors } from "./hud";
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
 * The HUD reads the chart on screen, the warehouse, and the ranger. The plaque names that chart:
 * Sol System, a wide planetary chart such as Earth System, or the body or craft once the camera is closer.
 * Pilot enters the cockpit on a desktop or a large tablet. The ship list then leaves. The dash is geometry in the scene, and it turns with the head. Exit and the view switch sit at the lower right, in the chart step's corner, and the view switch is that step's size. Exit stays the smaller plate. The ship list stays hidden out there too. A phone stays on the
 * chart, and shrinking the window below that leaves the cockpit. Locate opens the planetary chart where the ship is docked.
 * Recall returns the ship to its home base. A countdown that is already headed there can be cancelled.
 * The lower right, on a chart, is one step back: System from a planet or the Sun, Planet from a moon
 * or from an inner orbit, and Galaxy from the system. While piloting that corner is Exit and the view switch. Escape takes the
 * first chart step, Home on the system chart and otherwise that lower-right step, and leaves the
 * cockpit for the chart. Dragging turns the pilot's head, or swings the exterior camera around the ship.
 */
export function SystemPlace({ system, onLeave }: { system: EnvironmentDemo; onLeave: () => void }) {
	const { anchors, keepOut } = useHudAnchors();
	const [view, setView] = useState<DemoView>(() => system.view());
	const [riding, setRiding] = useState<ScanTarget | null>(null);
	const [mode, setMode] = useState<Mode>("chart");
	const [viewpoint, setViewpoint] = useState<PilotViewpoint>("interior");
	const [found, setFound] = useState<ScanTarget[]>([]);
	const [scanned, setScanned] = useState<ScanTarget | null>(null);
	const [departure, setDeparture] = useState<{ target: ScanTarget; endsAt: number; cost: number } | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [flight, setFlight] = useState<ScanTarget | null>(null);
	const [docked, setDocked] = useState<ScanTarget | null>(() => system.berth());
	const [hold, setHold] = useState(() => system.hold());
	const [quote, setQuote] = useState<number | null>(null);
	const [close, setClose] = useState(false);
	const pilotFits = usePilotFits();
	const piloting = mode === "pilot" && pilotFits;
	const back = close ? wideChartStep(view) : null;
	const steps = back ? [back] : chartButtons(view);
	// Home is Locate. The rest of the chart steps stay in the lower right.
	const trail = steps.filter((button) => button.target !== "ship");

	const go = useCallback(
		(next: DemoView, ride: ScanTarget | null = null) => {
			setRiding(ride);
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

	useEffect(() => system.onSelect((target) => go(target.view, target.riding ?? null)), [system, go]);
	useEffect(() => system.onScan(pick), [system, pick]);
	useEffect(() => system.onScanFound(setFound), [system]);
	useEffect(() => system.onFraming(setClose), [system]);
	const flightRef = useRef(flight);
	flightRef.current = flight;
	useEffect(
		() =>
			system.onHold((next) => {
				setHold(next);
				if (!flightRef.current) {
					setDocked(system.berth());
				}
			}),
		[system]
	);
	useEffect(() => system.setScanning(!piloting), [system, piloting]);
	useEffect(() => system.setPiloting(piloting), [system, piloting]);
	useEffect(
		() =>
			system.onNav((fix) => {
				const live = system.hold();
				system.paintCenter((context, width, height) =>
					paintCenterPanel(
						context,
						width,
						height,
						fix,
						holdStock(live.energy, {
							Hydrogen: live.cargo.hydrogen,
							Ore: live.cargo.ore,
							Nitrogen: live.cargo.nitrogen,
							Carbon: live.cargo.carbon,
						})
					)
				);
			}),
		[system]
	);
	useEffect(() => {
		if (!pilotFits && mode === "pilot") {
			setViewpoint("interior");
			setMode("chart");
		}
	}, [pilotFits, mode]);
	useEffect(() => system.setViewpoint(viewpoint), [system, viewpoint]);

	const launch = useCallback(
		(target: ScanTarget, cost: number) => {
			setDeparture(null);
			setFlight(target);
			setDocked(null);
			system.travel(target, () => {
				setFlight(null);
				setDocked(system.berth());
			}, cost);
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
				launch(departure.target, departure.cost);
			}
		}, 100);
		return () => window.clearInterval(tick);
	}, [departure, launch]);

	const ship = {
		at: flight ? null : (docked?.host ?? "earth"),
		departing: departure !== null,
		energy: hold.energy,
	};
	useEffect(() => {
		if (!scanned) {
			setQuote(null);
			return;
		}
		setQuote(system.quote(scanned));
	}, [scanned, docked, flight, system]);

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

	const recallPlan = () => {
		const home = system.homeBase();
		const berthed = system.berth();
		return {
			home,
			plan: recallMove({
				homeId: home.id,
				dockId: berthed?.id ?? null,
				homeHost: home.host,
				dockHost: berthed?.host ?? null,
				departingTo: departure?.target.id ?? null,
				inFlight: flight !== null,
				energy: hold.energy,
				cost: system.quote(home),
			}),
		};
	};

	const recall = () => {
		const { home, plan } = recallPlan();
		if (!plan.enabled || plan.move === "hold") {
			return;
		}
		if (plan.move === "cancel") {
			setDeparture(null);
			return;
		}
		if (plan.move === "abort" || plan.move === "abort-depart" || plan.move === "abort-hop") {
			system.land();
			setFlight(null);
			setDocked(system.berth());
		}
		if (plan.move === "hop" || plan.move === "abort-hop") {
			system.couple(home.id);
			setDeparture(null);
			setDocked(system.berth());
			return;
		}
		if (plan.move === "abort") {
			return;
		}
		const cost = system.quote(home);
		if (system.hold().energy < cost) {
			setDocked(system.berth());
			return;
		}
		setDeparture({ target: home, endsAt: Date.now() + DEPARTURE_SECONDS * 1000, cost });
		setNow(Date.now());
	};
	const recallState = recallPlan();

	const location = viewPlaque(view, close, riding);
	const reserve =
		scanned && (scanned.kind === "collector" || scanned.kind === "generator")
			? `${Math.round(system.charge(scanned.id)).toLocaleString("en-US")} remaining`
			: null;
	const holdings: { id: CargoLabel; label: CargoLabel; amount: number }[] = [
		{ id: "Hydrogen", label: "Hydrogen", amount: hold.base.hydrogen },
		{ id: "Ore", label: "Ore", amount: hold.base.ore },
		{ id: "Nitrogen", label: "Nitrogen", amount: hold.base.nitrogen },
		{ id: "Carbon", label: "Carbon", amount: hold.base.carbon },
	];
	return (
		<>
			<SpaceLabels source={system} items={labels} title="Scanned" keepOut={keepOut} />
			{piloting ? (
				<PilotCornerDock
					viewpoint={viewpoint}
					onExit={togglePilot}
					onToggleViewpoint={() => setViewpoint(viewpoint === "interior" ? "exterior" : "interior")}
				/>
			) : null}
			<Hud
				anchors={anchors}
				location={location}
				energy={hold.energy}
				holdings={holdings}
				pilot={{
					onClick: togglePilot,
					disabled: !pilotFits && !piloting,
					pressed: piloting,
					title: piloting ? "Back to the chart" : pilotFits ? "Into the cockpit" : "The cockpit needs a larger screen",
				}}
				locate={{ onClick: () => take({ label: "Home", target: "ship" }), title: "Where your ship is docked" }}
				recall={{
					onClick: recall,
					disabled: !recallState.plan.enabled,
					title: recallState.plan.title,
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
				fleet={!piloting}
			/>
			{scanned ? (
				<ScanModal
					card={scanCard(scanned)}
					note={reserve}
					view={viewAction(scanned, view, close)}
					travel={travelAction(scanned, ship, quote)}
					onClose={() => setScanned(null)}
					onView={() => {
						system.visit(scanned);
						setScanned(null);
					}}
					onTravel={() => {
						const cost = quote ?? system.quote(scanned);
						setDeparture({ target: scanned, endsAt: Date.now() + DEPARTURE_SECONDS * 1000, cost });
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


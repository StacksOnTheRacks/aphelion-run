"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import type { PilotViewpoint } from "./demo/cockpit";
import {
	chartButtons,
	viewTrail,
	wideChartStep,
	type ChartButton,
	type DemoView,
	type EnvironmentDemo,
	type ShipHold,
} from "./demo/environment";
import { MINERALS } from "./demo/energy";
import {
	DEPARTURE_SECONDS,
	recallMove,
	routeCommit,
	scanCard,
	scanLabel,
	showsCard,
	secondsLeft,
	travelAction,
	targetYields,
	type ScanTarget,
} from "./demo/scan";
import { pilotPlaque, viewPlaque } from "./demo/view-plaque";
import { PilotCornerDock } from "./dashboard";
import { centerPage, holdStock, paintCenterPanel, type CargoLabel } from "./nav-glass";
import { Hud, useHudAnchors } from "./hud";
import type { TravelClock } from "./travel-clock";
import { PILOT_VIEWPORT } from "./pilot-viewport";
import { RoutePlanner } from "./route-planner";
import { SpaceLabels, type LabelItem } from "./space-labels";

type Mode = "chart" | "pilot";

const STEP_TITLE: Record<string, string> = {
	Home: "Your ship's orbit",
	Galaxy: "Back to the galaxy",
	System: "Back to the system",
	Planet: "Back to the planet",
	Sol: "Back to Sol",
};

/** The hold the HUD shows. Fractions between those whole units do not change the screen. */
function sameHold(left: ShipHold, right: ShipHold): boolean {
	const charge =
		left.charge === null
			? right.charge === null
			: right.charge !== null && Math.round(left.charge) === Math.round(right.charge);
	return (
		charge &&
		Math.round(left.energy) === Math.round(right.energy) &&
		left.siphoning === right.siphoning &&
		left.dockId === right.dockId &&
		left.siphonId === right.siphonId &&
		MINERALS.every(
			(mineral) =>
				Math.round(left.cargo[mineral]) === Math.round(right.cargo[mineral]) &&
				Math.round(left.base[mineral]) === Math.round(right.base[mineral])
		)
	);
}

/** A berth is the craft the ship is on. A fresh object with the same id is the same berth. */
function sameBerth(left: ScanTarget | null, right: ScanTarget | null): boolean {
	return left?.id === right?.id;
}

/**
 * Sol, and the chrome over it. Names follow the framing: a wide planet chart names the planet and its
 * moons, and a chart on one body names that body and what orbits it. A pick on a body goes there.
 * A pick on a home base, a station, a mine, or a collector opens the route planner: the description
 * and the coast. The slider sets the speed, the time, and the burns, then counts down and flies. The cockpit has no names and
 * no picks.
 *
 * The HUD reads the chart on screen, the warehouse, and the ranger. On a chart the plaque names the
 * area in frame: Sol System, a wide planetary chart such as Earth System, Sol itself, or the body
 * once the camera is closer. While piloting it names the body the ship is docked at, or Sol System
 * when the ship is in open space.
 * Pilot enters the cockpit on a desktop or a large tablet. The ship list then leaves. The dash is geometry in the scene, and it turns with the head. Exit and the view switch sit at the lower right, in the chart step's corner, and the view switch is that step's size. Exit stays the smaller plate. The ship list stays hidden out there too. A phone stays on the
 * chart, and shrinking the window below that leaves the cockpit. Locate opens the planetary chart where the ship is docked.
 * Recall returns the ship to its home base. A countdown that is already headed there can be cancelled.
 * The lower right, on a chart, is one step back: System from a planet or Sol, Planet from a moon
 * or from an inner orbit, and Galaxy from the system. While piloting that corner is Exit and the view switch. Escape takes the
 * first chart step, Home on the system chart and otherwise that lower-right step, and leaves the
 * cockpit for the chart. Dragging turns the pilot's head, or swings the exterior camera around the ship.
 */
export function SystemPlace({ system, onLeave }: { system: EnvironmentDemo; onLeave: () => void }) {
	const { anchors, keepOut } = useHudAnchors();
	const [view, setView] = useState<DemoView>(() => system.view());
	const [mode, setMode] = useState<Mode>("chart");
	const [viewpoint, setViewpoint] = useState<PilotViewpoint>("interior");
	const [found, setFound] = useState<ScanTarget[]>([]);
	const [departure, setDeparture] = useState<{ target: ScanTarget; endsAt: number; cost: number; speed: number } | null>(null);
	const [planner, setPlanner] = useState<{
		target: ScanTarget;
		speed: number;
		minSpeed: number;
		maxSpeed: number;
		reserve: number;
		cost: number;
		seconds: number;
		course: boolean;
	} | null>(null);
	const [now, setNow] = useState(() => Date.now());
	const [flight, setFlight] = useState<ScanTarget | null>(null);
	const [docked, setDocked] = useState<ScanTarget | null>(() => system.berth());
	const [hold, setHold] = useState(() => system.hold());
	const [travel, setTravel] = useState<TravelClock | null>(null);
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
			if (!showsCard(target)) {
				setPlanner(null);
				system.visit(target);
				return;
			}
			const travel = travelAction(target, {
				at: flight ? null : (docked?.host ?? "earth"),
				departing: departure !== null,
				energy: hold.energy,
			});
			const offered = travel.enabled ? system.offer(target) : null;
			const speed = offered?.minSpeed ?? 0;
			const preview = offered ? system.preview(target, speed) : null;
			setPlanner({
				target,
				speed,
				minSpeed: offered?.minSpeed ?? 0,
				maxSpeed: offered?.maxSpeed ?? 0,
				reserve: offered?.reserve ?? 0,
				cost: preview?.cost ?? 0,
				seconds: preview?.seconds ?? 0,
				course: preview != null,
			});
		},
		[departure, docked?.host, flight, hold.energy, system]
	);

	useEffect(() => system.onSelect((target) => go(target.view)), [system, go]);
	useEffect(() => system.onScan(pick), [system, pick]);
	useEffect(() => system.onScanFound(setFound), [system]);
	useEffect(() => system.onFraming(setClose), [system]);
	const flightRef = useRef(flight);
	flightRef.current = flight;
	const pageRef = useRef(centerPage(false));
	useEffect(
		() =>
			system.onHold((next) => {
				setHold((last) => (sameHold(last, next) ? last : next));
				if (!flightRef.current) {
					setDocked((last) => {
						const berthed = system.berth();
						return sameBerth(last, berthed) ? last : berthed;
					});
				}
			}),
		[system]
	);
	useEffect(() => system.setScanning(!piloting), [system, piloting]);
	useEffect(() => system.onTravel(setTravel), [system]);
	useEffect(() => system.setPiloting(piloting), [system, piloting]);
	useEffect(
		() =>
			system.onNav((fix) => {
				const live = system.hold();
				pageRef.current = centerPage(live.siphoning);
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
						}),
						{ page: pageRef.current }
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
		(target: ScanTarget, cost: number, speed: number) => {
			setDeparture(null);
			setFlight(target);
			setDocked(null);
			system.travel(target, () => {
				setFlight(null);
				setDocked(system.berth());
			}, cost, speed);
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
				launch(departure.target, departure.cost, departure.speed);
			}
		}, 100);
		return () => window.clearInterval(tick);
	}, [departure, launch]);

	const ship = {
		at: flight ? null : (docked?.host ?? "earth"),
		departing: departure !== null,
		energy: hold.energy,
	};

	const labels = useMemo<LabelItem[]>(() => {
		if (piloting) {
			return [];
		}
		const focus = viewTrail(view).filter((body) => !body.id.endsWith("-stop")).at(-1);
		return found.map((target) => {
			const label = scanLabel(target, docked?.id === target.id);
			return {
				id: target.id,
				label,
				onSelect: () => pick(target),
				current: target.id === focus?.id,
				resources: targetYields(target),
			};
		});
	}, [found, piloting, pick, view, docked?.id]);

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
		if (planner) {
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
		setPlanner(null);
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
		setDeparture({ target: home, endsAt: Date.now() + DEPARTURE_SECONDS * 1000, cost, speed: 0 });
		setNow(Date.now());
	};
	const recallState = recallPlan();

	const location = piloting ? pilotPlaque(flight ? null : (docked?.host ?? null)) : viewPlaque(view, close);
	const reserve =
		planner && (planner.target.kind === "collector" || planner.target.kind === "generator")
			? `${Math.round(system.charge(planner.target.id)).toLocaleString("en-US")} remaining`
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
				travel={travel}
			/>
			{planner ? (
				<RoutePlanner
					card={scanCard(planner.target, docked?.id === planner.target.id)}
					note={reserve}
					travel={travelAction(planner.target, ship)}
					course={
						planner.course
							? {
									speed: planner.speed,
									minSpeed: planner.minSpeed,
									maxSpeed: planner.maxSpeed,
									cost: planner.cost,
									seconds: planner.seconds,
									reserve: planner.reserve,
								}
							: null
					}
					energy={hold.energy}
					onSpeed={(speed) => {
						const preview = system.preview(planner.target, speed);
						setPlanner((current) =>
							current && preview ? { ...current, speed, cost: preview.cost, seconds: preview.seconds } : current
						);
					}}
					onClose={() => setPlanner(null)}
					onCommit={() => {
						if (!planner.course) {
							return;
						}
						const commit = routeCommit(hold.energy, planner.cost, planner.reserve);
						if (!commit.enabled) {
							return;
						}
						setDeparture({
							target: planner.target,
							endsAt: Date.now() + DEPARTURE_SECONDS * 1000,
							cost: planner.cost,
							speed: planner.speed,
						});
						setPlanner(null);
						setNow(Date.now());
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


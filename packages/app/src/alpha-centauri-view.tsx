"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	alphaChartSteps,
	alphaLabels,
	alphaPlaque,
	type AlphaCentauriDemo,
	type ChartView,
} from "./demo/alpha-centauri";
import { Hud, useHudAnchors, type WarehouseHolding } from "./hud";
import { SpaceLabels, type LabelItem } from "./space-labels";

/**
 * The Alpha Centauri chart. The same readout as the rest of the game, and none of the ship's work:
 * no route, no mine, no sale. Locate still returns to the ship in Sol.
 */
export function AlphaCentauriPlace({
	chart,
	energy,
	cargo,
	holdings,
	onLeave,
	onHome,
}: {
	chart: AlphaCentauriDemo;
	energy: number;
	cargo: number;
	holdings: readonly WarehouseHolding[];
	onLeave: () => void;
	onHome: () => void;
}) {
	const { anchors, keepOut } = useHudAnchors();
	const [view, setView] = useState<ChartView>("system");

	useEffect(() => chart.onView(setView), [chart]);

	const location = alphaPlaque(view);
	const steps = alphaChartSteps(view);
	const labels = useMemo<LabelItem[]>(
		() =>
			alphaLabels(view).map((item) => ({
				id: item.id,
				label: item.label,
				note: item.note,
				onSelect: () => chart.go(item.id),
				current: item.id === view,
			})),
		[chart, view]
	);

	const take = useCallback(
		(target: ChartView | "galaxy") => {
			if (target === "galaxy") {
				onLeave();
			} else {
				chart.go(target);
			}
		},
		[chart, onLeave]
	);

	const upRef = useRef<() => void>(() => {});
	upRef.current = () => {
		const step = steps[0];
		if (step) {
			take(step.target);
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

	return (
		<>
			<SpaceLabels source={chart} items={labels} title="Alpha Centauri" keepOut={keepOut} />
			<Hud
				anchors={anchors}
				location={location}
				energy={energy}
				cargo={cargo}
				holdings={holdings}
				locate={{ onClick: onHome, title: "Where your ship is docked" }}
				recall={{ onClick: () => {}, disabled: true, title: "The ship is holding" }}
				steps={steps.map((step) => ({
					label: step.label,
					title: step.title,
					onClick: () => take(step.target),
				}))}
			/>
		</>
	);
}

"use client";

import { useEffect, useMemo, useRef } from "react";

import { NEIGHBORS, SOL_ID, type GalaxyDemo } from "./demo/galaxy";
import { GameChrome } from "./game-chrome";
import { SpaceLabels, type LabelItem } from "./space-labels";

/** The galaxy: its chrome, and Sol and its neighbors named on the scene. */
export function GalaxyPlace({ galaxy, onEnterSol }: { galaxy: GalaxyDemo; onEnterSol: () => void }) {
	const chromeRef = useRef<HTMLDivElement>(null);
	const items = useMemo<LabelItem[]>(
		() => [
			{ id: SOL_ID, label: "Sol", onSelect: onEnterSol, action: "Enter Sol" },
			...NEIGHBORS.map((system) => ({ id: system.id, label: system.label, note: ", not charted" })),
		],
		[onEnterSol]
	);

	useEffect(() => galaxy.onSelect(onEnterSol), [galaxy, onEnterSol]);

	return (
		<>
			<SpaceLabels source={galaxy} items={items} title="Star systems" keepOut={chromeRef} />
			<GameChrome ref={chromeRef}>
				<h2 className="mt-1 text-[11px] tracking-[0.22em] text-amber-300 uppercase">Galaxy</h2>
			</GameChrome>
		</>
	);
}

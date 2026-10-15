"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
	JOURNEY_STOPS,
	bodyTargets,
	viewTrail,
	type DemoView,
	type EnvironmentDemo,
} from "./demo/environment";
import { GameChrome } from "./game-chrome";
import { SpaceLabels, type LabelItem } from "./space-labels";

const STOP_OPTIONS = JOURNEY_STOPS.map((stop) => ({ value: stop.id, label: stop.label, group: stop.group }));

function stopLabel(id: string): string {
	const label = JOURNEY_STOPS.find((stop) => stop.id === id)?.label ?? id;
	return label === "Sun" || label === "Moon" ? `the ${label}` : label;
}

/**
 * Sol: every body in view named on the scene, and the chrome over it. A button bar at the bottom center
 * steps back up the zoom — galaxy, then Sol, then a planet, then its moon. The galaxy itself has no bar.
 * Selecting a body, on the scene or by its name, opens its outer orbit; Escape goes back up one step.
 */
export function SystemPlace({ system, onLeave }: { system: EnvironmentDemo; onLeave: () => void }) {
	const chromeRef = useRef<HTMLDivElement>(null);
	const barRef = useRef<HTMLOListElement>(null);
	const keepOut = useMemo(() => [chromeRef, barRef], []);
	const [view, setView] = useState<DemoView>("system");
	const [from, setFrom] = useState("neptune");
	const [to, setTo] = useState("sun");
	const [flight, setFlight] = useState<{ from: string; to: string } | null>(null);
	const [docked, setDocked] = useState<string | null>(null);
	const trail = viewTrail(view);

	const go = useCallback(
		(next: DemoView) => {
			setView(next);
			system.go(next);
		},
		[system]
	);

	useEffect(() => system.onSelect((target) => go(target.view)), [system, go]);

	const labels = useMemo<LabelItem[]>(
		() => bodyTargets(view).map((target) => ({ id: target.id, label: target.label, onSelect: () => go(target.view) })),
		[view, go]
	);

	const upRef = useRef<() => void>(() => {});
	upRef.current = () => {
		if (view !== "system") {
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

	const crumbs: { label: string; onSelect?: () => void }[] = [
		{ label: "Galaxy", onSelect: onLeave },
		{ label: "Sol", onSelect: view === "system" ? undefined : () => go("system") },
		...trail.map((body, index) => ({
			label: body.label,
			onSelect: index === trail.length - 1 ? undefined : () => go(body.view),
		})),
	];

	const toggleFlight = () => {
		if (flight) {
			system.land();
			setFlight(null);
			setDocked(null);
			return;
		}
		if (from === to) {
			return;
		}
		const origin = from;
		const destination = to;
		system.fly(origin, destination, () => {
			setFlight(null);
			setFrom(destination);
			setDocked(destination);
		});
		setFlight({ from: origin, to: destination });
		setDocked(null);
	};

	return (
		<>
			<SpaceLabels source={system} items={labels} title="Bodies in view" keepOut={keepOut} />
			<GameChrome ref={chromeRef}>
				<nav
					aria-label="Journey"
					className="pointer-events-auto mt-3 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-black/50 p-1 text-sm backdrop-blur"
				>
					<span className="pl-3 text-white/45">From</span>
					<Picker label="Journey from" value={from} options={STOP_OPTIONS} onChange={setFrom} />
					<span className="text-white/45">to</span>
					<Picker label="Journey to" value={to} options={STOP_OPTIONS} onChange={setTo} />
					<span aria-hidden className="mx-1 h-5 w-px bg-white/15" />
					<button
						type="button"
						onClick={toggleFlight}
						disabled={!flight && from === to}
						aria-label={flight ? "Stop the journey" : `Fly from ${stopLabel(from)} to ${stopLabel(to)}`}
						title={flight ? "Stop the journey" : from === to ? "Pick two different places" : "Fly"}
						className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
							flight ? "bg-amber-300 text-black" : "text-amber-300 enabled:hover:bg-white/10"
						}`}
					>
						{flight ? (
							<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
								<rect x="3" y="3" width="10" height="10" rx="1.5" />
							</svg>
						) : (
							<svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
								<path d="M14.5 1.5 1.8 6.6a.5.5 0 0 0 .03.94l5.07 1.56 1.56 5.07a.5.5 0 0 0 .94.03L14.5 1.5Z" />
							</svg>
						)}
					</button>
				</nav>
				{flight ? (
					<p className="mt-3 text-sm leading-relaxed text-white/60">
						A ship is flying from {stopLabel(flight.from)} to {stopLabel(flight.to)}. It climbs out with the orbit, burns
						fast along the bright line, then drops slowly inward to dock with a satellite. Where the line runs thin and pale,
						a planet&apos;s gravity bends the course and the burn costs less.
					</p>
				) : docked ? (
					<p className="mt-3 text-sm leading-relaxed text-white/60">Docked with a satellite of {stopLabel(docked)}.</p>
				) : null}
			</GameChrome>
			<nav
				aria-label="Breadcrumb"
				className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6"
			>
				<ol
					ref={barRef}
					className="pointer-events-auto flex max-w-full overflow-x-auto rounded-2xl border border-[#E8E4D9]/20 bg-black/60 text-[11px] tracking-[0.22em] uppercase backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>
					{crumbs.map((crumb, index) => (
						<li key={crumb.label} className={`flex shrink-0 ${index > 0 ? "border-l border-[#E8E4D9]/20" : ""}`}>
							{crumb.onSelect ? (
								<button
									type="button"
									onClick={crumb.onSelect}
									className="px-4 py-2.5 whitespace-nowrap text-[#E8E4D9]/70 transition-colors hover:bg-white/10 hover:text-[#E8E4D9] focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:ring-inset focus-visible:outline-none"
								>
									{crumb.label}
								</button>
							) : (
								<h2 aria-current="page" className="px-4 py-2.5 whitespace-nowrap text-amber-300">
									{crumb.label}
								</h2>
							)}
						</li>
					))}
				</ol>
			</nav>
		</>
	);
}

type PickerOption = { value: string; label: string; group?: string };

/** Consecutive options that share a group, so each group renders as one optgroup. */
function groupOptions(options: PickerOption[]): { group?: string; options: PickerOption[] }[] {
	const runs: { group?: string; options: PickerOption[] }[] = [];
	for (const option of options) {
		const last = runs[runs.length - 1];
		if (last && last.group === option.group) {
			last.options.push(option);
		} else {
			runs.push({ group: option.group, options: [option] });
		}
	}
	return runs;
}

/**
 * A native select laid invisibly over its label, so it works with a keyboard and on phones.
 * A visible select is as wide as its longest option.
 */
function Picker({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: PickerOption[];
	onChange: (value: string) => void;
}) {
	const shown = options.find((option) => option.value === value)?.label;
	return (
		<span className="relative flex items-center rounded-xl text-white transition-colors hover:bg-white/10 [&:has(:focus-visible)]:ring-1 [&:has(:focus-visible)]:ring-white/40">
			<span aria-hidden className="py-1.5 pr-7 pl-3 whitespace-nowrap">
				{shown}
			</span>
			<select
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0 [color-scheme:dark]"
			>
				{groupOptions(options).map((run) => {
					const items = run.options.map((option) => (
						<option key={option.value} value={option.value} className="bg-neutral-900 text-white">
							{option.label}
						</option>
					));
					return run.group ? (
						<optgroup key={run.group} label={run.group} className="bg-neutral-900 text-white/60">
							{items}
						</optgroup>
					) : (
						items
					);
				})}
			</select>
			<svg
				viewBox="0 0 16 16"
				className="pointer-events-none absolute right-2 h-3 w-3 text-white/50"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				aria-hidden
			>
				<path d="m4 6 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
			</svg>
		</span>
	);
}

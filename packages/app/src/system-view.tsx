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
 * Sol: every body in view named on the scene, and the chrome over it, with a breadcrumb from the galaxy
 * down to the body in view and a journey between any two bodies. Selecting a body, on the scene or by
 * its name, opens its outer orbit; Escape goes back up one step.
 */
export function SystemPlace({ system, onLeave }: { system: EnvironmentDemo; onLeave: () => void }) {
	const chromeRef = useRef<HTMLDivElement>(null);
	const [view, setView] = useState<DemoView>("system");
	const [from, setFrom] = useState("neptune");
	const [to, setTo] = useState("sun");
	const [flight, setFlight] = useState<{ from: string; to: string } | null>(null);
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
			return;
		}
		if (from === to) {
			return;
		}
		system.fly(from, to, () => setFlight(null));
		setFlight({ from, to });
	};

	return (
		<>
			<SpaceLabels source={system} items={labels} title="Bodies in view" keepOut={chromeRef} />
			<GameChrome ref={chromeRef}>
				<nav aria-label="Breadcrumb" className="mt-1">
					<ol className="flex flex-wrap items-center text-[11px] tracking-[0.22em] uppercase">
						{crumbs.map((crumb, index) => (
							<li key={crumb.label} className="flex items-center">
								{index > 0 ? (
									<span aria-hidden className="px-1 text-white/30">
										›
									</span>
								) : null}
								{crumb.onSelect ? (
									<button
										type="button"
										onClick={crumb.onSelect}
										className="pointer-events-auto -mx-1 rounded-lg px-1 py-0.5 tracking-[0.22em] text-white/50 uppercase transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-1 focus-visible:ring-white/40 focus-visible:outline-none"
									>
										{crumb.label}
									</button>
								) : (
									<h2 aria-current="page" className="py-0.5 text-amber-300">
										{crumb.label}
									</h2>
								)}
							</li>
						))}
					</ol>
				</nav>
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
						A ship is flying from {stopLabel(flight.from)} to {stopLabel(flight.to)}. The bright line is the way ahead. The dashed
						line is where it has been. Where the line runs thin and pale, a planet&apos;s gravity bends the course and the burn
						costs less.
					</p>
				) : null}
			</GameChrome>
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

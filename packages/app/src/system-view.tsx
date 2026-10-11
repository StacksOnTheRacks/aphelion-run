"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";

import {
	createEnvironment,
	PLACES,
	type DemoView,
	type EnvironmentDemo,
	type ViewPlace,
	type ViewSubject,
} from "./demo/environment";
import { SYSTEM_TRADE, bodyName, tradeForBody } from "./demo/trade";

const HAND: Record<string, { label: string; body: string }> = {
	system: {
		label: "System",
		body: "All eight planets and their major moons, seen from above, each where it really is right now. Distances are tightened so everything fits on one screen.",
	},
	"earth-outer": {
		label: "Earth (Outer)",
		body: "Earth's outer orbit, with the Moon's path beyond it. Warehouse bases sit on this ring, and ships stage here before they leave. A ship in either of Earth's orbits can be attacked.",
	},
	"earth-inner": {
		label: "Earth (Inner)",
		body: "Earth's inner orbit, close to the surface. The two larger markers are the faction energy stations. A ship that finishes a transfer is left here carrying unbanked cash. The bright marker is your ship.",
	},
	"sun-outer": {
		label: "Sun (Outer)",
		body: "The Sun's outer orbit. A ship arrives here and scans inward.",
	},
	"sun-inner": {
		label: "Sun (Inner)",
		body: "The inner orbit beside the Sun, with 300 harvesting satellites. Gold are corporate, red are Marauder, pale are unclaimed. The view turns with them, so they hold still until you drag.",
	},
	mercury: {
		label: "Mercury",
		body: "The smallest planet and the closest to the Sun. It turns once every 59 Earth days.",
	},
	venus: {
		label: "Venus",
		body: "Wrapped in thick cloud, so this is the cloud tops, not the ground. It turns backwards, once every 243 Earth days.",
	},
	mars: {
		label: "Mars",
		body: "Red dust, dark plains, and polar ice, with its two small moons, Phobos and Deimos. A day there is a little longer than ours.",
	},
	jupiter: {
		label: "Jupiter",
		body: "The largest planet, banded by storms. It turns in under ten hours. Its four large moons are Io, Europa, Ganymede, and Callisto.",
	},
	saturn: {
		label: "Saturn",
		body: "Tilted 26.7°, with its rings at true proportions. The dark gap in the rings is the Cassini Division. Titan is the large orange moon.",
	},
	uranus: {
		label: "Uranus",
		body: "An ice giant with almost no visible markings. It turns backwards. The real planet is tipped on its side; this demo does not show that yet.",
	},
	neptune: {
		label: "Neptune",
		body: "The farthest planet. Its largest moon, Triton, orbits backwards.",
	},
};

/** Facts already told on the planet views, repeated when that moon is the subject. */
const MOON_NOTES: Record<string, string> = {
	Titan: "It is the large orange moon.",
	Iapetus: "Its orbit sits off the ring plane.",
	Triton: "It orbits backwards.",
};

function moonCopy(subjectLabel: string, outer: boolean): { label: string; body: string } {
	const name = subjectLabel === "Moon" ? "The Moon" : subjectLabel;
	if (outer) {
		const note = MOON_NOTES[subjectLabel];
		return {
			label: `${subjectLabel} (Outer)`,
			body: note ? `${name}'s outer orbit. ${note}` : `${name}'s outer orbit.`,
		};
	}
	return {
		label: `${subjectLabel} (Inner)`,
		body: `${name}'s inner orbit, close to the surface. The Sun lights one side; the other falls into night.`,
	};
}

const COPY: Record<string, { label: string; body: string }> = { system: HAND.system };

for (const place of PLACES) {
	for (const subject of place.subjects) {
		for (const stop of subject.stops) {
			const planetNote = HAND[place.label.toLowerCase()];
			const planetSubject = subject.label === "Planet" || subject.label === place.label;
			COPY[stop.view] =
				HAND[stop.view] ??
				(planetNote && planetSubject
					? {
							label: `${place.label} (${stop.label === "Outer orbit" ? "Outer" : "Inner"})`,
							body: planetNote.body,
						}
					: moonCopy(subject.label, stop.label === "Outer orbit"));
		}
	}
}

/** Whole system, then the farthest planet and its moons, inward to the Sun. */
const TOUR: DemoView[] = [
	"system",
	...[...PLACES].reverse().flatMap((place) =>
		place.subjects.flatMap((subject) => subject.stops.map((stop) => stop.view))
	),
];

function locate(view: DemoView): { place?: ViewPlace; subject?: ViewSubject } {
	for (const place of PLACES) {
		for (const subject of place.subjects) {
			if (subject.stops.some((stop) => stop.view === view)) {
				return { place, subject };
			}
		}
	}
	return {};
}

const DEFAULT_CHROME =
	"pointer-events-none absolute top-0 left-0 max-w-full p-6 pr-28 sm:max-w-xl";

export function SystemView({ chromeClassName = DEFAULT_CHROME }: { chromeClassName?: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const demoRef = useRef<EnvironmentDemo | null>(null);
	const [view, setView] = useState<DemoView>("system");
	const [playing, setPlaying] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!canvasRef.current) {
			return;
		}

		const engine = new Engine(canvasRef.current, true, {
			antialias: true,
			adaptToDeviceRatio: true,
			powerPreference: "high-performance",
		});
		const scene = new Scene(engine);
		try {
			demoRef.current = createEnvironment(engine, scene, canvasRef.current);
		} catch (caught) {
			const message = caught instanceof Error ? caught.message : String(caught);
			setError(message);
		}

		engine.runRenderLoop(() => {
			scene.render();
		});

		const onResize = () => {
			engine.resize();
		};
		window.addEventListener("resize", onResize);

		return () => {
			window.removeEventListener("resize", onResize);
			scene.dispose();
			engine.dispose();
			demoRef.current = null;
		};
	}, []);

	const copy = COPY[view];
	const { place, subject } = locate(view);
	const trade =
		view === "system"
			? SYSTEM_TRADE
			: place && subject
				? tradeForBody(bodyName(place.label, subject.label))
				: undefined;
	const showSubject = Boolean(place && place.subjects.length > 1);
	const showOrbit = Boolean(subject && subject.stops.length > 1);

	const go = (next: DemoView) => {
		setPlaying(false);
		setView(next);
		demoRef.current?.go(next);
	};

	const togglePlay = () => {
		if (playing) {
			demoRef.current?.stop();
			setPlaying(false);
			return;
		}
		demoRef.current?.play(TOUR, setView);
		setPlaying(true);
	};

	return (
		<div className="absolute inset-0 overflow-hidden bg-black text-white">
			<canvas ref={canvasRef} className="h-full w-full outline-none select-none" />
			{error ? (
				<p className="absolute top-24 right-6 max-w-sm rounded bg-red-950/90 p-3 text-sm text-red-100">{error}</p>
			) : null}
			<div className={chromeClassName}>
				<p className="text-xs tracking-[0.22em] text-white/50 uppercase">Aphelion Run</p>
				<h1 className="sr-only">{copy.label}</h1>
				<nav
					aria-label="Views"
					className="pointer-events-auto mt-3 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-black/50 p-1 text-sm backdrop-blur"
				>
					<ol className="flex flex-wrap items-center">
						<li>
							<button
								type="button"
								onClick={() => go("system")}
								aria-current={view === "system" ? "page" : undefined}
								className={`rounded-xl px-3 py-1.5 whitespace-nowrap transition-colors ${
									view === "system" ? "text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
								}`}
							>
								System
							</button>
						</li>
						<Crumb>
							<Picker
								label="Place"
								value={place?.label ?? ""}
								placeholder="Choose a place"
								options={PLACES.map((candidate) => ({ value: candidate.label, label: candidate.label }))}
								onChange={(label) => {
									const chosen = PLACES.find((candidate) => candidate.label === label);
									if (chosen) {
										go(chosen.subjects[0].stops[0].view);
									}
								}}
								current={Boolean(place) && !showSubject && !showOrbit}
							/>
						</Crumb>
						{showSubject && place && subject ? (
							<Crumb>
								<Picker
									label={`${place.label} body`}
									value={subject.label}
									options={place.subjects.map((candidate) => ({
										value: candidate.label,
										label: candidate.label,
									}))}
									onChange={(label) => {
										const chosen = place.subjects.find((candidate) => candidate.label === label);
										if (chosen) {
											go(chosen.stops[0].view);
										}
									}}
									current={!showOrbit}
								/>
							</Crumb>
						) : null}
						{showOrbit && subject ? (
							<Crumb>
								<Picker
									label={`${subject.label} view`}
									value={view}
									options={subject.stops.map((stop) => ({ value: stop.view, label: stop.label }))}
									onChange={(next) => go(next as DemoView)}
									current
								/>
							</Crumb>
						) : null}
					</ol>
					<span aria-hidden className="mx-1 h-5 w-px bg-white/15" />
					<button
						type="button"
						onClick={togglePlay}
						aria-label={playing ? "Pause the tour" : "Play all views"}
						title={playing ? "Pause the tour" : "Play all views"}
						className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
							playing ? "bg-amber-300 text-black" : "text-amber-300 hover:bg-white/10"
						}`}
					>
						{playing ? (
							<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
								<rect x="3" y="2" width="3.5" height="12" rx="1" />
								<rect x="9.5" y="2" width="3.5" height="12" rx="1" />
							</svg>
						) : (
							<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
								<path d="M4 2.5v11a1 1 0 0 0 1.5.86l9-5.5a1 1 0 0 0 0-1.72l-9-5.5A1 1 0 0 0 4 2.5Z" />
							</svg>
						)}
					</button>
				</nav>
				<p className="mt-3 text-sm leading-relaxed text-white/75">{copy.body}</p>
				{trade ? <p className="mt-2 text-sm leading-relaxed text-amber-200/90">{trade}</p> : null}
			</div>
		</div>
	);
}

function Crumb({ children }: { children: ReactNode }) {
	return (
		<li className="flex items-center">
			<span aria-hidden className="px-0.5 text-white/30">
				›
			</span>
			{children}
		</li>
	);
}

/**
 * A breadcrumb step that opens a native select, so it works with a keyboard and on phones.
 * The select is invisible and laid over the label, because a visible select is as wide as its longest option.
 */
function Picker({
	label,
	value,
	placeholder,
	options,
	onChange,
	current,
}: {
	label: string;
	value: string;
	placeholder?: string;
	options: { value: string; label: string }[];
	onChange: (value: string) => void;
	current: boolean;
}) {
	const shown = options.find((option) => option.value === value)?.label ?? placeholder;
	return (
		<span
			className={`relative flex items-center rounded-xl transition-colors hover:bg-white/10 [&:has(:focus-visible)]:ring-1 [&:has(:focus-visible)]:ring-white/40 ${
				current ? "text-white" : "text-white/60 hover:text-white"
			}`}
		>
			<span aria-hidden className="py-1.5 pr-7 pl-3 whitespace-nowrap">
				{shown}
			</span>
			<select
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="absolute inset-0 w-full cursor-pointer appearance-none opacity-0 [color-scheme:dark]"
			>
				{placeholder ? (
					<option value="" disabled>
						{placeholder}
					</option>
				) : null}
				{options.map((option) => (
					<option key={option.value} value={option.value} className="bg-neutral-900 text-white">
						{option.label}
					</option>
				))}
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

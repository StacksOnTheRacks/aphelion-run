"use client";

import { useEffect, useId, useRef } from "react";

import { formatTravelTime, routeCommit, type ScanCard } from "./demo/scan";

type Action = { label: string; enabled: boolean };

/**
 * What a scan found, and the coast to it. The slider sets the speed, and the burns, the time, and
 * the energy left on arrival follow that speed. Strand Risk means arrival would leave too little to
 * reach home or Sol, and the course cannot be set. A target in the ship's orbit, or a ship already
 * under way, keeps the description and leaves the course unset.
 */
export function RoutePlanner({
	card,
	note,
	travel,
	course,
	energy,
	onSpeed,
	onClose,
	onCommit,
}: {
	card: ScanCard;
	/** A line under the description, such as the load still in a mine. */
	note?: string | null;
	/** Shown when no coast can be set: En route, already here, or a departure already counting down. */
	travel: Action;
	/** The coast on offer. Absent when the ship cannot leave for this target. */
	course: {
		speed: number;
		minSpeed: number;
		maxSpeed: number;
		cost: number;
		seconds: number;
		reserve: number;
	} | null;
	energy: number;
	onSpeed: (speed: number) => void;
	onClose: () => void;
	onCommit: () => void;
}) {
	const titleId = useId();
	const closeRef = useRef<HTMLButtonElement>(null);
	const commitRef = useRef<HTMLButtonElement>(null);
	const commit = course ? routeCommit(energy, course.cost, course.reserve) : travel;
	const left = course ? Math.round(energy) - course.cost : 0;
	const fixed = course != null && course.maxSpeed - course.minSpeed < 0.05;

	useEffect(() => {
		(commit.enabled ? commitRef : closeRef).current?.focus();
	}, [card.id, commit.enabled]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	return (
		<div className="absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-8">
			<div className="absolute inset-0 bg-black/60" onClick={onClose} />
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className="relative max-h-[calc(100vh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-[#E8E4D9]/20 bg-black/80 p-4 shadow-2xl backdrop-blur sm:p-5"
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<p className="text-[11px] tracking-[0.22em] text-amber-300 uppercase">
							{card.kind}
							{card.owner ? <span className="text-white/45"> · {card.owner}</span> : null}
						</p>
						<h2 id={titleId} className="mt-1 text-lg tracking-wide text-[#E8E4D9]">
							{card.label}
						</h2>
					</div>
					<button
						ref={closeRef}
						type="button"
						aria-label="Close"
						onClick={onClose}
						className="touch-manipulation flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#E8E4D9]/70 transition-colors hover:bg-white/10 hover:text-[#E8E4D9] focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
					>
						<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
							<path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" strokeLinecap="round" />
						</svg>
					</button>
				</div>
				<p className="mt-3 text-sm leading-relaxed text-white/70">{card.text}</p>
				{note ? <p className="mt-3 text-sm tracking-wide text-amber-200">{note}</p> : null}
				{course ? (
					<>
						<label className="mt-4 block text-[11px] tracking-[0.22em] text-white/55 uppercase" htmlFor="cruise-speed">
							Cruise speed <span className="text-amber-200">{course.speed.toFixed(1)}</span>
						</label>
						<input
							id="cruise-speed"
							type="range"
							min={course.minSpeed}
							max={course.maxSpeed}
							step={0.1}
							value={course.speed}
							disabled={fixed}
							onChange={(event) => onSpeed(Number(event.target.value))}
							className="mt-2 w-full accent-amber-300 disabled:opacity-50"
						/>
						<p className="mt-4 text-sm tracking-wide text-white/70">Time · {formatTravelTime(course.seconds)}</p>
						<p className="mt-1 text-sm tracking-wide text-amber-200">Burns · {course.cost.toLocaleString("en-US")}</p>
						<p className="mt-1 text-sm tracking-wide text-white/70">On arrival · {left.toLocaleString("en-US")}</p>
						{commit.label === "Strand Risk" ? (
							<p className="mt-2 text-sm leading-relaxed text-white/70">
								Not enough left to reach home or Sol. The return from here needs {course.reserve.toLocaleString("en-US")}.
							</p>
						) : null}
					</>
				) : null}
				<div className="mt-5 flex gap-2">
					<button
						ref={commitRef}
						type="button"
						onClick={onCommit}
						disabled={!commit.enabled}
						className="touch-manipulation flex-1 rounded-xl bg-amber-300 px-4 py-2.5 text-[11px] tracking-[0.22em] text-black uppercase transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/45 disabled:hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
					>
						{commit.label}
					</button>
				</div>
			</div>
		</div>
	);
}

"use client";

import { useEffect, useId, useRef } from "react";

import type { ScanCard } from "./demo/scan";

type Action = { label: string; enabled: boolean };

/**
 * What a scan found, over the chart. The same frame as a star system's card in the galaxy, without the
 * portrait. View takes the camera there; Travel To sets the course, and the ship leaves once the
 * countdown runs out.
 */
export function ScanModal({
	card,
	view,
	travel,
	onClose,
	onView,
	onTravel,
}: {
	card: ScanCard;
	view: Action;
	travel: Action;
	onClose: () => void;
	onView: () => void;
	onTravel: () => void;
}) {
	const titleId = useId();
	const closeRef = useRef<HTMLButtonElement>(null);
	const viewRef = useRef<HTMLButtonElement>(null);
	const travelRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		(travel.enabled ? travelRef : view.enabled ? viewRef : closeRef).current?.focus();
	}, [card.id, travel.enabled, view.enabled]);

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
				className="relative w-full max-w-sm rounded-2xl border border-[#E8E4D9]/20 bg-black/80 p-4 shadow-2xl backdrop-blur sm:p-5"
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
						className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[#E8E4D9]/70 transition-colors hover:bg-white/10 hover:text-[#E8E4D9] focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
					>
						<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
							<path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" strokeLinecap="round" />
						</svg>
					</button>
				</div>
				<p className="mt-3 text-sm leading-relaxed text-white/70">{card.text}</p>
				<div className="mt-5 flex gap-2">
					<button
						ref={viewRef}
						type="button"
						onClick={onView}
						disabled={!view.enabled}
						className="flex-1 rounded-xl border border-[#E8E4D9]/25 px-4 py-2.5 text-[11px] tracking-[0.22em] text-[#E8E4D9] uppercase transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:text-white/45 disabled:hover:bg-transparent focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
					>
						{view.label}
					</button>
					<button
						ref={travelRef}
						type="button"
						onClick={onTravel}
						disabled={!travel.enabled}
						className="flex-1 rounded-xl bg-amber-300 px-4 py-2.5 text-[11px] tracking-[0.22em] text-black uppercase transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/45 disabled:hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
					>
						{travel.label}
					</button>
				</div>
			</div>
		</div>
	);
}

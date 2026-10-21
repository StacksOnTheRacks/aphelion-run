"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { NEIGHBORS, SOL_ID, systemCard, systemCardAction, type GalaxyDemo, type StarClass, type SystemCard } from "./demo/galaxy";
import { GameChrome } from "./game-chrome";
import { SpaceLabels, type LabelItem } from "./space-labels";

const STAR_COLOR: Record<StarClass, string> = {
	A: "#C7D9FF",
	F: "#F5F2E6",
	G: "#FFE6AD",
	K: "#FFBD80",
	M: "#FF8F6B",
};

/** The galaxy: its chrome, the systems named on the scene, and the card a click opens. Home sits in the upper right and opens the ship's orbit in Sol. */
export function GalaxyPlace({
	galaxy,
	onEnterSol,
	onHome,
}: {
	galaxy: GalaxyDemo;
	onEnterSol: () => void;
	onHome: () => void;
}) {
	const chromeRef = useRef<HTMLDivElement>(null);
	const navRef = useRef<HTMLDivElement>(null);
	const keepOut = useMemo(() => [chromeRef, navRef], []);
	const [openId, setOpenId] = useState<string | null>(null);
	const card = openId ? systemCard(openId) : null;
	const items = useMemo<LabelItem[]>(
		() => [
			{ id: SOL_ID, label: "Sol", onSelect: () => setOpenId(SOL_ID) },
			...NEIGHBORS.map((system) => ({
				id: system.id,
				label: system.label,
				onSelect: () => setOpenId(system.id),
			})),
		],
		[]
	);

	useEffect(() => galaxy.onSelect(setOpenId), [galaxy]);

	return (
		<>
			<SpaceLabels source={galaxy} items={items} title="Star systems" keepOut={keepOut} />
			<GameChrome ref={chromeRef}>
				<h2 className="mt-1 text-[11px] tracking-[0.22em] text-amber-300 uppercase">Galaxy</h2>
			</GameChrome>
			<div
				ref={navRef}
				className="pointer-events-none absolute top-0 right-0 z-10 flex flex-col items-end gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6"
			>
				<button
					type="button"
					onClick={onHome}
					title="Your ship's orbit"
					className="pointer-events-auto touch-manipulation rounded-2xl border border-[#E8E4D9]/20 bg-black/60 px-4 py-2.5 text-[11px] tracking-[0.22em] text-[#E8E4D9]/80 uppercase backdrop-blur transition-colors hover:bg-white/10 hover:text-[#E8E4D9] focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
				>
					Home
				</button>
			</div>
			{card ? <SystemModal card={card} onClose={() => setOpenId(null)} onEnter={onEnterSol} /> : null}
		</>
	);
}

/**
 * The card for one system, over the galaxy. The frame takes a portrait when the card has one. Entering
 * is only offered for a charted system.
 */
function SystemModal({ card, onClose, onEnter }: { card: SystemCard; onClose: () => void; onEnter: () => void }) {
	const titleId = useId();
	const closeRef = useRef<HTMLButtonElement>(null);
	const enterRef = useRef<HTMLButtonElement>(null);
	const action = systemCardAction(card);

	useEffect(() => {
		(action.enabled ? enterRef : closeRef).current?.focus();
	}, [card.id, action.enabled]);

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
			<div className="absolute inset-0 bg-black/75" onClick={onClose} />
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				className="relative w-full max-w-md rounded-2xl border border-[#E8E4D9]/20 bg-black/80 p-4 shadow-2xl backdrop-blur sm:p-5"
			>
				<div className="relative aspect-video overflow-hidden rounded-xl border border-white/10 bg-[#07080f]">
					{card.image ? (
						<img src={card.image} alt="" className="h-full w-full object-cover" />
					) : (
						<SurveyPlate charted={card.charted} star={card.star} />
					)}
				</div>
				<div className="mt-4 flex items-start justify-between gap-3">
					<div>
						<p className="text-[11px] tracking-[0.22em] text-amber-300 uppercase">
							{card.charted ? "Charted" : "Uncharted"}
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
				<button
					ref={enterRef}
					type="button"
					onClick={onEnter}
					disabled={!action.enabled}
					className="touch-manipulation mt-5 w-full rounded-xl bg-amber-300 px-4 py-2.5 text-[11px] tracking-[0.22em] text-black uppercase transition-colors hover:bg-amber-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/45 disabled:hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
				>
					{action.label}
				</button>
			</div>
		</div>
	);
}

/** Stand-in portrait until a system has its own image. Charted Sol shows its orbits; the rest show a star. */
function SurveyPlate({ charted, star }: { charted: boolean; star?: StarClass }) {
	const color = charted ? "#FDE68A" : star ? STAR_COLOR[star] : "#E8E4D9";
	return (
		<svg viewBox="0 0 320 180" className="h-full w-full" aria-hidden>
			<rect width="320" height="180" fill="#07080f" />
			{charted ? (
				<>
					<ellipse cx="160" cy="96" rx="118" ry="28" fill="none" stroke="#E8E4D9" strokeOpacity="0.18" />
					<ellipse cx="160" cy="96" rx="86" ry="20" fill="none" stroke="#E8E4D9" strokeOpacity="0.28" />
					<ellipse cx="160" cy="96" rx="52" ry="12" fill="none" stroke={color} strokeOpacity="0.45" />
					<circle cx="228" cy="84" r="2.2" fill="#E8E4D9" fillOpacity="0.7" />
					<circle cx="92" cy="108" r="1.6" fill="#E8E4D9" fillOpacity="0.5" />
				</>
			) : (
				<circle cx="160" cy="90" r="36" fill="none" stroke={color} strokeOpacity="0.2" strokeDasharray="3 6" />
			)}
			<circle cx="160" cy={charted ? 96 : 90} r="16" fill={color} fillOpacity="0.18" />
			<circle cx="160" cy={charted ? 96 : 90} r="5" fill={color} />
		</svg>
	);
}

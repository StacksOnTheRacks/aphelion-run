"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Rajdhani } from "next/font/google";

import { placeLabels, type LabelSource, type Rect } from "./demo/labels";
import { ResourceMark } from "./hud";
import { elementColor, type ElementId } from "./palette";

const rajdhani = Rajdhani({ subsets: ["latin"], weight: ["700"] });

export type LabelItem = {
	id: string;
	label: string;
	/** Selectable names are buttons. The rest are plain text. */
	onSelect?: () => void;
	/** The button's accessible name, when the visible name alone does not say what it does. */
	action?: string;
	/** Read after the name by screen readers. */
	note?: string;
	/** The body this chart is on. Its plate is bright and carries the status mark. */
	current?: boolean;
	/** What a ship can take here, by lowercase resource name. Each shows its mark after the name. */
	resources?: readonly string[];
};

const RING_STROKE = { idle: "rgba(233, 169, 42, 0.7)", muted: "rgba(168, 144, 96, 0.42)", active: "rgba(255, 215, 61, 0.95)" };

/** Hover, focus, and the current body share the brighter plate. */
const BRIGHT =
	"[--label-0:#6E4C14] [--label-1:#33240C] [--label-2:#120D05] [--label-0a:1] [--label-1a:0.98] [--label-2a:0.97] [--label-rule-0:1] [--label-rule-1:0.5] [--label-edge:1]";
const POINTED =
	"group-data-[active=true]:[--label-0:#6E4C14] group-data-[active=true]:[--label-1:#33240C] group-data-[active=true]:[--label-2:#120D05] group-data-[active=true]:[--label-0a:1] group-data-[active=true]:[--label-1a:0.98] group-data-[active=true]:[--label-2a:0.97] group-data-[active=true]:[--label-rule-0:1] group-data-[active=true]:[--label-rule-1:0.5] group-data-[active=true]:[--label-edge:1]";
const QUIET =
	"[--label-0:#1F1A0D] [--label-0a:0.75] [--label-1:#120F09] [--label-1a:0.7] [--label-2:#080808] [--label-2a:0.64] [--label-rule-0:0.22] [--label-rule-1:0.22] [--label-edge:0] [--label-sheen:0]";

const PLATE =
	"relative isolate flex h-[26px] items-center gap-1.5 px-3 text-[13px] font-bold leading-none tracking-[0.16em] whitespace-nowrap uppercase";

const GOLD_TEXT = "bg-gradient-to-b from-[#FFF3C4] via-[#FFD73D] to-[#E8B23A] bg-clip-text text-transparent";

/** The ring around a body: four arcs with gaps at the compass points. */
function reticle(radius: number): { dash: string; offset: string } {
	const around = 2 * Math.PI * radius;
	const gap = Math.min(6, around / 12);
	return { dash: `${(around / 4 - gap).toFixed(2)} ${gap.toFixed(2)}`, offset: (-gap / 2).toFixed(2) };
}

/**
 * The names over a scene: a reticle around every body in view, a leader line, and a chamfered plate.
 * Selectable names are buttons, so a tap or a keyboard reaches what a pointer can. A name under the
 * pointer, or holding focus, brightens. The body the chart is on stays bright and carries the mark.
 * The scene reports where its bodies are after every frame, and the names are laid out and written
 * straight to the DOM then. `keepOut` is chrome over the scene, which names stay clear of.
 */
export function SpaceLabels({
	source,
	items,
	title,
	keepOut,
}: {
	source: LabelSource;
	items: LabelItem[];
	title: string;
	keepOut?: RefObject<HTMLElement | null> | readonly RefObject<HTMLElement | null>[];
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const nameRefs = useRef(new Map<string, HTMLLIElement>());
	const markRefs = useRef(new Map<string, SVGGElement>());
	/** The name under the pointer or holding focus, lit the same as a body under the pointer. */
	const pointedRef = useRef<string | null>(null);

	useEffect(() => {
		const sizes = new Map<string, { width: number; height: number }>();
		const previous = new Map<string, number>();
		const selectable = new Set(items.filter((item) => item.onSelect).map((item) => item.id));
		const current = new Set(items.filter((item) => item.current).map((item) => item.id));
		const lit = new Map<string, "active" | "idle" | "muted">();

		return source.onLabels((frame) => {
			const root = rootRef.current;
			if (!root) {
				return;
			}
			const showing = frame.opacity > 0.01;
			root.style.opacity = String(frame.opacity);
			root.inert = !showing;
			if (!showing) {
				return;
			}

			const origin = root.getBoundingClientRect();
			const zones: Rect[] = [];
			const regions = !keepOut ? [] : Array.isArray(keepOut) ? keepOut : [keepOut];
			for (const region of regions) {
				const chrome = region.current?.getBoundingClientRect();
				if (chrome && chrome.width > 0 && chrome.height > 0) {
					zones.push({
						left: chrome.left - origin.left,
						top: chrome.top - origin.top,
						right: chrome.right - origin.left,
						bottom: chrome.bottom - origin.top,
					});
				}
			}
			const anchors = frame.anchors.filter((anchor) => nameRefs.current.has(anchor.id));
			for (const anchor of anchors) {
				const name = nameRefs.current.get(anchor.id);
				if (name && !sizes.has(anchor.id)) {
					sizes.set(anchor.id, { width: name.offsetWidth, height: name.offsetHeight });
				}
			}

			const placements = placeLabels(anchors, sizes, { width: origin.width, height: origin.height }, zones, previous);
			previous.clear();
			const placed = new Set<string>();
			for (const spot of placements) {
				previous.set(spot.id, spot.choice);
				placed.add(spot.id);
				const name = nameRefs.current.get(spot.id);
				const mark = markRefs.current.get(spot.id);
				if (!name || !mark) {
					continue;
				}
				name.style.transform = `translate(${spot.box.left}px, ${spot.box.top}px)`;
				name.style.visibility = "visible";
				const [ring, leader] = mark.children;
				ring.setAttribute("cx", String(spot.x));
				ring.setAttribute("cy", String(spot.y));
				ring.setAttribute("r", String(spot.ring));
				const arcs = reticle(spot.ring);
				ring.setAttribute("stroke-dasharray", arcs.dash);
				ring.setAttribute("stroke-dashoffset", arcs.offset);
				leader.setAttribute("x1", String(spot.from.x));
				leader.setAttribute("y1", String(spot.from.y));
				leader.setAttribute("x2", String(spot.to.x));
				leader.setAttribute("y2", String(spot.to.y));
				mark.style.visibility = "visible";

				const on = spot.id === frame.hovered || spot.id === pointedRef.current;
				const tone = on || current.has(spot.id) ? "active" : selectable.has(spot.id) ? "idle" : "muted";
				if (lit.get(spot.id) !== tone) {
					lit.set(spot.id, tone);
					name.dataset.active = String(on);
					mark.setAttribute("stroke", RING_STROKE[tone]);
				}
			}
			for (const [id, name] of nameRefs.current) {
				if (!placed.has(id)) {
					name.style.visibility = "hidden";
					const mark = markRefs.current.get(id);
					if (mark) {
						mark.style.visibility = "hidden";
					}
				}
			}
		});
	}, [source, items, keepOut]);

	const point = (id: string | null) => {
		pointedRef.current = id;
	};

	return (
		<div ref={rootRef} style={{ opacity: 0 }} className="pointer-events-none absolute inset-0 overflow-hidden">
			<svg aria-hidden className="absolute inset-0 h-full w-full" fill="none" strokeWidth={1}>
				{items.map((item) => (
					<g
						key={item.id}
						ref={(element) => {
							if (element) {
								markRefs.current.set(item.id, element);
							} else {
								markRefs.current.delete(item.id);
							}
						}}
						stroke={item.onSelect ? RING_STROKE.idle : RING_STROKE.muted}
						style={{ visibility: "hidden" }}
					>
						<circle />
						<line />
					</g>
				))}
			</svg>
			<ul aria-label={title} className={rajdhani.className}>
				{items.map((item) => (
					<li
						key={item.id}
						ref={(element) => {
							if (element) {
								nameRefs.current.set(item.id, element);
							} else {
								nameRefs.current.delete(item.id);
							}
						}}
						style={{ visibility: "hidden" }}
						className="group absolute top-0 left-0"
						data-current={item.current ? "true" : undefined}
					>
						{item.onSelect ? (
							<button
								type="button"
								onClick={item.onSelect}
								aria-label={item.action}
								onPointerEnter={() => point(item.id)}
								onPointerLeave={() => point(null)}
								onFocus={() => point(item.id)}
								onBlur={() => point(null)}
								className={`${PLATE} pointer-events-auto touch-manipulation focus-visible:ring-1 focus-visible:ring-[#FFD73D]/80 focus-visible:outline-none ${item.current ? BRIGHT : ""} ${POINTED}`}
							>
								<LabelPlate />
								{item.current ? (
									<span aria-hidden className="size-[5px] shrink-0 rotate-45 bg-gradient-to-br from-[#FFD73D] to-[#A67C20] shadow-[0_0_6px_rgba(196,138,46,0.8)]" />
								) : null}
								<span className={GOLD_TEXT}>{item.label}</span>
								<Yields resources={item.resources} />
							</button>
						) : (
							<span className={`${PLATE} text-[#A89060] ${QUIET}`}>
								<LabelPlate />
								{item.label}
								<Yields resources={item.resources} />
								{item.note ? <span className="sr-only">{item.note}</span> : null}
							</span>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}

/** The marks for what a ship can take here, each in a diamond socket ringed in its color, set off by a short gold rule. */
function Yields({ resources }: { resources?: readonly string[] }) {
	const shown = (resources ?? []).filter((id): id is ElementId => id in elementColor);
	if (shown.length === 0) {
		return null;
	}
	return (
		<>
			<span aria-hidden className="h-3 w-px shrink-0 bg-gradient-to-b from-transparent via-[#FFD73D]/45 to-transparent" />
			<span aria-hidden className="flex items-center gap-[3px]">
				{shown.map((id) => (
					<span key={id} className="relative grid size-4 shrink-0 place-items-center">
						<span className="absolute inset-[2.5px] rotate-45 border bg-[#1A160C]" style={{ borderColor: `${elementColor[id]}66` }} />
						<ResourceMark id={id} className="relative size-2.5" />
					</span>
				))}
			</span>
			<span className="sr-only">, yields {shown.join(", ")}</span>
		</>
	);
}

/**
 * The plate behind a name, drawn like the chart step: cut upper left and lower right, a gold rule, and a
 * lit edge along the left and the foot. Tone comes from CSS variables on the name.
 */
function LabelPlate() {
	const ref = useRef<SVGSVGElement>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const gradientId = `label-${useId().replace(/:/g, "")}`;

	useLayoutEffect(() => {
		const svg = ref.current;
		if (!svg) {
			return;
		}
		const measure = () => {
			const next = { w: svg.clientWidth, h: svg.clientHeight };
			setSize((prev) => (prev.w === next.w && prev.h === next.h ? prev : next));
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(svg);
		return () => observer.disconnect();
	}, []);

	const { w, h } = size;
	const cut = Math.min(6, Math.max(0, Math.min(w, h) / 2 - 1));
	const shape = `M${cut} 0H${w}V${h - cut}L${w - cut} ${h}H0V${cut}Z`;

	return (
		<svg ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible">
			{w > 0 && h > 0 ? (
				<>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
							<stop offset="0" style={{ stopColor: "var(--label-0, #2E2612)", stopOpacity: "var(--label-0a, 0.97)" }} />
							<stop offset="0.5" style={{ stopColor: "var(--label-1, #15120A)", stopOpacity: "var(--label-1a, 0.97)" }} />
							<stop offset="1" style={{ stopColor: "var(--label-2, #08090B)", stopOpacity: "var(--label-2a, 0.97)" }} />
						</linearGradient>
						<linearGradient id={`${gradientId}-sheen`} x1="0" y1="0" x2={w} y2="0" gradientUnits="userSpaceOnUse">
							<stop offset="0" stopColor="#E8B23A" stopOpacity="0.12" />
							<stop offset="0.175" stopColor="#E8B23A" stopOpacity="0.16" />
							<stop offset="0.835" stopColor="#E8B23A" stopOpacity="0" />
						</linearGradient>
						<linearGradient id={`${gradientId}-rule`} x1="0" y1="0" x2={w} y2="0" gradientUnits="userSpaceOnUse">
							<stop offset="0" style={{ stopColor: "#FFD73D", stopOpacity: "var(--label-rule-0, 0.6)" }} />
							<stop offset="1" style={{ stopColor: "#FFD73D", stopOpacity: "var(--label-rule-1, 0.22)" }} />
						</linearGradient>
						<linearGradient id={`${gradientId}-edge`} x1="0" y1="0" x2={w - cut} y2="0" gradientUnits="userSpaceOnUse">
							<stop offset="0" stopColor="#FFF3C4" />
							<stop offset="0.5" stopColor="#FFD73D" />
							<stop offset="1" stopColor="#E8B23A" stopOpacity="0.2" />
						</linearGradient>
					</defs>
					<path d={shape} fill={`url(#${gradientId})`} />
					<path d={shape} fill={`url(#${gradientId}-sheen)`} style={{ opacity: "var(--label-sheen, 1)" }} />
					<path
						d={`M${cut - 0.3} 0.5H${w - 0.5}V${h - cut - 0.2}L${w - cut - 0.2} ${h - 0.5}H0.5V${cut - 0.3}Z`}
						fill="none"
						stroke={`url(#${gradientId}-rule)`}
					/>
					<path
						d={`M0.75 ${cut + 0.3}V${h - 0.75}H${w - cut - 0.3}`}
						fill="none"
						stroke={`url(#${gradientId}-edge)`}
						strokeWidth={1.5}
						style={{ opacity: "var(--label-edge, 0.7)" }}
					/>
				</>
			) : null}
		</svg>
	);
}

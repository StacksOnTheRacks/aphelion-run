"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Inter } from "next/font/google";

import { placeLabels, type LabelSource, type Rect } from "./demo/labels";
import { RESOURCE_ICON } from "./hud";

const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "700"] });

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
	"[--label-0:#6E4C14] [--label-1:#33240C] [--label-2:#120D05] [--label-0a:1] [--label-1a:0.98] [--label-2a:0.97] [--label-stroke:1] [--label-weight:1.25] [--label-accent:1]";
const POINTED =
	"group-data-[active=true]:[--label-0:#6E4C14] group-data-[active=true]:[--label-1:#33240C] group-data-[active=true]:[--label-2:#120D05] group-data-[active=true]:[--label-0a:1] group-data-[active=true]:[--label-1a:0.98] group-data-[active=true]:[--label-2a:0.97] group-data-[active=true]:[--label-stroke:1] group-data-[active=true]:[--label-weight:1.25] group-data-[active=true]:[--label-accent:1]";
const QUIET =
	"[--label-0:#1F1A0D] [--label-0a:0.75] [--label-1:#120F09] [--label-1a:0.7] [--label-2:#080808] [--label-2a:0.64] [--label-stroke:0.32] [--label-accent:0]";

const PLATE =
	"relative isolate flex items-center gap-1.5 py-2 pr-3 pl-3 text-[10px] font-bold leading-none tracking-[1.4px] whitespace-nowrap uppercase";

/**
 * The names over a scene: a ring around every body in view, a leader line, and a chamfered plate.
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
			<ul aria-label={title} className={inter.className}>
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
								className={`${PLATE} pointer-events-auto touch-manipulation text-[#FFD73D] focus-visible:ring-1 focus-visible:ring-[#FFD73D]/80 focus-visible:outline-none ${item.current ? BRIGHT : ""} ${POINTED}`}
							>
								<LabelPlate />
								{item.current ? (
									<span aria-hidden className="size-[5px] shrink-0 rotate-45 bg-gradient-to-br from-[#FFD73D] to-[#C8641E] shadow-[0_0_6px_rgba(232,140,40,0.8)]" />
								) : null}
								{item.label}
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

/** The marks for what a ship can take here, set off from the name by a short gold rule. */
function Yields({ resources }: { resources?: readonly string[] }) {
	const shown = (resources ?? []).filter((id) => RESOURCE_ICON[id]);
	if (shown.length === 0) {
		return null;
	}
	return (
		<>
			<span aria-hidden className="ml-0.5 h-2.5 w-px shrink-0 bg-gradient-to-b from-transparent via-[#FFD73D]/45 to-transparent" />
			<span aria-hidden className="flex items-center gap-1">
				{shown.map((id) => (
					<img key={id} src={RESOURCE_ICON[id]} alt="" width={10} height={10} className="size-2.5 shrink-0 drop-shadow-[0_0_2px_rgba(233,169,42,0.6)]" />
				))}
			</span>
			<span className="sr-only">, yields {shown.join(", ")}</span>
		</>
	);
}

/** The tag behind a name: opposing 6px cuts and a lit spine on the left. Tone comes from CSS variables on the name. */
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

	const cut = Math.min(6, Math.max(0, Math.min(size.w, size.h) / 2 - 1));
	const w = size.w - 0.5;
	const h = size.h - 0.5;
	const path = size.w > 0 && size.h > 0 ? `M${0.5 + cut} 0.5H${w}V${h - cut}L${w - cut} ${h}H0.5V${0.5 + cut}Z` : "";

	return (
		<svg ref={ref} aria-hidden className="pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible">
			{path ? (
				<>
					<path
						d={path}
						style={{
							fill: `url(#${gradientId})`,
							stroke: "#FFD73D",
							strokeOpacity: "var(--label-stroke, 0.48)",
							strokeWidth: "var(--label-weight, 1)",
						}}
					/>
					<path
						d={`M2.5 ${cut + 2.5}V${size.h - 2.5}`}
						style={{ stroke: `url(#${gradientId}-spine)`, strokeWidth: 1.5, opacity: "var(--label-accent, 0.55)" }}
					/>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2={size.h} gradientUnits="userSpaceOnUse">
							<stop offset="0" style={{ stopColor: "var(--label-0, #292413)", stopOpacity: "var(--label-0a, 0.98)" }} />
							<stop offset="0.4" style={{ stopColor: "var(--label-1, #16140B)", stopOpacity: "var(--label-1a, 0.97)" }} />
							<stop offset="1" style={{ stopColor: "var(--label-2, #07080A)", stopOpacity: "var(--label-2a, 0.96)" }} />
						</linearGradient>
						<linearGradient id={`${gradientId}-spine`} x1="0" y1="0" x2="0" y2={size.h} gradientUnits="userSpaceOnUse">
							<stop offset="0" stopColor="#FFD73D" />
							<stop offset="1" stopColor="#C8641E" />
						</linearGradient>
					</defs>
				</>
			) : null}
		</svg>
	);
}

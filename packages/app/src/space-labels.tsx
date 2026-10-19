"use client";

import { useEffect, useRef, type RefObject } from "react";

import { placeLabels, type LabelSource, type Rect } from "./demo/labels";

export type LabelItem = {
	id: string;
	label: string;
	/** Selectable names are buttons. The rest are plain text. */
	onSelect?: () => void;
	/** The button's accessible name, when the visible name alone does not say what it does. */
	action?: string;
	/** Read after the name by screen readers. */
	note?: string;
};

const RING_STROKE = { idle: "rgba(232, 228, 217, 0.5)", muted: "rgba(232, 228, 217, 0.28)", active: "rgba(252, 211, 77, 0.95)" };

/**
 * The names over a scene: a ring around every body in view, a leader line, and its name. Selectable
 * names are buttons, so a tap or a keyboard reaches what a pointer can. The scene reports where its
 * bodies are after every frame, and the names are laid out and written straight to the DOM then.
 * `keepOut` is chrome over the scene, which names stay clear of. Several regions can be passed.
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
		const lit = new Map<string, boolean>();

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
				if (lit.get(spot.id) !== on) {
					lit.set(spot.id, on);
					name.dataset.active = String(on);
					mark.setAttribute(
						"stroke",
						on ? RING_STROKE.active : selectable.has(spot.id) ? RING_STROKE.idle : RING_STROKE.muted
					);
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
			<ul aria-label={title}>
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
						className="group absolute top-0 left-0 text-[10px] leading-none tracking-[0.2em] whitespace-nowrap uppercase [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] sm:text-[11px]"
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
								className="pointer-events-auto touch-manipulation block rounded-md px-1 py-1 font-medium tracking-[0.2em] text-[#E8E4D9] uppercase transition-colors group-data-[active=true]:text-amber-300 focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none"
							>
								{item.label}
							</button>
						) : (
							<span className="block px-1 py-1 text-[#E8E4D9]/55">
								{item.label}
								{item.note ? <span className="sr-only">{item.note}</span> : null}
							</span>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}

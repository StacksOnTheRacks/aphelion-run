"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * The HUD's plates, drawn to the Figma "HUD v2" vectors. Each plate measures its box and draws at
 * that size, so a plate can grow with its label while the cuts, rules, and ticks keep their size.
 */

const gold = (alpha: number) => `rgba(255, 215, 61, ${alpha})`;

function MeasuredSvg({ className = "", style, draw }: { className?: string; style?: CSSProperties; draw: (w: number, h: number, id: string) => ReactNode }) {
	const ref = useRef<SVGSVGElement>(null);
	const [size, setSize] = useState({ w: 0, h: 0 });
	const id = `plate-${useId().replace(/:/g, "")}`;

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

	return (
		<svg ref={ref} aria-hidden style={style} className={`pointer-events-none absolute inset-0 -z-10 h-full w-full overflow-visible ${className}`}>
			{size.w > 0 && size.h > 0 ? draw(size.w, size.h, id) : null}
		</svg>
	);
}

/** The dark gold fill every plate shares, top to bottom. */
function PlateFill({ id, h, stops }: { id: string; h: number; stops: [string, number, number][] }) {
	return (
		<linearGradient id={id} x1="0" y1="0" x2="0" y2={h} gradientUnits="userSpaceOnUse">
			{stops.map(([color, alpha, offset]) => (
				<stop key={offset} offset={offset} stopColor={color} stopOpacity={alpha} />
			))}
		</linearGradient>
	);
}

/** A horizontal ramp of gold alphas across [x1, x2]. */
function GoldRamp({ id, x1, x2, stops, color = "#FFD73D" }: { id: string; x1: number; x2: number; stops: [number, number][]; color?: string }) {
	return (
		<linearGradient id={id} x1={x1} y1="0" x2={x2} y2="0" gradientUnits="userSpaceOnUse">
			{stops.map(([offset, alpha]) => (
				<stop key={offset} offset={offset} stopColor={color} stopOpacity={alpha} />
			))}
		</linearGradient>
	);
}

/** The full-width bar on the top edge: a ruler of ticks along its foot and a gold rule under it. */
export function CommandBarPlate() {
	return (
		<MeasuredSvg
			draw={(w, h, id) => {
				const ticks = [];
				for (let x = 0; x < w; x += 8) {
					ticks.push(<rect key={x} x={x} y={h - 3} width={1} height={2} fill={gold(0.08)} />);
				}
				return (
					<>
						<defs>
							<PlateFill id={`${id}-fill`} h={h} stops={[["#221C0E", 0.96, 0], ["#0A0A0B", 0.94, 1]]} />
							<GoldRamp id={`${id}-rule`} x1={0} x2={w} stops={[[0, 0.55], [0.3, 0.25], [0.5, 0.6], [0.7, 0.25], [1, 0.45]]} />
						</defs>
						<rect x={-1} y={-1} width={w + 2} height={h + 1} fill={`url(#${id}-fill)`} />
						<path d={`M0 0.5H${w}`} stroke="#FFF3C4" strokeOpacity={0.06} />
						{ticks}
						<path d={`M0 ${h - 0.5}H${w}`} stroke={`url(#${id}-rule)`} />
					</>
				);
			}}
		/>
	);
}

/**
 * The active ship's plate on the bottom edge. Closed on a desktop, the upper right corner is cut and
 * machined, and a scale runs along the top. Open, the plate is square so the fleet list joins it.
 */
export function ShipPlate({ open, desktop }: { open: boolean; desktop: boolean }) {
	return (
		<MeasuredSvg
			draw={(w, h, id) => {
				const fill = `url(#${id}-fill)`;
				const defs = (
					<defs>
						<PlateFill id={`${id}-fill`} h={h} stops={[["#2A2210", 0.97, 0], ["#14110A", 0.97, 0.5], ["#08090B", 0.97, 1]]} />
						<GoldRamp id={`${id}-rule`} x1={0} x2={w} stops={[[0, 0.15], [0.7, 0.55], [1, 0.8]]} />
						<linearGradient id={`${id}-edge`} x1={w - 170} y1="0" x2={w} y2="0" gradientUnits="userSpaceOnUse">
							<stop offset="0" stopColor="#E8B23A" stopOpacity="0" />
							<stop offset="0.75" stopColor="#FFD73D" />
							<stop offset="1" stopColor="#FFF3C4" />
						</linearGradient>
					</defs>
				);
				if (!desktop) {
					return (
						<>
							{defs}
							<rect x={-1} y={0} width={w + 2} height={h + 1} fill={fill} />
							{open ? null : <path d={`M0 0.5H${w}`} stroke={gold(0.45)} />}
						</>
					);
				}
				if (open) {
					return (
						<>
							{defs}
							<path d={`M-1 0H${w}V${h + 1}H-1Z`} fill={fill} />
							<path d={`M${w - 0.5} 0V${h}`} stroke={gold(0.55)} />
						</>
					);
				}
				const cut = 14;
				const ticks = Array.from({ length: 24 }, (_, index) => {
					const major = index % 4 === 0;
					return <rect key={index} x={12 + index * 6} y={0} width={1} height={major ? 4 : 2} fill={gold(major ? 0.45 : 0.22)} />;
				});
				return (
					<>
						{defs}
						<path d={`M-1 0H${w - cut}L${w} ${cut}V${h + 1}H-1Z`} fill={fill} />
						<path d={`M0 0.5H${w - cut}L${w - 0.5} ${cut}V${h}`} fill="none" stroke={`url(#${id}-rule)`} />
						<path d={`M0 3.5H${w - cut - 1.5}L${w - 3.5} ${cut + 1.5}V${h}`} fill="none" stroke={gold(0.1)} />
						{ticks}
						<path d={`M${w - 170} 0.75H${w - cut}L${w - 0.75} ${cut}V${h - 22}`} fill="none" stroke={`url(#${id}-edge)`} strokeWidth={1.5} />
					</>
				);
			}}
		/>
	);
}

/** The fleet list above the ship plate. A seam rule where it joins; the upper right is cut and machined on a desktop. */
export function FleetPlate({ desktop }: { desktop: boolean }) {
	return (
		<MeasuredSvg
			style={{ filter: "drop-shadow(0 10px 24px rgba(0, 0, 0, 0.67))" }}
			draw={(w, h, id) => {
				const fill = `url(#${id}-fill)`;
				const cut = 18;
				return (
					<>
						<defs>
							<PlateFill id={`${id}-fill`} h={h} stops={[["#0D0B07", 0.97, 0], ["#07080A", 0.97, 1]]} />
							<GoldRamp id={`${id}-rule`} x1={0} x2={w} stops={[[0, 0.15], [1, 0.6]]} />
							<linearGradient id={`${id}-edge`} x1={w - 220} y1="0" x2={w} y2="0" gradientUnits="userSpaceOnUse">
								<stop offset="0" stopColor="#E8B23A" stopOpacity="0" />
								<stop offset="1" stopColor="#FFD73D" />
							</linearGradient>
						</defs>
						{desktop ? (
							<>
								<path d={`M-1 0H${w - cut}L${w} ${cut}V${h}H-1Z`} fill={fill} />
								<path d={`M0 0.5H${w - cut}L${w - 0.5} ${cut}V${h}`} fill="none" stroke={`url(#${id}-rule)`} />
								<path d={`M${w - 220} 0.75H${w - cut}L${w - 0.75} ${cut}`} fill="none" stroke={`url(#${id}-edge)`} strokeWidth={1.5} />
							</>
						) : (
							<>
								<rect x={-1} y={0} width={w + 2} height={h} fill={fill} />
								<path d={`M0 0.5H${w}`} stroke={gold(0.45)} />
							</>
						)}
						<path d={`M12 ${h - 0.5}H${w - 12}`} stroke={gold(0.22)} />
					</>
				);
			}}
		/>
	);
}

/** Space each side of the crest's plate for its wings, in CSS pixels. */
export const CREST_WING = { desktop: 70, phone: 40 } as const;

/**
 * The place crest. A trapezoid plate hangs from the bar with a beveled foot, an inner rule, and a lit
 * line under its center. On a desktop, wings run out along the bar: a long rule fading outward and a
 * short rule with a diamond above it. The phone keeps the plate and a short rule each side at the top.
 */
export function CrestPlate({ desktop }: { desktop: boolean }) {
	return (
		<MeasuredSvg
			draw={(w, h, id) => {
				const p = desktop ? CREST_WING.desktop : CREST_WING.phone;
				const pw = w - p * 2;
				const side = desktop ? 14 : 12;
				const foot = desktop ? 26 : 22;
				const knee = h - (desktop ? 10 : 8);
				const shape = `M${p} 0H${p + pw}L${p + pw - side} ${knee}L${p + pw - foot} ${h}H${p + foot}L${p + side} ${knee}Z`;
				const glowInset = desktop ? 40 : 30;
				return (
					<>
						<defs>
							<PlateFill id={`${id}-fill`} h={h} stops={[["#2E2612", 0.98, 0], ["#16120A", 0.97, 0.55], ["#09090B", 0.97, 1]]} />
							<GoldRamp id={`${id}-sheen`} x1={p} x2={p + pw} color="#E8B23A" stops={[[0.036, 0], [0.5, 0.18], [0.964, 0]]} />
							<GoldRamp id={`${id}-rule`} x1={p} x2={p + pw} stops={[[0, 0.25], [0.5, 0.7], [1, 0.25]]} />
							<linearGradient id={`${id}-glow`} x1={p + glowInset} y1="0" x2={p + pw - glowInset} y2="0" gradientUnits="userSpaceOnUse">
								<stop offset="0" stopColor="#E8B23A" stopOpacity="0" />
								<stop offset="0.5" stopColor="#FFF3C4" />
								<stop offset="1" stopColor="#E8B23A" stopOpacity="0" />
							</linearGradient>
							<GoldRamp id={`${id}-wing-l`} x1={0} x2={desktop ? 80 : 38} stops={[[0, 0], [1, 0.85]]} />
							<GoldRamp id={`${id}-wing-r`} x1={w - (desktop ? 80 : 38)} x2={w} stops={[[0, 0.85], [1, 0]]} />
						</defs>
						<path d={shape} fill={`url(#${id}-fill)`} />
						<path d={shape} fill={`url(#${id}-sheen)`} />
						<path
							d={`M${p} 0.5L${p + side} ${knee - 0.5}L${p + foot} ${h - 1}H${p + pw - foot}L${p + pw - side} ${knee - 0.5}L${p + pw} 0.5`}
							fill="none"
							stroke={`url(#${id}-rule)`}
						/>
						{desktop ? (
							<>
								<path
									d={`M${p + 8} 1.5L${p + 19} ${h - 12}L${p + 29} ${h - 3.5}H${p + pw - 29}L${p + pw - 19} ${h - 12}L${p + pw - 8} 1.5`}
									fill="none"
									stroke={gold(0.1)}
								/>
								<path d="M0 26.5H80" stroke={`url(#${id}-wing-l)`} />
								<path d={`M${w - 80} 26.5H${w}`} stroke={`url(#${id}-wing-r)`} />
								<path d="M50 23H76" stroke={gold(0.5)} />
								<path d={`M${w - 76} 23H${w - 50}`} stroke={gold(0.5)} />
								<rect x={46.15} y={21.15} width={3.7} height={3.7} fill={gold(0.7)} transform="rotate(45 48 23)" />
								<rect x={w - 49.85} y={21.15} width={3.7} height={3.7} fill={gold(0.7)} transform={`rotate(45 ${w - 48} 23)`} />
							</>
						) : (
							<>
								<path d="M0 1H38" stroke={`url(#${id}-wing-l)`} />
								<path d={`M${w - 38} 1H${w}`} stroke={`url(#${id}-wing-r)`} />
							</>
						)}
						<path d={`M${p + glowInset} ${h - 0.75}H${p + pw - glowInset}`} stroke={`url(#${id}-glow)`} strokeWidth={1.5} />
					</>
				);
			}}
		/>
	);
}

/** The chart step in the lower right: cut upper left and lower right, lit along the left and the foot. */
export function StepPlate() {
	return (
		<MeasuredSvg
			style={{ filter: "drop-shadow(0 6px 18px rgba(0, 0, 0, 0.6))" }}
			draw={(w, h, id) => {
				const cut = Math.round((h / 64) * 16);
				const inner = cut - 2;
				return (
					<>
						<defs>
							<PlateFill id={`${id}-fill`} h={h} stops={[["#2E2612", 0.97, 0], ["#15120A", 0.97, 0.5], ["#08090B", 0.97, 1]]} />
							<GoldRamp id={`${id}-sheen`} x1={0} x2={w} color="#E8B23A" stops={[[0, 0.12], [0.175, 0.16], [0.835, 0]]} />
							<GoldRamp id={`${id}-rule`} x1={0} x2={w} stops={[[0, 0.6], [1, 0.22]]} />
							<linearGradient id={`${id}-edge`} x1="0" y1="0" x2={w - cut} y2="0" gradientUnits="userSpaceOnUse">
								<stop offset="0" stopColor="#FFF3C4" />
								<stop offset="0.5" stopColor="#FFD73D" />
								<stop offset="1" stopColor="#E8B23A" stopOpacity="0.2" />
							</linearGradient>
						</defs>
						<path d={`M${cut} 0H${w}V${h - cut}L${w - cut} ${h}H0V${cut}Z`} fill={`url(#${id}-fill)`} />
						<path d={`M${cut} 0H${w}V${h - cut}L${w - cut} ${h}H0V${cut}Z`} fill={`url(#${id}-sheen)`} />
						<path
							d={`M${cut - 0.3} 0.5H${w - 0.5}V${h - cut - 0.2}L${w - cut - 0.2} ${h - 0.5}H0.5V${cut - 0.3}Z`}
							fill="none"
							stroke={`url(#${id}-rule)`}
						/>
						<path
							d={`M${3.5 + inner} 3.5H${w - 3.5}V${h - 3.5 - inner}L${w - 3.5 - inner} ${h - 3.5}H3.5V${3.5 + inner}Z`}
							fill="none"
							stroke={gold(0.08)}
						/>
						<path d={`M0.75 ${cut + 0.3}V${h - 0.75}H${w - cut - 0.3}`} fill="none" stroke={`url(#${id}-edge)`} strokeWidth={1.5} />
					</>
				);
			}}
		/>
	);
}

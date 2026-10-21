"use client";

import type { ZoomDirection } from "./demo/zoom";

const buttonClass =
	"pointer-events-auto touch-manipulation flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E8E4D9]/20 bg-black/60 text-[#E8E4D9]/80 backdrop-blur transition-colors hover:bg-white/10 hover:text-[#E8E4D9] focus-visible:ring-1 focus-visible:ring-amber-300/70 focus-visible:outline-none";

/** Zoom in above zoom out. Each press is one notch of the chart wheel. The parent places these in the upper right. */
export function ZoomControls({ onZoom }: { onZoom: (direction: ZoomDirection) => void }) {
	return (
		<>
			<button type="button" onClick={() => onZoom("in")} aria-label="Zoom in" title="Zoom in" className={buttonClass}>
				<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
					<path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
				</svg>
			</button>
			<button type="button" onClick={() => onZoom("out")} aria-label="Zoom out" title="Zoom out" className={buttonClass}>
				<svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
					<path d="M3.5 8h9" strokeLinecap="round" />
				</svg>
			</button>
		</>
	);
}

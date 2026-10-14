import { forwardRef, type ReactNode } from "react";

/** The title and whatever the place in view puts under it, over the top left of the scene. */
export const GameChrome = forwardRef<HTMLDivElement, { children?: ReactNode }>(function GameChrome({ children }, ref) {
	return (
		<div ref={ref} className="pointer-events-none absolute top-0 left-0 max-w-full p-4 sm:max-w-xl sm:p-6">
			<h1 className="text-sm font-medium tracking-[0.32em] text-[#E8E4D9] uppercase">Aphelion Run</h1>
			{children}
		</div>
	);
});

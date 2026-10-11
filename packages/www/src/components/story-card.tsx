import Link from "next/link";

export function StoryCard() {
	return (
		<aside className="pointer-events-auto absolute right-0 bottom-0 left-0 z-10 max-h-[46vh] overflow-y-auto border-t border-white/10 bg-black/70 p-6 backdrop-blur sm:right-auto sm:max-w-md sm:border-t-0 sm:bg-transparent sm:p-6 sm:backdrop-blur-none">
			<div className="rounded-2xl border border-white/10 bg-black/70 p-5 backdrop-blur">
				<p className="text-xs tracking-[0.22em] text-white/50 uppercase">700 years on</p>
				<p className="mt-3 text-sm leading-relaxed text-white/85">
					Pilots cross a living solar system to contest the Sun&apos;s harvesting satellites. Sol Systems sells the
					energy to the domes. The Ashland Marauders steal it for the slums.
				</p>
				<ul className="mt-4 space-y-2 text-sm text-white/75">
					<li>Home, then the Sun, then the warehouse.</li>
					<li>The warehouse, then an Earth station, then the bank.</li>
					<li>Home, then a body that yields what the ship lacks, then home again.</li>
				</ul>
				<p className="mt-4 text-sm text-white/60">One contractor. One ship. One home.</p>
				<Link href="/rules" className="mt-4 inline-block text-sm text-amber-300 hover:text-amber-200">
					The rules
				</Link>
			</div>
		</aside>
	);
}

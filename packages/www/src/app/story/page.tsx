import Link from "next/link";

import { SiteNav } from "@/components/site-nav";
import { STORY } from "@/story-content";

export default function StoryPage() {
	return (
		<main className="min-h-screen bg-black text-white">
			<SiteNav current="story" />
			<header className="border-b border-white/10 px-6 pt-24 pb-12 sm:px-10">
				<p className="text-xs tracking-[0.22em] text-white/50 uppercase">The universe</p>
				<h1 className="mt-3 max-w-3xl text-4xl font-medium tracking-tight sm:text-5xl">The Aphelion Run Universe</h1>
				<p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
					Pilots cross a living solar system to contest a dwindling network of solar harvesting satellites. Sol Systems
					sells the energy to the domes. The Ashland Marauders steal it for the slums.
				</p>
			</header>

			{STORY.map((chapter) => (
				<section
					key={chapter.id}
					id={chapter.id}
					className="border-b border-white/10 px-6 py-12 sm:px-10"
					aria-labelledby={`${chapter.id}-title`}
				>
					<p className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">{chapter.kicker}</p>
					<h2 id={`${chapter.id}-title`} className="mt-3 max-w-2xl text-2xl font-medium tracking-tight sm:text-3xl">
						{chapter.title}
					</h2>
					<div className="mt-6 max-w-2xl space-y-4 text-base leading-relaxed text-white/80">
						{chapter.paragraphs.map((paragraph) => (
							<p key={paragraph}>{paragraph}</p>
						))}
					</div>
				</section>
			))}

			<section className="px-6 py-12 sm:px-10">
				<p className="max-w-2xl text-sm leading-relaxed text-white/60">
					The board is the solar system, moving. How a run is flown, bought, and fought is written with the rules.
				</p>
				<div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-sm">
					<Link href="/" className="text-amber-300 hover:text-amber-200">
						The solar system
					</Link>
					<Link href="/rules" className="text-amber-300 hover:text-amber-200">
						Rules / play mechanics
					</Link>
					<Link href="/style" className="text-amber-300 hover:text-amber-200">
						Style bible
					</Link>
					<Link href="/glossary" className="text-amber-300 hover:text-amber-200">
						Glossary
					</Link>
				</div>
			</section>
		</main>
	);
}

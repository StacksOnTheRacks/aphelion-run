import Link from "next/link";

import { SiteNav } from "@/components/site-nav";
import { NEVER, PALETTE, READ, STYLE, YIELDS } from "@/style-content";

export default function StylePage() {
	return (
		<main className="min-h-screen bg-black text-white">
			<SiteNav current="style" />
			<header className="border-b border-white/10 px-6 pt-24 pb-12 sm:px-10">
				<p className="text-xs tracking-[0.22em] text-white/50 uppercase">The look</p>
				<h1 className="mt-3 max-w-3xl text-4xl font-medium tracking-tight sm:text-5xl">Style bible</h1>
				<p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
					The look is austere, and a little far ahead of now. The solar system is already the scenery. What we draw sits
					in that field and has to stay readable.
				</p>
			</header>

			{STYLE.map((chapter) => (
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

			<section className="border-b border-white/10 px-6 py-12 sm:px-10" aria-labelledby="never">
				<h2 id="never" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					Leave these off
				</h2>
				<ul className="mt-8 max-w-2xl space-y-3">
					{NEVER.map((item) => (
						<li key={item} className="border-l border-white/20 pl-4 text-sm leading-relaxed text-white/75">
							{item}
						</li>
					))}
				</ul>
			</section>

			<section className="border-b border-white/10 px-6 py-12 sm:px-10" aria-labelledby="palette">
				<h2 id="palette" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					Palette
				</h2>
				<p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75">
					On the map, a mark has to be read from the outer orbit. Class silhouettes are not designed yet. The objects
					themselves stay quiet.
				</p>
				<ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{PALETTE.map((swatch) => (
						<li key={swatch.name} className="rounded-2xl border border-white/10 p-4">
							<div
								className="h-16 rounded-xl border border-white/10"
								style={{ background: swatch.hex }}
								aria-hidden
							/>
							<div className="mt-3 flex items-baseline justify-between gap-3">
								<p className="text-sm">{swatch.name}</p>
								<p className="font-mono text-xs text-white/40">{swatch.hex}</p>
							</div>
							<p className="mt-2 text-sm leading-relaxed text-white/60">{swatch.role}</p>
						</li>
					))}
				</ul>
			</section>

			<section className="border-b border-white/10 px-6 py-12 sm:px-10" aria-labelledby="yields">
				<h2 id="yields" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					Yields
				</h2>
				<p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75">
					Each yield has a look in the hand and in the hold.
				</p>
				<ul className="mt-8 grid gap-3 sm:grid-cols-2">
					{YIELDS.map((item) => (
						<li key={item.name} className="rounded-2xl border border-white/10 p-5">
							<p className="text-lg">{item.name}</p>
							<p className="mt-2 text-sm leading-relaxed text-white/70">{item.look}</p>
						</li>
					))}
				</ul>
			</section>

			<section className="px-6 py-12 sm:px-10" aria-labelledby="read">
				<h2 id="read" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					What the player must read
				</h2>
				<ol className="mt-8 grid gap-4 lg:grid-cols-2">
					{READ.map((item) => (
						<li key={item.must} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
							<p className="text-lg">{item.must}</p>
							<p className="mt-3 text-sm leading-relaxed text-white/75">{item.how}</p>
						</li>
					))}
				</ol>
				<div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm">
					<Link href="/" className="text-amber-300 hover:text-amber-200">
						The solar system
					</Link>
					<Link href="/story" className="text-amber-300 hover:text-amber-200">
						The story
					</Link>
					<Link href="/rules" className="text-amber-300 hover:text-amber-200">
						Rules / play mechanics
					</Link>
					<Link href="/glossary" className="text-amber-300 hover:text-amber-200">
						Glossary
					</Link>
				</div>
			</section>
		</main>
	);
}

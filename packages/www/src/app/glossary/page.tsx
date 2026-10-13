import Link from "next/link";

import { SiteNav } from "@/components/site-nav";
import { GLOSSARY } from "@/glossary-content";

export default function GlossaryPage() {
	return (
		<main className="min-h-screen bg-black text-white">
			<SiteNav current="glossary" />
			<header className="border-b border-white/10 px-6 pt-24 pb-12 sm:px-10">
				<p className="text-xs tracking-[0.22em] text-white/50 uppercase">The words</p>
				<h1 className="mt-3 max-w-3xl text-4xl font-medium tracking-tight sm:text-5xl">Glossary</h1>
			</header>

			{GLOSSARY.map((section) => (
				<section
					key={section.id}
					id={section.id}
					className="border-b border-white/10 px-6 py-12 sm:px-10"
					aria-labelledby={`${section.id}-title`}
				>
					<p className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">{section.kicker}</p>
					<h2 id={`${section.id}-title`} className="mt-3 max-w-2xl text-2xl font-medium tracking-tight sm:text-3xl">
						{section.title}
					</h2>
					{section.intro ? (
						<p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75">{section.intro}</p>
					) : null}
					<dl className="mt-8 max-w-3xl space-y-8">
						{section.entries.map((entry) => (
							<div key={entry.id} id={entry.id}>
								<dt className="text-lg">{entry.term}</dt>
								<dd className="mt-2 text-sm leading-relaxed text-white/75">{entry.body}</dd>
							</div>
						))}
					</dl>
				</section>
			))}

			<section className="px-6 py-12 sm:px-10">
				<div className="flex flex-wrap gap-x-6 gap-y-3 text-sm">
					<Link href="/" className="text-amber-300 hover:text-amber-200">
						The solar system
					</Link>
					<Link href="/story" className="text-amber-300 hover:text-amber-200">
						The story
					</Link>
					<Link href="/rules" className="text-amber-300 hover:text-amber-200">
						Rules / play mechanics
					</Link>
					<Link href="/style" className="text-amber-300 hover:text-amber-200">
						Style bible
					</Link>
				</div>
			</section>
		</main>
	);
}

import Link from "next/link";

import { SiteNav } from "@/components/site-nav";
import { EXCEPTIONS, PARTS, ROUTES } from "@/rules-content";

export default function RulesPage() {
	return (
		<main className="min-h-screen bg-black text-white">
			<SiteNav current="rules" />
			<header className="border-b border-white/10 px-6 pt-24 pb-12 sm:px-10">
				<p className="text-xs tracking-[0.22em] text-white/50 uppercase">How a run works</p>
				<h1 className="mt-3 max-w-3xl text-4xl font-medium tracking-tight sm:text-5xl">Rules / play mechanics</h1>
				<p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
					The game is played entirely in space. Each player has one home base and can build more than one ship
					there. Every burn is paid in energy taken from the home warehouse, so a pilot who wants materials still
					has to keep going to the Sun.
				</p>
			</header>

			<section className="border-b border-white/10 px-6 py-12 sm:px-10" aria-labelledby="routes">
				<h2 id="routes" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					Three routes
				</h2>
				<ol className="mt-8 grid gap-4 lg:grid-cols-3">
					{ROUTES.map((route) => (
						<li key={route.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
							<p className="text-lg">{route.title}</p>
							<p className="mt-2 font-mono text-xs text-white/50">{route.steps}</p>
							<p className="mt-4 text-sm leading-relaxed text-white/75">{route.body}</p>
						</li>
					))}
				</ol>
			</section>

			<section className="border-b border-white/10 px-6 py-12 sm:px-10" aria-labelledby="home">
				<h2 id="home" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					One home
				</h2>
				<div className="mt-8 grid gap-8 lg:grid-cols-2">
					<div>
						<p className="max-w-xl text-sm leading-relaxed text-white/75">
							The home base is the energy warehouse, the repair bay, the bank, and the space dock. Ships are built and
							improved there, and only there. It can orbit any planet or moon except Earth. It cannot orbit the Sun.
						</p>
						<p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75">
							A base receives its own materials, free, a little at a time. A body yields one or two. It receives no
							other body&apos;s. A moon and a planet work the same way. No yield stands in for another, and a
							planet&apos;s yield is not included in its moons. Every pilot goes to every yielding body except the one
							they live on.
						</p>
					</div>
					<div>
						<p className="text-sm text-white/50">The only bodies that yield nothing</p>
						<ul className="mt-3 flex gap-2">
							{EXCEPTIONS.map((name) => (
								<li key={name} className="rounded-full border border-white/15 px-3 py-1 text-sm">
									{name}
								</li>
							))}
						</ul>
						<p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
							The Sun is where energy is mined. Earth is where energy is sold, at trading stations, and it cannot hold
							a pilot base. Cash does not buy materials at either of them. When the home warehouse is full, energy has
							to be sold on Earth to make room.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-white/10 px-6 py-12 sm:px-10" aria-labelledby="parts">
				<h2 id="parts" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					Five parts
				</h2>
				<p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75">
					Every step up in strength spends every body&apos;s yield. The free yield at home is only that body&apos;s
					share. This sets no prices and no amounts.
				</p>
				<ol className="mt-8 space-y-4">
					{PARTS.map((part) => (
						<li key={part.name} className="rounded-2xl border border-white/10 p-5">
							<div className="flex flex-wrap items-baseline justify-between gap-3">
								<h3 className="text-lg">{part.name}</h3>
								{part.mineral ? (
									<p className="text-sm text-amber-300">
										{part.mineral.name}
										<span className="text-white/40"> from {part.mineral.body}</span>
									</p>
								) : null}
							</div>
							<p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/70">{part.role}</p>
							{part.mineral ? <p className="mt-2 max-w-2xl text-sm text-white/50">{part.mineral.note}</p> : null}
							<ul className="mt-4 flex flex-wrap gap-2">
								{part.bodies.map((body) => (
									<li key={body} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
										{body}
									</li>
								))}
							</ul>
						</li>
					))}
				</ol>
			</section>

			<section className="border-b border-white/10 px-6 py-12 sm:px-10" aria-labelledby="assist">
				<h2 id="assist" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					Gravity
				</h2>
				<div className="mt-8 grid gap-6 lg:grid-cols-2">
					<p className="text-sm leading-relaxed text-white/75">
						A gravity assist is the efficient burn. The ship is already moving at orbital speed, and a close pass lets
						a planet&apos;s gravity change that speed, so the engines spend less stored energy. Any planet can be that
						pass, and only when it sits where its gravity bends the course. A course can use more than one planet.
					</p>
					<p className="text-sm leading-relaxed text-white/75">
						A wide path stays clear of the planet, spends the full reserve, and leaves the hull alone. A close path on
						a good alignment spends less energy, arrives sooner, and wears the shields and hull. A close pass in the
						wrong month saves nothing. Where the home sits still decides the cost of a direct burn: Mercury is the
						cheap hop to the Sun, and the Moon is the cheap hop to Earth&apos;s market.
					</p>
				</div>
			</section>

			<section className="border-b border-white/10 px-6 py-12 sm:px-10" aria-labelledby="sun">
				<h2 id="sun" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					The Sun
				</h2>
				<div className="mt-8 grid gap-4 md:grid-cols-2">
					<article className="rounded-2xl border border-white/10 p-5">
						<h3 className="text-lg">Harvest</h3>
						<p className="mt-3 text-sm leading-relaxed text-white/75">
							Dock at an empty or allied satellite and siphon until it is empty, or until another load would drop the
							ship under the reserve for today&apos;s departure. When the siphon stops, the ship is idle in the inner
							orbit with its haul aboard. A departure plotted from the terminal is flown when the siphon stops. A ship
							with no departure plotted stays on the empty satellite.
						</p>
					</article>
					<article className="rounded-2xl border border-amber-300/30 p-5">
						<h3 className="text-lg">Attack</h3>
						<p className="mt-3 text-sm leading-relaxed text-white/75">
							The inner orbit is a combat zone. Ships fight with their stats. The player does not steer the shots. If
							the attacker wins, they take the energy and the cash that were aboard, plus scrap from the wreck. The
							defender is sent home to the repair bay. The recall does not deliver a cargo. Ships are never permanently
							destroyed.
						</p>
					</article>
				</div>
				<p className="mt-6 max-w-2xl text-sm leading-relaxed text-white/60">
					Energy has weight. Materials have weight. Cash does not. A heavier ship burns more and fights worse. Past a
					point the cargo is so heavy that what is left cannot buy the trip, so siphoning stops while the ship can still
					leave.
				</p>
			</section>

			<section className="px-6 py-12 sm:px-10" aria-labelledby="earth">
				<h2 id="earth" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					Earth
				</h2>
				<div className="mt-8 max-w-3xl space-y-4 text-sm leading-relaxed text-white/75">
					<p>
						Only a completed transfer at an Earth station changes the price of energy. Sol Systems deliveries move
						the legal price. Marauder deliveries move the black-market price. When the legal price drops, the domes buy
						the surplus, the slums go without power, and stolen energy pays more. Selling into a flood is how that
						premium disappears.
					</p>
					<p>
						Cash stays on the ship until it is banked at home. A ship in the inner orbit of any planet or moon can be
						attacked. The Moon is not a combat zone. A cloak is the only defense: away from base it burns energy
						faster, other ships cannot see it, a scan can, and a cloaked ship cannot be attacked. The Moon is where a
						pilot lives beside Earth&apos;s market.
					</p>
					<p>
						Banked cash is spent at other bodies, on the materials they yield. Two pilots docked at the same base can
						trade materials. A base does not pay cash for materials. Cash comes from energy sold at Earth, or from cash
						taken off a beaten ship.
					</p>
				</div>
				<div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm">
					<Link href="/" className="text-amber-300 hover:text-amber-200">
						The solar system
					</Link>
					<Link href="/story" className="text-amber-300 hover:text-amber-200">
						The story
					</Link>
				</div>
			</section>
		</main>
	);
}

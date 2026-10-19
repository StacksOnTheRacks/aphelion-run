import Link from "next/link";

import { SiteNav } from "@/components/site-nav";
import { EXCEPTIONS, ROUTES, WORLDS } from "@/rules-content";

export default function RulesPage() {
	return (
		<main className="min-h-screen bg-black text-white">
			<SiteNav current="rules" />
			<header className="border-b border-white/10 px-6 pt-24 pb-12 sm:px-10">
				<p className="text-xs tracking-[0.22em] text-white/50 uppercase">How a run works</p>
				<h1 className="mt-3 max-w-3xl text-4xl font-medium tracking-tight sm:text-5xl">Rules / play mechanics</h1>
				<p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
					The game is played entirely in space. Each player has one home base and starts with one ship. Another ship is
					bought with Solscrip at Earth&apos;s black market. Every burn is paid in energy taken from the home warehouse,
					so a pilot who wants minerals still has to keep going to the Sun.
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
							The home base is the energy warehouse, the repair bay, the bank, and the space dock. Ships are improved and
							repaired there, and only there. It can orbit any planet or moon except Earth. It cannot orbit the Sun.
						</p>
						<p className="mt-4 max-w-xl text-sm leading-relaxed text-white/75">
							A base does not receive minerals on its own. The pilot mines the home world the same as any other world.
							A planet and its moons share one yield. The home's only advantage is where it sits.
						</p>
					</div>
					<div>
						<p className="text-sm text-white/50">No pilot base</p>
						<ul className="mt-3 flex gap-2">
							{EXCEPTIONS.map((name) => (
								<li key={name} className="rounded-full border border-white/15 px-3 py-1 text-sm">
									{name}
								</li>
							))}
						</ul>
						<p className="mt-4 max-w-md text-sm leading-relaxed text-white/75">
							The Sun is where energy is mined. Earth is the black market, where energy is sold for Solscrip, and it cannot hold a pilot base. The Moon shares Earth's yield, so it yields nothing either, and it can hold a home. Solscrip does not buy minerals. When the home warehouse is full, energy has to be sold on Earth to make room.
						</p>
					</div>
				</div>
			</section>

			<section className="border-b border-white/10 px-6 py-12 sm:px-10" aria-labelledby="yields">
				<h2 id="yields" className="text-xs tracking-[0.22em] text-amber-300/90 uppercase">
					Yields
				</h2>
				<p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75">
					A world is a planet and its moons. They share one yield. Mining the planet or any of its moons returns the
					same minerals. Ships are improved and repaired from hydrogen, ore, nitrogen, and carbon. A new hull is bought
					with Solscrip. The same mineral is the same wherever it is mined. This sets no amounts.
				</p>
				<p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/75">
					Water is consumed at the home base, at one rate for the fleet, whether or not the pilot is online. A ship
					in the repair bay does not count. A route does not spend it. A dry base can send a ship only to a world
					that yields water, and cannot sell at Earth until water is home. A dry ship cannot attack. It can be attacked. Water unloads even when the energy store
					is full.
				</p>
				<ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{WORLDS.map((world) => (
						<li key={world.name} className="rounded-2xl border border-white/10 p-5">
							<h3 className="text-lg">{world.name}</h3>
							<ul className="mt-4 flex flex-wrap gap-2">
								{world.minerals.map((mineral) => (
									<li key={mineral} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">
										{mineral}
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
						a planet&apos;s gravity change that speed, so the engines spend less stored energy. The Sun and any planet
						can be that pass, and only when it sits where its gravity bends the course. A course can use more than one.
					</p>
					<p className="text-sm leading-relaxed text-white/75">
						A wide path stays clear of the planet, spends the full reserve, and leaves the hull alone. A close path on
						a good alignment spends less energy, arrives sooner, and wears the shields and hull. A close pass in the
						wrong month saves nothing. Where the home sits still decides the cost of a direct burn: Mercury is the
						cheap hop to the Sun, and the Moon is the cheap hop to Earth&apos;s market. Within the inner orbit the ship
						moves on a slow impulse rocket. Once the path out of that orbit is done, a photon rocket carries the ship
						between bodies. Before a departure, the player always sees what the trip costs and what the return costs.
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
							Dock at a collector and siphon until it is empty, or until another load would drop the
							ship under the reserve for today&apos;s departure. When the siphon stops, the ship undocks to the outer
							orbit with its haul. A departure plotted from the terminal is flown from there. A ship with no departure
							plotted stays in the outer orbit.
						</p>
					</article>
					<article className="rounded-2xl border border-amber-300/30 p-5">
						<h3 className="text-lg">Attack</h3>
						<p className="mt-3 text-sm leading-relaxed text-white/75">
							The outer orbit is the combat zone. A ship there can challenge a ship that is mining, or a ship sitting idle
							there after a mine runs empty or a sale finishes. A ship on a photon burn cannot be attacked. Ships fight
							with their stats. The player does not steer the shots. A dry ship cannot attack. It can be attacked. If
							the attacker wins, they take the energy and the Solscrip that were aboard, plus scrap from the wreck. The
							defender is sent home to the repair bay. The recall does not deliver a cargo. Ships are never permanently
							destroyed.
						</p>
					</article>
				</div>
				<p className="mt-6 max-w-2xl text-sm leading-relaxed text-white/60">
					Energy and minerals take the same space and the same weight. Solscrip does not. A heavier ship burns more and fights worse. Past a
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
						Earth is the black market. Energy sold there pays Solscrip onto the ship. Whether a completed sale moves
						the price is not decided. A theft before the transfer finishes is not a sale. When the transfer finishes,
						the ship undocks into the outer orbit and can be attacked.
					</p>
					<p>
						Solscrip stays on the ship until it is banked at home. A ship in the outer orbit of any planet or moon can be
						attacked. The Moon is not a combat zone. A cloak is the only defense: away from base it burns energy
						faster, other ships cannot see it, a scan can, and a cloaked ship cannot be attacked. The Moon is where a
						pilot lives beside Earth&apos;s market. That location is the home&apos;s only advantage.
					</p>
					<p>
						Minerals are mined at the world that yields them, at the planet or at any of its moons, including the home world. They are not bought, and they are not traded. Solscrip comes from energy sold at Earth, or from Solscrip taken off a beaten ship. Banked Solscrip
						can finish an improvement sooner, and it can buy another ship. It does not buy minerals, and it does not shorten a repair.
					</p>
				</div>
				<div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm">
					<Link href="/" className="text-amber-300 hover:text-amber-200">
						The solar system
					</Link>
					<Link href="/story" className="text-amber-300 hover:text-amber-200">
						The story
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

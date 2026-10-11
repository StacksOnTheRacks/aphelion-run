import Link from "next/link";

const LINKS = [
	{ href: "/", id: "system", label: "Solar System" },
	{ href: "/story", id: "story", label: "Story" },
	{ href: "/rules", id: "rules", label: "Rules" },
] as const;

export type SiteSection = (typeof LINKS)[number]["id"];

export function SiteNav({ current }: { current: SiteSection }) {
	return (
		<nav
			aria-label="Site"
			className="fixed inset-x-0 top-0 z-20 border-b border-white/10 bg-black/70 backdrop-blur"
		>
			<div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6">
				<Link href="/" className="text-xs tracking-[0.22em] text-white/50 uppercase">
					Aphelion Run
				</Link>
				<div className="flex gap-1 text-sm">
					{LINKS.map((link) => (
						<Link
							key={link.id}
							href={link.href}
							aria-current={current === link.id ? "page" : undefined}
							className={`rounded-xl px-3 py-1.5 ${
								current === link.id ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
							}`}
						>
							{link.label}
						</Link>
					))}
				</div>
			</div>
		</nav>
	);
}

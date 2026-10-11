import Link from "next/link";

export function SiteNav({ current }: { current: "story" | "rules" }) {
	const item = (href: string, id: "story" | "rules", label: string) => (
		<Link
			href={href}
			aria-current={current === id ? "page" : undefined}
			className={`rounded-xl px-3 py-1.5 ${
				current === id ? "bg-white text-black" : "text-white/70 hover:bg-white/10 hover:text-white"
			}`}
		>
			{label}
		</Link>
	);

	return (
		<nav
			aria-label="Site"
			className="pointer-events-auto fixed top-4 right-4 z-20 flex gap-1 rounded-2xl border border-white/10 bg-black/50 p-1 text-sm backdrop-blur"
		>
			{item("/", "story", "Story")}
			{item("/rules", "rules", "Rules")}
		</nav>
	);
}

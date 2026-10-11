import { SiteNav } from "@/components/site-nav";
import { SystemView } from "@aphelion/app/system-view";

export default function HomePage() {
	return (
		<main className="relative h-dvh w-screen overflow-hidden bg-black">
			<SystemView chromeClassName="pointer-events-none absolute top-14 left-0 max-w-full p-4 sm:max-w-xl sm:p-6" />
			<SiteNav current="system" />
		</main>
	);
}

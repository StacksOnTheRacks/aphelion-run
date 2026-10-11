import { SiteNav } from "@/components/site-nav";
import { StoryCard } from "@/components/story-card";
import { SystemView } from "@aphelion/app/system-view";

export default function HomePage() {
	return (
		<main className="relative h-dvh w-screen overflow-hidden bg-black">
			<SystemView />
			<SiteNav current="story" />
			<StoryCard />
		</main>
	);
}

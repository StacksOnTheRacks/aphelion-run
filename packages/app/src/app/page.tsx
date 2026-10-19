import { GameView } from "../game-view";

export default function Home() {
	return (
		<main className="fixed inset-x-0 top-0 h-dvh w-screen overflow-hidden overscroll-none">
			<GameView />
		</main>
	);
}

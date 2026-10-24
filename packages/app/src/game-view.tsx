"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";

import { freshSession, STARTING_ENERGY, type SolSession } from "./demo/energy";
import { createEnvironment, type EnvironmentDemo } from "./demo/environment";
import { createGalaxy, type GalaxyDemo } from "./demo/galaxy";
import { GalaxyPlace } from "./galaxy-view";
import { GameChrome } from "./game-chrome";
import { SystemPlace } from "./system-view";

type Place = "galaxy" | "system";

type Loaded = { place: "galaxy"; galaxy: GalaxyDemo } | { place: "system"; system: EnvironmentDemo };

const LOADING_COPY: Record<Place, string> = {
	galaxy: "Charting the galaxy",
	system: "Entering Sol",
};

/** The loading screen fades in and out over this long. */
const FADE_MS = 350;
/** A crossing stays on the loading screen at least this long, so it reads as leaving one place for another. */
const MIN_CROSSING_MS = 800;
/** A place that never reports ready is shown anyway after this long. */
const READY_TIMEOUT_MS = 20_000;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * The game opens in Sol, on the planetary chart where the ship is docked. The galaxy is a step back
 * from the system chart. Each place is its own scene. Crossing between them releases the one on screen,
 * shows the loading screen, and brings the next one up. The dock and the energy aboard come back with
 * the pilot until the page is reloaded.
 */
export function GameView() {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const engineRef = useRef<Engine | null>(null);
	/** The scene on screen. The render loop draws only this one. */
	const sceneRef = useRef<Scene | null>(null);
	/** Bumped by every load and on unmount, so a load that has been overtaken stops. */
	const loadRef = useRef(0);
	const sessionRef = useRef<SolSession>(freshSession());
	const solRef = useRef<EnvironmentDemo | null>(null);
	const [shipEnergy, setShipEnergy] = useState(STARTING_ENERGY);
	const [loaded, setLoaded] = useState<Loaded | null>(null);
	const [loading, setLoading] = useState<{ place: Place; progress: number; visible: boolean }>({
		place: "system",
		progress: 0,
		visible: true,
	});
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(async (place: Place, crossing: boolean, atBerth = false) => {
		const engine = engineRef.current;
		const canvas = canvasRef.current;
		if (!engine || !canvas) {
			return;
		}
		const token = ++loadRef.current;
		const current = () => token === loadRef.current && !engine.isDisposed;
		setError(null);
		setLoading({ place, progress: 0, visible: true });
		if (crossing) {
			await wait(FADE_MS);
			if (!current()) {
				return;
			}
		}

		const previous = sceneRef.current;
		sceneRef.current = null;
		if (solRef.current) {
			const saved = solRef.current.session();
			sessionRef.current = saved;
			setShipEnergy(saved.energy);
			solRef.current = null;
		}
		setLoaded(null);
		previous?.dispose();

		// Sol is drawn around the camera. The ship is a few thousandths of a unit across and flies
		// hundreds of units out, where single-precision world positions lose the gaps between hull panels.
		const scene = new Scene(engine, { useFloatingOrigin: place !== "galaxy" });
		let next: Loaded;
		try {
			next =
				place === "galaxy"
					? { place, galaxy: createGalaxy(engine, scene, canvas, { opening: !crossing }) }
					: { place, system: await createEnvironment(engine, scene, canvas, { atBerth, session: sessionRef.current }) };
		} catch (caught) {
			scene.dispose();
			setError(caught instanceof Error ? caught.message : String(caught));
			setLoading((shown) => ({ ...shown, visible: false }));
			return;
		}

		let most = 0;
		const poll = window.setInterval(() => {
			if (!current()) {
				window.clearInterval(poll);
				return;
			}
			const waiting = scene.getWaitingItemsCount();
			most = Math.max(most, waiting);
			setLoading((shown) => ({ ...shown, progress: most > 0 ? 1 - waiting / most : 0 }));
		}, 100);
		await Promise.all([
			Promise.race([scene.whenReadyAsync(), wait(READY_TIMEOUT_MS)]),
			wait(crossing ? MIN_CROSSING_MS : 0),
		]);
		window.clearInterval(poll);
		if (!current()) {
			if (!scene.isDisposed) {
				scene.dispose();
			}
			return;
		}
		sceneRef.current = scene;
		if (next.place === "system") {
			solRef.current = next.system;
			setShipEnergy(next.system.hold().energy);
		}
		setLoaded(next);
		setLoading((shown) => ({ ...shown, progress: 1, visible: false }));
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) {
			return;
		}
		const engine = new Engine(canvas, true, {
			antialias: true,
			adaptToDeviceRatio: true,
			powerPreference: "high-performance",
			useHighPrecisionMatrix: true,
		});
		engineRef.current = engine;
		engine.runRenderLoop(() => {
			sceneRef.current?.render();
		});
		const onResize = () => {
			engine.resize();
		};
		window.addEventListener("resize", onResize);
		// Safari zooms the page from these events even when touch-action is none.
		const blockGesture = (event: Event) => {
			event.preventDefault();
		};
		document.addEventListener("gesturestart", blockGesture, { capture: true });
		document.addEventListener("gesturechange", blockGesture, { capture: true });
		void load("system", false, true);

		return () => {
			loadRef.current += 1;
			window.removeEventListener("resize", onResize);
			document.removeEventListener("gesturestart", blockGesture, { capture: true });
			document.removeEventListener("gesturechange", blockGesture, { capture: true });
			sceneRef.current = null;
			engine.dispose();
			engineRef.current = null;
		};
	}, [load]);

	const enterSol = useCallback(() => void load("system", true, false), [load]);
	const enterShip = useCallback(() => void load("system", true, true), [load]);
	const leaveSol = useCallback(() => void load("galaxy", true), [load]);

	return (
		<div className="absolute inset-0 touch-none overflow-hidden overscroll-none bg-black text-white">
			<canvas ref={canvasRef} className="h-full w-full touch-none outline-none select-none" />
			{loaded?.place === "galaxy" ? (
				<GalaxyPlace galaxy={loaded.galaxy} energy={shipEnergy} onEnterSol={enterSol} onHome={enterShip} />
			) : null}
			{loaded?.place === "system" ? <SystemPlace system={loaded.system} onLeave={leaveSol} /> : null}
			{!loaded ? <GameChrome /> : null}
			{error ? (
				<p className="absolute top-24 right-6 max-w-sm rounded bg-red-950/90 p-3 text-sm text-red-100">{error}</p>
			) : null}
			<LoadingScreen label={LOADING_COPY[loading.place]} progress={loading.progress} visible={loading.visible} />
		</div>
	);
}

function LoadingScreen({ label, progress, visible }: { label: string; progress: number; visible: boolean }) {
	return (
		<div
			role="status"
			aria-live="polite"
			aria-hidden={!visible}
			style={{ transitionDuration: `${FADE_MS}ms` }}
			className={`absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-black transition-opacity ${
				visible ? "opacity-100" : "pointer-events-none opacity-0"
			}`}
		>
			<p className="text-sm font-medium tracking-[0.32em] text-[#E8E4D9] uppercase">Aphelion Run</p>
			<div className="h-px w-48 overflow-hidden bg-white/15">
				<div
					className="h-full bg-amber-300 transition-[width] duration-300"
					style={{ width: `${Math.round(Math.max(0.06, progress) * 100)}%` }}
				/>
			</div>
			<p className="text-[11px] tracking-[0.22em] text-white/55 uppercase">{label}</p>
		</div>
	);
}

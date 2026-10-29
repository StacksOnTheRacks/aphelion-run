import { scanScope, viewTrail, type DemoView } from "./environment";
import { bodyLabel } from "./nav";

/**
 * The chart plaque names the area in frame.
 * The whole system is Sol System. A wide planet chart names that planet and what orbits it.
 * Sol is the star, so its chart names Sol. A moon chart, a close framing, or an inner orbit
 * names the body in frame.
 */
export function viewPlaque(view: DemoView, close: boolean): { title: string; detail: null } {
	if (view === "system") {
		return { title: "Sol System", detail: null };
	}
	const focus = viewTrail(view).filter((body) => !body.id.endsWith("-stop")).at(-1);
	if (!focus) {
		return { title: "Sol System", detail: null };
	}
	if (focus.id === "sun") {
		return { title: focus.label, detail: null };
	}
	const wide = scanScope(view, close).craftHost === null;
	return { title: wide ? `${focus.label} System` : focus.label, detail: null };
}

/**
 * The pilot plaque names where the ship is. Docked, that is the body it sits on.
 * Out in open space, that is the Sol system.
 */
export function pilotPlaque(host: string | null): { title: string; detail: null } {
	return { title: host ? bodyLabel(host) : "Sol System", detail: null };
}

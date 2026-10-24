import { scanScope, viewTrail, type DemoView } from "./environment";
import { scanLabel, type ScanTarget } from "./scan";

/**
 * The location plaque names the chart, not the ship.
 * The whole system is Sol. A wide outer chart names that body as a system. Inside the close orbit,
 * on an inner orbit, or on a moon chart, it names the body in frame. Riding a craft names that craft.
 */
export function viewPlaque(
	view: DemoView,
	close: boolean,
	riding: ScanTarget | null
): { title: string; detail: null } {
	if (riding) {
		return { title: scanLabel(riding), detail: null };
	}
	if (view === "system") {
		return { title: "Sol System", detail: null };
	}
	const focus = viewTrail(view).filter((body) => !body.id.endsWith("-stop")).at(-1);
	if (!focus) {
		return { title: "Sol System", detail: null };
	}
	const wide = scanScope(view, close).craftHost === null;
	return { title: wide ? `${focus.label} System` : focus.label, detail: null };
}

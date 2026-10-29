import type { Faction } from "./bases";
import { STARTING_DOCK_ID } from "./energy";
import { JOURNEY_STOPS, PLANETS, bodyTarget, type DemoView } from "./environment";
import { PLANET_YIELDS, type Mineral } from "./generators";

/** Seconds between Travel To and the ship starting to move. */
export const DEPARTURE_SECONDS = 5;

export type ScanKind = "star" | "planet" | "moon" | "station" | "home" | "collector" | "generator";

/**
 * What a scan picked. A body is its own host. A craft names the body it circles, and that body's
 * outer orbit is where the burn to it ends. A generator names the mineral it yields.
 */
export type ScanTarget = {
	id: string;
	host: string;
	kind: ScanKind;
	owner?: Faction | "empty";
	resource?: Mineral;
};

export type ScanCard = {
	id: string;
	/** What it is, shown over the name. */
	kind: string;
	label: string;
	/** Who holds a craft. Bodies have no owner. */
	owner?: string;
	text: string;
};

/** Where the ship is, as far as Travel To cares. `at` is the body it sits at, or null while it is out. */
export type ShipState = { at: string | null; departing: boolean; energy?: number };

const KIND_LABEL: Record<ScanKind, string> = {
	star: "Star",
	planet: "Planet",
	moon: "Moon",
	station: "Station",
	home: "Home base",
	collector: "Collector",
	generator: "Generator",
};

const OWNER_LABEL: Record<Faction | "empty", string> = {
	corporate: "Corporate",
	marauder: "Marauder",
	empty: "Unoccupied",
};

/** A journey stop's name, with "the" before the Moon so it reads in a sentence. */
export function placeName(id: string): string {
	const label = JOURNEY_STOPS.find((stop) => stop.id === id)?.label ?? id;
	return label === "Moon" ? `the ${label}` : label;
}

function stopLabel(id: string): string {
	return JOURNEY_STOPS.find((stop) => stop.id === id)?.label ?? id;
}

function moonPlanet(id: string): string | null {
	return PLANETS.find((spec) => spec.moons.some((moon) => moon.name === id))?.name ?? null;
}

/** What a ship can take at a target: Sol's collectors give energy, a mine gives its mineral, and a body lists every mine around it. */
export type Yield = Mineral | "energy";

export function targetYields(target: ScanTarget): Yield[] {
	if (target.kind === "collector" || target.kind === "star") {
		return ["energy"];
	}
	if (target.kind === "generator") {
		return target.resource ? [target.resource] : [];
	}
	if (target.kind === "planet") {
		return [...(PLANET_YIELDS[target.id] ?? [])];
	}
	if (target.kind === "moon" && target.id !== "moon") {
		const planet = moonPlanet(target.id);
		return planet ? [...(PLANET_YIELDS[planet] ?? [])] : [];
	}
	return [];
}

function bodyText(target: ScanTarget): string {
	if (target.kind === "star") {
		return "Collectors circle in its inner orbit. Energy is siphoned there.";
	}
	if (target.id === "earth") {
		return "Its station is the black market. Earth yields nothing a ship can mine.";
	}
	if (target.id === "moon") {
		return "Earth's Moon is not a combat zone. Like Earth, it yields nothing a ship can mine.";
	}
	if (target.kind === "moon") {
		const planet = moonPlanet(target.id);
		return `A moon of ${planet ? stopLabel(planet) : "a planet"}. Its minerals are mined there.`;
	}
	return "Its minerals are mined in the inner orbit.";
}

function craftText(target: ScanTarget): string {
	if (target.kind === "station") {
		return "The black market dock in Earth's inner orbit. Energy is sold here for Solscrip.";
	}
	if (target.kind === "collector") {
		return "Holds Sol's energy in its inner orbit. A ship docks here to siphon it.";
	}
	if (target.kind === "generator") {
		const mineral = target.resource ?? "minerals";
		return `A mine in the inner orbit of ${placeName(target.host)}. A ship docks here to take ${mineral}.`;
	}
	return `A home in the inner orbit of ${placeName(target.host)}: a warehouse, a repair bay, a bank, and a dock.`;
}

/** A body as a scan target. */
export function bodyScan(id: string): ScanTarget {
	const kind: ScanKind = id === "sun" ? "star" : PLANETS.some((spec) => spec.name === id) ? "planet" : "moon";
	return { id, host: id, kind };
}

/** Where a trip is headed, as it reads after "to" or "at". */
export function destinationName(target: ScanTarget): string {
	if (target.id === STARTING_DOCK_ID) {
		return "home base";
	}
	switch (target.kind) {
		case "station":
			return `${stopLabel(target.host)}'s station`;
		case "home":
			return `a home base at ${placeName(target.host)}`;
		case "collector":
			return `a collector at ${placeName(target.host)}`;
		case "generator":
			return `the ${target.resource ?? "mineral"} mine at ${placeName(target.host)}`;
		default:
			return placeName(target.id);
	}
}

const MINERAL_LABEL: Record<Mineral, string> = {
	hydrogen: "Hydrogen",
	ore: "Ore",
	nitrogen: "Nitrogen",
	carbon: "Carbon",
};

function craftLabel(target: ScanTarget): string {
	if (target.kind === "collector") {
		return "Collector";
	}
	if (target.kind === "generator") {
		const mineral = target.resource ? MINERAL_LABEL[target.resource] : "Mineral";
		return `${mineral} mine`;
	}
	return `${stopLabel(target.host)} ${target.kind === "station" ? "station" : "home base"}`;
}

export function scanCard(target: ScanTarget): ScanCard {
	if (target.id === STARTING_DOCK_ID) {
		return {
			id: target.id,
			kind: "Home base",
			label: "Home base",
			text: "The ship's home base, in Earth's inner orbit. Recall returns here.",
		};
	}
	const body = target.kind === "star" || target.kind === "planet" || target.kind === "moon";
	return {
		id: target.id,
		kind: KIND_LABEL[target.kind],
		label: body ? stopLabel(target.id) : craftLabel(target),
		owner: target.owner ? OWNER_LABEL[target.owner] : undefined,
		text: body ? bodyText(target) : craftText(target),
	};
}

/**
 * A found object's name on the scene. Several craft of one kind are often in view together, so a craft
 * reads by who holds it.
 */
export function scanLabel(target: ScanTarget): string {
	if (target.id === STARTING_DOCK_ID) {
		return "Home base";
	}
	const card = scanCard(target);
	if (target.id !== target.host && card.owner) {
		return `${card.owner} ${card.kind.toLowerCase()}`;
	}
	return card.label;
}

/**
 * A craft opens a card, because a home base, a station, or a collector can be traveled to.
 * A star, a planet, or a moon is entered on the click itself.
 */
export function showsCard(target: ScanTarget): boolean {
	return target.id !== target.host;
}

/**
 * The card's camera action: off to a body's outer orbit, or alongside a craft.
 * On a planet's or the Sun's wide chart, View comes in on that body. Off once that closer framing
 * is already showing, and off on a moon chart, which arrives there.
 */
export function viewAction(target: ScanTarget, view: DemoView, close = false): { label: string; enabled: boolean } {
	if (target.id === target.host && bodyTarget(target.id).view === view) {
		if (view === `${target.id}-outer` && !close) {
			return { label: "View", enabled: true };
		}
		return { label: "In view", enabled: false };
	}
	return { label: "View", enabled: true };
}

/**
 * The card's travel action. A trip leaves only from a dock: it is not re-routed in flight, and a trip
 * within one body's orbit is not a burn. `cost` is the energy the cruise would spend. When the ship
 * does not have it, the trip stays on the card and cannot be set.
 */
export function travelAction(
	target: ScanTarget,
	ship: ShipState,
	cost?: number | null
): { label: string; enabled: boolean } {
	if (ship.departing) {
		return { label: "Departure set", enabled: false };
	}
	if (ship.at === null) {
		return { label: "En route", enabled: false };
	}
	if (ship.at === target.host) {
		return { label: target.id === target.host ? "The ship is here" : "In the ship's orbit", enabled: false };
	}
	if (cost != null && ship.energy != null && Math.round(ship.energy) < cost) {
		return { label: `Need ${cost}`, enabled: false };
	}
	if (cost != null) {
		return { label: `Travel · ${cost}`, enabled: true };
	}
	return { label: "Travel To", enabled: true };
}

/** What Recall does from the ship's current berth. A countdown home can still be cancelled. */
export type RecallMove = "hold" | "cancel" | "depart" | "hop" | "abort" | "abort-depart" | "abort-hop";

export function recallMove(input: {
	homeId: string;
	dockId: string | null;
	homeHost: string;
	dockHost: string | null;
	departingTo: string | null;
	inFlight: boolean;
	energy: number;
	cost: number;
}): { move: RecallMove; enabled: boolean; title: string } {
	const atHomeDock = input.dockId === input.homeId;
	const sameBody = input.dockHost != null && input.dockHost === input.homeHost;
	const canCruise = input.energy >= input.cost;
	const departTitle = sameBody || input.cost <= 0 ? "Return to home base" : `Return · ${input.cost}`;

	if (input.inFlight) {
		if (atHomeDock) {
			return { move: "abort", enabled: true, title: "Return to home base" };
		}
		if (sameBody) {
			return { move: "abort-hop", enabled: true, title: "Return to home base" };
		}
		if (canCruise) {
			return { move: "abort-depart", enabled: true, title: departTitle };
		}
		return { move: "abort", enabled: true, title: "Stop and hold" };
	}

	if (input.departingTo === input.homeId) {
		return { move: "cancel", enabled: true, title: "Cancel recall" };
	}
	if (input.departingTo) {
		if (sameBody) {
			return { move: "hop", enabled: true, title: "Return to home base" };
		}
		if (canCruise) {
			return { move: "depart", enabled: true, title: departTitle };
		}
		return { move: "cancel", enabled: true, title: "Cancel departure" };
	}
	if (atHomeDock) {
		return { move: "hold", enabled: false, title: "The ship is at home" };
	}
	if (sameBody) {
		return { move: "hop", enabled: true, title: "Return to home base" };
	}
	if (canCruise) {
		return { move: "depart", enabled: true, title: departTitle };
	}
	return { move: "hold", enabled: false, title: `Need ${input.cost} to reach home` };
}

/** Whole seconds left on the departure countdown, counting 5, 4, 3, 2, 1, then 0 when it is time to go. */
export function secondsLeft(endsAt: number, now: number): number {
	return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

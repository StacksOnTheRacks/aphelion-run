import type { Faction } from "./bases";
import { JOURNEY_STOPS, PLANETS, bodyTarget, type DemoView } from "./environment";

/** Seconds between Travel To and the ship starting to move. */
export const DEPARTURE_SECONDS = 5;

export type ScanKind = "star" | "planet" | "moon" | "station" | "home" | "collector";

/**
 * What a scan picked. A body is its own host. A craft names the body it circles, and that body's
 * outer orbit is where the burn to it ends.
 */
export type ScanTarget = { id: string; host: string; kind: ScanKind; owner?: Faction | "empty" };

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
export type ShipState = { at: string | null; departing: boolean };

const KIND_LABEL: Record<ScanKind, string> = {
	star: "Star",
	planet: "Planet",
	moon: "Moon",
	station: "Station",
	home: "Home base",
	collector: "Collector",
};

const OWNER_LABEL: Record<Faction | "empty", string> = {
	corporate: "Corporate",
	marauder: "Marauder",
	empty: "Unoccupied",
};

/** A journey stop's name, with "the" before the Sun and the Moon so it reads in a sentence. */
export function placeName(id: string): string {
	const label = JOURNEY_STOPS.find((stop) => stop.id === id)?.label ?? id;
	return label === "Sun" || label === "Moon" ? `the ${label}` : label;
}

function stopLabel(id: string): string {
	return JOURNEY_STOPS.find((stop) => stop.id === id)?.label ?? id;
}

function moonPlanet(id: string): string | null {
	return PLANETS.find((spec) => spec.moons.some((moon) => moon.name === id))?.name ?? null;
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
		return `A moon of ${planet ? stopLabel(planet) : "a planet"}. Home bases circle it, and its minerals are mined there.`;
	}
	return "Home bases circle in its inner orbit, and its minerals are mined there.";
}

function craftText(target: ScanTarget): string {
	if (target.kind === "station") {
		return "The black market dock in Earth's inner orbit. Energy is sold here for Solscrip.";
	}
	if (target.kind === "collector") {
		return "Holds the Sun's energy in its inner orbit. A ship docks here to siphon it.";
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
	switch (target.kind) {
		case "station":
			return `${stopLabel(target.host)}'s station`;
		case "home":
			return `a home base at ${placeName(target.host)}`;
		case "collector":
			return `a collector at ${placeName(target.host)}`;
		default:
			return placeName(target.id);
	}
}

export function scanCard(target: ScanTarget): ScanCard {
	const body = target.kind === "star" || target.kind === "planet" || target.kind === "moon";
	return {
		id: target.id,
		kind: KIND_LABEL[target.kind],
		label: body
			? stopLabel(target.id)
			: target.kind === "collector"
				? "Collector"
				: `${stopLabel(target.host)} ${target.kind === "station" ? "station" : "home base"}`,
		owner: target.owner ? OWNER_LABEL[target.owner] : undefined,
		text: body ? bodyText(target) : craftText(target),
	};
}

/**
 * A found object's name on the scene. Several craft of one kind are often in view together, so a craft
 * reads by who holds it.
 */
export function scanLabel(target: ScanTarget): string {
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
 * The card's travel action. A trip leaves only from a dock or the ship's orbit at Earth: it is not
 * re-routed in flight, and a trip within one body's orbit is not a burn.
 */
export function travelAction(target: ScanTarget, ship: ShipState): { label: string; enabled: boolean } {
	if (ship.departing) {
		return { label: "Departure set", enabled: false };
	}
	if (ship.at === null) {
		return { label: "En route", enabled: false };
	}
	if (ship.at === target.host) {
		return { label: target.id === target.host ? "The ship is here" : "In the ship's orbit", enabled: false };
	}
	return { label: "Travel To", enabled: true };
}

/** Whole seconds left on the departure countdown, counting 5, 4, 3, 2, 1, then 0 when it is time to go. */
export function secondsLeft(endsAt: number, now: number): number {
	return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

/** Seconds left on a trip, how long that trip is, and where it is headed. */
export type TravelClock = { remaining: number; total: number; name: string };

/**
 * Share of the trip still ahead, from 1 at departure to 0 on arrival.
 * The countdown ring is this share of a full turn.
 */
export function travelShare(remaining: number, total: number): number {
	if (!(total > 0)) {
		return 0;
	}
	return Math.max(0, Math.min(1, remaining / total));
}

/** A trip's length as a clock. Under an hour this is m:ss. */
export function formatTravelTime(seconds: number): string {
	const total = Math.max(0, Math.round(seconds));
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const rest = total % 60;
	const clock = `${minutes.toString().padStart(hours > 0 ? 2 : 1, "0")}:${rest.toString().padStart(2, "0")}`;
	return hours > 0 ? `${hours}:${clock}` : clock;
}

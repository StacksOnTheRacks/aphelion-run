/** Which engine is allowed to push the ship. */
export type Drive = "impulse" | "photon";

/** How hard each plume is firing, from 0 to 1. */
export type Plumes = {
	main: number;
	port: number;
	starboard: number;
	dorsal: number;
	ventral: number;
};

/**
 * Radians per second that counts as a thruster at full. The station circle turns slower than this,
 * so a gentle turn is a smaller flame.
 */
export const FULL_TURN = 0.25;

/** Slower than this is noise, not a turn. */
const TURN_DEAD = 0.02;

/**
 * Which plumes are lit. `yawRate` is positive when the nose is swinging to starboard, so the port
 * thruster is the one that fires. `pitchRate` is how fast the nose is leaving the planets' plane;
 * that lights the dorsal and ventral pair together. Impulse flight, which is inner orbit, never
 * lights the main engine. A photon burn does, at `burn`.
 */
export function plumesFor(drive: Drive, yawRate: number, pitchRate: number, burn: number): Plumes {
	const yaw = Math.abs(yawRate) < TURN_DEAD ? 0 : yawRate / FULL_TURN;
	const pitch = Math.abs(pitchRate) < TURN_DEAD ? 0 : Math.abs(pitchRate) / FULL_TURN;
	return {
		main: drive === "photon" ? clamp01(burn) : 0,
		port: clamp01(yaw),
		starboard: clamp01(-yaw),
		dorsal: clamp01(pitch),
		ventral: clamp01(pitch),
	};
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

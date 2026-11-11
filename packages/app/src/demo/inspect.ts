import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { DOCK_SIZE, MINE_SIZE } from "./bases";
import { EXTERIOR_HOME, EXTERIOR_RADIUS, exteriorOffset, type ExteriorOrbit } from "./cockpit";
import { HULL_CLEARANCE, trailDistance } from "./journey";
import { HULL_LENGTH } from "./ranger";
import type { ScanKind } from "./scan";

/** A mine or collector is met from behind. The home base is a pad the ship sits on. */
export type InspectMount = "trail" | "pad";

/** A mine or a collector is met from behind. A home base or a station is a pad. */
export function inspectMount(kind: ScanKind): InspectMount {
	return kind === "collector" || kind === "generator" ? "trail" : "pad";
}

/**
 * What Locate shows. Between systems it is the galaxy. Docked, it is the same close look as View on
 * that berth. Anywhere else in the system, the camera follows the hull.
 */
export type LocateLook = { kind: "galaxy" } | { kind: "inspect"; id: string } | { kind: "ship" };

export function locateLook(ship: { interSystem: boolean; dockedId: string | null }): LocateLook {
	if (ship.interSystem) {
		return { kind: "galaxy" };
	}
	if (ship.dockedId) {
		return { kind: "inspect", id: ship.dockedId };
	}
	return { kind: "ship" };
}

/** A chart camera pose around a point: the same alpha, beta, and radius an arc camera takes. */
export type OrbitPose = { alpha: number; beta: number; radius: number; target: Vector3 };

/**
 * The chart camera on the exterior mount: astern, to starboard, and above the hull, so the ship
 * reads in traffic. `heading` is the nose. The hull is turned to it with the world's up, so the
 * ship's axes follow from the heading alone.
 */
export function shipFollowPose(
	hullCenter: Vector3,
	heading: Vector3,
	orbit: ExteriorOrbit = EXTERIOR_HOME,
	radius = EXTERIOR_RADIUS
): OrbitPose {
	const forward = heading.lengthSquared() > 1e-12 ? heading.normalizeToNew() : new Vector3(0, 0, 1);
	let right = Vector3.Cross(Vector3.Up(), forward);
	if (right.lengthSquared() < 1e-12) {
		right = new Vector3(1, 0, 0);
	}
	right.normalize();
	const up = Vector3.Cross(forward, right).normalize();
	const local = exteriorOffset(orbit, radius);
	const offset = right.scale(local.x).addInPlace(up.scale(local.y)).addInPlace(forward.scale(local.z));
	const length = offset.length() || 1;
	return {
		alpha: Math.atan2(offset.z, offset.x),
		beta: Math.acos(Math.min(1, Math.max(-1, offset.y / length))),
		radius: length,
		target: hullCenter.clone(),
	};
}

/**
 * Share of the screen's shorter side the framed sphere covers.
 * The sphere holds the facility, and the ship when one is docked, so both read large
 * while the body behind them still fills the view.
 */
export const INSPECT_FILL = 0.62;

/**
 * Radius of the sphere the close framing has to hold, around the craft.
 * A mine or collector, undocked, is the facility with room for its panels. Docked, the sphere
 * reaches past the hull that trails it. A pad is the landing square. Docked, it also holds the
 * hull sitting on that square.
 */
export function inspectExtent(docked: boolean, mount: InspectMount = "trail"): number {
	if (mount === "pad") {
		const pad = Math.hypot(DOCK_SIZE.width, DOCK_SIZE.depth) / 2;
		if (!docked) {
			return pad * 1.8;
		}
		return Math.hypot(pad, HULL_CLEARANCE + HULL_LENGTH / 2) * 1.15;
	}
	const facility = MINE_SIZE.depth / 2;
	if (!docked) {
		return facility * 1.8;
	}
	return trailDistance("coupled") + HULL_LENGTH / 2 + facility * 0.45;
}

/**
 * Where the camera stands, in the facility's frame.
 * Outward keeps the body behind the facility. Up angles the shot off the orbit plane.
 * Side points toward the trailing hull, so a docked ship sits in the foreground.
 * A pad is seen from outside and a little above, side-on to the hull, so the ship
 * reads on the square and the body stays behind them.
 * `rate` is the facility's angular speed. Positive rate trails behind decreasing angle.
 */
export function inspectDirection(rate: number, mount: InspectMount = "trail"): { outward: number; side: number; up: number } {
	const trail = rate >= 0 ? -1 : 1;
	if (mount === "pad") {
		return { outward: 1.05, side: trail * 0.22, up: 0.38 };
	}
	return { outward: 0.85, side: trail * 0.42, up: 0.58 };
}

/**
 * How far above the craft the close-up looks, in world units.
 * A berthed ship sits one hull above the pad. Aiming between the two keeps both in frame.
 */
export function inspectAimLift(docked: boolean, mount: InspectMount = "trail"): number {
	if (mount !== "pad" || !docked) {
		return 0;
	}
	return HULL_CLEARANCE * 0.7;
}

/**
 * Camera alpha and beta for a facility at orbital `angle`.
 * Alpha is the same convention as the chart camera: the direction from the facility out to the camera.
 */
export function inspectAngles(angle: number, rate: number, mount: InspectMount = "trail"): { alpha: number; beta: number } {
	const dir = inspectDirection(rate, mount);
	const outwardX = Math.cos(angle);
	const outwardZ = Math.sin(angle);
	const sideX = -Math.sin(angle);
	const sideZ = Math.cos(angle);
	const x = outwardX * dir.outward + sideX * dir.side;
	const y = dir.up;
	const z = outwardZ * dir.outward + sideZ * dir.side;
	const length = Math.hypot(x, y, z) || 1;
	return {
		alpha: Math.atan2(z, x),
		beta: Math.acos(Math.min(1, Math.max(-1, y / length))),
	};
}

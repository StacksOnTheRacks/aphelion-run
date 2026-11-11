import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import { DOCK_SIZE, MINE_SIZE } from "./bases";
import { EXTERIOR_RADIUS } from "./cockpit";
import {
	INSPECT_FILL,
	inspectAimLift,
	inspectAngles,
	inspectDirection,
	inspectExtent,
	inspectMount,
	locateLook,
	shipFollowPose,
} from "./inspect";
import { HULL_CLEARANCE, trailDistance } from "./journey";
import { HULL_LENGTH } from "./ranger";
import { canInspect } from "./scan";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

const facility = MINE_SIZE.depth / 2;
const alone = inspectExtent(false);
const withShip = inspectExtent(true);
expect(alone > facility, "the close framing clears the facility");
expect(withShip > alone, "a docked ship widens the framing");
expect(
	withShip >= trailDistance("coupled") + HULL_LENGTH / 2,
	"the framing reaches the back of a docked hull"
);
const pad = Math.hypot(DOCK_SIZE.width, DOCK_SIZE.depth) / 2;
const emptyPad = inspectExtent(false, "pad");
const berthed = inspectExtent(true, "pad");
expect(emptyPad > pad, "the home base framing clears the pad");
expect(berthed > emptyPad, "a ship on the home base widens the framing");
expect(berthed >= Math.hypot(pad, HULL_CLEARANCE), "the home base framing reaches the hull sitting on the pad");
expect(inspectAimLift(false, "pad") === 0 && inspectAimLift(true) === 0, "only a ship on a pad lifts the aim");
expect(
	inspectAimLift(true, "pad") > HULL_CLEARANCE * 0.3 && inspectAimLift(true, "pad") < HULL_CLEARANCE,
	"the home base aim sits between the pad and the hull"
);
expect(INSPECT_FILL > 0.4 && INSPECT_FILL < 0.85, "the subject fills a good share of the frame and leaves the body room");

function stand(angle: number, rate: number): { x: number; y: number; z: number; beta: number } {
	const facing = inspectAngles(angle, rate);
	return {
		x: Math.cos(facing.alpha) * Math.sin(facing.beta),
		y: Math.cos(facing.beta),
		z: Math.sin(facing.alpha) * Math.sin(facing.beta),
		beta: facing.beta,
	};
}

const angle = 0.7;
const camera = stand(angle, 0.2);
const outward = camera.x * Math.cos(angle) + camera.z * Math.sin(angle);
const along = camera.x * -Math.sin(angle) + camera.z * Math.cos(angle);
expect(outward > 0.45, "the camera stands outside the facility, so the body stays behind it");
expect(camera.y > 0.35, "the camera sits above the orbit");
expect(along < -0.2, "the camera sits on the trailing side, where a docked ship rests");
expect(camera.beta > 0.55 && camera.beta < 1.25, "the shot is angled, neither overhead nor edge-on");

const reversed = stand(angle, -0.2);
const reversedAlong = reversed.x * -Math.sin(angle) + reversed.z * Math.cos(angle);
expect(reversedAlong > 0.2, "a facility orbiting the other way is seen from its own trailing side");

const turned = inspectAngles(angle + 1.1, 0.2);
const first = inspectAngles(angle, 0.2);
expect(Math.abs(turned.alpha - first.alpha) > 0.5, "the camera turns with the facility as it orbits");
expect(inspectDirection(0.2).up > 0 && inspectDirection(-0.2).up > 0, "either orbital direction is still seen from above");

function standOn(mount: "trail" | "pad", rate: number): { x: number; y: number; z: number } {
	const facing = inspectAngles(angle, rate, mount);
	return {
		x: Math.cos(facing.alpha) * Math.sin(facing.beta),
		y: Math.cos(facing.beta),
		z: Math.sin(facing.alpha) * Math.sin(facing.beta),
	};
}

const padStand = standOn("pad", 0.2);
const padOutward = padStand.x * Math.cos(angle) + padStand.z * Math.sin(angle);
const padAlong = padStand.x * -Math.sin(angle) + padStand.z * Math.cos(angle);
expect(padOutward > outward, "the home base is seen more from outside, so the body fills in behind the pad");
expect(padStand.y > 0.2 && padStand.y < camera.y, "the home base is seen from lower than a mine, so the hull stays beside the pad");
expect(Math.abs(padAlong) < Math.abs(along), "the home base camera stays near the hull's side, not its stern");

expect(inspectMount("generator") === "trail" && inspectMount("collector") === "trail", "a mine or a collector is met from behind");
expect(inspectMount("home") === "pad" && inspectMount("station") === "pad", "a home base or a station is seen as a pad");
expect(canInspect({ id: "earth-station-marauder-1", host: "earth", kind: "station" }) === false, "a station's card still has no View");

expect(locateLook({ interSystem: true, dockedId: "earth-station-marauder-1" }).kind === "galaxy", "between systems, Locate is the galaxy");
const atDock = locateLook({ interSystem: false, dockedId: "mars-generator-ore" });
expect(atDock.kind === "inspect" && atDock.id === "mars-generator-ore", "docked, Locate is View on that berth");
expect(locateLook({ interSystem: false, dockedId: null }).kind === "ship", "under way, Locate rides the hull");

const hull = new Vector3(3, 1, -2);
function followFrom(heading: Vector3): { aft: number; starboard: number; up: number; distance: number } {
	const pose = shipFollowPose(hull, heading);
	const eye = new Vector3(
		Math.cos(pose.alpha) * Math.sin(pose.beta),
		Math.cos(pose.beta),
		Math.sin(pose.alpha) * Math.sin(pose.beta)
	).scale(pose.radius);
	const nose = heading.normalizeToNew();
	const right = Vector3.Cross(Vector3.Up(), nose).normalize();
	return {
		aft: -Vector3.Dot(eye, nose),
		starboard: Vector3.Dot(eye, right),
		up: eye.y,
		distance: eye.length(),
	};
}
for (const heading of [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(-0.6, 0.1, -0.8)]) {
	const seen = followFrom(heading);
	expect(seen.aft > 0, "the follow camera sits astern of the ship");
	expect(seen.starboard > 0, "the follow camera sits to starboard");
	expect(seen.up > 0, "the follow camera sits above the ship");
	expect(Math.abs(seen.distance - EXTERIOR_RADIUS) < 1e-6, "the follow camera keeps the exterior range");
}
expect(shipFollowPose(hull, new Vector3(0, 0, 1)).target.equals(hull), "the follow camera looks at the hull");

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("a close look frames the facility, a docked ship, and the body behind them");

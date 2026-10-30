import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";

import { MINE_FIRE_PERIOD, MINE_FIRE_SECONDS, beamEnd, beamRotation, impactPosition, mineBeamSpan, mineFiring } from "./laser";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

const center = new Vector3(0, 0, 0);
const forward = new Vector3(0, 0, 1);
const from = new Vector3(0, -0.01, -0.1);
const face = beamEnd(from, center, forward, 0.03);
expect(face != null, "a muzzle behind the block finds the face");
expect(!!face && Math.abs(face.x) < 1e-9 && Math.abs(face.y) < 1e-9 && Math.abs(face.z + 0.03) < 1e-9, "the face sits inset back from the center");
expect(beamEnd(new Vector3(0, 0, 0.1), center, forward, 0.03) == null, "a muzzle past the face does not fire through the block");
expect(beamEnd(from, center, Vector3.Zero(), 0.03) == null, "a beam needs a direction toward the block");

const aim = new Vector3(0.6, 0.2, 0.7).normalize();
const turned = Matrix.Compose(new Vector3(1, 1, 3), beamRotation(aim), Vector3.Zero());
const tip = Vector3.TransformCoordinates(new Vector3(0, 0, 1), turned).normalize();
expect(Vector3.Dot(tip, aim) > 0.99, "the beam's tip points at the target, not back toward the engines");

expect(mineFiring(0, 0) && mineFiring(MINE_FIRE_SECONDS - 0.01, 0), "a mine fires through its burst");
expect(!mineFiring(MINE_FIRE_SECONDS, 0) && !mineFiring(MINE_FIRE_PERIOD - 0.01, 0), "a mine rests after the burst");
expect(mineFiring(MINE_FIRE_PERIOD, 0), "the burst starts again on the period");
expect(!mineFiring(0, MINE_FIRE_SECONDS) && mineFiring(MINE_FIRE_PERIOD - MINE_FIRE_SECONDS, MINE_FIRE_SECONDS), "a phase shifts when the burst falls");

const span = mineBeamSpan(new Vector3(10, 0, 0), new Vector3(0, 0, 0), 4, 0.5);
expect(span != null && Math.abs(span.from.x - 9.5) < 1e-6 && Math.abs(span.to.x - 4) < 1e-6, "the shot leaves the inner face and stops on the surface");
expect(mineBeamSpan(new Vector3(3, 0, 0), new Vector3(0, 0, 0), 4, 0.5) == null, "a mine inside the body does not fire");

const lit = new Vector3();
expect(impactPosition(new Vector3(4, 0, 0), new Vector3(0, 0, 0), Vector3.Zero(), lit) && lit.x > 4, "the impact light sits just off the surface, toward the mine");
expect(Math.abs(lit.y) < 1e-6 && Math.abs(lit.z) < 1e-6, "the impact light stays on the beam");
expect(!impactPosition(new Vector3(1, 0, 0), new Vector3(1, 0, 0), Vector3.Zero(), lit), "a hit on the center has no outward direction");

if (failures.length > 0) {
	console.error(failures.join("\n"));
	process.exit(1);
}
console.log("the siphon beam ends on the near face of the block");

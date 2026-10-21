import { FULL_TURN, plumesFor, type Plumes } from "./thrust";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

function dark(plumes: Plumes, except: (keyof Plumes)[]): boolean {
	const keys: (keyof Plumes)[] = ["main", "port", "starboard", "dorsal", "ventral"];
	return keys.every((key) => (except.includes(key) ? plumes[key] > 0 : plumes[key] === 0));
}

const idle = plumesFor("impulse", 0, 0, 1);
expect(idle.main === 0 && idle.port === 0 && idle.starboard === 0 && idle.dorsal === 0 && idle.ventral === 0, "a straight impulse leg lights nothing");

const starboard = plumesFor("impulse", FULL_TURN, 0, 1);
expect(starboard.starboard === 1, "yawing starboard lights the starboard thruster");
expect(dark(starboard, ["starboard"]), "a flat starboard yaw lights only the starboard thruster");

const port = plumesFor("impulse", -FULL_TURN * 0.5, 0, 1);
expect(Math.abs(port.port - 0.5) < 1e-6, "a half port yaw lights the port thruster halfway");
expect(port.starboard === 0 && port.main === 0, "that yaw leaves the starboard thruster and the main engine dark");

const climb = plumesFor("impulse", 0, FULL_TURN, 1);
expect(climb.dorsal === 1 && climb.ventral === 0, "a climb lights only the dorsal thruster");
expect(dark(climb, ["dorsal"]), "a climb lights no other engine");

const dive = plumesFor("impulse", 0, -FULL_TURN * 0.5, 1);
expect(Math.abs(dive.ventral - 0.5) < 1e-6, "a half dive lights the ventral thruster halfway");
expect(dive.dorsal === 0 && dive.port === 0 && dive.starboard === 0, "a dive leaves the other thrusters dark");

const climbTurn = plumesFor("impulse", FULL_TURN, FULL_TURN, 1);
expect(climbTurn.starboard === 1 && climbTurn.dorsal === 1, "a climbing starboard turn lights those two thrusters");
expect(dark(climbTurn, ["starboard", "dorsal"]), "that turn leaves the other thrusters dark");

expect(plumesFor("impulse", 0.01, 0.01, 1).starboard === 0, "a tiny wobble does not light a thruster");
expect(plumesFor("impulse", -0.01, -0.01, 1).port === 0 && plumesFor("impulse", -0.01, -0.01, 1).ventral === 0, "a tiny wobble the other way stays dark");

const burn = plumesFor("photon", FULL_TURN, 0, 0.4);
expect(Math.abs(burn.main - 0.4) < 1e-6, "a photon burn lights the main engine at the burn's strength");
expect(burn.starboard === 1 && burn.port === 0, "the burn still uses the starboard thruster while yawing starboard");
expect(plumesFor("photon", 0, 0, 2).main === 1, "the main engine does not burn harder than full");
expect(plumesFor("photon", 0, 0, -1).main === 0, "a negative burn stays dark");

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

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
expect(starboard.port === 1, "yawing starboard lights the port thruster");
expect(dark(starboard, ["port"]), "a flat starboard yaw lights only the port thruster");

const port = plumesFor("impulse", -FULL_TURN * 0.5, 0, 1);
expect(Math.abs(port.starboard - 0.5) < 1e-6, "a half port yaw lights the starboard thruster halfway");
expect(port.port === 0 && port.main === 0, "that yaw leaves the port thruster and the main engine dark");

const climb = plumesFor("impulse", 0, FULL_TURN, 1);
expect(climb.dorsal === 1 && climb.ventral === 1, "leaving the plane lights the vertical pair");
expect(climb.main === 0 && climb.port === 0 && climb.starboard === 0, "a vertical impulse lights no other engine");

expect(plumesFor("impulse", 0.01, 0.01, 1).port === 0, "a tiny wobble does not light a thruster");

const burn = plumesFor("photon", FULL_TURN, 0, 0.4);
expect(Math.abs(burn.main - 0.4) < 1e-6, "a photon burn lights the main engine at the burn's strength");
expect(burn.port === 1 && burn.starboard === 0, "the burn still uses the port thruster while yawing starboard");
expect(plumesFor("photon", 0, 0, 2).main === 1, "the main engine does not burn harder than full");
expect(plumesFor("photon", 0, 0, -1).main === 0, "a negative burn stays dark");

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

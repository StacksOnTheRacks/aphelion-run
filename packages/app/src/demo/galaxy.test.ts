import { Vector3 } from "@babylonjs/core/Maths/math.vector";

import {
	NEIGHBOR_RANGE,
	NEIGHBOR_REACH,
	NEIGHBORS,
	PERSEUS_PHASE,
	SOL_DISTANCE,
	SOL_ID,
	SOL_POSITION,
	neighborPosition,
	spiralPhase,
} from "./galaxy";
import { placeLabels, type LabelAnchor } from "./labels";

const failures: string[] = [];

function expect(condition: boolean, message: string): void {
	if (!condition) {
		failures.push(message);
	}
}

function named(id: string): Vector3 {
	const neighbor = NEIGHBORS.find((candidate) => candidate.id === id);
	if (!neighbor) {
		throw new Error(`No neighbor ${id}.`);
	}
	return neighborPosition(neighbor);
}

expect(Math.abs(SOL_POSITION.length() - SOL_DISTANCE) < 1e-6, "Sol sits its distance from the galaxy's center");
expect(SOL_POSITION.z < 0 && Math.abs(SOL_POSITION.x) < 1e-6, "Sol sits below the center, as the map draws it");

for (const id of ["alpha-centauri", "sirius", "epsilon-eridani", "procyon", "tau-ceti", "61-cygni"]) {
	expect(
		NEIGHBORS.some((neighbor) => neighbor.id === id),
		`${id} is one of Sol's neighbors`
	);
}
for (const id of ["luhman-16", "wise-0855-0714"]) {
	expect(!NEIGHBORS.some((neighbor) => neighbor.id === id), `${id}, a brown dwarf with no sun, is left out`);
}
for (const id of ["barnards-star", "lalande-21185", "luyten-726-8", "lacaille-9352", "struve-2398", "gj-1061"]) {
	expect(!NEIGHBORS.some((neighbor) => neighbor.id === id), `${id} is left off the map`);
}
expect(!NEIGHBORS.some((neighbor) => neighbor.id === SOL_ID), "Sol is not its own neighbor");
expect(new Set(NEIGHBORS.map((neighbor) => neighbor.id)).size === NEIGHBORS.length, "every neighbor has its own id");

NEIGHBORS.forEach((neighbor, index) => {
	const distance = Vector3.Distance(neighborPosition(neighbor), SOL_POSITION);
	const stretched = (neighbor.distance / NEIGHBOR_RANGE) * NEIGHBOR_REACH;
	expect(Math.abs(distance - stretched) < 1e-6, `${neighbor.label} sits at its distance, stretched by the same factor as the rest`);
	expect(neighbor.distance > 0 && neighbor.distance <= NEIGHBOR_RANGE, `${neighbor.label} is within the range`);
	expect(neighbor.longitude >= 0 && neighbor.longitude < 360, `${neighbor.label} has a longitude in [0, 360)`);
	expect(Math.abs(neighbor.latitude) <= 90, `${neighbor.label} has a latitude in [-90, 90]`);
	expect(index === 0 || NEIGHBORS[index - 1].distance <= neighbor.distance, `${neighbor.label} is listed nearest first`);
});

const towardCenter = SOL_POSITION.negate().normalize();
const toward = (id: string) => named(id).subtract(SOL_POSITION).normalize();
expect(Vector3.Dot(toward("ross-154"), towardCenter) > 0.9, "Ross 154, at longitude 11°, lies toward the galaxy's center");
expect(Vector3.Dot(toward("tau-ceti"), towardCenter) < 0, "Tau Ceti, at longitude 173°, lies away from the center");
expect(named("61-cygni").x < SOL_POSITION.x, "61 Cygni, at longitude 82°, is left of Sol from above");
expect(named("alpha-centauri").x > SOL_POSITION.x, "Alpha Centauri, at longitude 316°, is right of Sol from above");
expect(named("ross-128").y > 0, "Ross 128, at latitude +60°, sits above the disk");
expect(named("tau-ceti").y < 0, "Tau Ceti, at latitude −73°, sits below the disk");
expect(Math.abs(named("alpha-centauri").y) < 1, "Alpha Centauri sits almost in the disk's plane");

const sizes = new Map([
	["a", { width: 60, height: 18 }],
	["b", { width: 60, height: 18 }],
	["c", { width: 60, height: 18 }],
]);
const crowd: LabelAnchor[] = [
	{ id: "a", x: 200, y: 200, radius: 3, away: 0 },
	{ id: "b", x: 204, y: 202, radius: 3, away: 0 },
	{ id: "c", x: 198, y: 206, radius: 3, away: 0 },
];
const placed = placeLabels(crowd, sizes, { width: 400, height: 400 }, [], new Map());
const touching = placed.some((one, index) =>
	placed.some(
		(other, otherIndex) =>
			otherIndex > index &&
			one.box.left < other.box.right &&
			other.box.left < one.box.right &&
			one.box.top < other.box.bottom &&
			other.box.top < one.box.bottom
	)
);
expect(placed.length === 3 && !touching, "names for bodies on top of each other are spread so none overlap");
const chrome = { left: 0, top: 0, right: 400, bottom: 180 };
const belowChrome = placeLabels([{ id: "a", x: 200, y: 190, radius: 3, away: -Math.PI / 2 }], sizes, { width: 400, height: 400 }, [chrome], new Map());
expect(belowChrome[0].box.top >= chrome.bottom, "a name that would run under the chrome is moved clear of it");
const edge = placeLabels([{ id: "a", x: 395, y: 200, radius: 3, away: 0 }], sizes, { width: 400, height: 400 }, [], new Map());
expect(edge[0].box.right <= 400 && edge[0].box.left >= 0, "a name at the screen's edge turns back onto the screen");

const arms = (x: number, z: number) => Math.cos(2 * (spiralPhase(x, z) - PERSEUS_PHASE));
expect(Math.abs(arms(SOL_POSITION.x, SOL_POSITION.z)) < 1e-6, "Sol sits midway between two arms");
const outward = SOL_POSITION.scale(1.2);
const inward = SOL_POSITION.scale(1 / 1.2);
expect(arms(outward.x, outward.z) > 0.9, "the Perseus arm, a major arm, lies just outside Sol");
expect(arms(inward.x, inward.z) < -0.9, "the Sagittarius arm, a minor arm, lies just inside Sol");

if (failures.length > 0) {
	for (const failure of failures) {
		console.error(failure);
	}
	process.exit(1);
}

console.log("Sol and its neighbors sit where the sky puts them, and their names stay clear of each other");

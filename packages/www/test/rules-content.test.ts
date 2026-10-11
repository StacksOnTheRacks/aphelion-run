import assert from "node:assert/strict";
import test from "node:test";

import { EXCEPTIONS, PARTS, ROUTES } from "../src/rules-content";

test("the rules name the giant minerals and the two exceptions", () => {
	const minerals = PARTS.flatMap((part) => (part.mineral ? [part.mineral.name] : []));
	assert.deepEqual(minerals, ["Hydrogen metal", "Helium rain", "Mantle ice", "Storm tar"]);
	assert.deepEqual([...EXCEPTIONS], ["Sun", "Earth"]);
});

test("every ship part names the bodies that feed it", () => {
	const byName = Object.fromEntries(PARTS.map((part) => [part.name, part.bodies]));
	assert.ok(byName["Hull, armor, and guns"]?.includes("Jupiter"));
	assert.ok(byName["Siphon modules"]?.includes("Saturn"));
	assert.ok(byName["Shields"]?.includes("Europa"));
	assert.ok(byName["Energy tanks"]?.includes("Io"));
	assert.ok(byName["Electronic warfare"]?.includes("Titan"));
	assert.equal(ROUTES.length, 3);
});

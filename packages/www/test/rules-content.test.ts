import assert from "node:assert/strict";
import test from "node:test";

import { EXCEPTIONS, ROUTES, WORLDS } from "../src/rules-content";

test("the rules name each world's yield and the two exceptions", () => {
	const byName = Object.fromEntries(WORLDS.map((world) => [world.name, world.minerals]));
	assert.deepEqual(byName.Mercury, ["Ore", "Water"]);
	assert.deepEqual(byName.Venus, ["Ore", "Nitrogen", "Carbon"]);
	assert.deepEqual(byName.Mars, ["Ore", "Carbon", "Water"]);
	assert.deepEqual(byName.Jupiter, ["Hydrogen", "Ore", "Water"]);
	assert.deepEqual(byName.Saturn, ["Hydrogen", "Nitrogen", "Carbon", "Water"]);
	assert.deepEqual(byName.Uranus, ["Hydrogen", "Nitrogen", "Carbon", "Water"]);
	assert.deepEqual(byName.Neptune, ["Hydrogen", "Nitrogen", "Carbon", "Water"]);
	assert.equal(WORLDS.some((world) => world.name === "Europa"), false);
	assert.deepEqual([...EXCEPTIONS], ["Sun", "Earth"]);
});

test("the supply route mines a shared world yield", () => {
	const supply = ROUTES.find((route) => route.title === "Supply");
	assert.ok(supply);
	assert.match(supply.body, /share one yield/);
	assert.equal(ROUTES.length, 3);
});

test("the sell route is the one black market", () => {
	const sell = ROUTES.find((route) => route.title === "Sell");
	assert.ok(sell);
	assert.match(sell.body, /black market/);
	assert.match(sell.body, /Solscrip/);
	assert.equal(sell.body.includes("faction"), false);
});

import assert from "node:assert/strict";
import test from "node:test";

import { GLOSSARY } from "../src/glossary-content";

const entries = GLOSSARY.flatMap((section) => section.entries);
const text = [
	...GLOSSARY.flatMap((section) => [section.title, section.intro ?? ""]),
	...entries.flatMap((entry) => [entry.term, entry.body, ...(entry.also ?? [])]),
].join("\n");

function entry(term: string) {
	return entries.find((item) => item.term === term);
}

test("the glossary locks collector and siphon", () => {
	const collector = entry("Collector");
	const siphon = entry("Siphon");
	assert.ok(collector);
	assert.ok(siphon);
	assert.match(collector.body, /Sun's inner orbit/);
	assert.match(collector.body, /not named/);
	assert.match(collector.body, /theft/);
	assert.match(siphon.body, /collector/);
	assert.match(siphon.body, /siphon level/);
	assert.ok(collector.also?.includes("harvesting satellite"));
});

test("the glossary names the setting and the minerals", () => {
	assert.equal(entry("Sol Systems"), undefined);
	assert.equal(entry("Ashland Marauders"), undefined);
	assert.ok(entry("Solscrip"));
	assert.ok(entry("Cargo"));
	assert.ok(entry("Miner"));
	assert.ok(entry("Warship"));
	assert.ok(entry("Explorer"));
	assert.ok(entry("Hauler"));
	assert.ok(entry("Impulse rocket"));
	assert.ok(entry("Photon rocket"));
	assert.ok(entry("Wormhole"));
	assert.ok(entry("Cloak"));
	assert.ok(entry("Hydrogen"));
	assert.ok(entry("Ore"));
	assert.ok(entry("Nitrogen"));
	assert.ok(entry("Carbon"));
	assert.ok(entry("Water"));
	assert.ok(entry("Energy"));
	assert.ok(entry("World"));
	assert.match(entry("Water")?.body ?? "", /Consumed/);
	assert.match(entry("World")?.body ?? "", /share one yield/);
	assert.match(entry("Recall")?.body ?? "", /Ships are never destroyed/);
	assert.equal(entry("Hydrogen metal"), undefined);
	assert.ok(GLOSSARY.some((section) => section.id === "minerals"));
});

test("the glossary stays inside this fiction", () => {
	assert.equal(/dune|arrakis|fremen|harkonnen|atreides|villeneuve|choam/i.test(text), false);
	assert.equal(text.includes("Sol Systems"), false);
	assert.equal(text.includes("Ashland"), false);
	assert.equal(text.includes("Marauder"), false);
	assert.equal(
		entries.some((item) => /\$|\bprice of \d/.test(item.body)),
		false,
	);
});

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
	assert.match(collector.body, /Sol Systems satellite/);
	assert.match(collector.body, /Sun's inner orbit/);
	assert.match(siphon.body, /collector/);
	assert.match(siphon.body, /siphon level/);
	assert.ok(collector.also?.includes("harvesting satellite"));
});

test("the glossary names the factions, the four minerals, and the unnamed tanks", () => {
	assert.ok(entry("Sol Systems"));
	assert.ok(entry("Ashland Marauders"));
	assert.ok(entry("Hydrogen metal"));
	assert.ok(entry("Helium rain"));
	assert.ok(entry("Mantle ice"));
	assert.ok(entry("Storm tar"));
	assert.ok(entry("Energy"));
	assert.ok(entry("Cash"));
	assert.match(entry("Energy tanks")?.body ?? "", /no name yet/);
	assert.ok(GLOSSARY.some((section) => section.id === "materials"));
});

test("the glossary stays inside this fiction", () => {
	assert.equal(/dune|arrakis|fremen|harkonnen|atreides|villeneuve|choam/i.test(text), false);
	assert.equal(
		entries.some((item) => /\$|\bprice of \d/.test(item.body)),
		false,
	);
});

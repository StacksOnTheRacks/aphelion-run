import assert from "node:assert/strict";
import test from "node:test";

import { NEVER, PALETTE, READ, STYLE, YIELDS } from "../src/style-content";

const text = [
	...STYLE.flatMap((chapter) => [chapter.title, ...chapter.paragraphs]),
	...NEVER,
	...PALETTE.map((swatch) => `${swatch.name} ${swatch.role}`),
	...YIELDS.map((item) => `${item.name} ${item.look}`),
	...READ.map((item) => `${item.must} ${item.how}`),
].join("\n");

test("the style bible keeps the quiet field and unnamed class drawings", () => {
	assert.match(text, /silhouettes are not designed yet/i);
	assert.ok(text.includes("Miner"));
	assert.ok(text.includes("Hydrogen metal"));
	assert.ok(text.includes("Helium rain"));
	assert.ok(text.includes("Mantle ice"));
	assert.ok(text.includes("Storm tar"));
	assert.ok(text.includes("Solscrip"));
	assert.equal(text.includes("Sol Systems"), false);
	assert.equal(text.includes("Ashland"), false);
	assert.equal(text.includes("Marauder"), false);
	assert.ok(NEVER.length >= 4);
	assert.equal(READ.length, 4);
	assert.ok(PALETTE.some((swatch) => swatch.name === "Field" && swatch.hex === "#000000"));
	assert.ok(PALETTE.some((swatch) => swatch.name === "Amber"));
});

test("the style bible stays inside this fiction", () => {
	assert.equal(/dune|arrakis|fremen|harkonnen|atreides|villeneuve|choam/i.test(text), false);
	assert.equal(text.includes("jury-rigged"), false);
	assert.equal(
		STYLE.some((chapter) => /\$|\bprice of \d/.test(chapter.paragraphs.join(" "))),
		false,
	);
});

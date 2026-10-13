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

test("the style bible keeps the two designs and the quiet field", () => {
	assert.ok(text.includes("Sol Systems"));
	assert.ok(text.includes("Ashland Marauders"));
	assert.match(text, /same harvest/i);
	assert.match(text, /do not have the drawings/);
	assert.ok(text.includes("Hydrogen metal"));
	assert.ok(text.includes("Helium rain"));
	assert.ok(text.includes("Mantle ice"));
	assert.ok(text.includes("Storm tar"));
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

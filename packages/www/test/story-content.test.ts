import assert from "node:assert/strict";
import test from "node:test";

import { STORY } from "../src/story-content";

const text = STORY.flatMap((chapter) => [chapter.title, ...chapter.paragraphs]).join("\n");

test("the story says why both factions fly the same route", () => {
	assert.ok(text.includes("Sol Systems"));
	assert.ok(text.includes("Ashland Marauders"));
	assert.ok(text.includes("hydrogen metal"));
	assert.ok(text.includes("helium rain"));
	assert.ok(text.includes("mantle ice"));
	assert.ok(text.includes("storm tar"));
	assert.ok(text.includes("The Sun is where energy is mined."));
	assert.ok(text.includes("Earth is where energy is sold."));
	assert.ok(text.includes("Ships are never destroyed."));
	assert.match(text, /same materials/);
	assert.match(text, /not from the same design/);
	assert.match(text, /must use Sol's blueprints/);
	assert.match(text, /at least one material but no more than two/);
	assert.match(text, /besides Earth or the Sun/);
	assert.match(text, /The only defense is a cloak/);
	assert.equal(text.includes("jury-rigged"), false);
	assert.equal(text.includes("Earth's orbit, the ship comes back"), false);
	assert.equal(
		STORY.some((chapter) => /\$|\bprice of \d/.test(chapter.paragraphs.join(" "))),
		false,
	);
});

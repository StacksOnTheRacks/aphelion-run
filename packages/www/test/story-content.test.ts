import assert from "node:assert/strict";
import test from "node:test";

import { STORY } from "../src/story-content";

const text = STORY.flatMap((chapter) => [chapter.title, ...chapter.paragraphs]).join("\n");

test("the story is the short setting", () => {
	assert.match(text, /human who lives in space/);
	assert.match(text, /starts with one ship/);
	assert.ok(text.includes("Solscrip"));
	assert.ok(text.includes("one space in the hold"));
	assert.ok(text.includes("black market"));
	assert.ok(text.includes("Earth"));
	assert.ok(text.includes("Miner"));
	assert.ok(text.includes("Warship"));
	assert.ok(text.includes("Explorer"));
	assert.ok(text.includes("Hauler"));
	assert.match(text, /impulse rocket/);
	assert.match(text, /photon rocket/);
	assert.match(text, /wormhole/);
	assert.match(text, /company is not named/);
	assert.match(text, /theft/);
	assert.equal(text.includes("Sol Systems"), false);
	assert.equal(text.includes("Ashland"), false);
	assert.equal(text.includes("Marauder"), false);
	assert.equal(
		STORY.some((chapter) => /\$|\bprice of \d/.test(chapter.paragraphs.join(" "))),
		false,
	);
});

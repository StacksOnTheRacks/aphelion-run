import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const appSrc = path.join(root, "packages/app/src");
const wwwPublic = path.join(root, "packages/www/public");

function files(dir: string): string[] {
	return readdirSync(dir, { recursive: true }).flatMap((entry) => {
		const full = path.join(dir, String(entry));
		return statSync(full).isDirectory() ? [] : [full];
	});
}

test("the published site serves every public asset the game requests", () => {
	const requested = new Set<string>();
	for (const file of files(appSrc)) {
		if (!file.endsWith(".ts") && !file.endsWith(".tsx")) continue;
		const text = readFileSync(file, "utf8");
		for (const match of text.matchAll(/["'](\/(?:hud|models)\/[^"']+)["']/g)) {
			requested.add(match[1]);
		}
	}
	assert.ok(requested.size > 0, "the game requests public assets");
	for (const asset of requested) {
		const published = path.join(wwwPublic, asset);
		assert.equal(statSync(published, { throwIfNoEntry: false })?.isFile(), true, `${asset} is missing from the published site`);
	}
});

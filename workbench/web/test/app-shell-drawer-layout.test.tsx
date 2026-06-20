import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("App shell drawer layout", () => {
	it("uses desktop drawer reflow and narrow overlay contracts", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.app-body\[data-drawer-open="true"\][\s\S]*\.shell-main/);
		assert.match(css, /\.shell-main[\s\S]*min-width:\s*0/);
		assert.match(css, /\.drawer-panel-open[\s\S]*width:\s*var\(--drawer-width/);
		assert.match(css, /@media \(max-width:\s*1023px\)[\s\S]*\.drawer-panel-open[\s\S]*position:\s*fixed/);
		assert.match(css, /@media \(max-width:\s*1023px\)[\s\S]*\.drawer-panel-open[\s\S]*inset:\s*60px 0 0 auto/);
	});
});

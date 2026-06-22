import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
	CHAT_INPUT_HORIZONTAL_PADDING,
	DEFAULT_DRAWER_WIDTH,
	MIN_COMPOSER_WIDTH,
	clampDrawerWidthForViewport,
} from "../src/lib/drawer-layout";

describe("App shell drawer layout", () => {
	it("uses desktop drawer reflow and narrow overlay contracts", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.app-body\[data-drawer-open="true"\][\s\S]*\.shell-main/);
		assert.match(css, /\.shell-main[\s\S]*min-width:\s*0/);
		assert.match(css, /\.drawer-panel-open[\s\S]*width:\s*var\(--drawer-width/);
		assert.match(css, /\.app-body\[data-graph-drawer-overlay="true"\]\s+\.drawer-panel-open[\s\S]*position:\s*absolute/);
		assert.match(css, /\.app-body\[data-graph-drawer-overlay="true"\]\s+\.drawer-panel-open[\s\S]*inset:\s*0 0 0 auto/);
		assert.doesNotMatch(css, /@media \(max-width:\s*1180px\)[\s\S]*\.drawer-panel-open[\s\S]*position:\s*fixed/);
		assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*\.drawer-panel-open[\s\S]*position:\s*fixed/);
		assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*\.drawer-panel-open[\s\S]*inset:\s*60px 0 0 auto/);
		assert.doesNotMatch(css, /@media \(max-width:\s*768px\)[\s\S]*\.shell-sidebar[\s\S]*display:\s*none/);
		assert.match(css, /\.drawer-panel\.drawer-panel-fullscreen[\s\S]*inset:\s*0/);
	});

	it("clamps the default drawer width so the V2 composer stays usable on 1024px desktop", () => {
		const drawerWidth = clampDrawerWidthForViewport(DEFAULT_DRAWER_WIDTH, {
			viewportWidth: 1024,
			sidebarWidth: 252,
		});
		const composerWidth = 1024 - 252 - drawerWidth - CHAT_INPUT_HORIZONTAL_PADDING;

		assert.equal(drawerWidth, 320);
		assert.equal(composerWidth, MIN_COMPOSER_WIDTH);
	});

	it("keeps the right drawer readable when it switches to overlay on narrow screens", () => {
		const drawerWidth = clampDrawerWidthForViewport(DEFAULT_DRAWER_WIDTH, {
			viewportWidth: 768,
			sidebarWidth: 252,
		});

		assert.equal(drawerWidth, DEFAULT_DRAWER_WIDTH);
	});
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RightDrawer } from "../src/components/RightDrawer";
import { graphSelectionDrawer, type DrawerState } from "../src/lib/drawer-state";
import type { Selection } from "@llm-wiki/graph-engine";

describe("RightDrawer graph selection group drawer", () => {
	it("renders multi-node selections through the same group drawer skeleton", () => {
		const html = renderDrawer(graphSelectionDrawer(selectionFixture(), "选区"));

		assert.match(html, /data-testid="graph-selection-drawer"/);
		assert.match(html, /选区/);
		assert.match(html, /总结这一簇/);
		assert.match(html, /找知识缺口/);
		assert.match(html, /生成主题页/);
		assert.match(html, /探索潜在关系/);
		assert.match(html, /补充说明（可选）/);
		assert.match(html, /发送/);
		assert.match(html, /新对话/);
		assert.match(html, /当前选区会带入对话/);
		assert.match(html, /data-group-drawer="true"/);
		assert.doesNotMatch(html, /graph-selection-actions/);
		assert.doesNotMatch(html, /查看全部|收起/);
	});

	it("disables send until free text exists and enables it once typed", () => {
		const empty = renderDrawer(graphSelectionDrawer(selectionFixture(), "选区"));
		assert.match(empty, /<button[^>]*data-group-drawer="send"[^>]*disabled/);
		const filled = renderDrawer(graphSelectionDrawer(selectionFixture(), "选区", "看一下缺口"));
		assert.doesNotMatch(filled, /<button[^>]*data-group-drawer="send"[^>]*disabled/);
	});
});

function renderDrawer(drawer: DrawerState): string {
	return renderToStaticMarkup(
		React.createElement(RightDrawer, {
			drawer,
			fullscreen: false,
			width: 420,
			defaultWidth: 420,
			onSelectArtifact: noopString,
			onOpenPage: noopString,
			onWikiLinkSeen: noopString,
			onGraphReaderAction: noopString,
			onGraphSummaryCommand: noopCommand,
			onGraphSummaryNodePreview: noopPreviewNode,
			onGraphSelectionTextChange: noopString,
			onGraphSelectionAsk: noopSelectionAsk,
			onGraphCommunityTextChange: noopString,
			onGraphCommunityAsk: noopSelectionAsk,
			onResize: noopNumber,
			onToggleFullscreen: noop,
			onClose: noopClose,
		}),
	);
}

function selectionFixture(): Selection {
	return {
		id: "nodes:a,b",
		nodeIds: ["a", "b"],
		communityIds: ["alpha", "beta"],
		facts: { pageCount: 2, internalLinkCount: 1, communityCount: 2, isolatedCount: 0 },
		input: { kind: "nodes", ids: ["a", "b"] },
		actions: [],
	};
}

function noop() {}
function noopString() {}
function noopNumber() {}
function noopCommand() {}
function noopPreviewNode() {}
function noopSelectionAsk() {}
function noopClose() {}

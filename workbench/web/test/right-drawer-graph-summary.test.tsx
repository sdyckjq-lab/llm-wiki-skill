import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RightDrawer } from "../src/components/RightDrawer";
import {
	graphCommunitySummaryDrawer,
	graphEmptyDrawer,
	graphErrorDrawer,
	graphExcludedObjectDrawer,
	graphLoadingDrawer,
	graphNodeSummaryDrawer,
	graphReaderDrawer,
	graphUnavailableObjectDrawer,
	type DrawerState,
} from "../src/lib/drawer-state";
import type {
	GraphCommunitySummaryPayload,
	GraphExcludedObjectPayload,
	GraphNodeSummaryPayload,
	GraphUnavailableObjectPayload,
} from "@llm-wiki/graph-engine";

describe("RightDrawer graph lightweight summaries", () => {
	it("renders node summary fields and actions without full reader markdown", () => {
		const html = renderDrawer(graphNodeSummaryDrawer(nodeSummaryFixture()));

		assert.match(html, /data-testid="graph-node-summary"/);
		assert.match(html, /Alpha node/);
		assert.match(html, /节点/);
		assert.match(html, /连接/);
		assert.match(html, /graph-summary-community-chip/);
		assert.match(html, /graph-summary-relation-pill/);
		assert.match(html, /打开详情/);
		assert.match(html, /固定位置/);
		assert.doesNotMatch(html, /full markdown body should stay out of summaries/);
		assert.doesNotMatch(html, /graph-reader-drawer/);
		assert.doesNotMatch(html, /summary-left-rail|ai-slop|border-left/);
	});

	it("renders unified community drawer with overview, fixed actions, core nodes, and dialogue controls", () => {
		const html = renderDrawer(graphCommunitySummaryDrawer(communitySummaryFixture()));

		assert.match(html, /data-testid="graph-community-summary"/);
		assert.match(html, /Alpha community/);
		assert.match(html, /进入社区/);
		assert.match(html, /总结这一簇/);
		assert.match(html, /找知识缺口/);
		assert.match(html, /生成主题页/);
		assert.match(html, /探索潜在关系/);
		assert.match(html, /补充说明（可选）/);
		assert.match(html, /发送/);
		assert.match(html, /新对话/);
		assert.match(html, /Alpha node/);
		assert.match(html, /当前社区会带入对话/);
		assert.match(html, /graph-group-node-toggle/);
		assert.match(html, /data-group-drawer="send"[\s\S]*<svg/);
		assert.match(html, /data-group-drawer="new-conversation"[\s\S]*<svg/);
		assert.doesNotMatch(html, /暂无搜索命中/);
		assert.doesNotMatch(html, /暂无固定节点/);
		assert.doesNotMatch(html, /暂无桥接关系/);
	});

	it("renders ungrouped community without enter-community and recommends relation exploration", () => {
		const html = renderDrawer(graphCommunitySummaryDrawer(communitySummaryFixture({
			communityId: "_none",
			label: "未分组",
			structureState: "ungrouped",
			description: "这些页面暂未形成明确社区。你可以让 agent 探索它们之间是否存在潜在关系。",
			canEnterCommunity: false,
			commands: [],
		})));

		assert.match(html, /未分组/);
		assert.match(html, /暂未形成明确社区/);
		assert.match(html, /当前社区会带入对话/);
		assert.match(html, /data-recommended="true"[^>]*>[\s\S]*探索潜在关系/);
		assert.doesNotMatch(html, /进入社区/);
	});

	it("disables send until free text exists and enables it once typed", () => {
		const empty = renderDrawer(graphCommunitySummaryDrawer(communitySummaryFixture()));
		assert.match(empty, /<button[^>]*data-group-drawer="send"[^>]*disabled/);
		const filled = renderDrawer(graphCommunitySummaryDrawer(communitySummaryFixture(), "看一下缺口"));
		assert.doesNotMatch(filled, /<button[^>]*data-group-drawer="send"[^>]*disabled/);
	});

	it("renders graph empty, excluded, and unavailable states", () => {
		const empty = renderDrawer(graphEmptyDrawer("没有搜索结果", "no-search-results", "暂无搜索结果"));
		const missingNeighbors = renderDrawer(graphEmptyDrawer("没有邻居", "missing-neighbors", "暂无邻居"));
		const missingCommunity = renderDrawer(graphEmptyDrawer("没有社区摘要", "missing-community-summary", "暂无社区摘要"));
		const missingStrongRelations = renderDrawer(graphEmptyDrawer("没有强关系", "missing-strong-relations", "暂无强关系"));
		const excluded = renderDrawer(graphExcludedObjectDrawer(excludedFixture()));
		const unavailable = renderDrawer(graphUnavailableObjectDrawer(unavailableFixture()));

		assert.match(empty, /没有搜索结果/);
		assert.match(empty, /暂无搜索结果/);
		assert.match(missingNeighbors, /暂无邻居/);
		assert.match(missingCommunity, /暂无社区摘要/);
		assert.match(missingStrongRelations, /暂无强关系/);
		assert.match(excluded, /data-testid="graph-excluded-object"/);
		assert.match(excluded, /暂不可见/);
		assert.match(excluded, /当前筛选暂时隐藏了这个对象/);
		assert.match(excluded, /显示这个对象/);
		assert.match(excluded, /清除临时显示/);
		assert.match(unavailable, /data-testid="graph-unavailable-object"/);
		assert.match(unavailable, /missing-node/);
		assert.match(unavailable, /这个节点当前不可用/);
	});

	it("renders loading, reader loading, reader error, and hard error states honestly", () => {
		const loading = renderDrawer(graphLoadingDrawer("整理图谱摘要", "正在整理当前对象"));
		const readerLoading = renderDrawer(graphReaderDrawer(graphPayload(), { loading: true }));
		const readerError = renderDrawer(graphReaderDrawer(graphPayload(), { error: "读取失败" }));
		const hardError = renderDrawer(graphErrorDrawer("图谱错误", "图谱服务暂时不可用"));

		assert.match(loading, /data-testid="graph-simple-state"/);
		assert.match(loading, /整理图谱摘要/);
		assert.match(loading, /正在整理当前对象/);
		assert.match(readerLoading, /graph-reader-drawer/);
		assert.match(readerLoading, /加载中/);
		assert.doesNotMatch(readerLoading, /完整正文内容/);
		assert.match(readerError, /读取失败/);
		assert.doesNotMatch(readerError, /完整正文内容/);
		assert.match(hardError, /图谱错误/);
		assert.match(hardError, /图谱服务暂时不可用/);
		assert.doesNotMatch(`${loading}${readerLoading}${readerError}${hardError}`, /推荐阅读|猜你喜欢|建议你打开/);
	});

	it("keeps drawer actions as tabbable buttons", () => {
		const node = renderDrawer(graphNodeSummaryDrawer(nodeSummaryFixture()));
		const community = renderDrawer(graphCommunitySummaryDrawer(communitySummaryFixture()));
		const excluded = renderDrawer(graphExcludedObjectDrawer(excludedFixture()));

		assert.match(node, /<button[^>]*class="graph-summary-action"[^>]*>打开详情<\/button>/);
		assert.match(node, /<button[^>]*class="graph-summary-action"[^>]*>固定位置<\/button>/);
		assert.match(community, /<button[^>]*class="graph-group-enter"[^>]*>进入社区<\/button>/);
		assert.match(community, /<button[^>]*class="graph-group-action"[^>]*data-group-drawer="action"[^>]*>总结这一簇<\/button>/);
		assert.match(excluded, /<button[^>]*class="graph-summary-action"[^>]*>显示这个对象<\/button>/);
		assert.doesNotMatch(`${node}${community}${excluded}`, /tabindex="-1"/i);
	});

	it("keeps the Paper summary styling contract", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.graph-summary-drawer[\s\S]*border-radius:\s*16px/);
		assert.match(css, /\.graph-summary-drawer[\s\S]*var\(--paper-grain\)/);
		assert.match(css, /\.graph-summary-drawer[\s\S]*box-shadow:\s*var\(--shadow-lg\)/);
		assert.match(css, /\.graph-summary-community-chip::before[\s\S]*width:\s*7px/);
		assert.match(css, /\.graph-summary-relation-pill[\s\S]*border-radius:\s*999px/);
		assert.match(css, /\.graph-summary-action[\s\S]*box-shadow:\s*var\(--shadow\)/);
		assert.doesNotMatch(css, /--app-shadow-color/);
		assert.doesNotMatch(css, /summary-left-rail|ai-slop/);
	});

	it("keeps the graph group drawer visual contract", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.graph-group-node-toggle[\s\S]*color:\s*var\(--app-accent-deep\)/);
		assert.match(css, /\.graph-group-node:hover[\s\S]*border-color:\s*color-mix\(in srgb, var\(--app-accent\)/);
		assert.match(css, /\.graph-group-node:focus-visible[\s\S]*(box-shadow|outline)/);
		assert.match(css, /\.graph-selection-context-hint[\s\S]*color:\s*var\(--app-muted\)/);
		assert.match(css, /\.graph-selection-context-hint span[\s\S]*background:\s*var\(--app-success\)/);
		assert.match(css, /\.graph-selection-footer[\s\S]*grid-template-columns:/);
		assert.match(css, /\.graph-selection-footer[\s\S]*minmax\(0,\s*1fr\)/);
		assert.match(css, /\.graph-selection-send[\s\S]*background:\s*var\(--app-accent\)/);
		assert.match(css, /\.graph-selection-send svg[\s\S]*width:\s*13px/);
		assert.match(css, /\.graph-selection-secondary[\s\S]*background:\s*var\(--app-raised\)/);
		assert.match(css, /\.graph-selection-send:hover:not\(:disabled\)|\.graph-selection-send:focus-visible/);
		assert.doesNotMatch(css, /搜索命中明细|桥接关系列表|固定节点明细/);
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

function nodeSummaryFixture(): GraphNodeSummaryPayload {
	return {
		kind: "node-summary",
		object: { kind: "node", nodeId: "alpha-node" },
		nodeId: "alpha-node",
		label: "Alpha node",
		type: "topic",
		communityId: "alpha",
		sourcePath: "wiki/alpha.md",
		summary: "short excerpt only",
		connectionCount: 3,
		searchHit: true,
		pinHint: { nodeId: "alpha-node", wikiPath: "wiki/alpha.md", pinned: false, position: null },
		selection: {
			input: { kind: "node", id: "alpha-node" },
			selectionId: "node:alpha-node",
			selectedNodeIds: ["alpha-node"],
			selectedCommunityIds: ["alpha"],
			containsCurrentObject: true,
		},
		strongestRelations: [
			{
				edgeId: "alpha-beta",
				fromNodeId: "alpha-node",
				toNodeId: "beta-node",
				relationType: "依赖",
				confidence: "EXTRACTED",
				weight: 1,
				bridge: false,
			},
		],
		bridgeRelations: [],
		aggregationMarkers: [],
		commands: [
			{ kind: "open-detail-read", nodeId: "alpha-node", path: "wiki/alpha.md", label: "打开详情" },
			{ kind: "select-neighbors", nodeId: "alpha-node", label: "+邻居" },
			{ kind: "set-fixed-position", mode: "fix", nodeId: "alpha-node", wikiPath: "wiki/alpha.md", label: "固定位置" },
		],
	};
}

function graphPayload() {
	return {
		path: "wiki/alpha.md",
		node: {
			id: "alpha-node",
			title: "Alpha node",
			type: "topic",
			typeLabel: "主题",
			sourcePath: "wiki/alpha.md",
			community: "alpha",
			date: "2026-06-18",
			source: "fixture",
			isolated: false,
		},
	};
}

function communitySummaryFixture(overrides: Partial<GraphCommunitySummaryPayload> = {}): GraphCommunitySummaryPayload {
	return {
		kind: "community-summary",
		object: { kind: "community", communityId: "alpha" },
		communityId: "alpha",
		label: "Alpha community",
		nodeCount: 12,
		facts: { pageCount: 12, internalLinkCount: 8, communityCount: 1, isolatedCount: 1 },
		structureState: "clear",
		description: "这组页面围绕同一主题聚在一起。你可以先看结构，也可以直接让 agent 基于这一组页面继续工作。",
		canEnterCommunity: true,
		coreNodeIds: ["alpha-node", "beta-node", "gamma-node", "delta-node"],
		coreNodes: [
			{ nodeId: "alpha-node", label: "Alpha node", type: "topic", role: "核心" },
			{ nodeId: "beta-node", label: "Beta node", type: "entity", role: "相关" },
			{ nodeId: "gamma-node", label: "Gamma node", type: "source", role: "相关" },
			{ nodeId: "delta-node", label: "Delta node", type: "entity", role: "相关" },
		],
		searchResultIds: ["beta-node"],
		pinHints: [
			{ nodeId: "gamma-node", wikiPath: "wiki/gamma.md", pinned: true, position: { x: 12, y: 18, coordinateSpace: "world" } },
		],
		selection: {
			input: { kind: "community", id: "alpha" },
			selectionId: "community:alpha",
			selectedNodeIds: ["alpha-node", "beta-node"],
			selectedCommunityIds: ["alpha"],
			containsCurrentObject: true,
		},
		strongestRelations: [],
		bridgeRelations: [],
		aggregationMarkers: [],
		commands: [
			{ kind: "enter-community", communityId: "alpha", label: "进入社区" },
		],
		...overrides,
	};
}

function unavailableFixture(): GraphUnavailableObjectPayload {
	return {
		kind: "unavailable-object",
		object: { kind: "node", nodeId: "missing-node" },
		reason: "missing-node",
		selection: {
			input: null,
			selectionId: null,
			selectedNodeIds: [],
			selectedCommunityIds: [],
			containsCurrentObject: false,
		},
		searchResultIds: [],
		pinHints: [],
		aggregationMarkers: [],
		commands: [],
	};
}

function excludedFixture(): GraphExcludedObjectPayload {
	return {
		kind: "excluded-object",
		object: { kind: "node", nodeId: "filtered-node" },
		reason: "filter",
		selection: {
			input: { kind: "node", id: "filtered-node" },
			selectionId: "node:filtered-node",
			selectedNodeIds: ["filtered-node"],
			selectedCommunityIds: ["alpha"],
			containsCurrentObject: true,
		},
		searchResultIds: [],
		pinHints: [],
		aggregationMarkers: [],
		commands: [
			{ kind: "show-this-object", object: { kind: "node", nodeId: "filtered-node" }, label: "显示这个对象" },
			{ kind: "clear-temporary-object-display", label: "清除临时显示" },
		],
	};
}

function noop() {}
function noopString() {}
function noopNumber() {}
function noopCommand() {}
function noopPreviewNode() {}
function noopSelectionAsk() {}
function noopClose() {}

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type {
	GraphCommunitySummaryPayload,
	GraphGlobalOverviewPayload,
	GraphNodeSummaryPayload,
	GraphOpenPagePayload,
	GraphSearchResultsPayload,
	GraphUnavailableObjectPayload,
	Selection,
} from "@llm-wiki/graph-engine";
import {
	artifactDrawer,
	closedDrawer,
	graphCommunitySummaryDrawer,
	graphEmptyDrawer,
	graphErrorDrawer,
	graphGlobalOverviewDrawer,
	graphLoadingDrawer,
	graphNodeSummaryDrawer,
	graphReaderDrawer,
	graphSearchResultsDrawer,
	graphSelectionDrawer,
	graphUnavailableObjectDrawer,
	wikiDrawer,
} from "../src/lib/drawer-state";

describe("drawer state", () => {
	it("creates mutually exclusive closed, wiki, artifact, and graph reader states", () => {
		const payload = graphPayload();

		assert.deepEqual(closedDrawer(), { mode: "closed" });
		assert.deepEqual(wikiDrawer("wiki/topics/a.md", { loading: true }), {
			mode: "wiki",
			path: "wiki/topics/a.md",
			content: "",
			loading: true,
			error: null,
		});
		assert.deepEqual(artifactDrawer([], "artifact-1"), {
			mode: "artifacts",
			artifacts: [],
			activeArtifactId: "artifact-1",
		});
		assert.deepEqual(graphReaderDrawer(payload, { content: "# Alpha" }), {
			mode: "graph-reader",
			payload,
			content: "# Alpha",
			loading: false,
			error: null,
			filteredHidden: false,
		});
		assert.deepEqual(graphReaderDrawer(payload, { content: "# Alpha" }, { filteredHidden: true }), {
			mode: "graph-reader",
			payload,
			content: "# Alpha",
			loading: false,
			error: null,
			filteredHidden: true,
		});
		assert.deepEqual(graphSelectionDrawer(selectionFixture(), "Alpha", "note"), {
			mode: "graph-selection",
			title: "Alpha",
			selection: selectionFixture(),
			freeText: "note",
		});
	});

	it("creates every lightweight graph drawer state with distinct modes and titles", () => {
		const node = nodeSummaryFixture();
		const community = communitySummaryFixture();
		const search = searchResultsFixture();
		const global = globalOverviewFixture();
		const unavailable = unavailableFixture();

		assert.deepEqual(graphNodeSummaryDrawer(node), {
			mode: "graph-node-summary",
			payload: node,
		});
		assert.deepEqual(graphCommunitySummaryDrawer(community), {
			mode: "graph-community-summary",
			payload: community,
			freeText: "",
		});
		assert.deepEqual(graphSearchResultsDrawer(search), {
			mode: "graph-search-results",
			payload: search,
		});
		assert.deepEqual(graphGlobalOverviewDrawer(global), {
			mode: "graph-global-overview",
			payload: global,
		});
		assert.deepEqual(graphUnavailableObjectDrawer(unavailable), {
			mode: "graph-unavailable-object",
			payload: unavailable,
		});
		assert.deepEqual(graphLoadingDrawer("图谱摘要", "整理中"), {
			mode: "graph-loading",
			title: "图谱摘要",
			message: "整理中",
		});
		assert.deepEqual(graphEmptyDrawer("没有强关系", "missing-strong-relations", "暂无强关系"), {
			mode: "graph-empty",
			title: "没有强关系",
			reason: "missing-strong-relations",
			message: "暂无强关系",
		});
		assert.deepEqual(graphEmptyDrawer("没有邻居", "missing-neighbors", "暂无邻居").reason, "missing-neighbors");
		assert.deepEqual(graphEmptyDrawer("没有社区摘要", "missing-community-summary", "暂无社区摘要").reason, "missing-community-summary");
		assert.deepEqual(graphEmptyDrawer("没有搜索结果", "no-search-results", "暂无搜索结果").reason, "no-search-results");
		assert.deepEqual(graphErrorDrawer("图谱错误", "摘要生成失败"), {
			mode: "graph-error",
			title: "图谱错误",
			message: "摘要生成失败",
		});
	});
});

function graphPayload(): GraphOpenPagePayload {
	return {
		path: "wiki/topics/a.md",
		node: {
			id: "a",
			title: "Alpha",
			type: "topic",
			typeLabel: "主题",
			sourcePath: "wiki/topics/a.md",
			community: "alpha",
			date: "2026-06-13",
			source: "Archive",
			isolated: false,
		},
	};
}

function selectionFixture(): Selection {
	return {
		id: "selection-test",
		nodeIds: ["a"],
		communityIds: [],
		facts: {
			pageCount: 1,
			internalLinkCount: 0,
			communityCount: 1,
			isolatedCount: 0,
		},
		input: { kind: "node", id: "a" },
		actions: [
			{ id: "summarize_page", label: "总结这一页", tone: "digest" },
		],
	};
}

function nodeSummaryFixture(): GraphNodeSummaryPayload {
	return {
		kind: "node-summary",
		object: { kind: "node", nodeId: "a" },
		nodeId: "a",
		label: "Alpha",
		type: "topic",
		communityId: "alpha",
		sourcePath: "wiki/a.md",
		summary: "short summary",
		connectionCount: 2,
		searchHit: true,
		pinHint: { nodeId: "a", wikiPath: "wiki/a.md", pinned: false, position: null },
		selection: {
			input: { kind: "node", id: "a" },
			selectionId: "node:a",
			selectedNodeIds: ["a"],
			selectedCommunityIds: ["alpha"],
			containsCurrentObject: true,
		},
		strongestRelations: [],
		bridgeRelations: [],
		aggregationMarkers: [],
		commands: [
			{ kind: "open-detail-read", nodeId: "a", path: "wiki/a.md", label: "打开详情" },
		],
	};
}

function communitySummaryFixture(): GraphCommunitySummaryPayload {
	return {
		kind: "community-summary",
		object: { kind: "community", communityId: "alpha" },
		communityId: "alpha",
		label: "Alpha community",
		nodeCount: 2,
		coreNodeIds: ["a"],
		searchResultIds: [],
		pinHints: [],
		selection: {
			input: { kind: "community", id: "alpha" },
			selectionId: "community:a,b",
			selectedNodeIds: ["a", "b"],
			selectedCommunityIds: ["alpha"],
			containsCurrentObject: true,
		},
		strongestRelations: [],
		bridgeRelations: [],
		aggregationMarkers: [],
		commands: [
			{ kind: "enter-community", communityId: "alpha", label: "进入社区" },
		],
	};
}

function searchResultsFixture(): GraphSearchResultsPayload {
	return {
		kind: "search-results",
		query: "alpha",
		searchResultIds: ["a"],
		visibleResultIds: ["a"],
		unavailableResultIds: [],
		selection: {
			input: null,
			selectionId: null,
			selectedNodeIds: [],
			selectedCommunityIds: [],
			containsCurrentObject: false,
		},
		pinHints: [],
		aggregationMarkers: [],
		commands: [],
	};
}

function globalOverviewFixture(): GraphGlobalOverviewPayload {
	return {
		kind: "global-overview",
		nodeCount: 2,
		edgeCount: 1,
		communityCount: 1,
		coreNodeIds: ["a"],
		searchResultIds: [],
		pinHints: [],
		selection: {
			input: null,
			selectionId: null,
			selectedNodeIds: [],
			selectedCommunityIds: [],
			containsCurrentObject: false,
		},
		aggregationMarkers: [],
		commands: [],
	};
}

function unavailableFixture(): GraphUnavailableObjectPayload {
	return {
		kind: "unavailable-object",
		object: { kind: "node", nodeId: "missing" },
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

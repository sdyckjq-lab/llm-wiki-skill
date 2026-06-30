import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	graphCommunityDrawerViewModel,
	graphGroupDrawerPromptAction,
	graphSelectionGroupDrawerViewModel,
	groupDrawerActionById,
} from "../src/lib/graph-group-drawer";
import type { GraphCommunitySummaryPayload, Selection } from "@llm-wiki/graph-engine";

describe("graph group drawer view model", () => {
	it("keeps normal community actions stable and enter-community available", () => {
		const view = graphCommunityDrawerViewModel(summaryFixture({
			coreNodeIds: ["a", "b", "c", "d"],
			coreNodes: [
				{ nodeId: "a", label: "Alpha", type: "topic", role: "核心" },
				{ nodeId: "b", label: "Beta", type: "entity", role: "相关" },
				{ nodeId: "c", label: "Gamma", type: "source", role: "相关" },
				{ nodeId: "d", label: "Delta", type: "entity", role: "相关" },
			],
		}));

		assert.equal(view.kicker, "社区");
		assert.equal(view.title, "Knowledge Build");
		assert.equal(view.canEnterCommunity, true);
		assert.equal(view.recommendedActionId, "summarize_cluster");
		assert.equal(view.nodeListExpandable, true);
		assert.equal(view.nodeListKey, JSON.stringify(["community", "build", ["a", "b", "c", "d"]]));
		assert.equal(view.dialogueHint, "当前社区会带入对话");
		assert.deepEqual(view.facts, [
			{ label: "页", value: 6 },
			{ label: "链接", value: 5 },
			{ label: "核心", value: 4 },
			{ label: "孤立", value: 0 }
		]);
		assert.deepEqual(view.nodes.map((node) => node.nodeId), ["a", "b", "c", "d"]);
		assert.deepEqual(view.actions.map((action) => action.label), [
			"总结这一簇",
			"找知识缺口",
			"生成主题页",
			"探索潜在关系"
		]);
		assert.equal(view.actions.find((action) => action.id === "explore_potential_links")?.recommended, false);
		assert.equal(view.tags.includes("结构清晰"), true);
		assert.equal(view.tags.includes("无搜索命中"), false);
	});

	it("recommends potential relation exploration for ungrouped community", () => {
		const view = graphCommunityDrawerViewModel(summaryFixture({
			communityId: "_none",
			label: "未分组",
			structureState: "ungrouped",
			canEnterCommunity: false,
			facts: { pageCount: 2, internalLinkCount: 0, communityCount: 1, isolatedCount: 2 },
		}));

		assert.equal(view.canEnterCommunity, false);
		assert.equal(view.recommendedActionId, "explore_potential_links");
		assert.equal(view.actions.find((action) => action.id === "explore_potential_links")?.recommended, true);
		assert.equal(view.tags.includes("暂未成组"), true);
	});

	it("recommends find_knowledge_gaps for loose-structure community", () => {
		const view = graphCommunityDrawerViewModel(summaryFixture({
			structureState: "loose",
			facts: { pageCount: 8, internalLinkCount: 1, communityCount: 1, isolatedCount: 5 },
		}));
		assert.equal(view.recommendedActionId, "find_knowledge_gaps");
		assert.equal(view.actions.find((a) => a.id === "find_knowledge_gaps")?.recommended, true);
		// 锁死"每屏只有一个推荐高亮"不变量
		assert.equal(view.actions.filter((a) => a.recommended).length, 1);
	});

	it("uses the same skeleton for manual multi-node selections", () => {
		const view = graphSelectionGroupDrawerViewModel("选区", selectionFixture({
			id: "nodes:a,b,c,d",
			nodeIds: ["a", "b", "c", "d"],
		}));

		assert.equal(view.kicker, "选区");
		assert.equal(view.title, "选区");
		assert.equal(view.canEnterCommunity, false);
		assert.equal(view.recommendedActionId, "explore_potential_links");
		assert.equal(view.nodeListExpandable, false);
		assert.equal(view.nodeListKey, JSON.stringify(["selection", "nodes:a,b,c,d"]));
		assert.equal(view.dialogueHint, "当前选区会带入对话");
		assert.deepEqual(view.nodes.map((node) => node.nodeId), ["a", "b", "c"]);
		assert.deepEqual(view.facts, [
			{ label: "页", value: 3 },
			{ label: "链接", value: 0 },
			{ label: "社区", value: 2 },
			{ label: "孤立", value: 1 }
		]);
		assert.deepEqual(view.actions.map((action) => action.label), [
			"总结这一簇",
			"找知识缺口",
			"生成主题页",
			"探索潜在关系"
		]);
	});

	it("finds fixed actions by id for prompt dispatch", () => {
		assert.equal(groupDrawerActionById("find_knowledge_gaps")?.label, "找知识缺口");
		assert.equal(groupDrawerActionById("missing"), null);
		assert.equal(groupDrawerActionById(null), null);
	});

	it("uses unambiguous community node-list keys when node ids contain separators", () => {
		const first = graphCommunityDrawerViewModel(summaryFixture({
			coreNodeIds: ["wiki/a,b.md", "wiki/c.md"],
		}));
		const second = graphCommunityDrawerViewModel(summaryFixture({
			coreNodeIds: ["wiki/a.md", "wiki/b,c.md"],
		}));

		assert.notEqual(first.nodeListKey, second.nodeListKey);
	});

	it("keeps free-text sends free and uses the recommended action only for empty new conversations", () => {
		assert.equal(graphGroupDrawerPromptAction(null, "summarize_cluster", "请只看风险", false), null);
		assert.equal(graphGroupDrawerPromptAction(null, "summarize_cluster", "请只看风险", true), null);
		assert.equal(graphGroupDrawerPromptAction(null, "summarize_cluster", "", true)?.id, "summarize_cluster");
		assert.equal(graphGroupDrawerPromptAction("create_topic_page", "summarize_cluster", "", false)?.id, "create_topic_page");
	});
});

function summaryFixture(overrides: Partial<GraphCommunitySummaryPayload> = {}): GraphCommunitySummaryPayload {
	return {
		kind: "community-summary",
		object: { kind: "community", communityId: "build" },
		communityId: "build",
		label: "Knowledge Build",
		nodeCount: 6,
		facts: { pageCount: 6, internalLinkCount: 5, communityCount: 1, isolatedCount: 0 },
		structureState: "clear",
		description: "这组页面围绕同一主题聚在一起。你可以先看结构，也可以直接让 agent 基于这一组页面继续工作。",
		canEnterCommunity: true,
		coreNodeIds: ["a", "b", "c"],
		coreNodes: [
			{ nodeId: "a", label: "Alpha", type: "topic", role: "核心" },
			{ nodeId: "b", label: "Beta", type: "entity", role: "相关" },
			{ nodeId: "c", label: "Gamma", type: "source", role: "相关" }
		],
		searchResultIds: [],
		pinHints: [],
		selection: {
			input: { kind: "community", id: "build" },
			selectionId: "community:a,b,c",
			selectedNodeIds: ["a", "b", "c"],
			selectedCommunityIds: ["build"],
			containsCurrentObject: true
		},
		strongestRelations: [],
		bridgeRelations: [],
		aggregationMarkers: [],
		commands: [{ kind: "enter-community", communityId: "build", label: "进入社区" }],
		...overrides
	};
}

function selectionFixture(overrides: Partial<Selection> = {}): Selection {
	return {
		id: "nodes:a,b,c",
		nodeIds: ["a", "b", "c"],
		communityIds: ["alpha", "beta"],
		facts: { pageCount: 3, internalLinkCount: 0, communityCount: 2, isolatedCount: 1 },
		input: { kind: "nodes", ids: ["a", "b", "c"] },
		actions: [{ id: "explore_potential_links", label: "探索潜在关系", tone: "bridge" }],
		...overrides
	};
}

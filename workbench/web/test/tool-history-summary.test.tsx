import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
	TOOL_HISTORY_DETAIL_LIMIT,
	TOOL_HISTORY_FOLDED_TARGET_LIMIT,
	ToolHistorySummary,
} from "../src/components/ToolHistorySummary";
import {
	createToolStatusState,
	reduceToolStatusEvent,
	type ToolStatusState,
} from "../src/lib/tool-status-model";
import type { ToolStatusContractEvent } from "../src/lib/api";

describe("ToolHistorySummary", () => {
	it("renders a compact folded summary grouped by tool kind", () => {
		const state = completedState([
			["read-1", "read", "读取", "wiki/a.md"],
			["write-1", "write", "写入", "wiki/b.md"],
			["bash-1", "bash", "运行命令", "npm test"],
			["search-1", "knowledge_search", "搜索", "tool status"],
			["skill-1", "skill_runner", "调用 Skill", "llm-wiki"],
		]);

		const html = renderToStaticMarkup(React.createElement(ToolHistorySummary, { state }));

		assert.match(html, /tool-history-summary/);
		assert.match(html, /工具摘要/);
		assert.match(html, /文件 2/);
		assert.match(html, /命令 1/);
		assert.match(html, /搜索 1/);
		assert.match(html, /Skill 1/);
		assert.equal(html.includes("tool-history-row"), false);
		assert.ok((html.match(/tool-history-chip/g) ?? []).length <= TOOL_HISTORY_FOLDED_TARGET_LIMIT + 4);
	});

	it("renders expanded detail with a hard row limit and remaining count", () => {
		const items = Array.from({ length: 55 }, (_, index) => [
			`read-${index}`,
			"read",
			"读取",
			`wiki/source-${index}.md`,
		] as const);
		const state = completedState(items);

		const html = renderToStaticMarkup(React.createElement(ToolHistorySummary, { state, defaultExpanded: true }));

		assert.equal((html.match(/class="tool-history-row tool-history-row-/g) ?? []).length, TOOL_HISTORY_DETAIL_LIMIT);
		assert.match(html, /还有 5 项/);
		assert.match(html, /wiki\/source-0\.md/);
		assert.match(html, /wiki\/source-49\.md/);
		assert.equal(html.includes("wiki/source-54.md"), false);
	});

	it("does not render when there are no completed tool items", () => {
		const html = renderToStaticMarkup(
			React.createElement(ToolHistorySummary, { state: createToolStatusState("history-run", "history-message") }),
		);

		assert.equal(html, "");
	});
});

function completedState(items: ReadonlyArray<readonly [string, string, string, string]>): ToolStatusState {
	return items.reduce((state, [toolCallId, toolName, action, target], index) => {
		let next = reduceToolStatusEvent(
			state,
			event("tool_status_start", {
				seq: index * 2 + 1,
				toolCallId,
				toolName,
				action,
				target,
				status: "running",
				args: argsFor(toolName, target),
				runningToolCount: 1,
				otherRunningCount: 0,
			}),
			{ nowMs: 1_000 + index },
		);
		next = reduceToolStatusEvent(
			next,
			event("tool_status_end", {
				seq: index * 2 + 2,
				toolCallId,
				toolName,
				action,
				target,
				status: "done",
				result: null,
				summary: `完成 ${target}`,
				error: null,
				durationMs: 20,
				runningToolCount: 0,
				otherRunningCount: 0,
			}),
			{ nowMs: 1_020 + index },
		);
		return next;
	}, createToolStatusState("history-run", "history-message", { maxCompletedItems: 200, maxSummaryItems: 200 }));
}

function argsFor(toolName: string, target: string): Record<string, unknown> {
	if (toolName.includes("bash")) return { command: target };
	if (toolName.includes("search")) return { query: target };
	if (toolName.includes("skill")) return { skillName: target };
	return { path: target };
}

function event<T extends ToolStatusContractEvent["type"]>(
	type: T,
	payload: Omit<Extract<ToolStatusContractEvent, { type: T }>, "schemaVersion" | "type" | "runId" | "messageId">,
): Extract<ToolStatusContractEvent, { type: T }> {
	return {
		schemaVersion: 1,
		type,
		runId: "history-run",
		messageId: "history-message",
		...payload,
	} as Extract<ToolStatusContractEvent, { type: T }>;
}

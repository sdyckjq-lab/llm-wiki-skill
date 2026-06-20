import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ToolHistorySummary } from "../src/components/ToolHistorySummary";
import { createLegacyToolStatusState } from "../src/lib/legacy-tool-status";

describe("ChatPanel tool status rendering", () => {
	it("renders legacy historical tool calls as a folded summary instead of the old live list", () => {
		const state = createLegacyToolStatusState("a-history", [
			{ name: "读取 ~/wiki/index.md：读取完成", status: "done" },
			{ name: "历史工具调用：bash", status: "done" },
		]);
		assert.ok(state);

		const html = renderToStaticMarkup(React.createElement(ToolHistorySummary, { state }));

		assert.match(html, /tool-history-summary/);
		assert.match(html, /已完成 2 项工具调用/);
		assert.match(html, /文件 1/);
		assert.match(html, /命令 1/);
		assert.equal(html.includes("msg-tools"), false);
		assert.equal(html.includes("tool-runway"), false);
	});
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
	TOOL_RUNWAY_DETAIL_LIMIT,
	TOOL_RUNWAY_UPDATE_CADENCE_MS,
	ToolStatusRunway,
} from "../src/components/ToolStatusRunway";
import {
	cancelActiveToolStatus,
	createToolStatusState,
	reduceToolStatusEvent,
} from "../src/lib/tool-status-model";
import type { ToolStatusContractEvent } from "../src/lib/api";

describe("ToolStatusRunway", () => {
	it("prioritizes the current tool action in one compact line", () => {
		const state = runningState();
		const html = render(state);

		assert.match(html, /tool-runway-current/);
		assert.match(html, /正在/);
		assert.match(html, /读取/);
		assert.match(html, /wiki\/mamba\.md/);
		assert.equal(html.includes("tool-runway-targets"), false);
	});

	it("renders a single running tool with a compact target and live state", () => {
		const state = runningState("~/projects/private/wiki/sources/very-long-file-name-for-runway-layout.md");

		const html = renderToStaticMarkup(React.createElement(ToolStatusRunway, { state }));

		assert.match(html, /tool-runway-running/);
		assert.match(html, /tool-runway-pulse/);
		assert.match(html, /读取/);
		assert.match(html, /\.\.\./);
		assert.match(html, /very-long-file-name-for-runway-layout\.md/);
		assert.equal(html.includes("另有"), false);
	});

	it("renders done, failed, and cancelled states with distinct classes", () => {
		const done = complete("done");
		const failed = complete("failed");
		const cancelled = cancelActiveToolStatus(
			reduceToolStatusEvent(
				createToolStatusState("runway-run", "runway-message"),
				event("tool_status_start", {
					seq: 1,
					toolCallId: "bash-1",
					toolName: "bash",
					action: "运行命令",
					target: "npm test",
					status: "running",
					args: { command: "npm test" },
					runningToolCount: 1,
					otherRunningCount: 0,
				}),
				{ nowMs: 1_000 },
			),
			"用户已停止",
		);

		assert.match(render(done), /tool-runway-done/);
		assert.match(render(failed), /tool-runway-failed/);
		assert.match(render(cancelled), /tool-runway-cancelled/);
		assert.match(render(cancelled), /用户已停止/);
	});

	it("exposes concrete visual limits and update cadence", () => {
		assert.equal(TOOL_RUNWAY_DETAIL_LIMIT, 50);
		assert.ok(TOOL_RUNWAY_UPDATE_CADENCE_MS >= 80);
		assert.ok(TOOL_RUNWAY_UPDATE_CADENCE_MS <= 150);
	});

	it("keeps the Paper runway treatment in CSS without losing compact information", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.tool-runway::after/);
		assert.match(css, /\.tool-runway[\s\S]*var\(--paper-grain\)/);
		assert.match(css, /\.tool-runway-status[\s\S]*border-radius:\s*999px/);
		assert.match(css, /\.tool-runway-current[\s\S]*white-space:\s*nowrap/);
	});
});

function render(state: ReturnType<typeof createToolStatusState>): string {
	return renderToStaticMarkup(React.createElement(ToolStatusRunway, { state }));
}

function runningState(target = "wiki/mamba.md") {
	return reduceToolStatusEvent(
		createToolStatusState("runway-run", "runway-message"),
		event("tool_status_start", {
			seq: 1,
			toolCallId: "read-1",
			toolName: "read",
			action: "读取",
			target,
			status: "running",
			args: { path: target },
			runningToolCount: 1,
			otherRunningCount: 0,
		}),
		{ nowMs: 1_000 },
	);
}

function complete(status: "done" | "failed") {
	let state = createToolStatusState("runway-run", "runway-message");
	state = reduceToolStatusEvent(
		state,
		event("tool_status_start", {
			seq: 1,
			toolCallId: "read-1",
			toolName: "read",
			action: "读取",
			target: "wiki/source.md",
			status: "running",
			args: { path: "wiki/source.md" },
			runningToolCount: 1,
			otherRunningCount: 0,
		}),
		{ nowMs: 1_000 },
	);
	return reduceToolStatusEvent(
		state,
		event("tool_status_end", {
			seq: 2,
			toolCallId: "read-1",
			toolName: "read",
			action: "读取",
			target: "wiki/source.md",
			status,
			result: null,
			summary: status === "done" ? "ok" : "failed",
			error: status === "failed" ? "failed" : null,
			durationMs: 20,
			runningToolCount: 0,
			otherRunningCount: 0,
		}),
		{ nowMs: 1_020 },
	);
}

function event<T extends ToolStatusContractEvent["type"]>(
	type: T,
	payload: Omit<Extract<ToolStatusContractEvent, { type: T }>, "schemaVersion" | "type" | "runId" | "messageId">,
): Extract<ToolStatusContractEvent, { type: T }> {
	return {
		schemaVersion: 1,
		type,
		runId: "runway-run",
		messageId: "runway-message",
		...payload,
	} as Extract<ToolStatusContractEvent, { type: T }>;
}

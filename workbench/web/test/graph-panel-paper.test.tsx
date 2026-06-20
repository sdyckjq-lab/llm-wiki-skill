import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";

import { GraphPanel } from "../src/components/GraphPanel";
import { render, screen, waitFor } from "./render";

describe("GraphPanel Paper shell", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("renders the graph shell toolbar without adding app-level graph overlays", async () => {
		mockGraphFetch();

		render(
			<GraphPanel
				currentKnowledgeBaseName="AI 学习库"
				currentKnowledgeBasePath="/kb"
				theme="light"
			/>,
		);

		const toolbar = screen.getByRole("banner", { name: "图谱工具栏" });
		assert.equal(toolbar.classList.contains("graph-shell-toolbar"), true);
		assert.match(toolbar.textContent ?? "", /AI 学习库/);
		assert.match(toolbar.textContent ?? "", /结构地图/);
		assert.match(toolbar.textContent ?? "", /就绪|读取中/);
		assert.ok(screen.getByRole("button", { name: /重置布局/ }));
		assert.ok(screen.getByRole("button", { name: /重构/ }));

		await waitFor(() => {
			assert.match(toolbar.textContent ?? "", /1 节点 · 0 关联/);
		});

		assert.equal(screen.queryByLabelText("图谱图例"), null);
		assert.equal(document.querySelector(".graph-legend"), null);
		assert.ok(document.querySelector(".graph-host"));
	});

	it("keeps the GraphPanel Paper shell styling outside graph-engine internals", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.graph-shell-toolbar[\s\S]*var\(--paper-grain\)/);
		assert.match(css, /\.graph-shell-toolbar-chip,[\s\S]*\.graph-shell-toolbar-button/);
		assert.match(css, /\.graph-stage[\s\S]*border-radius:\s*16px/);
		assert.doesNotMatch(css, /(^|\n)\s*\.graph-toolbar\b/);
		assert.doesNotMatch(css, /(^|\n)\s*\.graph-legend\b/);
		assert.doesNotMatch(css, /render-styles|sigma-node|sigma-edge/);
	});
});

function mockGraphFetch() {
	globalThis.fetch = (async (input) => {
		const url = String(input);
		if (url.startsWith("/api/graph/layout")) {
			return jsonResponse({
				ok: true,
				layout: { version: 1, pins: {}, updatedAt: "2026-06-20T00:00:00.000Z" },
			});
		}
		if (url.startsWith("/api/graph?")) {
			return jsonResponse({
				ok: true,
				needsBuild: false,
				data: {
					meta: { build_date: "2026-06-20T00:00:00.000Z" },
					nodes: [
						{
							id: "wiki/paper.md",
							label: "Paper",
							title: "Paper",
							type: "topic",
							community: "paper",
							path: "wiki/paper.md",
						},
					],
					edges: [],
					communities: [],
				},
			});
		}
		return jsonResponse({ ok: false, error: `Unexpected request: ${url}` }, 500);
	}) as typeof fetch;
}

function jsonResponse(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

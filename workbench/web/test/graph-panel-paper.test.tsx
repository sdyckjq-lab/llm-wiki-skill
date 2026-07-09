import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React from "react";

import { GraphPanel } from "../src/components/GraphPanel";
import { click, pressKey, render, screen, waitFor } from "./render";

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
		assert.match(toolbar.textContent ?? "", /图谱活地图/);
		assert.ok(screen.getByRole("button", { name: /重置布局/ }));
		assert.ok(screen.getByRole("button", { name: /增强显示/ }));
		assert.ok(screen.getByRole("button", { name: /重构/ }));
		assert.notEqual(toolbar.querySelector(".graph-shell-legend"), null);

		await waitFor(() => {
			assert.match(toolbar.textContent ?? "", /1 节点 · 0 关联/);
		});

		const shell = document.querySelector(".graph-shell");
		const stage = document.querySelector(".graph-stage");
		assert.ok(shell);
		assert.ok(stage);
		assert.equal(shell?.contains(toolbar), true);
		assert.equal(shell?.contains(stage), true);
		assert.equal(stage?.contains(toolbar), false);
		assert.notEqual(screen.queryByLabelText("图谱图例"), null);
		assert.equal(document.querySelector(".graph-legend"), null);
		assert.ok(document.querySelector(".graph-host"));
	});

	it("opens graph edge tuning controls from the toolbar", async () => {
		mockGraphFetch();

		render(
			<GraphPanel
				currentKnowledgeBaseName="AI 学习库"
				currentKnowledgeBasePath="/kb"
				theme="light"
			/>,
		);

		const tuningButton = screen.getByRole("button", { name: /增强显示/ }) as HTMLButtonElement;
		await waitFor(() => {
			assert.equal(tuningButton.disabled, false);
		});
		await click(tuningButton);

		const panel = screen.getByRole("dialog", { name: "图谱增强显示" });
		assert.match(panel.textContent ?? "", /默认已分清主次/);
		assert.match(panel.textContent ?? "", /突出对比和矛盾/);
		assert.match(panel.textContent ?? "", /点亮当前范围/);
		const semanticToggle = screen.getByRole("checkbox", { name: /语义强调/ });
		const focusToggle = screen.getByRole("checkbox", { name: /聚焦点亮/ });
		assert.equal((semanticToggle as HTMLInputElement).checked, false);
		assert.equal((focusToggle as HTMLInputElement).checked, false);
		assert.equal(document.activeElement, semanticToggle);

		await click(semanticToggle);

		await waitFor(() => {
			assert.equal((semanticToggle as HTMLInputElement).checked, true);
			assert.equal(localStorage.getItem("llm-wiki.graph.edge-style"), "{\"semanticEmphasis\":true,\"focusHighlight\":false}");
		});

		await click(focusToggle);

		await waitFor(() => {
			assert.equal((focusToggle as HTMLInputElement).checked, true);
			assert.equal(localStorage.getItem("llm-wiki.graph.edge-style"), "{\"semanticEmphasis\":true,\"focusHighlight\":true}");
		});

		await pressKey(document, "Escape");

		assert.equal(screen.queryByRole("dialog", { name: "图谱增强显示" }), null);
		assert.equal(document.activeElement, tuningButton);
	});

	it("keeps edge tuning changes local to community reading and clears them on return", async () => {
		mockGraphFetch();
		const selectionChanges: unknown[] = [];
		const { rerender } = render(
			<GraphPanel
				currentKnowledgeBaseName="AI 学习库"
				currentKnowledgeBasePath="/kb"
				theme="light"
				onSelectionChange={(selection) => selectionChanges.push(selection)}
			/>,
		);

		await waitFor(() => {
			assert.match(document.body.textContent ?? "", /1 节点 · 0 关联/);
		});

		rerender(
			<GraphPanel
				currentKnowledgeBaseName="AI 学习库"
				currentKnowledgeBasePath="/kb"
				theme="light"
				onSelectionChange={(selection) => selectionChanges.push(selection)}
				selectionCommand={{ id: "paper", type: "enter-community" }}
			/>,
		);

		await waitFor(() => {
			assert.deepEqual(selectionChanges, [null]);
			assert.notEqual(screen.queryByRole("button", { name: "回全图" }), null);
		});

		const tuningButton = screen.getByRole("button", { name: /增强显示/ }) as HTMLButtonElement;
		await click(tuningButton);
		const semanticToggle = screen.getByRole("checkbox", { name: /语义强调/ }) as HTMLInputElement;
		await click(semanticToggle);

		await waitFor(() => {
			assert.equal(semanticToggle.checked, true);
			assert.equal(localStorage.getItem("llm-wiki.graph.edge-style"), null);
		});

		await click(screen.getByRole("button", { name: "回全图" }));

		await waitFor(() => {
			assert.equal(localStorage.getItem("llm-wiki.graph.edge-style"), null);
		});
		await click(tuningButton);
		const returnedSemanticToggle = screen.getByRole("checkbox", { name: /语义强调/ }) as HTMLInputElement;
		assert.equal(returnedSemanticToggle.checked, false);
	});

	it("surfaces graph build errors in the graph panel", async () => {
		mockGraphFetch({ needsBuild: true });

		const { rerender } = render(
			<GraphPanel
				currentKnowledgeBaseName="AI 学习库"
				currentKnowledgeBasePath="/kb"
				theme="light"
			/>,
		);

		await waitFor(() => {
			assert.match(screen.getByText("图谱构建中").textContent ?? "", /图谱构建中/);
		});

		rerender(
			<GraphPanel
				currentKnowledgeBaseName="AI 学习库"
				currentKnowledgeBasePath="/kb"
				theme="light"
				graphBuildError={{ kbPath: "/kb", message: "构建失败", rebuiltAt: "2026-06-20T00:00:00.000Z" }}
			/>,
		);

		await waitFor(() => {
			assert.match(screen.getByText("图谱暂时不可用").textContent ?? "", /图谱暂时不可用/);
			assert.match(document.body.textContent ?? "", /构建失败/);
		});
	});

	it("notifies the app to close the community summary drawer when entering a community", async () => {
		mockGraphFetch();
		const selectionChanges: unknown[] = [];
		const { rerender } = render(
			<GraphPanel
				currentKnowledgeBaseName="AI 学习库"
				currentKnowledgeBasePath="/kb"
				theme="light"
				onSelectionChange={(selection) => selectionChanges.push(selection)}
			/>,
		);

		await waitFor(() => {
			assert.match(document.body.textContent ?? "", /1 节点 · 0 关联/);
		});

		rerender(
			<GraphPanel
				currentKnowledgeBaseName="AI 学习库"
				currentKnowledgeBasePath="/kb"
				theme="light"
				onSelectionChange={(selection) => selectionChanges.push(selection)}
				selectionCommand={{ id: "paper", type: "enter-community" }}
			/>,
		);

		await waitFor(() => {
			assert.deepEqual(selectionChanges, [null]);
		});
	});

	it("does not clear graph interaction from the workbench shell on Escape", async () => {
		mockGraphFetch();
		const selectionChanges: unknown[] = [];
		render(
			<GraphPanel
				currentKnowledgeBaseName="AI 学习库"
				currentKnowledgeBasePath="/kb"
				theme="light"
				onSelectionChange={(selection) => selectionChanges.push(selection)}
			/>,
		);

		await waitFor(() => {
			assert.match(document.body.textContent ?? "", /1 节点 · 0 关联/);
		});

		await pressKey(document, "Escape");

		assert.deepEqual(selectionChanges, []);
	});

	it("keeps the GraphPanel Paper shell styling outside graph-engine internals", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.graph-shell\s*\{[\s\S]*display:\s*grid/);
		assert.match(css, /\.graph-shell-toolbar[\s\S]*position:\s*relative/);
		assert.match(css, /\.graph-stage[\s\S]*min-height:\s*0/);
		assert.match(css, /\.graph-shell-legend[\s\S]*display:\s*flex/);
		assert.doesNotMatch(cssBlock(css, ".graph-shell-toolbar"), /position:\s*absolute/);
		assert.match(css, /\.graph-shell-toolbar[\s\S]*var\(--paper-grain\)/);
		assert.match(css, /\.graph-shell-toolbar-chip,[\s\S]*\.graph-shell-toolbar-button/);
		assert.match(css, /\.graph-stage[\s\S]*border-radius:\s*16px/);
		assert.doesNotMatch(css, /(^|\n)\s*\.graph-toolbar\b/);
		assert.doesNotMatch(css, /(^|\n)\s*\.graph-legend\b/);
		assert.doesNotMatch(css, /render-styles|sigma-node|sigma-edge/);
	});
});

function cssBlock(css: string, selector: string): string {
	const start = css.indexOf(`${selector} {`);
	if (start === -1) return "";
	const end = css.indexOf("\n  }", start);
	return end === -1 ? css.slice(start) : css.slice(start, end);
}

function mockGraphFetch(options: { needsBuild?: boolean } = {}) {
	globalThis.fetch = (async (input) => {
		const url = String(input);
		if (url.startsWith("/api/graph/layout")) {
			return jsonResponse({
				ok: true,
				layout: { version: 1, pins: {}, updatedAt: "2026-06-20T00:00:00.000Z" },
			});
		}
		if (url.startsWith("/api/graph?")) {
			if (options.needsBuild) {
				return jsonResponse({
					ok: true,
					needsBuild: true,
					graphPath: "/kb/.llm-wiki/graph.json",
				});
			}
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
		if (url.startsWith("/api/graph/rebuild")) {
			return jsonResponse({ ok: true, status: "started" });
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

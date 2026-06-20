import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { TopBar } from "../src/components/TopBar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { click, render, screen, waitFor } from "./render";

describe("TopBar", () => {
	it("renders a static knowledge base head without page counts or left-side model text", () => {
		renderTopBar(
			<TopBar
				knowledgeBase={{
					path: "/kb",
					name: "AI学习知识库",
					origin: "external",
					valid: false,
					reason: "路径不存在",
				}}
				model={{ provider: "deepseek", id: "deepseek-v4-flash" }}
				theme="light"
				onSearch={noop}
				onNewConversation={noop}
				onToggleTheme={noop}
				onOpenAppearance={noop}
			/>,
		);

		const kbHead = screen.getByLabelText("当前知识库");
		assert.match(kbHead.textContent ?? "", /AI学习知识库/);
		assert.match(kbHead.textContent ?? "", /外部/);
		assert.match(kbHead.textContent ?? "", /失效/);
		assert.doesNotMatch(kbHead.textContent ?? "", /deepseek/);
		assert.equal(screen.queryByText(/篇/), null);
	});

	it("exposes the global action callbacks", async () => {
		const calls: string[] = [];
		renderTopBar(
			<TopBar
				knowledgeBase={{ path: "/kb", name: "AI学习知识库", origin: "default", valid: true }}
				model={null}
				theme="dark"
				onSearch={() => calls.push("search")}
				onNewConversation={() => calls.push("new")}
				onToggleTheme={() => calls.push("theme")}
				onOpenAppearance={() => calls.push("appearance")}
			/>,
		);

		await click(screen.getByRole("button", { name: /搜索/ }));
		await click(screen.getByRole("button", { name: /新对话/ }));
		await click(screen.getByRole("button", { name: "切换浅色暖纸" }));
		await click(screen.getByRole("button", { name: "外观偏好" }));

		assert.deepEqual(calls, ["search", "new", "theme", "appearance"]);
	});

	it("loads and saves the main model role through the shared config API", async () => {
		const originalFetch = globalThis.fetch;
		const requests: Array<{ url: string; method: string; body?: unknown }> = [];
		const configChanged: string[] = [];
		globalThis.fetch = (async (input, init) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			requests.push({
				url,
				method,
				body: init?.body ? JSON.parse(String(init.body)) : undefined,
			});
			if (url === "/api/config" && method === "GET") {
				return json({
					ok: true,
					config: {
						version: 1,
						externalKnowledgeBases: [],
						modelRoles: { main: { provider: "deepseek", modelId: "deepseek-v4-flash" } },
					},
				});
			}
			if (url === "/api/models") {
				return json({
					ok: true,
					items: [
						{
							provider: "deepseek",
							modelId: "deepseek-v4-flash",
							name: "DeepSeek Flash",
							reasoning: false,
							contextWindow: 128000,
							cost: { input: 0, output: 0 },
							hasAuth: true,
						},
						{
							provider: "openai",
							modelId: "gpt-5",
							name: "GPT-5",
							reasoning: true,
							contextWindow: 400000,
							cost: { input: 0, output: 0 },
							hasAuth: true,
						},
					],
				});
			}
			if (url === "/api/config" && method === "POST") {
				return json({
					ok: true,
					config: {
						version: 1,
						externalKnowledgeBases: [],
						modelRoles: { main: { provider: "openai", modelId: "gpt-5" } },
					},
				});
			}
			return json({ ok: false, error: `Unexpected ${method} ${url}` }, 404);
		}) as typeof fetch;

		try {
			renderTopBar(
				<TopBar
					knowledgeBase={{ path: "/kb", name: "AI学习知识库", origin: "default", valid: true }}
					model={{ provider: "deepseek", id: "deepseek-v4-flash" }}
					theme="light"
					onSearch={noop}
					onNewConversation={noop}
					onToggleTheme={noop}
					onOpenAppearance={noop}
					onConfigChanged={() => configChanged.push("changed")}
				/>,
			);

			await click(screen.getByRole("button", { name: /切换主对话模型/ }));
			await click(await screen.findByRole("option", { name: /openai\/gpt-5/ }));

			await waitFor(() => assert.deepEqual(configChanged, ["changed"]));
			assert.deepEqual(requests.map((item) => `${item.method} ${item.url}`), [
				"GET /api/config",
				"GET /api/models",
				"POST /api/config",
			]);
			assert.deepEqual(requests[2]?.body, {
				modelRoles: { main: { provider: "openai", modelId: "gpt-5" } },
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function renderTopBar(element: React.ReactElement) {
	return render(<TooltipProvider>{element}</TooltipProvider>);
}

function noop() {}

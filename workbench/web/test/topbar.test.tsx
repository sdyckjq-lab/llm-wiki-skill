import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { TopBar } from "../src/components/TopBar";
import { AppearancePanel } from "../src/components/AppearancePanel";
import { TooltipProvider } from "../src/components/ui/tooltip";
import {
	DEFAULT_APPEARANCE,
	applyAppearance,
	mergeAppearance,
	type AppearancePrefs,
} from "../src/lib/appearance";
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

	it("drives theme switching and the appearance panel from real topbar clicks", async () => {
		renderTopBar(<PaperTopBarHarness />);

		assert.equal(document.documentElement.dataset.theme, "light");
		assert.equal(getAppearancePanel(), null);

		await click(screen.getByRole("button", { name: "切换夜灯主题" }));
		assert.equal(document.documentElement.dataset.theme, "dark");
		assert.equal(document.documentElement.classList.contains("dark"), true);
		assert.ok(screen.getByRole("button", { name: "切换浅色暖纸" }));

		await click(screen.getByRole("button", { name: "外观偏好" }));
		assert.notEqual(getAppearancePanel(), null);
		assert.equal(screen.getByRole("button", { name: "外观偏好" }).getAttribute("aria-pressed"), "true");

		await click(screen.getByRole("button", { name: "关闭外观面板" }));
		assert.equal(getAppearancePanel(), null);
		assert.equal(screen.getByRole("button", { name: "外观偏好" }).getAttribute("aria-pressed"), "false");
	});

	it("renders chat and graph status snapshots", () => {
		renderTopBar(
			<TopBar
				knowledgeBase={{ path: "/kb", name: "AI学习知识库", origin: "default", valid: true }}
				model={null}
				theme="light"
				chatStatus={{ status: "streaming", summary: "正在接收回复" }}
				graphStatus={{ status: "ready", summary: "42 节点 · 80 关联", animation: "queued" }}
				onSearch={noop}
				onNewConversation={noop}
				onToggleTheme={noop}
				onOpenAppearance={noop}
			/>,
		);

		const status = screen.getByLabelText("运行状态");
		assert.match(status.textContent ?? "", /对话回复中/);
		assert.match(status.textContent ?? "", /图谱待更新/);
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
			await waitFor(() => assert.match(screen.getByRole("button", { name: /切换主对话模型/ }).textContent ?? "", /openai\/gpt-5/));
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

function getAppearancePanel() {
	return document.querySelector('section[aria-label="外观偏好"]');
}

function PaperTopBarHarness() {
	const [appearance, setAppearance] = React.useState<AppearancePrefs>(DEFAULT_APPEARANCE);
	const [appearanceOpen, setAppearanceOpen] = React.useState(false);

	React.useEffect(() => {
		applyAppearance(appearance);
	}, [appearance]);

	const updateAppearance = (patch: Partial<AppearancePrefs>) => {
		setAppearance((current) => mergeAppearance(current, patch));
	};

	return (
		<React.Fragment>
			<TopBar
				knowledgeBase={{ path: "/kb", name: "AI学习知识库", origin: "default", valid: true }}
				model={null}
				theme={appearance.theme}
				appearanceOpen={appearanceOpen}
				onSearch={noop}
				onNewConversation={noop}
				onToggleTheme={() => updateAppearance({ theme: appearance.theme === "dark" ? "light" : "dark" })}
				onOpenAppearance={() => setAppearanceOpen((open) => !open)}
			/>
			<AppearancePanel
				open={appearanceOpen}
				value={appearance}
				onChange={updateAppearance}
				onClose={() => setAppearanceOpen(false)}
			/>
		</React.Fragment>
	);
}

function noop() {}

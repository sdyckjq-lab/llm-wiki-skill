import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { TopBar } from "../src/components/TopBar";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { click, render, screen } from "./render";

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
				onOpenModelSelector={noop}
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
				onOpenModelSelector={() => calls.push("model")}
				onNewConversation={() => calls.push("new")}
				onToggleTheme={() => calls.push("theme")}
				onOpenAppearance={() => calls.push("appearance")}
			/>,
		);

		await click(screen.getByRole("button", { name: /搜索/ }));
		await click(screen.getByRole("button", { name: "切换主对话模型" }));
		await click(screen.getByRole("button", { name: /新对话/ }));
		await click(screen.getByRole("button", { name: "切换浅色暖纸" }));
		await click(screen.getByRole("button", { name: "外观偏好" }));

		assert.deepEqual(calls, ["search", "model", "new", "theme", "appearance"]);
	});
});

function renderTopBar(element: React.ReactElement) {
	return render(<TooltipProvider>{element}</TooltipProvider>);
}

function noop() {}

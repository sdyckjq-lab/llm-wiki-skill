import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ChatPanel } from "../src/components/ChatPanel";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { render, screen } from "./render";

describe("ChatPanel Paper bubbles", () => {
	it("renders initial user and assistant messages as distinct bubbles", () => {
		render(
			<TooltipProvider>
				<ChatPanel
					currentKnowledgeBaseName="AI学习知识库"
					currentKnowledgeBasePath="/kb"
					initialMessages={[
						{ id: "u1", role: "user", content: "帮我总结这篇笔记", tools: [] },
						{ id: "a1", role: "assistant", content: "可以，先看 [[notes/paper.md]]。", tools: [] },
					]}
				/>
			</TooltipProvider>,
		);

		const userMessage = screen.getByLabelText("用户消息");
		const assistantMessage = screen.getByLabelText("助手消息");
		assert.match(userMessage.className, /msg-row-user/);
		assert.match(assistantMessage.className, /msg-row-assistant/);

		assert.equal(screen.getByLabelText("用户气泡").textContent, "帮我总结这篇笔记");
		assert.match(screen.getByLabelText("助手气泡").textContent ?? "", /notes\/paper\.md/);
		assert.match(userMessage.textContent ?? "", /你/);
		assert.match(assistantMessage.textContent ?? "", /llm-wiki/);
	});

	it("keeps bubble styling on data preferences without per-message blur filters", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.msg-content\s*\{/);
		assert.match(css, /\.msg-row-user \.msg-content\s*\{/);
		assert.match(css, /\[data-userbubble="solid"\] \.msg-row-user \.msg-content/);
		assert.match(css, /\[data-density="compact"\] \.msg-content/);
		for (const block of css.matchAll(/\.msg-content[^{]*\{[^}]*\}/g)) {
			assert.doesNotMatch(block[0], /backdrop-filter/);
		}
	});
});

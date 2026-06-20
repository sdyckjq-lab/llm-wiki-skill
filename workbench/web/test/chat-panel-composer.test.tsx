import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ChatPanel } from "../src/components/ChatPanel";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { changeText, render, screen } from "./render";

describe("ChatPanel Paper composer", () => {
	it("keeps the textarea and send action inside one composer card", () => {
		renderChatPanel();

		const textarea = screen.getByPlaceholderText(/输入消息/);
		const sendButton = screen.getByRole("button", { name: /发送/ });
		const composer = textarea.closest(".composer-card");
		assert.ok(composer);
		assert.equal(composer?.contains(sendButton), true);
		assert.equal(document.querySelector(".export-bar")?.closest(".composer-card"), composer);
		assert.equal(document.querySelector(".statusbar"), null);
	});

	it("keeps material ingest chips available above the composer card", async () => {
		renderChatPanel();

		await changeText(screen.getByPlaceholderText(/输入消息/), "https://example.com/paper");

		const chip = screen.getByText(/检测到URL/).closest(".input-chip");
		assert.ok(chip);
		assert.equal(Boolean(chip?.nextElementSibling?.classList.contains("composer-card")), true);
	});

	it("keeps the Paper composer styling contract", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.composer-card\s*\{/);
		assert.match(css, /\.composer-card:focus-within[\s\S]*var\(--app-accent\)/);
		assert.match(css, /\.chat-textarea[\s\S]*background:\s*transparent/);
		assert.match(css, /\[data-hand="on"\] \.chat-textarea::placeholder[\s\S]*var\(--font-hand\)/);
		assert.match(css, /\.send-btn[\s\S]*border-radius:\s*10px/);
	});
});

function renderChatPanel() {
	return render(
		<TooltipProvider>
			<ChatPanel
				currentKnowledgeBaseName="AI学习知识库"
				currentKnowledgeBasePath="/kb"
				initialMessages={[
					{ id: "u1", role: "user", content: "帮我总结这篇笔记", tools: [] },
					{ id: "a1", role: "assistant", content: "可以。", tools: [] },
				]}
			/>
		</TooltipProvider>,
	);
}

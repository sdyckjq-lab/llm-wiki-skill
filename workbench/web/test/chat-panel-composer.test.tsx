import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ChatPanel } from "../src/components/ChatPanel";
import { TooltipProvider } from "../src/components/ui/tooltip";
import { changeText, render, screen } from "./render";

describe("ChatPanel Paper composer", () => {
	it("keeps send inside the composer input card and export outside it", () => {
		renderChatPanel();

		const textarea = screen.getByPlaceholderText(/写下想法/);
		const sendButton = screen.getByRole("button", { name: /发送/ });
		const composer = textarea.closest(".composer-card");
		assert.ok(composer);
		assert.equal(composer?.contains(sendButton), true);
		assert.equal(Boolean(sendButton.closest(".composer-actions")), true);
		assert.equal(composer?.querySelector(".chat-send-row"), null);
		assert.equal(screen.queryByText("就绪"), null);

		const exportBar = document.querySelector(".export-bar");
		assert.ok(exportBar);
		assert.equal(exportBar?.closest(".composer-card"), null);
		assert.equal(Boolean(exportBar?.closest(".composer-tools")), true);
	});

	it("keeps the empty composer to one light input card", () => {
		renderChatPanel([]);

		assert.equal(document.querySelector(".chat-input-hints"), null);
		assert.equal(document.querySelector(".composer-tools"), null);
		assert.ok(document.querySelector(".composer-card"));
	});

	it("keeps material ingest chips available above the composer card", async () => {
		renderChatPanel();

		await changeText(screen.getByPlaceholderText(/写下想法/), "https://example.com/paper");

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

	it("keeps the V2 composer compact and places actions inside the card", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");

		assert.match(css, /\.composer-card[\s\S]*border-radius:\s*14px/);
		assert.match(css, /\.composer-card[\s\S]*display:\s*flex/);
		assert.match(css, /\.composer-card[\s\S]*align-items:\s*flex-end/);
		assert.match(css, /\.chat-textarea[\s\S]*min-height:\s*40px/);
		assert.match(css, /\.chat-textarea[\s\S]*padding:\s*9px 0/);
		assert.match(css, /\.send-btn[\s\S]*width:\s*36px/);
		assert.match(css, /\.send-btn[\s\S]*height:\s*36px/);
		assert.match(css, /\.composer-tools[\s\S]*display:\s*flex/);
		assert.doesNotMatch(css, /\.chat-send-row\s*\{/);
	});
});

function renderChatPanel(initialMessages = [
	{ id: "u1", role: "user" as const, content: "帮我总结这篇笔记", tools: [] },
	{ id: "a1", role: "assistant" as const, content: "可以。", tools: [] },
]) {
	return render(
		<TooltipProvider>
			<ChatPanel
				currentKnowledgeBaseName="AI学习知识库"
				currentKnowledgeBasePath="/kb"
				initialMessages={initialMessages}
			/>
		</TooltipProvider>,
	);
}

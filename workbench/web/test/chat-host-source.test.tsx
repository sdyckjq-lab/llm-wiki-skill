import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("主视图切换：ChatPanel 常驻挂载契约", () => {
	it("App.tsx 不再用三元在 chat/graph 间卸载 ChatPanel，而是 CSS 隐藏", () => {
		const source = readFileSync(resolve(import.meta.dirname, "../src/App.tsx"), "utf8");
		// ChatPanel 外层包了 chat-host，且用 chat-host-hidden 做隐藏（而非整段卸载）
		assert.match(source, /className=\{mainView === "graph" \? "chat-host chat-host-hidden" : "chat-host"\}/);
		// GraphPanel 仍按需挂载
		assert.match(source, /mainView === "graph" && \(\s*<GraphPanel/);
		// 不再存在"graph 时把 ChatPanel 整段从树上摘掉"的三元
		assert.doesNotMatch(source, /mainView === "graph" \? \(\s*<GraphPanel[\s\S]*?\) : \(\s*<ChatPanel/);
	});

	it("index.css 提供 chat-host 填充与隐藏类", () => {
		const css = readFileSync(resolve(import.meta.dirname, "../src/index.css"), "utf8");
		assert.match(css, /\.chat-host\s*\{[^}]*height:\s*100%/);
		assert.match(css, /\.chat-host-hidden\s*\{[^}]*display:\s*none/);
	});
});

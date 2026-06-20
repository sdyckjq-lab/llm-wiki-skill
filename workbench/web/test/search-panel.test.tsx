import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { SearchPanel } from "../src/components/SearchPanel";
import type { PageRef } from "../src/lib/api";
import { changeText, click, pressKey, render, screen } from "./render";

describe("SearchPanel", () => {
	it("filters current library refs and opens the selected result with keyboard", async () => {
		const opened: string[] = [];
		const closed: string[] = [];
		render(
			<SearchPanel
				open
				refs={[
					ref("wiki/alpha.md", "alpha", "Alpha Notes"),
					ref("wiki/paper-ui.md", "paper-ui", "Paper UI 移植"),
					ref("raw/source.md", "source", "Source Material"),
				]}
				knowledgeBaseName="AI学习知识库"
				onOpenPage={(path) => opened.push(path)}
				onClose={() => closed.push("closed")}
			/>,
		);

		await changeText(screen.getByLabelText("搜索当前库页面"), "paper");
		assert.equal(searchResultPaths(), "wiki/paper-ui.md");

		await pressKey(screen.getByLabelText("搜索当前库页面"), "Enter");

		assert.deepEqual(opened, ["wiki/paper-ui.md"]);
		assert.deepEqual(closed, ["closed"]);
	});

	it("supports arrow selection, click open, and insert reference actions", async () => {
		const opened: string[] = [];
		const inserted: string[] = [];
		const closed: string[] = [];
		const first = render(
			<SearchPanel
				open
				refs={[
					ref("wiki/alpha.md", "alpha", "Alpha Notes"),
					ref("wiki/beta.md", "beta", "Beta Notes"),
				]}
				knowledgeBaseName="AI学习知识库"
				onOpenPage={(path) => opened.push(path)}
				onInsertRef={(path) => inserted.push(path)}
				onClose={() => closed.push("closed")}
			/>,
		);

		await pressKey(screen.getByLabelText("搜索当前库页面"), "ArrowDown");
		await pressKey(screen.getByLabelText("搜索当前库页面"), "Enter");
		assert.deepEqual(opened, ["wiki/beta.md"]);
		assert.deepEqual(closed, ["closed"]);
		first.unmount();

		const second = render(
			<SearchPanel
				open
				refs={[
					ref("wiki/alpha.md", "alpha", "Alpha Notes"),
					ref("wiki/beta.md", "beta", "Beta Notes"),
				]}
				knowledgeBaseName="AI学习知识库"
				onOpenPage={(path) => opened.push(path)}
				onInsertRef={(path) => inserted.push(path)}
				onClose={() => closed.push("closed")}
			/>,
		);

		await click(screen.getByRole("button", { name: /Alpha Notes/ }));
		assert.deepEqual(opened, ["wiki/beta.md", "wiki/alpha.md"]);
		second.unmount();

		render(
			<SearchPanel
				open
				refs={[
					ref("wiki/alpha.md", "alpha", "Alpha Notes"),
					ref("wiki/beta.md", "beta", "Beta Notes"),
				]}
				knowledgeBaseName="AI学习知识库"
				onOpenPage={(path) => opened.push(path)}
				onInsertRef={(path) => inserted.push(path)}
				onClose={() => closed.push("closed")}
			/>,
		);

		await click(screen.getAllByRole("button", { name: "插入" })[1]!);
		assert.deepEqual(inserted, ["wiki/beta.md"]);
	});

	it("renders loading, error, no library, and empty-result states", async () => {
		const loading = render(
			<SearchPanel
				open
				refs={[]}
				loading
				knowledgeBaseName="AI学习知识库"
				onOpenPage={noop}
				onClose={noop}
			/>,
		);
		assert.equal(searchState(), "正在加载当前库页面...");
		loading.unmount();

		const error = render(
			<SearchPanel
				open
				refs={[]}
				error="接口失败"
				knowledgeBaseName="AI学习知识库"
				onOpenPage={noop}
				onClose={noop}
			/>,
		);
		assert.equal(searchState(), "接口失败");
		error.unmount();

		const noLibrary = render(<SearchPanel open refs={[]} onOpenPage={noop} onClose={noop} />);
		assert.equal(searchState(), "请先选择知识库");
		noLibrary.unmount();

		render(
			<SearchPanel
				open
				refs={[ref("wiki/alpha.md", "alpha", "Alpha Notes")]}
				knowledgeBaseName="AI学习知识库"
				onOpenPage={noop}
				onClose={noop}
			/>,
		);
		await changeText(screen.getByLabelText("搜索当前库页面"), "zzzz-no-hit");
		assert.equal(searchState(), "没有匹配结果");
	});
});

function searchResultPaths(): string {
	return Array.from(document.querySelectorAll(".search-result-path"))
		.map((node) => node.textContent ?? "")
		.join("|");
}

function searchState(): string {
	return document.querySelector(".search-state")?.textContent ?? "";
}

function ref(path: string, name: string, title: string): PageRef {
	return { path, name, title, category: path.startsWith("wiki/") ? "wiki" : "raw" };
}

function noop() {}

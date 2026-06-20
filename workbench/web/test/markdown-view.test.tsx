import { describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { MarkdownView } from "../src/components/MarkdownView";
import { click, render, screen } from "./render";

describe("MarkdownView Paper styling", () => {
	it("renders wiki links with the Paper concept-link class and preserves open-page clicks", async () => {
		const opened: string[] = [];
		render(
			<MarkdownView
				content="See [[wiki/topics/paper.md]] next."
				onOpenPage={(path) => opened.push(path)}
				autoEmitWikiLinks={false}
			/>,
		);

		const link = screen.getByRole("link", { name: "wiki/topics/paper.md" });
		assert.equal(link.getAttribute("href"), "wiki/topics/paper.md");
		assert.match(link.className, /\bat\b/);

		await click(link);
		assert.deepEqual(opened, ["wiki/topics/paper.md"]);
	});

	it("renders double-equals highlights as Paper marker spans", () => {
		render(<MarkdownView content="This is ==important context== for synthesis." autoEmitWikiLinks={false} />);

		const highlight = screen.getByText("important context");
		assert.equal(highlight.tagName, "MARK");
		assert.match(highlight.className, /\bhl\b/);
	});
});

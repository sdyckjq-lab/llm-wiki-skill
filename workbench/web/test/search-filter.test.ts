import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PageRef } from "../src/lib/api";
import { filterPageRefs } from "../src/lib/search-filter";

describe("search filter", () => {
	it("returns a bounded default slice for empty queries", () => {
		const refs = makeRefs(1000);
		const results = filterPageRefs(refs, "", 20);

		assert.equal(results.length, 20);
		assert.equal(results[0]?.ref.path, "wiki/page-0.md");
		assert.equal(results.at(-1)?.ref.path, "wiki/page-19.md");
	});

	it("searches 1k refs by title, path, and CJK content", () => {
		const refs = makeRefs(1000);
		refs.push(ref("wiki/研究/注意力机制.md", "注意力机制", "AI 注意力机制"));
		refs.push(ref("wiki/paper-ui-port.md", "paper-ui-port", "Paper UI 移植"));

		assert.equal(filterPageRefs(refs, "注意力")[0]?.ref.path, "wiki/研究/注意力机制.md");
		assert.equal(filterPageRefs(refs, "paper-ui")[0]?.ref.path, "wiki/paper-ui-port.md");
		assert.equal(filterPageRefs(refs, "page-900")[0]?.ref.path, "wiki/page-900.md");
	});

	it("keeps strong title and prefix matches above unrelated fuzzy-looking refs", () => {
		const refs = [
			ref("wiki/other/papr.md", "papr", "Archived note"),
			ref("wiki/paper-ui.md", "paper-ui", "Paper UI"),
			ref("wiki/a-deep-paper-ui-analysis.md", "deep-paper-ui-analysis", "Deep note"),
		];

		const results = filterPageRefs(refs, "paper", 3);

		assert.deepEqual(results.map((item) => item.ref.path), [
			"wiki/paper-ui.md",
			"wiki/a-deep-paper-ui-analysis.md",
		]);
	});

	it("handles 5k refs without dropping late exact matches", () => {
		const refs = makeRefs(5000);
		refs.push(ref("wiki/final/local-search.md", "local-search", "Current Library Search"));

		const results = filterPageRefs(refs, "current library search", 10);

		assert.equal(results[0]?.ref.path, "wiki/final/local-search.md");
		assert.ok(results.length <= 10);
	});

	it("returns an empty list when there are no matches", () => {
		assert.deepEqual(filterPageRefs(makeRefs(100), "zzzz-no-hit"), []);
	});
});

function makeRefs(count: number): PageRef[] {
	return Array.from({ length: count }, (_, index) =>
		ref(`wiki/page-${index}.md`, `page-${index}`, `Page ${index}`),
	);
}

function ref(path: string, name: string, title: string): PageRef {
	return { path, name, title, category: path.startsWith("wiki/") ? "wiki" : "raw" };
}

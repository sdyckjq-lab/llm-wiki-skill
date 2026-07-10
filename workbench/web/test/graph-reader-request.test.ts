import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { GraphOpenPagePayload } from "@llm-wiki/graph-engine";
import { graphReaderDrawer, shouldApplyGraphReaderResult } from "../src/lib/drawer-state";

describe("graph reader async request guards", () => {
	it("only applies a page read result to the matching open graph reader", () => {
		const first = graphPayload("a", "wiki/entities/A.md");
		const second = graphPayload("b", "wiki/entities/B.md");

		assert.equal(shouldApplyGraphReaderResult(graphReaderDrawer(first, { loading: true }), first), true);
		assert.equal(shouldApplyGraphReaderResult(graphReaderDrawer(second, { loading: true }), first), false);
	});

	it("rejects stale results from an older request for the same graph reader target", () => {
		const payload = graphPayload("a", "wiki/entities/A.md");

		assert.equal(
			shouldApplyGraphReaderResult(
				graphReaderDrawer(payload, { loading: true }, { requestKey: "kb-b:request-2" }),
				payload,
				{ requestKey: "kb-a:request-1" },
			),
			false,
		);
		assert.equal(
			shouldApplyGraphReaderResult(
				graphReaderDrawer(payload, { loading: true }, { requestKey: "kb-a:request-1" }),
				payload,
				{ requestKey: "kb-a:request-1" },
			),
			true,
		);
	});
});

function graphPayload(id: string, path: string): GraphOpenPagePayload {
	return {
		path,
		node: {
			id,
			title: id.toUpperCase(),
			type: "entity",
			typeLabel: "实体",
			sourcePath: path,
			community: "test",
			date: null,
			source: null,
			isolated: false,
		},
	};
}

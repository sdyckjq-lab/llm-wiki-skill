import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
	getGraphData,
	getGraphLayout,
	putGraphLayout,
	rebuildGraph,
} from "../src/lib/api";

describe("graph API helpers", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("binds graph reads, rebuilds, and layout writes to the requested knowledge base", async () => {
		const requests: Array<{ url: string; method: string; body?: BodyInit | null }> = [];
		const responses: unknown[] = [
			{ ok: true, data: { needsBuild: true } },
			{ ok: true, data: { version: 2, pins: {}, updatedAt: "" } },
			{ ok: true, data: { status: "started" } },
			{ ok: true, data: { version: 2, pins: {}, updatedAt: "" } },
		];
		globalThis.fetch = (async (input, init) => {
			requests.push({
				url: String(input),
				method: init?.method ?? "GET",
				body: init?.body,
			});
			return new Response(JSON.stringify(responses.shift()), {
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof fetch;

		const kbPath = "/tmp/Knowledge Base";
		await getGraphData(kbPath);
		await getGraphLayout(kbPath);
		await rebuildGraph(kbPath);
		await putGraphLayout(kbPath, { "wiki/a.md": { x: 1, y: 2 } });

		assert.deepEqual(
			requests.map((request) => request.url),
			[
				"/api/graph?kb=%2Ftmp%2FKnowledge+Base",
				"/api/graph/layout?kb=%2Ftmp%2FKnowledge+Base",
				"/api/graph/rebuild?kb=%2Ftmp%2FKnowledge+Base",
				"/api/graph/layout",
			],
		);
		assert.deepEqual(
			requests.map((request) => request.method),
			["GET", "GET", "POST", "PUT"],
		);
		assert.deepEqual(JSON.parse(String(requests[3]?.body)), {
			kbPath,
			version: 2,
			pins: { "wiki/a.md": { x: 1, y: 2 } },
		});
	});
});

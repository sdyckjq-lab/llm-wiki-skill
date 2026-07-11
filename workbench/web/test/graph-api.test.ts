import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { ApiError, ContractMismatchError } from "../src/lib/api/client";
import { getGraphData, getGraphLayout, putGraphLayout, rebuildGraph } from "../src/lib/api/graph";

function stubFetch(body: unknown, status = 200) {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	globalThis.fetch = ((input: URL | string, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return Promise.resolve(
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}) as typeof globalThis.fetch;
	return calls;
}

describe("graph API module", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("graph read 与 layout read/save 通过 migrated JSON client", async () => {
		let calls = stubFetch({
			ok: true,
			data: { needsBuild: true },
		});
		assert.equal((await getGraphData("/kb/registered")).needsBuild, true);
		assert.equal(calls[0]?.url, "/api/graph?kb=%2Fkb%2Fregistered");

		calls = stubFetch({
			ok: true,
			data: { version: 2, pins: {}, updatedAt: "" },
		});
		assert.deepEqual((await getGraphLayout("/kb/registered")).pins, {});
		assert.equal(calls[0]?.url, "/api/graph/layout?kb=%2Fkb%2Fregistered");

		calls = stubFetch({
			ok: true,
			data: { version: 2, pins: {}, updatedAt: "2026-07-10T00:00:00.000Z" },
		});
		await putGraphLayout("/kb/registered", {
			"wiki/topics/a.md": { x: 1, y: 2 },
		});
		assert.equal(calls[0]?.url, "/api/graph/layout");
		assert.equal(calls[0]?.init?.method, "PUT");
		assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
			kbPath: "/kb/registered",
			version: 2,
			pins: { "wiki/topics/a.md": { x: 1, y: 2 } },
		});
	});

	it("graph rebuild 通过 migrated JSON client 返回异步任务状态", async () => {
		const calls = stubFetch({ ok: true, data: { status: "queued" } });
		assert.equal(await rebuildGraph("/kb/registered"), "queued");
		assert.equal(calls[0]?.url, "/api/graph/rebuild?kb=%2Fkb%2Fregistered");
		assert.equal(calls[0]?.init?.method, "POST");
	});

	it("rebuild 透出 BUSY code，并拒绝旧响应格式", async () => {
		stubFetch({ ok: false, code: "BUSY", message: "图谱正在重建" }, 409);
		await assert.rejects(
			() => rebuildGraph("/kb/registered"),
			(err) => err instanceof ApiError && err.code === "BUSY",
		);

		stubFetch({ ok: true, status: "started" });
		await assert.rejects(
			() => rebuildGraph("/kb/registered"),
			(err) => err instanceof ContractMismatchError,
		);
	});

	it("统一错误透出 code，响应 schema mismatch 被拒绝", async () => {
		stubFetch({ ok: false, code: "NO_ACTIVE_KB", message: "当前没有选择知识库" }, 400);
		await assert.rejects(
			() => getGraphData(""),
			(err) => err instanceof ApiError && err.code === "NO_ACTIVE_KB",
		);

		stubFetch({ ok: true, data: { needsBuild: false, graphPath: "/kb/graph.json" } });
		await assert.rejects(
			() => getGraphData("/kb/registered"),
			(err) => err instanceof ContractMismatchError,
		);
	});
});

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { MigratedJsonPath } from "@llm-wiki/workbench-contracts";

import { ApiError, ContractMismatchError } from "../src/lib/api/client";
import { getArtifactFileUrl, getArtifactManifest, listArtifacts } from "../src/lib/api/artifacts";
import { listRefs, readPage } from "../src/lib/api/pages";

const artifactId = "11111111-1111-4111-8111-111111111111";
const manifest = {
	id: artifactId,
	kind: "html" as const,
	renderer: "iframe" as const,
	metadata: {
		title: "研究报告",
		createdAt: "2026-07-10T00:00:00.000Z",
		sourceConversationId: "conversation-1",
		sourceKbPath: "/kb/registered",
		sourceSkill: "html",
		sizeBytes: 12,
	},
	files: [{ name: "report.html", sizeBytes: 12, mimeType: "text/html; charset=utf-8" }],
	primaryFile: "report.html",
};

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

describe("pages / artifacts API module", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("页面读取与引用列表通过 migrated JSON client 解析 data", async () => {
		let calls = stubFetch({ ok: true, data: { content: "# 页面" } });
		assert.equal(await readPage("/kb/registered", "wiki/topics/a.md"), "# 页面");
		assert.equal(calls[0]?.url, "/api/page?kb=%2Fkb%2Fregistered&path=wiki%2Ftopics%2Fa.md");

		calls = stubFetch({
			ok: true,
			data: [{ path: "wiki/topics/a.md", name: "a", category: "topics", title: "A" }],
		});
		assert.equal((await listRefs("/kb/registered", "A", 20))[0]?.title, "A");
		assert.equal(calls[0]?.url, "/api/refs?kb=%2Fkb%2Fregistered&q=A&limit=20");
	});

	it("artifact list 与 manifest 通过 migrated JSON client 解析 data", async () => {
		let calls = stubFetch({ ok: true, data: [manifest] });
		assert.deepEqual(await listArtifacts("conversation-1"), [manifest]);
		assert.equal(calls[0]?.url, "/api/artifacts?conversation=conversation-1");

		calls = stubFetch({ ok: true, data: manifest });
		assert.deepEqual(await getArtifactManifest(artifactId), manifest);
		assert.equal(calls[0]?.url, `/api/artifacts/${artifactId}`);
	});

	it("统一错误透出 code，旧 top-level shape 被拒绝", async () => {
		stubFetch({ ok: false, code: "NOT_FOUND", message: "wiki 页面不存在" }, 404);
		await assert.rejects(
			() => readPage("/kb/registered", "wiki/topics/missing.md"),
			(err) => err instanceof ApiError && err.code === "NOT_FOUND",
		);

		stubFetch({ ok: true, items: [manifest] });
		await assert.rejects(
			() => listArtifacts(),
			(err) => err instanceof ContractMismatchError,
		);
	});

	it("文件下载只构造 URL，不调用普通 JSON client", () => {
		let called = false;
		globalThis.fetch = (() => {
			called = true;
			throw new Error("不应调用 fetch");
		}) as typeof globalThis.fetch;
		assert.equal(
			getArtifactFileUrl(artifactId, "报告 final.html"),
			`/api/artifacts/${artifactId}/files/%E6%8A%A5%E5%91%8A%20final.html`,
		);
		assert.equal(called, false);
	});

	it("普通 JSON client 的 path 类型不包含 file-download endpoint", () => {
		// @ts-expect-error file-download path 不属于 MigratedJsonPath
		const downloadPath: MigratedJsonPath = "/api/artifacts/:id/files/:filename";
		assert.equal(downloadPath, "/api/artifacts/:id/files/:filename");
	});
});

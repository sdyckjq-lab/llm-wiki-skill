import assert from "node:assert/strict";
import test from "node:test";

import type { ArtifactManifest, PageRef } from "@llm-wiki/workbench-contracts";

import { createApp } from "./app.js";
import type { ArtifactRouteService } from "./routes/artifacts.js";
import type { PageRouteService } from "./routes/pages.js";

const kbPath = "/fake/registered";
const artifactId = "11111111-1111-4111-8111-111111111111";
const nonV4ArtifactId = "11111111-1111-1111-8111-111111111111";
const refs: PageRef[] = [
	{ path: "wiki/topics/a.md", name: "a", category: "topics", title: "A" },
];
const manifest: ArtifactManifest = {
	id: artifactId,
	kind: "html",
	renderer: "iframe",
	metadata: {
		title: "研究报告",
		createdAt: "2026-07-10T00:00:00.000Z",
		sourceConversationId: "conversation-1",
		sourceKbPath: kbPath,
		sourceSkill: "html",
		sizeBytes: 12,
	},
	files: [{ name: "report.html", sizeBytes: 12, mimeType: "text/html; charset=utf-8" }],
	primaryFile: "report.html",
};

function createPageService(overrides: Partial<PageRouteService> = {}): PageRouteService {
	return {
		getActiveKnowledgeBasePath: () => kbPath,
		assertRegisteredKnowledgeBase: async (requested) => {
			if (requested === "/fake/private") {
				throw Object.assign(new Error("/Users/private/secret"), {
					code: "FORBIDDEN_PATH",
					details: { reason: "outside-root" },
				});
			}
			if (requested !== kbPath) {
				throw Object.assign(new Error("missing"), { code: "KB_NOT_REGISTERED" });
			}
			return requested;
		},
		listPageRefs: async () => refs,
		readWikiPage: async (_kb, path) => {
			if (path === "wiki/topics/missing.md") {
				throw Object.assign(new Error("ENOENT /Users/private/kb/wiki/topics/missing.md"), {
					code: "ENOENT",
				});
			}
			if (path.includes("..")) throw new Error("path must be inside wiki /Users/private");
			return "# 页面";
		},
		...overrides,
	};
}

function createArtifactService(overrides: Partial<ArtifactRouteService> = {}): ArtifactRouteService {
	return {
		listArtifacts: () => [manifest],
		getArtifact: (id) => (id === artifactId ? manifest : null),
		readArtifactFile: async (id, filename) => {
			if (id !== artifactId || filename !== "report.html") return null;
			return {
				body: new TextEncoder().encode("<h1>报告</h1>"),
				mimeType: "text/html; charset=utf-8",
				sizeBytes: 15,
			};
		},
		...overrides,
	};
}

async function json(res: Response): Promise<Record<string, unknown>> {
	return (await res.json()) as Record<string, unknown>;
}

test("页面读取与引用候选通过 active context 返回统一 success envelope", async () => {
	const pageService = createPageService();
	const app = createApp({ pageService, artifactService: createArtifactService() });

	const page = await app.request("/api/page?path=wiki%2Ftopics%2Fa.md");
	assert.equal(page.status, 200);
	assert.deepEqual(await json(page), { ok: true, data: { content: "# 页面" } });

	const reference = await app.request("/api/refs?q=A&limit=20");
	assert.equal(reference.status, 200);
	assert.deepEqual(await json(reference), { ok: true, data: refs });
});

test("页面 route 返回稳定 not found、forbidden path 与 invalid request", async () => {
	const app = createApp({ pageService: createPageService(), artifactService: createArtifactService() });

	const missing = await app.request("/api/page?path=wiki%2Ftopics%2Fmissing.md");
	assert.equal(missing.status, 404);
	assert.deepEqual(await json(missing), {
		ok: false,
		code: "NOT_FOUND",
		message: "wiki 页面不存在",
	});

	const forbidden = await app.request("/api/page?kb=%2Ffake%2Fprivate&path=wiki%2Ftopics%2Fa.md");
	assert.equal(forbidden.status, 403);
	const forbiddenPayload = await json(forbidden);
	assert.deepEqual(forbiddenPayload, {
		ok: false,
		code: "FORBIDDEN_PATH",
		message: "路径不在允许的知识库边界内",
		details: { reason: "outside-root" },
	});
	assert.equal(JSON.stringify(forbiddenPayload).includes("/Users/"), false);

	const invalid = await app.request("/api/page?path=");
	assert.equal(invalid.status, 400);
	assert.equal((await json(invalid)).code, "INVALID_REQUEST");

	const invalidLimit = await app.request("/api/refs?limit=bad");
	assert.equal(invalidLimit.status, 400);
	assert.equal((await json(invalidLimit)).code, "INVALID_REQUEST");
});

test("页面 route 复用 active context 的 no active 与 registered KB 错误语义", async () => {
	let app = createApp({
		pageService: createPageService({ getActiveKnowledgeBasePath: () => null }),
		artifactService: createArtifactService(),
	});
	let res = await app.request("/api/page?path=wiki%2Ftopics%2Fa.md");
	assert.equal(res.status, 400);
	assert.equal((await json(res)).code, "NO_ACTIVE_KB");

	app = createApp({ pageService: createPageService(), artifactService: createArtifactService() });
	res = await app.request("/api/refs?kb=%2Ffake%2Funregistered");
	assert.equal(res.status, 404);
	assert.equal((await json(res)).code, "KB_NOT_REGISTERED");
});

test("artifact list 与 manifest 返回统一 success/failure envelope", async () => {
	const app = createApp({ pageService: createPageService(), artifactService: createArtifactService() });
	const list = await app.request("/api/artifacts?conversation=conversation-1");
	assert.deepEqual(await json(list), { ok: true, data: [manifest] });

	const found = await app.request(`/api/artifacts/${artifactId}`);
	assert.deepEqual(await json(found), { ok: true, data: manifest });

	const invalid = await app.request("/api/artifacts/not-an-id");
	assert.equal(invalid.status, 400);
	assert.equal((await json(invalid)).code, "INVALID_REQUEST");

	const missingId = "22222222-2222-4222-8222-222222222222";
	const missing = await app.request(`/api/artifacts/${missingId}`);
	assert.equal(missing.status, 404);
	assert.deepEqual(await json(missing), {
		ok: false,
		code: "NOT_FOUND",
		message: "产物不存在",
	});
});

test("artifact manifest 与文件下载只让 v4 UUID 进入底层服务", async () => {
	const manifestCalls: string[] = [];
	const fileCalls: string[] = [];
	const artifactService = createArtifactService({
		getArtifact: (id) => {
			manifestCalls.push(id);
			return id === artifactId ? manifest : null;
		},
		readArtifactFile: async (id, filename) => {
			fileCalls.push(id);
			if (id !== artifactId || filename !== "report.html") return null;
			return {
				body: new TextEncoder().encode("<h1>报告</h1>"),
				mimeType: "text/html; charset=utf-8",
				sizeBytes: 15,
			};
		},
	});
	const app = createApp({ pageService: createPageService(), artifactService });

	const manifestSuccess = await app.request(`/api/artifacts/${artifactId}`);
	assert.equal(manifestSuccess.status, 200);
	const fileSuccess = await app.request(`/api/artifacts/${artifactId}/files/report.html`);
	assert.equal(fileSuccess.status, 200);
	assert.deepEqual(manifestCalls, [artifactId]);
	assert.deepEqual(fileCalls, [artifactId]);

	const invalidManifest = await app.request(`/api/artifacts/${nonV4ArtifactId}`);
	assert.equal(invalidManifest.status, 400);
	assert.equal((await json(invalidManifest)).code, "INVALID_REQUEST");
	const invalidFile = await app.request(
		`/api/artifacts/${nonV4ArtifactId}/files/report.html`,
	);
	assert.equal(invalidFile.status, 400);
	assert.equal((await json(invalidFile)).code, "INVALID_REQUEST");
	assert.deepEqual(manifestCalls, [artifactId]);
	assert.deepEqual(fileCalls, [artifactId]);
});

test("manifest 中的产物文件已从磁盘消失时返回统一 NOT_FOUND envelope", async () => {
	const artifactService = createArtifactService({
		readArtifactFile: async () => {
			throw Object.assign(
				new Error("ENOENT /Users/private/artifacts/report.html"),
				{ code: "ENOENT" },
			);
		},
	});
	const app = createApp({ pageService: createPageService(), artifactService });
	const res = await app.request(`/api/artifacts/${artifactId}/files/report.html`);
	assert.equal(res.status, 404);
	const payload = await json(res);
	assert.deepEqual(payload, {
		ok: false,
		code: "NOT_FOUND",
		message: "产物文件不存在",
	});
	assert.equal(JSON.stringify(payload).includes("/Users/"), false);
});

test("文件下载成功返回文件 Response，失败返回统一 error envelope", async () => {
	const app = createApp({ pageService: createPageService(), artifactService: createArtifactService() });
	const success = await app.request(`/api/artifacts/${artifactId}/files/report.html`);
	assert.equal(success.status, 200);
	assert.equal(success.headers.get("content-type"), "text/html; charset=utf-8");
	assert.equal(success.headers.get("content-disposition"), 'attachment; filename="report.html"');
	assert.equal(await success.text(), "<h1>报告</h1>");

	const missing = await app.request(`/api/artifacts/${artifactId}/files/missing.html`);
	assert.equal(missing.status, 404);
	assert.deepEqual(await json(missing), {
		ok: false,
		code: "NOT_FOUND",
		message: "产物文件不存在",
	});

	const invalid = await app.request("/api/artifacts/not-an-id/files/report.html");
	assert.equal(invalid.status, 400);
	assert.equal((await json(invalid)).code, "INVALID_REQUEST");
});

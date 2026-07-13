import assert from "node:assert/strict";
import test from "node:test";

import {
	ArtifactIdSchema,
	ArtifactListDataSchema,
	ArtifactManifestDataSchema,
	ArtifactManifestSchema,
	PageReadDataSchema,
	PageRefsDataSchema,
	PageRefsQuerySchema,
	findEndpoint,
	isMigratedJsonPath,
} from "../src/index.js";

const artifactId = "11111111-1111-4111-8111-111111111111";
const nonV4ArtifactId = "11111111-1111-1111-8111-111111111111";

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

test("artifact id schema 只接受 v4 UUID", () => {
	assert.equal(ArtifactIdSchema.safeParse(artifactId).success, true);
	assert.equal(ArtifactIdSchema.safeParse(nonV4ArtifactId).success, false);
	assert.equal(ArtifactIdSchema.safeParse("not-an-id").success, false);
});

test("页面读取与引用候选共享 schema 只接受统一 data 形状", () => {
	assert.deepEqual(PageReadDataSchema.parse({ content: "# 页面" }), { content: "# 页面" });
	assert.deepEqual(PageRefsDataSchema.parse([{ path: "wiki/topics/a.md", name: "a", category: "topics", title: "A" }])[0]?.title, "A");
	assert.deepEqual(PageRefsQuerySchema.parse({ kb: "/kb/registered", q: "A", limit: "20" }), {
		kb: "/kb/registered",
		q: "A",
		limit: 20,
	});
	assert.equal(PageRefsQuerySchema.safeParse({ limit: "not-a-number" }).success, false);
});

test("artifact list 与 manifest 共享同一个 manifest schema", () => {
	assert.deepEqual(ArtifactManifestSchema.parse(manifest), manifest);
	assert.deepEqual(ArtifactListDataSchema.parse([manifest]), [manifest]);
	assert.deepEqual(ArtifactManifestDataSchema.parse(manifest), manifest);
});

test("#169 JSON endpoints 已迁移，文件下载保持 file-download 例外", () => {
	for (const path of ["/api/refs", "/api/page", "/api/artifacts", "/api/artifacts/:id"] as const) {
		assert.equal(findEndpoint("GET", path)?.kind, "migrated-json", path);
		assert.equal(isMigratedJsonPath(path), true, path);
	}
	const download = findEndpoint("GET", "/api/artifacts/id/files/report.html");
	assert.equal(download?.kind, "file-download");
	assert.equal(isMigratedJsonPath("/api/artifacts/id/files/report.html"), false);
});

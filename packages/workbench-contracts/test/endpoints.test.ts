import assert from "node:assert/strict";
import test from "node:test";

import {
	EndpointEntrySchema,
	EndpointKindSchema,
	EndpointSafetySchema,
	ENDPOINT_REGISTRY,
	findEndpoint,
	isMigratedJsonPath,
	MIGRATED_JSON_PATHS,
	requiresCapabilityToken,
} from "../src/index.js";

test("ENDPOINT_REGISTRY 每条 entry 形状合法", () => {
	assert.ok(ENDPOINT_REGISTRY.length > 0);
	for (const entry of ENDPOINT_REGISTRY) {
		const parsed = EndpointEntrySchema.safeParse(entry);
		assert.ok(parsed.success, `invalid entry ${entry.method} ${entry.path}`);
	}
});

test("method + path 在 registry 中唯一（没有重复登记）", () => {
	const seen = new Set<string>();
	for (const entry of ENDPOINT_REGISTRY) {
		const key = `${entry.method} ${entry.path}`;
		assert.ok(!seen.has(key), `duplicate endpoint ${key}`);
		seen.add(key);
	}
});

test("registry 覆盖四类 endpoint kind", () => {
	const kinds = new Set(ENDPOINT_REGISTRY.map((e) => e.kind));
	for (const expected of EndpointKindSchema.options) {
		assert.ok(kinds.has(expected), `missing kind ${expected}`);
	}
});

test("registry 覆盖两类 safety 分类", () => {
	const safeties = new Set(ENDPOINT_REGISTRY.map((e) => e.safety));
	for (const expected of EndpointSafetySchema.options) {
		assert.ok(safeties.has(expected), `missing safety ${expected}`);
	}
});

test("file-download 与 sse 作为显式例外进入 registry", () => {
	const fileDownload = ENDPOINT_REGISTRY.filter((e) => e.kind === "file-download");
	assert.equal(fileDownload.length, 1);
	assert.equal(fileDownload[0].path, "/api/artifacts/:id/files/:filename");
	assert.equal(fileDownload[0].safety, "read-only");

	const sse = ENDPOINT_REGISTRY.filter((e) => e.kind === "sse");
	assert.ok(sse.length >= 2, "至少有 prompt 与 batch-digest 两条 SSE");
	// POST 启动型 SSE 会触发模型，必须要求 token（spec §9：会触发模型的 SSE 启动必须 POST + token）
	const postSse = sse.filter((e) => e.method === "POST");
	assert.ok(postSse.length >= 2);
	for (const entry of postSse) {
		assert.equal(
			entry.safety,
			"state-changing",
			`POST SSE 启动 ${entry.path} 必须要求 token`,
		);
	}
	// GET /api/events 是 EventSource 只读流（spec §9：保持只读），登记为 read-only sse
	const graphEvents = ENDPOINT_REGISTRY.find(
		(e) => e.method === "GET" && e.path === "/api/events",
	);
	assert.equal(graphEvents?.kind, "sse");
	assert.equal(graphEvents?.safety, "read-only");
});

test("MIGRATED_JSON_PATHS 与 registry 的 migrated-json 子集严格一致（单一来源）", () => {
	const expected = ENDPOINT_REGISTRY.filter((e) => e.kind === "migrated-json").map(
		(e) => e.path,
	);
	assert.deepEqual([...MIGRATED_JSON_PATHS], expected);
});

test("health 与设置/模型/auth status 是 migrated-json endpoint", () => {
	const migrated = ENDPOINT_REGISTRY.filter((e) => e.kind === "migrated-json").map(
		(e) => `${e.method} ${e.path}`,
	);
	for (const expected of [
		"GET /api/health",
		"GET /api/config",
		"POST /api/config",
		"GET /api/models",
		"GET /api/auth/status",
	]) {
		assert.ok(migrated.includes(expected), `missing migrated endpoint ${expected}`);
	}
	const health = ENDPOINT_REGISTRY.find(
		(e) => e.method === "GET" && e.path === "/api/health",
	);
	assert.equal(health?.kind, "migrated-json");
	assert.equal(health?.safety, "read-only");
});

test("isMigratedJsonPath 接受 migrated-json、拒绝 legacy path", () => {
	assert.equal(isMigratedJsonPath("/api/health"), true);
	assert.equal(isMigratedJsonPath("/api/knowledge-bases"), true);
	assert.equal(isMigratedJsonPath("/api/knowledge-base"), true);
	assert.equal(isMigratedJsonPath("/api/graph"), true);
	assert.equal(isMigratedJsonPath("/api/graph/rebuild"), true);
	assert.equal(isMigratedJsonPath("/api/prompt"), false); // sse，不是 migrated-json
	assert.equal(
		isMigratedJsonPath("/api/artifacts/x/files/y.md"),
		false, // file-download，不是 migrated-json
	);
});

test("config / models / auth status 已迁移为 migrated-json，并保持安全分类", () => {
	const cases = [
		{ method: "GET", path: "/api/config", safety: "read-only" },
		{ method: "POST", path: "/api/config", safety: "state-changing" },
		{ method: "GET", path: "/api/models", safety: "read-only" },
		{ method: "GET", path: "/api/auth/status", safety: "read-only" },
	] as const;
	for (const item of cases) {
		const entry = findEndpoint(item.method, item.path);
		assert.equal(entry?.kind, "migrated-json", `${item.method} ${item.path}`);
		assert.equal(entry?.safety, item.safety, `${item.method} ${item.path}`);
		assert.equal(isMigratedJsonPath(item.path), true, item.path);
		assert.equal(
			requiresCapabilityToken(item.method, item.path),
			item.safety === "state-changing",
			`${item.method} ${item.path}`,
		);
	}
});

test("knowledge bases 与 active context 路由已迁移并保持安全分类", () => {
	const cases = [
		{ method: "GET", path: "/api/knowledge-bases", safety: "read-only" },
		{
			method: "POST",
			path: "/api/knowledge-bases/external",
			safety: "state-changing",
		},
		{
			method: "POST",
			path: "/api/knowledge-bases/inspect",
			safety: "read-only",
		},
		{
			method: "DELETE",
			path: "/api/knowledge-bases/external",
			safety: "state-changing",
		},
		{ method: "GET", path: "/api/knowledge-base", safety: "read-only" },
		{
			method: "POST",
			path: "/api/knowledge-base",
			safety: "state-changing",
		},
		{
			method: "DELETE",
			path: "/api/knowledge-base",
			safety: "state-changing",
		},
	] as const;
	for (const item of cases) {
		const entry = findEndpoint(item.method, item.path);
		assert.equal(entry?.kind, "migrated-json", `${item.method} ${item.path}`);
		assert.equal(entry?.safety, item.safety, `${item.method} ${item.path}`);
		assert.equal(isMigratedJsonPath(item.path), true, item.path);
		assert.equal(
			requiresCapabilityToken(item.method, item.path),
			item.safety === "state-changing",
			`${item.method} ${item.path}`,
		);
	}
});

test("conversations 路由已迁移并保持安全分类", () => {
	const cases = [
		{ method: "GET", path: "/api/conversations", safety: "read-only" },
		{
			method: "POST",
			path: "/api/conversations",
			safety: "state-changing",
		},
		{
			method: "POST",
			path: "/api/conversations/new",
			safety: "state-changing",
		},
	] as const;
	for (const item of cases) {
		const entry = findEndpoint(item.method, item.path);
		assert.equal(entry?.kind, "migrated-json", `${item.method} ${item.path}`);
		assert.equal(entry?.safety, item.safety, `${item.method} ${item.path}`);
		assert.equal(isMigratedJsonPath(item.path), true, item.path);
		assert.equal(
			requiresCapabilityToken(item.method, item.path),
			item.safety === "state-changing",
			`${item.method} ${item.path}`,
		);
	}
});

// ============= #166 安全边界查询 =============

test("禁止 GET 产生副作用：registry 里没有任何 GET 被标记为 state-changing", () => {
	// spec §9：禁止 GET 产生副作用。数据层护栏——所有 GET 必须是只读白名单。
	// 这条不变量保证安全中间件只要把 read-only 放行，就绝不会漏放一个会改状态的 GET。
	for (const entry of ENDPOINT_REGISTRY) {
		if (entry.method === "GET") {
			assert.equal(
				entry.safety,
				"read-only",
				`GET ${entry.path} 不允许标记为 state-changing`,
			);
		}
	}
});

test("findEndpoint 命中静态 path 与动态段 path", () => {
	assert.equal(findEndpoint("GET", "/api/health")?.path, "/api/health");
	// 方法不匹配
	assert.equal(findEndpoint("POST", "/api/health"), undefined);
	// 动态段：:id / :filename 实际值匹配
	const file = findEndpoint("GET", "/api/artifacts/abc-123/files/report.md");
	assert.equal(file?.path, "/api/artifacts/:id/files/:filename");
	assert.equal(file?.kind, "file-download");
	assert.equal(file?.safety, "read-only");
	// 方法小写也归一
	assert.equal(findEndpoint("get", "/api/health")?.path, "/api/health");
});

test("requiresCapabilityToken：state-changing 需要、read-only 豁免、未登记 fail closed", () => {
	// read-only 白名单豁免 token
	assert.equal(requiresCapabilityToken("GET", "/api/health"), false);
	assert.equal(requiresCapabilityToken("GET", "/api/events"), false); // 只读 SSE
	assert.equal(
		requiresCapabilityToken("GET", "/api/artifacts/x/files/y.md"),
		false,
	); // 文件下载
	// state-changing 需要 token
	assert.equal(requiresCapabilityToken("POST", "/api/prompt"), true);
	assert.equal(requiresCapabilityToken("POST", "/api/knowledge-bases/new"), true);
	assert.equal(requiresCapabilityToken("PUT", "/api/graph/layout"), true);
	assert.equal(requiresCapabilityToken("DELETE", "/api/knowledge-base"), true);
	// 未登记 endpoint 安全默认：需要 token（避免漏网的新增状态改写路由）
	assert.equal(requiresCapabilityToken("POST", "/api/unknown-new-route"), true);
});

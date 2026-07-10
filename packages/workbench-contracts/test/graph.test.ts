import assert from "node:assert/strict";
import test from "node:test";

import {
	GraphLayoutDataSchema,
	GraphLayoutWriteBodySchema,
	GraphReadDataSchema,
	findEndpoint,
	isMigratedJsonPath,
} from "../src/index.js";

const graphData = {
	meta: {
		build_date: "2026-07-10T00:00:00.000Z",
		wiki_title: "测试知识库",
		total_nodes: 1,
		total_edges: 0,
	},
	nodes: [
		{
			id: "topic-a",
			label: "主题 A",
			type: "topic",
			source_path: "wiki/topics/a.md",
		},
	],
	edges: [],
};

const layout = {
	version: 2 as const,
	pins: {
		"wiki/topics/a.md": { x: 1, y: 2, coordinateSpace: "world" as const },
	},
	updatedAt: "2026-07-10T00:00:00.000Z",
};

test("graph read 与 layout data schema 接受当前图谱主路径结构", () => {
	assert.deepEqual(
		GraphReadDataSchema.parse({
			needsBuild: false,
			data: graphData,
		}),
		{
			needsBuild: false,
			data: graphData,
		},
	);
	assert.deepEqual(
		GraphReadDataSchema.parse({
			needsBuild: true,
		}),
		{ needsBuild: true },
	);
	assert.deepEqual(GraphLayoutDataSchema.parse(layout), layout);
	assert.equal(
		GraphReadDataSchema.safeParse({
			needsBuild: false,
			data: { ...graphData, insights: { surprising_connections: [] } },
		}).success,
		false,
	);
});

test("layout 写入 body 复用 kbPath 口径并拒绝 schema mismatch", () => {
	assert.deepEqual(
		GraphLayoutWriteBodySchema.parse({
			kbPath: "/kb/registered",
			version: 2,
			pins: layout.pins,
		}),
		{ kbPath: "/kb/registered", version: 2, pins: layout.pins },
	);
	assert.equal(
		GraphLayoutWriteBodySchema.safeParse({
			kb: "/kb/registered",
			pins: layout.pins,
		}).success,
		false,
	);
	assert.deepEqual(
		GraphLayoutWriteBodySchema.parse({
			kbPath: "/kb/registered",
			version: 2,
			pins: { "wiki/a.md": { x: "1", y: "2" } },
		}),
		{
			kbPath: "/kb/registered",
			version: 2,
			pins: { "wiki/a.md": { x: 1, y: 2 } },
		},
	);
	assert.equal(
		GraphLayoutWriteBodySchema.safeParse({
			kbPath: "/kb/registered",
			version: 2,
			pins: { "wiki/a.md": { x: "not-a-number", y: 2 } },
		}).success,
		false,
	);
});

test("#170 只迁移 graph read/layout，rebuild 保持 legacy", () => {
	for (const endpoint of [
		{ method: "GET", path: "/api/graph", safety: "read-only" },
		{ method: "GET", path: "/api/graph/layout", safety: "read-only" },
		{ method: "PUT", path: "/api/graph/layout", safety: "state-changing" },
	] as const) {
		const entry = findEndpoint(endpoint.method, endpoint.path);
		assert.equal(entry?.kind, "migrated-json");
		assert.equal(entry?.safety, endpoint.safety);
		assert.equal(isMigratedJsonPath(endpoint.path), true);
	}
	assert.equal(findEndpoint("POST", "/api/graph/rebuild")?.kind, "legacy");
	assert.equal(isMigratedJsonPath("/api/graph/rebuild"), false);
});

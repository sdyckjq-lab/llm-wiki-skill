import assert from "node:assert/strict";
import test from "node:test";

import type {
	GraphLayoutData,
	GraphReadData,
} from "@llm-wiki/workbench-contracts";

import { createApp } from "./app.js";
import type { GraphRouteService } from "./routes/graph.js";

const kbPath = "/fake/registered";
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
const emptyLayout = { version: 2 as const, pins: {}, updatedAt: "" };

function createGraphService(
	overrides: Partial<GraphRouteService> = {},
): GraphRouteService {
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
				throw Object.assign(new Error("missing"), {
					code: "KB_NOT_REGISTERED",
				});
			}
			return requested;
		},
		readGraphData: async (): Promise<GraphReadData> => ({
			needsBuild: false,
			data: graphData,
		}),
		readGraphLayout: async (): Promise<GraphLayoutData> => emptyLayout,
		writeGraphLayout: async (_path, input): Promise<GraphLayoutData> => ({
			...emptyLayout,
			...input,
			updatedAt: "2026-07-10T00:00:00.000Z",
		}),
		...overrides,
	};
}

async function json(res: Response): Promise<Record<string, unknown>> {
	return (await res.json()) as Record<string, unknown>;
}

test("graph read 与 layout read/save 返回统一 success envelope", async () => {
	const writes: Array<{ kbPath: string; input: unknown }> = [];
	const app = createApp({
		graphService: createGraphService({
			writeGraphLayout: async (resolvedPath, input) => {
				writes.push({ kbPath: resolvedPath, input });
				return {
					version: 2,
					pins: input.pins,
					updatedAt: "2026-07-10T00:00:00.000Z",
				};
			},
		}),
	});

	const graph = await app.request("/api/graph");
	assert.equal(graph.status, 200);
	assert.deepEqual(await json(graph), {
		ok: true,
		data: { needsBuild: false, data: graphData },
	});

	const layout = await app.request("/api/graph/layout");
	assert.equal(layout.status, 200);
	assert.deepEqual(await json(layout), {
		ok: true,
		data: emptyLayout,
	});

	const saved = await app.request("/api/graph/layout", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			kbPath,
			version: 2,
			pins: { "wiki/topics/a.md": { x: 1, y: 2 } },
		}),
	});
	assert.equal(saved.status, 200);
	assert.equal((await json(saved)).ok, true);
	assert.deepEqual(writes, [
		{
			kbPath,
			input: {
				version: 2,
				pins: { "wiki/topics/a.md": { x: 1, y: 2 } },
			},
		},
	]);
});

test("layout PUT 的 query kb 优先于 body kbPath", async () => {
	const writes: string[] = [];
	const queryKb = "/fake/query";
	const app = createApp({
		graphService: createGraphService({
			assertRegisteredKnowledgeBase: async (requested) => requested,
			writeGraphLayout: async (resolvedPath, input) => {
				writes.push(resolvedPath);
				return { version: 2, pins: input.pins, updatedAt: "now" };
			},
		}),
	});
	const res = await app.request(
		`/api/graph/layout?kb=${encodeURIComponent(queryKb)}`,
		{
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				kbPath: "/fake/body",
				version: 2,
				pins: {},
			}),
		},
	);
	assert.equal(res.status, 200);
	assert.deepEqual(writes, [queryKb]);
});

test("graph route 复用 active context 的 no active 与 registered KB 错误语义", async () => {
	let app = createApp({
		graphService: createGraphService({ getActiveKnowledgeBasePath: () => null }),
	});
	let res = await app.request("/api/graph");
	assert.equal(res.status, 400);
	assert.equal((await json(res)).code, "NO_ACTIVE_KB");

	app = createApp({ graphService: createGraphService() });
	res = await app.request("/api/graph/layout?kb=%2Ffake%2Funregistered");
	assert.equal(res.status, 404);
	assert.equal((await json(res)).code, "KB_NOT_REGISTERED");

	res = await app.request("/api/graph?kb=%2Ffake%2Fprivate");
	assert.equal(res.status, 403);
	const payload = await json(res);
	assert.deepEqual(payload, {
		ok: false,
		code: "FORBIDDEN_PATH",
		message: "路径不在允许的知识库边界内",
		details: { reason: "outside-root" },
	});
	assert.equal(JSON.stringify(payload).includes("/Users/"), false);
});

test("graph not found 与 layout schema mismatch 返回稳定 failure envelope", async () => {
	let app = createApp({
		graphService: createGraphService({
			readGraphData: async () => {
				throw Object.assign(new Error("ENOENT /Users/private/graph-data.json"), {
					code: "ENOENT",
				});
			},
		}),
	});
	let res = await app.request("/api/graph");
	assert.equal(res.status, 404);
	assert.deepEqual(await json(res), {
		ok: false,
		code: "NOT_FOUND",
		message: "图谱数据不存在",
	});

	app = createApp({ graphService: createGraphService() });
	res = await app.request("/api/graph/layout", {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ kbPath, version: 2, pins: { "wiki/a.md": { x: "bad", y: 2 } } }),
	});
	assert.equal(res.status, 400);
	assert.equal((await json(res)).code, "INVALID_REQUEST");
});

test("graph service response schema mismatch 由统一兜底拒绝", async () => {
	const app = createApp({
		mode: "test",
		graphService: createGraphService({
			readGraphLayout: async () =>
				({ version: 2, pins: "bad", updatedAt: "" }) as never,
		}),
	});
	const res = await app.request("/api/graph/layout");
	assert.equal(res.status, 500);
	assert.equal((await json(res)).code, "INTERNAL_ERROR");
});

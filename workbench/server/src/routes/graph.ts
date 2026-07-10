import { Hono } from "hono";

import {
	GraphLayoutDataSchema,
	GraphLayoutWriteBodySchema,
	GraphReadDataSchema,
	type GraphLayoutData,
	type GraphReadData,
} from "@llm-wiki/workbench-contracts";

import { getActive } from "../agent.js";
import {
	mapKnowledgeBaseError,
	resolveKnowledgeBaseContext,
} from "../http/knowledge-base-context.js";
import {
	HttpContractError,
	parseValidatedBody,
} from "../http/request.js";
import { jsonOk } from "../http/response.js";
import {
	readGraphData,
	readGraphLayout,
	writeGraphLayout,
} from "../graph.js";
import { assertRegisteredKnowledgeBase } from "../knowledge-bases.js";

export interface GraphRouteService {
	getActiveKnowledgeBasePath: () => string | null;
	assertRegisteredKnowledgeBase: (kbPath: string) => Promise<string>;
	readGraphData: (kbPath: string) => Promise<GraphReadData>;
	readGraphLayout: (kbPath: string) => Promise<GraphLayoutData>;
	writeGraphLayout: (
		kbPath: string,
		input: { version: 2; pins: GraphLayoutData["pins"] },
	) => Promise<GraphLayoutData>;
}

export const defaultGraphRouteService: GraphRouteService = {
	getActiveKnowledgeBasePath: () => getActive()?.kb.path ?? null,
	assertRegisteredKnowledgeBase,
	readGraphData: async (kbPath) => {
		const result = await readGraphData(kbPath);
		return GraphReadDataSchema.parse(
			result.needsBuild
				? { needsBuild: true }
				: {
						needsBuild: false,
						data: result.data,
					},
		);
	},
	readGraphLayout: async (kbPath) => {
		const result = await readGraphLayout(kbPath);
		return GraphLayoutDataSchema.parse(result.layout);
	},
	writeGraphLayout: async (kbPath, input) => {
		const result = await writeGraphLayout(kbPath, input);
		return GraphLayoutDataSchema.parse(result.layout);
	},
};

export function createGraphRoutes(service: GraphRouteService): Hono {
	const router = new Hono();

	router.get("/graph", async (c) => {
		const kbPath = await resolveGraphKnowledgeBase(c.req.query("kb"), service);
		try {
			return jsonOk(
				c,
				GraphReadDataSchema.parse(await service.readGraphData(kbPath)),
			);
		} catch (err) {
			throw mapGraphError(err);
		}
	});

	router.get("/graph/layout", async (c) => {
		const kbPath = await resolveGraphKnowledgeBase(c.req.query("kb"), service);
		try {
			return jsonOk(
				c,
				GraphLayoutDataSchema.parse(await service.readGraphLayout(kbPath)),
			);
		} catch (err) {
			throw mapGraphError(err);
		}
	});

	router.put("/graph/layout", async (c) => {
		const body = await parseValidatedBody(c, GraphLayoutWriteBodySchema);
		const kbPath = await resolveKnowledgeBaseContext(
			{
				queryKb: c.req.query("kb"),
				...(body.kbPath ? { body: { kbPath: body.kbPath } } : {}),
			},
			{
				getActiveKnowledgeBasePath: service.getActiveKnowledgeBasePath,
				assertRegisteredKnowledgeBase: service.assertRegisteredKnowledgeBase,
			},
		);
		try {
			return jsonOk(
				c,
				GraphLayoutDataSchema.parse(
					await service.writeGraphLayout(kbPath, {
						version: body.version,
						pins: body.pins,
					}),
				),
			);
		} catch (err) {
			throw mapGraphError(err);
		}
	});

	return router;
}

function resolveGraphKnowledgeBase(
	queryKb: string | undefined,
	service: GraphRouteService,
): Promise<string> {
	return resolveKnowledgeBaseContext(
		{ queryKb },
		{
			getActiveKnowledgeBasePath: service.getActiveKnowledgeBasePath,
			assertRegisteredKnowledgeBase: service.assertRegisteredKnowledgeBase,
		},
	);
}

function mapGraphError(err: unknown): HttpContractError {
	if (err instanceof HttpContractError) return err;
	const source = err as { code?: unknown; statusCode?: unknown };
	if (source.code === "ENOENT") {
		return new HttpContractError("NOT_FOUND", "图谱数据不存在");
	}
	if (source.code === "FORBIDDEN_PATH" || source.statusCode === 403) {
		return mapKnowledgeBaseError(err);
	}
	return new HttpContractError("INTERNAL_ERROR", "服务器内部错误");
}

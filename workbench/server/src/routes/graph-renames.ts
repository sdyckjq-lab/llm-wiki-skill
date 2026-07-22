import { Hono } from "hono";

import {
	GraphRenameApplyBodySchema,
	GraphRenameApplyDataSchema,
	GraphRenamePreviewBodySchema,
	GraphRenamePreviewDataSchema,
	GraphRenameRecoveryBodySchema,
	GraphRenameRecoveryDataSchema,
	GraphRenameRecoveryQuerySchema,
} from "@llm-wiki/workbench-contracts";

import { getActive } from "../agent.js";
import { createGraphRenameService, type GraphRenameService } from "../graph-renames.js";
import { resolveKnowledgeBaseContext, mapKnowledgeBaseError } from "../http/knowledge-base-context.js";
import { HttpContractError, parseValidatedBody, parseValidatedInput } from "../http/request.js";
import { jsonOk } from "../http/response.js";

export interface GraphRenameRouteService extends GraphRenameService {}

export const defaultGraphRenameRouteService: GraphRenameRouteService = {
	...createGraphRenameService(),
	getActiveKnowledgeBasePath: () => getActive()?.kb.path ?? null,
};

export function createGraphRenameRoutes(service: GraphRenameRouteService): Hono {
	const router = new Hono();

	router.post("/graph/renames/preview", async (c) => {
		const body = await parseValidatedBody(c, GraphRenamePreviewBodySchema);
		const kbPath = await resolveContext(c.req.query("kb"), body.kbPath, service);
		try {
			return jsonOk(c, GraphRenamePreviewDataSchema.parse(await service.previewGraphRename(kbPath, body.source_path, body.new_name)));
		} catch (error) { throw mapRenameError(error); }
	});

	router.post("/graph/renames/apply", async (c) => {
		const body = await parseValidatedBody(c, GraphRenameApplyBodySchema);
		const kbPath = await resolveContext(c.req.query("kb"), body.kbPath, service);
		try {
			return jsonOk(c, GraphRenameApplyDataSchema.parse(await service.applyGraphRename(kbPath, body)));
		} catch (error) { throw mapRenameError(error); }
	});

	router.get("/graph/renames/recovery", async (c) => {
		const query = parseValidatedInput(GraphRenameRecoveryQuerySchema, { ...(c.req.query("kb") ? { kbPath: c.req.query("kb") } : {}) });
		const kbPath = await resolveContext(query.kbPath, undefined, service);
		try {
			return jsonOk(c, GraphRenameRecoveryDataSchema.parse(await service.getGraphRenameRecovery(kbPath)));
		} catch (error) { throw mapRenameError(error); }
	});

	router.post("/graph/renames/recovery", async (c) => {
		const body = await parseValidatedBody(c, GraphRenameRecoveryBodySchema);
		const kbPath = await resolveContext(c.req.query("kb"), body.kbPath, service);
		try {
			return jsonOk(c, GraphRenameRecoveryDataSchema.parse(await service.resolveGraphRenameRecovery(kbPath, body)));
		} catch (error) { throw mapRenameError(error); }
	});

	return router;
}

async function resolveContext(queryKb: string | undefined, bodyKb: string | undefined, service: GraphRenameRouteService): Promise<string> {
	return resolveKnowledgeBaseContext({ queryKb, ...(bodyKb ? { body: { kbPath: bodyKb } } : {}) }, {
		getActiveKnowledgeBasePath: service.getActiveKnowledgeBasePath,
		assertRegisteredKnowledgeBase: service.assertRegisteredKnowledgeBase,
	});
}

function mapRenameError(error: unknown): HttpContractError {
	if (error instanceof HttpContractError) return error;
	const source = error as { code?: unknown; message?: unknown; statusCode?: unknown };
	if (source.code === "PREVIEW_STALE") return new HttpContractError("CONFLICT", "改名预览已失效", { reason: "preview_stale" });
	if (source.code === "BUSY") return new HttpContractError("BUSY", "知识库正在处理另一项改名或恢复");
	if (source.code === "CONFLICT") return new HttpContractError("CONFLICT", "改名目标或操作记录发生冲突");
	if (source.code === "INVALID_REQUEST") return new HttpContractError("INVALID_REQUEST", typeof source.message === "string" ? source.message : "改名请求不合法");
	if (source.code === "FORBIDDEN_PATH" || source.statusCode === 403) return mapKnowledgeBaseError(error);
	return new HttpContractError("INTERNAL_ERROR", "服务器内部错误");
}

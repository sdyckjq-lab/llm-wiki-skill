import { Hono } from "hono";

import {
	PageReadDataSchema,
	PageReadQuerySchema,
	PageRefsDataSchema,
	PageRefsQuerySchema,
	type PageRef,
} from "@llm-wiki/workbench-contracts";

import { getActive } from "../agent.js";
import {
	mapKnowledgeBaseError,
	resolveKnowledgeBaseContext,
} from "../http/knowledge-base-context.js";
import {
	HttpContractError,
	parseValidatedInput,
} from "../http/request.js";
import { jsonOk } from "../http/response.js";
import { assertRegisteredKnowledgeBase } from "../knowledge-bases.js";
import { listPageRefs, readWikiPage } from "../pages.js";

export interface PageRouteService {
	getActiveKnowledgeBasePath: () => string | null;
	assertRegisteredKnowledgeBase: (kbPath: string) => Promise<string>;
	listPageRefs: (kbPath: string, query: string, limit: number) => Promise<PageRef[]>;
	readWikiPage: (kbPath: string, relPath: string) => Promise<string>;
}

export const defaultPageRouteService: PageRouteService = {
	getActiveKnowledgeBasePath: () => getActive()?.kb.path ?? null,
	assertRegisteredKnowledgeBase,
	listPageRefs,
	readWikiPage,
};

export function createPageRoutes(service: PageRouteService): Hono {
	const router = new Hono();

	router.get("/refs", async (c) => {
		const query = parseValidatedInput(PageRefsQuerySchema, {
			kb: c.req.query("kb"),
			q: c.req.query("q"),
			limit: c.req.query("limit"),
		});
		const kbPath = await resolvePageKnowledgeBase(query.kb, service);
		try {
			return jsonOk(
				c,
				PageRefsDataSchema.parse(
					await service.listPageRefs(kbPath, query.q, query.limit),
				),
			);
		} catch (err) {
			throw mapPageError(err);
		}
	});

	router.get("/page", async (c) => {
		const query = parseValidatedInput(PageReadQuerySchema, {
			kb: c.req.query("kb"),
			path: c.req.query("path"),
		});
		const kbPath = await resolvePageKnowledgeBase(query.kb, service);
		try {
			return jsonOk(
				c,
				PageReadDataSchema.parse({
					content: await service.readWikiPage(kbPath, query.path),
				}),
			);
		} catch (err) {
			throw mapPageError(err);
		}
	});

	return router;
}

async function resolvePageKnowledgeBase(
	queryKb: string | undefined,
	service: PageRouteService,
): Promise<string> {
	return resolveKnowledgeBaseContext(
		{ queryKb },
		{
			getActiveKnowledgeBasePath: service.getActiveKnowledgeBasePath,
			assertRegisteredKnowledgeBase: service.assertRegisteredKnowledgeBase,
		},
	);
}

function mapPageError(err: unknown): HttpContractError {
	if (err instanceof HttpContractError) return err;
	const source = err as { code?: unknown; statusCode?: unknown };
	if (source.code === "ENOENT") {
		return new HttpContractError("NOT_FOUND", "wiki 页面不存在");
	}
	if (source.code === "FORBIDDEN_PATH" || source.statusCode === 403) {
		return mapKnowledgeBaseError(err);
	}
	if (
		err instanceof Error &&
		(err.message.includes("inside wiki") ||
			err.message.includes("must be relative") ||
			err.message.includes("markdown file"))
	) {
		return new HttpContractError("FORBIDDEN_PATH", "路径不在允许的知识库边界内", {
			reason: "outside-root",
		});
	}
	return new HttpContractError("INTERNAL_ERROR", "服务器内部错误");
}

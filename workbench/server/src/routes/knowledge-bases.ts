import { Hono } from "hono";

import {
	ActiveKnowledgeBaseDataSchema,
	InspectKnowledgeBasePathDataSchema,
	KnowledgeBaseContextBodySchema,
	KnowledgeBaseListDataSchema,
	KnowledgeBasePathBodySchema,
	RegisterExternalKnowledgeBaseDataSchema,
	UnregisterExternalKnowledgeBaseDataSchema,
	type ActiveKnowledgeBaseData,
	type InspectKnowledgeBasePathData,
	type KnowledgeBaseInfo,
	type RegisterExternalKnowledgeBaseData,
	type UnregisterExternalKnowledgeBaseData,
} from "@llm-wiki/workbench-contracts";

import type { AgentSession } from "@earendil-works/pi-coding-agent";

import {
	clearActive,
	getActive,
	selectKb,
	type ActiveContext as AgentActiveContext,
} from "../agent.js";
import { piMessagesToUIMessages } from "../conversations.js";
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
	assertRegisteredKnowledgeBase,
	inspectPath,
	listKnowledgeBases,
	registerExternalKnowledgeBase,
	unregisterExternalKnowledgeBase,
} from "../knowledge-bases.js";
import {
	stopKnowledgeBaseGraphWatcher,
	watchKnowledgeBaseGraph,
} from "../graph.js";

export interface KnowledgeBaseRouteService {
	listKnowledgeBases: () => Promise<KnowledgeBaseInfo[]>;
	registerExternalKnowledgeBase: (
		path: string,
	) => Promise<RegisterExternalKnowledgeBaseData>;
	unregisterExternalKnowledgeBase: (
		path: string,
	) => Promise<UnregisterExternalKnowledgeBaseData>;
	inspectKnowledgeBasePath: (
		path: string,
	) => Promise<InspectKnowledgeBasePathData>;
	getActiveKnowledgeBase: () => ActiveKnowledgeBaseData;
	assertRegisteredKnowledgeBase: (kbPath: string) => Promise<string>;
	selectKnowledgeBase: (kbPath: string) => Promise<ActiveKnowledgeBaseData>;
	clearActiveKnowledgeBase: () => Promise<void>;
	watchKnowledgeBaseGraph: (kbPath: string) => void;
	stopKnowledgeBaseGraphWatcher: () => void;
}

export const defaultKnowledgeBaseRouteService: KnowledgeBaseRouteService = {
	listKnowledgeBases: async () =>
		KnowledgeBaseListDataSchema.parse(await listKnowledgeBases()),
	registerExternalKnowledgeBase: async (path) =>
		RegisterExternalKnowledgeBaseDataSchema.parse(
			await registerExternalKnowledgeBase(path),
		),
	unregisterExternalKnowledgeBase: async (path) =>
		UnregisterExternalKnowledgeBaseDataSchema.parse(
			await unregisterExternalKnowledgeBase(path),
		),
	inspectKnowledgeBasePath: async (path) =>
		InspectKnowledgeBasePathDataSchema.parse(await inspectPath(path)),
	getActiveKnowledgeBase: () => serializeActiveContext(getActive()),
	assertRegisteredKnowledgeBase,
	selectKnowledgeBase: async (kbPath) => {
		const registeredPath = await assertRegisteredKnowledgeBase(kbPath);
		return serializeActiveContext(await selectKb(registeredPath));
	},
	clearActiveKnowledgeBase: clearActive,
	watchKnowledgeBaseGraph,
	stopKnowledgeBaseGraphWatcher,
};

export function createKnowledgeBaseRoutes(
	service: KnowledgeBaseRouteService,
): Hono {
	const router = new Hono();

	router.get("/knowledge-bases", async (c) => {
		const items = KnowledgeBaseListDataSchema.parse(
			await service.listKnowledgeBases(),
		);
		return jsonOk(c, items);
	});

	router.post("/knowledge-bases/external", async (c) => {
		const { path } = await parseValidatedBody(c, KnowledgeBasePathBodySchema);
		try {
			return jsonOk(
				c,
				RegisterExternalKnowledgeBaseDataSchema.parse(
					await service.registerExternalKnowledgeBase(path),
				),
			);
		} catch (err) {
			throw mapKnowledgeBaseError(err);
		}
	});

	router.post("/knowledge-bases/inspect", async (c) => {
		const { path } = await parseValidatedBody(c, KnowledgeBasePathBodySchema);
		try {
			return jsonOk(
				c,
				InspectKnowledgeBasePathDataSchema.parse(
					await service.inspectKnowledgeBasePath(path),
				),
			);
		} catch (err) {
			throw mapKnowledgeBaseError(err);
		}
	});

	router.delete("/knowledge-bases/external", async (c) => {
		const { path } = await parseValidatedBody(c, KnowledgeBasePathBodySchema);
		try {
			return jsonOk(
				c,
				UnregisterExternalKnowledgeBaseDataSchema.parse(
					await service.unregisterExternalKnowledgeBase(path),
				),
			);
		} catch (err) {
			throw mapKnowledgeBaseError(err);
		}
	});

	router.get("/knowledge-base", (c) => {
		const data = ActiveKnowledgeBaseDataSchema.parse(
			service.getActiveKnowledgeBase(),
		);
		return jsonOk(c, data);
	});

	router.post("/knowledge-base", async (c) => {
		const body = await parseValidatedBody(c, KnowledgeBaseContextBodySchema);
		const kbPath = await resolveKnowledgeBaseContext(
			{ body },
			{
				getActiveKnowledgeBasePath: () =>
					service.getActiveKnowledgeBase().active?.kb.path ?? null,
				assertRegisteredKnowledgeBase:
					service.assertRegisteredKnowledgeBase,
			},
		);
		try {
			const data = ActiveKnowledgeBaseDataSchema.parse(
				await service.selectKnowledgeBase(kbPath),
			);
			if (!data.active) {
				throw new Error("selectKnowledgeBase returned no active context");
			}
			service.watchKnowledgeBaseGraph(data.active.kb.path);
			return jsonOk(c, data);
		} catch (err) {
			if (err instanceof HttpContractError) throw err;
			throw mapKnowledgeBaseError(err);
		}
	});

	router.delete("/knowledge-base", async (c) => {
		await service.clearActiveKnowledgeBase();
		service.stopKnowledgeBaseGraphWatcher();
		return jsonOk(c, ActiveKnowledgeBaseDataSchema.parse({ active: null }));
	});

	return router;
}

export function serializeActiveContext(
	ctx: AgentActiveContext | null,
): ActiveKnowledgeBaseData {
	if (!ctx) return { active: null };
	return ActiveKnowledgeBaseDataSchema.parse({
		active: {
			kb: ctx.kb,
			conversation: {
				id: ctx.conversationId,
				isNew: ctx.isNew,
				messages: piMessagesToUIMessages(ctx.session.state.messages),
			},
			model: extractModelInfo(ctx.session),
		},
	});
}

function extractModelInfo(
	session: AgentSession,
): { provider: string; id: string } | null {
	const model = (session.state as {
		model?: { provider?: unknown; id?: unknown };
	}).model;
	if (
		model &&
		typeof model.provider === "string" &&
		typeof model.id === "string"
	) {
		return { provider: model.provider, id: model.id };
	}
	return null;
}

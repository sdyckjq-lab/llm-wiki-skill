import { Hono } from "hono";

import {
	ConversationActiveDataSchema,
	ConversationCreateBodySchema,
	ConversationInfoSchema,
	ConversationListDataSchema,
	ConversationListQuerySchema,
	ConversationSelectBodySchema,
	type ActiveKnowledgeBaseData,
	type ConversationInfo,
} from "@llm-wiki/workbench-contracts";

import {
	createNewConversation,
	getActive,
	selectConversation,
} from "../agent.js";
import {
	listConversations,
	type ConversationInfo as StoredConversationInfo,
} from "../conversations.js";
import {
	mapKnowledgeBaseError,
	resolveKnowledgeBaseContext,
} from "../http/knowledge-base-context.js";
import {
	HttpContractError,
	parseValidatedBody,
	parseValidatedInput,
} from "../http/request.js";
import { jsonOk } from "../http/response.js";
import { assertRegisteredKnowledgeBase } from "../knowledge-bases.js";
import { watchKnowledgeBaseGraph } from "../graph.js";
import { serializeActiveContext } from "./knowledge-bases.js";

export interface ConversationRouteService {
	getActiveKnowledgeBase: () => ActiveKnowledgeBaseData;
	assertRegisteredKnowledgeBase: (kbPath: string) => Promise<string>;
	listConversations: (kbPath: string) => Promise<StoredConversationInfo[]>;
	selectConversation: (
		kbPath: string,
		conversationId: string,
	) => Promise<ActiveKnowledgeBaseData>;
	createNewConversation: (kbPath: string) => Promise<ActiveKnowledgeBaseData>;
	watchKnowledgeBaseGraph: (kbPath: string) => void;
	now: () => number;
}

export const defaultConversationRouteService: ConversationRouteService = {
	getActiveKnowledgeBase: () => serializeActiveContext(getActive()),
	assertRegisteredKnowledgeBase,
	listConversations,
	selectConversation: async (kbPath, conversationId) =>
		serializeActiveContext(await selectConversation(kbPath, conversationId)),
	createNewConversation: async (kbPath) =>
		serializeActiveContext(await createNewConversation(kbPath)),
	watchKnowledgeBaseGraph,
	now: Date.now,
};

export function createConversationRoutes(
	service: ConversationRouteService,
): Hono {
	const router = new Hono();
	const resolverDeps = {
		getActiveKnowledgeBasePath: () =>
			service.getActiveKnowledgeBase().active?.kb.path ?? null,
		assertRegisteredKnowledgeBase: service.assertRegisteredKnowledgeBase,
	};

	router.get("/conversations", async (c) => {
		const query = parseValidatedInput(
			ConversationListQuerySchema,
			queryParamsForValidation(new URL(c.req.url).searchParams),
		);
		const kbPath = await resolveKnowledgeBaseContext(
			{ queryKb: query.kb },
			resolverDeps,
		);
		try {
			const stored = await service.listConversations(kbPath);
			const items: ConversationInfo[] = stored.map((item) =>
				ConversationInfoSchema.parse(item),
			);
			const active = service.getActiveKnowledgeBase().active;
			if (
				active?.kb.path === kbPath &&
				!items.some((item) => item.id === active.conversation.id)
			) {
				items.unshift({
					id: active.conversation.id,
					firstMessage: "(新对话)",
					modifiedAt: service.now(),
				});
			}
			return jsonOk(c, ConversationListDataSchema.parse(items));
		} catch (err) {
			throw mapConversationError(err);
		}
	});

	router.post("/conversations", async (c) => {
		const body = await parseValidatedBody(c, ConversationSelectBodySchema);
		const kbPath = await resolveKnowledgeBaseContext(
			{ body: { kbPath: body.kbPath } },
			resolverDeps,
		);
		try {
			const data = ConversationActiveDataSchema.parse(
				await service.selectConversation(kbPath, body.conversationId),
			);
			if (!data.active) throw new Error("selectConversation returned no active context");
			service.watchKnowledgeBaseGraph(data.active.kb.path);
			return jsonOk(c, data);
		} catch (err) {
			throw mapConversationError(err);
		}
	});

	router.post("/conversations/new", async (c) => {
		const body = await parseValidatedBody(c, ConversationCreateBodySchema);
		const kbPath = await resolveKnowledgeBaseContext(
			{ body: { kbPath: body.kbPath } },
			resolverDeps,
		);
		try {
			const data = ConversationActiveDataSchema.parse(
				await service.createNewConversation(kbPath),
			);
			if (!data.active) throw new Error("createNewConversation returned no active context");
			service.watchKnowledgeBaseGraph(data.active.kb.path);
			return jsonOk(c, data);
		} catch (err) {
			throw mapConversationError(err);
		}
	});

	return router;
}

function queryParamsForValidation(
	searchParams: URLSearchParams,
): Record<string, string | string[]> {
	const query: Record<string, string | string[]> = {};
	for (const key of new Set(searchParams.keys())) {
		const values = searchParams.getAll(key);
		query[key] = values.length === 1 ? values[0]! : values;
	}
	return query;
}

function mapConversationError(err: unknown): HttpContractError {
	if (err instanceof HttpContractError) return err;
	const source = err as { code?: unknown };
	if (source.code === "NOT_FOUND") {
		return new HttpContractError("NOT_FOUND", "对话不存在", {
			resource: "conversation",
		});
	}
	return mapKnowledgeBaseError(err);
}

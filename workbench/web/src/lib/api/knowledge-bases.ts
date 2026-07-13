import {
	ActiveKnowledgeBaseDataSchema,
	InspectKnowledgeBasePathDataSchema,
	KnowledgeBaseContextBodySchema,
	KnowledgeBaseListDataSchema,
	KnowledgeBasePathBodySchema,
	RegisterExternalKnowledgeBaseDataSchema,
	UnregisterExternalKnowledgeBaseDataSchema,
	type ActiveContext,
	type InspectKnowledgeBasePathData,
	type KnowledgeBaseInfo,
} from "@llm-wiki/workbench-contracts";

import { request } from "./client";

export type {
	ActiveContext,
	CurrentKnowledgeBase,
	InspectKnowledgeBasePathData as InspectPathResult,
	KnowledgeBaseInfo,
	UIMessage,
} from "@llm-wiki/workbench-contracts";

export function listKnowledgeBases(): Promise<KnowledgeBaseInfo[]> {
	return request({ method: "GET", path: "/api/knowledge-bases" }, {
		responseSchema: KnowledgeBaseListDataSchema,
	});
}

export async function getActiveContext(): Promise<ActiveContext | null> {
	const { active } = await request({ method: "GET", path: "/api/knowledge-base" }, {
		responseSchema: ActiveKnowledgeBaseDataSchema,
	});
	return active;
}

export async function selectKnowledgeBase(
	kbPath: string,
): Promise<ActiveContext> {
	const body = KnowledgeBaseContextBodySchema.parse({ kbPath });
	const { active } = await request({ method: "POST", path: "/api/knowledge-base" }, {
		body,
		responseSchema: ActiveKnowledgeBaseDataSchema,
	});
	if (!active) {
		throw new Error("选择知识库后未返回 active context");
	}
	return active;
}

export async function clearActiveContext(): Promise<void> {
	await request({ method: "DELETE", path: "/api/knowledge-base" }, {
		responseSchema: ActiveKnowledgeBaseDataSchema,
	});
}

export async function registerExternalKnowledgeBase(
	path: string,
): Promise<{ registered: boolean; info: KnowledgeBaseInfo }> {
	const data = await request({ method: "POST", path: "/api/knowledge-bases/external" }, {
		body: KnowledgeBasePathBodySchema.parse({ path }),
		responseSchema: RegisterExternalKnowledgeBaseDataSchema,
	});
	return { registered: data.registered, info: data.info };
}

export function inspectKnowledgeBasePath(
	path: string,
): Promise<InspectKnowledgeBasePathData> {
	return request({ method: "POST", path: "/api/knowledge-bases/inspect" }, {
		body: KnowledgeBasePathBodySchema.parse({ path }),
		responseSchema: InspectKnowledgeBasePathDataSchema,
	});
}

export async function unregisterExternalKnowledgeBase(
	path: string,
): Promise<{ removed: boolean }> {
	const data = await request({ method: "DELETE", path: "/api/knowledge-bases/external" }, {
		body: KnowledgeBasePathBodySchema.parse({ path }),
		responseSchema: UnregisterExternalKnowledgeBaseDataSchema,
	});
	return { removed: data.removed };
}

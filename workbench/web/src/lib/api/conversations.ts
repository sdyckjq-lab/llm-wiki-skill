import {
	ConversationActiveDataSchema,
	ConversationCreateBodySchema,
	ConversationListDataSchema,
	ConversationSelectBodySchema,
	type ActiveContext,
	type ConversationInfo,
} from "@llm-wiki/workbench-contracts";

import { request } from "./client";

export type { ConversationInfo } from "@llm-wiki/workbench-contracts";

export function listConversations(kbPath: string): Promise<ConversationInfo[]> {
	return request("/api/conversations", {
		query: { kb: kbPath },
		responseSchema: ConversationListDataSchema,
	});
}

export async function selectConversation(
	kbPath: string,
	conversationId: string,
): Promise<ActiveContext> {
	const body = ConversationSelectBodySchema.parse({ kbPath, conversationId });
	const { active } = await request("/api/conversations", {
		method: "POST",
		body,
		responseSchema: ConversationActiveDataSchema,
	});
	if (!active) throw new Error("选择对话后未返回 active context");
	return active;
}

export async function createNewConversation(
	kbPath: string,
): Promise<ActiveContext> {
	const body = ConversationCreateBodySchema.parse({ kbPath });
	const { active } = await request("/api/conversations/new", {
		method: "POST",
		body,
		responseSchema: ConversationActiveDataSchema,
	});
	if (!active) throw new Error("新建对话后未返回 active context");
	return active;
}

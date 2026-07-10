import { z } from "zod";

import {
	ActiveKnowledgeBaseDataSchema,
	KnowledgeBaseContextBodySchema,
	KnowledgeBaseContextQuerySchema,
} from "./knowledge-bases.js";

/** 浏览器可见的对话摘要；不包含本机会话文件路径。 */
export const ConversationInfoSchema = z.object({
	id: z.string(),
	firstMessage: z.string(),
	modifiedAt: z.number(),
});
export type ConversationInfo = z.infer<typeof ConversationInfoSchema>;

export const ConversationListDataSchema = z.array(ConversationInfoSchema);
export type ConversationListData = z.infer<typeof ConversationListDataSchema>;

export const ConversationListQuerySchema = KnowledgeBaseContextQuerySchema;
export type ConversationListQuery = z.infer<typeof ConversationListQuerySchema>;

export const ConversationSelectBodySchema = KnowledgeBaseContextBodySchema.extend({
	conversationId: z.string().trim().min(1),
}).strict();
export type ConversationSelectBody = z.infer<
	typeof ConversationSelectBodySchema
>;

export const ConversationCreateBodySchema = KnowledgeBaseContextBodySchema;
export type ConversationCreateBody = z.infer<
	typeof ConversationCreateBodySchema
>;

/** 选择和新建对话复用 active context 的唯一公共响应 schema。 */
export const ConversationActiveDataSchema = ActiveKnowledgeBaseDataSchema;
export type ConversationActiveData = z.infer<
	typeof ConversationActiveDataSchema
>;

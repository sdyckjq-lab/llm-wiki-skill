import assert from "node:assert/strict";
import test from "node:test";

import {
	ConversationActiveDataSchema,
	ConversationCreateBodySchema,
	ConversationInfoSchema,
	ConversationListQuerySchema,
	ConversationSelectBodySchema,
} from "../src/conversations.js";

test("conversation public schema 不暴露 session 文件路径", () => {
	assert.deepEqual(
		ConversationInfoSchema.parse({
			id: "conversation-1",
			path: "/Users/private/.llm-wiki-agent/sessions/private.jsonl",
			firstMessage: "你好",
			modifiedAt: 123,
		}),
		{ id: "conversation-1", firstMessage: "你好", modifiedAt: 123 },
	);
});

test("conversation request schema 固定 GET kb 与 JSON kbPath", () => {
	assert.deepEqual(ConversationListQuerySchema.parse({ kb: " /kb/a " }), {
		kb: "/kb/a",
	});
	assert.deepEqual(
		ConversationSelectBodySchema.parse({
			kbPath: " /kb/a ",
			conversationId: " conversation-1 ",
		}),
		{ kbPath: "/kb/a", conversationId: "conversation-1" },
	);
	assert.deepEqual(ConversationCreateBodySchema.parse({ kbPath: "/kb/a" }), {
		kbPath: "/kb/a",
	});
	assert.equal(
		ConversationSelectBodySchema.safeParse({
			path: "/kb/a",
			conversationId: "conversation-1",
		}).success,
		false,
	);
});

test("conversation active response 复用 active context schema", () => {
	const data = {
		active: {
			kb: { path: "/kb/a", name: "a" },
			conversation: { id: "new-1", isNew: true, messages: [] },
			model: null,
		},
	};
	assert.deepEqual(ConversationActiveDataSchema.parse(data), data);
});

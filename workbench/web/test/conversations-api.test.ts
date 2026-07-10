import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { ApiError, ContractMismatchError } from "../src/lib/api/client";
import {
	createNewConversation,
	listConversations,
	selectConversation,
} from "../src/lib/api/conversations";

const active = {
	kb: { path: "/kb/registered", name: "registered" },
	conversation: { id: "conversation-1", isNew: false, messages: [] },
	model: null,
};
const conversation = {
	id: "conversation-1",
	firstMessage: "你好",
	modifiedAt: 123,
};

function stubFetch(body: unknown, status = 200) {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	globalThis.fetch = ((input: URL | string, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return Promise.resolve(
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			}),
		);
	}) as typeof globalThis.fetch;
	return calls;
}

function requestBody(calls: Array<{ url: string; init?: RequestInit }>): unknown {
	return JSON.parse(String(calls[0]?.init?.body));
}

describe("conversations API module", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("列表使用编码后的 kb query 并只解析 data", async () => {
		const calls = stubFetch({ ok: true, data: [conversation] });
		assert.deepEqual(await listConversations("/kb/中文 notes"), [conversation]);
		assert.equal(calls[0]?.url, "/api/conversations?kb=%2Fkb%2F%E4%B8%AD%E6%96%87+notes");
		assert.equal(calls[0]?.init?.method, "GET");
	});

	it("选择和新建对话固定使用 kbPath body 并返回 active context", async () => {
		let calls = stubFetch({ ok: true, data: { active } });
		assert.deepEqual(
			await selectConversation(active.kb.path, active.conversation.id),
			active,
		);
		assert.equal(calls[0]?.init?.method, "POST");
		assert.deepEqual(requestBody(calls), {
			kbPath: active.kb.path,
			conversationId: active.conversation.id,
		});

		calls = stubFetch({
			ok: true,
			data: {
				active: {
					...active,
					conversation: { id: "new-1", isNew: true, messages: [] },
				},
			},
		});
		assert.equal((await createNewConversation(active.kb.path)).conversation.isNew, true);
		assert.equal(calls[0]?.url, "/api/conversations/new");
		assert.deepEqual(requestBody(calls), { kbPath: active.kb.path });
	});

	it("稳定失败 code 透出，旧 envelope 与畸形 data 被拒绝", async () => {
		stubFetch(
			{ ok: false, code: "NOT_FOUND", message: "对话不存在", details: { resource: "conversation" } },
			404,
		);
		await assert.rejects(
			() => selectConversation(active.kb.path, "missing"),
			(err) => err instanceof ApiError && err.code === "NOT_FOUND",
		);

		stubFetch({ ok: true, items: [conversation] });
		await assert.rejects(
			() => listConversations(active.kb.path),
			(err) => err instanceof ContractMismatchError,
		);

		stubFetch({ ok: true, data: [{ id: "bad", modifiedAt: "today" }] });
		await assert.rejects(
			() => listConversations(active.kb.path),
			(err) => err instanceof ContractMismatchError,
		);
	});
});

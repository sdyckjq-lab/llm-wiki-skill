import assert from "node:assert/strict";
import test from "node:test";

import type {
	ActiveKnowledgeBaseData,
	ConversationInfo,
} from "@llm-wiki/workbench-contracts";

import { createApp } from "./app.js";
import type { ConversationInfo as StoredConversationInfo } from "./conversations.js";
import type { ConversationRouteService } from "./routes/conversations.js";

type EnvelopeJson = {
	ok?: boolean;
	code?: string;
	message?: string;
	details?: Record<string, unknown>;
	data?: unknown;
};

const kbA = "/fake/kb-a";
const kbB = "/fake/kb-b";
const persistedA: StoredConversationInfo = {
	id: "a-1",
	path: "/Users/private/.llm-wiki-agent/sessions/a/a-1.jsonl",
	firstMessage: "A 的对话",
	modifiedAt: 100,
};
const activeA: ActiveKnowledgeBaseData = {
	active: {
		kb: { path: kbA, name: "kb-a" },
		conversation: { id: "a-new", isNew: true, messages: [] },
		model: null,
	},
};
const activeB: ActiveKnowledgeBaseData = {
	active: {
		kb: { path: kbB, name: "kb-b" },
		conversation: { id: "b-1", isNew: false, messages: [] },
		model: null,
	},
};

function createFakeService(options: {
	active?: ActiveKnowledgeBaseData;
	registered?: ReadonlySet<string>;
} = {}) {
	let active = options.active ?? { active: null };
	const registered = options.registered ?? new Set([kbA, kbB]);
	const sessions = new Map<string, StoredConversationInfo[]>([
		[kbA, [persistedA]],
		[kbB, [{ ...persistedA, id: "b-1", firstMessage: "B 的对话" }]],
	]);
	const calls = {
		listed: [] as string[],
		selected: [] as Array<[string, string]>,
		created: [] as string[],
		watched: [] as string[],
	};
	const assertRegistered = (path: string) => {
		if (!registered.has(path)) {
			throw Object.assign(new Error(`/Users/private/${path}`), {
				code: "KB_NOT_REGISTERED",
			});
		}
	};
	const service: ConversationRouteService = {
		getActiveKnowledgeBase: () => active,
		assertRegisteredKnowledgeBase: async (path) => {
			assertRegistered(path);
			return path;
		},
		listConversations: async (path) => {
			calls.listed.push(path);
			return sessions.get(path) ?? [];
		},
		selectConversation: async (path, id) => {
			calls.selected.push([path, id]);
			const found = sessions.get(path)?.some((item) => item.id === id);
			if (!found) throw Object.assign(new Error(`/Users/private/${id}`), { code: "NOT_FOUND" });
			active = path === kbB ? activeB : {
				active: {
					kb: { path, name: "kb-a" },
					conversation: { id, isNew: false, messages: [] },
					model: null,
				},
			};
			return active;
		},
		createNewConversation: async (path) => {
			calls.created.push(path);
			active = {
				active: {
					kb: { path, name: path === kbA ? "kb-a" : "kb-b" },
					conversation: { id: `${path}-new`, isNew: true, messages: [] },
					model: null,
				},
			};
			return active;
		},
		watchKnowledgeBaseGraph: (path) => calls.watched.push(path),
		now: () => 999,
	};
	return { service, calls };
}

async function json(res: Response): Promise<EnvelopeJson> {
	return (await res.json()) as EnvelopeJson;
}

function post(body: unknown): RequestInit {
	return {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	};
}

test("对话列表返回统一 envelope、隐藏 session path 并保留新对话 stub", async () => {
	const { service, calls } = createFakeService({ active: activeA });
	const app = createApp({ conversationService: service });
	const res = await app.request(`/api/conversations?kb=${encodeURIComponent(kbA)}`);
	assert.equal(res.status, 200);
	const payload = await json(res);
	assert.deepEqual(payload, {
		ok: true,
		data: [
			{ id: "a-new", firstMessage: "(新对话)", modifiedAt: 999 },
			{ id: "a-1", firstMessage: "A 的对话", modifiedAt: 100 },
		] satisfies ConversationInfo[],
	});
	assert.deepEqual(calls.listed, [kbA]);
	assert.equal(JSON.stringify(payload).includes("/Users/"), false);
	assert.equal(JSON.stringify(payload).includes("jsonl"), false);
});

test("跨 KB 列表不会注入另一库 active stub", async () => {
	const { service } = createFakeService({ active: activeA });
	const app = createApp({ conversationService: service });
	const res = await app.request(`/api/conversations?kb=${encodeURIComponent(kbB)}`);
	const data = (await json(res)).data as ConversationInfo[];
	assert.deepEqual(data.map((item) => item.id), ["b-1"]);
	assert.equal(data.some((item) => item.id === "a-new"), false);
});

test("选择和新建对话复用已登记 KB context 并返回 active envelope", async () => {
	const { service, calls } = createFakeService();
	const app = createApp({ conversationService: service });
	let res = await app.request("/api/conversations", post({ kbPath: kbB, conversationId: "b-1" }));
	assert.equal(res.status, 200);
	assert.deepEqual((await json(res)).data, activeB);
	assert.deepEqual(calls.selected, [[kbB, "b-1"]]);
	assert.deepEqual(calls.watched, [kbB]);

	res = await app.request("/api/conversations/new", post({ kbPath: kbA }));
	assert.equal(res.status, 200);
	const created = (await json(res)).data as ActiveKnowledgeBaseData;
	assert.equal(created.active?.conversation.isNew, true);
	assert.deepEqual(calls.created, [kbA]);
	assert.deepEqual(calls.watched, [kbB, kbA]);
});

test("无 active KB、未登记 KB 与 schema mismatch 返回稳定中文错误", async () => {
	const { service, calls } = createFakeService();
	const app = createApp({ conversationService: service });
	let res = await app.request("/api/conversations");
	assert.deepEqual(await json(res), {
		ok: false,
		code: "NO_ACTIVE_KB",
		message: "当前没有选择知识库",
	});

	res = await app.request(
		`/api/conversations?path=${encodeURIComponent(kbB)}&secret=sk-no-echo`,
	);
	const invalidQuery = await json(res);
	assert.equal(res.status, 400);
	assert.equal(invalidQuery.code, "INVALID_REQUEST");
	assert.equal(JSON.stringify(invalidQuery).includes("sk-no-echo"), false);
	assert.deepEqual(calls.listed, []);

	res = await app.request(
		`/api/conversations?kb=${encodeURIComponent(kbA)}&kb=${encodeURIComponent(kbB)}`,
	);
	assert.equal(res.status, 400);
	assert.equal((await json(res)).code, "INVALID_REQUEST");
	assert.deepEqual(calls.listed, []);

	res = await app.request("/api/conversations/new", post({ kbPath: "/fake/missing" }));
	assert.equal(res.status, 404);
	assert.deepEqual(await json(res), {
		ok: false,
		code: "KB_NOT_REGISTERED",
		message: "知识库未登记或已失效",
	});
	assert.deepEqual(calls.created, []);

	res = await app.request("/api/conversations", post({ path: kbA, conversationId: "a-1", secret: "sk-no-echo" }));
	const invalid = await json(res);
	assert.equal(res.status, 400);
	assert.equal(invalid.code, "INVALID_REQUEST");
	assert.equal(JSON.stringify(invalid).includes("sk-no-echo"), false);
});

test("conversation not found 返回脱敏 NOT_FOUND 且不启动 watcher", async () => {
	const { service, calls } = createFakeService();
	const app = createApp({ conversationService: service });
	const res = await app.request("/api/conversations", post({ kbPath: kbA, conversationId: "missing" }));
	assert.equal(res.status, 404);
	assert.deepEqual(await json(res), {
		ok: false,
		code: "NOT_FOUND",
		message: "对话不存在",
		details: { resource: "conversation" },
	});
	assert.deepEqual(calls.watched, []);
});

test("invalid JSON 与未知 storage error 不泄露原始错误、路径或 stack", async () => {
	const { service } = createFakeService();
	const app = createApp({ conversationService: service });
	let res = await app.request("/api/conversations/new", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: "{bad",
	});
	assert.equal((await json(res)).code, "INVALID_JSON");

	service.listConversations = async () => {
		throw new Error("ENOENT /Users/private/session.jsonl\nstack secret");
	};
	res = await app.request(`/api/conversations?kb=${encodeURIComponent(kbA)}`);
	assert.equal(res.status, 500);
	const payload = await json(res);
	assert.deepEqual(payload, {
		ok: false,
		code: "INTERNAL_ERROR",
		message: "服务器内部错误",
	});
	assert.equal(JSON.stringify(payload).includes("/Users/"), false);
	assert.equal(JSON.stringify(payload).includes("stack"), false);
});

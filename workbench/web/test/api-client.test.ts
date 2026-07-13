import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import { z } from "zod";

import {
	ApiError,
	ContractMismatchError,
	EndpointContractError,
	request,
} from "../src/lib/api/client";

const itemSchema = z.object({
	status: z.literal("ok"),
	timestamp: z.number(),
});
type Item = z.infer<typeof itemSchema>;

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

describe("workbench api client", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("成功 envelope 返回已校验 data", async () => {
		stubFetch({ ok: true, data: { status: "ok", timestamp: 1 } });
		const data = await request(
			{ method: "GET", path: "/api/health" },
			{ responseSchema: itemSchema },
		);
		assert.deepEqual(data, { status: "ok", timestamp: 1 });
	});

	it("失败 envelope 抛 ApiError，带 code", async () => {
		stubFetch(
			{ ok: false, code: "INTERNAL_ERROR", message: "服务器内部错误" },
			500,
		);
		await assert.rejects(
			() => request(
				{ method: "GET", path: "/api/health" },
				{ responseSchema: itemSchema },
			),
			(err) => err instanceof ApiError && err.code === "INTERNAL_ERROR",
		);
	});

	it("旧格式响应（无 ok 字段）抛 ContractMismatchError，不吞旧格式", async () => {
		stubFetch({ status: "ok", timestamp: 1, service: "s" });
		await assert.rejects(
			() => request(
				{ method: "GET", path: "/api/health" },
				{ responseSchema: itemSchema },
			),
			(err) => err instanceof ContractMismatchError,
		);
	});

	it("旧格式 { ok:true, items } 也判为契约不符", async () => {
		stubFetch({ ok: true, items: [{ a: 1 }] });
		await assert.rejects(
			() => request(
				{ method: "GET", path: "/api/health" },
				{ responseSchema: itemSchema },
			),
			(err) => err instanceof ContractMismatchError,
		);
	});

	it("data 不符合 responseSchema 时抛 ContractMismatchError", async () => {
		stubFetch({ ok: true, data: { status: "down", timestamp: 1 } });
		await assert.rejects(
			() => request(
				{ method: "GET", path: "/api/health" },
				{ responseSchema: itemSchema },
			),
			(err) => err instanceof ContractMismatchError,
		);
	});

	it("POST 请求传递 method/body/Content-Type", async () => {
		const calls = stubFetch({
			ok: true,
			data: { status: "ok", timestamp: 1 },
		});
		await request({ method: "POST", path: "/api/config" }, {
			body: { foo: "bar" },
			responseSchema: itemSchema,
		});
		const init = calls[0]?.init;
		assert.equal(init?.method, "POST");
		const headers = init?.headers as Record<string, string> | undefined;
		assert.equal(headers?.["Content-Type"], "application/json");
		assert.deepEqual(JSON.parse(String(init?.body)), { foo: "bar" });
	});

	it("方法和地址组合未登记时在 fetch 前拒绝请求", async () => {
		const calls = stubFetch({
			ok: true,
			data: { status: "ok", timestamp: 1 },
		});
		for (const endpoint of [
			{ method: "POST", path: "/api/health" },
			{ method: "GET", path: "/api/commands" },
			{ method: "POST", path: "/api/prompt" },
			{ method: "GET", path: "/api/artifacts/:id/files/:filename" },
		]) {
			await assert.rejects(
				() => request(endpoint as never, { responseSchema: itemSchema }),
				(error) => error instanceof EndpointContractError,
			);
		}
		assert.equal(calls.length, 0);
	});

	it("request<T> 的返回类型是 responseSchema 推导的 data", async () => {
		stubFetch({ ok: true, data: { status: "ok", timestamp: 7 } });
		const data: Item = await request(
			{ method: "GET", path: "/api/health" },
			{ responseSchema: itemSchema },
		);
		// 编译期校验：data 类型为 Item；运行期校验：值正确
		assert.equal(data.timestamp, 7);
	});
});

import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import React from "react";

import { SettingsPanel } from "../src/components/SettingsPanel";
import { changeText, click, render, screen, waitFor } from "./render";

describe("SettingsPanel authentication", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("saves and tests an API key through the unified auth calls", async () => {
		const requests: Array<{ url: string; method: string; body?: unknown }> = [];
		globalThis.fetch = (async (input, init) => {
			const url = String(input);
			const method = init?.method ?? "GET";
			requests.push({
				url,
				method,
				body: init?.body ? JSON.parse(String(init.body)) : undefined,
			});
			if (url === "/api/auth/status") {
				return json({ ok: true, data: { authFileExists: true, providers: [], envKeys: [] } });
			}
			if (url === "/api/config" && method === "GET") {
				return json({ ok: true, data: { version: 1, externalKnowledgeBases: [] } });
			}
			if (url === "/api/commands?includeUserGlobal=true") {
				return json({
					ok: true,
					data: [
						{
							slug: "/project-skill",
							name: "project-skill",
							description: "Project capability",
							source: "builtin",
							isProjectSkill: true,
						},
					],
				});
			}
			if (url === "/api/models") {
				return json({ ok: true, data: [] });
			}
			if (url === "/api/auth/set" && method === "POST") {
				return json({ ok: true, data: { saved: true } });
			}
			if (url === "/api/auth/test" && method === "POST") {
				return json({ ok: true, data: { message: "连接成功，模型可用" } });
			}
			return json({ ok: false, code: "NOT_FOUND", message: `Unexpected ${method} ${url}` }, 404);
		}) as typeof globalThis.fetch;

		render(<SettingsPanel open onOpenChange={() => {}} />);
		const keyInput = await screen.findByPlaceholderText("API key");
		await screen.findByText(/项目内置 1 个 \/ pi 默认 0 个 \/ 用户全局 0 个/);
		assert.ok(screen.getByRole("option", { name: "Atlas Cloud" }));
		await changeText(screen.getByDisplayValue("Anthropic"), "atlas");
		await changeText(keyInput, "sk-settings-panel-test");
		await click(screen.getByRole("button", { name: "保存并测试" }));

		await waitFor(() => {
			assert.ok(screen.getByText("连接成功，模型可用"));
		});
		assert.equal((keyInput as HTMLInputElement).value, "");
		assert.deepEqual(
			requests.map((request) => `${request.method} ${request.url}`),
			[
				"GET /api/auth/status",
				"GET /api/config",
				"GET /api/commands?includeUserGlobal=true",
				"GET /api/models",
				"POST /api/auth/set",
				"GET /api/auth/status",
				"GET /api/config",
				"GET /api/commands?includeUserGlobal=true",
				"GET /api/models",
				"POST /api/auth/test",
			],
		);
		assert.deepEqual(requests[4]?.body, {
			provider: "atlas",
			type: "api_key",
			key: "sk-settings-panel-test",
		});
		assert.deepEqual(requests[9]?.body, { provider: "atlas" });
	});
});

function json(payload: unknown, status = 200) {
	return new Response(JSON.stringify(payload), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

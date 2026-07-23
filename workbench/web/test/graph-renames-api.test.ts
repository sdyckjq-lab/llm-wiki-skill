import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
	applyGraphRename,
	getGraphRenameRecovery,
	previewGraphRename,
	resolveGraphRenameRecovery,
} from "../src/lib/api/graph-renames";
import { ApiError, ContractMismatchError } from "../src/lib/api/client";

const preview = {
	operation_id: "11111111-1111-4111-8111-111111111111",
	expires_at: "2026-08-21T00:00:00.000Z",
	preview_digest: "a".repeat(64),
	source_path: "wiki/topics/旧页面.md",
	target_path: "wiki/topics/新 页面.md",
	equivalent_portable_name: false,
	file_set_sha256: "b".repeat(64),
	editable_files: [],
	read_only_references: [],
	ambiguous_choices: [],
	layout_change: {
		from_key: "wiki/topics/旧页面.md",
		to_key: "wiki/topics/新 页面.md",
		present: true,
	},
	summary: {
		editable_files: 0,
		editable_occurrences: 0,
		read_only_occurrences: 0,
		ambiguous_occurrences: 0,
	},
} as const;

function stubFetch(body: unknown, status = 200) {
	const calls: Array<{ url: string; init?: RequestInit }> = [];
	globalThis.fetch = ((input: URL | string, init?: RequestInit) => {
		calls.push({ url: String(input), init });
		return Promise.resolve(new Response(JSON.stringify(body), {
			status,
			headers: { "Content-Type": "application/json" },
		}));
	}) as typeof globalThis.fetch;
	return calls;
}

describe("graph rename API", () => {
	const originalFetch = globalThis.fetch;
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("previews a relative page rename through the registered protected endpoint", async () => {
		const calls = stubFetch({ ok: true, data: preview });

		assert.deepEqual(
			await previewGraphRename("/registered/知识库", "wiki/topics/旧页面.md", "新 页面"),
			preview,
		);
		assert.equal(calls[0]?.url, "/api/graph/renames/preview?kb=%2Fregistered%2F%E7%9F%A5%E8%AF%86%E5%BA%93");
		assert.equal(calls[0]?.init?.method, "POST");
		assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
			source_path: "wiki/topics/旧页面.md",
			new_name: "新 页面",
		});
	});

	it("rejects invalid rename filenames before preview or apply reaches the transport", async () => {
		const calls = stubFetch({ ok: true, data: preview });
		const invalidNames = ["", "   ", ".md", "trailing ", "trailing."];
		for (const newName of invalidNames) {
			await assert.rejects(() => previewGraphRename(
				"/registered/知识库",
				"wiki/topics/旧页面.md",
				newName,
			));
		}

		for (const newName of invalidNames) {
			await assert.rejects(() => applyGraphRename("/registered/知识库", {
				operation_id: preview.operation_id,
				expires_at: preview.expires_at,
				source_path: preview.source_path,
				new_name: newName,
				preview_digest: preview.preview_digest,
				resolutions: [],
				confirmed: true,
			}));
		}
		assert.equal(calls.length, 0);
	});

	it("preserves a leading ordinary space through preview and apply transport", async () => {
		let calls = stubFetch({ ok: true, data: preview });
		await previewGraphRename("/registered/知识库", preview.source_path, " leading-space");
		assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
			source_path: preview.source_path,
			new_name: " leading-space",
		});

		calls = stubFetch({
			ok: true,
			data: {
				outcome: "preview_stale",
				operation_id: preview.operation_id,
				reason: "preview_changed",
			},
		});
		await applyGraphRename("/registered/知识库", {
			operation_id: preview.operation_id,
			expires_at: preview.expires_at,
			source_path: preview.source_path,
			new_name: " leading-space",
			preview_digest: preview.preview_digest,
			resolutions: [],
			confirmed: true,
		});
		assert.equal(JSON.parse(String(calls[0]?.init?.body)).new_name, " leading-space");
	});

	it("applies only a server-issued preview and accepts operation or stale outcomes", async () => {
		const request = {
			operation_id: preview.operation_id,
			expires_at: preview.expires_at,
			source_path: preview.source_path,
			new_name: "新 页面",
			preview_digest: preview.preview_digest,
			resolutions: [{
				occurrence_id: "ambiguous-1",
				target_path: "wiki/entities/目标.md",
			}],
			confirmed: true as const,
		};
		const operation = {
			operation_id: preview.operation_id,
			state: "committed" as const,
			source_path: preview.source_path,
			target_path: preview.target_path,
			graph_rebuild: "failed" as const,
			conflicts: [],
			retained_evidence: [],
		};
		let calls = stubFetch({ ok: true, data: { outcome: "operation", operation } });

		assert.deepEqual(await applyGraphRename("/registered/kb", request), {
			outcome: "operation",
			operation,
		});
		assert.equal(calls[0]?.url, "/api/graph/renames/apply?kb=%2Fregistered%2Fkb");
		assert.equal(calls[0]?.init?.method, "POST");
		assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), request);

		calls = stubFetch({
			ok: true,
			data: {
				outcome: "preview_stale",
				operation_id: preview.operation_id,
				reason: "文件内容已经变化",
			},
		});
		assert.equal((await applyGraphRename("/registered/kb", request)).outcome, "preview_stale");
		assert.equal(calls.length, 1);

		for (const graph_rebuild of ["not_started", "started", "queued", "failed", "succeeded"] as const) {
			stubFetch({
				ok: true,
				data: { outcome: "operation", operation: { ...operation, graph_rebuild } },
			});
			const result = await applyGraphRename("/registered/kb", request);
			assert.equal(result.outcome, "operation");
			assert.equal(result.outcome === "operation" ? result.operation.graph_rebuild : null, graph_rebuild);
		}
	});

	it("reads every recovery status and resolves the complete observed conflict set", async () => {
		const evidence = {
			operation_id: preview.operation_id,
			retained_evidence: [{
				relative_path: ".wiki-tmp/rename-ops/11111111-1111-4111-8111-111111111111/evidence/current-1.md",
				sha256: "c".repeat(64),
				expires_at: "2026-08-21T00:00:00.000Z",
			}],
		};
		const newerEvidence: typeof evidence = {
			operation_id: "22222222-2222-4222-8222-222222222222",
			retained_evidence: [{
				relative_path: ".wiki-tmp/rename-ops/22222222-2222-4222-8222-222222222222/evidence/original-2.md",
				sha256: "f".repeat(64),
				expires_at: "2026-08-22T00:00:00.000Z",
			}],
		};
		const operation = {
			operation_id: preview.operation_id,
			state: "conflicted" as const,
			source_path: preview.source_path,
			target_path: preview.target_path,
			graph_rebuild: "not_started" as const,
			conflicts: [{
				source_path: "wiki/topics/冲突.md",
				current_state: "present" as const,
				current_sha256: "d".repeat(64),
				preserved_variants: [{
					kind: "original" as const,
					relative_path: ".wiki-tmp/rename-ops/11111111-1111-4111-8111-111111111111/evidence/original-1.md",
					sha256: "e".repeat(64),
				}],
			}, {
				source_path: "wiki/topics/已删除.md",
				current_state: "missing" as const,
				preserved_variants: [],
			}],
			retained_evidence: [],
		};
		const receiptSets: Array<Array<typeof evidence>> = [
			[],
			[evidence],
			[evidence, newerEvidence],
		];
		const recoveryFactories = [
			(retained_evidence_receipts: Array<typeof evidence>) => ({
				status: "clear" as const,
				retained_evidence_receipts,
			}),
			(retained_evidence_receipts: Array<typeof evidence>) => ({
				status: "required" as const,
				operation,
				retained_evidence_receipts,
			}),
			(retained_evidence_receipts: Array<typeof evidence>) => ({
				status: "rebuild_required" as const,
				operation: { ...operation, state: "committed" as const, graph_rebuild: "failed" as const },
				retained_evidence_receipts,
			}),
			(retained_evidence_receipts: Array<typeof evidence>) => ({
				status: "blocked" as const,
				reason: "unsafe_current_type" as const,
				operation_id: preview.operation_id,
				retained_evidence_receipts,
			}),
		];
		const recoveryStates = recoveryFactories.flatMap((createRecovery) => receiptSets.map(createRecovery));
		assert.equal(recoveryStates.length, 12, "four statuses must each cover zero, one, and many receipts");

		const resolution = {
			operation_id: preview.operation_id,
			action: "finish_rollback" as const,
			observed_conflicts: [{
				source_path: "wiki/topics/冲突.md",
				current_state: "present" as const,
				current_sha256: "d".repeat(64),
			}, {
				source_path: "wiki/topics/已删除.md",
				current_state: "missing" as const,
			}],
		};
		for (const recovery of recoveryStates) {
			const getCalls = stubFetch({ ok: true, data: recovery });
			assert.deepEqual(await getGraphRenameRecovery("/registered/kb"), recovery);
			assert.equal(getCalls[0]?.url, "/api/graph/renames/recovery?kb=%2Fregistered%2Fkb");
			assert.equal(getCalls[0]?.init?.method, "GET");

			const resolveCalls = stubFetch({ ok: true, data: recovery });
			assert.deepEqual(await resolveGraphRenameRecovery("/registered/kb", resolution), recovery);
			assert.equal(resolveCalls[0]?.url, "/api/graph/renames/recovery?kb=%2Fregistered%2Fkb");
			assert.equal(resolveCalls[0]?.init?.method, "POST");
			assert.deepEqual(JSON.parse(String(resolveCalls[0]?.init?.body)), resolution);
		}
	});

	it("rejects invalid preview, operation, recovery, and evidence envelopes", async () => {
		stubFetch({ ok: true, data: { ...preview, source_path: "/Users/private/wiki/page.md" } });
		await assert.rejects(
			() => previewGraphRename("/registered/kb", preview.source_path, "next"),
			(error) => error instanceof ContractMismatchError,
		);

		stubFetch({ ok: true, data: { outcome: "operation", operation: { graph_rebuild: "unknown" } } });
		await assert.rejects(
			() => applyGraphRename("/registered/kb", {
				operation_id: preview.operation_id,
				expires_at: preview.expires_at,
				source_path: preview.source_path,
				new_name: "next",
				preview_digest: preview.preview_digest,
				resolutions: [],
				confirmed: true,
			}),
			(error) => error instanceof ContractMismatchError,
		);

		for (const body of [{
			status: "blocked",
			reason: "guessed",
			operation_id: null,
			retained_evidence_receipts: [],
		}, {
			status: "clear",
			retained_evidence_receipts: [{
				operation_id: preview.operation_id,
				retained_evidence: [{
					relative_path: "/private.md",
					sha256: "f".repeat(64),
					expires_at: preview.expires_at,
				}],
			}],
		}]) {
			stubFetch({ ok: true, data: body });
			await assert.rejects(
				() => getGraphRenameRecovery("/registered/kb"),
				(error) => error instanceof ContractMismatchError,
			);
		}
	});

	it("propagates capability-token failures from the shared protected request path", async () => {
		stubFetch({
			ok: false,
			code: "FORBIDDEN_LOCAL_API",
			message: "缺少或无效的本地凭证",
		}, 403);

		await assert.rejects(
			() => getGraphRenameRecovery("/registered/kb"),
			(error) => error instanceof ApiError && error.code === "FORBIDDEN_LOCAL_API",
		);
	});
});

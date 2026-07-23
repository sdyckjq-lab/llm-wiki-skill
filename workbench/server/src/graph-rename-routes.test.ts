import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "./app.js";
import type { GraphRenameRouteService } from "./routes/graph-renames.js";

const KB = "/tmp/registered-kb";
const preview = {
	operation_id: "11111111-1111-4111-8111-111111111111", expires_at: "2026-08-01T00:00:00.000Z", preview_digest: "a".repeat(64), source_path: "wiki/topics/a.md", target_path: "wiki/topics/b.md", equivalent_portable_name: false, file_set_sha256: "b".repeat(64), editable_files: [], read_only_references: [], ambiguous_choices: [], layout_change: { from_key: "wiki/topics/a.md", to_key: "wiki/topics/b.md", present: false }, summary: { editable_files: 0, editable_occurrences: 0, read_only_occurrences: 0, ambiguous_occurrences: 0 },
};
const operation = { operation_id: preview.operation_id, state: "committed" as const, source_path: preview.source_path, target_path: preview.target_path, graph_rebuild: "started" as const, conflicts: [], retained_evidence: [] };

function service(): GraphRenameRouteService {
	return {
		getActiveKnowledgeBasePath: () => KB,
		assertRegisteredKnowledgeBase: async (value) => value === KB ? KB : (() => { throw Object.assign(new Error("not registered"), { code: "KB_NOT_REGISTERED" }); })(),
		previewGraphRename: async () => preview,
		applyGraphRename: async () => ({ outcome: "operation", operation }),
		getGraphRenameRecovery: async () => ({ status: "rebuild_required", operation, retained_evidence_receipts: [] }),
		resolveGraphRenameRecovery: async () => ({ status: "clear", retained_evidence_receipts: [] }),
		recoverGraphRenameOperations: async () => ({ needsRebuild: false }),
	};
}

test("rename routes validate context and return typed envelopes", async () => {
	const app = createApp({ graphRenameService: service() });
	const headers = { "Content-Type": "application/json" };
	const previewResponse = await app.request("/api/graph/renames/preview", { method: "POST", headers, body: JSON.stringify({ kbPath: KB, source_path: preview.source_path, new_name: "b" }) });
	assert.equal(previewResponse.status, 200); assert.equal((await previewResponse.json() as any).data.target_path, preview.target_path);
	const recovery = await app.request(`/api/graph/renames/recovery?kb=${encodeURIComponent(KB)}`);
	assert.equal(recovery.status, 200); assert.equal((await recovery.json() as any).data.status, "rebuild_required");
	const invalid = await app.request("/api/graph/renames/apply", { method: "POST", headers, body: JSON.stringify({ kbPath: KB, operation_id: preview.operation_id, expires_at: preview.expires_at, source_path: preview.source_path, new_name: "b", preview_digest: preview.preview_digest, resolutions: [], confirmed: false }) });
	assert.equal(invalid.status, 400); assert.equal((await invalid.json() as any).code, "INVALID_REQUEST");
});

test("rename route rejects query/body knowledge-base disagreement", async () => {
	const app = createApp({ graphRenameService: service() });
	const response = await app.request(`/api/graph/renames/preview?kb=${encodeURIComponent("/tmp/other")}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kbPath: KB, source_path: preview.source_path, new_name: "b" }) });
	assert.equal(response.status, 404);
});

test("rename recovery route passes duplicate observations to the service for a complete refresh", async () => {
	const observedBodies: unknown[] = [];
	const renameService = service();
	const refreshedOperation = {
		...operation,
		state: "conflicted" as const,
		graph_rebuild: "not_started" as const,
		conflicts: [{
			source_path: preview.source_path,
			current_state: "missing" as const,
			preserved_variants: [],
		}],
	};
	renameService.resolveGraphRenameRecovery = async (_kbPath, body) => {
		observedBodies.push(body);
		return { status: "required", operation: refreshedOperation, retained_evidence_receipts: [] };
	};
	const duplicate = { source_path: preview.source_path, current_state: "present", current_sha256: "c".repeat(64) } as const;
	const app = createApp({ graphRenameService: renameService });
	const response = await app.request("/api/graph/renames/recovery", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			kbPath: KB,
			operation_id: preview.operation_id,
			action: "finish_rollback",
			observed_conflicts: [duplicate, duplicate],
		}),
	});

	assert.equal(response.status, 200);
	assert.equal(observedBodies.length, 1);
	assert.deepEqual((observedBodies[0] as any).observed_conflicts, [duplicate, duplicate]);
	assert.deepEqual((await response.json() as any).data.operation.conflicts, refreshedOperation.conflicts);
});

test("rename preview route enforces the shared portable filename syntax", async () => {
	const previewNames: string[] = [];
	const renameService = service();
	renameService.previewGraphRename = async (_kbPath, _sourcePath, newName) => {
		previewNames.push(newName);
		return preview;
	};
	const app = createApp({ graphRenameService: renameService });
	const headers = { "Content-Type": "application/json" };
	for (const newName of ["", ".md", " leading", "trailing ", "trailing.", "CON.notes", "bad/name", "标题#锚点"]) {
		const response = await app.request("/api/graph/renames/preview", {
			method: "POST",
			headers,
			body: JSON.stringify({ kbPath: KB, source_path: preview.source_path, new_name: newName }),
		});
		assert.equal(response.status, 400, newName || "<empty>");
	}
	for (const newName of ["中文 页面", "ordinary space.md"]) {
		const response = await app.request("/api/graph/renames/preview", {
			method: "POST",
			headers,
			body: JSON.stringify({ kbPath: KB, source_path: preview.source_path, new_name: newName }),
		});
		assert.equal(response.status, 200, newName);
	}
	assert.deepEqual(previewNames, ["中文 页面", "ordinary space.md"]);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
	GraphRenameApplyBodySchema,
	GraphRenameApplyDataSchema,
	GraphRenamePreviewDataSchema,
	GraphRenameRecoveryDataSchema,
} from "../src/index.js";

const uuid = "11111111-1111-4111-8111-111111111111";
const sha = "a".repeat(64);
const iso = "2026-08-01T00:00:00.000Z";

test("rename contracts reject unsafe operation and confirmation input", () => {
	assert.equal(GraphRenameApplyBodySchema.safeParse({
		operation_id: "not-an-id", expires_at: iso, source_path: "wiki/topics/a.md", new_name: "b", preview_digest: sha, resolutions: [], confirmed: false,
	}).success, false);
	assert.equal(GraphRenameApplyBodySchema.safeParse({
		operation_id: uuid, expires_at: iso, source_path: "../a.md", new_name: "b", preview_digest: sha, resolutions: [], confirmed: true,
	}).success, false);
});

test("rename recovery contracts keep status, conflict and evidence discriminants", () => {
	const operation = {
		operation_id: uuid, state: "conflicted", source_path: "wiki/topics/a.md", target_path: "wiki/topics/b.md", graph_rebuild: "failed", conflicts: [{ source_path: "wiki/topics/a.md", current_state: "missing", preserved_variants: [] }], retained_evidence: [],
	};
	assert.equal(GraphRenameApplyDataSchema.safeParse({ outcome: "operation", operation }).success, true);
	assert.equal(GraphRenameRecoveryDataSchema.safeParse({ status: "required", operation, retained_evidence_receipts: [] }).success, true);
	assert.equal(GraphRenameRecoveryDataSchema.safeParse({ status: "blocked", reason: "unknown_state", operation_id: uuid, retained_evidence_receipts: [] }).success, true);
	assert.equal(GraphRenamePreviewDataSchema.safeParse({
		operation_id: uuid, expires_at: iso, preview_digest: sha, source_path: "wiki/topics/a.md", target_path: "wiki/topics/b.md", equivalent_portable_name: false, file_set_sha256: sha, editable_files: [], read_only_references: [], ambiguous_choices: [], layout_change: { from_key: "wiki/topics/a.md", to_key: "wiki/topics/b.md", present: false }, summary: { editable_files: 0, editable_occurrences: 0, read_only_occurrences: 0, ambiguous_occurrences: 0 },
	}).success, true);
});

import assert from "node:assert/strict";
import test from "node:test";

import {
	GraphRenameApplyBodySchema,
	GraphRenameApplyDataSchema,
	GraphRenameFilenameSchema,
	GraphRenamePreviewDataSchema,
	GraphRenameRecoveryBodySchema,
	GraphRenameRecoveryDataSchema,
	validateGraphRenameFilenameSyntax,
} from "../src/index.js";

const uuid = "11111111-1111-4111-8111-111111111111";
const sha = "a".repeat(64);
const iso = "2026-08-01T00:00:00.000Z";

test("rename filename syntax is portable while allowing ordinary Unicode names", () => {
	const cases = [
		{ name: "", accepted: false, reason: "empty_name" },
		{ name: "   ", accepted: false, reason: "empty_name" },
		{ name: ".md", accepted: false, reason: "empty_name" },
		{ name: " 前导空格", accepted: true, normalizedName: " 前导空格.md" },
		{ name: "末尾空格 ", accepted: false, reason: "trailing_dot_or_space" },
		{ name: "末尾句点.", accepted: false, reason: "trailing_dot_or_space" },
		{ name: "CON.notes", accepted: false, reason: "windows_reserved_name" },
		{ name: "bad/name", accepted: false, reason: "illegal_character" },
		{ name: "标题#锚点", accepted: false, reason: "obsidian_breaking_token" },
		{ name: "中文 页面", accepted: true, normalizedName: "中文 页面.md" },
		{ name: "ordinary space.md", accepted: true, normalizedName: "ordinary space.md" },
	] as const;

	for (const example of cases) {
		const result = validateGraphRenameFilenameSyntax(example.name);
		assert.equal(result.ok, example.accepted, example.name || "<empty>");
		assert.equal(GraphRenameFilenameSchema.safeParse(example.name).success, example.accepted, example.name || "<empty>");
		if (result.ok && "normalizedName" in example) {
			assert.equal(result.normalized_name, example.normalizedName);
		} else if (!result.ok && "reason" in example) {
			assert.equal(result.reason, example.reason);
		}
	}
});

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

test("rename recovery accepts duplicate observations for authoritative server refresh", () => {
	assert.equal(GraphRenameRecoveryDataSchema.safeParse({ status: "clear", retained_evidence_receipts: [] }).success, true);
	const recoveryBody = {
		operation_id: uuid,
		action: "finish_rollback",
		observed_conflicts: [
			{ source_path: "wiki/topics/a.md", current_state: "present", current_sha256: sha },
			{ source_path: "wiki/topics/a.md", current_state: "missing" },
		],
	};
	// The request schema is exercised through the exported body contract by the route layer.
	assert.equal(GraphRenameRecoveryBodySchema.safeParse(recoveryBody).success, true);
});

test("rename preview rejects impossible byte ranges", () => {
	const preview = {
		operation_id: uuid, expires_at: iso, preview_digest: sha, source_path: "wiki/topics/a.md", target_path: "wiki/topics/b.md", equivalent_portable_name: false, file_set_sha256: sha,
		editable_files: [{ source_path: "wiki/topics/a.md", file_sha256: sha, occurrences: [{ occurrence_id: "o", source_path: "wiki/topics/a.md", file_sha256: sha, start_byte: 4, end_byte: 4, raw_link: "[[a]]", resolution_kind: "ambiguous" }] }],
		read_only_references: [], ambiguous_choices: [], layout_change: { from_key: "wiki/topics/a.md", to_key: "wiki/topics/b.md", present: false }, summary: { editable_files: 1, editable_occurrences: 1, read_only_occurrences: 0, ambiguous_occurrences: 0 },
	};
	assert.equal(GraphRenamePreviewDataSchema.safeParse(preview).success, false);
});

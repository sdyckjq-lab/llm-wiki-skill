import { z } from "zod";

import { KnowledgeBaseRelativePathSchema } from "./graph-warnings.js";
import { validateGraphRenameFilenameSyntax } from "./graph-rename-filename.js";

export {
	normalizeGraphRenameFilename,
	validateGraphRenameFilenameSyntax,
} from "./graph-rename-filename.js";
export type {
	GraphRenameFilenameSyntaxReason,
	GraphRenameFilenameSyntaxResult,
} from "./graph-rename-filename.js";

const UuidSchema = z.string().uuid();
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const IsoDateSchema = z.string().datetime({ offset: true });

const RelativePath = KnowledgeBaseRelativePathSchema;

export const GraphRenameFilenameSchema = z.string().superRefine((value, context) => {
	const result = validateGraphRenameFilenameSyntax(value);
	if (!result.ok) {
		context.addIssue({ code: "custom", message: result.reason });
	}
});

const PreviewOccurrenceSchema = z.object({
	occurrence_id: z.string().min(1),
	source_path: RelativePath,
	file_sha256: Sha256Schema,
	start_byte: z.number().int().nonnegative(),
	end_byte: z.number().int().positive(),
	raw_link: z.string(),
	replacement_raw_link: z.string().optional(),
	resolution_kind: z.enum(["explicit_path", "unique_basename", "ambiguous"]),
}).strict().refine((value) => value.end_byte > value.start_byte, { message: "end_byte must be greater than start_byte", path: ["end_byte"] });
export type GraphRenamePreviewOccurrence = z.infer<typeof PreviewOccurrenceSchema>;

export const GraphRenamePreviewFileSchema = z.object({
	source_path: RelativePath,
	file_sha256: Sha256Schema,
	occurrences: z.array(PreviewOccurrenceSchema),
	read_only: z.boolean().default(false),
}).strict();
export type GraphRenamePreviewFile = z.infer<typeof GraphRenamePreviewFileSchema>;

export const GraphRenamePreviewBodySchema = z.object({
	kbPath: z.string().trim().min(1).optional(),
	source_path: RelativePath,
	new_name: GraphRenameFilenameSchema,
}).strict();
export type GraphRenamePreviewBody = z.infer<typeof GraphRenamePreviewBodySchema>;

export const GraphRenamePreviewDataSchema = z.object({
	operation_id: UuidSchema,
	expires_at: IsoDateSchema,
	preview_digest: Sha256Schema,
	source_path: RelativePath,
	target_path: RelativePath,
	equivalent_portable_name: z.boolean(),
	file_set_sha256: Sha256Schema,
	editable_files: z.array(GraphRenamePreviewFileSchema),
	read_only_references: z.array(PreviewOccurrenceSchema),
	ambiguous_choices: z.array(z.object({
		occurrence_id: z.string().min(1),
		source_path: RelativePath,
		candidates: z.array(z.object({ target_path: RelativePath, replacement_raw_link: z.string() }).strict()),
	}).strict()),
	layout_change: z.object({ from_key: RelativePath, to_key: RelativePath, present: z.boolean() }).strict(),
	summary: z.object({
		editable_files: z.number().int().nonnegative(),
		editable_occurrences: z.number().int().nonnegative(),
		read_only_occurrences: z.number().int().nonnegative(),
		ambiguous_occurrences: z.number().int().nonnegative(),
	}).strict(),
}).strict();
export type GraphRenamePreviewData = z.infer<typeof GraphRenamePreviewDataSchema>;

export const GraphRenameApplyBodySchema = z.object({
	kbPath: z.string().trim().min(1).optional(),
	operation_id: UuidSchema,
	expires_at: IsoDateSchema,
	source_path: RelativePath,
	new_name: GraphRenameFilenameSchema,
	preview_digest: Sha256Schema,
	resolutions: z.array(z.object({ occurrence_id: z.string().min(1), target_path: RelativePath }).strict())
		.refine((items) => new Set(items.map((item) => item.occurrence_id)).size === items.length, "duplicate resolution IDs"),
	confirmed: z.literal(true),
}).strict();
export type GraphRenameApplyBody = z.infer<typeof GraphRenameApplyBodySchema>;

const ConflictBaseSchema = z.object({
	source_path: RelativePath,
	preserved_variants: z.array(z.object({
		kind: z.enum(["current", "original", "intended"]),
		relative_path: RelativePath,
		sha256: Sha256Schema,
	}).strict()),
}).strict();

export const GraphRenameConflictSchema = z.discriminatedUnion("current_state", [
	ConflictBaseSchema.extend({ current_state: z.literal("present"), current_sha256: Sha256Schema }),
	ConflictBaseSchema.extend({ current_state: z.literal("missing") }),
]);
export type GraphRenameConflict = z.infer<typeof GraphRenameConflictSchema>;

export const GraphRenameOperationDataSchema = z.object({
	operation_id: UuidSchema,
	state: z.enum(["prepared", "applying", "committed", "rolled_back", "conflicted"]),
	source_path: RelativePath,
	target_path: RelativePath,
	graph_rebuild: z.enum(["not_started", "started", "queued", "failed", "succeeded"]),
	conflicts: z.array(GraphRenameConflictSchema),
	retained_evidence: z.array(z.object({ relative_path: RelativePath, sha256: Sha256Schema, expires_at: IsoDateSchema }).strict()),
}).strict();
export type GraphRenameOperationData = z.infer<typeof GraphRenameOperationDataSchema>;

export const GraphRenameApplyDataSchema = z.discriminatedUnion("outcome", [
	z.object({ outcome: z.literal("preview_stale"), operation_id: UuidSchema, reason: z.string().min(1) }).strict(),
	z.object({ outcome: z.literal("operation"), operation: GraphRenameOperationDataSchema }).strict(),
]);
export type GraphRenameApplyData = z.infer<typeof GraphRenameApplyDataSchema>;

export const GraphRenameRecoveryQuerySchema = z.object({ kbPath: z.string().trim().min(1).optional() }).strict();

export const RetainedEvidenceReceiptSchema = z.object({
	operation_id: UuidSchema,
	retained_evidence: z.array(z.object({ relative_path: RelativePath, sha256: Sha256Schema, expires_at: IsoDateSchema }).strict()),
}).strict();

export const GraphRenameRecoveryDataSchema = z.discriminatedUnion("status", [
	z.object({ status: z.literal("clear"), retained_evidence_receipts: z.array(RetainedEvidenceReceiptSchema) }).strict(),
	z.object({ status: z.literal("required"), operation: GraphRenameOperationDataSchema, retained_evidence_receipts: z.array(RetainedEvidenceReceiptSchema) }).strict(),
	z.object({ status: z.literal("rebuild_required"), operation: GraphRenameOperationDataSchema, retained_evidence_receipts: z.array(RetainedEvidenceReceiptSchema) }).strict(),
	z.object({ status: z.literal("blocked"), reason: z.enum(["unknown_state", "invalid_journal", "unsafe_current_type"]), operation_id: UuidSchema.nullable(), retained_evidence_receipts: z.array(RetainedEvidenceReceiptSchema) }).strict(),
]);
export type GraphRenameRecoveryData = z.infer<typeof GraphRenameRecoveryDataSchema>;

export const GraphRenameRecoveryBodySchema = z.object({
	kbPath: z.string().trim().min(1).optional(),
	operation_id: UuidSchema,
	action: z.enum(["finish_commit", "finish_rollback"]),
	observed_conflicts: z.array(z.discriminatedUnion("current_state", [
		z.object({ source_path: RelativePath, current_state: z.literal("present"), current_sha256: Sha256Schema }).strict(),
		z.object({ source_path: RelativePath, current_state: z.literal("missing") }).strict(),
	])),
}).strict();
export type GraphRenameRecoveryBody = z.infer<typeof GraphRenameRecoveryBodySchema>;

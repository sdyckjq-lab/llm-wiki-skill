import { z } from "zod";

export const ArtifactKindSchema = z.enum(["html", "pdf", "docx", "pptx", "xlsx"]);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ArtifactRendererSchema = z.enum(["iframe", "download-only"]);
export type ArtifactRenderer = z.infer<typeof ArtifactRendererSchema>;

export const ArtifactIdSchema = z.string().uuidv4();
export type ArtifactId = z.infer<typeof ArtifactIdSchema>;

export const ArtifactFileSchema = z.object({
	name: z.string(),
	sizeBytes: z.number().int().nonnegative(),
	mimeType: z.string(),
});
export type ArtifactFile = z.infer<typeof ArtifactFileSchema>;

export const ArtifactManifestSchema = z.object({
	id: ArtifactIdSchema,
	kind: ArtifactKindSchema,
	renderer: ArtifactRendererSchema,
	metadata: z.object({
		title: z.string(),
		createdAt: z.string(),
		sourceConversationId: z.string(),
		sourceKbPath: z.string(),
		sourceSkill: z.string(),
		sizeBytes: z.number().int().nonnegative(),
	}),
	files: z.array(ArtifactFileSchema),
	primaryFile: z.string(),
});
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;

export const ArtifactListQuerySchema = z.object({
	conversation: z.string().trim().min(1).optional(),
}).strict();
export type ArtifactListQuery = z.infer<typeof ArtifactListQuerySchema>;

export const ArtifactListDataSchema = z.array(ArtifactManifestSchema);
export type ArtifactListData = z.infer<typeof ArtifactListDataSchema>;

export const ArtifactManifestDataSchema = ArtifactManifestSchema;
export type ArtifactManifestData = ArtifactManifest;

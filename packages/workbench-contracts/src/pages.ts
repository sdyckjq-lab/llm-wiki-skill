import { z } from "zod";

export const PageRefSchema = z.object({
	path: z.string(),
	name: z.string(),
	category: z.string(),
	title: z.string(),
});
export type PageRef = z.infer<typeof PageRefSchema>;

const OptionalKnowledgeBaseQuerySchema = z.object({
	kb: z.string().trim().min(1).optional(),
});

export const PageRefsQuerySchema = OptionalKnowledgeBaseQuerySchema.extend({
	q: z.string().optional().default(""),
	limit: z.coerce.number().int().min(1).max(5000).optional().default(20),
}).strict();
export type PageRefsQuery = z.infer<typeof PageRefsQuerySchema>;

export const PageRefsDataSchema = z.array(PageRefSchema);
export type PageRefsData = z.infer<typeof PageRefsDataSchema>;

export const PageReadQuerySchema = OptionalKnowledgeBaseQuerySchema.extend({
	path: z.string().trim().min(1),
}).strict();
export type PageReadQuery = z.infer<typeof PageReadQuerySchema>;

export const PageReadDataSchema = z.object({
	content: z.string(),
});
export type PageReadData = z.infer<typeof PageReadDataSchema>;

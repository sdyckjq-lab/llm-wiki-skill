import { z } from "zod";

const GraphMetaSchema = z
	.object({
		build_date: z.string(),
		wiki_title: z.string(),
		total_nodes: z.number(),
		total_edges: z.number(),
		initial_view: z.array(z.string()).optional(),
		degraded: z.boolean().optional(),
		insights_degraded: z.boolean().optional(),
	})
	.passthrough();

const GraphNodeSchema = z
	.object({
		id: z.string(),
		label: z.string(),
		type: z.string(),
	})
	.passthrough();

const GraphEdgeSchema = z
	.object({
		id: z.string(),
		from: z.string(),
		to: z.string(),
		type: z.string(),
	})
	.passthrough();

const CommunityIdSchema = z.string().nullable();

const GraphInsightsSchema = z.object({
	surprising_connections: z.array(
		z.object({
			from: z.string(),
			to: z.string(),
			weight: z.number(),
			from_community: CommunityIdSchema,
			to_community: CommunityIdSchema,
		}),
	),
	isolated_nodes: z.array(
		z.object({
			id: z.string(),
			label: z.string(),
			degree: z.number(),
			community: CommunityIdSchema,
		}),
	),
	bridge_nodes: z.array(
		z.object({
			id: z.string(),
			label: z.string(),
			community: CommunityIdSchema,
			connected_communities: z.array(z.string()),
			community_count: z.number(),
		}),
	),
	sparse_communities: z.array(
		z.object({
			id: z.string(),
			label: z.string(),
			node_count: z.number(),
			density: z.number(),
			members: z.array(z.string()),
			internal_edges: z.number(),
		}),
	),
	meta: z.object({
		degraded: z.boolean(),
		node_count: z.number(),
		edge_count: z.number(),
		max_insight_nodes: z.number(),
		max_insight_edges: z.number(),
	}),
});

const GraphLearningSchema = z.object({
	version: z.literal(1).optional(),
	entry: z.object({
		recommended_start_node_id: z.string().nullable(),
		recommended_start_reason: z.string().nullable(),
		default_mode: z.enum(["path", "community", "global"]),
	}),
	views: z.object({
		path: z.object({
			enabled: z.boolean(),
			start_node_id: z.string().nullable(),
			node_ids: z.array(z.string()),
			degraded: z.boolean(),
		}),
		community: z.object({
			enabled: z.boolean(),
			community_id: z.string().nullable(),
			label: z.string().nullable(),
			node_ids: z.array(z.string()),
			is_weak: z.boolean(),
			degraded: z.boolean(),
		}),
		global: z.object({
			enabled: z.boolean(),
			node_ids: z.array(z.string()),
			degraded: z.boolean(),
		}),
	}),
	communities: z.array(
		z.object({
			id: z.string(),
			label: z.string(),
			node_count: z.number(),
			source_count: z.number().optional(),
			internal_edge_weight: z.number().optional(),
			is_primary: z.boolean().optional(),
			is_weak: z.boolean().optional(),
			recommended_start_node_id: z.string().nullable().optional(),
			color_index: z.number().optional(),
			members: z.array(z.string()).optional(),
		}),
	),
	degraded: z
		.object({
			path_to_community: z.boolean(),
			community_to_global: z.boolean(),
		})
		.optional(),
});

export const GraphDataSchema = z
	.object({
		meta: GraphMetaSchema,
		nodes: z.array(GraphNodeSchema),
		edges: z.array(GraphEdgeSchema),
		insights: GraphInsightsSchema.optional(),
		learning: GraphLearningSchema.optional(),
	})
	.passthrough();
export type GraphDataContract = z.infer<typeof GraphDataSchema>;

export const GraphReadDataSchema = z.discriminatedUnion("needsBuild", [
	z.object({
		needsBuild: z.literal(true),
	}),
	z.object({
		needsBuild: z.literal(false),
		data: GraphDataSchema,
	}),
]);
export type GraphReadData = z.infer<typeof GraphReadDataSchema>;

export const GraphRebuildDataSchema = z
	.object({
		status: z.enum(["started", "queued"]),
	})
	.strict();
export type GraphRebuildData = z.infer<typeof GraphRebuildDataSchema>;

export const GraphPinPositionSchema = z
	.object({
		x: z.coerce.number().finite(),
		y: z.coerce.number().finite(),
		coordinateSpace: z.enum(["world", "legacy-percent"]).optional(),
	})
	.strict();

export const GraphPinMapSchema = z.record(z.string(), GraphPinPositionSchema);

export const GraphLayoutSchema = z
	.object({
		version: z.literal(2),
		pins: GraphPinMapSchema,
		updatedAt: z.string(),
	})
	.strict();
export type GraphLayout = z.infer<typeof GraphLayoutSchema>;

export const GraphLayoutDataSchema = GraphLayoutSchema;
export type GraphLayoutData = z.infer<typeof GraphLayoutDataSchema>;

export const GraphLayoutWriteBodySchema = z
	.object({
		kbPath: z.string().trim().min(1).optional(),
		version: z.literal(2),
		pins: GraphPinMapSchema,
	})
	.strict();
export type GraphLayoutWriteBody = z.infer<
	typeof GraphLayoutWriteBodySchema
>;

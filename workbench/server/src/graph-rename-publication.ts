import { readGraphData } from "./graph.js";
import { type GraphRenameJournal, type GraphRenameJournalStore } from "./graph-rename-journal.js";

export function isPendingGraphPublication(record: GraphRenameJournal): boolean {
	return (record.state === "committed" || record.state === "rolled_back") && record.graph_rebuild !== "succeeded";
}

export async function markGraphRenamePublished(kbPath: string, store: GraphRenameJournalStore, now: () => Date): Promise<void> {
	for (const candidate of await store.listForStartup()) {
		if (candidate.kind !== "journal" || !isPendingGraphPublication(candidate)) continue;
		let locked = false;
		try {
			const record = await store.acquireExisting(candidate.operation_id);
			locked = true;
			if (!await isRenamePublished(kbPath, record)) continue;
			await store.transition(record.operation_id, record.state, { graphRebuild: "succeeded" });
			await store.compactTerminal({ operationId: record.operation_id, now: now() });
		} catch (error) {
			if ((error as { code?: unknown }).code !== "BUSY") throw error;
		} finally {
			if (locked) await store.release(candidate.operation_id);
		}
	}
}

export async function isRenamePublished(kbPath: string, record: GraphRenameJournal): Promise<boolean> {
	const graph = await readGraphData(kbPath).catch(() => null);
	if (!graph || graph.needsBuild) return false;
	const sourcePaths = new Set(graph.data.nodes.map((node) => String(node.source_path ?? node.path ?? node.id)));
	return record.state === "rolled_back"
		? sourcePaths.has(record.source_path) && !sourcePaths.has(record.target_path)
		: sourcePaths.has(record.target_path) && !sourcePaths.has(record.source_path);
}

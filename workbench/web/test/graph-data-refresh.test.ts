import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { GraphData, GraphOpenPagePayload, GraphVisibilityState } from "@llm-wiki/graph-engine";
import { graphReaderDrawer } from "../src/lib/drawer-state";
import {
	drawerAfterGraphDataRefresh,
	graphReaderStaleAfterRefresh,
} from "../src/lib/graph-data-refresh";

describe("graph data refresh drawer state", () => {
	it("keeps the current graph reader open when type filters only hide it", () => {
		const current = graphReaderDrawer(openPagePayload("a", "c1"), { content: "# Alpha" });
		const visibility: GraphVisibilityState = {
			searchQuery: "",
			searchResultIds: [],
			typeFilters: { topic: false },
			temporaryObject: null,
			focusCommunityId: "c1",
			hiddenReadingNodeId: "a",
		};

		assert.equal(graphReaderStaleAfterRefresh(current, graphData("c1"), visibility), false);
		const next = drawerAfterGraphDataRefresh(current, graphData("c1"), {
			pins: {},
			visibility,
			temporaryObject: null,
		});

		assert.equal(next.mode, "graph-reader");
		assert.equal(next.mode === "graph-reader" ? next.filteredHidden : null, true);
		assert.equal(next.mode === "graph-reader" ? next.content : null, "# Alpha");
	});

	it("closes the graph reader only when refreshed data loses the node or moves it outside the focused community", () => {
		const current = graphReaderDrawer(openPagePayload("a", "c1"), { content: "# Alpha" });
		const visibility: GraphVisibilityState = {
			searchQuery: "",
			searchResultIds: [],
			typeFilters: {},
			temporaryObject: null,
			focusCommunityId: "c1",
			hiddenReadingNodeId: null,
		};

		assert.equal(graphReaderStaleAfterRefresh(current, graphData("c1"), visibility), false);
		assert.equal(graphReaderStaleAfterRefresh(current, { ...graphData("c1"), nodes: [] }, visibility), true);
		assert.equal(graphReaderStaleAfterRefresh(current, graphData("c2"), visibility), true);

		const missing = drawerAfterGraphDataRefresh(current, { ...graphData("c1"), nodes: [] }, {
			pins: {},
			visibility,
			temporaryObject: null,
		});
		const moved = drawerAfterGraphDataRefresh(current, graphData("c2"), {
			pins: {},
			visibility,
			temporaryObject: null,
		});

		assert.deepEqual(missing, { mode: "closed" });
		assert.deepEqual(moved, { mode: "closed" });
	});
});

function openPagePayload(id: string, community: string): GraphOpenPagePayload {
	return {
		path: `wiki/${id}.md`,
		node: {
			id,
			title: id,
			type: "topic",
			typeLabel: "主题",
			sourcePath: `wiki/${id}.md`,
			community,
			isolated: false,
		},
	};
}

function graphData(community: string): GraphData {
	return {
		meta: {
			build_date: "2026-07-05",
			wiki_title: "Test",
			total_nodes: 1,
			total_edges: 0,
		},
		nodes: [
			{
				id: "a",
				label: "Alpha",
				type: "topic",
				community,
				source_path: "wiki/a.md",
			},
		],
		edges: [],
	};
}

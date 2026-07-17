import {
  buildGraphRendererAdapterData,
  buildRenderableGraph,
  createGraphOfflineCapabilities,
  normalizeGraphPinMap,
  projectGraphInput,
  type GraphData,
  type GraphEngine,
  type GraphInputProjection,
  type GraphRendererAdapterData,
  type GraphVisibilityState,
  type PinMap,
  type RenderableGraph,
  type RenderPositionMap
} from "../src/index.js";
import type { GraphFacadeState } from "../src/facade.js";

const graph: GraphData = {
  meta: {
    build_date: "2026-07-17T00:00:00.000Z",
    wiki_title: "type contract",
    total_nodes: 2,
    total_edges: 1
  },
  nodes: [
    { id: "a", label: "A", type: "topic", community: "c1" },
    { id: "b", label: "B", type: "entity", community: "c1" }
  ],
  edges: [
    { id: "a-b", from: "a", to: "b", type: "EXTRACTED" }
  ]
};
const unknownGraph: unknown = graph;
const inputProjection: GraphInputProjection = projectGraphInput(unknownGraph);
// @ts-expect-error route state cannot omit the search compatibility half of the input projection
const incompleteFacadeState: GraphFacadeState = { data: graph, pins: {} };
void incompleteFacadeState;

const positions: RenderPositionMap = {
  a: { x: 10, y: 20 },
  b: { x: 30, y: 40 }
};
const pins: PinMap = normalizeGraphPinMap({
  "wiki/a.md": { x: 10, y: 20, coordinateSpace: "world" }
});
const renderable: RenderableGraph = buildRenderableGraph(graph, { positions, pins });
const adapter: GraphRendererAdapterData = buildGraphRendererAdapterData(graph, {
  positions,
  pins,
  selection: { kind: "node", id: "a" }
});
const offline = createGraphOfflineCapabilities({
  persistPins(nextPins: PinMap): Promise<void> {
    void nextPins;
    return Promise.resolve();
  }
});

export function consumeSourceContracts(engine: GraphEngine, visibility: GraphVisibilityState): number {
  engine.setData(unknownGraph, pins);
  engine.setPins(pins);
  void visibility.searchResultIds;
  void offline.capabilities?.persistPins;
  return renderable.nodes.length + adapter.nodes.length + inputProjection.data.nodes.length;
}

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import GraphologyGraph from "graphology";

import {
  SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY,
  SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER,
  buildSigmaGlobalGraphologyGraph,
  createSigmaGlobalHitProjector,
  createSigmaGlobalRenderer,
  type SigmaGlobalGraphologyGraph,
  type SigmaGlobalRendererRuntime,
  type SigmaGlobalSigmaLike
} from "../src/render/sigma-global-renderer";
import type {
  GraphRendererAdapterData
} from "../src";

describe("Sigma global renderer production boundary", () => {
  it("records route ownership and graph-engine bundle boundary", () => {
    assert.equal(SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER, "facade");
    assert.deepEqual(SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY, {
      sigma: "runtime-loaded-by-sigma-global-renderer",
      graphology: "runtime-loaded-by-sigma-global-renderer",
      workbench: "loads through the graph-engine ESM Sigma runtime boundary when global route manager selects Sigma",
      offlineHtml: "loads through the graph-engine IIFE Sigma runtime boundary when offline global route manager selects Sigma"
    });
  });

  it("keeps Sigma and Graphology in runtime dependencies", async () => {
    const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    assert.equal(manifest.dependencies.sigma, "^3.0.3");
    assert.equal(manifest.dependencies.graphology, "^0.26.0");
    assert.equal(manifest.devDependencies.sigma, undefined);
    assert.equal(manifest.devDependencies.graphology, undefined);
  });

  it("requires the lazy Sigma runtime boundary before creating the lifecycle", () => {
    assert.throws(
      () => createSigmaGlobalRenderer({} as never),
      /container|runtime/
    );
  });

  it("builds a Graphology render graph entirely from adapter output", () => {
    const adapterData = adapterDataFixture();
    const graph = buildSigmaGlobalGraphologyGraph(adapterData, { GraphologyGraph });

    assert.equal(graph.order, 2);
    assert.equal(graph.size, 1);

    assert.deepEqual(graph.getNodeAttributes("render-alpha"), {
      x: 111,
      y: 222,
      label: "Adapter Alpha",
      size: 8,
      color: "#ef4444",
      type: "circle",
      graphNodeType: "topic",
      communityId: "adapter-community",
      sourcePath: "adapter/alpha.md",
      selected: true,
      searchHit: false,
      pinned: false,
      aggregationIds: ["adapter-aggregation"],
      labelVisible: true,
      displayMode: "card",
      visualRole: "landmark",
      priority: 900,
      drawerTarget: {
        summaryKind: "node-summary",
        object: { kind: "node", nodeId: "render-alpha" }
      }
    });
    assert.deepEqual(graph.getNodeAttributes("render-beta"), {
      x: 333,
      y: 444,
      label: "",
      size: 8,
      color: "#f59e0b",
      type: "circle",
      graphNodeType: "source",
      communityId: "adapter-community",
      sourcePath: "adapter/beta.md",
      selected: false,
      searchHit: true,
      pinned: true,
      aggregationIds: ["adapter-aggregation"],
      labelVisible: false,
      displayMode: "point",
      visualRole: "map-pin",
      priority: 100,
      drawerTarget: {
        summaryKind: "node-summary",
        object: { kind: "node", nodeId: "render-beta" }
      }
    });
    assert.deepEqual(graph.getEdgeAttributes("adapter-edge"), {
      size: 3,
      color: "#64748b",
      opacity: 0.42,
      relationType: "depends-on-adapter",
      confidence: "ADAPTER_CONFIDENCE",
      weight: 0.75,
      sourceCommunityId: "adapter-community",
      targetCommunityId: "adapter-community"
    });
    assert.equal(graph.source("adapter-edge"), "render-alpha");
    assert.equal(graph.target("adapter-edge"), "render-beta");
    assert.deepEqual(graph.getAttribute("communities"), [
      {
        id: "adapter-community",
        label: "Adapter Community",
        color: "#123456",
        nodeIds: ["render-alpha", "render-beta"],
        nodeCount: 2,
        selected: true,
        searchResultIds: ["render-beta"],
        pinnedNodeIds: ["render-beta"],
        aggregationIds: ["adapter-aggregation"],
        drawerTarget: {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: "adapter-community" }
        },
        commands: [{ kind: "enter-community", communityId: "adapter-community", label: "进入社区" }]
      }
    ]);
    assert.deepEqual(graph.getAttribute("aggregations"), [
      {
        id: "adapter-aggregation",
        label: "Adapter Aggregation",
        communityId: "adapter-community",
        nodeIds: ["render-alpha", "render-beta"],
        selectedNodeIds: ["render-alpha"],
        searchResultIds: ["render-beta"],
        pinnedNodeIds: ["render-beta"],
        totalCount: 17,
        selected: true,
        color: "#abcdef",
        point: { x: 222, y: 333 },
        radius: 44,
        drawerTarget: {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: "adapter-community" }
        },
        commands: [
          {
            kind: "show-this-object",
            object: {
              kind: "aggregation",
              aggregationId: "adapter-aggregation",
              nodeIds: ["render-alpha", "render-beta"],
              communityId: "adapter-community"
            },
            label: "显示这个对象"
          }
        ]
      }
    ]);
    assert.deepEqual(graph.getAttribute("counts"), adapterData.counts);
    assert.deepEqual(graph.getAttribute("selection"), adapterData.selection);
  });

  it("keeps the production Sigma boundary on GraphRendererAdapterData instead of raw GraphData", async () => {
    const source = await readFile(new URL("../src/render/sigma-global-renderer.ts", import.meta.url), "utf8");
    assert.match(source, /buildSigmaGlobalGraphologyGraph\(\s*adapterData: GraphRendererAdapterData/);
    assert.doesNotMatch(source, /GraphData/);
    assert.doesNotMatch(source, /buildGraphRendererAdapterData/);
    assert.doesNotMatch(source, /\bdata\.nodes\b/);
    assert.doesNotMatch(source, /\bdata\.edges\b/);
  });

  it("projects Sigma node hits before overlapping community regions", () => {
    const projector = createSigmaGlobalHitProjector({
      adapterData: adapterDataFixture(),
      viewport: { x: 0, y: 0, scale: 1 },
      viewportSize: { width: 500, height: 500 }
    });

    assert.deepEqual(
      projector.targetFromSigmaHit({ nodeId: "render-alpha", screenPoint: { x: 111, y: 222 } }),
      { kind: "node", id: "render-alpha" }
    );
  });

  it("uses the graph spatial path for Sigma community-region hits", () => {
    const projector = createSigmaGlobalHitProjector({
      adapterData: adapterDataFixture(),
      viewport: { x: 0, y: 0, scale: 1 },
      viewportSize: { width: 500, height: 500 }
    });

    assert.deepEqual(
      projector.targetFromSigmaHit({ screenPoint: { x: 250, y: 250 } }),
      { kind: "community-wash", id: "adapter-community" }
    );
  });

  it("projects Sigma blank screen hits without inventing graph semantics in the callback", () => {
    const projector = createSigmaGlobalHitProjector({
      adapterData: adapterDataFixture(),
      viewport: { x: 0, y: 0, scale: 1 },
      viewportSize: { width: 500, height: 500 }
    });

    assert.deepEqual(
      projector.targetFromSigmaHit({ screenPoint: { x: 490, y: 490 } }),
      { kind: "graph-blank" }
    );
  });

  it("creates, updates, preserves camera state, and destroys the Sigma lifecycle", () => {
    const container = fakeContainer();
    const runtime = fakeRuntime();
    const hits: unknown[] = [];
    const renderer = createSigmaGlobalRenderer({
      container,
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime,
      onHitTarget: (target) => hits.push(target)
    });
    const sigma = runtime.instances[0];

    assert.equal(renderer.id, "sigma-global");
    assert.equal(renderer.updateStrategy, "rebuild-graph-preserve-camera");
    assert.equal(container.children.length, 1);
    assert.equal(renderer.overlayRoot.children.length, 4);
    assert.equal(renderer.overlayRoot.children.filter((child) => child.className === "sigma-global-node-hit-target").length, 2);
    assert.equal(sigma.graph.order, 2);

    sigma.camera.setState({ x: 12, y: 34, angle: 0.25, ratio: 1.8 });
    const originalGraph = renderer.graph;
    const nextAdapterData = adapterDataFixture({
      selectedNodeId: "render-beta",
      searchResultIds: ["render-alpha"],
      betaPinned: false
    });
    renderer.update({ adapterData: nextAdapterData, theme: "mo-ye" });

    assert.equal(runtime.instances.length, 1);
    assert.notEqual(originalGraph, renderer.graph);
    assert.equal(sigma.graph, renderer.graph);
    assert.equal(sigma.setGraphCalls.length, 1);
    assert.deepEqual(sigma.camera.getState(), { x: 12, y: 34, angle: 0.25, ratio: 1.8 });
    assert.equal(renderer.graph.getAttribute("selection").selectedNodeIds[0], "render-beta");
    assert.equal(renderer.graph.getNodeAttribute("render-alpha", "searchHit"), true);
    assert.equal(renderer.graph.getNodeAttribute("render-beta", "pinned"), false);
    assert.equal(renderer.root.dataset.theme, "mo-ye");

    sigma.emit("clickNode", { node: "render-beta" });
    assert.deepEqual(renderer.lastHitTarget, { kind: "node", id: "render-beta" });
    assert.deepEqual(hits.at(-1), { kind: "node", id: "render-beta" });

    renderer.destroy();
    assert.equal(sigma.killed, true);
    assert.equal(container.children.length, 0);
    assert.throws(() => renderer.update({ adapterData: adapterDataFixture() }), /destroyed/);

    sigma.emit("clickNode", { node: "render-alpha" });
    assert.deepEqual(renderer.lastHitTarget, { kind: "node", id: "render-beta" });
  });

  it("reports Sigma initialization failure to the route layer", () => {
    const failure = new Error("webgl unavailable");
    const errors: unknown[] = [];

    assert.throws(
      () => createSigmaGlobalRenderer({
        container: fakeContainer(),
        adapterData: adapterDataFixture(),
        theme: "shan-shui",
        runtime: fakeRuntime({ constructError: failure }),
        onFatalError: (error) => errors.push(error)
      }),
      /webgl unavailable/
    );
    assert.deepEqual(errors, [failure]);
  });

  it("suppresses stale events after replacement and update-after-destroy", () => {
    const firstRuntime = fakeRuntime();
    const secondRuntime = fakeRuntime();
    const first = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime: firstRuntime
    });
    const firstSigma = firstRuntime.instances[0];
    first.destroy();

    const second = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture({ selectedNodeId: "render-beta" }),
      theme: "shan-shui",
      runtime: secondRuntime
    });
    const secondSigma = secondRuntime.instances[0];

    firstSigma.emit("clickNode", { node: "render-alpha" });
    assert.equal(first.lastHitTarget, null);
    assert.equal(second.lastHitTarget, null);

    secondSigma.emit("clickNode", { node: "render-beta" });
    assert.deepEqual(second.lastHitTarget, { kind: "node", id: "render-beta" });
    second.destroy();
    assert.throws(() => second.update({ adapterData: adapterDataFixture() }), /destroyed/);
  });

  it("reports unrecoverable update and destroy errors without choosing fallback UI", () => {
    const errors: unknown[] = [];
    const runtime = fakeRuntime({ setGraphError: new Error("graph swap failed"), killError: new Error("kill failed") });
    const renderer = createSigmaGlobalRenderer({
      container: fakeContainer(),
      adapterData: adapterDataFixture(),
      theme: "shan-shui",
      runtime,
      onFatalError: (error) => errors.push(error)
    });

    renderer.update({ adapterData: adapterDataFixture({ selectedNodeId: "render-beta" }) });
    renderer.destroy();

    assert.deepEqual(errors.map((error) => String(error)), ["Error: graph swap failed", "Error: kill failed"]);
  });
});

function adapterDataFixture(options: {
  selectedNodeId?: string;
  searchResultIds?: string[];
  betaPinned?: boolean;
} = {}): GraphRendererAdapterData {
  const selectedNodeId = options.selectedNodeId ?? "render-alpha";
  const searchResultIds = options.searchResultIds ?? ["render-beta"];
  const betaPinned = options.betaPinned ?? true;
  return {
    counts: {
      nodes: 2,
      edges: 1,
      communities: 1,
      hidden: 0,
      renderedNodes: 2,
      renderedEdges: 1,
      aggregationContainers: 1
    },
    selection: {
      input: { kind: "node", id: selectedNodeId },
      selectionId: `node:${selectedNodeId}`,
      selectedNodeIds: [selectedNodeId],
      selectedCommunityIds: ["adapter-community"],
      containsCurrentObject: true
    },
    nodes: [
      {
        id: "render-alpha",
        object: { kind: "node", nodeId: "render-alpha" },
        label: "Adapter Alpha",
        type: "topic",
        communityId: "adapter-community",
        sourcePath: "adapter/alpha.md",
        point: { x: 111, y: 222 },
        selected: selectedNodeId === "render-alpha",
        searchHit: searchResultIds.includes("render-alpha"),
        pinHint: { nodeId: "render-alpha", wikiPath: "adapter/alpha.md", pinned: false, position: null },
        aggregationIds: ["adapter-aggregation"],
        drawerTarget: {
          summaryKind: "node-summary",
          object: { kind: "node", nodeId: "render-alpha" }
        },
        render: {
          displayMode: "card",
          visualRole: "landmark",
          priority: 900,
          labelVisible: true
        }
      },
      {
        id: "render-beta",
        object: { kind: "node", nodeId: "render-beta" },
        label: "Adapter Beta",
        type: "source",
        communityId: "adapter-community",
        sourcePath: "adapter/beta.md",
        point: { x: 333, y: 444 },
        selected: selectedNodeId === "render-beta",
        searchHit: searchResultIds.includes("render-beta"),
        pinHint: {
          nodeId: "render-beta",
          wikiPath: "adapter/beta.md",
          pinned: betaPinned,
          position: betaPinned ? { x: 333, y: 444, coordinateSpace: "world" } : null
        },
        aggregationIds: ["adapter-aggregation"],
        drawerTarget: {
          summaryKind: "node-summary",
          object: { kind: "node", nodeId: "render-beta" }
        },
        render: {
          displayMode: "point",
          visualRole: "map-pin",
          priority: 100,
          labelVisible: false
        }
      }
    ],
    edges: [
      {
        id: "adapter-edge",
        sourceNodeId: "render-alpha",
        targetNodeId: "render-beta",
        sourceCommunityId: "adapter-community",
        targetCommunityId: "adapter-community",
        relationType: "depends-on-adapter",
        confidence: "ADAPTER_CONFIDENCE",
        weight: 0.75,
        render: {
          strokeWidth: 3,
          opacity: 0.42
        }
      }
    ],
    communities: [
      {
        id: "adapter-community",
        object: { kind: "community", communityId: "adapter-community" },
        label: "Adapter Community",
        nodeIds: ["render-alpha", "render-beta"],
        nodeCount: 2,
        selected: true,
        searchResultIds,
        pinHints: betaPinned ? [
          {
            nodeId: "render-beta",
            wikiPath: "adapter/beta.md",
            pinned: true,
            position: { x: 333, y: 444, coordinateSpace: "world" }
          }
        ] : [],
        aggregationIds: ["adapter-aggregation"],
        drawerTarget: {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: "adapter-community" }
        },
        commands: [{ kind: "enter-community", communityId: "adapter-community", label: "进入社区" }]
      }
    ],
    aggregations: [
      {
        id: "adapter-aggregation",
        object: {
          kind: "aggregation",
          aggregationId: "adapter-aggregation",
          nodeIds: ["render-alpha", "render-beta"],
          communityId: "adapter-community"
        },
        label: "Adapter Aggregation",
        communityId: "adapter-community",
        nodeIds: ["render-alpha", "render-beta"],
        selectedNodeIds: ["render-alpha"],
        searchResultIds,
        pinnedNodeIds: betaPinned ? ["render-beta"] : [],
        totalCount: 17,
        selected: true,
        pinHints: betaPinned ? [
          {
            nodeId: "render-beta",
            wikiPath: "adapter/beta.md",
            pinned: true,
            position: { x: 333, y: 444, coordinateSpace: "world" }
          }
        ] : [],
        drawerTarget: {
          summaryKind: "community-summary",
          object: { kind: "community", communityId: "adapter-community" }
        },
        commands: [
          {
            kind: "show-this-object",
            object: {
              kind: "aggregation",
              aggregationId: "adapter-aggregation",
              nodeIds: ["render-alpha", "render-beta"],
              communityId: "adapter-community"
            },
            label: "显示这个对象"
          }
        ]
      }
    ],
    renderable: {
      nodes: [],
      edges: [],
      communities: [
        {
          id: "adapter-community",
          label: "Adapter Community",
          color: "#123456",
          nodeCount: 2,
          boundaryCertainty: "high",
          wash: { cx: 250, cy: 250, rx: 80, ry: 60, opacity: 0.2 }
        }
      ],
      aggregationContainers: [
        {
          id: "adapter-aggregation",
          role: "aggregation-container",
          label: "Adapter Aggregation",
          communityId: "adapter-community",
          nodeIds: ["render-alpha", "render-beta"],
          nodeCount: 17,
          searchHitCount: 1,
          pinnedCount: betaPinned ? 1 : 0,
          selectedCount: 1,
          selected: true,
          searchResultIds,
          pinnedNodeIds: betaPinned ? ["render-beta"] : [],
          selectedNodeIds: [selectedNodeId],
          pinHints: betaPinned ? [
            {
              nodeId: "render-beta",
              wikiPath: "adapter/beta.md",
              pinned: true,
              position: { x: 333, y: 444, coordinateSpace: "world" }
            }
          ] : [],
          point: { x: 222, y: 333 },
          x: 22,
          y: 33,
          radius: 44,
          color: "#abcdef"
        }
      ],
      minimap: { path: "", nodes: [] },
      relationLegend: [],
      selectedNodeId,
      selectedCommunityId: "adapter-community",
      selectedNodeIds: [selectedNodeId],
      hiddenNodeIds: new Set(),
      searchResultIds,
      worldBounds: { minX: 0, maxX: 500, minY: 0, maxY: 500 },
      budgets: {
        limits: {
          maxNodes: 2,
          maxEdges: 1,
          maxLabels: 1,
          maxCards: 1,
          maxInteractionUpdates: 3,
          maxVisibleCommunities: 1
        },
        usage: {
          nodes: 2,
          edges: 1,
          labels: 1,
          cards: 1,
          interactionUpdate: 3,
          activeInteraction: 3,
          communities: 1,
          aggregationContainers: 1
        }
      },
      qualityNotice: null,
      communityFocus: null,
      communityQuality: {
        boundaryCertainty: "high",
        skeletonLabel: "stable",
        hiddenNodeCount: 0,
        hiddenEdgeCount: 0,
        stableCoreNodeIds: ["render-alpha"],
        stableSkeletonEdgeIds: ["adapter-edge"],
        temporaryBoostNodeIds: []
      }
    }
  };
}

function fakeContainer(): HTMLElement & { children: HTMLElement[] } {
  const children: HTMLElement[] = [];
  const container = {
    ownerDocument: {
      createElement: (tagName: string) => fakeElement(tagName)
    },
    append: (child: HTMLElement) => {
      children.push(child);
    },
    children
  } as unknown as HTMLElement & { children: HTMLElement[] };
  containerRegistry.push(container);
  return container;
}

function fakeElement(_tagName: string): HTMLElement {
  const children: HTMLElement[] = [];
  const element = {
    className: "",
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
    children,
    tabIndex: -1,
    ownerDocument: null as unknown as Document,
    append: (...items: HTMLElement[]) => {
      children.push(...items);
    },
    prepend: (...items: HTMLElement[]) => {
      children.unshift(...items);
    },
    replaceChildren: (...items: HTMLElement[]) => {
      children.splice(0, children.length, ...items);
    },
    addEventListener: () => undefined,
    setAttribute: () => undefined,
    querySelector: () => null,
    remove: () => undefined
  };
  element.ownerDocument = {
    createElement: (tagName: string) => {
      const child = fakeElement(tagName);
      child.ownerDocument = element.ownerDocument;
      return child;
    }
  } as unknown as Document;
  element.remove = () => {
    // The fake container owns removal by filtering on object identity below.
    for (const container of fakeContainersWith(element as unknown as HTMLElement)) {
      const index = container.children.indexOf(element as unknown as HTMLElement);
      if (index >= 0) container.children.splice(index, 1);
    }
  };
  return element as unknown as HTMLElement;
}

const containerRegistry: Array<HTMLElement & { children: HTMLElement[] }> = [];

function fakeContainersWith(child: HTMLElement): Array<HTMLElement & { children: HTMLElement[] }> {
  return containerRegistry.filter((container) => container.children.includes(child));
}

function fakeRuntime(options: {
  constructError?: Error;
  setGraphError?: Error;
  killError?: Error;
} = {}): SigmaGlobalRendererRuntime & { instances: FakeSigma[] } {
  const instances: FakeSigma[] = [];
  class RuntimeSigma extends FakeSigma {
    constructor(graph: SigmaGlobalGraphologyGraph, container: HTMLElement, settings?: Record<string, unknown>) {
      if (options.constructError) throw options.constructError;
      super(graph, container, settings, options);
      instances.push(this);
    }
  }
  return {
    Sigma: RuntimeSigma,
    GraphologyGraph,
    instances
  };
}

class FakeSigma implements SigmaGlobalSigmaLike {
  graph: SigmaGlobalGraphologyGraph;
  readonly container: HTMLElement;
  readonly settings: Record<string, unknown>;
  readonly camera = new FakeCamera();
  readonly listeners = new Map<string, Set<(payload?: unknown) => void>>();
  readonly setGraphCalls: SigmaGlobalGraphologyGraph[] = [];
  killed = false;

  constructor(
    graph: SigmaGlobalGraphologyGraph,
    container: HTMLElement,
    settings: Record<string, unknown> = {},
    private readonly options: { setGraphError?: Error; killError?: Error } = {}
  ) {
    this.graph = graph;
    this.container = container;
    this.settings = settings;
  }

  getCamera(): FakeCamera {
    return this.camera;
  }

  getGraph(): SigmaGlobalGraphologyGraph {
    return this.graph;
  }

  setGraph(graph: SigmaGlobalGraphologyGraph): void {
    if (this.options.setGraphError) throw this.options.setGraphError;
    this.graph = graph;
    this.setGraphCalls.push(graph);
  }

  setSetting(key: string, value: unknown): void {
    this.settings[key] = value;
  }

  refresh(): void {
    this.settings.refreshed = true;
  }

  viewportToGraph(point: { x: number; y: number }): { x: number; y: number } {
    return { x: point.x, y: point.y };
  }

  graphToViewport(point: { x: number; y: number }): { x: number; y: number } {
    return { x: point.x, y: point.y };
  }

  on(event: string, listener: (payload?: unknown) => void): void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: (payload?: unknown) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, payload?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  kill(): void {
    this.killed = true;
    if (this.options.killError) throw this.options.killError;
  }
}

class FakeCamera {
  private state = { x: 0, y: 0, angle: 0, ratio: 1 };

  getState(): { x: number; y: number; angle: number; ratio: number } {
    return { ...this.state };
  }

  setState(state: Partial<{ x: number; y: number; angle: number; ratio: number }>): void {
    this.state = { ...this.state, ...state };
  }
}

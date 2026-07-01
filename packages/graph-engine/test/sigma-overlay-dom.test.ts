import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { GraphRendererAdapterData } from "../src/render/adapter";
import type { SigmaGlobalSigmaLike } from "../src/render/sigma-global-types";
import {
  createSigmaOverlayDomController,
  sigmaCommunityLabels,
  sigmaOverlayNodes
} from "../src/render/sigma-overlay-dom";

describe("Sigma overlay DOM controller", () => {
  it("routes node hit-target clicks through the rendered object callback", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();

    nodeTarget(fixture.overlayRoot, "alpha")?.dispatch("click");

    assert.deepEqual(fixture.hits, [{ kind: "node", id: "alpha" }]);
  });

  it("routes community cloud shape clicks through the rendered object callback", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();

    communityShape(fixture.overlayRoot, "community-a")?.dispatch("click");

    assert.deepEqual(fixture.hits, [{ kind: "community-wash", id: "community-a" }]);
  });

  it("binds pointer overlay drag and clears document listeners on pointerup", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();

    nodeTarget(fixture.overlayRoot, "alpha")?.dispatch("pointerdown", {
      button: 0,
      pointerId: 7,
      clientX: 10,
      clientY: 20
    });
    assert.deepEqual(fixture.dragCalls, ["begin:alpha:10,20"]);
    assert.equal(fixture.document.listenerCount("pointermove"), 1);
    assert.equal(fixture.document.listenerCount("pointerup"), 1);

    fixture.document.dispatch("pointermove", { pointerId: 7, clientX: 14, clientY: 24 });
    fixture.document.dispatch("pointerup", { pointerId: 7, clientX: 18, clientY: 28 });

    assert.deepEqual(fixture.dragCalls, [
      "begin:alpha:10,20",
      "move:14,24",
      "commit:18,28"
    ]);
    assert.equal(fixture.document.listenerCount("pointermove"), 0);
    assert.equal(fixture.document.listenerCount("pointerup"), 0);
    assert.equal(fixture.document.listenerCount("pointercancel"), 0);
  });

  it("clears pointer listeners and cancels the drag on pointercancel", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();

    nodeTarget(fixture.overlayRoot, "alpha")?.dispatch("pointerdown", {
      button: 0,
      pointerId: 7,
      clientX: 10,
      clientY: 20
    });
    fixture.document.dispatch("pointercancel", { pointerId: 7, clientX: 18, clientY: 28 });

    assert.deepEqual(fixture.dragCalls, ["begin:alpha:10,20", "cancel"]);
    assert.equal(fixture.document.listenerCount("pointermove"), 0);
    assert.equal(fixture.document.listenerCount("pointerup"), 0);
    assert.equal(fixture.document.listenerCount("pointercancel"), 0);
  });

  it("uses mouse drag fallback when PointerEvent is unavailable", () => {
    const fixture = controllerFixture({ pointerEvents: false });
    fixture.controller.rebuild();

    nodeTarget(fixture.overlayRoot, "alpha")?.dispatch("mousedown", {
      button: 0,
      clientX: 10,
      clientY: 20
    });
    fixture.document.dispatch("mousemove", { clientX: 12, clientY: 22 });
    fixture.document.dispatch("mouseup", { clientX: 13, clientY: 23 });

    assert.deepEqual(fixture.dragCalls, [
      "begin:alpha:10,20",
      "move:12,22",
      "commit:13,23"
    ]);
    assert.equal(fixture.document.listenerCount("mousemove"), 0);
    assert.equal(fixture.document.listenerCount("mouseup"), 0);
  });

  it("destroy clears overlay elements and active drag listeners", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();
    nodeTarget(fixture.overlayRoot, "alpha")?.dispatch("pointerdown", {
      button: 0,
      pointerId: 7,
      clientX: 10,
      clientY: 20
    });

    fixture.controller.destroy();

    assert.equal(fixture.overlayRoot.children.length, 0);
    assert.equal(fixture.document.listenerCount("pointermove"), 0);
    assert.equal(fixture.document.listenerCount("pointerup"), 0);
    assert.equal(fixture.document.listenerCount("pointercancel"), 0);
  });

  it("rebuild prunes stale elements and refreshes reused node data attributes", () => {
    const initialData = adapterDataFixture({
      nodes: [
        nodeFixture("alpha", { selected: true }),
        nodeFixture("beta", { searchHit: true, pinned: true })
      ],
      communities: [communityFixture("community-a"), communityFixture("community-b")]
    });
    const fixture = controllerFixture({ adapterData: initialData });
    fixture.controller.rebuild();
    const alphaBefore = nodeTarget(fixture.overlayRoot, "alpha");

    fixture.setAdapterData(adapterDataFixture({
      nodes: [
        nodeFixture("alpha", { selected: false, searchHit: true, pinned: true })
      ],
      communities: [communityFixture("community-a")]
    }));
    fixture.controller.rebuild();

    const alphaAfter = nodeTarget(fixture.overlayRoot, "alpha");
    assert.equal(alphaAfter, alphaBefore);
    assert.equal(alphaAfter?.dataset.selected, "false");
    assert.equal(alphaAfter?.dataset.searchHit, "true");
    assert.equal(alphaAfter?.dataset.pinned, "true");
    assert.equal(nodeTarget(fixture.overlayRoot, "beta"), undefined);
    assert.equal(communityRegion(fixture.overlayRoot, "community-b"), undefined);
  });

  it("reposition updates boxes without creating elements, replacing children, or rebinding listeners", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();
    const childrenBefore = [...fixture.overlayRoot.children];
    fixture.document.created = 0;
    fixture.overlayRoot.replaceCount = 0;
    const alphaBefore = nodeTarget(fixture.overlayRoot, "alpha");
    const clickListenersBefore = alphaBefore?.listenerCount("click") ?? 0;

    fixture.controller.reposition();
    fixture.controller.reposition();

    assert.equal(fixture.document.created, 0);
    assert.equal(fixture.overlayRoot.replaceCount, 0);
    assert.deepEqual(fixture.overlayRoot.children, childrenBefore);
    assert.equal(alphaBefore?.listenerCount("click"), clickListenersBefore);
    assert.match(alphaBefore?.style.left ?? "", /px$/);
  });

  it("uses an overlay root transform during camera animation without recomputing cloud geometry", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();
    const childrenBefore = [...fixture.overlayRoot.children];
    const alphaBefore = nodeTarget(fixture.overlayRoot, "alpha");
    const regionBefore = communityRegion(fixture.overlayRoot, "community-a");
    const labelBefore = communityLabel(fixture.overlayRoot, "community-a");
    fixture.resetCloudCalls();

    fixture.setSigma(sigmaTransform({ scale: 1.5, translateX: 40, translateY: 30 }));
    fixture.controller.repositionForCameraAnimation();

    assert.equal(fixture.cloudCalls(), 0);
    assert.match(fixture.overlayRoot.style.transform || "", /^translate\(/);
    assert.match(fixture.overlayRoot.style.transform || "", /scale\(1\.5\)$/);
    assert.equal(fixture.overlayRoot.style.transformOrigin, "0 0");
    assert.equal(fixture.overlayRoot.style.willChange, "transform");
    assert.deepEqual(fixture.overlayRoot.children, childrenBefore);
    assert.equal(nodeTarget(fixture.overlayRoot, "alpha"), alphaBefore);
    assert.equal(communityRegion(fixture.overlayRoot, "community-a"), regionBefore);
    assert.equal(communityLabel(fixture.overlayRoot, "community-a"), labelBefore);
    assert.equal(alphaBefore?.style.transform || "", "");
    assert.equal(regionBefore?.style.transform || "", "");
    assert.equal(labelBefore?.style.transform || "", "");
  });

  it("uses current camera state for animation anchors without changing exact reposition projection", () => {
    const fixture = controllerFixture();
    const sigma = {
      graphToViewport: (
        point: { x: number; y: number },
        override?: { cameraState?: { x?: number; y?: number; angle?: number; ratio?: number } }
      ) => {
        const cameraState = override?.cameraState;
        if (!cameraState) return { x: point.x, y: point.y };
        return {
          x: point.x + (cameraState.x ?? 0) * 10,
          y: point.y + (cameraState.y ?? 0) * 10
        };
      },
      getCamera: () => ({
        getState: () => ({ x: 4, y: 3, angle: 0, ratio: 1 })
      })
    } satisfies SigmaGlobalSigmaLike;
    fixture.setSigma(sigma);
    fixture.controller.rebuild();
    const alphaBefore = nodeTarget(fixture.overlayRoot, "alpha");

    fixture.controller.repositionForCameraAnimation();

    assert.equal(fixture.overlayRoot.style.transform, "translate(40px, 30px) scale(1)");
    assert.equal(alphaBefore?.style.left, "26px");

    fixture.controller.reposition();

    assert.equal(fixture.overlayRoot.style.transform, "");
    assert.equal(alphaBefore?.style.left, "26px");
  });

  it("settles an animation frame with exact reposition and clears the root transform", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();
    fixture.setSigma(sigmaTransform({ scale: 1.5, translateX: 40, translateY: 30 }));
    fixture.controller.repositionForCameraAnimation();
    fixture.resetCloudCalls();

    fixture.controller.reposition();

    assert.equal(fixture.overlayRoot.style.transform, "");
    assert.equal(fixture.overlayRoot.style.transformOrigin, "");
    assert.equal(fixture.overlayRoot.style.willChange, "");
    assert.ok(fixture.cloudCalls() > 0);
  });

  it("falls back to exact reposition when animation has no valid baseline", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();
    fixture.controller.invalidateAnimationBaseline();
    fixture.resetCloudCalls();

    fixture.controller.repositionForCameraAnimation();

    assert.equal(fixture.overlayRoot.style.transform, "");
    assert.ok(fixture.cloudCalls() > 0);
  });

  it("clears an active animation transform on destroy", () => {
    const fixture = controllerFixture();
    fixture.controller.rebuild();
    fixture.setSigma(sigmaTransform({ scale: 1.5, translateX: 40, translateY: 30 }));
    fixture.controller.repositionForCameraAnimation();

    fixture.controller.destroy();

    assert.equal(fixture.overlayRoot.style.transform, "");
    assert.equal(fixture.overlayRoot.style.transformOrigin, "");
    assert.equal(fixture.overlayRoot.style.willChange, "");
  });

  it("keeps community label cap at eight and prioritizes selected communities", () => {
    const communities = Array.from({ length: 10 }, (_, index) => communityFixture(`community-${index + 1}`, {
      selected: index === 1,
      nodeCount: index + 1
    }));
    const fixture = controllerFixture({
      adapterData: adapterDataFixture({ communities, nodes: [nodeFixture("alpha")] })
    });
    fixture.controller.rebuild();

    const labels = fixture.overlayRoot.children.filter((child) => child.className === "sigma-global-community-label");

    assert.equal(labels.length, 8);
    assert.equal(labels[0]?.dataset.communityId, "community-2");
    assert.deepEqual(
      sigmaCommunityLabels(fixture.adapterData(), 8).map((community) => community.id),
      labels.map((label) => label.dataset.communityId)
    );
  });

  it("keeps node hit-target cap at 160 while preserving selected search and pinned anchors", () => {
    const nodes = Array.from({ length: 250 }, (_, index) => nodeFixture(`node-${index}`, {
      selected: index === 249,
      searchHit: index < 100,
      pinned: index >= 150
    }));
    const data = adapterDataFixture({ nodes, communities: [communityFixture("community-a")] });
    const fixture = controllerFixture({ adapterData: data });
    fixture.controller.rebuild();

    const targets = fixture.overlayRoot.children.filter((child) => child.className === "sigma-global-node-hit-target");

    assert.equal(targets.length, 160);
    assert.ok(targets.some((target) => target.dataset.nodeId === "node-249"));
    assert.ok(targets.some((target) => target.dataset.searchHit === "true"));
    assert.ok(targets.some((target) => target.dataset.pinned === "true"));
    assert.deepEqual(
      sigmaOverlayNodes(data).map((node) => node.id),
      targets.map((target) => target.dataset.nodeId)
    );
  });
});

function controllerFixture(options: {
  adapterData?: GraphRendererAdapterData;
  pointerEvents?: boolean;
  sigma?: SigmaGlobalSigmaLike;
} = {}) {
  const document = new FakeDocument(options.pointerEvents ?? true);
  const overlayRoot = document.createElement("div");
  let adapterData = options.adapterData ?? adapterDataFixture();
  let sigma = options.sigma || sigmaIdentity();
  let cloudCalls = 0;
  let activeNodeId: string | null = null;
  const hits: unknown[] = [];
  const dragCalls: string[] = [];
  const controller = createSigmaOverlayDomController({
    overlayRoot: overlayRoot as unknown as HTMLElement,
    cloudFilterId: "test-cloud-filter",
    getAdapterData: () => adapterData,
    getSigma: () => sigma,
    getOptions: () => ({
      adapterData,
      viewportSize: { width: 500, height: 500 },
      viewport: { x: 0, y: 0, scale: 1 }
    }),
    communityCloudFor: (_communityId, wash) => {
      cloudCalls += 1;
      return {
        box: {
          left: wash.cx - wash.rx,
          top: wash.cy - wash.ry,
          width: wash.rx * 2,
          height: wash.ry * 2
        },
        localPoints: null
      };
    },
    isDestroyed: () => false,
    onHit: (object) => hits.push(object),
    beginNodeDrag: (nodeId, point) => {
      activeNodeId = nodeId;
      dragCalls.push(`begin:${nodeId}:${point.x},${point.y}`);
    },
    moveNodeDrag: (point) => {
      dragCalls.push(`move:${point.x},${point.y}`);
    },
    commitNodeDrag: (point) => {
      activeNodeId = null;
      dragCalls.push(`commit:${point?.x ?? "null"},${point?.y ?? "null"}`);
    },
    cancelNodeDrag: () => {
      activeNodeId = null;
      dragCalls.push("cancel");
    },
    screenPointFromEvent: (event) => ({ x: event.clientX, y: event.clientY }),
    consumeSuppressedNodeClick: () => false,
    activeNodeDragId: () => activeNodeId
  });
  return {
    controller,
    document,
    overlayRoot,
    hits,
    dragCalls,
    adapterData: () => adapterData,
    setAdapterData: (next: GraphRendererAdapterData) => {
      adapterData = next;
    },
    setSigma: (next: SigmaGlobalSigmaLike) => {
      sigma = next;
    },
    cloudCalls: () => cloudCalls,
    resetCloudCalls: () => {
      cloudCalls = 0;
    }
  };
}

function adapterDataFixture(options: {
  nodes?: ReturnType<typeof nodeFixture>[];
  communities?: ReturnType<typeof communityFixture>[];
  selectionInput?: GraphRendererAdapterData["selection"]["input"];
} = {}): GraphRendererAdapterData {
  const nodes = options.nodes ?? [
    nodeFixture("alpha", { selected: true }),
    nodeFixture("beta", { searchHit: true, pinned: true })
  ];
  const communities = options.communities ?? [communityFixture("community-a", { selected: true })];
  const selectedNodeIds = nodes.filter((node) => node.selected).map((node) => node.id);
  return {
    counts: {
      nodes: nodes.length,
      edges: 0,
      communities: communities.length,
      hidden: 0,
      renderedNodes: nodes.length,
      renderedEdges: 0,
      aggregationContainers: 0
    },
    selection: {
      input: options.selectionInput ?? { kind: "node", id: selectedNodeIds[0] ?? nodes[0]?.id ?? "none" },
      selectionId: "test-selection",
      selectedNodeIds,
      selectedCommunityIds: communities.filter((community) => community.selected).map((community) => community.id),
      containsCurrentObject: selectedNodeIds.length > 0
    },
    nodes,
    edges: [],
    communities: communities.map((community) => ({
      id: community.id,
      object: { kind: "community", communityId: community.id },
      label: community.label,
      nodeIds: nodes.filter((node) => node.communityId === community.id).map((node) => node.id),
      nodeCount: community.nodeCount,
      selected: community.selected,
      searchResultIds: nodes.filter((node) => node.searchHit).map((node) => node.id),
      pinHints: [],
      aggregationIds: [],
      drawerTarget: {
        summaryKind: "community-summary",
        object: { kind: "community", communityId: community.id }
      },
      commands: []
    })),
    aggregations: [],
    renderable: {
      nodes: [],
      edges: [],
      communities,
      aggregationContainers: [],
      minimap: { path: "", nodes: [] },
      relationLegend: [],
      selectedNodeId: selectedNodeIds[0] ?? null,
      selectedCommunityId: communities.find((community) => community.selected)?.id ?? null,
      selectedNodeIds,
      hiddenNodeIds: new Set(),
      searchResultIds: nodes.filter((node) => node.searchHit).map((node) => node.id),
      worldBounds: { minX: 0, maxX: 500, minY: 0, maxY: 500 },
      budgets: {
        limits: {
          maxNodes: nodes.length,
          maxEdges: 0,
          maxLabels: 8,
          maxCards: 0,
          maxInteractionUpdates: nodes.length,
          maxVisibleCommunities: communities.length
        },
        usage: {
          nodes: nodes.length,
          edges: 0,
          labels: Math.min(communities.length, 8),
          cards: 0,
          interactionUpdate: nodes.length,
          activeInteraction: nodes.length,
          communities: communities.length,
          aggregationContainers: 0
        }
      },
      qualityNotice: null,
      communityFocus: null,
      communityQuality: {
        boundaryCertainty: "high",
        skeletonLabel: "stable",
        hiddenNodeCount: 0,
        hiddenEdgeCount: 0,
        stableCoreNodeIds: [],
        stableSkeletonEdgeIds: [],
        temporaryBoostNodeIds: []
      }
    }
  } as GraphRendererAdapterData;
}

function nodeFixture(id: string, options: {
  selected?: boolean;
  searchHit?: boolean;
  pinned?: boolean;
  communityId?: string;
} = {}) {
  const index = Number(id.match(/\d+$/)?.[0] ?? 1);
  return {
    id,
    object: { kind: "node" as const, nodeId: id },
    label: `Node ${id}`,
    type: "topic",
    communityId: options.communityId ?? "community-a",
    sourcePath: `${id}.md`,
    point: { x: 40 + index, y: 80 + index },
    selected: options.selected ?? false,
    searchHit: options.searchHit ?? false,
    pinHint: {
      nodeId: id,
      wikiPath: `${id}.md`,
      pinned: options.pinned ?? false,
      position: options.pinned ? { x: 40 + index, y: 80 + index, coordinateSpace: "world" as const } : null
    },
    aggregationIds: [],
    drawerTarget: {
      summaryKind: "node-summary" as const,
      object: { kind: "node" as const, nodeId: id }
    },
    render: {
      displayMode: "point",
      visualRole: "landmark",
      priority: options.selected ? 1000 : 100,
      labelVisible: Boolean(options.selected)
    }
  };
}

function communityFixture(id: string, options: { selected?: boolean; nodeCount?: number } = {}) {
  const index = Number(id.match(/\d+$/)?.[0] ?? 1);
  return {
    id,
    role: "community-wash" as const,
    label: `Community ${id}`,
    nodeIds: [],
    nodeCount: options.nodeCount ?? index,
    selected: options.selected ?? false,
    searchResultIds: [],
    pinnedNodeIds: [],
    aggregationIds: [],
    x: 100 + index,
    y: 120 + index,
    radius: 40,
    color: "#123456",
    wash: { cx: 100 + index, cy: 120 + index, rx: 32, ry: 24 }
  };
}

function sigmaIdentity(): SigmaGlobalSigmaLike {
  return {
    graphToViewport: (point) => ({ x: point.x, y: point.y })
  };
}

function sigmaTransform(input: { scale: number; translateX: number; translateY: number }): SigmaGlobalSigmaLike {
  return {
    graphToViewport: (point) => ({
      x: point.x * input.scale + input.translateX,
      y: point.y * input.scale + input.translateY
    })
  };
}

function nodeTarget(root: FakeElement, nodeId: string): FakeElement | undefined {
  return root.children.find((child) => child.dataset.nodeId === nodeId);
}

function communityRegion(root: FakeElement, communityId: string): FakeElement | undefined {
  return root.children.find((child) => child.className === "sigma-global-community-region" && child.dataset.communityId === communityId);
}

function communityLabel(root: FakeElement, communityId: string): FakeElement | undefined {
  return root.children.find((child) => child.className === "sigma-global-community-label" && child.dataset.communityId === communityId);
}

function communityShape(root: FakeElement, communityId: string): FakeElement | undefined {
  return communityRegion(root, communityId)?.children[0]?.children[0];
}

class FakeDocument {
  readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  readonly defaultView: { PointerEvent?: unknown };
  created = 0;

  constructor(pointerEvents: boolean) {
    this.defaultView = pointerEvents ? { PointerEvent: class PointerEvent {} } : {};
  }

  createElement(tagName: string): FakeElement {
    this.created += 1;
    return new FakeElement(tagName, this);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    this.created += 1;
    return new FakeElement(tagName, this);
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: FakeEvent) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener));
  }

  dispatch(type: string, init: Partial<FakeEvent> = {}): FakeEvent {
    const event = new FakeEvent(type, init);
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
    return event;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  readonly style: Record<string, string> = {};
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  className = "";
  textContent = "";
  tabIndex = 0;
  type = "";
  replaceCount = 0;
  parentElement: FakeElement | null = null;

  constructor(readonly tagName: string, readonly ownerDocument: FakeDocument) {}

  append(...children: FakeElement[]): void {
    for (const child of children) {
      child.parentElement = this;
      this.children.push(child);
    }
  }

  replaceChildren(...children: FakeElement[]): void {
    this.replaceCount += 1;
    this.children.splice(0, this.children.length);
    this.append(...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: FakeEvent) => void): void {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener));
  }

  dispatch(type: string, init: Partial<FakeEvent> = {}): FakeEvent {
    const event = new FakeEvent(type, { ...init, target: this });
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
    return event;
  }

  dispatchEvent(event: FakeEvent): boolean {
    for (const listener of [...(this.listeners.get(event.type) ?? [])]) {
      listener(event);
    }
    return !event.defaultPrevented;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.length ?? 0;
  }

  setPointerCapture(): void {}

  releasePointerCapture(): void {}
}

class FakeEvent {
  readonly type: string;
  button = 0;
  pointerId = 1;
  clientX = 0;
  clientY = 0;
  target: unknown = null;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(type: string, init: Partial<FakeEvent> = {}) {
    this.type = type;
    Object.assign(this, init);
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createCommunityWashElement } from "../src/render/community-washes";
import { createCommunityLegend, createGraphToolbar, createSearchControl } from "../src/render/controls";
import { createGraphEdgeElement } from "../src/render/edges";
import { createGraphMinimap } from "../src/render/minimap";
import { createGraphNodeElement } from "../src/render/nodes";
import type { RenderableCommunity, RenderableEdge, RenderableMinimap, RenderableNode } from "../src/render";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "src");

const HOST_CALLBACK_IDENTIFIERS = [
  "onOpenPage",
  "onSelectionChange",
  "onSelectionClear",
  "onAsk",
  "persistPins",
  "onDragStateChange",
  "GraphEngineCapabilities",
  "GraphOpenPagePayload"
];

const HOST_CALLBACK_ALLOWED_FILES = new Set(["facade.ts", "types.ts"]);
const RAW_GRAPH_EVENT_ALLOWED_FILES = new Set([
  "render/gestures.ts",
  "render/sigma-global-drag.ts"
]);
const RAW_GRAPH_EVENT_PATTERNS = [
  /\baddEventListener\s*\(\s*["'](?:wheel|pointerdown|pointermove|pointerup|pointercancel|lostpointercapture)["']/,
  /\bremoveEventListener\s*\(\s*["'](?:wheel|pointerdown|pointermove|pointerup|pointercancel|lostpointercapture)["']/,
  /\bsetPointerCapture\s*\(/,
  /\breleasePointerCapture\s*\(/,
  /\bclassifyGraph(?:EventTarget|WheelTarget|WheelTargetFromGraphTarget|PointerDownTarget|PointerDownTargetFromGraphTarget)\s*\(/
];
const SIGMA_RENDERER_FORBIDDEN_RAW_GRAPH_EVENT_PATTERNS = [
  /\baddEventListener\s*\(\s*["'](?:wheel|pointermove|pointerup|pointercancel|lostpointercapture)["']/,
  /\bremoveEventListener\s*\(\s*["'](?:wheel|pointerdown|pointermove|pointerup|pointercancel|lostpointercapture)["']/,
  /\bsetPointerCapture(?:\?\.)?\s*\(/,
  /\breleasePointerCapture(?:\?\.)?\s*\(/
];
const DRAWING_MODULES = [
  "render/nodes.ts",
  "render/edges.ts",
  "render/community-washes.ts",
  "render/minimap.ts",
  "render/overlays.ts",
  "render/hover-card.ts"
] as const;
const FORBIDDEN_RENDERER_EVENT_TYPES = new Set([
  "wheel",
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "lostpointercapture"
]);
const CONTROLLER_FORBIDDEN_PATTERNS = [
  /\bcreateGraphNodeElement\b/,
  /\bcreateGraphEdgeElement\b/,
  /\bcreateCommunityWashElement\b/,
  /\bcreateGraphMinimap\b/,
  /\bbuildRenderableGraph\b/,
  /\bpaint\s*\(/,
  /\bmount(?:SearchControl|GraphToolbar|CommunityLegend)\s*\(/
];
const RENDER_ONLY_STATE_MUTATION_PATTERNS = [
  /\bsetSelection\s*\(/,
  /\bsetFocus\s*\(/,
  /\bsetPins\s*\(/
];
const PIPELINE_FORBIDDEN_STATE_MUTATION_PATTERNS = [
  ...RENDER_ONLY_STATE_MUTATION_PATTERNS,
  /\bsetHover\s*\(/
];

describe("renderer and facade boundary contract", () => {
  it("keeps host callback names out of layout and renderer modules", async () => {
    const files = await sourceFiles(SRC);
    const violations: string[] = [];

    for (const file of files) {
      const rel = relative(SRC, file);
      if (HOST_CALLBACK_ALLOWED_FILES.has(rel)) continue;
      const text = await readFile(file, "utf8");
      for (const identifier of HOST_CALLBACK_IDENTIFIERS) {
        if (new RegExp(`\\b${identifier}\\b`).test(text)) violations.push(`${rel}: ${identifier}`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it("keeps graph object hit classification calls inside GraphGestures", async () => {
    const renderFiles = (await sourceFiles(join(SRC, "render")))
      .filter((file) => {
        const rel = relative(SRC, file);
        return rel !== "render/gestures.ts" && rel !== "render/index.ts";
      });
    const violations: string[] = [];
    const forbiddenCalls = /\bclassifyGraph(?:EventTarget|WheelTarget|WheelTargetFromGraphTarget|PointerDownTarget|PointerDownTargetFromGraphTarget)\s*\(/;

    for (const file of renderFiles) {
      const rel = relative(SRC, file);
      const text = await readFile(file, "utf8");
      if (forbiddenCalls.test(text)) violations.push(rel);
    }

    assert.deepEqual(violations, []);
  });

  it("keeps raw graph gesture ownership out of drawing modules", async () => {
    const violations: string[] = [];

    for (const rel of DRAWING_MODULES) {
      const text = await readFile(join(SRC, rel), "utf8");
      for (const pattern of RAW_GRAPH_EVENT_PATTERNS) {
        if (pattern.test(text)) violations.push(`${rel}: ${pattern}`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it("keeps root graph wheel and pointer bindings inside GraphGestures", async () => {
    const renderFiles = await sourceFiles(join(SRC, "render"));
    const violations: string[] = [];

    for (const file of renderFiles) {
      const rel = relative(SRC, file);
      if (RAW_GRAPH_EVENT_ALLOWED_FILES.has(rel)) continue;
      const text = await readFile(file, "utf8");
      const patterns = rel === "render/sigma-global-renderer.ts"
        ? SIGMA_RENDERER_FORBIDDEN_RAW_GRAPH_EVENT_PATTERNS
        : RAW_GRAPH_EVENT_PATTERNS;
      for (const pattern of patterns) {
        if (pattern.test(text)) violations.push(`${rel}: ${pattern}`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it("keeps Sigma raw pointer exceptions limited to node overlay drag", async () => {
    const sigmaRendererText = await readFile(join(SRC, "render/sigma-global-renderer.ts"), "utf8");
    const sigmaDragText = await readFile(join(SRC, "render/sigma-global-drag.ts"), "utf8");

    assert.equal(/\baddEventListener\s*\(\s*["']wheel["']/.test(sigmaRendererText), false);
    assert.equal(/\baddEventListener\s*\(\s*["']wheel["']/.test(sigmaDragText), false);
    assert.match(sigmaRendererText, /className = "sigma-global-node-hit-target"/);
    assert.match(sigmaRendererText, /\baddEventListener\s*\(\s*"pointerdown"/);
    assert.equal(/\baddEventListener\s*\(\s*["'](?:pointermove|pointerup|pointercancel|lostpointercapture)["']/.test(sigmaRendererText), false);
    assert.equal(/\bremoveEventListener\s*\(\s*["'](?:pointermove|pointerup|pointercancel|lostpointercapture)["']/.test(sigmaRendererText), false);
    assert.equal(/\bsetPointerCapture(?:\?\.)?\s*\(/.test(sigmaRendererText), false);
    assert.equal(/\breleasePointerCapture(?:\?\.)?\s*\(/.test(sigmaRendererText), false);
    assert.match(sigmaDragText, /\bbindSigmaGlobalOverlayPointerDrag\b/);
    assert.match(sigmaDragText, /\bsetPointerCapture(?:\?\.)?\s*\(/);
    assert.match(sigmaDragText, /\baddEventListener\s*\(\s*"pointermove"/);
    assert.match(sigmaDragText, /\bremoveEventListener\s*\(\s*"pointermove"/);
    assert.match(sigmaDragText, /\breleasePointerCapture(?:\?\.)?\s*\(/);
  });

  it("keeps blank double-click ownership out of the graph renderer root", async () => {
    const rendererText = await readFile(join(SRC, "render/graph-renderer-root.ts"), "utf8");

    assert.equal(/\baddEventListener\s*\(\s*["']dblclick["']/.test(rendererText), false);
    assert.equal(/\bremoveEventListener\s*\(\s*["']dblclick["']/.test(rendererText), false);
  });

  it("keeps browser pointer coordinate normalization inside GraphGestures", async () => {
    const rendererText = await readFile(join(SRC, "render/graph-renderer-root.ts"), "utf8");
    const gestureText = await readFile(join(SRC, "render/gestures.ts"), "utf8");

    assert.equal(/\brootClientPointToScreenPoint\b/.test(rendererText), false);
    assert.equal(/\bclient[XY]\b/.test(rendererText), false);
    assert.equal(/\brootClientPointToScreenPoint\b/.test(gestureText), true);
  });

  it("proves drawing modules do not attach global graph gesture listeners at runtime", () => {
    const ownerDocument = new FakeDocument();

    createGraphNodeElement(ownerDocument as unknown as Document, sampleNode(), {
      onNodeClick: () => {},
      onNodeDoubleClick: () => false,
      onNodePreviewEnter: () => {},
      onNodePreviewLeave: () => {}
    });
    createGraphEdgeElement(ownerDocument as unknown as Document, sampleEdge(), {
      onEdgePreviewEnter: () => {},
      onEdgePreviewLeave: () => {}
    });
    createCommunityWashElement(ownerDocument as unknown as Document, sampleCommunity());
    createGraphMinimap(ownerDocument as unknown as Document, sampleMinimap());

    assert.deepEqual(ownerDocument.forbiddenListeners, []);
  });

  it("keeps controller out of drawing and render-model ownership", async () => {
    const controllerText = await readFile(join(SRC, "render/controller.ts"), "utf8");
    const violations = CONTROLLER_FORBIDDEN_PATTERNS
      .filter((pattern) => pattern.test(controllerText))
      .map(String);

    assert.deepEqual(violations, []);
  });

  it("routes controller node DOM focus and class commands through the renderer surface", async () => {
    const controllerText = await readFile(join(SRC, "render/controller.ts"), "utf8");
    const surfaceText = await readFile(join(SRC, "render/renderer-surface.ts"), "utf8");

    assert.doesNotMatch(
      controllerText,
      /context\.dom\.(?:nodeElements|edgeElements|aggregationContainerElements).*?\.(?:focus|classList)/
    );
    assert.match(controllerText, /context\.rendererSurface\.focusNode\(/);
    assert.match(controllerText, /context\.rendererSurface\.setNodeDragging\(/);
    assert.match(controllerText, /context\.rendererSurface\.clearNodeDragging\(/);
    assert.match(surfaceText, /focusNode\(id/);
    assert.match(surfaceText, /setNodeDragging\(id/);
  });

  it("keeps route transition CSS attached to the stable facade route marker", async () => {
    const stylesText = await readFile(join(SRC, "render/render-styles.ts"), "utf8");

    assert.equal(stylesText.includes("[data-llm-wiki-graph-route-transition] > .sigma-global-route"), true);
    assert.equal(stylesText.includes("[data-llm-wiki-graph-route-transition] > [data-llm-wiki-graph-root=\"true\"]"), true);
    assert.equal(stylesText.includes("[data-llm-wiki-graph-route-transition] > .graph-over-limit-notice-view"), true);
    assert.equal(stylesText.includes(".llm-wiki-graph-engine[data-llm-wiki-graph-route-transition]"), false);
  });

  it("keeps pipeline and presenter out of semantic selection/focus/pin ownership", async () => {
    const files: Array<[string, RegExp[]]> = [
      ["render/render-pipeline.ts", PIPELINE_FORBIDDEN_STATE_MUTATION_PATTERNS],
      ["render/overlays-presenter.ts", RENDER_ONLY_STATE_MUTATION_PATTERNS]
    ];
    const violations: string[] = [];

    for (const [rel, patterns] of files) {
      const text = await readFile(join(SRC, rel), "utf8");
      for (const pattern of patterns) {
        if (pattern.test(text)) violations.push(`${rel}: ${pattern}`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it("routes mounted control callbacks through injected graph commands", () => {
    const ownerDocument = new FakeDocument();
    const calls: string[] = [];

    const search = createSearchControl(ownerDocument as unknown as Document, {
      open: false,
      query: "",
      onOpen: () => calls.push("openSearch"),
      onQuery: (query) => calls.push(`query:${query}`),
      onNext: () => calls.push("nextSearch"),
      onPrevious: () => calls.push("previousSearch"),
      onActivate: () => calls.push("activateSearch"),
      onClose: () => calls.push("closeSearch")
    });
    search.input.value = "atlas";
    (search.input as unknown as FakeElement).dispatch("focus");
    (search.input as unknown as FakeElement).dispatch("input");
    (search.input as unknown as FakeElement).dispatch("keydown", { key: "ArrowDown" });
    (search.input as unknown as FakeElement).dispatch("keydown", { key: "ArrowUp" });
    (search.input as unknown as FakeElement).dispatch("keydown", { key: "Enter" });
    (search.input as unknown as FakeElement).dispatch("keydown", { key: "Escape" });

    const toolbar = createGraphToolbar(ownerDocument as unknown as Document, {
      panelState: "closed",
      typeFilters: { topic: true },
      onPanelToggle: (panel) => calls.push(`panel:${panel}`),
      onTypeFilterToggle: (type, enabled) => calls.push(`filter:${type}:${enabled}`),
      onReset: () => calls.push("requestGlobalReset")
    });
    const toolbarButtons = findByClass(toolbar.element as unknown as FakeElement, "graph-toolbar-button");
    toolbarButtons[0]?.dispatch("click");
    toolbarButtons[2]?.dispatch("click");
    const filterInput = findByTag(toolbar.element as unknown as FakeElement, "input")[0];
    if (filterInput) {
      filterInput.checked = false;
      filterInput.dispatch("change");
    }

    const legend = createCommunityLegend(ownerDocument as unknown as Document, {
      rows: [{ id: "community-a", label: "Community A", color: "#c66", pageCount: 2, nodeIds: ["node-a"] }],
      collapsed: false,
      onToggle: () => calls.push("toggleLegend"),
      onHover: (id) => calls.push(`hover:${id ?? "none"}`),
      onSelect: (id) => calls.push(`selectCommunity:${id}`)
    });
    const legendToggle = findByClass(legend.element as unknown as FakeElement, "community-legend-toggle")[0];
    legendToggle?.dispatch("click");
    const legendRow = legend.rows.get("community-a") as unknown as FakeElement | undefined;
    legendRow?.dispatch("pointerenter");
    legendRow?.dispatch("pointerleave");
    legendRow?.dispatch("click");

    assert.deepEqual(calls, [
      "openSearch",
      "query:atlas",
      "nextSearch",
      "previousSearch",
      "activateSearch",
      "closeSearch",
      "panel:filters",
      "requestGlobalReset",
      "filter:topic:false",
      "toggleLegend",
      "hover:community-a",
      "hover:none",
      "selectCommunity:community-a"
    ]);
  });

  it("keeps mounted control wiring on injected graph commands", async () => {
    const pipelineText = await readFile(join(SRC, "render/render-pipeline.ts"), "utf8");

    assert.doesNotMatch(pipelineText, /from\s+["']\.\/controller["']/);
    assertSourceContainsAll(pipelineText, [
      "options.commands.openSearch()",
      "options.commands.applySearchQuery(query)",
      "options.commands.focusNextSearchResult()",
      "options.commands.focusPreviousSearchResult()",
      "options.commands.activateSearchResult()",
      "options.commands.closeSearch()",
      "options.commands.setCommunityHover(id)",
      "options.commands.selectCommunity(id)",
      "applyTypeFilters({ ...context.typeFilters, [type]: enabled })",
      "options.commands.requestGlobalReset()"
    ]);
    assert.doesNotMatch(pipelineText, /onReset:[\s\S]{0,160}resetViewState\(\)/);
  });

  it("routes controller-owned return-global entries through the global reset command with DOM fallback", async () => {
    const rootText = await readFile(join(SRC, "render/graph-renderer-root.ts"), "utf8");
    const controllerText = await readFile(join(SRC, "render/controller.ts"), "utf8");

    assertSourceContainsAll(rootText, [
      "requestGlobalReset:",
      "context.callbacks.onGlobalResetRequested",
      "controller.resetViewState()"
    ]);
    assertSourceContainsAll(controllerText, [
      "onBlankDoubleClick:",
      "requestGlobalReset()",
      "function requestGlobalReset(): void"
    ]);
  });

  it("keeps DOM/SVG graph drawing behind the dom-svg renderer boundary", async () => {
    const pipelineText = await readFile(join(SRC, "render/render-pipeline.ts"), "utf8");
    const domSvgText = await readFile(join(SRC, "render/dom-svg-renderer.ts"), "utf8");

    assert.match(pipelineText, /paintDomSvgGraph\(\{/);
    assert.doesNotMatch(pipelineText, /\bcreateGraphNodeElement\b/);
    assert.doesNotMatch(pipelineText, /\bcreateGraphEdgeElement\b/);
    assert.doesNotMatch(pipelineText, /\bcreateCommunityWashElement\b/);
    assert.doesNotMatch(pipelineText, /\bcreateGraphMinimap\b/);
    assert.match(domSvgText, /\bcreateGraphNodeElement\b/);
    assert.match(domSvgText, /\bcreateGraphEdgeElement\b/);
    assert.match(domSvgText, /\bcreateCommunityWashElement\b/);
    assert.match(domSvgText, /\bcreateGraphMinimap\b/);
  });

  it("keeps lifecycle teardown ownership explicit in the renderer root", async () => {
    const rootText = await readFile(join(SRC, "render/graph-renderer-root.ts"), "utf8");
    const pipelineText = await readFile(join(SRC, "render/render-pipeline.ts"), "utf8");
    const presenterText = await readFile(join(SRC, "render/overlays-presenter.ts"), "utf8");

    assert.match(rootText, /if \(context\.destroyed\) return;/);
    assert.match(rootText, /pipeline\.destroy\(\);/);
    assert.match(rootText, /presenter\.destroy\(\);/);
    assert.match(rootText, /removeEventListener\("scroll", pipeline\.resetRootScroll\)/);
    assert.match(rootText, /removeEventListener\("keydown", controller\.handleDocumentKeydown\)/);
    assert.match(rootText, /context\.gestureController\?\.destroy\(\);/);
    assert.match(rootText, /context\.pathCache\.clear\(\);/);
    assert.match(pipelineText, /context\.simulation\?\.destroy\(\);/);
    assert.match(pipelineText, /context\.resizeObserver\?\.disconnect\(\);/);
    assert.match(pipelineText, /clearTimeout\(context\.viewportAnimationTimer\)/);
    assert.match(presenterText, /clearTimeout\(context\.previewTimer\)/);
    assert.match(presenterText, /context\.previewTimer = null;/);
  });

  it("keeps async diff settlement guarded after destroy", async () => {
    const pipelineText = await readFile(join(SRC, "render/render-pipeline.ts"), "utf8");

    assert.match(pipelineText, /if \(context\.destroyed\) return;/);
    assert.match(pipelineText, /const diffEpoch = \+\+context\.renderEpoch;/);
    assert.match(pipelineText, /context\.renderEpoch === diffEpoch/);
  });
});

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  }));
  return files.flat();
}

function assertSourceContainsAll(source: string, expectedSnippets: string[]): void {
  const missing = expectedSnippets.filter((snippet) => !source.includes(snippet));
  assert.deepEqual(missing, []);
}

function sampleNode(): RenderableNode {
  return {
    id: "node-a",
    label: "Node A",
    type: "topic",
    kind: "TOPIC",
    community: "community-a",
    sourcePath: "wiki/node-a.md",
    x: 50,
    y: 40,
    point: { x: 500, y: 272 },
    displayMode: "card",
    visualRole: "landmark",
    priority: 80,
    weight: 80,
    unavailable: false,
    selected: false,
    startNode: false,
    previewStart: false,
    labelVisible: true
  };
}

function sampleEdge(): RenderableEdge {
  return {
    id: "edge-a",
    source: "node-a",
    target: "node-b",
    type: "extracted",
    confidence: "extracted",
    relationType: "实现",
    relationClass: "relation-implementation",
    path: "M 0 0 Q 50 50 100 100",
    curveOffset: 0,
    strokeWidth: 1.5,
    opacity: 0.8,
    simulationWeight: 1
  };
}

function sampleCommunity(): RenderableCommunity {
  return {
    id: "community-a",
    label: "Community A",
    color: "#c66",
    nodeCount: 3,
    wash: {
      cx: 500,
      cy: 272,
      rx: 120,
      ry: 80,
      opacity: 0.18
    }
  };
}

function sampleMinimap(): RenderableMinimap {
  return {
    path: "M0 0 L100 20",
    nodes: [{ id: "node-a", x: 10, y: 12, r: 3, fill: "#c66", selected: false }]
  };
}

class FakeDocument {
  readonly forbiddenListeners: string[] = [];

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }
}

class FakeElement {
  readonly children: FakeElement[] = [];
  private readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  readonly dataset: Record<string, string | undefined> = {};
  readonly style: Record<string, string> = {};
  readonly classList = {
    add: (...classNames: string[]) => {
      this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...classNames])].join(" ");
    },
    toggle: (className: string, force?: boolean) => {
      const classNames = new Set(this.className.split(/\s+/).filter(Boolean));
      const shouldAdd = force ?? !classNames.has(className);
      if (shouldAdd) classNames.add(className);
      else classNames.delete(className);
      this.className = [...classNames].join(" ");
    }
  };
  className = "";
  textContent = "";
  type = "";
  title = "";
  href = "";
  innerHTML = "";
  checked = false;
  value = "";

  constructor(readonly tagName: string, private readonly ownerDocument: FakeDocument) {}

  append(...children: Array<FakeElement | string>): void {
    for (const child of children) {
      if (typeof child === "string") {
        this.textContent += child;
      } else {
        this.children.push(child);
      }
    }
  }

  appendChild(child: FakeElement): FakeElement {
    this.children.push(child);
    return child;
  }

  setAttribute(name: string, value: string): void {
    if (name === "class") this.className = value;
    else if (name === "href") this.href = value;
    else (this as unknown as Record<string, string>)[name] = value;
  }

  addEventListener(type: string, listener: unknown): void {
    if (FORBIDDEN_RENDERER_EVENT_TYPES.has(type)) {
      this.ownerDocument.forbiddenListeners.push(`${this.tagName}:${type}`);
    }
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener as (event: FakeEvent) => void);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, init: Record<string, unknown> = {}): void {
    const event = new FakeEvent(type, init);
    for (const listener of this.listeners.get(type) || []) {
      listener(event);
    }
  }
}

class FakeEvent {
  readonly type: string;
  readonly key?: string;
  defaultPrevented = false;
  propagationStopped = false;

  constructor(type: string, init: Record<string, unknown>) {
    this.type = type;
    if (typeof init.key === "string") this.key = init.key;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }

  stopPropagation(): void {
    this.propagationStopped = true;
  }
}

function findByClass(root: FakeElement, className: string): FakeElement[] {
  const matches: FakeElement[] = [];
  const classes = new Set(root.className.split(/\s+/).filter(Boolean));
  if (classes.has(className)) matches.push(root);
  for (const child of root.children) {
    matches.push(...findByClass(child, className));
  }
  return matches;
}

function findByTag(root: FakeElement, tagName: string): FakeElement[] {
  const matches: FakeElement[] = [];
  if (root.tagName === tagName) matches.push(root);
  for (const child of root.children) {
    matches.push(...findByTag(child, tagName));
  }
  return matches;
}

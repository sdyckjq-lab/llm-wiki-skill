import type {
  CommunityId,
  GraphAggregationMarker,
  GraphFocusInput,
  GraphSummaryObjectRef,
  GraphTypeFilters,
  GraphData,
  GraphDiff,
  NodeId,
  PinMap,
  SelectionInput,
  ThemeId,
  WikiPath
} from "../types";
import { PinState } from "../sim";
import {
  buildRenderableGraph,
  createRenderPathCache,
  type RenderableGraph
} from "./model";
import {
  DEFAULT_RENDERER_VIEWPORT,
  createViewportFrameCommitter
} from "./viewport";
import { createGraphRuntimeState } from "./state";
import { createGraphRootElement } from "./host-dom";
import { createGraphHitTargetResolver } from "./hit-testing";
import {
  GraphGestureStateMachine
} from "./gestures";
import { readToolbarPanelState } from "./toolbar";
import type { GraphRenderContext, GraphRendererCallbacks } from "./render-context";
import { createGraphController, type GraphController } from "./controller";
import {
  createGraphRenderPipeline,
  emptyPaintedDom,
  initialViewportSize,
  positionsFromRenderableGraph,
  readLegendCollapsed,
  type GraphRenderPipeline
} from "./render-pipeline";
import { createGraphOverlaysPresenter, type GraphOverlaysPresenter } from "./overlays-presenter";
import { createDomSvgRendererSurface } from "./renderer-surface";

// 聚焦单个社区时，子集包围盒常很小；用默认 4× fit 会把少量节点放大成糊屏巨卡。
// 聚焦 fit 限制到适度放大，让节点保持可读、社区居中留白（镜头推进而非贴脸）。
// 大社区包围盒大、fit 算出的 scale 本就 < 此上限，不受影响。
const FOCUS_FIT_MAX_SCALE = 1.5;

export interface GraphRendererOptions {
  data: GraphData;
  pins?: PinMap;
  theme: ThemeId;
  onNodeOpen?: (nodeId: NodeId) => void;
  onSelectionInput?: (selection: SelectionInput) => void;
  onSelectionClearRequested?: () => void;
  onViewReset?: () => void;
  onGlobalResetRequested?: () => void;
  onPinsChanged?: (pins: PinMap) => void;
  onDragActiveChange?: (dragging: boolean) => void;
  onVisibilityStateChange?: GraphRendererCallbacks["onVisibilityStateChange"];
  toolbarContainer?: HTMLElement | null;
  focus?: GraphFocusInput;
  typeFilters?: GraphTypeFilters;
  aggregationMarkers?: GraphAggregationMarker[];
  searchQuery?: string;
  live?: boolean;
}

type RenderNextOptions = Partial<GraphRendererOptions> & {
  selectedNodeId?: string | null;
  selection?: SelectionInput | null;
};

export interface GraphRenderer {
  root: HTMLElement;
  graph: RenderableGraph;
  render(next?: RenderNextOptions): void;
  applyDiff(diff: GraphDiff, options?: { reducedMotion?: boolean; durationMs?: number }): Promise<void>;
  isDragging(): boolean;
  setData(data: GraphData, pins?: PinMap): void;
  setAggregationMarkers(markers: GraphAggregationMarker[]): void;
  setTheme(theme: ThemeId): void;
  setPins(pins: PinMap): void;
  focusNode(pathOrId: WikiPath): void;
  focusCommunity(id: CommunityId): void;
  setTypeFilters(filters: GraphTypeFilters): void;
  showTemporaryObject(object: GraphSummaryObjectRef): void;
  clearTemporaryObjectDisplay(): void;
  resetView(): void;
  select(selection: SelectionInput): void;
  previewNode(id: NodeId | null): void;
  clearSelection(): void;
  clearInteraction(): void;
  resetLayout(): void;
  setNodeFixed(id: NodeId, mode: "fix" | "unfix"): boolean;
  destroy(): void;
}

export function createGraphRenderer(container: HTMLElement, options: GraphRendererOptions): GraphRenderer {
  const initialPins = options.pins || {};
  const initialFocus = options.focus || null;
  const pathCache = createRenderPathCache();
  const root = createGraphRootElement(container);
  const toolbarContainer = options.toolbarContainer || root;
  const hasExternalToolbarContainer = toolbarContainer !== root;
  const ownerDocument = container.ownerDocument || document;
  let context: GraphRenderContext;
  let controller: GraphController;
  let pipeline: GraphRenderPipeline;
  let presenter: GraphOverlaysPresenter;
  const initialGraph = buildRenderableGraph(options.data, {
    pins: initialPins,
    theme: options.theme,
    selectedNodeId: null,
    selection: null,
    focus: initialFocus,
    typeFilters: {},
    pathCache,
    aggregationMarkers: options.aggregationMarkers
  });
  const runtimeState = createGraphRuntimeState({
    viewport: DEFAULT_RENDERER_VIEWPORT,
    positions: positionsFromRenderableGraph(initialGraph),
    pins: initialPins,
    selection: null,
    selectionSurface: null,
    focus: initialFocus
  });
  const hitTargetResolver = createGraphHitTargetResolver({
    graph: () => context.graph,
    viewport: () => context.runtimeState.snapshot().viewport,
    viewportSize: () => pipeline.viewportSize()
  });
  context = {
    data: options.data,
    theme: options.theme,
    destroyed: false,
    simulation: null,
    dom: emptyPaintedDom(),
    activeDiff: null,
    searchOpen: false,
    searchQuery: options.searchQuery || "",
    searchFocusedNodeId: null,
    typeFilters: options.typeFilters || {},
    aggregationMarkers: options.aggregationMarkers || [],
    baseTypeFilters: {},
    availableTypeFilters: {},
    temporaryObject: null,
    searchIndex: undefined,
    previewTimer: null,
    pathCache,
    root,
    rendererSurface: createDomSvgRendererSurface({
      root,
      dom: () => context.dom
    }),
    toolbarContainer,
    hasExternalToolbarContainer,
    ownerDocument,
    legendCollapsed: readLegendCollapsed(ownerDocument),
    toolbarPanelState: readToolbarPanelState(ownerDocument.defaultView?.localStorage),
    viewportCommitter: createViewportFrameCommitter((next, commitOptions) => {
      pipeline.commitViewport(next, commitOptions);
    }, root.ownerDocument.defaultView || undefined),
    gestureMachine: new GraphGestureStateMachine({ dragThreshold: 4 }),
    gestureController: null,
    viewportAnimationTimer: null,
    interactionDegradationTimer: null,
    lastEffectiveDensityMode: null,
    lastViewportSize: initialViewportSize(root),
    resizeObserver: null,
    graph: initialGraph,
    runtimeState,
    hitTargetResolver,
    pinState: new PinState(initialGraph, runtimeState.snapshot().pins),
    renderEpoch: 0,
    callbacks: {
      onNodeOpen: options.onNodeOpen,
      onSelectionInput: options.onSelectionInput,
      onSelectionClearRequested: options.onSelectionClearRequested,
      onViewReset: options.onViewReset,
      onGlobalResetRequested: options.onGlobalResetRequested,
      onPinsChanged: options.onPinsChanged,
      onDragActiveChange: options.onDragActiveChange,
      onVisibilityStateChange: options.onVisibilityStateChange
    }
  };
  presenter = createGraphOverlaysPresenter(context, {
    viewportSize: () => pipeline.viewportSize(),
    clearInteractionState: () => controller.clearInteractionState()
  });
  controller = createGraphController(context, {
    render,
    viewportSize: () => pipeline.viewportSize(),
    setViewportAnimating: (enabled) => pipeline.setViewportAnimating(enabled),
    setInteractionDegraded: (enabled, degradationOptions) => pipeline.setInteractionDegraded(enabled, degradationOptions),
    setGraphHover: (hover) => presenter.setGraphHover(hover),
    applyMotionFrame: (positions) => pipeline.applyMotionFrame(positions),
    markPinnedNodes: (pinnedNodeIds) => pipeline.markPinnedNodes(pinnedNodeIds),
    focusFitMaxScale: FOCUS_FIT_MAX_SCALE
  });
  pipeline = createGraphRenderPipeline(context, {
    hasHostReader: Boolean(context.callbacks.onNodeOpen),
    live: options.live !== false,
    commands: {
      render,
      resetViewState: () => controller.resetViewState(),
      requestGlobalReset: () => {
        if (context.callbacks.onGlobalResetRequested) {
          context.callbacks.onGlobalResetRequested();
          return;
        }
        controller.resetViewState();
      },
      openSearch: () => controller.openSearch(),
      applySearchQuery: (query) => controller.applySearchQuery(query),
      focusNextSearchResult: () => controller.focusNextSearchResult(),
      focusPreviousSearchResult: () => controller.focusPreviousSearchResult(),
      activateSearchResult: () => controller.activateSearchResult(),
      closeSearch: () => controller.closeSearch(),
      selectCommunity: (id) => controller.selectCommunity(id),
      selectAggregationContainer: (id) => {
        if (id) controller.selectCommunity(id);
      },
      setCommunityHover: (id) => controller.setCommunityHover(id),
      handleNodeClick: (id, additive) => controller.handleNodeClick(id, additive),
      handleNodeDoubleClick: (id) => controller.handleNodeDoubleClick(id),
      setNodeFixed: (id, mode) => controller.setNodeFixed(id, mode),
      scheduleHoverPreview: (id) => presenter.scheduleHoverPreview(id),
      showEdgeHoverPreview: (id) => presenter.showEdgeHoverPreview(id),
      clearHoverPreview: () => presenter.clearHoverPreview()
    },
    overlays: {
      renderReader: () => presenter.renderReader(),
      renderSelectionPanel: () => presenter.renderSelectionPanel(),
      renderHoverPreview: () => presenter.renderHoverPreview()
    }
  });
  context.root.addEventListener("scroll", pipeline.resetRootScroll, { passive: true });
  context.ownerDocument.addEventListener("keydown", controller.handleDocumentKeydown);
  context.gestureController = controller.bindViewportHandlers();
  pipeline.bindResizeObserver();

  function render(next: RenderNextOptions = {}): void {
    assertActive();
    context.renderEpoch += 1;
    pipeline.settleDiffElements();
    delete context.root.dataset.diffState;
    delete context.root.dataset.diffAddedNodes;
    delete context.root.dataset.diffAddedEdges;
    delete context.root.dataset.diffRemovedNodes;
    delete context.root.dataset.diffNewCommunities;
    delete context.root.dataset.diffReducedMotion;
    applyOptionChanges(next);
    pipeline.rebuildAndPaint();
  }

  function applyOptionChanges(next: RenderNextOptions): void {
    context.data = next.data || context.data;
    context.theme = next.theme || context.theme;
    if (Object.hasOwn(next, "typeFilters")) context.typeFilters = next.typeFilters || {};
    if (Object.hasOwn(next, "aggregationMarkers")) context.aggregationMarkers = next.aggregationMarkers || [];
    if (Object.hasOwn(next, "pins")) context.runtimeState.setPins(next.pins || {});
    if (Object.hasOwn(next, "focus")) context.runtimeState.setFocus(next.focus || null);
    if (Object.hasOwn(next, "selectedNodeId")) {
      const id = next.selectedNodeId || null;
      context.runtimeState.setSelection(id ? { kind: "node", id } : null, id ? "reader" : null);
    }
    if (Object.hasOwn(next, "selection")) {
      context.runtimeState.setSelection(next.selection || null, next.selection ? "selection-panel" : null);
    }
  }

  render();

  return {
    root: context.root,
    get graph() {
      return context.graph;
    },
    render,
    applyDiff(diff, animationOptions = {}): Promise<void> {
      assertActive();
      return pipeline.animateDiff(diff, animationOptions);
    },
    isDragging(): boolean {
      return context.runtimeState.snapshot().activeGesture?.kind === "node-drag";
    },
    setData(nextData: GraphData, nextPins?: PinMap): void {
      controller.clearTransientInteractionForDataRefresh();
      render({ data: nextData, pins: nextPins ?? context.runtimeState.snapshot().pins });
    },
    setAggregationMarkers(markers: GraphAggregationMarker[]): void {
      render({ aggregationMarkers: markers });
    },
    setTheme(nextTheme: ThemeId): void {
      render({ theme: nextTheme });
    },
    setPins(nextPins: PinMap): void {
      render({ pins: nextPins });
    },
    focusNode(pathOrId: WikiPath): void {
      const node = context.graph.nodes.find((item) => item.id === pathOrId || item.sourcePath === pathOrId);
      render({ selectedNodeId: node ? node.id : null });
      context.root.dataset.focus = pathOrId;
    },
    focusCommunity(id: CommunityId): void {
      controller.focusCommunity(id);
    },
    setTypeFilters(filters: GraphTypeFilters): void {
      pipeline.applyTypeFilters(filters);
    },
    showTemporaryObject(object: GraphSummaryObjectRef): void {
      pipeline.showTemporaryObject(object);
    },
    clearTemporaryObjectDisplay(): void {
      pipeline.clearTemporaryObjectDisplay();
    },
    resetView(): void {
      controller.resetViewState();
    },
    select(nextSelection: SelectionInput): void {
      render({ selection: nextSelection });
    },
    previewNode(id: NodeId | null): void {
      if (id) {
        presenter.setGraphHover({ kind: "node", id });
      } else {
        presenter.clearHoverPreview();
      }
      presenter.renderHoverPreview();
    },
    clearSelection(): void {
      controller.clearSelectionOnly();
    },
    clearInteraction(): void {
      controller.clearInteractionState();
    },
    resetLayout(): void {
      const nextState = context.pinState.reset();
      render({ pins: nextState.pins });
      context.callbacks.onPinsChanged?.(nextState.pins);
    },
    setNodeFixed(id: NodeId, mode: "fix" | "unfix"): boolean {
      return controller.setNodeFixed(id, mode);
    },
    destroy(): void {
      if (context.destroyed) return;
      context.destroyed = true;
      pipeline.destroy();
      presenter.destroy();
      context.root.removeEventListener("scroll", pipeline.resetRootScroll);
      context.ownerDocument.removeEventListener("keydown", controller.handleDocumentKeydown);
      context.gestureController?.destroy();
      context.gestureController = null;
      context.pathCache.clear();
      context.root.remove();
      if (context.hasExternalToolbarContainer && context.dom.toolbarElement && context.toolbarContainer.contains(context.dom.toolbarElement)) {
        context.toolbarContainer.replaceChildren();
      }
    }
  };

  function assertActive(): void {
    if (context.destroyed) throw new Error("Graph renderer has been destroyed");
  }
}

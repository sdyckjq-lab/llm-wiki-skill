import type {
  GraphNode,
  GraphDiff,
  GraphEngine,
  GraphEngineOptions,
  GraphData,
  GraphOpenPagePayload,
  GraphSummaryObjectRef,
  GraphSummaryOptions,
  GraphVisibilityState,
  PinMap,
  Selection,
  SelectionInput,
  ThemeId
} from "./types";
import {
  buildGraphRendererAdapterData,
  createGraphRenderer,
  type GraphRendererAdapterData,
  type GraphGestureTarget
} from "./render";
import {
  createSigmaGlobalRenderer,
  sigmaGlobalRendererRuntimeBoundary,
  type SigmaGlobalRendererRuntime
} from "./render/sigma-global-renderer";
import { buildCommunityLegend, nextToolbarPanelState, resolveGraphSearchState, readToolbarPanelState, writeToolbarPanelState } from "./render";
import { createCommunityLegend, createGraphToolbar, createSearchControl } from "./render/controls";
import { ensureGraphRendererStyles } from "./render/render-styles";
import { resolveSelectionForCapabilities } from "./select";
import { graphNodeTypeLabel, wikiPathForGraphNode } from "./graph-node";
import {
  summarizeExcludedGraphObject,
  summarizeGraphCommunity,
  summarizeGraphGlobal,
  summarizeGraphNode,
  summarizeGraphSearchResults,
  summarizeUnavailableGraphObject
} from "./summary";

export type GraphFacadeHostMode = "workbench" | "offline" | "standalone";

export interface GraphFacadeCapabilityContract {
  mode: GraphFacadeHostMode;
  capabilities: GraphEngineOptions["capabilities"];
}

export function createGraphWorkbenchCapabilities(
  capabilities: NonNullable<GraphEngineOptions["capabilities"]>
): GraphFacadeCapabilityContract {
  return {
    mode: "workbench",
    capabilities: {
      onOpenPage: capabilities.onOpenPage,
      onSelectionChange: capabilities.onSelectionChange,
      onSelectionClear: capabilities.onSelectionClear,
      onViewReset: capabilities.onViewReset,
      onAsk: capabilities.onAsk,
      persistPins: capabilities.persistPins,
      onDragStateChange: capabilities.onDragStateChange,
      onVisibilityStateChange: capabilities.onVisibilityStateChange
    }
  };
}

export function createGraphOfflineCapabilities(
  capabilities: Pick<NonNullable<GraphEngineOptions["capabilities"]>, "persistPins"> = {}
): GraphFacadeCapabilityContract {
  return {
    mode: "offline",
    capabilities: {
      persistPins: capabilities.persistPins
    }
  };
}

export function createGraphStandaloneCapabilities(): GraphFacadeCapabilityContract {
  return {
    mode: "standalone",
    capabilities: undefined
  };
}

export interface GraphFacadeRenderer {
  applyDiff(diff: GraphDiff, options?: { reducedMotion?: boolean; durationMs?: number }): Promise<void>;
  isDragging(): boolean;
  setData(data: GraphEngineOptions["data"], pins?: GraphEngineOptions["pins"]): void;
  setAggregationMarkers(markers: NonNullable<GraphEngineOptions["aggregationMarkers"]>): void;
  focusNode(path: string): void;
  focusCommunity(id: string): void;
  setTypeFilters(filters: NonNullable<GraphEngineOptions["typeFilters"]>): void;
  showTemporaryObject(object: GraphSummaryObjectRef): void;
  clearTemporaryObjectDisplay(): void;
  resetView(): void;
  select(selection: SelectionInput): void;
  previewNode(id: string | null): void;
  clearSelection(): void;
  clearInteraction(): void;
  setNodeFixed(id: string, mode: "fix" | "unfix"): boolean;
  setTheme(theme: ThemeId): void;
  setPins(pins: NonNullable<GraphEngineOptions["pins"]>): void;
  resetLayout(): void;
  destroy(): void;
}

export type GraphFacadeRendererRouteId =
  | "sigma-global"
  | "dom-svg-community"
  | "dom-svg-small-fallback"
  | "over-limit-notice";

export const GRAPH_FACADE_GLOBAL_NODE_LIMIT = 2000;

export const GRAPH_FACADE_SIGMA_FALLBACK_THRESHOLDS = {
  maxDomSvgFallbackNodes: GRAPH_FACADE_GLOBAL_NODE_LIMIT,
  maxDomSvgFallbackEdges: 4000,
  maxDomSvgFallbackCommunitySize: 500
} as const;

const GRAPH_FACADE_ROUTE_TRANSITION_MS = 160;

export interface GraphFacadeRouteManager extends GraphFacadeRenderer {
  readonly routeId: GraphFacadeRendererRouteId;
  readonly sigmaKnownUnavailable: boolean;
  readonly sigmaAttemptCount: number;
  retrySigma(): void;
}

export interface GraphFacadeRouteRendererOptions {
  data: GraphData;
  pins: NonNullable<GraphEngineOptions["pins"]>;
  theme: ThemeId;
  focus: GraphEngineOptions["focus"];
  typeFilters: NonNullable<GraphEngineOptions["typeFilters"]>;
  aggregationMarkers: NonNullable<GraphEngineOptions["aggregationMarkers"]>;
  selection: SelectionInput | null;
  searchQuery: string;
  searchResultIds: string[];
  temporaryObject: GraphSummaryObjectRef | null;
  callbacks: GraphFacadeRendererCallbacks;
}

export interface GraphFacadeRouteRendererFactoryInput {
  container: HTMLElement;
  options: GraphFacadeRouteRendererOptions;
  onSigmaUnavailable?: (error: unknown) => void;
  onRetrySigma?: () => void;
}

export interface GraphFacadeRouteRendererFactories {
  createSigmaGlobal: (input: GraphFacadeRouteRendererFactoryInput) => GraphFacadeRenderer;
  createDomSvgCommunity: (input: GraphFacadeRouteRendererFactoryInput) => GraphFacadeRenderer;
  createDomSvgSmallFallback: (input: GraphFacadeRouteRendererFactoryInput) => GraphFacadeRenderer;
  createOverLimitNotice: (input: GraphFacadeRouteRendererFactoryInput) => GraphFacadeRenderer;
}

export interface GraphFacadeRendererCallbacks {
  onNodeOpen?: (nodeId: string) => void;
  onSelectionInput?: (selection: SelectionInput) => void;
  onPinsChanged?: (pins: NonNullable<GraphEngineOptions["pins"]>) => void;
  onSelectionClearRequested?: () => void;
  onViewReset?: () => void;
  onGlobalResetRequested?: () => void;
  onDragActiveChange?: (dragging: boolean) => void;
  onVisibilityStateChange?: (state: GraphVisibilityState) => void;
}

interface GraphFacadeContainer {
  dataset: Record<string, string | undefined>;
}

export interface GraphFacadeState {
  data: GraphData;
  pins: NonNullable<GraphEngineOptions["pins"]>;
  theme?: ThemeId;
  focus?: GraphEngineOptions["focus"];
  typeFilters?: NonNullable<GraphEngineOptions["typeFilters"]>;
  aggregationMarkers?: NonNullable<GraphEngineOptions["aggregationMarkers"]>;
  selection?: SelectionInput | null;
  searchQuery?: string;
  searchResultIds?: string[];
  temporaryObject?: GraphSummaryObjectRef | null;
}

export function createGraphFacade(container: HTMLElement, options: GraphEngineOptions): GraphEngine {
  if (!container) {
    throw new Error("createGraphEngine requires a container element");
  }

  const capabilities = options.capabilities;
  const facadeState: GraphFacadeState = {
    data: options.data,
    pins: options.pins || {},
    theme: options.theme,
    focus: options.focus || null,
    typeFilters: options.typeFilters || {},
    aggregationMarkers: options.aggregationMarkers || [],
    selection: null,
    searchQuery: "",
    searchResultIds: [],
    temporaryObject: null
  };
  const rendererCallbacks: GraphFacadeRendererCallbacks = {
    onNodeOpen: capabilities?.onOpenPage
      ? (nodeId) => capabilities.onOpenPage?.(openPagePayloadForNode(facadeState.data, nodeId))
      : undefined,
    onSelectionInput: shouldResolveSelection(capabilities)
      ? (input) => {
          const selection = resolveSelectionForCapabilities(facadeState.data, input, {
            canAsk: Boolean(capabilities?.onAsk)
          });
          capabilities?.onSelectionChange?.(selection);
          if (!capabilities?.onSelectionChange) capabilities?.onAsk?.(selection);
        }
      : undefined,
    onPinsChanged: capabilities?.persistPins ? (pins) => {
      facadeState.pins = pins;
      void capabilities.persistPins?.(pins);
    } : undefined,
    onSelectionClearRequested: capabilities?.onSelectionClear,
    onViewReset: () => {
      delete container.dataset.llmWikiGraphFocus;
      capabilities?.onViewReset?.();
    },
    onDragActiveChange: capabilities?.onDragStateChange,
    onVisibilityStateChange: (visibility) => {
      facadeState.searchQuery = visibility.searchQuery;
      facadeState.searchResultIds = visibility.searchResultIds;
      facadeState.typeFilters = visibility.typeFilters;
      facadeState.temporaryObject = visibility.temporaryObject;
      capabilities?.onVisibilityStateChange?.(visibility);
    }
  };
  const renderer = createGraphFacadeRouteManager(container, {
    state: facadeState,
    toolbarContainer: options.toolbarContainer,
    callbacks: rendererCallbacks
  });

  return createGraphFacadeFromRenderer(container, renderer, options, facadeState);
}

export function createGraphFacadeRouteManager(
  container: HTMLElement,
  options: {
    state: GraphFacadeState;
    toolbarContainer?: HTMLElement | null;
    callbacks?: GraphFacadeRendererCallbacks;
    factories?: Partial<GraphFacadeRouteRendererFactories>;
  }
): GraphFacadeRouteManager {
  const state = options.state;
  state.theme = state.theme || "shan-shui";
  state.focus = state.focus || null;
  state.typeFilters = state.typeFilters || {};
  state.aggregationMarkers = state.aggregationMarkers || [];
  state.selection = state.selection || null;
  state.searchQuery = state.searchQuery || "";
  state.searchResultIds = state.searchResultIds || [];
  state.temporaryObject = state.temporaryObject || null;

  const factories: GraphFacadeRouteRendererFactories = {
    createSigmaGlobal: options.factories?.createSigmaGlobal || createSigmaGlobalFacadeRenderer,
    createDomSvgCommunity: options.factories?.createDomSvgCommunity || ((input) =>
      createDomSvgFacadeRenderer(input, options.toolbarContainer, true)),
    createDomSvgSmallFallback: options.factories?.createDomSvgSmallFallback || ((input) =>
      createDomSvgFacadeRenderer(input, options.toolbarContainer, true)),
    createOverLimitNotice: options.factories?.createOverLimitNotice || createOverLimitNoticeRenderer
  };
  let routeId: GraphFacadeRendererRouteId = "sigma-global";
  let sigmaKnownUnavailable = false;
  let sigmaAttemptCount = 0;
  let destroyed = false;
  let active: GraphFacadeRenderer | undefined;
  let routeTransitionTimer: ReturnType<typeof setTimeout> | undefined;

  const manager: GraphFacadeRouteManager = {
    get routeId() {
      return routeId;
    },
    get sigmaKnownUnavailable() {
      return sigmaKnownUnavailable;
    },
    get sigmaAttemptCount() {
      return sigmaAttemptCount;
    },
    retrySigma() {
      assertActive();
      sigmaKnownUnavailable = false;
      switchRoute("sigma-global", activateGlobalRoute);
    },
    applyDiff(diff, animationOptions) {
      assertActive();
      return currentRenderer().applyDiff(diff, animationOptions);
    },
    isDragging() {
      assertActive();
      return currentRenderer().isDragging();
    },
    setData(data, pins) {
      assertActive();
      state.data = data;
      if (pins) state.pins = pins;
      if (graphExceedsGlobalNodeLimit(state.data)) {
        if (routeId === "over-limit-notice" && active) {
          currentRenderer().setData(data, pins);
        } else {
          switchToOverLimitNotice();
        }
        return;
      }
      if (routeId === "over-limit-notice") {
        switchToGlobalRoute();
        return;
      }
      if (sigmaKnownUnavailable) {
        if (routeId === "dom-svg-small-fallback" && active) {
          currentRenderer().setData(data, pins);
        } else {
          switchToFallbackRoute();
        }
        return;
      }
      currentRenderer().setData(data, pins);
    },
    setAggregationMarkers(markers) {
      assertActive();
      state.aggregationMarkers = markers;
      currentRenderer().setAggregationMarkers(markers);
    },
    focusNode(path) {
      assertActive();
      currentRenderer().focusNode(path);
    },
    focusCommunity(id) {
      assertActive();
      state.focus = { kind: "community", id };
      switchRoute("dom-svg-community", () => factories.createDomSvgCommunity(factoryInput()));
      currentRenderer().focusCommunity(id);
    },
    setTypeFilters(filters) {
      assertActive();
      state.typeFilters = filters;
      currentRenderer().setTypeFilters(filters);
    },
    showTemporaryObject(object) {
      assertActive();
      state.temporaryObject = object;
      currentRenderer().showTemporaryObject(object);
    },
    clearTemporaryObjectDisplay() {
      assertActive();
      state.temporaryObject = null;
      currentRenderer().clearTemporaryObjectDisplay();
    },
    resetView() {
      assertActive();
      resetViewToGlobalRoute();
    },
    select(selection) {
      assertActive();
      state.selection = selection;
      currentRenderer().select(selection);
    },
    previewNode(id) {
      assertActive();
      currentRenderer().previewNode(id);
    },
    clearSelection() {
      assertActive();
      state.selection = null;
      currentRenderer().clearSelection();
    },
    clearInteraction() {
      assertActive();
      state.focus = null;
      state.selection = null;
      state.temporaryObject = null;
      currentRenderer().clearInteraction();
    },
    setNodeFixed(id, mode) {
      assertActive();
      const changed = currentRenderer().setNodeFixed(id, mode);
      if (changed && mode === "unfix") {
        const node = state.data.nodes.find((item) => item.id === id);
        const path = node ? wikiPathForGraphNode(node) : id;
        if (state.pins[path]) {
          const nextPins = { ...state.pins };
          delete nextPins[path];
          state.pins = nextPins;
        }
      }
      return changed;
    },
    setTheme(theme) {
      assertActive();
      state.theme = theme;
      currentRenderer().setTheme(theme);
    },
    setPins(pins) {
      assertActive();
      state.pins = pins;
      currentRenderer().setPins(pins);
    },
    resetLayout() {
      assertActive();
      currentRenderer().resetLayout();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearRouteTransitionMarker();
      delete container.dataset.llmWikiGraphRoute;
      delete container.dataset.llmWikiGraphRouteTransition;
      active?.destroy();
    }
  };

  active = activateGlobalRoute();
  setRouteDataset(routeId, null);

  return manager;

  function switchToGlobalRoute(): void {
    if (graphExceedsGlobalNodeLimit(state.data)) {
      switchToOverLimitNotice();
      return;
    }
    if (sigmaKnownUnavailable) {
      switchToFallbackRoute();
      return;
    }
    switchRoute("sigma-global", activateGlobalRoute);
  }

  function requestGlobalRouteFromRenderer(): { shouldNotifyViewReset: boolean } {
    state.focus = null;
    switchToGlobalRoute();
    if (routeId === "sigma-global") return { shouldNotifyViewReset: true };
    currentRenderer().resetView();
    return { shouldNotifyViewReset: routeId !== "dom-svg-small-fallback" };
  }

  function resetViewToGlobalRoute(): void {
    const previousRouteId = routeId;
    state.focus = null;
    switchToGlobalRoute();
    if (previousRouteId === routeId) currentRenderer().resetView();
  }

  function activateGlobalRoute(): GraphFacadeRenderer {
    if (graphExceedsGlobalNodeLimit(state.data)) {
      return activateOverLimitNotice();
    }
    if (sigmaKnownUnavailable) {
      return activateFallbackRoute();
    }
    sigmaAttemptCount += 1;
    routeId = "sigma-global";
    try {
      return factories.createSigmaGlobal(factoryInput((error) => {
        markSigmaUnavailable(error);
      }));
    } catch (error) {
      sigmaKnownUnavailable = true;
      return activateFallbackRoute();
    }
  }

  function markSigmaUnavailable(_error: unknown): void {
    if (destroyed || sigmaKnownUnavailable) return;
    sigmaKnownUnavailable = true;
    if (routeId !== "sigma-global") return;
    switchToFallbackRoute();
  }

  function switchToFallbackRoute(): void {
    if (graphExceedsGlobalNodeLimit(state.data)) {
      switchToOverLimitNotice();
      return;
    }
    switchRoute("dom-svg-small-fallback", () => activateFallbackRoute());
  }

  function activateFallbackRoute(): GraphFacadeRenderer {
    if (graphExceedsGlobalNodeLimit(state.data)) {
      return activateOverLimitNotice();
    }
    routeId = "dom-svg-small-fallback";
    return factories.createDomSvgSmallFallback(factoryInput(undefined, () => manager.retrySigma()));
  }

  function switchToOverLimitNotice(): void {
    switchRoute("over-limit-notice", activateOverLimitNotice);
  }

  function activateOverLimitNotice(): GraphFacadeRenderer {
    routeId = "over-limit-notice";
    return factories.createOverLimitNotice(factoryInput());
  }

  function switchRoute(nextRouteId: GraphFacadeRendererRouteId, createNext: () => GraphFacadeRenderer): void {
    if (destroyed) return;
    if (routeId === nextRouteId && active) return;
    const previousRouteId = routeId;
    const previous = active;
    routeId = nextRouteId;
    const next = createNext();
    setRouteDataset(routeId, previousRouteId);
    active = next;
    previous?.destroy();
  }

  function setRouteDataset(nextRouteId: GraphFacadeRendererRouteId, previousRouteId: GraphFacadeRendererRouteId | null): void {
    container.dataset.llmWikiGraphRoute = nextRouteId;
    clearRouteTransitionMarker();
    if (!previousRouteId || previousRouteId === nextRouteId) return;
    container.dataset.llmWikiGraphRouteTransition = `${previousRouteId}->${nextRouteId}`;
    routeTransitionTimer = setTimeout(() => {
      if (!destroyed) delete container.dataset.llmWikiGraphRouteTransition;
      routeTransitionTimer = undefined;
    }, GRAPH_FACADE_ROUTE_TRANSITION_MS);
  }

  function clearRouteTransitionMarker(): void {
    if (routeTransitionTimer) {
      clearTimeout(routeTransitionTimer);
      routeTransitionTimer = undefined;
    }
    delete container.dataset.llmWikiGraphRouteTransition;
  }

  function factoryInput(onSigmaUnavailable?: (error: unknown) => void, onRetrySigma?: () => void): GraphFacadeRouteRendererFactoryInput {
    return {
      container,
      options: {
        data: state.data,
        pins: state.pins,
        theme: state.theme || "shan-shui",
        focus: state.focus || null,
        typeFilters: state.typeFilters || {},
        aggregationMarkers: state.aggregationMarkers || [],
        selection: state.selection || null,
        searchQuery: state.searchQuery || "",
        searchResultIds: state.searchResultIds || [],
        temporaryObject: state.temporaryObject || null,
        callbacks: {
          ...(options.callbacks || {}),
          onSelectionInput: (selection) => {
            state.selection = selection;
            options.callbacks?.onSelectionInput?.(selection);
          },
          onSelectionClearRequested: () => {
            state.selection = null;
            state.temporaryObject = null;
            options.callbacks?.onSelectionClearRequested?.();
          },
          onPinsChanged: (pins) => {
            state.pins = pins;
            options.callbacks?.onPinsChanged?.(pins);
          },
          onGlobalResetRequested: () => {
            assertActive();
            const result = requestGlobalRouteFromRenderer();
            if (result.shouldNotifyViewReset) options.callbacks?.onViewReset?.();
          },
          onVisibilityStateChange: (visibility) => {
            state.searchQuery = visibility.searchQuery;
            state.searchResultIds = visibility.searchResultIds;
            state.typeFilters = visibility.typeFilters;
            state.temporaryObject = visibility.temporaryObject;
            options.callbacks?.onVisibilityStateChange?.(visibility);
          }
        }
      },
      onSigmaUnavailable,
      onRetrySigma
    };
  }

  function assertActive(): void {
    if (destroyed) {
      throw new Error("Graph facade route manager has been destroyed");
    }
  }

  function currentRenderer(): GraphFacadeRenderer {
    if (!active) {
      throw new Error("Graph facade route manager has no active renderer");
    }
    return active;
  }
}

function createDomSvgFacadeRenderer(
  input: GraphFacadeRouteRendererFactoryInput,
  toolbarContainer: HTMLElement | null | undefined,
  live: boolean
): GraphFacadeRenderer {
  const renderer = createGraphRenderer(input.container, {
    data: input.options.data,
    pins: input.options.pins,
    theme: input.options.theme,
    toolbarContainer,
    focus: input.options.focus || undefined,
    typeFilters: input.options.typeFilters,
    aggregationMarkers: input.options.aggregationMarkers,
    searchQuery: input.options.searchQuery,
    live,
    onNodeOpen: input.options.callbacks.onNodeOpen,
    onSelectionInput: input.options.callbacks.onSelectionInput,
    onPinsChanged: input.options.callbacks.onPinsChanged,
    onSelectionClearRequested: input.options.callbacks.onSelectionClearRequested,
    onViewReset: input.options.callbacks.onViewReset,
    onGlobalResetRequested: input.options.callbacks.onGlobalResetRequested,
    onDragActiveChange: input.options.callbacks.onDragActiveChange,
    onVisibilityStateChange: input.options.callbacks.onVisibilityStateChange
  });
  if (input.options.selection) renderer.select(input.options.selection);
  if (input.options.temporaryObject) renderer.showTemporaryObject(input.options.temporaryObject);
  return renderer;
}

export function graphExceedsGlobalNodeLimit(data: GraphData): boolean {
  return actualGraphNodeCount(data) > GRAPH_FACADE_GLOBAL_NODE_LIMIT;
}

export function graphRequiresAggregationSafetyFallback(data: GraphData): boolean {
  const nodeCount = actualGraphNodeCount(data);
  const edgeCount = Math.max(data.meta.total_edges || 0, data.edges.length);
  const communitySizes = new Map<string, number>();
  for (const node of data.nodes) {
    if (!node.community) continue;
    communitySizes.set(node.community, (communitySizes.get(node.community) || 0) + 1);
  }
  const maxCommunitySize = Math.max(0, ...communitySizes.values());
  return nodeCount > GRAPH_FACADE_SIGMA_FALLBACK_THRESHOLDS.maxDomSvgFallbackNodes ||
    edgeCount > GRAPH_FACADE_SIGMA_FALLBACK_THRESHOLDS.maxDomSvgFallbackEdges ||
    maxCommunitySize > GRAPH_FACADE_SIGMA_FALLBACK_THRESHOLDS.maxDomSvgFallbackCommunitySize;
}

function actualGraphNodeCount(data: GraphData): number {
  return data.nodes.length;
}

function createOverLimitNoticeRenderer(input: GraphFacadeRouteRendererFactoryInput): GraphFacadeRenderer {
  let options = input.options;
  let destroyed = false;
  const ownerDocument = input.container.ownerDocument;
  if (!ownerDocument) {
    throw new Error("over-limit notice requires a DOM container");
  }
  const root = ownerDocument.createElement("div");
  root.className = "graph-over-limit-notice-view";
  root.dataset.route = "over-limit-notice";
  root.dataset.notice = "node-count-over-limit";
  input.container.append(root);
  render();

  return {
    applyDiff() {
      return Promise.resolve();
    },
    isDragging() {
      return false;
    },
    setData(data, pins) {
      options = { ...options, data, pins: pins || options.pins };
      render();
    },
    setAggregationMarkers(markers) {
      options = { ...options, aggregationMarkers: markers };
      render();
    },
    focusNode(path) {
      const node = options.data.nodes.find((item) => item.id === path || wikiPathForGraphNode(item) === path);
      options = { ...options, selection: node ? { kind: "node", id: node.id } : options.selection };
      render();
    },
    focusCommunity(id) {
      options = { ...options, focus: { kind: "community", id } };
      render();
    },
    setTypeFilters(filters) {
      options = { ...options, typeFilters: filters };
      render();
    },
    showTemporaryObject(object) {
      options = { ...options, temporaryObject: object };
      render();
    },
    clearTemporaryObjectDisplay() {
      options = { ...options, temporaryObject: null };
      render();
    },
    resetView() {
      options = { ...options, focus: null };
      render();
    },
    select(selection) {
      options = { ...options, selection };
      render();
    },
    previewNode() {},
    clearSelection() {
      options = { ...options, selection: null };
      input.options.callbacks.onSelectionClearRequested?.();
      render();
    },
    clearInteraction() {
      options = { ...options, focus: null, selection: null, temporaryObject: null };
      render();
    },
    setNodeFixed() {
      return false;
    },
    setTheme(theme) {
      options = { ...options, theme };
      render();
    },
    setPins(pins) {
      options = { ...options, pins };
      render();
    },
    resetLayout() {
      options = { ...options, pins: {} };
      render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      root.remove();
    }
  };

  function render(): void {
    if (destroyed) return;
    root.replaceChildren();
    root.dataset.nodeCount = String(actualGraphNodeCount(options.data));
    root.dataset.edgeCount = String(options.data.meta.total_edges || options.data.edges.length);
    root.dataset.nodeLimit = String(GRAPH_FACADE_GLOBAL_NODE_LIMIT);
    root.dataset.containerCount = "0";
    root.dataset.searchResultCount = String(options.searchResultIds.length);
    root.dataset.selectedCount = String(options.selection ? resolveSelectionForCapabilities(options.data, options.selection, { canAsk: false }).nodeIds.length : 0);
    root.dataset.pinnedCount = String(Object.keys(options.pins).length);
    root.dataset.temporaryObject = options.temporaryObject ? options.temporaryObject.kind : "";

    const notice = ownerDocument.createElement("div");
    notice.className = "graph-over-limit-notice";
    notice.dataset.role = "over-limit-notice";
    root.append(notice);

    const title = ownerDocument.createElement("strong");
    title.className = "graph-over-limit-notice-title";
    title.textContent = "图谱节点较多";
    notice.append(title);

    const body = ownerDocument.createElement("p");
    body.className = "graph-over-limit-notice-body";
    body.textContent = "当前图谱超过 2000 个节点。请用搜索、筛选或进入社区缩小范围。";
    notice.append(body);
  }
}

function createSigmaGlobalFacadeRenderer(input: GraphFacadeRouteRendererFactoryInput): GraphFacadeRenderer {
  let options = input.options;
  let destroyed = false;
  let renderer: ReturnType<typeof createSigmaGlobalRenderer> | null = null;
  let searchOpen = Boolean(options.searchQuery);
  let searchFocusedNodeId: string | null = null;
  let legendCollapsed = false;
  let toolbarPanelState = readToolbarPanelState(input.container.ownerDocument.defaultView?.localStorage);
  let searchStatus: HTMLElement | null = null;
  const shell = input.container.ownerDocument.createElement("div");
  shell.className = "sigma-global-route";
  shell.dataset.route = "sigma-global";
  input.container.append(shell);
  ensureGraphRendererStyles(input.container.ownerDocument);
  mountSigmaControls();

  void sigmaGlobalRendererRuntimeBoundary()
    .then((runtime) => {
      if (destroyed) return;
      try {
        renderer = createSigmaGlobalRenderer({
          container: shell,
          adapterData: adapterDataForSigmaRoute(options),
          theme: options.theme,
          runtime: runtime as unknown as SigmaGlobalRendererRuntime,
          pins: options.pins,
          onPinsChanged: handleSigmaPinsChanged,
          onDragActiveChange: input.options.callbacks.onDragActiveChange,
          onHitTarget: handleSigmaHitTarget,
          onFatalError: (error) => input.onSigmaUnavailable?.(error)
        });
      } catch (error) {
        input.onSigmaUnavailable?.(error);
      }
    })
    .catch((error) => input.onSigmaUnavailable?.(error));

  return {
    applyDiff() {
      return Promise.resolve();
    },
    isDragging() {
      return Boolean(renderer?.isDragging());
    },
    setData(data, pins) {
      options = { ...options, data, pins: pins || options.pins };
      syncVisibilityState();
      mountSigmaControls();
      updateSigmaRenderer();
    },
    setAggregationMarkers(markers) {
      options = { ...options, aggregationMarkers: markers };
      updateSigmaRenderer();
    },
    focusNode(path) {
      const node = options.data.nodes.find((item) => item.id === path || wikiPathForGraphNode(item) === path);
      options = { ...options, selection: node ? { kind: "node", id: node.id } : null };
      updateSigmaRenderer();
    },
    focusCommunity() {
      updateSigmaRenderer();
    },
    setTypeFilters(filters) {
      options = { ...options, typeFilters: filters };
      syncVisibilityState();
      mountSigmaControls();
      updateSigmaRenderer();
    },
    showTemporaryObject(object) {
      options = { ...options, temporaryObject: object };
      updateSigmaRenderer();
    },
    clearTemporaryObjectDisplay() {
      options = { ...options, temporaryObject: null };
      updateSigmaRenderer();
    },
    resetView() {
      options = { ...options, focus: null, selection: null };
      updateSigmaRenderer();
    },
    select(selection) {
      options = { ...options, selection };
      updateSigmaRenderer();
    },
    previewNode() {},
    clearSelection() {
      options = { ...options, selection: null };
      input.options.callbacks.onSelectionClearRequested?.();
      updateSigmaRenderer();
    },
    clearInteraction() {
      options = { ...options, focus: null, selection: null, temporaryObject: null };
      updateSigmaRenderer();
    },
    setNodeFixed(id, mode) {
      const node = options.data.nodes.find((item) => item.id === id);
      if (!node) return false;
      const path = wikiPathForGraphNode(node);
      const nextPins: PinMap = { ...options.pins };
      if (mode === "fix") {
        const adapterNode = adapterDataForSigmaRoute(options).nodes.find((item) => item.id === id);
        nextPins[path] = {
          x: adapterNode?.point.x ?? numericNodeCoordinate(node.x),
          y: adapterNode?.point.y ?? numericNodeCoordinate(node.y),
          coordinateSpace: "world"
        };
      } else {
        delete nextPins[path];
      }
      options = { ...options, pins: nextPins };
      input.options.callbacks.onPinsChanged?.(nextPins);
      updateSigmaRenderer();
      return true;
    },
    setTheme(theme) {
      options = { ...options, theme };
      shell.dataset.theme = theme;
      updateSigmaRenderer();
    },
    setPins(pins) {
      options = { ...options, pins };
      updateSigmaRenderer();
    },
    resetLayout() {
      options = { ...options, pins: {} };
      updateSigmaRenderer();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      renderer?.destroy();
      renderer = null;
      shell.remove();
    }
  };

  function updateSigmaRenderer(): void {
    if (!renderer || destroyed) return;
    renderer.update({
      adapterData: adapterDataForSigmaRoute(options),
      theme: options.theme,
      pins: options.pins
    });
  }

  function handleSigmaPinsChanged(pins: PinMap): void {
    options = { ...options, pins };
    input.options.callbacks.onPinsChanged?.(pins);
    updateSigmaRenderer();
  }

  function handleSigmaHitTarget(target: GraphGestureTarget): void {
    switch (target.kind) {
      case "node":
        if (target.id) selectOnSigma({ kind: "node", id: target.id });
        break;
      case "community-wash":
        if (target.id) selectOnSigma({ kind: "community", id: target.id });
        break;
      case "aggregation-container":
        if (target.communityId) selectOnSigma({ kind: "community", id: target.communityId });
        break;
      case "edge":
        break;
      case "graph-blank":
        options = { ...options, selection: null, temporaryObject: null };
        input.options.callbacks.onSelectionClearRequested?.();
        updateSigmaRenderer();
        break;
    }
  }

  function selectOnSigma(selection: SelectionInput): void {
    options = { ...options, selection };
    input.options.callbacks.onSelectionInput?.(selection);
    updateSigmaRenderer();
  }

  function mountSigmaControls(): void {
    shell.dataset.theme = options.theme;
    shell.dataset.searchOpen = searchOpen ? "true" : "false";
    shell.querySelector(".graph-search")?.remove();
    shell.querySelector(".graph-toolbar")?.remove();
    const search = createSearchControl(input.container.ownerDocument, {
      open: searchOpen,
      query: options.searchQuery,
      onOpen: () => {
        searchOpen = true;
        mountSigmaControls();
      },
      onQuery: applySearchQuery,
      onNext: () => focusSearchResult("next"),
      onPrevious: () => focusSearchResult("previous"),
      onActivate: activateSearchResult,
      onClose: () => {
        searchOpen = false;
        searchFocusedNodeId = null;
        applySearchQuery("");
      }
    });
    shell.prepend(search.element);
    searchStatus = search.status;
    updateSearchStatus(search.status);

    const adapterData = adapterDataForSigmaRoute(options);
    const legendRows = buildCommunityLegend(adapterData.renderable.communities, adapterData.renderable.nodes);
    const communityLegend = createCommunityLegend(input.container.ownerDocument, {
      rows: legendRows,
      collapsed: legendCollapsed,
      onToggle: () => {
        legendCollapsed = !legendCollapsed;
        mountSigmaControls();
      },
      onHover: (id) => {
        shell.dataset.legendHover = id || "";
      },
      onSelect: (id) => selectOnSigma({ kind: "community", id })
    });
    const toolbar = createGraphToolbar(input.container.ownerDocument, {
      panelState: toolbarPanelState,
      typeFilters: options.typeFilters,
      onPanelToggle: (panel) => {
        toolbarPanelState = nextToolbarPanelState(toolbarPanelState, panel);
        writeToolbarPanelState(input.container.ownerDocument.defaultView?.localStorage, toolbarPanelState);
        mountSigmaControls();
      },
      onTypeFilterToggle: (type, enabled) => {
        options = { ...options, typeFilters: { ...options.typeFilters, [type]: enabled } };
        syncVisibilityState();
        mountSigmaControls();
        updateSigmaRenderer();
      },
      onReset: () => {
        options = { ...options, focus: null, selection: null };
        updateSigmaRenderer();
      }
    });
    toolbar.filtersPanel.appendChild(communityLegend.element);
    shell.prepend(toolbar.element);
  }

  function applySearchQuery(query: string): void {
    const state = resolveGraphSearchState(options.data.nodes, query);
    options = { ...options, searchQuery: state.query, searchResultIds: state.matchIds };
    if (!state.matchIds.includes(searchFocusedNodeId || "")) searchFocusedNodeId = null;
    syncVisibilityState();
    if (searchStatus) updateSearchStatus(searchStatus);
    updateSigmaRenderer();
  }

  function focusSearchResult(direction: "next" | "previous"): void {
    const state = resolveGraphSearchState(options.data.nodes, options.searchQuery);
    const index = searchFocusedNodeId ? state.matchIds.indexOf(searchFocusedNodeId) : -1;
    if (!state.matchIds.length) return;
    const nextIndex = direction === "next"
      ? (index + 1 + state.matchIds.length) % state.matchIds.length
      : (index - 1 + state.matchIds.length) % state.matchIds.length;
    searchFocusedNodeId = state.matchIds[nextIndex];
    mountSigmaControls();
  }

  function activateSearchResult(): void {
    const state = resolveGraphSearchState(options.data.nodes, options.searchQuery);
    const id = searchFocusedNodeId || state.matchIds[0];
    if (id) selectOnSigma({ kind: "node", id });
  }

  function syncVisibilityState(): void {
    input.options.callbacks.onVisibilityStateChange?.({
      searchQuery: options.searchQuery,
      searchResultIds: options.searchResultIds,
      typeFilters: options.typeFilters,
      temporaryObject: options.temporaryObject
    });
  }

  function updateSearchStatus(status: HTMLElement): void {
    const state = resolveGraphSearchState(options.data.nodes, options.searchQuery);
    const focusedIndex = searchFocusedNodeId ? state.matchIds.indexOf(searchFocusedNodeId) : -1;
    status.textContent = state.query
      ? `${state.matchIds.length} 个结果${focusedIndex >= 0 ? ` · ${focusedIndex + 1}/${state.matchIds.length}` : ""}`
      : "输入关键词";
  }
}

function adapterDataForSigmaRoute(options: GraphFacadeRouteRendererOptions): GraphRendererAdapterData {
  return buildGraphRendererAdapterData(options.data, {
    theme: options.theme,
    pins: options.pins,
    selection: options.selection,
    searchResultIds: options.searchResultIds,
    aggregationMarkers: options.aggregationMarkers,
    focus: null,
    typeFilters: options.typeFilters
  });
}

function numericNodeCoordinate(value: GraphNode["x"] | GraphNode["y"]): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export function createGraphFacadeFromRenderer(
  container: GraphFacadeContainer,
  renderer: GraphFacadeRenderer,
  options: GraphEngineOptions,
  facadeState: GraphFacadeState = { data: options.data, pins: options.pins || {} }
): GraphEngine {
  let currentTheme: ThemeId = options.theme;
  let destroyed = false;
  const capabilities = options.capabilities;
  const canAsk = Boolean(options.capabilities?.onAsk);
  const resolveForHostCapabilities = (input: SelectionInput): Selection =>
    resolveSelectionForCapabilities(facadeState.data, input, { canAsk });

  container.dataset.llmWikiGraphEngine = "mounted";
  container.dataset.llmWikiGraphTheme = currentTheme;

  return {
    async applyDiff(diff: GraphDiff, animationOptions?: { reducedMotion?: boolean; durationMs?: number }): Promise<void> {
      assertActive();
      await renderer.applyDiff(diff, animationOptions);
    },

    isDragging(): boolean {
      assertActive();
      return renderer.isDragging();
    },

    setData(data, pins): void {
      assertActive();
      facadeState.data = data;
      if (pins) facadeState.pins = pins;
      renderer.setData(data, pins);
    },

    setAggregationMarkers(markers): void {
      assertActive();
      facadeState.aggregationMarkers = markers;
      renderer.setAggregationMarkers(markers);
    },

    focusNode(path: string): void {
      assertActive();
      container.dataset.llmWikiGraphFocus = path;
      const node = facadeState.data.nodes.find((item) => item.id === path || wikiPathForGraphNode(item) === path);
      facadeState.selection = node ? { kind: "node", id: node.id } : null;
      renderer.focusNode(path);
    },

    focusCommunity(id): Selection {
      assertActive();
      container.dataset.llmWikiGraphFocus = `community:${id}`;
      facadeState.focus = { kind: "community", id };
      facadeState.selection = { kind: "community", id };
      renderer.focusCommunity(id);
      return resolveForHostCapabilities({ kind: "community", id });
    },

    setTypeFilters(filters): void {
      assertActive();
      facadeState.typeFilters = filters;
      renderer.setTypeFilters(filters);
    },

    showTemporaryObject(object): void {
      assertActive();
      facadeState.temporaryObject = object;
      renderer.showTemporaryObject(object);
    },

    clearTemporaryObjectDisplay(): void {
      assertActive();
      facadeState.temporaryObject = null;
      renderer.clearTemporaryObjectDisplay();
    },

    resetView(): void {
      assertActive();
      delete container.dataset.llmWikiGraphFocus;
      facadeState.focus = null;
      renderer.resetView();
      capabilities?.onViewReset?.();
    },

    select(selector: SelectionInput): Selection {
      assertActive();
      facadeState.selection = selector;
      renderer.select(selector);
      return resolveForHostCapabilities(selector);
    },

    previewNode(id): void {
      assertActive();
      renderer.previewNode(id);
    },

    summarizeNode(id, summaryOptions) {
      assertActive();
      return summarizeGraphNode(facadeState.data, id, summaryOptionsWithFacadeState(facadeState, summaryOptions));
    },

    summarizeCommunity(id, summaryOptions) {
      assertActive();
      return summarizeGraphCommunity(facadeState.data, id, summaryOptionsWithFacadeState(facadeState, summaryOptions));
    },

    summarizeGlobal(summaryOptions) {
      assertActive();
      return summarizeGraphGlobal(facadeState.data, summaryOptionsWithFacadeState(facadeState, summaryOptions));
    },

    summarizeSearchResults(query, resultIds, summaryOptions) {
      assertActive();
      return summarizeGraphSearchResults(facadeState.data, query, resultIds, summaryOptionsWithFacadeState(facadeState, summaryOptions));
    },

    summarizeExcludedObject(
      object: GraphSummaryObjectRef,
      reason: Parameters<GraphEngine["summarizeExcludedObject"]>[1],
      summaryOptions?: GraphSummaryOptions
    ) {
      assertActive();
      return summarizeExcludedGraphObject(facadeState.data, object, reason, summaryOptionsWithFacadeState(facadeState, summaryOptions));
    },

    summarizeUnavailableObject(
      object: GraphSummaryObjectRef,
      reason: Parameters<GraphEngine["summarizeUnavailableObject"]>[1],
      summaryOptions?: GraphSummaryOptions
    ) {
      assertActive();
      return summarizeUnavailableGraphObject(facadeState.data, object, reason, summaryOptionsWithFacadeState(facadeState, summaryOptions));
    },

    clearSelection(): void {
      assertActive();
      facadeState.selection = null;
      renderer.clearSelection();
    },

    clearInteraction(): void {
      assertActive();
      renderer.clearInteraction();
      delete container.dataset.llmWikiGraphFocus;
      facadeState.focus = null;
      facadeState.selection = null;
      facadeState.temporaryObject = null;
    },

    setNodeFixed(id: string, mode: "fix" | "unfix"): boolean {
      assertActive();
      return renderer.setNodeFixed(id, mode);
    },

    setTheme(theme: ThemeId): void {
      assertActive();
      currentTheme = theme;
      container.dataset.llmWikiGraphTheme = currentTheme;
      renderer.setTheme(theme);
    },

    setPins(pins): void {
      assertActive();
      facadeState.pins = pins;
      renderer.setPins(pins);
    },

    resetLayout(): void {
      assertActive();
      facadeState.pins = {};
      renderer.resetLayout();
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      renderer.destroy();
      delete container.dataset.llmWikiGraphEngine;
      delete container.dataset.llmWikiGraphTheme;
      delete container.dataset.llmWikiGraphFocus;
    }
  };

  function assertActive(): void {
    if (destroyed) {
      throw new Error("Graph engine has been destroyed");
    }
  }
}

function summaryOptionsWithFacadeState(state: GraphFacadeState, options: GraphSummaryOptions = {}): GraphSummaryOptions {
  return {
    ...options,
    selection: options.selection ?? state.selection ?? null,
    searchResultIds: options.searchResultIds ?? state.searchResultIds ?? [],
    pins: options.pins ?? state.pins,
    aggregationMarkers: options.aggregationMarkers ?? state.aggregationMarkers ?? [],
    temporaryObject: options.temporaryObject ?? state.temporaryObject ?? null
  };
}

function shouldResolveSelection(capabilities: GraphEngineOptions["capabilities"]): boolean {
  return Boolean(capabilities?.onSelectionChange || capabilities?.onAsk);
}

function openPagePayloadForNode(data: GraphData, id: string): GraphOpenPagePayload {
  const node = data.nodes.find((item) => item.id === id);
  if (!node) {
    return {
      path: id,
      node: {
        id,
        title: id,
        type: "entity",
        typeLabel: "实体",
        sourcePath: id,
        community: null,
        date: null,
        source: null,
        isolated: true
      }
    };
  }
  const sourcePath = wikiPathForGraphNode(node);
  return {
    path: sourcePath,
    node: {
      id: node.id,
      title: node.label || node.id,
      type: node.type,
      typeLabel: graphNodeTypeLabel(node.type),
      sourcePath,
      community: node.community ?? null,
      date: dateForNode(node),
      source: sourceForNode(node),
      isolated: isIsolatedNode(data, node.id)
    }
  };
}

function isIsolatedNode(data: GraphData, id: string): boolean {
  return !data.edges.some((edge) => edge.from === id || edge.to === id);
}

function dateForNode(node: GraphNode): string | null {
  const value = node.date || node.updated_at || node.updatedAt || node.created_at || node.createdAt;
  return value == null || value === "" ? null : String(value);
}

function sourceForNode(node: GraphNode): string | null {
  const value = node.source_title || node.source_url || node.url || node.author || node.source_name;
  return value == null || value === "" ? null : String(value);
}

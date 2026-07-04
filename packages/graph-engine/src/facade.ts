import type {
  GraphNode,
  GraphDiff,
  GraphEdgeStyleOptions,
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
import { createGraphRenderer } from "./render";
import { createSigmaGlobalFacadeRenderer } from "./graph-routes/sigma-global-route";
export { selectionInputForSigmaHit } from "./graph-routes/sigma-global-route";
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
  setEdgeStyle(style: GraphEdgeStyleOptions): void;
  setAggregationMarkers(markers: NonNullable<GraphEngineOptions["aggregationMarkers"]>): void;
  focusNode(path: string): void;
  focusCommunity(id: string): void;
  setSourceCommunityContext?(id: string | null): void;
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
  readonly sourceCommunityId: string | null;
  setSourceCommunityContext(id: string | null): void;
  retrySigma(): void;
}

export interface GraphFacadeRouteRendererOptions {
  data: GraphData;
  pins: NonNullable<GraphEngineOptions["pins"]>;
  theme: ThemeId;
  edgeStyle?: GraphEdgeStyleOptions;
  focus: GraphEngineOptions["focus"];
  typeFilters: NonNullable<GraphEngineOptions["typeFilters"]>;
  aggregationMarkers: NonNullable<GraphEngineOptions["aggregationMarkers"]>;
  selection: SelectionInput | null;
  sourceCommunityId: string | null;
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
  edgeStyle?: GraphEdgeStyleOptions;
  focus?: GraphEngineOptions["focus"];
  typeFilters?: NonNullable<GraphEngineOptions["typeFilters"]>;
  aggregationMarkers?: NonNullable<GraphEngineOptions["aggregationMarkers"]>;
  selection?: SelectionInput | null;
  sourceCommunityId?: string | null;
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
    edgeStyle: options.edgeStyle,
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
      if (!visibility.focusCommunityId) facadeState.typeFilters = visibility.typeFilters;
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
  state.edgeStyle = state.edgeStyle || undefined;
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
  let resettingLayout = false;
  let rendererResetPins: PinMap | null = null;

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
    get sourceCommunityId() {
      return state.sourceCommunityId ?? null;
    },
    setSourceCommunityContext(id) {
      assertActive();
      // Stores the source community only. Never calls select(), so it cannot
      // expand into per-node selected/core inside the DOM reading view.
      state.sourceCommunityId = id;
      if (routeId === "sigma-global") currentRenderer().setSourceCommunityContext?.(id);
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
      let clearedSourceCommunity = false;
      // Drop a stale source highlight when refreshed data no longer contains it.
      if (state.sourceCommunityId && !dataHasCommunity(state.data, state.sourceCommunityId)) {
        state.sourceCommunityId = null;
        clearedSourceCommunity = true;
      }
      if (clearedSourceCommunity) {
        currentRenderer().setSourceCommunityContext?.(null);
      }
      clearStaleCommunityReadingSelectionForData(data);
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
    setEdgeStyle(style) {
      assertActive();
      state.edgeStyle = style;
      if (routeId === "sigma-global") currentRenderer().setEdgeStyle(style);
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
      // Record where the user entered from so returning to global can keep this
      // community highlighted. Kept separate from selection (never expands to
      // per-node selected/core).
      state.sourceCommunityId = id;
      if (routeId === "sigma-global" && !sigmaKnownUnavailable) {
        currentRenderer().focusCommunity(id);
        return;
      }
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
      // Selecting another community replaces the source context; selecting a node
      // keeps it (the drawer may still reference where the user came from).
      if (selection.kind === "community") state.sourceCommunityId = selection.id;
      currentRenderer().select(selection);
    },
    previewNode(id) {
      assertActive();
      currentRenderer().previewNode(id);
    },
    clearSelection() {
      assertActive();
      const hadSourceCommunity = state.sourceCommunityId != null;
      state.selection = null;
      state.sourceCommunityId = null;
      if (hadSourceCommunity) currentRenderer().setSourceCommunityContext?.(null);
      currentRenderer().clearSelection();
    },
    clearInteraction() {
      assertActive();
      const clearResult = clearFacadeInteractionState(state);
      if (clearResult.clearedSourceCommunity) currentRenderer().setSourceCommunityContext?.(null);
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
      const nextPins: PinMap = {};
      state.pins = nextPins;
      resettingLayout = true;
      rendererResetPins = null;
      try {
        currentRenderer().resetLayout();
      } finally {
        resettingLayout = false;
      }
      const pinsToPersist = rendererResetPins ?? nextPins;
      rendererResetPins = null;
      state.pins = pinsToPersist;
      options.callbacks?.onPinsChanged?.(pinsToPersist);
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
    const previousRouteId = routeId;
    const wasCommunityReading = state.focus?.kind === "community";
    state.focus = null;
    if (wasCommunityReading) clearCommunityLocalVisibilityState();
    clearCommunitySelectionForGlobalReset();
    switchToGlobalRoute();
    if (routeId === "sigma-global") {
      if (previousRouteId === routeId) currentRenderer().resetView();
      return { shouldNotifyViewReset: true };
    }
    currentRenderer().resetView();
    return { shouldNotifyViewReset: routeId !== "dom-svg-small-fallback" };
  }

  function resetViewToGlobalRoute(): void {
    const previousRouteId = routeId;
    // Explicit reset clears the source community context (unlike the toolbar
    // "return to global", which keeps it so the source stays highlighted).
    const hadSourceCommunity = state.sourceCommunityId != null;
    state.sourceCommunityId = null;
    state.focus = null;
    if (previousRouteId === "sigma-global" && state.selection?.kind === "community") {
      clearCommunitySelectionForGlobalReset();
      if (hadSourceCommunity) currentRenderer().setSourceCommunityContext?.(null);
      currentRenderer().resetView();
      return;
    }
    clearCommunitySelectionForGlobalReset();
    switchToGlobalRoute();
    if (previousRouteId === routeId) {
      if (hadSourceCommunity) currentRenderer().setSourceCommunityContext?.(null);
      currentRenderer().resetView();
    }
  }

  function clearCommunitySelectionForGlobalReset(): void {
    if (state.selection?.kind !== "community") return;
    state.selection = null;
    state.temporaryObject = null;
    options.callbacks?.onSelectionClearRequested?.();
  }

  function clearCommunityLocalVisibilityState(): void {
    state.searchQuery = "";
    state.searchResultIds = [];
    state.temporaryObject = null;
  }

  function clearStaleCommunityReadingSelectionForData(data: GraphData): void {
    const focus = state.focus;
    const selection = state.selection;
    if (focus?.kind !== "community" || selection?.kind !== "node") return;
    const node = data.nodes.find((item) => item.id === selection.id);
    if (node && node.community === focus.id) return;
    state.selection = null;
    state.temporaryObject = null;
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
        edgeStyle: state.edgeStyle,
        focus: state.focus || null,
        typeFilters: state.typeFilters || {},
        aggregationMarkers: state.aggregationMarkers || [],
        selection: state.selection || null,
        sourceCommunityId: state.sourceCommunityId || null,
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
            if (state.focus?.kind !== "community") state.sourceCommunityId = null;
            state.temporaryObject = null;
            options.callbacks?.onSelectionClearRequested?.();
          },
          onPinsChanged: (pins) => {
            state.pins = pins;
            if (resettingLayout) {
              rendererResetPins = pins;
              return;
            }
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
            if (!visibility.focusCommunityId) state.typeFilters = visibility.typeFilters;
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
    sourceCommunityId: input.options.sourceCommunityId,
    onNodeOpen: input.options.callbacks.onNodeOpen,
    onSelectionInput: input.options.callbacks.onSelectionInput,
    onPinsChanged: input.options.callbacks.onPinsChanged,
    onSelectionClearRequested: input.options.callbacks.onSelectionClearRequested,
    onViewReset: input.options.callbacks.onViewReset,
    onGlobalResetRequested: input.options.callbacks.onGlobalResetRequested,
    onDragActiveChange: input.options.callbacks.onDragActiveChange,
    onVisibilityStateChange: input.options.callbacks.onVisibilityStateChange
  });
  // A community selection must NOT be replayed into the DOM reading view: it would
  // expand into every node being selected/core (resolveSelectedNodeIds). The source
  // community travels via sourceCommunityId instead; only node/nodes selections
  // (a specific node the user picked) are replayed here.
  if (input.options.selection && input.options.selection.kind !== "community") {
    renderer.select(input.options.selection);
  }
  if (input.options.temporaryObject) renderer.showTemporaryObject(input.options.temporaryObject);
  return {
    ...renderer,
    setEdgeStyle() {}
  };
}

export function graphExceedsGlobalNodeLimit(data: GraphData): boolean {
  return actualGraphNodeCount(data) > GRAPH_FACADE_GLOBAL_NODE_LIMIT;
}

function dataHasCommunity(data: GraphData, communityId: string): boolean {
  if (data.nodes.some((node) => node.community === communityId)) return true;
  return (data.learning?.communities ?? []).some((community) => community.id === communityId);
}

function clearFacadeInteractionState(state: GraphFacadeState): { preservedCommunityFocus: boolean; clearedSourceCommunity: boolean } {
  const preservedCommunityFocus = state.focus?.kind === "community";
  const hadSourceCommunity = state.sourceCommunityId != null;
  state.selection = null;
  state.temporaryObject = null;
  if (!preservedCommunityFocus) {
    state.focus = null;
    state.sourceCommunityId = null;
  }
  return { preservedCommunityFocus, clearedSourceCommunity: hadSourceCommunity && !preservedCommunityFocus };
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
    setEdgeStyle(style) {
      options = { ...options, edgeStyle: style };
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
      let clearedSourceCommunity = false;
      if (facadeState.sourceCommunityId && !dataHasCommunity(data, facadeState.sourceCommunityId)) {
        facadeState.sourceCommunityId = null;
        clearedSourceCommunity = true;
      }
      if (clearedSourceCommunity) renderer.setSourceCommunityContext?.(null);
      renderer.setData(data, pins);
    },

    setEdgeStyle(style): void {
      assertActive();
      facadeState.edgeStyle = style;
      renderer.setEdgeStyle(style);
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
      facadeState.sourceCommunityId = id;
      renderer.focusCommunity(id);
      return resolveForHostCapabilities({ kind: "community", id });
    },

    get sourceCommunityId(): string | null {
      return facadeState.sourceCommunityId ?? null;
    },

    setSourceCommunityContext(id: string | null): void {
      assertActive();
      facadeState.sourceCommunityId = id;
      renderer.setSourceCommunityContext?.(id);
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
      if (facadeState.selection?.kind === "community") {
        facadeState.selection = null;
        facadeState.temporaryObject = null;
        capabilities?.onSelectionClear?.();
      }
      facadeState.focus = null;
      const hadSourceCommunity = facadeState.sourceCommunityId != null;
      facadeState.sourceCommunityId = null;
      if (hadSourceCommunity) renderer.setSourceCommunityContext?.(null);
      renderer.resetView();
      capabilities?.onViewReset?.();
    },

    select(selector: SelectionInput): Selection {
      assertActive();
      facadeState.selection = selector;
      if (selector.kind === "community") facadeState.sourceCommunityId = selector.id;
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
      const hadSourceCommunity = facadeState.sourceCommunityId != null;
      facadeState.selection = null;
      facadeState.sourceCommunityId = null;
      if (hadSourceCommunity) renderer.setSourceCommunityContext?.(null);
      renderer.clearSelection();
    },

    clearInteraction(): void {
      assertActive();
      const clearResult = clearFacadeInteractionState(facadeState);
      if (!clearResult.preservedCommunityFocus) delete container.dataset.llmWikiGraphFocus;
      if (clearResult.clearedSourceCommunity) renderer.setSourceCommunityContext?.(null);
      renderer.clearInteraction();
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

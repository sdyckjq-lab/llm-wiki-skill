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
  Selection,
  SelectionInput,
  ThemeId
} from "./types";
import {
  buildGraphRendererAdapterData,
  createGraphRenderer,
  createSigmaGlobalRenderer,
  sigmaGlobalRendererRuntimeBoundary,
  type GraphRendererAdapterData,
  type SigmaGlobalRendererRuntime
} from "./render";
import type { GraphRendererSurface } from "./render/renderer-surface";
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

export type GraphFacadeRendererRouteId = "sigma-global" | "dom-svg-community" | "global-fallback";

export interface GraphFacadeRouteManager extends GraphFacadeRenderer {
  readonly routeId: GraphFacadeRendererRouteId;
  readonly sigmaKnownUnavailable: boolean;
  readonly sigmaAttemptCount: number;
}

export interface GraphFacadeRouteRendererOptions {
  data: GraphData;
  pins: NonNullable<GraphEngineOptions["pins"]>;
  theme: ThemeId;
  focus: GraphEngineOptions["focus"];
  typeFilters: NonNullable<GraphEngineOptions["typeFilters"]>;
  aggregationMarkers: NonNullable<GraphEngineOptions["aggregationMarkers"]>;
  selection: SelectionInput | null;
  searchResultIds: string[];
  temporaryObject: GraphSummaryObjectRef | null;
  callbacks: GraphFacadeRendererCallbacks;
}

export interface GraphFacadeRouteRendererFactoryInput {
  container: HTMLElement;
  options: GraphFacadeRouteRendererOptions;
  onSigmaUnavailable?: (error: unknown) => void;
}

export interface GraphFacadeRouteRendererFactories {
  createSigmaGlobal: (input: GraphFacadeRouteRendererFactoryInput) => GraphFacadeRenderer;
  createDomSvgCommunity: (input: GraphFacadeRouteRendererFactoryInput) => GraphFacadeRenderer;
  createGlobalFallback: (input: GraphFacadeRouteRendererFactoryInput) => GraphFacadeRenderer;
}

export interface GraphFacadeRendererCallbacks {
  onNodeOpen?: (nodeId: string) => void;
  onSelectionInput?: (selection: SelectionInput) => void;
  onPinsChanged?: (pins: NonNullable<GraphEngineOptions["pins"]>) => void;
  onSelectionClearRequested?: () => void;
  onViewReset?: () => void;
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
  state.searchResultIds = state.searchResultIds || [];
  state.temporaryObject = state.temporaryObject || null;

  const factories: GraphFacadeRouteRendererFactories = {
    createSigmaGlobal: options.factories?.createSigmaGlobal || createSigmaGlobalFacadeRenderer,
    createDomSvgCommunity: options.factories?.createDomSvgCommunity || ((input) =>
      createDomSvgFacadeRenderer(input, options.toolbarContainer, true)),
    createGlobalFallback: options.factories?.createGlobalFallback || ((input) =>
      createDomSvgFacadeRenderer(input, options.toolbarContainer, true))
  };
  let routeId: GraphFacadeRendererRouteId = "sigma-global";
  let sigmaKnownUnavailable = false;
  let sigmaAttemptCount = 0;
  let destroyed = false;
  let active: GraphFacadeRenderer | undefined;
  active = activateGlobalRoute();

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
      state.focus = null;
      switchToGlobalRoute();
      currentRenderer().resetView();
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
      return currentRenderer().setNodeFixed(id, mode);
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
      active?.destroy();
    }
  };

  return manager;

  function switchToGlobalRoute(): void {
    switchRoute(sigmaKnownUnavailable ? "global-fallback" : "sigma-global", activateGlobalRoute);
  }

  function activateGlobalRoute(): GraphFacadeRenderer {
    if (sigmaKnownUnavailable) {
      routeId = "global-fallback";
      return factories.createGlobalFallback(factoryInput());
    }
    sigmaAttemptCount += 1;
    routeId = "sigma-global";
    try {
      return factories.createSigmaGlobal(factoryInput((error) => {
        markSigmaUnavailable(error);
      }));
    } catch (error) {
      sigmaKnownUnavailable = true;
      routeId = "global-fallback";
      return factories.createGlobalFallback(factoryInput());
    }
  }

  function markSigmaUnavailable(_error: unknown): void {
    if (destroyed || sigmaKnownUnavailable) return;
    sigmaKnownUnavailable = true;
    if (routeId !== "sigma-global") return;
    switchRoute("global-fallback", () => factories.createGlobalFallback(factoryInput()));
  }

  function switchRoute(nextRouteId: GraphFacadeRendererRouteId, createNext: () => GraphFacadeRenderer): void {
    if (destroyed) return;
    if (routeId === nextRouteId && active) return;
    const previous = active;
    routeId = nextRouteId;
    active = createNext();
    previous?.destroy();
  }

  function factoryInput(onSigmaUnavailable?: (error: unknown) => void): GraphFacadeRouteRendererFactoryInput {
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
        searchResultIds: state.searchResultIds || [],
        temporaryObject: state.temporaryObject || null,
        callbacks: {
          ...(options.callbacks || {}),
          onVisibilityStateChange: (visibility) => {
            state.searchResultIds = visibility.searchResultIds;
            state.typeFilters = visibility.typeFilters;
            state.temporaryObject = visibility.temporaryObject;
            options.callbacks?.onVisibilityStateChange?.(visibility);
          }
        }
      },
      onSigmaUnavailable
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
    live,
    onNodeOpen: input.options.callbacks.onNodeOpen,
    onSelectionInput: input.options.callbacks.onSelectionInput,
    onPinsChanged: input.options.callbacks.onPinsChanged,
    onSelectionClearRequested: input.options.callbacks.onSelectionClearRequested,
    onViewReset: input.options.callbacks.onViewReset,
    onDragActiveChange: input.options.callbacks.onDragActiveChange,
    onVisibilityStateChange: input.options.callbacks.onVisibilityStateChange
  });
  if (input.options.selection) renderer.select(input.options.selection);
  if (input.options.temporaryObject) renderer.showTemporaryObject(input.options.temporaryObject);
  return renderer;
}

function createSigmaGlobalFacadeRenderer(input: GraphFacadeRouteRendererFactoryInput): GraphFacadeRenderer {
  let options = input.options;
  let destroyed = false;
  let renderer: ReturnType<typeof createSigmaGlobalRenderer> | null = null;
  const shell = input.container.ownerDocument.createElement("div");
  shell.className = "sigma-global-route";
  shell.dataset.route = "sigma-global";
  input.container.append(shell);

  void sigmaGlobalRendererRuntimeBoundary()
    .then((runtime) => {
      if (destroyed) return;
      try {
        renderer = createSigmaGlobalRenderer({
          container: shell,
          surface: createNoopRendererSurface(),
          adapterData: adapterDataForSigmaRoute(options),
          theme: options.theme,
          runtime: runtime as unknown as SigmaGlobalRendererRuntime,
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
      return false;
    },
    setData(data, pins) {
      options = { ...options, data, pins: pins || options.pins };
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
      options = { ...options, focus: null };
      updateSigmaRenderer();
    },
    select(selection) {
      options = { ...options, selection };
      updateSigmaRenderer();
    },
    previewNode() {},
    clearSelection() {
      options = { ...options, selection: null };
      updateSigmaRenderer();
    },
    clearInteraction() {
      options = { ...options, focus: null, selection: null, temporaryObject: null };
      updateSigmaRenderer();
    },
    setNodeFixed() {
      return false;
    },
    setTheme(theme) {
      options = { ...options, theme };
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
      theme: options.theme
    });
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

function createNoopRendererSurface(): GraphRendererSurface {
  return {
    focusRoot() {},
    focusNode() {},
    setNodeDragging() {},
    clearNodeDragging() {},
    setViewportDragging() {},
    setDragTarget() {},
    setFocusDataset() {},
    setSearchOpen() {},
    setSearchState() {}
  };
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
      renderer.setAggregationMarkers(markers);
    },

    focusNode(path: string): void {
      assertActive();
      container.dataset.llmWikiGraphFocus = path;
      renderer.focusNode(path);
    },

    focusCommunity(id): Selection {
      assertActive();
      container.dataset.llmWikiGraphFocus = `community:${id}`;
      renderer.focusCommunity(id);
      return resolveForHostCapabilities({ kind: "community", id });
    },

    setTypeFilters(filters): void {
      assertActive();
      renderer.setTypeFilters(filters);
    },

    showTemporaryObject(object): void {
      assertActive();
      renderer.showTemporaryObject(object);
    },

    clearTemporaryObjectDisplay(): void {
      assertActive();
      renderer.clearTemporaryObjectDisplay();
    },

    resetView(): void {
      assertActive();
      delete container.dataset.llmWikiGraphFocus;
      renderer.resetView();
      capabilities?.onViewReset?.();
    },

    select(selector: SelectionInput): Selection {
      assertActive();
      renderer.select(selector);
      return resolveForHostCapabilities(selector);
    },

    previewNode(id): void {
      assertActive();
      renderer.previewNode(id);
    },

    summarizeNode(id, summaryOptions) {
      assertActive();
      return summarizeGraphNode(facadeState.data, id, summaryOptionsWithPins(facadeState, summaryOptions));
    },

    summarizeCommunity(id, summaryOptions) {
      assertActive();
      return summarizeGraphCommunity(facadeState.data, id, summaryOptionsWithPins(facadeState, summaryOptions));
    },

    summarizeGlobal(summaryOptions) {
      assertActive();
      return summarizeGraphGlobal(facadeState.data, summaryOptionsWithPins(facadeState, summaryOptions));
    },

    summarizeSearchResults(query, resultIds, summaryOptions) {
      assertActive();
      return summarizeGraphSearchResults(facadeState.data, query, resultIds, summaryOptionsWithPins(facadeState, summaryOptions));
    },

    summarizeExcludedObject(
      object: GraphSummaryObjectRef,
      reason: Parameters<GraphEngine["summarizeExcludedObject"]>[1],
      summaryOptions?: GraphSummaryOptions
    ) {
      assertActive();
      return summarizeExcludedGraphObject(facadeState.data, object, reason, summaryOptionsWithPins(facadeState, summaryOptions));
    },

    summarizeUnavailableObject(
      object: GraphSummaryObjectRef,
      reason: Parameters<GraphEngine["summarizeUnavailableObject"]>[1],
      summaryOptions?: GraphSummaryOptions
    ) {
      assertActive();
      return summarizeUnavailableGraphObject(facadeState.data, object, reason, summaryOptionsWithPins(facadeState, summaryOptions));
    },

    clearSelection(): void {
      assertActive();
      renderer.clearSelection();
    },

    clearInteraction(): void {
      assertActive();
      renderer.clearInteraction();
      delete container.dataset.llmWikiGraphFocus;
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

function summaryOptionsWithPins(state: GraphFacadeState, options: GraphSummaryOptions = {}): GraphSummaryOptions {
  return {
    ...options,
    pins: options.pins ?? state.pins
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

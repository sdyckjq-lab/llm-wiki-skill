import type { GraphNode, GraphData, GraphTypeFilters, NodeId, PinMap, SelectionInput, ThemeId } from "../types";
import {
  buildGraphRendererAdapterData,
  buildCommunityLegend,
  nextToolbarPanelState,
  resolveGraphSearchState,
  readToolbarPanelState,
  writeToolbarPanelState,
  type GraphRendererAdapterData,
  type GraphGestureTarget
} from "../render";
import type { SigmaGlobalHitContext } from "../render/sigma-global-types";
import {
  createSigmaGlobalRenderer,
  sigmaGlobalRendererRuntimeBoundary,
  type SigmaGlobalRendererRuntime
} from "../render/sigma-global-renderer";
import {
  createCommunityLegend,
  createGraphToolbar,
  createSearchControl,
  createSigmaZoomControls,
  updateSearchControlResults,
  type GraphSearchResultControlItem
} from "../render/controls";
import { ensureGraphRendererStyles } from "../render/render-styles";
import { toggleNodeInSelection } from "../select";
import { wikiPathForGraphNode } from "../graph-node";
import { getThemeTokens, themeTokensToCssVars } from "../themes";
import type { GraphFacadeRenderer, GraphFacadeRouteRendererFactoryInput, GraphFacadeRouteRendererOptions } from "../facade";

const SEARCH_RESULT_CONTROL_LIMIT = 30;

export function selectionInputForSigmaHit(
  data: GraphData,
  current: SelectionInput | null | undefined,
  target: GraphGestureTarget,
  context: SigmaGlobalHitContext
): SelectionInput | null {
  if (target.kind === "node") {
    if (!target.id) return current ?? null;
    return context.additive
      ? toggleNodeInSelection(data, current, target.id)
      : { kind: "node", id: target.id };
  }
  if (target.kind === "community-wash") return target.id ? { kind: "community", id: target.id } : null;
  if (target.kind === "aggregation-container") return target.communityId ? { kind: "community", id: target.communityId } : null;
  return null;
}

export function createSigmaGlobalFacadeRenderer(input: GraphFacadeRouteRendererFactoryInput): GraphFacadeRenderer {
  let options = input.options;
  let destroyed = false;
  let renderer: ReturnType<typeof createSigmaGlobalRenderer> | null = null;
  let searchOpen = Boolean(options.searchQuery);
  let searchFocusedNodeId: string | null = null;
  let hoverNodeId: string | null = null;
  let legendCollapsed = false;
  let toolbarPanelState = readToolbarPanelState(input.container.ownerDocument.defaultView?.localStorage);
  let searchStatus: HTMLElement | null = null;
  let searchResultsList: HTMLElement | null = null;
  let currentSigmaAdapterData = adapterDataForSigmaRoute(options, hoverNodeId);
  const shell = input.container.ownerDocument.createElement("div");
  shell.className = "sigma-global-route llm-wiki-graph-engine";
  shell.dataset.route = "sigma-global";
  applyGraphThemeToElement(shell, options.theme);
  input.container.append(shell);
  ensureGraphRendererStyles(input.container.ownerDocument);
  const hiddenReadingNodeHint = input.container.ownerDocument.createElement("div");
  hiddenReadingNodeHint.className = "sigma-community-hidden-node-hint";
  hiddenReadingNodeHint.textContent = "当前节点被筛选隐藏";
  hiddenReadingNodeHint.setAttribute("aria-live", "polite");
  shell.append(hiddenReadingNodeHint);
  mountSigmaControls();
  syncHiddenReadingNodeHint();
  input.container.ownerDocument.addEventListener("keydown", handleDocumentKeyDown);

  void sigmaGlobalRendererRuntimeBoundary()
    .then((runtime) => {
      if (destroyed) return;
      try {
        renderer = createSigmaGlobalRenderer({
          container: shell,
          adapterData: currentSigmaAdapterData,
          theme: options.theme,
          edgeStyle: options.edgeStyle,
          runtime: runtime as unknown as SigmaGlobalRendererRuntime,
          pins: options.pins,
          onPinsChanged: handleSigmaPinsChanged,
          onDragActiveChange: input.options.callbacks.onDragActiveChange,
          onHitTarget: handleSigmaHitTarget,
          onNodeHover: handleSigmaNodeHover,
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
      options = optionsWithScopedSearch(clearStaleCommunitySelection({ ...options, data, pins: pins || options.pins })).options;
      syncVisibilityState();
      mountSigmaControls();
      updateSigmaRenderer();
    },
    setEdgeStyle(style) {
      options = { ...options, edgeStyle: style };
      updateSigmaRenderer();
    },
    setAggregationMarkers(markers) {
      options = { ...options, aggregationMarkers: markers };
      updateSigmaRenderer();
    },
    focusNode(path) {
      const node = options.data.nodes.find((item) => item.id === path || wikiPathForGraphNode(item) === path);
      hoverNodeId = null;
      options = { ...options, selection: node ? { kind: "node", id: node.id } : null };
      updateSigmaRenderer();
    },
    focusCommunity(id) {
      hoverNodeId = null;
      options = optionsWithScopedSearch({ ...options, focus: { kind: "community", id }, sourceCommunityId: id }).options;
      syncVisibilityState();
      updateSigmaRenderer();
    },
    setSourceCommunityContext(id) {
      options = { ...options, sourceCommunityId: id };
      updateSigmaRenderer();
    },
    setTypeFilters(filters) {
      options = optionsWithScopedSearch({ ...options, typeFilters: filters }).options;
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
      const wasCommunityReading = options.focus?.kind === "community";
      hoverNodeId = null;
      options = wasCommunityReading
        ? { ...options, focus: null, searchQuery: "", searchResultIds: [], typeFilters: {} }
        : { ...options, focus: null };
      syncVisibilityState();
      mountSigmaControls();
      updateSigmaSelection(null);
      renderer?.resetView();
    },
    select(selection) {
      updateSigmaSelection(selection);
    },
    previewNode() {},
    clearSelection() {
      // Blank clear removes both the active selection and any returned source
      // community highlight.
      options = { ...options, sourceCommunityId: null };
      updateSigmaSelection(null);
      input.options.callbacks.onSelectionClearRequested?.();
    },
    clearInteraction() {
      if (clearCommunityNodeInteraction()) return;
      hoverNodeId = null;
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
      applyGraphThemeToElement(shell, theme);
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
      input.container.ownerDocument.removeEventListener("keydown", handleDocumentKeyDown);
      renderer?.destroy();
      renderer = null;
      shell.remove();
    }
  };

  function updateSigmaRenderer(): void {
    currentSigmaAdapterData = adapterDataForSigmaRoute(options, hoverNodeId);
    syncHiddenReadingNodeHint();
    if (!renderer || destroyed) return;
    renderer.update({
      adapterData: currentSigmaAdapterData,
      theme: options.theme,
      edgeStyle: options.edgeStyle,
      pins: options.pins
    });
  }

  function updateSigmaSelection(selection: SelectionInput | null): void {
    options = { ...options, selection };
    syncVisibilityState();
    updateSigmaRenderer();
  }

  function handleSigmaPinsChanged(pins: PinMap): void {
    options = { ...options, pins };
    input.options.callbacks.onPinsChanged?.(pins);
    updateSigmaRenderer();
  }

  function handleSigmaHitTarget(target: GraphGestureTarget, context: SigmaGlobalHitContext): void {
    if (options.focus?.kind === "community" && target.kind === "node" && target.id) {
      selectOnSigma({ kind: "node", id: target.id });
      input.options.callbacks.onNodeOpen?.(target.id);
      return;
    }
    if (options.focus?.kind === "community" && target.kind === "graph-blank") {
      clearCommunityNodeInteraction();
      return;
    }
    const nextSelection = selectionInputForSigmaHit(options.data, options.selection, target, context);
    if (nextSelection) {
      selectOnSigma(nextSelection);
      return;
    }
    switch (target.kind) {
      case "node":
      case "community-wash":
      case "aggregation-container":
        options = { ...options, sourceCommunityId: null };
        input.options.callbacks.onSelectionClearRequested?.();
        updateSigmaSelection(null);
        break;
      case "edge":
        break;
      case "graph-blank":
        const shouldResetCamera = options.selection?.kind === "community";
        options = { ...options, temporaryObject: null, sourceCommunityId: null };
        input.options.callbacks.onSelectionClearRequested?.();
        updateSigmaSelection(null);
        if (shouldResetCamera) renderer?.resetView();
        break;
    }
  }

  function selectOnSigma(selection: SelectionInput): void {
    hoverNodeId = null;
    input.options.callbacks.onSelectionInput?.(selection);
    updateSigmaSelection(selection);
  }

  function handleSigmaNodeHover(nodeId: string | null): void {
    const nextHoverNodeId = options.focus?.kind === "community" ? nodeId : null;
    if (hoverNodeId === nextHoverNodeId) return;
    hoverNodeId = nextHoverNodeId;
    updateSigmaRenderer();
  }

  function handleDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (!isGraphRouteKeyboardTarget(event.target)) return;
    if (options.focus?.kind !== "community") return;
    if (options.selection?.kind !== "node" && !hoverNodeId && !options.temporaryObject) return;
    clearCommunityNodeInteraction();
  }

  function clearCommunityNodeInteraction(): boolean {
    if (options.focus?.kind !== "community") return false;
    hoverNodeId = null;
    options = { ...options, selection: null, temporaryObject: null };
    input.options.callbacks.onSelectionClearRequested?.();
    syncVisibilityState();
    updateSigmaRenderer();
    return true;
  }

  function isGraphRouteKeyboardTarget(target: EventTarget | null): boolean {
    if (!target) return true;
    const ownerDocument = input.container.ownerDocument;
    if (target === ownerDocument || target === ownerDocument.body || target === ownerDocument.documentElement) return true;
    if (typeof shell.contains !== "function" || typeof (target as { nodeType?: unknown }).nodeType !== "number") return false;
    return shell.contains(target as Node);
  }

  function mountSigmaControls(): void {
    shell.dataset.theme = options.theme;
    shell.dataset.searchOpen = searchOpen ? "true" : "false";
    shell.querySelector(".graph-search")?.remove();
    shell.querySelector(".graph-toolbar")?.remove();
    shell.querySelector(".graph-zoom-controls")?.remove();
    let searchControl: ReturnType<typeof createSearchControl> | null = null;
    const search = createSearchControl(input.container.ownerDocument, {
      open: searchOpen,
      query: options.searchQuery,
      onOpen: () => {
        searchOpen = true;
        shell.dataset.searchOpen = "true";
        if (searchControl) searchControl.element.dataset.state = "open";
      },
      onQuery: applySearchQuery,
      onNext: () => focusSearchResult("next"),
      onPrevious: () => focusSearchResult("previous"),
      onActivate: activateSearchResult,
      onActivateResult: activateSearchResultById,
      onClose: () => {
        searchOpen = false;
        searchFocusedNodeId = null;
        if (searchControl) {
          searchControl.element.dataset.state = "closed";
          searchControl.input.value = "";
        }
        applySearchQuery("");
      },
      results: searchResultsForControl(options, searchFocusedNodeId)
    });
    searchControl = search;
    shell.prepend(search.element);
    searchStatus = search.status;
    searchResultsList = search.results;
    updateSearchStatus(search.status);
    updateSearchResultsList();

    const adapterData = currentSigmaAdapterData;
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
      typeFilters: typeFiltersForRouteControls(options),
      onPanelToggle: (panel) => {
        toolbarPanelState = nextToolbarPanelState(toolbarPanelState, panel);
        writeToolbarPanelState(input.container.ownerDocument.defaultView?.localStorage, toolbarPanelState);
        mountSigmaControls();
      },
      onTypeFilterToggle: (type, enabled) => {
        options = optionsWithScopedSearch({
          ...options,
          typeFilters: { ...typeFiltersForRouteControls(options), [type]: enabled }
        }).options;
        syncVisibilityState();
        mountSigmaControls();
        updateSigmaRenderer();
      },
      onReset: () => {
        input.options.callbacks.onGlobalResetRequested?.();
      }
    });
    toolbar.filtersPanel.appendChild(communityLegend.element);
    shell.prepend(toolbar.element);

    const zoomControls = createSigmaZoomControls(input.container.ownerDocument, {
      onZoomIn: () => renderer?.zoomIn(),
      onZoomOut: () => renderer?.zoomOut()
    });
    shell.prepend(zoomControls.element);
  }

  function applySearchQuery(query: string): void {
    const state = resolveScopedSearchState(options, query);
    options = { ...options, searchQuery: state.query, searchResultIds: state.matchIds };
    if (!state.matchIds.includes(searchFocusedNodeId || "")) searchFocusedNodeId = null;
    syncVisibilityState();
    if (searchStatus) updateSearchStatus(searchStatus);
    updateSearchResultsList();
    updateSigmaRenderer();
  }

  function focusSearchResult(direction: "next" | "previous"): void {
    const state = resolveScopedSearchState(options, options.searchQuery);
    const index = searchFocusedNodeId ? state.matchIds.indexOf(searchFocusedNodeId) : -1;
    if (!state.matchIds.length) return;
    const nextIndex = direction === "next"
      ? (index + 1 + state.matchIds.length) % state.matchIds.length
      : (index - 1 + state.matchIds.length) % state.matchIds.length;
    searchFocusedNodeId = state.matchIds[nextIndex];
    mountSigmaControls();
  }

  function activateSearchResult(): void {
    const state = resolveScopedSearchState(options, options.searchQuery);
    const id = searchFocusedNodeId || state.matchIds[0];
    if (!id) return;
    activateSearchResultById(id);
  }

  function activateSearchResultById(id: NodeId): void {
    searchFocusedNodeId = id;
    selectOnSigma({ kind: "node", id });
    if (options.focus?.kind === "community") input.options.callbacks.onNodeOpen?.(id);
    if (searchStatus) updateSearchStatus(searchStatus);
    updateSearchResultsList();
  }

  function syncVisibilityState(): void {
    const hiddenReadingNodeId = hiddenReadingNodeIdForOptions(options);
    input.options.callbacks.onVisibilityStateChange?.({
      searchQuery: options.searchQuery,
      searchResultIds: options.searchResultIds,
      typeFilters: options.typeFilters,
      temporaryObject: options.temporaryObject,
      focusCommunityId: options.focus?.kind === "community" ? options.focus.id : null,
      hiddenReadingNodeId
    });
    syncHiddenReadingNodeHint(hiddenReadingNodeId);
  }

  function updateSearchStatus(status: HTMLElement): void {
    const state = resolveScopedSearchState(options, options.searchQuery);
    const focusedIndex = searchFocusedNodeId ? state.matchIds.indexOf(searchFocusedNodeId) : -1;
    status.textContent = state.query
      ? `${state.matchIds.length} 个结果${focusedIndex >= 0 ? ` · ${focusedIndex + 1}/${state.matchIds.length}` : ""}`
      : "输入关键词";
  }

  function updateSearchResultsList(): void {
    if (!searchResultsList) return;
    updateSearchControlResults(searchResultsList, searchResultsForControl(options, searchFocusedNodeId), activateSearchResultById);
  }

  function syncHiddenReadingNodeHint(hiddenReadingNodeId = hiddenReadingNodeIdForOptions(options)): void {
    const hidden = Boolean(hiddenReadingNodeId);
    shell.dataset.hiddenReadingNode = hidden ? "true" : "false";
    shell.dataset.hiddenReadingNodeId = hiddenReadingNodeId || "";
    hiddenReadingNodeHint.dataset.state = hidden ? "visible" : "hidden";
  }
}

function optionsWithScopedSearch(
  options: GraphFacadeRouteRendererOptions,
  query = options.searchQuery
): { options: GraphFacadeRouteRendererOptions; matchIds: NodeId[] } {
  const state = resolveScopedSearchState(options, query);
  return {
    options: {
      ...options,
      searchQuery: state.query,
      searchResultIds: state.matchIds
    },
    matchIds: state.matchIds
  };
}

function resolveScopedSearchState(options: GraphFacadeRouteRendererOptions, query: string): ReturnType<typeof resolveGraphSearchState> {
  return resolveGraphSearchState(searchNodesForRouteScope(options), query);
}

function searchResultsForControl(
  options: GraphFacadeRouteRendererOptions,
  focusedNodeId: NodeId | null
): GraphSearchResultControlItem[] {
  const state = resolveScopedSearchState(options, options.searchQuery);
  if (!state.query) return [];
  const nodesById = new Map(options.data.nodes.map((node) => [node.id, node]));
  return state.matchIds.slice(0, SEARCH_RESULT_CONTROL_LIMIT).map((id) => {
    const node = nodesById.get(id);
    return {
      id,
      label: node?.label || id,
      meta: node?.type,
      focused: id === focusedNodeId
    };
  });
}

function searchNodesForRouteScope(options: GraphFacadeRouteRendererOptions): GraphNode[] {
  if (options.focus?.kind !== "community") return options.data.nodes;
  return options.data.nodes.filter((node) =>
    node.community === options.focus?.id &&
    typeFilterAllowsNode(node, options.typeFilters)
  );
}

function hiddenReadingNodeIdForOptions(options: GraphFacadeRouteRendererOptions): NodeId | null {
  const focus = options.focus;
  const selection = options.selection;
  if (focus?.kind !== "community" || selection?.kind !== "node") return null;
  const node = options.data.nodes.find((item) => item.id === selection.id);
  if (!node || node.community !== focus.id) return null;
  return typeFilterAllowsNode(node, options.typeFilters) ? null : node.id;
}

function clearStaleCommunitySelection(options: GraphFacadeRouteRendererOptions): GraphFacadeRouteRendererOptions {
  const focus = options.focus;
  const selection = options.selection;
  if (focus?.kind !== "community" || selection?.kind !== "node") return options;
  const node = options.data.nodes.find((item) => item.id === selection.id);
  if (node && node.community === focus.id) return options;
  return {
    ...options,
    selection: null,
    temporaryObject: null
  };
}

function typeFilterAllowsNode(node: GraphNode, typeFilters: GraphTypeFilters): boolean {
  return typeFilters[node.type] !== false;
}

function typeFiltersForRouteControls(options: GraphFacadeRouteRendererOptions): GraphTypeFilters {
  const filters: GraphTypeFilters = {};
  const nodes = options.focus?.kind === "community"
    ? options.data.nodes.filter((node) => node.community === options.focus?.id)
    : options.data.nodes;
  for (const node of nodes) {
    filters[node.type] = options.typeFilters[node.type] ?? true;
  }
  return filters;
}

function adapterDataForSigmaRoute(options: GraphFacadeRouteRendererOptions, hoverNodeId: string | null = null): GraphRendererAdapterData {
  return buildGraphRendererAdapterData(options.data, {
    theme: options.theme,
    pins: options.pins,
    selection: options.selection,
    searchResultIds: options.searchResultIds,
    aggregationMarkers: options.aggregationMarkers,
    focus: options.focus,
    typeFilters: options.typeFilters,
    sourceCommunityId: options.sourceCommunityId,
    relationFocusNodeId: hoverNodeId
  });
}

function applyGraphThemeToElement(element: HTMLElement, theme: ThemeId): void {
  element.dataset.theme = theme;
  element.style.colorScheme = getThemeTokens(theme).colorScheme;
  const vars = themeTokensToCssVars(theme);
  for (const [key, value] of Object.entries(vars)) {
    element.style.setProperty(key, value);
  }
}

function numericNodeCoordinate(value: GraphNode["x"] | GraphNode["y"]): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

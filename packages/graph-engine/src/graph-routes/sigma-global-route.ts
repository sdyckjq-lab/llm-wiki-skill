import type { GraphNode, GraphData, GraphSummaryObjectRef, GraphTypeFilters, NodeId, PinMap, SelectionInput, ThemeId } from "../types";
import {
  buildGraphRendererAdapterData,
  buildCommunityLegend,
  nextToolbarPanelState,
  resolveGraphSearchState,
  readToolbarPanelState,
  writeToolbarPanelState,
  GRAPH_GESTURE_SELECTORS,
  type GraphRendererAdapterData,
  type GraphGestureTarget,
  type RendererViewportSize
} from "../render";
import type { SigmaGlobalHitContext } from "../render/sigma-global-types";
import {
  createSigmaGlobalRenderer,
  sigmaGlobalRendererRuntimeBoundary,
  type SigmaGlobalRendererRuntime
} from "../render/sigma-global-renderer";
import { SIGMA_COMMUNITY_RETURN_GLOBAL_TRANSITION_MS } from "../graph-transition-timings";
import {
  createCommunityLegend,
  createGraphToolbar,
  createSearchControl,
  createSigmaZoomControls,
  updateSearchControlResults,
  type GraphSearchResultControlItem
} from "../render/controls";
import { createEdgeHoverPreviewContent } from "../render/hover-card";
import { ensureGraphRendererStyles } from "../render/render-styles";
import { toggleNodeInSelection } from "../select";
import { wikiPathForGraphNode } from "../graph-node";
import { getThemeTokens, themeTokensToCssVars } from "../themes";
import type { GraphFacadeRenderer, GraphFacadeRouteRendererFactoryInput, GraphFacadeRouteRendererOptions } from "../facade";

const SEARCH_RESULT_CONTROL_LIMIT = 30;
const SIGMA_ROUTE_CONTROL_KEYBOARD_SELECTOR = [
  GRAPH_GESTURE_SELECTORS.search,
  GRAPH_GESTURE_SELECTORS.toolbar,
  GRAPH_GESTURE_SELECTORS.legend,
  GRAPH_GESTURE_SELECTORS.drawer,
  GRAPH_GESTURE_SELECTORS.textControl
].join(",");

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

export type SigmaGlobalHitAction =
  | { kind: "select"; selection: SelectionInput }
  | { kind: "clear"; resetCamera: boolean }
  | { kind: "none" };

export function sigmaGlobalHitActionForSigmaHit(
  data: GraphData,
  current: SelectionInput | null | undefined,
  target: GraphGestureTarget,
  context: SigmaGlobalHitContext,
  sourceCommunityId: string | null | undefined
): SigmaGlobalHitAction {
  if (target.kind === "node" && target.id && sourceCommunityId) {
    return { kind: "select", selection: { kind: "node", id: target.id } };
  }
  const nextSelection = selectionInputForSigmaHit(data, current, target, context);
  if (nextSelection) return { kind: "select", selection: nextSelection };
  if (target.kind === "graph-blank") {
    if (current?.kind === "node" && sourceCommunityId && nodeBelongsToCommunity(data, current.id, sourceCommunityId)) {
      return { kind: "select", selection: { kind: "community", id: sourceCommunityId } };
    }
    return { kind: "clear", resetCamera: current?.kind === "community" || sourceCommunityId != null };
  }
  if (target.kind === "node" || target.kind === "community-wash" || target.kind === "aggregation-container") {
    return { kind: "clear", resetCamera: false };
  }
  return { kind: "none" };
}

export type SigmaCommunityReadingHitAction =
  | { kind: "select"; selection: SelectionInput; relationFocusNodeId: NodeId | null }
  | { kind: "open-node"; nodeId: NodeId; selection: SelectionInput }
  | { kind: "edge-preview"; edgeId: string }
  | { kind: "clear" }
  | { kind: "none" };

export function sigmaCommunityReadingHitActionForSigmaHit(
  data: GraphData,
  current: SelectionInput | null | undefined,
  target: GraphGestureTarget,
  context: SigmaGlobalHitContext
): SigmaCommunityReadingHitAction {
  if (target.kind === "graph-blank" || target.kind === "community-wash") return { kind: "clear" };
  if (target.kind === "edge") return target.id ? { kind: "edge-preview", edgeId: target.id } : { kind: "none" };
  if (target.kind !== "node" || !target.id) return { kind: "none" };
  if (!context.additive) {
    return {
      kind: "open-node",
      nodeId: target.id,
      selection: { kind: "node", id: target.id }
    };
  }
  const selection = communityReadingSelectionInputForAdditiveNodeHit(data, current, target.id);
  // #136 Shift multi-select: do NOT pin single-node relation focus to the
  // last-clicked node (that would fan out its first-degree edges, violating
  // "only real relations between selected nodes"). Pass null so the model
  // drives emphasis from between-selected real edges instead. A subsequent
  // hover still previews a single node's first-degree relations transiently.
  return selection ? { kind: "select", selection, relationFocusNodeId: null } : { kind: "clear" };
}

export function createSigmaGlobalFacadeRenderer(input: GraphFacadeRouteRendererFactoryInput): GraphFacadeRenderer {
  let options = input.options;
  let destroyed = false;
  let renderer: ReturnType<typeof createSigmaGlobalRenderer> | null = null;
  let searchOpen = Boolean(options.searchQuery);
  let searchFocusedNodeId: string | null = null;
  let communityTypeFilters: GraphTypeFilters = {};
  let communityTypeFilterFocusId: string | null = options.focus?.kind === "community" ? options.focus.id : null;
  let hoverNodeId: string | null = null;
  let hoverEdgeId: string | null = null;
  let legendCollapsed = false;
  let toolbarPanelState = readToolbarPanelState(input.container.ownerDocument.defaultView?.localStorage);
  let searchStatus: HTMLElement | null = null;
  let searchResultsList: HTMLElement | null = null;
  const shell = input.container.ownerDocument.createElement("div");
  shell.className = "sigma-global-route llm-wiki-graph-engine";
  shell.dataset.route = "sigma-global";
  applyGraphThemeToElement(shell, options.theme);
  input.container.append(shell);
  ensureGraphRendererStyles(input.container.ownerDocument);
  let observedViewportSize = measuredViewportSize(shell) ?? measuredViewportSize(input.container);
  let currentSigmaAdapterData = adapterDataForSigmaRoute(options, hoverNodeId, typeFiltersForCurrentRoute(), sigmaRouteViewportSize());
  const hiddenReadingNodeHint = input.container.ownerDocument.createElement("div");
  hiddenReadingNodeHint.className = "sigma-community-hidden-node-hint";
  hiddenReadingNodeHint.textContent = "当前节点被筛选隐藏";
  hiddenReadingNodeHint.setAttribute("aria-live", "polite");
  shell.append(hiddenReadingNodeHint);
  const edgeHoverPreview = input.container.ownerDocument.createElement("div");
  edgeHoverPreview.className = "graph-hover-preview sigma-edge-hover-preview";
  edgeHoverPreview.dataset.state = "closed";
  shell.append(edgeHoverPreview);
  mountSigmaControls();
  syncHiddenReadingNodeHint();
  input.container.ownerDocument.addEventListener("keydown", handleDocumentKeyDown);

  const runtimeBoundary = input.sigmaRuntime
    ? Promise.resolve(input.sigmaRuntime)
    : sigmaGlobalRendererRuntimeBoundary();
  void runtimeBoundary
    .then((runtime) => {
      if (destroyed) return;
      try {
        currentSigmaAdapterData = adapterDataForSigmaRoute(options, hoverNodeId, typeFiltersForCurrentRoute(), sigmaRouteViewportSize());
        renderer = createSigmaGlobalRenderer({
          container: shell,
          adapterData: currentSigmaAdapterData,
          theme: options.theme,
          edgeStyle: options.edgeStyle,
          runtime: runtime as unknown as SigmaGlobalRendererRuntime,
          viewportSize: sigmaRouteViewportSize(),
          pins: options.pins,
          onPinsChanged: handleSigmaPinsChanged,
          onDragActiveChange: input.options.callbacks.onDragActiveChange,
          onHitTarget: handleSigmaHitTarget,
          onNodeHover: handleSigmaNodeHover,
          onEdgeHover: handleSigmaEdgeHover,
          onViewportSizeChange: handleSigmaViewportSizeChange,
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
      options = applyScopedSearch(clearStaleCommunitySelection({ ...options, data, pins: pins || options.pins }));
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
      clearSigmaTransientHoverState();
      options = { ...options, selection: node ? { kind: "node", id: node.id } : null };
      updateSigmaRenderer();
    },
    focusCommunity(id) {
      clearSigmaTransientHoverState();
      ensureCommunityTypeFilterScope(id);
      const temporaryObject = temporaryObjectCompatibleWithCommunity(options.data, options.temporaryObject, id)
        ? options.temporaryObject
        : null;
      options = applyScopedSearch({ ...options, focus: { kind: "community", id }, sourceCommunityId: id, temporaryObject });
      syncVisibilityState();
      updateSigmaRenderer();
    },
    setSourceCommunityContext(id) {
      options = { ...options, sourceCommunityId: id };
      updateSigmaRenderer();
    },
    setTypeFilters(filters) {
      options = applyScopedSearch({ ...options, typeFilters: filters });
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
    resetView(resetOptions?: { onComplete?: () => void; onCancel?: () => void; onCleanup?: () => void }) {
      const wasCommunityReading = options.focus?.kind === "community";
      const shouldDelayGlobalCommunityClear = !wasCommunityReading && options.selection?.kind === "community";
      clearSigmaTransientHoverState();
      if (wasCommunityReading) clearCommunityTypeFilterScope();
      options = wasCommunityReading
        ? applyScopedSearch({ ...options, focus: null, searchQuery: "", searchResultIds: [], temporaryObject: null }, "")
        : { ...options, focus: null };
      syncVisibilityState();
      mountSigmaControls();
      if (shouldDelayGlobalCommunityClear) {
        renderer?.resetView({
          onComplete: () => {
            options = { ...options, sourceCommunityId: null };
            updateSigmaSelection(null);
            resetOptions?.onComplete?.();
          },
          onCancel: resetOptions?.onCancel,
          onCleanup: resetOptions?.onCleanup
        });
        if (!renderer) {
          options = { ...options, sourceCommunityId: null };
          updateSigmaSelection(null);
          resetOptions?.onComplete?.();
          resetOptions?.onCleanup?.();
        }
        return;
      }
      updateSigmaSelection(null);
      renderer?.resetView(wasCommunityReading
        ? { ...resetOptions, durationMs: SIGMA_COMMUNITY_RETURN_GLOBAL_TRANSITION_MS }
        : resetOptions);
    },
    accommodateNodeDrawer(nodeId: string, options?: { durationMs?: number }) {
      renderer?.accommodateNodeDrawer(nodeId, options);
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
      clearSigmaTransientHoverState();
      options = { ...options, focus: null, selection: null, temporaryObject: null };
      updateSigmaRenderer();
    },
    setNodeFixed(id, mode) {
      const node = options.data.nodes.find((item) => item.id === id);
      if (!node) return false;
      const path = wikiPathForGraphNode(node);
      const nextPins: PinMap = { ...options.pins };
      if (mode === "fix") {
        const adapterNode = adapterDataForSigmaRoute(options, null, typeFiltersForCurrentRoute(), sigmaRouteViewportSize()).nodes.find((item) => item.id === id);
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
    const viewportSize = sigmaRouteViewportSize();
    currentSigmaAdapterData = adapterDataForSigmaRoute(options, hoverNodeId, typeFiltersForCurrentRoute(), viewportSize);
    syncSigmaEdgeHoverPreview();
    syncHiddenReadingNodeHint();
    if (!renderer || destroyed) return;
    renderer.update({
      adapterData: currentSigmaAdapterData,
      theme: options.theme,
      edgeStyle: options.edgeStyle,
      pins: options.pins,
      viewportSize
    });
  }

  function sigmaRouteViewportSize(): RendererViewportSize | undefined {
    return observedViewportSize ?? measuredViewportSize(shell) ?? measuredViewportSize(input.container);
  }

  function handleSigmaViewportSizeChange(size: RendererViewportSize): void {
    observedViewportSize = size;
    updateSigmaRenderer();
  }

  function updateSigmaSelection(selection: SelectionInput | null): void {
    options = {
      ...options,
      selection,
      sourceCommunityId: selection?.kind === "community" ? selection.id : options.sourceCommunityId
    };
    syncVisibilityState();
    updateSigmaRenderer();
  }

  function handleSigmaPinsChanged(pins: PinMap): void {
    options = { ...options, pins };
    input.options.callbacks.onPinsChanged?.(pins);
    updateSigmaRenderer();
  }

  function handleSigmaHitTarget(target: GraphGestureTarget, context: SigmaGlobalHitContext): void {
    if (options.focus?.kind === "community") {
      const action = sigmaCommunityReadingHitActionForSigmaHit(options.data, options.selection, target, context);
      if (action.kind === "select") {
        selectOnSigma(action.selection, action.relationFocusNodeId);
        return;
      }
      if (action.kind === "open-node") {
        hoverEdgeId = null;
        syncSigmaEdgeHoverPreview();
        selectOnSigma(action.selection);
        input.options.callbacks.onNodeOpen?.(action.nodeId, "community-node-click");
        return;
      }
      if (action.kind === "edge-preview") {
        showSigmaEdgePreview(action.edgeId);
        return;
      }
      if (action.kind === "clear") {
        clearCommunityNodeInteraction();
        return;
      }
      return;
    }
    const action = sigmaGlobalHitActionForSigmaHit(options.data, options.selection, target, context, options.sourceCommunityId);
    if (action.kind === "select") {
      selectOnSigma(action.selection);
      return;
    }
    if (action.kind === "clear") {
      options = { ...options, temporaryObject: null, sourceCommunityId: null };
      input.options.callbacks.onSelectionClearRequested?.();
      updateSigmaSelection(null);
      if (action.resetCamera) renderer?.resetView();
    }
  }

  function selectOnSigma(selection: SelectionInput, relationFocusNodeId: NodeId | null = null): void {
    hoverEdgeId = null;
    syncSigmaEdgeHoverPreview();
    hoverNodeId = relationFocusNodeId;
    if (options.focus?.kind !== "community") renderer?.setRelationFocusPreview(null);
    input.options.callbacks.onSelectionInput?.(selection);
    updateSigmaSelection(selection);
  }

  function handleSigmaNodeHover(nodeId: string | null): void {
    const nextHoverNodeId = nodeId;
    if (hoverNodeId === nextHoverNodeId) return;
    if (nextHoverNodeId) {
      hoverEdgeId = null;
      syncSigmaEdgeHoverPreview();
    }
    hoverNodeId = nextHoverNodeId;
    if (options.focus?.kind === "community") {
      updateSigmaRenderer();
      return;
    }
    renderer?.setRelationFocusPreview(nextHoverNodeId);
  }

  function handleSigmaEdgeHover(edgeId: string | null): void {
    const nextHoverEdgeId = options.focus?.kind === "community" ? edgeId : null;
    if (hoverEdgeId === nextHoverEdgeId) return;
    hoverEdgeId = nextHoverEdgeId;
    syncSigmaEdgeHoverPreview();
  }

  function showSigmaEdgePreview(edgeId: string): void {
    if (options.focus?.kind !== "community") return;
    hoverNodeId = null;
    hoverEdgeId = edgeId;
    syncSigmaEdgeHoverPreview();
  }

  function clearSigmaTransientHoverState(): void {
    hoverNodeId = null;
    hoverEdgeId = null;
    if (options.focus?.kind !== "community") renderer?.setRelationFocusPreview(null);
    syncSigmaEdgeHoverPreview();
  }

  function handleDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (!isGraphRouteKeyboardTarget(event.target)) return;
    if (options.focus?.kind !== "community") return;
    if (options.selection?.kind !== "node" && !hoverNodeId && !hoverEdgeId && !options.temporaryObject) return;
    clearCommunityNodeInteraction();
  }

  function clearCommunityNodeInteraction(): boolean {
    if (options.focus?.kind !== "community") return false;
    hoverNodeId = null;
    hoverEdgeId = null;
    options = { ...options, selection: null, temporaryObject: null };
    input.options.callbacks.onSelectionClearRequested?.();
    syncSigmaEdgeHoverPreview();
    syncVisibilityState();
    updateSigmaRenderer();
    return true;
  }

  function isGraphRouteKeyboardTarget(target: EventTarget | null): boolean {
    if (!target) return true;
    const ownerDocument = input.container.ownerDocument;
    if (target === ownerDocument || target === ownerDocument.body || target === ownerDocument.documentElement) return true;
    if (isSigmaRouteControlKeyboardTarget(target)) return false;
    if (typeof shell.contains !== "function" || typeof (target as { nodeType?: unknown }).nodeType !== "number") return false;
    return shell.contains(target as Node);
  }

  function isSigmaRouteControlKeyboardTarget(target: EventTarget): boolean {
    const closest = (target as { closest?: (selector: string) => Element | null }).closest;
    if (typeof closest === "function" && closest.call(target, SIGMA_ROUTE_CONTROL_KEYBOARD_SELECTOR)) {
      return true;
    }

    let current: SigmaRouteKeyboardTargetLike | null = target as SigmaRouteKeyboardTargetLike;
    while (current) {
      if (isSigmaRouteTextControl(current)) return true;
      if (hasSigmaRouteClass(current, "graph-search")) return true;
      if (hasSigmaRouteClass(current, "graph-toolbar")) return true;
      if (hasSigmaRouteClass(current, "community-legend")) return true;
      if (hasSigmaRouteClass(current, "graph-reader")) return true;
      if (hasSigmaRouteClass(current, "graph-selection-panel")) return true;
      if (current.dataset?.graphDrawer === "true" || current.getAttribute?.("data-graph-drawer") === "true") return true;
      current = current.parentElement ?? null;
    }
    return false;
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
      results: searchResultsForControl(options, searchFocusedNodeId, typeFiltersForCurrentRoute())
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
      typeFilters: typeFiltersForRouteControls(options, typeFiltersForCurrentRoute()),
      onPanelToggle: (panel) => {
        toolbarPanelState = nextToolbarPanelState(toolbarPanelState, panel);
        writeToolbarPanelState(input.container.ownerDocument.defaultView?.localStorage, toolbarPanelState);
        mountSigmaControls();
      },
      onTypeFilterToggle: (type, enabled) => {
        if (options.focus?.kind === "community") {
          communityTypeFilters = { ...typeFiltersForRouteControls(options, communityTypeFilters), [type]: enabled };
          options = applyScopedSearch(options);
        } else {
          options = applyScopedSearch({
            ...options,
            typeFilters: { ...typeFiltersForRouteControls(options, options.typeFilters), [type]: enabled }
          });
        }
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
    options = applyScopedSearch(options, query);
    syncVisibilityState();
    if (searchStatus) updateSearchStatus(searchStatus);
    updateSearchResultsList();
    updateSigmaRenderer();
  }

  function focusSearchResult(direction: "next" | "previous"): void {
    const state = resolveScopedSearchState(options, options.searchQuery, typeFiltersForCurrentRoute());
    const index = searchFocusedNodeId ? state.matchIds.indexOf(searchFocusedNodeId) : -1;
    if (!state.matchIds.length) return;
    const nextIndex = direction === "next"
      ? (index + 1 + state.matchIds.length) % state.matchIds.length
      : (index - 1 + state.matchIds.length) % state.matchIds.length;
    searchFocusedNodeId = state.matchIds[nextIndex];
    mountSigmaControls();
  }

  function activateSearchResult(): void {
    const state = resolveScopedSearchState(options, options.searchQuery, typeFiltersForCurrentRoute());
    const id = searchFocusedNodeId && state.matchIds.includes(searchFocusedNodeId)
      ? searchFocusedNodeId
      : state.matchIds[0];
    if (!id) return;
    activateSearchResultById(id);
  }

  function activateSearchResultById(id: NodeId): void {
    const state = resolveScopedSearchState(options, options.searchQuery, typeFiltersForCurrentRoute());
    if (state.query && !state.matchIds.includes(id)) {
      searchFocusedNodeId = null;
      if (searchStatus) updateSearchStatus(searchStatus);
      updateSearchResultsList();
      return;
    }
    searchFocusedNodeId = state.matchIds.includes(id) ? id : null;
    selectOnSigma({ kind: "node", id });
    if (options.focus?.kind === "community") input.options.callbacks.onNodeOpen?.(id, "community-search-result");
    if (searchStatus) updateSearchStatus(searchStatus);
    updateSearchResultsList();
  }

  function syncVisibilityState(): void {
    const typeFilters = typeFiltersForCurrentRoute();
    const hiddenReadingNodeId = hiddenReadingNodeIdForOptions(options, typeFilters);
    input.options.callbacks.onVisibilityStateChange?.({
      searchQuery: options.searchQuery,
      searchResultIds: options.searchResultIds,
      typeFilters,
      temporaryObject: options.temporaryObject,
      focusCommunityId: options.focus?.kind === "community" ? options.focus.id : null,
      hiddenReadingNodeId
    });
    syncHiddenReadingNodeHint(hiddenReadingNodeId);
  }

  function updateSearchStatus(status: HTMLElement): void {
    const state = resolveScopedSearchState(options, options.searchQuery, typeFiltersForCurrentRoute());
    const focusedIndex = searchFocusedNodeId ? state.matchIds.indexOf(searchFocusedNodeId) : -1;
    status.textContent = state.query
      ? `${state.matchIds.length} 个结果${focusedIndex >= 0 ? ` · ${focusedIndex + 1}/${state.matchIds.length}` : ""}`
      : "输入关键词";
  }

  function updateSearchResultsList(): void {
    if (!searchResultsList) return;
    updateSearchControlResults(searchResultsList, searchResultsForControl(options, searchFocusedNodeId, typeFiltersForCurrentRoute()), activateSearchResultById);
  }

  function syncHiddenReadingNodeHint(hiddenReadingNodeId = hiddenReadingNodeIdForOptions(options, typeFiltersForCurrentRoute())): void {
    const hidden = Boolean(hiddenReadingNodeId);
    shell.dataset.hiddenReadingNode = hidden ? "true" : "false";
    shell.dataset.hiddenReadingNodeId = hiddenReadingNodeId || "";
    hiddenReadingNodeHint.dataset.state = hidden ? "visible" : "hidden";
  }

  function syncSigmaEdgeHoverPreview(): void {
    const edge = options.focus?.kind === "community" && hoverEdgeId
      ? currentSigmaAdapterData.edges.find((item) => item.id === hoverEdgeId)
      : null;
    edgeHoverPreview.replaceChildren();
    edgeHoverPreview.dataset.state = edge ? "open" : "closed";
    edgeHoverPreview.dataset.kind = edge ? "edge" : "";
    edgeHoverPreview.dataset.edgeId = edge?.id ?? "";
    if (!edge) return;
    edgeHoverPreview.append(createEdgeHoverPreviewContent(
      input.container.ownerDocument,
      edge.relationType ? String(edge.relationType) : "关系",
      edge.confidence ? String(edge.confidence).toLowerCase() : "extracted"
    ));
    edgeHoverPreview.style.left = "20px";
    edgeHoverPreview.style.right = "";
    edgeHoverPreview.style.top = "";
    edgeHoverPreview.style.bottom = "20px";
  }

  function applyScopedSearch(
    nextOptions: GraphFacadeRouteRendererOptions,
    query = nextOptions.searchQuery
  ): GraphFacadeRouteRendererOptions {
    const state = optionsWithScopedSearch(nextOptions, query, typeFiltersForOptions(nextOptions));
    if (!state.matchIds.includes(searchFocusedNodeId || "")) searchFocusedNodeId = null;
    return state.options;
  }

  function typeFiltersForCurrentRoute(): GraphTypeFilters {
    return typeFiltersForOptions(options);
  }

  function typeFiltersForOptions(nextOptions: GraphFacadeRouteRendererOptions): GraphTypeFilters {
    return nextOptions.focus?.kind === "community" ? communityTypeFilters : nextOptions.typeFilters;
  }

  function ensureCommunityTypeFilterScope(id: string): void {
    if (communityTypeFilterFocusId === id) return;
    communityTypeFilters = {};
    communityTypeFilterFocusId = id;
  }

  function clearCommunityTypeFilterScope(): void {
    communityTypeFilters = {};
    communityTypeFilterFocusId = null;
  }
}

function optionsWithScopedSearch(
  options: GraphFacadeRouteRendererOptions,
  query = options.searchQuery,
  typeFilters = options.typeFilters
): { options: GraphFacadeRouteRendererOptions; matchIds: NodeId[] } {
  const state = resolveScopedSearchState(options, query, typeFilters);
  return {
    options: {
      ...options,
      searchQuery: state.query,
      searchResultIds: state.matchIds
    },
    matchIds: state.matchIds
  };
}

function resolveScopedSearchState(
  options: GraphFacadeRouteRendererOptions,
  query: string,
  typeFilters = options.typeFilters
): ReturnType<typeof resolveGraphSearchState> {
  return resolveGraphSearchState(searchNodesForRouteScope(options, typeFilters), query);
}

function searchResultsForControl(
  options: GraphFacadeRouteRendererOptions,
  focusedNodeId: NodeId | null,
  typeFilters = options.typeFilters
): GraphSearchResultControlItem[] {
  const state = resolveScopedSearchState(options, options.searchQuery, typeFilters);
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

function searchNodesForRouteScope(options: GraphFacadeRouteRendererOptions, typeFilters = options.typeFilters): GraphNode[] {
  if (options.focus?.kind !== "community") return options.data.nodes;
  return options.data.nodes.filter((node) =>
    node.community === options.focus?.id &&
    typeFilterAllowsNode(node, typeFilters)
  );
}

function hiddenReadingNodeIdForOptions(
  options: GraphFacadeRouteRendererOptions,
  typeFilters = options.typeFilters
): NodeId | null {
  const focus = options.focus;
  const selection = options.selection;
  if (focus?.kind !== "community" || selection?.kind !== "node") return null;
  const node = options.data.nodes.find((item) => item.id === selection.id);
  if (!node || node.community !== focus.id) return null;
  return typeFilterAllowsNode(node, typeFilters) ? null : node.id;
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

function typeFiltersForRouteControls(
  options: GraphFacadeRouteRendererOptions,
  typeFilters = options.typeFilters
): GraphTypeFilters {
  const filters: GraphTypeFilters = {};
  const nodes = options.focus?.kind === "community"
    ? options.data.nodes.filter((node) => node.community === options.focus?.id)
    : options.data.nodes;
  for (const node of nodes) {
    filters[node.type] = typeFilters[node.type] ?? true;
  }
  return filters;
}

function adapterDataForSigmaRoute(
  options: GraphFacadeRouteRendererOptions,
  hoverNodeId: string | null = null,
  typeFilters = options.typeFilters,
  viewportSize?: RendererViewportSize
): GraphRendererAdapterData {
  return buildGraphRendererAdapterData(options.data, {
    theme: options.theme,
    pins: options.pins,
    selection: options.selection,
    searchResultIds: options.searchResultIds,
    aggregationMarkers: options.aggregationMarkers,
    focus: options.focus,
    typeFilters,
    viewportSize,
    sourceCommunityId: options.sourceCommunityId,
    relationFocusNodeId: options.focus?.kind === "community" ? hoverNodeId : null,
    temporaryObject: options.temporaryObject
  });
}

function temporaryObjectCompatibleWithCommunity(
  data: GraphData,
  object: GraphSummaryObjectRef | null,
  communityId: string
): boolean {
  if (!object) return true;
  if (object.kind === "node") {
    return data.nodes.some((node) => node.id === object.nodeId && node.community === communityId);
  }
  if (object.kind === "aggregation") {
    if (object.communityId) return object.communityId === communityId;
    const nodeIds = new Set(object.nodeIds);
    const nodes = data.nodes.filter((node) => nodeIds.has(node.id));
    return nodes.length > 0 && nodes.every((node) => node.community === communityId);
  }
  return object.communityId === communityId;
}

function communityReadingSelectionInputForAdditiveNodeHit(
  data: GraphData,
  current: SelectionInput | null | undefined,
  nodeId: NodeId
): SelectionInput | null {
  const selection = toggleNodeInSelection(data, current, nodeId);
  if (!selection) return null;
  return selection.kind === "node" ? { kind: "nodes", ids: [selection.id] } : selection;
}

function nodeBelongsToCommunity(data: GraphData, nodeId: NodeId, communityId: string): boolean {
  return data.nodes.some((node) => node.id === nodeId && node.community === communityId);
}

function measuredViewportSize(element: HTMLElement): RendererViewportSize | undefined {
  const rect = element.getBoundingClientRect();
  const width = Math.floor(Number(rect.width));
  const height = Math.floor(Number(rect.height));
  if (width > 0 && height > 0) return { width, height };
  return undefined;
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

interface SigmaRouteKeyboardTargetLike {
  className?: unknown;
  dataset?: Record<string, string | undefined>;
  getAttribute?: (name: string) => string | null;
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  parentElement?: SigmaRouteKeyboardTargetLike | null;
}

function hasSigmaRouteClass(target: SigmaRouteKeyboardTargetLike, className: string): boolean {
  const value = target.className;
  const svgClassName = value && typeof value === "object" && "baseVal" in value
    ? (value as { baseVal?: unknown }).baseVal
    : "";
  const raw = typeof value === "string"
    ? value
    : typeof svgClassName === "string"
      ? svgClassName
      : "";
  return raw.split(/\s+/).includes(className);
}

function isSigmaRouteTextControl(target: SigmaRouteKeyboardTargetLike): boolean {
  if (target.isContentEditable) return true;
  if (target.dataset?.graphTextControl === "true" || target.getAttribute?.("data-graph-text-control") === "true") return true;
  const tagName = (target.tagName || "").toLowerCase();
  if (tagName === "textarea" || tagName === "select") return true;
  if (tagName !== "input") return false;
  const type = (target.type || target.getAttribute?.("type") || "text").toLowerCase();
  return !["button", "checkbox", "radio", "range", "submit", "reset"].includes(type);
}

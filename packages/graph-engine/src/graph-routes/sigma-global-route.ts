import type { GraphNode, GraphData, PinMap, SelectionInput, ThemeId } from "../types";
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
import { createCommunityLegend, createGraphToolbar, createSearchControl, createSigmaZoomControls } from "../render/controls";
import { ensureGraphRendererStyles } from "../render/render-styles";
import { toggleNodeInSelection } from "../select";
import { wikiPathForGraphNode } from "../graph-node";
import { getThemeTokens, themeTokensToCssVars } from "../themes";
import type { GraphFacadeRenderer, GraphFacadeRouteRendererFactoryInput, GraphFacadeRouteRendererOptions } from "../facade";

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
  let legendCollapsed = false;
  let toolbarPanelState = readToolbarPanelState(input.container.ownerDocument.defaultView?.localStorage);
  let searchStatus: HTMLElement | null = null;
  let currentSigmaAdapterData = adapterDataForSigmaRoute(options);
  const shell = input.container.ownerDocument.createElement("div");
  shell.className = "sigma-global-route llm-wiki-graph-engine";
  shell.dataset.route = "sigma-global";
  applyGraphThemeToElement(shell, options.theme);
  input.container.append(shell);
  ensureGraphRendererStyles(input.container.ownerDocument);
  mountSigmaControls();

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
      options = { ...options, focus: null };
      updateSigmaSelection(null);
      renderer?.resetView();
    },
    select(selection) {
      updateSigmaSelection(selection);
    },
    previewNode() {},
    clearSelection() {
      updateSigmaSelection(null);
      input.options.callbacks.onSelectionClearRequested?.();
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
      renderer?.destroy();
      renderer = null;
      shell.remove();
    }
  };

  function updateSigmaRenderer(): void {
    currentSigmaAdapterData = adapterDataForSigmaRoute(options);
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
    updateSigmaRenderer();
  }

  function handleSigmaPinsChanged(pins: PinMap): void {
    options = { ...options, pins };
    input.options.callbacks.onPinsChanged?.(pins);
    updateSigmaRenderer();
  }

  function handleSigmaHitTarget(target: GraphGestureTarget, context: SigmaGlobalHitContext): void {
    const nextSelection = selectionInputForSigmaHit(options.data, options.selection, target, context);
    if (nextSelection) {
      selectOnSigma(nextSelection);
      return;
    }
    switch (target.kind) {
      case "node":
      case "community-wash":
      case "aggregation-container":
        input.options.callbacks.onSelectionClearRequested?.();
        updateSigmaSelection(null);
        break;
      case "edge":
        break;
      case "graph-blank":
        const shouldResetCamera = options.selection?.kind === "community";
        options = { ...options, temporaryObject: null };
        input.options.callbacks.onSelectionClearRequested?.();
        updateSigmaSelection(null);
        if (shouldResetCamera) renderer?.resetView();
        break;
    }
  }

  function selectOnSigma(selection: SelectionInput): void {
    input.options.callbacks.onSelectionInput?.(selection);
    updateSigmaSelection(selection);
  }

  function mountSigmaControls(): void {
    shell.dataset.theme = options.theme;
    shell.dataset.searchOpen = searchOpen ? "true" : "false";
    shell.querySelector(".graph-search")?.remove();
    shell.querySelector(".graph-toolbar")?.remove();
    shell.querySelector(".graph-zoom-controls")?.remove();
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

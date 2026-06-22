import type { CommunityId, NodeId, SelectionInput } from "../types";
import { pinsToPositions } from "../sim";
import type { GraphWorldPoint } from "./geometry";
import {
  GraphGestureController,
  type GraphGestureActiveState,
  type GraphGestureIntent,
  type GraphGestureTargetLike
} from "./gestures";
import { classifyGraphKeyboardIntent, isTextEditingElement } from "./keyboard";
import type { RenderPositionMap } from "./model";
import { cancelGraphNodeDrag, commitGraphNodeDrag, type GraphNodeDragSession } from "./node-drag-lifecycle";
import type { GraphRenderContext } from "./render-context";
import { resolveGraphSearchState, resolveNextGraphSearchFocus, resolvePreviousGraphSearchFocus } from "./search";
import { beginGraphNodeDrag, resolveGraphNodeDragTarget } from "./simulation-bridge";
import type { GraphRuntimeStateSnapshot } from "./state";
import {
  shouldBlankClickCloseToolbar,
  toolbarPanelStateAfterBlankClick,
  writeToolbarPanelState
} from "./toolbar";
import {
  centerRendererViewportOnPoint,
  fitRendererViewportToPoints,
  panRendererViewport,
  viewportAfterWheelZoom,
  type RendererViewportSize
} from "./viewport";

export interface GraphController {
  bindViewportHandlers(): GraphGestureController;
  onGestureIntents(intents: GraphGestureIntent[], event: PointerEvent | null): void;
  syncRuntimeGestureState(): void;
  handleDocumentKeydown(event: KeyboardEvent): void;
  isGraphKeyboardFocusActive(): boolean;
  handleNodeClick(id: NodeId, additive: boolean): void;
  handleNodeDoubleClick(id: NodeId): boolean;
  setNodeFixed(id: NodeId, mode: "fix" | "unfix"): boolean;
  handleBlankClick(): void;
  openSearch(): void;
  applySearchQuery(query: string): void;
  focusNextSearchResult(): void;
  focusPreviousSearchResult(): void;
  activateSearchResult(): void;
  closeSearch(): void;
  selectCommunity(id: CommunityId): void;
  setCommunityHover(id: CommunityId | null): void;
  focusCommunity(id: CommunityId): void;
  resetViewState(): void;
  requestGlobalReset(): void;
  retreatFocusedView(): void;
  clearSelectionOnly(): void;
  closeToolbarPanel(): void;
  clearInteractionState(): void;
  clearTransientInteractionForDataRefresh(): void;
  hasInteractionState(): boolean;
}

export interface GraphControllerDelegates {
  render(): void;
  viewportSize(): RendererViewportSize;
  setViewportAnimating(enabled: boolean): void;
  setInteractionDegraded(enabled: boolean, options?: { restoreDelayMs?: number }): void;
  setGraphHover(hover: GraphRuntimeStateSnapshot["hover"]): GraphRuntimeStateSnapshot;
  applyMotionFrame(positions: RenderPositionMap): void;
  markPinnedNodes(pinnedNodeIds: string[]): void;
  focusFitMaxScale: number;
}

export function createGraphController(context: GraphRenderContext, delegates: GraphControllerDelegates): GraphController {
  function bindViewportHandlers(): GraphGestureController {
    return new GraphGestureController(context.root, {
      stateMachine: context.gestureMachine,
      targetFromEventTarget: graphGestureTarget,
      graphTargetFromScreenPoint: context.hitTargetResolver.targetFromScreenPoint,
      onWheelZoom: (event, _decision, screenPoint) => {
        delegates.setViewportAnimating(false);
        delegates.setInteractionDegraded(true, { restoreDelayMs: 200 });
        context.viewportCommitter.schedule(viewportAfterWheelZoom(
          context.runtimeState.snapshot().viewport,
          { deltaY: event.deltaY, deltaMode: event.deltaMode },
          screenPoint,
          delegates.viewportSize(),
          { worldBounds: context.graph.worldBounds }
        ), { lightweight: true });
      },
      onPointerDown: (_event, decision) => {
        if (decision.intent !== "node-drag-candidate") context.rendererSurface.focusRoot({ preventScroll: true });
        delegates.setViewportAnimating(false);
        delegates.setInteractionDegraded(true, { restoreDelayMs: 200 });
      },
      onGestureIntents,
      onActiveStateChange: syncRuntimeGestureState,
      onBlankDoubleClick: () => {
        requestGlobalReset();
      }
    });
  }

  function handleDocumentKeydown(event: KeyboardEvent): void {
    const keyboardIntent = classifyGraphKeyboardIntent({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      graphFocused: isGraphKeyboardFocusActive(),
      activeGesture: Boolean(context.gestureMachine.snapshot()),
      textEditingTarget: isTextEditingElement(context.ownerDocument.activeElement),
      searchActive: Boolean(context.searchOpen || context.searchQuery || context.searchFocusedNodeId),
      toolbarOpen: shouldBlankClickCloseToolbar(context.toolbarPanelState),
      interactionActive: hasInteractionState()
    });

    if (keyboardIntent === "blocked") return;

    if (keyboardIntent === "open-search") {
      event.preventDefault();
      openSearch();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (keyboardIntent === "close-search") {
      closeSearch();
      return;
    }
    if (keyboardIntent === "close-toolbar") {
      closeToolbarPanel();
      return;
    }
    if (keyboardIntent === "cancel-active-gesture") {
      const intents = context.gestureMachine.escape();
      if (intents.length) {
        onGestureIntents(intents, null);
        syncRuntimeGestureState();
      }
      return;
    }

    const snapshot = context.runtimeState.snapshot();
    if (snapshot.selection || snapshot.hover || context.searchFocusedNodeId || context.previewTimer || context.root.dataset.focus) {
      clearSelectionOnly();
      return;
    }
    if (snapshot.focus) {
      requestGlobalReset();
      return;
    }
    clearInteractionState();
  }

  function onGestureIntents(intents: GraphGestureIntent[], _event: PointerEvent | null): void {
    for (const intent of intents) {
      switch (intent.kind) {
        case "node-click":
          if (intent.nodeId) context.rendererSurface.focusNode(intent.nodeId, { preventScroll: true });
          if (intent.nodeId) handleNodeClick(intent.nodeId, intent.additive);
          break;
        case "node-drag-start":
          if (intent.nodeId) handleNodeDragStart(intent.nodeId, intent.screenPoint);
          delegates.setInteractionDegraded(true, { restoreDelayMs: 220 });
          break;
        case "node-drag-move":
          if (intent.nodeId) handleNodeDragMove(intent.nodeId, intent.pointerId, intent.screenPoint);
          delegates.setInteractionDegraded(true, { restoreDelayMs: 220 });
          break;
        case "node-drag-end":
          if (intent.nodeId) handleNodeDragEnd(intent.nodeId, intent.pointerId, intent.screenPoint);
          delegates.setInteractionDegraded(true, { restoreDelayMs: 160 });
          break;
        case "node-drag-cancel":
          if (intent.nodeId) handleNodeDragCancel(intent.nodeId, intent.pointerId);
          delegates.setInteractionDegraded(false);
          break;
        case "community-click":
          if (intent.communityId) selectCommunity(intent.communityId);
          break;
        case "community-click-cancelled":
          break;
        case "blank-click":
          handleBlankClick();
          break;
        case "blank-pan-start":
          context.rendererSurface.setViewportDragging(true);
          delegates.setInteractionDegraded(true, { restoreDelayMs: 220 });
          break;
        case "blank-pan-move":
          context.rendererSurface.setViewportDragging(true);
          delegates.setInteractionDegraded(true, { restoreDelayMs: 220 });
          context.viewportCommitter.schedule(panRendererViewport(
            context.runtimeState.snapshot().viewport,
            intent.delta,
            delegates.viewportSize(),
            { worldBounds: context.graph.worldBounds }
          ), { lightweight: true });
          break;
        case "blank-pan-end":
        case "blank-pan-cancel":
          context.rendererSurface.setViewportDragging(false);
          delegates.setInteractionDegraded(true, { restoreDelayMs: 160 });
          break;
      }
    }
  }

  function handleNodeClick(id: NodeId, additive: boolean): void {
    const nextSelection = additive
      ? shiftSelection(id, selectedNodeIds(context.runtimeState.snapshot().selection))
      : { kind: "node" as const, id };
    context.runtimeState.setSelection(nextSelection, "selection-panel");
    context.callbacks.onSelectionInput?.(nextSelection);
    delegates.render();
    focusRenderedNode(id);
  }

  function handleNodeDoubleClick(id: NodeId): boolean {
    return Boolean(context.graph.nodes.find((node) => node.id === id));
  }

  function setNodeFixed(id: NodeId, mode: "fix" | "unfix"): boolean {
    const node = context.graph.nodes.find((item) => item.id === id);
    if (!node) return false;
    const nextState = mode === "fix"
      ? context.pinState.pin(id, currentWorldPointForNode(id) || node.point)
      : context.pinState.unpin(id);
    context.runtimeState.setPins(nextState.pins);
    context.simulation?.setFixed(id, mode === "fix" ? pinsToPositions(context.graph, nextState.pins)[id] || node.point : null);
    delegates.render();
    context.callbacks.onPinsChanged?.(nextState.pins);
    return true;
  }

  function focusRenderedNode(id: NodeId): void {
    context.rendererSurface.focusNode(id, { preventScroll: true });
  }

  function handleNodeDragStart(id: NodeId, screenPoint: { x: number; y: number }): void {
    if (!context.simulation) {
      context.runtimeState.setActiveGesture(null);
      return;
    }
    const active = context.runtimeState.snapshot().activeGesture;
    if (active?.kind !== "node-drag" || active.nodeId !== id) return;
    const grabOffset = active.grabOffset;
    context.rendererSurface.setNodeDragging(id, true);
    context.simulation.beginDrag(id);
    context.simulation.dragTo(id, nodeDragTargetFromScreenPoint(screenPoint, grabOffset));
    context.rendererSurface.setDragTarget(id);
    context.callbacks.onDragActiveChange?.(true);
  }

  function handleNodeDragMove(id: NodeId, pointerId: number, screenPoint: { x: number; y: number }): void {
    if (!context.simulation || !isRuntimeNodeDrag(id, pointerId, true)) return;
    context.simulation.dragTo(id, nodeDragTargetFromScreenPoint(screenPoint, nodeDragGrabOffset(id, pointerId)));
  }

  function handleNodeDragEnd(id: NodeId, pointerId: number, screenPoint: { x: number; y: number }): void {
    if (!context.simulation || !isRuntimeNodeDrag(id, pointerId, true)) return;
    const result = commitGraphNodeDrag({
      nodeId: id,
      simulation: context.simulation,
      pinState: context.pinState,
      finalWorldPoint: nodeDragTargetFromScreenPoint(screenPoint, nodeDragGrabOffset(id, pointerId))
    });
    context.runtimeState.setPins(result.pins);
    delegates.applyMotionFrame(result.positions);
    delegates.markPinnedNodes(result.pinnedNodeIds);
    context.callbacks.onPinsChanged?.(result.pins);
    context.rendererSurface.setNodeDragging(id, false);
    context.rendererSurface.setDragTarget(null);
    context.runtimeState.setActiveGesture(null);
    context.callbacks.onDragActiveChange?.(false);
  }

  function handleNodeDragCancel(id: NodeId, pointerId: number): void {
    if (!context.simulation || !isRuntimeNodeDrag(id, pointerId, true)) return;
    const session = nodeDragSession(id, pointerId);
    const result = cancelGraphNodeDrag({ session, simulation: context.simulation, pinState: context.pinState });
    context.runtimeState.setPins(result.pins);
    delegates.applyMotionFrame(result.positions);
    delegates.markPinnedNodes(result.pinnedNodeIds);
    context.rendererSurface.setNodeDragging(id, false);
    context.rendererSurface.setDragTarget(null);
    context.runtimeState.setActiveGesture(null);
    context.callbacks.onDragActiveChange?.(false);
  }

  function handleBlankClick(): void {
    context.rendererSurface.setViewportDragging(false);
    // True blank clicks close toolbar popovers before clearing selection; drag-pan never reaches this path.
    if (shouldBlankClickCloseToolbar(context.toolbarPanelState)) {
      closeToolbarPanel();
      return;
    }
    if (!hasClearableSelectionState()) return;
    clearSelectionOnly();
  }

  function clearSelectionOnly(): void {
    clearSearchAndPreviewState();
    delegates.setGraphHover(null);
    context.runtimeState.setSelection(null);
    context.rendererSurface.setFocusDataset(false);
    context.callbacks.onSelectionClearRequested?.();
    delegates.render();
  }

  function clearSearchAndPreviewState(): void {
    context.searchFocusedNodeId = null;
    if (context.previewTimer) {
      clearTimeout(context.previewTimer);
      context.previewTimer = null;
    }
  }

  function clearInteractionState(): void {
    clearSearchAndPreviewState();
    context.runtimeState.clearInteraction();
    context.rendererSurface.setFocusDataset(false);
    context.callbacks.onSelectionClearRequested?.();
    delegates.render();
  }

  function clearTransientInteractionForDataRefresh(): void {
    clearSearchAndPreviewState();
    context.rendererSurface.clearNodeDragging();
    context.rendererSurface.setDragTarget(null);
    context.rendererSurface.setViewportDragging(false);
    context.simulation?.endDrag();
    context.gestureMachine.escape();
    context.runtimeState.setHover(null);
    context.callbacks.onDragActiveChange?.(false);
  }

  function hasInteractionState(): boolean {
    const snapshot = context.runtimeState.snapshot();
    return Boolean(snapshot.selection || snapshot.focus || context.root.dataset.focus);
  }

  function hasClearableSelectionState(): boolean {
    const snapshot = context.runtimeState.snapshot();
    return Boolean(snapshot.selection || snapshot.hover || context.searchFocusedNodeId || context.previewTimer);
  }

  function isGraphKeyboardFocusActive(): boolean {
    const active = context.ownerDocument.activeElement;
    if (active === context.root || Boolean(active && context.root.contains(active))) return true;
    return false;
  }

  function openSearch(): void {
    context.searchOpen = true;
    context.rendererSurface.setSearchOpen(true);
    if (context.dom.searchInput) {
      context.dom.searchInput.focus();
      context.dom.searchInput.select();
    }
  }

  function applySearchQuery(query: string): void {
    if (query !== context.searchQuery) context.searchFocusedNodeId = null;
    context.searchQuery = query;
    delegates.setInteractionDegraded(Boolean(query), { restoreDelayMs: 180 });
    const state = resolveGraphSearchState(context.data.nodes, context.searchQuery, context.searchIndex);
    context.searchIndex = state.searchIndex;
    if (!state.matchIds.includes(context.searchFocusedNodeId || "")) context.searchFocusedNodeId = null;
    context.rendererSurface.setSearchState({
      query: state.query,
      focusedNodeId: context.searchFocusedNodeId,
      nodes: state.nodes
    });
    if (context.dom.searchInput && context.dom.searchInput.value !== context.searchQuery) context.dom.searchInput.value = context.searchQuery;
    if (context.dom.searchStatusElement) {
      const focusedIndex = context.searchFocusedNodeId ? state.matchIds.indexOf(context.searchFocusedNodeId) : -1;
      context.dom.searchStatusElement.textContent = state.query
        ? focusedIndex >= 0
          ? `${focusedIndex + 1}/${state.matchIds.length}`
          : `${state.matchIds.length} 个结果`
        : "输入关键词";
    }
    context.callbacks.onVisibilityStateChange?.({
      searchQuery: state.query,
      searchResultIds: state.matchIds,
      typeFilters: context.typeFilters,
      temporaryObject: context.temporaryObject
    });
  }

  function focusNextSearchResult(): void {
    focusSearchResult("next");
  }

  function focusPreviousSearchResult(): void {
    focusSearchResult("previous");
  }

  function focusSearchResult(direction: "next" | "previous"): void {
    const state = resolveGraphSearchState(context.data.nodes, context.searchQuery, context.searchIndex);
    context.searchIndex = state.searchIndex;
    const next = direction === "next"
      ? resolveNextGraphSearchFocus(state.matchIds, context.searchFocusedNodeId)
      : resolvePreviousGraphSearchFocus(state.matchIds, context.searchFocusedNodeId);
    context.searchFocusedNodeId = next.id;
    if (!next.id) {
      applySearchQuery(context.searchQuery);
      return;
    }
    const node = context.graph.nodes.find((item) => item.id === next.id);
    if (node) {
      delegates.setViewportAnimating(true);
      context.viewportCommitter.schedule(centerRendererViewportOnPoint(
        node.point,
        context.runtimeState.snapshot().viewport,
        delegates.viewportSize(),
        { worldBounds: context.graph.worldBounds }
      ));
    }
    applySearchQuery(context.searchQuery);
  }

  function activateSearchResult(): void {
    const state = resolveGraphSearchState(context.data.nodes, context.searchQuery, context.searchIndex);
    context.searchIndex = state.searchIndex;
    const current = context.searchFocusedNodeId && state.matchIds.includes(context.searchFocusedNodeId)
      ? context.searchFocusedNodeId
      : resolveNextGraphSearchFocus(state.matchIds, context.searchFocusedNodeId).id;
    context.searchFocusedNodeId = current;
    if (!current) {
      applySearchQuery(context.searchQuery);
      return;
    }
    applySearchQuery(context.searchQuery);
    handleNodeClick(current, false);
  }

  function closeSearch(): void {
    context.searchOpen = false;
    context.searchFocusedNodeId = null;
    context.rendererSurface.setSearchOpen(false);
    delegates.setInteractionDegraded(false);
    applySearchQuery("");
    context.rendererSurface.focusRoot({ preventScroll: true });
  }

  function closeToolbarPanel(): void {
    context.toolbarPanelState = toolbarPanelStateAfterBlankClick(context.toolbarPanelState);
    writeToolbarPanelState(context.ownerDocument.defaultView?.localStorage, context.toolbarPanelState);
    if (context.dom.toolbarPanelElement) context.dom.toolbarPanelElement.dataset.state = context.toolbarPanelState;
    if (context.dom.toolbarElement) context.dom.toolbarElement.dataset.panel = context.toolbarPanelState;
    context.root.dataset.toolbarPanel = context.toolbarPanelState;
    context.root.dataset.toolbarOpen = "false";
    context.toolbarContainer.dataset.toolbarPanel = context.toolbarPanelState;
    context.toolbarContainer.dataset.toolbarOpen = "false";
  }

  function selectCommunity(id: CommunityId): void {
    const nextSelection: SelectionInput = { kind: "community", id };
    context.runtimeState.setSelection(nextSelection, "selection-panel");
    context.callbacks.onSelectionInput?.(nextSelection);
    delegates.render();
  }

  function setCommunityHover(id: CommunityId | null): void {
    context.runtimeState.setHover(id ? { kind: "community", id } : null);
  }

  function focusCommunity(id: CommunityId): void {
    context.runtimeState.setFocus({ kind: "community", id });
    delegates.render();
    const points = context.graph.nodes.map((node) => node.point);
    if (!points.length) return;
    delegates.setViewportAnimating(true);
    context.viewportCommitter.schedule(fitRendererViewportToPoints(points, delegates.viewportSize(), {
      maxScale: delegates.focusFitMaxScale,
      worldBounds: context.graph.worldBounds
    }));
  }

  function resetViewState(): void {
    delegates.setGraphHover(null);
    context.runtimeState.setFocus(null);
    context.runtimeState.setActiveGesture(null);
    context.rendererSurface.setFocusDataset(false);
    context.callbacks.onViewReset?.();
    delegates.render();
    delegates.setViewportAnimating(true);
    context.viewportCommitter.schedule(fitRendererViewportToPoints(
      context.graph.nodes.map((node) => node.point),
      delegates.viewportSize(),
      { worldBounds: context.graph.worldBounds }
    ));
  }

  function requestGlobalReset(): void {
    if (context.callbacks.onGlobalResetRequested) {
      context.callbacks.onGlobalResetRequested();
      return;
    }
    resetViewState();
  }

  function retreatFocusedView(): void {
    context.searchFocusedNodeId = null;
    delegates.setGraphHover(null);
    context.runtimeState.setSelection(null);
    context.rendererSurface.setFocusDataset(false);
    context.callbacks.onSelectionClearRequested?.();
    delegates.render();
  }

  function syncRuntimeGestureState(): void {
    const active = context.gestureMachine.snapshot();
    context.runtimeState.setActiveGesture(runtimeGestureFromActiveGesture(active));
  }

  function runtimeGestureFromActiveGesture(active: GraphGestureActiveState): GraphRuntimeStateSnapshot["activeGesture"] {
    if (!active) return null;
    if (active.kind === "node") {
      return active.nodeId
        ? {
            kind: "node-drag",
            pointerId: active.pointerId,
            nodeId: active.nodeId,
            grabOffset: nodeDragGrabOffsetFromActive(active),
            startWorldPoint: nodeDragStartWorldPoint(active.nodeId),
            wasPinned: nodeDragWasPinned(active.nodeId),
            locked: active.locked
          }
        : null;
    }
    if (active.kind === "community-wash") {
      return active.communityId
        ? {
            kind: "community-click",
            pointerId: active.pointerId,
            communityId: active.communityId,
            locked: active.locked
          }
        : null;
    }
    return {
      kind: "viewport-pan",
      pointerId: active.pointerId,
      lastScreenPoint: active.lastScreenPoint,
      locked: active.locked
    };
  }

  function graphGestureTarget(target: EventTarget | null): GraphGestureTargetLike | null {
    return isGraphGestureTargetLike(target) ? target : null;
  }

  function nodeDragSession(nodeId: NodeId, pointerId: number): GraphNodeDragSession {
    const active = context.runtimeState.snapshot().activeGesture;
    if (active?.kind === "node-drag" && active.nodeId === nodeId && active.pointerId === pointerId) {
      return {
        pointerId,
        nodeId,
        startWorldPoint: active.startWorldPoint,
        wasPinned: active.wasPinned
      };
    }
    const node = context.graph.nodes.find((item) => item.id === nodeId);
    return {
      pointerId,
      nodeId,
      startWorldPoint: node?.point || { x: 0, y: 0 },
      wasPinned: context.pinState.isPinned(nodeId)
    };
  }

  function nodeDragGrabOffset(nodeId: NodeId, pointerId: number): GraphWorldPoint {
    const active = context.runtimeState.snapshot().activeGesture;
    if (active?.kind === "node-drag" && active.nodeId === nodeId && active.pointerId === pointerId) {
      return active.grabOffset;
    }
    return { x: 0, y: 0 };
  }

  function nodeDragGrabOffsetFromActive(active: NonNullable<Extract<GraphGestureActiveState, { kind: "node" }>>): GraphWorldPoint {
    const existing = context.runtimeState.snapshot().activeGesture;
    if (existing?.kind === "node-drag" && existing.nodeId === active.nodeId && existing.pointerId === active.pointerId) {
      return existing.grabOffset;
    }
    if (!active.nodeId) return { x: 0, y: 0 };
    return nodeDragStartSnapshot(active).grabOffset;
  }

  function nodeDragStartWorldPoint(nodeId: NodeId): GraphWorldPoint {
    const existing = context.runtimeState.snapshot().activeGesture;
    if (existing?.kind === "node-drag" && existing.nodeId === nodeId) return existing.startWorldPoint;
    const pinnedStartPoint = pinsToPositions(context.graph, context.runtimeState.snapshot().pins)[nodeId];
    if (pinnedStartPoint) return pinnedStartPoint;
    return context.graph.nodes.find((item) => item.id === nodeId)?.point || { x: 0, y: 0 };
  }

  function currentWorldPointForNode(nodeId: NodeId): GraphWorldPoint | null {
    const runtimePosition = context.runtimeState.snapshot().positions[nodeId];
    if (runtimePosition) return runtimePosition;
    const pinnedPosition = pinsToPositions(context.graph, context.runtimeState.snapshot().pins)[nodeId];
    if (pinnedPosition) return pinnedPosition;
    return context.graph.nodes.find((item) => item.id === nodeId)?.point || null;
  }

  function nodeDragWasPinned(nodeId: NodeId): boolean {
    const existing = context.runtimeState.snapshot().activeGesture;
    if (existing?.kind === "node-drag" && existing.nodeId === nodeId) return existing.wasPinned;
    return Boolean(pinsToPositions(context.graph, context.runtimeState.snapshot().pins)[nodeId]) || context.pinState.isPinned(nodeId);
  }

  function nodeDragStartSnapshot(active: NonNullable<Extract<GraphGestureActiveState, { kind: "node" }>>): {
    grabOffset: GraphWorldPoint;
    startWorldPoint: GraphWorldPoint;
    wasPinned: boolean;
  } {
    if (!active.nodeId) {
      return { grabOffset: { x: 0, y: 0 }, startWorldPoint: { x: 0, y: 0 }, wasPinned: false };
    }
    const node = context.graph.nodes.find((item) => item.id === active.nodeId);
    if (!node) {
      return { grabOffset: { x: 0, y: 0 }, startWorldPoint: { x: 0, y: 0 }, wasPinned: false };
    }
    const drag = beginGraphNodeDrag({
      nodeWorldPoint: node.point,
      pointerScreenPoint: active.startScreenPoint,
      viewport: context.runtimeState.snapshot().viewport,
      viewportSize: delegates.viewportSize(),
      worldBounds: context.graph.worldBounds
    });
    const pinnedStartPoint = pinsToPositions(context.graph, context.runtimeState.snapshot().pins)[active.nodeId];
    return {
      grabOffset: drag.grabOffset,
      startWorldPoint: pinnedStartPoint || drag.targetWorldPoint,
      wasPinned: Boolean(pinnedStartPoint) || context.pinState.isPinned(active.nodeId)
    };
  }

  function isRuntimeNodeDrag(nodeId: NodeId, pointerId: number, locked?: boolean): boolean {
    const active = context.runtimeState.snapshot().activeGesture;
    if (active?.kind !== "node-drag" || active.nodeId !== nodeId || active.pointerId !== pointerId) return false;
    return locked === undefined ? true : active.locked === locked;
  }

  function nodeDragTargetFromScreenPoint(screenPoint: { x: number; y: number }, grabOffset: GraphWorldPoint): GraphWorldPoint {
    return resolveGraphNodeDragTarget({
      pointerScreenPoint: screenPoint,
      viewport: context.runtimeState.snapshot().viewport,
      viewportSize: delegates.viewportSize(),
      worldBounds: context.graph.worldBounds,
      grabOffset
    });
  }

  return {
    bindViewportHandlers,
    onGestureIntents,
    syncRuntimeGestureState,
    handleDocumentKeydown,
    isGraphKeyboardFocusActive,
    handleNodeClick,
    handleNodeDoubleClick,
    setNodeFixed,
    handleBlankClick,
    openSearch,
    applySearchQuery,
    focusNextSearchResult,
    focusPreviousSearchResult,
    activateSearchResult,
    closeSearch,
    selectCommunity,
    setCommunityHover,
    focusCommunity,
    resetViewState,
    requestGlobalReset,
    retreatFocusedView,
    clearSelectionOnly,
    closeToolbarPanel,
    clearInteractionState,
    clearTransientInteractionForDataRefresh,
    hasInteractionState
  };
}

function isGraphGestureTargetLike(target: EventTarget | null): target is EventTarget & GraphGestureTargetLike {
  if (!target || typeof target !== "object") return false;
  const candidate = target as GraphGestureTargetLike;
  return typeof candidate.closest === "function" || Boolean(candidate.dataset) || typeof candidate.tagName === "string";
}

function selectedNodeIds(selection: SelectionInput | null): NodeId[] {
  if (!selection) return [];
  if (selection.kind === "node" || selection.kind === "neighbors") return [selection.id];
  if (selection.kind === "nodes") return selection.ids;
  return [];
}

function shiftSelection(id: NodeId, current: NodeId[]): SelectionInput {
  const selected = new Set(current);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  const ids = Array.from(selected);
  if (ids.length === 1) return { kind: "node", id: ids[0] };
  return { kind: "nodes", ids };
}

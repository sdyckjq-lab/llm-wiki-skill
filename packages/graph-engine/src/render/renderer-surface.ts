import type { NodeId } from "../types";
import type { PaintedGraphDom } from "./render-context";
import type { GraphSearchNodeView } from "./search";

export interface GraphRendererSurface {
  focusRoot(options?: FocusOptions): void;
  focusNode(id: NodeId, options?: FocusOptions): void;
  setNodeDragging(id: NodeId, dragging: boolean): void;
  clearNodeDragging(): void;
  setViewportDragging(dragging: boolean): void;
  setDragTarget(id: NodeId | null): void;
  setFocusDataset(active: boolean): void;
  setSearchOpen(open: boolean): void;
  setSearchState(input: {
    query: string;
    focusedNodeId: NodeId | null;
    nodes: readonly GraphSearchNodeView[];
  }): void;
}

export function createDomSvgRendererSurface(input: {
  root: HTMLElement;
  dom: () => PaintedGraphDom;
}): GraphRendererSurface {
  return {
    focusRoot(options) {
      input.root.focus(options);
    },
    focusNode(id, options) {
      input.dom().nodeElements.get(id)?.focus(options);
    },
    setNodeDragging(id, dragging) {
      input.dom().nodeElements.get(id)?.classList.toggle("is-dragging", dragging);
    },
    clearNodeDragging() {
      for (const node of input.dom().nodeElements.values()) node.classList.remove("is-dragging");
    },
    setViewportDragging(dragging) {
      if (dragging) input.root.dataset.viewportDragging = "true";
      else delete input.root.dataset.viewportDragging;
    },
    setDragTarget(id) {
      if (id) input.root.dataset.dragging = id;
      else delete input.root.dataset.dragging;
    },
    setFocusDataset(active) {
      if (active) input.root.dataset.focus = "true";
      else delete input.root.dataset.focus;
    },
    setSearchOpen(open) {
      input.root.dataset.searchOpen = open ? "true" : "false";
      const { searchElement } = input.dom();
      if (searchElement) searchElement.dataset.state = open ? "open" : "closed";
    },
    setSearchState(state) {
      input.root.dataset.searchActive = state.query ? "true" : "false";
      input.root.dataset.searchQuery = state.query;
      const focusedNodeId = state.focusedNodeId;
      for (const node of state.nodes) {
        const element = input.dom().nodeElements.get(node.id);
        if (!element) continue;
        element.dataset.searchState = node.searchState;
        element.dataset.searchFocus = node.id === focusedNodeId ? "true" : "false";
        element.dataset.searchBoost = node.searchState === "match" || node.id === focusedNodeId ? "true" : "false";
        element.dataset.traceable = element.dataset.coreAnchor === "true" ||
          element.dataset.temporaryBoost === "true" ||
          element.dataset.searchBoost === "true" ||
          element.dataset.pinned === "true" ||
          element.getAttribute("aria-pressed") === "true"
          ? "true"
          : "false";
      }
    }
  };
}

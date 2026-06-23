import type { GraphNode, NodeId, SelectionInput } from "../types";
import { resolveSelectionForCapabilities } from "../select";
import type { RenderableGraph, RenderableNode } from "./model";
import { buildHoverPreview } from "./preview";
import { createEdgeHoverPreviewContent, createHoverPreviewContent } from "./hover-card";
import { renderOfflineReader, renderOfflineSelectionPanel } from "./offline-reader";
import { graphEdgeHoverAnchor, graphNodeHoverAnchor, resolveGraphHoverPreviewPosition } from "./overlays";
import type { GraphRuntimeStateSnapshot } from "./state";
import type { GraphRenderContext } from "./render-context";

export interface GraphOverlaysPresenter {
  scheduleHoverPreview(id: NodeId): void;
  showEdgeHoverPreview(id: string): void;
  clearHoverPreview(): void;
  cancelHoverPreviewOnly(): void;
  setGraphHover(hover: GraphRuntimeStateSnapshot["hover"]): GraphRuntimeStateSnapshot;
  renderHoverPreview(): void;
  renderReader(): void;
  renderSelectionPanel(): void;
  destroy(): void;
}

export interface GraphOverlaysPresenterOptions {
  viewportSize(): { width: number; height: number };
  clearInteractionState(): void;
}

export function createGraphOverlaysPresenter(
  context: GraphRenderContext,
  options: GraphOverlaysPresenterOptions
): GraphOverlaysPresenter {
  function panelSelection(snapshot: GraphRuntimeStateSnapshot = context.runtimeState.snapshot()): SelectionInput | null {
    return snapshot.selectionSurface === "selection-panel" ? snapshot.selection : null;
  }

  function renderReader(): void {
    const reader = context.dom.readerElement;
    if (!reader) return;
    const selected = context.graph.selectedNodeId ? context.graph.nodes.find((node) => node.id === context.graph.selectedNodeId) : null;
    const rawNode = selected ? context.data.nodes.find((node) => node.id === selected.id) : null;
    renderOfflineReader(context.ownerDocument, reader, {
      selected: selected
        ? {
            id: selected.id,
            label: selected.label,
            type: selected.type,
            content: rawNode?.content ? String(rawNode.content) : undefined,
            summary: rawNode?.summary ? String(rawNode.summary) : undefined
          }
        : null,
      rawNode: rawNode || null,
      onClose: () => options.clearInteractionState()
    });
  }

  function renderSelectionPanel(): void {
    const panel = context.dom.selectionElement;
    if (!panel) return;
    const selection = panelSelection();
    const resolved = selection ? resolveSelectionForCapabilities(context.data, selection, { canAsk: false }) : null;
    const selectedNodes = resolved
      ? resolved.nodeIds
        .map((id) => context.data.nodes.find((node) => node.id === id))
        .filter((node): node is GraphNode => Boolean(node))
      : [];
    renderOfflineSelectionPanel(context.ownerDocument, panel, {
      selection,
      selectedNodes,
      facts: resolved?.facts || null,
      onClose: () => options.clearInteractionState()
    });
  }

  function scheduleHoverPreview(id: NodeId): void {
    if (context.graph.focus?.kind === "community") return;
    if (context.previewTimer) clearTimeout(context.previewTimer);
    context.previewTimer = setTimeout(() => {
      context.previewTimer = null;
      const hover = context.runtimeState.snapshot().hover;
      if (hover?.kind !== "node" || hover.id !== id) return;
      renderHoverPreview();
    }, 300);
  }

  function showEdgeHoverPreview(id: string): void {
    if (context.previewTimer) {
      clearTimeout(context.previewTimer);
      context.previewTimer = null;
    }
    setGraphHover({ kind: "edge", id });
    renderHoverPreview();
  }

  function clearHoverPreview(): void {
    if (context.previewTimer) {
      clearTimeout(context.previewTimer);
      context.previewTimer = null;
    }
    const hover = context.runtimeState.snapshot().hover;
    if (hover?.kind !== "node" && hover?.kind !== "edge") return;
    setGraphHover(null);
    renderHoverPreview();
  }

  function cancelHoverPreviewOnly(): void {
    if (context.previewTimer) {
      clearTimeout(context.previewTimer);
      context.previewTimer = null;
    }
    if (context.dom.previewElement?.dataset.kind === "node") {
      context.dom.previewElement.dataset.state = "closed";
      context.dom.previewElement.replaceChildren();
    }
  }

  function setGraphHover(hover: GraphRuntimeStateSnapshot["hover"]): GraphRuntimeStateSnapshot {
    return context.runtimeState.setHover(hover);
  }

  function renderHoverPreview(): void {
    const preview = context.dom.previewElement;
    if (!preview) return;
    const hover = context.runtimeState.snapshot().hover;
    const edge = hover?.kind === "edge" ? context.graph.edges.find((item) => item.id === hover.id) : null;
    const rawNode = hover?.kind === "node" ? context.data.nodes.find((node) => node.id === hover.id) : null;
    const renderedNode = hover?.kind === "node" ? context.graph.nodes.find((node) => node.id === hover.id) : null;
    preview.replaceChildren();
    preview.dataset.kind = edge ? "edge" : "node";
    if (edge) {
      preview.dataset.state = "open";
      preview.append(createEdgeHoverPreviewContent(context.ownerDocument, edge.relationType, edge.confidence));
      positionEdgeHoverPreview(preview, edge);
      return;
    }
    if (hover?.kind === "node" && context.graph.focus?.kind === "community") {
      preview.dataset.state = "closed";
      return;
    }
    preview.dataset.state = rawNode && renderedNode ? "open" : "closed";
    if (!rawNode || !renderedNode) return;
    const content = buildHoverPreview(rawNode);
    preview.append(createHoverPreviewContent(context.ownerDocument, content));
    positionHoverPreview(preview, renderedNode);
  }

  function positionHoverPreview(preview: HTMLElement, node: RenderableNode): void {
    const previewRect = preview.getBoundingClientRect();
    const size = options.viewportSize();
    const position = resolveGraphHoverPreviewPosition({
      anchorScreenPoint: graphNodeHoverAnchor(node, context.runtimeState.snapshot().viewport, size, context.graph.worldBounds),
      previewSize: { width: previewRect.width, height: previewRect.height },
      viewportSize: size,
      offset: { x: 18, y: -previewRect.height - 24 },
      margin: 12
    });
    preview.style.left = `${position.x}px`;
    preview.style.top = `${position.y}px`;
  }

  function positionEdgeHoverPreview(preview: HTMLElement, edge: RenderableGraph["edges"][number]): void {
    const previewRect = preview.getBoundingClientRect();
    const source = context.graph.nodes.find((node) => node.id === edge.source);
    const target = context.graph.nodes.find((node) => node.id === edge.target);
    const size = options.viewportSize();
    const position = resolveGraphHoverPreviewPosition({
      anchorScreenPoint: graphEdgeHoverAnchor({ source, target }, context.runtimeState.snapshot().viewport, size, context.graph.worldBounds),
      previewSize: { width: previewRect.width, height: previewRect.height },
      viewportSize: size,
      offset: { x: 16, y: -previewRect.height - 16 },
      margin: 12
    });
    preview.style.left = `${position.x}px`;
    preview.style.top = `${position.y}px`;
  }

  function destroy(): void {
    if (context.previewTimer) clearTimeout(context.previewTimer);
    context.previewTimer = null;
  }

  return {
    scheduleHoverPreview,
    showEdgeHoverPreview,
    clearHoverPreview,
    cancelHoverPreviewOnly,
    setGraphHover,
    renderHoverPreview,
    renderReader,
    renderSelectionPanel,
    destroy
  };
}

import type { NodeId, ThemeId } from "../types";
import { createGraphAggregationContainerElement, type GraphAggregationContainerElementHandlers } from "./aggregation-containers";
import { createCommunityWashElement } from "./community-washes";
import { createGraphEdgeElement, type GraphEdgeElementHandlers } from "./edges";
import { createGraphMinimap } from "./minimap";
import type { RenderableGraph } from "./model";
import { createGraphNodeElement, type GraphNodeElementHandlers } from "./nodes";
import type { PaintedGraphDom } from "./render-context";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface DomSvgGraphPaintHandlers extends GraphNodeElementHandlers, GraphEdgeElementHandlers, GraphAggregationContainerElementHandlers {
  onNodeClick: (id: NodeId, additive: boolean) => void;
  onNodeDoubleClick: (id: string) => boolean;
  onNodePreviewEnter: (id: NodeId) => void;
  onEdgePreviewEnter: (id: string) => void;
  onEdgePreviewLeave: () => void;
  onNodePreviewLeave: () => void;
}

export interface PaintDomSvgGraphInput {
  ownerDocument: Document;
  root: HTMLElement;
  graph: RenderableGraph;
  theme: ThemeId;
  hasHostReader: boolean;
  handlers: DomSvgGraphPaintHandlers;
}

export function paintDomSvgGraph(input: PaintDomSvgGraphInput): PaintedGraphDom {
  const { ownerDocument, root, graph, handlers } = input;
  root.replaceChildren();
  root.dataset.theme = input.theme;
  root.dataset.baseDensity = graph.densityMode;
  root.dataset.interactionMode = root.dataset.interactionMode || "idle";
  root.dataset.interactionMaxUpdates = String(graph.interaction.maxUpdatedObjects);
  root.dataset.interactionUpdatedObjects = String(graph.interaction.updatedObjects);
  root.dataset.interactionHiddenObjects = String(graph.interaction.hiddenObjects);
  root.dataset.interactionPreservedNodes = String(graph.interaction.preservedNodeIds.length);
  root.dataset.communityQuality = graph.communityQuality.level;
  root.dataset.communityBoundaryCertainty = graph.communityQuality.boundaryCertainty;
  root.dataset.communityAuxiliaryViews = graph.communityQuality.auxiliaryViews.map((view) => view.id).join(",");

  const painted = emptyPaintedDom();
  const contentLayer = ownerDocument.createElement("div");
  contentLayer.className = "graph-content-layer";
  contentLayer.dataset.viewportLayer = "true";
  painted.contentLayer = contentLayer;

  const svg = ownerDocument.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "llm-wiki-graph-svg");
  svg.dataset.graphBlank = "true";
  setGraphSvgViewBox(svg, graph);
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  painted.svgElement = svg;

  const washLayer = ownerDocument.createElementNS(SVG_NS, "g");
  washLayer.setAttribute("class", "community-wash-layer");
  for (const community of graph.communities) {
    const ellipse = createCommunityWashElement(ownerDocument, community);
    if (!ellipse) continue;
    washLayer.appendChild(ellipse);
    painted.communityWashElements.set(community.id, ellipse);
  }
  svg.appendChild(washLayer);

  const edgeLayer = ownerDocument.createElementNS(SVG_NS, "g");
  edgeLayer.setAttribute("class", "edge-layer");
  for (const edge of graph.edges) {
    const path = createGraphEdgeElement(ownerDocument, edge, handlers);
    edgeLayer.appendChild(path);
    painted.edgeElements.set(edge.id, path);
  }
  svg.appendChild(edgeLayer);
  contentLayer.appendChild(svg);

  const nodeLayer = ownerDocument.createElement("div");
  nodeLayer.className = "node-layer";
  for (const container of graph.aggregationContainers) {
    const button = createGraphAggregationContainerElement(ownerDocument, container, handlers);
    painted.aggregationContainerElements.set(container.id, button);
    nodeLayer.appendChild(button);
  }
  for (const node of graph.nodes) {
    const button = createGraphNodeElement(ownerDocument, node, handlers);
    painted.nodeElements.set(node.id, button);
    painted.basePoints.set(node.id, node.point);
    nodeLayer.appendChild(button);
  }
  contentLayer.appendChild(nodeLayer);
  root.appendChild(contentLayer);

  const preview = ownerDocument.createElement("aside");
  preview.className = "graph-hover-preview";
  preview.dataset.state = "closed";
  preview.setAttribute("aria-live", "polite");
  root.appendChild(preview);
  painted.previewElement = preview;

  const qualityNotice = createCommunityQualityNotice(ownerDocument, graph);
  if (qualityNotice) root.appendChild(qualityNotice);

  const minimap = createGraphMinimap(ownerDocument, graph.minimap);
  painted.miniViewportElement = minimap.viewportElement;
  painted.miniNodeElements = minimap.nodeElements;
  root.appendChild(minimap.element);

  if (!input.hasHostReader) {
    const reader = ownerDocument.createElement("aside");
    reader.className = "graph-reader";
    reader.dataset.state = graph.selectedNodeId ? "open" : "closed";
    root.appendChild(reader);
    painted.readerElement = reader;

    const selectionPanel = ownerDocument.createElement("aside");
    selectionPanel.className = "graph-selection-panel";
    selectionPanel.dataset.state = "closed";
    root.appendChild(selectionPanel);
    painted.selectionElement = selectionPanel;
  }

  return painted;
}

function createCommunityQualityNotice(ownerDocument: Document, graph: RenderableGraph): HTMLElement | null {
  if (!graph.communityQuality.warning) return null;
  const notice = ownerDocument.createElement("aside");
  notice.className = "graph-quality-notice";
  notice.dataset.qualityLevel = graph.communityQuality.level;
  notice.dataset.boundaryCertainty = graph.communityQuality.boundaryCertainty;
  notice.setAttribute("aria-live", "polite");

  const label = ownerDocument.createElement("span");
  label.className = "graph-quality-notice-label";
  label.textContent = graph.communityQuality.level === "poor" ? "社区划分可信度低" : "社区划分可信度偏弱";
  notice.appendChild(label);

  for (const view of graph.communityQuality.auxiliaryViews) {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.className = "graph-quality-notice-action";
    button.dataset.auxiliaryViewId = view.id;
    button.textContent = view.label;
    notice.appendChild(button);
  }
  return notice;
}

function setGraphSvgViewBox(svg: SVGSVGElement, graph: RenderableGraph): void {
  const bounds = graph.worldBounds;
  svg.setAttribute("viewBox", `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`);
}

function emptyPaintedDom(): PaintedGraphDom {
  return {
    contentLayer: null,
    svgElement: null,
    edgeElements: new Map(),
    communityWashElements: new Map(),
    aggregationContainerElements: new Map(),
    nodeElements: new Map(),
    miniNodeElements: new Map(),
    miniViewportElement: null,
    basePoints: new Map(),
    readerElement: null,
    selectionElement: null,
    searchElement: null,
    searchInput: null,
    searchStatusElement: null,
    toolbarElement: null,
    toolbarPanelElement: null,
    legendElement: null,
    legendRows: new Map(),
    previewElement: null
  };
}

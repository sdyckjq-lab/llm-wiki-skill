import type { RenderableEdge } from "./model";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface GraphEdgeElementHandlers {
  onEdgePreviewEnter: (id: string) => void;
  onEdgePreviewLeave: () => void;
}

export function createGraphEdgeElement(
  ownerDocument: Document,
  edge: RenderableEdge,
  handlers: GraphEdgeElementHandlers
): SVGPathElement {
  const path = ownerDocument.createElementNS(SVG_NS, "path");
  path.setAttribute("d", edge.path);
  path.setAttribute("class", `edge confidence-${edge.confidence} ${edge.relationClass}`);
  path.setAttribute("data-from", edge.source);
  path.setAttribute("data-to", edge.target);
  path.setAttribute("data-edge-id", edge.id);
  path.setAttribute("data-confidence", edge.confidence);
  path.setAttribute("data-relation-type", edge.relationType);
  path.setAttribute("data-skeleton", edge.skeleton ? "true" : "false");
  path.setAttribute("data-traceable", edge.traceable ? "true" : "false");
  path.setAttribute("aria-label", `${edge.relationType} · ${edgeConfidenceLabel(edge.confidence)}`);
  path.setAttribute("tabindex", "0");
  path.addEventListener("pointerenter", () => handlers.onEdgePreviewEnter(edge.id));
  path.addEventListener("pointerleave", () => handlers.onEdgePreviewLeave());
  path.addEventListener("focus", () => handlers.onEdgePreviewEnter(edge.id));
  path.addEventListener("blur", () => handlers.onEdgePreviewLeave());
  path.style.strokeWidth = String(edge.strokeWidth);
  path.style.setProperty("--edge-map-width", `${edge.strokeWidth}px`);
  path.style.opacity = String(edge.opacity);
  const title = ownerDocument.createElementNS(SVG_NS, "title");
  title.textContent = `${edge.relationType} · ${edgeConfidenceLabel(edge.confidence)}`;
  path.appendChild(title);
  return path;
}

export function edgeConfidenceLabel(confidence: string): string {
  switch (confidence) {
    case "inferred":
      return "推断";
    case "ambiguous":
      return "待确认";
    case "unverified":
      return "未验证";
    default:
      return "原文";
  }
}

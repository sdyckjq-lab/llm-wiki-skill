import type { SigmaCommunityCloud } from "./community-cloud-geometry";

export const SIGMA_OVERLAY_SVG_NS = "http://www.w3.org/2000/svg";

export function createSigmaOverlayRoot(root: HTMLElement): HTMLElement {
  const overlay = root.ownerDocument.createElement("div");
  overlay.className = "sigma-global-overlay";
  overlay.dataset.role = "sigma-global-overlay";
  root.append(overlay);
  return overlay;
}

export function sigmaOverlayButton(ownerDocument: Document, kind: string, id: string, label: string): HTMLButtonElement {
  const element = ownerDocument.createElement("button");
  element.type = "button";
  element.dataset.kind = kind;
  element.dataset.id = id;
  element.setAttribute("aria-label", label);
  return element;
}

export function sigmaOverlayPassiveElement(ownerDocument: Document, kind: string, id: string): HTMLDivElement {
  const element = ownerDocument.createElement("div");
  element.dataset.kind = kind;
  element.dataset.id = id;
  element.setAttribute("aria-hidden", "true");
  element.tabIndex = -1;
  element.style.pointerEvents = "none";
  return element;
}

export function applyOverlayBox(element: HTMLElement, box: { left: number; top: number; width: number; height: number }): void {
  element.style.left = `${box.left}px`;
  element.style.top = `${box.top}px`;
  element.style.width = `${box.width}px`;
  element.style.height = `${box.height}px`;
}

let sigmaCloudFilterSequence = 0;

export function nextSigmaCloudFilterSequence(): number {
  sigmaCloudFilterSequence += 1;
  return sigmaCloudFilterSequence;
}

export function sigmaSharedCloudFilterDef(ownerDocument: Document, filterId: string): SVGSVGElement {
  const svg = ownerDocument.createElementNS(SIGMA_OVERLAY_SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";
  const defs = ownerDocument.createElementNS(SIGMA_OVERLAY_SVG_NS, "defs");
  const filter = ownerDocument.createElementNS(SIGMA_OVERLAY_SVG_NS, "filter");
  filter.setAttribute("id", filterId);
  filter.setAttribute("x", "-50%");
  filter.setAttribute("y", "-50%");
  filter.setAttribute("width", "200%");
  filter.setAttribute("height", "200%");
  const blur = ownerDocument.createElementNS(SIGMA_OVERLAY_SVG_NS, "feGaussianBlur");
  blur.setAttribute("stdDeviation", "20");
  filter.append(blur);
  defs.append(filter);
  svg.append(defs);
  return svg;
}

export type SigmaCloudKind = "polygon" | "ellipse";

export interface SigmaCloudSvgHandle {
  svg: SVGSVGElement;
  shape: SVGElement;
  kind: SigmaCloudKind;
}

// 创建一次：svg 容器 + 形状元素 + 点击监听（只绑一次）。颜色/几何随后通过
// applySigmaCloudColor / applySigmaCloudGeometry 更新，相机移动时无需重建。
export function createSigmaCloudSvg(
  ownerDocument: Document,
  cloud: SigmaCommunityCloud,
  filterId: string,
  onSelect: () => void
): SigmaCloudSvgHandle {
  const svg = ownerDocument.createElementNS(SIGMA_OVERLAY_SVG_NS, "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.position = "absolute";
  svg.style.inset = "0";
  svg.style.overflow = "visible";
  svg.style.pointerEvents = "none";
  const kind: SigmaCloudKind = cloud.localPoints ? "polygon" : "ellipse";
  const shape = ownerDocument.createElementNS(SIGMA_OVERLAY_SVG_NS, kind);
  shape.setAttribute("filter", `url(#${filterId})`);
  shape.style.pointerEvents = "fill";
  shape.style.cursor = "pointer";
  shape.addEventListener("click", (event) => {
    event.stopPropagation();
    onSelect();
  });
  applySigmaCloudGeometry(shape, kind, cloud);
  svg.append(shape);
  return { svg, shape, kind };
}

export function applySigmaCloudColor(shape: SVGElement, color: string, dim: boolean): void {
  shape.setAttribute("fill", color);
  shape.setAttribute("fill-opacity", dim ? "0.06" : "0.2");
}

export function applySigmaCloudGeometry(shape: SVGElement, kind: SigmaCloudKind, cloud: SigmaCommunityCloud): void {
  if (kind === "polygon") {
    if (cloud.localPoints) {
      shape.setAttribute("points", cloud.localPoints.map((p) => `${p.x},${p.y}`).join(" "));
    }
    return;
  }
  shape.setAttribute("cx", String(cloud.box.width / 2));
  shape.setAttribute("cy", String(cloud.box.height / 2));
  shape.setAttribute("rx", String(Math.max(8, cloud.box.width / 2)));
  shape.setAttribute("ry", String(Math.max(8, cloud.box.height / 2)));
}

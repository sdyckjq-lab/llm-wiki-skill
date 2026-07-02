import type { RendererPoint, RendererViewport, RendererViewportSize } from "./viewport";

export interface GraphWorldPoint {
  x: number;
  y: number;
}

export interface GraphWorldSize {
  width: number;
  height: number;
}

export interface GraphWorldBounds extends GraphWorldSize {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GraphScreenPoint {
  x: number;
  y: number;
}

export interface GraphLayerPoint {
  x: number;
  y: number;
}

export interface GraphCssPercentPoint {
  x: number;
  y: number;
}

export interface GraphSvgPoint {
  x: number;
  y: number;
}

export interface GraphMinimapPoint {
  x: number;
  y: number;
}

export interface GraphClientPoint {
  x: number;
  y: number;
}

export interface GraphDomRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface GraphWorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphMinimapViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const GRAPH_WORLD_SIZE = {
  width: 1000,
  height: 680
} as const;

export const GRAPH_WORLD_BOUNDS: GraphWorldBounds = {
  minX: 0,
  minY: 0,
  maxX: GRAPH_WORLD_SIZE.width,
  maxY: GRAPH_WORLD_SIZE.height,
  width: GRAPH_WORLD_SIZE.width,
  height: GRAPH_WORLD_SIZE.height
} as const;

export const GRAPH_MINIMAP_VIEWBOX: GraphMinimapViewBox = {
  x: 5,
  y: 3,
  width: 150,
  height: 48
};

export function rootClientPointToScreenPoint(clientPoint: GraphClientPoint, rootRect: GraphDomRectLike): GraphScreenPoint {
  return {
    x: finiteNumber(clientPoint.x, 0) - finiteNumber(rootRect.left, 0),
    y: finiteNumber(clientPoint.y, 0) - finiteNumber(rootRect.top, 0)
  };
}

export function worldPointToLayerPoint(
  worldPoint: GraphWorldPoint,
  viewportSize: RendererViewportSize,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): GraphLayerPoint {
  const size = normalizeViewportSize(viewportSize);
  const bounds = normalizeWorldBounds(worldBounds);
  return {
    x: (finiteNumber(worldPoint.x, bounds.minX) - bounds.minX) / bounds.width * size.width,
    y: (finiteNumber(worldPoint.y, bounds.minY) - bounds.minY) / bounds.height * size.height
  };
}

export function worldPointToCssPercentPoint(worldPoint: GraphWorldPoint, worldSize: GraphWorldSize | GraphWorldBounds = GRAPH_WORLD_BOUNDS): GraphCssPercentPoint {
  const size = normalizeWorldBounds(worldSize);
  return {
    x: (finiteNumber(worldPoint.x, size.minX) - size.minX) / size.width * 100,
    y: (finiteNumber(worldPoint.y, size.minY) - size.minY) / size.height * 100
  };
}

export function layerPointToWorldPoint(
  layerPoint: GraphLayerPoint,
  viewportSize: RendererViewportSize,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): GraphWorldPoint {
  const size = normalizeViewportSize(viewportSize);
  const bounds = normalizeWorldBounds(worldBounds);
  return {
    x: bounds.minX + finiteNumber(layerPoint.x, 0) / size.width * bounds.width,
    y: bounds.minY + finiteNumber(layerPoint.y, 0) / size.height * bounds.height
  };
}

export function worldPointToScreenPoint(
  worldPoint: GraphWorldPoint,
  viewport: RendererViewport,
  viewportSize: RendererViewportSize,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): GraphScreenPoint {
  const layerPoint = worldPointToLayerPoint(worldPoint, viewportSize, worldBounds);
  const safe = normalizeViewport(viewport);
  return {
    x: safe.x + safe.scale * layerPoint.x,
    y: safe.y + safe.scale * layerPoint.y
  };
}

export function screenPointToWorldPoint(
  screenPoint: GraphScreenPoint,
  viewport: RendererViewport,
  viewportSize: RendererViewportSize,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): GraphWorldPoint {
  const safe = normalizeViewport(viewport);
  const scale = Math.max(0.000001, safe.scale);
  return layerPointToWorldPoint({
    x: (finiteNumber(screenPoint.x, 0) - safe.x) / scale,
    y: (finiteNumber(screenPoint.y, 0) - safe.y) / scale
  }, viewportSize, worldBounds);
}

export function worldDeltaToLayerDelta(
  worldDelta: GraphWorldPoint,
  viewportSize: RendererViewportSize,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): GraphLayerPoint {
  const size = normalizeViewportSize(viewportSize);
  const bounds = normalizeWorldBounds(worldBounds);
  return {
    x: finiteNumber(worldDelta.x, 0) / bounds.width * size.width,
    y: finiteNumber(worldDelta.y, 0) / bounds.height * size.height
  };
}

export function worldPointDeltaToLayerDelta(
  previousWorldPoint: GraphWorldPoint,
  nextWorldPoint: GraphWorldPoint,
  viewportSize: RendererViewportSize,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): GraphLayerPoint {
  return worldDeltaToLayerDelta({
    x: finiteNumber(nextWorldPoint.x, 0) - finiteNumber(previousWorldPoint.x, 0),
    y: finiteNumber(nextWorldPoint.y, 0) - finiteNumber(previousWorldPoint.y, 0)
  }, viewportSize, worldBounds);
}

export function layerDeltaToWorldDelta(
  layerDelta: GraphLayerPoint,
  viewportSize: RendererViewportSize,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): GraphWorldPoint {
  const size = normalizeViewportSize(viewportSize);
  const bounds = normalizeWorldBounds(worldBounds);
  return {
    x: finiteNumber(layerDelta.x, 0) / size.width * bounds.width,
    y: finiteNumber(layerDelta.y, 0) / size.height * bounds.height
  };
}

export function worldPointToSvgPoint(worldPoint: GraphWorldPoint): GraphSvgPoint {
  return {
    x: finiteNumber(worldPoint.x, 0),
    y: finiteNumber(worldPoint.y, 0)
  };
}

export function svgPointToWorldPoint(svgPoint: GraphSvgPoint): GraphWorldPoint {
  return {
    x: finiteNumber(svgPoint.x, 0),
    y: finiteNumber(svgPoint.y, 0)
  };
}

export function worldPointToMinimapPoint(
  worldPoint: GraphWorldPoint,
  viewBox: GraphMinimapViewBox = GRAPH_MINIMAP_VIEWBOX,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): GraphMinimapPoint {
  const box = normalizeMinimapViewBox(viewBox);
  const bounds = normalizeWorldBounds(worldBounds);
  return {
    x: box.x + (clamp(finiteNumber(worldPoint.x, bounds.minX), bounds.minX, bounds.maxX) - bounds.minX) / bounds.width * box.width,
    y: box.y + (clamp(finiteNumber(worldPoint.y, bounds.minY), bounds.minY, bounds.maxY) - bounds.minY) / bounds.height * box.height
  };
}

export function minimapPointToWorldPoint(
  minimapPoint: GraphMinimapPoint,
  viewBox: GraphMinimapViewBox = GRAPH_MINIMAP_VIEWBOX,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): GraphWorldPoint {
  const box = normalizeMinimapViewBox(viewBox);
  const bounds = normalizeWorldBounds(worldBounds);
  return {
    x: clamp(bounds.minX + (finiteNumber(minimapPoint.x, box.x) - box.x) / box.width * bounds.width, bounds.minX, bounds.maxX),
    y: clamp(bounds.minY + (finiteNumber(minimapPoint.y, box.y) - box.y) / box.height * bounds.height, bounds.minY, bounds.maxY)
  };
}

export function visibleWorldRectForViewport(
  viewport: RendererViewport,
  viewportSize: RendererViewportSize,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): GraphWorldRect {
  const bounds = normalizeWorldBounds(worldBounds);
  const topLeft = screenPointToWorldPoint({ x: 0, y: 0 }, viewport, viewportSize, bounds);
  const size = normalizeViewportSize(viewportSize);
  const bottomRight = screenPointToWorldPoint(
    { x: size.width, y: size.height },
    viewport,
    viewportSize,
    bounds
  );
  return {
    x: clamp(topLeft.x, bounds.minX, bounds.maxX),
    y: clamp(topLeft.y, bounds.minY, bounds.maxY),
    width: Math.max(0, clamp(bottomRight.x, bounds.minX, bounds.maxX) - clamp(topLeft.x, bounds.minX, bounds.maxX)),
    height: Math.max(0, clamp(bottomRight.y, bounds.minY, bounds.maxY) - clamp(topLeft.y, bounds.minY, bounds.maxY))
  };
}

export function visibleWorldRectToMinimapRect(
  worldRect: GraphWorldRect,
  viewBox: GraphMinimapViewBox = GRAPH_MINIMAP_VIEWBOX,
  worldBounds: GraphWorldBounds | GraphWorldSize = GRAPH_WORLD_BOUNDS
): { x: number; y: number; width: number; height: number } {
  const topLeft = worldPointToMinimapPoint({ x: worldRect.x, y: worldRect.y }, viewBox, worldBounds);
  const bottomRight = worldPointToMinimapPoint({
    x: worldRect.x + worldRect.width,
    y: worldRect.y + worldRect.height
  }, viewBox, worldBounds);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(0, bottomRight.x - topLeft.x),
    height: Math.max(0, bottomRight.y - topLeft.y)
  };
}

export function rendererPointToScreenPoint(point: RendererPoint): GraphScreenPoint {
  return {
    x: finiteNumber(point.x, 0),
    y: finiteNumber(point.y, 0)
  };
}

export function defaultGraphViewportSize(): RendererViewportSize {
  return {
    width: GRAPH_WORLD_SIZE.width,
    height: GRAPH_WORLD_SIZE.height
  };
}

export function sideExitWorldAnchor(worldPoint: GraphWorldPoint, margin = 80, worldSize: GraphWorldSize | GraphWorldBounds = GRAPH_WORLD_BOUNDS): GraphWorldPoint {
  const size = normalizeWorldBounds(worldSize);
  const safeMargin = Math.max(0, finiteNumber(margin, 80));
  return {
    x: finiteNumber(worldPoint.x, size.minX) < size.minX + size.width / 2 ? size.minX - safeMargin : size.maxX + safeMargin,
    y: clamp(finiteNumber(worldPoint.y, size.minY), size.minY + safeMargin, Math.max(size.minY + safeMargin, size.maxY - safeMargin))
  };
}

export function worldBoundsForPoints(
  points: GraphWorldPoint[],
  options: { padding?: number; minWidth?: number; minHeight?: number; aspectRatio?: number } = {}
): GraphWorldBounds {
  const padding = Math.max(0, finiteNumber(options.padding, 80));
  const minWidth = Math.max(1, finiteNumber(options.minWidth, GRAPH_WORLD_SIZE.width));
  const minHeight = Math.max(1, finiteNumber(options.minHeight, GRAPH_WORLD_SIZE.height));
  let minX = 0;
  let minY = 0;
  let maxX = minWidth;
  let maxY = minHeight;
  for (const point of points) {
    const x = finiteNumber(point.x, 0);
    const y = finiteNumber(point.y, 0);
    minX = Math.min(minX, x - padding);
    minY = Math.min(minY, y - padding);
    maxX = Math.max(maxX, x + padding);
    maxY = Math.max(maxY, y + padding);
  }
  let width = maxX - minX;
  let height = maxY - minY;
  // fit-aware: 把 bounds aspect-lock 到 viewport 宽高比（只扩短轴，中心不变，不丢点），
  // 让 DOM 层各轴归一化（CSS%）从各向异性仿射变为相似变换，消除社区视图形状畸变。
  const aspectRatio = Number(options.aspectRatio);
  if (Number.isFinite(aspectRatio) && aspectRatio > 0 && width > 0 && height > 0) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    if (width / height < aspectRatio) width = height * aspectRatio;
    else height = width / aspectRatio;
    minX = cx - width / 2;
    maxX = cx + width / 2;
    minY = cy - height / 2;
    maxY = cy + height / 2;
  }
  return normalizeWorldBounds({ minX, minY, maxX, maxY, width, height: maxY - minY });
}

function normalizeViewport(viewport: RendererViewport): RendererViewport {
  return {
    x: finiteNumber(viewport.x, 0),
    y: finiteNumber(viewport.y, 0),
    scale: Math.max(0.000001, finiteNumber(viewport.scale, 1))
  };
}

function normalizeViewportSize(size: RendererViewportSize): RendererViewportSize {
  return {
    width: Math.max(1, finiteNumber(size.width, GRAPH_WORLD_SIZE.width)),
    height: Math.max(1, finiteNumber(size.height, GRAPH_WORLD_SIZE.height))
  };
}

function normalizeWorldBounds(size: GraphWorldSize | GraphWorldBounds): GraphWorldBounds {
  if ("minX" in size || "maxX" in size || "minY" in size || "maxY" in size) {
    const raw = size as Partial<GraphWorldBounds>;
    const minX = finiteNumber(raw.minX, 0);
    const minY = finiteNumber(raw.minY, 0);
    const maxX = Math.max(minX + 1, finiteNumber(raw.maxX, minX + finiteNumber(raw.width, GRAPH_WORLD_SIZE.width)));
    const maxY = Math.max(minY + 1, finiteNumber(raw.maxY, minY + finiteNumber(raw.height, GRAPH_WORLD_SIZE.height)));
    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY)
    };
  }
  return {
    minX: 0,
    minY: 0,
    maxX: Math.max(1, finiteNumber(size.width, GRAPH_WORLD_SIZE.width)),
    maxY: Math.max(1, finiteNumber(size.height, GRAPH_WORLD_SIZE.height)),
    width: Math.max(1, finiteNumber(size.width, GRAPH_WORLD_SIZE.width)),
    height: Math.max(1, finiteNumber(size.height, GRAPH_WORLD_SIZE.height))
  };
}

function normalizeMinimapViewBox(viewBox: GraphMinimapViewBox): GraphMinimapViewBox {
  return {
    x: finiteNumber(viewBox.x, GRAPH_MINIMAP_VIEWBOX.x),
    y: finiteNumber(viewBox.y, GRAPH_MINIMAP_VIEWBOX.y),
    width: Math.max(1, finiteNumber(viewBox.width, GRAPH_MINIMAP_VIEWBOX.width)),
    height: Math.max(1, finiteNumber(viewBox.height, GRAPH_MINIMAP_VIEWBOX.height))
  };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

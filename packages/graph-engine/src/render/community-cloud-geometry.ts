import type { GraphRendererAdapterData } from "./adapter";
import type { GraphScreenPoint } from "./geometry";
import { sigmaWorldPointToScreenPoint } from "./sigma-coordinates";
import type { SigmaGlobalRendererCreateOptions, SigmaGlobalSigmaLike } from "./sigma-global-renderer";

export interface SigmaCommunityCloud {
  box: { left: number; top: number; width: number; height: number };
  localPoints: Array<{ x: number; y: number }> | null;
}

export interface SigmaCommunityCloudBasis {
  hullPoints: Array<{ x: number; y: number }>;
  signature: string;
}

export function sigmaCommunityCloudBasisById(adapterData: GraphRendererAdapterData): Map<string, SigmaCommunityCloudBasis> {
  const washByCommunityId = new Map(adapterData.renderable.communities.map((community) => [community.id, community.wash]));
  const pointsByCommunityId = new Map<string, Array<{ x: number; y: number }>>();
  for (const node of adapterData.nodes) {
    if (!node.communityId) continue;
    const wash = washByCommunityId.get(node.communityId);
    if (!wash) continue;
    const list = pointsByCommunityId.get(node.communityId);
    const point = clampPointToWorldEllipse(node.point, wash);
    if (list) list.push(point);
    else pointsByCommunityId.set(node.communityId, [point]);
  }
  const output = new Map<string, SigmaCommunityCloudBasis>();
  for (const [communityId, points] of pointsByCommunityId) {
    output.set(communityId, { hullPoints: convexHull2d(points), signature: sigmaCommunityCloudSignature(points, washByCommunityId.get(communityId)) });
  }
  return output;
}

export function sigmaCommunityCloudBasisByIdWithReuse(
  previous: Map<string, SigmaCommunityCloudBasis>,
  adapterData: GraphRendererAdapterData
): Map<string, SigmaCommunityCloudBasis> {
  const washByCommunityId = new Map(adapterData.renderable.communities.map((community) => [community.id, community.wash]));
  const pointsByCommunityId = new Map<string, Array<{ x: number; y: number }>>();
  for (const node of adapterData.nodes) {
    if (!node.communityId) continue;
    const wash = washByCommunityId.get(node.communityId);
    if (!wash) continue;
    const list = pointsByCommunityId.get(node.communityId);
    const point = clampPointToWorldEllipse(node.point, wash);
    if (list) list.push(point);
    else pointsByCommunityId.set(node.communityId, [point]);
  }
  const output = new Map<string, SigmaCommunityCloudBasis>();
  for (const [communityId, points] of pointsByCommunityId) {
    const signature = sigmaCommunityCloudSignature(points, washByCommunityId.get(communityId));
    const cached = previous.get(communityId);
    output.set(communityId, cached?.signature === signature ? cached : { hullPoints: convexHull2d(points), signature });
  }
  return output;
}

export function sigmaCommunityCloudBasisByIdWithNodePoint(
  previous: Map<string, SigmaCommunityCloudBasis>,
  adapterData: GraphRendererAdapterData,
  nodeId: string
): Map<string, SigmaCommunityCloudBasis> {
  const changedNode = adapterData.nodes.find((node) => node.id === nodeId);
  if (!changedNode?.communityId) return previous;
  const community = adapterData.renderable.communities.find((item) => item.id === changedNode.communityId);
  if (!community?.wash) return previous;
  const wash = community.wash;
  const points = adapterData.nodes
    .filter((node) => node.communityId === changedNode.communityId)
    .map((node) => clampPointToWorldEllipse(node.point, wash));
  const signature = sigmaCommunityCloudSignature(points, wash);
  const cached = previous.get(changedNode.communityId);
  if (cached?.signature === signature) return previous;
  const next = new Map(previous);
  next.set(changedNode.communityId, { hullPoints: convexHull2d(points), signature });
  return next;
}

export function sigmaCommunityCloudSignature(
  points: readonly { x: number; y: number }[],
  wash: { cx: number; cy: number; rx: number; ry: number } | null | undefined
): string {
  const parts = wash ? [wash.cx, wash.cy, wash.rx, wash.ry] : [];
  for (const point of points) parts.push(point.x, point.y);
  return parts.map((value) => String(Math.round(value * 1000) / 1000)).join(",");
}

export function sigmaProjectedCloudHullPoints(
  basis: SigmaCommunityCloudBasis | undefined,
  sigma: SigmaGlobalSigmaLike,
  options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
): GraphScreenPoint[] {
  return basis?.hullPoints.map((point) => sigmaWorldPointToScreenPoint(sigma, point, options)) ?? [];
}

export function clampPointToWorldEllipse(
  point: { x: number; y: number },
  ellipse: { cx: number; cy: number; rx: number; ry: number }
): { x: number; y: number } {
  const rx = Math.max(1, ellipse.rx);
  const ry = Math.max(1, ellipse.ry);
  const dx = point.x - ellipse.cx;
  const dy = point.y - ellipse.cy;
  const distance = Math.hypot(dx / rx, dy / ry);
  if (distance <= 1) return { x: point.x, y: point.y };
  return {
    x: ellipse.cx + dx / distance,
    y: ellipse.cy + dy / distance
  };
}

export function sigmaCommunityCloud(
  screenHullPoints: GraphScreenPoint[],
  fallbackBox: { left: number; top: number; width: number; height: number }
): SigmaCommunityCloud {
  const hull = screenHullPoints;
  if (hull.length >= 3) {
    const cx = hull.reduce((sum, p) => sum + p.x, 0) / hull.length;
    const cy = hull.reduce((sum, p) => sum + p.y, 0) / hull.length;
    const expanded = hull.map((p) => clampPointToScreenEllipse({
      x: p.x + (p.x - cx) * 0.4,
      y: p.y + (p.y - cy) * 0.4
    }, fallbackBox));
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of expanded) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const box = { left: minX, top: minY, width: Math.max(8, maxX - minX), height: Math.max(8, maxY - minY) };
    return { box, localPoints: expanded.map((p) => ({ x: p.x - box.left, y: p.y - box.top })) };
  }
  return { box: fallbackBox, localPoints: null };
}

export function clampPointToScreenEllipse(
  point: GraphScreenPoint,
  box: { left: number; top: number; width: number; height: number }
): GraphScreenPoint {
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const rx = Math.max(1, box.width / 2);
  const ry = Math.max(1, box.height / 2);
  const dx = point.x - cx;
  const dy = point.y - cy;
  const distance = Math.hypot(dx / rx, dy / ry);
  if (distance <= 1) return point;
  return {
    x: cx + dx / distance,
    y: cy + dy / distance
  };
}

export function convexHull2d(points: GraphScreenPoint[]): GraphScreenPoint[] {
  if (points.length < 3) return points.slice();
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: GraphScreenPoint, a: GraphScreenPoint, b: GraphScreenPoint): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: GraphScreenPoint[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: GraphScreenPoint[] = [];
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

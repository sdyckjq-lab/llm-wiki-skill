import { GRAPH_WORLD_SIZE } from "./geometry";

export interface CommunityWashPoint {
  x: number;
  y: number;
}

export interface CommunityWashNodeLike {
  point: CommunityWashPoint;
}

export interface CommunityWash {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  opacity: number;
}

export interface CommunityWashOptions {
  minRadiusX?: number;
  minRadiusY?: number;
  paddingX?: number;
  paddingY?: number;
  maxRadiusX?: number;
  maxRadiusY?: number;
}

interface CommunityWashBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface CommunityWashCore {
  core: CommunityWashPoint[];
  outliers: CommunityWashPoint[];
}

const DEFAULT_MIN_RADIUS_X = 54;
const DEFAULT_MIN_RADIUS_Y = 36;
const DEFAULT_PADDING_X = 46;
const DEFAULT_PADDING_Y = 34;
const COMMUNITY_WASH_CORE_EXACT_LIMIT = 240;
export const DEFAULT_COMMUNITY_WASH_MAX_RADIUS_X = GRAPH_WORLD_SIZE.width * 0.19;
export const DEFAULT_COMMUNITY_WASH_MAX_RADIUS_Y = round(GRAPH_WORLD_SIZE.height * 0.21);

export function computeCommunityWash(nodes: CommunityWashNodeLike[], options: CommunityWashOptions = {}): CommunityWash | null {
  if (!nodes.length) return null;
  const points = nodes.map((node) => normalizePoint(node.point));
  const policy = normalizeCommunityWashOptions(options);
  const { core, outliers } = communityWashCore(points);
  const base = cappedBounds(
    paddedBounds(core, policy),
    policy.maxRadiusX * 2,
    policy.maxRadiusY * 2
  );
  const finalBounds = outliers.length
    ? expandBoundsTowardOutliers(base, paddedBounds([...core, ...outliers], policy), policy)
    : base;

  return {
    cx: round((finalBounds.minX + finalBounds.maxX) / 2),
    cy: round((finalBounds.minY + finalBounds.maxY) / 2),
    rx: round((finalBounds.maxX - finalBounds.minX) / 2),
    ry: round((finalBounds.maxY - finalBounds.minY) / 2),
    opacity: nodes.length > 1 ? 0.11 : 0.06
  };
}

function normalizeCommunityWashOptions(options: CommunityWashOptions): Required<CommunityWashOptions> {
  return {
    minRadiusX: finitePositiveNumber(options.minRadiusX, DEFAULT_MIN_RADIUS_X),
    minRadiusY: finitePositiveNumber(options.minRadiusY, DEFAULT_MIN_RADIUS_Y),
    paddingX: finitePositiveNumber(options.paddingX, DEFAULT_PADDING_X),
    paddingY: finitePositiveNumber(options.paddingY, DEFAULT_PADDING_Y),
    maxRadiusX: finitePositiveNumber(options.maxRadiusX, DEFAULT_COMMUNITY_WASH_MAX_RADIUS_X),
    maxRadiusY: finitePositiveNumber(options.maxRadiusY, DEFAULT_COMMUNITY_WASH_MAX_RADIUS_Y)
  };
}

function communityWashCore(points: CommunityWashPoint[]): CommunityWashCore {
  if (points.length <= 3) return { core: points, outliers: [] };
  const scoredPoints = points.length > COMMUNITY_WASH_CORE_EXACT_LIMIT
    ? representativeWashPoints(points, COMMUNITY_WASH_CORE_EXACT_LIMIT)
    : points;
  const scored = scoredPoints
    .map((point) => ({
      point,
      neighborScore: nearestNeighborScore(point, scoredPoints)
    }))
    .sort((left, right) => left.neighborScore - right.neighborScore);
  const coreCount = Math.max(2, Math.ceil(scored.length * 0.75));
  const core = scored.slice(0, coreCount);
  const outliers = scored.slice(coreCount);
  const coreMax = Math.max(...core.map((item) => item.neighborScore));
  const outlierMin = Math.min(...outliers.map((item) => item.neighborScore));
  if (!Number.isFinite(outlierMin) || outlierMin <= Math.max(180, coreMax * 2.5)) {
    return { core: points, outliers: [] };
  }
  return {
    core: core.map((item) => item.point),
    outliers: outliers.map((item) => item.point)
  };
}

function representativeWashPoints(points: CommunityWashPoint[], limit: number): CommunityWashPoint[] {
  if (points.length <= limit) return points;
  const lastIndex = points.length - 1;
  const representatives: CommunityWashPoint[] = [];
  const seen = new Set<number>();
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round(index * lastIndex / Math.max(1, limit - 1));
    if (seen.has(sourceIndex)) continue;
    seen.add(sourceIndex);
    representatives.push(points[sourceIndex]);
  }
  return representatives;
}

function paddedBounds(points: CommunityWashPoint[], options: Required<CommunityWashOptions>): CommunityWashBounds {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = Math.max(options.minRadiusX, (maxX - minX) / 2 + options.paddingX);
  const ry = Math.max(options.minRadiusY, (maxY - minY) / 2 + options.paddingY);
  return {
    minX: cx - rx,
    maxX: cx + rx,
    minY: cy - ry,
    maxY: cy + ry
  };
}

function expandBoundsTowardOutliers(
  base: CommunityWashBounds,
  desired: CommunityWashBounds,
  options: Required<CommunityWashOptions>
): CommunityWashBounds {
  const horizontal = expandAxis(base.minX, base.maxX, desired.minX, desired.maxX, options.maxRadiusX * 2);
  const vertical = expandAxis(base.minY, base.maxY, desired.minY, desired.maxY, options.maxRadiusY * 2);
  return {
    minX: horizontal.min,
    maxX: horizontal.max,
    minY: vertical.min,
    maxY: vertical.max
  };
}

function expandAxis(
  baseMin: number,
  baseMax: number,
  desiredMin: number,
  desiredMax: number,
  maxSize: number
): { min: number; max: number } {
  const base = cappedAxis(baseMin, baseMax, maxSize);
  const leftExtra = Math.max(0, base.min - desiredMin);
  const rightExtra = Math.max(0, desiredMax - base.max);
  const available = Math.max(0, maxSize - (base.max - base.min));
  const totalExtra = leftExtra + rightExtra;
  if (totalExtra <= 0 || available <= 0) return base;
  const used = Math.min(available, totalExtra);
  return {
    min: base.min - used * (leftExtra / totalExtra),
    max: base.max + used * (rightExtra / totalExtra)
  };
}

function cappedBounds(bounds: CommunityWashBounds, maxWidth: number, maxHeight: number): CommunityWashBounds {
  const horizontal = cappedAxis(bounds.minX, bounds.maxX, maxWidth);
  const vertical = cappedAxis(bounds.minY, bounds.maxY, maxHeight);
  return {
    minX: horizontal.min,
    maxX: horizontal.max,
    minY: vertical.min,
    maxY: vertical.max
  };
}

function cappedAxis(min: number, max: number, maxSize: number): { min: number; max: number } {
  const size = max - min;
  if (size <= maxSize) return { min, max };
  const center = (min + max) / 2;
  const radius = maxSize / 2;
  return {
    min: center - radius,
    max: center + radius
  };
}

function nearestNeighborScore(point: CommunityWashPoint, points: CommunityWashPoint[]): number {
  const distances = points
    .filter((candidate) => candidate !== point)
    .map((candidate) => distance(point, candidate))
    .sort((left, right) => left - right);
  const nearest = distances.slice(0, Math.min(2, distances.length));
  return nearest.reduce((sum, value) => sum + value, 0) / Math.max(1, nearest.length);
}

function distance(left: CommunityWashPoint, right: CommunityWashPoint): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function normalizePoint(point: CommunityWashPoint): CommunityWashPoint {
  return {
    x: finiteNumber(point.x, 0),
    y: finiteNumber(point.y, 0)
  };
}

function finitePositiveNumber(value: unknown, fallback: number): number {
  const numeric = finiteNumber(value, fallback);
  return numeric > 0 ? numeric : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

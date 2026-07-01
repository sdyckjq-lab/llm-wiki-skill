import type { GraphRendererAdapterData } from "./adapter";
import type {
  SigmaGlobalCameraState,
  SigmaGlobalSigmaLike
} from "./sigma-global-types";

export type SigmaGlobalCameraMovement = "animated" | "immediate" | "skipped";

export type SigmaGlobalCameraSkipReason =
  | "no-community"
  | "already-settled"
  | "no-target"
  | "camera-unavailable"
  | "animate-unavailable"
  | "animate-error";

export interface SigmaGlobalCameraMoveResult {
  movement: SigmaGlobalCameraMovement;
  skipReason?: SigmaGlobalCameraSkipReason;
}

export interface SigmaCommunitySpotlightCameraResult extends SigmaGlobalCameraMoveResult {
  communityId: string | null;
}

export const SIGMA_COMMUNITY_SPOTLIGHT_CAMERA_ANIMATION_MS = 380;

export function readCameraState(sigma: SigmaGlobalSigmaLike): SigmaGlobalCameraState | null {
  const state = sigma.getCamera?.().getState?.();
  if (!state) return null;
  return {
    x: finiteNumber(state.x, 0),
    y: finiteNumber(state.y, 0),
    angle: finiteNumber(state.angle, 0),
    ratio: finiteNumber(state.ratio, 1)
  };
}

export function restoreCameraState(sigma: SigmaGlobalSigmaLike, state: SigmaGlobalCameraState | null): void {
  if (!state) return;
  sigma.getCamera?.().setState?.(state);
}

export function maybeAnimateSigmaCommunitySpotlightCamera(
  sigma: SigmaGlobalSigmaLike,
  root: HTMLElement,
  adapterData: GraphRendererAdapterData,
  communityId: string | null,
  previousCommunityId: string | null,
  onAnimationError?: (error: unknown) => void
): SigmaCommunitySpotlightCameraResult {
  if (!communityId) {
    return { communityId: null, movement: "skipped", skipReason: "no-community" };
  }
  if (communityId === previousCommunityId) {
    return { communityId, movement: "skipped", skipReason: "already-settled" };
  }
  const target = sigmaCommunitySpotlightCameraState(sigma, adapterData, communityId);
  if (!target) {
    return { communityId, movement: "skipped", skipReason: "no-target" };
  }
  const movement = moveSigmaCamera(
    sigma,
    target,
    prefersReducedMotion(root.ownerDocument.defaultView),
    onAnimationError
  );
  return { communityId, ...movement };
}

export function moveSigmaCamera(
  sigma: SigmaGlobalSigmaLike,
  target: Partial<SigmaGlobalCameraState>,
  reducedMotion: boolean,
  onAnimationError?: (error: unknown) => void
): SigmaGlobalCameraMoveResult {
  const camera = sigma.getCamera?.();
  if (!camera) return { movement: "skipped", skipReason: "camera-unavailable" };
  if (reducedMotion || !camera.animate) {
    if (!camera.setState) return { movement: "skipped", skipReason: "animate-unavailable" };
    camera.setState(target);
    return { movement: "immediate", skipReason: !camera.animate ? "animate-unavailable" : undefined };
  }
  try {
    const animation = camera.animate(target, { duration: SIGMA_COMMUNITY_SPOTLIGHT_CAMERA_ANIMATION_MS, easing: "quadraticInOut" });
    if (animation && typeof (animation as Promise<unknown>).catch === "function") {
      void (animation as Promise<unknown>).catch((error) => onAnimationError?.(error));
    }
    return { movement: "animated" };
  } catch (error) {
    onAnimationError?.(error);
    return { movement: "skipped", skipReason: "animate-error" };
  }
}

export function sigmaCommunitySpotlightCameraState(
  sigma: SigmaGlobalSigmaLike,
  adapterData: GraphRendererAdapterData,
  communityId: string
): Partial<SigmaGlobalCameraState> | null {
  const current = readCameraState(sigma) ?? { x: 0, y: 0, angle: 0, ratio: 1 };
  const center = sigmaCommunitySpotlightCenter(adapterData, communityId);
  if (!center) return null;
  const bounds = adapterData.renderable.worldBounds;
  const worldWidth = Math.max(0, finiteNumber(bounds.maxX, center.x) - finiteNumber(bounds.minX, center.x));
  const drawerOffset = worldWidth * 0.08;
  const graphTargetPoint = { x: center.x + drawerOffset, y: center.y };
  const targetPoint = sigmaGraphPointToCameraPoint(sigma, graphTargetPoint);
  const targetX = roundNumber(targetPoint.x, 3);
  const targetY = roundNumber(targetPoint.y, 3);
  const settledThreshold = sigmaCameraDistanceForGraphDistance(sigma, graphTargetPoint, Math.max(worldWidth * 0.015, 4));
  const positionSettled = Math.abs(current.x - targetX) <= settledThreshold
    && Math.abs(current.y - targetY) <= settledThreshold;
  const target = {
    x: targetX,
    y: targetY,
    angle: current.angle,
    ratio: positionSettled || current.ratio <= 0.9
      ? current.ratio
      : roundNumber(clamp(current.ratio * 0.92, 0.72, current.ratio), 3)
  };
  const settled = positionSettled
    && Math.abs(current.ratio - target.ratio) <= 0.025;
  return settled ? null : target;
}

export function sigmaGlobalCameraState(
  sigma: SigmaGlobalSigmaLike,
  adapterData: GraphRendererAdapterData
): Partial<SigmaGlobalCameraState> {
  const bounds = adapterData.renderable.worldBounds;
  const center = sigmaGraphPointToCameraPoint(sigma, {
    x: (finiteNumber(bounds.minX, 0) + finiteNumber(bounds.maxX, 0)) / 2,
    y: (finiteNumber(bounds.minY, 0) + finiteNumber(bounds.maxY, 0)) / 2
  });
  return {
    x: roundNumber(center.x, 3),
    y: roundNumber(center.y, 3),
    angle: 0,
    ratio: 1
  };
}

export function sigmaGraphPointToCameraPoint(
  sigma: SigmaGlobalSigmaLike,
  point: { x: number; y: number }
): { x: number; y: number } {
  const viewportPoint = sigma.graphToViewport?.(point);
  if (viewportPoint && (!Number.isFinite(viewportPoint.x) || !Number.isFinite(viewportPoint.y))) {
    return point;
  }
  const cameraPoint = viewportPoint ? sigma.viewportToFramedGraph?.(viewportPoint) : null;
  if (cameraPoint && Number.isFinite(cameraPoint.x) && Number.isFinite(cameraPoint.y)) {
    return cameraPoint;
  }
  return point;
}

export function sigmaCameraDistanceForGraphDistance(
  sigma: SigmaGlobalSigmaLike,
  point: { x: number; y: number },
  graphDistance: number
): number {
  if (graphDistance <= 0) return 0;
  const base = sigmaGraphPointToCameraPoint(sigma, point);
  const shifted = sigmaGraphPointToCameraPoint(sigma, { x: point.x + graphDistance, y: point.y });
  const distance = Math.abs(shifted.x - base.x);
  return Number.isFinite(distance) && distance > 0 ? distance : graphDistance;
}

export function sigmaCommunitySpotlightCenter(
  adapterData: GraphRendererAdapterData,
  communityId: string
): { x: number; y: number } | null {
  const renderableCommunity = adapterData.renderable.communities.find((community) => community.id === communityId);
  if (renderableCommunity?.wash) {
    return {
      x: finiteNumber(renderableCommunity.wash.cx, 0),
      y: finiteNumber(renderableCommunity.wash.cy, 0)
    };
  }
  const nodes = adapterData.nodes.filter((node) => node.communityId === communityId);
  if (nodes.length === 0) return null;
  const sum = nodes.reduce((acc, node) => ({
    x: acc.x + finiteNumber(node.point.x, 0),
    y: acc.y + finiteNumber(node.point.y, 0)
  }), { x: 0, y: 0 });
  return { x: sum.x / nodes.length, y: sum.y / nodes.length };
}

export function prefersReducedMotion(view: Window | null | undefined): boolean {
  return Boolean(view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundNumber(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

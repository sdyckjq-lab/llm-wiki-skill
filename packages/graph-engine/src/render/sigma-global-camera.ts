import type { GraphRendererAdapterData } from "./adapter";
import type { RendererViewportSize } from "./viewport";
import { SIGMA_CAMERA_MAX_RATIO } from "./sigma-zoom";
import type {
  SigmaGlobalCameraLike,
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

export interface SigmaCommunitySpotlightCameraResult extends SigmaGlobalViewTransitionResult {
  communityId: string | null;
}

export const SIGMA_COMMUNITY_SPOTLIGHT_CAMERA_ANIMATION_MS = 380;
export { SIGMA_COMMUNITY_RETURN_GLOBAL_TRANSITION_MS } from "../graph-transition-timings";

export interface SigmaGlobalViewTransition {
  isActive(): boolean;
  isGuardingStaleAnimation(): boolean;
  takeover(takeoverState: Partial<SigmaGlobalCameraState>): void;
  complete(): void;
  cancel(takeoverState?: Partial<SigmaGlobalCameraState>): void;
  dispose(): void;
}

export interface SigmaGlobalViewTransitionResult extends SigmaGlobalCameraMoveResult {
  transition: SigmaGlobalViewTransition | null;
}

export interface SigmaGlobalViewTransitionOptions {
  target: Partial<SigmaGlobalCameraState>;
  animate: boolean;
  reducedMotion: boolean;
  durationMs?: number;
  easing?: string;
  onComplete?: () => void;
  onCancel?: () => void;
  onCleanup?: () => void;
  onAnimationError?: (error: unknown) => void;
}

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
  viewportSize?: RendererViewportSize,
  onAnimationError?: (error: unknown) => void
): SigmaCommunitySpotlightCameraResult {
  if (!communityId) {
    return { communityId: null, movement: "skipped", skipReason: "no-community", transition: null };
  }
  if (communityId === previousCommunityId) {
    return { communityId, movement: "skipped", skipReason: "already-settled", transition: null };
  }
  const target = sigmaCommunitySpotlightCameraState(sigma, adapterData, communityId, viewportSize);
  if (!target) {
    return { communityId, movement: "skipped", skipReason: "no-target", transition: null };
  }
  const movement = startSigmaGlobalViewTransition(sigma, {
    target,
    animate: true,
    reducedMotion: prefersReducedMotion(root.ownerDocument.defaultView),
    onAnimationError
  });
  return { communityId, ...movement };
}

export function moveSigmaCamera(
  sigma: SigmaGlobalSigmaLike,
  target: Partial<SigmaGlobalCameraState>,
  reducedMotion: boolean,
  onAnimationError?: (error: unknown) => void
): SigmaGlobalCameraMoveResult {
  const result = startSigmaGlobalViewTransition(sigma, {
    target,
    animate: true,
    reducedMotion,
    onAnimationError
  });
  if (result.movement === "immediate" && !result.skipReason) {
    return { movement: "immediate", skipReason: undefined };
  }
  return result.skipReason
    ? { movement: result.movement, skipReason: result.skipReason }
    : { movement: result.movement };
}

export function startSigmaGlobalViewTransition(
  sigma: SigmaGlobalSigmaLike,
  options: SigmaGlobalViewTransitionOptions
): SigmaGlobalViewTransitionResult {
  const camera = sigma.getCamera?.();
  if (!camera) return { movement: "skipped", skipReason: "camera-unavailable", transition: null };
  const canAnimate = options.animate && !options.reducedMotion && Boolean(camera.animate);
  if (!canAnimate) {
    if (!camera.setState) return { movement: "skipped", skipReason: "animate-unavailable", transition: null };
    camera.setState(options.target);
    options.onComplete?.();
    options.onCleanup?.();
    if (options.animate && !options.reducedMotion && !camera.animate) {
      return { movement: "immediate", skipReason: "animate-unavailable", transition: null };
    }
    return { movement: "immediate", transition: null };
  }
  const transition = createSigmaGlobalViewTransition(camera, options);
  try {
    const animation = camera.animate?.(options.target, {
      duration: options.durationMs ?? SIGMA_COMMUNITY_SPOTLIGHT_CAMERA_ANIMATION_MS,
      easing: options.easing ?? "quadraticInOut"
    });
    if (animation && typeof (animation as Promise<unknown>).catch === "function") {
      void (animation as Promise<unknown>).catch((error) => {
        options.onAnimationError?.(error);
        transition.cancel();
      });
    }
    return { movement: "animated", transition };
  } catch (error) {
    transition.dispose();
    options.onAnimationError?.(error);
    return { movement: "skipped", skipReason: "animate-error", transition: null };
  }
}

function createSigmaGlobalViewTransition(
  camera: SigmaGlobalCameraLike,
  options: SigmaGlobalViewTransitionOptions
): SigmaGlobalViewTransition {
  let active = true;
  let cleaned = false;
  let guardingStaleAnimation = false;
  let applyingTakeover = false;
  let takeoverState: Partial<SigmaGlobalCameraState> | null = null;
  const onCameraUpdated = (): void => {
    if (!guardingStaleAnimation || !takeoverState || applyingTakeover) return;
    if (!camera.isAnimated?.()) {
      disposeGuard();
      return;
    }
    applyTakeoverState();
  };
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    options.onCleanup?.();
  };
  const disposeGuard = (): void => {
    if (!guardingStaleAnimation) return;
    camera.off?.("updated", onCameraUpdated);
    guardingStaleAnimation = false;
    takeoverState = null;
  };
  const applyTakeoverState = (): void => {
    if (!takeoverState || !camera.setState) return;
    applyingTakeover = true;
    try {
      camera.setState(takeoverState);
    } finally {
      applyingTakeover = false;
    }
  };
  const beginGuard = (state: Partial<SigmaGlobalCameraState>): void => {
    if (!camera.setState) return;
    takeoverState = { ...state };
    if (!guardingStaleAnimation) {
      guardingStaleAnimation = true;
      camera.on?.("updated", onCameraUpdated);
    }
    applyTakeoverState();
  };
  return {
    isActive() {
      return active;
    },
    isGuardingStaleAnimation() {
      return guardingStaleAnimation;
    },
    takeover(takeover) {
      beginGuard(takeover);
    },
    complete() {
      if (!active) return;
      active = false;
      disposeGuard();
      options.onComplete?.();
      cleanup();
    },
    cancel(takeover?: Partial<SigmaGlobalCameraState>) {
      if (!active) return;
      active = false;
      if (takeover) beginGuard(takeover);
      else disposeGuard();
      options.onCancel?.();
      cleanup();
    },
    dispose() {
      active = false;
      disposeGuard();
    }
  };
}

export function sigmaCommunitySpotlightCameraState(
  sigma: SigmaGlobalSigmaLike,
  adapterData: GraphRendererAdapterData,
  communityId: string,
  viewportSize?: RendererViewportSize
): Partial<SigmaGlobalCameraState> | null {
  const current = readCameraState(sigma) ?? { x: 0, y: 0, angle: 0, ratio: 1 };
  const center = sigmaCommunitySpotlightCenter(adapterData, communityId);
  if (!center) return null;
  const communityReading = adapterData.renderable.communityMap?.active === true;
  const bounds = adapterData.renderable.worldBounds;
  const worldWidth = Math.max(0, finiteNumber(bounds.maxX, center.x) - finiteNumber(bounds.minX, center.x));
  const drawerOffset = communityReading ? 0 : worldWidth * 0.08;
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
    ratio: communityReading
      ? roundNumber(sigmaCommunityReadingCameraRatio(
          sigma,
          adapterData,
          communityId,
          { x: targetX, y: targetY, angle: current.angle, ratio: Math.max(current.ratio, 1) },
          viewportSize
        ), 3)
      : positionSettled || current.ratio <= 0.9
      ? current.ratio
      : roundNumber(clamp(current.ratio * 0.92, 0.72, current.ratio), 3)
  };
  const settled = positionSettled
    && Math.abs(current.ratio - target.ratio) <= 0.025;
  return settled ? null : target;
}

function sigmaCommunityReadingCameraRatio(
  sigma: SigmaGlobalSigmaLike,
  adapterData: GraphRendererAdapterData,
  communityId: string,
  baseState: SigmaGlobalCameraState,
  viewportSize?: RendererViewportSize
): number {
  const baseRatio = Math.max(baseState.ratio, 1);
  const size = viewportSize && viewportSize.width >= 32 && viewportSize.height >= 32 ? viewportSize : null;
  if (!size || !sigma.graphToViewport) return baseRatio;
  const points: Array<{ x: number; y: number }> = [];
  for (const node of adapterData.nodes) {
    if (node.communityId !== communityId) continue;
    const point = sigma.graphToViewport(node.point, { cameraState: baseState });
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) points.push(point);
  }
  if (points.length < 2) return baseRatio;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const projectedWidth = Math.max(0, maxX - minX);
  const projectedHeight = Math.max(0, maxY - minY);
  const maxReadableWidth = size.width * 0.72;
  const maxReadableHeight = size.height * 0.68;
  const minReadableWidth = Math.min(maxReadableWidth, Math.max(180, size.width * 0.28));
  const minReadableHeight = Math.min(maxReadableHeight, Math.max(140, size.height * 0.22));
  const minRatio = 0.3;
  const maxRatio = 3;
  const lowerBound = Math.max(
    minRatio,
    maxReadableWidth > 0 ? baseRatio * projectedWidth / maxReadableWidth : minRatio,
    maxReadableHeight > 0 ? baseRatio * projectedHeight / maxReadableHeight : minRatio
  );
  let upperBound = maxRatio;
  if (projectedWidth > 0 && projectedWidth < minReadableWidth) {
    upperBound = Math.min(upperBound, baseRatio * projectedWidth / minReadableWidth);
  }
  if (projectedHeight > 0 && projectedHeight < minReadableHeight) {
    upperBound = Math.min(upperBound, baseRatio * projectedHeight / minReadableHeight);
  }
  if (upperBound < lowerBound) return roundNumber(lowerBound, 3);
  return clamp(baseRatio, roundNumber(lowerBound, 3), roundNumber(upperBound, 3));
}

export interface SigmaNodeDrawerCameraOptions {
  viewportSize?: RendererViewportSize;
  durationMs?: number;
  onCleanup?: () => void;
}

export interface SigmaNodeDrawerCameraMoveResult extends SigmaGlobalViewTransitionResult {
  nodeId: string | null;
}

// #122：社区阅读单击节点时，右侧节点详情抽屉打开后的镜头让位。只在社区阅读 + 宽屏
// 并排抽屉下生效（窄屏覆盖抽屉/全屏由工作台策略不调用这条路径）。
//
// 宽屏并排抽屉把画布挤窄（drawer 在 flex 流里占位，.shell-main flex:1 收缩），抽屉
// 覆盖在画布旁、不遮挡画布；所以"剩余画布的舒适位置"就是（已变窄的）画布中心。镜头
// 居中到被选节点；默认保留当前缩放，只有节点或一阶关系圈会被裁切时才轻微缩小。
export function sigmaNodeDrawerCameraState(
  sigma: SigmaGlobalSigmaLike,
  adapterData: GraphRendererAdapterData,
  nodeId: string,
  options?: SigmaNodeDrawerCameraOptions
): Partial<SigmaGlobalCameraState> | null {
  if (adapterData.renderable.communityMap?.active !== true) return null;
  const size = options?.viewportSize && options.viewportSize.width >= 32 && options.viewportSize.height >= 32
    ? options.viewportSize
    : null;
  if (!size) return null;

  const node = adapterData.nodes.find((item) => item.id === nodeId);
  if (!node) return null;
  const nodePoint = { x: finiteNumber(node.point.x, 0), y: finiteNumber(node.point.y, 0) };
  const current = readCameraState(sigma) ?? { x: 0, y: 0, angle: 0, ratio: 1 };
  const baseRatio = current.ratio > 0 ? current.ratio : 1;

  // 引擎 viewport 已反映抽屉占位后的实际可用画布（抽屉正在打开的瞬间用未收缩画布略
  // 乐观，但一阶关系圈极少横跨大半个画布，影响可忽略）。
  const ratio = sigmaNodeDrawerAccommodationRatio(sigma, adapterData, nodeId, nodePoint, baseRatio, current.angle, {
    width: Math.max(1, size.width * 0.82),
    height: Math.max(1, size.height * 0.74)
  });

  // 居中到被选节点：剩余画布的舒适位置就是画布中心。
  const targetCameraPoint = sigmaGraphPointToCameraPoint(sigma, nodePoint);
  const target = {
    x: roundNumber(targetCameraPoint.x, 3),
    y: roundNumber(targetCameraPoint.y, 3),
    angle: current.angle,
    ratio: roundNumber(ratio, 3)
  };

  const bounds = adapterData.renderable.worldBounds;
  const worldWidth = Math.max(0, finiteNumber(bounds.maxX, nodePoint.x) - finiteNumber(bounds.minX, nodePoint.x));
  const settledThreshold = sigmaCameraDistanceForGraphDistance(sigma, nodePoint, Math.max(worldWidth * 0.015, 4));
  const positionSettled = Math.abs(current.x - target.x) <= settledThreshold
    && Math.abs(current.y - target.y) <= settledThreshold;
  const ratioSettled = Math.abs(current.ratio - target.ratio) <= 0.025;
  return positionSettled && ratioSettled ? null : target;
}

function sigmaNodeDrawerAccommodationRatio(
  sigma: SigmaGlobalSigmaLike,
  adapterData: GraphRendererAdapterData,
  nodeId: string,
  nodePoint: { x: number; y: number },
  baseRatio: number,
  angle: number,
  comfort: { width: number; height: number }
): number {
  if (!sigma.graphToViewport) return baseRatio;
  const points: Array<{ x: number; y: number }> = [nodePoint];
  const neighbors = new Set<string>();
  for (const edge of adapterData.edges) {
    if (edge.sourceNodeId === nodeId) neighbors.add(edge.targetNodeId);
    else if (edge.targetNodeId === nodeId) neighbors.add(edge.sourceNodeId);
  }
  for (const candidate of adapterData.nodes) {
    if (neighbors.has(candidate.id)) {
      points.push({ x: finiteNumber(candidate.point.x, 0), y: finiteNumber(candidate.point.y, 0) });
    }
  }
  const baseState = { x: nodePoint.x, y: nodePoint.y, angle, ratio: baseRatio };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const projected = sigma.graphToViewport(point, { cameraState: baseState });
    if (!projected || !Number.isFinite(projected.x) || !Number.isFinite(projected.y)) return baseRatio;
    minX = Math.min(minX, projected.x);
    minY = Math.min(minY, projected.y);
    maxX = Math.max(maxX, projected.x);
    maxY = Math.max(maxY, projected.y);
  }
  const projectedWidth = Math.max(0, maxX - minX);
  const projectedHeight = Math.max(0, maxY - minY);
  const scale = Math.max(
    1,
    comfort.width > 0 ? projectedWidth / comfort.width : 1,
    comfort.height > 0 ? projectedHeight / comfort.height : 1
  );
  // 只缩小（ratio 增大），不放大；最多缩到 2.5 倍，避免让位把镜头拉得太远。
  const ratio = clamp(baseRatio * scale, baseRatio, baseRatio * 2.5);
  return roundNumber(ratio, 3);
}

export function maybeAnimateSigmaNodeDrawerCamera(
  sigma: SigmaGlobalSigmaLike,
  root: HTMLElement,
  adapterData: GraphRendererAdapterData,
  nodeId: string | null | undefined,
  options?: SigmaNodeDrawerCameraOptions,
  onAnimationError?: (error: unknown) => void
): SigmaNodeDrawerCameraMoveResult {
  if (!nodeId) return { nodeId: null, movement: "skipped", skipReason: "no-target", transition: null };
  const target = sigmaNodeDrawerCameraState(sigma, adapterData, nodeId, options);
  if (!target) return { nodeId, movement: "skipped", skipReason: "already-settled", transition: null };
  const movement = startSigmaGlobalViewTransition(sigma, {
    target,
    animate: true,
    reducedMotion: prefersReducedMotion(root.ownerDocument.defaultView),
    durationMs: options?.durationMs,
    onCleanup: options?.onCleanup,
    onAnimationError
  });
  return { nodeId, ...movement };
}

export function sigmaGlobalCameraState(
  sigma: SigmaGlobalSigmaLike,
  adapterData: GraphRendererAdapterData,
  viewportSize?: RendererViewportSize
): Partial<SigmaGlobalCameraState> {
  const graphCenter = sigmaGraphExtentCenterPoint(adapterData);
  const center = sigma.graphToViewport
    ? sigmaGraphPointToNormalizedCameraPoint(adapterData, graphCenter)
    : sigmaGraphPointToCameraPoint(sigma, graphCenter);
  const baseState = {
    x: roundNumber(center.x, 3),
    y: roundNumber(center.y, 3),
    angle: 0,
    ratio: 1
  };
  return {
    ...baseState,
    ratio: roundNumber(sigmaGlobalCameraRatio(sigma, adapterData, baseState, viewportSize), 3)
  };
}

function sigmaGraphExtentCenterPoint(adapterData: GraphRendererAdapterData): { x: number; y: number } {
  const points = adapterData.nodes.length > 0
    ? adapterData.nodes.map((node) => node.point)
    : sigmaWorldBoundsCornerPoints(adapterData);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    const x = finiteNumber(point.x, 0);
    const y = finiteNumber(point.y, 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    const bounds = adapterData.renderable.worldBounds;
    return {
      x: (finiteNumber(bounds.minX, 0) + finiteNumber(bounds.maxX, 0)) / 2,
      y: (finiteNumber(bounds.minY, 0) + finiteNumber(bounds.maxY, 0)) / 2
    };
  }
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2
  };
}

function sigmaGlobalCameraRatio(
  sigma: SigmaGlobalSigmaLike,
  adapterData: GraphRendererAdapterData,
  baseState: SigmaGlobalCameraState,
  viewportSize?: RendererViewportSize
): number {
  const size = viewportSize && viewportSize.width > 0 && viewportSize.height > 0 ? viewportSize : null;
  if (!size || !sigma.graphToViewport) return baseState.ratio;
  const points = adapterData.nodes.length > 0
    ? adapterData.nodes.map((node) => node.point)
    : sigmaWorldBoundsCornerPoints(adapterData);
  const projected = points
    .map((point) => sigma.graphToViewport?.(point, { cameraState: baseState }))
    .filter((point): point is { x: number; y: number } => Boolean(point && Number.isFinite(point.x) && Number.isFinite(point.y)));
  if (projected.length < 2) return baseState.ratio;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of projected) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const projectedWidth = Math.max(0, maxX - minX);
  const projectedHeight = Math.max(0, maxY - minY);
  const usableWidth = Math.max(1, size.width * 0.78);
  const usableHeight = Math.max(1, size.height * 0.76);
  return clamp(
    Math.max(
      baseState.ratio,
      projectedWidth / usableWidth,
      projectedHeight / usableHeight
    ),
    baseState.ratio,
    SIGMA_CAMERA_MAX_RATIO
  );
}

function sigmaWorldBoundsCornerPoints(adapterData: GraphRendererAdapterData): Array<{ x: number; y: number }> {
  const bounds = adapterData.renderable.worldBounds;
  const minX = finiteNumber(bounds.minX, 0);
  const maxX = finiteNumber(bounds.maxX, minX);
  const minY = finiteNumber(bounds.minY, 0);
  const maxY = finiteNumber(bounds.maxY, minY);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ];
}

function sigmaGraphPointToNormalizedCameraPoint(
  adapterData: GraphRendererAdapterData,
  point: { x: number; y: number }
): { x: number; y: number } {
  const points = adapterData.nodes.length > 0
    ? adapterData.nodes.map((node) => node.point)
    : sigmaWorldBoundsCornerPoints(adapterData);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of points) {
    const x = finiteNumber(item.x, 0);
    const y = finiteNumber(item.y, 0);
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return point;
  }
  const ratio = Math.max(maxX - minX, maxY - minY, 1);
  const centerX = (maxX + minX) / 2;
  const centerY = (maxY + minY) / 2;
  return {
    x: 0.5 + (finiteNumber(point.x, centerX) - centerX) / ratio,
    y: 0.5 + (finiteNumber(point.y, centerY) - centerY) / ratio
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
  const communityReadingCenter = adapterData.renderable.communityMap?.active
    ? sigmaCommunityNodeCenter(adapterData, communityId)
    : null;
  if (communityReadingCenter) return communityReadingCenter;

  const renderableCommunity = adapterData.renderable.communities.find((community) => community.id === communityId);
  if (renderableCommunity?.wash) {
    return {
      x: finiteNumber(renderableCommunity.wash.cx, 0),
      y: finiteNumber(renderableCommunity.wash.cy, 0)
    };
  }
  return sigmaCommunityNodeCenter(adapterData, communityId);
}

function sigmaCommunityNodeCenter(
  adapterData: GraphRendererAdapterData,
  communityId: string
): { x: number; y: number } | null {
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

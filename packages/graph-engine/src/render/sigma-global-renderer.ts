import type { PinMap, PinPosition, ThemeId } from "../types";
import {
  createSigmaGlobalNodeDragSession,
  moveSigmaGlobalNodeDragSession,
  sigmaAdapterDataWithNodePoint,
  type SigmaGlobalNodeDragSession
} from "./sigma-global-drag";
import type { GraphScreenPoint } from "./geometry";
import type { GraphGestureTarget } from "./gestures";
import { DEFAULT_RENDERER_VIEWPORT, type RendererViewport, type RendererViewportSize } from "./viewport";
import { overlayPointerScreenPoint, sigmaScreenPointToWorldPoint, sigmaWorldPointToScreenPoint } from "./sigma-coordinates";
import {
  sigmaCommunityCloud,
  sigmaCommunityCloudBasisById,
  sigmaCommunityCloudBasisByIdWithNodePoint,
  sigmaCommunityCloudBasisByIdWithReuse,
  sigmaProjectedCloudHullPoints,
  type SigmaCommunityCloud
} from "./community-cloud-geometry";
import {
  createSigmaOverlayRoot,
  nextSigmaCloudFilterSequence,
  sigmaSharedCloudFilterDef
} from "./sigma-overlay-svg";
import {
  SIGMA_BUTTON_ZOOM_DURATION_MS,
  SIGMA_BUTTON_ZOOM_RATIO,
  SIGMA_CAMERA_MAX_RATIO,
  SIGMA_CAMERA_MIN_RATIO,
  sigmaButtonZoomRatio
} from "./sigma-zoom";
import { preventSigmaDefault } from "./sigma-events";
import type {
  SigmaGlobalCameraState,
  SigmaGlobalGraphologyGraph,
  SigmaGlobalGraphologyRuntime,
  SigmaGlobalRenderer,
  SigmaGlobalRendererCreateOptions,
  SigmaGlobalRendererRuntime,
  SigmaGlobalRendererRuntimeBoundary,
  SigmaGlobalRendererUpdateOptions,
  SigmaGlobalSigmaLike
} from "./sigma-global-types";
import {
  buildSigmaGlobalGraphologyGraph,
  canPatchSigmaGlobalGraphAttributes,
  patchSigmaGlobalGraphAttributes,
  sigmaSpotlightCommunityId
} from "./sigma-graphology-model";
import {
  createSigmaGlobalHitProjector,
  sigmaAdditiveFromPayload,
  sigmaNodeIdFromPayload,
  sigmaScreenPointFromPayload,
  type SigmaGlobalHitInput,
  type SigmaGlobalHitProjector
} from "./sigma-hit-projector";
import {
  maybeAnimateSigmaCommunitySpotlightCamera,
  prefersReducedMotion,
  readCameraState,
  restoreCameraState,
  SIGMA_COMMUNITY_SPOTLIGHT_CAMERA_ANIMATION_MS,
  sigmaGlobalCameraState,
  type SigmaCommunitySpotlightCameraResult
} from "./sigma-global-camera";
import {
  bindSigmaWheelZoomController,
  sigmaViewportCenter,
  type SigmaWheelZoomController
} from "./sigma-wheel-zoom";
import {
  createSigmaOverlayDomController,
  type SigmaOverlayDomController
} from "./sigma-overlay-dom";

export type {
  SigmaGlobalCameraState,
  SigmaGlobalGraphologyGraph,
  SigmaGlobalGraphologyRuntime,
  SigmaGlobalRenderer,
  SigmaGlobalRendererCreateOptions,
  SigmaGlobalRendererRuntime,
  SigmaGlobalRendererRuntimeBoundary,
  SigmaGlobalRendererUpdateOptions,
  SigmaGlobalSigmaLike
} from "./sigma-global-types";

export const SIGMA_GLOBAL_RENDERER_ID = "sigma-global" as const;

export const SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER = "facade" as const;
const SIGMA_CAMERA_MINIMUM_FAST_PATH_FRAMES = 1;

export const SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY = {
  sigma: "runtime-loaded-by-sigma-global-renderer",
  graphology: "runtime-loaded-by-sigma-global-renderer",
  workbench: "loads through the graph-engine ESM Sigma runtime boundary when global route manager selects Sigma",
  offlineHtml: "loads through the graph-engine IIFE Sigma runtime boundary when offline global route manager selects Sigma"
} as const;

export async function sigmaGlobalRendererRuntimeBoundary(): Promise<SigmaGlobalRendererRuntimeBoundary> {
  const [{ default: Sigma }, { default: GraphologyGraph }] = await Promise.all([
    import("sigma"),
    import("graphology")
  ]);

  return {
    Sigma,
    GraphologyGraph
  };
}

export function createSigmaGlobalRenderer(options: SigmaGlobalRendererCreateOptions): SigmaGlobalRenderer {
  if (!options.container) {
    throw new Error("createSigmaGlobalRenderer requires a container element");
  }
  if (!options.runtime) {
    throw new Error("createSigmaGlobalRenderer requires a loaded Sigma runtime boundary");
  }

  const runtime = options.runtime;
  let destroyed = false;
  let currentTheme = options.theme;
  let currentEdgeStyle = options.edgeStyle;
  let adapterData = options.adapterData;
  let graph = buildSigmaGlobalGraphologyGraph(adapterData, runtime, currentTheme, currentEdgeStyle);
  const sigmaRoot = createSigmaRoot(options.container, currentTheme);
  const overlayRoot = createSigmaOverlayRoot(sigmaRoot);
  // 云团模糊滤镜内容与帧无关，挂到独立的 filterHost 只建一次，renderSigmaOverlays
  // 每帧 replaceChildren(overlayRoot) 不会动到它。随 sigmaRoot.remove() 一并回收。
  const cloudFilterId = `sigma-community-cloud-blur-${nextSigmaCloudFilterSequence()}`;
  const filterHost = sigmaRoot.ownerDocument.createElement("div");
  filterHost.setAttribute("aria-hidden", "true");
  filterHost.style.position = "absolute";
  filterHost.style.inset = "0";
  filterHost.style.pointerEvents = "none";
  filterHost.append(sigmaSharedCloudFilterDef(sigmaRoot.ownerDocument, cloudFilterId));
  sigmaRoot.append(filterHost);
  let cloudBasisByCommunityId = sigmaCommunityCloudBasisById(adapterData);
  let projector = createSigmaGlobalHitProjector({
    adapterData,
    viewport: options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
    viewportSize: options.viewportSize ?? { width: 1, height: 1 },
    screenPointToWorldPoint: (point) => sigmaScreenPointToWorldPoint(sigma, point, options)
  });
  let sigma: SigmaGlobalSigmaLike;
  let generation = 0;
  let lastHitTarget: GraphGestureTarget | null = null;
  let activeNodeDrag: SigmaGlobalNodeDragSession | null = null;
  let currentPins: PinMap = { ...(options.pins ?? {}) };
  let cameraSpotlightCommunityId: string | null = sigmaSpotlightCommunityId(adapterData);
  let suppressNextNodeClickId: string | null = null;
  let overlayDomController: SigmaOverlayDomController | null = null;
  let sigmaWheelZoomController: SigmaWheelZoomController | null = null;
  let eventBindings: Array<{ event: string; listener: (payload?: unknown) => void }> = [];
  let cameraEventBindings: Array<{ event: "updated"; listener: (state?: SigmaGlobalCameraState) => void }> = [];
  let resizeObserver: ResizeObserver | null = null;
  let resizeAnimationFrame: number | null = null;
  let lastObservedRootSize: RendererViewportSize | null = null;
  let suppressOverlayAnimationFastPathUntilCameraSettles = false;
  let projectCameraAnimationUntilMs = 0;
  let projectCameraAnimationSawSigmaAnimated = false;
  let projectCameraAnimationFastPathFrames = 0;
  let projectCameraAnimationMinimumFastPathFrames = 0;
  let overlayAnimationSettleFrame: number | null = null;
  let overlayAnimationFrameOwner = 0;
  let scheduledOverlayAnimationFrameOwner: number | null = null;
  let deferredSpotlightCameraFrame: number | null = null;

  try {
    sigma = new runtime.Sigma(graph, sigmaRoot, sigmaSettingsForTheme(currentTheme));
    overlayDomController = createSigmaOverlayDomController({
      overlayRoot,
      cloudFilterId,
      getAdapterData: () => adapterData,
      getSigma: () => sigma,
      getOptions: () => ({ ...options, adapterData }),
      communityCloudFor: sigmaCommunityCloudFor,
      isDestroyed: () => destroyed,
      onHit: (renderedObject) => handleSigmaHit({ renderedObject }),
      beginNodeDrag,
      moveNodeDrag,
      commitNodeDrag,
      cancelNodeDrag,
      screenPointFromEvent: (event) => overlayPointerScreenPoint(event, sigmaRoot),
      consumeSuppressedNodeClick,
      activeNodeDragId: () => activeNodeDrag?.nodeId ?? null
    });
    sigmaWheelZoomController = bindSigmaWheelZoomController({
      sigma,
      root: sigmaRoot,
      isDestroyed: () => destroyed,
      currentRatio: () => readCameraState(sigma)?.ratio ?? 1,
      onZoomAtPoint: (point, nextRatio) => zoomSigmaCameraAtViewportPoint(point, nextRatio, false),
      onFatalError: options.onFatalError
    });
    bindSigmaEvents();
    bindSigmaResizeObserver();
    overlayDomController.rebuild();
  } catch (error) {
    options.onFatalError?.(error);
    sigmaRoot.remove();
    throw error;
  }

  const renderer: SigmaGlobalRenderer = {
    id: SIGMA_GLOBAL_RENDERER_ID,
    root: sigmaRoot,
    overlayRoot,
    get graph() {
      return graph;
    },
    updateStrategy: "rebuild-graph-preserve-camera",
    get lastHitTarget() {
      return lastHitTarget;
    },
    isDragging() {
      return Boolean(activeNodeDrag);
    },
    resetView() {
      assertActive();
      cameraSpotlightCommunityId = null;
      sigma.getCamera?.().setState?.(sigmaGlobalCameraState(sigma, adapterData));
      suppressOverlayAnimationFastPathUntilSettled();
    },
    zoomIn() {
      assertActive();
      zoomSigmaCameraAtViewportPoint(sigmaViewportCenter(sigmaRoot), "in", true);
    },
    zoomOut() {
      assertActive();
      zoomSigmaCameraAtViewportPoint(sigmaViewportCenter(sigmaRoot), "out", true);
    },
    update(updateOptions) {
      assertActive();
      const cameraState = readCameraState(sigma);
      const previousCameraSpotlightCommunityId = cameraSpotlightCommunityId;
      cancelNodeDrag();
      generation += 1;
      const finalizeUpdate = (): void => {
        try {
          restoreCameraState(sigma, cameraState);
          sigma.refresh?.();
          overlayDomController?.rebuild();
          scheduleSpotlightCameraUpdate(previousCameraSpotlightCommunityId, generation);
        } catch (error) {
          options.onFatalError?.(error);
        }
      };
      const nextAdapterData = updateOptions.adapterData;
      const nextTheme = updateOptions.theme ?? currentTheme;
      const nextEdgeStyle = updateOptions.edgeStyle ?? currentEdgeStyle;
      const nextPins = { ...(updateOptions.pins ?? currentPins) };
      if (canPatchSigmaGlobalGraphAttributes(adapterData, nextAdapterData, currentTheme, nextTheme)) {
        adapterData = nextAdapterData;
        currentEdgeStyle = nextEdgeStyle;
        currentPins = nextPins;
        cloudBasisByCommunityId = sigmaCommunityCloudBasisByIdWithReuse(cloudBasisByCommunityId, adapterData);
        patchSigmaGlobalGraphAttributes(graph, adapterData, currentTheme, currentEdgeStyle);
        projector = createSigmaGlobalHitProjector({
          adapterData,
          viewport: options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
          viewportSize: options.viewportSize ?? { width: 1, height: 1 },
          screenPointToWorldPoint: (point) => sigmaScreenPointToWorldPoint(sigma, point, options)
        });
        finalizeUpdate();
        return;
      }
      adapterData = updateOptions.adapterData;
      cloudBasisByCommunityId = sigmaCommunityCloudBasisByIdWithReuse(cloudBasisByCommunityId, adapterData);
      currentTheme = updateOptions.theme ?? currentTheme;
      currentEdgeStyle = updateOptions.edgeStyle ?? currentEdgeStyle;
      currentPins = { ...(updateOptions.pins ?? currentPins) };
      graph = buildSigmaGlobalGraphologyGraph(adapterData, runtime, currentTheme, currentEdgeStyle);
      projector = createSigmaGlobalHitProjector({
        adapterData,
        viewport: options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
        viewportSize: options.viewportSize ?? { width: 1, height: 1 },
        screenPointToWorldPoint: (point) => sigmaScreenPointToWorldPoint(sigma, point, options)
      });
      try {
        sigma.setGraph?.(graph);
        if (updateOptions.theme) {
          sigmaRoot.dataset.theme = currentTheme;
          sigma.setSetting?.("labelColor", sigmaLabelColor(currentTheme));
        }
        finalizeUpdate();
      } catch (error) {
        options.onFatalError?.(error);
      }
    },
    destroy() {
      if (destroyed) return;
      cancelNodeDrag();
      destroyed = true;
      generation += 1;
      sigmaWheelZoomController?.destroy();
      sigmaWheelZoomController = null;
      overlayDomController?.destroy();
      overlayDomController = null;
      unbindSigmaEvents();
      cancelScheduledResizeRefresh();
      cancelOverlayAnimationSettleCheck();
      cancelDeferredSpotlightCameraUpdate();
      resizeObserver?.disconnect();
      resizeObserver = null;
      try {
        sigma.kill?.();
      } catch (error) {
        options.onFatalError?.(error);
      }
      sigmaRoot.remove();
    }
  };

  return renderer;

  function bindSigmaEvents(): void {
    const nodeClick = (payload?: unknown): void => {
      const nodeId = sigmaNodeIdFromPayload(payload);
      if (consumeSuppressedNodeClick(nodeId)) return;
      handleSigmaHit({ nodeId, additive: sigmaAdditiveFromPayload(payload) });
    };
    const stageClick = (payload?: unknown): void => handleSigmaHit({
      screenPoint: sigmaScreenPointFromPayload(payload),
      additive: sigmaAdditiveFromPayload(payload)
    });
    const requestCameraFrame = (): void => requestOverlayAnimationFrame(overlayAnimationFrameOwner);
    const nodeDown = (payload?: unknown): void => beginNodeDrag(sigmaNodeIdFromPayload(payload), sigmaScreenPointFromPayload(payload), payload);
    const nodeMove = (payload?: unknown): void => moveNodeDrag(sigmaScreenPointFromPayload(payload), payload);
    const nodeUp = (payload?: unknown): void => commitNodeDrag(sigmaScreenPointFromPayload(payload), payload);
    eventBindings = [
      { event: "clickNode", listener: nodeClick },
      { event: "clickStage", listener: stageClick },
      { event: "downNode", listener: nodeDown },
      { event: "moveBody", listener: nodeMove },
      { event: "upNode", listener: nodeUp },
      { event: "upStage", listener: nodeUp },
      { event: "afterRender", listener: requestCameraFrame }
    ];
    for (const binding of eventBindings) {
      sigma.on?.(binding.event, binding.listener);
    }
    const camera = sigma.getCamera?.();
    if (camera?.on) {
      const listener = (): void => requestOverlayAnimationFrame(overlayAnimationFrameOwner);
      camera.on("updated", listener);
      cameraEventBindings = [{ event: "updated", listener }];
    }
  }

  function unbindSigmaEvents(): void {
    for (const binding of eventBindings) {
      sigma.off?.(binding.event, binding.listener);
    }
    eventBindings = [];
    const camera = sigma.getCamera?.();
    for (const binding of cameraEventBindings) {
      camera?.off?.(binding.event, binding.listener);
    }
    cameraEventBindings = [];
  }

  // 相机帧调度：动画中走 overlay 轻量 transform 快路径，稳定后精确 reposition 校准。
  // wheel/reset/resize/drag 等直接 setState 的入口会 suppress 快路径直到相机真正静止，
  // 因为 Sigma 的 setState() 不会取消已排队的 animate()（见 sigma_camera_setstate_does_not_cancel_animation）。
  function startOverlayCameraFrameTracking(): void {
    startProjectCameraFrameTracking(SIGMA_BUTTON_ZOOM_DURATION_MS, SIGMA_CAMERA_MINIMUM_FAST_PATH_FRAMES);
  }

  function startProjectCameraFrameTracking(durationMs: number, minimumFastPathFrames = 0): void {
    overlayAnimationFrameOwner += 1;
    projectCameraAnimationUntilMs = Math.max(projectCameraAnimationUntilMs, nowMs() + durationMs);
    projectCameraAnimationSawSigmaAnimated = false;
    projectCameraAnimationFastPathFrames = 0;
    projectCameraAnimationMinimumFastPathFrames = Math.max(
      projectCameraAnimationMinimumFastPathFrames,
      minimumFastPathFrames
    );
    requestOverlayAnimationFrame(overlayAnimationFrameOwner);
  }

  function requestOverlayAnimationFrame(owner: number): void {
    const view = sigmaRoot.ownerDocument.defaultView;
    if (!view?.requestAnimationFrame) {
      refreshOverlayForCameraFrame(owner, false);
      return;
    }
    if (overlayAnimationSettleFrame !== null && scheduledOverlayAnimationFrameOwner === owner) return;
    if (overlayAnimationSettleFrame !== null) {
      view.cancelAnimationFrame?.(overlayAnimationSettleFrame);
      overlayAnimationSettleFrame = null;
    }
    scheduledOverlayAnimationFrameOwner = owner;
    overlayAnimationSettleFrame = view.requestAnimationFrame(() => {
      overlayAnimationSettleFrame = null;
      scheduledOverlayAnimationFrameOwner = null;
      refreshOverlayForCameraFrame(owner, true);
    });
  }

  function refreshOverlayForCameraFrame(owner: number, continueScheduling: boolean): void {
    if (destroyed || owner !== overlayAnimationFrameOwner) return;
    try {
      const camera = sigma.getCamera?.();
      const sigmaAnimated = Boolean(camera?.isAnimated?.());
      if (sigmaAnimated) projectCameraAnimationSawSigmaAnimated = true;
      const needsMinimumFastPathFrame = projectCameraAnimationFastPathFrames < projectCameraAnimationMinimumFastPathFrames;
      const ownedAnimationActive = (projectCameraAnimationUntilMs > nowMs() && !projectCameraAnimationSawSigmaAnimated)
        || needsMinimumFastPathFrame;
      const animated = sigmaAnimated || ownedAnimationActive;
      if (activeNodeDrag || suppressOverlayAnimationFastPathUntilCameraSettles || !animated) {
        overlayDomController?.reposition();
        if (!animated) {
          projectCameraAnimationUntilMs = 0;
          projectCameraAnimationSawSigmaAnimated = false;
          projectCameraAnimationFastPathFrames = 0;
          projectCameraAnimationMinimumFastPathFrames = 0;
          suppressOverlayAnimationFastPathUntilCameraSettles = false;
          cancelOverlayAnimationSettleCheck();
          return;
        }
        if (continueScheduling) requestOverlayAnimationFrame(owner);
        return;
      }
      const usedFastPath = overlayDomController?.repositionForCameraAnimation() ?? false;
      if (usedFastPath) {
        projectCameraAnimationFastPathFrames += 1;
      } else {
        projectCameraAnimationMinimumFastPathFrames = projectCameraAnimationFastPathFrames;
      }
      if (continueScheduling) requestOverlayAnimationFrame(owner);
    } catch (error) {
      options.onFatalError?.(error);
    }
  }

  function suppressOverlayAnimationFastPathUntilSettled(): void {
    overlayAnimationFrameOwner += 1;
    projectCameraAnimationUntilMs = 0;
    projectCameraAnimationSawSigmaAnimated = false;
    projectCameraAnimationFastPathFrames = 0;
    projectCameraAnimationMinimumFastPathFrames = 0;
    suppressOverlayAnimationFastPathUntilCameraSettles = true;
    overlayDomController?.invalidateAnimationBaseline();
    if (!Boolean(sigma.getCamera?.().isAnimated?.())) {
      // 相机已静止（无残留 animate），立即恢复快路径并重建精确基线。相机静止后 Sigma
      // 不再派发 afterRender，单纯依赖 settle watcher 的 rAF 可能被宿主节流，所以这里
      // 同步兜底，避免 suppress 卡住后续的相机动画（如 spotlight）。
      suppressOverlayAnimationFastPathUntilCameraSettles = false;
      overlayDomController?.reposition();
      return;
    }
    requestOverlayAnimationFrame(overlayAnimationFrameOwner);
  }

  function cancelOverlayAnimationSettleCheck(): void {
    if (overlayAnimationSettleFrame === null) return;
    sigmaRoot.ownerDocument.defaultView?.cancelAnimationFrame?.(overlayAnimationSettleFrame);
    overlayAnimationSettleFrame = null;
    scheduledOverlayAnimationFrameOwner = null;
  }

  function applySpotlightCameraResult(result: SigmaCommunitySpotlightCameraResult): void {
    cameraSpotlightCommunityId = result.communityId;
    if (result.movement === "animated") {
      startProjectCameraFrameTracking(
        SIGMA_COMMUNITY_SPOTLIGHT_CAMERA_ANIMATION_MS,
        SIGMA_CAMERA_MINIMUM_FAST_PATH_FRAMES
      );
      return;
    }
    if (result.movement === "immediate") {
      overlayDomController?.reposition();
    }
  }

  function scheduleSpotlightCameraUpdate(previousCommunityId: string | null, updateGeneration: number): void {
    const run = (): void => {
      deferredSpotlightCameraFrame = null;
      if (destroyed || updateGeneration !== generation) return;
      try {
        const spotlightCamera = maybeAnimateSigmaCommunitySpotlightCamera(
          sigma,
          sigmaRoot,
          adapterData,
          sigmaSpotlightCommunityId(adapterData),
          previousCommunityId,
          options.onFatalError
        );
        applySpotlightCameraResult(spotlightCamera);
      } catch (error) {
        options.onFatalError?.(error);
      }
    };
    const view = sigmaRoot.ownerDocument.defaultView;
    if (!view?.requestAnimationFrame) {
      run();
      return;
    }
    cancelDeferredSpotlightCameraUpdate();
    deferredSpotlightCameraFrame = view.requestAnimationFrame(run);
  }

  function cancelDeferredSpotlightCameraUpdate(): void {
    if (deferredSpotlightCameraFrame === null) return;
    sigmaRoot.ownerDocument.defaultView?.cancelAnimationFrame?.(deferredSpotlightCameraFrame);
    deferredSpotlightCameraFrame = null;
  }

  function nowMs(): number {
    return sigmaRoot.ownerDocument.defaultView?.performance?.now?.() ?? Date.now();
  }

  function zoomSigmaCameraAtViewportPoint(
    point: GraphScreenPoint,
    target: "in" | "out" | number,
    animated: boolean
  ): void {
    const camera = sigma.getCamera?.();
    const current = readCameraState(sigma) ?? { x: 0, y: 0, angle: 0, ratio: 1 };
    const nextRatio = typeof target === "number" ? target : sigmaButtonZoomRatio(current.ratio, target);
    const nextState = sigma.getViewportZoomedState?.(point, nextRatio) ?? {
      ...current,
      ratio: nextRatio
    };
    if (animated && camera?.animate && !prefersReducedMotion(sigmaRoot.ownerDocument.defaultView)) {
      const animation = camera.animate(nextState, { duration: SIGMA_BUTTON_ZOOM_DURATION_MS, easing: "quadraticOut" });
      if (animation && typeof (animation as Promise<unknown>).catch === "function") {
        void (animation as Promise<unknown>).catch((error) => options.onFatalError?.(error));
      }
      startOverlayCameraFrameTracking();
      return;
    }
    // 滚轮/触控板始终即时 setState，不排队动画（设计 §5）。即使按钮或社区聚焦动画
    // 仍在进行，滚轮也直接覆盖相机；Sigma camera 没有公开的取消动画接口，接受聚焦
    // 动画末期（约 380ms）与滚轮的轻微拉锯，换取触控板高频输入的连续手感。
    suppressOverlayAnimationFastPathUntilSettled();
    camera?.setState?.(nextState);
  }

  function bindSigmaResizeObserver(): void {
    const view = sigmaRoot.ownerDocument.defaultView;
    const ViewResizeObserver = view?.ResizeObserver;
    if (!ViewResizeObserver) return;
    lastObservedRootSize = readObservedRootSize();
    resizeObserver = new ViewResizeObserver((entries) => {
      if (destroyed) return;
      const nextSize = readResizeEntrySize(entries) ?? readObservedRootSize();
      if (nextSize && lastObservedRootSize && sameRendererViewportSize(nextSize, lastObservedRootSize)) return;
      if (nextSize) lastObservedRootSize = nextSize;
      scheduleResizeRefresh();
    });
    resizeObserver.observe(sigmaRoot);
  }

  function scheduleResizeRefresh(): void {
    if (resizeAnimationFrame !== null) return;
    const view = sigmaRoot.ownerDocument.defaultView;
    const run = () => {
      resizeAnimationFrame = null;
      try {
        if (destroyed) return;
        suppressOverlayAnimationFastPathUntilSettled();
        sigma.refresh?.();
        overlayDomController?.reposition();
      } catch (error) {
        options.onFatalError?.(error);
      }
    };
    if (view?.requestAnimationFrame) {
      resizeAnimationFrame = view.requestAnimationFrame(run);
      return;
    }
    run();
  }

  function cancelScheduledResizeRefresh(): void {
    if (resizeAnimationFrame === null) return;
    sigmaRoot.ownerDocument.defaultView?.cancelAnimationFrame?.(resizeAnimationFrame);
    resizeAnimationFrame = null;
  }

  function readResizeEntrySize(entries: ResizeObserverEntry[]): RendererViewportSize | null {
    const entry = entries.find((item) => item.target === sigmaRoot) ?? entries[0];
    if (!entry?.contentRect) return null;
    const width = finiteNumber(entry.contentRect.width, 0);
    const height = finiteNumber(entry.contentRect.height, 0);
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  function readObservedRootSize(): RendererViewportSize | null {
    const rect = typeof sigmaRoot.getBoundingClientRect === "function" ? sigmaRoot.getBoundingClientRect() : null;
    const width = finiteNumber(rect?.width, 0);
    const height = finiteNumber(rect?.height, 0);
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  function handleSigmaHit(input: SigmaGlobalHitInput): void {
    if (destroyed) return;
    const eventGeneration = generation;
    const target = projector.targetFromSigmaHit(input);
    if (destroyed || eventGeneration !== generation) return;
    lastHitTarget = target;
    options.onHitTarget?.(target, { additive: Boolean(input.additive) });
  }

  function beginNodeDrag(nodeId: string | null, screenPoint: GraphScreenPoint | null, payload?: unknown): void {
    if (destroyed || !nodeId || !screenPoint || !graph.hasNode(nodeId)) return;
    preventSigmaDefault(payload);
    cancelNodeDrag();
    suppressOverlayAnimationFastPathUntilSettled();
    const startPoint = sigmaNodeWorldPoint(nodeId);
    const pointerWorldPoint = sigmaScreenPointToWorldPoint(sigma, screenPoint, options);
    activeNodeDrag = createSigmaGlobalNodeDragSession({
      nodeId,
      pinKey: sigmaPinKeyForNode(nodeId),
      startPoint,
      pointerStart: screenPoint,
      pointerWorldPoint,
      initiallyPinned: Boolean(graph.getNodeAttribute(nodeId, "pinned")),
      initialPinPosition: sigmaPinPositionForNode(nodeId),
      previousCameraPanning: sigma.getSetting?.("enableCameraPanning")
    });
    sigma.setSetting?.("enableCameraPanning", false);
    sigmaRoot.dataset.draggingNodeId = nodeId;
    options.onDragActiveChange?.(true);
  }

  function moveNodeDrag(screenPoint: GraphScreenPoint | null, payload?: unknown): void {
    const drag = activeNodeDrag;
    if (!drag || destroyed || !screenPoint) return;
    preventSigmaDefault(payload);
    const pointerWorldPoint = sigmaScreenPointToWorldPoint(sigma, screenPoint, options);
    moveSigmaGlobalNodeDragSession(drag, screenPoint, pointerWorldPoint);
    if (drag.moved) {
      applyNodeDragPoint(drag.nodeId, drag.currentPoint, drag.initiallyPinned, drag.initialPinPosition);
    }
  }

  function commitNodeDrag(screenPoint: GraphScreenPoint | null, payload?: unknown): void {
    const drag = activeNodeDrag;
    if (!drag || destroyed) return;
    preventSigmaDefault(payload);
    if (screenPoint) moveNodeDrag(screenPoint, payload);
    overlayDomController?.clearActiveDragListeners();
    restoreNodeDragCamera(drag);
    activeNodeDrag = null;
    delete sigmaRoot.dataset.draggingNodeId;
    options.onDragActiveChange?.(false);
    if (!drag.moved) {
      return;
    }
    suppressNextNodeClickId = drag.nodeId;
    const finalPin: PinPosition = {
      x: drag.currentPoint.x,
      y: drag.currentPoint.y,
      coordinateSpace: "world"
    };
    currentPins = {
      ...currentPins,
      [drag.pinKey]: finalPin
    };
    applyNodeDragPoint(drag.nodeId, drag.currentPoint, true, finalPin);
    options.onPinsChanged?.(currentPins);
  }

  function cancelNodeDrag(): void {
    const drag = activeNodeDrag;
    if (!drag) return;
    overlayDomController?.clearActiveDragListeners();
    restoreNodeDragCamera(drag);
    activeNodeDrag = null;
    delete sigmaRoot.dataset.draggingNodeId;
    applyNodeDragPoint(drag.nodeId, drag.startPoint, Boolean(currentPins[drag.pinKey]), currentPins[drag.pinKey] ?? null);
    options.onDragActiveChange?.(false);
  }

  function restoreNodeDragCamera(drag: SigmaGlobalNodeDragSession): void {
    const nextValue = typeof drag.previousCameraPanning === "boolean" ? drag.previousCameraPanning : true;
    sigma.setSetting?.("enableCameraPanning", nextValue);
  }

  function applyNodeDragPoint(nodeId: string, point: { x: number; y: number }, pinned: boolean, pinPosition: PinPosition | null = null): void {
    const dragging = Boolean(activeNodeDrag);
    if (!graph.hasNode(nodeId)) return;
    graph.mergeNodeAttributes(nodeId, {
      x: finiteNumber(point.x, 0),
      y: finiteNumber(point.y, 0),
      pinned
    });
    adapterData = sigmaAdapterDataWithNodePoint(adapterData, nodeId, point, pinned, pinPosition);
    sigma.refresh?.();
    if (!dragging) {
      cloudBasisByCommunityId = sigmaCommunityCloudBasisByIdWithNodePoint(cloudBasisByCommunityId, adapterData, nodeId);
      // 拖拽提交/取消是终态数据变化（pin 状态、永久坐标），走 rebuild 刷新 dataset 等属性；
      // 拖拽过程中的每帧位置更新由 afterRender → reposition 负责。
      overlayDomController?.rebuild();
    }
  }

  function sigmaNodeWorldPoint(nodeId: string): { x: number; y: number } {
    return {
      x: finiteNumber(graph.getNodeAttribute(nodeId, "x"), 0),
      y: finiteNumber(graph.getNodeAttribute(nodeId, "y"), 0)
    };
  }

  function sigmaPinKeyForNode(nodeId: string): string {
    const sourcePath = graph.getNodeAttribute(nodeId, "sourcePath");
    return typeof sourcePath === "string" && sourcePath ? sourcePath : nodeId;
  }

  function sigmaPinPositionForNode(nodeId: string): PinPosition | null {
    const pinKey = sigmaPinKeyForNode(nodeId);
    return currentPins[pinKey] ?? null;
  }

  function consumeSuppressedNodeClick(nodeId: string | null): boolean {
    if (!nodeId || suppressNextNodeClickId !== nodeId) return false;
    suppressNextNodeClickId = null;
    return true;
  }

  function sigmaCommunityCloudFor(communityId: string, wash: { cx: number; cy: number; rx: number; ry: number }): SigmaCommunityCloud {
    const fallbackBox = overlayBoxFromWorldEllipse(wash.cx, wash.cy, wash.rx, wash.ry);
    return sigmaCommunityCloud(
      sigmaProjectedCloudHullPoints(cloudBasisByCommunityId.get(communityId), sigma, options),
      fallbackBox
    );
  }

  function overlayBoxFromWorldEllipse(x: number, y: number, rx: number, ry: number): { left: number; top: number; width: number; height: number } {
    const topLeft = sigmaWorldPointToScreenPoint(sigma, { x: x - rx, y: y - ry }, options);
    const bottomRight = sigmaWorldPointToScreenPoint(sigma, { x: x + rx, y: y + ry }, options);
    const left = Math.min(topLeft.x, bottomRight.x);
    const top = Math.min(topLeft.y, bottomRight.y);
    return {
      left,
      top,
      width: Math.max(8, Math.abs(bottomRight.x - topLeft.x)),
      height: Math.max(8, Math.abs(bottomRight.y - topLeft.y))
    };
  }

  function assertActive(): void {
    if (destroyed) {
      throw new Error("Sigma global renderer has been destroyed");
    }
  }

}

function createSigmaRoot(container: HTMLElement, theme: ThemeId): HTMLElement {
  const root = container.ownerDocument.createElement("div");
  root.className = "sigma-global-renderer";
  root.dataset.renderer = SIGMA_GLOBAL_RENDERER_ID;
  root.dataset.theme = theme;
  root.tabIndex = 0;
  container.append(root);
  return root;
}

function sigmaSettingsForTheme(theme: ThemeId): Record<string, unknown> {
  return {
    renderEdgeLabels: false,
    allowInvalidContainer: false,
    labelColor: sigmaLabelColor(theme),
    zoomingRatio: SIGMA_BUTTON_ZOOM_RATIO,
    // Sigma 默认 wheel 的兜底参数：wheel 已被 sigma-wheel-zoom controller 接管（preventSigmaDefault），
    // zoomingRatio/zoomDuration 只在 Sigma 内置缩放入口（如 animatedZoom）被触发时生效，
    // 日常不走。项目按钮动画用的是 SIGMA_BUTTON_ZOOM_DURATION_MS（140），勿与这里的 120 混淆。
    zoomDuration: 120,
    minCameraRatio: SIGMA_CAMERA_MIN_RATIO,
    maxCameraRatio: SIGMA_CAMERA_MAX_RATIO
  };
}

function sigmaLabelColor(theme: ThemeId): { color: string } {
  return { color: theme === "mo-ye" ? "#f8fafc" : "#6b6256" };
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sameRendererViewportSize(left: RendererViewportSize, right: RendererViewportSize): boolean {
  return Math.abs(left.width - right.width) < 1 && Math.abs(left.height - right.height) < 1;
}

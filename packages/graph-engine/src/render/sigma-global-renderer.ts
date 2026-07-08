import type { PinMap, PinPosition, ThemeId } from "../types";
import { getThemeTokens } from "../themes";
import {
  createSigmaGlobalNodeDragSession,
  moveSigmaGlobalNodeDragSession,
  sigmaAdapterDataWithNodePoint,
  sigmaGlobalNodeDragStartThreshold,
  type SigmaGlobalNodeDragSession
} from "./sigma-global-drag";
import type { GraphScreenPoint } from "./geometry";
import type { GraphGestureTarget } from "./gestures";
import type { GraphRendererAdapterData } from "./adapter";
import { DEFAULT_RENDERER_VIEWPORT, type RendererViewport, type RendererViewportSize } from "./viewport";
import {
  emptyGraphFirstOrderRelationFocusTouched,
  resolveGraphFirstOrderRelationFocus
} from "./relation-focus";
import { overlayPointerScreenPoint, sigmaScreenPointToWorldPoint, sigmaWorldPointToScreenPoint } from "./sigma-coordinates";
import {
  SIGMA_READING_COMMUNITY_CLOUD_MIN_HEIGHT,
  SIGMA_READING_COMMUNITY_CLOUD_MIN_WIDTH,
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
  SigmaGlobalRendererResetViewOptions,
  SigmaGlobalRendererRuntime,
  SigmaGlobalRendererRuntimeBoundary,
  SigmaGlobalRendererUpdateOptions,
  SigmaGlobalSigmaLike
} from "./sigma-global-types";
import {
  buildSigmaGlobalGraphologyGraph,
  canPatchSigmaGlobalGraphAttributes,
  patchSigmaGlobalGraphAttributes,
  sigmaAdapterDataHasRelationFocus,
  sigmaGlobalEdgeAttributes,
  sigmaGlobalEdgeStyleContext,
  sigmaGlobalNodeAttributes,
  sigmaSelectedCommunityIds,
  sigmaSpotlightCommunityId
} from "./sigma-graphology-model";
import {
  createSigmaGlobalHitProjector,
  sigmaAdditiveFromPayload,
  sigmaEdgeIdFromPayload,
  sigmaNodeIdFromPayload,
  sigmaScreenPointFromPayload,
  type SigmaGlobalHitInput,
  type SigmaGlobalHitProjector,
  type SigmaGlobalRenderedObject
} from "./sigma-hit-projector";
import {
  maybeAnimateSigmaCommunitySpotlightCamera,
  maybeAnimateSigmaNodeDrawerCamera,
  prefersReducedMotion,
  readCameraState,
  restoreCameraState,
  SIGMA_COMMUNITY_SPOTLIGHT_CAMERA_ANIMATION_MS,
  startSigmaGlobalViewTransition,
  sigmaGlobalCameraState,
  type SigmaCommunitySpotlightCameraResult,
  type SigmaGlobalViewTransition
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
const SIGMA_NODE_LABEL_EDGE_GUTTER = 8;
const SIGMA_ROOT_CLICK_FALLBACK_IGNORE_SELECTORS = [
  ".sigma-global-node-hit-target",
  ".sigma-global-community-region",
  ".sigma-global-aggregation-container",
  "[data-control=\"sigma-zoom\"]"
] as const;

interface SigmaNodeLabelData {
  x: number;
  y: number;
  size: number;
  label?: string | null;
  color?: string;
  [key: string]: unknown;
}

interface SigmaNodeLabelSettings {
  labelSize: number;
  labelFont: string;
  labelWeight: string;
  labelColor: {
    attribute?: string;
    color?: string;
  };
}

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
  let adapterNodeById = sigmaAdapterNodeById(adapterData);
  let adapterEdgeById = sigmaAdapterEdgeById(adapterData);
  let adapterRelationFocusActive = sigmaAdapterDataHasRelationFocus(adapterData);
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
  let currentViewportSize: RendererViewportSize = options.viewportSize ?? { width: 1, height: 1 };
  let projector = createSigmaGlobalHitProjector({
    adapterData,
    viewport: options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
    viewportSize: currentViewportSize,
    screenPointToWorldPoint: (point) => sigmaScreenPointToWorldPoint(sigma, point, rendererCoordinateOptions())
  });
  let sigma: SigmaGlobalSigmaLike;
  let generation = 0;
  let lastHitTarget: GraphGestureTarget | null = null;
  let activeNodeDrag: SigmaGlobalNodeDragSession | null = null;
  let currentPins: PinMap = { ...(options.pins ?? {}) };
  let relationFocusPreviewNodeId: string | null = null;
  let relationFocusPreviewTouched = emptyGraphFirstOrderRelationFocusTouched();
  let cameraSpotlightKey: string | null = sigmaSpotlightCameraKey(adapterData);
  let suppressNextNodeClickId: string | null = null;
  let suppressNextNodeClickTimer: ReturnType<typeof setTimeout> | null = null;
  let overlayDomController: SigmaOverlayDomController | null = null;
  let sigmaWheelZoomController: SigmaWheelZoomController | null = null;
  let eventBindings: Array<{ event: string; listener: (payload?: unknown) => void }> = [];
  let cameraEventBindings: Array<{ event: "updated"; listener: (state?: SigmaGlobalCameraState) => void }> = [];
  let sigmaRootClickFallbackListener: ((event: MouseEvent) => void) | null = null;
  let sigmaRootCameraTakeoverListeners: {
    down: (event: MouseEvent) => void;
    move: (event: MouseEvent) => void;
    up: () => void;
  } | null = null;
  let suppressSigmaRootClickFallback = false;
  let suppressSigmaRootClickFallbackToken = 0;
  let recentRootClickAdditive = false;
  let recentRootClickAdditiveToken = 0;
  let activeStagePanTakeover = false;
  let expectStagePanTakeoverCameraUpdate = false;
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
  let activeViewTransition: SigmaGlobalViewTransition | null = null;
  let cancelledViewTransitionGuard: SigmaGlobalViewTransition | null = null;
  syncSigmaRootMetadata();

  try {
    sigma = new runtime.Sigma(graph, sigmaRoot, sigmaSettingsForAdapterData(currentTheme, adapterData));
    overlayDomController = createSigmaOverlayDomController({
      overlayRoot,
      cloudFilterId,
      getAdapterData: () => adapterData,
      getSigma: () => sigma,
      getOptions: () => rendererCoordinateOptions(),
      communityCloudFor: sigmaCommunityCloudFor,
      isDestroyed: () => destroyed,
      onHit: (renderedObject, context) => handleSigmaHit({ renderedObject, additive: Boolean(context?.additive) }),
      onNodeHover: handleNodeHover,
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
    bindSigmaRootClickFallback();
    bindSigmaRootCameraTakeover();
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
    resetView(resetOptions?: SigmaGlobalRendererResetViewOptions) {
      assertActive();
      cameraSpotlightKey = null;
      runSigmaViewTransition({
        target: sigmaGlobalCameraState(sigma, adapterData, currentViewportSize),
        animate: true,
        durationMs: resetOptions?.durationMs ?? SIGMA_COMMUNITY_SPOTLIGHT_CAMERA_ANIMATION_MS,
        easing: "quadraticInOut",
        onComplete: resetOptions?.onComplete,
        onCancel: resetOptions?.onCancel,
        onCleanup: resetOptions?.onCleanup
      });
    },
    accommodateNodeDrawer(nodeId: string, drawerOptions?: { durationMs?: number }) {
      assertActive();
      try {
        const durationMs = drawerOptions?.durationMs ?? SIGMA_COMMUNITY_SPOTLIGHT_CAMERA_ANIMATION_MS;
        cancelActiveViewTransition();
        disposeCancelledViewTransitionGuard();
        const result = maybeAnimateSigmaNodeDrawerCamera(
          sigma,
          sigmaRoot,
          adapterData,
          nodeId,
          {
            viewportSize: currentViewportSize,
            durationMs,
            onCleanup: () => {
              sigmaRoot.dataset.viewTransition = "";
            }
          },
          options.onFatalError
        );
        if (result.movement === "animated" && result.transition) {
          activeViewTransition = result.transition;
          sigmaRoot.dataset.viewTransition = "active";
          startProjectCameraFrameTracking(durationMs, SIGMA_CAMERA_MINIMUM_FAST_PATH_FRAMES);
          return;
        }
        activeViewTransition = null;
        sigmaRoot.dataset.viewTransition = "";
        if (result.movement === "immediate") {
          overlayDomController?.reposition();
        }
      } catch (error) {
        options.onFatalError?.(error);
      }
    },
    zoomIn() {
      assertActive();
      zoomSigmaCameraAtViewportPoint(sigmaViewportCenter(sigmaRoot), "in", true);
    },
    zoomOut() {
      assertActive();
      zoomSigmaCameraAtViewportPoint(sigmaViewportCenter(sigmaRoot), "out", true);
    },
    setRelationFocusPreview(nodeId) {
      assertActive();
      applySigmaRelationFocusPreview(nodeId);
    },
    update(updateOptions) {
      assertActive();
      const cameraState = readCameraState(sigma);
      const previousCameraSpotlightKey = cameraSpotlightKey;
      const previousAdapterSpotlightKey = sigmaSpotlightCameraKey(adapterData);
      let spotlightCameraPreviousKey = previousCameraSpotlightKey;
      const previousViewportSize = currentViewportSize;
      cancelNodeDrag();
      generation += 1;
      const finalizeUpdate = (): void => {
        try {
          syncSigmaEdgeEventSetting();
          restoreSigmaRelationFocusPreviewAfterUpdate();
          restoreCameraState(sigma, cameraState);
          sigma.refresh?.();
          overlayDomController?.rebuild();
          scheduleSpotlightCameraUpdate(spotlightCameraPreviousKey, generation);
        } catch (error) {
          options.onFatalError?.(error);
        }
      };
      const nextAdapterData = updateOptions.adapterData;
      const nextTheme = updateOptions.theme ?? currentTheme;
      const nextEdgeStyle = updateOptions.edgeStyle ?? currentEdgeStyle;
      const nextPins = { ...(updateOptions.pins ?? currentPins) };
      if (
        !spotlightCameraPreviousKey &&
        activeViewTransition?.isActive() &&
        previousAdapterSpotlightKey &&
        previousAdapterSpotlightKey === sigmaSpotlightCameraKey(nextAdapterData)
      ) {
        spotlightCameraPreviousKey = previousAdapterSpotlightKey;
      }
      if (updateOptions.viewportSize) currentViewportSize = updateOptions.viewportSize;
      if (shouldRefitSpotlightCameraAfterViewportChange(previousViewportSize, currentViewportSize, nextAdapterData)) {
        spotlightCameraPreviousKey = null;
      }
      if (canPatchSigmaGlobalGraphAttributes(adapterData, nextAdapterData, currentTheme, nextTheme)) {
        adapterData = nextAdapterData;
        syncSigmaAdapterIndexes();
        currentEdgeStyle = nextEdgeStyle;
        currentPins = nextPins;
        syncSigmaRootMetadata();
        cloudBasisByCommunityId = sigmaCommunityCloudBasisByIdWithReuse(cloudBasisByCommunityId, adapterData);
        patchSigmaGlobalGraphAttributes(graph, adapterData, currentTheme, currentEdgeStyle);
        projector = createSigmaGlobalHitProjector({
          adapterData,
          viewport: options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
          viewportSize: currentViewportSize,
          screenPointToWorldPoint: (point) => sigmaScreenPointToWorldPoint(sigma, point, rendererCoordinateOptions())
        });
        finalizeUpdate();
        return;
      }
      adapterData = updateOptions.adapterData;
      syncSigmaAdapterIndexes();
      syncSigmaRootMetadata();
      cloudBasisByCommunityId = sigmaCommunityCloudBasisByIdWithReuse(cloudBasisByCommunityId, adapterData);
      currentTheme = updateOptions.theme ?? currentTheme;
      currentEdgeStyle = updateOptions.edgeStyle ?? currentEdgeStyle;
      currentPins = { ...(updateOptions.pins ?? currentPins) };
      graph = buildSigmaGlobalGraphologyGraph(adapterData, runtime, currentTheme, currentEdgeStyle);
      projector = createSigmaGlobalHitProjector({
        adapterData,
        viewport: options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
        viewportSize: currentViewportSize,
        screenPointToWorldPoint: (point) => sigmaScreenPointToWorldPoint(sigma, point, rendererCoordinateOptions())
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
      cancelActiveViewTransition();
      disposeCancelledViewTransitionGuard();
      cancelNodeDrag();
      clearSuppressedNodeClick();
      destroyed = true;
      generation += 1;
      sigmaWheelZoomController?.destroy();
      sigmaWheelZoomController = null;
      overlayDomController?.destroy();
      overlayDomController = null;
      unbindSigmaEvents();
      unbindSigmaRootClickFallback();
      unbindSigmaRootCameraTakeover();
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

  function rendererCoordinateOptions(): Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData"> {
    return {
      ...options,
      adapterData,
      viewportSize: currentViewportSize
    };
  }

  function syncSigmaAdapterIndexes(): void {
    adapterNodeById = sigmaAdapterNodeById(adapterData);
    adapterEdgeById = sigmaAdapterEdgeById(adapterData);
    adapterRelationFocusActive = sigmaAdapterDataHasRelationFocus(adapterData);
  }

  function restoreSigmaRelationFocusPreviewAfterUpdate(): void {
    if (!relationFocusPreviewNodeId) {
      relationFocusPreviewTouched = emptyGraphFirstOrderRelationFocusTouched();
      return;
    }
    applySigmaRelationFocusPreview(relationFocusPreviewNodeId, { refresh: false });
  }

  function applySigmaRelationFocusPreview(
    nodeId: string | null,
    options: { refresh?: boolean } = {}
  ): void {
    const activeNodeId = nodeId && graph.hasNode(nodeId) ? nodeId : null;
    const nextFocus = resolveGraphFirstOrderRelationFocus({
      activeNodeId,
      hasNode: (id) => graph.hasNode(id),
      incidentEdgeIds: (id) => graph.edges(id),
      edgeSource: (id) => graph.source(id),
      edgeTarget: (id) => graph.target(id)
    });
    const nodeIds = new Set([...relationFocusPreviewTouched.nodeIds, ...nextFocus.touched.nodeIds]);
    const edgeIds = new Set([...relationFocusPreviewTouched.edgeIds, ...nextFocus.touched.edgeIds]);
    const communityColorById = new Map(adapterData.renderable.communities.map((community) => [community.id, community.color]));
    const spotlightCommunityId = sigmaSpotlightCommunityId(adapterData);
    const spotlightCommunityIds = spotlightCommunityId ? new Set([spotlightCommunityId]) : new Set<string>();
    const selectedCommunityIds = sigmaSelectedCommunityIds(adapterData);
    const edgeContext = sigmaGlobalEdgeStyleContext(adapterData, {
      relationFocusActive: Boolean(activeNodeId) || adapterRelationFocusActive
    });
    const communityReadingLabelBudget = adapterData.renderable.communityMap?.active
      ? adapterData.renderable.communityMap.current?.labelBudget.limit ?? null
      : null;

    for (const id of nodeIds) {
      const node = adapterNodeById.get(id);
      if (!node || !graph.hasNode(id)) continue;
      const relationFocusDepth = nextFocus.nodeDepthById.get(id) ?? node.relationFocusDepth ?? "none";
      graph.mergeNodeAttributes(id, sigmaGlobalNodeAttributes(
        { ...node, relationFocusDepth },
        communityColorById,
        spotlightCommunityIds,
        currentTheme,
        { communityReadingLabelBudget }
      ));
    }

    for (const id of edgeIds) {
      const edge = adapterEdgeById.get(id);
      if (!edge || !graph.hasEdge(id)) continue;
      const relationFocusDepth = nextFocus.edgeDepthById.get(id) ?? edge.render.relationFocusDepth ?? "none";
      graph.mergeEdgeAttributes(id, sigmaGlobalEdgeAttributes(
        {
          ...edge,
          render: {
            ...edge.render,
            relationFocusDepth
          }
        },
        currentTheme,
        currentEdgeStyle,
        selectedCommunityIds,
        edgeContext
      ));
    }

    relationFocusPreviewNodeId = activeNodeId;
    relationFocusPreviewTouched = nextFocus.touched;
    if (options.refresh !== false) sigma.refresh?.();
  }

  function bindSigmaEvents(): void {
    const nodeClick = (payload?: unknown): void => {
      if (shouldSuppressRootClickFallbackForSigmaNodeClick() || recentRootClickAdditive) suppressRootClickFallbackForSigmaPointerEvent();
      const nodeId = sigmaNodeIdFromPayload(payload);
      if (consumeSuppressedNodeClick(nodeId)) return;
      handleSigmaHit({ nodeId, additive: sigmaAdditiveFromPayloadOrRecentRootClick(payload) });
    };
    const stageClick = (payload?: unknown): void => {
      suppressRootClickFallbackForSigmaPointerEvent();
      handleSigmaHit({
        screenPoint: sigmaScreenPointFromPayload(payload),
        additive: sigmaAdditiveFromPayloadOrRecentRootClick(payload)
      });
    };
    const requestCameraFrame = (): void => requestOverlayAnimationFrame(overlayAnimationFrameOwner);
    const nodeDown = (payload?: unknown): void => beginNodeDrag(sigmaNodeIdFromPayload(payload), sigmaScreenPointFromPayload(payload), payload);
    const stageDown = (): void => beginStagePanTakeover();
    const nodeMove = (payload?: unknown): void => {
      if (activeViewTransition?.isActive() && sigmaPrimaryButtonIsDown(payload)) beginStagePanTakeover();
      trackStagePanTakeoverMove();
      moveNodeDrag(sigmaScreenPointFromPayload(payload), payload);
    };
    const stageUp = (payload?: unknown): void => {
      endStagePanTakeover();
      commitNodeDrag(sigmaScreenPointFromPayload(payload), payload);
    };
    const nodeUp = (payload?: unknown): void => commitNodeDrag(sigmaScreenPointFromPayload(payload), payload);
    const nodeEnter = (payload?: unknown): void => handleNodeHover(sigmaNodeIdFromPayload(payload));
    const nodeLeave = (): void => handleNodeHover(null);
    const edgeClick = (payload?: unknown): void => {
      if (!sigmaEdgeEventsEnabled(adapterData)) return;
      suppressRootClickFallbackForSigmaPointerEvent();
      const renderedObject = sigmaEdgeRenderedObjectFromPayload(payload);
      if (!renderedObject) return;
      handleSigmaHit({
        renderedObject,
        additive: sigmaAdditiveFromPayloadOrRecentRootClick(payload)
      });
    };
    const edgeEnter = (payload?: unknown): void => {
      if (!sigmaEdgeEventsEnabled(adapterData)) return;
      handleEdgeHover(sigmaEdgeIdFromPayload(payload));
    };
    const edgeLeave = (): void => {
      if (!sigmaEdgeEventsEnabled(adapterData)) return;
      handleEdgeHover(null);
    };
    eventBindings = [
      { event: "clickNode", listener: nodeClick },
      { event: "clickStage", listener: stageClick },
      { event: "clickEdge", listener: edgeClick },
      { event: "downStage", listener: stageDown },
      { event: "downNode", listener: nodeDown },
      { event: "moveBody", listener: nodeMove },
      { event: "upNode", listener: nodeUp },
      { event: "upStage", listener: stageUp },
      { event: "enterNode", listener: nodeEnter },
      { event: "leaveNode", listener: nodeLeave },
      { event: "enterEdge", listener: edgeEnter },
      { event: "leaveEdge", listener: edgeLeave },
      { event: "afterRender", listener: requestCameraFrame }
    ];
    for (const binding of eventBindings) {
      sigma.on?.(binding.event, binding.listener);
    }
    const camera = sigma.getCamera?.();
    if (camera?.on) {
      const listener = (state?: SigmaGlobalCameraState): void => {
        if (expectStagePanTakeoverCameraUpdate && cancelledViewTransitionGuard?.isGuardingStaleAnimation()) {
          expectStagePanTakeoverCameraUpdate = false;
          cancelledViewTransitionGuard.takeover(state ?? readCameraState(sigma) ?? {});
        }
        requestOverlayAnimationFrame(overlayAnimationFrameOwner);
      };
      camera.on("updated", listener);
      cameraEventBindings = [{ event: "updated", listener }];
    }
  }

  function bindSigmaRootClickFallback(): void {
    const listener = (event: MouseEvent): void => {
      if (destroyed || event.defaultPrevented) return;
      if (typeof event.button === "number" && event.button !== 0) return;
      if (sigmaRootClickTargetIsExplicitControl(event.target)) return;
      rememberRootClickAdditive(event);
      if (suppressSigmaRootClickFallback) return;
      const explicitOverlayTarget = sigmaRenderedObjectFromRootClickPoint(event);
      if (explicitOverlayTarget) {
        if (explicitOverlayTarget.kind === "node" && consumeSuppressedNodeClick(explicitOverlayTarget.id)) return;
        const additive = event.shiftKey;
        queueMicrotask(() => {
          if (destroyed || suppressSigmaRootClickFallback) return;
          handleSigmaHit({ renderedObject: explicitOverlayTarget, additive });
        });
        return;
      }
      const screenPoint = overlayPointerScreenPoint(event, sigmaRoot);
      const additive = event.shiftKey;
      queueMicrotask(() => {
        if (destroyed || suppressSigmaRootClickFallback) return;
        handleSigmaHit({ screenPoint, additive });
      });
    };
    sigmaRootClickFallbackListener = listener;
    sigmaRoot.addEventListener("click", listener, true);
  }

  function unbindSigmaRootClickFallback(): void {
    if (!sigmaRootClickFallbackListener) return;
    sigmaRoot.removeEventListener?.("click", sigmaRootClickFallbackListener, true);
    sigmaRootClickFallbackListener = null;
  }

  function bindSigmaRootCameraTakeover(): void {
    const ownerDocument = sigmaRoot.ownerDocument;
    const down = (event: MouseEvent): void => {
      if (destroyed || event.defaultPrevented) return;
      if (typeof event.button === "number" && event.button !== 0) return;
      beginStagePanTakeover();
    };
    const move = (event: MouseEvent): void => {
      if (destroyed || !activeStagePanTakeover) return;
      if (typeof event.buttons === "number" && (event.buttons & 1) !== 1) return;
      trackStagePanTakeoverMove();
    };
    const up = (): void => endStagePanTakeover();
    sigmaRoot.addEventListener?.("mousedown", down, true);
    ownerDocument.addEventListener?.("mousemove", move, true);
    ownerDocument.addEventListener?.("mouseup", up, true);
    sigmaRootCameraTakeoverListeners = { down, move, up };
  }

  function unbindSigmaRootCameraTakeover(): void {
    if (!sigmaRootCameraTakeoverListeners) return;
    const ownerDocument = sigmaRoot.ownerDocument;
    sigmaRoot.removeEventListener?.("mousedown", sigmaRootCameraTakeoverListeners.down, true);
    ownerDocument.removeEventListener?.("mousemove", sigmaRootCameraTakeoverListeners.move, true);
    ownerDocument.removeEventListener?.("mouseup", sigmaRootCameraTakeoverListeners.up, true);
    sigmaRootCameraTakeoverListeners = null;
  }

  function sigmaAdditiveFromPayloadOrRecentRootClick(payload?: unknown): boolean {
    return sigmaAdditiveFromPayload(payload) || recentRootClickAdditive;
  }

  function rememberRootClickAdditive(event: MouseEvent): void {
    recentRootClickAdditive = event.shiftKey === true;
    const token = recentRootClickAdditiveToken + 1;
    recentRootClickAdditiveToken = token;
    setTimeout(() => {
      if (recentRootClickAdditiveToken !== token) return;
      recentRootClickAdditive = false;
    }, 0);
  }

  function suppressRootClickFallbackForSigmaPointerEvent(): void {
    const token = suppressSigmaRootClickFallbackToken + 1;
    suppressSigmaRootClickFallbackToken = token;
    suppressSigmaRootClickFallback = true;
    setTimeout(() => {
      if (suppressSigmaRootClickFallbackToken !== token) return;
      suppressSigmaRootClickFallback = false;
    }, 0);
  }

  function shouldSuppressRootClickFallbackForSigmaNodeClick(): boolean {
    return adapterData.renderable.communityMap?.active === true || !adapterData.sourceCommunityId;
  }

  function sigmaRootClickTargetIsExplicitControl(target: EventTarget | null): boolean {
    return SIGMA_ROOT_CLICK_FALLBACK_IGNORE_SELECTORS.some((selector) => Boolean(closestSigmaRootClickTarget(target, selector)));
  }

  function sigmaRenderedObjectFromRootClickPoint(event: MouseEvent): SigmaGlobalRenderedObject | null {
    const elements = sigmaRootClickPointElements(event);
    for (const element of elements) {
      const node = closestSigmaRootClickTarget(element, ".sigma-global-node-hit-target");
      const nodeId = sigmaRootDatasetValue(node, "nodeId");
      if (nodeId) return { kind: "node", id: nodeId };

      const aggregation = closestSigmaRootClickTarget(element, ".sigma-global-aggregation-container");
      const aggregationId = sigmaRootDatasetValue(aggregation, "aggregationId") || sigmaRootDatasetValue(aggregation, "id");
      if (aggregationId) {
        return {
          kind: "aggregation-container",
          id: aggregationId,
          communityId: sigmaRootDatasetValue(aggregation, "communityId")
        };
      }

      const region = closestSigmaRootClickTarget(element, ".sigma-global-community-region");
      const communityId = sigmaRootDatasetValue(region, "communityId");
      if (communityId) return { kind: "community-wash", id: communityId };
    }
    return null;
  }

  function sigmaRootClickPointElements(event: MouseEvent): EventTarget[] {
    const documentLike = sigmaRoot.ownerDocument as Document & {
      elementsFromPoint?: (x: number, y: number) => Element[];
      elementFromPoint?: (x: number, y: number) => Element | null;
    };
    const x = event.clientX;
    const y = event.clientY;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return [];
    if (typeof documentLike.elementsFromPoint === "function") return documentLike.elementsFromPoint(x, y);
    const element = typeof documentLike.elementFromPoint === "function" ? documentLike.elementFromPoint(x, y) : null;
    return element ? [element] : [];
  }

  function sigmaRootDatasetValue(target: unknown, key: string): string | null {
    const value = (target as { dataset?: Record<string, string | undefined> } | null)?.dataset?.[key];
    return typeof value === "string" && value ? value : null;
  }

  function closestSigmaRootClickTarget(target: EventTarget | null, selector: string): unknown {
    const candidate = target as {
      closest?: (query: string) => unknown;
      parentElement?: { closest?: (query: string) => unknown } | null;
    } | null;
    return candidate?.closest?.(selector) ?? candidate?.parentElement?.closest?.(selector) ?? null;
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
          completeActiveViewTransitionIfSettled(animated);
          releaseCancelledViewTransitionGuardIfSettled(animated);
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

  function runSigmaViewTransition(transitionOptions: {
    target: Partial<SigmaGlobalCameraState>;
    animate: boolean;
    durationMs: number;
    easing: string;
    onComplete?: () => void;
    onCancel?: () => void;
    onCleanup?: () => void;
  }): void {
    cancelActiveViewTransition();
    disposeCancelledViewTransitionGuard();
    const result = startSigmaGlobalViewTransition(sigma, {
      target: transitionOptions.target,
      animate: transitionOptions.animate,
      reducedMotion: prefersReducedMotion(sigmaRoot.ownerDocument.defaultView),
      durationMs: transitionOptions.durationMs,
      easing: transitionOptions.easing,
      onComplete: transitionOptions.onComplete,
      onCancel: transitionOptions.onCancel,
      onCleanup: () => {
        sigmaRoot.dataset.viewTransition = "";
        transitionOptions.onCleanup?.();
      },
      onAnimationError: (error) => options.onFatalError?.(error)
    });
    if (result.movement === "animated" && result.transition) {
      activeViewTransition = result.transition;
      sigmaRoot.dataset.viewTransition = "active";
      startProjectCameraFrameTracking(transitionOptions.durationMs, SIGMA_CAMERA_MINIMUM_FAST_PATH_FRAMES);
      return;
    }
    activeViewTransition = null;
    sigmaRoot.dataset.viewTransition = "";
    if (result.movement === "immediate") {
      overlayDomController?.reposition();
    }
  }

  function completeActiveViewTransitionIfSettled(animated: boolean): void {
    if (animated || !activeViewTransition?.isActive()) return;
    activeViewTransition.complete();
    activeViewTransition = null;
    sigmaRoot.dataset.viewTransition = "";
  }

  function cancelActiveViewTransition(takeoverState?: Partial<SigmaGlobalCameraState>): void {
    const transition = activeViewTransition;
    if (!transition) return;
    activeViewTransition = null;
    if (transition.isActive()) {
      transition.cancel(takeoverState);
    }
    sigmaRoot.dataset.viewTransition = "";
    if (transition.isGuardingStaleAnimation()) {
      disposeCancelledViewTransitionGuard();
      cancelledViewTransitionGuard = transition;
      return;
    }
    transition.dispose();
  }

  function disposeCancelledViewTransitionGuard(): void {
    cancelledViewTransitionGuard?.dispose();
    cancelledViewTransitionGuard = null;
  }

  function releaseCancelledViewTransitionGuardIfSettled(animated: boolean): void {
    if (animated || !cancelledViewTransitionGuard) return;
    disposeCancelledViewTransitionGuard();
  }

  function applySpotlightCameraResult(result: SigmaCommunitySpotlightCameraResult): void {
    cameraSpotlightKey = result.communityId ? sigmaSpotlightCameraKey(adapterData) : null;
    if (result.movement === "animated" && result.transition) {
      activeViewTransition = result.transition;
      sigmaRoot.dataset.viewTransition = "active";
      disposeCancelledViewTransitionGuard();
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

  function scheduleSpotlightCameraUpdate(previousSpotlightKey: string | null, updateGeneration: number): void {
    const run = (): void => {
      deferredSpotlightCameraFrame = null;
      if (destroyed || updateGeneration !== generation) return;
      try {
        const currentCommunityId = sigmaSpotlightCameraCommunityId(adapterData);
        const currentSpotlightKey = sigmaSpotlightCameraKey(adapterData);
        const spotlightCamera = maybeAnimateSigmaCommunitySpotlightCamera(
          sigma,
          sigmaRoot,
          adapterData,
          currentCommunityId,
          previousSpotlightKey === currentSpotlightKey ? currentCommunityId : null,
          currentViewportSize,
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
      cancelActiveViewTransition();
      const animation = camera.animate(nextState, { duration: SIGMA_BUTTON_ZOOM_DURATION_MS, easing: "quadraticOut" });
      if (animation && typeof (animation as Promise<unknown>).catch === "function") {
        void (animation as Promise<unknown>).catch((error) => options.onFatalError?.(error));
      }
      startOverlayCameraFrameTracking();
      return;
    }
    // 滚轮/触控板始终即时 setState，不排队动画（设计 §5）。如果共享过渡仍在进行，
    // 先取消并用新状态接管，避免旧 animate 末尾把镜头拉回旧目标。
    suppressOverlayAnimationFastPathUntilSettled();
    if (activeViewTransition?.isActive()) {
      cancelActiveViewTransition(nextState);
      return;
    }
    if (cancelledViewTransitionGuard?.isGuardingStaleAnimation()) {
      cancelledViewTransitionGuard.takeover(nextState);
      return;
    }
    camera?.setState?.(nextState);
  }

  function beginStagePanTakeover(): void {
    if (!activeViewTransition?.isActive()) {
      endStagePanTakeover();
      return;
    }
    activeStagePanTakeover = true;
    expectStagePanTakeoverCameraUpdate = false;
    suppressOverlayAnimationFastPathUntilSettled();
    cancelActiveViewTransition(readCameraState(sigma) ?? undefined);
  }

  function trackStagePanTakeoverMove(): void {
    if (!activeStagePanTakeover || !cancelledViewTransitionGuard?.isGuardingStaleAnimation()) return;
    expectStagePanTakeoverCameraUpdate = true;
  }

  function endStagePanTakeover(): void {
    activeStagePanTakeover = false;
    expectStagePanTakeoverCameraUpdate = false;
  }

  function sigmaPrimaryButtonIsDown(payload: unknown): boolean {
    const event = (payload as { event?: { original?: { buttons?: unknown } } } | null)?.event?.original;
    return typeof event?.buttons === "number" && (event.buttons & 1) === 1;
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
      if (nextSize) {
        lastObservedRootSize = nextSize;
        currentViewportSize = nextSize;
        options.onViewportSizeChange?.(nextSize);
      }
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
        projector = createSigmaGlobalHitProjector({
          adapterData,
          viewport: options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
          viewportSize: currentViewportSize,
          screenPointToWorldPoint: (point) => sigmaScreenPointToWorldPoint(sigma, point, rendererCoordinateOptions())
        });
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
    cancelActiveViewTransition(readCameraState(sigma) ?? undefined);
    lastHitTarget = target;
    syncSigmaRootLastHitMetadata(target);
    options.onHitTarget?.(target, { additive: Boolean(input.additive) });
  }

  function handleNodeHover(nodeId: string | null): void {
    if (destroyed || activeNodeDrag) return;
    options.onNodeHover?.(nodeId && graph.hasNode(nodeId) ? nodeId : null);
  }

  function handleEdgeHover(edgeId: string | null): void {
    if (destroyed || activeNodeDrag) return;
    options.onEdgeHover?.(edgeId && graph.hasEdge(edgeId) ? edgeId : null);
  }

  function syncSigmaEdgeEventSetting(): void {
    sigma.setSetting?.("enableEdgeEvents", sigmaEdgeEventsEnabled(adapterData));
  }

  function sigmaEdgeRenderedObjectFromPayload(payload?: unknown): SigmaGlobalRenderedObject | null {
    const edgeId = sigmaEdgeIdFromPayload(payload);
    return edgeId && graph.hasEdge(edgeId) ? { kind: "edge", id: edgeId } : null;
  }

  function beginNodeDrag(nodeId: string | null, screenPoint: GraphScreenPoint | null, payload?: unknown): void {
    if (destroyed || !nodeId || !screenPoint || !graph.hasNode(nodeId)) return;
    preventSigmaDefault(payload);
    cancelNodeDrag();
    handleNodeHover(null);
    cancelActiveViewTransition(readCameraState(sigma) ?? undefined);
    suppressOverlayAnimationFastPathUntilSettled();
    const startPoint = sigmaNodeWorldPoint(nodeId);
    const pointerWorldPoint = sigmaScreenPointToWorldPoint(sigma, screenPoint, rendererCoordinateOptions());
    activeNodeDrag = createSigmaGlobalNodeDragSession({
      nodeId,
      pinKey: sigmaPinKeyForNode(nodeId),
      startPoint,
      pointerStart: screenPoint,
      pointerWorldPoint,
      initiallyPinned: Boolean(graph.getNodeAttribute(nodeId, "pinned")),
      initialPinPosition: sigmaPinPositionForNode(nodeId),
      previousCameraPanning: sigma.getSetting?.("enableCameraPanning"),
      dragStartThreshold: sigmaGlobalNodeDragStartThreshold(sigmaPointerTypeFromPayload(payload))
    });
    sigma.setSetting?.("enableCameraPanning", false);
    sigmaRoot.dataset.draggingNodeId = nodeId;
    options.onDragActiveChange?.(true);
  }

  function moveNodeDrag(screenPoint: GraphScreenPoint | null, payload?: unknown): void {
    const drag = activeNodeDrag;
    if (!drag || destroyed || !screenPoint) return;
    preventSigmaDefault(payload);
    const pointerWorldPoint = sigmaScreenPointToWorldPoint(sigma, screenPoint, rendererCoordinateOptions());
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
      suppressNextNodeClick(drag.nodeId);
      handleNodeHover(drag.nodeId);
      handleSigmaHit({
        nodeId: drag.nodeId,
        additive: sigmaAdditiveFromPayloadOrRecentRootClick(payload)
      });
      return;
    }
    suppressNextNodeClick(drag.nodeId);
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

  function sigmaPointerTypeFromPayload(payload?: unknown): string | null {
    const candidate = payload as { pointerType?: unknown; event?: { pointerType?: unknown } } | null;
    if (typeof candidate?.pointerType === "string") return candidate.pointerType;
    if (typeof candidate?.event?.pointerType === "string") return candidate.event.pointerType;
    return null;
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
    syncSigmaAdapterIndexes();
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
    clearSuppressedNodeClick();
    return true;
  }

  function suppressNextNodeClick(nodeId: string): void {
    clearSuppressedNodeClick();
    suppressNextNodeClickId = nodeId;
    suppressNextNodeClickTimer = setTimeout(() => {
      suppressNextNodeClickId = null;
      suppressNextNodeClickTimer = null;
    }, 0);
  }

  function clearSuppressedNodeClick(): void {
    suppressNextNodeClickId = null;
    if (!suppressNextNodeClickTimer) return;
    clearTimeout(suppressNextNodeClickTimer);
    suppressNextNodeClickTimer = null;
  }

  function sigmaCommunityCloudFor(communityId: string, wash: { cx: number; cy: number; rx: number; ry: number }): SigmaCommunityCloud {
    const fallbackBox = overlayBoxFromWorldEllipse(wash.cx, wash.cy, wash.rx, wash.ry);
    return sigmaCommunityCloud(
      sigmaProjectedCloudHullPoints(cloudBasisByCommunityId.get(communityId), sigma, rendererCoordinateOptions()),
      fallbackBox,
      adapterData.renderable.communityMap?.active
        ? {
            minBoxWidth: SIGMA_READING_COMMUNITY_CLOUD_MIN_WIDTH,
            minBoxHeight: SIGMA_READING_COMMUNITY_CLOUD_MIN_HEIGHT
          }
        : {}
    );
  }

  function overlayBoxFromWorldEllipse(x: number, y: number, rx: number, ry: number): { left: number; top: number; width: number; height: number } {
    const topLeft = sigmaWorldPointToScreenPoint(sigma, { x: x - rx, y: y - ry }, rendererCoordinateOptions());
    const bottomRight = sigmaWorldPointToScreenPoint(sigma, { x: x + rx, y: y + ry }, rendererCoordinateOptions());
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

  function syncSigmaRootMetadata(): void {
    const communityMap = adapterData.renderable.communityMap;
    const currentCommunityId = communityMap?.current?.communityId ?? "";
    const focusCommunityId = communityMap?.active ? currentCommunityId : "";
    sigmaRoot.dataset.nodeCount = String(adapterData.nodes.length);
    sigmaRoot.dataset.edgeCount = String(adapterData.edges.length);
    sigmaRoot.dataset.communityCount = String(adapterData.renderable.communities.length);
    sigmaRoot.dataset.communityFocusId = focusCommunityId;
    sigmaRoot.dataset.communityContextId = currentCommunityId;
    sigmaRoot.dataset.sourceCommunityId = adapterData.sourceCommunityId ?? "";
    sigmaRoot.dataset.communityMapLabelLimit = String(communityMap?.current?.labelBudget.limit ?? 0);
    sigmaRoot.dataset.communityMapVisibleLabels = String(communityMap?.current?.labelBudget.visible ?? 0);
  }

  function syncSigmaRootLastHitMetadata(target: GraphGestureTarget): void {
    sigmaRoot.dataset.lastHitKind = target.kind;
    sigmaRoot.dataset.lastHitId = "id" in target && typeof target.id === "string" ? target.id : "";
  }

}

function sigmaAdapterNodeById(
  adapterData: GraphRendererAdapterData
): Map<string, GraphRendererAdapterData["nodes"][number]> {
  return new Map(adapterData.nodes.map((node) => [node.id, node]));
}

function sigmaAdapterEdgeById(
  adapterData: GraphRendererAdapterData
): Map<string, GraphRendererAdapterData["edges"][number]> {
  return new Map(adapterData.edges.map((edge) => [edge.id, edge]));
}

function sigmaSpotlightCameraCommunityId(adapterData: GraphRendererAdapterData): string | null {
  if (adapterData.renderable.communityMap?.active) return sigmaSpotlightCommunityId(adapterData);
  return adapterData.selection.input?.kind === "community" ? adapterData.selection.input.id : null;
}

function sigmaSpotlightCameraKey(adapterData: GraphRendererAdapterData): string | null {
  const communityId = sigmaSpotlightCameraCommunityId(adapterData);
  if (!communityId) return null;
  return `${adapterData.renderable.communityMap?.active ? "reading" : "global"}:${communityId}`;
}

function shouldRefitSpotlightCameraAfterViewportChange(
  previousSize: RendererViewportSize,
  nextSize: RendererViewportSize,
  adapterData: GraphRendererAdapterData
): boolean {
  return adapterData.renderable.communityMap?.active === true && !sameRendererViewportSize(previousSize, nextSize);
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

/** @internal 仅为单元测试直接断言而导出，非稳定公开 API；唯一生产调用方是本文件 createSigmaRoot。 */
export function sigmaSettingsForTheme(theme: ThemeId): Record<string, unknown> {
  const tokens = getThemeTokens(theme);
  return {
    renderEdgeLabels: false,
    allowInvalidContainer: false,
    labelColor: sigmaLabelColor(theme),
    labelFont: tokens.vars["--font-ui"],
    defaultDrawNodeLabel: drawSigmaReadingAwareNodeLabel,
    enableEdgeEvents: false,
    zoomingRatio: SIGMA_BUTTON_ZOOM_RATIO,
    // Sigma 默认 wheel 的兜底参数：wheel 已被 sigma-wheel-zoom controller 接管（preventSigmaDefault），
    // zoomingRatio/zoomDuration 只在 Sigma 内置缩放入口（如 animatedZoom）被触发时生效，
    // 日常不走。项目按钮动画用的是 SIGMA_BUTTON_ZOOM_DURATION_MS（140），勿与这里的 120 混淆。
    zoomDuration: 120,
    minCameraRatio: SIGMA_CAMERA_MIN_RATIO,
    maxCameraRatio: SIGMA_CAMERA_MAX_RATIO
  };
}

function sigmaSettingsForAdapterData(theme: ThemeId, adapterData: GraphRendererAdapterData): Record<string, unknown> {
  return {
    ...sigmaSettingsForTheme(theme),
    enableEdgeEvents: sigmaEdgeEventsEnabled(adapterData)
  };
}

function sigmaEdgeEventsEnabled(adapterData: GraphRendererAdapterData): boolean {
  return adapterData.renderable.communityMap?.active === true;
}

/** @internal 仅为单元测试直接断言而导出，生产中通过 sigmaSettingsForTheme 注入 Sigma。 */
export function drawSigmaReadingAwareNodeLabel(
  context: CanvasRenderingContext2D,
  data: SigmaNodeLabelData,
  settings: SigmaNodeLabelSettings
): void {
  if (!data.label) return;
  const label = String(data.label);
  const size = settings.labelSize;
  const font = settings.labelFont;
  const weight = settings.labelWeight;
  const color = settings.labelColor.attribute
    ? String(data[settings.labelColor.attribute] || settings.labelColor.color || "#000")
    : settings.labelColor.color || "#000";
  context.fillStyle = color;
  context.font = `${weight} ${size}px ${font}`;
  const rightX = data.x + data.size + 3;
  const textWidth = context.measureText(label).width;
  const canvasWidth = sigmaLabelCanvasCssWidth(context);
  const leftX = data.x - data.size - 3 - textWidth;
  const shouldDrawLeft = canvasWidth > 0
    && rightX + textWidth > canvasWidth - SIGMA_NODE_LABEL_EDGE_GUTTER
    && leftX >= SIGMA_NODE_LABEL_EDGE_GUTTER;
  context.fillText(label, shouldDrawLeft ? leftX : rightX, data.y + size / 3);
}

function sigmaLabelCanvasCssWidth(context: CanvasRenderingContext2D): number {
  const canvas = context.canvas;
  const clientWidth = finiteNumber(canvas?.clientWidth, 0);
  if (clientWidth > 0) return clientWidth;
  const rectWidth = finiteNumber(canvas?.getBoundingClientRect?.().width, 0);
  if (rectWidth > 0) return rectWidth;
  return finiteNumber(canvas?.width, 0);
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

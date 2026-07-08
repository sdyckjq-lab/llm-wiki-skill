import type { GraphEdgeStyleOptions, PinMap, ThemeId } from "../types";
import type { GraphRendererAdapterData } from "./adapter";
import type { GraphScreenPoint } from "./geometry";
import type { GraphGestureTarget } from "./gestures";
import type { RendererViewport, RendererViewportSize } from "./viewport";

export interface SigmaGlobalRendererRuntimeBoundary {
  Sigma: typeof import("sigma").default;
  GraphologyGraph: typeof import("graphology").default;
}

export type SigmaGlobalGraphologyGraph = InstanceType<SigmaGlobalRendererRuntimeBoundary["GraphologyGraph"]>;

export interface SigmaGlobalCameraState {
  x: number;
  y: number;
  angle: number;
  ratio: number;
}

export interface SigmaGlobalCoordinateConversionOverride {
  cameraState?: Partial<SigmaGlobalCameraState>;
}

export interface SigmaGlobalCameraLike {
  getState?: () => SigmaGlobalCameraState;
  setState?: (state: Partial<SigmaGlobalCameraState>) => unknown;
  isAnimated?: () => boolean;
  on?: (event: "updated", listener: (state?: SigmaGlobalCameraState) => void) => unknown;
  off?: (event: "updated", listener: (state?: SigmaGlobalCameraState) => void) => unknown;
  animate?: (
    state: Partial<SigmaGlobalCameraState>,
    options?: { duration?: number; easing?: string }
  ) => unknown;
}

export interface SigmaGlobalMouseCaptorLike {
  on?: (event: "wheel", listener: (payload?: unknown) => void) => unknown;
  off?: (event: "wheel", listener: (payload?: unknown) => void) => unknown;
}

export interface SigmaGlobalSigmaLike {
  getCamera?: () => SigmaGlobalCameraLike;
  getMouseCaptor?: () => SigmaGlobalMouseCaptorLike;
  getViewportZoomedState?: (viewportTarget: GraphScreenPoint, newRatio: number) => SigmaGlobalCameraState;
  getGraph?: () => unknown;
  setGraph?: (graph: SigmaGlobalGraphologyGraph) => unknown;
  getSetting?: (key: string) => unknown;
  setSetting?: (key: string, value: unknown) => unknown;
  viewportToGraph?: (point: GraphScreenPoint) => { x: number; y: number };
  viewportToFramedGraph?: (point: GraphScreenPoint) => { x: number; y: number };
  graphToViewport?: (
    point: { x: number; y: number },
    override?: SigmaGlobalCoordinateConversionOverride
  ) => GraphScreenPoint;
  refresh?: () => unknown;
  on?: (event: string, listener: (payload?: unknown) => void) => unknown;
  off?: (event: string, listener: (payload?: unknown) => void) => unknown;
  kill?: () => unknown;
}

export interface SigmaGlobalGraphologyRuntime {
  GraphologyGraph: SigmaGlobalRendererRuntimeBoundary["GraphologyGraph"];
}

export interface SigmaGlobalRendererRuntime extends SigmaGlobalGraphologyRuntime {
  Sigma: new (graph: SigmaGlobalGraphologyGraph, container: HTMLElement, settings?: Record<string, unknown>) => SigmaGlobalSigmaLike;
}

export interface SigmaGlobalHitContext {
  additive: boolean;
}

export interface SigmaGlobalRendererCreateOptions {
  container: HTMLElement;
  adapterData: GraphRendererAdapterData;
  theme: ThemeId;
  edgeStyle?: GraphEdgeStyleOptions;
  onHitTarget?: (target: GraphGestureTarget, context: SigmaGlobalHitContext) => void;
  onNodeHover?: (nodeId: string | null) => void;
  onEdgeHover?: (edgeId: string | null) => void;
  onPinsChanged?: (pins: PinMap) => void;
  onDragActiveChange?: (dragging: boolean) => void;
  onViewportSizeChange?: (size: RendererViewportSize) => void;
  onFatalError?: (error: unknown) => void;
  pins?: PinMap;
  runtime?: SigmaGlobalRendererRuntime;
  viewport?: RendererViewport;
  viewportSize?: RendererViewportSize;
}

export interface SigmaGlobalRendererUpdateOptions {
  adapterData: GraphRendererAdapterData;
  theme?: ThemeId;
  edgeStyle?: GraphEdgeStyleOptions;
  pins?: PinMap;
  viewportSize?: RendererViewportSize;
}

export interface SigmaGlobalRendererResetViewOptions {
  onComplete?: () => void;
  onCancel?: () => void;
  onCleanup?: () => void;
  /**
   * 相机过渡时长（毫秒）。省略时用默认 spotlight 时长
   *（SIGMA_COMMUNITY_SPOTLIGHT_CAMERA_ANIMATION_MS）。#121 社区阅读回全图传退出
   * 专用短时长 SIGMA_COMMUNITY_RETURN_GLOBAL_TRANSITION_MS，让退出比进入更克制。
   */
  durationMs?: number;
}

export interface SigmaGlobalRenderer {
  readonly id: "sigma-global";
  readonly root: HTMLElement;
  readonly overlayRoot: HTMLElement;
  readonly graph: SigmaGlobalGraphologyGraph;
  readonly updateStrategy: "rebuild-graph-preserve-camera";
  readonly lastHitTarget: GraphGestureTarget | null;
  isDragging(): boolean;
  resetView(options?: SigmaGlobalRendererResetViewOptions): void;
  // #122：社区阅读单击节点打开右侧详情抽屉时，镜头让位到剩余画布的舒适位置。
  // 窄屏覆盖抽屉/非社区阅读由调用方或 sigmaNodeDrawerCameraState 自行短路。
  accommodateNodeDrawer(nodeId: string, options?: { durationMs?: number }): void;
  zoomIn(): void;
  zoomOut(): void;
  setRelationFocusPreview(nodeId: string | null): void;
  update(options: SigmaGlobalRendererUpdateOptions): void;
  destroy(): void;
}

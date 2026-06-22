import type { GraphAggregationMarker, GraphData, GraphDiff, GraphSummaryObjectRef, GraphTypeFilters, GraphVisibilityState, NodeId, PinMap, SelectionInput, ThemeId } from "../types";
import type { LiveGraphSimulation, PinState } from "../sim";
import type { GraphHitTargetResolver } from "./hit-testing";
import type { GraphGestureController, GraphGestureStateMachine } from "./gestures";
import type { DensityMode, RenderableGraph, RenderPathCache } from "./model";
import type { resolveGraphSearchState } from "./search";
import type { GraphRendererSurface } from "./renderer-surface";
import type { GraphRuntimeState } from "./state";
import type { GraphToolbarPanelState } from "./toolbar";
import type { createViewportFrameCommitter } from "./viewport";

export interface PaintedGraphDom {
  contentLayer: HTMLElement | null;
  svgElement: SVGSVGElement | null;
  edgeElements: Map<string, SVGPathElement>;
  communityWashElements: Map<string, SVGEllipseElement>;
  aggregationContainerElements: Map<string, HTMLButtonElement>;
  nodeElements: Map<string, HTMLButtonElement>;
  miniNodeElements: Map<string, SVGCircleElement>;
  miniViewportElement: SVGRectElement | null;
  basePoints: Map<string, { x: number; y: number }>;
  readerElement: HTMLElement | null;
  selectionElement: HTMLElement | null;
  searchElement: HTMLElement | null;
  searchInput: HTMLInputElement | null;
  searchStatusElement: HTMLElement | null;
  toolbarElement: HTMLElement | null;
  toolbarPanelElement: HTMLElement | null;
  legendElement: HTMLElement | null;
  legendRows: Map<string, HTMLButtonElement>;
  previewElement: HTMLElement | null;
}

export interface GraphRendererCallbacks {
  onNodeOpen?: (nodeId: NodeId) => void;
  onSelectionInput?: (selection: SelectionInput) => void;
  onSelectionClearRequested?: () => void;
  onViewReset?: () => void;
  onGlobalResetRequested?: () => void;
  onPinsChanged?: (pins: PinMap) => void;
  onDragActiveChange?: (dragging: boolean) => void;
  onVisibilityStateChange?: (state: GraphVisibilityState) => void;
}

export interface GraphRenderContext {
  data: GraphData;
  theme: ThemeId;
  destroyed: boolean;
  simulation: LiveGraphSimulation | null;
  dom: PaintedGraphDom;
  activeDiff: GraphDiff | null;
  searchOpen: boolean;
  searchQuery: string;
  searchFocusedNodeId: NodeId | null;
  typeFilters: GraphTypeFilters;
  aggregationMarkers: GraphAggregationMarker[];
  baseTypeFilters: GraphTypeFilters;
  availableTypeFilters: GraphTypeFilters;
  temporaryObject: GraphSummaryObjectRef | null;
  searchIndex: ReturnType<typeof resolveGraphSearchState>["searchIndex"] | undefined;
  previewTimer: ReturnType<typeof setTimeout> | null;
  pathCache: RenderPathCache;
  root: HTMLElement;
  rendererSurface: GraphRendererSurface;
  toolbarContainer: HTMLElement;
  hasExternalToolbarContainer: boolean;
  ownerDocument: Document;
  legendCollapsed: boolean;
  toolbarPanelState: GraphToolbarPanelState;
  viewportCommitter: ReturnType<typeof createViewportFrameCommitter>;
  gestureMachine: GraphGestureStateMachine;
  gestureController: GraphGestureController | null;
  viewportAnimationTimer: ReturnType<typeof setTimeout> | null;
  interactionDegradationTimer: ReturnType<typeof setTimeout> | null;
  lastEffectiveDensityMode: DensityMode | null;
  lastViewportSize: { width: number; height: number };
  resizeObserver: ResizeObserver | null;
  graph: RenderableGraph;
  runtimeState: GraphRuntimeState;
  hitTargetResolver: GraphHitTargetResolver;
  pinState: PinState;
  renderEpoch: number;
  callbacks: GraphRendererCallbacks;
}

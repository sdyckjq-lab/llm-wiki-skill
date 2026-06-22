import type { PinPosition } from "../types";
import type { GraphRendererAdapterData, GraphRendererAdapterNode } from "./adapter";
import type { GraphScreenPoint } from "./geometry";
import type { GraphGestureTarget } from "./gestures";

export type SigmaGlobalRenderedObject =
  | { kind: "node"; id: string }
  | { kind: "edge"; id: string }
  | { kind: "community-wash"; id: string }
  | { kind: "aggregation-container"; id: string; communityId?: string | null };

export const SIGMA_GLOBAL_NODE_DRAG_START_THRESHOLD = 2;

export interface SigmaGlobalNodeDragSession {
  nodeId: string;
  pinKey: string;
  startPoint: { x: number; y: number };
  currentPoint: { x: number; y: number };
  initiallyPinned: boolean;
  initialPinPosition: PinPosition | null;
  pointerStart: GraphScreenPoint;
  grabOffset: { x: number; y: number };
  previousCameraPanning: unknown;
  moved: boolean;
}

export function createSigmaGlobalNodeDragSession(input: {
  nodeId: string;
  pinKey: string;
  startPoint: { x: number; y: number };
  pointerStart: GraphScreenPoint;
  pointerWorldPoint: { x: number; y: number };
  initiallyPinned: boolean;
  initialPinPosition: PinPosition | null;
  previousCameraPanning: unknown;
}): SigmaGlobalNodeDragSession {
  return {
    nodeId: input.nodeId,
    pinKey: input.pinKey,
    startPoint: input.startPoint,
    currentPoint: input.startPoint,
    initiallyPinned: input.initiallyPinned,
    initialPinPosition: input.initialPinPosition,
    pointerStart: input.pointerStart,
    grabOffset: {
      x: input.pointerWorldPoint.x - input.startPoint.x,
      y: input.pointerWorldPoint.y - input.startPoint.y
    },
    previousCameraPanning: input.previousCameraPanning,
    moved: false
  };
}

export function moveSigmaGlobalNodeDragSession(
  drag: SigmaGlobalNodeDragSession,
  screenPoint: GraphScreenPoint,
  pointerWorldPoint: { x: number; y: number }
): void {
  if (!drag.moved) {
    const dx = screenPoint.x - drag.pointerStart.x;
    const dy = screenPoint.y - drag.pointerStart.y;
    drag.moved = Math.hypot(dx, dy) >= SIGMA_GLOBAL_NODE_DRAG_START_THRESHOLD;
  }
  drag.currentPoint = {
    x: pointerWorldPoint.x - drag.grabOffset.x,
    y: pointerWorldPoint.y - drag.grabOffset.y
  };
}

export function sigmaAdapterDataWithNodePoint(
  adapterData: GraphRendererAdapterData,
  nodeId: string,
  point: { x: number; y: number },
  pinned: boolean,
  pinPosition: PinPosition | null
): GraphRendererAdapterData {
  let changed = false;
  const nodes = adapterData.nodes.map((node) => {
    if (node.id !== nodeId) return node;
    changed = true;
    return sigmaAdapterNodeWithPoint(node, point, pinned, pinPosition);
  });
  if (!changed) return adapterData;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const pinnedNodeIds = new Set(nodes.filter((node) => node.pinHint.pinned).map((node) => node.id));
  const pinHintsForNodeIds = (nodeIds: readonly string[]) => nodeIds
    .map((id) => nodeById.get(id)?.pinHint)
    .filter((hint): hint is GraphRendererAdapterNode["pinHint"] => Boolean(hint?.pinned));

  return {
    ...adapterData,
    nodes,
    communities: adapterData.communities.map((community) => ({
      ...community,
      pinHints: community.pinHints.some((hint) => hint.nodeId === nodeId) || pinned
        ? pinHintsForNodeIds(community.nodeIds)
        : community.pinHints
    })),
    aggregations: adapterData.aggregations.map((aggregation) => ({
      ...aggregation,
      pinnedNodeIds: aggregation.nodeIds.filter((id) => pinnedNodeIds.has(id)),
      pinHints: pinHintsForNodeIds(aggregation.nodeIds)
    })),
    renderable: {
      ...adapterData.renderable,
      nodes: adapterData.renderable.nodes.map((node) => (
        node.id === nodeId
          ? { ...node, x: point.x, y: point.y, point: { x: point.x, y: point.y } }
          : node
      )),
      aggregationContainers: adapterData.renderable.aggregationContainers.map((aggregation) => ({
        ...aggregation,
        pinnedNodeIds: aggregation.nodeIds.filter((id) => pinnedNodeIds.has(id)),
        pinHints: pinHintsForNodeIds(aggregation.nodeIds),
        pinnedCount: aggregation.nodeIds.filter((id) => pinnedNodeIds.has(id)).length
      }))
    }
  };
}

export function bindSigmaGlobalOverlayPointerDrag(input: {
  ownerDocument: Document;
  element: HTMLElement;
  nodeId: string;
  pointerId: number;
  isActive: (nodeId: string) => boolean;
  screenPointFromEvent: (event: PointerEvent) => GraphScreenPoint;
  onMove: (point: GraphScreenPoint, event: PointerEvent) => void;
  onEnd: (point: GraphScreenPoint, event: PointerEvent) => void;
  onCancel: () => void;
}): () => void {
  input.element.setPointerCapture?.(input.pointerId);
  const move = (event: PointerEvent): void => {
    if (event.pointerId !== input.pointerId || !input.isActive(input.nodeId)) return;
    event.preventDefault();
    event.stopPropagation();
    input.onMove(input.screenPointFromEvent(event), event);
  };
  const up = (event: PointerEvent): void => {
    if (event.pointerId !== input.pointerId || !input.isActive(input.nodeId)) return;
    event.preventDefault();
    event.stopPropagation();
    input.element.releasePointerCapture?.(input.pointerId);
    input.onEnd(input.screenPointFromEvent(event), event);
  };
  const cancel = (event: PointerEvent): void => {
    if (event.pointerId !== input.pointerId || !input.isActive(input.nodeId)) return;
    event.preventDefault();
    event.stopPropagation();
    input.element.releasePointerCapture?.(input.pointerId);
    input.onCancel();
  };
  input.ownerDocument.addEventListener("pointermove", move, true);
  input.ownerDocument.addEventListener("pointerup", up, true);
  input.ownerDocument.addEventListener("pointercancel", cancel, true);
  return () => {
    input.ownerDocument.removeEventListener("pointermove", move, true);
    input.ownerDocument.removeEventListener("pointerup", up, true);
    input.ownerDocument.removeEventListener("pointercancel", cancel, true);
  };
}

export function bindSigmaGlobalOverlayMouseDrag(input: {
  ownerDocument: Document;
  nodeId: string;
  isActive: (nodeId: string) => boolean;
  screenPointFromEvent: (event: MouseEvent) => GraphScreenPoint;
  onMove: (point: GraphScreenPoint, event: MouseEvent) => void;
  onEnd: (point: GraphScreenPoint, event: MouseEvent) => void;
}): () => void {
  const move = (event: MouseEvent): void => {
    if (!input.isActive(input.nodeId)) return;
    event.preventDefault();
    event.stopPropagation();
    input.onMove(input.screenPointFromEvent(event), event);
  };
  const up = (event: MouseEvent): void => {
    if (!input.isActive(input.nodeId)) return;
    event.preventDefault();
    event.stopPropagation();
    input.onEnd(input.screenPointFromEvent(event), event);
  };
  input.ownerDocument.addEventListener("mousemove", move, true);
  input.ownerDocument.addEventListener("mouseup", up, true);
  return () => {
    input.ownerDocument.removeEventListener("mousemove", move, true);
    input.ownerDocument.removeEventListener("mouseup", up, true);
  };
}

function sigmaAdapterNodeWithPoint(
  node: GraphRendererAdapterNode,
  point: { x: number; y: number },
  pinned: boolean,
  pinPosition: PinPosition | null
): GraphRendererAdapterNode {
  return {
    ...node,
    point: { x: point.x, y: point.y },
    pinHint: {
      ...node.pinHint,
      pinned,
      position: pinned ? (pinPosition ?? { x: point.x, y: point.y, coordinateSpace: "world" }) : null
    }
  };
}

export function sigmaCommunityLabels(adapterData: GraphRendererAdapterData, limit: number): GraphRendererAdapterData["renderable"]["communities"] {
  const selectedCommunityIds = new Set(adapterData.communities.filter((community) => community.selected).map((community) => community.id));
  return adapterData.renderable.communities
    .filter((community) => community.wash)
    .map((community, index) => ({
      community,
      index,
      selected: selectedCommunityIds.has(community.id)
    }))
    .sort((left, right) => {
      if (left.selected !== right.selected) return left.selected ? -1 : 1;
      if (left.community.nodeCount !== right.community.nodeCount) return right.community.nodeCount - left.community.nodeCount;
      return left.index - right.index;
    })
    .slice(0, limit)
    .map((candidate) => candidate.community);
}

export function gestureTargetFromSigmaRenderedObject(
  object: SigmaGlobalRenderedObject,
  adapterData: GraphRendererAdapterData
): GraphGestureTarget | null {
  switch (object.kind) {
    case "node":
      return adapterData.nodes.some((node) => node.id === object.id) ? { kind: "node", id: object.id } : null;
    case "edge":
      return adapterData.edges.some((edge) => edge.id === object.id) ? { kind: "edge", id: object.id } : null;
    case "community-wash":
      return adapterData.communities.some((community) => community.id === object.id) ? { kind: "community-wash", id: object.id } : null;
    case "aggregation-container": {
      const aggregation = adapterData.aggregations.find((item) => item.id === object.id);
      if (!aggregation) return null;
      return { kind: "aggregation-container", id: object.id, communityId: object.communityId ?? aggregation.communityId };
    }
    default:
      return null;
  }
}

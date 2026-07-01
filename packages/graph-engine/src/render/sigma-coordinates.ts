import { rootClientPointToScreenPoint, screenPointToWorldPoint, worldPointToCssPercentPoint, type GraphScreenPoint } from "./geometry";
import { DEFAULT_RENDERER_VIEWPORT } from "./viewport";
import type {
  SigmaGlobalCameraState,
  SigmaGlobalRendererCreateOptions,
  SigmaGlobalSigmaLike
} from "./sigma-global-types";

export function overlayPointerScreenPoint(event: MouseEvent | PointerEvent, root: HTMLElement): GraphScreenPoint {
  return rootClientPointToScreenPoint({
    x: event.clientX,
    y: event.clientY
  }, root.getBoundingClientRect());
}

export function sigmaScreenPointToWorldPoint(
  sigma: SigmaGlobalSigmaLike,
  point: GraphScreenPoint,
  options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
): { x: number; y: number } {
  const projected = sigma.viewportToGraph?.(point);
  if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
    return projected;
  }
  return screenPointToWorldPoint(
    point,
    options.viewport ?? DEFAULT_RENDERER_VIEWPORT,
    options.viewportSize ?? { width: 1, height: 1 },
    options.adapterData.renderable.worldBounds
  );
}

export function sigmaWorldPointToScreenPoint(
  sigma: SigmaGlobalSigmaLike,
  point: { x: number; y: number },
  options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
): GraphScreenPoint {
  const projected = sigma.graphToViewport?.(point);
  if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
    return projected;
  }
  const percent = worldPointToCssPercentPoint(point, options.adapterData.renderable.worldBounds);
  const size = options.viewportSize ?? { width: 1, height: 1 };
  return {
    x: (percent.x / 100) * size.width,
    y: (percent.y / 100) * size.height
  };
}

export function sigmaWorldPointToScreenPointForCameraState(
  sigma: SigmaGlobalSigmaLike,
  point: { x: number; y: number },
  cameraState: SigmaGlobalCameraState,
  options: Pick<SigmaGlobalRendererCreateOptions, "viewport" | "viewportSize" | "adapterData">
): GraphScreenPoint {
  const projected = sigma.graphToViewport?.(point, { cameraState });
  if (projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)) {
    return projected;
  }
  return sigmaWorldPointToScreenPoint(sigma, point, options);
}

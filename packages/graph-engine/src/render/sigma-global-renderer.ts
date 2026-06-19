import type { ThemeId } from "../types";
import type { GraphRendererAdapterData } from "./adapter";
import type { GraphRendererSurface } from "./renderer-surface";

export const SIGMA_GLOBAL_RENDERER_ID = "sigma-global" as const;

export const SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER = "facade" as const;

export const SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY = {
  sigma: "runtime-loaded-by-sigma-global-renderer",
  graphology: "runtime-loaded-by-sigma-global-renderer",
  workbench: "loads through the graph-engine ESM Sigma runtime boundary when global route manager selects Sigma",
  offlineHtml: "loads through the graph-engine IIFE Sigma runtime boundary when offline global route manager selects Sigma"
} as const;

export interface SigmaGlobalRendererRuntimeBoundary {
  Sigma: typeof import("sigma").default;
  GraphologyGraph: typeof import("graphology").default;
}

export interface SigmaGlobalRendererCreateOptions {
  container: HTMLElement;
  surface: GraphRendererSurface;
  adapterData: GraphRendererAdapterData;
  theme: ThemeId;
  onFatalError?: (error: unknown) => void;
}

export interface SigmaGlobalRendererUpdateOptions {
  adapterData: GraphRendererAdapterData;
  theme?: ThemeId;
}

export interface SigmaGlobalRenderer {
  readonly id: typeof SIGMA_GLOBAL_RENDERER_ID;
  update(options: SigmaGlobalRendererUpdateOptions): void;
  destroy(): void;
}

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

export function createSigmaGlobalRenderer(_options: SigmaGlobalRendererCreateOptions): SigmaGlobalRenderer {
  throw new Error("Sigma global renderer lifecycle is established in Task 3.4 after adapter and hit projection work land.");
}

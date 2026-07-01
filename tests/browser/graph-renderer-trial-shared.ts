import type { LargeGraphFixtureId, LargeGraphFixtureMetadata } from "../../packages/graph-engine/test/large-graph-fixtures";

export const FULL_TRIAL_SHAPES: LargeGraphFixtureId[] = [
  "real-snapshot-proxy",
  "nodes-1000-sparse",
  "nodes-1000-dense",
  "nodes-1000-many-communities",
  "nodes-5000-sparse",
  "nodes-5000-dense",
  "nodes-10000-aggregation",
  "nodes-10000-high-edge",
  "oversized-community",
  "many-small-communities",
  "many-search-hits",
  "many-pin-nodes"
];

export const REQUIRED_TRIAL_ACTIONS = [
  "initial_render",
  "wheel_zoom",
  "drag",
  "search_highlight",
  "point_select",
  "container_select",
  "spotlight_animation",
  "drawer_open",
  "enter_community",
  "return_global",
  "repeated_search_community_drawer_cycles"
] as const;

export type TrialAction = typeof REQUIRED_TRIAL_ACTIONS[number];

// Actions where fps + frame p95 are hard gates. Spotlight records those metrics
// too, but gates on mid-animation visual following because click/rebuild timing is noisy.
export const FRAME_SAMPLED_ACTIONS = new Set<string>(["wheel_zoom", "drag"]);
// Actions where wall-clock duration has an upper bound per the hard-gate table.
export const DURATION_GATED_ACTIONS = new Set<string>([
  "initial_render",
  "search_highlight",
  "drawer_open",
  "return_global"
]);
// The memory-gated repeated-cycle action.
export const MEMORY_GATED_ACTION = "repeated_search_community_drawer_cycles";

export const TRIAL_SCHEMA_VERSION = "1.0.0";

// Hard-gate table from the plan. fps and frame p95 are uniform across scales;
// duration and memory ceilings scale with node count.
export const FPS_FLOOR = 45;
export const FRAME_P95_CEILING_MS = 22.3;

export interface TrialRecordLike {
  graph_shape: string;
  action: string;
  pass: boolean;
  nodes?: number | null;
  fps?: number | null;
  frame_p95_ms?: number | null;
  duration_ms?: number | null;
  memory_growth_mb?: number | null;
  failure_class: string | null;
  failure_detail?: string | null;
  schema_version?: string;
  production_path?: boolean;
  thresholds?: Record<string, number> | null;
  browser?: string | null;
  build_commit?: string | null;
  run_started_at?: string | null;
  run_finished_at?: string | null;
}

export function parseRequestedShapes(value: string | undefined): LargeGraphFixtureId[] {
  return (value || FULL_TRIAL_SHAPES.join(","))
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean) as LargeGraphFixtureId[];
}

export async function waitForAnimationFrames(page: PageLike, count = 2): Promise<void> {
  await page.evaluate((frameCount: number) => new Promise<void>((resolve) => {
    let remaining = Math.max(1, frameCount);
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), count);
}

export async function waitForAfterDrawing(page: PageLike): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const trial = (window as any).__visTrial;
    if (!trial?.network?.once) {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      return;
    }
    let finished = false;
    const timeout = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("vis-network afterDrawing did not fire after action"));
    }, 2500);
    const finish = () => requestAnimationFrame(() => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      resolve();
    });
    trial.network.once("afterDrawing", finish);
    trial.network.redraw();
  }));
}

export function memoryGrowthLimitMb(metadata: LargeGraphFixtureMetadata): number {
  if (metadata.nodes >= 10000) return 100;
  if (metadata.nodes >= 5000) return 75;
  return 50;
}

export function memoryGrowthFailureClass(memoryGrowthMb: number | null, metadata: LargeGraphFixtureMetadata): string | null {
  if (memoryGrowthMb == null) return null;
  return memoryGrowthMb <= memoryGrowthLimitMb(metadata) ? null : "memory_growth_above_floor";
}

export function memoryGrowthFailureDetail(memoryGrowthMb: number | null, metadata: LargeGraphFixtureMetadata): string | null {
  if (memoryGrowthMb == null) return "memory_growth_unavailable";
  const limit = memoryGrowthLimitMb(metadata);
  return memoryGrowthMb <= limit ? null : `memory_growth_mb=${memoryGrowthMb}; limit_mb=${limit}`;
}

export function initialRenderLimitMs(metadata: LargeGraphFixtureMetadata): number {
  if (metadata.nodes >= 10000) return 2000;
  if (metadata.nodes >= 5000) return 1200;
  return 500;
}

export function searchHighlightLimitMs(metadata: LargeGraphFixtureMetadata): number {
  if (metadata.nodes >= 10000) return 700;
  if (metadata.nodes >= 5000) return 400;
  return 200;
}

export function drawerOpenLimitMs(metadata: LargeGraphFixtureMetadata): number {
  if (metadata.nodes >= 10000) return 500;
  if (metadata.nodes >= 5000) return 400;
  return 200;
}

export function returnGlobalLimitMs(metadata: LargeGraphFixtureMetadata): number {
  if (metadata.nodes >= 10000) return 800;
  if (metadata.nodes >= 5000) return 500;
  return 250;
}

export function durationLimitMs(metadata: LargeGraphFixtureMetadata, action: string): number | null {
  switch (action) {
    case "initial_render":
      return initialRenderLimitMs(metadata);
    case "search_highlight":
      return searchHighlightLimitMs(metadata);
    case "drawer_open":
      return drawerOpenLimitMs(metadata);
    case "return_global":
      return returnGlobalLimitMs(metadata);
    default:
      return null;
  }
}

// Build the per-action thresholds object the schema requires. It records the
// fps, frame p95, duration and memory ceilings actually applied so reviewers
// can audit each record without re-deriving them from node count.
export function actionThresholds(metadata: LargeGraphFixtureMetadata, action: string): Record<string, number> {
  const thresholds: Record<string, number> = {
    fps_floor: FPS_FLOOR,
    frame_p95_ms_ceiling: FRAME_P95_CEILING_MS
  };
  const duration = durationLimitMs(metadata, action);
  if (duration != null) thresholds.duration_ms_ceiling = duration;
  thresholds.memory_growth_mb_ceiling = memoryGrowthLimitMb(metadata);
  return thresholds;
}

// esbuild (used by tsx with keepNames:true) wraps named functions in a __name
// helper. When such a function is serialized into the browser via page.evaluate
// the helper is undefined there. Shim it to a no-op on each page so the
// serialized arrow functions resolve. Applied through addInitScript-equivalent.
export const NAME_HELPER_INIT_SCRIPT = "window.__name = typeof window.__name === 'function' ? window.__name : function (fn) { return fn; };";

// Judge a frame-sampled action (wheel/drag). Returns a failure_class string when
// the mandatory fps / frame-p95 metrics breach the hard gate, or null when clean.
export function frameSampleFailureClass(
  record: { fps?: number | null; frame_p95_ms?: number | null }
): string | null {
  if (record.fps == null) return "fps_missing";
  if (record.frame_p95_ms == null) return "frame_p95_missing";
  if (record.fps < FPS_FLOOR) return "fps_below_floor";
  if (record.frame_p95_ms > FRAME_P95_CEILING_MS) return "frame_p95_above_ceiling";
  return null;
}

// Judge a duration-gated action. Null metrics fail; over-budget durations fail.
export function durationFailureClass(
  record: { duration_ms?: number | null },
  metadata: LargeGraphFixtureMetadata,
  action: string
): string | null {
  if (record.duration_ms == null) return "duration_missing";
  const limit = durationLimitMs(metadata, action);
  if (limit != null && record.duration_ms > limit) return "duration_above_ceiling";
  return null;
}

export function validateTrialResults(input: {
  renderer: string;
  requestedShapes: readonly string[];
  requiredActions?: readonly string[];
  // Default true: enforce the hard-gate schema (schema_version, thresholds,
  // browser, build_commit, run timestamps) and frame/duration mandatory metrics.
  // Sibling trials that have not yet been upgraded opt out with requireSchema:false.
  requireSchema?: boolean;
  records: readonly TrialRecordLike[];
  errors: readonly string[];
  resultPath: string;
}): void {
  const requiredActions = input.requiredActions ?? REQUIRED_TRIAL_ACTIONS;
  const requiredActionSet = new Set(requiredActions);
  const hasFocusedActions = Boolean(input.requiredActions);
  const requireSchema = input.requireSchema !== false;
  const failures: string[] = [];

  for (const error of input.errors) {
    failures.push(`error: ${error}`);
  }

  for (const shape of input.requestedShapes) {
    const shapeRecords = input.records.filter((record) => record.graph_shape === shape);
    if (!shapeRecords.length) {
      failures.push(`${shape}: no records`);
      continue;
    }
    for (const action of requiredActions) {
      if (!shapeRecords.some((record) => record.action === action)) {
        failures.push(`${shape}: missing action ${action}`);
      }
    }
  }

  if (requireSchema) for (const record of input.records) {
    const shapeAction = `${record.graph_shape}/${record.action}`;
    const shouldGateAction = !hasFocusedActions || requiredActionSet.has(record.action);
    // Schema completeness: every record must carry the documented fields.
    if (!record.schema_version) failures.push(`${shapeAction}: missing schema_version`);
    if (typeof record.production_path !== "boolean") failures.push(`${shapeAction}: missing production_path`);
    if (!record.thresholds) failures.push(`${shapeAction}: missing thresholds`);
    if (!record.browser) failures.push(`${shapeAction}: missing browser`);
    if (!record.build_commit) failures.push(`${shapeAction}: missing build_commit`);
    if (!record.run_started_at) failures.push(`${shapeAction}: missing run_started_at`);
    if (!record.run_finished_at) failures.push(`${shapeAction}: missing run_finished_at`);

    // Mandatory-metric gates: a null or not-run value on a mandatory metric
    // blocks pass (the artifact is treated as incomplete), per the hard gate.
    if (shouldGateAction && FRAME_SAMPLED_ACTIONS.has(record.action)) {
      const frameFailure = frameSampleFailureClass(record);
      if (frameFailure) failures.push(`${shapeAction}: ${frameFailure}; fps=${record.fps ?? "null"}; frame_p95_ms=${record.frame_p95_ms ?? "null"}`);
    }
    if (shouldGateAction && DURATION_GATED_ACTIONS.has(record.action)) {
      const metadata = { nodes: typeof record.nodes === "number" ? record.nodes : 0 };
      const durationFailure = durationFailureClass(record, metadata, record.action);
      if (durationFailure) failures.push(`${shapeAction}: ${durationFailure}; duration_ms=${record.duration_ms ?? "null"}`);
    }
    if (shouldGateAction && record.action === MEMORY_GATED_ACTION && record.memory_growth_mb == null) {
      failures.push(`${shapeAction}: memory_growth_missing`);
    }
  }

  for (const record of input.records) {
    if (hasFocusedActions && !requiredActionSet.has(record.action)) continue;
    if (record.pass === false || record.failure_class) {
      failures.push(`${record.graph_shape}/${record.action}: pass=${record.pass}; failure=${record.failure_class ?? "none"}; detail=${record.failure_detail ?? "none"}`);
    }
  }

  if (failures.length) {
    throw new Error(`${input.renderer} trial failed validation (${failures.length} issue(s)). result=${input.resultPath}\n${failures.slice(0, 40).join("\n")}`);
  }
}


interface PageLike {
  evaluate<T>(fn: Function | string, arg?: unknown): Promise<T>;
}

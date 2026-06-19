#!/usr/bin/env node
import fs from "node:fs";

const resultPath = process.argv[2];
if (!resultPath) {
  console.error("Usage: validate-graph-trial-result.mjs <result-json>");
  process.exit(2);
}

const requiredActions = [
  "initial_render",
  "wheel_zoom",
  "drag",
  "search_highlight",
  "point_select",
  "container_select",
  "drawer_open",
  "enter_community",
  "return_global",
  "repeated_search_community_drawer_cycles"
];

// Actions where fps + frame p95 are mandatory (wheel/drag), and the hard gates.
const FRAME_SAMPLED_ACTIONS = new Set(["wheel_zoom", "drag"]);
const FPS_FLOOR = 45;
const FRAME_P95_CEILING_MS = 22.3;
const DURATION_GATED_ACTIONS = new Set(["initial_render", "search_highlight", "drawer_open", "return_global"]);
const MEMORY_GATED_ACTION = "repeated_search_community_drawer_cycles";

const data = JSON.parse(fs.readFileSync(resultPath, "utf8"));
const records = Array.isArray(data.records) ? data.records : [];
const shapes = Array.isArray(data.shapes) ? data.shapes : [];
const errors = Array.isArray(data.errors) ? data.errors : [];
const requireProductionPath = data.production_path === true || String(data.renderer || "").includes("production");
const failures = [];

for (const error of errors) {
  failures.push(`error: ${error}`);
}

for (const shape of shapes) {
  const shapeRecords = records.filter((record) => record.graph_shape === shape);
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

for (const record of records) {
  const shapeAction = `${record.graph_shape}/${record.action}`;
  if (!record.schema_version) failures.push(`${shapeAction}: missing schema_version`);
  if (typeof record.production_path !== "boolean") failures.push(`${shapeAction}: missing production_path`);
  else if (requireProductionPath && record.production_path !== true) failures.push(`${shapeAction}: production_path_not_true`);
  if (!record.thresholds) failures.push(`${shapeAction}: missing thresholds`);
  if (!record.browser) failures.push(`${shapeAction}: missing browser`);
  if (!record.build_commit) failures.push(`${shapeAction}: missing build_commit`);
  if (!record.run_started_at) failures.push(`${shapeAction}: missing run_started_at`);
  if (!record.run_finished_at) failures.push(`${shapeAction}: missing run_finished_at`);
  if (FRAME_SAMPLED_ACTIONS.has(record.action)) {
    if (record.fps == null) failures.push(`${shapeAction}: fps_missing`);
    else if (record.fps < FPS_FLOOR) failures.push(`${shapeAction}: fps_below_floor; fps=${record.fps}; floor=${FPS_FLOOR}`);
    if (record.frame_p95_ms == null) failures.push(`${shapeAction}: frame_p95_missing`);
    else if (record.frame_p95_ms > FRAME_P95_CEILING_MS) failures.push(`${shapeAction}: frame_p95_above_ceiling; frame_p95_ms=${record.frame_p95_ms}; ceiling=${FRAME_P95_CEILING_MS}`);
  }
  if (DURATION_GATED_ACTIONS.has(record.action)) {
    const limit = durationLimitMs(record);
    if (record.duration_ms == null) failures.push(`${shapeAction}: duration_missing`);
    else if (record.duration_ms > limit) failures.push(`${shapeAction}: duration_above_ceiling; duration_ms=${record.duration_ms}; ceiling=${limit}`);
  }
  if (record.action === MEMORY_GATED_ACTION) {
    const limit = memoryGrowthLimitMb(record);
    if (record.memory_growth_mb == null) failures.push(`${shapeAction}: memory_growth_missing`);
    else if (record.memory_growth_mb > limit) failures.push(`${shapeAction}: memory_growth_above_ceiling; memory_growth_mb=${record.memory_growth_mb}; ceiling=${limit}`);
  }
  if (requireProductionPath && record.action === "initial_render" && Number(record.nodes) >= 10000) {
    if (record.loading_state_seen_at_ms == null) failures.push(`${shapeAction}: loading_state_seen_missing`);
    else if (record.loading_state_seen_at_ms > 250) failures.push(`${shapeAction}: loading_state_late; loading_state_seen_at_ms=${record.loading_state_seen_at_ms}; ceiling=250`);
  }
  if (requireProductionPath && (!record.loading_state || record.loading_state === "not-run")) failures.push(`${shapeAction}: loading_state_missing`);
  if (requireProductionPath && !allowsNonSigmaRouteForAction(record.action)) {
    if ((Number(record.sigma_canvas_count) || 0) < 1) {
      failures.push(`${shapeAction}: sigma_canvas_missing`);
    }
    if (record.sigma_canvas_nonblank !== true && record.sigma_visible_signal !== true) {
      failures.push(`${shapeAction}: sigma_canvas_blank; nonblank=${String(record.sigma_canvas_nonblank)}; visible_signal=${String(record.sigma_visible_signal)}`);
    }
  }
}

for (const record of records) {
  if (record.pass === false || record.failure_class) {
    failures.push(`${record.graph_shape}/${record.action}: pass=${record.pass}; failure=${record.failure_class || "none"}; detail=${record.failure_detail || "none"}`);
  }
}

if (failures.length) {
  console.error(`FAIL: graph trial result validation found ${failures.length} issue(s) in ${resultPath}`);
  for (const failure of failures.slice(0, 30)) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS: graph trial result validation (${records.length} records, ${shapes.length} shapes)`);

function durationLimitMs(record) {
  if (record.thresholds && typeof record.thresholds.duration_ms_ceiling === "number") {
    return record.thresholds.duration_ms_ceiling;
  }
  const nodes = Number(record.nodes) || 0;
  if (record.action === "initial_render") {
    if (nodes >= 10000) return 2000;
    if (nodes >= 5000) return 1200;
    return 500;
  }
  if (record.action === "search_highlight") {
    if (nodes >= 10000) return 700;
    if (nodes >= 5000) return 400;
    return 200;
  }
  if (record.action === "drawer_open") {
    if (nodes >= 10000) return 500;
    if (nodes >= 5000) return 400;
    return 200;
  }
  if (record.action === "return_global") {
    if (nodes >= 10000) return 800;
    if (nodes >= 5000) return 500;
    return 250;
  }
  return Number.POSITIVE_INFINITY;
}

function memoryGrowthLimitMb(record) {
  if (record.thresholds && typeof record.thresholds.memory_growth_mb_ceiling === "number") {
    return record.thresholds.memory_growth_mb_ceiling;
  }
  const nodes = Number(record.nodes) || 0;
  if (nodes >= 10000) return 100;
  if (nodes >= 5000) return 75;
  return 50;
}

function allowsNonSigmaRouteForAction(action) {
  return action === "enter_community";
}

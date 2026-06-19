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

const data = JSON.parse(fs.readFileSync(resultPath, "utf8"));
const records = Array.isArray(data.records) ? data.records : [];
const shapes = Array.isArray(data.shapes) ? data.shapes : [];
const errors = Array.isArray(data.errors) ? data.errors : [];
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

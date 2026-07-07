import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  DURATION_GATED_ACTIONS,
  durationLimitMs,
  validateTrialResults,
  type TrialRecordLike
} from "./graph-renderer-trial-shared";

describe("graph renderer browser trial gates", () => {
  it("standalone artifact validator requires return_global_takeover records", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "llm-wiki-trial-validator-"));
    const resultPath = path.join(tmpDir, "result.json");
    const actions = [
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
    ];
    const records = actions.map((action) => ({
      graph_shape: "shape",
      action,
      pass: true,
      nodes: 1000,
      fps: 60,
      frame_p95_ms: 12,
      duration_ms: 10,
      memory_growth_mb: 1,
      failure_class: null,
      schema_version: "1.0.0",
      production_path: false,
      thresholds: {
        fps_floor: 45,
        frame_p95_ms_ceiling: 22.3,
        duration_ms_ceiling: 100,
        memory_growth_mb_ceiling: 50
      },
      browser: "chromium",
      build_commit: "test",
      run_started_at: "2026-07-06T00:00:00.000Z",
      run_finished_at: "2026-07-06T00:00:01.000Z"
    }));
    try {
      fs.writeFileSync(resultPath, `${JSON.stringify({
        schema_version: "1.0.0",
        renderer: "test",
        production_path: false,
        shapes: ["shape"],
        requested_actions: null,
        records,
        errors: []
      }, null, 2)}\n`);

      const result = spawnSync("node", ["tests/browser/validate-graph-trial-result.mjs", resultPath], {
        cwd: path.resolve(import.meta.dirname, "../.."),
        encoding: "utf8"
      });

      assert.notEqual(result.status, 0, result.stdout);
      assert.match(result.stderr, /missing action return_global_takeover/);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("duration-gates return_global_takeover records", () => {
    assert.equal(DURATION_GATED_ACTIONS.has("return_global_takeover"), true);
    assert.equal(durationLimitMs({ nodes: 1000 }, "return_global_takeover") != null, true);

    const record: TrialRecordLike = {
      graph_shape: "shape",
      action: "return_global_takeover",
      pass: true,
      nodes: 1000,
      duration_ms: null,
      failure_class: null,
      schema_version: "1.0.0",
      production_path: true,
      thresholds: {},
      browser: "chromium",
      build_commit: "test",
      run_started_at: "2026-07-06T00:00:00.000Z",
      run_finished_at: "2026-07-06T00:00:01.000Z"
    };

    assert.throws(
      () => validateTrialResults({
        renderer: "sigma-global-production",
        requestedShapes: ["shape"],
        requiredActions: ["return_global_takeover"],
        records: [record],
        errors: [],
        resultPath: "/tmp/result.json"
      }),
      /duration_missing/
    );
  });
});

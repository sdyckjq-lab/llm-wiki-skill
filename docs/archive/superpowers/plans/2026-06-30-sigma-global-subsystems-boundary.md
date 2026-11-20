# Sigma Global Subsystems Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seal the Sigma global route subsystem boundaries from #79 with documentation, automated guard tests, and cleanup of test-only internal re-exports.

**Architecture:** Keep `createSigmaGlobalRenderer` as the Sigma global lifecycle entrypoint. Internal modules stay directly importable for focused tests, but the renderer entrypoint stops re-exporting Graphology model and hit-projector helpers. Boundary tests enforce dependency direction, export surface, host-callback ownership, and test import discipline.

**Tech Stack:** TypeScript ESM, Node `node:test`, Graphology, Sigma, existing graph-engine fake runtime tests, Markdown project docs.

## Boundary Map

```text
facade / web route
  owns selection, drawer, host callbacks, route decisions
        |
        v
sigma-global-renderer.ts
  owns Sigma lifecycle, state wiring, update/destroy/reset, error reporting
        |
        +--> sigma-graphology-model.ts      Graphology model + patch rules
        +--> sigma-hit-projector.ts         hit target translation
        +--> sigma-global-camera.ts         camera state + spotlight framing
        +--> sigma-wheel-zoom.ts            wheel event adapter
        +--> sigma-overlay-dom.ts           overlay DOM structure + positioning
        +--> sigma-global-drag.ts           node drag session + pin handoff
        +--> community-cloud-geometry.ts    cloud hull/signature geometry
        +--> sigma-coordinates.ts           Sigma/fallback coordinate math
        +--> sigma-zoom.ts                  zoom math
        +--> sigma-overlay-svg.ts           low-level SVG/DOM factories
        +--> sigma-events.ts                defensive event payload helpers
        +--> sigma-global-types.ts          shared type-only boundary

Forbidden directions:
  internal helpers ---> sigma-global-renderer.ts
  internal helpers ---> render/index.ts public barrel
  internal helpers ---> facade/web host callbacks
  sigma-global-renderer.ts ---> re-exporting internal helper APIs
```

---

## Scope Check

This plan implements only #79:

- It documents and guards Sigma global subsystem boundaries.
- It does not implement #75 performance work.
- It does not change user-visible graph behavior.
- It does not split `sigma-global-renderer.ts` again.
- It does not change the graph route model, drawer model, or community view.

The spec covers one bounded route-hardening effort. It touches tests, internal exports, and product docs, but these are coupled parts of the same boundary contract rather than independent products.

## File Structure

### Create

- `docs/superpowers/plans/2026-06-30-sigma-global-subsystems-boundary.md`
  This implementation plan.

### Modify

- `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
  Expands the Sigma boundary contract. It becomes the canonical guard for no helper-to-renderer dependency, no render barrel export drift, no renderer entrypoint re-export of internal helpers, no renderer test importing internals through the renderer, and no host callback names inside internal Sigma modules.

- `packages/graph-engine/test/sigma-global-renderer.test.ts`
  Keeps lifecycle and integration coverage, but imports Graphology model helpers and hit projector helpers from their real modules instead of the renderer entrypoint.

- `packages/graph-engine/src/render/sigma-global-renderer.ts`
  Keeps the public lifecycle entrypoint, runtime boundary, stable constants, and public renderer types. Removes test-only re-exports for `buildSigmaGlobalGraphologyGraph`, `sigmaGlobalEdgeStyle`, `createSigmaGlobalHitProjector`, and hit-projector helper types.

- `workbench/PRODUCT.md`
  Corrects the stale Stage 4.8 spotlight status from “planned, not implemented” to “implemented, with #75 remaining as a performance follow-up.”

### Do Not Modify

- `packages/graph-engine/src/render/index.ts`
  It should already keep Sigma internals out of the public render barrel; tests will continue guarding this.

- `packages/graph-engine/src/render/sigma-graphology-model.ts`
  Already owns Graphology model helpers.

- `packages/graph-engine/src/render/sigma-hit-projector.ts`
  Already owns hit projector helpers.

- `packages/graph-engine/src/render/sigma-global-camera.ts`
  No #75 performance behavior in this plan.

- `README.md` and `CHANGELOG.md`
  This plan changes boundaries/tests/docs, not user-visible product behavior or a new feature list item.

## Task 0: Baseline And Branch Check

**Files:**
- Read: `docs/superpowers/specs/2026-06-30-sigma-global-subsystems-boundary-design.md`
- Read: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Read: `packages/graph-engine/test/sigma-global-renderer.test.ts`
- Read: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
- Read: `workbench/PRODUCT.md`

- [ ] **Step 1: Confirm branch**

Run:

```bash
git branch --show-current
git status --short --branch
```

Expected:

```text
codex/fix-sigma-global-boundaries
## codex/fix-sigma-global-boundaries
```

The branch must be `codex/fix-sigma-global-boundaries`. Existing unrelated untracked paths such as `designs/community-drawer-visual-options/`, `designs/pr82-drawer-recovery/`, and `tests/fixtures/graph-interactive-unified-drawer/` may appear; do not stage, edit, or delete them. If this plan-review update is still uncommitted, the plan file may also appear as modified.

- [ ] **Step 2: Confirm the current leak before changing tests**

Run:

```bash
rg -n "export \\{|buildSigmaGlobalGraphologyGraph|createSigmaGlobalHitProjector|sigmaGlobalEdgeStyle" \
  packages/graph-engine/src/render/sigma-global-renderer.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts
```

Expected: output confirms two facts, regardless of exact line numbers:

- `sigma-global-renderer.ts` still re-exports Graphology model or hit-projector helpers.
- `sigma-global-renderer.test.ts` still imports at least one of those helpers through `../src/render/sigma-global-renderer`.

- [ ] **Step 3: Run the existing focused baseline**

Run:

```bash
node --import tsx --test \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts \
  packages/graph-engine/test/renderer-boundary.test.ts \
  packages/graph-engine/test/architecture.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/sigma-graphology-model.test.ts \
  packages/graph-engine/test/sigma-hit-projector.test.ts \
  packages/graph-engine/test/sigma-overlay-dom.test.ts \
  packages/graph-engine/test/sigma-global-camera.test.ts \
  packages/graph-engine/test/sigma-wheel-zoom.test.ts \
  packages/graph-engine/test/sigma-zoom.test.ts \
  packages/graph-engine/test/sigma-coordinates.test.ts \
  packages/graph-engine/test/community-cloud-geometry.test.ts
```

Expected: PASS, with all tests passing. On the current branch this was 142 passing tests before the plan was written.

## Task 1: Strengthen Sigma Boundary Guard Tests

**Files:**
- Modify: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
- Test: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`

- [ ] **Step 1: Replace the boundary test file with the stricter contract**

Replace the entire contents of `packages/graph-engine/test/sigma-refactor-boundaries.test.ts` with:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const renderDir = new URL("../src/render/", import.meta.url);
const testDir = new URL("./", import.meta.url);

const rendererBoundaryExcludedFiles = new Set(["sigma-global-renderer.ts"]);
const sigmaInternalSupportFiles = ["community-cloud-geometry.ts"] as const;
const sigmaInternalModulesWithoutHostCallbacks = [
  "community-cloud-geometry.ts",
  "sigma-coordinates.ts",
  "sigma-events.ts",
  "sigma-global-camera.ts",
  "sigma-global-drag.ts",
  "sigma-graphology-model.ts",
  "sigma-hit-projector.ts",
  "sigma-overlay-dom.ts",
  "sigma-overlay-svg.ts",
  "sigma-wheel-zoom.ts",
  "sigma-zoom.ts"
] as const;
const forbiddenRendererEntrypointExportModules = [
  "sigma-graphology-model",
  "sigma-hit-projector"
] as const;
const forbiddenRendererEntrypointInternalNames = [
  "buildSigmaGlobalGraphologyGraph",
  "sigmaGlobalEdgeStyle",
  "createSigmaGlobalHitProjector",
  "SigmaGlobalEdgeStyle",
  "SigmaGlobalHitInput",
  "SigmaGlobalHitProjector",
  "SigmaGlobalHitProjectorInput",
  "SigmaGlobalRenderedObject"
] as const;
const forbiddenRendererEntrypointImportPattern =
  /import\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+["'][^"']*sigma-global-renderer(?:\.[jt]s)?["']/g;
const forbiddenRendererEntrypointNamespaceImportPattern =
  /import\s+\*\s+as\s+\w+\s+from\s+["'][^"']*sigma-global-renderer(?:\.[jt]s)?["']/;
const rendererEntrypointNamedExportPattern =
  /export\s+(?:type\s+)?\{[\s\S]*?\}(?:\s+from\s+["'][^"']*["'])?/g;
const forbiddenSigmaInternalHostIdentifiers = [
  "GraphEngineCapabilities",
  "GraphFacadeRendererCallbacks",
  "GraphOpenPagePayload",
  "onOpenPage",
  "onSelectionChange",
  "onSelectionClear",
  "onViewReset",
  "onGlobalResetRequested",
  "onVisibilityStateChange",
  "onSelectionInput",
  "onSelectionClearRequested",
  "onNodeOpen",
  "onAsk",
  "persistPins",
  "onPinsChanged",
  "onHitTarget",
  "onDragActiveChange",
  "onDragStateChange",
  "focusCommunity",
  "createGraphWorkbenchCapabilities",
  "createGraphOfflineCapabilities"
] as const;

describe("Sigma global renderer refactor boundaries", () => {
  it("keeps shared helper modules from importing the renderer", async () => {
    for (const file of await sigmaInternalHelperFiles()) {
      const source = await readFile(new URL(`../src/render/${file}`, import.meta.url), "utf8");
      assert.doesNotMatch(source, /from\s+["']\.\/sigma-global-renderer(?:\.[jt]s)?["']/);
    }
  });

  it("keeps Sigma internal helpers out of the render package barrel", async () => {
    const source = await readFile(new URL("../src/render/index.ts", import.meta.url), "utf8");
    for (const file of await sigmaInternalHelperFiles()) {
      const moduleName = file.replace(/\.ts$/, "");
      assert.doesNotMatch(source, new RegExp(`from\\s+["']\\./${moduleName}(?:\\.js)?["']`));
    }
  });

  it("keeps the shared type file type-only", async () => {
    const source = await readFile(new URL("../src/render/sigma-global-types.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /^\s*export\s+(?!type\b|interface\b)/m);
  });

  it("keeps the renderer entrypoint from re-exporting Sigma internal helpers", async () => {
    const source = await readFile(new URL("../src/render/sigma-global-renderer.ts", import.meta.url), "utf8");
    const forbiddenNamePattern = new RegExp(`\\b(?:${forbiddenRendererEntrypointInternalNames.join("|")})\\b`);
    for (const moduleName of forbiddenRendererEntrypointExportModules) {
      const pattern = new RegExp(
        `export\\s+(?:type\\s+)?(?:\\*|\\*\\s+as\\s+\\w+|\\{[\\s\\S]*?\\})\\s+from\\s+["']\\./${moduleName}(?:\\.[jt]s)?["']`
      );
      assert.doesNotMatch(source, pattern);
    }
    for (const match of source.matchAll(rendererEntrypointNamedExportPattern)) {
      assert.doesNotMatch(match[0], forbiddenNamePattern);
    }
  });

  it("keeps graph-engine tests from importing internals through the renderer entrypoint", async () => {
    const violations: string[] = [];
    const forbiddenNamePattern = new RegExp(`\\b(?:${forbiddenRendererEntrypointInternalNames.join("|")})\\b`);
    for (const file of await graphEngineTestFiles()) {
      const source = await readFile(new URL(file, testDir), "utf8");
      if (forbiddenRendererEntrypointNamespaceImportPattern.test(source)) {
        violations.push(`${file}: namespace import from sigma-global-renderer`);
      }
      for (const match of source.matchAll(forbiddenRendererEntrypointImportPattern)) {
        if (forbiddenNamePattern.test(match[0])) {
          violations.push(`${file}: internal helper imported through sigma-global-renderer`);
        }
      }
    }

    assert.deepEqual(violations, []);
  });

  it("keeps Sigma internal modules out of facade, drawer, and host callback ownership", async () => {
    const violations: string[] = [];
    for (const file of sigmaInternalModulesWithoutHostCallbacks) {
      const source = await readFile(new URL(`../src/render/${file}`, import.meta.url), "utf8");
      for (const identifier of forbiddenSigmaInternalHostIdentifiers) {
        if (new RegExp(`\\b${identifier}\\b`).test(source)) violations.push(`${file}: ${identifier}`);
      }
    }

    assert.deepEqual(violations, []);
  });
});

async function sigmaInternalHelperFiles(): Promise<string[]> {
  const entries = await readdir(renderDir);
  return [
    ...entries
      .filter((file) => file.startsWith("sigma-") && file.endsWith(".ts"))
      .filter((file) => !rendererBoundaryExcludedFiles.has(file)),
    ...sigmaInternalSupportFiles
  ].sort();
}

async function graphEngineTestFiles(): Promise<string[]> {
  const entries = await readdir(testDir);
  return entries
    .filter((file) => file.endsWith(".test.ts"))
    .sort();
}
```

- [ ] **Step 2: Run the boundary test and verify it fails for the current leak**

Run:

```bash
node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts
```

Expected: FAIL. The failure must mention at least one of:

```text
keeps the renderer entrypoint from re-exporting Sigma internal helpers
keeps graph-engine tests from importing internals through the renderer entrypoint
```

Do not change production code in this task.

## Task 2: Seal Renderer Internal Re-Exports And Move Test Imports

**Files:**
- Modify: `packages/graph-engine/test/sigma-global-renderer.test.ts`
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts`
- Test: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
- Test: `packages/graph-engine/test/sigma-global-renderer.test.ts`
- Test: `packages/graph-engine/test/sigma-graphology-model.test.ts`
- Test: `packages/graph-engine/test/sigma-hit-projector.test.ts`

- [ ] **Step 1: Move internal helper imports to their real modules**

In `packages/graph-engine/test/sigma-global-renderer.test.ts`, replace the current import block from `../src/render/sigma-global-renderer` with these three imports:

```ts
import {
  SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY,
  SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER,
  createSigmaGlobalRenderer,
  type SigmaGlobalGraphologyGraph,
  type SigmaGlobalRendererRuntime,
  type SigmaGlobalSigmaLike
} from "../src/render/sigma-global-renderer";
import {
  buildSigmaGlobalGraphologyGraph,
  sigmaGlobalEdgeStyle
} from "../src/render/sigma-graphology-model";
import { createSigmaGlobalHitProjector } from "../src/render/sigma-hit-projector";
```

The top of the file should then start like this:

```ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import GraphologyGraph from "graphology";

import {
  SIGMA_GLOBAL_RENDERER_BUNDLE_BOUNDARY,
  SIGMA_GLOBAL_RENDERER_ROUTE_MANAGER_OWNER,
  createSigmaGlobalRenderer,
  type SigmaGlobalGraphologyGraph,
  type SigmaGlobalRendererRuntime,
  type SigmaGlobalSigmaLike
} from "../src/render/sigma-global-renderer";
import {
  buildSigmaGlobalGraphologyGraph,
  sigmaGlobalEdgeStyle
} from "../src/render/sigma-graphology-model";
import { createSigmaGlobalHitProjector } from "../src/render/sigma-hit-projector";
import type {
  GraphRendererAdapterData
} from "../src";
import { buildGraphRendererAdapterData } from "../src";
import type { GraphData } from "../src/types";
```

- [ ] **Step 2: Remove test-only internal re-exports from the renderer entrypoint**

In `packages/graph-engine/src/render/sigma-global-renderer.ts`, delete this block:

```ts
export {
  buildSigmaGlobalGraphologyGraph,
  sigmaGlobalEdgeStyle
} from "./sigma-graphology-model";
export type { SigmaGlobalEdgeStyle } from "./sigma-graphology-model";
export { createSigmaGlobalHitProjector } from "./sigma-hit-projector";
export type {
  SigmaGlobalHitInput,
  SigmaGlobalHitProjector,
  SigmaGlobalHitProjectorInput,
  SigmaGlobalRenderedObject
} from "./sigma-hit-projector";
```

Keep this public type export block intact:

```ts
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
```

Keep the existing imports from `sigma-graphology-model` and `sigma-hit-projector` at the top of the renderer file, because the renderer still uses those helpers internally.

- [ ] **Step 3: Run the focused tests and verify the new guard passes**

Run:

```bash
node --import tsx --test \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/sigma-graphology-model.test.ts \
  packages/graph-engine/test/sigma-hit-projector.test.ts
```

Expected: PASS.

- [ ] **Step 4: Confirm no remaining renderer-entrypoint internal helper imports**

Run:

```bash
node --input-type=module <<'NODE'
import { readFile, readdir } from "node:fs/promises";

const rendererFile = "packages/graph-engine/src/render/sigma-global-renderer.ts";
const testDir = "packages/graph-engine/test";
const forbiddenExportModules = ["sigma-graphology-model", "sigma-hit-projector"];
const forbiddenInternalNames = [
  "buildSigmaGlobalGraphologyGraph",
  "createSigmaGlobalHitProjector",
  "sigmaGlobalEdgeStyle",
  "SigmaGlobalHitProjector",
  "SigmaGlobalHitInput",
  "SigmaGlobalHitProjectorInput",
  "SigmaGlobalRenderedObject",
  "SigmaGlobalEdgeStyle"
];
const forbiddenNamePattern = new RegExp(`\\b(?:${forbiddenInternalNames.join("|")})\\b`);
const rendererEntrypointImportPattern =
  /import\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+["'][^"']*sigma-global-renderer(?:\.[jt]s)?["']/g;
const rendererEntrypointNamespaceImportPattern =
  /import\s+\*\s+as\s+\w+\s+from\s+["'][^"']*sigma-global-renderer(?:\.[jt]s)?["']/;
const rendererEntrypointNamedExportPattern =
  /export\s+(?:type\s+)?\{[\s\S]*?\}(?:\s+from\s+["'][^"']*["'])?/g;

const violations = [];
const rendererSource = await readFile(rendererFile, "utf8");
for (const moduleName of forbiddenExportModules) {
  const exportPattern = new RegExp(
    `export\\s+(?:type\\s+)?(?:\\*|\\*\\s+as\\s+\\w+|\\{[\\s\\S]*?\\})\\s+from\\s+["']\\./${moduleName}(?:\\.[jt]s)?["']`
  );
  if (exportPattern.test(rendererSource)) {
    violations.push(`${rendererFile}: re-exports ${moduleName}`);
  }
}
for (const match of rendererSource.matchAll(rendererEntrypointNamedExportPattern)) {
  if (forbiddenNamePattern.test(match[0])) {
    violations.push(`${rendererFile}: re-exports internal helper ${match[0].replace(/\s+/g, " ")}`);
  }
}

for (const file of (await readdir(testDir)).filter((entry) => entry.endsWith(".test.ts")).sort()) {
  const path = `${testDir}/${file}`;
  const source = await readFile(path, "utf8");
  if (rendererEntrypointNamespaceImportPattern.test(source)) {
    violations.push(`${path}: namespace import from sigma-global-renderer`);
  }
  for (const match of source.matchAll(rendererEntrypointImportPattern)) {
    if (forbiddenNamePattern.test(match[0])) {
      violations.push(`${path}: internal helper imported through sigma-global-renderer`);
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
}
NODE
```

Expected: no output and exit code 0.

- [ ] **Step 5: Commit the boundary guard and export cleanup**

Run:

```bash
git add \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/src/render/sigma-global-renderer.ts
git commit -m "test(graph): seal sigma global internal boundaries"
```

Expected: commit succeeds.

## Task 3: Correct Product Documentation For Implemented Spotlight

**Files:**
- Modify: `workbench/PRODUCT.md`

- [ ] **Step 1: Confirm the stale status exists**

Run:

```bash
rg -n "阶段 4\\.8：图谱演进——全局社区高亮|实现未启动|设计已定，待实现|待实现" workbench/PRODUCT.md
```

Expected: output includes both Stage 4.8 sections with stale “待实现” / “实现未启动” wording.

- [ ] **Step 2: Confirm implementation evidence before marking Stage 4.8 landed**

Run:

```bash
rg -n "sigmaSpotlightCommunityIds|sigmaGlobalNodeSpotlightState|maybeAnimateSigmaCommunitySpotlightCamera|communityDimmed|selectedCommunityIds" \
  packages/graph-engine/src/render \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/sigma-graphology-model.test.ts
```

Expected: output shows current implementation and tests for selected-community spotlight, node dimming, and spotlight camera behavior. Do not rely on a date claim alone.

- [ ] **Step 3: Update the first Stage 4.8 section**

In `workbench/PRODUCT.md`, replace the first Stage 4.8 heading and status block:

```md
### 阶段 4.8：图谱演进——全局社区高亮（spotlight）🚧 设计已定，待实现

**背景**：4.7 把全局图统一成“一张有相机的地图”后，作者实测发现点社区后地图本身几乎没有反馈——用户只能靠右抽屉理解选择，图谱区像静态背景。缺的是“我正在看这个社区”的全局态。

**当前状态**：设计稿 `docs/spark/2026-06-26-global-sigma-community-spotlight-design.md` 已成稿（经两轮审查 + 修订），实现未启动。
```

with:

```md
### 阶段 4.8：图谱演进——全局社区高亮（spotlight）✅ 已落地

**背景**：4.7 把全局图统一成“一张有相机的地图”后，点社区需要地图本身给出“我正在看这个社区”的反馈，而不是只依赖右抽屉解释选择。

**当前状态**：已落地。全局 Sigma 点社区会停留在全局路线并进入社区高亮态，右抽屉继续负责摘要与动作；相机轻量动画也已接入。#75 记录的是后续动画流畅度优化，不影响本阶段功能完成状态。
```

Keep the existing scope bullets after this block, but update the camera bullet from:

```md
- 相机轻量构图动画（平移 + 受限缩放，不重排不重算布局），连点立即打断旧动画。
```

to:

```md
- 相机轻量构图动画（平移 + 受限缩放）；#75 后续优化动画期间 overlay 重排成本。
```

- [ ] **Step 4: Update the summary Stage 4.8 section**

In the later summary section of `workbench/PRODUCT.md`, replace:

```md
### 阶段 4.8：图谱演进——全局社区高亮（spotlight）🚧 设计已定，待实现

**当前状态**：设计稿已成稿（两轮审查 + 修订），实现未启动。点社区在全局高亮、不进入；复用现有 selection（社区）视觉链路补节点弱化 + 相机动画，不复用 `focus`、不新增平行状态。
```

with:

```md
### 阶段 4.8：图谱演进——全局社区高亮（spotlight）✅ 已落地

**当前状态**：已落地。点社区在全局高亮、不进入社区视图；复用现有 selection（社区）视觉链路补节点弱化 + 相机动画，不复用 `focus`、不新增平行状态。#75 继续跟进动画流畅度。
```

- [ ] **Step 5: Verify stale wording is gone from Stage 4.8**

Run:

```bash
rg -n "阶段 4\\.8：图谱演进——全局社区高亮|实现未启动|设计已定，待实现|待实现|#75" workbench/PRODUCT.md
```

Expected: output shows Stage 4.8 headings as completed and references #75 as a follow-up. It must not show “实现未启动” or “设计已定，待实现” for Stage 4.8.

- [ ] **Step 6: Commit the product doc correction**

Run:

```bash
git add workbench/PRODUCT.md
git commit -m "docs: correct sigma spotlight status"
```

Expected: commit succeeds.

## Task 4: Full Targeted Verification

**Files:**
- Verify: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
- Verify: `packages/graph-engine/test/renderer-boundary.test.ts`
- Verify: `packages/graph-engine/test/architecture.test.ts`
- Verify: `packages/graph-engine/test/sigma-global-renderer.test.ts`
- Verify: `packages/graph-engine/test/sigma-graphology-model.test.ts`
- Verify: `packages/graph-engine/test/sigma-hit-projector.test.ts`
- Verify: `packages/graph-engine/test/sigma-overlay-dom.test.ts`
- Verify: `packages/graph-engine/test/sigma-global-camera.test.ts`
- Verify: `packages/graph-engine/test/sigma-wheel-zoom.test.ts`
- Verify: `packages/graph-engine/test/sigma-zoom.test.ts`
- Verify: `packages/graph-engine/test/sigma-coordinates.test.ts`
- Verify: `packages/graph-engine/test/community-cloud-geometry.test.ts`
- Verify: `install.sh`
- Verify: `scripts/`
- Verify: `templates/`
- Verify: `tests/`
- Verify: `SKILL.md`

- [ ] **Step 1: Run the Sigma boundary and module test set**

Run:

```bash
node --import tsx --test \
  packages/graph-engine/test/sigma-refactor-boundaries.test.ts \
  packages/graph-engine/test/renderer-boundary.test.ts \
  packages/graph-engine/test/architecture.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/sigma-graphology-model.test.ts \
  packages/graph-engine/test/sigma-hit-projector.test.ts \
  packages/graph-engine/test/sigma-overlay-dom.test.ts \
  packages/graph-engine/test/sigma-global-camera.test.ts \
  packages/graph-engine/test/sigma-wheel-zoom.test.ts \
  packages/graph-engine/test/sigma-zoom.test.ts \
  packages/graph-engine/test/sigma-coordinates.test.ts \
  packages/graph-engine/test/community-cloud-geometry.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run the graph-engine package tests**

Run:

```bash
npm run test -w @llm-wiki/graph-engine
```

Expected: PASS.

- [ ] **Step 3: Run typecheck because renderer exports changed**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Run install dry-run**

Run:

```bash
bash install.sh --dry-run --platform codex
```

Expected: PASS.

- [ ] **Step 5: Run privacy grep**

Run:

```bash
grep -r '本机用户路径\|真实姓名\|私有素材路径' scripts/ templates/ tests/ SKILL.md
```

Expected: no output and exit code 1. If the shell reports exit code 1 because there were no matches, that is the desired result.

- [ ] **Step 6: Run diff whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 7: Confirm no unrelated untracked files were staged**

Run:

```bash
git status --short --branch
```

Expected: branch is `codex/fix-sigma-global-boundaries`. These unrelated untracked paths may still be present and must remain unstaged:

```text
?? designs/community-drawer-visual-options/
?? designs/pr82-drawer-recovery/
?? tests/fixtures/graph-interactive-unified-drawer/
```

There should be no staged unrelated files. After each implementation commit, any remaining modified file should either be the reviewed plan file itself or an intentional file for the next task.

## Task 5: Prepare PR Notes

**Files:**
- No file changes required unless the implementation process produces a local test report.

- [ ] **Step 1: Summarize the commits**

Run:

```bash
git log --oneline origin/main..HEAD
```

Expected: output includes the existing design/plan commits and the implementation commits:

```text
docs: design sigma global subsystem boundaries
docs: plan sigma global subsystem boundaries
test(graph): seal sigma global internal boundaries
docs: correct sigma spotlight status
```

If the plan-review updates are committed separately, include that docs commit as well.

- [ ] **Step 2: Prepare the PR summary**

Use this PR body:

```md
## Summary
- Documented the Sigma global subsystem boundary and test-layering contract for #79.
- Sealed the renderer entrypoint so Graphology and hit-projector helpers are no longer re-exported through `sigma-global-renderer.ts`.
- Moved existing renderer-test helper imports to the real helper modules without changing user-visible graph behavior.
- Strengthened boundary tests for renderer exports, test imports, helper dependency direction, render barrel drift, type-only shared types, and host-callback ownership.
- Corrected PRODUCT.md so Stage 4.8 spotlight is marked implemented, with #75 left as the follow-up performance issue.

## Verification
- [ ] `node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts packages/graph-engine/test/renderer-boundary.test.ts packages/graph-engine/test/architecture.test.ts packages/graph-engine/test/sigma-global-renderer.test.ts packages/graph-engine/test/sigma-graphology-model.test.ts packages/graph-engine/test/sigma-hit-projector.test.ts packages/graph-engine/test/sigma-overlay-dom.test.ts packages/graph-engine/test/sigma-global-camera.test.ts packages/graph-engine/test/sigma-wheel-zoom.test.ts packages/graph-engine/test/sigma-zoom.test.ts packages/graph-engine/test/sigma-coordinates.test.ts packages/graph-engine/test/community-cloud-geometry.test.ts`
- [ ] `npm run test -w @llm-wiki/graph-engine`
- [ ] `npm run typecheck`
- [ ] `bash install.sh --dry-run --platform codex`
- [ ] privacy keyword grep
- [ ] `git diff --check`

## Scope
Closes #79. Does not implement #75 performance changes.
```

- [ ] **Step 3: Do not open the PR until the user asks to ship**

This plan ends after verification and PR notes. Pushing and PR creation should use the project ship workflow only when the user asks to ship or create the PR.

## Engineering Review Addendum

### NOT in scope

- #75 performance work: keep animation and overlay performance changes for the separate performance issue.
- Another large split of `sigma-global-renderer.ts`: current modules already cover the needed seams; this plan seals boundaries instead.
- User-visible graph behavior changes: this plan changes contracts, tests, and stale documentation only.
- New graph routes or a third renderer path: existing Sigma global route remains the lifecycle entrypoint.
- Moving existing Graphology model and hit-projector assertions out of `sigma-global-renderer.test.ts`: this plan only moves their imports to the real modules and guards the boundary.
- README or CHANGELOG updates: no user-facing feature list changes are introduced by this boundary-hardening work.
- PR creation or push: this plan stops at verified local implementation and PR notes unless the user asks to ship.

### What already exists

- `sigma-global-renderer.ts` already owns the Sigma lifecycle and runtime boundary. The plan keeps it as the single entrypoint.
- `sigma-graphology-model.ts` already owns Graphology model helpers. The plan moves renderer tests to import these helpers directly.
- `sigma-hit-projector.ts` already owns hit projection helpers. The plan moves renderer tests to import this helper directly.
- `sigma-refactor-boundaries.test.ts` already guards helper-to-renderer imports and render barrel drift. The plan strengthens it instead of creating a parallel boundary suite.
- `renderer-boundary.test.ts` already guards higher-level facade, host callback, raw event, and overlay ownership. The plan keeps using it in verification.
- Existing module tests already cover camera, wheel zoom, overlay DOM, coordinates, zoom, cloud geometry, Graphology model, and hit projector behavior. The plan reuses these tests in the final verification matrix.
- `workbench/PRODUCT.md` already has Stage 4.8 sections. The plan corrects stale status text instead of adding another product-status source.

### Test Coverage Diagram

```text
CODE PATHS                                                COVERAGE
[+] sigma-refactor-boundaries.test.ts                     planned
  +-- helper files cannot import renderer                 *** boundary test
  +-- sigma internals cannot leak through render barrel   *** boundary test
  +-- sigma-global-types stays type-only                  *** boundary test
  +-- renderer cannot re-export internal helpers          *** regression test
  +-- renderer cannot locally re-export imported helpers  *** regression test
  +-- renderer test cannot import internals via renderer  *** regression test
  +-- internals cannot own host callback names            *** boundary test

[+] sigma-global-renderer.test.ts                         planned
  +-- renderer test keeps public renderer imports public  *** import discipline
  +-- Graphology helper tests import real module          *** direct module import
  +-- hit projector helper tests import real module       *** direct module import

[+] sigma-global-renderer.ts                              planned
  +-- public lifecycle/types/constants remain exported    *** typecheck + tests
  +-- test-only helper re-exports removed                 *** regression test

[+] workbench/PRODUCT.md                                  planned
  +-- Stage 4.8 marked implemented                        ** doc grep
  +-- #75 kept as performance follow-up                   ** doc grep

USER FLOWS
[=] No user-visible route or interaction change in #79    no browser E2E required

COVERAGE: all planned code paths have either a regression guard, a boundary guard,
or a targeted verification command. No open test gaps remain after this review.
```

Legend: `***` behavior plus regression guard, `**` targeted verification, `[=]` unchanged user flow.

### Failure modes

| Area | Realistic failure | Covered by plan | User impact |
|------|-------------------|-----------------|-------------|
| Renderer helper exports | Internal helpers remain exported from `sigma-global-renderer.ts` | Boundary regression test plus whole-file smoke check | No user-visible bug, but boundary stays leaky |
| Renderer local re-exports | The renderer imports an internal helper for its own use, then accidentally exposes it with a local named export | Boundary regression test plus whole-file smoke check | No user-visible bug, but the entrypoint becomes a helper barrel again |
| Renderer test imports | Tests keep importing internals through the renderer entrypoint | Boundary regression test plus whole-file smoke check | No user-visible bug, but future refactors get misleading safety |
| Render barrel drift | Sigma internal helpers become public through `render/index.ts` | Strengthened boundary test includes `community-cloud-geometry.ts` and Sigma helpers | Public API surface grows accidentally |
| Host callback ownership | Internal Sigma modules start referencing facade/web callbacks | Strengthened boundary test plus existing `renderer-boundary.test.ts` | Future behavior can split ownership between layers |
| Product status docs | Stage 4.8 still says spotlight is unimplemented | Targeted `rg` verification in Task 3 | Contributors may plan work against stale status |
| Export cleanup | A legitimate downstream import depends on removed helper re-exports | Full repo `npm run typecheck` | Build fails before ship, not at runtime |

No critical silent failure mode remains: every listed risk has either a test, a verification command, or a typecheck gate.

### Worktree parallelization strategy

Sequential implementation, no parallelization opportunity. Task 1 and Task 2 both touch the same boundary test and renderer test surface, so splitting them across worktrees would create coordination overhead without meaningful speedup. Task 3 is independent documentation, but it depends on the same branch narrative and is small enough to keep sequential.

### Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above. Run with Claude Code or Codex; checkbox as you ship.

- [ ] **T1 (P1, human: ~30min / CC: ~5min)** - Boundary verification - Use broad renderer export/import leak checks
  - Surfaced by: Test review + outside voice - the original line-by-line `rg` pipe missed multi-line imports, and named-export-only guards missed wildcard or alias re-exports.
  - Files: `docs/superpowers/plans/2026-06-30-sigma-global-subsystems-boundary.md`, `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
  - Verify: `node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
- [ ] **T2 (P2, human: ~30min / CC: ~5min)** - Boundary coverage - Include `community-cloud-geometry.ts` in Sigma internal boundary guards
  - Surfaced by: Architecture review - the design names cloud geometry as a Sigma subsystem, but the original guard only swept `sigma-*.ts`.
  - Files: `packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
  - Verify: `node --import tsx --test packages/graph-engine/test/sigma-refactor-boundaries.test.ts`
- [x] **T3 (P3, human: ~15min / CC: ~3min)** - Plan clarity - Add an ASCII boundary map to the plan
  - Surfaced by: Architecture review - this boundary-heavy plan needed a fast visual map.
  - Files: `docs/superpowers/plans/2026-06-30-sigma-global-subsystems-boundary.md`
  - Verify: boundary map appears before Task 0.

## Self-Review

### Spec coverage

- Subsystem boundary documentation: covered by the already committed design doc and preserved in Task 5 PR summary.
- Test layering: covered by the design doc and Task 4 verification matrix.
- Boundary guards: Task 1 and Task 2.
- Remove test-only renderer helper exports: Task 2.
- Move renderer tests to real helper modules: Task 2.
- PRODUCT.md stale spotlight status: Task 3.
- #75 kept separate: Task 3 and Task 5.
- No user-visible behavior changes: Task 4 runs tests/typecheck; no runtime behavior edits are planned.

### Placeholder scan

The plan contains no placeholder markers and no open-ended implementation instructions.

### Type consistency

- Internal Graphology helpers stay in `sigma-graphology-model.ts`.
- Hit projector helpers stay in `sigma-hit-projector.ts`.
- Public renderer lifecycle types stay in `sigma-global-types.ts` and continue re-exporting through `sigma-global-renderer.ts`.
- Test commands use Node `node --test` with `tsx`, matching the repo convention.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | - | Not run; scope stayed inside #79 boundary hardening |
| Codex Review | `codex-plan-review` | Independent 2nd opinion | 1 | issues found, absorbed | Found brittle checks, overclaims, narrow guards, and unverified date wording; accepted fixes via D4 |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clear | 5 issues found, 0 critical gaps, all folded into the plan |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | - | Not needed; no UI behavior change in this plan |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | - | Not needed; no developer workflow change beyond test commands |

- **CODEX:** Outside voice found 8 plan risks; the valid ones were absorbed into stronger guards, less brittle checks, evidence-based doc status, and narrower PR wording.
- **CROSS-MODEL:** Both reviews agreed #79 should remain boundary hardening only, not #75 performance work or another renderer split.
- **VERDICT:** ENG CLEARED - ready to implement the plan.

NO UNRESOLVED DECISIONS

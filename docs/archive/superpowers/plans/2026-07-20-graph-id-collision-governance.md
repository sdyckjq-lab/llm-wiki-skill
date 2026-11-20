# Graph Path Identity, Warnings, and Safe Rename Implementation Plan

> **For agentic workers:** REQUIRED SKILL CHAIN: execute one numbered task at a time with `/implement`. Every `/implement` run must use `/tdd` at the task's pre-agreed public seams, commit the verified task, and then run `/code-review <TASK_BASE>` against the V3 spec before the next task starts. This tracked plan is the immutable checklist; mirror live completion in the agent task tracker and do not tick or otherwise edit this file during implementation.

**Goal:** Make graph page identity collision-safe, resolve wikilinks without guessing, surface complete warnings in both hosts, preserve graph continuity during the path-ID migration, and provide a crash-recoverable optional rename flow.

**Architecture:** Root CommonJS modules become the single source of truth for knowledge-base file discovery, Unicode 17.0 path comparison, wikilink parsing, warning generation, and rename impact scans. The shared graph engine normalizes malformed graph input once and aligns legacy IDs to path IDs for refresh diffs. Workbench contracts, server routes, React UI, and offline HTML consume the same persisted warning bundle; only the workbench owns the interactive rename journal and recovery UI.

**Tech Stack:** Node.js `>=22.19.0`, CommonJS root scripts, macOS Bash 3.2-compatible wrappers, TypeScript ESM, `node:test`, Zod, Hono, React 19, Testing Library, Playwright, Graphology/Sigma, JSON sidecars, local filesystem atomic rename.

## Global Constraints

- The V3 design is the source of truth: `docs/superpowers/specs/2026-07-19-graph-id-collision-governance-design.md`.
- Do not add an npm dependency. Vendor Unicode 17.0 normalization, case-folding, conformance data, and its license; all parser and transaction code uses Node built-ins.
- Keep the monorepo root CommonJS-compatible. Root `.js` modules use `require` / `module.exports`; do not add root `"type": "module"`.
- Shell entrypoints remain compatible with the default macOS Bash 3.2. Complex indexing, parsing, hashing, and JSON assembly belong in Node modules.
- Graph nodes come only from the six formal directories: `entities`, `topics`, `sources`, `comparisons`, `synthesis`, and `queries`.
- Graph build, lint, and rename use the three distinct discovery/write policies from spec section 5.1. `raw/` and `.wiki-schema.md` are never rewritten; `.obsidian/`, `.git/`, `.wiki-tmp/`, `node_modules/`, generated graph JSON, and generated HTML are excluded as specified.
- Persist actual POSIX knowledge-base-relative paths. Never persist portable comparison keys or user-home absolute paths.
- `warning_summary.details_ref` always names the actual paired warning file as a validated POSIX knowledge-base-relative path. The normal value is `wiki/graph-warnings.json`; a custom graph output must remain inside the knowledge base, retain the basename `graph-data.json`, and use its own directory plus sibling `graph-warnings.json`.
- `details_sha256` is the SHA-256 of the canonical UTF-8 JSON projection `{ version, build_id, candidate_sets, groups }`; it never hashes `summary.details_sha256` itself. The graph summary and sidecar summary must carry the same value.
- Portable comparison is exactly `NFC(Default_Case_Fold_Unicode_17_0(NFC(path)))`, using vendored Unicode 17.0 NFC data plus status C/F case-fold rows and excluding status T rows. Do not call runtime `String.normalize` or casing APIs.
- A graph build returns `0` when a valid degraded graph is produced and `1` only for tool/system failures. Lint/check returns `0` for a completed report and `1` for tool failure. Strict lint/check returns `2` when the completed warning bundle contains an `error` and `1` for tool failure.
- Graph build and lint/check never modify knowledge Markdown. Rename is the only flow in this plan that can modify Markdown, and only after an explicit preview and confirmation.
- `graph-data.json` remains derived from Markdown. Rename never edits it directly.
- Workbench and offline HTML use one graph engine and one warning meaning. Offline HTML never exposes a write action.
- Rename is same-directory filename change only. It is not a generic Markdown editor and does not move pages across directories.
- Rename state is limited to `prepared`, `applying`, `committed`, `rolled_back`, and `conflicted`. Unknown journal states stop recovery with a visible error.
- One knowledge base can have only one non-terminal or committed-but-graph-unpublished rename operation. A graph-only pending operation keeps pages readable but blocks another rename until publication succeeds. Rename previews carry a server-issued `expires_at` bound into `preview_digest`. If the same `operation_id`/immutable inputs already have a journal or receipt, idempotent read wins at any age and returns it without writing. Only a record-missing apply that could create a new operation checks the 30-day expiry and returns `preview_stale:preview_expired` without creating a journal.
- Listener suspension coalesces rebuild events only. It is never described or implemented as a filesystem lock.
- Each TDD test observes behavior through the named public seam. Mock only process/browser/time boundaries; use real temporary knowledge bases and real filesystem writes for parser, builder, and rename tests.
- Do not touch the user's untracked questionnaire or the two conflict-copy specs whose names end in ` 2.md` and ` 3.md`.
- This implementation plan is already tracked by Git even though the plans directory is ignored for new files. Keep it unchanged during implementation; use the active task tracker for progress so every numbered task can still begin from a clean worktree.

---

## Scope Check

This is one end-to-end capability with three natural product stages, not six independent products. It stays in one plan because the warning contract, path identity, hosts, and rename preview share the same parser and path rules. The six numbered tasks below are internal review gates, not GitHub child issues.

The optional rename flow is deliberately last. Tasks 1-4 already deliver the core user outcome: same-named pages safely coexist, ambiguous links do not silently connect, and both hosts explain degraded graph data. Tasks 5-6 add the optional repair action without blocking the core path-identity release.

## Completion Standard

The plan is complete only when all of the following are true:

- Every production acceptance row in spec section 9.2 has an automated or browser verification named in this plan.
- Engine input arrays contain unique node, edge, and community IDs; generated IDs avoid all explicit IDs; input and engine warnings appear in one model.
- Real graph construction handles all link forms and discovery boundaries in the checked-in fixture without changing any Markdown hash.
- Every normal or custom `graph-data.json`/sibling `graph-warnings.json` pair cannot be mixed across builds because its path relationship, `build_id`, and SHA-256 are verified.
- Workbench displays readable `ready + warnings` graph state, supports complete warning pagination, and reserves the failure screen for system failures.
- Offline HTML shows the same counts and a bounded warning detail payload, with a hard compressed 2 MiB limit and explicit truncation notice.
- Legacy basename IDs align to path IDs for nodes, directed semantic edges, communities, and existing path-keyed pins without false growth animation.
- Rename preview, apply, idempotency, case/Unicode equivalent rename, fixed-position migration, crash recovery, external edit preservation, single rebuild, and rebuild retry all pass real filesystem tests.
- The real browser covers warning details, rename confirmation, external-change invalidation, recovery entry, and the final readable graph.
- The fixed Unicode 17 NFC conformance and portable-path Node tests pass on macOS, Windows, and Linux CI before the Stage 2 path-identity release is marked production-complete.
- The real equivalent-name transit rename test passes on macOS, Windows, and Linux CI before the optional Stage 3 rename release is marked production-complete.
- `bash tests/regression.sh`, `npm run quality-and-tests`, the relevant browser flows, installer dry runs, privacy scan, Markdown link check, and `git diff --check` all pass.

## Execution Protocol: `/implement` → `/tdd` → `/code-review`

For each numbered task, first mirror its steps into the active agent task tracker. The checkboxes below enumerate requirements only; never edit them while executing the task.

1. Start from a tracked-clean worktree and capture the fixed point. The three protected user-owned files may remain untracked, but no staged or unstaged tracked change may cross into a task:

   ```bash
   git status --short
   git diff --exit-code
   git diff --cached --exit-code
   git update-ref refs/llm-wiki/task-base HEAD
   TASK_BASE=$(git rev-parse HEAD)
   ```

   `refs/llm-wiki/task-base` is the persistent task-local fixed point because separate `/implement` shell calls do not preserve environment variables. Any later command can rehydrate it with `TASK_BASE=$(git rev-parse refs/llm-wiki/task-base)`. Tasks run serially, so the next task deliberately overwrites this private local ref; never push it.

2. Invoke `/implement` with only that task section, the V3 spec path, and the task's listed TDD seams. The seams are approved by accepting this plan; the implementer does not need another seam-selection question.
3. Follow one vertical cycle at a time: one failing public-behavior test, confirm the expected failure, add the smallest production behavior, confirm green, then continue to the next behavior.
4. Run the focused tests after every cycle, the task-level type/build checks before commit, and the task's full regression command once at the end.
5. Commit only intentional files with the task number in the message. Never stage the untracked questionnaire or conflict-copy specs.
6. Invoke `/code-review` with `$TASK_BASE` as the fixed point and the V3 spec as the spec source:

   ```text
   /code-review $(git rev-parse refs/llm-wiki/task-base) docs/superpowers/specs/2026-07-19-graph-id-collision-governance-design.md
   ```

7. If either Standards or Spec review reports a real issue, continue the same `/implement` task, add a regression test when behavior is affected, commit the correction, and rerun `/code-review` against the same `$TASK_BASE`.
8. Start the next numbered task only after both review axes are clear.

After Task 6 is fully reviewed and its PR is ready, delete the private local fixed-point ref with `git update-ref -d refs/llm-wiki/task-base`.

Because `/code-review` compares committed history to a fixed point, the verified task commit must exist before that review. Review corrections remain separate commits; do not amend or squash during implementation.

## Preflight Before Task 1

- [ ] **Step 1: Confirm the design artifacts are saved without touching user-owned files**

Run:

```bash
git branch --show-current
git status --short
git diff --check
git diff --cached --check
```

Expected:

- The branch is a feature branch, never `main`.
- Commit `850184e1` contains the reviewed V3 baseline, validation report, reusable validation program, path-identity engine test, and `.gitignore` change; current HEAD also contains the later plan-review corrections to this spec and plan.
- `to-questionnaire-graph-id-wikilink.md` and the two conflict-copy specs remain untracked and untouched.
- Both whitespace checks exit `0`; any displayed untracked entry is one of the three protected user-owned files.

- [ ] **Step 2: Confirm the reviewed design baseline and follow-up plan corrections before production code starts**

The reviewed design baseline already exists. Verify it instead of attempting an empty second commit:

```bash
git merge-base --is-ancestor 850184e1 HEAD
git show --stat --oneline --summary 850184e1
git log --oneline 850184e1..HEAD -- \
  docs/superpowers/specs/2026-07-19-graph-id-collision-governance-design.md \
  docs/superpowers/plans/2026-07-20-graph-id-collision-governance.md
git diff --exit-code
git diff --cached --exit-code
```

Expected: all commands exit `0`; `850184e1` is the existing `docs: finalize graph path identity design` baseline; the later log contains the reviewed corrections that close the plan findings; and no tracked file is staged or unstaged. The tracked implementation plan is a read-only reference during production work; do not create another baseline commit or edit the plan as an execution ledger.

- [ ] **Step 3: Re-run the retained direction proof**

Run:

```bash
node --import tsx docs/graph/validation/path-identity-feasibility.mts
node --import tsx --test packages/graph-engine/test/path-identity-compatibility.test.ts
```

Expected: the direction program prints `markdownWrites: 0`, both production-verification flags remain `false`, and the engine test passes.

## File Structure Map

### Root Skill capability

- Create `.gitattributes` — preserve exact LF bytes for vendored Unicode data on every checkout.
- Create `deps/unicode/CaseFolding-17.0.0.txt` — immutable Unicode 17.0 C/F mapping source.
- Create `deps/unicode/UnicodeData-17.0.0.txt` — canonical decomposition and combining-class source.
- Create `deps/unicode/DerivedNormalizationProps-17.0.0.txt` — full composition exclusions.
- Create `tests/fixtures/unicode/NormalizationTest-17.0.0.txt` — official NFC conformance vectors used only by tests.
- Create `deps/LICENSE-unicode.txt` — Unicode License V3 copied with the vendored data files.
- Create `scripts/lib/unicode-normalization.js` — fixed Unicode 17.0 NFC implementation.
- Create `scripts/lib/unicode-case-folding.js` — table parser and `defaultCaseFoldUnicode17`.
- Create `scripts/lib/wiki-file-discovery.js` — one discovery inventory with graph/lint/rename policy views.
- Create `scripts/lib/wikilink-parser.js` — Markdown-aware wikilink scanner with UTF-8 byte positions.
- Create `scripts/lib/wiki-link-index.js` — target indexes, resolver, warning grouping, and rename scan.
- Create `scripts/lib/graph-warning-bundle.js` — stable IDs, bundle validation, SHA-256, atomic paired artifact commit, and offline budget truncation.
- Create `scripts/wiki-link-cli.js` — public CommonJS CLI for `graph`, `check`, and `rename-scan`.
- Modify `scripts/build-graph-data.sh` — delegate discovery/link resolution and paired output commit to Node while keeping the existing analysis helper.
- Modify `scripts/graph-analysis.js` — accept content/frontmatter signals preloaded by the single source scan instead of rereading production Markdown.
- Modify `scripts/lint-runner.sh` — consume the shared report and add `--strict` without changing default read-only semantics.
- Modify `scripts/build-graph-html.sh` — verify and embed warning details, then render the offline warning banner.
- Modify `SKILL.md` — document ambiguous/pending/broken link behavior and strict checking.
- Modify `install.sh` only if the dry-run proves the new Unicode data is not copied; the current managed `deps` directory should already make this unnecessary.

### Shared graph engine

- Create `packages/graph-engine/src/model/input-normalization.ts` — canonical dedupe and generated-ID allocation.
- Modify `packages/graph-engine/src/types.ts` — warning, migration-warning, and runtime model types.
- Modify `packages/graph-engine/src/model/atlas.ts` — make raw Atlas and projection consume the same normalized collections.
- Modify `packages/graph-engine/src/diff.ts` — source-path identity alignment and semantic edge/community comparison.
- Modify `packages/graph-engine/src/model/index.ts` and public type tests — export the new public seams.
- Modify issue #159 fixture documentation/baselines only where #270 intentionally replaces collision behavior.

### Workbench contracts and server

- Create `packages/workbench-contracts/src/graph-warnings.ts` — Zod schemas for summary, bundle pages, and detail availability.
- Create `packages/workbench-contracts/src/graph-renames.ts` — preview, apply, operation state, and recovery schemas.
- Modify `packages/workbench-contracts/src/graph.ts`, `graph-events.ts`, `endpoints.ts`, and `index.ts` — wire warnings, diff migration warnings, and new routes.
- Create `workbench/server/src/repo-root.ts` — shared repository-root lookup used by graph rebuild and rename scan.
- Create `workbench/server/src/graph-warnings.ts` — sidecar verification and cursor pagination.
- Create `workbench/server/src/graph-rename-files.ts` — realpath-safe path resolution, atomic file replacement, equivalent-name transit rename, and layout-key migration; add a real-transit portability test to the three-platform matrix.
- Create `workbench/server/src/graph-rename-journal.ts` — durable operation state, backups, conflict copies, lock file, immediate ordinary-terminal compaction, and explicit 30-day retention for user-resolved conflict evidence.
- Create `workbench/server/src/graph-renames.ts` — preview/apply/recovery orchestration, exact conflict-set acknowledgement, persistent graph-publication recovery, and graph watcher handoff.
- Create `workbench/server/src/routes/graph-renames.ts` — trusted local HTTP endpoints for the rename workflow.
- Modify `workbench/server/src/graph.ts`, `routes/graph.ts`, `app.ts`, and `startup.ts` — warning state, pagination, migration diff, route assembly, and startup recovery scan.

### Workbench web

- Create `workbench/web/src/lib/api/graph-renames.ts` — typed rename/recovery API client.
- Modify `workbench/web/src/lib/api/graph.ts` — warning page client and ready-with-warnings result.
- Create `workbench/web/src/components/GraphWarningsBanner.tsx` — summary, complete pagination, candidate display, and resolve entry.
- Create `workbench/web/src/components/GraphRenameDialog.tsx` — preview, ambiguity choices, apply progress, conflict recovery, and rebuild retry.
- Modify `workbench/web/src/components/GraphPanel.tsx` — preserve readable graph state and mount the banner.
- Modify `workbench/web/src/components/GraphReader.tsx`, `RightDrawer.tsx`, and `App.tsx` — page-level rename action and recovery-on-selection flow.
- Modify `workbench/web/src/index.css` — Paper-aligned banner/dialog states.

### Verification assets

- Create `tests/fixtures/graph-path-identity-wiki/` — formal pages, unknown wiki page, root metadata, read-only raw page, attachment, Unicode paths, ambiguous links, pending links, broken links, self links, and code examples.
- Create `tests/fixtures/unicode/NormalizationTest-17.0.0.txt` — official fixed-NFC conformance corpus, test-only.
- Create focused root Node tests under `tests/js/` for Unicode, discovery, parsing, resolution, warning bundling, and strict exit behavior.
- Create engine tests for normalization and path-ID migration.
- Create workbench contract, server, DOM, and browser tests for warnings and rename recovery.
- Create `.github/workflows/path-portability.yml` — the fixed-Unicode/path suite on Ubuntu, macOS, and Windows; Task 5 later extends the same matrix with the production real-transit rename test.
- Modify `tests/regression.sh`, `workbench/scripts/run-quality-and-tests.mjs`, and `workbench/scripts/run-browser-main-flows-ci.mjs` so every new permanent non-browser/browser test is part of a pull-request-triggered required gate.

---

### Task 1: Normalize Engine IDs and Align the First Path-ID Refresh

**Files:**
- Create: `packages/graph-engine/src/model/input-normalization.ts`
- Create: `packages/graph-engine/test/graph-input-normalization.test.ts`
- Create: `packages/graph-engine/test/diff-path-identity-migration.test.ts`
- Modify: `packages/graph-engine/src/types.ts:37-96, 219-238`
- Modify: `packages/graph-engine/src/model/atlas.ts:178-320, 517-620`
- Modify: `packages/graph-engine/src/model/index.ts`
- Modify: `packages/graph-engine/src/diff.ts`
- Modify: `packages/graph-engine/test/model-migration-parity.test.ts`
- Modify: `packages/graph-engine/test/fixtures/issue-159/README.md`
- Modify: `packages/graph-engine/test-types/source-contracts.ts`
- Modify: `packages/graph-engine/test-types/dist-consumer/index.ts`

**Pre-agreed TDD seams:** `projectGraphInput(input, inputWarnings?)`, `buildAtlasModel(input, inputWarnings?)`, `alignGraphIdentityBySourcePath(previous, next)`, and `diffGraphData(previous, next)`.

**Interfaces:**
- Consumes: unknown graph JSON, optional input warning groups, legacy `source_path`, current edge relation fields, and current learning communities.
- Produces: `normalizeGraphInputCollections(input, inputWarnings)`, unique graph collections, merged `warnings`, collision-safe generated IDs, one reusable source-path identity alignment, and `GraphDiff.migrationWarnings`.

- [ ] **Step 1: Add failing tests for first-wins dedupe and generated-ID avoidance**

Add this behavioral shape to `graph-input-normalization.test.ts`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildAtlasModel, projectGraphInput } from "../src";

describe("graph input normalization", () => {
  it("keeps the first explicit id and allocates missing ids around every occupied value", () => {
    const input = {
      nodes: [
        { id: "node-0", label: "explicit", source_path: "wiki/entities/explicit.md" },
        { label: "generated", source_path: "wiki/entities/generated.md" },
        { id: "dup", label: "first", source_path: "wiki/entities/first.md" },
        { id: "dup", label: "second", source_path: "wiki/entities/second.md" },
      ],
      edges: [
        { id: "edge-0", from: "node-0", to: "dup", type: "EXTRACTED" },
        { from: "dup", to: "node-0", type: "EXTRACTED" },
        { id: "same", from: "node-0", to: "dup", type: "EXTRACTED" },
        { id: "same", from: "dup", to: "node-0", type: "EXTRACTED" },
      ],
      learning: {
        entry: { recommended_start_node_id: "dup", recommended_start_reason: null, default_mode: "global" },
        views: {
          path: { enabled: false, start_node_id: null, node_ids: [], degraded: true },
          community: { enabled: false, community_id: null, label: null, node_ids: [], is_weak: false, degraded: true },
          global: { enabled: true, node_ids: ["node-0", "dup"], degraded: false },
        },
        communities: [{ id: "c", label: "first" }, { id: "c", label: "second" }],
      },
    };

    const projection = projectGraphInput(input);
    assert.deepEqual(projection.data.nodes.map((node) => node.id), ["node-0", "node-1", "dup"]);
    assert.deepEqual(projection.data.edges.map((edge) => edge.id), ["edge-0", "edge-1", "same"]);
    assert.equal(projection.data.nodes.find((node) => node.id === "dup")?.label, "first");
    assert.deepEqual(projection.warnings.map((warning) => warning.code).sort(), [
      "duplicate_community_id",
      "duplicate_edge_id",
      "duplicate_node_id",
      "generated_id_collision",
      "generated_id_collision",
    ]);
    assert.equal(projection.warnings.find((warning) => warning.code === "duplicate_node_id")?.severity, "error");
    assert.equal(projection.warnings.find((warning) => warning.code === "generated_id_collision")?.severity, "warning");

    const atlas = buildAtlasModel(input);
    assert.deepEqual(atlas.nodes.map((node) => node.id), ["node-0", "node-1", "dup"]);
    assert.equal(atlas.byId.dup?.label, "first");
    assert.deepEqual(atlas.warnings, projection.warnings);

    const persisted = [{
      warning_id: "broken:missing",
      code: "broken_wikilink",
      severity: "error",
      message: "missing",
      target_key: "missing",
      occurrence_count: 1,
      occurrences: [{
        occurrence_id: "occ:missing",
        source_path: "wiki/topics/source.md",
        line: 1,
        column: 1,
        start_byte: 0,
        end_byte: 11,
        raw_link: "[[missing]]",
        file_sha256: "0".repeat(64),
        link_kind: "page_wikilink",
        read_only: false,
      }],
    }];
    const mergedProjection = projectGraphInput(input, persisted);
    const mergedAtlas = buildAtlasModel(input, persisted);
    assert.equal(mergedProjection.warnings[0]?.warning_id, "broken:missing");
    assert.deepEqual(mergedAtlas.warnings, mergedProjection.warnings);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the legacy behavior fails**

Run:

```bash
node --import tsx --test packages/graph-engine/test/graph-input-normalization.test.ts
```

Expected: FAIL because duplicate IDs remain, generated IDs collide with explicit IDs, and projections do not expose warnings.

- [ ] **Step 3: Add the warning and migration types**

Add the spec-defined warning code/severity/summary/candidate/occurrence/group/bundle types to `types.ts`, plus these runtime fields:

```ts
export interface GraphInputProjection {
  data: GraphData;
  regularSearchByNode: RegularSearchNodeProjection[];
  warnings: GraphWarningGroup[];
}

export type GraphMigrationWarning =
  | {
      code: "identity_alignment_ambiguous";
      source_path: string;
      previous_ids: NodeId[];
      next_ids: NodeId[];
    }
  | {
      code: "legacy_semantic_edge_duplicate";
      semantic_key: string;
      previous_edge_ids: EdgeId[];
      next_edge_ids: EdgeId[];
    };

export interface GraphDiff {
  addedNodes: NodeId[];
  removedNodes: NodeId[];
  recoloredNodes: Array<{ id: NodeId; from: CommunityId; to: CommunityId }>;
  addedEdges: EdgeId[];
  removedEdges: EdgeId[];
  newCommunities: CommunityId[];
  migrationWarnings: GraphMigrationWarning[];
  stats: { nodeCount: number; edgeCount: number; communityCount: number };
}
```

Add `warnings: GraphWarningGroup[]` to `AtlasModel`. Do not add full warning details to persisted `GraphData`; hosts pass loaded input warning groups at runtime.

- [ ] **Step 4: Implement one canonical collection normalizer**

Create `input-normalization.ts` with this public contract and algorithm:

```ts
export interface NormalizedGraphCollections {
  nodes: GraphNode[];
  edges: GraphEdge[];
  communities: Community[];
  warnings: GraphWarningGroup[];
}

export function normalizeGraphInputCollections(
  input: unknown,
  inputWarnings: readonly GraphWarningGroup[] = [],
): NormalizedGraphCollections {
  const raw = objectRecord(input);
  const nodeRows = arrayValues(raw.nodes);
  const edgeRows = arrayValues(raw.edges);
  const explicitNodeIds = collectExplicitIds(nodeRows);
  const explicitEdgeIds = collectExplicitIds(edgeRows);
  const warnings = [...inputWarnings];

  const nodes = normalizeUniqueRows({
    rows: nodeRows,
    kind: "node",
    explicitIds: explicitNodeIds,
    normalize: projectNode,
    warnings,
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = normalizeUniqueRows({
    rows: edgeRows,
    kind: "edge",
    explicitIds: explicitEdgeIds,
    normalize: projectEdge,
    warnings,
  }).filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  const communities = normalizeUniqueCommunities(raw.learning, warnings);
  return { nodes, edges, communities, warnings };
}
```

`normalizeUniqueRows` must collect every explicit ID before generating any missing ID, choose `node-N` / `edge-N` by incrementing until unused, emit `generated_id_collision` each time an occupied candidate is skipped, preserve the first normalized row for a repeated explicit ID, and emit one stable duplicate warning group per repeated ID. Merge warnings by stable `warning_id` with caller-supplied groups first, so the runtime model cannot contain duplicate groups. Sparse array holes remain holes only when no value exists; normalization must not invent graph facts for holes.

- [ ] **Step 5: Make both raw entrypoints consume the normalizer**

Refactor `projectGraphInputUnchecked` to call `normalizeGraphInputCollections`, preserve existing passthrough fields and search haystacks, and return persisted input warnings first followed by stable engine warnings. Refactor `buildAtlasModel` to consume the same normalized data and optional input-warning argument rather than independently mapping raw arrays. Keep IDs opaque strings; do not parse paths from IDs.

- [ ] **Step 6: Add a failing legacy-to-path migration test**

Create `diff-path-identity-migration.test.ts` with a previous graph whose IDs are basenames and a next graph whose IDs are paths. Include two directed edges, missing legacy `relation_type` defaulting to `依赖`, reordered edges, and renamed community IDs. Layout pins are deliberately tested at the workbench seam in Task 4 rather than being invented inside `GraphData`. Assert:

```ts
const diff = diffGraphData(previous, next);
assert.deepEqual(diff.addedNodes, []);
assert.deepEqual(diff.removedNodes, []);
assert.deepEqual(diff.addedEdges, []);
assert.deepEqual(diff.removedEdges, []);
assert.deepEqual(diff.newCommunities, []);
assert.deepEqual(diff.migrationWarnings, []);
```

Add a second case where two legacy nodes claim the same `source_path`; assert that exact IDs are the only fallback, unmatched items remain real additions/removals, and one `identity_alignment_ambiguous` warning is returned.

Add a third case with repeated legacy edges sharing the same mapped directed endpoints/relation. Assert stable input-order one-to-one matching, real surplus add/remove counts, and one `legacy_semantic_edge_duplicate` warning; edge IDs or reorder alone must not select an arbitrary last write.

- [ ] **Step 7: Run the migration test and confirm it fails**

Run:

```bash
node --import tsx --test packages/graph-engine/test/diff-path-identity-migration.test.ts
```

Expected: FAIL with basename nodes and edge IDs reported as removed/added.

- [ ] **Step 8: Implement node, edge, and community alignment inside `diffGraphData`**

Add these helpers in `diff.ts`; export the alignment so the workbench can migrate existing pins with the exact same one-to-one decision:

```ts
function normalizeMigrationSourcePath(value: unknown): string | null;
export function alignGraphIdentityBySourcePath(previous: GraphData, next: GraphData): {
  previousToNext: Map<NodeId, NodeId>;
  warnings: GraphMigrationWarning[];
};
function semanticEdgeKey(edge: GraphEdge, mapNode: (id: NodeId) => NodeId): string;
function mappedCommunityGroups(data: GraphData, mapNode: (id: NodeId) => NodeId): CommunityGroup[];
```

`normalizeMigrationSourcePath` only converts separators, removes safe `.` segments, and rejects empty/absolute/escaping paths. It never case-folds. `alignGraphIdentityBySourcePath` builds one-to-one `source_path` matches first, then exact-ID fallback for unmatched nodes. `diffGraphData` consumes that exported result, buckets directed edges by mapped `(from, to, relation_type || "依赖")`, and matches repeated legacy rows one-to-one in stable input order while warning on duplicate semantic buckets; `confidence` is not part of identity. Compare community overlap after mapping member IDs.

- [ ] **Step 9: Update the issue #159 compatibility fixture deliberately**

Keep the fixture as historical evidence, but change the regression assertion and README so collision rows explicitly state that #270 supersedes legacy last-write behavior with first-wins unique collections and warnings. Do not regenerate unrelated fields or reorder the fixture outside collision-affected sections.

- [ ] **Step 10: Run engine tests and type contracts**

Run:

```bash
node --import tsx --test \
  packages/graph-engine/test/graph-input-normalization.test.ts \
  packages/graph-engine/test/diff.test.ts \
  packages/graph-engine/test/diff-path-identity-migration.test.ts \
  packages/graph-engine/test/model-migration-parity.test.ts \
  packages/graph-engine/test/path-identity-compatibility.test.ts
npm run build -w @llm-wiki/graph-engine
npm run typecheck -w @llm-wiki/graph-engine
npm run test -w @llm-wiki/graph-engine
```

Expected: all commands exit `0`; the full engine suite has no duplicate-ID compatibility failure.

- [ ] **Step 11: Commit and run the two-axis review**

```bash
git add packages/graph-engine/src packages/graph-engine/test packages/graph-engine/test-types
git commit -m "feat: normalize graph identity collisions [task 1]"
```

Run `/code-review <TASK_BASE>` with the V3 spec. Resolve both Standards and Spec findings before Task 2.

### Task 2: Build the Shared File Discovery, Unicode, and Wikilink Resolver

**Files:**
- Create: `deps/unicode/CaseFolding-17.0.0.txt`
- Create: `deps/unicode/UnicodeData-17.0.0.txt`
- Create: `deps/unicode/DerivedNormalizationProps-17.0.0.txt`
- Create: `tests/fixtures/unicode/NormalizationTest-17.0.0.txt`
- Create: `deps/LICENSE-unicode.txt`
- Create: `scripts/lib/unicode-normalization.js`
- Create: `scripts/lib/unicode-case-folding.js`
- Create: `scripts/lib/wiki-file-discovery.js`
- Create: `scripts/lib/wikilink-parser.js`
- Create: `scripts/lib/wiki-link-index.js`
- Create: `scripts/wiki-link-cli.js`
- Create: `tests/fixtures/graph-path-identity-wiki/**`
- Create: `tests/js/unicode-case-folding.test.js`
- Create: `tests/js/unicode-normalization.test.js`
- Create: `tests/js/wiki-file-discovery.test.js`
- Create: `tests/js/wikilink-parser.test.js`
- Create: `tests/js/wiki-link-index.test.js`
- Create: `.gitattributes`
- Modify: `tests/regression.sh`
- Create: `.github/workflows/path-portability.yml`

**Pre-agreed TDD seams:** `normalizeNfcUnicode17`, `defaultCaseFoldUnicode17`, `discoverKnowledgeBaseFiles`, `parseWikilinks`, `renderWikilinkReplacement`, `buildWikiTargetIndex`, `resolveWikilink`, and the `wiki-link-cli.js` process contracts.

**Interfaces:**
- Consumes: a registered knowledge-base root, raw UTF-8 Markdown bytes, the vendored Unicode 17.0 normalization/case-folding tables, and one of the three discovery policies.
- Produces: a deterministic inventory, exact/portable path indexes, portable basename indexes, byte-accurate occurrences, resolved edges, warning groups, candidate sets, and a read-only JSON/text report.

- [ ] **Step 1: Add the immutable Unicode source and verify its identity**

Store the official Unicode 17.0 files as:

```text
deps/unicode/CaseFolding-17.0.0.txt
deps/unicode/UnicodeData-17.0.0.txt
deps/unicode/DerivedNormalizationProps-17.0.0.txt
tests/fixtures/unicode/NormalizationTest-17.0.0.txt
deps/LICENSE-unicode.txt
```

Use the corresponding files under `https://www.unicode.org/Public/17.0.0/ucd/` and Unicode License V3 from `https://www.unicode.org/license.txt`.

Create `.gitattributes` with these exact rules before adding the files, so Windows checkout cannot change their verified bytes:

```gitattributes
/deps/unicode/*.txt text eol=lf
/deps/LICENSE-unicode.txt text eol=lf
/tests/fixtures/unicode/*.txt text eol=lf
```

Verify:

```bash
shasum -a 256 \
  deps/unicode/CaseFolding-17.0.0.txt \
  deps/unicode/UnicodeData-17.0.0.txt \
  deps/unicode/DerivedNormalizationProps-17.0.0.txt \
  tests/fixtures/unicode/NormalizationTest-17.0.0.txt \
  deps/LICENSE-unicode.txt
```

Expected:

```text
ff8d8fefbf123574205085d6714c36149eb946d717a0c585c27f0f4ef58c4183  deps/unicode/CaseFolding-17.0.0.txt
2e1efc1dcb59c575eedf5ccae60f95229f706ee6d031835247d843c11d96470c  deps/unicode/UnicodeData-17.0.0.txt
71fd6a206a2c0cdd41feb6b7f656aa31091db45e9cedc926985d718397f9e488  deps/unicode/DerivedNormalizationProps-17.0.0.txt
5019ffd530751a741900c849c0e010332f142a3612234639bd200b82138a87db  tests/fixtures/unicode/NormalizationTest-17.0.0.txt
e7a93b009565cfce55919a381437ac4db883e9da2126fa28b91d12732bc53d96  deps/LICENSE-unicode.txt
```

- [ ] **Step 2: Write failing fixed-NFC and case-fold tests**

In `unicode-normalization.test.js`, assert independent literals for canonical decomposition/reordering/composition and Hangul:

```js
const assert = require("node:assert/strict");
const { it } = require("node:test");
const { loadUnicode17NfcNormalizer } = require("../../scripts/lib/unicode-normalization");

it("normalizes with fixed Unicode 17 data", () => {
  const nfc = loadUnicode17NfcNormalizer();
  assert.equal(nfc("A\u030A"), "\u00C5");
  assert.equal(nfc("\u212B"), "\u00C5");
  assert.equal(nfc("\u1100\u1161\u11A8"), "\uAC01");
  assert.equal(nfc("q\u0307\u0323"), "q\u0323\u0307");
});
```

First assert all four official data hashes and the license hash from Step 1. Parse every non-comment/non-`@Part` row in `tests/fixtures/unicode/NormalizationTest-17.0.0.txt` and enforce the official NFC equations: `NFC(c1)=c2`, `NFC(c2)=c2`, `NFC(c3)=c2`, `NFC(c4)=c4`, and `NFC(c5)=c4`. Convert space-separated code points with `String.fromCodePoint`; expected values come only from the official file.

In `unicode-case-folding.test.js`, assert known Unicode 17.0 results rather than recomputing them with the implementation:

```js
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { loadUnicode17CaseFolder } = require("../../scripts/lib/unicode-case-folding");

describe("Unicode 17 default case folding", () => {
  it("uses C/F mappings and excludes Turkic-only behavior", () => {
    const fold = loadUnicode17CaseFolder();
    assert.equal(fold("Straße"), "strasse");
    assert.equal(fold("İ"), "i\u0307");
    assert.equal(fold("K"), "k");
    assert.equal(fold("Σςσ"), "σσσ");
  });

  it("normalizes before and after folding", () => {
    const fold = loadUnicode17CaseFolder();
    assert.equal(fold("CAFÉ"), fold("cafe\u0301"));
  });
});
```

Add a test that temporarily replaces `String.prototype.normalize`, `toLowerCase`, and `toLocaleLowerCase` with throwing functions, then successfully runs both fixed NFC and the complete portable-key pipeline before restoring them in `finally`. This proves no host ICU/casing fallback is hidden in production code.

Run:

```bash
node --test \
  tests/js/unicode-normalization.test.js \
  tests/js/unicode-case-folding.test.js
```

Expected: FAIL because both modules do not exist.

- [ ] **Step 3: Implement fixed Unicode 17 NFC and case folding**

Create `unicode-normalization.js` with:

```js
function parseUnicode17NormalizationData(unicodeDataText, derivedPropsText) {}
function normalizeNfcUnicode17(value, tables) {}
function loadUnicode17NfcNormalizer() {}

module.exports = {
  loadUnicode17NfcNormalizer,
  normalizeNfcUnicode17,
  parseUnicode17NormalizationData,
};
```

Before parsing, hash each runtime data file and require the Step 1 digest; corruption is a tool failure, never a fallback to host Unicode. Parse canonical combining classes and untagged canonical decompositions from `UnicodeData`, including paired `<..., First>` / `<..., Last>` ranges; ignore compatibility tags. Parse single values and ranges for `Full_Composition_Exclusion` from `DerivedNormalizationProps`. Recursively decompose, implement algorithmic Hangul decomposition/composition, stable-sort combining marks by canonical combining class within each starter segment, and recompose only allowed canonical pairs using the UAX #15 blocking rule. Cache immutable tables/normalizer after the first load.

Create `unicode-case-folding.js` with these exports:

```js
const fs = require("node:fs");
const path = require("node:path");
const { loadUnicode17NfcNormalizer } = require("./unicode-normalization");

const TABLE_PATH = path.join(__dirname, "../../deps/unicode/CaseFolding-17.0.0.txt");

function parseUnicode17CaseFolding(text, normalizeNfc = loadUnicode17NfcNormalizer()) {
  const mappings = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) continue;
    const [sourceHex, status, targetHex] = line.split(";").map((part) => part.trim());
    if (status !== "C" && status !== "F") continue;
    mappings.set(
      Number.parseInt(sourceHex, 16),
      targetHex.split(/\s+/).map((hex) => String.fromCodePoint(Number.parseInt(hex, 16))).join(""),
    );
  }
  return (value) => {
    let folded = "";
    for (const character of normalizeNfc(String(value))) {
      folded += mappings.get(character.codePointAt(0)) ?? character;
    }
    return normalizeNfc(folded);
  };
}

let cached;
function loadUnicode17CaseFolder() {
  cached ??= parseUnicode17CaseFolding(fs.readFileSync(TABLE_PATH, "utf8"));
  return cached;
}

module.exports = { TABLE_PATH, loadUnicode17CaseFolder, parseUnicode17CaseFolding };
```

`loadUnicode17CaseFolder` also verifies the CaseFolding digest before parsing. The fallback preserves the original character; do not call `String.normalize`, `toLowerCase`, `toLocaleLowerCase`, or ICU-dependent normalization/casing APIs. The full official normalization conformance test must pass before continuing.

- [ ] **Step 4: Create the complete representative knowledge-base fixture**

Under `tests/fixtures/graph-path-identity-wiki/`, create:

- Eight formal graph pages across the six formal directories, including three formal `foo.md` pages and one occupied `foo-2.md`.
- `wiki/notes/side.md`, `wiki/overview.md`, `raw/notes/foo.md`, `raw/assets/Figure.png`, `index.md`, `log.md`, `purpose.md`, and `.wiki-schema.md`.
- Normal and custom generated artifacts named `graph-data.json`, `graph-warnings.json`, and `knowledge-graph.html` that must never enter any source or target view. The discovery test creates representative `.obsidian/`, nested `.git/`, `.wiki-tmp/`, and `node_modules/` entries dynamically in its temporary fixture copy so ignored paths do not have to be checked in.
- A links page containing unique, ambiguous, path, alias, heading, block, same-page, self, existing attachment, pending, broken, non-graph Markdown, fenced-code, inline-code, Chinese, emoji, and two-links-on-one-line cases.
- One page with frontmatter `aliases` that deliberately resembles a link target, plus an existing target still wrapped in `[待创建: ...]`, so tests prove frontmatter aliases are ignored and stale pending wrappers resolve normally while lint asks for cleanup.

Keep every expected source/target path in `tests/fixtures/graph-path-identity-wiki/expected.json` so tests compare against independent literals.

- [ ] **Step 5: Write failing discovery-policy tests**

Assert exact sorted arrays for:

```js
const inventory = discoverKnowledgeBaseFiles(FIXTURE);
assert.deepEqual(inventory.graphSources, EXPECTED.graphSources);
assert.deepEqual(inventory.lintSources, EXPECTED.lintSources);
assert.deepEqual(inventory.renameEditableSources, EXPECTED.renameEditableSources);
assert.deepEqual(inventory.renameReadOnlySources, EXPECTED.renameReadOnlySources);
assert.equal(inventory.targets.some((item) => item.path === "raw/assets/Figure.png"), true);
```

Also add a temporary symlink escaping the fixture root and assert it is rejected rather than indexed. Assert every normal/custom generated graph artifact and every hidden/third-party fixture is absent from all five arrays; modify only those excluded files and assert `fileSetSha256` stays unchanged, so a graph rebuild cannot invalidate a rename preview or become an attachment target.

Run:

```bash
node --test tests/js/wiki-file-discovery.test.js
```

Expected: FAIL because the discovery module does not exist.

- [ ] **Step 6: Implement one inventory with three policy views**

Create `wiki-file-discovery.js` with this public result:

```js
/** @typedef {{ path:string, absolutePath:string, kind:"markdown"|"attachment", editable:boolean, graphType:string|null }} InventoryEntry */

function discoverKnowledgeBaseFiles(kbRoot) {
  return {
    graphSources: [],
    lintSources: [],
    renameEditableSources: [],
    renameReadOnlySources: [],
    targets: [],
    fileSetSha256: "",
  };
}

module.exports = {
  GRAPH_PAGE_TYPES,
  discoverKnowledgeBaseFiles,
  normalizeRelativePosixPath,
  resolveInsideKnowledgeBase,
};
```

Walk once with `readdirSync(..., { withFileTypes: true })`, sort by POSIX relative path, never follow symbolic links (inside or outside the KB), reject any resolved entry outside the knowledge-base realpath, classify formal graph types by the first directory below `wiki/`, and derive each policy array from the same inventory. Exclude the spec section 5.1 hidden/third-party/temp directories, every `graph-data.json` / `graph-warnings.json` / generated `knowledge-graph*.html` regardless of its internal directory, and operation staging files whose basename starts `.llm-wiki-rename-`. Hash only the remaining sorted `path + kind + size + mtimeNs` inventory for preview invalidation.

- [ ] **Step 7: Write failing byte-accurate parser tests**

In `wikilink-parser.test.js`, read the fixture as a `Buffer` and assert:

- Every real link returns `raw_link`, one-based line/column, and `[start_byte, end_byte)` that slices the original buffer back to `raw_link` exactly.
- Alias and anchor fields do not change the page target.
- Same-page anchors, explicit self links, and embeds have distinct `link_kind` values.
- The exact Chinese/English pending wrappers set `pending: true`; arbitrary prose does not.
- Fenced and inline code examples produce no occurrence.
- Two links on one line have distinct byte ranges.
- `renderWikilinkReplacement` changes only the page-target segment while preserving embed prefix, alias, heading/block anchor, whitespace outside the target, and pending wrapper bytes.

Run:

```bash
node --test tests/js/wikilink-parser.test.js
```

Expected: FAIL because the parser module does not exist.

- [ ] **Step 8: Implement the Markdown-aware scanner**

Create `wikilink-parser.js` with this public shape:

```js
function parseWikilinks(buffer, sourcePath) {
  return {
    source_path: sourcePath,
    file_sha256: sha256(buffer),
    occurrences: [],
  };
}

function renderWikilinkReplacement(occurrence, replacementTarget) {}

module.exports = { parseWikilinks, renderWikilinkReplacement };
```

Use a single forward state machine over the UTF-8-decoded text. Track fenced code delimiter/length (backtick or tilde), inline backtick delimiter/length, line starts, Unicode-code-point columns, and UTF-16-index-to-UTF-8-byte offsets. Recognize `![[...]]` and `[[...]]`, split display at the first `|`, split anchor at the first `#`, preserve exact target/anchor/display offsets inside the full raw link, and reject an occurrence if its byte slice does not round-trip. In the same line pass, attach the existing `<!-- confidence: ... -->` and `<!-- relation_type: ... -->` annotations to the occurrence so graph construction does not reread Markdown. `renderWikilinkReplacement` rebuilds from those parser offsets, never a second regex/string search. Do not scan the file again during rewrite.

- [ ] **Step 9: Write failing resolver and warning-group tests**

In `wiki-link-index.test.js`, assert the exact V3 rules:

```js
assert.equal(resolve("[[unique]]").status, "resolved");
assert.equal(resolve("[[foo]]").status, "ambiguous");
assert.equal(resolve("[[wiki/topics/foo]]").target_path, "wiki/topics/foo.md");
assert.equal(resolve("[[WIKI/TOPICS/FOO.md]]").warning_code, "noncanonical_wikilink");
assert.equal(resolve("[待创建: [[future]]]").warning_code, "pending_wikilink");
assert.equal(resolve("[[missing]]").warning_code, "broken_wikilink");
assert.equal(resolve("[[#本页]]").creates_edge, false);
assert.equal(resolve("![[raw/assets/Figure.png]]").creates_edge, false);
assert.equal(resolve("![[raw/assets/Missing.png]]").warning_code, null);
assert.equal(resolve("[[wiki/notes/side.md]]").creates_edge, false);
```

Assert four `foo` candidates including `raw/notes/foo.md`, one stable candidate set reused by every ambiguous occurrence, and `portable_path_collision` without node merging. Assert a frontmatter alias never enters any identity index; a missing attachment stays outside page-identity warnings; and a now-existing `[待创建: ...]` target resolves/builds its normal edge while the lint report separately asks to remove the stale wrapper without making strict mode fail. Exercise `validatePortableMarkdownFilename` with independent literals for Windows reserved stems/characters, trailing dot/space, NFC/NFD and case-equivalent names, Chinese, spaces, and the `requires_transit:true` result for an equivalent rename of the current source.

- [ ] **Step 10: Implement target indexes, resolution, and warning grouping**

Create `wiki-link-index.js` exporting:

```js
function portablePathKey(pathValue, fold = loadUnicode17CaseFolder()) {
  return fold(normalizeRelativePosixPath(pathValue));
}

function buildWikiTargetIndex(inventory) {
  return { exactPaths: new Map(), portablePaths: new Map(), portableBasenames: new Map() };
}

function resolveWikilink(occurrence, sourcePath, index) {
  return { status: "resolved", target_path: null, creates_edge: false, warning_code: null, candidate_paths: [] };
}

function scanKnowledgeBaseLinks(kbRoot, policy) {
  return { inventory: null, edges: [], candidate_sets: [], groups: [], occurrences: [] };
}

module.exports = {
  buildWikiTargetIndex,
  portablePathKey,
  resolveWikilink,
  scanKnowledgeBaseLinks,
  validatePortableMarkdownFilename,
};
```

Exact paths win before portable paths. Portable path and basename maps retain arrays and never overwrite on collision. `scanKnowledgeBaseLinks` reads each policy source Buffer once, then derives links, title/body, frontmatter source signals, image paths, and existing annotation metadata from that Buffer; its metrics count that one read/parse. Stable candidate-set IDs hash the sorted relative paths. A wikilink warning's `target_key` preserves the normalized user spelling without case-folding; portable-collision groups use an opaque digest in `id` plus actual candidate paths. Never serialize the portable comparison key itself. Warning IDs and occurrence IDs use the formulas from spec section 7. Filename validation separately enforces Windows reserved stems/characters, trailing dot/space, control characters, Obsidian-breaking tokens, and existing portable-key collisions while allowing Chinese, spaces, and ordinary Unicode.

- [ ] **Step 11: Add the read-only CLI and strict exit contract**

Create `wiki-link-cli.js` with commands:

```text
node scripts/wiki-link-cli.js graph <kb-root> <output-dir> [--test-mode]
node scripts/wiki-link-cli.js check <kb-root> [--strict] [--json]
node scripts/wiki-link-cli.js rename-scan <kb-root> <source-path> <new-name>
```

`check` writes the complete report to stdout, writes nothing under the knowledge base, returns `0` for warning/error data in non-strict mode, returns `2` for any error occurrence in strict mode, and returns `1` for unreadable roots, invalid arguments, parser failure, or malformed Unicode data.

`rename-scan` is also read-only. It validates a formal source and same-directory target name, scans the rename policy once, and writes one JSON document containing `file_set_sha256`, source/target paths, source hashes/ranges/raw slices, editable versus read-only occurrences, deterministic replacements, every ambiguity candidate with its exact `renderWikilinkReplacement` output, and scan metrics. It never reads layout state, chooses an ambiguous target, creates an operation ID, stages a file, or writes under the KB; those are workbench responsibilities in Task 5.

- [ ] **Step 12: Add the three-platform pure Node workflow**

Create `.github/workflows/path-portability.yml`:

```yaml
name: path-portability
on:
  pull_request:
  push:
    branches: [main]
jobs:
  portability:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - run: node --test tests/js/unicode-normalization.test.js tests/js/unicode-case-folding.test.js tests/js/wiki-file-discovery.test.js tests/js/wikilink-parser.test.js tests/js/wiki-link-index.test.js
```

At Task 2 this workflow runs no Bash, so Windows validates the exact same path rules. This is the Stage 2 portability gate only; Task 5 must extend the same matrix with dependency installation and the real transit-rename/crash-recovery test before Stage 3 can complete.

- [ ] **Step 13: Run all shared-resolver tests and prove read-only behavior**

Run:

```bash
node --test \
  tests/js/unicode-normalization.test.js \
  tests/js/unicode-case-folding.test.js \
  tests/js/wiki-file-discovery.test.js \
  tests/js/wikilink-parser.test.js \
  tests/js/wiki-link-index.test.js

before=$(find tests/fixtures/graph-path-identity-wiki -type f -exec shasum -a 256 {} \; | sort | shasum -a 256)
node scripts/wiki-link-cli.js check tests/fixtures/graph-path-identity-wiki --json > /tmp/graph-path-check.json
node scripts/wiki-link-cli.js rename-scan \
  tests/fixtures/graph-path-identity-wiki \
  wiki/topics/foo.md \
  foo-renamed.md \
  > /tmp/graph-path-rename-scan.json
after=$(find tests/fixtures/graph-path-identity-wiki -type f -exec shasum -a 256 {} \; | sort | shasum -a 256)
test "$before" = "$after"
strict_code=0
node scripts/wiki-link-cli.js check tests/fixtures/graph-path-identity-wiki --strict --json > /tmp/graph-path-check-strict.json || strict_code=$?
test "$strict_code" -eq 2
```

Expected: unit tests pass, both check and rename-scan leave hashes unchanged, the rename JSON contains editable/read-only/ambiguous alternatives, non-strict exits `0`, and strict exits `2` because the fixture intentionally contains ambiguity/broken-link errors.

- [ ] **Step 14: Register the permanent root tests, commit, and review**

Add the five Node tests to `tests/regression.sh` beside the existing `tests/js` checks.

```bash
git add .gitattributes deps/unicode deps/LICENSE-unicode.txt scripts/lib scripts/wiki-link-cli.js tests/fixtures/graph-path-identity-wiki tests/fixtures/unicode tests/js tests/regression.sh .github/workflows/path-portability.yml
git commit -m "feat: add shared wikilink resolver [task 2]"
```

Run `/code-review <TASK_BASE>` against the V3 spec and clear both review axes.

### Task 3: Produce Path-ID Graphs, Paired Warning Artifacts, Strict Checks, and Offline Warnings

**Files:**
- Create: `scripts/lib/graph-warning-bundle.js`
- Create: `tests/js/graph-warning-bundle.test.js`
- Create: `tests/js/wiki-link-performance.test.js`
- Create: `tests/graph-path-identity-build.regression-1.sh`
- Create: `tests/graph-warning-exit-codes.regression-1.sh`
- Create: `tests/graph-offline-warnings.regression-1.sh`
- Create: `tests/browser/graph-offline-warnings.mjs`
- Modify: `scripts/wiki-link-cli.js`
- Modify: `scripts/build-graph-data.sh`
- Modify: `scripts/graph-analysis.js`
- Modify: `scripts/lint-runner.sh`
- Modify: `scripts/build-graph-html.sh`
- Modify: `tests/regression.sh`
- Modify: `tests/graph-analysis-helper.regression-1.sh`
- Modify: `tests/graph-build-failures.regression-1.sh`
- Modify: `tests/graph-data-confidence-merge.regression-1.sh`
- Modify: `tests/graph-data-source-paths.regression-1.sh`
- Modify: `tests/lint-output.regression-1.sh`
- Modify: `tests/expected/graph-data-sample.json`
- Modify: `tests/expected/graph-data-empty.json`
- Modify: `workbench/scripts/run-quality-and-tests.mjs`
- Modify: `workbench/scripts/run-quality-and-tests.test.mjs`
- Modify: `workbench/scripts/run-browser-main-flows-ci.mjs`
- Modify: `workbench/scripts/run-browser-main-flows-ci.test.mjs`
- Modify: `.github/workflows/quality-and-tests.yml` and `.github/workflows/browser-main-flows.yml` only to raise measured named timeouts if the added required commands exceed existing budgets.
- Modify: `SKILL.md:634-680, 929-1035`

**Pre-agreed TDD seams:** `assembleGraphArtifactPair`, `commitGraphArtifactPair`, `verifyGraphArtifactPair`, `prepareOfflineWarningPayload`, the three shell process exit contracts, and the generated offline HTML opened through Playwright.

**Interfaces:**
- Consumes: the Task 2 graph scan result, the existing `graph-analysis.js` output, warning groups/candidate sets, and canonical output paths.
- Produces: path-ID `graph-data.json`, its uniquely paired `graph-warnings.json`, a verified relative `details_ref`, unchanged Markdown, CLI reports, and a read-only offline warning panel.

- [ ] **Step 1: Add failing warning-bundle tests for stable IDs, compact candidates, and the detached detail digest**

Create `graph-warning-bundle.test.js`. Use two ambiguity groups with 100 occurrences that share the same four paths and one broken-link group. Assert this public contract:

```js
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  assembleGraphArtifactPair,
  canonicalWarningDetailBytes,
} = require("../../scripts/lib/graph-warning-bundle");

describe("graph warning artifact assembly", () => {
  it("stores each candidate set once and gives graph and sidecar the same digest", () => {
    const pair = assembleGraphArtifactPair({
      graphData: graphFixture(),
      groups: warningGroupsFixture(),
      candidateSets: candidateSetsFixture(),
    });

    assert.equal(pair.warningBundle.candidate_sets.length, 1);
    assert.equal(pair.warningBundle.groups[0].candidate_set_id, pair.warningBundle.groups[1].candidate_set_id);
    assert.equal(
      pair.graphData.meta.warning_summary.details_sha256,
      pair.warningBundle.summary.details_sha256,
    );
    assert.equal(pair.graphData.meta.warning_summary.details_ref, "wiki/graph-warnings.json");
    assert.equal(
      sha256(canonicalWarningDetailBytes(pair.warningBundle)),
      pair.warningBundle.summary.details_sha256,
    );
    assert.equal(pair.warningBundle.summary.total_occurrences, 201);
    assert.deepEqual(pair.warningBundle.groups.map((group) => group.warning_id), [
      ...pair.warningBundle.groups.map((group) => group.warning_id),
    ].sort());
  });
});
```

The fixture helpers contain independent literal IDs/counts. Add a second test assembling the same logical data in reverse order and assert byte-identical output. Add a third test that rejects duplicate `warning_id`, duplicate `candidate_set_id`, a missing candidate-set reference, a wikilink group's wrong occurrence count, an absolute `source_path`, or an absolute/escaping/wrong-basename `details_ref`. Pair-level tests also reject non-sibling graph/warning destinations. Non-link engine/path-collision groups may legitimately carry a positive count with no link-position objects.

Run:

```bash
node --test tests/js/graph-warning-bundle.test.js
```

Expected: FAIL because the bundle module does not exist.

- [ ] **Step 2: Implement canonical pair assembly and validation**

Create `graph-warning-bundle.js` with these exports:

```js
const DEFAULT_WARNING_DETAILS_REF = "wiki/graph-warnings.json";
const OFFLINE_WARNING_LIMIT_BYTES = 2 * 1024 * 1024;

function canonicalWarningDetailBytes(bundle) {}
function assembleGraphArtifactPair({ graphData, groups, candidateSets, detailsRef = DEFAULT_WARNING_DETAILS_REF }) {}
async function commitGraphArtifactPair({ kbRoot, graphPath, warningPath, pair, hooks = {} }) {}
async function verifyGraphArtifactPair({ kbRoot, graphPath, warningPath }) {}
function prepareOfflineWarningPayload({ summary, bundle, maxCompressedBytes = OFFLINE_WARNING_LIMIT_BYTES }) {}

module.exports = {
  DEFAULT_WARNING_DETAILS_REF,
  OFFLINE_WARNING_LIMIT_BYTES,
  assembleGraphArtifactPair,
  canonicalWarningDetailBytes,
  commitGraphArtifactPair,
  prepareOfflineWarningPayload,
  verifyGraphArtifactPair,
};
```

`verifyGraphArtifactPair` returns `{ status:"available", graphData, warningBundle }` or `{ status:"unavailable", reason, summary }`; an unavailable result never carries sidecar groups/candidates.

Canonicalize object keys, warning groups, occurrences, candidate sets, candidates, and `by_code`. Compute `build_id` from canonical `{ graph_without_warning_summary, warning_details:{ candidate_sets, groups } }`; the build-ID input excludes both `build_id` and summaries, so it is not self-referential. Then compute `details_sha256` from canonical `{ version, build_id, candidate_sets, groups }` bytes, exactly matching the clarified V3 contract. Copy the resulting summary, including the caller-supplied validated `detailsRef`, into both artifacts. Assembly rejects absolute/escaping/wrong-basename references, non-relative content paths, and inconsistent counts. Commit and verification additionally reject a graph basename other than `graph-data.json`, a warning basename other than `graph-warnings.json`, non-sibling final destinations, or a `details_ref` that does not resolve from `kbRoot` to that final sibling before any output write.

- [ ] **Step 3: Add failing paired-commit crash tests**

In `graph-warning-bundle.test.js`, write generation A into a temporary `wiki/` directory, verify it, then attempt generation B with a hook that throws immediately after the warning sidecar replacement:

```js
await commitGraphArtifactPair({ kbRoot, graphPath, warningPath, pair: pairA });
assert.equal((await verifyGraphArtifactPair({ kbRoot, graphPath, warningPath })).status, "available");

await assert.rejects(
  commitGraphArtifactPair({
    kbRoot,
    graphPath,
    warningPath,
    pair: pairB,
    hooks: { afterWarningReplace: () => { throw new Error("simulated crash"); } },
  }),
  /simulated crash/,
);

const mixed = await verifyGraphArtifactPair({ kbRoot, graphPath, warningPath });
assert.deepEqual(mixed, {
  status: "unavailable",
  reason: "build_id_mismatch",
  summary: pairA.graphData.meta.warning_summary,
});

await commitGraphArtifactPair({ kbRoot, graphPath, warningPath, pair: pairB });
const retried = await verifyGraphArtifactPair({ kbRoot, graphPath, warningPath });
assert.equal(retried.status, "available");
assert.equal(retried.warningBundle.build_id, pairB.warningBundle.build_id);
```

Also tamper with a candidate path while keeping `build_id` unchanged and expect `details_sha256_mismatch`; tamper with a graph node while copying the old summary and expect the recalculated content-derived build ID to fail. A missing or malformed sidecar must preserve the graph summary and return `missing` or `invalid`, never details from another generation. Build two custom graph outputs in separate knowledge-base subdirectories and assert each summary resolves to its own sibling warning file without touching the normal `wiki/graph-warnings.json`; rebuild one custom destination with a new generation and prove the same pair updates atomically. Reject a knowledge-base-external output, wrong graph/warning basename, non-sibling pair, or mismatched reference. Inject a different destination device and assert commit fails before replacement. With an injected clock, assert retry leaves the fresh failed-attempt directory for inspection but prunes an operation-owned directory older than 24 hours.

Run the focused test and confirm these assertions fail before implementing commit/verify.

- [ ] **Step 4: Implement the warning-first, graph-last commit protocol**

`commitGraphArtifactPair` must:

1. Realpath-check `kbRoot`, validate both requested output parents, require graph/warning destinations to remain inside the knowledge base, require basenames `graph-data.json` and `graph-warnings.json` in the same real directory, require both destinations to report the same filesystem device as `<kbRoot>/.wiki-tmp`, and create an exclusive `<kbRoot>/.wiki-tmp/graph-build/<build_id>-<random_uuid>/`, so a crashed attempt cannot block retrying identical content. Custom output remains supported only inside the knowledge base; each configured destination uses its own directory and `details_ref` equals that sidecar's POSIX knowledge-base-relative path. Rebuilding the same destination replaces its prior pair normally.
2. Write exact UTF-8 bytes for both artifacts, `fsync` both files, parse them again, and pass those bytes through the same internal canonical verifier used by `verifyGraphArtifactPair`, while validating `details_ref` against the final graph/warning destinations. Do not compare the final reference to the temporary `.wiki-tmp` filenames.
3. Rename the warning sidecar into place first.
4. Run the optional test hook.
5. Rename `graph-data.json` last as the commit point and `fsync` the containing directories where supported.
6. Remove its own temporary build directory after success, then prune only operation-owned directories under `.wiki-tmp/graph-build/` whose mtime is older than 24 hours; inject the clock in tests. Never prune the current directory or touch Markdown.

`verifyGraphArtifactPair` reads the final graph bytes first, validates the summary and final sibling-path contract, resolves `details_ref` against the real knowledge-base root, requires that result to equal the supplied final warning path without symlink escape, and accepts details only when the sidecar `build_id`, both summaries, recalculated canonical details digest, and recalculated content-derived `build_id` all agree. Commit-time temporary-byte verification and final-file verification must share one internal validation function so these rules cannot drift.

- [ ] **Step 5: Write the failing production-builder regression**

Create `graph-path-identity-build.regression-1.sh`. Copy `tests/fixtures/graph-path-identity-wiki` to a temporary knowledge base, hash every Markdown file, and run:

```bash
LLM_WIKI_TEST_MODE=1 bash scripts/build-graph-data.sh "$KB_ROOT"
```

Assert with `jq` against `expected.json` that:

- all eight formal pages are present and each `id` equals its actual `source_path`;
- all three formal `foo.md` pages remain distinct nodes while unknown directories, root metadata, and `raw/` do not become nodes;
- explicit paths and unique bare names create the expected directed edges with existing confidence/relation annotations preserved;
- ambiguous, pending, broken, attachment, non-graph, same-page, self, and code examples create exactly the expected edges or warnings;
- every node/edge/learning/community/insight reference uses a path ID;
- `graph-data.json.meta.warning_summary` verifies against `wiki/graph-warnings.json`;
- the build exits `0` despite intentional data errors; and
- the before/after Markdown hashes are identical.

Expected before implementation: FAIL because basename IDs collide and no warning sidecar exists.

- [ ] **Step 6: Replace the builder's basename/regex scan with the shared scan result**

Change the `graph` CLI command to write these deterministic temporary files under its requested output directory:

```text
nodes.json
edges.json
warning-groups.json
candidate-sets.json
scan-metrics.json
```

`nodes.json` uses actual relative paths for `id` and `source_path` and carries private preloaded `_content` / `_signals` values derived from the same source Buffer read used by the parser. It never needs an absolute `_file_path`. `edges.json` contains only successfully resolved formal-page targets and preserves the existing `confidence` / `relation_type` behavior. Deduplicate semantic directed edges before analysis.

Refactor `build-graph-data.sh` to call the CLI exactly once, passing `--test-mode` whenever `LLM_WIKI_TEST_MODE=1`, feed its node/edge JSON into the existing analysis helper, and rewrite every returned node reference through the path IDs already supplied. Update `graph-analysis.js` to consume the preloaded content/frontmatter signals; retain its legacy file-path fallback only for direct historical helper fixtures, and make the production builder test fail if that fallback reads a Markdown file. Remove the old `find`/basename/AWK wikilink scan. The empty-graph branch must still assemble and commit an empty valid warning sidecar. Keep `jq`/Node dependency failures at exit `1`; a missing `wiki/` is now a tool/input failure at exit `1`, not the retired exit `2`.

After analysis, invoke a `commit-pair` subcommand added to `wiki-link-cli.js`; that subcommand calls `assembleGraphArtifactPair` and `commitGraphArtifactPair`. The normal pair remains `<kb>/wiki/graph-data.json` plus `<kb>/wiki/graph-warnings.json` with `details_ref: "wiki/graph-warnings.json"`. For a custom graph output, require a real knowledge-base-internal directory containing `graph-data.json`, put `graph-warnings.json` beside it, and set `details_ref` to that exact sidecar's POSIX knowledge-base-relative path. Reject external output paths, escaping refs, wrong basenames, or non-sibling destinations. A repeated build to the same destination atomically replaces that pair; two distinct custom destinations must use distinct directories. Update `build-graph-data.sh` usage/error text and `SKILL.md` wherever custom output is documented so callers see the paired-directory constraint. Update legacy custom-output regressions to copy the fixture into a temporary knowledge base, rebuild one custom pair, build a second pair in another directory, and assert all paired paths explicitly.

Update every existing builder expectation deliberately: sample/empty golden JSON gains deterministic test-mode build/warning metadata and path IDs; confidence/relation tests select path endpoints while preserving their original semantics; source-path tests expect `id === source_path`; failure tests cover a missing resolver/bundle helper without replacing the old committed graph. Do not rewrite offline-host fixtures that represent old self-contained graph data—the engine compatibility contract keeps those readable.

- [ ] **Step 7: Add explicit 0/1/2 process-contract regressions**

Create `graph-warning-exit-codes.regression-1.sh` with independent temporary fixtures and assert:

```text
build valid graph with errors       -> 0 and both artifacts exist
build unreadable/missing root        -> 1 and no new graph commit
check with errors                    -> 0
check --strict with pending only     -> 0
check --strict with ambiguity        -> 2
check --strict with broken link      -> 2
check --strict with bad Unicode data -> 1
```

For every check case, hash Markdown before/after and assert equality. Capture non-zero codes with `set +e` around only the command being asserted so `set -e` cannot erase the result.

For the malformed-Unicode cases, copy only the CLI and its `scripts/lib`/`deps` runtime tree into the temporary fixture, independently corrupt one copied normalization/case-fold table, and execute the copied CLI. Never edit or temporarily replace a checked-in Unicode file.

- [ ] **Step 8: Make lint consume the shared report without losing existing checks**

Support these exact forms:

```text
bash scripts/lint-runner.sh <kb-root>
bash scripts/lint-runner.sh <kb-root> --strict
bash scripts/lint-runner.sh <kb-root> --json
bash scripts/lint-runner.sh <kb-root> --strict --json
```

Keep the existing user-facing orphan/index/image/source-signal section names, but replace every wikilink-derived orphan, broken, index, and reverse-index calculation with the single `wiki-link-cli.js check` result. Resolved explicit/unique links count as references; ambiguous, broken, self, code, and non-graph targets do not. Index aliases/anchors use their resolved target identity, and same basenames remain distinct path IDs. Image/frontmatter source-signal checks remain semantically independent, but consume metadata extracted from the same already-read source Buffer plus attachment inventory rather than rereading Markdown.

Text mode appends grouped ambiguity, pending, broken, noncanonical, portable-collision, and stale “待创建” wrapper cleanup sections. JSON mode returns one object containing the derived orphan/index counters, legacy non-link counters, stale-wrapper occurrences, and the complete shared warning report. A stale wrapper whose target now exists remains a successfully resolved edge and never becomes a strict error. Default mode returns `0` after a complete report regardless of data findings; strict mode returns `2` only if the final shared bundle contains at least one `error`; argument/parser/read failures return `1`.

Have the shell wrapper redirect the CLI's complete JSON to a trapped temporary file and let Node render/merge sections from that file; never place a large report in a shell variable or command argument.

Extend the existing lint regression with two same-basename pages plus explicit index paths, an ambiguous bare index entry, alias/anchor forms, and a code example. Assert each section uses the shared resolution result and the command still scans each Markdown source once.

- [ ] **Step 9: Add performance and linear-size acceptance tests**

Create `wiki-link-performance.test.js`. Generate a temporary knowledge base with 20 same-basename candidates and 400 ambiguous occurrences. Assert the public scan metrics and compact representation:

```js
assert.equal(result.metrics.inventory_walks, 1);
assert.equal(result.metrics.target_index_builds, 1);
assert.equal(result.metrics.source_files_parsed, result.inventory.lintSources.length);
assert.equal(result.candidate_sets.length, 1);
assert.equal(result.groups[0].occurrences.length, 400);
assert.equal(JSON.stringify(result.groups).includes(result.candidate_sets[0].candidates[0]), false);
assert.ok(Buffer.byteLength(JSON.stringify(result)) < 400 * 700 + 20 * 300);
```

Use metrics incremented at the real discovery/parser seams, not elapsed-time assertions. This proves one target index, one source parse, and an `occurrences + distinct candidate members` representation.

Extend `tests/graph-analysis-helper.regression-1.sh` with preloaded nodes and an unreadable fake `_file_path`; analysis must still succeed from `_content` / `_signals`. This guards the production path against reintroducing a second Markdown read while preserving the explicit legacy fallback test separately.

- [ ] **Step 10: Add failing offline budget and mismatch tests**

In `graph-warning-bundle.test.js`, measure the final canonical compact embedded payload—including status/truncation/omission fields—with `zlib.gzipSync(bytes, { level: 9 })`; create one pair just below 2 MiB and one well above it. Assert:

```js
assert.equal(small.payload.warning_details_truncated, false);
assert.deepEqual(small.payload.bundle, completeBundle);
assert.equal(large.payload.warning_details_truncated, true);
assert.ok(large.compressedBytes <= 2 * 1024 * 1024);
assert.equal(large.payload.bundle.summary.total_occurrences, completeBundle.summary.total_occurrences);
assert.ok(large.payload.bundle.groups.every((group) => group.occurrences.length <= 20));
assert.ok(large.payload.bundle.candidate_sets.every((set) => set.candidates.length <= 20));
assert.equal(
  large.payload.bundle.groups.length + large.payload.omitted_group_count,
  completeBundle.groups.length,
);
assert.equal(
  large.payload.bundle.candidate_sets.length + large.payload.omitted_candidate_set_count,
  completeBundle.candidate_sets.length,
);
```

Assert deterministic output after reversed input. If the first 20-per-group/set pass is still over budget, the reducer removes occurrence/candidate detail entries in stable reverse order. If all group/set headers still exceed the limit, omit stable tail groups/sets, retain all global summary totals, and increment `omitted_group_count` / `omitted_candidate_set_count`. Every retained group that references a candidate set must retain that set's header/count even if its candidates are empty; otherwise omit the group too. Add a many-tiny-groups fixture that reaches this branch and still fits the hard limit.

- [ ] **Step 11: Implement verified warning embedding in the offline HTML**

`prepareOfflineWarningPayload` returns `{ payload, compressedBytes }`, where `compressedBytes` is measured from `payload` and is not embedded back into it. Add a `warning-embed <kb-root> <graph-path> <warning-path> <output-path>` CLI command that passes the real knowledge-base root into pair verification and writes only this compact payload:

```json
{
  "summary": {},
  "details_status": "available",
  "details_unavailable_reason": null,
  "warning_details_truncated": false,
  "omitted_group_count": 0,
  "omitted_candidate_set_count": 0,
  "bundle": {}
}
```

For missing/mismatched/invalid details, write the graph summary with `details_status: "unavailable"`, no bundle, and a stable reason; do not mix generations or fail an otherwise readable graph export.

Make `build-graph-html.sh` call this command, escape `<`, `>`, `&`, U+2028, and U+2029, and embed the result in `<script id="graph-warning-data" type="application/json">`. Add an offline banner that:

- shows all summary counts and warning codes;
- expands available compact groups/candidates/occurrences using only knowledge-base-relative paths;
- says “详情过大，已精简；运行 check 查看完整报告” when truncated and reports any omitted group/set counts;
- says “告警详情暂不可用，请重新构建图谱” on pair mismatch; and
- never renders a resolve/write button.

Call `projectGraphInput(graphData, availableBundle?.groups ?? [])` once and render its warning model after deduping by `warning_id`; this merges persisted input groups with in-memory duplicate/generated-ID warnings without changing the persisted pair.

- [ ] **Step 12: Open the generated offline file in a real browser**

Create `tests/browser/graph-offline-warnings.mjs` and its shell wrapper. Build the representative fixture, export HTML, open the exact `file://` URL in Chromium, then assert:

- the Sigma graph is readable while error warnings exist;
- summary counts match `graph-data.json`;
- expanding details reveals the first and last expected occurrence and all four shared `foo` candidates;
- no text contains the temporary knowledge-base absolute path or the current home path;
- no “解决” or “改名” button exists;
- a deliberately mismatched sidecar still renders the graph plus unavailable notice; and
- a large synthetic sidecar displays the truncation notice; the Node test reads the exact embedded JSON bytes and verifies gzip level 9 size at or below 2 MiB.

The wrapper must clean the browser/context/temp directory on success and failure and save failure evidence only under `.tmp/graph-offline-warnings/`.

- [ ] **Step 13: Document the read-only and strict behavior**

Update `SKILL.md` lint and graph workflows to state plainly:

- same-named formal pages all remain in the graph;
- ambiguous links are omitted from edges and reported with candidates;
- pending and truly broken links are separate;
- normal build/check are read-only and do not fail on data warnings;
- `check --strict` is the explicit CI gate with exit `2`; and
- offline HTML can explain warnings but cannot rename files.

Do not describe the optional workbench rename flow as available until Task 6.

- [ ] **Step 14: Register every permanent test in a required CI gate, run, commit, and review**

Register both new Node tests and the three regression wrappers in `tests/regression.sh`. Add a named `graph-path-identity-root` step to `workbench/scripts/run-quality-and-tests.mjs` that directly runs the five Task 2 Node tests, the two Task 3 Node tests, `graph-path-identity-build.regression-1.sh`, and `graph-warning-exit-codes.regression-1.sh`; its runner test must assert the exact files are present so a later refactor cannot silently drop them. Extend the `browser-tests` stage in `run-browser-main-flows-ci.mjs` to run `tests/graph-offline-warnings.regression-1.sh` after Chromium verification, and make its test prove a failure from either browser command fails the stage. Measure the complete quality and browser stages on the finished Task 3 tree; if either exceeds its existing command/total/workflow timeout, raise only the named budgets to the measured upper bound plus the existing cleanup allowance and add timeout-contract assertions. This gives every new permanent test a pull-request-triggered plan-required check without making the non-browser quality job install Chromium or allowing a timeout to masquerade as missing coverage.

Then run:

```bash
npm run build -w @llm-wiki/graph-engine
node --test \
  tests/js/graph-warning-bundle.test.js \
  tests/js/wiki-link-performance.test.js
bash tests/graph-path-identity-build.regression-1.sh
bash tests/graph-warning-exit-codes.regression-1.sh
bash tests/graph-offline-warnings.regression-1.sh
bash tests/regression.sh
npm run quality-and-tests
npm run test:browser:main-flows -w @llm-wiki-agent/web
```

Expected: every command exits `0`; the intentional strict-data cases are asserted inside their wrapper; no Markdown hash changes.

```bash
git add scripts tests SKILL.md workbench/scripts/run-quality-and-tests.mjs workbench/scripts/run-quality-and-tests.test.mjs workbench/scripts/run-browser-main-flows-ci.mjs workbench/scripts/run-browser-main-flows-ci.test.mjs .github/workflows/quality-and-tests.yml .github/workflows/browser-main-flows.yml
git commit -m "feat: emit graph path warnings in both hosts [task 3]"
```

Run `/code-review <TASK_BASE>` against the V3 spec and clear both review axes before Task 4.

### Task 4: Carry Verified Warnings Through Workbench Contracts, API, Events, and UI

**Files:**
- Create: `packages/workbench-contracts/src/graph-warnings.ts`
- Create: `packages/workbench-contracts/test/graph-warnings.test.ts`
- Modify: `packages/workbench-contracts/src/graph.ts`
- Modify: `packages/workbench-contracts/src/graph-events.ts`
- Modify: `packages/workbench-contracts/src/endpoints.ts`
- Modify: `packages/workbench-contracts/src/index.ts`
- Modify: `packages/workbench-contracts/test/graph.test.ts`
- Modify: `packages/workbench-contracts/test/graph-events.test.ts`
- Modify: `packages/workbench-contracts/test/endpoints.test.ts`
- Create: `workbench/server/src/graph-warnings.ts`
- Create: `workbench/server/src/graph-warnings.test.ts`
- Modify: `workbench/server/src/graph.ts`
- Modify: `workbench/server/src/routes/graph.ts`
- Modify: `workbench/server/src/graph-routes.test.ts`
- Modify: `workbench/server/src/graph-watcher.test.ts`
- Create: `workbench/web/src/components/GraphWarningsBanner.tsx`
- Create: `workbench/web/test/graph-warnings-banner.test.tsx`
- Modify: `workbench/web/src/lib/api/graph.ts`
- Modify: `workbench/web/test/graph-api.test.ts`
- Modify: `workbench/web/src/components/GraphPanel.tsx`
- Modify: `workbench/web/test/graph-panel-paper.test.tsx`
- Modify: `workbench/web/src/lib/view-status.ts`
- Modify: `workbench/web/src/components/TopBar.tsx`
- Modify: `workbench/web/test/topbar.test.tsx`
- Modify: `workbench/web/src/App.tsx`
- Modify: `workbench/web/src/index.css`
- Modify: `workbench/web/test/browser/browser-main-flows.test.ts`
- Core-only release checkpoint, only when Tasks 5-6 are deliberately deferred: create `docs/graph/2026-07-20-path-identity-production-acceptance.md`; modify `CHANGELOG.md`, `README.md`, `README.en.md`, `workbench/PRODUCT.md`, `workbench/CONTEXT.md`, `packages/graph-engine/CONTEXT.md`, and the V3 spec acceptance status.

**Pre-agreed TDD seams:** the exported Zod schemas, `readGraphWarningContext`, `paginateGraphWarningContext`, `migrateGraphLayoutPinsForIdentity`, `GET /api/graph`, `GET /api/graph/warnings`, `getGraphWarnings`, and `GraphWarningsBanner` DOM behavior.

**Interfaces:**
- Consumes: `graph-data.json`, its verified sidecar, Task 1 engine warnings/migration alignment, graph layout pins, and current graph authority state.
- Produces: a readable ready graph plus `warning_state`, cursor-paged complete details, warning-aware SSE updates, migrated pins, and a Paper-style warning banner.

- [ ] **Step 1: Define failing contract tests before adding schemas**

Create `graph-warnings.test.ts` with exact literal examples for every warning code and detail status. The public shapes are:

```ts
type GraphWarningDetailsStatus = "available" | "unavailable";
type GraphWarningDetailsUnavailableReason =
  | "legacy_without_summary"
  | "missing"
  | "invalid"
  | "build_id_mismatch"
  | "details_sha256_mismatch"
  | "stale_cursor";

interface GraphWarningStateContract {
  summary: GraphWarningSummary | null;
  details_status: GraphWarningDetailsStatus;
  details_unavailable_reason: GraphWarningDetailsUnavailableReason | null;
  engine_groups: GraphWarningGroup[];
}

type GraphWarningPageContract =
  | {
      details_status: "available";
      build_id: string;
      summary: GraphWarningSummary;
      groups: GraphWarningGroup[];
      candidate_sets: GraphWarningCandidateSet[];
      next_cursor: string | null;
    }
  | {
      details_status: "unavailable";
      summary: GraphWarningSummary | null;
      details_unavailable_reason: GraphWarningDetailsUnavailableReason;
    };
```

Assert the schemas accept the normal `wiki/graph-warnings.json` reference and a valid custom POSIX knowledge-base-relative path ending in `graph-warnings.json`, but reject absolute, backslash, empty, `.`/`..`-segment, escaping, or wrong-basename `details_ref` values. Pair-aware server tests own the same-directory check. Also reject absolute content paths, zero-based line/column values, reversed byte ranges, an unknown warning code, and an unavailable state without a reason. Assert the page schema accepts only candidate sets referenced by its groups. Add a round-trip test for all snake-case fields.

Run:

```bash
node --import tsx --test packages/workbench-contracts/test/graph-warnings.test.ts
```

Expected: FAIL because the module/exports do not exist.

- [ ] **Step 2: Implement and wire the shared warning contracts**

Export these schemas from `graph-warnings.ts` and `index.ts`:

```ts
GraphWarningCodeSchema
GraphWarningSeveritySchema
GraphWarningSummarySchema
GraphWarningCandidateSetSchema
GraphWarningOccurrenceSchema
GraphWarningGroupSchema
GraphWarningBundleSchema
GraphWarningStateSchema
GraphWarningPageQuerySchema
GraphWarningPageDataSchema
```

`GraphWarningPageQuerySchema` coerces `limit` to an integer from 1 through 100, defaulting to 25, and accepts an optional opaque cursor. Extend `GraphMetaSchema` with optional `warning_summary` for legacy reads. Add required `warning_state` only to the `needsBuild:false` branch of `GraphReadDataSchema`; a legacy graph gets a runtime unavailable state rather than failing schema parsing.

Register `GET /api/graph/warnings` as a `migrated-json`, `read-only` endpoint. Add `migrationWarnings` to `GraphDiffSchema` as the Task 1 discriminated union for identity ambiguity and duplicate legacy semantic edges, and add `warning_summary` plus `warning_details_status` to `GraphUpdatedEventSchema`. Contract tests must reject an SSE update that omits either new field.

- [ ] **Step 3: Add failing real-file verification and pagination tests**

Create `workbench/server/src/graph-warnings.test.ts`. Generate pairs with the Task 3 CommonJS helper inside a real temporary knowledge base, then exercise:

```ts
const context = await readGraphWarningContext({
  kbPath,
  graphPath,
  graphData,
  scheduleRebuild,
});
assert.equal(context.publicState.details_status, "available");

const first = paginateGraphWarningContext(context, { limit: 2 });
const second = paginateGraphWarningContext(context, { limit: 2, cursor: first.next_cursor! });
assert.deepEqual(
  [...first.groups, ...second.groups].map((group) => group.warning_id),
  allWarningIds,
);
```

Assert each page includes exactly the candidate sets referenced on that page, occurrences never repeat across pages, and the cursor decodes to version/build/index only after validation. Reuse a cursor after replacing the artifact pair and expect a successful unavailable response with reason `stale_cursor`, never groups from both builds.

Add separate cases for missing, malformed, wrong-build, digest-tampered, absolute/escaping/wrong-basename/mismatched `details_ref`, non-sibling graph/sidecar paths, and symlink-escaped sidecars. Each returns the graph summary, `details_status: "unavailable"`, the exact reason, and schedules one rebuild at most for the same `kbPath + build_id + reason`, even after repeated graph/API reads; no outside-file bytes enter the response.

Expected before implementation: module-not-found failure.

- [ ] **Step 4: Implement the server warning context and cursor**

Create `graph-warnings.ts` with these public seams:

```ts
export interface GraphWarningContext {
  publicState: GraphWarningStateContract;
  bundle: GraphWarningBundle | null;
}

export async function readGraphWarningContext(input: {
  kbPath: string;
  graphPath: string;
  graphData: GraphData;
  scheduleRebuild: (kbPath: string) => unknown;
}): Promise<GraphWarningContext>;

export function paginateGraphWarningContext(
  context: GraphWarningContext,
  query: { cursor?: string; limit: number },
): GraphWarningPageContract;
```

Read the exact summary from graph metadata, validate its POSIX knowledge-base-relative `details_ref`, and validate `graphPath` as a knowledge-base-internal regular non-symlink `graph-data.json`. Resolve `details_ref` against the registered KB realpath, require a regular non-symlink sibling named `graph-warnings.json`, and require both realpaths to remain under that KB. For the normal `wiki/graph-data.json`, the builder emits `wiki/graph-warnings.json`; tests also pass a valid custom internal graph path and sibling so the server proves it follows the verified reference without weakening the pair rule. Recalculate both the canonical detail digest and content-derived build ID exactly as Task 3, require the sidecar summary reference to match, and parse with shared contracts. Cross-verify the server implementation with an artifact pair assembled by the root CommonJS module so the two hosts cannot drift. Do not return full bundle details from `GET /api/graph`. Encode cursors as base64url JSON `{ version:1, build_id, offset }`; reject malformed/out-of-range cursors as `INVALID_REQUEST`, but turn a valid cursor for a previous build into `stale_cursor` data state.

After pair verification, call `projectGraphInput(graphData, bundle?.groups ?? [])` so one model contains persisted input and defensive engine warnings. Put only warning IDs not already present in the persisted bundle into `warning_state.engine_groups`; do not write them back into either derived file. The banner combines persisted summary/pages with those extra groups without double counting or weakening pair verification.

- [ ] **Step 5: Prove data errors remain readable through graph routes**

Add route tests with a graph whose summary has error occurrences and a valid sidecar. Assert `GET /api/graph` returns HTTP `200`, authority `{ status:"ready" }`, `needsBuild:false`, graph data, and available `warning_state`; it must not return the graph error envelope.

Add a mismatched-sidecar case and assert the same readable graph plus unavailable details and one queued rebuild. Keep the existing rebuild-tool failure test: a real `graph_error` authority event still returns the error state and no stale graph as authoritative success.

Add `GET /api/graph/warnings?limit=1&cursor=...` route tests for two pages, active-KB fallback, explicit registered KB, unregistered/path-forbidden rejection, invalid limit/cursor, and unavailable details. All warning data outcomes use the normal success envelope.

- [ ] **Step 6: Implement the route and keep generated files out of the watcher**

Extend `GraphRouteService` with `readGraphWarnings(kbPath, query)`. The default service rereads `graph-data.json`, creates one warning context, and paginates it. Add the route beside the existing graph GET.

Update `readGraphSnapshot` so a valid graph always carries `warning_state` and passes the actual `graphPath` into `readGraphWarningContext`. Make `shouldIgnoreGraphWatchPath` ignore generated `graph-data.json` and `graph-warnings.json` basenames in any knowledge-base-internal output directory, with tests for both the normal and a custom pair; replacing either artifact must not recursively schedule another build. A sidecar mismatch schedules through the existing rebuild queue, which coalesces duplicate requests.

- [ ] **Step 7: Add failing first-refresh pin and event migration tests**

In `graph-watcher.test.ts`, create a previous basename-ID graph with `source_path`, a next path-ID graph, and a layout with:

```ts
pins: {
  foo: { x: 10, y: 20, coordinateSpace: "world" },
  "wiki/topics/already-path.md": { x: 30, y: 40, coordinateSpace: "world" },
}
```

After one rebuild, assert the first pin moves to the aligned path ID, the existing path-keyed pin remains byte-equivalent, the old `foo` key is gone, and the layout is written once atomically. Assert the emitted diff has no false node/edge/community growth and serializes `migrationWarnings`. In an ambiguous source-path fixture, retain the old pin and emit the alignment warning rather than guessing.

Expected: FAIL because the watcher only diffs graphs and never migrates layout keys.

- [ ] **Step 8: Migrate pins with the Task 1 identity alignment before publishing the event**

Export from `graph.ts`:

```ts
export function migrateGraphLayoutPinsForIdentity(
  previous: GraphData,
  next: GraphData,
  layout: GraphLayoutFile,
): { layout: GraphLayoutFile; changed: boolean; migrationWarnings: GraphMigrationWarning[] };
```

Consume `alignGraphIdentityBySourcePath`; never duplicate its matching rules. Existing next-ID pins win if both old and new keys exist. Preserve unmatched/ambiguous keys. Write a changed layout through a same-directory temporary file followed by rename, before emitting `graph_updated`. Include the graph diff's migration warnings and the verified warning summary/status in the event. This is first-refresh compatibility only; Task 5 handles a user-requested rename after path IDs are live.

- [ ] **Step 9: Add failing API-client and banner DOM tests**

Extend `graph-api.test.ts` to assert `getGraphData` parses `warning_state` and `getGraphWarnings(kbPath, cursor, limit)` sends the exact query and parses both available/unavailable page variants.

Create `graph-warnings-banner.test.tsx`. Render a summary with persisted errors/warnings and one engine duplicate-ID group. Use a fake page loader returning three one-group pages. Assert:

- graph-level counts and all required warning-code labels render;
- “查看详情” loads only page 1, then each “加载更多” follows `next_cursor` until null;
- candidate paths render once per set and first/last occurrences remain reachable;
- line/column and relative path appear, but an injected absolute-path response is rejected by the client schema;
- unavailable details show the rebuild notice while preserving summary counts;
- migration-warning rows are visible, relative/opaque only, non-actionable, and dismiss independently of persisted details;
- `onResolveWarning` is called with the exact group/candidate set only for ambiguity/portable-collision groups with formal editable candidates and only when the optional callback exists; broken, pending, noncanonical, and engine-only groups remain explanatory; and
- keyboard focus, `aria-expanded`, live loading text, and error retry all work.

Run and confirm failure before creating the component.

- [ ] **Step 10: Mount the banner without replacing the graph's ready state**

`GraphPanel` keeps `warning_state` beside graph data and clears it on KB switch/failure. Render `GraphWarningsBanner` above `.graph-stage` whenever persisted, engine, or current diff migration-warning counts are nonzero. Show identity/legacy-edge migration warnings in a separate non-actionable section so ambiguous alignment never disappears silently; retain them until user dismissal, KB switch, or a later successful update with no migration warning. Pass a new optional `onResolveWarning` prop upward; Task 6 will provide the dialog callback.

Add `warningCount` to `GraphStatusSnapshot`. A graph with warning errors still uses `status:"ready"`, leaves the Sigma host mounted, sets `warningCount > 0`, and makes `TopBar` say “图谱可读·有告警”. Only an authority/system error uses the existing error overlay. Update Paper DOM tests for light/dark banner, long relative paths, collapsed/expanded density, 320 px width, and reduced motion.

- [ ] **Step 11: Exercise warning pagination in the real workbench browser**

Extend the browser fixture with two formal same-basename pages, more warning groups than one API page, and a broken/pending pair. Open the graph tab and assert:

- graph pixels and reading actions remain available;
- the top bar and banner say the graph is readable with warnings;
- expanding and loading all pages reaches the final occurrence/candidate;
- only relative paths are rendered;
- warning details and any migration warning survive the graph SSE refresh long enough to be read; and
- sidecar tampering followed by a graph read displays the unavailable notice and queues a rebuild without switching to the failure screen.

Do not test rename controls yet; the optional callback remains absent in this task's production wiring.

- [ ] **Step 12: Run contract, server, web, browser, type, and review gates**

Run:

```bash
npm run test -w @llm-wiki/workbench-contracts
npm run build -w @llm-wiki/workbench-contracts
npm run build -w @llm-wiki/graph-engine
node --import tsx --test \
  workbench/server/src/graph-warnings.test.ts \
  workbench/server/src/graph-routes.test.ts \
  workbench/server/src/graph-watcher.test.ts \
  workbench/server/src/graph-events-routes.test.ts
node --import tsx --test workbench/web/test/graph-api.test.ts
node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test \
  workbench/web/test/graph-warnings-banner.test.tsx \
  workbench/web/test/graph-panel-paper.test.tsx \
  workbench/web/test/topbar.test.tsx
npm run typecheck
npm run test:browser:main-flows -w @llm-wiki-agent/web
```

Expected: all commands exit `0`; the browser shows a live graph and complete paginated warning access.

```bash
git add packages/workbench-contracts workbench/server/src workbench/web
git commit -m "feat: surface graph warnings in the workbench [task 4]"
```

Run `/code-review <TASK_BASE>` against the V3 spec and clear both review axes. This proves the local core implementation, but does not by itself make Tasks 1-4 releasable: no stage is production-complete until its release-facing documentation and required pull-request checks are also complete.

- [ ] **Step 13: Either continue the full plan or close the complete core-only release gate**

Choose exactly one branch after the Task 4 review:

1. **Continue directly to Tasks 5-6 (default for this full plan).** Record Tasks 1-4 as “core implementation locally verified, not released” in the active task tracker, leave this tracked plan unchanged, and continue to Task 5. Task 6 owns the single final version/docs/push/check sequence for the combined release.
2. **Deliberately defer Tasks 5-6 and release only the core.** Before any push, complete every item below; do not use the sentence “Tasks 1-4 are independently releasable” as a substitute for these gates.

For the core-only release:

1. Create `docs/graph/2026-07-20-path-identity-production-acceptance.md` with the tested implementation head, exact commands and local results for every Stage 1/2 acceptance row. Mark every row named Stage 3—preview invalidation, workbench rename, equivalent-rename portability, and active rename—explicitly “not part of this core release,” not silently complete.
2. Read the newest CHANGELOG version and increment its patch component once. Add only the path-identity/warnings behavior to `CHANGELOG.md`, both README feature lists/version badges, `workbench/PRODUCT.md`, `workbench/CONTEXT.md`, and `packages/graph-engine/CONTEXT.md`. Do not claim rename/recovery exists.
3. Commit those release documents separately, rerun `bash tests/regression.sh`, `npm run quality-and-tests`, the browser main flows, and `git diff --check`; use Task 6 Step 12's exact privacy and changed-Markdown link commands rather than inventing a shorter core-only variant.
4. Push the branch and create a draft PR. Require `quality-and-tests`, `browser-main-flows`, and `path-portability` to pass; the portability workflow must be green on Ubuntu, macOS, and Windows for the Stage 2 Unicode/path suite.
5. Add the three-platform run URL/result and tested head to the acceptance report, update only the Stage 1/2 V3 acceptance status, commit, push, wait for checks again, and rerun `/code-review` against the same Task 4 fixed point.
6. Mark the core-only PR ready only after every applicable row and required check is green. Then stop this plan; Tasks 5-6 require a later branch and a new release entry.

Only after the core-only path completes all six items are Tasks 1-4 independently releasable. Merely reaching the Task 4 code commit is not a release gate.

### Task 5: Implement a Realpath-Safe, Idempotent, Crash-Recoverable Rename Backend

**Files:**
- Create: `packages/workbench-contracts/src/graph-renames.ts`
- Create: `packages/workbench-contracts/test/graph-renames.test.ts`
- Modify: `packages/workbench-contracts/src/endpoints.ts`
- Modify: `packages/workbench-contracts/src/index.ts`
- Modify: `packages/workbench-contracts/test/endpoints.test.ts`
- Create: `workbench/server/src/repo-root.ts`
- Create: `workbench/server/src/repo-root.test.ts`
- Create: `workbench/server/src/graph-rename-files.ts`
- Create: `workbench/server/src/graph-rename-files.test.ts`
- Create: `workbench/server/src/graph-rename-portability.test.ts`
- Create: `workbench/server/src/graph-rename-journal.ts`
- Create: `workbench/server/src/graph-rename-journal.test.ts`
- Create: `workbench/server/src/graph-renames.ts`
- Create: `workbench/server/src/graph-renames.test.ts`
- Create: `workbench/server/src/graph-renames-crash.test.ts`
- Create: `workbench/server/test/graph-rename-crash-child.ts`
- Create: `workbench/server/src/routes/graph-renames.ts`
- Create: `workbench/server/src/graph-rename-routes.test.ts`
- Modify: `workbench/server/src/graph.ts`
- Modify: `workbench/server/src/graph-watcher.test.ts`
- Modify: `workbench/server/src/routes/knowledge-bases.ts`
- Modify: `workbench/server/src/knowledge-base-routes.test.ts`
- Modify: `workbench/server/src/app.ts`
- Modify: `workbench/server/src/app.test.ts`
- Modify: `workbench/server/src/runtime-app.ts`
- Modify: `workbench/server/test/runtime-app.test.ts`
- Modify: `workbench/server/src/startup.ts`
- Modify: `workbench/server/test/startup-isolation.test.ts`
- Modify: `.github/workflows/path-portability.yml`

**Pre-agreed TDD seams:** all rename Zod schemas, `resolveKnowledgeBaseRenamePath`, `applyByteRangeReplacements`, `GraphRenameJournalStore`, `previewGraphRename`, `applyGraphRename`, `recoverGraphRenameOperations`, and the four HTTP endpoints below.

**Interfaces:**
- Consumes: a registered knowledge-base realpath, Task 2 `rename-scan` JSON, user ambiguity choices, current layout pins, exact source bytes, and persistent journal state.
- Produces: a no-write preview, one idempotent operation, staged/verified Markdown changes, same-directory rename, migrated layout key, recoverable journal state, a persistent graph-publication result, one coalesced graph rebuild request, and either an immediately byte-free ordinary receipt or a resolved-conflict receipt whose unrecoverable evidence has an explicit 30-day expiry.

- [ ] **Step 1: Freeze the four endpoint and operation contracts with failing tests**

Create `graph-renames.test.ts` and define these endpoints exactly:

```text
POST /api/graph/renames/preview
POST /api/graph/renames/apply
GET  /api/graph/renames/recovery
POST /api/graph/renames/recovery
```

Register preview POST and recovery GET as `read-only` because they only inspect local state; apply and recovery POST are `state-changing`. All four still require trusted-source and capability checks.

The preview body is `{ kbPath?: string, source_path: string, new_name: string }`. Its response contains:

```ts
interface GraphRenamePreviewData {
  operation_id: string;
  expires_at: string;
  preview_digest: string;
  source_path: string;
  target_path: string;
  equivalent_portable_name: boolean;
  file_set_sha256: string;
  editable_files: GraphRenamePreviewFile[];
  read_only_references: GraphRenamePreviewOccurrence[];
  ambiguous_choices: Array<{
    occurrence_id: string;
    source_path: string;
    candidates: Array<{ target_path: string; replacement_raw_link: string }>;
  }>;
  layout_change: { from_key: string; to_key: string; present: boolean };
  summary: {
    editable_files: number;
    editable_occurrences: number;
    read_only_occurrences: number;
    ambiguous_occurrences: number;
  };
}
```

Each editable occurrence includes the original relative path/hash/byte range/raw link, deterministic `replacement_raw_link` when no choice is needed, and `resolution_kind: "explicit_path" | "unique_basename" | "ambiguous"`. It never includes an absolute path.

The apply body is:

```ts
{
  kbPath?: string;
  operation_id: string;
  expires_at: string;
  source_path: string;
  new_name: string;
  preview_digest: string;
  resolutions: Array<{ occurrence_id: string; target_path: string }>;
  confirmed: true;
}
```

Its response is a discriminated union:

```ts
type GraphRenameApplyData =
  | { outcome: "preview_stale"; operation_id: string; reason: string }
  | { outcome: "operation"; operation: GraphRenameOperationData };

interface GraphRenameOperationData {
  operation_id: string;
  state: "prepared" | "applying" | "committed" | "rolled_back" | "conflicted";
  source_path: string;
  target_path: string;
  graph_rebuild: "not_started" | "started" | "queued" | "failed" | "succeeded";
  conflicts: GraphRenameConflict[];
  retained_evidence: Array<{ relative_path: string; sha256: string; expires_at: string }>;
}

type GraphRenameConflict = (
  | { source_path: string; current_state: "present"; current_sha256: string }
  | { source_path: string; current_state: "missing" }
) & {
  preserved_variants: Array<{
    kind: "current" | "original" | "intended";
    relative_path: string;
    sha256: string;
  }>;
};

type GraphRenameObservedConflict =
  | { source_path: string; current_state: "present"; current_sha256: string }
  | { source_path: string; current_state: "missing" };
```

Recovery GET performs no recovery write and returns `{ status:"clear" }`, `{ status:"required", operation }` for content recovery, `{ status:"rebuild_required", operation }` for a committed operation whose graph is not yet published, or `{ status:"blocked", reason:"unknown_state" | "invalid_journal" | "unsafe_current_type", operation_id:string | null }`. Every union member also carries `retained_evidence_receipts: Array<{ operation_id, retained_evidence }>` for all user-resolved conflicts whose 30-day evidence has not expired; this list may contain multiple operations, survives restart, and never changes the primary recovery status or blocks a new rename. Startup/selection owns automatic safe recovery. Recovery POST accepts `{ kbPath?, operation_id, action:"finish_commit" | "finish_rollback", observed_conflicts: GraphRenameObservedConflict[] }`; `observed_conflicts` is the complete set the user saw, not a partial acknowledgement, and a write succeeds only when it exactly equals the server's freshly recomputed present/missing set.

Tests reject a non-UUID operation ID, malformed/future-tampered `expires_at`, a record-missing apply more than 30 days after its digest-bound expiry, absolute/escaping paths, target names with separators, duplicate resolution IDs, resolutions not offered by preview, `confirmed:false`, unknown journal states, conflict/evidence paths outside the knowledge base, malformed evidence expiry, duplicate observed conflicts, and recovery requests with any missing, extra, present↔missing, or changed conflict entry. Every response conflict uses the exact `present`/`missing` discriminant above; a `present` entry without a digest or a `missing` entry with one is invalid, and the client derives `observed_conflicts` only from those fields rather than evidence metadata. Replacing a conflicted path with a symlink/directory/non-regular type returns blocked with zero writes. Inject an external present↔missing/content change after set equality but before the first and a later recovery commit; both cases must stop without overwriting the new state, safely reverse only this recovery attempt's known writes, and return the refreshed set. An expired record-missing apply returns `preview_stale` with reason `preview_expired` and creates no lock/journal; the same expired request with an existing matching full journal or compact receipt returns that record byte-for-byte with zero writes. Ordinary operations carry an empty `retained_evidence`; a resolved conflict returns only non-reconstructable unchosen evidence with one common 30-day expiry. Recovery GET tests create two resolved-conflict receipts and prove both appear in `retained_evidence_receipts` across a fresh service instance, while expired/byte-free receipts do not.

- [ ] **Step 2: Implement schemas and route registry entries**

Export:

```ts
GraphRenamePreviewBodySchema
GraphRenamePreviewDataSchema
GraphRenameApplyBodySchema
GraphRenameApplyDataSchema
GraphRenameRecoveryQuerySchema
GraphRenameRecoveryDataSchema
GraphRenameRecoveryBodySchema
GraphRenameOperationDataSchema
GraphRenameConflictSchema
```

Use the portable filename validator again in the service; the body schema only rejects structurally unsafe input. The response schemas enforce relative POSIX paths, the five journal states, the separate five-value graph-publication status, and the four recovery outcomes. Do not add a sixth journal state for stale previews, rebuild status, or recovery errors; those remain separate fields/outcomes.

- [ ] **Step 3: Extract repository-root discovery and prove it survives build output paths**

Move the current private `findRepoRoot` logic from `graph.ts` into `repo-root.ts`:

```ts
export async function findRepoRoot(fromUrl: string = import.meta.url): Promise<string>;
export async function wikiLinkCliPath(fromUrl?: string): Promise<string>;
```

Test source execution, compiled `workbench/server/dist`-style nesting, a `.git` file used by worktrees, and a root-not-found failure. Both graph rebuild and rename scan import this module; no second upward-search implementation remains.

- [ ] **Step 4: Add failing path-boundary and exact-byte replacement tests**

Create `graph-rename-files.test.ts` with real temporary files. Assert `resolveKnowledgeBaseRenamePath`:

- accepts an existing regular Markdown file beneath the registered KB realpath;
- rejects `..`, absolute input, a symlinked source, a symlinked parent, a target outside the source directory, and a target whose parent realpath differs;
- rejects reserved names, invalid characters, trailing dot/space, portable-key collisions, and targets outside the formal six graph directories;
- accepts input with or without a trailing `.md`, removes at most that terminal suffix before adding the stored `.md`, and continues to allow ordinary dots inside the filename stem;
- allows Chinese/spaces/ordinary Unicode; and
- identifies same-portable-key case/NFC↔NFD changes as requiring a transit path.

Add a layout case where `pins[target_path]` already exists and assert preview rejects the rename instead of overwriting or merging the target pin.
If `.wiki-graph-layout.json` exists but is malformed, unreadable, or a symlink, preview must fail safely and leave it byte-identical; only a missing layout is treated as an empty layout.

For `applyByteRangeReplacements`, use one Buffer containing Chinese, emoji, two identical links on one line, an inline-code copy, and a fenced-code copy. Apply only parser-issued ranges from highest byte offset to lowest. Every replacement target must be the canonical full path `wiki/.../page.md`; assert exact expected bytes, preserved newline style/BOM/mode, and no code-example change. Change the file hash or one raw slice and assert the entire operation fails before producing staged bytes.

Run and confirm module-not-found failure.

- [ ] **Step 5: Implement safe path resolution, staging, and transit renames**

Create `graph-rename-files.ts` with:

```ts
export async function resolveKnowledgeBaseRenamePath(input: {
  kbPath: string;
  sourcePath: string;
  newName: string;
}): Promise<ResolvedRenamePaths>;

export function applyByteRangeReplacements(
  original: Buffer,
  replacements: ExactByteReplacement[],
): Buffer;

export async function stageRenameFile(input: StageRenameFileInput): Promise<StagedRenameFile>;
export async function commitStagedRenameFile(input: CommitStagedRenameFileInput): Promise<void>;
export async function renameSourceWithTransit(input: RenameSourceInput): Promise<string | null>;
export function migrateRenameLayoutKey(layout: GraphLayoutFile, fromKey: string, toKey: string): GraphLayoutFile;
```

Realpath the registered KB first. For existing resources, require `lstat().isFile()` and `realpath` containment; for new destinations, realpath the parent and reject any symlink component. Recheck every boundary immediately before staging and immediately before commit. Create each staged file beside its destination so its final replacement is on the same filesystem; use a unique hidden name containing `operation_id`, exclusive creation, original permissions, `fsync`, read-back hash, then atomic rename.

For equivalent case/Unicode names, reserve a same-directory transit name like `.llm-wiki-rename-<operation_id>-<counter>.md` only after both portable and actual occupancy checks. Persist old/transit/new paths before the first rename. Never directly rewrite `graph-data.json`.

- [ ] **Step 6: Add failing durable journal and single-lock tests**

Create `graph-rename-journal.test.ts`. Use `.wiki-tmp/rename-ops/active.lock` and `.wiki-tmp/rename-ops/<operation_id>/manifest.json`. Assert:

- `open(..., "wx", 0o600)` gives one operation per KB;
- a different operation receives `BUSY` without writes;
- operations in two different knowledge bases can proceed independently;
- the same operation ID and same preview digest reads/awaits the existing operation instead of applying twice;
- the same ID with different inputs is rejected;
- every state transition is temp-write + fsync + rename and only follows `prepared → applying → committed|rolled_back|conflicted`;
- the lock records operation ID/digest, owner PID, random server-instance ID, and creation time immediately; a minimal `prepared` manifest exists before any stage file, and backups, intended staged bytes, layout before/after bytes, completed-step order, old/transit/new paths, and original/intended hashes are durable before `applying`;
- terminal operations release only a lock whose contents match their own ID; and
- a lock with no manifest is released only when an injected liveness probe confirms its owner PID is dead; live/unknown owners remain BUSY/blocked; and
- malformed/unknown manifests return a blocked recovery record and are never guessed or deleted;
- an operation that never observed unknown external bytes atomically replaces the full manifest with a compact receipt after exact rollback verification, or after commit plus `graph_rebuild:"succeeded"`; the receipt contains operation ID, immutable request digest, terminal state, final hashes, and timestamps but no original/intended/staged Markdown or layout bytes;
- a user-resolved formerly `conflicted` operation removes ordinary stage/backup copies but retains each unchosen variant that cannot be reconstructed from the final KB under `evidence/`, records its relative path/hash plus `evidence_expires_at` exactly 30 days after resolution, and exposes that date/path in the recovery result;
- compaction/pruning removes only paths recorded as owned by that operation, never current knowledge files, and a retry with the same ID/digest still returns the receipt without writing; and
- with an injected clock, unresolved conflicts and fresh resolved evidence remain byte-identical, resolved evidence is deleted only at `evidence_expires_at`, and the now byte-free receipt is pruned only after both its 30-day terminal retention and any evidence retention have elapsed; because the digest-bound preview has already expired, replay after pruning returns `preview_expired` before journal creation.

- [ ] **Step 7: Implement the journal store**

Create `graph-rename-journal.ts` exposing:

```ts
export class GraphRenameJournalStore {
  acquire(input: AcquireRenameOperation): Promise<GraphRenameJournal>;
  read(operationId: string): Promise<GraphRenameJournal | GraphRenameReceipt | null>;
  writePrepared(input: PreparedRenameJournal): Promise<void>;
  transition(operationId: string, state: RenameJournalState, patch: JournalPatch): Promise<void>;
  listForStartup(): Promise<Array<GraphRenameJournal | GraphRenameReceipt | BlockedRenameJournal>>;
  preserveConflictVariant(input: PreserveConflictInput): Promise<string>;
  compactTerminal(input: { operationId: string; resolvedConflictEvidence?: PreservedEvidence[]; now: Date }): Promise<GraphRenameReceipt>;
  pruneExpiredOperationData(input: { now: Date; receiptRetentionMs: number; evidenceRetentionMs: number }): Promise<string[]>;
  release(operationId: string): Promise<void>;
}
```

The manifest stores only KB-relative paths. Journal and backup directories use mode `0700`; files use `0600`. `preserveConflictVariant` writes current/original/intended variants under the operation directory and returns relative evidence paths. Never remove a conflicted/nonterminal operation or a committed operation whose graph publication is not confirmed. An ordinary verified rollback or successful graph publication compacts immediately to a byte-free receipt. For a user-resolved conflict, compact only ordinary stage/backup copies; retain non-reconstructable unchosen evidence for exactly 30 days, return its deletion date and relative paths to the UI, then remove it via the injected-clock pruning pass. Retain the resulting byte-free receipt only until the later of terminal+30 days and `evidence_expires_at`, and prune opportunistically on startup and lock acquisition.

- [ ] **Step 8: Add failing no-write preview tests through the real root CLI**

In `graph-renames.test.ts`, copy the representative fixture and call `previewGraphRename` with the real `wiki-link-cli.js rename-scan` process. Hash all files first. Assert the preview:

- proposes only a same-directory `.md` target;
- includes deterministic updates for explicit-path and pre-rename-unique-bare occurrences, all rendered to canonical full target paths;
- updates an explicit self-link's page target while leaving `[[#heading]]` / `[[#^block]]` same-page anchors byte-identical;
- asks for every editable ambiguous bare occurrence whose candidate set includes the source;
- offers each candidate's exact canonical full-path replacement raw link while preserving embed, heading, block, alias, and pending wrappers;
- lists `raw/` and `.wiki-schema.md` hits as read-only and never includes them under editable files;
- reports the fixed-position key migration;
- rejects preview when the target layout key is already occupied, while preserving an already path-keyed unrelated pin byte-for-byte;
- contains `file_set_sha256`, every source hash/range/raw slice, one operation ID, and one canonical `preview_digest`; and
- leaves every knowledge-base file hash unchanged.

For every deterministic or user-chosen target, emit the complete POSIX knowledge-base-relative path including `.md`, for example `[[wiki/topics/page.md]]`. Preserve embed prefix, alias, heading/block anchor, pending wrapper, and surrounding bytes through `renderWikilinkReplacement`, but never emit a bare target or omit `.md`. This keeps a rewritten link unambiguous if another same-named page appears later.

- [ ] **Step 9: Implement preview orchestration with one parser invocation**

Create `graph-renames.ts` and invoke the root command with `spawn(process.execPath, [cliPath, "rename-scan", kbPath, sourcePath, newName], { shell:false })`. Consume stdout chunks without `execFile`'s fixed `maxBuffer`, enforce process exit/signal handling, then parse its one JSON document with shared contracts. `rename-scan` performs one inventory/target-index/source scan and emits all deterministic replacement alternatives; the server must not parse Markdown or reconstruct wikilink syntax again.

`previewGraphRename` validates registration and realpaths before invoking the CLI, reads the layout once, adds an injected-clock `expires_at` exactly 30 days in the future, includes it in the complete canonical preview digest, and returns without creating a journal, lock, stage file, backup, or Markdown write. Apply verifies the unchanged digest-bound expiry before acquiring the KB lock.

- [ ] **Step 10: Add failing apply, invalidation, idempotency, and rollback tests**

Exercise `applyGraphRename` on real files and assert:

1. A valid apply with every ambiguity resolved changes only previewed editable Markdown, writes every changed link as the canonical full path with `.md`, migrates the layout key, renames the source last, leaves read-only files and `graph-data.json` byte-identical, and requests one rebuild.
2. Adding/removing a file, changing any scanned file, changing a raw read-only file, changing layout pins, or changing one exact raw slice after preview returns `preview_stale` with zero writes/journal creation.
3. An Obsidian-style automatic link rewrite after preview invalidates the whole preview; no partial update proceeds.
4. Two concurrent identical applies return the same terminal operation and produce one set of writes and one rebuild; a later retry returns the journal state without writing again.
5. A write failure after two committed files rolls back in reverse order when current hashes still match this operation.
6. An external edit to an untouched future file stops subsequent writes and safely rolls back already written files.
7. An external edit to a file already written by the operation preserves that edit, original backup, and intended version, then enters `conflicted`.
8. Case-only and NFC↔NFD equivalent renames use the recorded transit path and finish correctly on the current platform.
9. A synchronously failing rebuild trigger returns `committed + graph_rebuild:"failed"`; committed Markdown is not rolled back.
10. Restarting from `committed + graph_rebuild:"failed"` leaves Markdown untouched, detects that the published graph still has the old path, and requests exactly one rebuild; a successful event records `succeeded`, while another failure remains visible and retryable.
11. After the injected clock passes `expires_at`, a replay returns an existing matching receipt byte-for-byte if it is still retained; after that receipt is pruned, the same replay returns `preview_stale:preview_expired` with zero lock, journal, content, layout, or rebuild writes.
12. While one committed operation remains graph-unpublished, another preview may remain read-only but every new apply returns `BUSY` with `rebuild_required`; after verified graph success/compaction, a fresh rename can proceed.

Inject hooks only at file-commit/rebuild process boundaries. All content operations use real filesystem bytes.

Create `graph-rename-portability.test.ts` around the production rename/journal code. On a real temporary filesystem it must execute both a case-only and an NFC↔NFD rename, record old → transit → target, then spawn `graph-rename-crash-child.ts` to exit between the two renames and recover in a fresh process. Assert exactly one final target, no old/transit duplicate, unchanged unrelated bytes, and an idempotent second recovery. Extend `path-portability.yml` with `npm ci` and this exact test after the Task 2 pure-Node suite so Ubuntu, macOS, and Windows test the real transit operation rather than only `requires_transit` classification.

- [ ] **Step 11: Implement apply as validate-all, stage-all, then commit**

`applyGraphRename` must follow this exact order:

1. If the operation journal/receipt exists, verify the same immutable inputs and return/await it regardless of `expires_at`; this branch is read-only and cannot repeat writes.
2. Only when no record exists, verify the digest-bound `expires_at` against the injected clock; an expired request returns `preview_stale:preview_expired` before acquiring a lock.
3. Acquire the KB lock.
4. Rerun the full rename scan and layout read; compare `operation_id`, `expires_at`, `file_set_sha256`, all file hashes/ranges/raw slices, target occupancy, layout digest, ambiguity offerings, and `preview_digest`.
5. If anything differs, release the lock and return `preview_stale` before journal/staging.
6. Require one allowed resolution for every editable ambiguous occurrence and reject extras.
7. Create the operation directory, minimal `prepared` manifest, and original backups immediately after the lock; no stage or final write may precede this durable record.
8. Build every final Buffer with descending exact ranges; stage/read-back all editable Markdown plus layout, then atomically update the `prepared` manifest with every intended hash/stage path.
9. Suspend the graph watcher only to coalesce events, transition to `applying`, and commit each staged file while recording each completed step.
10. Commit the layout, then rename the source Markdown last; use transit when required.
11. Recheck the final complete state, transition to `committed` with persisted expected graph paths and `graph_rebuild:"not_started"`, release the lock, resume the watcher with one trigger, persist its started/queued/failed result, and return that result.
12. On an in-process error, compare current/original/intended hashes and rollback safe steps in reverse. Never overwrite an unknown external version; preserve all three variants and mark `conflicted` instead.

If the process dies after acquiring the lock but before the minimal manifest rename, recovery may release that orphan lock only after the recorded owner PID is confirmed dead; if liveness is unknown or that PID is alive, return blocked/BUSY rather than guessing. This is safe because the implementation invariant forbids all stage/final writes before the manifest. A crash during staging leaves a `prepared` manifest; recovery removes only recorded operation-owned stage files and restores no user file because none was committed.

Extend `resumeGraphWatcher` with `{ trigger?: boolean, discardPending?: boolean }` and a returned build status. A successful commit consumes all suspended watcher noise and calls the rebuild queue exactly once. A complete rollback discards pending rename/rollback events. When the matching `graph_updated` event arrives, reread the published graph and require the target path to exist in node identity/source-path fields and the old path to be absent from those same fields before persisting `graph_rebuild:"succeeded"` and compacting the terminal journal. Ordinary operations become byte-free immediately; formerly conflicted operations keep only their explicitly listed unchosen evidence until `evidence_expires_at`. A `graph_error`, process exit, or mismatched graph persists `failed`/pending state and keeps the full recoverable record. This listener mechanism is never used as the operation lock.

- [ ] **Step 12: Prove recovery across an actual process exit**

Create `graph-rename-crash-child.ts`. It starts a real apply with a test hook that calls `process.exit(73)` after a configured committed step, leaving the durable journal untouched. The parent test must:

1. spawn the child with `node --import tsx` against a temporary KB;
2. assert exit `73` and an `applying` manifest;
3. instantiate a fresh service as a restarted process would;
4. recover an all-intended final state as `committed`, or a mixed known state by safe rollback to `rolled_back`;
5. modify one already-written file before restart and assert `conflicted` plus preserved current/original/intended copies; and
6. crash once between old-name → transit-name and transit-name → equivalent new-name, then recover without losing or duplicating the source; and
7. rerun recovery to prove idempotency and no second write/rebuild; and
8. verify an ordinary rolled-back operation compacts immediately, an ordinary committed operation does not compact before graph success and then becomes byte-free, an unresolved conflict is never pruned, and a user-resolved conflict keeps only unchosen evidence with a 30-day expiry before becoming byte-free.

Do not simulate this acceptance only by throwing in the same process.

- [ ] **Step 13: Implement startup/selection recovery and explicit conflict resolution**

`recoverGraphRenameOperations(kbPath)` scans every record returned by `listForStartup()` before the graph watcher starts, including nonterminal/conflicted journals and committed records whose graph publication is not `succeeded`:

- `prepared` with no writes becomes `rolled_back`;
- `applying` with all original bytes becomes `rolled_back`;
- `applying` with a complete verified intended state becomes `committed`;
- a mixed state containing only known original/intended bytes safely rolls back in reverse;
- any unknown current bytes become `conflicted` with three preserved variants; and
- invalid/unknown state returns `blocked` and prevents a new rename;
- `committed` with graph node identity already containing the target path and not the old path becomes `graph_rebuild:"succeeded"` without another rebuild, then applies the ordinary/resolved-conflict compaction policy; and
- `committed` with a missing/stale/unreadable graph returns `needsRebuild` without changing knowledge files, even when the prior process already recorded `failed`, `started`, or `queued`; and
- a terminal receipt, with or without still-live resolved-conflict evidence, causes no content recovery/rebuild and is considered only by the evidence/receipt pruning pass.

Recovery POST acquires the same KB lock, recomputes the authoritative current conflicts from disk, canonicalizes them by `(source_path, current_state, current_sha256?)`, and requires exact set equality with `observed_conflicts`. Input order alone is irrelevant after canonicalization; any missing, extra, duplicate, present↔missing, or digest-changed entry returns the refreshed `required` state with zero writes. A symlink, directory, or other non-regular current resource returns `blocked:unsafe_current_type`. `finish_commit` preserves every present external variant, records missing variants explicitly, then stages the complete intended state. `finish_rollback` preserves every present current variant, records missing variants explicitly, then stages all original state. Both actions reread and compare every present/missing state immediately before its replacement; a late external change stops subsequent writes, safely reverses only known writes from this recovery attempt, preserves unknown bytes, and returns the refreshed state. Only after exact final verification may the operation transition to the requested terminal state and trigger one rebuild when the chosen final state differs from the currently published graph.

Call recovery after `bootstrapFromConfig()` and before `watchKnowledgeBaseGraph()` for the bootstrapped active KB. Recovery returns `needsRebuild`; start the watcher first, then trigger exactly one rebuild for the sole committed-but-unpublished operation, never while the watcher is absent. Persist the new started/queued/failed status before serving recovery GET. Add the same ordered scan → watcher start → optional single trigger sequence to knowledge-base selection. The application still starts when content recovery is blocked so Task 6 can display the error, but new rename apply calls for that KB return the existing `BUSY` code with a recovery-required message. A graph-only pending operation returns `rebuild_required`, does not block reading or a rebuild retry, but does block a new rename so a KB can never accumulate multiple unpublished operations. After scanning, prune resolved-conflict evidence only after its recorded expiry, then prune a byte-free receipt only after all retention deadlines; never prune a full unresolved journal.

- [ ] **Step 14: Assemble routes and test the trusted-local boundary**

Create `routes/graph-renames.ts` with dependency injection and `resolveKnowledgeBaseContext` on all four routes. Route tests cover active-KB fallback, explicit registered KB, body/query disagreement, unregistered KB, cross-site/capability middleware through `createApp`, invalid JSON, stale preview as a successful business outcome, nonterminal/content-recovery/rebuild-required BUSY operations, and redacted internal errors.

Add `GraphRenameRouteService` to `WorkbenchAppDeps`, `createApp`, and `createRuntimeApplication`. Production uses the default service; tests can inject only process/file/rebuild boundary hooks. Confirm `app.test.ts` observes all four endpoints and the endpoint registry has no missing route.

- [ ] **Step 15: Run all rename backend and integration gates, commit, and review**

Run:

```bash
npm run test -w @llm-wiki/workbench-contracts
npm run build -w @llm-wiki/workbench-contracts
node --import tsx --test \
  workbench/server/src/repo-root.test.ts \
  workbench/server/src/graph-rename-files.test.ts \
  workbench/server/src/graph-rename-portability.test.ts \
  workbench/server/src/graph-rename-journal.test.ts \
  workbench/server/src/graph-renames.test.ts \
  workbench/server/src/graph-renames-crash.test.ts \
  workbench/server/src/graph-rename-routes.test.ts \
  workbench/server/src/graph-watcher.test.ts \
  workbench/server/src/knowledge-base-routes.test.ts \
  workbench/server/src/app.test.ts
node --import tsx --test workbench/server/test/runtime-app.test.ts
npm run typecheck -w @llm-wiki-agent/server
```

Expected: all commands exit `0`; crash child exits are asserted by the parent; every successful/rolled-back/conflicted/rebuild-pending case preserves all required bytes, no request can acknowledge a partial conflict set, ordinary terminal compaction leaves no copied content, resolved-conflict evidence obeys its visible 30-day deadline, and no path issues a duplicate rebuild.

```bash
git add packages/workbench-contracts workbench/server .github/workflows/path-portability.yml
git commit -m "feat: add recoverable graph page rename backend [task 5]"
```

Run `/code-review <TASK_BASE>` against the V3 spec and clear both review axes before adding the UI.

### Task 6: Add Rename/Recovery UI, Real-Browser Acceptance, and Release Evidence

**Files:**
- Create: `workbench/web/src/lib/api/graph-renames.ts`
- Create: `workbench/web/test/graph-renames-api.test.ts`
- Create: `workbench/web/src/components/GraphRenameDialog.tsx`
- Create: `workbench/web/test/graph-rename-dialog.test.tsx`
- Modify: `workbench/web/src/components/GraphWarningsBanner.tsx`
- Modify: `workbench/web/test/graph-warnings-banner.test.tsx`
- Modify: `workbench/web/src/components/GraphReader.tsx`
- Modify: `workbench/web/src/components/RightDrawer.tsx`
- Modify: `workbench/web/src/App.tsx`
- Modify: `workbench/web/test/right-drawer-interactions.test.tsx`
- Modify: `workbench/web/test/graph-panel-paper.test.tsx`
- Modify: `workbench/web/src/index.css`
- Modify: `workbench/server/test/browser-entry.ts`
- Modify: `workbench/web/test/browser/support/browser-harness.ts`
- Modify: `workbench/web/test/browser/browser-main-flows.test.ts`
- Modify: `workbench/web/test/browser/run-browser-main-flows.mjs`
- Create: `docs/graph/2026-07-20-path-identity-production-acceptance.md`
- Modify: `docs/superpowers/specs/2026-07-19-graph-id-collision-governance-design.md`
- Modify: `workbench/PRODUCT.md`
- Modify: `workbench/CONTEXT.md`
- Modify: `packages/graph-engine/CONTEXT.md`
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `CHANGELOG.md`

**Pre-agreed TDD seams:** the typed rename API client, `GraphRenameDialog` DOM state machine, warning/page entry callbacks, App recovery-on-KB-selection behavior, and real browser flows using the production frontend/backend with test-only injected boundary hooks.

**Interfaces:**
- Consumes: Task 5 preview/apply/recovery responses, warning candidate sets, a selected graph page, persistent graph-publication status, graph SSE success/failure, and the active KB lifecycle.
- Produces: explicit preview/confirmation, ambiguity choices, stale-preview handling, full-set conflict recovery, rebuild retry that survives restart, visible graph refresh, and checked release evidence.

- [ ] **Step 1: Add failing typed API-client tests**

Create `graph-renames-api.test.ts` and assert exact method/path/query/body/schema use for:

```ts
previewGraphRename(kbPath, sourcePath, newName)
applyGraphRename(kbPath, request)
getGraphRenameRecovery(kbPath)
resolveGraphRenameRecovery(kbPath, request)
```

Test successful preview, `preview_stale`, committed, conflicted, all five graph-rebuild values, clear/required/rebuild-required/blocked recovery, zero/one/multiple retained-evidence receipts on every recovery outcome, invalid server envelopes, and capability-token propagation through the shared `request()` client. No client method accepts absolute paths or an arbitrary list of replacement bytes.

- [ ] **Step 2: Add failing dialog state-machine DOM tests**

Create `graph-rename-dialog.test.tsx`. Use contract-valid fixtures and fake only the API/time boundary. Cover:

1. Warning entry with four candidates first asks which existing page is being renamed.
2. Page entry starts with its `source_path` fixed.
3. Invalid filename feedback appears before preview; valid Chinese/space names remain allowed.
4. Preview shows old/new path, editable file/occurrence counts, every read-only reference, layout migration, and each ambiguity as a required radio group.
5. Apply remains disabled until all ambiguity choices and the explicit confirmation checkbox are complete.
6. Two immediate click events result in one API apply call using the same `operation_id`.
7. `preview_stale` shows “预览已失效”, performs no optimistic success, and offers a fresh preview.
8. Committed result shows “页面已安全改名”; a graph rebuild failure or `rebuild_required` startup result shows “内容已保存，图谱尚未更新” plus retry and never offers content rollback.
9. Conflicted recovery lists every relative path and preserved variant, visibly distinguishes an existing current file from an externally deleted one, requires choosing “完成提交” or “恢复原状”, then sends the complete observed present/missing set. After resolution it shows each retained unchosen evidence path and its exact automatic-deletion date.
10. A changed, present↔missing, extra, or duplicate conflict entry refreshes recovery rather than overwriting; the UI replaces its entire displayed set from that response. An unsafe current type shows blocked state and no resolution button.
11. Blocked unknown/invalid journal state shows a non-destructive error and no apply action.
12. Cancel/Escape/backdrop close works for ordinary preview without calling apply or changing fixture hashes, but applying/required recovery cannot be dismissed until the backend reaches a safe state.

Assert focus trap/return, dialog labels/descriptions, keyboard radio selection, live progress, disabled state, and reduced-motion behavior.

- [ ] **Step 3: Implement the API client and dialog one state at a time**

Create `graph-renames.ts` as thin contract-validated calls. Create `GraphRenameDialog.tsx` with explicit modes:

```text
choose-source → edit-name → loading-preview → review-preview
review-preview → applying → committed | stale | conflicted
recovery-loading → recovery-required | rebuild-required | recovery-blocked → terminal
```

Keep the server preview as the only source of editable bytes/candidates. Store only the selected candidate paths by occurrence ID. Set an in-flight ref synchronously before awaiting apply so double-clicks cannot race React rendering. Never claim rollback/commit success until the returned operation is terminal.

Use existing Paper dialog language and tokens; do not introduce a general Markdown editor, raw JSON view, or offline write control.

- [ ] **Step 4: Wire the two deliberate entry points**

Add `onResolveWarning` from `App` through `GraphPanel` to `GraphWarningsBanner`. For an ambiguity or portable-collision warning, filter its exact candidate set to formal editable graph pages and pass it into the dialog; if none remain, keep the warning read-only. Do not show “解决” for broken, pending, noncanonical, or engine-only groups—the rename workflow cannot honestly create a missing page or act as a generic link editor.

Add a separate “安全改名” button to `GraphReader` when `payload.node.sourcePath` is a formal graph-page path. Pass `onRenamePage(sourcePath)` through `RightDrawer`; do not expand the graph-engine page-action vocabulary or show the action for non-graph/read-only pages.

After a terminal commit/rollback, close only when the user acknowledges it. Let the existing graph SSE refresh deliver the new path IDs; clear stale drawer selection if its old source path no longer exists.

- [ ] **Step 5: Add failing App recovery-on-selection tests**

In a DOM test around `App` or its extracted recovery hook, assert each active-KB change calls `getGraphRenameRecovery` after the KB context is applied and before allowing a new rename dialog:

- `clear` does nothing;
- `required` opens the non-dismissible recovery dialog;
- `rebuild_required` keeps the readable graph mounted with a persistent stale-graph notice and retry action, disables new rename entry until graph publication succeeds, but never exposes finish-commit/finish-rollback;
- `blocked` opens the blocked explanation and keeps rename entry disabled;
- rapidly switching KBs ignores the previous request's late response; and
- completing recovery rechecks the current KB and reenables entries only on `clear`/terminal state.

For every primary status, render all unexpired `retained_evidence_receipts` in a separate dismissible notice showing operation ID, relative evidence paths, hashes, and automatic-deletion dates. The notice does not block a new rename, but dismissing it only hides the current UI instance; switching back/restarting reloads it until server expiry. Also run the check on initial startup restoration, not only manual selection.

- [ ] **Step 6: Implement App ownership and graph rebuild retry**

`App` owns one dialog descriptor containing the KB path, optional source path, optional warning/candidate set, and optional recovery record, plus a separate list of retained-evidence receipts for the active KB. Cancel/ignore async responses with a monotonically increasing request ID on KB change.

When apply reports `graph_rebuild:"failed"`, matching post-commit SSE becomes `graph_error`, or startup/selection returns `rebuild_required`, keep the successful content state and show a retry button that calls the existing `rebuildGraph(kbPath)`. A retry updates only the derived graph; it never reapplies the rename. Keep the notice across component remounts and application restarts by rereading recovery state; clear it only after the server reports `graph_rebuild:"succeeded"`/`clear` following a verified `graph_updated`. Retain the operation's completed message and never offer content rollback for a graph-only failure.

- [ ] **Step 7: Extend Paper DOM and visual checks before browser automation**

Add light/dark, 320 px, long Chinese/Unicode filename, many occurrences, read-only alert, stale preview, conflict, blocked recovery, rebuild-failed, and restart-restored `rebuild_required` fixtures to component tests. Assert no horizontal page overflow, the primary action remains visible, candidate rows wrap, and danger text is not the only signal.

Run:

```bash
node --import tsx --test \
  workbench/web/test/graph-renames-api.test.ts
node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test \
  workbench/web/test/graph-rename-dialog.test.tsx \
  workbench/web/test/graph-warnings-banner.test.tsx \
  workbench/web/test/right-drawer-interactions.test.tsx \
  workbench/web/test/graph-panel-paper.test.tsx
npm run lint -w @llm-wiki-agent/web
npm run typecheck -w @llm-wiki-agent/web
```

Expected: all commands exit `0`.

- [ ] **Step 8: Add deterministic real-browser boundary controls without production fakes**

Extend only `workbench/server/test/browser-entry.ts` to inject Task 5 service hooks controlled by files inside the isolated browser-test home:

```text
browser-rename-pause-before-commit
browser-rename-paused
browser-rename-resume
browser-rename-crash-after-write
browser-rename-rebuild-fail-once
```

The production runtime never reads these files; the browser entry builds a service with injected `beforeFileCommit`, `afterFileCommit`, and `triggerRebuild` boundaries. Keep the existing production-build assertion that browser fakes/test markers do not appear in `workbench/server/dist`.

The harness gains helpers to create the full warning/rename KB fixture, wait for a journal state, restart the backend, and hash all knowledge files. Helpers return only isolated test paths and sanitize them from reports.

- [ ] **Step 9: Run the complete rename journey through the real browser and backend**

Extend `browser-main-flows.test.ts` with these ordered journeys against a copied temporary KB:

1. **Warning to preview:** open graph, expand paged ambiguity details, click “解决”, choose the source page, enter a new name, and verify editable/read-only/ambiguous preview rows.
2. **Apply and idempotency:** choose each ambiguity, confirm, dispatch two immediate clicks, observe one journal/rename/rebuild, then read the renamed page, assert every changed wikilink uses a complete `wiki/.../page.md` target, and inspect exact filesystem hashes.
3. **Preview invalidation:** preview another rename, edit one referenced Markdown file from the parent test, apply, see stale notice, and prove no previewed write occurred.
4. **Equivalent rename:** perform a case-only or NFC↔NFD filename change, prove the transit name disappears and the final page/link/layout pin work.
5. **Crash and startup recovery:** enable crash-after-write, apply, assert the backend exits, externally edit the written file, restart the backend, reload/select the KB, and see the recovery dialog before any new rename action.
6. **Conflict preservation and full acknowledgement:** after the dialog loads conflicts, create one more external conflict and delete another current conflict file, then submit the old displayed set; assert the server refreshes the complete present/missing set with zero writes. Then choose finish rollback (and a separate fixture for finish commit), assert current/original/intended evidence copies or explicit missing records exist until resolution, no silent content loss occurred, and the operation reaches the requested terminal state. Verify ordinary backups/stages are removed while each unchosen non-reconstructable variant remains at the displayed relative path with the displayed 30-day deletion date. Restart the backend and prove the retained-evidence notice returns without blocking a fresh rename; Task 5's injected-clock journal test owns the just-before/at-expiry deletion proof.
7. **Rebuild failure across restart:** fail the one post-commit rebuild, confirm the renamed Markdown remains correct while the dialog says the graph is stale, restart the backend before clicking retry, and assert the stale notice returns from persisted `rebuild_required` state. Remove the failure flag, retry, wait for the new path node in the readable graph, assert recovery becomes clear/`succeeded`, and verify only a byte-free terminal receipt remains.

For every journey assert browser requests stay localhost-only, rendered text contains no absolute KB/home path, and cleanup terminates browser/Vite/server even after the intentional server crash. Measure the expanded suite and raise the named test timeout plus `run-browser-main-flows.mjs` command/total budgets only to that upper bound with the existing cleanup allowance; keep per-operation waits bounded and do not replace deterministic waits with sleeps.

- [ ] **Step 10: Update product language and release-facing docs after behavior is green**

Create `docs/graph/2026-07-20-path-identity-production-acceptance.md` with the tested implementation commit/range, each V3 section 9.2 row, its exact automated/browser command, local pass evidence, two temporarily pending three-platform rows (Stage 2 path portability and Stage 3 equivalent-rename portability), and any intentionally deferred item. Do not try to make the report contain its own future commit hash. Do not mark either portability row complete until its exact Ubuntu, macOS, and Windows jobs are green.

Update:

- `workbench/PRODUCT.md` with readable warning state, derived sidecar, safe same-directory rename, full-set conflict acknowledgement, persistent rebuild-required state, immediate ordinary cleanup, and visible 30-day retention for resolved-conflict evidence;
- `workbench/CONTEXT.md` with user-facing terms “图谱告警” and “安全改名/恢复”; and
- `packages/graph-engine/CONTEXT.md` with path identity and warning meaning shared by both hosts.

At implementation time, read the newest top CHANGELOG version and increment its patch component once. From the current baseline that would be `v3.6.87`, but recalculate if another release landed. Add one CHANGELOG entry covering the path-safe graph, explanations, and optional recovery flow. Update both README feature lists and both version badges to that same version. Leave root package versions and the independently versioned legacy `SKILL.md` frontmatter unchanged unless the then-current release convention explicitly changed.

- [ ] **Step 11: Commit the UI and release documentation as separate logical units**

After focused tests and browser journeys pass:

```bash
git add workbench/web workbench/server/test workbench/web/test
git commit -m "feat: add graph rename and recovery experience [task 6]"

git add \
  CHANGELOG.md README.md README.en.md \
  workbench/PRODUCT.md workbench/CONTEXT.md packages/graph-engine/CONTEXT.md \
  docs/graph/2026-07-20-path-identity-production-acceptance.md
git commit -m "docs: record graph identity production acceptance [task 6]"
```

Stage only these intended files. The implementation plan is tracked but must remain unchanged during implementation; never stage an execution-time edit to it, the questionnaire, or the conflict-copy specs.

- [ ] **Step 12: Run the final local acceptance matrix**

Run from the repository root:

```bash
TASK_BASE=$(git rev-parse refs/llm-wiki/task-base)
bash tests/regression.sh
npm run quality-and-tests
npm run test:browser:main-flows -w @llm-wiki-agent/web
bash tests/graph-offline-warnings.regression-1.sh
node --import tsx --test workbench/server/src/graph-rename-portability.test.ts
npm run visual:paper -w @llm-wiki-agent/web
codex_install_plan=$(mktemp)
claude_install_plan=$(mktemp)
bash install.sh --dry-run --platform codex | tee "$codex_install_plan"
bash install.sh --dry-run --platform claude | tee "$claude_install_plan"
grep -F 'deps ->' "$codex_install_plan"
grep -F 'deps ->' "$claude_install_plan"
test -f deps/unicode/CaseFolding-17.0.0.txt
test -f deps/unicode/UnicodeData-17.0.0.txt
test -f deps/unicode/DerivedNormalizationProps-17.0.0.txt
test -f deps/LICENSE-unicode.txt
```

Run the repository-requested phrase scan and inspect its candidates; policy/example/evidence lines are expected, but no changed document may contain the real home directory or a concrete user-home path:

```bash
TASK_BASE=$(git rev-parse refs/llm-wiki/task-base)
grep -r '本机用户路径\|真实姓名\|私有素材路径' \
  README.md README.en.md AGENTS.md CLAUDE.md docs/ workbench/ packages/graph-engine/CONTEXT.md \
  > /tmp/llm-wiki-privacy-candidates.txt || true
grep -r '本机用户路径\|真实姓名\|私有素材路径' scripts/ templates/ tests/ SKILL.md \
  >> /tmp/llm-wiki-privacy-candidates.txt || true
npm run check:privacy

if git diff --unified=0 "$TASK_BASE"..HEAD -- \
  README.md README.en.md docs/ workbench/ packages/graph-engine/CONTEXT.md \
  | grep -F "$HOME"; then
  exit 1
fi
```

Validate every local Markdown link in changed documentation without adding a dependency:

```bash
TASK_BASE=$(git rev-parse refs/llm-wiki/task-base)
export CHANGED_MARKDOWN_FILES="$(git diff --name-only --diff-filter=ACMR "$TASK_BASE"..HEAD -- '*.md')"
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const files = process.env.CHANGED_MARKDOWN_FILES.split("\n").filter(Boolean);
const failures = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/\[[^\]]*\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    let target = match[1].replace(/^<|>$/g, "");
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    target = decodeURIComponent(target.split("#", 1)[0]);
    if (!target) continue;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) failures.push(`${file}: ${match[1]}`);
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
NODE
git diff --check "$TASK_BASE"..HEAD
```

Expected: every command exits `0`; privacy candidates contain only policy/example/evidence wording after inspection and no concrete private path; local links resolve; visual evidence is readable; both installers copy the managed `deps` directory containing the Unicode files; and no Markdown source hash changes outside explicit rename tests.

- [ ] **Step 13: Require the three-platform gate and rerun two-axis review**

First run the task's two-axis review while all code and draft evidence are committed locally:

```text
/code-review <TASK_BASE> docs/superpowers/specs/2026-07-19-graph-id-collision-governance-design.md
```

Resolve every Standards or Spec finding with a separate commit and regression test where behavior changed, rerun the same review against the unchanged `$TASK_BASE`, then rerun the final local matrix.

Push the feature branch and create a draft PR so the pull-request-triggered portability workflow can run:

```bash
BRANCH=$(git branch --show-current)
git push -u origin "$BRANCH"
gh pr create --draft \
  --title "feat: make graph path identity collision-safe" \
  --body "Implements the reviewed V3 graph identity, warning, and recoverable rename plan."
gh pr checks --watch
```

Require `.github/workflows/path-portability.yml` to be green on Ubuntu, macOS, and Windows. Each matrix job must show both the Task 2 fixed-Unicode/path suite and Task 5 `graph-rename-portability.test.ts`; a green classification-only suite is insufficient. If any platform differs, return to the relevant `/implement` task with a failing portability or real-transit test; do not waive either portability acceptance row.

After the three jobs are green, add each job's Stage 2 and Stage 3 result plus the tested implementation head to the production acceptance report, change the V3 spec section 9.2 heading/status to link that evidence, and only then mark both portability rows and full production acceptance complete:

```bash
git add \
  docs/graph/2026-07-20-path-identity-production-acceptance.md \
  docs/superpowers/specs/2026-07-19-graph-id-collision-governance-design.md
git commit -m "docs: confirm cross-platform graph identity acceptance [task 6]"
git push
gh pr checks --watch
```

Rerun `/code-review <TASK_BASE>` one final time against the same V3 spec, clear any finding with a separate commit, rerun affected plus full local gates, push, and wait for checks again. Mark the draft PR ready with `gh pr ready` only when both review axes and every required check are clear; do not merge it in this plan's execution. Then remove the private local ref with `git update-ref -d refs/llm-wiki/task-base`.

The implementation is complete when the PR contains all six reviewed task gates, the V3 acceptance report has evidence for every row, and Tasks 1-4 remain usable even if the user never invokes rename.

## Spec Traceability Audit

This table is a required execution checklist, not background prose. A task review cannot be marked clear while its mapped spec section is untested.

| V3 section | Implemented / verified by |
|---|---|
| §2 Goals and non-goals | Global Constraints and Scope Check keep path identity, deterministic resolution, warnings, compatibility, and optional safe rename in scope; Tasks 5-6 explicitly reject cross-directory move and a general Markdown editor. |
| §3 D1-D3 | Tasks 2-3 path IDs, all-KB basename uniqueness, exact paths, aliases/anchors/self/attachments, and production builder fixture. |
| §3 D4-D6 | Task 1 entry normalization/generated-ID allocation/input+engine warnings; Tasks 3-4 compact paired warning artifacts and both hosts. |
| §3 D7-D10 | Tasks 3 and 5-6 keep every headless flow read-only, require explicit preview/confirmation, use strict check separately, and rebuild rather than edit `graph-data.json`. |
| §3 D11-D15 | Six gates preserve the three product stages; Task 2 fixes Unicode/discovery; Task 5 journals/locks/recovers; Tasks 1 and 4 align first-refresh graph identity and pins. |
| §4 Evidence | Preflight reruns the retained direction proof; Task 6 creates production evidence rather than treating §9.1 prototypes as completion. |
| §5.1 Discovery | Task 2 exact inventory fixtures/policy arrays; Task 3 production consumers; Task 5 read-only versus editable rename preview. |
| §5.2 Build graph | Tasks 2-3 resolver/builder/pair commit; Task 1 engine boundary; Task 4 readable consumers. |
| §5.3 Active rename | Task 5 backend data flow/journal/recovery and Task 6 confirmation/recovery/retry UI. |
| §6.1 Shared parser/index | Task 2 byte scanner/index/resolver and Task 5 real `rename-scan` process, with no server re-parser. |
| §6.2 Portable filename | Task 2 Unicode/validator on three platforms and Task 5 production transit rename/crash-recovery test on the same three-platform matrix. |
| §6.3 Generator | Task 3 path-ID builder, all reference migration, paired artifact commit, and Markdown hash proof. |
| §6.4 Engine | Task 1 shared normalization, opaque IDs, unique collections, and old-data compatibility. |
| §6.5 Workbench | Task 4 ready warnings/pagination/security/pins; Tasks 5-6 operation lock, recovery, and deliberate resolve entry. |
| §6.6 Offline/CLI/CI | Tasks 2-3 exit contracts, strict gate, offline detail budget, and no write action; Task 6 final CI evidence. |
| §7 Warning contract | Task 1 warning model, Task 2 stable IDs, Task 3 canonical compact artifacts and 2 MiB reducer, Task 4 Zod/API pagination. |
| §8 Error/recovery boundary | Task 3 degraded-build/system-failure split; Task 4 readable mismatch; Task 5 every rename invalidation/rollback/conflict/crash state, exact conflict-set equality, persistent rebuild publication, ordinary compaction, and bounded resolved-conflict evidence; Task 6 browser proof across restart. |
| §9 Feasibility/acceptance | Preflight preserves §9.1 as direction evidence; the row-by-row matrix below and Task 6 production report own §9.2. |
| §10 Phases | Tasks 1, 2-4, and 5-6 are the engine, path/warning, and optional rename stages respectively; every stage has its own commit/review gate. |
| §11 Migration/compatibility | Tasks 1 and 4 cover legacy graph IDs, semantic edges, communities, pins, SSE; Task 3 keeps both hosts and old valid input readable. |
| §12 Risks | Tests explicitly cover wrong links, byte corruption, portable collisions, mixed artifacts, external edits, crash/transit recovery, warning size, one-pass scanning, and false first-refresh growth. |

### Section 9.2 Production-Acceptance Mapping

| §9.2 row | Task(s) | Required evidence named in this plan |
|---|---|---|
| 文件发现（阶段二） | 2 | `wiki-file-discovery.test.js` proves all three policy arrays, symlink rejection, generated-artifact/hidden-directory exclusion, and an unchanged file-set digest when only excluded files change; Task 5 later consumes the already-accepted rename view. |
| 生成与解析（阶段二） | 2, 3 | `wikilink-parser.test.js`, `wiki-link-index.test.js`, `graph-path-identity-build.regression-1.sh`. |
| 精确位置（阶段二） | 2 | UTF-8 round-trip parser fixture covers Chinese, emoji, repeated text, and code exclusions. |
| 预览失效（阶段三） | 5, 6 | `graph-rename-files.test.ts`, full digest/hash/slice/layout invalidation, Obsidian change, and browser stale-preview journey. |
| 引擎兜底（阶段一） | 1 | `graph-input-normalization.test.ts`, raw/projection parity, generated-ID and merged-warning assertions. |
| 告警存储（阶段二） | 3, 4 | `graph-warning-bundle.test.js` crash/tamper/compact tests; `graph-warnings.test.ts`; route cursor pages. |
| 工作台告警（阶段二） | 4 | banner DOM/API tests and real-browser readable graph plus complete paginated warning journey. |
| 工作台改名（阶段三） | 5, 6 | resolve/recovery/rebuild-required contracts, retained-evidence notice, and real-browser rename/restart journeys. |
| 离线 HTML（阶段二） | 3 | below/above-budget unit cases plus `graph-offline-warnings.mjs` on the generated `file://` page. |
| 首次迁移（阶段二） | 1, 4 | `diff-path-identity-migration.test.ts` and watcher/layout pin migration tests, including reorder and ambiguity. |
| CLI / CI（阶段二） | 2, 3, 4/6 | `graph-warning-exit-codes.regression-1.sh`, Markdown hash proof, registered quality/browser gates, and the applicable core/full final checks. |
| 路径可移植性（阶段二） | 2, 4/6 | Full Unicode 17 NFC conformance and case-fold/validator tests in `path-portability.yml` on Ubuntu/macOS/Windows; Task 4 core-only gate or Task 6 full gate records the run. |
| 等价改名可移植性（阶段三） | 5, 6 | `graph-rename-portability.test.ts` executes real old→transit→target and crash recovery in the same Ubuntu/macOS/Windows matrix. |
| 性能（阶段二） | 2, 3 | real scan metrics and `wiki-link-performance.test.js` linear-size bound plus offline threshold cases. |
| 主动改名（阶段三） | 5, 6 | real-filesystem apply/rollback/conflict tests, exact full-set acknowledgement, ordinary immediate cleanup, resolved-conflict evidence expiry, actual child-process crash, rebuild-failure restart, route tests, and seven ordered browser journeys. |

Every row must appear with a passing command and evidence link in `docs/graph/2026-07-20-path-identity-production-acceptance.md`. “Covered by another row” is not an acceptable final status.

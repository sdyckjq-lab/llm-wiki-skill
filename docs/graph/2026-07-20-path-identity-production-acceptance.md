# Path identity and safe rename production acceptance

Date: 2026-07-23

Release: v3.6.89

Scope: Tasks 1–6, including path identity, readable graph warnings, derived warning details, optional safe same-directory rename, complete preview confirmation, external-edit and crash recovery, persistent graph rebuild retry, and bounded conflict-evidence retention.

## Acceptance status

The current code and test head passes the granular non-browser checks listed below in a tracked-only clean macOS copy. Full production acceptance is **not complete**: this sandbox cannot run the aggregate quality runner or the strengthened real-browser journey, and the current pull request still needs its normal-environment `browser-main-flows` job plus the required Ubuntu, macOS, and Windows portability jobs for both Stage 2 path portability and Stage 3 equivalent-rename portability. The V3 design document remains unchanged until those jobs are green.

## Tested fixed points

- Tasks 1–6 code and test implementation head: `37cf64689dc920fd5ca66090dc6edb4354b50dee` (`test: prove graph rename browser idempotency [task 6]`).
- Task execution baseline: `c9cbbb94b5e86a54d7aec6f33f60c072237a8e97`, preserved locally as `refs/llm-wiki/task-base` while acceptance work is in progress.
- The current-head matrix below records commands that completed in a tracked-only clean macOS copy. Documentation changes are recorded separately, so this report does not contain or predict its own future commit hash.
- The implementation range under acceptance is `c9cbbb94b5e86a54d7aec6f33f60c072237a8e97..37cf64689dc920fd5ca66090dc6edb4354b50dee`.

## Earlier Tasks 1–4 pull-request evidence

- `quality-and-tests`: PASS — [GitHub job](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657053/job/88863541061).
- `browser-main-flows`: PASS — [GitHub job](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657031/job/88863541158).
- Earlier Stage 2 path-portability evidence: PASS on [Ubuntu](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541189), [macOS](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541187), and [Windows](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541181).

These links remain evidence for the Tasks 1–4 core release. They do not replace the current Tasks 1–6 pull-request matrix, which must rerun the browser journey and both portability suites at the implementation head above.

## Current-head tracked-only acceptance matrix

| Exact command | Result at `37cf6468` |
|---|---|
| C1 — `node --test workbench/scripts/check-repository-privacy.test.mjs`; `npm run check:privacy` | PASS — the repository privacy tests and tracked-file scan passed. |
| C2 — `npm run build -w @llm-wiki/workbench-contracts`; `npm run build -w @llm-wiki/graph-engine`; `npm run build -w @llm-wiki-agent/server`; `npm run build -w @llm-wiki-agent/web` | PASS — all four production builds completed. |
| C3 — `npm run test:boundaries`; `node --test-concurrency=1 --test workbench/scripts/run-quality-and-tests.test.mjs workbench/scripts/run-browser-main-flows-ci.test.mjs`; `npm run check:boundaries` | PASS — negative controls, runner contracts, and repository boundaries passed. |
| C4 — `node --import tsx --test tests/browser/graph-renderer-trial-shared.test.ts tests/browser/capture-issue-159-hover-baseline.test.ts tests/browser/compare-issue-159-hover-baseline.test.ts` | PASS — browser trial contracts passed without starting the main-flow servers. |
| C5 — `node --test tests/js/unicode-normalization.test.js tests/js/unicode-case-folding.test.js tests/js/wiki-file-discovery.test.js tests/js/wikilink-parser.test.js tests/js/wiki-link-index.test.js tests/js/graph-warning-bundle.test.js tests/js/wiki-link-performance.test.js`; `bash tests/graph-path-identity-build.regression-1.sh`; `bash tests/graph-warning-exit-codes.regression-1.sh` | PASS — Unicode 17, file discovery, parsing, indexing, warnings, performance, and both graph path regressions passed. |
| C6 — `bash tests/install-wiki-link-runtime.regression-1.sh` | PASS — the newly added real installed-runtime regression passed. |
| C7 — `npm run test -w @llm-wiki/workbench-contracts`; `npm run check:route-registry` | PASS — the full shared-contract suite and route registry passed. |
| C8 — `node --import tsx --test workbench/server/src/graph-renames.test.ts workbench/server/src/graph-rename-routes.test.ts workbench/server/src/graph-rename-files.test.ts` | PASS — the focused rename service, route, and file suites passed. |
| C9 — `node --import tsx --test workbench/web/test/graph-renames-api.test.ts`; `npm run test:dom -w @llm-wiki-agent/web` | PASS — the rename API test passed and all 170 web DOM tests passed. |
| C10 — `npm run test -w @llm-wiki/graph-engine` | PASS — the full shared graph-engine suite passed. |
| C11 — `npm run typecheck -w @llm-wiki/workbench-contracts`; `npm run typecheck -w @llm-wiki/graph-engine`; `npm run typecheck -w @llm-wiki-agent/server`; `npm run typecheck -w @llm-wiki-agent/web` | PASS — all four type checks passed. |
| C12 — `npm run lint -w @llm-wiki-agent/web` | PASS — web lint passed. |
| C13 — `git diff --check` | PASS — no whitespace errors. |

The execution threads also recorded PASS at this head for the E-focused suite (26/26), the F no-port helper suite (2/2), the F backend-rename suite (29/29), and the production-server artifact check proving that browser-test markers are absent.

## Current sandbox limits and historical browser evidence

| Command/evidence | Current status |
|---|---|
| `npm run quality-and-tests` | **NOT RUN TO COMPLETION at `37cf6468`** — this sandbox forbids the runner from reading the system process table. The granular checks above were run separately in the tracked-only clean copy and must not be represented as an aggregate-runner PASS. |
| `npm run test:browser:main-flows -w @llm-wiki-agent/web` | **BLOCKED at `37cf6468`** — the sandbox rejects listening on `127.0.0.1:5180` with `EPERM`, and the runner also cannot read the process table. The strengthened journey awaits the pull request's GitHub `browser-main-flows` job in a normal environment. |
| Earlier local run at `e39fa2076b403b7bea0e06f138dc1c435b7cea88` | Historical PASS — the then-current real frontend/backend browser journeys passed. This predates the later implementation and test fixes and is **not** final proof for `37cf6468`. |

## Exact tracked-document checks

The plan's privacy phrase scan was run against tracked content so existing untracked user files were never read:

```bash
git grep -n -E '本机用户路径|真实姓名|私有素材路径' -- \
  README.md README.en.md AGENTS.md CLAUDE.md docs workbench packages/graph-engine/CONTEXT.md \
  > /tmp/llm-wiki-privacy-candidates.txt || true
git grep -n -E '本机用户路径|真实姓名|私有素材路径' -- \
  scripts templates tests SKILL.md \
  >> /tmp/llm-wiki-privacy-candidates.txt || true
npm run check:privacy
```

The current acceptance report was checked for local Markdown links without adding a dependency:

```bash
export CHANGED_MARKDOWN_FILES="docs/graph/2026-07-20-path-identity-production-acceptance.md"
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
```

## V3 §9.2 production acceptance rows

The rows below follow V3 §9.2 in order. A current-head PASS names only evidence that completed at `37cf6468`; neither the aggregate quality runner nor the strengthened real-browser journey is counted as passing at this head. No local result waives either pending three-platform row.

| Stage | Acceptance row | Exact current-head command/evidence | Result and current status |
|---|---|---|---|
| Stage 2 | 文件发现 | C5 | PASS at current head. File discovery coverage passed, and graph, lint, and rename inventories remain distinct. |
| Stage 2 | 生成与解析 | C5 | PASS at current head. Actual relative-path identity and link parsing/indexing coverage passed. |
| Stage 2 | 精确位置 | C5 | PASS at current head. Parser and index tests cover exact source locations and byte ranges. |
| Stage 3 | 预览失效 | C8, C9 | Automated server/API/DOM coverage passes at current head. The strengthened real-browser stale-preview journey remains pending in GitHub `browser-main-flows`. |
| Stage 1 | 引擎兜底 | C5, C10 | PASS at current head. Shared engine behavior and graph path fallbacks passed. |
| Stage 2 | 告警存储 | C5, C9 | PASS at current head. Warning bundle, strict exit behavior, and displayed warning-state coverage passed. |
| Stage 2 | 工作台告警 | C9 | Automated API/DOM coverage passes at current head. The final readable-graph browser journey remains pending in GitHub `browser-main-flows`. |
| Stage 3 | 工作台改名 | C8, C9 | Automated server/API/DOM coverage passes at current head, including the later recovery and idempotency fixes. The current-head real-browser journey remains pending. |
| Stage 2 | 离线 HTML | C5 | PASS at current head for generated graph identity and warning exit behavior. No current-head Chromium offline run is claimed by this report. |
| Stage 2 | 首次迁移 | C9 | Automated DOM coverage passes at current head. The final end-to-end migration proof remains part of the pending GitHub browser journey. |
| Stage 2 | CLI / CI | C3, C5, C6 | PASS at current head for CLI behavior, installed runtime, negative controls, and runner contracts. The aggregate runner itself is blocked by this sandbox and is not marked PASS. |
| Stage 2 | 路径可移植性 | C5; `.github/workflows/path-portability.yml` | Unicode 17 and local path-identity checks pass at current head. Current Ubuntu/macOS/Windows PR jobs are pending, so this row is not complete. |
| Stage 3 | 等价改名可移植性 | Focused F backend-rename evidence (29/29); `.github/workflows/path-portability.yml` | Focused backend rename coverage passes at current head. Current Ubuntu/macOS/Windows equivalent-rename jobs are pending, so this row is not complete. |
| Stage 2 | 性能 | C5 | PASS at current head. The bounded scan/index performance test passed. |
| Stage 3 | 主动改名 | C8, C9; E-focused 26/26; F helper 2/2; F backend rename 29/29 | Automated current-head coverage passes for apply, rollback/recovery, conflict handling, retained evidence, rebuild retry, and idempotency. The strengthened browser journey and three-platform acceptance remain pending. |

## Documentation coverage map

| Public capability | Reference | How-to | Tutorial | Explanation |
|---|---|---|---|---|
| Readable graph warnings and derived details | README files, product doc, both graph vocabularies | Product doc explains where details appear and what remains read-only | Not present | V3 design and product boundary |
| Optional safe same-directory rename and complete preview | README files, product doc, workbench vocabulary | Product doc describes the warning/page entries, preview, choices, and confirmation | Not present | V3 design and product boundary |
| External-edit/crash recovery and persistent graph retry | Product doc, acceptance report, workbench vocabulary | Product doc describes complete-set recovery and graph-only retry | Not present | V3 design recovery boundary |
| Immediate ordinary cleanup and 30-day unchosen evidence | Product doc, acceptance report | Product doc states what remains visible and when it is deleted | Not present | V3 design retention boundary |

There is no critical zero-coverage gap and no reference-only public capability. A dedicated newcomer tutorial does not yet exist, but the feature remains an optional workbench developer preview and the task-oriented product flow is documented.

## Architecture diagram drift

No diagram drift was found. The existing product diagram stays at the frontend → local backend → local filesystem boundary; Tasks 5–6 add behavior inside those existing layers without renaming, splitting, or moving a diagram entity. The shared engine boundary is also unchanged: both hosts share actual relative-path identity and warning meaning, while rename writes remain owned by the workbench.

## Release boundary

v3.6.89 has current-head granular non-browser evidence while keeping rename optional: path-safe graphs and readable warnings remain useful when the user never invokes rename. This report intentionally stops short of full production acceptance until the strengthened GitHub browser journey passes at `37cf6468`, the Ubuntu, macOS, and Windows jobs pass both portability suites, and the V3 §9.2 status is updated with those links.

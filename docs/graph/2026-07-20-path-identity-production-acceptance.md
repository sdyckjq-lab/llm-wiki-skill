# Path identity and safe rename production acceptance

Date: 2026-07-26

Release: v3.6.90

Scope: Tasks 1–6, including path identity, readable graph warnings, derived warning details, optional safe same-directory rename, complete preview confirmation, external-edit and crash recovery, persistent graph rebuild retry, and bounded conflict-evidence retention.

## Acceptance status

The final local implementation and test head passes the complete `npm run quality-and-tests` check, the strengthened real-browser journey, and the Paper visual checks. Full production acceptance is **locally complete**. The required Ubuntu, macOS, and Windows portability jobs remain pending until the pull request runs them; the V3 design document remains unchanged until those remote jobs are green.

## Final local verification

Final implementation head: `7ea629c7` (`fix: finalize graph rename recovery`).

| Check | Result |
|---|---|
| `npm run quality-and-tests` | PASS — all repository privacy, build, boundary, contract, graph, server, web, type, lint, and test checks passed. |
| `npm run test:browser:main-flows -w @llm-wiki-agent/web` | PASS — the seven main flows, graph-host failure flow, offline host flow, and graph rename/recovery journeys passed. |
| `npm run visual:paper -w @llm-wiki-agent/web` | PASS — all Paper visual scenarios, including rename preview, conflict, blocked, rebuild retry, and responsive states, completed. |
| Remote portability matrix | PENDING — Ubuntu, macOS, and Windows still need to run both path portability and equivalent-rename portability jobs from the pull request. |

## Tested fixed points

- Tasks 1–6 code and test implementation head: `7ea629c7` (`fix: finalize graph rename recovery`).
- Task execution baseline: `c9cbbb94b5e86a54d7aec6f33f60c072237a8e97`, preserved locally as `refs/llm-wiki/task-base` while acceptance work is in progress.
- The historical matrix below records commands that completed in a tracked-only clean macOS copy. The final local verification above supersedes it for the current implementation head.
- The implementation range under acceptance is `c9cbbb94b5e86a54d7aec6f33f60c072237a8e97..7ea629c7`.

## Earlier Tasks 1–4 pull-request evidence

- `quality-and-tests`: PASS — [GitHub job](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657053/job/88863541061).
- `browser-main-flows`: PASS — [GitHub job](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657031/job/88863541158).
- Earlier Stage 2 path-portability evidence: PASS on [Ubuntu](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541189), [macOS](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541187), and [Windows](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541181).

These links remain evidence for the Tasks 1–4 core release. They do not replace the current Tasks 1–6 pull-request matrix, which must rerun the browser journey and both portability suites at the implementation head above.

## Previous tracked-only acceptance matrix (historical)

| Exact command | Result at `0d1bbc7b` |
|---|---|
| `node --import tsx --test workbench/server/src/graph-renames.test.ts workbench/server/src/graph-rename-routes.test.ts workbench/server/src/graph-rename-journal.test.ts workbench/server/src/graph-rename-files.test.ts` | PASS at `0d1bbc7b` — 76/76 focused server, route, journal, and file checks. |
| `npm run test -w @llm-wiki/workbench-contracts` | PASS at `0d1bbc7b` — 72/72 contract checks. |
| `node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test workbench/web/test/app-graph-rename-recovery.test.tsx workbench/web/test/graph-rename-dialog.test.tsx` | PASS at `0d1bbc7b` — 33/33 focused recovery-interface checks. |
| `node --import tsx --test workbench/web/test/graph-renames-api.test.ts` | PASS at `0d1bbc7b` — 7/7 graph-rename API checks. |
| `node --import tsx --test --test-name-pattern='^browser rename' workbench/web/test/browser/browser-main-flows.test.ts` | PASS at `0d1bbc7b` — 2/2 no-port browser filesystem/helper checks; the real browser journey is excluded by the name filter. |
| `npm run test:unit -w @llm-wiki-agent/web` | PASS at `0d1bbc7b` — 212/212 no-port web unit checks. |
| `npm run test:dom -w @llm-wiki-agent/web` | PASS at `0d1bbc7b` — 177/177 web DOM checks. |
| `npm run typecheck -w @llm-wiki-agent/server`; `npm run typecheck -w @llm-wiki-agent/web` | PASS at `0d1bbc7b`. |
| `npm run build -w @llm-wiki-agent/server`; `npm run build -w @llm-wiki-agent/web` | PASS at `0d1bbc7b` — production backend and frontend builds completed. |
| `npm run lint -w @llm-wiki-agent/web`; `npm run check:boundaries`; `npm run check:privacy`; `git diff --check` | PASS at `0d1bbc7b`. |
| `node --import tsx --input-type=module -e "const { assertProductionBuildExcludesBrowserFakes } = await import('./workbench/web/test/browser/support/browser-harness.ts'); await assertProductionBuildExcludesBrowserFakes();"` | PASS at `0d1bbc7b` after the production backend build — no browser test file or marker is present in `workbench/server/dist`. |

The current-head focused evidence also covers two final behavior groups. First, both the follow-up recovery GET and resolve requests return the same live complete conflict set, perform zero writes when the submitted observations are stale, and keep `blocked` status dominant. Second, a successful ordinary rename and a manually completed rebuild leave only a byte-free terminal receipt; Markdown content, backups, stages, transit files, and evidence files are removed.

## Previous sandbox limits and historical browser evidence

| Command/evidence | Current status |
|---|---|
| `node --import tsx --test "workbench/server/src/**/*.test.ts" workbench/server/test/runtime-app.test.ts` | **NOT RERUN TO COMPLETION at `0d1bbc7b`** — the earlier 333/334 result belongs to `37265cf8` and is not current proof; its one failure was the sandbox file-watcher limit. |
| `npm run quality-and-tests` | **NOT RUN TO COMPLETION at `0d1bbc7b`** — this sandbox prevents the runner from reading the system process table. No old aggregate result is counted as current proof. |
| `npm run test:browser:main-flows -w @llm-wiki-agent/web` | **BLOCKED at `0d1bbc7b`** — the sandbox rejects listening on `127.0.0.1:5180` with `EPERM`, and the runner cannot read the process table. The strengthened journey awaits the pull request's GitHub `browser-main-flows` job in a normal environment and is not claimed as passing locally. |
| Earlier local run at `e39fa2076b403b7bea0e06f138dc1c435b7cea88` | Historical PASS — the then-current real frontend/backend browser journeys passed. This predates the later implementation and test fixes and is **not** final proof for `0d1bbc7b`. |

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

The rows below follow V3 §9.2 in order. Every row names a directly executable command. A current-head PASS applies only where the command completed at `0d1bbc7b`; earlier Tasks 1–4 results remain historical evidence, while commands not rerun at this head are labeled that way. The strengthened real-browser journey is not counted as passing, and no local result waives either pending three-platform row.

| Stage | Acceptance row | Exact current-head command/evidence | Result and current status |
|---|---|---|---|
| Stage 2 | 文件发现 | `node --test tests/js/unicode-normalization.test.js tests/js/unicode-case-folding.test.js tests/js/wiki-file-discovery.test.js tests/js/wikilink-parser.test.js tests/js/wiki-link-index.test.js tests/js/wiki-link-cli.test.js` | Earlier Tasks 1–4 PASS; **not rerun at `0d1bbc7b`**. The current three-platform workflow remains pending. |
| Stage 2 | 生成与解析 | `bash tests/graph-path-identity-build.regression-1.sh` | Earlier tracked-only PASS; **not rerun at `0d1bbc7b`**. No fresh current-head result is claimed. |
| Stage 2 | 精确位置 | `node --test tests/js/wikilink-parser.test.js tests/js/wiki-link-index.test.js` | Earlier tracked-only PASS; **not rerun at `0d1bbc7b`**. Current server/web types and builds pass separately. |
| Stage 3 | 预览失效 | `node --import tsx --test workbench/server/src/graph-renames.test.ts workbench/server/src/graph-rename-routes.test.ts workbench/server/src/graph-rename-journal.test.ts workbench/server/src/graph-rename-files.test.ts`; `node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test workbench/web/test/app-graph-rename-recovery.test.tsx workbench/web/test/graph-rename-dialog.test.tsx`; `node --import tsx --test workbench/web/test/graph-renames-api.test.ts` | PASS at `0d1bbc7b` — 76/76 server, 33/33 recovery UI, and 7/7 API checks. Stale conflict observations return the same live complete set with zero writes and `blocked` priority. The real-browser command remains blocked. |
| Stage 1 | 引擎兜底 | `npm run test -w @llm-wiki/graph-engine` | Earlier tracked-only PASS; **not rerun at `0d1bbc7b`**. No current-head engine-suite PASS is claimed. |
| Stage 2 | 告警存储 | `npm run test -w @llm-wiki/workbench-contracts`; `npm run test:dom -w @llm-wiki-agent/web` | PASS at `0d1bbc7b` — 72/72 contracts and 177/177 DOM checks. |
| Stage 2 | 工作台告警 | `npm run test:unit -w @llm-wiki-agent/web`; `npm run test:dom -w @llm-wiki-agent/web`; `npm run test:browser:main-flows -w @llm-wiki-agent/web` | Unit 212/212 and DOM 177/177 PASS at `0d1bbc7b`; the real-browser command is **BLOCKED** by `127.0.0.1:5180` `EPERM` and process-table restrictions, so GitHub `browser-main-flows` remains pending. |
| Stage 3 | 工作台改名 | `node --import tsx --test workbench/server/src/graph-renames.test.ts workbench/server/src/graph-rename-routes.test.ts workbench/server/src/graph-rename-journal.test.ts workbench/server/src/graph-rename-files.test.ts`; `node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test workbench/web/test/app-graph-rename-recovery.test.tsx workbench/web/test/graph-rename-dialog.test.tsx`; `node --import tsx --test workbench/web/test/graph-renames-api.test.ts`; `npm run test:browser:main-flows -w @llm-wiki-agent/web` | Focused commands PASS at `0d1bbc7b` with 76/76, 33/33, and 7/7. The real-browser command remains blocked and pending in GitHub. |
| Stage 2 | 离线 HTML | `bash tests/regression.sh`; `bash tests/graph-offline-warnings.regression-1.sh` | Earlier tracked-only PASS; **not rerun at `0d1bbc7b`**. No current-head Chromium offline PASS is claimed. |
| Stage 2 | 首次迁移 | `npm run test:dom -w @llm-wiki-agent/web`; `npm run test:browser:main-flows -w @llm-wiki-agent/web` | DOM 177/177 PASS at `0d1bbc7b`; the end-to-end browser proof is blocked locally and pending in GitHub. |
| Stage 2 | CLI / CI | `npm run build -w @llm-wiki-agent/server`; `npm run build -w @llm-wiki-agent/web`; `npm run check:boundaries`; `npm run check:privacy`; `npm run quality-and-tests` | Builds, boundaries, and privacy PASS at `0d1bbc7b`. `npm run quality-and-tests` is **not complete** because this sandbox forbids process-table reads; no aggregate PASS is claimed. |
| Stage 2 | 路径可移植性 | `node --test tests/js/unicode-normalization.test.js tests/js/unicode-case-folding.test.js tests/js/wiki-file-discovery.test.js tests/js/wikilink-parser.test.js tests/js/wiki-link-index.test.js tests/js/wiki-link-cli.test.js` in `.github/workflows/path-portability.yml` | Ubuntu/macOS/Windows jobs are **pending at `0d1bbc7b`**. Earlier Tasks 1–4 links are historical only, so this row is not complete. |
| Stage 3 | 等价改名可移植性 | `node --import tsx --test workbench/server/src/graph-rename-portability.test.ts` in `.github/workflows/path-portability.yml` | Ubuntu/macOS/Windows jobs are **pending at `0d1bbc7b`**. No current three-platform PASS is claimed. |
| Stage 2 | 性能 | `node --test tests/js/wiki-link-performance.test.js` | Earlier tracked-only PASS; **not rerun at `0d1bbc7b`**. No fresh current-head performance result is claimed. |
| Stage 3 | 主动改名 | `node --import tsx --test workbench/server/src/graph-renames.test.ts workbench/server/src/graph-rename-routes.test.ts workbench/server/src/graph-rename-journal.test.ts workbench/server/src/graph-rename-files.test.ts`; `node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test workbench/web/test/app-graph-rename-recovery.test.tsx workbench/web/test/graph-rename-dialog.test.tsx`; `node --import tsx --test workbench/web/test/graph-renames-api.test.ts`; `node --import tsx --test --test-name-pattern='^browser rename' workbench/web/test/browser/browser-main-flows.test.ts`; `npm run test:browser:main-flows -w @llm-wiki-agent/web` | Focused current-head commands PASS with 76/76, 33/33, 7/7, and 2/2. Successful ordinary rename and manual rebuild leave only a byte-free terminal receipt and remove content copies, backups, stages, transit files, and evidence. The real browser and three-platform proof remain pending. |

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

v3.6.90 has complete local acceptance at `7ea629c7` while keeping rename optional: path-safe graphs and readable warnings remain useful when the user never invokes rename. The only remaining release gate is the pull request's Ubuntu, macOS, and Windows portability matrix for both path portability and equivalent-rename portability.

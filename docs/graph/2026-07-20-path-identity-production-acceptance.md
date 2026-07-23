# Path identity and safe rename production acceptance

Date: 2026-07-23

Release: v3.6.89

Scope: Tasks 1–6, including path identity, readable graph warnings, derived warning details, optional safe same-directory rename, complete preview confirmation, external-edit and crash recovery, persistent graph rebuild retry, and bounded conflict-evidence retention.

## Acceptance status

The current code and test head passes the final tracked-only contract, interface, graph-engine, build, type, lint, boundary, privacy, and formatting checks listed below. The full server suite reaches 333/334; its only failure is the current sandbox's file-watcher limit and repeats as the same environment error when rerun alone. Full production acceptance is **not complete**: the strengthened real-browser journey remains blocked here, and the current pull request still needs its normal-environment `browser-main-flows` job plus the required Ubuntu, macOS, and Windows portability jobs for both Stage 2 path portability and Stage 3 equivalent-rename portability. The V3 design document remains unchanged until those jobs are green.

## Tested fixed points

- Tasks 1–6 code and test implementation head: `37265cf8ee2f89d013e66bde8e5d0684c847a469` (`test: cover recovery receipt cardinalities [task 6]`).
- Task execution baseline: `c9cbbb94b5e86a54d7aec6f33f60c072237a8e97`, preserved locally as `refs/llm-wiki/task-base` while acceptance work is in progress.
- The current-head matrix below records commands that completed in a tracked-only clean macOS copy. Documentation changes are recorded separately, so this report does not contain or predict its own future commit hash.
- The implementation range under acceptance is `c9cbbb94b5e86a54d7aec6f33f60c072237a8e97..37265cf8ee2f89d013e66bde8e5d0684c847a469`.

## Earlier Tasks 1–4 pull-request evidence

- `quality-and-tests`: PASS — [GitHub job](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657053/job/88863541061).
- `browser-main-flows`: PASS — [GitHub job](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657031/job/88863541158).
- Earlier Stage 2 path-portability evidence: PASS on [Ubuntu](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541189), [macOS](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541187), and [Windows](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541181).

These links remain evidence for the Tasks 1–4 core release. They do not replace the current Tasks 1–6 pull-request matrix, which must rerun the browser journey and both portability suites at the implementation head above.

## Final tracked-only acceptance matrix

| Command/evidence | Result at `37265cf8` |
|---|---|
| F1 — focused rename server, route, journal, and contract checks | PASS — 82/82. |
| F2 — `npm run test -w @llm-wiki/workbench-contracts` | PASS — 72/72. |
| F3 — full web interface DOM suite | PASS — 176/176. |
| F4 — no-port web unit suite | PASS — 212/212. |
| F5 — `npm run test -w @llm-wiki/graph-engine` | PASS — 809/809. |
| F6 — all repository type checks; web lint; frontend and backend production builds; boundary checks; repository privacy checks; `git diff --check` | PASS. |
| F7 — full server suite | 333/334 — the only failure is the sandbox file-watcher limit; the isolated rerun fails with the same environment error. No product assertion failed. |

The current-head focused evidence also covers four repaired behaviors: a conflict mismatch leaves zero persistent side effects; a failed refresh retains recovery evidence and remains retryable; the rebuild journey deterministically fails twice before a manual retry succeeds; and recovery receipts cover all four states with zero, one, and multiple receipts.

## Current sandbox limits and historical browser evidence

| Command/evidence | Current status |
|---|---|
| Full server suite | **ENVIRONMENT-LIMITED at `37265cf8`** — 333/334 pass. The remaining watcher test exceeds this sandbox's file-monitor allowance and repeats the same environment failure when run alone. |
| `npm run test:browser:main-flows -w @llm-wiki-agent/web` | **BLOCKED at `37265cf8`** — the sandbox rejects listening on `127.0.0.1:5180` with `EPERM`, and the runner cannot read the process table. The strengthened journey awaits the pull request's GitHub `browser-main-flows` job in a normal environment and is not claimed as passing locally. |
| Earlier local run at `e39fa2076b403b7bea0e06f138dc1c435b7cea88` | Historical PASS — the then-current real frontend/backend browser journeys passed. This predates the later implementation and test fixes and is **not** final proof for `37265cf8`. |

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

The rows below follow V3 §9.2 in order. A current-head PASS names only F1–F6 evidence completed at `37265cf8`; F7 is reported as environment-limited, not as a full PASS. The earlier Tasks 1–4 links remain historical evidence for unchanged path-identity behavior, while the strengthened real-browser journey is not counted as passing at this head. No local result waives either pending three-platform row.

| Stage | Acceptance row | Exact current-head command/evidence | Result and current status |
|---|---|---|---|
| Stage 2 | 文件发现 | Earlier Tasks 1–4 path evidence; F6 | The path implementation did not change after the preceding acceptance run, and current builds/types pass. No fresh row-specific command is claimed in this final batch. |
| Stage 2 | 生成与解析 | Earlier Tasks 1–4 path evidence; F2, F5, F6 | Shared contracts, graph engine, builds, and types pass at current head. The earlier path-specific evidence remains historical, not a fresh rerun. |
| Stage 2 | 精确位置 | Earlier Tasks 1–4 path evidence; F6 | Current builds and types pass. No fresh exact-location-focused command is claimed in this final batch. |
| Stage 3 | 预览失效 | F1, F3, F4 | PASS at current head for automated server and interface coverage. A conflict mismatch is asserted to leave zero persistent side effects; the strengthened real-browser stale-preview journey remains pending. |
| Stage 1 | 引擎兜底 | F5 | PASS at current head — 809/809 shared graph-engine checks pass. |
| Stage 2 | 告警存储 | F2, F3, F4 | PASS at current head for contracts and interface behavior. |
| Stage 2 | 工作台告警 | F3, F4 | PASS at current head for automated interface coverage. The final readable-graph browser journey remains pending in GitHub `browser-main-flows`. |
| Stage 3 | 工作台改名 | F1, F2, F3, F4 | PASS at current head for focused server, contract, and interface coverage, including retained evidence after failed refresh and retry. The current-head real-browser journey remains pending. |
| Stage 2 | 离线 HTML | Earlier Tasks 1–4 evidence; F5, F6 | Shared engine, builds, and types pass at current head. No current-head Chromium offline run is claimed by this report. |
| Stage 2 | 首次迁移 | F3, F4 | PASS at current head for automated interface coverage. The final end-to-end migration proof remains part of the pending GitHub browser journey. |
| Stage 2 | CLI / CI | F6 | PASS at current head for builds, types, lint, boundaries, privacy, and formatting. |
| Stage 2 | 路径可移植性 | Earlier Tasks 1–4 evidence; `.github/workflows/path-portability.yml` | Current Ubuntu/macOS/Windows PR jobs are pending, so this row is not complete. No current three-platform result is claimed. |
| Stage 3 | 等价改名可移植性 | F1; `.github/workflows/path-portability.yml` | Focused rename coverage passes at current head. Current Ubuntu/macOS/Windows equivalent-rename jobs are pending, so this row is not complete. |
| Stage 2 | 性能 | Earlier Tasks 1–4 evidence; F5, F6 | Current graph-engine, build, and type checks pass. No fresh path-performance-focused command is claimed in this final batch. |
| Stage 3 | 主动改名 | F1, F2, F3, F4 | PASS at current head for automated conflict, recovery, rebuild-retry, receipt-cardinality, and interface coverage. The strengthened browser journey and three-platform acceptance remain pending. |

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

v3.6.89 has final tracked-only non-browser evidence at `37265cf8` while keeping rename optional: path-safe graphs and readable warnings remain useful when the user never invokes rename. This report intentionally stops short of full production acceptance until the strengthened GitHub browser journey passes at this implementation head, the Ubuntu, macOS, and Windows jobs pass both portability suites, and the V3 §9.2 status is updated with those links.

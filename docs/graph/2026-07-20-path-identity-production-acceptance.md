# Path identity and safe rename production acceptance

Date: 2026-07-23

Release: v3.6.89

Scope: Tasks 1–6, including path identity, readable graph warnings, derived warning details, optional safe same-directory rename, complete preview confirmation, external-edit and crash recovery, persistent graph rebuild retry, and bounded conflict-evidence retention.

## Acceptance status

Local macOS acceptance passes at the current code and test head. Full production acceptance is **not complete**: the current pull request still needs the required Ubuntu, macOS, and Windows portability jobs for both Stage 2 path portability and Stage 3 equivalent-rename portability. The V3 design document remains unchanged until those jobs are green.

## Tested fixed points

- Tasks 1–6 code and test implementation head: `e39fa2076b403b7bea0e06f138dc1c435b7cea88` (`fix: register graph rename runtime endpoints [task 6]`).
- Task execution baseline: `c9cbbb94b5e86a54d7aec6f33f60c072237a8e97`, preserved locally as `refs/llm-wiki/task-base` while acceptance work is in progress.
- The local matrix below ran on macOS against the code and test head above. Documentation changes are recorded separately, so this report does not contain or predict its own future commit hash.
- No Markdown source was modified by graph build, read-only warning checks, rename portability checks, browser acceptance, or visual acceptance.

## Earlier Tasks 1–4 pull-request evidence

- `quality-and-tests`: PASS — [GitHub job](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657053/job/88863541061).
- `browser-main-flows`: PASS — [GitHub job](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657031/job/88863541158).
- Earlier Stage 2 path-portability evidence: PASS on [Ubuntu](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541189), [macOS](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541187), and [Windows](https://github.com/sdyckjq-lab/llm-wiki-skill/actions/runs/29901657099/job/88863541181).

These links remain evidence for the Tasks 1–4 core release. They do not replace the current Tasks 1–6 pull-request matrix, which must rerun both portability suites at the implementation head above.

## Local acceptance matrix

| Exact command | Local macOS result |
|---|---|
| `bash tests/regression.sh` | PASS — the full Skill regression suite, including path identity, warning exit behavior, graph generation, and offline warning coverage, completed successfully. |
| `npm run quality-and-tests` | PASS — privacy, contracts, server, web, graph engine, path and rename tests, boundaries, types, lint, and builds completed with `all checks passed`. |
| `npm run test:browser:main-flows -w @llm-wiki-agent/web` | PASS — the real frontend/backend journeys covered warning-to-preview, idempotent apply, stale preview, equivalent rename, crash recovery, complete conflict acknowledgement, retained evidence, and graph rebuild retry across restart. |
| `bash tests/graph-offline-warnings.regression-1.sh` | PASS — available, mismatched, missing-sidecar, legacy, and bounded read-only warning cases passed in Chromium. |
| `node --import tsx --test workbench/server/src/graph-rename-portability.test.ts` | PASS locally on macOS — real case-only and NFC/NFD old→transit→target renames, process-exit recovery, no duplicate page, unchanged unrelated bytes, and idempotent second recovery passed. Current Ubuntu/macOS/Windows PR jobs remain pending. |
| `npm run visual:paper -w @llm-wiki-agent/web` | PASS — Paper screenshots for rename, conflict, blocked recovery, stale preview, retained evidence, and graph-rebuild-required states were generated and inspected. |
| `bash install.sh --dry-run --platform codex` plus `grep -F 'deps ->' <captured-plan>` | PASS — the managed `deps` directory is present in the Codex install plan. |
| `bash install.sh --dry-run --platform claude` plus `grep -F 'deps ->' <captured-plan>` | PASS — the managed `deps` directory is present in the Claude install plan. |
| `test -f deps/unicode/CaseFolding-17.0.0.txt` | PASS. |
| `test -f deps/unicode/UnicodeData-17.0.0.txt` | PASS. |
| `test -f deps/unicode/DerivedNormalizationProps-17.0.0.txt` | PASS. |
| `test -f deps/LICENSE-unicode.txt` | PASS. |
| Tracked-file privacy candidate scan and `npm run check:privacy` | PASS — candidates were policy, example, or acceptance wording only; no changed document contains a concrete private home path. |
| Dependency-free local-link check over tracked changed Markdown | PASS — every local Markdown link resolves. |
| `git diff --check` | PASS — no whitespace errors. |

## Exact tracked-document checks

The plan's privacy phrase scan was run with Git path filtering so existing untracked user files were never read:

```bash
git grep -n -E '本机用户路径|真实姓名|私有素材路径' -- \
  README.md README.en.md AGENTS.md CLAUDE.md docs workbench packages/graph-engine/CONTEXT.md \
  > /tmp/llm-wiki-privacy-candidates.txt || true
git grep -n -E '本机用户路径|真实姓名|私有素材路径' -- \
  scripts templates tests SKILL.md \
  >> /tmp/llm-wiki-privacy-candidates.txt || true
npm run check:privacy
```

Changed tracked Markdown was collected from the task range and the current documentation changes, then checked without adding a dependency:

```bash
export CHANGED_MARKDOWN_FILES="$({
  git diff --name-only --diff-filter=ACMR refs/llm-wiki/task-base..HEAD -- '*.md'
  git diff --name-only --diff-filter=ACMR -- '*.md'
} | sort -u)"
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

The rows below follow V3 §9.2 in order. “PASS locally” means the command ran successfully at the tested implementation head; it does not waive either pending three-platform row.

| Stage | Acceptance row | Exact local command/evidence | Local result and current status |
|---|---|---|---|
| Stage 2 | 文件发现 | `bash tests/regression.sh`; `npm run quality-and-tests` | PASS locally. Graph, lint, and rename inventories remain distinct; unknown directories and `raw/` are neither graph nodes nor rename write targets. |
| Stage 2 | 生成与解析 | `bash tests/regression.sh`; `npm run quality-and-tests` | PASS locally. Formal same-name pages use actual relative-path identity; unique, ambiguous, explicit-path, alias/anchor, self-link, attachment, pending, broken, non-graph, and code-example cases are covered. |
| Stage 2 | 精确位置 | `npm run quality-and-tests` | PASS locally. Chinese, emoji, repeated same-line links, code exclusions, and exact UTF-8 byte ranges are covered. |
| Stage 3 | 预览失效 | `npm run quality-and-tests`; `npm run test:browser:main-flows -w @llm-wiki-agent/web` | PASS locally. File-set, content, exact-slice, read-only reference, layout, and external-edit changes invalidate the complete preview before any partial write. |
| Stage 1 | 引擎兜底 | `npm run quality-and-tests`; `bash tests/regression.sh` | PASS locally. Duplicate nodes, edges, and communities use stable first-wins handling; generated IDs avoid occupied values; input and engine warnings share one model. |
| Stage 2 | 告警存储 | `npm run quality-and-tests`; `bash tests/graph-offline-warnings.regression-1.sh` | PASS locally. Summary and sidecar identity/digest matching, candidate deduplication, pagination, stale/missing detail handling, and bounded offline detail are covered. |
| Stage 2 | 工作台告警 | `npm run quality-and-tests`; `npm run test:browser:main-flows -w @llm-wiki-agent/web` | PASS locally. The graph remains readable with clear warning explanations, relative paths, paged details, and deliberate resolve entry only for supported ambiguity and portable-collision cases. |
| Stage 3 | 工作台改名 | `npm run quality-and-tests`; `npm run test:browser:main-flows -w @llm-wiki-agent/web`; `npm run visual:paper -w @llm-wiki-agent/web` | PASS locally. Warning and page entries, complete preview, confirmation, stale handling, recovery, retained-evidence notice, and graph-only retry are covered in DOM, real-browser, and Paper states. |
| Stage 2 | 离线 HTML | `bash tests/regression.sh`; `bash tests/graph-offline-warnings.regression-1.sh` | PASS locally in Chromium. Offline output keeps the shared graph identity and warning meaning, bounded read-only details, unavailable-sidecar handling, and no rename action or absolute machine path. |
| Stage 2 | 首次迁移 | `npm run quality-and-tests`; `npm run test:browser:main-flows -w @llm-wiki-agent/web` | PASS locally. Nodes, directed edges, communities, and existing pins align by page path without false whole-library growth or loss. |
| Stage 2 | CLI / CI | `bash tests/regression.sh`; `npm run quality-and-tests` | PASS locally. Build and ordinary checks remain read-only; strict warning exit behavior stays separate from degraded graph generation and system failure. |
| Stage 2 | 路径可移植性 | `npm run quality-and-tests` on local macOS; `.github/workflows/path-portability.yml` for the required PR matrix | PASS locally on macOS. Fixed Unicode 17 NFC/case-fold, Chinese, spaces, reserved names, invalid characters, and trailing-dot/space cases pass. Current Ubuntu/macOS/Windows PR jobs are pending, so this row is not complete. |
| Stage 3 | 等价改名可移植性 | `node --import tsx --test workbench/server/src/graph-rename-portability.test.ts`; `.github/workflows/path-portability.yml` for the required PR matrix | PASS locally on macOS. Real case-only and NFC/NFD transit rename plus crash recovery pass. Current Ubuntu/macOS/Windows PR jobs are pending, so this row is not complete. |
| Stage 2 | 性能 | `npm run quality-and-tests` | PASS locally. Shared scanning remains bounded to one inventory, target index, and source parse, with warning storage bounded by occurrences plus distinct candidates. |
| Stage 3 | 主动改名 | `npm run quality-and-tests`; `npm run test:browser:main-flows -w @llm-wiki-agent/web`; `node --import tsx --test workbench/server/src/graph-rename-portability.test.ts` | PASS locally. Real files cover apply, rollback, external edits, process exit, transit recovery, exact full-conflict acknowledgement, ordinary immediate cleanup, visible 30-day unchosen-evidence retention, one rebuild, and persisted rebuild retry. Three-platform acceptance remains pending. |

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

v3.6.89 locally verifies the full Tasks 1–6 behavior while keeping rename optional: path-safe graphs and readable warnings remain useful when the user never invokes rename. This report intentionally stops short of full production acceptance until the current Ubuntu, macOS, and Windows jobs pass both portability suites and the V3 §9.2 status is updated with those links.

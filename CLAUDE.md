# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🧭 仓库导航（任何人 / AI 进来先读这里）

本仓库是 **llm-wiki monorepo**，含三个区：

| 区 | 位置 | 状态 |
|---|---|---|
| **agent 工作台**（开发主线） | `workbench/`（server + web） | 🚧 活跃开发 |
| **共享图谱引擎** | `packages/graph-engine/` | 🚧 随 agent 演进 |
| **Skill 形态** | 根目录 `SKILL.md` / `scripts/` / `templates/` / `platforms/` | ❄️ 成熟·维护冻结 |

➡️ **开发 agent 工作台（日常主线）**：先读 [workbench/CLAUDE.md](workbench/CLAUDE.md) 的冷启动表，再按任务打开 [workbench/PRODUCT.md](workbench/PRODUCT.md) 对应章节；不要默认读历史归档。

➡️ **统一术语、产品边界或 ADR**：先读 [CONTEXT-MAP.md](CONTEXT-MAP.md)，再进入对应 `CONTEXT.md` 和 [docs/adr/](docs/adr/)。

➡️ **下方架构、命令、分支和推送规则是全仓通用规则**。Skill 维护细节只在维护 Skill 时阅读。

---

## 🏗️ monorepo 怎么连

```
workbench/web (React 19, SSE) ──HTTP POST + SSE──▶ workbench/server (Hono + @earendil-works/pi-coding-agent)
                                                          │
                                                          ├─ spawn 根目录 scripts/（Skill 已有能力，ADR-16 能力归属）
                                                          └─ 依赖 @llm-wiki/graph-engine
packages/graph-engine ──ESM + IIFE 双产物──▶ workbench/web 图谱视图 + Skill 离线 HTML（一个引擎、两个宿主，ADR-21）
```

- 权威架构图、技术栈见 [workbench/PRODUCT.md §3](workbench/PRODUCT.md)；ADR 正文见 [docs/adr/](docs/adr/)；当前阶段与协作铁律见 [workbench/CLAUDE.md](workbench/CLAUDE.md)。
- **三类数据彻底分离**（别写错位置）：知识库 `~/llm-wiki/<name>/`、应用数据 `~/.llm-wiki-agent/`、模型凭证 `~/.pi/agent/auth.json`（pi-agent 管，权限 0600）。应用自己的 `config.json` **绝不存** API key。

## ⚙️ 开发命令速查

npm workspaces，三个包（根 `package.json` 不设 `"type": "module"`——Skill 的 CommonJS 测试要兼容，ESM 声明在各子包；ADR-20）：

| 包 | 路径 | npm 名 |
|---|---|---|
| 前端 | `workbench/web` | `@llm-wiki-agent/web` |
| 后端 | `workbench/server` | `@llm-wiki-agent/server` |
| 图谱引擎 | `packages/graph-engine` | `@llm-wiki/graph-engine` |

| 操作 | 命令（从仓库根） |
|---|---|
| 一行启动（后端 `8787` + 前端 `5180`，strictPort） | `npm run dev` |
| 全仓类型检查 | `npm run typecheck` |
| 前端 lint | `npm run lint -w @llm-wiki-agent/web` |
| 前端单测（unit + dom） | `npm run test -w @llm-wiki-agent/web` |
| 前端 Paper 视觉回归（playwright） | `npm run visual:paper -w @llm-wiki-agent/web` |
| 引擎单测 | `npm run test -w @llm-wiki/graph-engine` |
| 后端单测（server 无聚合 test 脚本，用 node:test） | `node --import tsx --test "workbench/server/src/**/*.test.ts"` |

要点：

- 测试统一用 Node 内置 `node --test`（不是 jest/vitest）。前端 DOM 测试走 jsdom + @testing-library/react，视觉回归用 playwright（仅 dev 依赖，不进运行时）。
- `web` / `server` 的 `build` 与 `typecheck` 带 `prebuild` / `pretypecheck` 钩子，会**自动先 build `@llm-wiki/graph-engine`**。改了引擎代码后，跑前端/后端的 typecheck 或 build 会自动带上最新引擎产物；单跑引擎自己的 `tsc --noEmit` 不会刷新 `dist/`。
- Node `>=22.19.0`（pi-coding-agent 硬要求，`.mise.toml` / `.nvmrc` 锁定）。

---

## Skill 形态：安装与维护

仅当你在维护 `SKILL.md`、`install.sh`、`scripts/`、`templates/` 或 `platforms/` 时阅读 [docs/agents/skill-maintenance.md](docs/agents/skill-maintenance.md)。Skill 已功能成熟、进入维护冻结，不再追加新功能。

## 分支管理规则

改动代码（非纯文档/注释）时，按以下流程操作：

1. 开新分支：从 main 创建，命名用 feat/ 或 fix/ 前缀（如 fix/cache-reliability-write-through）
2. 分步 commit：每完成一个逻辑单元就提交（脚本实现 → 测试 → 文档更新，分开 commit）
3. 推送并创建 PR：推到远端后用 `gh pr create` 创建 PR
4. 合并：确认测试通过后在 GitHub 上合并

不需要开分支的情况：
- 只改了 CLAUDE.md、文档、注释
- 只是探索性阅读代码

设计文档或 plan 写完准备动手改代码时，也先开分支再开始实现。

## 推送前文档更新规则

每次 commit 含功能改动（feat/fix）后、`git push` 前，**必须**主动检查并更新以下文档，不需要用户提醒：

1. **CHANGELOG.md**：在顶部加新版本条目（日期、新增/改进/修复分类）
2. **README.md 功能列表**：新增功能或行为变化时，在"功能"章节补一条
3. **版本号**：如果改动涉及新功能，在 CHANGELOG 条目里用新版本号（按 v当前+1 递增）

跳过条件：纯文档/排版/注释改动不需要更新。

## 文档隐私自查

提交或推送文档改动前，扫描入口、docs、词表和工作台文档，避免把本机路径、真实姓名或私有素材线索写进仓库：

```bash
grep -r '本机用户路径\|真实姓名\|私有素材路径' README.md README.en.md AGENTS.md CLAUDE.md docs/ workbench/ packages/graph-engine/CONTEXT.md
```

如果是在维护 Skill，再按 [docs/agents/skill-maintenance.md](docs/agents/skill-maintenance.md) 跑 Skill 专用检查。

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `sdyckjq-lab/llm-wiki-skill`; external PRs are not treated as a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use a multi-context domain-doc layout for this monorepo. See `docs/agents/domain.md`.

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
- Save progress, checkpoint, resume → invoke checkpoint
- Code quality, health check → invoke health

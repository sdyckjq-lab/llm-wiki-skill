<!-- /autoplan restore point: /Users/kangjiaqi/.gstack/projects/sdyckjq-lab-llm-wiki-skill/main-autoplan-restore-20260405-165224.md -->
---
date: 2026-04-05
topic: multi-agent-platform-support
status: reviewed
requirements: /Users/kangjiaqi/Desktop/project/llm-wiki-skill/docs/brainstorms/2026-04-05-multi-agent-platform-support-requirements.md
---

# llm-wiki 多平台适配实施计划

## Plan Summary

这次改造的目标不是把仓库“同时写给三种平台看”，而是把仓库变成一个统一来源，再由很薄的平台入口把同一套能力接到 Claude Code、Codex、OpenClaw 上。用户对外只看到一个 GitHub 链接；平台内部看到的是自己熟悉的安装入口和使用方式；项目本体仍只维护一套知识库能力。

推荐路线是：保留现有知识库逻辑、模板、脚本和依赖处理为共享核心，先把平台耦合从核心文件里抽掉，再加统一安装器和三个平台入口，最后用一个明确的验证矩阵证明不是“看起来兼容”，而是真的能装、能用、功能不打折。

## Problem Frame

当前仓库已经同时带有 `CLAUDE.md`、`AGENTS.md` 和部分 Codex 说明，但真正的工作流入口、安装路径和文案仍明显偏向 Claude Code。结果是：

- 用户把仓库链接交给不同 agent 时，安装和入口不稳定
- 同一份知识库能力被平台专属术语污染，后续继续扩平台会越来越乱
- 依赖和故障恢复虽然已有雏形，但缺少一个统一安装契约去承接多平台场景

这不是“文案问题”，而是产品入口、仓库结构和安装路径同时耦合导致的问题。

## Premises

| # | Premise | Assessment | Notes |
|---|---------|------------|-------|
| P1 | 用户主要通过“把 GitHub 链接扔给 agent”来安装 | Confirmed | 用户已明确要求把 agent 自动安装放在第一优先级 |
| P2 | 第一版必须保持完整功能，不接受阉割版 | Confirmed | 8 个工作流都需要保住 |
| P3 | 平台差异主要集中在安装、入口、提示方式，而不是知识库规则本身 | Confirmed | 仓库扫描结果支持这一点 |
| P4 | 短期内可继续保留外部素材提取依赖 | Confirmed with caution | 但本轮不重做提取能力，只记录为后续事项 |
| P5 | 单仓库比多仓库更符合当前目标 | Confirmed | 统一链接是核心诉求 |
| P6 | 单靠 shell 自动探测并不总能知道“当前正在给哪个平台安装” | Confirmed | 因此 repo 入口文档必须明确指引 agent 传入显式 `--platform` |

## System Audit

### Current System State

- 当前主能力集中在 [SKILL.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/SKILL.md)
- 安装逻辑集中在 [setup.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/setup.sh)
- 初始化逻辑集中在 [scripts/init-wiki.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/scripts/init-wiki.sh)
- 平台说明目前分散在 [README.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/README.md)、[CLAUDE.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/CLAUDE.md)、[AGENTS.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/AGENTS.md)
- 最近 30 天高频修改文件集中在 `SKILL.md`、`README.md`、`setup.sh`、`scripts/init-wiki.sh`

### In-Flight / Known Context

- 当前分支是 `main`
- 当前没有 stash
- 本计划启动前仓库中没有 `TODOS.md`，已有待办主要写在 [PLAN.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/PLAN.md)
- [PLAN.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/PLAN.md) 已经明确指出“平台覆盖不够广”和“Claude Code 绑定过强”是现状问题
- 已发现一个与本计划直接相关的结构性问题：
  - 安装路径在仓库中出现了 `~/.claude/skills`、`~/.Codex/skills`、当前实际环境里的 `~/.codex/skills` 三种写法，若不统一会持续制造混乱

### Relevant Design Context

- 已存在一份设计稿 [kangjiaqi-unknown-design-20260405-125420.md](/Users/kangjiaqi/.gstack/projects/LLMknowledgeskill/kangjiaqi-unknown-design-20260405-125420.md)
- 该设计稿聚焦“国内小白版 llm-wiki”，可复用其中的产品目标和低门槛要求
- 但该设计稿默认平台仍是 Claude Code，不足以直接回答这次的多平台问题

## What Already Exists

| Sub-problem | Existing asset | How we should reuse it |
|-------------|----------------|------------------------|
| 知识库工作流定义 | [SKILL.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/SKILL.md) | 继续作为能力主源，但要去掉平台写死的指令 |
| 知识库目录和模板 | [templates/](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/templates) | 直接共享，不做平台分叉 |
| 初始化脚本 | [scripts/init-wiki.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/scripts/init-wiki.sh) | 继续共享，仅去掉 Claude 专属结束语 |
| 依赖安装与环境检查 | [setup.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/setup.sh) | 升级为统一安装器而不是只服务 Claude |
| Claude 项目说明 | [CLAUDE.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/CLAUDE.md) | 改成 Claude 适配层说明，而不是唯一产品说明 |
| Codex 项目说明 | [AGENTS.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/AGENTS.md) | 升级为跨平台共享指令源之一 |
| 已有安装 / DX 结论 | [PLAN.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/PLAN.md) | 复用其中关于安装失败点、路径、依赖检查的结论 |

## Landscape Check

- Claude Code 官方文档把 `CLAUDE.md` 作为启动时加载的记忆文件，同时支持 skills 和插件扩展。这意味着 Claude 适配层应继续存在，但不该再承担全局产品定义。
- OpenAI 官方文档明确 Codex 会读取仓库内的 `AGENTS.md` 指导文件；这说明 repo 级指令对 Codex 是一等入口，不能只做本地技能安装而忽略 repo 根部说明。
- OpenClaw 官方文档说明系统提示里会注入可用 skills 列表，并支持共享或工作区级 skills。这意味着 OpenClaw 不需要独立产品分叉，只需要正确的 skill 落点和入口壳。

## NOT in Scope

- 重写网页、X、YouTube 等素材提取能力
- 改造成 Web App、桌面 App 或 SaaS
- 覆盖 Claude Code / Codex / OpenClaw 之外的更多平台
- 为每个平台维护一套长期独立的知识库逻辑

## Dream State

```text
CURRENT
  One repo, one main skill spec, but strongly Claude-shaped
  ↓
THIS PLAN
  One repo, one shared core, three native entry layers, one installer
  ↓
12-MONTH IDEAL
  One repo, many adapters, install-on-link reliability, key dependencies gradually internalized
```

### Dream State Delta

- `CURRENT → THIS PLAN`
  - 平台说明从混杂变成分层
  - 安装从“写给人看”升级为“agent 可执行”
  - 保留现有能力，不再把 Claude 当唯一默认平台
- `THIS PLAN → 12-MONTH IDEAL`
  - 后续把关键素材提取能力逐步内收
  - 扩展到更多 agent 平台时只新增适配层

## Implementation Alternatives

| Approach | Description | Pros | Cons | Recommendation |
|----------|-------------|------|------|----------------|
| A. 单文件硬兼容 | 继续用一个大 `SKILL.md` 混写三套平台规则 | 改得快 | 后续维护最差，文案和规则会继续打架 | Reject |
| B. 单仓库 + 共享核心 + 平台适配层 | 核心能力共享，平台入口和安装逻辑分层 | 最符合“一个链接 + 多平台原生支持” | 需要一次性理顺结构 | Choose |
| C. 多仓库分发 | Claude/Codex/OpenClaw 各自维护单独版本 | 每个平台都可纯定制 | 维护成本最高，最容易漂移 | Reject |

## Chosen Approach

选择 **B. 单仓库 + 共享核心 + 平台适配层**。

### Why this is the right balance

- 它保留了“一个官方链接”的分发优势
- 它避免把仓库拖进“三份相似文件长期漂移”的陷阱
- 它允许把安装和入口做成平台原生，而不必重写知识库本体

## Target Architecture

### High-Level Dependency Graph

```text
                     [GitHub Repo: llm-wiki-skill]
                                |
      ---------------------------------------------------------
      |                         |                            |
      v                         v                            v
[Shared Core]            [Unified Installer]         [Platform Adapters]
  SKILL core               install.sh                 claude/
  templates/               doctor.sh (optional)       codex/
  scripts/                 dry-run support            openclaw/
  deps/                                                 
      |                         |                            |
      ---------------------------------------------------------
                                |
                                v
                    Detected target platform(s)
                                |
        ------------------------------------------------------------
        |                          |                              |
        v                          v                              v
 Claude Code install        Codex install                  OpenClaw install
 ~/.claude/skills/...       ~/.codex/skills/...            ~/.openclaw/skills/...
 CLAUDE.md import path      AGENTS.md + skill bundle       skill bundle / workspace skill
```

### Key Architectural Principle

**Root repo becomes the universal installation contract.**  
不是让三个平台都直接吃同一个入口文件，而是让仓库根目录明确告诉 agent：

- 这个项目提供什么能力
- 安装器在哪
- 平台识别如何做
- 若你是某个平台，应把哪一层装到哪里

这比“强迫所有平台共用一个入口文件”更稳，也更符合现有平台现实。

## Installation Contract

### Default rule

- repo 根部文档负责告诉当前 agent：你属于哪个平台，就调用 `./install.sh --platform <your-platform>`
- `install.sh --platform auto` 只在“只检测到一个受支持平台”时自动生效
- 如果检测到多个受支持平台，安装器不猜测；由当前 agent 按自己的平台显式传参

### Why this contract is necessary

- 这能避免“脚本猜错平台”这种高成本低收益的复杂度
- 这仍然满足“一条命令安装”的用户体验，因为 agent 会代替用户传入平台
- 这比“默认把三个平台都装一遍”更可控，也更容易回滚和排错

## Compatibility / Migration

- 保留现有 [setup.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/setup.sh) 作为兼容入口，不直接删掉
- `setup.sh` 在第一阶段只做一件事：转调新安装器并显式走 Claude 兼容模式
- 现有 Claude 用户仍可继续用老命令，不会因为多平台改造而立刻失效
- Codex 路径同时兼容 `~/.codex` 与 `~/.Codex`，但计划内要收敛到一个标准写法并保留迁移兜底
- OpenClaw 先支持共享 skill 安装，再根据实际验证结果决定是否需要 workspace fallback

## Platform Capability Map

| Platform | Current official model | Relevant source | Planning implication |
|----------|------------------------|-----------------|----------------------|
| Claude Code | 原生支持 skills；`CLAUDE.md` 是项目记忆入口；skills 可放在 `.claude/skills/<name>/SKILL.md` | Anthropic docs: skills + memory | 需要保留 Claude 技能入口，但不要再让它吞掉全局产品说明 |
| Codex | 官方强调仓库中的 `AGENTS.md` 持久指导 Codex；Codex 也支持 skills 工作流 | OpenAI docs: Codex + AGENTS.md + skills | 需要同时提供 repo 级 `AGENTS.md` 说明和 Codex 技能安装路径兼容 |
| OpenClaw | 原生支持 shared/workspace skills；支持 `~/.openclaw/skills` 与 workspace `skills/` | OpenClaw docs: skills / plugins / bootstrapping | 需要提供 OpenClaw 共享 skill 安装落点，并尽量不要求用户手动配插件 |

## Detailed Plan

### Phase 1: Uncouple the Shared Core

**Goal:** 先把“知识库能力本身”从 Claude 风格术语里解耦出来。

**Changes**

- 将 [SKILL.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/SKILL.md) 改造成共享核心文档：
  - 把 `AskUserQuestion`、`Read tool`、`Write tool`、`Skill tool` 这类写死平台的表述改为平台中性表述
  - 保留 8 个工作流和所有知识库逻辑不变
- 调整 [scripts/init-wiki.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/scripts/init-wiki.sh) 的用户提示文案，不再只提 Claude
- 清理模板和 schema 中不必要的 Claude/Codex 示例偏向，保留内容语义不变

**Why first**

- 不先解耦核心，后面的平台适配层只是在错误的中心上不断贴补丁

**Files likely touched**

- [SKILL.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/SKILL.md)
- [scripts/init-wiki.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/scripts/init-wiki.sh)
- [templates/schema-template.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/templates/schema-template.md)

**Exit criteria**

- 共享核心中不再出现“只属于某个平台的唯一正确做法”
- 三个平台都能通过各自适配层调用同一套 8 个工作流定义

### Phase 2: Add Platform Adapter Layers

**Goal:** 给 Claude Code、Codex、OpenClaw 各自提供原生入口。

**Changes**

- 新增 `platforms/claude/`
  - 放 Claude skill 入口文件和 Claude 专属补充说明
- 新增 `platforms/codex/`
  - 放 Codex skill 入口 / 安装说明
  - 与 repo 根部 [AGENTS.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/AGENTS.md) 形成互补
- 新增 `platforms/openclaw/`
  - 放 OpenClaw skill 入口文件
  - 针对 `~/.openclaw/skills` 共享安装模式准备内容
- 将 [CLAUDE.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/CLAUDE.md) 和 [AGENTS.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/AGENTS.md) 改造成：
  - 根部共享安装说明 + 平台跳转提示
  - Claude 再通过 `CLAUDE.md` import/shared text 读取项目通用规则

**Why second**

- 只有共享核心先稳定，平台适配层才会变成“薄壳”，而不是另一份主逻辑

**Files likely touched**

- [CLAUDE.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/CLAUDE.md)
- [AGENTS.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/AGENTS.md)
- new: `platforms/claude/...`
- new: `platforms/codex/...`
- new: `platforms/openclaw/...`

**Exit criteria**

- 三个平台都各自拥有一份“自己看起来很自然”的入口
- 平台入口的正文主要是“如何接入共享核心”，而不是复制 8 个工作流
- 三个平台入口都明确告诉 agent 如何调用统一安装器

### Phase 3: Replace setup.sh with a Unified Installer

**Goal:** 从“Claude 的 setup 脚本”升级为“统一安装器”。

**Changes**

- 将 [setup.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/setup.sh) 升级或拆分为：
  - `install.sh`：统一入口
  - `setup.sh`：保留为兼容壳，内部转调 `install.sh --platform claude`
- 安装器具备以下能力：
  - 当明确传入 `--platform` 时，按目标平台安装
  - 仅在 `auto` 且只检测到一个平台时才做自动检测安装
  - 支持 `--dry-run`，方便 agent 验证而不污染真实目录
  - 根据平台把共享核心 + 对应适配层安装到正确目录
  - 统一执行依赖检查（bun/npm、uv、Chrome 端口等）
- 处理 `~/.codex` / `~/.Codex` 路径差异：
  - 检测现有环境，优先使用真实存在的路径
  - 明确只选择一个标准写法并保留兼容逻辑

**Why third**

- 平台适配层确定后，安装器才能一次性复制对的内容到对的位置

**Files likely touched**

- [setup.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/setup.sh)
- new: `install.sh`
- optional: `scripts/install-lib.sh` only if `install.sh` 明显失控；默认先不拆 helper

**Exit criteria**

- 用户或 agent 只需要一个安装命令
- 安装器可以在 dry-run 模式下清楚输出“会安装什么、安装到哪里”
- 老的 Claude 安装命令仍然可用

### Phase 4: Rewrite the Root Entry Surfaces for Agent-First Discovery

**Goal:** 让用户把仓库链接交给 agent 时，agent 自己更容易读懂并执行安装。

**Changes**

- 重写 [README.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/README.md)：
  - 第一屏不再写“为 Claude Code 打造”
  - 增加“给 agent 的一句话安装方式”
  - 增加统一命令安装方式
- 调整根部说明文件职责：
  - README：给人和 agent 的总入口
  - AGENTS：给 Codex / OpenClaw / 通用 agent 的可执行项目说明
  - CLAUDE：给 Claude 的项目说明，并导入共享规则
- 增加 `INSTALL.md` 或 `docs/install/`：
  - 统一列出三个平台的目标落点、自动检测和例外情况

**Why fourth**

- 先有正确结构和安装器，再重写入口说明，文档才不会再次偏掉

**Exit criteria**

- README 第一屏可以明确回答：这是什么、怎么装、agent 应该怎么做
- 不再需要读完整 README 才知道它不是“只给 Claude 用”的
- 根部说明清楚写明：仓库链接交给 agent 时，应由 agent 根据自身平台调用显式 `--platform`

### Phase 5: Add Verification Matrix and Regression Harness

**Goal:** 用可重复的方式证明“多平台原生支持”不是口头说法。

**Changes**

- 扩展 [tests/regression.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/tests/regression.sh) 或新增 smoke test：
  - 在临时 HOME 目录里分别模拟 Claude / Codex / OpenClaw 安装
  - 验证安装后关键文件存在、路径正确、入口文件可读
  - 保留对旧 `setup.sh` 的兼容回归测试，确保 Claude 现有安装命令不回退
- 增加一份人工验证清单：
  - agent 自动安装提示
  - init/ingest/query 三条主路径是否能走通
  - graph/digest/lint/status 是否仍保留
- 安装后提示：
  - 明确缺少 Chrome/uv 时 agent 应如何提示与恢复

**Why last**

- 验证要针对最终结构，而不是中途结构

**Exit criteria**

- 每个平台至少有一条自动化 smoke check
- 安装和核心使用路径有明确的人工验收清单

## Sequencing

```text
Phase 1 共享核心解耦
   ↓
Phase 2 三个平台入口层
   ↓
Phase 3 统一安装器
   ↓
Phase 4 根入口重写（README / AGENTS / CLAUDE）
   ↓
Phase 5 验证矩阵与回归检查
```

### Why this order is right

- 先处理核心，再做适配，避免三边一起返工
- 先把“装什么”定义清楚，再写“怎么装”
- 最后再补验证，确保测的是最后形态而不是半成品

## Execution Breakdown

| Step | Outcome | Human effort | CC effort | Notes |
|------|---------|--------------|-----------|-------|
| 1 | 共享核心去平台化 | ~0.5 day | ~20 min | 高价值，低风险 |
| 2 | 三平台入口壳 | ~1 day | ~30 min | 主要是结构和说明整理 |
| 3 | 统一安装器 | ~1 day | ~30 min | 风险最高，需 dry-run |
| 4 | 根入口文档重写 | ~0.5 day | ~20 min | 与安装器一起交付最有价值 |
| 5 | 验证与回归 | ~1 day | ~30 min | 不可省略 |

## Error & Rescue Registry

| Failure | Likely cause | User impact | Rescue |
|--------|--------------|-------------|--------|
| 安装到错误目录 | 平台路径写死或大小写不一致 | skill 装了但平台看不到 | 安装器先检测路径，再输出最终落点 |
| Claude 继续只读 CLAUDE 而忽略共享规则 | `CLAUDE.md` 没导入共享内容 | Claude 与其他平台行为漂移 | 用 `CLAUDE.md` 显式导入共享说明 |
| Codex 只吃 AGENTS，不吃 skill 包 | 不同 Codex 形态入口不同 | 仓库链接可用，但本地技能安装不稳定 | 同时提供 repo 级 `AGENTS.md` 和本地 skill 包兼容 |
| OpenClaw 装到 workspace 而非 shared path | agent/用户环境不同 | 技能只在当前 workspace 可见 | 优先 shared path，必要时支持 workspace fallback |
| 安装成功但依赖未装全 | bun/npm、uv、Chrome 未就绪 | URL 来源不能完整工作 | 安装器统一检查并给出恢复提示 |
| 共享核心和平台适配层内容漂移 | 复制粘贴过多 | 三平台功能不一致 | 平台入口只保留薄壳，不复制主逻辑 |
| 老 Claude 安装命令失效 | 直接替换 `setup.sh` 行为 | 现有用户升级失败 | 保留兼容壳并补回归测试 |

## Failure Modes Registry

| Area | Failure mode | Severity | Mitigation |
|------|--------------|----------|------------|
| 结构设计 | 共享核心仍残留平台专属术语 | High | Phase 1 做全文去耦扫描 |
| 安装 | 自动检测误判用户平台 | High | repo 根部显式指引 agent 传 `--platform`；`auto` 只在单平台时生效 |
| 路径 | `.Codex` / `.codex` 冲突 | High | 统一标准写法 + 兼容分支 |
| 文档 | README 仍然先讲 Claude | Medium | 文档重写晚于结构设计，确保不返工 |
| 验证 | 只测安装不测使用 | High | 加主路径人工验证矩阵 |
| 后续维护 | 新平台加入时再复制一套逻辑 | Medium | 明确共享核心和适配层边界 |
| 升级 | 已安装旧版本用户无法平滑迁移 | High | 增加兼容安装路径和 setup 回归测试 |

## Test Diagram

```text
INSTALL PATH COVERAGE
=====================

[Entry]
  ├── GitHub repo link handed to agent
  │   ├── [GAP] agent reads root README/AGENTS/CLAUDE correctly
  │   └── [PLAN] rewrite root entry docs for agent-first discovery
  │
  └── install.sh
      ├── detect Claude
      │   ├── install shared core
      │   ├── install Claude adapter
      │   └── verify ~/.claude/skills/... exists
      │
      ├── detect Codex
      │   ├── normalize ~/.codex vs ~/.Codex
      │   ├── install shared core
      │   ├── install Codex adapter
      │   └── verify skill/AGENTS compatibility
      │
      ├── detect OpenClaw
      │   ├── install shared core
      │   ├── install OpenClaw adapter
      │   └── verify ~/.openclaw/skills/... exists
      │
      └── dependency checks
          ├── bun/npm
          ├── uv
          └── Chrome debug port

USAGE FLOW COVERAGE
===================

Installed skill
  ├── init
  ├── ingest
  ├── query
  ├── digest
  ├── lint
  ├── status
  └── graph

Each platform must prove:
  1. skill visible
  2. skill instructions load
  3. core workflow names still reachable
  4. dependency problems surface as actionable guidance
  5. existing Claude install command still upgrades cleanly
```

## Verification Plan

### Automated

- 安装 dry-run：Claude / Codex / OpenClaw 三种目标分别跑一遍
- 临时 HOME smoke 安装：验证最终目录和关键入口文件是否存在
- 共享核心扫描：阻止新增 Claude-only / Codex-only 平台写死术语回流

### Manual

- 把仓库链接交给 Claude Code，确认 agent 能找到统一安装入口
- 把仓库链接交给 Codex，确认 agent 能按 Codex 习惯完成安装
- 把仓库链接交给 OpenClaw，确认共享 skill 落点正确
- 每个平台至少验证 `init`、`ingest`、`query`
- 任选一个平台补测 `digest`、`lint`、`status`、`graph`

## Deferred to Later

- 素材提取能力的内收计划
- 对更多 agent 平台的扩展
- 如果后续确认需要，再把安装器拆成更正式的 doctor / migrate / uninstall 子命令

## Temporal Interrogation

### Hour 1

- 定下统一安装契约和 `--platform` 规则
- 完成共享核心去耦清单
- 明确哪些旧入口必须保留兼容

### Hour 6

- 三个平台入口壳具备雏形
- `install.sh --dry-run` 能打印每个平台的目标路径和动作
- `setup.sh` 已经变成兼容壳

### Day 2

- 根部 README / AGENTS / CLAUDE 已经按新职责重写
- 三个平台 smoke 安装能跑通
- 旧 Claude 安装命令回归不失败

### 6 Months

- 素材提取关键路径逐步内收
- 新平台扩展主要新增适配层，而不是碰知识库核心

## CEO Review Summary

| Dimension | Assessment | Notes |
|-----------|------------|-------|
| Right problem | Strong | 直接回应“一个链接、多个平台、完整可用”的真实诉求 |
| Scope calibration | Correct after tightening | 去掉了同轮重做素材提取，保留多平台主线 |
| Simplicity | Improved | 通过显式 `--platform` 规则避免过度智能检测 |
| 6-month trajectory | Strong | 共享核心 + 薄适配层比多仓库更可持续 |

## Engineering Review Summary

| Dimension | Assessment | Notes |
|-----------|------------|-------|
| Architecture | Sound with migration guardrails | 核心与适配层边界清楚，兼容壳降低升级风险 |
| Complexity | Acceptable | 最大风险在安装器，已通过显式平台参数和先不拆 helper 收紧 |
| Testability | Good after additions | 已补充旧 `setup.sh` 兼容回归和临时 HOME smoke 安装 |
| Residual risk | Medium | Codex/OpenClaw 真实安装落点仍需用实际环境验证 |

## Independent Codex Notes

- 现有 [tests/regression.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/tests/regression.sh) 和 [setup.sh](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/setup.sh) 都是典型的 Claude-only 假设源头，所以迁移计划必须把“旧命令不回退”当成一等约束。
- 安装器在第一轮不该先拆成多层 helper；先把显式 `--platform`、dry-run 和兼容壳做好，再决定是否需要抽象。

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | Draft | 采用“单仓库 + 共享核心 + 平台适配层” | P1 Choose completeness | 满足统一链接和后续扩展两个目标 | 多仓库分发 |
| 2 | Draft | 先不重做素材提取，只记录为后续阶段 | P3 Pragmatic | 本轮用户明确先做多平台适配 | 同轮同时重构提取层 |
| 3 | Draft | 统一安装器晚于平台入口层实现 | P5 Explicit over clever | 先定义装什么，再实现怎么装，返工更少 | 先改安装器再倒推结构 |
| 4 | Review | 默认由当前 agent 显式传 `--platform`，而不是脚本盲猜 | P5 Explicit over clever | 这比多平台自动猜测更稳、更容易排错 | 默认安装全部检测到的平台 |
| 5 | Review | 保留 `setup.sh` 作为 Claude 兼容壳 | P1 Choose completeness | 不能为了新平台把现有用户升级路径打断 | 直接用 `install.sh` 替换旧命令 |
| 6 | Review | 先不拆 `install-lib` helper | P3 Pragmatic | 安装器复杂度还没证明需要额外抽象 | 一开始就拆多文件安装框架 |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/autoplan` | Scope & strategy | 1 | clean | 0 unresolved |
| Codex Review | `/autoplan` | Independent 2nd opinion | 1 | clean | 0 unresolved after plan tightening |
| Eng Review | `/autoplan` | Architecture & tests | 1 | clean | 0 unresolved |
| Design Review | `/autoplan` | UI/UX gaps | 0 | skipped | no UI scope |

**VERDICT:** REVIEWED — plan is ready for execution. Main residual risk is platform-specific path verification in real environments, already captured in the verification phase.

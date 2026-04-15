---
title: fix: Separate core install from optional adapter bootstrap
type: fix
status: completed
date: 2026-04-14
origin: docs/brainstorms/2026-04-06-project-cleanup-and-restructuring-requirements.md
deepened: 2026-04-14
---

# fix: Separate core install from optional adapter bootstrap

## Overview

这份计划解决的是安装和升级路径把“可选提取器”误当成“默认前置”的问题。

目标不是重做提取体系，也不是继续扩充安装器，而是把产品承诺重新收口到一个更稳的边界：

- 默认安装和默认升级只保证知识库核心主线可用
- 网页、X/Twitter、微信公众号、YouTube、知乎的自动提取改成显式启用
- 依赖状态判断不再混淆源码目录、已安装目录和升级临时副本
- 测试和文档改成保护这个新默认值，而不是继续把错误默认值锁死

## Problem Frame

Phase B 已经明确要求“核心主线独立成立，外挂只是可选进料能力”（见 origin: `docs/brainstorms/2026-04-06-project-cleanup-and-restructuring-requirements.md`）。当前实现虽然在说明里写了“PDF / 本地文件 / 纯文本不依赖外挂”，但安装和升级行为仍然把可选提取器放在默认主路径上：

- `install.sh` 默认安装会复制 bundled 提取器、安装网页提取的 Node 依赖、再尝试安装公众号工具
- `install.sh --upgrade` 也会重复执行同一套可选提取器链路
- `SKILL.md` 的首次使用说明会先让 agent 检查这些提取器依赖，缺失时还会引导所有平台运行 `setup.sh`
- `adapter-state.sh` 默认假设自己运行在已安装目录结构里，导致源码目录调试和升级排查时结论漂移
- `tests/regression.sh` 当前把“默认安装必须把可选提取器都装上”写成了回归断言

结果就是：只想处理本地文档和纯文本的用户，也会在拉最新版或重装时反复撞上可选依赖；一旦网络慢、源慢或环境不齐，体验就像“卡在依赖上”。

## Requirements Trace

- R1. 默认安装和默认升级必须只保证知识库核心主线可用，不得因为可选提取器缺失或安装缓慢阻断成功路径。
- R2. 可选提取器必须改成显式启用，只有用户明确要用 URL 类自动提取时才进入对应安装链路。
- R3. 共享说明和技能说明必须按当前平台给出正确的安装指令，不能再把 `setup.sh` 当成通用入口。
- R4. 依赖状态判断必须能稳定区分源码目录、已安装目录和升级临时副本三种场景。
- R5. 默认升级在存在多个已安装平台时必须避免误操作到非目标平台。
- R6. 回归测试必须把“核心默认可用、可选功能按需开启”作为新的保护边界。

## Scope Boundaries

- 不重写网页、YouTube、公众号等提取器自身的实现。
- 不改变核心知识库工作流的内容分析、页面生成和目录结构。
- 不引入插件市场、自动发现系统或复杂的开关界面。
- 不在这一轮做按单个来源细粒度选择提取器的复杂参数设计；先把“默认关闭，显式开启”立住。
- 不要求老用户迁移已有知识库。

## Context & Research

### Relevant Code and Patterns

- `install.sh` 已经把安装动作集中在一个脚本里，并有 `--platform`、`--upgrade`、hook 注册等统一入口，适合继续收口默认路径。
- `scripts/source-registry.sh` 和 `scripts/source-registry.tsv` 已经提供了来源与依赖的权威定义，适合继续作为“哪些属于可选提取器”的单一来源。
- `scripts/adapter-state.sh` 已经承担状态分类，但路径解析还是局部猜测，没有和安装脚本共享运行场景定义。
- `tests/adapter-state.sh` 已经有状态分类测试骨架，适合补成“源码 / 安装 / 升级临时副本”的矩阵。
- `tests/regression.sh` 已经覆盖安装、升级入口和文档对齐，适合改成保护新的默认合同。

### Institutional Learnings

- `docs/plans/2026-04-06-002-phase-b-core-and-adapter-separation-plan.md` 已明确把“核心主线独立成立”作为底线。
- `docs/solutions/integration-issues/unify-optional-adapter-states-and-fallback-paths-2026-04-06.md` 说明了可选提取器失败必须被清晰隔离，不能拖垮主线。
- `.context/compound-engineering/todos/005-pending-p2-separate-source-and-installed-skill-paths.md` 已把本次 review 的核心问题收敛为“源码目录 vs 已安装目录未区分清楚”。
- `docs/solutions/logic-errors/lint-runner-index-path-and-install-sync-2026-04-14.md` 提醒了这个仓库长期存在“源码改了，但已安装副本不同步”的高频风险，计划里必须把安装副本和运行副本一起考虑。

### External References

- 本次不需要额外外部资料。这里的问题是本仓库已经定下的边界没有被默认安装路径贯彻，仓库内现有计划、说明和测试已经足够定义正确方向。

## Key Technical Decisions

- 默认安装合同改为“核心优先，提取器显式开启”。
  理由：这直接对应 R1/R2，也是用户反馈里最痛的点。只要默认路径仍然碰可选提取器，后续再怎么补文案和状态提示，体验都会继续被拖慢。

- 新增显式开关 `--with-optional-adapters`，用于安装和升级时主动启用可选提取器链路。
  理由：先解决“默认不该装”的问题，比一上来做按来源细粒度选择更稳。布尔开关足够表达“我要启用 URL 自动提取”，也更容易在文档和技能说明里讲清楚。

- `setup.sh` 保留为 Claude 兼容入口，但只在 Claude 专属文档里出现；共享说明改为始终使用 `install.sh --platform <current-platform>`。
  理由：这既保留向后兼容，也消除跨平台误导。

- 引入共享的运行场景解析 helper，由安装脚本和 `adapter-state.sh` 一起使用。
  理由：源码目录、已安装目录、升级临时副本的路径判断不能继续各写一套。共享 helper 比“在某个脚本里再补一个特判”更稳。

- 保留 `llm-wiki` 包内的 `deps/` 作为可选提取器源码仓，但默认不把它们激活成目标平台下的已启用提取器。
  理由：这样既能保持后续显式启用时不必重新拉源码，也能把“技能包里带着源码”和“当前平台已经启用这个提取器”明确分开。

- 测试策略从“默认装全家桶”改为“两层保护”：默认核心路径 + 显式可选路径。
  理由：没有测试护栏，新的默认合同很快又会被后续改动拉回旧路径。

## Open Questions

### Resolved During Planning

- 默认安装和默认升级是否还要继续碰可选提取器？
  结论：不要。默认只保证核心主线，提取器必须显式开启。

- 是否需要本轮就设计按单个来源选择提取器的复杂参数？
  结论：不需要。本轮先用 `--with-optional-adapters` 建立清晰边界，细粒度选择延后。

- 源码目录和已安装目录的问题是补一个局部特判，还是立共享模型？
  结论：立共享模型。否则安装脚本和状态脚本还会继续漂移。

### Deferred to Implementation

- `--with-optional-adapters` 是否需要在后续扩展成 `--optional-adapters=<list>`。
  先不做；实现阶段只要保持内部结构可扩展即可。

- 共享运行场景 helper 是独立成 `scripts/runtime-context.sh`，还是并入现有 `shared-config.sh`。
  这里延后到实现时根据 shell 复用边界决定，但必须是两个脚本共用的一处逻辑。

- 安装完成后是否需要新增独立的 `doctor` 或 `status --install` 类诊断入口。
  本轮不做新命令，只先让现有安装输出和状态输出对齐。

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

### Behavior Matrix

| 场景 | 默认行为 | 显式启用可选提取器后 |
|---|---|---|
| `bash install.sh --platform <x>` | 复制核心 skill、脚本、模板、平台入口；不触发 Node/uv/Chrome 相关安装 | 增加可选提取器复制与依赖安装 |
| `bash install.sh --upgrade --platform <x>` | 拉最新代码并更新核心安装副本；不触发可选提取器安装 | 增加可选提取器刷新与依赖安装 |
| 共享说明 / `SKILL.md` 首次使用 | 本地文件、纯文本直接进入主线；不提前检查提取器 | 只有用户给了 URL 且提取器缺失时，提示当前平台执行显式开关安装 |
| `adapter-state.sh check` 在源码目录运行 | 读取源码目录的 bundled 依赖位置，不误报为未安装 | 同一状态模型，额外反映环境条件 |
| `adapter-state.sh check` 在已安装目录 / 升级临时副本运行 | 读取目标 skill root 的 bundled 依赖位置 | 同一状态模型，额外反映环境条件 |

### Shared Context Shape

- `layout_mode`: `source_checkout` / `installed_skill` / `upgrade_target`
- `bundle_root`: 当前 llm-wiki 本体所在根目录
- `optional_adapter_root`: bundled 提取器应被检查或写入的目录
- `platform`: `claude` / `codex` / `openclaw` / `unknown`

所有安装和状态判断只读这组共享结果，不再各自从 `dirname "$PROJECT_ROOT"` 之类的局部推断出路径。

## Implementation Units

- [x] **Unit 1: 重定义安装与升级的默认合同**

**Goal:** 把默认安装和默认升级从“顺手装可选提取器”改成“只保证核心主线”。

**Requirements:** R1, R2, R5

**Dependencies:** None

**Files:**
- Modify: `install.sh`
- Modify: `README.md`
- Modify: `platforms/claude/CLAUDE.md`
- Modify: `platforms/codex/AGENTS.md`
- Modify: `platforms/openclaw/README.md`
- Test: `tests/regression.sh`

**Approach:**
- 在 `install.sh` 中拆开“核心 bundle 安装”和“可选提取器 bootstrap”两条路径。
- 保留 `MANAGED_ITEMS` 对 `deps/` 的复制，让技能包内继续携带可选提取器源码；默认路径只跳过 sibling adapter 安装和额外依赖 bootstrap。
- 为 `install` 和 `upgrade` 共用新增的显式开关 `--with-optional-adapters`。
- 默认 `install` / `upgrade` 只执行核心路径；只有开关存在时才执行 bundled 提取器复制、Node 依赖安装、`uv tool install`。
- 修正 `--upgrade --platform auto` 的行为：当检测到多个已安装平台时直接失败，避免在默认升级中误更新多个安装副本。
- 保留现有 hook 行为，不让核心升级破坏 Claude 的 hook 配置。

**Patterns to follow:**
- `install.sh` 现有的 `--platform` / `--upgrade` 参数处理和统一输出风格
- `README.md` 当前对多平台安装入口的表达方式

**Test scenarios:**
- Happy path: 仅有核心平台目录时，默认安装成功完成，并生成 `~/.<platform>/skills/llm-wiki` 核心副本。
- Happy path: 显式传入 `--with-optional-adapters` 时，可选提取器链路才会执行。
- Error path: 机器上同时存在多个平台安装且执行 `bash install.sh --upgrade` 时，脚本拒绝继续并提示必须显式指定平台。
- Integration: Claude 已有 hook 配置时，核心升级后 hook 配置仍保持不变。

**Verification:**
- 默认安装和默认升级的输出不再包含可选提取器安装成功/失败作为成功路径必要条件。
- 多平台升级不再出现“自动同时更新多个安装副本”的情况。

- [x] **Unit 2: 建立共享运行场景解析**

**Goal:** 让安装脚本和依赖状态脚本对“源码目录 / 已安装目录 / 升级临时副本”使用同一套路径模型。

**Requirements:** R4

**Dependencies:** Unit 1

**Files:**
- Create: `scripts/runtime-context.sh`
- Modify: `scripts/adapter-state.sh`
- Modify: `install.sh`
- Test: `tests/adapter-state.sh`
- Test: `tests/regression.sh`

**Approach:**
- 抽出共享 helper，统一解析 `layout_mode`、`bundle_root`、`optional_adapter_root` 和 `platform`。
- `install.sh` 在安装、升级和状态摘要调用里显式传递目标 root 或 mode，不再让 `adapter-state.sh` 自己猜。
- `adapter-state.sh` 仍保留手动调用时的自动检测兜底，但优先消费调用方显式传入的上下文。
- 源码目录模式下，bundled 提取器存在性应读取仓库内 `deps/`；已安装目录和升级目标模式下，应读取目标 skill root 下的 sibling 目录。
- 源码目录模式需要明确区分“仓库里带着提取器源码”与“目标安装副本已经具备可运行条件”两件事，避免 `deps/.../node_modules` 这类残留再次制造“已经装好”的假象。
- 状态输出里补足足够的诊断信息，帮助定位“源代码有、安装副本没有”这类问题，但不要把调试细节泄露到面向普通用户的默认说明里。

**Patterns to follow:**
- `scripts/shared-config.sh` 当前“多脚本共享单一配置”的做法
- `tests/adapter-state.sh` 现有临时 skill root fixture 风格

**Test scenarios:**
- Happy path: 源码目录模式下检查 `web_article` 与 `youtube_video` 时，不再把 bundled 提取器误报成未安装。
- Happy path: 已安装目录模式下，对同一来源的检查结果与真实安装状态一致。
- Happy path: 升级临时目标模式下，状态脚本读取的是目标目录而不是当前源码目录。
- Edge case: 仓库里存在历史残留的 `node_modules` 或其它提取器产物时，状态检查不会把源码目录误当成目标安装副本已就绪。
- Error path: `classify-run` 在 preflight 为 `not_installed`、`env_unavailable`、`unsupported` 时，保留原状态而不是被覆盖成 `runtime_failed` 或 `empty_result`。

**Verification:**
- 同一组 fixture 在三种 mode 下的结论只随真实目录和环境变化，不再随脚本运行位置漂移。

- [x] **Unit 3: 把共享说明和技能路由改成按需检查可选提取器**

**Goal:** 让用户只有在真的用到 URL 自动提取时，才被引导去启用可选提取器。

**Requirements:** R1, R2, R3

**Dependencies:** Unit 1

**Files:**
- Modify: `SKILL.md`
- Modify: `README.md`
- Modify: `setup.sh`
- Modify: `platforms/claude/CLAUDE.md`
- Modify: `platforms/codex/AGENTS.md`
- Modify: `platforms/openclaw/README.md`
- Test: `tests/adapter-state.sh`
- Test: `tests/regression.sh`

**Approach:**
- 移除 `SKILL.md` 里“首次使用先检查所有提取器依赖”的默认前置描述，改成两层说明：
  - 核心主线前置条件：能执行 shell、能读写本地文件
  - URL 自动提取附加条件：仅当命中对应来源时再检查 Chrome / uv / 提取器
- 统一将缺失提取器时的补装指令改成当前平台的 `bash install.sh --platform <current-platform> --with-optional-adapters`。
- `setup.sh` 保留 Claude 兼容包装，但文档中只在 Claude 专属入口里提到，不再出现在共享说明和跨平台技能说明里。
- README 的“更新”说明同步改成：默认升级更新核心；若需要重新拉起可选提取器，再显式加开关。

**Patterns to follow:**
- `README.md` 当前“共享说明 + 平台薄入口”结构
- `SKILL.md` 当前按来源总表路由 URL / 文件 / 文本的组织方式

**Test scenarios:**
- Happy path: 只处理本地文件或纯文本时，技能说明不再要求先安装网页/YouTube/公众号提取器。
- Happy path: 命中 URL 来源且提取器未启用时，说明会给出当前平台的显式补装指令。
- Error path: Codex 或 OpenClaw 文档中不再把 `setup.sh` 当成通用补装动作。
- Integration: README、平台入口和 `SKILL.md` 三处对于默认安装与显式启用的说法保持一致。

**Verification:**
- 共享说明与平台入口不会再把 Claude 专属命令误导给其他平台。
- 本地文件 / 纯文本工作流在说明层面不再被可选提取器门槛污染。

- [x] **Unit 4: 重写回归矩阵，锁住新的默认边界**

**Goal:** 让测试保护“核心默认可用、可选功能显式开启”的新合同，并补齐升级与运行场景的回归缺口。

**Requirements:** R4, R5, R6

**Dependencies:** Unit 1, Unit 2, Unit 3

**Files:**
- Modify: `tests/regression.sh`
- Modify: `tests/adapter-state.sh`

**Approach:**
- 将现有“默认安装应装上全部提取器”的断言改成：
  - 默认安装只验证核心副本落地且不阻塞
  - 显式 `--with-optional-adapters` 时才验证提取器被复制/安装
- 为 `upgrade` 增加 fixture 化回归：
  - 已安装副本存在时的核心升级
  - 多平台存在时的 `--upgrade` 拒绝分支
  - hook 配置保留
- 为 `adapter-state` 增加三类运行场景矩阵和 preflight 保留断言。
- 保持已有状态分类测试，但把它们改为围绕共享 context helper 组织，而不是只测单一路径。

**Patterns to follow:**
- `tests/regression.sh` 当前以临时 HOME 和 stub 二进制模拟安装环境的方式
- `tests/adapter-state.sh` 当前以 `mktemp` skill root 组装小型 fixture 的方式

**Test scenarios:**
- Happy path: 默认安装在没有 `bun`、没有 `uv`、没有 Chrome 调试端口时仍能完成核心安装。
- Happy path: 显式启用可选提取器时，网页提取 Node 依赖和公众号工具安装链路才会被执行。
- Error path: 多平台已安装时执行默认升级，测试应看到脚本拒绝继续。
- Integration: 从源码目录、已安装目录、升级目标目录分别运行状态检查，输出与真实目录状态一致。

**Verification:**
- 回归套件会在“谁把可选提取器重新塞回默认路径”这类改动上直接失败。

## System-Wide Impact

- **Interaction graph:** `install.sh`、`SKILL.md`、`README.md`、平台入口和测试会一起变化；任何一处继续保留旧默认值，都会把用户重新带回错误路径。
- **Error propagation:** 默认路径不再把 Node、uv、Chrome 相关问题传播成安装失败；这些错误只在显式启用可选提取器后出现。
- **State lifecycle risks:** 运行场景 helper 如果没有被所有调用方统一使用，源码目录和安装目录仍然会继续漂移。
- **API surface parity:** 三个平台的安装口径必须保持一致；Claude 的兼容入口只能作为特例保留，不能重新溢出到共享说明。
- **Integration coverage:** 仅靠单元化 shell 断言不够，必须补“默认安装 + 显式可选 + 升级 + 三种运行场景”的组合回归。
- **Unchanged invariants:** 本地文件、纯文本和已初始化知识库的主线工作流保持不变；URL 自动提取仍然存在，只是从默认安装路径中移出。

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| 新增开关后，README / SKILL / 平台入口说法再次漂移 | 在 Unit 3 和 Unit 4 一起收口，用字符串断言和安装回归同时保护 |
| 共享运行场景 helper 设计过重，反而扩大改动面 | 只抽路径和 mode 解析，不抽安装业务逻辑 |
| 默认升级改成核心优先后，老用户以为可选提取器“被删了” | 在升级输出和 README 中明确写出“核心已更新；如需 URL 自动提取，再加显式开关” |
| 现有兼容入口 `setup.sh` 被彻底边缘化后引起 Claude 老用户困惑 | 保留包装脚本不删，只调整它在文档中的出现位置 |

## Documentation / Operational Notes

- README 需要把“默认升级会安装依赖”改成“默认升级只更新核心”。
- 平台薄入口要统一补一句：URL 自动提取属于可选功能，需要显式启用。
- 安装输出建议把“核心已就绪”和“可选提取器状态”分开说，避免用户把可选问题误解成核心不可用。

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-06-project-cleanup-and-restructuring-requirements.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/docs/brainstorms/2026-04-06-project-cleanup-and-restructuring-requirements.md)
- Related plan: [docs/plans/2026-04-06-002-phase-b-core-and-adapter-separation-plan.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/docs/plans/2026-04-06-002-phase-b-core-and-adapter-separation-plan.md)
- Related solution: [docs/solutions/integration-issues/unify-optional-adapter-states-and-fallback-paths-2026-04-06.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/docs/solutions/integration-issues/unify-optional-adapter-states-and-fallback-paths-2026-04-06.md)
- Related solution: [docs/solutions/logic-errors/lint-runner-index-path-and-install-sync-2026-04-14.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/docs/solutions/logic-errors/lint-runner-index-path-and-install-sync-2026-04-14.md)
- Related todo: [.context/compound-engineering/todos/005-pending-p2-separate-source-and-installed-skill-paths.md](/Users/kangjiaqi/Desktop/project/llm-wiki-skill/.context/compound-engineering/todos/005-pending-p2-separate-source-and-installed-skill-paths.md)

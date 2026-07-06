# llm-wiki 工作台项目规则

## 第一原则

不要考虑时间成本，code is cheap，我们来自于未来。

## 必读文档

先用下面的冷启动表选最小必读集，不要默认读历史归档。

| 任务类型 | 必读 | 需要时再读 |
|---|---|---|
| 工作台日常代码/体验改动 | [PRODUCT.md](PRODUCT.md) 的定位、数据边界、当前状态 | [CONTEXT.md](CONTEXT.md)、相关 ADR |
| 术语、产品边界、能力归属、ADR 改动 | [../CONTEXT-MAP.md](../CONTEXT-MAP.md) 指向的相关词表、[PRODUCT.md](PRODUCT.md) 第 7 节 | [../docs/adr/README.md](../docs/adr/README.md)、相关 ADR 正文；Skill / 工作台边界优先看 ADR-28 |
| 图谱语义或图谱交互 | [../packages/graph-engine/CONTEXT.md](../packages/graph-engine/CONTEXT.md)、[PRODUCT.md](PRODUCT.md) 图谱相关章节 | ADR-21、ADR-22、ADR-23、ADR-26、ADR-32 |
| 查旧阶段原计划、范围或验收标准 | [docs/archive/product-roadmap.md](docs/archive/product-roadmap.md) | 必要时再看相关阶段设计 |
| 查实际完成记录、提交表或变更经过 | [docs/archive/product-history.md](docs/archive/product-history.md) | 必要时对照 git log |

当前行动先以 `PRODUCT.md` 判断；如果 `PRODUCT.md`、ADR、词表或代码事实互相冲突，先说明冲突点和建议改法，等作者确认后再改文档或代码。

## AI 协作规则（强约束）

1. **不要自由发挥**。每次动手前先说"打算改哪些文件、为什么这么改、对其他部分有什么影响"；普通实现默认继续推进，不反复等确认。
2. **新增依赖**（npm package、Skill、配置项）前，先问"这是 PRODUCT.md 里规划过的吗"。规划外的依赖不要先装。
3. **修改 PRODUCT.md 之外的决策**，先说"这与 PRODUCT.md §X.Y 冲突，建议改文档为 Z"，等作者拍板。
4. **作者思路断了时**，先按上面的冷启动表读当前状态，再对照 git log / git diff；不要急着问"做到哪里了"。
5. **绝不主动跳阶段**。阶段 N 验收不过，不允许动阶段 N+1 的代码。
6. **求真不猜**。pi-agent / Skill / 外部库的事实，能查源码就查源码，能查文档就查文档，不要凭训练数据印象答。

## 项目当前阶段

当前状态以 PRODUCT.md §4 为准；旧阶段路线见 `workbench/docs/archive/product-roadmap.md`，验收实况和 commit 表见 `workbench/docs/archive/product-history.md`。当前基线已到阶段 4.8（全局社区高亮已落地，社区阅读主路径走 Sigma）。

❗ 开发主场已在**主仓库 monorepo**（本目录是其 `workbench/` 子目录）：引擎在 `packages/graph-engine/`，`npm run dev` 从 monorepo 根执行。原独立工作台仓库（旧名 llm-wiki-agent）已进入只读过渡状态（不 archive，处置留品牌阶段，见 ADR-20）。

阶段一 / 二 / 三 / 3.5 / 四 / 4.5 / 4.6 / 4.7 / 4.8 均已完成（详见 PRODUCT.md §4 和归档）。

## 验证要求

向作者汇报前，尽一切可能实际验证结果。

- 写代码后至少运行相关检查；能跑全量就跑全量。
- Web 界面改动要启动应用，打开页面，看渲染，点关键流程。
- 脚本或接口改动要用代表性输入跑一遍，检查输出。
- 有明显边界情况时，至少模拟一个边界情况。
- 发现问题就修，再重新验证。

不要把未经验证的初稿交给作者。只有确认正常，或确实遇到需要作者介入的障碍，才汇报。

## 关键路径速查

| 类型 | 值 |
|---|---|
| 一行启动 | `npm run dev`（从仓库根，并行起前后端）|
| 后端端口 | `8787` |
| 前端端口 | `5180`（`strictPort: true`）|
| 知识库默认根 | `~/llm-wiki/` |
| 外部知识库 | 用户任意路径，登记在 `~/.llm-wiki-agent/config.json` |
| 应用数据 | `~/.llm-wiki-agent/`（UI 偏好、外部库登记、对话历史、`lastUsedKbPath`；**不存 API key**）|
| 会话目录 | `~/.llm-wiki-agent/sessions/<sha256-of-kb-path>/*.jsonl` |
| 模型凭证 | `~/.pi/agent/auth.json`（pi-agent 管理，权限 0600）|
| 项目代码 | monorepo：`workbench/server/`（Hono + pi-coding-agent SDK）+ `workbench/web/`（Vite + React + shadcn/ui）+ `packages/graph-engine/`（共享图谱引擎）|

## Node 版本

`>=22.19.0`（pi-coding-agent 当前依赖要求）。

仓库根用 `.mise.toml` / `.nvmrc` 锁定。

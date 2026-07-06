# llm-wiki 工作台 Codex 协作规则

## 第一原则

不要考虑时间成本，code is cheap，我们来自于未来。

做方案和实现时，不要为了省事降低标准。优先选择长期正确、可维护、符合产品方向的做法。

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

## Codex 工作方式

每次开始任务前，先给自己定义完成标准：做到什么程度才算完成、需要怎么验证、哪些情况需要停下来找作者确认。

默认直接推进任务，不为了普通实现细节反复询问作者。开始动手前用简短语言说明：

- 打算改哪些文件
- 为什么这么改
- 可能影响哪些部分
- 准备用什么方式验证

只有遇到下面情况才停下来等作者拍板：

- 要新增 npm package、Skill、系统依赖或新的配置来源
- 要做 `PRODUCT.md` 没规划过的能力
- 当前阶段验收没过，却需要动下一阶段的代码
- 发现现有实现和 `PRODUCT.md` 的产品决策冲突
- 需要修改外部库、用户目录、模型凭证或不可逆数据

## 强约束

1. 不要自由发挥。所有实现都要能对应到 `PRODUCT.md`、阶段设计文档或用户当前请求。
2. 不主动跳阶段。阶段 N 验收不过，不动阶段 N+1 的代码。
3. 不凭印象回答事实问题。`pi-agent`、Skill、外部库、浏览器行为、文件格式等事实，能查源码就查源码，能查官方文档就查官方文档。
4. 不直接修改 `node_modules/`。极端情况下需要补丁时，先说明原因和替代方案。
5. 不把 API key 或模型凭证写进本项目配置。模型凭证由 `~/.pi/agent/auth.json` 管理。
6. 不混用包管理器。本项目使用 npm。
7. 不引入规划外依赖。确实需要时，先问它是否属于 `PRODUCT.md` 已规划范围。

## 验证要求

向作者汇报前，尽一切可能实际验证结果。

- 写代码后至少运行相关检查；能跑全量就跑全量。
- Web 界面改动要启动应用，打开页面，看渲染，点关键流程。
- 脚本或接口改动要用代表性输入跑一遍，检查输出。
- 有明显边界情况时，至少模拟一个边界情况。
- 发现问题就修，再重新验证。

不要把未经验证的初稿交给作者。只有确认正常，或确实遇到需要作者介入的障碍，才汇报。

## 项目当前阶段

当前状态以 `PRODUCT.md` 第 4 节为准；旧阶段路线见 `workbench/docs/archive/product-roadmap.md`，验收实况和旧 changelog 见 `workbench/docs/archive/product-history.md`。这里只放快速概览，避免两处不同步。

当前基线已到阶段 4.8（全局社区高亮已落地，社区阅读主路径走 Sigma）。详细历史不要在本文件重复维护。

❗ 开发主场在**主仓库 monorepo**（本目录是其 `workbench/` 子目录）：图谱引擎在 `packages/graph-engine/`，`npm run dev` 从 monorepo 根执行。原独立工作台仓库（旧名 llm-wiki-agent）已进入只读过渡状态（不 archive，处置留品牌阶段，见 ADR-20）。

阶段一 / 二 / 三 / 3.5 / 四 / 4.5 / 4.6 / 4.7 / 4.8 均已完成（详见 PRODUCT.md §4 和归档）。

## 关键路径速查

| 类型 | 值 |
|---|---|
| 一行启动 | `npm run dev`（从 monorepo 根，并行起前后端）|
| 后端端口 | `8787` |
| 前端端口 | `5180`，`strictPort: true` |
| 知识库默认根 | `~/llm-wiki/` |
| 外部知识库登记 | `~/.llm-wiki-agent/config.json` |
| 应用数据 | `~/.llm-wiki-agent/` |
| 会话目录 | `~/.llm-wiki-agent/sessions/<sha256-of-kb-path>/*.jsonl` |
| 模型凭证 | `~/.pi/agent/auth.json` |
| 后端代码 | `workbench/server/`，Hono + pi-coding-agent SDK |
| 前端代码 | `workbench/web/`，Vite + React + shadcn/ui |
| 共享图谱引擎 | `packages/graph-engine/`（工作台与 Skill 离线 HTML 同享）|

## 环境要求

Node 版本要求：`>=22.19.0`。

仓库根用 `.mise.toml` / `.nvmrc` 锁定版本。开发和验证时优先使用项目锁定的 Node 版本。

## 恢复上下文

如果作者思路断了，或上下文经过压缩，不要急着问“做到哪里了”。

先读：

1. `PRODUCT.md` 当前状态、数据边界和相关决策索引
2. git log / git diff
3. 相关代码和测试
4. 当前任务直接相关的 `CONTEXT.md` 或 ADR

只有需要追旧路线、验收细节或历史提交原因时，再读 `workbench/docs/archive/product-roadmap.md` / `workbench/docs/archive/product-history.md`。

日志和 git 是事实，文档是意图。对照后再继续。

## 对作者汇报

汇报时用简单直白的语言，说清楚：

- 做了什么
- 结果怎样
- 怎么验证过
- 如果有遗留问题，为什么现在不能继续处理

最终回复不要堆实现细节。作者要的是完成、能用的成果，不是中间过程。

# llm-wiki-agent 项目规则

## 第一原则

不要考虑时间成本，code is cheap，我们来自于未来。

## 必读文档

**[PRODUCT.md](PRODUCT.md)** —— 产品定位、架构、当前状态、ADR 和产品边界。任何动手前先读这份文档；旧阶段路线见 [docs/archive/product-roadmap.md](docs/archive/product-roadmap.md)，完整历史记录见 [docs/archive/product-history.md](docs/archive/product-history.md)。

文档与代码 / 约定冲突时，**以 PRODUCT.md 为准**。

## AI 协作规则（强约束）

1. **不要自由发挥**。每次动手前先说"打算改哪些文件、为什么这么改、对其他部分有什么影响"，作者确认后再动。
2. **新增依赖**（npm package、Skill、配置项）前，先问"这是 PRODUCT.md 里规划过的吗"。规划外的依赖不要先装。
3. **修改 PRODUCT.md 之外的决策**，先说"这与 PRODUCT.md §X.Y 冲突，建议改文档为 Z"，等作者拍板。
4. **作者思路断了时**，先读 PRODUCT.md，不要急着问"做到哪里了"——日志 / git 是事实，文档是意图，对照看。
5. **绝不主动跳阶段**。阶段 N 验收不过，不允许动阶段 N+1 的代码。
6. **求真不猜**。pi-agent / Skill / 外部库的事实，能查源码就查源码，能查文档就查文档，不要凭训练数据印象答。

## 项目当前阶段

当前状态以 PRODUCT.md §10 为准；旧阶段路线见 `workbench/docs/archive/product-roadmap.md`，验收实况和 commit 表见 `workbench/docs/archive/product-history.md`。当前基线已到阶段 4.8（全局社区高亮已落地，社区阅读主路径走 Sigma）。

❗ 开发主场已在**主仓库 monorepo**（本目录是其 `workbench/` 子目录）：引擎在 `packages/graph-engine/`，`npm run dev` 从 monorepo 根执行。原独立 llm-wiki-agent 仓库已进入只读过渡状态（不 archive，处置留品牌阶段，见 ADR-20）。

阶段一 / 二 / 三 / 四及阶段 3.5 / 4.5 / 4.6 / 4.7 / 4.8 已完成（详见 PRODUCT.md §10 和归档）：

- 阶段一 ✅ 2026-05-26（主干打通）
- 阶段二 ✅ 2026-05-27（@、/、结晶、消化）
- 阶段三 ✅ 2026-05-27（5 个导出按钮 + 4 个 vendored anthropics Skills + 产物右抽屉 + HTML iframe + 下载渲染器 + Skill 可见性开关）
- 阶段 3.5 ✅ 2026-05-27 至 2026-05-28（导航、多模型、批量消化、当前知识库检索、工作台视觉、可调预览、设置面板滚动修复）
- 阶段四 ✅ 2026-06-12（monorepo 合并 + 共享图谱引擎 + 活地图：钉扎/选区/生长动画 + 离线 HTML 切引擎产物）
- 阶段 4.5 / 4.6 / 4.7 / 4.8 ✅ 2026-06-14 起（图谱可用性、图谱演进第一批、图谱交互地基、全局社区高亮）

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

`>=22.19.0`（pi-coding-agent 0.75.x 的硬要求）。

仓库根用 `.mise.toml` / `.nvmrc` 锁定。

# 长期与 llm-wiki 仓库合并（agent 是 Skill 的升级版）

> 状态：仓库合并愿景已由 ADR-20 落地。本文里的仓库移动、临时仓库和 lift-and-shift 说法属于历史语境；仍然有效的是能力归属原则：Skill 已成熟的知识库主线能力优先复用，工作台专属的对话、界面和状态能力留在工作台侧。

**背景**：作者的 llm-wiki-skill 是成熟项目，纯提示词系统形态，没有 agent 循环 / 子 agent 分工 / 多步工具链。原独立工作台仓库（旧名 llm-wiki-agent）是把 Skill 升级为 agent 形态的实验，现已并入本 monorepo 的 `workbench/`。

**当时决策**：agent 形态成熟后，工作台代码并入 `llm-wiki` 主仓库，作为 Skill 的 agent 升级版同时存在（保留 Skill 给纯 CLI 用户）。该合并已经完成，当前执行路径以 ADR-20、根 `AGENTS.md` 和 `workbench/PRODUCT.md` 为准。

**对架构的指导（"C 混合"归属原则）**：

1. **能力归属原则**："Skill 已有的功能调 Skill，agent 工作台新能力用 Extension"。这条原则今天和合并后都成立——今天的"spawn 外部脚本"合并后变成"同仓库内调用"，调用关系不变
2. **拒绝重复造轮子**：llm-wiki-skill 已实现的消化能力（X / 微信 / 小红书 / 知乎 / YouTube / PDF / 本地文件）一律调 Skill，不在 agent 端重写
3. **拒绝塞 agent 特有命令进 Skill**：对话结晶、UI 元能力（列页面 / 读单页）、auth 管理这些"agent 工作台才有"的概念，用 Extension 实现，不污染 Skill 的"纯提示词系统"特质
4. **代码组织模块化**：历史上要求 agent 端目录结构保持清晰，后续已通过 `workbench/` 和 `packages/graph-engine/` 落地
5. **不为合并提前优化**：历史上先保持工程简单；合并完成后，当前结构以 monorepo 工作区为准

**阶段 3.5 的明确例外**：批量本地文件消化为了验证"便宜模型 + 并行子代理"路线，允许子代理不调用完整 llm-wiki Skill，而是只读单个文件并输出 wiki markdown，主进程负责写盘。这个例外只覆盖阶段 3.5 的 `.md/.txt/.pdf` 批量入库场景，不推翻"Skill 已有能力优先调 Skill"的长期原则。

**未来扩展位**：媒体创作（阶段三）/ 子 agent 分工 / 多模型路由都依赖 agent 形态，是 Skill 给不了的。这些是 agent 形态存在的根本理由。

**与既有 ADR 的关系**：
- 已由 **ADR-20** 落地并修订仓库布局事实
- 强化 **ADR-7**（知识库上下文用 Extension 注入，不拼 prompt）
- 强化 **ADR-13b**（不抄 open-design 的多 CLI 子进程模式，因为我们最终是同仓库 agent）
- 兼容 **ADR-10**（pi-agent 作 npm 依赖）和 **ADR-14**（app 内一键新建知识库）

# 阶段四启动 monorepo 合并（丙方案）

> 状态：已落地的历史决策。本文记录阶段四合并当时的取舍；其中“不改 README / 不做品牌动作”只约束合并当下。当前公开入口和“两种入口”叙事以 ADR-27、根 README 和 `workbench/PRODUCT.md` 为准。

**背景**：ADR-16 定了"agent 成熟后并入主仓库"，但没定时机。阶段四的图谱引擎是两端（工作台 / Skill 离线 HTML）共享的第一块代码——共享代码出现的那一刻，分居两仓库开始产生真实摩擦（跨仓库依赖、双份维护），即合并时机成熟的信号。另两个事实强化此决策：主仓库（1.8k+ star）自 2026-05-13 停更，单人双仓库 = 注意力分裂已被证实；`llm-wiki-agent` 名字与 SamurAIGPT 同名竞品（2.9k star、活跃）撞车，不可作为独立品牌发布。

**决策**：
1. **丙方案**：本仓库 `git subtree add --prefix=workbench`（保留全历史）整体搬入主仓库；引擎落 `packages/graph-engine/`；主仓库根建 workspace package.json
2. **只做工程合并，不做品牌动作**：不发版、不改主仓库 README、不 archive 旧仓库——改名（`llm-wiki-skill` → `llm-wiki`）、双形态叙事、对外发布留给后续品牌阶段
3. **终局形态"一个产品、两扇门"**：产品 = 知识库文件格式 + 中文素材管线 + 方法论；Skill 与工作台是同一份知识库的两个访问端。Skill 永不砍（获客漏斗 + 格式中立性证明）；工作台是长期重心（批量消化 / 多模型 / 产物 / 活图谱等 agent 形态独有能力的家）
4. **Tauri 打包（原阶段五）推迟**：打包是分发优化，先用 `git clone + npm run dev` 验证工作台的真实外部需求
5. ❗ 主仓库测试是 CommonJS，monorepo 根 package.json **不设** `"type": "module"`，ESM 声明留在 workbench 子包内

**拒绝项**：双仓库长期并行（注意力分裂）；agent 另立品牌（撞名 + star 池分裂 + 格式话语权分裂）；引擎放 agent 仓库做完再搬（二次搬运纯损耗）。

**与既有 ADR 的关系**：落地 ADR-16（合并愿景 → 启动执行）；ADR-16 的"能力归属原则"继续生效（Skill 已有能力调 Skill，agent 元能力走 Extension）；ADR-10（pi-agent npm 依赖）不受影响。

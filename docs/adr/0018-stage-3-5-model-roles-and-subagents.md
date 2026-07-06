# 阶段 3.5 多模型双角色 + 轻量子代理框架

**背景**：阶段 1-3 完成后两个痛点同时浮现——TBD-2（多模型路由）一直没有承载场景；阶段二的"一次喂一篇"消化模式拦住了批量进库的用户。两件事在阶段 3.5 合并解决：批量消化天然需要"便宜模型 + 并行"，正好把多模型路由落地。

**决策**：

1. **双角色而非 N 角色**：只引入 `main`（聊天）+ `digest`（消化）两个角色。拒绝项："per-task 模型路由"（消化/沉淀/产出/对话各自一个）太复杂、用户配不动；"只有一个 default model"则无法承载阶段 3.5 的核心需求
2. **角色配置存项目 config.json 不写 pi settings.json**：跨工具污染坏处大于好处；`~/.llm-wiki-agent/config.json` 是我们自己的偏好文件
3. **main 角色接管主对话**：设置里的 main 角色用于主对话创建和切换；保存 main 后重载当前活跃对话，让右上角模型显示与设置保持一致。digest 角色强制走子代理，保证"消化用便宜模型"的承诺
4. **子代理用 pi SDK 原生 API 而非自建框架**：`createAgentSession({ model, authStorage, modelRegistry, sessionManager: inMemory(), tools: ["read"] })` 已经够用。拒绝项：抄 omp 的 `executor.ts` / `index.ts` 那 3000 行（工作树隔离 / 嵌套子代理 / worker IPC 我们都不需要）；自建独立子代理 runtime 重复造轮子
5. **并发控制自写 30 行**：拒绝引入 p-limit / async-pool 等并发库（一个 while 循环就能做）；拒绝 `Promise.all` 一把开（N 个文件 = N 个并发模型请求会 429）
6. **子代理不挂业务 extension**：阶段 3.5 的批量本地文件消化是 ADR-16 的明确例外，消化是裸 prompt + 只读工具的简单任务，挂 KB / synthesis / artifacts extension 反而让 cheap 模型困惑
7. **写盘归主进程**：子代理只输出 wiki markdown 文本，主进程负责写到 `wiki/synthesis/sessions/`。让 cheap 模型决定文件路径风险大；主进程已知正确路径无需让 cheap 模型决策
8. **SSE 沿用 ADR-3 路线**：批量消化接口直接返回 `text/event-stream`，不为此开 WebSocket，也不做轮询
9. **拖拽优先于输入，但不假设浏览器一定暴露绝对路径**：阶段 3.5 先实测 macOS Finder 拖拽时 `DataTransfer` 是否提供 `file://`；若提供则自动填路径，若不提供则用输入框作为明确兜底。输入框不是降级体验，而是 web 沙箱下必须保留的可靠通道

**与既有 ADR 的关系**：
- 解决 **TBD-2**（多模型路由）：选项 B 落地——通过角色映射而非任务路由
- 兼容 **ADR-3**（SSE）：批量消化进度沿用 SSE
- 兼容 **ADR-7**（Extension 注入上下文）：子代理不需要 KB 上下文，直接 prompt 传入；主对话保持现有 extension 注入路径
- 兼容 **ADR-16**（Skill 优先）：本阶段对子代理批量本地文件消化做一次受控例外，不扩展到 Skill 已覆盖的完整素材消化流程
- 兼容 **ADR-10**（pi-agent 作 npm 依赖）：完全用 SDK 原生 API，不 fork 不 patch
- 强化 **ADR-12**（会话绑定知识库）：子代理是临时 inMemory session，不污染 KB 的对话历史
- 强化 **ADR-13**（凭证落 `~/.pi/agent/auth.json`）：modelRoles 只存 `{provider, modelId}`，不存任何 key

**何时重新评估**：
- main 角色切换后如果出现历史会话恢复异常 → 回退为仅对新会话生效
- 用户反馈"批量消化输出格式漂移" → 引入 schema 校验 + 重试
- 用户反馈"并发 3 还是太慢" → 提供更高档位 + 自适应降级（429 自动退避）

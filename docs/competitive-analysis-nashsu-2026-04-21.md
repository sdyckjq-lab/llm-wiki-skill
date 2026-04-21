---
module: competitive-analysis
tags: [竞品分析, 知识图谱, 路线图]
problem_type: strategy
---

# 竞品分析报告：llm-wiki-skill vs nashsu/llm_wiki

> 日期：2026-04-21
> 竞品仓库：https://github.com/nashsu/llm_wiki （~2000 星）
> 我方仓库：https://github.com/sdyckjq-lab/llm-wiki-skill （~1000 星）

## Context

- **我方**：llm-wiki-skill（~1000 星），AI agent 技能插件，运行在 Claude Code/Codex/OpenClaw 内部，纯 Shell + Markdown 架构，借助宿主 agent 的 LLM 能力
- **竞品**：nashsu/llm_wiki（~2000 星），Tauri v2 桌面应用（Rust 后端 + React 前端），自带 LLM 客户端，有完整 GUI

两者都基于 Karpathy llm-wiki 方法论，核心架构一致（三层架构：raw → wiki → schema），但技术路线和产品形态完全不同。本次分析聚焦于功能差距、知识图谱对比、以及我方未来迭代方向。

---

## 一、产品形态对比

| 维度 | 我方（llm-wiki-skill） | 竞品（nashsu/llm_wiki） |
|------|----------------------|------------------------|
| 形态 | Agent 技能（skill），运行在宿主 agent 内 | 独立桌面应用（Tauri v2） |
| 技术栈 | Shell + Markdown 模板 | Rust 后端 + React 19 + TypeScript + Vite |
| LLM 来源 | 宿主 agent 的 LLM | 自带 LLM 客户端（支持 OpenAI/Anthropic/Google/Ollama/Custom） |
| 界面 | 无 GUI，纯对话交互 | 三栏式 GUI（知识树 + 聊天 + 预览） |
| 安装方式 | `bash install.sh --platform claude` | 下载 .dmg/.msi/.deb 安装包 |
| 离线图谱 | 自包含 HTML，双击即开（内嵌 D3 + rough.js） | 应用内 sigma.js 渲染，需启动应用 |
| 多平台 | Claude Code / Codex / OpenClaw | macOS / Windows / Linux 桌面 |

**结论**：产品形态不同，不存在直接替代关系。我方优势在于零安装门槛（已有 agent 就能用），竞品优势在于完整 GUI 体验。

---

## 二、功能逐项对比

### 2.1 Ingest（消化素材）

| 特性 | 我方 | 竞品 | 差距评估 |
|------|------|------|---------|
| 两步式处理 | Step 1 结构化分析(JSON) + Step 2 页面生成 | Step 1 分析 + Step 2 生成（FILE block 解析） | **相当** |
| 格式验证 | `validate-step1.sh` 脚本校验 JSON | FILE block 正则解析 | **我方更严格** |
| 置信度标注 | EXTRACTED / INFERRED / AMBIGUOUS / UNVERIFIED 四级 | 无 | **我方独有** |
| 隐私自查 | 每次消化前自查清单 | 无 | **我方独有** |
| 内容分级 | >1000字完整 / ≤1000字简化 | 统一处理 | **我方更细致** |
| SHA256 缓存 | 有（含自愈、回滚、原子写入） | 有（基于文件内容哈希） | **相当** |
| 持久化队列 | 无（依赖宿主 agent 管理） | 有（串行处理、崩溃恢复、3次重试） | **竞品领先** |
| 文件夹导入 | batch-ingest 工作流，每5个暂停 | 递归导入保留目录结构，文件夹路径作为分类上下文 | **竞品在分类上有亮点** |
| 进度可视化 | 纯文本反馈 | Activity Panel 实时进度条 | **竞品领先**（但我方受限于无 GUI） |
| 自动嵌入 | 无 | ingest 后自动生成向量嵌入 | **竞品领先** |
| 溯源标记 | source 页面 + 缓存 | 每个页面 frontmatter `sources: []` | **竞品更细粒度** |
| 语言守护 | 全局 WIKI_LANG 切换 | 每个文件独立检测语言，拒绝语言错误的文件 | **竞品更安全** |
| 来源可溯 | 缓存关联 raw → source 页面 | `sources: []` 数组在 frontmatter 中 | **竞品更系统化** |

### 2.2 知识图谱（重点对比）

| 特性 | 我方 | 竞品 | 差距评估 |
|------|------|------|---------|
| 图谱库 | D3.js 力导向 + rough.js 手绘 | sigma.js + graphology + ForceAtlas2 | **技术路线不同** |
| 视觉风格 | 水彩卡片风（4种变体：wash/paper/vellum/blueprint） | 标准网络图（节点+边） | **我方视觉更独特** |
| 离线能力 | 自包含 HTML，双击即开 | 需启动桌面应用 | **我方更便携** |
| 社区检测 | 主题页→社区，按度数选 top-30 | **Louvain 算法** 自动聚类 + 凝聚度评分 | **竞品算法更成熟** |
| 边权重 | 无（统一 `-->` 箭头） | **4信号相关度模型**（直接链接×3、来源重叠×4、Adamic-Adar×1.5、类型亲和×1） | **竞品显著领先** |
| 边渲染 | 手绘风格贝塞尔曲线 | 粗细/颜色按权重变化 | **竞品信息量更大** |
| 图谱洞察 | 无 | **惊人连接 + 知识缺口 + 桥节点** | **竞品独有，价值极高** |
| 惊人连接 | 无 | 跨社区边、跨类型连接、边缘↔枢纽耦合，复合惊喜评分 | **竞品独有** |
| 知识缺口 | 无 | 孤立节点、稀疏社区、桥节点检测，一键触发深度研究 | **竞品独有** |
| 交互 | 搜索/过滤/节点抽屉/小地图/缩放 | Hover 邻居高亮/点击打开页面/缩放控制/Insight 高亮 | **各有所长** |
| 节点详情 | 抽屉面板（Markdown 渲染 + wikilink 导航） | 点击打开预览面板 | **我方更丰富** |
| 位置缓存 | 无（每次重新布局） | 有（避免重布局跳动） | **竞品体验更好** |
| 凝聚度 | 无 | 每个社区计算实际边/可能边比率，<0.15 标记警告 | **竞品独有** |

**竞品图谱核心实现细节**（深入代码分析）：

- **相关度模型**（`graph-relevance.ts`，313 行）：4 信号加权计算，每个节点维护 `outLinks`、`inLinks`、`sources`，Adamic-Adar 用 `1 / Math.log(Math.max(degree, 2))` 权重化共同邻居贡献
- **Louvain 聚类**（`wiki-graph.ts`，305 行）：graphology-communities-louvain 算法，社区凝聚度 = 实际内部边数 / 可能边数
- **图谱洞察**（`graph-insights.ts`，193 行）：惊人连接（跨社区+3、跨类型+2、边缘-枢纽+2、弱连接+1，阈值≥3）、知识缺口（孤立节点 degree≤1、稀疏社区 cohesion<0.15 且≥3 节点、桥节点连接≥3 社区）
- **可视化**（`graph-view.tsx`，883 行）：sigma.js WebGL 渲染 + ForceAtlas2 布局，150 次迭代，位置缓存避免重布局，边粗细 0.5-4 按权重归一化

### 2.3 检索与查询

| 特性 | 我方 | 竞品 | 差距评估 |
|------|------|------|---------|
| 基础搜索 | Grep 关键词搜索 | 分词搜索（英文分词+去停用词、中文 CJK bigram） | **竞品更智能** |
| 向量搜索 | 无 | LanceDB + 任意 OpenAI 兼容嵌入端点 | **竞品独有** |
| 图谱扩展 | 无 | Top 搜索结果→种子节点→2跳遍历+衰减 | **竞品独有** |
| 上下文预算 | 无 | 可配置 4K→1M token（60% wiki / 20% 对话 / 5% index / 15% system） | **竞品独有** |
| 语义搜索 | 无 | 余弦相似度 ANN 检索，recall 从 58.2% 提升到 71.4% | **竞品独有** |
| 多轮对话 | 依赖宿主 agent | 独立多会话持久化，可配置历史深度 | **形态差异** |

### 2.4 深度研究（Deep Research）

| 特性 | 我方 | 竞品 |
|------|------|------|
| 网络搜索 | 无 | Tavily API，多查询并行 |
| LLM 综合 | 无 | 自动综合搜索结果为 wiki 页面 |
| 自动消化 | 无 | 研究结果自动 ingest 提取实体/概念 |
| 图谱联动 | 无 | 从图谱洞察一键触发，LLM 生成领域感知的搜索主题 |
| 确认流程 | 无 | 可编辑的研究主题和搜索查询确认对话框 |
| 并发控制 | 无 | 3 并发任务队列 |

**竞品深度研究实现细节**（`deep-research.ts`，244 行）：

- 多查询并行搜索 → URL 去重合并 → LLM 综合为 wiki 页面（带 `[[wikilink]]` 交叉引用） → 保存到 `wiki/queries/research-{slug}-{date}.md` → 自动 ingest 提取实体/概念
- 图谱联动：点击知识缺口的"Deep Research"按钮 → LLM 读取 overview.md + purpose.md 生成领域感知的搜索主题（`optimize-research-topic.ts`） → 用户可编辑确认 → 开始研究

### 2.5 审核系统（Review）

| 特性 | 我方 | 竞品 |
|------|------|------|
| 异步审核 | 无 | LLM 在 ingest 中标记需人工判断的条目 |
| 预定义动作 | 无 | Create Page / Skip（防止 LLM 幻觉任意动作） |
| 搜索查询 | 无 | ingest 时预生成优化的 web 搜索查询 |
| 自动清扫 | 无 | sweep-reviews：基于规则匹配 + LLM 语义判断自动解决 |

### 2.6 文件格式支持

| 格式 | 我方 | 竞品 |
|------|------|------|
| PDF | 有 | 有（Rust pdf-extract） |
| Markdown/文本 | 有 | 有 |
| DOCX | 无 | 有（docx-rs） |
| PPTX | 无 | 有（ZIP + XML） |
| XLSX/XLS/ODS | 无 | 有（calamine） |
| 图片预览 | 无 | 有 |
| 视频/音频 | 无 | 有（内置播放器） |
| 网页 | 有（baoyu-url-to-markdown） | 有（Chrome 扩展 Readability.js） |
| X/Twitter | 有（baoyu） | 有（Chrome 扩展） |
| 微信公众号 | 有（wechat-article-to-markdown） | 无 |
| YouTube | 有（youtube-transcript） | 无 |
| 知乎 | 有（baoyu） | 无 |
| 小红书 | 手动粘贴 | 无 |

### 2.7 其他功能

| 特性 | 我方 | 竞品 |
|------|------|------|
| Chrome 扩展 | 无 | 有（Manifest V3，Readability.js + Turndown.js） |
| KaTeX 数学 | 无 | 有（remark-math + rehype-katex + Milkdown） |
| 思维链显示 | 无 | 有（`<thinkining>` 块折叠显示） |
| 场景模板 | 无 | 有（研究/阅读/个人成长/商业/通用） |
| 对话结晶化 | 有（crystallize 工作流） | Save to Wiki（类似但更集成） |
| 删除级联 | 有（delete 工作流 + 缓存失效） | 有（3方法匹配 + 共享页面保留） |
| SessionStart Hook | 有（自动感知知识库） | 无（依赖应用启动） |

---

## 三、核心差距总结

### 我方独有的优势
1. **置信度标注体系** — 四级标注 + 可追溯，竞品完全没有
2. **水彩卡片风图谱** — 视觉独特性，自包含离线 HTML
3. **隐私自查** — 消化前敏感信息检查
4. **中国素材源** — 微信公众号、知乎、小红书、YouTube
5. **零门槛安装** — 一句话安装，不需要下载桌面应用
6. **多 agent 平台** — Claude Code / Codex / OpenClaw 通用
7. **Ingest 格式验证** — `validate-step1.sh` 独立脚本校验

### 我方的核心差距（按优先级排序）

**P0 — 决定性差距（严重影响产品竞争力）**

1. **图谱相关度模型**：我方图谱只有 wikilink 连接，没有边权重、没有来源重叠分析、没有 Adamic-Adar 共同邻居计算。图谱是"平"的，所有连接看起来一样重要。
   - 竞品做法：4 信号相关度模型（`graph-relevance.ts`），每条边都有权重分数
   - 实现难度：中等。需要读取 frontmatter `sources` 字段做来源重叠，实现 Adamic-Adar。可在 `build-graph-data.sh` 中扩展。

2. **图谱洞察**：没有"惊人连接"和"知识缺口"检测。图谱只是可视化工具，不是分析工具。
   - 竞品做法：`graph-insights.ts`（193 行），自动检测跨社区连接、孤立节点、稀疏社区、桥节点
   - 实现难度：中等。纯算法，不依赖 GUI。可在 `graph-wash.js` 中实现或在 `build-graph-data.sh` 中计算。

3. **深度研究（Deep Research）**：完全没有网络搜索+自动研究能力。
   - 竞品做法：`deep-research.ts`（244 行），Tavily API 搜索 → LLM 综合 → 自动 ingest
   - 实现难度：高。需要接入搜索 API，设计新的工作流。但作为 agent skill 可以利用宿主 agent 的搜索能力。

**P1 — 重要差距（影响日常使用体验）**

4. **向量语义搜索**：检索只靠关键词匹配，没有语义理解能力。
   - 竞品做法：LanceDB（Rust 嵌入式向量库） + 任意 OpenAI 兼容嵌入端点
   - 实现难度：高。需要引入向量数据库。但作为 agent skill，可以利用宿主 agent 的语义理解能力来弥补。

5. **来源溯源系统**：我方的溯源不够系统化，每个 wiki 页面没有标准化的 `sources: []` frontmatter 字段。
   - 竞品做法：每个页面 frontmatter 都有 `sources: ["file.pdf"]` 字段
   - 实现难度：低。主要是在模板中增加 `sources` 字段，在 ingest 中写入。**这是相关度模型和图谱洞察的基础前置依赖。**

6. **Louvain 社区检测**：我方用简单的"主题页→社区"策略，不如图论算法准确。
   - 竞品做法：graphology-communities-louvain 算法 + 凝聚度评分
   - 实现难度：中等。在 `build-graph-data.sh` 中用 awk 或引入简单聚类算法。

**P2 — 锦上添花**

7. **持久化 Ingest 队列**：批量消化时没有崩溃恢复能力。
8. **语言守护**：没有 per-file 语言检测和拒绝机制。
9. **DOCX/PPTX/XLSX 支持**：缺少 Office 文档格式支持。
10. **数学渲染**：没有 KaTeX/LaTeX 支持。
11. **审核系统**：没有异步审核队列。

---

## 四、未来迭代方向建议

基于差距分析，建议按以下优先级推进：

### 第一阶段：巩固图谱核心竞争力（图谱 2.0）

目标：把图谱从可视化工具升级为知识分析工具。

1. **来源溯源字段**（前置依赖）
   - 在所有页面模板中增加 `sources: []` frontmatter 字段
   - 在 ingest 工作流中自动填充
   - 这是后续相关度模型的基础

2. **4 信号相关度模型**
   - 直接链接（已有 wikilink）
   - 来源重叠（基于 `sources: []` 字段）
   - Adamic-Adar 共同邻居
   - 类型亲和度
   - 在 `build-graph-data.sh` 中计算，输出到 `graph-data.json` 的 `edges[].weight`

3. **图谱洞察模块**
   - 在 `build-graph-data.sh` 或独立脚本中计算：
     - 惊人连接（跨社区边、跨类型、边缘-枢纽耦合）
     - 知识缺口（孤立节点、稀疏社区、桥节点）
   - 输出到 `graph-data.json` 的 `insights` 字段
   - 在 `graph-wash.js` 中增加 Insights 面板 UI

4. **凝聚度评分 + Louvain 社区检测**
   - 升级社区检测算法
   - 计算每个社区的凝聚度
   - 在图谱中标记低凝聚度社区

### 第二阶段：深度研究能力

1. **Deep Research 工作流**
   - 新增 SKILL.md 工作流定义
   - 利用宿主 agent 的搜索能力（Claude Code 的 WebSearch、Codex 的内置搜索）
   - 或接入搜索 API（Tavily / Serper / Bing）
   - 研究结果自动 ingest
   - 与图谱洞察联动（从知识缺口触发研究）

2. **检索管线优化**
   - 结构化搜索（带权重的分词搜索）
   - 图谱扩展检索（种子节点 + 2 跳遍历）
   - 上下文预算控制

### 第三阶段：体验打磨

1. **审核系统** — Ingest 中标记需审核条目，在 lint 工作流中展示和处理
2. **Office 文档支持** — DOCX 提取（可利用 pandoc 或 Python docx），PPTX / XLSX 基础支持
3. **数学渲染** — 图谱 HTML 中的 KaTeX 渲染

### 不建议跟进的方向

- **独立 GUI 应用**：我方定位是 agent skill，做 GUI 会偏离核心定位
- **Chrome 扩展**：投入产出比低，baoyu-url-to-markdown 已覆盖网页提取
- **向量数据库**：作为 agent skill，宿主 agent 的语义理解能力已够用，引入 LanceDB 过度复杂
- **多对话持久化**：宿主 agent 已有此能力

---

## 五、实施验证方式

每个阶段完成后：

1. **回归测试**：`bash tests/regression.sh` 确保不破坏现有功能
2. **图谱验证**：用 `raw-input/` 目录下的 3 篇文章测试图谱生成
3. **推送前检查**：按 CLAUDE.md 中的三层测试规则执行
4. **竞品对照**：对同一组素材，比较双方图谱的洞察质量

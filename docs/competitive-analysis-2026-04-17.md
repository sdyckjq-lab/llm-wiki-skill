# 竞品分析报告：llm-wiki-agent vs llm-wiki-skill

> 针对三个功能方向：Obsidian 集成、知识图谱可视化、arXiv 论文支持
> 日期：2026-04-17

## 项目概况

| | **llm-wiki-skill（本项目）** | **llm-wiki-agent** |
|---|---|---|
| **地址** | https://github.com/sdyckjq-lab/llm-wiki-skill | https://github.com/SamurAIGPT/llm-wiki-agent |
| **定位** | Harness 附属 Skill，10 个工作流的知识库 | 自维护知识库 Agent，4 个核心工作流 |
| **语言** | Shell + Markdown | Python + Markdown |
| **Stars** | — | ~1,971 |
| **数据采集** | **强**：10 种来源适配器（网页/X/微信/YouTube/知乎/PDF/笔记等） | **无**：需手动准备素材到 raw/ |
| **运行方式** | 依附 Claude Code / Codex / OpenClaw | 独立 Python 脚本 或 Agent 内运行 |

---

## 一、Obsidian 集成

### 本项目现状

已有基础兼容：
- 所有页面使用 `[[wikilink]]` 双向链接（Obsidian 原生支持）
- YAML frontmatter（tags/created/updated 等）
- Mermaid 图谱在 Obsidian 中可渲染
- init 时提示"推荐用 Obsidian 打开"

**缺失**：
- 没有 symlink 挂载指南
- 没有 Web Clipper 集成说明
- 没有 Dataview 查询示例
- 没有 `.obsidian/` 工作区配置

### llm-wiki-agent 做法

提供三层集成：
1. **Symlink 模式**：`ln -sfn ~/llm-wiki-agent/wiki ~/your-obsidian-vault/wiki`，wiki 目录映射到 Vault
2. **Web Clipper**：明确推荐用 Obsidian Web Clipper 插件剪藏网页，存到 `raw/` 等 ingest
3. **Graph View 优化**：建议排除 `index.md` 和 `log.md`（`-file:index.md -file:log.md`），避免它们成为图谱引力中心
4. **Dataview**：概念性提到利用 frontmatter 的 `type` 和 `tags` 字段查询（未给具体示例）

### 借鉴建议

**P0 — 在文档中补充 Obsidian 使用指南**：
- symlink 命令示例
- Web Clipper 配置说明（剪藏到 `raw/` 对应子目录）
- Graph View 过滤建议（排除 index.md / log.md）
- Dataview 查询示例（按 type/sources 过滤）

实现成本极低（纯文档），收益大——用户最常问的就是"怎么和 Obsidian 配合"。

---

## 二、知识图谱可视化

### 本项目现状

**graph 工作流**（SKILL.md）：
- 扫描所有 `[[wikilink]]`，建立页面关系
- 输出 Mermaid `graph LR` 到 `wiki/knowledge-graph.md`
- 超过 50 条关系时只保留被引用最多的 30 个节点
- 关系类型词汇表（实现/依赖/对比/矛盾/衍生）可选标注，AI 不自动打标

**局限**：
- 只看显式 wikilink，不推断隐含关系
- 静态 Mermaid 图，无交互（搜索/过滤/点击展开）
- 无社区检测（看不出知识聚类）
- 无图谱健康报告

### llm-wiki-agent 做法

`build_graph.py`（~1244 行），核心设计：

**两阶段边构建**：
- Pass 1 — 确定性：正则提取 `[[wikilink]]`，置信度 1.0
- Pass 2 — 语义推断：LLM 分析每个页面，推断隐式关系。>= 0.7 为 INFERRED，< 0.7 为 AMBIGUOUS

**Louvain 社区检测**：`nx.community.louvain_communities(G, seed=42)`，确定性种子，自动发现知识聚类

**健康报告**：孤立节点、上帝节点（度 > mean+2sigma）、脆弱桥接（社区间仅 1 条边）、健康评分

**vis.js 交互式 HTML**：搜索框、边类型复选框（EXTRACTED/INFERRED/AMBIGUOUS）、置信度滑块、右侧抽屉展示 Markdown 内容、内置 Markdown 渲染器

**缓存 + 断点续传**：SHA256 增量，JSONL 记录已处理页面

### 借鉴建议

按优先级分步实现：

**P1 — 增强现有 Mermaid 图谱**（低成本，纯 SKILL.md 改动）：
- graph 工作流增加"隐含关系推断"环节（让 AI 在提取 wikilink 之外，额外标注未显式链接但有语义关系的节点对）
- 输出增加社区聚类标注（用 Mermaid subgraph 分组）
- 增加图谱健康摘要（孤立节点数、最大连通分量）

**P2 — 生成 vis.js 交互式 HTML**（中等成本，需新增脚本）：
- 参考 llm-wiki-agent 的 vis.js 模板，做自包含 HTML
- 搜索、过滤、点击展开
- 这一步需要新建 `scripts/build-graph-html.sh` 或类似脚本

**不建议照搬**：
- Louvain 社区检测需要 Python + networkx，与本项目 Shell/Agent 架构不匹配
- 可让 AI 在 graph 工作流中用"人工"方式识别社区（成本高但无需新依赖）

---

## 三、arXiv 论文支持

### 本项目现状

- PDF 已是核心内置来源（`local_pdf`，`raw/pdfs/`）
- agent 可直接读取 PDF 内容并进入标准 ingest
- **无 arXiv 专用功能**：不识别 arXiv URL、不自动下载、不提取论文元数据

### llm-wiki-agent 做法

- 同样无内置 arXiv 支持
- 提供 `file_to_markdown.py`（基于微软 markitdown）转 PDF -> Markdown
- 流程：手动下载 PDF -> 转换 -> 放入 `raw/` -> ingest

### 借鉴建议

**P0 — 在 source-registry.tsv 增加 arXiv 来源类型**：
- 新增 `arxiv_paper` 来源，匹配规则 `url_host:arxiv.org`
- ingest 时：从 URL 提取论文 ID -> 用 Harness 的 web 能力下载 PDF -> 存入 `raw/pdfs/` -> 进入标准 PDF ingest
- 元数据提取（标题/作者/摘要）可在 ingest Step 1 中让 AI 从内容中提取

**成本**：主要是 source-registry.tsv 一行配置 + SKILL.md ingest 路由逻辑小改，不需要新脚本。

---

## 四、附带发现：其他值得借鉴的特性

| 特性 | llm-wiki-agent 实现 | 借鉴价值 |
|------|-------------------|---------|
| **heal.py 自修复** | 自动找到被引用 3+ 次但没有页面的实体，用 LLM 生成定义页 | **高** — 可以在 lint 工作流中加入"自动修复"环节 |
| **refresh.py 哈希检测** | 检测 raw/ 文件变更自动触发 re-ingest | **中** — 本项目已有 cache.sh，可扩展为 `status` 工作流中提示变更文件 |
| **域特定模板** | 日记/会议记录等专用模板 | **低** — 当前通用模板已够用，按需添加即可 |
| **图谱感知 lint** | 检查 hub stubs / fragile bridges / isolated communities | **中** — 依赖 P1 图谱增强完成后自然加入 |

---

## 五、总结：建议实施优先级

| 优先级 | 功能 | 预估工作量 | 类型 |
|--------|------|-----------|------|
| **P0** | Obsidian 使用指南（文档） | 0.5 天 | 纯文档 |
| **P0** | arXiv 来源路由（source-registry + ingest 路由） | 0.5 天 | 配置 + 小改 |
| **P1** | 图谱增强（隐含关系推断 + 社区标注 + 健康摘要） | 1 天 | SKILL.md 改动 |
| **P2** | vis.js 交互式图谱 HTML | 2-3 天 | 新增脚本 + 模板 |
| **P1** | lint 自修复（heal 概念） | 0.5 天 | SKILL.md 改动 |

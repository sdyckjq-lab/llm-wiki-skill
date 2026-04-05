---
name: llm-wiki
description: |
  个人知识库构建系统（基于 Karpathy llm-wiki 方法论）。让 AI 持续构建和维护你的知识库，
  支持多种素材源（网页、推特、公众号、小红书、知乎、YouTube、PDF、本地文件），
  自动整理为结构化的 wiki。
  使用此 skill 的场景：用户说"构建知识库"、"新建 wiki"、"整理笔记"、"消化这篇文章"、
  "添加素材"、"知识库状态"、"检查知识库"、"llm-wiki"，或者用户提供了一个 URL/文件并
  要求整理、归档、提取知识。也适用于：研究笔记整理、读书笔记、竞品分析、课程笔记、
  旅行规划、任何需要持续积累知识的场景。即使用户没有明确说"知识库"，只要涉及"把这些
  资料整理起来"、"建立一个学习笔记系统"、"帮我归纳总结"等意图，都应该触发此 skill。
---

# llm-wiki — 个人知识库构建系统

> 把碎片化的信息变成持续积累、互相链接的知识库。你只需要提供素材，AI 做所有的整理工作。

## 这个 skill 做什么

llm-wiki 帮你构建一个**持续增长的个人知识库**。它不是传统的笔记软件，而是一个让 AI 帮你维护的 wiki 系统：

- 你给素材（链接、文件、文本），AI 提取核心知识并整理成互相链接的 wiki 页面
- 知识库随着每次使用变得越来越丰富，而不是每次重新开始
- 所有内容都是本地 markdown 文件，用 Obsidian 或任何编辑器都能查看

## 核心理念

传统方式（RAG/聊天记录）的问题：每次问问题，AI 都要从头阅读原始文件，没有积累。知识库的价值在于**知识被编译一次，然后持续维护**，而不是每次重新推导。

## 快速开始

告诉用户这两步就够了：

1. **初始化**：说"帮我初始化一个知识库"
2. **添加素材**：给一个链接或文件，说"帮我消化这篇"

---

## Script Directory

Scripts located in `scripts/` subdirectory.

**Path Resolution**:
1. `SKILL_DIR` = this SKILL.md's directory
2. Script path = `${SKILL_DIR}/scripts/<script-name>`

---

## 依赖检查

首次使用时，检查以下 skill 是否已安装。如果缺失，提示用户运行安装：

```bash
bash ${SKILL_DIR}/setup.sh
```

依赖 skill：
- `baoyu-url-to-markdown` — 网页和公众号文章提取
- `x-article-extractor` — X/Twitter 内容提取
- `youtube-transcript` — YouTube 字幕提取

即使部分依赖缺失，skill 仍可工作（用户可以手动粘贴文本内容）。

---

## 工作流路由

根据用户的意图，路由到对应的工作流：

| 用户意图关键词 | 工作流 |
|---|---|
| "初始化知识库"、"新建 wiki"、"创建知识库" | → **init** |
| URL / 文件路径 / "添加素材"、"消化"、"整理" / 直接给链接 | → **ingest** |
| "批量消化"、"把这些都整理" / 给了文件夹路径 | → **batch-ingest** |
| "关于 XX"、"查询"、"XX 是什么"、"总结一下" | → **query** |
| "给我讲讲 XX"、"深度分析 XX"、"综述 XX"、"digest XX" | → **digest** |
| "检查知识库"、"健康检查"、"lint" | → **lint** |
| "知识库状态"、"现在有什么"、"有多少素材" | → **status** |
| "画个知识图谱"、"看看关联图"、"graph"、"知识库地图" | → **graph** |

**重要**：如果用户直接给了一个 URL 或文件，但没有明确说要做什么，默认走 **ingest** 工作流。如果知识库还不存在，先自动走 **init** 再走 **ingest**。

---

## 工作流 1：init（初始化知识库）

### 前置检查（含多知识库 CWD 检查）

1. 先检查**当前工作目录**是否包含 `.wiki-schema.md`
   - 如果包含 → 当前目录已经是一个知识库，提示用户已存在并询问是否要重新初始化
2. 如果当前目录没有 → 读取 `~/.llm-wiki-path` 文件
   - 如果存在 → 提示用户已有一个知识库（显示路径），询问是要新建还是切换到那个
3. 两个都没有 → 进入初始化流程

### 步骤

1. **询问知识库主题**（用 AskUserQuestion）：
   - "你的知识库要围绕什么主题？比如'AI 学习笔记'、'产品竞品分析'、'读书笔记'"
   - 如果用户没想法，默认用"我的知识库"

2. **询问知识库语言**（用 AskUserQuestion）：
   - "知识库内容用什么语言？中文 / English（默认中文）"
   - 选项：`zh`（中文）或 `en`（English）
   - 如果用户没有明确说，默认 `zh`
   - 将选择记录为 `WIKI_LANG`（`zh` 或 `en`）

3. **询问保存位置**（用 AskUserQuestion）：
   - 默认：`~/Documents/我的知识库/`（zh）或 `~/Documents/my-wiki/`（en）
   - 用户可以自定义路径

4. **运行初始化脚本**：
   ```bash
   bash ${SKILL_DIR}/scripts/init-wiki.sh "<路径>" "<主题>"
   ```

5. **写入语言配置并本地化种子文件**：
   - 用 Edit tool 将 `.wiki-schema.md` 中的 `语言：{{LANGUAGE}}` 替换为：
     - `zh` → `语言：中文`（种子文件保持中文，无需额外处理）
     - `en` → `语言：English`，**同时**用 Write tool 覆写以下种子文件为英文版：

   **`index.md`（en）**：
   ```markdown
   # Wiki Index

   > Last updated: {{DATE}}

   ---

   ## Overview

   - Topic: {{TOPIC}}
   - Total sources: 0
   - Total wiki pages: 0

   ---

   ## Entity Pages

   > People, organizations, concepts, tools

   (none yet)

   ---

   ## Topic Pages

   > Research topics, knowledge domains

   (none yet)

   ---

   ## Source Summaries

   > One summary page per ingested source

   (none yet)

   ---

   ## Comparisons

   > Side-by-side analysis of options, tools, viewpoints

   (none yet)

   ---

   ## Synthesis

   > Deep cross-source analysis

   (none yet)
   ```

   **`wiki/overview.md`（en）**：
   ```markdown
   # {{TOPIC}} — Wiki Overview

   > Created: {{DATE}}

   ---

   ## About this wiki

   This wiki collects all knowledge and sources about **{{TOPIC}}**.

   Each source is digested and organized by AI into interlinked wiki pages. Browse by:

   - **Entity pages**: people, organizations, concepts, tools
   - **Topic pages**: synthesis around a research theme
   - **Source summaries**: key takeaways from each source
   - **Comparisons**: side-by-side analysis of options or viewpoints
   - **Synthesis**: deep cross-source insights

   ---

   ## Knowledge map

   (Will show major coverage areas as sources accumulate)

   ---

   ## Quick navigation

   | Type | Count | View |
   |------|-------|------|
   | Sources | 0 | [[Source Summaries]] |
   | Entities | 0 | [[Entity Pages]] |
   | Topics | 0 | [[Topic Pages]] |
   | Comparisons | 0 | [[Comparisons]] |
   | Synthesis | 0 | [[Synthesis]] |

   ---

   ## Recent updates

   (none yet)
   ```

   **`log.md`（en）**：
   ```markdown
   # Operation Log

   > Records all changes to this wiki

   ---

   ## {{DATE}} — Initialized

   - **Action**: Created wiki
   - **Topic**: {{TOPIC}}
   - **Status**: Done
   ```

   将上述模板中的 `{{DATE}}` 和 `{{TOPIC}}` 替换为实际值后写入文件。

6. **记录路径**到 `~/.llm-wiki-path`：
   ```bash
   echo "<路径>" > ~/.llm-wiki-path
   ```

7. **输出引导**（根据 `WIKI_LANG` 切换语言）：

   **中文（zh）**：
   ```
   知识库已创建！路径：<路径>

   接下来你可以：
   - 给我一个链接，我会自动提取并整理（网页、X/Twitter、公众号、知乎等）
   - 小红书内容请直接粘贴文本给我（暂不支持自动提取）
   - 给我一个本地文件路径（PDF、Markdown 等）
   - 直接粘贴文本内容
   - 批量消化：给我一个文件夹路径

   推荐：用 Obsidian 打开这个文件夹，可以实时看到知识库的构建效果。
   ```

   **English（en）**：
   ```
   Wiki created! Path: <path>

   Next steps:
   - Give me a URL and I'll extract and organize it (web articles, X/Twitter, etc.)
   - Give me a local file path (PDF, Markdown, etc.)
   - Paste text content directly
   - Batch ingest: give me a folder path

   Tip: Open this folder in Obsidian to see the wiki build in real time.
   ```

---

## 工作流 2：ingest（消化素材）

这是最核心的工作流。用户给一个素材进来，AI 做所有的整理工作。

### 前置检查（含多知识库 CWD 检查）

1. 先检查**当前工作目录**是否包含 `.wiki-schema.md`
   - 如果包含 → 用当前目录作为知识库根路径
   - 如果不包含 → 回退到读取 `~/.llm-wiki-path`
2. 两个都没有 → 先运行 init 工作流
3. 读取知识库根目录下的 `.wiki-schema.md` 了解知识库配置
4. **读取语言配置**：从 `.wiki-schema.md` 的"语言"字段判断 `WIKI_LANG`：
   - `语言：中文` → `WIKI_LANG=zh`
   - `语言：English` → `WIKI_LANG=en`
   - 字段缺失 → 默认 `zh`
   - 后续所有输出（摘要页内容、向用户展示的结果）均按此语言生成

### 素材提取路由

根据素材类型自动路由到最佳提取方式：

**URL 类素材**（检查域名自动路由）：

> **Chrome 提示**（仅需要调用 `baoyu-url-to-markdown` 或 `x-article-extractor` 时执行）：
> 在调用这两个 skill 之前，先用 Bash 执行 `pgrep -x "Google Chrome"` 检查 Chrome 是否运行。
> - 如果 Chrome **未运行** → 提示用户：
>   ```
>   提示：Chrome 当前未运行。baoyu-url-to-markdown 会尝试自动启动 Chrome，
>   如果提取失败，请手动启动 Chrome 后重试。
>   ```
>   **继续执行**，不要等待用户确认——extractor 会自己处理 Chrome 启动。
> - 如果 Chrome **已运行** → 正常继续，无需提示。

- `x.com` / `twitter.com` → 使用 Skill tool 调用 `x-article-extractor`
- `mp.weixin.qq.com` → 使用 Skill tool 调用 `baoyu-url-to-markdown`
- `youtube.com` / `youtu.be` → 使用 Skill tool 调用 `youtube-transcript`
- `xiaohongshu.com` / `xhslink.com` → **无法自动提取**，提示用户：
  ```
  小红书暂不支持自动提取。请打开小红书 App/网页，复制内容粘贴给我。
  ```
- `zhihu.com` → 尝试使用 Skill tool 调用 `baoyu-url-to-markdown`；如果失败，提示用户手动粘贴
- 其他 URL → 使用 Skill tool 调用 `baoyu-url-to-markdown`

**本地文件**（按扩展名判断）：
- `.pdf` → 使用 Read tool 直接读取
- `.md` / `.txt` / `.html` → 使用 Read tool 直接读取

**纯文本粘贴** → 直接使用用户提供的文本

**容错处理**：
如果 URL 提取失败（skill 未安装、网络问题、反爬机制等），提示用户：
```
自动提取失败。请尝试以下方式之一：
1. 在浏览器中打开链接，复制全文粘贴给我
2. 使用浏览器"另存为"保存为本地文件，告诉我文件路径
3. 如果是公众号文章，可以尝试在电脑浏览器中打开后复制
```

### 内容分级处理

根据素材长度和信息密度自动选择处理级别：

**判断标准**：
- 素材内容 > 1000 字 → **完整处理**
- 素材内容 <= 1000 字（短推文、小红书笔记等）→ **简化处理**

### 完整处理流程（长素材 > 1000 字）

1. **提取素材内容**：按上面的路由获取素材文本

2. **保存原始素材**到 `raw/` 对应目录：
   - 根据素材类型保存到对应目录（articles/、tweets/、wechat/、xiaohongshu/、zhihu/ 等）
   - 文件名格式：`{日期}-{短标题}.md`
   - 如果是 URL 类素材，在文件头部记录原始 URL

3. **阅读素材，提取关键信息**：
   - 核心观点（3-5 个要点）
   - 关键概念（3-5 个，需要创建或更新的实体）
   - 与已有素材的关联

4. **生成素材摘要页**（`wiki/sources/{日期}-{短标题}.md`）：
   - 参考 `templates/source-template.md` 的格式
   - 包含：基本信息、核心观点、关键概念、与其他素材的关联、原文精彩摘录

5. **更新或创建实体页**（`wiki/entities/`）：
   - 对每个关键概念，检查 `wiki/entities/` 下是否已有对应页面
   - 如果已有 → 追加新信息，更新"不同素材中的观点"部分
   - 如果没有 → 创建新实体页，参考 `templates/entity-template.md`
   - 使用 `[[实体名]]` 语法做双向链接

6. **更新或创建主题页**（`wiki/topics/`）：
   - 识别素材涉及的主要研究主题
   - 如果已有对应主题页 → 更新素材汇总表和核心观点
   - 如果没有 → 创建新主题页，参考 `templates/topic-template.md`

7. **更新 index.md**：
   - 在对应分类下添加新条目
   - 更新概览统计数字

8. **更新 log.md**：
   - 追加格式：`## {日期} ingest | {素材标题}`
   - 记录新增和更新的页面列表

9. **向用户展示结果**（按 `WIKI_LANG` 切换语言）：

   **中文（zh）**：
   ```
   已消化：{素材标题}

   新增页面：
   - {素材摘要页}
   - {新实体页1}
   - {新主题页1}

   更新页面：
   - {已有实体页2}（追加了新信息）

   发现关联：
   - 这篇素材和 [[已有素材]] 在 {某概念} 上有联系
   ```

   **English（en）**：
   ```
   Ingested: {source title}

   New pages:
   - {source summary page}
   - {new entity page 1}
   - {new topic page 1}

   Updated pages:
   - {existing entity page 2} (appended new info)

   Connections found:
   - This source connects with [[existing source]] on {concept}
   ```

### 简化处理流程（短素材 <= 1000 字）

适用于短推文、小红书笔记、简短评论等。

1. **保存原始素材**到对应 `raw/` 目录
2. **生成简化摘要页**（`wiki/sources/`）：
   - 只包含基本信息和核心观点
   - 不写"原文精彩摘录"部分
3. **提取 1-3 个关键概念**：
   - 如果对应实体页已存在 → 追加一句话说明
   - 如果不存在 → 在摘要页中用 `[待创建: [[概念名]]]` 标记
4. **更新 index.md 和 log.md**
5. **跳过**：主题页创建/更新、overview 更新

6. **向用户展示简化结果**（按 `WIKI_LANG` 切换语言）：

   **中文（zh）**：
   ```
   已消化：{素材标题}（短内容，简化处理）

   新增：
   - 素材摘要页

   待完善：
   - [待创建: [[概念名]]]（积累更多素材后整理）
   ```

   **English（en）**：
   ```
   Ingested: {source title} (short content, simplified processing)

   Added:
   - Source summary page

   To be expanded:
   - [pending: [[concept name]]] (will organize after more sources)
   ```

---

## 工作流 3：batch-ingest（批量消化）

当用户给了一个文件夹路径，或者说"把这些都整理一下"。

### 步骤

1. **确认知识库路径**（CWD 检查）：
   - 先检查当前工作目录是否包含 `.wiki-schema.md` → 用当前目录
   - 不包含 → 回退到读取 `~/.llm-wiki-path`
   - 两个都没有 → 先运行 init 工作流
   - 读取 `.wiki-schema.md` 的"语言"字段，确定 `WIKI_LANG`（同 ingest 工作流逻辑），列出所有可处理文件：
   - 支持的格式：`.md`, `.txt`, `.pdf`, `.html`
   - 忽略：隐藏文件、`.git` 目录、`node_modules` 等

3. **展示文件列表**，确认处理范围（按 `WIKI_LANG` 切换语言）：

   **zh**：
   ```
   发现 {N} 个文件待处理：
   1. file1.pdf
   2. file2.md
   3. file3.txt

   预计需要 {N} 轮处理。是否开始？
   ```

   **en**：
   ```
   Found {N} files to process:
   1. file1.pdf
   2. file2.md
   3. file3.txt

   Estimated {N} rounds. Start?
   ```

4. **逐个处理**：对每个文件执行 ingest 工作流
   - 根据内容长度自动选择完整/简化处理

5. **每 5 个文件后暂停**，展示进度并询问是否继续（按 `WIKI_LANG` 切换语言）：

   **zh**：
   ```
   进度：5/{N} 已完成

   本批处理结果：
   - 新增素材摘要：5
   - 新增实体页：3
   - 更新已有页面：7

   继续处理剩余 {M} 个文件？
   ```

   **en**：
   ```
   Progress: 5/{N} done

   This batch:
   - New source summaries: 5
   - New entity pages: 3
   - Updated pages: 7

   Continue with remaining {M} files?
   ```

6. **全部完成后**：
   - 运行一次 index.md 全量更新
   - 输出总结报告（按 `WIKI_LANG` 切换语言）：

   **zh**：
   ```
   批量消化完成！

   处理了 {N} 个文件：
   - 成功：{S}
   - 跳过（内容为空/格式不支持）：{K}
   - 失败：{F}

   新增页面：{total_new}
   更新页面：{total_updated}
   ```

   **en**：
   ```
   Batch ingest complete!

   Processed {N} files:
   - Success: {S}
   - Skipped (empty/unsupported): {K}
   - Failed: {F}

   New pages: {total_new}
   Updated pages: {total_updated}
   ```

---

## 工作流 4：query（查询知识库）

### 步骤

1. **确认知识库路径**（CWD 检查）：
   - 先检查当前工作目录是否包含 `.wiki-schema.md` → 用当前目录
   - 不包含 → 回退到读取 `~/.llm-wiki-path`
   - 两个都没有 → 提示用户先初始化知识库
   - 读取 `.wiki-schema.md` 的"语言"字段，确定 `WIKI_LANG`
2. **读取 index.md** 了解知识库全貌
3. **搜索相关页面**：
   - 先在 index.md 中定位相关分类和条目
   - 再用 Grep 在 `wiki/` 目录下搜索关键词
   - 读取最相关的 3-5 个页面
4. **综合回答**：
   - 按 `WIKI_LANG` 用对应语言回答用户的问题
   - 标注信息来源（引用 wiki 页面，用 `[[页面名]]` 格式）
   - 如果多个素材有不同观点，分别列出并标注来源
5. **建议回写**：
   - 如果这个回答产生了有价值的分析或综合，询问用户是否保存为新的 wiki 页面
   - 如果保存 → 创建新页面（`wiki/synthesis/` 或 `wiki/comparisons/`），更新 index.md 和 log.md

---

## 工作流 5：lint（健康检查）

### 触发时机

- 用户主动说"检查知识库"
- 每次 ingest 后，如果素材总数是 10 的倍数，主动建议运行 lint

### 前置检查（含多知识库 CWD 检查）

- 先检查当前工作目录是否包含 `.wiki-schema.md` → 用当前目录
- 不包含 → 回退到读取 `~/.llm-wiki-path`
- 两个都没有 → 提示用户先初始化知识库
- 读取 `.wiki-schema.md` 的"语言"字段，确定 `WIKI_LANG`
   - 最近更新的 10 个页面（按文件修改时间排序）
   - 随机抽查的 10 个页面（避免遗漏旧页面的问题）
   - 如果页面总数 <= 20，检查全部

2. **逐项检查**：

   **孤立页面**（Grep 搜索 `[[页面名]]`，找出没有任何其他页面链接到的页面）：
   - 列出所有孤立页面
   - 建议应该从哪些页面添加链接

   **缺失概念页**（读取所有页面，找出被 `[[某概念]]` 链接但实际不存在的页面）：
   - 列出所有"断链"
   - 建议为哪些概念创建新页面

   **矛盾信息**（阅读相关页面，检查是否有互相矛盾的说法）：
   - 列出发现的矛盾
   - 标注每处矛盾的来源页面

   **交叉引用缺失**（检查相关主题的页面之间是否应该互相链接但没链）：
   - 建议添加的交叉引用

   **index 一致性**（对比 index.md 中的条目和实际 wiki 文件）：
   - 找出 index 中有但文件不存在的条目
   - 找出文件存在但 index 中没记录的页面

3. **输出报告**（按 `WIKI_LANG` 切换语言）：

   **zh**：
   ```
   知识库健康检查报告

   检查范围：最近更新 10 页 + 随机抽查 10 页（共 {N} 页）

   孤立页面（没有其他页面链接到它）：
   - [[某页面]] → 建议从 [[相关页面]] 添加链接

   断链（被链接但不存在）：
   - [[某概念]] → 建议创建新页面

   矛盾信息：
   - 关于"XX"，[[页面A]] 说是 Y，但 [[页面B]] 说是 Z

   缺失索引：
   - {文件名} 存在但未记录在 index.md 中
   ```

   **en**：
   ```
   Wiki Health Check Report

   Scope: 10 recently updated + 10 random pages ({N} total)

   Orphan pages (no other page links to them):
   - [[some page]] → suggest adding link from [[related page]]

   Broken links (linked but don't exist):
   - [[some concept]] → suggest creating new page

   Conflicting info:
   - On "XX", [[page A]] says Y, but [[page B]] says Z

   Missing from index:
   - {filename} exists but not recorded in index.md
   ```

4. **询问用户**：要自动修复哪些问题？（按 `WIKI_LANG` 用对应语言提问）

---

## 工作流 6：status（查看状态）

### 前置检查（含多知识库 CWD 检查）

- 先检查当前工作目录是否包含 `.wiki-schema.md` → 用当前目录
- 不包含 → 回退到读取 `~/.llm-wiki-path`
- 两个都没有 → 提示用户先初始化知识库
- 读取 `.wiki-schema.md` 的"语言"字段，确定 `WIKI_LANG`

### 步骤

1. 获取知识库路径（按上面的 CWD 检查逻辑）
2. 统计：
   - `raw/` 下各子目录的文件数（按素材类型统计）
   - `wiki/entities/` 下的页面数
   - `wiki/topics/` 下的页面数
   - `wiki/sources/` 下的页面数
   - `wiki/comparisons/` 和 `wiki/synthesis/` 下的页面数
3. 读取 `log.md` 最后 5 条记录
4. 读取 `index.md` 获取主题概览

5. **输出报告**（按 `WIKI_LANG` 切换语言）：

   **zh**：
   ```
   知识库状态：{主题}

   素材：{总数} 篇
     - 网页文章：{N}
     - X/Twitter：{N}
     - 微信公众号：{N}
     - 小红书：{N}
     - 知乎：{N}
     - PDF：{N}
     - 其他：{N}

   Wiki 页面：{总数} 页
     - 实体页：{N}
     - 主题页：{N}
     - 素材摘要：{N}
     - 对比分析：{N}
     - 综合分析：{N}

   最近活动：
   - {日期} ingest | {素材标题}
   - {日期} ingest | {素材标题}
   ...

   建议：
   - 你可能想深入了解 {某主题}，已有 {N} 篇相关素材
   - {某实体} 被 {N} 篇素材提到，值得整理成独立页面
   ```

   **en**：
   ```
   Wiki Status: {topic}

   Sources: {total}
     - Web articles: {N}
     - X/Twitter: {N}
     - WeChat: {N}
     - Xiaohongshu: {N}
     - Zhihu: {N}
     - PDF: {N}
     - Other: {N}

   Wiki pages: {total}
     - Entity pages: {N}
     - Topic pages: {N}
     - Source summaries: {N}
     - Comparisons: {N}
     - Synthesis: {N}

   Recent activity:
   - {date} ingest | {source title}
   - {date} ingest | {source title}
   ...

   Suggestions:
   - You may want to deep-dive into {topic}, {N} related sources available
   - {entity} is mentioned in {N} sources, worth creating a dedicated page
   ```

---

## 工作流 7：digest（深度综合报告）

**区别于 query**：query 是快速问答，不生成新页面；digest 是跨素材深度综合，生成持久化报告。

### 触发关键词

"给我讲讲 XX"、"深度分析 XX"、"综述 XX"、"digest XX"、"全面总结一下 XX"

### 前置检查（含多知识库 CWD 检查）

- 先检查当前工作目录是否包含 `.wiki-schema.md` → 用当前目录
- 不包含 → 回退到读取 `~/.llm-wiki-path`
- 两个都没有 → 提示用户先初始化知识库
- 读取 `.wiki-schema.md` 的"语言"字段，确定 `WIKI_LANG`
   - 用 Grep 在 `wiki/` 下搜索主题关键词
   - 列出将要综合的页面（让用户了解报告覆盖范围）

2. **深度阅读所有相关页面**：
   - 读取找到的所有相关 wiki 页面（sources/、entities/、topics/）
   - 归纳每个页面的核心观点和来源信息

3. **生成结构化深度报告**，保存到 `wiki/synthesis/{主题}-深度报告.md`（按 `WIKI_LANG` 切换语言）：

   **zh**：
   ```markdown
   # {主题} 深度报告

   > 综合自 {N} 篇素材 | 生成日期：{日期}

   ## 背景概述
   （简要说明这个主题的背景和重要性）

   ## 核心观点
   （按重要性排列，每个观点标注来源）
   - 观点一（来源：[[素材A]]、[[素材B]]）
   - 观点二（来源：[[素材C]]）

   ## 不同视角对比
   （如有多个素材观点不同，在此对比）
   | 维度 | 来源A的观点 | 来源B的观点 |
   |------|------------|------------|

   ## 知识脉络
   （按时间或逻辑顺序梳理该主题的发展）

   ## 尚待解决的问题
   （现有素材中尚未回答的问题，可作为下次搜集素材的方向）

   ## 相关页面
   （列出所有综合来源的链接）
   ```

   **en**：
   ```markdown
   # {topic} — Deep Dive Report

   > Synthesized from {N} sources | Generated: {date}

   ## Background
   (Brief context and importance of this topic)

   ## Key Insights
   (Ranked by importance, each with source attribution)
   - Insight 1 (sources: [[source A]], [[source B]])
   - Insight 2 (source: [[source C]])

   ## Perspectives Compared
   (If sources disagree, compare here)
   | Dimension | Source A's view | Source B's view |
   |-----------|----------------|----------------|

   ## Knowledge Timeline
   (Chronological or logical development of this topic)

   ## Open Questions
   (Questions not yet answered by existing sources — good directions for future research)

   ## Related Pages
   (Links to all synthesized sources)
   ```

4. **更新 index.md 和 log.md**：
   - index.md 的"综合分析"分类下添加新报告条目
   - log.md 追加：`## {日期} digest | {主题}`

5. **向用户展示结果**（按 `WIKI_LANG` 切换语言）：

   **zh**：
   ```
   已生成深度报告：{主题}

   综合了 {N} 篇素材：
   - [[素材1]]、[[素材2]]...

   报告已保存：wiki/synthesis/{主题}-深度报告.md

   发现这些待解决问题，可以继续搜集素材：
   - {问题1}
   - {问题2}
   ```

   **en**：
   ```
   Deep dive report generated: {topic}

   Synthesized {N} sources:
   - [[source 1]], [[source 2]]...

   Saved to: wiki/synthesis/{topic}-deep-dive.md

   Open questions to explore further:
   - {question 1}
   - {question 2}
   ```

---

## 工作流 8：graph（Mermaid 知识图谱）

### 触发关键词

"画个知识图谱"、"看看关联图"、"graph"、"知识库地图"、"展示知识关联"

### 前置检查（含多知识库 CWD 检查）

- 先检查当前工作目录是否包含 `.wiki-schema.md` → 用当前目录
- 不包含 → 回退到读取 `~/.llm-wiki-path`
- 两个都没有 → 提示用户先初始化知识库
- 读取 `.wiki-schema.md` 的"语言"字段，确定 `WIKI_LANG`

2. **扫描双向链接**：
   - 遍历 `wiki/` 下所有 `.md` 文件
   - 提取每个文件中的 `[[链接]]` 语法，建立关系列表：`页面A → 页面B`

3. **生成 Mermaid 图表文件** `wiki/knowledge-graph.md`：
   ````markdown
   # 知识图谱

   > 自动生成 | {日期} | 共 {N} 个节点，{M} 条关联

   ```mermaid
   graph LR
     A[概念1] --> B[概念2]
     A --> C[素材1]
     D[主题1] --> A
     D --> E[概念3]
   ```

   查看方式：用 Typora、VS Code（Markdown Preview Enhanced）、或直接在 GitHub 上查看。
   ````

   **生成规则**：
   - 节点名用中括号 `[名称]`，名称太长则截断到 10 字
   - 只展示有双向链接关系的节点（孤立节点不纳入图谱）
   - 如果关系超过 50 条，只保留被引用次数最多的 30 个节点，避免图谱过于密集

4. **向用户展示结果**（按 `WIKI_LANG` 切换语言）：

   **zh**：
   ```
   知识图谱已生成！

   共 {N} 个节点，{M} 条关联
   文件：wiki/knowledge-graph.md

   查看方式：
   - Obsidian：直接打开即可渲染
   - VS Code：安装 Markdown Preview Enhanced 插件
   - GitHub：上传后自动渲染
   - Typora：直接打开

   孤立页面（未纳入图谱）：
   - [[某页面]]（建议添加到相关实体页或主题页）
   ```

   **en**：
   ```
   Knowledge graph generated!

   {N} nodes, {M} connections
   File: wiki/knowledge-graph.md

   How to view:
   - Obsidian: opens and renders directly
   - VS Code: install Markdown Preview Enhanced
   - GitHub: renders automatically after upload
   - Typora: open directly

   Orphan pages (not in graph):
   - [[some page]] (suggest linking from a related entity or topic page)
   ```

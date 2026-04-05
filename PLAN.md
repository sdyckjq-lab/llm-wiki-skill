# llm-wiki-skill 改进计划

> 基于 /plan-ceo-review 审查结果，选择性扩展模式
> 日期：2026-04-05
> 状态：✅ 全部完成（P1/P2/P3/P4/P5/P6）

## 审查结论

骨架合格，0 个 CRITICAL GAP，0 个阻塞问题。改进方向：降低首次使用门槛 + 提升知识库深度价值。

---

## ✅ P1：多知识库支持（已完成）

**问题**：`~/.llm-wiki-path` 只存一个路径，建第二个知识库会覆盖第一个。

**方案**：SKILL.md 的 ingest/query/lint/status 工作流开头加一步 CWD 检查：

```
1. 检查当前工作目录是否包含 .wiki-schema.md
   - 如果包含 → 用当前目录作为知识库根路径
   - 如果不包含 → 回退到读取 ~/.llm-wiki-path
2. 两个都没有 → 走 init 工作流
```

**改动文件**：
- `SKILL.md` — 5 个工作流的「前置检查」段各加 CWD 检查逻辑

**工作量**：S

---

## ✅ P2：Chrome + 依赖检查前置（已完成）

**问题**：小白用户给 URL → 等 30 秒 → 模糊报错 → 不知道怎么回事。baoyu-url-to-markdown 依赖 Chrome CDP，但从未检查 Chrome 是否运行。

**方案**：

1. setup.sh 里加 Chrome 进程检查：
   ```bash
   if ! pgrep -x "Google Chrome" > /dev/null 2>&1; then
       echo "⚠️  Chrome 未运行。baoyu-url-to-markdown 需要 Chrome。请先启动 Chrome。"
   fi
   ```

2. SKILL.md ingest 工作流 URL 路由段加前置检查：
   - 调用 baoyu 前先检查 Chrome 进程
   - 如果没跑，提示用户启动 Chrome，不要浪费 30 秒等待超时

**改动文件**：
- `setup.sh` — 加 Chrome 检查
- `SKILL.md` — ingest 素材提取路由段加前置检查说明

**工作量**：S

---

## ✅ P3：digest 深度报告工作流（已完成）

**问题**：当前 query 是问答式的（用户问、AI 答）。但 Karpathy 方法论的核心价值是**跨素材综合**。

**方案**：新增 `digest` 工作流，加到 SKILL.md：

**触发**：
- "给我讲讲 XX"、"总结一下 XX 的所有知识"、"深度分析 XX"
- "digest XX"、"综述 XX"

**区别于 query**：
- query：快速回答，不生成新页面
- digest：深度报告，综合所有相关素材，生成 `wiki/synthesis/{主题}-深度报告.md`

**步骤**：
1. 读 index.md 定位相关条目
2. Grep 搜索 + 读取所有相关 wiki 页面
3. 综合分析，生成结构化报告：
   - 背景概述
   - 核心观点（标注每个观点的素材来源）
   - 不同观点的对比
   - 知识脉络（按时间或逻辑排序）
   - 尚未解决的问题
4. 保存到 `wiki/synthesis/`
5. 更新 index.md 和 log.md

**改动文件**：
- `SKILL.md` — 新增工作流 7 + 路由表加一行
- 路由表新增：`"给我讲讲"、"深度分析"、"综述"、"digest"` → **digest**

**工作量**：S

---

## ✅ P4：一键安装（已完成）

**问题**：当前安装需要 4 步（clone → setup.sh → cd deps → bun install），小白容易卡住。

**方案**：

1. **setup.sh 集成 bun install**：
   - 复制完 deps 后自动检查 baoyu-url-to-markdown/scripts/ 目录
   - 如果有 package.json 且 bun 可用 → 自动 `bun install`
   - bun 不可用 → 提示安装 bun（`curl -fsSL https://bun.sh/install | bash`）

2. **README 加一键安装命令**：
   ```bash
   git clone https://github.com/sdyckjq-lab/llm-wiki-skill.git ~/.claude/skills/llm-wiki && bash ~/.claude/skills/llm-wiki/setup.sh
   ```

3. **setup.sh 加 Chrome 检查**（与 P2 合并）

**改动文件**：
- `setup.sh` — 集成 bun install + Chrome 检查
- `README.md` — 更新安装说明为一行命令

**工作量**：M

---

## ✅ P5：双语模板（已完成）

**问题**：用户选择了支持中英文双语，目标用户包含国际用户。

**方案**：

1. 每个模板加英文版本，放在同目录下：
   - `templates/entity-template.md` → 加英文段落（用 `<!-- English -->` 注释分隔）
   - 或者：SKILL.md 加语言检测逻辑，根据用户环境选模板语言

2. **推荐子方案**：SKILL.md init 工作流加语言选择：
   - 询问用户语言偏好（中文/English）
   - 写入 `.wiki-schema.md` 的 `language` 字段
   - ingest/query 时根据 language 字段选择输出语言
   - 模板不拆分，由 AI 根据 language 配置动态生成

**改动文件**：
- `SKILL.md` — init 加语言选择，各工作流加语言感知
- `templates/schema-template.md` — language 字段支持 zh/en

**工作量**：M

---

## ✅ P6：Mermaid 知识图谱（已完成）

**问题**：`[[双向链接]]` 只有 Obsidian 能渲染。不用 Obsidian 的用户看不到知识关联图。

**方案**：新增 `graph` 工作流：

**触发**：
- "画个知识图谱"、"看看关联图"、"graph"、"知识库地图"

**步骤**：
1. 读 index.md 获取所有页面列表
2. 扫描 wiki/ 下所有页面的 `[[链接]]` 提取关系
3. 生成 Mermaid 图表文件 `wiki/knowledge-graph.md`：
   ```markdown
   # 知识图谱

   ```mermaid
   graph LR
     A[Transformer] --> B[Attention机制]
     A --> C[RNN的替代]
     D[Karpathy方法] --> A
     D --> E[知识库构建]
   ```
   ```

4. 用户可以用任何支持 Mermaid 的编辑器查看（Typora、VS Code、GitHub）

**改动文件**：
- `SKILL.md` — 新增工作流 8 + 路由表加一行

**工作量**：S

---

## TODO（记录，不在本次范围）

| 任务 | 工作量 | 优先级 | 原因 |
|------|--------|--------|------|
| 重构关键路径为脚本（方案 C） | L | P3 | 当前纯 SKILL.md 方案够用，积累更多用户反馈后再重构 |
| URL 去重检查 | S | P3 | 低概率场景，用户手动重喂才触发 |
| 知识库目录移动后路径修复 | S | P3 | 极低概率场景 |

---

## 实施顺序

```
P1 多知识库 ─┐
P2 Chrome检查 ─┤─→ P4 一键安装（合并 P2 的 Chrome 检查）─→ P3 digest ─→ P6 graph ─→ P5 双语
P3 digest    ─┘
```

P1 + P2 + P4 可以并行。P3/P6 独立。P5 最后（因为涉及所有模板）。

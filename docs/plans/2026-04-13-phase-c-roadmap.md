# Phase C 路线图

状态：DONE（C1–C4 全部实现，v2.2.0）
记录日期：2026-04-13
前置：Phase A（ingest 验证 + 置信度规则）和 Phase B（crystallize 工作流）完成后再做

---

## 背景

Phase A + B 解决了 ingest 验证和知识沉淀两个核心问题。
Phase C 是下一批改进，来源于 llm-wiki-skill vs LLM Wiki v2 对比分析（/plan 会话，2026-04-13）。

4 个功能互相独立，可以任意顺序实现。

---

## C1. lint 脚本化

**问题：** lint 工作流全靠 AI 自觉执行，没有脚本骨架，没有测试覆盖。

**改动文件：**
- 新建 `scripts/lint-runner.sh`（约 50 行）
- 修改 `SKILL.md` 的 lint 工作流章节

**脚本职责：**
- 扫描孤立页：`wiki/` 下存在但 `index.md` 没有引用的页面
- 扫描断链：`[[X]]` 格式但 `wiki/entities/X.md` 不存在
- 扫描矛盾记录：从 source 页面提取 `contradictions` 标签

**SKILL.md 改动：** lint 工作流调用脚本生成结构化报告，AI 只负责撰写修复建议

**工作量：** M

---

## C2. 多输出格式

**问题：** digest 工作流只输出 Markdown 摘要，没有对比表、时间线等格式选项。

**改动文件：**
- 修改 `SKILL.md` 的 digest 工作流章节（只改 SKILL.md，不写脚本）

**新增格式：**
- `对比表`：Markdown 多列表格，比较多个素材在同一维度的观点
- `时间线`：Mermaid gantt 格式，适合按时间排列的事件/进展类素材

**触发方式（SKILL.md 路由）：**
- "对比一下 A 和 B" → 对比表格式
- "整理一下时间线" → Mermaid gantt 格式

**工作量：** S（只改 SKILL.md）

---

## C3. Schema 类型化关系

**问题：** graph 工作流只输出简单 `[[A]] --> [[B]]`，没有语义关系类型。

**改动文件：**
- 修改 `templates/schema-template.md`（加 entity_types、relationship_types 字段）
- 修改 `SKILL.md` 的 graph 工作流章节

**效果：**
```mermaid
A --实现--> B
C --依赖--> D
E --对比--> F
```

**schema-template.md 新增字段示例：**
```markdown
## 关系类型
- 实现 (implements)
- 依赖 (depends-on)
- 对比 (compares-with)
- 衍生 (derived-from)
- 矛盾 (contradicts)
```

**工作量：** M

---

## C4. 隐私过滤

**问题：** ingest 前没有任何敏感数据过滤，手机号、身份证、密码等可能意外进入知识库。

**改动文件：**
- 新建 `scripts/privacy-filter.sh`（约 40 行）
- 修改 `SKILL.md` 的 ingest 工作流（在缓存检查前调用）

**脚本职责：**
- 检测常见敏感词模式：手机号正则、身份证正则、API key 格式（`sk-...`、`Bearer ...`）
- 发现时提醒用户确认是否继续
- 扫描结果追加到 log.md：`<!-- privacy-scan: clean -->` 或 `<!-- privacy-scan: WARNING -->`

**工作量：** M

---

## 优先级建议

如果四个都要做，建议顺序：C1 → C3 → C2 → C4

- C1 先做：lint 脚本化收益最高，也是最直接的质量保障
- C3 其次：schema 类型化影响 graph 工作流，做完 C1 后顺手
- C2 容易：只改 SKILL.md，随时可以插队
- C4 最后：隐私过滤是安全增强，不影响核心功能

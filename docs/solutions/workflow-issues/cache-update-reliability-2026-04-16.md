---
title: 缓存更新可靠性 — 从"依赖模型行为"到"原子化 + 自修复"
date: 2026-04-16
category: docs/solutions/workflow-issues
module: ingest-workflow
problem_type: workflow_issue
component: tooling
severity: medium
root_cause: inadequate_documentation
resolution_type: workflow_improvement
applies_when:
  - AI 驱动的工作流中关键副作用依赖模型在后续步骤执行
  - 多模型兼容场景（弱模型对长工作流遵从度低）
  - 缓存状态和文件系统状态可能不一致时需要自修复
tags: [cache, ingest, workflow, reliability, write-through, self-healing]
---

# 缓存更新可靠性 — 从"依赖模型行为"到"原子化 + 自修复"

## Context

llm-wiki-skill 的 ingest 工作流包含 13 个步骤，由 AI 模型（Claude、DeepSeek、Qwen、Kimi）逐步执行。其中 Step 4 做 `cache.sh check`，Step 12 做 `cache.sh update`。

弱模型在长工作流中经常**跳过 Step 12 的 cache update**，导致已处理的文件下次 ingest 时仍然显示 MISS，触发重复处理。这不是代码 bug，而是设计层面的可靠性缺陷：缓存更新完全依赖模型是否"记得"执行第 12 步。

项目核心原则是"多模型友好"，弱模型必须能正确跑通流程，因此必须在架构层面消除这种依赖。

## Guidance

### 核心原则：关键副作用不应依赖模型行为，应通过脚本原子化绑定

将"写文件"和"更新缓存"合并为一个原子操作。模型只需调用一次脚本，缓存更新自动完成。同时加入自修复机制，即使缓存缺失也能从已有文件反向恢复。

### 模式一：Write-through 原子脚本

`scripts/create-source-page.sh` 把 source 页面写入 + cache update 绑定为一项操作：

```bash
# 用法
bash scripts/create-source-page.sh <raw_file> <output_path> <content_file>

# 内部流程：
# 1. 临时文件 + mv 原子写入 output_path
# 2. 调用 cache.sh update raw_file output_path
# 3. cache update 失败 → 删除已写入的文件，回滚
# 4. 两步都成功 → 返回 SUCCESS
```

模型在 Step 8 只需调用这一个脚本，不需要记得到 Step 12 去更新缓存。

### 模式二：缓存自修复

`scripts/cache.sh check` 在 MISS 时主动探测已有文件，用 filename stem 精确匹配：

```python
# cache_check() 内的 Python 逻辑（简化）
raw_stem = pathlib.Path(relative_path).stem
sources_dir = os.path.join(wiki_root, "wiki", "sources")

if os.path.isdir(sources_dir):
    for f in os.listdir(sources_dir):
        if pathlib.Path(f).stem == raw_stem and f.endswith(".md"):
            # 自愈：从已有 source 页面重建 cache entry
            save_cache_entry(relative_path, current_hash, source_page)
            print("HIT(repaired)")
```

MISS 原因细分帮助模型和用户理解当前状态：

- `MISS:no_entry` — 首次处理，正常
- `MISS:hash_changed` — 素材内容变了，需重新处理
- `MISS:no_source` — 有 cache 但 source 页面被删了

### 模式三：工作流简化

SKILL.md 改动：

- Step 4：展示 MISS 原因和 `HIT(repaired)` 状态
- Step 8：写 source 页面改用 `create-source-page.sh`
- Step 12：**移除** `cache.sh update` 调用（已由 Step 8 自动完成）

## Why This Matters

**消除了一整类故障。** 之前每次弱模型跳过 Step 12 就会导致缓存失效，而错误是静默的（没报错，只有重复处理）。原子化之后，只要模型执行"写文件"这一步（不做 = 没有产出 = 流程失败），缓存就一定会更新。

**自修复是兜底保险。** 即使原子脚本没被调用（手动操作、脚本中断），自修复也能从已有文件反向重建 cache entry。

**MISS 原因分类帮助调试。** 模型和用户能区分"新文件"、"文件被修改"、"source 丢失"三种情况。

## When to Apply

- AI 驱动的工作流中，关键副作用（缓存写入、索引更新、状态标记）依赖模型在后续步骤执行 → 绑定到更早的、不可避免的操作上
- 多模型兼容场景 → 架构设计不能假设模型会完美执行每一步
- 缓存系统容易"漂移"（缓存状态和实际文件不一致） → 需要自修复能力
- 需要幂等性 → 同一操作重复执行不应产生额外副作用

## Examples

### Before

```
Step 8:  Write source page to wiki/sources/example.md
         (模型写文件，缓存未更新)

... 中间还有 Step 9-11 ...

Step 12: bash scripts/cache.sh update raw/example.md
         (弱模型经常跳过这一步)

结果：下次 ingest 同一文件时 cache.sh check 返回 MISS，重复处理
```

### After

```
Step 8:  bash scripts/create-source-page.sh raw/example.md \
           wiki/sources/example.md /tmp/content.txt
         → SUCCESS（文件写入 + 缓存更新原子完成）

Step 12: (已移除 — 缓存更新由 Step 8 自动完成)

即使历史缓存丢失，自修复也能兜底：
Step 4:  bash scripts/cache.sh check raw/example.md
         → HIT(repaired)
```

## Related

- `docs/solutions/workflow-issues/ingest-step1-validation-contract-and-crystallize-workflow-2026-04-13.md` — 兄弟文档，同为 ingest workflow 硬化（Step 1 校验）
- `docs/plans/2026-04-11-wiki-core-upgrades-design.md` — cache 系统的原始设计，定义了 check/update/invalidate 语义
- PR #10 — 本次修复的完整 diff

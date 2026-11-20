# Issue #283 — 旧工具箱与 wash 模板最终退休验收

> 父票 #159 的 T7 收尾记录。本票只关闭 #283；父票 #159 由其整体流程另行确认关闭。

日期：2026-07-18
被测代码提交：`862b1327`（其后仅更新文档）
基线：`26290333`（`origin/main`）
环境：macOS arm64、Node v22.22.3、Playwright Chromium 149.0.7827.55

## 删除与保留边界

已删除：

- `packages/graph-engine/src/model/legacy-helpers.ts` 及其 `@ts-nocheck`。
- 只转发旧工具箱的 `model/learning.ts`、`model/queue.ts`、`model/storage.ts`。
- 无现行宿主消费者的 learning、收藏、笔记队列、旧存储、旧聚焦/抽屉入口和 Atlas 旧视角出口及专属测试。
- `templates/graph-styles/wash/` 全目录、五个专属 JS 测试和无人消费的旧 HTML 快照。

明确保留：

- 现行 `render/community-wash.ts`、`render/community-washes.ts`、`.community-wash` 样式与 Sigma 社区区域浏览器回归。
- Sigma 全局与社区阅读主路线，以及共享准备成功后的 DOM/SVG 故障回退。
- 离线 Pin 与主题的既有存储 namespace、`:graph-pins`、`:graph-theme` 键。
- `build-graph-html.sh` 对升级知识库中 `graph-wash.js` 和 `graph-wash-helpers.js` 遗留文件的删除。

## 依赖、出口与产物扫描

- `dependency-baseline.json` 的 `legacyReferences`、内部 barrel 引用和 renderer bypass 均为 `[]`。
- 源码依赖测试解析 import、dynamic import、require、import type 与 re-export；真实旧路径必须为零，故意构造旧路径的负向门禁继续保留。
- 包出口门禁确认工作台、服务端、离线宿主和明确兼容入口仍存在，同时禁止退休工具箱出口重新出现。
- ESM、IIFE、`dist/index.d.ts`、两份 source map 均通过退休标记扫描，无旧模块路径、退休出口或旧源码映射。
- `packages/graph-engine/src/` 中 `legacy-helpers` 与 `@ts-nocheck` 扫描无命中。

最终产物大小：

| 产物 | 退休前（#282） | #283 最终 | 变化 |
|---|---:|---:|---:|
| `dist/engine.esm.js` | 438043 bytes | 417858 bytes | -20185 bytes |
| `dist/engine.iife.js` | 513949 bytes | 498164 bytes | -15785 bytes |

两份产物仍分别通过 ESM 动态导入和 IIFE 沙箱加载，离线构建继续内联 IIFE。

## 自动检查

以下命令在本分支最终状态通过：

- `npm run typecheck -w @llm-wiki/graph-engine`
- `npm run build -w @llm-wiki/graph-engine`
- `npm run test -w @llm-wiki/graph-engine`
- `node --import tsx --test packages/graph-engine/test/issue-282-graph-artifacts.test.ts packages/graph-engine/test/source-dependencies.test.ts packages/graph-engine/test/supported-exports.test.ts`
- `npm run test:browser:main-flows -w @llm-wiki-agent/web`
- `npm run quality-and-tests`
- `bash tests/regression.sh`
- `bash install.sh --dry-run --platform codex`
- `bash install.sh --dry-run --platform claude`
- `grep -r '本机用户路径\|真实姓名\|私有素材路径' scripts/ templates/ tests/ SKILL.md`（无命中）

完整主回归会先在输出目录预置两个旧 wash 文件；重新生成后，两个文件均被删除，HTML 也不含其 script 引用。

## 可见行为与浏览器验收

以下真实浏览器流程通过：

- #281 工作台交互、离线宿主、共享错误与 Sigma 专属故障回退验收。
- 现行 community wash 区域、搜索、长标签、密度和东方设计首屏/阅读回归。
- 离线既有主题记录预置后可读取；切换后刷新仍能读取；Pin 与主题精确键保持不变。
- 离线多选和社区选区通过现行 Sigma 节点命中目标验证，不再等待退休 DOM/SVG 根；全局多选仍可用 Escape 关闭，面板关闭按钮也保持可用。

`tests/issue-282-performance-acceptance.sh` 顺序复跑通过：

| 路线 | 数据形状 | #272 基线中位数 | #283 中位数 | 上限 | 结果 |
|---|---|---:|---:|---:|---|
| 生产 Sigma | 1k sparse | 89.5 ms | 89.1 ms | 139.5 ms | 通过 |
| 隔离 Sigma | 1k sparse | 52.3 ms | 51.7 ms | 102.3 ms | 通过 |
| 隔离 Sigma | 5k sparse | 152.6 ms | 151.2 ms | 202.6 ms | 通过 |
| 隔离 Sigma | 10k aggregation | 257.9 ms | 254.5 ms | 309.5 ms | 通过 |

生产 1k 的 14 条记录（初次显示 + 13 个动作）全部通过。首次并发运行多个重型浏览器套件时，隔离 Sigma 三个规模同时等待超时；停止并发争用后按正式顺序复跑全部通过，因此不是代码或性能回归。

## 说明核对与审查

- `src/architecture.ts` 的数据、布局、视角、renderer、gesture 与 facade 责任边界准确。
- `src/render/model.ts` 保持“模型 → 布局/语义可见性 → 共享绘制策略 → 可绘制快照”的短数据流。
- `src/facade.ts` 保持“共享准备成功后，只有 Sigma 专属故障才进入 DOM/SVG”的边界。
- 代码审查发现并修复：产物扫描可能读取旧构建、退休标记与四个无消费者聚焦/抽屉入口未清零、离线既有主题记录缺少启动前预置读取、退休源路径与 learning 出口缺少长期不存在性门禁、语义可见性仍携带无用布局参数、Sigma 全局/社区多选与同页多图谱的 Escape 行为退化、一个测试 seam 命名不清，以及远端浏览器验收结束时两个清理动作相撞的问题。
- 覆盖审计补门禁后，#283 新增/迁移路径 8/8 均有测试落点。

## 问题分流

本轮发现的验收阻塞均已在本分支修复：缺少 worktree 本地依赖路径、三处过期主回归契约和重型浏览器并发争用均已定位并复验。未发现符合“迁移前已存在、且不阻塞 #283/#159”条件的新问题，因此没有新增关联 #269 的 issue。

## 结论

Issue #283 的旧工具箱、过渡转发、临时允许清单、类型检查跳过、无消费者出口和早期 wash 模板已全部退休；现行社区 wash、两个宿主、共享语义、DOM/SVG 故障回退、离线存储兼容和升级残留清理均保留并通过验收。

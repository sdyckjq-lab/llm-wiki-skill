# Issue #282 — 迁移后性能与 ESM/IIFE 双产物验收结论

> 父票 #159(拆清图谱底层 legacy helpers)的收尾验收。#271-#280 迁移实施已合入主线;本票在旧实现仍可对照、所有运行路线已迁移后,证明迁移未引起大图悬停性能回归,且工作台(ESM)与离线(IIFE)两种发布产物均可被各自宿主加载使用。#281 在另一任务并行推进,#283 负责最终删除旧代码。

## 被测对象与环境

- 被测提交:`00f3d7471cccd8768c3ef5b93c362bdbdda6e988`(主线 HEAD,迁移后)
- 基线提交(#272 不可变):`73e8768509f102c62e55752e95b31fb24bbf4303`(迁移前)
- 浏览器:Playwright Chromium headless `149.0.7827.55`(与基线一致,比较器强制校验)
- 构建:`npm run build -w @llm-wiki/graph-engine; node --import tsx; Playwright Chromium headless`(与基线一致)
- 环境:darwin-arm64 / Node v22.22.3 / 浏览器 149.0.7827.55(与基线同机器)
- 数据形状:与 #272 完全一致 —— 生产 `nodes-1000-sparse`;隔离 `nodes-1000-sparse`、`nodes-5000-sparse`、`nodes-10000-aggregation`
- 运行次数:每个输入连续 3 次(中位数取 3 次的中位)

## 验收方法

`tests/issue-282-performance-acceptance.sh`(本票新增,手动跑,匹配 `tests/*.regression-1.sh` 约定):

1. 构建图谱引擎双产物(ESM + IIFE)。
2. 候选 hover 捕获:`tests/browser/capture-issue-159-hover-baseline.mjs --mode candidate`,生产 1k + 隔离 1k/5k/10k 各连续 3 次。捕获器内强制 `hover_preview` 的目标正确(`hover_observed_target_id === hover_target_id`)且可见状态 `visible`,并对产物做本机路径脱敏。
3. 自动比较:`tests/browser/compare-issue-159-hover-baseline.mjs` 候选 vs #272 不可变基线,执行锁定公式 `afterMedian <= beforeMedian + max(beforeMedian * 0.20, 50ms)`,并强制 formula / 构建方式 / 浏览器版本 / 运行次数一致。
4. 生产 1k 全动作硬门禁:复用 `tests/graph-sigma-global-production.regression-1.sh`(`GRAPH_SIGMA_PRODUCTION_SHAPES=nodes-1000-sparse`),跑全 13 必需动作,由 `validateTrialResults` 强制 fps/p95/时长/内存/hover 各硬门禁。
5. 离线宿主构建消费 IIFE:`scripts/build-graph-html.sh` 冒烟,断言单文件 HTML 非空且内联 IIFE 引擎。

候选原始 hover 结果是每次运行的机器相关产物,落 `mktemp` 临时目录、不入库;本文件是去敏后的结论记录。#272 基线不可改写。

## 候选 vs #272 不可变基线(4 entry 全 pass)

| 渲染器 | 数据形状 | before 中位数(ms) | after 中位数(ms) | limit(ms) | 判定 |
|---|---|---|---|---|---|
| sigma-global-production | nodes-1000-sparse | 89.5 | 83.2 | 139.5 | ✅ pass |
| sigma-graphology-webgl-trial | nodes-1000-sparse | 52.3 | 46.7 | 102.3 | ✅ pass |
| sigma-graphology-webgl-trial | nodes-5000-sparse | 152.6 | 143.6 | 202.6 | ✅ pass |
| sigma-graphology-webgl-trial | nodes-10000-aggregation | 257.9 | 255.3 | 309.5 | ✅ pass |

候选 3 次运行的逐次时长(ms):

- production / 1k-sparse:`98.5 / 83.0 / 83.2` → 中位 83.2
- isolated / 1k-sparse:`45.7 / 51.7 / 46.7` → 中位 46.7
- isolated / 5k-sparse:`143.6 / 143.7 / 131.4` → 中位 143.6
- isolated / 10k-aggregation:`256.5 / 246.1 / 255.3` → 中位 255.3

结论:迁移后 4 个 entry 的 hover 中位数全部满足公式,且均略**低于**迁移前基线(同算法、同机器下的噪声范围内),不存在性能回归。3 次运行方差小,测量干净。

## 生产 1k 全动作硬门禁(ESM 浏览器加载证明)

`graph-sigma-global-production.regression-1.sh` 在 `nodes-1000-sparse` 上跑全 13 必需动作 + 初次显示,共 14 条记录,全部通过:

`initial_render`、`hover_preview`、`wheel_zoom`、`drag`、`search_highlight`、`point_select`、`container_select`、`spotlight_animation`、`drawer_open`、`enter_community`、`return_global`、`return_global_takeover`、`repeated_search_community_drawer_cycles`(内存)、`zoom_controls`。

覆盖验收点:初次显示、搜索、进入社区、返回全局、内存与既有硬门禁(fps/p95/时长/内存上限/hover 目标与可见状态)。该运行器以内联 `import` 加载 `dist/engine.esm.js` 并等待 Sigma 全局渲染器就绪,即工作台 ESM 宿主的浏览器加载证明。

## 调用契约(投影一次 / 每次更新一份模型、布局与搜索索引)

`packages/graph-engine/test/renderer-lifecycle.test.ts` 全部通过(随 `quality-and-tests` 的 `graph` 步骤跑):每份新数据只投影一次、初次创建与每次数据更新各只建一份绘制模型(Sigma 与 DOM/SVG 两路线)、共享准备结果被两条路线同一消费、共享准备不进入实时运动帧、Sigma 故障仅在共享快照准备完成后上报。

## 退休前 ESM / IIFE 产物大小

| 产物 | 迁移前基线(bytes) | 退休前/迁移后(bytes) | 变化 |
|---|---|---|---|
| `dist/engine.esm.js` | 414262 | 438043 | +23781 |
| `dist/engine.iife.js` | 495136 | 513949 | +18813 |

迁移前基线来自 `packages/graph-engine/test/fixtures/issue-159/artifact-size-baseline.json`(提交 c641953b,对照记录,非构建输出)。迁移后产物略增大,在职责拆分(新增 `src/layout/initial-layout.ts`、`src/render/render-policy.ts` 等)与既有去重净改后的合理范围内;无硬性大小门禁,本表为退休前(#283 删除旧代码前)的记录。

## 双宿主加载验收

- **工作台 ESM 宿主**:`packages/graph-engine/test/issue-282-graph-artifacts.test.ts` 动态 `import` 产物,断言 `createGraphEngine`、`buildCommunityAggregationMarkers` 为函数;叠加生产运行器在浏览器内实际加载 ESM 并渲染(见上“全动作硬门禁”)。
- **离线 IIFE 宿主**:`issue-282-graph-artifacts.test.ts` 在 `vm` 沙箱 eval 产物,断言 `window.LlmWikiGraphEngine` 暴露离线宿主消费的 4 个全局(`createGraphEngine`、`createGraphOfflineCapabilities`、`normalizeGraphLayoutFile`、`normalizeGraphPinMap`,对照 `fixtures/issue-159/supported-exports.json`);叠加 `build-graph-html.sh` 冒烟证明离线构建读取并内联 IIFE 产出非空单文件 HTML。

该测试为确定性快速门禁(无浏览器),随 `quality-and-tests` 的 `graph` 步骤持续运行。

## 隐私自查

候选产物经捕获器内 `assertNoPrivatePaths` 脱敏(去除 `artifact_dir`/`artifact_path` 与本机绝对路径);本文件仅含公开提交哈希、浏览器/Node/OS 版本与去敏数值,无本机路径、真实姓名或私有素材线索。

## 结论

Issue #282 全部验收点通过:迁移后大图悬停性能无回归(4 entry 全满足锁定公式且略优于基线);生产 1k 全动作硬门禁通过;调用契约保持;ESM/IIFE 双产物大小已记录且分别被工作台与离线宿主加载使用。未发现需在本票修复的回归。Closes #282(关联父票 #159,不关闭 #159)。

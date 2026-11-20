# Graph Performance Optimization Context

日期：2026-06-17

当前分支：`codex/graph-performance-optimization`

## 新 session 先读这里

这是图谱性能优化的交接文档，不是已批准的实现计划。新 session 进入后先读：

1. `AGENTS.md`
2. `workbench/AGENTS.md`
3. `workbench/PRODUCT.md`
4. 本文档
5. `docs/plans/2026-06-17-graph-renderer-coordination-split-progress.json`

推荐给新 session 的第一句话：

```text
我们现在讨论并推进图谱性能优化。请先读 docs/plans/2026-06-17-graph-performance-optimization-context.md，再基于当前 main 的图谱实现做性能调查。先测量和定位瓶颈，不要直接改方案；目标是让 1000 节点左右的图谱交互保持流畅。
```

## 当前状态

- `main` 已合入图谱渲染协调逻辑拆分。
- 最新相关提交：`2ac6c59 refactor(graph-engine): simplify renderer split internals`
- 上一轮目标是纯代码搬家，不做性能优化、不改用户可见行为。
- 拆分后的边界：
  - `packages/graph-engine/src/render/graph-renderer-root.ts`：组装和对外委派。
  - `packages/graph-engine/src/render/controller.ts`：交互决策、键盘、节点拖拽、搜索/图例命令。
  - `packages/graph-engine/src/render/render-pipeline.ts`：构图、绘制、控件挂载、viewport、diff 动画、simulation frame。
  - `packages/graph-engine/src/render/overlays-presenter.ts`：hover、阅读器、选择面板。
  - `packages/graph-engine/src/render/render-context.ts`：共享渲染上下文。
- 旧入口名已作为兼容别名保留：`createStaticGraphRenderer` / `StaticGraphRenderer` / `StaticRendererOptions`。

## 为什么讨论 FPS

这里的 FPS 指浏览器在图谱交互时每秒能画多少帧，主要反映滚轮缩放、拖拽、平移、diff 动画时是否流畅。

它不是业务数据，也不是节点数量，而是一次交互期间浏览器实际渲染画面的速度。它受电脑配置、屏幕分辨率、浏览器状态、后台进程、节点/边/标签数量影响。

上一轮验收只要求证明拆分没有让图谱变卡：

- 基线 dense wheel FPS：约 `50.2`
- 最终复测 dense wheel FPS：`51.1`
- 验收门槛：`>= 45`

结论：拆分没有造成性能退化。

## 1000 节点左右的流畅度判断

粗略标准：

- `50-60 FPS`：很好。
- `45 FPS+`：可以认为流畅。
- `35-45 FPS`：大图可接受，但应关注。
- `<30 FPS`：用户会明显觉得卡，需要优化。

注意：1000 节点不是唯一压力来源。1000 节点 + 1000 边，与 1000 节点 + 8000 边完全不同。标签、社区块、hover 面板、阴影、动画、DOM 数量也会明显影响结果。

## 优化前的原则

先测量，再优化。

不要先凭感觉改代码。新 session 应先证明瓶颈属于哪一类：

- 计算慢：布局、命中检测、筛选、状态计算、diff、simulation。
- 绘制慢：SVG/HTML 元素太多、边太多、标签太多、样式复杂。
- 更新慢：同一帧重复写 DOM、重复算 model、频繁触发重绘。
- 环境慢：浏览器、机器、4K 屏、后台任务、测试时并行跑了太多命令。

## 最可能的优化切入点

优先级从高到低：

1. 远景降细节：缩小时隐藏或弱化标签、边、低优先级节点细节。
2. 交互时降细节：拖拽/缩放过程中先保证流畅，停下后再补齐标签、阴影、面板等细节。
3. 减少边和标签的绘制压力：边通常比节点更容易拖慢大图。
4. 合并同一帧更新：避免一轮交互里重复 rebuild、重复写 DOM、重复 layout。
5. 保持命中检测走空间索引：鼠标移动和 hover 不能扫全图。
6. 控制 simulation 和 diff 动画生命周期：不能后台一直运动。
7. 到更大规模时评估 Canvas/WebGL，但不要在没有证据前重写渲染底座。

## 基准验证命令

快速检查：

```bash
npm run test --workspace=@llm-wiki/graph-engine
npm run typecheck --workspace=@llm-wiki/graph-engine
npm run build --workspace=@llm-wiki/graph-engine
```

完整图谱浏览器回归：

```bash
bash tests/graph-workbench-interactions.regression-1.sh
bash tests/graph-offline-phase-6.regression-1.sh
bash tests/graph-community-wash-interactions.regression-1.sh
bash tests/graph-browser-stage-4-5.regression-1.sh --target offline
```

保留 FPS artifact 的做法：

```bash
cp tests/graph-browser-stage-4-5.regression-1.sh /tmp/s45-perf.sh
sed -i '' 's|tmp_dir="$(mktemp -d)"|tmp_dir="/tmp/s45-perfrun"; mkdir -p "/tmp/s45-perfrun"|; s|rm -rf "$tmp_dir"|true|; s|REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"|REPO_ROOT="'"$PWD"'"|' /tmp/s45-perf.sh
rm -rf /tmp/s45-perfrun
bash /tmp/s45-perf.sh --target offline
cat /tmp/s45-perfrun/stage-4.5-artifacts/stage-4.5-offline-dense-wheel.json
```

清理：

```bash
rm -rf /tmp/s45-perfrun /tmp/s45-perf.sh
```

## 需要补的测量能力

现在的 dense fixture 更适合防退化，不一定足够代表 1000 节点场景。新 session 可以先补一个只用于测量的脚本或 fixture，建议覆盖：

- 1000 节点 / 1000 边。
- 1000 节点 / 5000 边。
- 1000 节点 / 10000 边。
- 缩放、平移、hover、节点拖拽四类交互。
- 记录 FPS、长任务、元素数量、一次交互期间 rebuild 次数。

是否把这些测量脚本提交进仓库，需要根据后续计划决定。探索阶段可以先放 `/tmp`，确认有价值后再固化。

## 风险和停手线

- 不要为了追 FPS 改掉图谱语义、选择行为、搜索、图例、阅读器、pin 逻辑。
- 不要在没有瓶颈证据时重写 Canvas/WebGL。
- 不要把机器环境波动误判成代码问题；同一次优化前后要在同一环境测。
- 如果优化会改变视觉层级、远景显示规则或用户可见行为，需要先整理产品决策，再实现。

## 新 session 的建议第一阶段

目标：先得到可信瓶颈报告，而不是立刻优化。

建议步骤：

1. 记录当前分支和基线测试结果。
2. 复测当前 dense wheel FPS。
3. 临时生成 1000 节点图谱，分别跑缩放/平移/hover/拖拽。
4. 用浏览器性能数据判断主要瓶颈在计算、绘制还是 DOM 更新。
5. 写出一份短计划：先做哪一个优化、预期改善哪个指标、如何证明没有行为退化。

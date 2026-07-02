# 社区视觉对齐 Phase 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除全局 Sigma 视图与社区 DOM/SVG 视图切换时的视觉割裂（配色/字体/底色/状态色/光晕）并修复社区视图形状畸变（spec §4.2 六项：5 项视觉 + 1 项几何），不含 Phase 2 的镜头推进过渡。

**Architecture:** 六项独立改动：5 项 token/CSS/取值级（无架构变更），1 项几何 bounds（model.ts:413 aspect-lock + focus 条件化）。引擎层（`packages/graph-engine/src/`）改几何函数、token、CSS 字符串常量、节点属性下发、Sigma 设置；用 `node --test` 单测覆盖有逻辑的项（①②⑤⑥ + fit-aware），纯 CSS 项（③④）靠 typecheck + 手动视觉 + 视觉回归验证。

**Tech Stack:** TypeScript ESM（graph-engine 子包）、node `--test` + tsx、graphology + sigma.js v3（Canvas）、DOM/SVG 渲染、CSS 变量（scoped 到 graph root inline style）。

## Global Constraints

- Node `>=22.19.0`（`.mise.toml` / `.nvmrc`）。
- 引擎测试：`node --import tsx --test test/*.test.ts`（从仓库根 `npm run test -w @llm-wiki/graph-engine`），从 `../src` import，不经 dist。
- 引擎源码在 `packages/graph-engine/src/`；只动无 ` 2.ts`/` 3.ts` 后缀的主文件（仓库有历史副本，勿误改）。
- 全仓类型检查：`npm run typecheck`（web/server 的 typecheck 会自动先 build 引擎，改引擎后跑这个能带上最新产物）。
- 分支：`feat/community-view-visual-alignment`（已开），不直接改 main。
- CSS 变量注入方式：tokens 经 `applyTheme` 写到 graph root 元素 inline style（scoped 到子树）；新增的"每节点不同"变量（如 `--node-community-color`）走节点元素 inline style（仿 `nodes.ts:57` 的 `--node-size`）。
- commit 不含本机绝对路径；conventional commits（feat/fix/test/docs），中文描述可。
- 每逻辑单元分步 commit；每 task 结束独立可测。

## File Structure

| 文件 | 责任 | 改动 |
|---|---|---|
| `packages/graph-engine/src/render/geometry.ts` | worldBoundsForPoints 等几何 | Task 1：`worldBoundsForPoints` 加 `aspectRatio` option |
| `packages/graph-engine/src/render/model.ts` | `buildRenderableGraph` | Task 1：options 加 `viewportSize` + worldBounds aspect-lock；Task 6：`RenderableNode` 加 `communityColor` + 节点构造回填 |
| `packages/graph-engine/src/render/render-pipeline.ts` | DOM 重建管线 | Task 1：`rebuildAndPaint` 传 `viewportSize` |
| `packages/graph-engine/src/render/render-styles.ts` | STATIC_RENDERER_CSS 常量 | Task 4（社区背景）、Task 5（社区边）、Task 6（dot-core 光晕/底色） |
| `packages/graph-engine/src/render/sigma-graphology-model.ts` | Sigma 节点属性/颜色 | Task 2：`sigmaGlobalNodeColor` 加 theme + token |
| `packages/graph-engine/src/render/sigma-global-renderer.ts` | Sigma 设置 | Task 3：`sigmaSettingsForTheme` 加 `labelFont` + export |
| `packages/graph-engine/src/render/nodes.ts` | `createGraphNodeElement` | Task 6：下发 `--node-community-color` |
| `packages/graph-engine/test/geometry.test.ts` | geometry 单测 | Task 1 加 aspect-lock 用例 |
| `packages/graph-engine/test/render-model.test.ts` | buildRenderableGraph 单测 | Task 1 加 focus 条件化用例；Task 6 加 communityColor 用例 |
| `packages/graph-engine/test/sigma-graphology-model.test.ts` | sigma model 单测 | Task 2 加用例 |
| `packages/graph-engine/test/sigma-global-renderer.test.ts` | sigma renderer 单测 | Task 3 加用例 |

依赖：六项互相独立（Task 5 不再依赖任何 token 新增）。建议顺序 1→2→3→4→5→6→7（fit-aware 几何基础先绿，其余低风险）。

---

## Task 1: 社区视图形状畸变 → fit-aware worldBounds〔§4.2⑥〕（几何基础）

**Files:**
- Modify: `packages/graph-engine/src/render/geometry.ts:302-322`（`worldBoundsForPoints` 加 `aspectRatio`）
- Modify: `packages/graph-engine/src/render/model.ts:226-237`（`BuildRenderableGraphOptions` 加 `viewportSize`）、`:413`（worldBounds 计算）
- Modify: `packages/graph-engine/src/render/render-pipeline.ts:114-123`（`rebuildAndPaint` 传 `viewportSize`）
- Test: `packages/graph-engine/test/geometry.test.ts`、`packages/graph-engine/test/render-model.test.ts`

**Interfaces:**
- Consumes: `focus.kind === "community"`（model.ts 既有判断，:369/:939）、`viewportSize()`（render-pipeline.ts:607 闭包函数，返回 `{width,height}`）。
- Produces: `worldBoundsForPoints(points, { aspectRatio? })` 新 option；`BuildRenderableGraphOptions.viewportSize?: { width: number; height: number }`。focus=community 且有 viewportSize 时 worldBounds aspect-locked 到 viewport 宽高比（消除各向异性畸变）；其余情况（focus=global / 无 viewportSize）维持紧致 bounds 不变。

**背景（为何这么改）**：DOM 社区视图把 worldPoint 经紧制 worldBounds 各轴独立归一化为 CSS%，是各向异性仿射；社区云宽高比 ≠ viewport 宽高比时节点云被压扁/拉伸（宽屏 1600×900 下 y 压缩约 19%，肉眼椭圆畸变）。fit-aware 让 bounds 与 viewport 同宽高比 → CSS% 归一化变相似变换 → 畸变消除。几何论证见 spec §5.2。sigma-global 路由不调 `buildRenderableGraph`（用独立 graphology graph + 相机），不受影响。

- [ ] **Step 1: 写失败测试（geometry aspect-lock）**

在 `test/geometry.test.ts` 追加（顶部若无 `worldBoundsForPoints` import 则补）：

```ts
import { worldBoundsForPoints } from "../src/render/geometry";

describe("worldBoundsForPoints aspect lock", () => {
  // 明显偏高的点云（宽 100、高 300，宽高比 0.33），viewport 宽高比 1.78
  const tallCloud = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 300 }, { x: 100, y: 300 },
  ];
  it("without aspectRatio returns tight bounds (point-cloud aspect)", () => {
    const b = worldBoundsForPoints(tallCloud);
    assert.ok(b.width / b.height < 1, "tight bounds should be taller than wide");
  });
  it("with aspectRatio expands short axis to match viewport ratio without losing points", () => {
    const aspect = 16 / 9;
    const b = worldBoundsForPoints(tallCloud, { aspectRatio: aspect });
    assert.ok(Math.abs(b.width / b.height - aspect) < 0.01, `aspect locked to ${aspect}`);
    for (const p of tallCloud) {
      assert.ok(p.x >= b.minX && p.x <= b.maxX, `point x=${p.x} inside bounds`);
      assert.ok(p.y >= b.minY && p.y <= b.maxY, `point y=${p.y} inside bounds`);
    }
  });
  it("aspectRatio only expands short axis (wide cloud + narrow ratio keeps all points)", () => {
    const wideCloud = [{ x: 0, y: 0 }, { x: 400, y: 100 }];
    const b = worldBoundsForPoints(wideCloud, { aspectRatio: 0.5 });
    for (const p of wideCloud) {
      assert.ok(p.x >= b.minX && p.x <= b.maxX);
      assert.ok(p.y >= b.minY && p.y <= b.maxY);
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | grep -A3 "aspect lock"`
Expected: FAIL（`worldBoundsForPoints` 不认 `aspectRatio`，bounds 仍紧致，宽高比断言不过）。

- [ ] **Step 3: 给 worldBoundsForPoints 加 aspectRatio option**

`geometry.ts:302-322` 替换为：

```ts
export function worldBoundsForPoints(
  points: GraphWorldPoint[],
  options: { padding?: number; minWidth?: number; minHeight?: number; aspectRatio?: number } = {}
): GraphWorldBounds {
  const padding = Math.max(0, finiteNumber(options.padding, 80));
  const minWidth = Math.max(1, finiteNumber(options.minWidth, GRAPH_WORLD_SIZE.width));
  const minHeight = Math.max(1, finiteNumber(options.minHeight, GRAPH_WORLD_SIZE.height));
  let minX = 0;
  let minY = 0;
  let maxX = minWidth;
  let maxY = minHeight;
  for (const point of points) {
    const x = finiteNumber(point.x, 0);
    const y = finiteNumber(point.y, 0);
    minX = Math.min(minX, x - padding);
    minY = Math.min(minY, y - padding);
    maxX = Math.max(maxX, x + padding);
    maxY = Math.max(maxY, y + padding);
  }
  let width = maxX - minX;
  let height = maxY - minY;
  // fit-aware: 把 bounds aspect-lock 到 viewport 宽高比（只扩短轴，中心不变，不丢点）
  const aspectRatio = Number(options.aspectRatio);
  if (Number.isFinite(aspectRatio) && aspectRatio > 0 && width > 0 && height > 0) {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    if (width / height < aspectRatio) width = height * aspectRatio;
    else height = width / aspectRatio;
    minX = cx - width / 2;
    maxX = cx + width / 2;
    minY = cy - height / 2;
    maxY = cy + height / 2;
  }
  return normalizeWorldBounds({ minX, minY, maxX, maxY, width, height: maxY - minY });
}
```

- [ ] **Step 4: 跑 geometry 测试确认通过**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | grep -A3 "aspect lock"`
Expected: PASS。

- [ ] **Step 5: 写失败测试（model focus 条件化）**

在 `test/render-model.test.ts` 追加（参考 line 358 现有 focused 用法的 focus 格式）：

```ts
describe("buildRenderableGraph community worldBounds aspect", () => {
  it("aspect-locks worldBounds to viewport ratio when focus=community + viewportSize", () => {
    const graph = buildRenderableGraph(sampleGraph(), {
      focus: { kind: "community", id: "c1" },
      viewportSize: { width: 1600, height: 900 },
    });
    const ratio = graph.worldBounds.width / graph.worldBounds.height;
    assert.ok(Math.abs(ratio - 1600 / 900) < 0.05, `worldBounds aspect ~ viewport, got ${ratio}`);
  });
  it("does not force-lock worldBounds when focus=global", () => {
    const tight = buildRenderableGraph(sampleGraph(), {});
    const withSize = buildRenderableGraph(sampleGraph(), {
      viewportSize: { width: 1600, height: 900 },
    });
    // global 不 aspect-lock：传不传 viewportSize，worldBounds 宽高比都应基本不变
    assert.ok(
      Math.abs((tight.worldBounds.width / tight.worldBounds.height) - (withSize.worldBounds.width / withSize.worldBounds.height)) < 0.05,
      "global worldBounds unaffected by viewportSize"
    );
  });
});
```

> 注：`GraphFocusInput` 的 community 变体是 `{ kind: "community", id }`（model.ts:939 `focus.kind !== "community"` + :369 `focus.id`）。若 typecheck 报 focus 字段不符，以 `src/types` 里 `GraphFocusInput` 实际定义为准。`sampleGraph()` 含 communities c1/c2/c3（render-model.test.ts:47-50）。

- [ ] **Step 6: 跑测试确认失败**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | grep -A3 "worldBounds aspect"`
Expected: FAIL（buildRenderableGraph 不认 viewportSize，worldBounds 仍紧致，aspect 断言不过）。

- [ ] **Step 7: BuildRenderableGraphOptions 加 viewportSize**

`model.ts:226-237` 接口末尾（`aggregationMarkers?: GraphAggregationMarker[];` 之后）加：

```ts
  viewportSize?: { width: number; height: number };
```

- [ ] **Step 8: worldBounds 计算 aspect-lock（model.ts:413）**

`model.ts:413` 替换为：

```ts
  const communityViewportAspect =
    focus?.kind === "community" && options.viewportSize && options.viewportSize.width > 0 && options.viewportSize.height > 0
      ? options.viewportSize.width / options.viewportSize.height
      : undefined;
  const worldBounds = worldBoundsForPoints(
    [...pointById.values()],
    communityViewportAspect ? { aspectRatio: communityViewportAspect } : {}
  );
```

- [ ] **Step 9: rebuildAndPaint 传 viewportSize（render-pipeline.ts:114-123）**

`render-pipeline.ts:114` 的 `buildRenderableGraph` 调用，options 对象加一行 `viewportSize: viewportSize(),`（`viewportSize` 是 `createGraphRenderPipeline` 闭包内函数，render-pipeline.ts:607，`rebuildAndPaint` 同作用域可直接调）：

```ts
    context.graph = buildRenderableGraph(context.data, {
      pins: runtimeSnapshot.pins,
      theme: context.theme,
      selectedNodeId: renderSelection.selectedNodeId,
      selection: renderSelection.selection,
      focus: runtimeSnapshot.focus,
      typeFilters: {},
      aggregationMarkers: context.aggregationMarkers,
      pathCache: context.pathCache,
      viewportSize: viewportSize()
    });
```

> 注：`render-pipeline.ts:440` 还有一处 `buildRenderableGraph(context.data, …)` 调用；若它也是 DOM 重建路径（非 sigma-global），同样加 `viewportSize: viewportSize()`。先 grep 确认上下文：`grep -n "buildRenderableGraph(context.data" packages/graph-engine/src/render/render-pipeline.ts`。
>
> `graph-renderer-root.ts:112` 的 `initialGraph` **不传 viewportSize**：首屏 focus 一般非 community（aspect-lock 不触发）；即便 community，缺 viewportSize 时 fallback 到紧制 bounds = 当前现状，不崩溃。

- [ ] **Step 10: 跑测试确认通过**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | tail -5`
Expected: PASS（geometry + model 新用例全绿，无既有回归）。

- [ ] **Step 11: typecheck**

Run: `npm run typecheck -w @llm-wiki/graph-engine`
Expected: 无错误。若报 `buildRenderableGraph` 别处调用点类型不符，按调用点实际补。

- [ ] **Step 12: 手动视觉确认（宽屏畸变消除）**

`npm run dev` → 浏览器拉宽到 ~1600×900 → 进入一个节点较多的社区。确认：
- 社区节点云**不再被压成扁平椭圆**，分布形状与全局视图同尺度（不畸变）。
- 节点仍全部在屏（aspect-lock 只扩短轴不丢点）。
- mo-ye 主题、不同社区大小下均正常。

- [ ] **Step 13: commit**

```bash
git add packages/graph-engine/src/render/geometry.ts packages/graph-engine/src/render/model.ts packages/graph-engine/src/render/render-pipeline.ts packages/graph-engine/test/geometry.test.ts packages/graph-engine/test/render-model.test.ts
git commit -m "feat(graph-engine): fit-aware community worldBounds to fix aspect distortion"
```

---

## Task 2: Sigma 状态色硬编码 → 引擎 token〔§4.2②〕

**Files:**
- Modify: `packages/graph-engine/src/render/sigma-graphology-model.ts:164-171`（`sigmaGlobalNodeAttributes`）、`:355-360`（`sigmaGlobalNodeColor`）、`:95`、`:147`（两处调用点）
- Test: `packages/graph-engine/test/sigma-graphology-model.test.ts`

**Interfaces:**
- Consumes: `getThemeTokens(theme).vars["--cinnabar"|"--amber"|"--night"|"--muted"]`（已存在，tokens.ts:104）。
- Produces: `sigmaGlobalNodeColor(node, communityColorById, theme)` 新签名（第三参 `theme: ThemeId`）；`sigmaGlobalNodeAttributes(node, communityColorById, selectedCommunityIds, theme)` 新增第四参。调用链 theme 上游已可用（`buildSigmaGlobalGraphologyGraph`/`patchSigmaGlobalGraphAttributes` 均有 `theme` 参数）。

- [ ] **Step 1: 写失败测试**

在 `test/sigma-graphology-model.test.ts` 追加（顶部若无 `getThemeTokens` import 则补）：

```ts
import { sigmaGlobalNodeColor } from "../src/render/sigma-graphology-model";
import { getThemeTokens } from "../src/themes";
import type { GraphRendererAdapterNode } from "../src/render/adapter";

// sigmaGlobalNodeColor 运行时只读 selected/searchHit/pinHint.pinned/communityId；
// 其余字段用 as unknown as 绕过完整类型。若 typecheck 报缺字段，按 adapter.ts:59-78 补齐。
function adapterNode(overrides: Partial<GraphRendererAdapterNode> = {}): GraphRendererAdapterNode {
  return ({
    id: "n1",
    label: "n",
    communityId: "c1",
    selected: false,
    searchHit: false,
    pinHint: { pinned: false },
    point: { x: 0, y: 0 },
    render: { labelVisible: false, displayMode: "point", priority: 0, point: { x: 0, y: 0 } }
  } as unknown) as GraphRendererAdapterNode;
}

describe("sigmaGlobalNodeColor theme tokens", () => {
  const map = new Map<string, string>();
  it("maps selected -> --cinnabar", () => {
    const vars = getThemeTokens("shan-shui").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode({ selected: true }), map, "shan-shui"), vars["--cinnabar"]);
  });
  it("maps searchHit -> --amber", () => {
    const vars = getThemeTokens("shan-shui").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode({ searchHit: true }), map, "shan-shui"), vars["--amber"]);
  });
  it("maps pinned -> --night", () => {
    const vars = getThemeTokens("shan-shui").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode({ pinHint: { pinned: true } } as Partial<GraphRendererAdapterNode>) , map, "shan-shui"), vars["--night"]);
  });
  it("falls back to --muted when no community color", () => {
    const vars = getThemeTokens("shan-shui").vars;
    assert.equal(sigmaGlobalNodeColor(adapterNode(), map, "shan-shui"), vars["--muted"]);
  });
});
```

> 注：`GraphRendererAdapterNode` 的确切字段以 `src/render/adapter.ts:59-78` 为准；mock 只覆盖 `sigmaGlobalNodeColor` 读到的字段，用 `as unknown as` 绕过完整类型。若 typecheck 报缺字段，按 adapter.ts 补齐。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | grep -A3 "theme tokens"`
Expected: FAIL（`sigmaGlobalNodeColor` 仍返回硬编码 `#ef4444` 等，断言不等 token）。

- [ ] **Step 3: 改 `sigmaGlobalNodeColor`**

`sigma-graphology-model.ts:355-360` 替换为：

```ts
export function sigmaGlobalNodeColor(
  node: GraphRendererAdapterNode,
  communityColorById: Map<string, string>,
  theme: ThemeId
): string {
  const vars = getThemeTokens(theme).vars;
  if (node.selected) return vars["--cinnabar"];
  if (node.searchHit) return vars["--amber"];
  if (node.pinHint.pinned) return vars["--night"];
  return node.communityId ? communityColorById.get(node.communityId) ?? vars["--muted"] : vars["--muted"];
}
```

确保文件顶部已 import `{ getThemeTokens } from "../themes"` 和 `type { ThemeId }`（line 85 `theme: ThemeId` 已用，应已 import；若缺则补）。

- [ ] **Step 4: 改 `sigmaGlobalNodeAttributes` 透传 theme**

`sigma-graphology-model.ts:164-171`：

```ts
export function sigmaGlobalNodeAttributes(
  node: GraphRendererAdapterNode,
  communityColorById: Map<string, string>,
  selectedCommunityIds: ReadonlySet<string> = new Set(),
  theme: ThemeId = "shan-shui"
): SigmaGlobalGraphologyNodeAttributes {
  const spotlight = sigmaGlobalNodeSpotlightState(node, selectedCommunityIds);
  const baseSize = sigmaGlobalNodeSize(node);
  const baseColor = sigmaGlobalNodeColor(node, communityColorById, theme);
```

- [ ] **Step 5: 适配两处调用点传 theme**

`sigma-graphology-model.ts:95`（`buildSigmaGlobalGraphologyGraph` 内，theme 在 line 85 可用）：
```ts
    graph.addNode(node.id, sigmaGlobalNodeAttributes(node, communityColorById, spotlightCommunityIds, theme));
```
`:147`（`patchSigmaGlobalGraphAttributes` 内，theme 在 line 137 可用）：
```ts
    graph.mergeNodeAttributes(node.id, sigmaGlobalNodeAttributes(node, communityColorById, spotlightCommunityIds, theme));
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | tail -5`
Expected: PASS。

- [ ] **Step 7: typecheck（确认无遗漏调用点）**

Run: `npm run typecheck -w @llm-wiki/graph-engine`
Expected: 无错误。若报 `sigmaGlobalNodeAttributes` 别处调用缺参，grep 补 theme：`grep -rn "sigmaGlobalNodeAttributes(" packages/graph-engine/src`。

- [ ] **Step 8: commit**

```bash
git add packages/graph-engine/src/render/sigma-graphology-model.ts packages/graph-engine/test/sigma-graphology-model.test.ts
git commit -m "feat(graph-engine): map sigma state colors to theme tokens"
```

---

## Task 3: Sigma 标签字体 → 对齐 DOM 主体 sans〔§4.2⑤〕

> **TDD 顺序注意**：必须先给 `sigmaSettingsForTheme` 加 `export`，再写 import 它的测试。否则 ESM 命名导出不存在会在模块加载阶段抛 SyntaxError，整个测试文件挂、红绿不清。

**Files:**
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts:766-779`（`sigmaSettingsForTheme`，先 export，再加 `labelFont` + `getThemeTokens` import）
- Test: `packages/graph-engine/test/sigma-global-renderer.test.ts`

**Interfaces:**
- Produces: `export function sigmaSettingsForTheme(theme)` 返回含 `labelFont`（取自 `--font-ui` 字符串）。Sigma v3 canvas label 不吃 CSS var，故传字符串值。

- [ ] **Step 1: 先加 export + getThemeTokens import（不改函数体）**

`sigma-global-renderer.ts:766` 把 `function sigmaSettingsForTheme` 改为 `export function sigmaSettingsForTheme`。

确认文件顶部已 import `getThemeTokens`——**当前未 import**（sigma-global-renderer.ts:1-72 用的是 `sigmaLabelColor` 内联硬编码），补一行（与其他 import 同区域）：

```ts
import { getThemeTokens } from "../themes";
```

- [ ] **Step 2: 写失败测试**

在 `test/sigma-global-renderer.test.ts` 追加：

```ts
import { sigmaSettingsForTheme } from "../src/render/sigma-global-renderer";
import { getThemeTokens } from "../src/themes";

describe("sigmaSettingsForTheme label font", () => {
  it("uses --font-ui so sigma labels match DOM sans-serif", () => {
    const settings = sigmaSettingsForTheme("shan-shui") as Record<string, unknown>;
    assert.equal(settings.labelFont, getThemeTokens("shan-shui").vars["--font-ui"]);
    assert.ok(String(settings.labelFont).includes("Noto Sans SC"));
  });
  it("applies the same font for mo-ye", () => {
    const settings = sigmaSettingsForTheme("mo-ye") as Record<string, unknown>;
    assert.equal(settings.labelFont, getThemeTokens("mo-ye").vars["--font-ui"]);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | grep -A3 "label font"`
Expected: FAIL（`settings.labelFont` 为 undefined，断言不等 `--font-ui`）。

- [ ] **Step 4: 加 labelFont**

`sigma-global-renderer.ts:766-779` 返回对象加 `labelFont`：

```ts
export function sigmaSettingsForTheme(theme: ThemeId): Record<string, unknown> {
  const tokens = getThemeTokens(theme);
  return {
    renderEdgeLabels: false,
    allowInvalidContainer: false,
    labelColor: sigmaLabelColor(theme),
    labelFont: tokens.vars["--font-ui"],
    zoomingRatio: SIGMA_BUTTON_ZOOM_RATIO,
    // Sigma 默认 wheel 的兜底参数：wheel 已被 sigma-wheel-zoom controller 接管（preventSigmaDefault），
    // zoomingRatio/zoomDuration 只在 Sigma 内置缩放入口（如 animatedZoom）被触发时生效，
    // 日常不走。项目按钮动画用的是 SIGMA_BUTTON_ZOOM_DURATION_MS（140），勿与这里的 120 混淆。
    zoomDuration: 120,
    minCameraRatio: SIGMA_CAMERA_MIN_RATIO,
    maxCameraRatio: SIGMA_CAMERA_MAX_RATIO
  };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | tail -5`
Expected: PASS。

- [ ] **Step 6: typecheck + commit**

Run: `npm run typecheck -w @llm-wiki/graph-engine`
Expected: 无错误。

```bash
git add packages/graph-engine/src/render/sigma-global-renderer.ts packages/graph-engine/test/sigma-global-renderer.test.ts
git commit -m "feat(graph-engine): set sigma labelFont to --font-ui to match DOM"
```

---

## Task 4: 社区方格纸底 → 全局同源釉面〔§4.2③〕

> 纯 CSS 改动，无引擎单测（graph-engine 的 CSS 常量无单测范式）。验证 = typecheck 不破坏 + 手动视觉确认（社区态底色与全局同源、方格消失）。

**Files:**
- Modify: `packages/graph-engine/src/render/render-styles.ts:1091-1097`

- [ ] **Step 1: 改社区态背景，删方格**

`render-styles.ts:1083-1098` 的 `[data-community-map-state="lightweight"]` 块，把 `background:` 与 `background-size:` 两段（1091-1097）替换为：

```css
  background:
    var(--paper-glow),
    var(--bg);
```

即删除两条方格 `linear-gradient`（横/竖）、原 radial 高光、原 linear 渐变、`--community-map-paper` 底，以及 `background-size: 42px 42px, ...` 整行。保留该选择器块里 `--community-map-*` 局部变量声明（1084-1090，label 仍用）。

> 说明：`--bg` 即全局底色 token（亮主题 `#f4efe4`、暗主题自动跟随，spec §3.1/§4.2③），`--paper-glow`（radial 高光）与全局 Sigma 视图同源底，由 `applyTheme` 下发到 graph root。**附带收益**：现 `--community-map-paper #f8f1e6` 是硬编码浅色，墨夜主题进入 lightweight 态纸色不匹配；改 `var(--bg)` 后深主题纸色自动跟随，顺带消除该隐患。

- [ ] **Step 2: typecheck**

Run: `npm run typecheck -w @llm-wiki/graph-engine`
Expected: 无错误（CSS 改动不应影响类型，但确认无意外）。

- [ ] **Step 3: 手动视觉确认**

Run: `npm run dev`，浏览器打开图谱视图 → 进入任一社区（点社区 → 抽屉"进入社区"）。
确认：
- 社区态背景**不再有 42px 方格**。
- 社区态底色与全局 Sigma 视图**同源**（亮主题浅纸、暗主题深底），切换不再"突然变另一种底"。
- 社区云椭圆、节点、边、标签仍清晰可读。

- [ ] **Step 4: commit**

```bash
git add packages/graph-engine/src/render/render-styles.ts
git commit -m "feat(graph-engine): unify community backdrop with global paper via --bg/--paper-glow"
```

---

## Task 5: 社区边 0.32→0.5 + token 化〔§4.2④〕

> 纯 CSS。验证同 Task 4。**不再依赖任何新 token**——conflict 边保持原 rgba 不动（属关系边上色系统 ADR-23，待整体演进统一，spec §3.4）。

**Files:**
- Modify: `packages/graph-engine/src/render/render-styles.ts:1109-1128`

- [ ] **Step 1: 改社区态边 opacity**

`render-styles.ts:1109-1112`，把 `.edge { ... opacity: .32 !important; ... }` 的 `opacity: .32` 改为 `0.5`：

```css
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .edge {
  stroke-width: max(1.1px, min(1.65px, var(--edge-map-width, 1.45px))) !important;
  opacity: .5 !important;
  transition: opacity .18s ease, stroke-width .18s ease, stroke .18s ease;
}
```

- [ ] **Step 2: 关系类型 rgba → color-mix token（conflict 保持原 rgba 不动）**

`render-styles.ts:1114-1128` 的 implementation/dependency/derivation/contrast 四类改 color-mix；**conflict 保持原 `rgba(183, 96, 112, .42)` 不动**：

```css
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .edge.relation-implementation {
  stroke: color-mix(in srgb, var(--night) 34%, transparent);
}
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .edge.relation-dependency {
  stroke: color-mix(in srgb, var(--night) 36%, transparent);
}
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .edge.relation-derivation {
  stroke: color-mix(in srgb, var(--night) 34%, transparent);
}
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .edge.relation-contrast {
  stroke: color-mix(in srgb, var(--amber) 40%, transparent);
}
```

> conflict 边（`.relation-conflict`）**保留原行 `stroke: rgba(183, 96, 112, .42);` 不改**，并在行尾加注释 `/* conflict 色 token 化待 ADR-23 关系边系统整体演进，spec §3.4 */`。

- [ ] **Step 3: typecheck + 手动视觉确认**

Run: `npm run typecheck -w @llm-wiki/graph-engine`
Expected: 无错误。

`npm run dev` → 进入社区。确认：
- 社区内边**整体更清晰**（0.32→0.5）。
- implementation/dependency/derivation/contrast 四类颜色与全局边**同源 token**（night/amber），无突兀的独立灰青。
- conflict 边维持原红色（未 token 化，有意取舍）。
- mo-ye 主题下边仍可读（深底 + night/amber，若百分比需微调记入后续 polish，不阻塞）。

- [ ] **Step 4: commit**

```bash
git add packages/graph-engine/src/render/render-styles.ts
git commit -m "feat(graph-engine): raise community edge opacity to .5 and tokenize relation colors"
```

---

## Task 6: 社区 DOM 节点 社区色底 + 光晕仅 hover/选中〔§4.2①〕（核心）

**Files:**
- Modify: `packages/graph-engine/src/render/model.ts:138-165`（接口）、`:515-563`（节点构造）、早期建 colorIndex map
- Modify: `packages/graph-engine/src/render/nodes.ts:54-67`（下发 `--node-community-color`）
- Modify: `packages/graph-engine/src/render/render-styles.ts:1169-1200`（dot-core 底色/光晕）
- Test: `packages/graph-engine/test/render-model.test.ts`

**Interfaces:**
- Consumes: `getCommunityColor(theme, index)`（`tokens.ts:113`）、`model.communities[].color_index`。
- Produces: `RenderableNode.communityColor: string`（社区色 hex）；`createGraphNodeElement` 把它下发为节点元素 inline style `--node-community-color`。

- [ ] **Step 1: 写失败测试**

在 `test/render-model.test.ts` 追加（顶部补 `getCommunityColor` import）：

```ts
import { getCommunityColor } from "../src/themes";
```

在文件末尾或合适 describe 内追加：

```ts
describe("renderable node communityColor", () => {
  it("attaches the community color to each node via getCommunityColor", () => {
    const data = sampleGraph();
    const graph = buildRenderableGraph(data, {});
    const theme = "shan-shui" as const;
    for (const node of graph.nodes) {
      const community = data.learning.communities.find((c) => c.id === node.community);
      const expectedIndex = Number(community?.color_index ?? 0);
      assert.equal(node.communityColor, getCommunityColor(theme, expectedIndex));
    }
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | grep -A3 communityColor`
Expected: FAIL（`node.communityColor` 为 `undefined`）。

- [ ] **Step 3: 给 `RenderableNode` 加字段**

`model.ts:138-165` 接口末尾（line 164 `communityMapRelationLabel: boolean;` 之后）加：

```ts
  communityColor: string;
```

- [ ] **Step 4: 建 colorIndex map 并回填节点**

在 `model.ts` 的 `buildRenderableGraph` 内，`const pointById = ...`（line 412）之后加：

```ts
  const communityColorIndexById = new Map(
    model.communities.map((community, index) => [community.id, Number(community.color_index ?? index)])
  );
```

然后在节点构造（`model.ts:515-563` 的 return 对象内，紧跟 `community: node.community,` 之后）加字段：

```ts
      communityColor: getCommunityColor(theme, communityColorIndexById.get(node.community) ?? 0),
```

（`getCommunityColor` 已在 model.ts import，line 623 已用。）

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | tail -5`
Expected: PASS。

- [ ] **Step 6: nodes.ts 下发 `--node-community-color`**

`nodes.ts:54-57` 的 `if (options.communityMap) {` 块内，在 `button.style.setProperty("--node-size", ...)` 之后加：

```ts
    button.style.setProperty("--node-community-color", node.communityColor);
```

- [ ] **Step 7: 改 dot-core 底色与光晕（render-styles.ts:1169-1200）**

把 1169-1195 替换为（默认无硬环；非 topic 用社区色底；topic 保持朱砂）：

```css
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .dot-core {
  display: block;
  width: var(--node-size, 13px);
  height: var(--node-size, 13px);
  border: 1px solid rgba(255, 252, 246, .82);
  border-radius: 999px;
  background: var(--node-community-color, var(--night));
  transition: transform .16s ease, box-shadow .16s ease, background .16s ease, opacity .16s ease;
}
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .node[data-type="topic"] .dot-core {
  background: var(--cinnabar);
}
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .node:hover .dot-core {
  box-shadow: 0 0 8px 1px color-mix(in srgb, var(--night) 45%, transparent);
}
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .node[data-type="topic"]:hover .dot-core {
  box-shadow: 0 0 8px 1px color-mix(in srgb, var(--cinnabar) 45%, transparent);
}
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .node[data-type="source"]:hover .dot-core {
  box-shadow: 0 0 8px 1px color-mix(in srgb, var(--jade) 45%, transparent);
}
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .node[data-type="synthesis"]:hover .dot-core,
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .node[data-type="comparison"]:hover .dot-core {
  box-shadow: 0 0 8px 1px color-mix(in srgb, var(--amber) 45%, transparent);
}
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .node[data-type="query"]:hover .dot-core {
  box-shadow: 0 0 8px 1px color-mix(in srgb, var(--violet) 45%, transparent);
}
```

保留 1196-1200（selected/relation-focus 朱砂光晕 + scale）原样不动。即：删掉原来各 `data-type` 的 `box-shadow: 0 0 0 4px color-mix(...15%)` 同色硬环常显；改为默认无光晕，仅 `:hover` 出类型色柔光晕；selected/focus 维持朱砂。

> 说明：原 source/synthesis/comparison/query 的 `background: var(--jade/--amber/--violet)` 类型实色底被移除（统一改社区色底）；类型色降级为 `:hover` 光晕语义。topic 保持 `--cinnabar`（设计稿"近景强调核心"，见 spec §4.2① 已知权衡）。

- [ ] **Step 8: typecheck**

Run: `npm run typecheck`
Expected: 无错误（全仓 typecheck，确认 `RenderableNode` 新字段无遗漏构造点）。

- [ ] **Step 9: 手动视觉确认**

`npm run dev` → 进入社区。确认：
- 节点 dot 默认是**社区色**底（同社区同色），**无同色硬环常显**。
- topic 节点是**朱砂**底。
- 鼠标悬停节点出**类型色柔光晕**（topic 朱砂、source 翠、synthesis/comparison 琥珀、query 紫）。
- 选中/聚焦节点仍是朱砂光晕 + 放大（未回归）。

- [ ] **Step 10: commit**

```bash
git add packages/graph-engine/src/render/model.ts packages/graph-engine/src/render/nodes.ts packages/graph-engine/src/render/render-styles.ts packages/graph-engine/test/render-model.test.ts
git commit -m "feat(graph-engine): community-color dot base + hover-only type halo"
```

---

## Task 7: 收尾全量回归 + 视觉验收

**Files:** 无（仅验证）。

- [ ] **Step 1: 引擎全测**

Run: `npm run test -w @llm-wiki/graph-engine`
Expected: 全 PASS（含 Task 1/2/3/6 新用例，无既有用例回归）。

- [ ] **Step 2: 全仓 typecheck**

Run: `npm run typecheck`
Expected: 无错误（web/server typecheck 会自动带上最新引擎产物）。

- [ ] **Step 3: 前端 lint（顺带）**

Run: `npm run lint -w @llm-wiki-agent/web`
Expected: 无新增错误。

- [ ] **Step 4: 手动视觉验收清单（对照 spec §4.1 五类割裂）**

`npm run dev`，真实数据下从全局进入社区，逐项确认：
- [ ] **配色维度跳变**消除：状态红（Sigma）与社区色（DOM）同源 token，不再 Tailwind 硬编码 vs 引擎 token 两套（Task 2/6）。
- [ ] **方格纸突然出现**消除：社区态底色与全局同源（Task 4）。
- [ ] **状态红换色**消除：Sigma selected/searchHit/pinned 用引擎 token（Task 2）。
- [ ] **字体跳变**消除：Sigma 标签与 DOM 主体同 sans（Task 3）。
- [ ] **社区形状畸变**消除：宽屏下社区节点云不再被压成扁平椭圆（Task 1）。
- [ ] 社区内边更清晰、四类关系色同源 token（Task 5，conflict 边有意保 rgba）；社区节点社区色底 + hover 类型光晕（Task 6）。

- [ ] **Step 5: 视觉回归基线（可选，若 visual:paper 覆盖图谱视图）**

Run: `npm run visual:paper -w @llm-wiki-agent/web`
Expected: 仅图谱相关快照因配色/字体/底色改动而 diff（预期），其余页面无回归。若 diff 超预期，逐张核对。必要时 `--update` 刷基线（先人工确认每张 diff 都符合 Phase 1 意图）。

> 注：visual:paper 目前无"全局+社区同框"用例；社区态视觉以 Step 4 手动验收为准。新增社区视觉用例可作为后续 polish，不阻塞 Phase 1 验收。

- [ ] **Step 6: 推送前最终检查（CLAUDE.md 推送规则）**

```bash
grep -rn '本机用户路径\|真实姓名\|私有素材路径\|/Users/' packages/graph-engine/src packages/graph-engine/test
```
Expected: 无命中（commit 不含本机路径）。

- [ ] **Step 7: 收尾 commit（若过程中有零散修复）**

仅当 Step 1-6 中产生了未提交的修复时执行；否则跳过。

---

## Self-Review

**1. Spec coverage（spec §4.2 六项 → task）：**
- ① 社区色底 + 光晕仅 hover/选中 → Task 6 ✓
- ② Sigma 状态色 token → Task 2 ✓
- ③ 社区方格纸底 → 釉面 → Task 4 ✓
- ④ 社区边 0.32→0.5 + token（conflict 保 rgba）→ Task 5 ✓
- ⑤ Sigma 标签字体 sans → Task 3 ✓
- ⑥ fit-aware worldBounds → Task 1 ✓
- spec §4.4 验证（引擎单测 + 视觉回归 + 手动 + typecheck + 双宿主）→ Task 1/2/3/6 单测、Task 7 全量回归 + 手动 ✓
- spec §4.3 不纳入项（标签底框、两套红、节点尺寸、布局、conflict 色 token 化）→ 计划均未触碰 ✓（conflict 边保 rgba 是 spec §3.4 有意取舍）

**2. Placeholder scan：** 无 TBD/TODO；CSS task（4/5）的"测试"诚实标注为 typecheck + 手动视觉（引擎 CSS 无单测范式）；fit-aware 有 geometry + model 双层单测；Task 3 的 TDD 顺序（先 export）已显式说明避免 ESM 加载陷阱。

**3. Type consistency：** fit-aware——`worldBoundsForPoints(points, { aspectRatio? })` 在 geometry 定义、model 调用、geometry 测试三处一致；`BuildRenderableGraphOptions.viewportSize` 在 model 定义、render-pipeline 传入两处一致。`sigmaGlobalNodeColor(node, communityColorById, theme)` 与 `sigmaGlobalNodeAttributes(..., theme)` 定义/调用点一致；`RenderableNode.communityColor: string` 在接口、构造、测试、nodes 下发四处一致；`--node-community-color` 全文一致。

**4. 风险点（已在对应 step 标注）：**
- Task 1：`render-pipeline.ts:440` 若也是 DOM 重建路径需同传 viewportSize（Step 9 grep 提示）；`initialGraph` 不传 viewportSize（首屏 focus 非 community，fallback 紧制 = 现状）；sigma-global 路由不调 buildRenderableGraph，不受影响。
- Task 3：必须先 export 再写测试（ESM 命名导出加载限制）；当前文件未 import getThemeTokens，Step 1 显式补。
- Task 4：mo-ye 社区态由浅纸→深底是 spec 意图（对齐全局），需手动确认 dot/label/边可读性。
- Task 5：mo-ye 下 night/amber 百分比可能需视觉微调（polish，不阻塞）；conflict 边有意不 token 化（ADR-23 待整体演进）。
- Task 6：topic 保持朱砂会在切换时从社区色跳到朱砂（spec §4.2① 已知权衡，非 bug）。
- Task 2/3：`GraphRendererAdapterNode` mock 字段以 adapter.ts 为准，若 typecheck 报缺字段按实补。

# 社区视觉对齐 Phase 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 消除全局 Sigma 视图与社区 DOM/SVG 视图切换时的配色/字体/底色/状态色/光晕割裂（spec §4 六项），不含 Phase 2 的镜头过渡。

**Architecture:** 六项独立改动，每项 token/CSS/取值级，无架构变更。引擎层（`packages/graph-engine/src/`）改 token、CSS 字符串常量、节点属性下发、Sigma 设置；用 `node --test` 单测覆盖有逻辑的项（①②⑤⑥），纯 CSS 项（③④）靠 typecheck + 手动视觉 + 视觉回归验证。

**Tech Stack:** TypeScript ESM（graph-engine 子包）、node `--test` + tsx、graphology + sigma.js（Canvas）、DOM/SVG 渲染、CSS 变量（scoped 到 graph root inline style）。

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
| `packages/graph-engine/src/themes/tokens.ts` | 主题 token 定义 | Task 1：两 ROOT 加 `--crimson` |
| `packages/graph-engine/src/render/render-styles.ts` | STATIC_RENDERER_CSS 常量 | Task 1（conflict 全局边）、Task 4（社区背景）、Task 5（社区边）、Task 6（dot-core 光晕/底色） |
| `packages/graph-engine/src/render/sigma-graphology-model.ts` | Sigma 节点属性/颜色 | Task 2：`sigmaGlobalNodeColor` 加 theme + token |
| `packages/graph-engine/src/render/sigma-global-renderer.ts` | Sigma 设置 | Task 3：`sigmaSettingsForTheme` 加 `labelFont` + export |
| `packages/graph-engine/src/render/model.ts` | `buildRenderableGraph` | Task 6：`RenderableNode` 加 `communityColor` + 节点构造回填 |
| `packages/graph-engine/src/render/nodes.ts` | `createGraphNodeElement` | Task 6：下发 `--node-community-color` |
| `packages/graph-engine/test/themes.test.ts` | token 单测 | Task 1 加用例 |
| `packages/graph-engine/test/sigma-graphology-model.test.ts` | sigma model 单测 | Task 2 加用例 |
| `packages/graph-engine/test/sigma-global-renderer.test.ts` | sigma renderer 单测 | Task 3 加用例 |
| `packages/graph-engine/test/render-model.test.ts` | buildRenderableGraph 单测 | Task 6 加用例 |

依赖：Task 5（社区 conflict 边 token 化）依赖 Task 1（`--crimson` 已定义）。其余 task 互相独立。建议顺序 1→2→3→4→5→6→7（低风险、token 基础先行）。

---

## Task 1: conflict 关系色 → `--crimson` token〔⑥〕

**Files:**
- Modify: `packages/graph-engine/src/themes/tokens.ts:42`（`SHAN_SHUI_ROOT` 末尾）、`:72`（`MO_YE_ROOT` 末尾）
- Modify: `packages/graph-engine/src/render/render-styles.ts:650-652`
- Test: `packages/graph-engine/test/themes.test.ts`

**Interfaces:**
- Produces: 新 token `--crimson`（两主题均 `#d94693`），随 `applyTheme` 自动下发到 graph root；Task 5 的社区 conflict 边引用它。

- [ ] **Step 1: 写失败测试**

在 `test/themes.test.ts` 的 `describe("theme tokens", ...)` 块内追加：

```ts
it("exposes a --crimson token for conflict edges in both themes", () => {
  assert.equal(getThemeTokens("shan-shui").vars["--crimson"], "#d94693");
  assert.equal(getThemeTokens("mo-ye").vars["--crimson"], "#d94693");
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -w @llm-wiki/graph-engine -- silent 2>&1 | grep -i crimson`
Expected: FAIL（`vars["--crimson"]` 为 `undefined`）。

- [ ] **Step 3: 加 token 定义**

`tokens.ts` `SHAN_SHUI_ROOT`（line 42 `--font-mono: ...;` 之后、闭合反引号之前）加一行：
```ts
  --crimson: #d94693;
```
`MO_YE_ROOT`（line 71 `--font-mono: ...;` 之后）同样加：
```ts
  --crimson: #d94693;
```

- [ ] **Step 4: 改全局 conflict 边引用**

`render-styles.ts:650-652`：
```css
.edge.relation-conflict {
  stroke: color-mix(in srgb, var(--crimson) 78%, transparent);
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | tail -5`
Expected: PASS（含新用例）。

- [ ] **Step 6: typecheck**

Run: `npm run typecheck -w @llm-wiki/graph-engine`
Expected: 无错误。

- [ ] **Step 7: commit**

```bash
git add packages/graph-engine/src/themes/tokens.ts packages/graph-engine/src/render/render-styles.ts packages/graph-engine/test/themes.test.ts
git commit -m "feat(graph-engine): add --crimson token for conflict edges"
```

---

## Task 2: Sigma 状态色硬编码 → 引擎 token〔②〕

**Files:**
- Modify: `packages/graph-engine/src/render/sigma-graphology-model.ts:164-171`（`sigmaGlobalNodeAttributes`）、`:355-360`（`sigmaGlobalNodeColor`）、`:95`、`:147`（两处调用点）
- Test: `packages/graph-engine/test/sigma-graphology-model.test.ts`

**Interfaces:**
- Consumes: `getThemeTokens(theme).vars["--cinnabar"|"--amber"|"--night"|"--muted"]`（已存在，`tokens.ts:104`）。
- Produces: `sigmaGlobalNodeColor(node, communityColorById, theme)` 新签名（第三参 `theme: ThemeId`）；`sigmaGlobalNodeAttributes(node, communityColorById, selectedCommunityIds, theme)` 新增第四参。调用链 theme 上游已可用（`buildSigmaGlobalGraphologyGraph`/`patchSigmaGlobalGraphAttributes` 均有 `theme` 参数）。

- [ ] **Step 1: 写失败测试**

在 `test/sigma-graphology-model.test.ts` 追加（顶部若无 `getThemeTokens` import 则补）：

```ts
import { sigmaGlobalNodeColor } from "../src/render/sigma-graphology-model";
import { getThemeTokens } from "../src/themes";
import type { GraphRendererAdapterNode } from "../src/render/adapter";

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

> 注：`GraphRendererAdapterNode` 的确切字段以 `src/render/adapter.ts:59-78` 为准；上面的 mock 只覆盖 `sigmaGlobalNodeColor` 读到的字段，用 `as unknown as` 绕过完整类型。若 typecheck 报缺字段，按 adapter.ts 补齐。

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

确保文件顶部已 import `{ getThemeTokens } from "../themes"` 和 `type { ThemeId } from "../../types"`（若已有 `ThemeId` 则不重复；参考 line 85 `theme: ThemeId` 已用，应已 import）。

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
Expected: 无错误。若报 `sigmaGlobalNodeAttributes` 别处调用缺参，grep `sigmaGlobalNodeAttributes(` 补 theme：`grep -rn "sigmaGlobalNodeAttributes(" packages/graph-engine/src`。

- [ ] **Step 8: commit**

```bash
git add packages/graph-engine/src/render/sigma-graphology-model.ts packages/graph-engine/test/sigma-graphology-model.test.ts
git commit -m "feat(graph-engine): map sigma state colors to theme tokens"
```

---

## Task 3: Sigma 标签字体 → 对齐 DOM 主体 sans〔⑤〕

**Files:**
- Modify: `packages/graph-engine/src/render/sigma-global-renderer.ts:766-779`（`sigmaSettingsForTheme`，加 `export` + `labelFont`）
- Test: `packages/graph-engine/test/sigma-global-renderer.test.ts`

**Interfaces:**
- Produces: `export function sigmaSettingsForTheme(theme)` 返回含 `labelFont`（取自 `--font-ui` 字符串）。Sigma canvas label 不吃 CSS var，故传字符串值。

- [ ] **Step 1: 写失败测试**

在 `test/sigma-global-renderer.test.ts` 追加（顶部补 import）：

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

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | grep -A3 "label font"`
Expected: FAIL（`sigmaSettingsForTheme` 未 export 或 `labelFont` 为 undefined）。

- [ ] **Step 3: 加 `labelFont` 并 export**

`sigma-global-renderer.ts:766-779`，把 `function sigmaSettingsForTheme` 改为 `export function sigmaSettingsForTheme`，返回对象加 `labelFont`：

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

确保文件顶部已 import `{ getThemeTokens } from "../themes"`（若无则加）。

- [ ] **Step 4: 跑测试确认通过**

Run: `npm run test -w @llm-wiki/graph-engine 2>&1 | tail -5`
Expected: PASS。

- [ ] **Step 5: typecheck**

Run: `npm run typecheck -w @llm-wiki/graph-engine`
Expected: 无错误。

- [ ] **Step 6: commit**

```bash
git add packages/graph-engine/src/render/sigma-global-renderer.ts packages/graph-engine/test/sigma-global-renderer.test.ts
git commit -m "feat(graph-engine): set sigma labelFont to --font-ui to match DOM"
```

---

## Task 4: 社区方格纸底 → 全局同源釉面〔③〕

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

> 说明：`--paper-glow`（radial 高光）+ `--bg`（底色）= 全局 Sigma 视图同源底，由 `applyTheme` 下发到 graph root。mo-ye 主题下社区态随之深色化，与全局一致（这正是消除割裂的意图；社区内 dot/label/边样式本就适配深色主题）。

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

## Task 5: 社区边 0.32→0.5 + token 化〔④〕（依赖 Task 1）

**Files:**
- Modify: `packages/graph-engine/src/render/render-styles.ts:1109-1128`

> 纯 CSS。验证同 Task 4。

- [ ] **Step 1: 改社区态边 opacity**

`render-styles.ts:1109-1112`，把 `.edge { ... opacity: .32 !important; ... }` 的 `opacity: .32` 改为 `0.5`：

```css
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .edge {
  stroke-width: max(1.1px, min(1.65px, var(--edge-map-width, 1.45px))) !important;
  opacity: .5 !important;
  transition: opacity .18s ease, stroke-width .18s ease, stroke .18s ease;
}
```

- [ ] **Step 2: 关系类型 rgba → color-mix token**

`render-styles.ts:1114-1128` 替换为（X 值匹配原 rgba 的视觉权重）：

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
.llm-wiki-graph-engine[data-community-map-state="lightweight"] .edge.relation-conflict {
  stroke: color-mix(in srgb, var(--crimson) 42%, transparent);
}
```

（`--crimson` 由 Task 1 提供。）

- [ ] **Step 3: typecheck**

Run: `npm run typecheck -w @llm-wiki/graph-engine`
Expected: 无错误。

- [ ] **Step 4: 手动视觉确认**

`npm run dev` → 进入社区。确认：
- 社区内边**整体更清晰**（0.32→0.5）。
- 各关系类型颜色与全局边**同源 token**（night/amber/crimson），无突兀的独立灰青。
- mo-ye 主题下边仍可读（深底 + night/amber，若 conflict/crimson 过亮可后续微调百分比，记入后续 polish）。

- [ ] **Step 5: commit**

```bash
git add packages/graph-engine/src/render/render-styles.ts
git commit -m "feat(graph-engine): raise community edge opacity to .5 and tokenize relation colors"
```

---

## Task 6: 社区 DOM 节点 社区色底 + 光晕仅 hover/选中〔①〕（核心）

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

然后在节点构造（`model.ts:515-563` 的 return 对象内，建议紧跟 `community: node.community,` 之后）加字段：

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

> 说明：原 source/synthesis/comparison/query 的 `background: var(--jade/--amber/--violet)` 类型实色底被移除（统一改社区色底）；类型色降级为 `:hover` 光晕语义。topic 保持 `--cinnabar`（设计稿"近景强调核心"，见 spec §4.2 ① 已知权衡）。

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

- [ ] **Step 4: 手动视觉验收清单（对照 spec §4.1 四类割裂）**

`npm run dev`，真实数据下从全局进入社区，逐项确认：
- [ ] 配色维度跳变消除：状态红（Sigma）与社区色（DOM）同源 token，不再 Tailwind 硬编码 vs 引擎 token 两套。
- [ ] 方格纸不再突然出现：社区态底色与全局同源（Task 4）。
- [ ] 状态红换色消除：Sigma selected/searchHit/pinned 用引擎 token（Task 2）。
- [ ] 字体跳变消除：Sigma 标签与 DOM 主体同 sans（Task 3）。
- [ ] conflict 边、社区边、社区节点配色同源（Task 1/5/6）。

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

**1. Spec coverage（spec §4 六项 → task）：**
- ① 社区色底 + 光晕仅 hover/选中 → Task 6 ✓
- ② Sigma 状态色 token → Task 2 ✓
- ③ 社区方格纸底 → 釉面 → Task 4 ✓
- ④ 社区边 0.32→0.5 + token → Task 5 ✓
- ⑤ Sigma 标签字体 sans → Task 3 ✓
- ⑥ conflict 色 token → Task 1 ✓
- spec §4.4 验证（引擎单测 + 视觉回归 + 手动 + typecheck）→ Task 1/2/3/6 单测、Task 7 全量回归 + 手动 ✓
- spec §4.3 不纳入项（标签底框、两套红统一、节点尺寸、布局）→ 计划均未触碰 ✓

**2. Placeholder scan：** 无 TBD/TODO；CSS task（4/5）的"测试"诚实标注为 typecheck + 手动视觉（引擎 CSS 无单测范式）；③ 的 mo-ye 深色化、⑤/④ 的百分比微调风险已在 step 内点明。

**3. Type consistency：** `sigmaGlobalNodeColor(node, communityColorById, theme)` 与 `sigmaGlobalNodeAttributes(..., theme)` 在 Task 2 定义与调用点一致；`RenderableNode.communityColor: string` 在 Task 6 接口、构造、测试、nodes 下发四处一致；`--node-community-color` / `--crimson` token 名全文一致。

**4. 风险点（已在对应 step 标注）：**
- Task 4：mo-ye 社区态由浅纸→深底，是 spec 意图（对齐全局），但需手动确认 dot/label/边可读性。
- Task 5：mo-ye 下 night/amber/crimson 百分比可能需视觉微调（记入 polish，不阻塞）。
- Task 6：topic 保持朱砂会在切换时从社区色跳到朱砂（spec §4.2 ① 已知权衡，非 bug）。
- Task 2/3：`GraphRendererAdapterNode` mock 字段以 adapter.ts 为准，若 typecheck 报缺字段按实补。

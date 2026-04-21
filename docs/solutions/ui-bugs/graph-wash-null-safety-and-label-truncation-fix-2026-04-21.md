---
title: wash 图谱空引用防护与标签截断统一
date: 2026-04-21
category: ui-bugs
module: interactive-graph
problem_type: ui_bug
component: tooling
symptoms:
  - drawerNeighbors 在 DOM 不存在时，querySelector("h4") 抛 TypeError，整页白屏
  - cardDims() 和 truncateLabel() 用不同的宽度常量，截断后文字溢出卡片
  - graph 回归测试只做字符串 grep，不验证点击/折叠/持久化等运行时行为
  - 安装回归测试直接在当前仓库跑，未提交改动会污染测试结果
root_cause: logic_error
resolution_type: code_fix
severity: high
tags: [graph, wash, null-reference, label-truncation, regression-testing, safe-localstorage, grapheme, intl-segmenter]
---

# wash 图谱空引用防护与标签截断统一

## Problem

wash 水彩风格交互图谱在 v3.0 UX 打磨后，暴露出 DOM 可选片段缺少空值保护、卡片宽度与标签截断使用不同宽度规则、回归测试只检查静态字符串三个问题。最严重的一条（空引用）会导致图谱页面完全白屏。

## Symptoms

- 打开图谱页面时浏览器控制台报 `TypeError: Cannot read properties of null (reading 'querySelector')`，页面白屏
- 长标签节点文字溢出卡片右边界，或截断位置与卡片宽度不匹配
- 小地图或相邻节点区的折叠偏好刷新后丢失（`localStorage` 不可用时静默失败）
- `tests/regression.sh` 在有未提交改动的仓库里跑安装测试，断言结果不可信

## What Didn't Work

- **直接链式调用 DOM**：`drawerNeighbors.querySelector("h4")` 在 `drawerNeighbors` 为 null 时直接炸，没有先判空（session history：vis-network 时代也出现过类似 DOM 假设失败）

- **宽度规则分散**：`cardDims()` 内联 `if (/[一-鿿]/.test(ch)) w += 15; else w += 8.5`，`truncateLabel()` 内联 `const charWidth = g => /[一-鿿]/.test(g) ? 15 : 8.5`，正则范围和常量值各自独立，会漂移

- **纯字符串 grep 测试**：早期回归只检查 HTML 是否包含 `aria-expanded="true"`，不验证点击后属性是否真的变成 `"false"`，也不验证 `localStorage` 持久化

- **在仓库根目录跑安装测试**：`tests/regression.sh` 的 `test_upgrade_refreshes_claude_companion_skill` 等用例直接 `bash "$REPO_ROOT/install.sh"`，如果工作区有未提交改动，install.sh 读到的文件和远端 main 分支不一致

- **Edit 工具替换 cardDims 失败**：因为文件内 `一` 转义在 JSON 参数中变成实际汉字，导致多次 "String to replace not found"。最终用 `python3` 脚本做正则替换解决

## Solution

### 1. DOM 可选片段判空保护

```javascript
// graph-wash.js:14-15
const drawerNeighbors = document.getElementById("dr-neighbors");
const drawerNeighborsHeading = drawerNeighbors ? drawerNeighbors.querySelector("h4") : null;
```

所有后续访问 `drawerNeighborsHeading` 的地方（`applyNeighborsCollapsed`、`toggleNeighbors`、事件绑定）都加了 `if (!drawerNeighborsHeading) return` 或 `if (drawerNeighborsHeading) { ... }` 包裹。

同样处理了 `minimapEl` / `minimapToggle`：`renderMinimap()` 和 `applyMinimapCollapsed()` 都加了前置判空。

### 2. 统一宽度常量和 helper

```javascript
// graph-wash.js:185-213
const LABEL_CJK_WIDTH = 15;
const LABEL_LATIN_WIDTH = 8.5;
const LABEL_PADDING = 22;
const LABEL_MIN_WIDTH = 72;
const LABEL_MAX_WIDTH = 180;
const LABEL_ELLIPSIS = "…";
const LABEL_ELLIPSIS_WIDTH = 8;

function splitLabelGraphemes(label) {
  return Array.from(labelSegmenter.segment(label), ({ segment }) => segment);
}
function labelCharWidth(grapheme) {
  return /[一-鿿]/.test(grapheme) ? LABEL_CJK_WIDTH : LABEL_LATIN_WIDTH;
}
function measureLabelWidth(graphemes) {
  let width = 0;
  for (const grapheme of graphemes) width += labelCharWidth(grapheme);
  return width;
}
```

`cardDims()` 和 `truncateLabel()` 都引用 `LABEL_*` 常量和 `measureLabelWidth()` / `splitLabelGraphemes()`，消除规则漂移。

### 3. cardDims() 切到新 helper

```javascript
// graph-wash.js:175-183
function cardDims(n) {
  const label = n.label || n.id;
  const widthByLabel = measureLabelWidth(splitLabelGraphemes(label));
  let width = Math.max(LABEL_MIN_WIDTH, Math.min(LABEL_MAX_WIDTH, widthByLabel + LABEL_PADDING));
  let height = 36;
  if (n.type === "topic") { height = 40; width += 6; }
  if (n.type === "source") { height = 32; }
  return { w: width, h: height };
}
```

### 4. 回归测试升级为 Node 运行时断言

三个回归脚本（`long-label`、`minimap`、`drawer-neighbors`）从纯 `assert_file_contains` 升级为两段式：

1. **静态 hook 检查**：grep 确认 HTML 包含正确的 `id`、`aria-*`、`data-collapsed` 属性
2. **运行时行为验证**：用 `node - <<'NODE' file.js` + `vm.createContext()` 提取函数，用 fake DOM element 模拟 `setAttribute` / `getAttribute`，验证：
   - null guard 不抛错
   - 状态切换（collapsed/expanded）正确更新 `data-collapsed` 和 `aria-expanded`
   - `safeLocalStorage.set()` 被正确调用并传入期望的 key/value
   - `truncateLabel()` 对空串、短标签、长标签、复杂 emoji（ZWJ 连接）行为正确
   - `cardDims()` 遵守 min/max 边界

### 5. 安装测试隔离

```bash
# tests/regression.sh:95-100
make_repo_copy_without_git() {
    local dest="$1"
    cp -R "$REPO_ROOT" "$dest"
    rm -rf "$dest/.git"
}
```

升级相关测试改为 `bash "$repo_copy/install.sh"`，不再直接用 `$REPO_ROOT`。

## Why This Works

1. **空引用根因**：`document.getElementById()` 在元素不存在时返回 null。对 null 调用 `.querySelector()` 抛 TypeError。三元运算符在赋值时就处理了 null 情况，后续代码只需检查变量是否为 null。

2. **宽度漂移根因**：`cardDims()` 和 `truncateLabel()` 各自内联宽度规则，正则范围和魔法数字独立维护。统一到共享常量和 helper 后，改一处自动同步。

3. **测试脆弱根因**：字符串 grep 只能验证"代码片段存在"，不能验证"行为正确"。Node `vm` 模块可以在没有浏览器的情况下执行提取出的纯函数，用 fake element 验证状态变更。

4. **测试隔离根因**：`.git` 目录的存在会影响 install.sh 的路径判断。复制到临时目录并删除 `.git` 后，install.sh 的行为和用户从 GitHub clone 后一致。

## Prevention

- **DOM 可选片段模式**：用 `getElementById()` 获取的元素，后续 `.querySelector()` 调用前必须判空。可以用三元运算符 `el ? el.querySelector(...) : null` 或可选链 `el?.querySelector(...)`

- **共享常量**：涉及尺寸/宽度计算的魔法数字统一声明为模块级常量，所有相关函数引用同一套常量

- **测试分层**：字符串断言用于检查静态内容（HTML 结构、CSS 规则），运行时测试用 Node `vm` 模块或模拟 DOM 验证交互逻辑。两者互补，不替代

- **安装测试隔离**：构建/安装类测试在临时目录的仓库副本中执行，用 `rm -rf "$dest/.git"` 去掉版本控制信息

- **grapheme 安全截断**：涉及用户可见文本截断时，用 `Intl.Segmenter` 按 grapheme cluster 而非 code point 遍历，避免把 ZWJ emoji（如 `👨‍👩‍👧‍👦`）截成半个表情

- **回归断言精度**：检查 emoji 截断时，不要用 `text.includes('\ud83d')` 这类检查（合法 emoji 也包含这些 surrogate），应改用孤立 surrogate 检测：`/\uD800(?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text)`

## Related Issues

- PR: https://github.com/sdyckjq-lab/llm-wiki-skill/pull/21
- 前置决策: [从三风格简化为 wash-only 单风格](../developer-experience/graph-style-simplification-to-wash-only-2026-04-20.md)
- 设计文档: `docs/plans/2026-04-21-graph-ux-fixes-design.md`

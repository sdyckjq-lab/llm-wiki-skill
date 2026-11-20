# Sigma 相机动画期间 overlay 性能优化设计

日期：2026-06-30
状态：已按用户确认的方案成稿
关联 issue：#75
前置地基：#79 / PR #85 Sigma 全局路线子系统边界

## 背景

阶段 4.8 已经让全局 Sigma 点社区进入社区高亮态，并通过 Sigma camera animation 做轻量构图移动。功能已经可用，但实测动画不够丝滑。

当前热路径是：

```text
camera.animate()
→ Sigma 每帧渲染
→ afterRender
→ overlayDomController.reposition()
→ 每个社区都重新投影云团 hull
→ applySigmaCloudGeometry 重写 SVG polygon / ellipse
```

这套机制来自 #63.2：当时已经把“每帧重建 DOM”降成“每帧只 reposition”，解决了元素销毁、重建和重绑监听的问题。但为了保证拖拽节点时云团跟手，`reposition()` 仍然会每帧重算社区云团屏幕几何。spotlight 的程序化相机动画第一次把这部分成本集中暴露出来。

本次 #75 不应只修“点社区”这一处。用户确认采用“打地基”的设计：所有 Sigma 相机动画期间的 overlay 都走统一的轻量更新策略，动画结束后再精确校准。

## 调研结论

已核实当前代码事实：

- `sigma-global-renderer.ts` 负责 Sigma lifecycle、事件绑定、update/destroy/reset/zoom 调度。
- `sigma-global-camera.ts` 负责相机状态、spotlight 目标、reduced motion 和动画触发。
- `sigma-overlay-dom.ts` 负责社区云团、社区标签、节点 hit target 的 `rebuild()` 和 `reposition()`。
- `community-cloud-geometry.ts` 负责云团 hull、fallback ellipse、polygon local points 和签名。
- `sigma-overlay-dom.test.ts` 已证明普通 `reposition()` 不创建元素、不 replace children、不重绑监听。
- `sigma-global-renderer.test.ts` 已覆盖 spotlight camera animate、button zoom animate、drag、resize、update 等组合路径。
- `tests/browser/graph-sigma-global-production.ts` 已有生产路径性能脚本，但只测 wheel / drag 的帧率和 p95，不单独测 spotlight 动画期间帧质量。

还核实了一个 issue 描述中的假设需要修正：Sigma 3.0.3 的 `Camera#setState()` 不会取消已经排队的 `animate()`；源码和小复现都显示，`setState()` 会插入一次状态变化，动画仍会继续跑到原目标。真正需要防的是动画期间 overlay 基线变旧、数据更新后快路径误用旧几何，以及同社区 update 后没有进行必要的精确校准。

## 目标

- 为 Sigma 相机动画建立统一 overlay 更新规则：动画中轻量跟随，稳定后精确重排。
- 覆盖 spotlight 相机动画、缩放按钮动画，以及未来新增的相机动画。
- 降低动画帧内的社区云团几何重算成本。
- 保留动画结束后的最终精确性。
- 保持选择、抽屉、进入社区、回全图语义不变。
- 增加真实浏览器性能记录，专门衡量 spotlight animation 的 fps 和 p95 frame time。

## 非目标

- 不改变 Sigma / Graphology 作为全局路线的选择。
- 不改变点社区的产品语义：仍然停留全局高亮，不进入社区阅读视图。
- 不改变抽屉归属，抽屉仍由 facade / web 层负责。
- 不处理 #70 Sigma 节点标签截断。
- 不启动 #80 长期架构整理。
- 不提高当前 2000 节点全局路线保护上限。
- 不新增 npm 依赖。
- 不把社区阅读视图迁移到 Sigma。

## 设计原则

1. **动画中可近似，稳定后必须精确。**
   动画期间优先流畅和跟随感；动画结束后立刻回到精确几何。

2. **快路径只服务相机动画。**
   拖拽节点、数据更新、筛选、搜索、Pin、rebuild 后的校准都必须走精确路径。

3. **沿用 #79 边界。**
   相机模块只管“去哪儿”，overlay 模块只管“怎么低成本跟上”，主入口只做调度。

4. **性能问题必须可测。**
   不能只凭体感。需要单元测试保护调用纪律，并用浏览器脚本产出可比较记录。

## 架构分工

### `sigma-global-renderer.ts`

负责：

- 在 Sigma render 事件中读取当前相机是否处在动画中。
- 根据当前状态调用 overlay controller 的精确路径或动画快路径。
- 在 rebuild、update、drag、destroy 边界上重置 overlay 动画基线。
- 捕获异常并继续走既有 `onFatalError`。

不负责：

- 不计算 overlay 轻量变换。
- 不重写云团几何算法。
- 不直接操作 overlay DOM 细节。

### `sigma-global-camera.ts`

负责：

- 继续计算 spotlight 相机目标。
- 继续执行 `camera.animate()` 或 reduced motion 下的 `setState()`。
- 继续提供 read/restore/full graph camera helpers。

不负责：

- 不直接触发 overlay 重建。
- 不知道 overlay 快路径。
- 不决定选中社区。

### `sigma-overlay-dom.ts`

新增 overlay 更新策略的核心职责：

- `rebuild()` 仍是元素生命周期权威，负责创建、删除、复用元素和更新 dataset / text / color / listeners。
- 精确重排路径负责完整投影社区云团、节点 hit target、社区标签。
- 动画快路径负责在相机动画帧中轻量更新 overlay。
- 快路径必须覆盖同一批 overlay 元素：社区区域、节点 hit target、社区标签不能出现视觉层和可点击层分离。
- 快路径必须能判断自己是否有有效基线；没有基线时回到精确重排。
- 动画结束后的第一帧必须执行精确重排并清掉临时变换。

### `community-cloud-geometry.ts`

保持纯计算职责。若实现需要新增 helper，只能是可单测的几何或变换计算，例如：

- 根据两个相机状态或两个锚点投影推导 overlay transform。
- 判断快路径是否能表达当前相机变化。

不允许它接触 DOM、事件、selection 或 host callback。

## 核心方案

采用“两段式”：

```text
精确基线
→ 相机动画中：overlay 快路径近似跟随
→ 相机稳定后：精确重排校准
```

### 精确基线

以下时机必须产生或刷新精确基线：

- renderer 初始创建后。
- `overlayDomController.rebuild()` 后。
- 数据更新后。
- 搜索、筛选、选中、Pin 等引起 adapterData 变化后。
- 拖拽提交或取消后。
- reduced motion 下直接 setState 后。
- 相机动画结束后的第一帧。

精确基线记录的是当前 overlay 元素已按当前相机状态准确定位。后续动画快路径只能基于这份基线做轻量变换。

### 动画快路径

动画进行中，如果满足安全条件，不再每帧重算所有社区云团 hull / polygon。快路径应使用少量稳定锚点推导 overlay 的整体位移和缩放，让 overlay 作为一层跟随相机。

用户可见效果是：动画期间 overlay 跟着地图顺滑移动；动画结束后立刻回到逐元素精确位置。

实现上不论选择 overlay root / group transform，还是按元素写入轻量 transform，都必须保证社区区域、节点 hit target、社区标签共享同一临时相机变换。动画期间允许短暂近似，但不允许只移动视觉云团、把可点击区域留在旧位置；稳定后再由精确重排恢复逐元素真实几何。

快路径必须避免：

- 遍历每个社区重新调用完整云团投影。
- 每帧重写所有 polygon points。
- 创建、删除或替换 overlay 元素。
- 重绑任何事件监听。
- 只移动视觉元素而不移动对应 hit target。

### 精确校准

当检测到相机不再动画时，下一帧执行精确重排：

- 社区云团重新投影并重写 SVG 几何。
- 节点 hit target 重新定位。
- 社区标签重新定位。
- 清除动画期间使用的临时 transform。
- 更新新的精确基线。

## 快路径禁用条件

以下情况必须走精确路径：

- 当前正在拖拽节点。
- overlay 刚 rebuild，还没有基线。
- adapterData 已更新但尚未精确重排。
- reduced motion，根本没有动画。
- 相机变化无法用当前快路径可靠表达。
- destroy 后的晚到 render 事件。
- resize 后需要重新读取真实容器尺寸。

## 与现有行为的关系

### 点社区 spotlight

保持现有语义：

- 点社区仍选择社区。
- 路由仍停留 `sigma-global`。
- 抽屉仍由 facade / host 层处理。
- 当前社区强调、其他社区弱化。
- 相机轻量构图动画继续使用 `camera.animate()`。

变化只在 overlay 动画期间的更新方式。

### 缩放按钮

缩放按钮当前会触发相机动画。它应复用同一套 overlay 动画快路径，而不是只服务 spotlight。

### Wheel / 触控板

wheel 当前走直接 `setState()`，不排队相机动画，追求连续手感。它不应强行进入动画快路径。必要时仍按现有实时路径精确 reposition。

### 节点拖拽

拖拽节点时节点世界坐标在变，云团必须跟手。拖拽期间禁用动画快路径，继续走精确 reposition。

## 性能测量设计

现有生产脚本新增 action：

```text
spotlight_animation
```

测量流程：

1. 先等待前一个 action 的相机动画结束，再回到干净的全图状态：清除已有社区选择和抽屉状态，并等待 overlay 完成一次稳定精确重排。
2. 找到未选中的可点击社区 region。
3. 在点击前启动 rAF 采样，随后点击社区触发 spotlight。
4. 在约 380ms 动画窗口内采样 animation frames。
5. 记录 fps、frame p95、duration、pass/fail、failure detail。
6. 等动画结束后检查 overlay 仍精确对齐、社区仍被选中、production path 仍存在。

验收门槛沿用现有生产性能标准：

- fps >= 45。
- frame p95 <= 22.3ms。
- 没有 #75 新增失败。

现有 `container_select` 保留为“社区能被选中”的功能记录，不再作为 spotlight 动画性能证据。

## 性能 fixture

默认生产脚本当前只跑 1000 级别三组形状：

- `real-snapshot-proxy`
- `nodes-1000-sparse`
- `nodes-1000-dense`

它们适合基础回归，但 #75 的根因更容易在“社区数多”时暴露。现有 `many-small-communities` 有 5000 节点，会被当前 2000 节点上限拦到 over-limit，不适合作为 #75 的 Sigma 正常路线压力样本。

本次应新增一个不超过全局路线保护上限的形状，例如：

```text
nodes-1000-many-communities
```

建议特征：

- 1000 节点。
- 200 个社区左右。
- 最大社区不超过当前 fallback community size 阈值。
- 边数保守控制，避免把 #75 的 overlay 压力和高边数压力混在一起。
- 能触发大量社区 overlay region，但不会触发 over-limit。

该形状专门服务 #75，不改变产品节点上限。

## 测试方案

### 单元测试

重点测试调用纪律：

- 动画中走快路径，不调用完整云团几何重算。
- 动画结束后一定执行一次精确重排。
- 动画期间社区区域、节点 hit target、社区标签共享同一临时变换。
- `rebuild()` 后快路径基线刷新，不复用旧位置。
- 拖拽时不走快路径。
- reduced motion 下直接精确重排。
- destroy 后晚到 render 事件不更新 overlay。
- 快路径不创建元素、不 replace children、不重绑监听。

适合落点：

- `sigma-overlay-dom.test.ts`：测 overlay controller 自身策略。
- `sigma-global-renderer.test.ts`：测主入口在 camera animated / stable 状态下调用正确路径。
- `community-cloud-geometry.test.ts`：若新增纯几何 helper，测输入输出。

### 浏览器性能测试

目标脚本：

```bash
tests/graph-sigma-global-production.regression-1.sh
```

实现前后都要跑相同目标形状，并保存 artifact：

- `nodes-1000-dense`
- `nodes-1000-many-communities`

若现有脚本存在非 #75 旧失败，必须记录为 baseline concern，不得混入 #75 成败判断。已观察到 `nodes-1000-dense/search_highlight` 在当前本机一次基线中为 252ms，高于 200ms 阈值；这不是 #75 的 spotlight 动画问题，但实现后不能让它更差。

## 验收标准

- 动画期间不再每帧重算所有社区云团几何。
- spotlight animation 有浏览器性能记录。
- `spotlight_animation` fps >= 45。
- `spotlight_animation` frame p95 <= 22.3ms。
- 动画结束后 overlay 精确对齐。
- 动画期间视觉 overlay 和可点击 hit target 不分离。
- 缩放按钮动画复用同一套规则。
- wheel / 触控板连续缩放不退化。
- 拖拽节点时云团仍跟手。
- 搜索、筛选、Pin、回全图、点空白退出高亮不破。
- 不改变 selection、drawer、route 语义。
- 相关单元测试通过。
- graph-engine 全量测试和类型检查通过。
- 生产浏览器性能 artifact 已生成并记录路径。

## 实施切片建议

1. **补测量入口**
   - 新增 `spotlight_animation` action。
   - 新增 `nodes-1000-many-communities` fixture。
   - 跑出实现前基线 artifact。

2. **增加 overlay 动画快路径**
   - 在 overlay controller 内部建立精确基线和快路径状态。
   - 暴露清晰方法给主入口调度。

3. **接入主入口调度**
   - render event 中判断 camera animated / stable。
   - 动画中调用快路径。
   - 稳定后调用精确校准。
   - rebuild、drag、resize、destroy 边界清理状态。

4. **补测试**
   - 先单元测试保护调用纪律。
   - 再跑目标浏览器性能脚本。

5. **文档同步**
   - 更新 `workbench/PRODUCT.md`，把 #75 标记为完成或记录性能策略。
   - 根据实际用户可见行为决定是否更新 CHANGELOG/README。

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 快路径使用旧基线 | overlay 动画中错位 | rebuild / update / drag / resize 后强制精确重排并刷新基线 |
| 拖拽误走快路径 | 云团不跟手 | active drag 时禁用快路径 |
| 只修 spotlight | 以后按钮动画或新动画再返工 | 以“所有相机动画”为范围 |
| 只看最终位置 | 动画仍卡顿 | 新增 `spotlight_animation` 浏览器帧记录 |
| 只移动视觉层 | 动画期间点击区域错位 | 社区区域、节点 hit target、标签共享同一临时变换，并在稳定后精确校准 |
| 旧性能脚本已有非 #75 失败 | ship 判断混乱 | baseline concern 单独记录，目标 action 单独判定 |
| 把性能策略塞回主入口 | 破坏 #79 边界 | overlay 策略归 `sigma-overlay-dom.ts`，主入口只调度 |

## 最小验证命令

设计对应实现完成后至少运行：

```bash
node --import tsx --test \
  packages/graph-engine/test/sigma-overlay-dom.test.ts \
  packages/graph-engine/test/sigma-global-renderer.test.ts \
  packages/graph-engine/test/sigma-global-camera.test.ts \
  packages/graph-engine/test/community-cloud-geometry.test.ts
```

```bash
npm run test -w @llm-wiki/graph-engine
npm run typecheck
```

目标浏览器性能：

```bash
GRAPH_SIGMA_PRODUCTION_SHAPES=nodes-1000-dense,nodes-1000-many-communities \
GRAPH_SIGMA_PRODUCTION_ARTIFACT_DIR=/tmp/llm-wiki-issue-75-after \
bash tests/graph-sigma-global-production.regression-1.sh
```

推送前基础检查：

```bash
bash install.sh --dry-run --platform codex
grep -r '本机用户路径\|真实姓名\|私有素材路径' scripts/ templates/ tests/ SKILL.md
git diff --check
```

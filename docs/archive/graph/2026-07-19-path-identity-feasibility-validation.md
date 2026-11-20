# 路径身份与歧义 wikilink · 可行性验证记录

- 日期：2026-07-19
- 分支：`feat/graph-id-collision-governance`
- 对应设计：[图谱身份、重复 ID 与歧义 wikilink 治理](../superpowers/specs/2026-07-19-graph-id-collision-governance-design.md)
- 可复跑程序：[path-identity-feasibility.mts](validation/path-identity-feasibility.mts)
- 正式引擎测试：[path-identity-compatibility.test.ts](../../packages/graph-engine/test/path-identity-compatibility.test.ts)
- 结论：**D1 / D3 的核心方向验证通过，可以定稿设计；D12 的完整 Unicode 算法与三平台一致性尚未通过生产门，不能写成已完成**

## 1. 验证要回答的问题

本次不是验证“功能已经完成”，而是验证第四方案的关键前提和全量审查后的边界是否自洽：

1. 相对路径能否作为图谱节点 ID，且不破坏共享引擎、Graphology 和固定位置。
2. 图谱、lint、改名能否使用不同文件范围，避免未知目录进入图谱或 `raw/` 被改写。
3. 裸链接唯一时解析、全库重名时拒绝猜测，路径链接精确解析的规则能否落地。
4. 待创建、真正断链、同页锚点、自链接、附件和非图谱 Markdown 能否避免互相误报。
5. 解析结果能否提供可安全改写的原文件摘要和精确 UTF-8 字节区间。
6. 路径 ID 切换时，节点、边、社区和固定位置能否避免被误报为知识结构变化。
7. 检查流程能否保持只读，且一次建索引后按页面与链接总量线性处理。
8. 大小写、Unicode 与可移植文件名规则中，哪些已验证，哪些必须留到生产三平台测试。

## 2. 代表性输入

可复跑程序每次在系统临时目录创建相同输入，结束后删除，不依赖本机私人知识库：

### 2.1 正式图谱页面（8 个）

| 页面 | 用途 |
|---|---|
| `wiki/entities/foo.md` | 第一个正式同名页面 |
| `wiki/topics/foo.md` | 第二个正式同名页面，也是明确路径链接目标 |
| `wiki/sources/foo.md` | 第三个正式同名页面 |
| `wiki/entities/unique.md` | 裸名唯一目标 |
| `wiki/entities/foo-2.md` | 验证建议名需要继续避让 |
| `wiki/sources/links.md` | 放置全部链接样本 |
| `wiki/topics/中文/页面.md` | 中文路径 |
| `wiki/sources/with space/Page Name.md` | 空格与大小写路径 |

### 2.2 不应成为图谱节点的输入

| 页面或文件 | 预期边界 |
|---|---|
| `wiki/notes/side.md` | 可被 lint 与改名扫描；不是图谱节点 |
| `raw/notes/foo.md` | 参与裸名是否唯一的目标判断；改名时只读，不改写 |
| `index.md` / `log.md` / `purpose.md` | 可编辑根 Markdown；其中 `index.md` 参与 lint |
| `.wiki-schema.md` | 配置模板，只读，不改写 |
| `raw/assets/Figure.png` | 有效附件目标，不是 Markdown 页面 |

`links.md` 包含：

````md
[[unique]]
[[foo]]
[[wiki/topics/foo.md]]
[[wiki/topics/foo|别名]]
[[wiki/topics/foo#标题]]
[[wiki/topics/foo#^block|别名]]
[待创建: [[future]]]
[[missing]]
[[#本页]]
[[wiki/sources/links.md#本页]]
![[raw/assets/Figure.png]]
[[wiki/notes/side.md]]

`[[foo]]`
```md
[[foo]]
```
````

最后两处是代码示例，不应成为真实链接。程序在解析前后比较全部 Markdown 的 SHA-256，确认方向验证没有写入。

## 3. 执行方式与实际结果

### 3.1 可复跑方向程序

执行：

```bash
node --import tsx docs/graph/validation/path-identity-feasibility.mts
```

2026-07-19 本次实际输出：

```json
{
  "fixture": {
    "graphPages": 8,
    "nonGraphMarkdownPages": 6,
    "realLinks": 12,
    "ignoredCodeExamples": 2,
    "ambiguousCandidates": 4
  },
  "discovery": {
    "graphSources": 8,
    "lintSources": 10,
    "editableRenameSources": 12,
    "readOnlyRenameSources": 2
  },
  "parsing": {
    "uniqueResolved": 1,
    "ambiguousNotLinked": 1,
    "pathVariantsResolved": 4,
    "pendingSeparatedFromBroken": 1,
    "brokenLinks": 1,
    "samePageLinksIgnoredAsEdges": 2,
    "attachmentsIgnoredAsPageLinks": 1,
    "nonGraphMarkdownResolvedWithoutEdge": 1,
    "preciseLocationsRoundTrip": true,
    "candidateSets": 1,
    "suggestedBasename": "foo-3",
    "markdownWrites": 0
  },
  "performance": {
    "nodes": 5000,
    "links": 20000,
    "durationMs": 4.5,
    "resolved": 20000
  },
  "engine": {
    "nodes": 8,
    "edges": 2,
    "modelNodes": 8,
    "modelEdges": 2
  },
  "migration": {
    "beforeAlignment": {
      "nodes": { "added": 4, "removed": 4 },
      "edges": { "added": 2, "removed": 2 },
      "communityJaccard": 0
    },
    "afterAlignment": {
      "nodes": { "added": 0, "removed": 0 },
      "edges": { "added": 0, "removed": 0 },
      "communityJaccard": 1,
      "pinPreserved": true
    }
  },
  "portability": {
    "representativeCaseFoldCollisionDetected": true,
    "unicodeCanonicalCollisionDetected": true,
    "portableFilenamePolicyExamplesPassed": true,
    "unicode17DefaultCaseFoldingProductionVerified": false,
    "macosWindowsLinuxProductionMatrixPassed": false
  }
}
```

程序是入库的方向证明，不是生产解析器。它故意把下面两项输出为 `false`，防止把代表性 JavaScript 小写/NFC 样本误写成 Unicode 17.0 完整 Default Case Folding 或三平台测试已经完成。

性能数字只用来排除“必须为每个冲突反复扫描全库”的方案缺陷。它不包含真实文件读取、完整 Markdown 语法树、警告侧车序列化和离线详情截断，因此不是生产性能基线。

### 3.2 正式共享引擎与 Graphology 测试

执行：

```bash
node --import tsx --test packages/graph-engine/test/path-identity-compatibility.test.ts
```

结果：1 项通过，0 失败。该测试直接使用生产的投影、Atlas、渲染适配和 Graphology 路径，确认：

- 四个节点的 `id` 与 `source_path` 都可使用 `wiki/.../*.md`；
- 两条边的端点保留路径 ID；
- Graphology 不会把斜杠当 URL 或层级分隔；
- 固定位置继续以路径 key 命中并应用坐标。

### 3.3 当前分支回归检查

执行：

```bash
npm run test -w @llm-wiki/graph-engine
node --import tsx --test workbench/server/src/graph.test.ts workbench/server/src/graph-routes.test.ts
node --test-concurrency=1 --import tsx --import ./workbench/web/test/setup-dom.ts --test workbench/web/test/graph-panel-paper.test.tsx
```

结果：

- 共享图谱引擎：798 项通过，0 失败；其中新增 1 项正式路径身份测试。
- 工作台图谱读取、路由与布局：15 项通过，0 失败。
- `GraphPanel`：14 项通过，0 失败。

这些测试证明当前宿主契约没有把节点 ID 限定为 basename；它们不代表新的文件发现器、解析器、警告界面、严格检查或改名事务已经实现。

### 3.4 工作台与离线 HTML 证据边界

工作台路径读取与固定位置已有可复跑测试；正式路径 ID 的共享引擎到 Graphology 路径由第 3.2 节覆盖。工作台警告状态 `ready + warnings`、详情分页和恢复界面尚未实现，留在生产验收。

旧验证曾在真实浏览器中人工打开路径 ID 离线 HTML，但截图和临时产物没有入库。该观察现在只保留为辅助记录，不再标记为可复跑通过，也不支撑跳过设计第 9.2 节的离线浏览器验收。现有离线宿主回归仍证明一般的单文件 HTML 路线可运行；路径 ID、警告侧车合并和 2 MiB 截断必须在生产实现后用正式 fixture 重测。

### 3.5 大小写与 Unicode 的证据边界

旧验证在当前默认 macOS 文件系统上实际观察到：同目录 `foo.md` / `Foo.md` 以及 NFC / NFD 两种 `café.md` 不能可靠共存，跨目录大小写差异可以共存。这个环境观察只证明“不能依赖宿主文件系统行为”。

可复跑程序覆盖代表性 ASCII 大小写、NFC/NFD、Windows 保留名、非法字符和末尾点/空格；它不实现完整 Unicode 17.0 case-fold。生产实现必须使用固定 Unicode 17.0 C/F 映射表，并在 macOS、Windows、Linux 运行同一组自动化测试后，D12 才能从“方向已验证”升级为“生产通过”。

## 4. 逐项结论

| 验证项 | 结果 | 证据与限制 |
|---|---|---|
| 三个正式同名页面独立存在 | 通过 | 以不同路径 ID 进入原型与共享引擎 |
| 文件发现边界 | 方向通过 | 正式页、未知目录、root、raw、schema 分类断言通过；生产发现器待实现 |
| 裸唯一链接 | 通过 | `[[unique]]` 唯一解析 |
| 裸歧义链接 | 通过 | `[[foo]]` 不建边，返回 4 个全库 Markdown 候选 |
| 路径、显示别名和跨页锚点 | 通过 | 4 种写法都解析到 `wiki/topics/foo.md` |
| 待创建与真正断链 | 通过 | 分别得到 warning 与 error 类别 |
| 同页、自链接、附件、非图谱页 | 通过 | 均不制造错误图谱边或页面断链误报 |
| 代码示例排除 | 通过 | 围栏与行内代码共 2 处均被忽略 |
| 精确改写位置 | 方向通过 | 12 个 UTF-8 区间逐字节还原；生产 Markdown 解析器待实现 |
| 建议名避让 | 通过 | 已有 `foo-2.md` 时建议 `foo-3` |
| 共享引擎与 Graphology | 通过 | 正式自动化测试覆盖路径 ID、边和固定位置 |
| 工作台读取 | 通过 | 现有 15 项 server 与 14 项 GraphPanel 回归通过；新警告 UI 待实现 |
| 离线 HTML 路径 ID | 未作为可复跑通过 | 旧人工观察不再充当验收；生产浏览器 fixture 待实现 |
| 首次身份迁移 | 有条件通过 | 节点、边、社区与 pin 的对齐方法通过；生产 diff 逻辑待实现 |
| 无界面只读检查 | 通过 | 解析前后全部 Markdown SHA-256 一致，写入数为 0 |
| 一次索引性能 | 方向通过 | 5000 页面、20000 链接本次 4.5ms；不是生产基线 |
| 大小写 / Unicode | 部分通过 | 代表性冲突与命名规则可检测；完整 Unicode 17.0 和三平台矩阵未通过 |
| 可复现性 | 通过 | 程序、正式测试、命令、输入、断言和限制均已入库 |

## 5. 验证后写回设计的修正

1. 图谱、lint、改名分别拥有明确的来源、目标、写入和排除集合；`raw/` 只读。
2. 待创建链接不是严格错误；真正断链仍是 error。
3. 图谱构建必须成功交付降级图谱；只有独立 `check --strict` 因数据错误返回非零。
4. 同页锚点和显式自链接不建自边；附件与非图谱 Markdown 不误报页面断链。
5. 安全改写使用文件 SHA-256、UTF-8 精确字节区间和从后向前替换，不用行号字符串替换。
6. 改名使用持久操作记录、原内容备份、同库互斥、启动恢复和外部冲突保全；监听暂停不充当文件锁。
7. 固定位置旧路径 key → 新路径 key 属于同一次改名操作。
8. 首次迁移必须先映射旧节点身份，再映射有向边端点与社区成员。
9. 警告使用摘要、完整侧车和去重候选集合；两份派生数据以 `build_id` + 排除摘要字段自身的规范化详情 SHA-256 防止混读；工作台分页，离线按固定 gzip 口径保证 2 MiB 硬上限。
10. D12 改为“方向已验证”；比较 key 固定 Unicode 17.0 NFC 数据与 C/F 映射，不依赖宿主 ICU，文件名合法性另行校验。
11. 未保留的人工截图不再作为可复跑证据；方向程序与正式引擎测试长期保留。

## 6. 最终结论

第四方案不需要退回 A/B/C 或重做方向选择。相对路径身份、歧义不猜、明确路径解析、只读检查以及节点/边/社区迁移方法都有可复跑证据。

仍不能把 D12、离线路径 ID 浏览器验收、生产解析器、警告通路或改名恢复写成已完成。下一步是审阅修订后的 spec；审阅通过后再写实施计划，并把设计第 9.2 节的每一行作为分阶段完成门。

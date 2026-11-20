# #158 初次完工审查

> GitHub Issue: [#192](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/192)  
> Parent: [#190](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/190)  
> Audit target: [#158](https://github.com/sdyckjq-lab/llm-wiki-skill/issues/158)  
> 唯一基线：[`issue-158-baseline.md`](./issue-158-baseline.md)，合入主线 `86f4173fcaef68169366dc0076320baee6a8a51b`，文件 SHA-256 `b5284f3bdb7e141613e8f4dd88680ec38917265ba404123774f8151699105e0b`  
> 实现审查版本：`504db2d99bef9a8b7eb2b849bb2e3d0dccf55109`

## 1. 给人的结论

工作台前后台通信的大部分地基已经建成：共享规则包、统一成功和失败格式、按领域拆开的后台入口、前台调用层、主要页面和图谱接口、三类事件流以及静态边界检查都已经存在，现有自动测试也覆盖了大量正常和异常情况。

但 #158 现在还不能关闭。原因不是文档没整理好，而是仍有真实缺口：7 个入口仍使用旧规则并留在启动文件；本地访问保护没有覆盖所有声明的边界；跨对话的检索上下文可能被错误消费；产出物编号和前台请求方法还有契约漏洞；完整真实用户流程、真实启动隔离、入口长期一致性、线上检查和主线保护也尚未形成闭环。

初次总判断：**基本完成但仍有阻塞项**。本报告固定 53 条原始要求、34 个实际入口、6 条合并前审查意见和 10 个普通发现。后续修复不得改写本报告，只能在最终报告中引用这些稳定编号记录处理结果。

## 2. 审查边界和判定方法

- 只使用 #191 固定的来源、版本、永久链接和实现版本，不使用后来变化的代码或任务正文反向证明完成。
- 原始承诺是开工前设计、#158 与 #165 至 #176 开工前正文、当时引用的 PRODUCT/ADR 的并集。重复表达合并为一个原子要求，来源覆盖表保证每条验收项都有去向。
- 结论只使用五种：`已落实`、`换一种方式落实`、`部分落实`、`未落实`、`暂时无法验证`。
- 严重程度只使用：`严重`、`高`、`中`、`低`、`无`。`严重`安全证据只公开匿名结论，不给出可利用步骤。
- “阻止关闭”表示 #158 在该行处理前不能关闭；同一根因可以同时关联多条要求和入口。
- 本报告不修问题、不调整旧任务状态、不解决 GitHub 讨论，也不创建修复任务。所有分流留给 #193。

## 3. 固定证据索引

| 编号    | 固定证据                                                                                                                                                                                                                                                                                                                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-BL    | [#191 基线](./issue-158-baseline.md)：来源版本、任务快照、合并结果、GitHub 状态、34 个入口和校验值                                                                                                                                                                                                                                                                                                   |
| E-DES   | [开工前设计 `2a2009d`](https://github.com/sdyckjq-lab/llm-wiki-skill/blob/2a2009df483adcfcc6925a7f237f029d4645bdbb/docs/superpowers/specs/2026-07-10-workbench-http-routing-contracts-design.md)                                                                                                                                                                                                     |
| E-REG   | [`ENDPOINT_REGISTRY`（审查版本）](https://github.com/sdyckjq-lab/llm-wiki-skill/blob/504db2d99bef9a8b7eb2b849bb2e3d0dccf55109/packages/workbench-contracts/src/endpoints.ts)                                                                                                                                                                                                                         |
| E-APP   | [`createApp()`（审查版本）](https://github.com/sdyckjq-lab/llm-wiki-skill/blob/504db2d99bef9a8b7eb2b849bb2e3d0dccf55109/workbench/server/src/app.ts)                                                                                                                                                                                                                                                 |
| E-START | [`index.ts`（审查版本）](https://github.com/sdyckjq-lab/llm-wiki-skill/blob/504db2d99bef9a8b7eb2b849bb2e3d0dccf55109/workbench/server/src/index.ts)                                                                                                                                                                                                                                                  |
| E-WEB   | [前台 API 目录（审查版本）](https://github.com/sdyckjq-lab/llm-wiki-skill/tree/504db2d99bef9a8b7eb2b849bb2e3d0dccf55109/workbench/web/src/lib/api)                                                                                                                                                                                                                                                   |
| E-SEC   | [本地访问保护（审查版本）](https://github.com/sdyckjq-lab/llm-wiki-skill/tree/504db2d99bef9a8b7eb2b849bb2e3d0dccf55109/workbench/server/src/security) 与 [开发代理](https://github.com/sdyckjq-lab/llm-wiki-skill/blob/504db2d99bef9a8b7eb2b849bb2e3d0dccf55109/workbench/web/vite.config.ts)                                                                                                        |
| E-TEST  | [contracts](https://github.com/sdyckjq-lab/llm-wiki-skill/tree/504db2d99bef9a8b7eb2b849bb2e3d0dccf55109/packages/workbench-contracts/test)、[server](https://github.com/sdyckjq-lab/llm-wiki-skill/tree/504db2d99bef9a8b7eb2b849bb2e3d0dccf55109/workbench/server/src) 与 [web](https://github.com/sdyckjq-lab/llm-wiki-skill/tree/504db2d99bef9a8b7eb2b849bb2e3d0dccf55109/workbench/web/test) 测试 |
| E-BOUND | [静态边界检查（审查版本）](https://github.com/sdyckjq-lab/llm-wiki-skill/blob/504db2d99bef9a8b7eb2b849bb2e3d0dccf55109/workbench/scripts/check-workbench-boundaries.mjs)                                                                                                                                                                                                                             |
| E-PR    | #177 至 #188 的固定合并结果与基线第 6、8.3 节列出的审查记录                                                                                                                                                                                                                                                                                                                                          |

## 4. 普通发现

| 编号     | 结论与影响                                                                                                                                                | 证据                     | 严重程度 | 阻止关闭 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------- | -------- |
| FIND-001 | 7 个入口仍使用旧请求和错误格式，并留在启动文件中；最终迁移、统一错误含义和启动/处理分离均未完成。                                                         | E-BL §9、E-START、E-WEB  | 高       | 是       |
| FIND-002 | 本地访问保护没有覆盖所有承诺边界，存在未经授权访问或改变本地工作台状态的风险。公开报告只保留匿名结论；详细证据由固定讨论定位。                            | E-SEC、REV-003、E-BL §10 | 严重     | 是       |
| FIND-003 | 前台统一调用只按地址限制，不能把请求方法和地址作为不可分割的一对约束。                                                                                    | E-WEB、REV-001           | 中       | 是       |
| FIND-004 | 产出物入口接受的编号范围与底层服务不一致，部分无效编号会从稳定的客户端错误变成内部错误。                                                                  | E-APP、REV-004           | 中       | 是       |
| FIND-005 | 检索上下文记录了所属运行和对话，但消费时没有核对所属者，存在跨运行或跨对话使用旧上下文的风险。                                                            | REV-005、E-APP           | 严重     | 是       |
| FIND-006 | 各合并请求有零散手动验证，但固定审查版本没有一套可重复、同版本、覆盖全部主路径的真实前后台浏览器证据。                                                    | E-BL §12、E-PR           | 高       | 是       |
| FIND-007 | #191 的 34 个入口一次性清点一致，但当前仓库没有自动把真实运行入口与官方登记长期逐项比对。                                                                 | E-BL §9、E-BOUND         | 高       | 是       |
| FIND-008 | 原设计要求每条事件流只有一个三选一终态；后来把该规则限定为提问流，并给批量任务和图谱事件改用不同结束方式。两者不能按原文字同时满足，尚无用户批准的取舍。  | E-BL `SRC-CONFLICT-001`  | 高       | 是       |
| FIND-009 | 审查起点没有线上自动检查、必过检查或主线保护，无法证明不合格改动会被长期拦住。                                                                            | E-BL §8.1                | 高       | 是       |
| FIND-010 | #167、#168 缺少正式自动关闭关联；#165 已关闭但仍带可执行标签；#165 至 #176 没有正式父级关系。实现证据仍可定位，因此不阻止产品关闭；后续去向由 #193 分流。 | E-BL §5、§6、§10         | 低       | 否       |

## 5. 原始要求证据矩阵

| 编号    | 原始要求                                                                                              | 来源                        | 适用证据               | 当前结果与证据                                                                       | 初次结论     | 严重程度 | 阻止关闭 | 关联发现                               |
| ------- | ----------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------- | ------------------------------------------------------------------------------------ | ------------ | -------- | -------- | -------------------------------------- |
| REQ-001 | 只重整通信和路由地基，不新增或改变用户功能、界面和交互。                                              | E-DES §结论/不做，#158      | 代码、浏览器           | 没有发现新增用户功能；事件迁移保持原交互目标。                                       | 已落实       | 无       | 否       | -                                      |
| REQ-002 | 普通 JSON 成功与失败使用统一 envelope。                                                               | E-DES §2，#158/#165         | 契约、请求             | 23 个 JSON 入口已统一；7 个旧入口仍返回旧字段。                                      | 部分落实     | 高       | 是       | FIND-001                               |
| REQ-003 | 错误码稳定，公开 details 有类型且脱敏，不泄露路径、凭证、原始请求或内部错误。                         | E-DES §2，#165              | 契约、请求             | 新入口有统一错误和脱敏；旧入口仍直接返回原始错误、标准输出或冲突路径信息。           | 部分落实     | 高       | 是       | FIND-001                               |
| REQ-004 | contracts 是独立 workspace 包，可独立 build/typecheck/test，并只经 package export 使用。              | E-DES §1，#165              | 构建、静态检查         | 包、脚本、exports、测试和边界检查均存在，#191 验证通过。                             | 已落实       | 无       | 否       | -                                      |
| REQ-005 | Zod 只负责工作台 HTTP/SSE；TypeBox 继续负责 pi-agent 工具参数。                                       | E-DES §1，#165              | 代码、静态检查         | 两者职责分开，contracts 禁止业务依赖。                                               | 已落实       | 无       | 否       | -                                      |
| REQ-006 | `createApp()` 只组装全部请求处理；启动、bootstrap、watcher 和端口留在 `index.ts`。                    | E-DES §3/验收，#165         | 代码、入口清单         | 27 个入口已组装；7 个具体 handler 仍在 `index.ts`。                                  | 部分落实     | 高       | 是       | FIND-001                               |
| REQ-007 | 后台 route 按产品领域拆分。                                                                           | E-DES §3/验收               | 代码                   | 已迁移领域已拆分；7 个旧入口仍集中在启动文件。                                       | 部分落实     | 中       | 是       | FIND-001                               |
| REQ-008 | route 测试使用 fake deps 或临时目录，不读写真实知识库和应用数据。                                     | E-DES §3/测试，#165/#171    | 测试                   | 已迁移 route 有依赖替换和大量直接请求测试；旧入口无法通过 `createApp()` 独立验证。   | 部分落实     | 高       | 是       | FIND-001                               |
| REQ-009 | JSON 解析、错误映射和安全检查通过统一接入点覆盖所有入口，route 不能自行绕过。                         | E-DES §3/§9，#165/#166      | 代码、请求             | 中间件挂在 app 前，但旧 route 自己解析并返回错误；安全策略另有缺口。                 | 部分落实     | 严重     | 是       | FIND-001, FIND-002                     |
| REQ-010 | 前台使用底层 client 加领域 API module，UI 不手写协议。                                                | E-DES §4，#158/#165         | 代码、静态检查         | 已迁移入口已拆分；7 个入口仍由 legacy wrapper 手写旧 shape。                         | 部分落实     | 高       | 是       | FIND-001                               |
| REQ-011 | registry 是方法、地址、响应类别和安全类别的单一来源，表达四类入口。                                   | E-DES §7/§9，#167           | 契约、入口清单         | 34 个入口一一登记、四类齐全；部分安全分类不满足整体信任边界。                        | 部分落实     | 严重     | 是       | FIND-002                               |
| REQ-012 | 新 client 只能调用登记为 migrated-json 的方法和地址组合。                                             | #167，E-DES §7              | 类型、测试             | 地址被限制，但调用方仍可覆盖成同地址的错误方法。                                     | 部分落实     | 中       | 是       | FIND-003                               |
| REQ-013 | 迁移结束后不保留旧 parser、fallback、双成功字段或多参数名。                                           | E-DES §7/Phase 5，#167/#176 | 静态检查、代码         | 7 个入口被明确永久留在 legacy 区，而不是阶段内短期桥接。                             | 未落实       | 高       | 是       | FIND-001                               |
| REQ-014 | 文件下载成功返回文件，失败返回统一错误，且不能被普通 JSON client 误用。                               | E-DES §6，#167/#169         | 请求、类型、测试       | 响应例外和 client 隔离已落实；编号校验仍可能返回错误类别。                           | 部分落实     | 中       | 是       | FIND-004                               |
| REQ-015 | 后端默认只绑定 loopback，禁止对局域网开放。                                                           | E-DES §9，#166              | 代码、测试             | host 约束与测试存在。                                                                | 已落实       | 无       | 否       | -                                      |
| REQ-016 | 每次启动生成 capability token；不进 URL、日志、仓库或长期配置。                                       | E-DES §9，#166              | 代码、测试             | token 生成、运行期文件权限和不回显测试存在。                                         | 已落实       | 无       | 否       | -                                      |
| REQ-017 | 会读写本地数据、改配置、触发模型或启动事件流的入口只接受可信工作台来源和正确 token。                  | E-DES §9，#166              | 请求、安全测试         | 保护中间件存在，但开发代理和豁免范围留下真实缺口。                                   | 部分落实     | 严重     | 是       | FIND-002                               |
| REQ-018 | GET 不产生副作用；真正无副作用的公开例外需显式登记。                                                  | E-DES §9，#166              | registry、请求         | GET 都登记为只读；但当前“只读即完全豁免”的范围超出健康检查等明确例外，需要重新确认。 | 部分落实     | 高       | 是       | FIND-002                               |
| REQ-019 | health/status 证明 schema → route → client → test 的完整竖线。                                        | #165                        | 契约、请求、前台测试   | health 竖线完整。                                                                    | 已落实       | 无       | 否       | -                                      |
| REQ-020 | config、models、auth status 使用统一契约和领域 API，覆盖代表性失败。                                  | #168，E-DES Phase 2         | 契约、请求、前台测试   | 四个目标入口已迁移并有测试；认证写入和测试连接不在该票范围但仍影响总迁移。           | 已落实       | 无       | 否       | -                                      |
| REQ-021 | 知识库列表、选择、清除、注册、移除、检查、初始化和创建使用统一规则。                                  | E-DES Phase 3，#171         | 契约、请求、前台       | 前六类已迁移；初始化和创建仍是旧入口。                                               | 部分落实     | 高       | 是       | FIND-001                               |
| REQ-022 | active context 是单一来源，稳定 NO_ACTIVE_KB/KB_NOT_REGISTERED/FORBIDDEN_PATH，并收敛 `kb`/`kbPath`。 | #171，E-DES Phase 3         | 契约、请求、测试       | 共享解析器、错误码和输入口径已建立并被页面、图谱、对话复用。                         | 已落实       | 无       | 否       | -                                      |
| REQ-023 | 页面读取和引用接口统一，覆盖 not found、路径越界和 schema 错误。                                      | #169                        | 契约、请求、前台测试   | 两个入口已迁移并有相应测试；访问保护仍有共享缺口。                                   | 部分落实     | 高       | 是       | FIND-002                               |
| REQ-024 | artifact list/manifest 统一；文件下载例外稳定且覆盖失败。                                             | #169，E-DES §6              | 契约、请求、前台测试   | 形态与大部分失败已覆盖；编号规则不一致，访问保护也有共享缺口。                       | 部分落实     | 严重     | 是       | FIND-002, FIND-004                     |
| REQ-025 | 图谱读取和 layout 读写统一，复用 active context，rebuild 单独处理。                                   | #170                        | 契约、请求、前台测试   | 三个入口已迁移且 rebuild 分开；只读访问保护仍有共享缺口。                            | 部分落实     | 高       | 是       | FIND-002                               |
| REQ-026 | graph rebuild 单独覆盖 BUSY、并发、失败恢复、状态一致性和前台调用。                                   | #172                        | 请求、前台测试         | started/queued、并发和失败恢复测试存在；真实浏览器主路径未形成固定同版本证据。       | 部分落实     | 高       | 是       | FIND-006                               |
| REQ-027 | 对话列表、选择和新建统一；会话绑定知识库，保留未发消息 stub。                                         | #173，E-DES Phase 3         | 契约、请求、前台测试   | route 和前台 API 已迁移，绑定和 stub 有测试；检索上下文仍可能跨对话。                | 部分落实     | 严重     | 是       | FIND-005                               |
| REQ-028 | prompt 请求体使用共享 schema；启动前错误走统一 JSON envelope。                                        | #174，E-DES §5              | 契约、请求             | 已迁移并有 invalid body/no active/BUSY 等测试。                                      | 已落实       | 无       | 否       | -                                      |
| REQ-029 | assistant/tool/artifact 事件由共享 schema 定义，assistant_error 有稳定且脱敏的 code/message/details。 | #174，E-DES §5              | 契约、事件测试         | 事件 schema 和错误结构已存在，公开事件有脱敏测试。                                   | 已落实       | 无       | 否       | -                                      |
| REQ-030 | prompt 的 seq 连续、身份稳定、唯一终态、终态后不再追加。                                              | #174，E-DES §5              | 事件 fixture、请求     | 服务器适配器和前台 parser 均有顺序、终态和 EOF 测试。                                | 已落实       | 无       | 否       | -                                      |
| REQ-031 | SSE 生产路径轻量校验关键字段，测试 fixture 全量校验。                                                 | #174，E-DES 数据流          | 前台 parser、fixture   | 分层校验与全量 fixture 均存在。                                                      | 已落实       | 无       | 否       | -                                      |
| REQ-032 | prompt 覆盖发送、取消、重复发送、无 active、BUSY、断线和解析失败。                                    | #174                        | 请求、前台测试、浏览器 | 自动测试覆盖多数协议和失败；完整真实流程仍无同版本可重复证据。                       | 部分落实     | 高       | 是       | FIND-006                               |
| REQ-033 | batch digest 共享事件 schema，覆盖成功、单文件失败、整体失败、取消、断线和唯一结束。                  | #175，E-DES Phase 4         | 契约、事件测试         | 批量流按自己的身份和三类结束事件落实并有测试；与原“所有 stream”文字冲突尚未获批准。  | 部分落实     | 高       | 是       | FIND-008                               |
| REQ-034 | graph events 使用共享 schema、保持只读、断线重连后新身份从 1 开始。                                   | #175，设计变更              | 契约、事件测试         | 长连接模型和重连测试已落实；它不使用原设计要求的三选一终态，取舍未获批准。           | 部分落实     | 高       | 是       | FIND-008                               |
| REQ-035 | 选库、切对话、读页面、图谱重建、发消息、取消、重复发送和查看产出物均不退化。                          | #158，E-DES 验收            | 真实启动、浏览器、请求 | 有分散的手动 smoke 和大量单测，但没有固定审查版本的一次完整、可重复真实流程。        | 暂时无法验证 | 高       | 是       | FIND-006                               |
| REQ-036 | 知识库、对话、页面、图谱、消息和产出物不串数据，三类数据边界不降低。                                  | #158/#171/#173，PRODUCT/ADR | 请求、磁盘、浏览器     | 路径与存储位置大体保持；检索上下文所有权缺口会破坏对话隔离。                         | 部分落实     | 严重     | 是       | FIND-005                               |
| REQ-037 | web 禁止在规定封装外直接 fetch API，禁止旧响应解析重新扩散。                                          | #176，E-DES 静态边界        | 静态检查、测试         | 检查存在，并已能识别迁移后仍留在 legacy 的入口。                                     | 已落实       | 无       | 否       | -                                      |
| REQ-038 | web 不 import server；contracts 不 import Hono、React、pi-agent、fs 或业务实现。                      | #176，E-DES §1/静态边界     | 静态检查               | 检查和测试已覆盖。                                                                   | 已落实       | 无       | 否       | -                                      |
| REQ-039 | 已迁移 server route 不手写旧错误格式。                                                                | #176，E-DES Phase 5         | 静态检查               | 已迁移 route 受检查；7 个未迁移 handler 仍手写旧格式。                               | 部分落实     | 高       | 是       | FIND-001                               |
| REQ-040 | 测试覆盖 contracts、route、client、事件 fixture 和适用失败模式。                                      | E-DES 测试方案，各子票      | 自动测试               | 数量和层次较完整；已确认的方法配对、编号、安全和上下文问题均缺少有效防退化测试。     | 部分落实     | 高       | 是       | FIND-002, FIND-003, FIND-004, FIND-005 |
| REQ-041 | 涉及主路径时启动真实工作台完成 UI 验收。                                                              | E-DES 主路径回归，各子票    | 进程、浏览器           | 多个 PR 声称做过局部 smoke，但没有固定版本、统一环境和完整流程记录。                 | 暂时无法验证 | 高       | 是       | FIND-006                               |
| REQ-042 | 实际后台入口与官方登记完整一致，并能防止以后漂移。                                                    | #167/#176，E-DES 风险护栏   | 运行时清点、静态检查   | #191 一次性证明 34 对 34；当前静态检查不读取真实运行入口。                           | 部分落实     | 高       | 是       | FIND-007                               |
| REQ-043 | 最终不再保留未迁移领域或长期 legacy 例外。                                                            | E-DES §7/Phase 5/验收       | registry、代码         | 仍有 7 个明确旧入口。                                                                | 未落实       | 高       | 是       | FIND-001                               |
| REQ-044 | 用户可读 message 为中文，前台业务判断依赖 code 而不是 message。                                       | E-DES §2                    | 契约、前台代码         | 新契约路径满足；旧入口仍直接依赖 error 字符串。                                      | 部分落实     | 中       | 是       | FIND-001                               |
| REQ-045 | HTTP 状态码稳定表达请求、权限、不存在、冲突、内部错误和平台不支持。                                   | E-DES §2                    | 请求测试               | 新 route 有统一映射；旧 route 和 artifact 编号边界仍会返回错误类别。                 | 部分落实     | 中       | 是       | FIND-001, FIND-004                     |
| REQ-046 | SSE 不套 JSON envelope，并避免高频事件全量重解析造成退化。                                            | E-DES §5/数据流             | 代码、事件测试         | 三类流保持 SSE，并采用分层校验。                                                     | 已落实       | 无       | 否       | -                                      |
| REQ-047 | graph events GET 保持只读；会改变状态或触发模型的 SSE 用 POST 并受保护。                              | E-DES §5/§9，#175           | registry、安全测试     | 方法与分类正确；受保护 POST 仍受开发代理共享缺口影响。                               | 部分落实     | 严重     | 是       | FIND-002                               |
| REQ-048 | 启动恢复最近知识库和对话，且能在真实进程和磁盘层验证。                                                | E-DES 测试覆盖图            | 真实启动、磁盘         | 业务代码保留启动恢复，但基线没有隔离、可重复的真实启动证据。                         | 暂时无法验证 | 高       | 是       | FIND-006                               |
| REQ-049 | 每个阶段说明迁移入口、剩余 legacy、失败覆盖和验证结果。                                               | E-DES §7/测试               | PR 记录                | #177 至 #188 的说明总体列出范围与检查；部分“无剩余问题”与未处理讨论不一致。          | 部分落实     | 中       | 否       | FIND-010                               |
| REQ-050 | 行为变化更新必要文档和发布记录；纯内部或纯审查文档不强制版本更新。                                    | E-DES Phase 5，仓库规则     | Git 历史               | 事件行为相关 PR 更新了版本和文档；本任务为纯审查文档。                               | 已落实       | 无       | 否       | -                                      |
| REQ-051 | 不引入 OpenAPI/codegen，不改变根 CommonJS 兼容。                                                      | E-DES 不做/§1               | 依赖、配置             | 未引入生成链，根模块设置未改变。                                                     | 已落实       | 无       | 否       | -                                      |
| REQ-052 | 知识库目录、应用数据目录和模型凭证位置及职责保持不变。                                                | E-DES 不做/§8，#158         | 代码、磁盘             | 路径和职责没有被迁移改写；但完整磁盘隔离验收尚缺。                                   | 部分落实     | 高       | 是       | FIND-006                               |
| REQ-053 | 新增路由或迁移状态不能绕过边界检查，已迁移入口不能退回 legacy。                                       | #167/#176                   | 静态检查、测试         | 静态规则覆盖回退和错误格式；不覆盖真实运行入口新增或方法配对。                       | 部分落实     | 高       | 是       | FIND-003, FIND-007                     |

## 6. 原始来源覆盖表

下表中的 `AC1` 表示对应任务 Acceptance criteria 的第 1 条。一个要求在多个任务重复出现时共用同一 `REQ-*`，不会制造多个含义相同的编号。

| 来源 | 每条验收项到稳定编号的对应                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| #158 | AC1→REQ-002/003/044/045；AC2→REQ-004/010/011；AC3→REQ-006/008；AC4→REQ-036/052；AC5→REQ-035                    |
| #165 | AC1→REQ-004；AC2→REQ-002/003；AC3→REQ-006/008；AC4→REQ-009；AC5→REQ-008；AC6→REQ-010；AC7→REQ-019；AC8→REQ-004 |
| #166 | AC1→REQ-015；AC2→REQ-016；AC3→REQ-017；AC4→REQ-018；AC5→REQ-018；AC6→REQ-003/017；AC7→REQ-015/016/017/018/040  |
| #167 | AC1→REQ-011；AC2→REQ-011；AC3→REQ-012；AC4→REQ-010/013；AC5→REQ-011/014；AC6→REQ-013；AC7→REQ-037/053          |
| #168 | AC1→REQ-020；AC2→REQ-020；AC3→REQ-020；AC4→REQ-010/020；AC5→REQ-040；AC6→REQ-013/020                           |
| #169 | AC1→REQ-023；AC2→REQ-024；AC3→REQ-014/024；AC4→REQ-014；AC5→REQ-014/024；AC6→REQ-023/024/040；AC7→REQ-022      |
| #170 | AC1→REQ-025；AC2→REQ-025；AC3→REQ-025/026；AC4→REQ-010/025；AC5→REQ-025/040；AC6→REQ-035/041；AC7→REQ-022      |
| #171 | AC1→REQ-021/022；AC2→REQ-021；AC3→REQ-022；AC4→REQ-022；AC5→REQ-008；AC6→REQ-035/041                           |
| #172 | AC1→REQ-026；AC2→REQ-026；AC3→REQ-026；AC4→REQ-010/026；AC5→REQ-035/041；AC6→REQ-011/026；AC7→REQ-022          |
| #173 | AC1→REQ-027；AC2→REQ-027；AC3→REQ-027；AC4→REQ-027/036；AC5→REQ-027；AC6→REQ-027/040；AC7→REQ-035/041          |
| #174 | AC1→REQ-028；AC2→REQ-028；AC3→REQ-029；AC4→REQ-003/029；AC5→REQ-030；AC6→REQ-031；AC7→REQ-032/040              |
| #175 | AC1→REQ-033；AC2→REQ-034；AC3→REQ-034/047；AC4→REQ-017/047；AC5→REQ-033/034/040；AC6→REQ-031/033/034           |
| #176 | AC1→REQ-013/039；AC2→REQ-013；AC3→REQ-037；AC4→REQ-038；AC5→REQ-038；AC6→REQ-039；AC7→REQ-035/041              |

开工前设计中未逐字重复在任务验收项里的硬要求也已单独进入矩阵：REQ-001、005、006、007、014-018、042-053。PRODUCT/ADR 在开工前与审查起点 blob 相同，作为 REQ-036、048、052 的约束来源，没有发现另一组未登记的实施期变更。后来新增的线上检查和主线保护关闭规则不冒充原始产品承诺，只作为 FIND-009 保留并阻止最终关闭。

### 6.1 十二个合并结果覆盖

| 原子任务 | 合并请求                                                       | 审查入口                              | 初次结果摘要                                |
| -------- | -------------------------------------------------------------- | ------------------------------------- | ------------------------------------------- |
| #165     | [#177](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/177) | REQ-002-010、019                      | 基础竖线已建；最终收口仍受旧入口影响        |
| #166     | [#179](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/179) | REQ-015-018、REV-003                  | 安全地基部分落实，仍有严重阻塞项            |
| #167     | [#178](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/178) | REQ-011-013、REV-001/002              | registry 已建，方法配对仍未落实             |
| #168     | [#180](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/180) | REQ-020、EP-005/008/009/030           | 票内四个入口已迁移                          |
| #169     | [#182](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/182) | REQ-014/023/024、REV-004              | 页面和产出物已迁移，编号边界仍未落实        |
| #170     | [#183](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/183) | REQ-025、EP-015-017                   | 票内三个入口已迁移                          |
| #171     | [#181](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/181) | REQ-021/022、EP-020-023/025/026/028   | active context 主体已迁移，初始化和创建仍旧 |
| #172     | [#185](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/185) | REQ-026、EP-018                       | rebuild 契约已迁移，完整真实流程证据仍缺    |
| #173     | [#184](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/184) | REQ-027、EP-010-012                   | 对话路由已迁移，跨对话检索上下文仍阻塞      |
| #174     | [#186](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/186) | REQ-028-032、REV-005                  | prompt 契约已迁移，上下文所有权仍未落实     |
| #175     | [#187](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/187) | REQ-033/034/046/047、SRC-CONFLICT-001 | 两类事件流已迁移，历史规则取舍待决定        |
| #176     | [#188](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/188) | REQ-013/037-039/053、REV-006          | 静态边界已建；7 个 legacy 例外仍阻塞总收口  |

## 7. 34 个实际入口反向审查

每个入口都从实际挂载反向核对登记类别、前台入口、安全分类和验证。`共享安全缺口` 指 FIND-002；`真实流程缺口` 指 FIND-006。证据均来自 E-BL §9、E-REG、E-APP、E-START、E-WEB 和 E-TEST。

| 编号   | 方法与地址                                | 当前结果与证据（含前台与验证）                                                                       | 初次结论 | 严重程度 | 阻止关闭 | 关联发现                     |
| ------ | ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------- | -------- | -------- | ---------------------------- |
| EP-001 | GET `/api/artifacts`                      | 已迁移；领域 API 和 route/client 测试存在；读取本地产出物清单仍受共享安全缺口影响。                  | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-002 | GET `/api/artifacts/:id`                  | 已迁移；领域 API 和测试存在；同时受编号规则与共享安全缺口影响。                                      | 部分落实 | 严重     | 是       | FIND-002, FIND-004           |
| EP-003 | GET `/api/artifacts/:id/files/:filename`  | 文件下载例外已实现并隔离普通 client；失败和编号边界仍不完全稳定，访问保护需复核。                    | 部分落实 | 严重     | 是       | FIND-002, FIND-004           |
| EP-004 | POST `/api/auth/set`                      | startup legacy；前台 legacy wrapper；没有统一 schema/错误或可注入 route 测试，并受共享安全缺口影响。 | 未落实   | 严重     | 是       | FIND-001, FIND-002           |
| EP-005 | GET `/api/auth/status`                    | 已迁移并只返回公开状态字段；route/client 测试存在；只读保护范围仍需统一复核。                        | 部分落实 | 高       | 是       | FIND-002                     |
| EP-006 | POST `/api/auth/test`                     | startup legacy；前台 legacy wrapper；没有统一 schema/错误或可注入 route 测试，并受共享安全缺口影响。 | 未落实   | 严重     | 是       | FIND-001, FIND-002           |
| EP-007 | GET `/api/commands`                       | startup legacy；前台 legacy wrapper；安全分类与承诺边界不一致。                                      | 未落实   | 严重     | 是       | FIND-001, FIND-002           |
| EP-008 | GET `/api/config`                         | 已迁移并有 route/client 测试；读取本机配置仍受共享安全缺口影响。                                     | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-009 | POST `/api/config`                        | 已迁移、state-changing、route/client 和 token 测试存在；共享安全缺口仍在。                           | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-010 | GET `/api/conversations`                  | 已迁移并有 route/client 测试；对话清单读取受共享安全缺口影响。                                       | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-011 | POST `/api/conversations`                 | 已迁移并有知识库绑定测试；安全缺口和检索上下文所有权问题仍影响隔离。                                 | 部分落实 | 严重     | 是       | FIND-002, FIND-005           |
| EP-012 | POST `/api/conversations/new`             | 已迁移并保留 stub 测试；共享安全缺口仍在。                                                           | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-013 | POST `/api/echo`                          | startup legacy 且被登记为无需保护；无正式前台领域 API，只用于诊断。                                  | 未落实   | 高       | 是       | FIND-001                     |
| EP-014 | GET `/api/events`                         | 共享 graph event schema、只读长连接和重连测试存在；该入口是设计明确的只读例外。                      | 已落实   | 无       | 否       | -                            |
| EP-015 | GET `/api/graph`                          | 已迁移并有 route/client/图谱测试；读取知识库图谱受共享安全缺口影响。                                 | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-016 | GET `/api/graph/layout`                   | 已迁移并有 route/client 测试；读取布局受共享安全缺口影响。                                           | 部分落实 | 高       | 是       | FIND-002                     |
| EP-017 | PUT `/api/graph/layout`                   | 已迁移并有 route/client/token 测试；共享安全缺口仍在。                                               | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-018 | POST `/api/graph/rebuild`                 | 已迁移并覆盖 started/queued、并发与恢复；缺固定同版本真实主路径，且有共享安全缺口。                  | 部分落实 | 严重     | 是       | FIND-002, FIND-006           |
| EP-019 | GET `/api/health`                         | 已迁移，竖线和测试完整；公开心跳是明确例外。                                                         | 已落实   | 无       | 否       | -                            |
| EP-020 | DELETE `/api/knowledge-base`              | 已迁移并有清除与状态一致性测试；共享安全缺口仍在。                                                   | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-021 | GET `/api/knowledge-base`                 | 已迁移并有 active context 测试；读取当前库、对话与消息受共享安全缺口影响。                           | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-022 | POST `/api/knowledge-base`                | 已迁移并有选择、失效路径和串行化测试；共享安全缺口仍在。                                             | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-023 | GET `/api/knowledge-bases`                | 已迁移并有 route/client 测试；本机知识库清单读取受共享安全缺口影响。                                 | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-024 | POST `/api/knowledge-bases/batch-digest`  | 共享 SSE、取消和终态测试存在；安全、真实流程和历史终态冲突仍在。                                     | 部分落实 | 严重     | 是       | FIND-002, FIND-006, FIND-008 |
| EP-025 | DELETE `/api/knowledge-bases/external`    | 已迁移并有 route/client 测试；共享安全缺口仍在。                                                     | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-026 | POST `/api/knowledge-bases/external`      | 已迁移并有路径错误测试；共享安全缺口仍在。                                                           | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-027 | POST `/api/knowledge-bases/init-existing` | startup legacy；前台 legacy wrapper；直接返回旧冲突信息，无法通过 createApp 独立验证。               | 未落实   | 严重     | 是       | FIND-001, FIND-002           |
| EP-028 | POST `/api/knowledge-bases/inspect`       | 已迁移并有 route/client 测试；安全分类与承诺边界不一致。                                             | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-029 | POST `/api/knowledge-bases/new`           | startup legacy；前台 legacy wrapper；直接返回内部命令输出和原始错误，无法独立 route 测试。           | 未落实   | 严重     | 是       | FIND-001, FIND-002           |
| EP-030 | GET `/api/models`                         | 已迁移、返回公开模型信息并有 route/client 测试；只读保护范围仍需统一复核。                           | 部分落实 | 高       | 是       | FIND-002                     |
| EP-031 | GET `/api/page`                           | 已迁移并有 not found/路径/schema 测试；页面正文读取受共享安全缺口影响。                              | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-032 | POST `/api/prompt`                        | 请求和 SSE 已迁移，协议测试完整；安全、跨对话上下文和真实流程缺口仍在。                              | 部分落实 | 严重     | 是       | FIND-002, FIND-005, FIND-006 |
| EP-033 | GET `/api/refs`                           | 已迁移并有 route/client 测试；知识库页面索引读取受共享安全缺口影响。                                 | 部分落实 | 严重     | 是       | FIND-002                     |
| EP-034 | POST `/api/system/choose-directory`       | startup legacy；前台 legacy wrapper；平台错误和选择结果使用旧格式，无法独立 route 测试。             | 未落实   | 高       | 是       | FIND-001, FIND-002           |

## 8. 合并前审查意见

GitHub 的 6 条讨论在基线时都仍显示“未解决、未过时”。这里判断的是审查版本中问题是否真实存在，不替代 GitHub 的讨论状态。

| 编号    | 固定讨论                                                                                               | 当前结果与证据                                                                                  | 初次结论 | 严重程度 | 阻止关闭 | 关联发现 |
| ------- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- | -------- | -------- | -------- | -------- |
| REV-001 | [#178 method/path](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/178#discussion_r3556592867)      | `request()` 只约束 `MigratedJsonPath`，`method` 仍是可自由覆盖的独立字段。                      | 未落实   | 中       | 是       | FIND-003 |
| REV-002 | [#178 file-download](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/178#discussion_r3556592869)    | #182 后已迁入 route module；文件成功返回 Response，失败走统一 error。原意见所指问题已实际修复。 | 已落实   | 无       | 否       | -        |
| REV-003 | [#179 dev proxy](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/179#discussion_r3557337627)        | 固定讨论指出的访问保护问题在审查版本仍存在；公开报告不展开可利用细节。                          | 未落实   | 严重     | 是       | FIND-002 |
| REV-004 | [#182 artifact UUID](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/182#discussion_r3559732657)    | route 仍接受通用 UUID，底层只接受 v4，错误分类仍会漂移。                                        | 未落实   | 中       | 是       | FIND-004 |
| REV-005 | [#186 context owner](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/186#discussion_r3564118234)    | 存储时带 owner，消费函数仍不接收或核对 owner。                                                  | 未落实   | 严重     | 是       | FIND-005 |
| REV-006 | [#188 legacy allowlist](https://github.com/sdyckjq-lab/llm-wiki-skill/pull/188#discussion_r3564307516) | 后续提交已增加双向检查和专门测试：allowlist 条目若不再是 legacy 会报错。                        | 已落实   | 无       | 否       | -        |

## 9. 设计变化与无法自行取舍的冲突

| 编号             | 原始要求                                                 | 后来实现                                                                                               | 当前判断                                                                                                         | 严重程度 | 阻止关闭 |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------- | -------- |
| SRC-CONFLICT-001 | 开工前设计把每条 stream 的结束都写成 prompt 的三类终态。 | `631daae...` 把规则限定为 prompt；batch 使用自己的三类终态；graph 是以断线结束、重连换新身份的长连接。 | 新模型有清楚 schema 和测试，但它改变了原文字，无法同时满足。执行者无权自行认定为等价；等待用户在后续分流中决定。 | 高       | 是       |

## 10. 完整性与冻结规则

- 稳定编号总数：`REQ` 53、`EP` 34、`REV` 6、`FIND` 10、来源冲突 1。
- 基线入口数仍为 34：createApp 27、startup 7；本报告没有增加、删除或重编号入口。
- 6 条固定讨论均已进入 REV 表；其中 2 条在审查版本中已实际解决，4 条仍有效。
- #158 与 #165 至 #176 的每条 Acceptance criteria 均进入第 6 节覆盖表；设计独有硬要求另列在矩阵中。
- 报告合入 `main` 后，由 #190 和 #192 记录：合并提交、文件 Git blob、文件 SHA-256、上述编号计数和正式链接。本文件从那一刻冻结，不再修改。
- Phase 1 后发现的新入口或问题使用新编号追加到最终报告的“晚发现事项”，并重新打开 #193；不得回写本报告。

## 11. #192 本地验证记录

本节只记录本报告自身和固定实现版本的只读验证，不把测试通过误写成 #158 可以关闭。

| 检查                           | 结果                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 基线 SHA-256                   | 通过；与 #191 固定值一致                                                                                                                                               |
| 稳定编号唯一性与连续性         | 通过；REQ 53、EP 34、REV 6、FIND 10 均唯一且连续                                                                                                                       |
| 来源覆盖完整性                 | 通过；#158、#165 至 #176 共 13 张任务全部进入对应表                                                                                                                    |
| 34 个入口覆盖完整性            | 通过；EP-001 至 EP-034 无缺失、重复或跳号                                                                                                                              |
| 6 条审查意见覆盖完整性         | 通过；6 个固定讨论永久链接全部进入 REV 表                                                                                                                              |
| Markdown 格式与结构            | Prettier、围栏、链接、末尾换行和 `git diff --check` 通过                                                                                                               |
| 隐私与敏感信息扫描             | 通过；新报告没有本机绝对路径、用户名、凭证或私有素材                                                                                                                   |
| 工作台边界、类型检查和适用测试 | 边界与类型检查通过；contracts 46/46、server 140/140、web 179+108、graph-engine 759/759、web lint 通过。graph-engine 首次与其他套件并行时为 758/759，隔离重跑为 759/759 |
| 双轴复审                       | 通过；仓库规范轴 0 个问题，任务规格轴发现的 4 个问题均已修正，最终复审 0 个剩余问题                                                                                    |

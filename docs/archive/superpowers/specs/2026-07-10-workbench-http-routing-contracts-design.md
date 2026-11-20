# 工作台 HTTP 与路由契约加深设计

GitHub Issue: https://github.com/sdyckjq-lab/llm-wiki-skill/issues/158

## 结论

本次只做工作台前后端通信和路由地基设计，不改变用户看到的功能。

推荐方案是新增独立 workspace package `@llm-wiki/workbench-contracts`，用 Zod 维护工作台 HTTP JSON 与 SSE 事件的共享契约。普通 JSON 接口统一为 `{ ok: true, data } | { ok: false, code, message, details? }`；SSE 不强行套 JSON envelope，但事件名和 `data` 结构同样由共享 schema 定义。

后端拆出 `createApp()`，让本地端口启动和具体请求处理分开。前端拆出统一底层 API client，再按知识库、对话、页面、图谱、设置、认证、产物和 prompt 等领域导出 API module。实现按阶段迁移，不做一次性大爆炸。

## 背景

当前工作台后端的 Hono app、路由注册、参数解析、错误处理和启动逻辑主要集中在 `workbench/server/src/index.ts`。这个文件同时负责：

- 创建 Hono app。
- 注册所有 `/api/*` 路由。
- 解析 JSON body 和 query。
- 手写 `{ ok: false, error }` 错误响应。
- 启动前 bootstrap active context。
- 监听本地端口。

前端调用主要集中在 `workbench/web/src/lib/api.ts`。这里手写了 API URL、请求 body、返回类型和错误解析。当前普通 JSON 返回大多有 `{ ok }`，但成功字段混用 `items`、`active`、`config`、`content`、`manifest`、`status` 等；失败字段多为 `{ ok:false,error:string }`。SSE、文件下载、health 又有各自例外。

这带来几个问题：

- 前后端各自维护接口 shape，容易漂移。
- 缺参数、无 active KB、路径越界、资源不存在等错误没有稳定 code。
- 后端 route 很难脱离完整 server 启动单独测试。
- 新增功能时容易继续把逻辑堆进 `index.ts` 和 `api.ts`。

#158 的目标不是新增功能，而是把“工作台前台和后台怎么说话”整理成可验证、可分阶段维护的 module 边界。

## 目标

- 工作台请求有清楚的一套规则：成功、失败、缺参数、无权限、未选择知识库等情况表达一致。
- 前端调用和后端返回共享同一份契约，不再各自手写容易漂移的隐含约定。
- 后端本地端口启动和具体请求处理可以分开理解、分开测试。
- 路由按产品领域拆分，避免所有入口继续堆在 `index.ts`。
- 前端 API 调用按领域拆分，避免所有调用继续堆在 `api.ts`。
- 知识库数据、应用数据、模型凭证三条边界保持不变。
- 现有主路径不退化：选知识库、切对话、读页面、图谱重建、发送消息、查看产出物继续工作。

## 不做

- 不新增用户功能。
- 不改变 UI 流程、视觉、文案或交互规则。
- 不改变知识库目录结构。
- 不改变应用数据目录 `~/.llm-wiki-agent/`。
- 不改变模型凭证位置 `~/.pi/agent/auth.json`。
- 不引入 OpenAPI 或 codegen。
- 不把 SSE 强行套进 `{ ok, data }` envelope。
- 不做长期旧格式兼容。
- 不从 web 直接 import server 内部类型。

## 比较过的方案

### 方案 A：只共享 TypeScript 类型

新增 contracts 包，只导出 TypeScript 类型和少量 helper。前端和后端都引用这些类型。

优点是依赖少，迁移轻。缺点是运行时数据仍可能漂移：后端返回错结构、前端 mock 写错结构、SSE data 变形时，类型系统不一定能及时发现。

不推荐作为 #158 的最终方案。

### 方案 B：Zod 共享契约，分阶段迁移

这是推荐方案。

新增 `@llm-wiki/workbench-contracts`，用 Zod 定义 request、response、error 和 SSE event schema，并从 schema 推导 TypeScript 类型。后端 route 使用同一份 schema 校验请求，前端 client 使用同一份 schema 校验响应。

优点是最贴合 #158：接口规则能被测试，前后端不会各自维护一份隐含清单。它比纯 TypeScript 类型更可靠，又比 OpenAPI/codegen 更轻。

代价是新增 Zod 直接依赖，并要求每迁移一个领域时补 schema 和测试。

### 方案 C：OpenAPI / codegen 一步到位

用 schema 生成 API 文档和前端客户端。

优点是自动化强。缺点是当前工作台是本地应用，不是公开云 API；接口仍在快速演进，引入 codegen 会增加工具链和维护成本，并把设计重心从产品路由边界转到生成工具。

不推荐。

## 设计

### 1. 新增共享契约包

新增 workspace package：

```text
packages/workbench-contracts/
```

npm 名建议：

```text
@llm-wiki/workbench-contracts
```

它只承担契约职责：

- Zod schema。
- 从 schema 推导出的 TypeScript 类型。
- 稳定错误码。
- 通用 JSON envelope schema。
- SSE event data schema。

它是一个可构建的 workspace package，不是只放源码给 TypeScript 跨目录偷读：

- 有自己的 `package.json`、`tsconfig.json`、`src/`、`dist/` 和 `exports`。
- 有自己的 `build`、`typecheck`、`test` 脚本。
- Zod 是 contracts 包的 runtime dependency，不是只给测试用的 devDependency。
- server 和 web 只从 package export import，不从 `packages/workbench-contracts/src/*` 深路径 import。
- 根工作区构建时要保证 contracts 先于 server/web 可用。实现方式可以参考 `@llm-wiki/graph-engine` 的 workspace 包模式。
- 根 `package.json` 继续不设 `"type": "module"`；contracts 包自己的模块格式和 `exports` 必须与 server/web 的 TypeScript/Vite/Node 用法兼容。

它不替代现有 `typebox` 用法。当前 `typebox` 继续服务于 pi-agent Extension 工具参数 schema；Zod 只服务于工作台 HTTP JSON、SSE 事件和前后端共享契约。两者边界如下：

| schema 工具 | 负责范围 | 不负责 |
|---|---|---|
| Zod | 工作台 HTTP request/response、JSON envelope、SSE event data、前端 client 校验 | pi-agent Extension 工具参数 |
| TypeBox | pi-agent Extension 的 tool `parameters` | 工作台 HTTP/SSE 契约 |

它不承担业务职责：

- 不读写文件。
- 不调用 Hono。
- 不调用 React。
- 不调用 pi-agent。
- 不知道知识库扫描、对话选择、图谱构建或认证写入的内部实现。

建议包内结构：

```text
packages/workbench-contracts/src/
├── index.ts
├── json.ts
├── errors.ts
├── knowledge-bases.ts
├── conversations.ts
├── pages.ts
├── graph.ts
├── config.ts
├── auth.ts
├── artifacts.ts
├── prompt-events.ts
└── batch-digest-events.ts
```

`index.ts` 只 re-export 公共契约，不放业务实现。

### 2. JSON envelope

普通 JSON 接口统一为两类响应。

成功：

```ts
{ ok: true, data: T }
```

失败：

```ts
{
  ok: false,
  code: WorkbenchErrorCode,
  message: string,
  details?: WorkbenchErrorDetails
}
```

`details` 不是任意错误对象，也不能直接返回 `Error.stack`、本机绝对路径、认证文件路径、原始 request body 或 pi-agent 原始错误。contracts 包要按错误码定义可公开的 details schema，例如：

- `MISSING_FIELD`：`{ field: string }`。
- `INVALID_REQUEST`：`{ issues: Array<{ path: string; message: string }> }`，不包含原始 body。
- `FORBIDDEN_PATH`：`{ reason: 'outside-root' | 'not-registered' | 'symlink-escape' }`，不返回本机绝对路径。
- `FORBIDDEN_ORIGIN` / `FORBIDDEN_LOCAL_API`：只返回可公开原因，不返回 token、origin 全量诊断或内部配置。
- `INTERNAL_ERROR`：默认不带 details；dev/test 可带脱敏 diagnostic id。

含义：

- `ok`：保留现有前后端习惯，降低迁移风险。
- `data`：统一成功 payload 字段，替代现在的 `items`、`active`、`config`、`content`、`manifest`、`status` 等混用。
- `code`：稳定英文错误码，给程序判断和测试断言。
- `message`：中文用户可读提示。
- `details`：结构化补充信息，例如缺失字段、冲突文件列表、非法路径原因。details 必须由 contracts 中的公开 schema 定义，且经过 redaction，不能泄露本机路径、stack、认证位置、环境变量或原始 prompt/body。

第一批错误码建议：

- `INVALID_JSON`：JSON body 解析失败。
- `INVALID_REQUEST`：请求字段类型不对或整体不符合 schema。
- `MISSING_FIELD`：缺少必填字段。
- `NO_ACTIVE_KB`：当前没有选择知识库。
- `KB_NOT_REGISTERED`：知识库未登记或已失效。
- `FORBIDDEN_PATH`：路径越界或无权限。
- `FORBIDDEN_ORIGIN`：请求来源不是工作台可信来源。
- `FORBIDDEN_LOCAL_API`：本地 API 缺少或携带了错误的本次启动 capability token。
- `NOT_FOUND`：资源不存在。
- `CONFLICT`：资源冲突，例如初始化已有库时存在冲突文件。
- `UNSUPPORTED_PLATFORM`：当前平台不支持。
- `BUSY`：资源忙，例如当前对话正在生成。
- `INTERNAL_ERROR`：兜底内部错误。

HTTP 状态码仍表达大类：

- `400`：请求格式或参数错误。
- `403`：权限或路径边界错误。
- `404`：资源不存在。
- `409`：冲突或资源忙。
- `500`：内部错误。
- `501`：平台不支持。

前端业务逻辑不依赖中文 `message`，只依赖 `code`。

### 3. 后端 createApp 与 route module

后端拆出：

```text
workbench/server/src/app.ts
workbench/server/src/index.ts
workbench/server/src/http/request.ts
workbench/server/src/http/response.ts
workbench/server/src/routes/
```

职责：

- `app.ts`：导出 `createApp()`，组装 Hono app 和所有 route module。
- `index.ts`：只负责 `bootstrapFromConfig()`、恢复 active graph watcher、读取 host/port、调用 `serve()`。
- `http/request.ts`：统一 JSON body、query 和 Zod 校验。
- `http/response.ts`：统一 `jsonOk()`、`jsonError()` 和错误映射。
- `routes/*.ts`：按产品领域注册路由。

建议 route module：

```text
routes/health.ts
routes/knowledge-bases.ts
routes/conversations.ts
routes/pages.ts
routes/graph.ts
routes/config.ts
routes/auth.ts
routes/artifacts.ts
routes/prompt.ts
routes/events.ts
routes/system.ts
```

`createApp()` 的目标是让测试可以直接调用：

```ts
const app = createApp(testDeps);
const res = await app.request('/api/knowledge-bases');
```

测试不需要启动 `8787` 端口。

`createApp()` 不能偷偷执行真实启动流程。它必须只组装请求处理，并接收依赖注入：

```ts
createApp(deps: WorkbenchAppDeps, options?: { mode: 'test' | 'dev' | 'desktop' })
```

约束：

- `index.ts` 负责组装真实 deps、`bootstrapFromConfig()`、恢复 graph watcher、读取 host/port、调用 `serve()`。
- `createApp()` 不监听端口，不 bootstrap，不恢复 watcher，不主动读写真实 `~/.llm-wiki-agent/` 或知识库目录。
- route 测试传入 temp dir、fake active context、fake graph service、fake pi-agent/session service。
- 安全检查、JSON 解析、错误映射作为全局 middleware 注册在所有 `/api/*` route 之前。
- route module 不允许自己选择要不要启用可信来源检查或统一 response helper。

### 4. 前端 API client 与领域 module

前端拆出：

```text
workbench/web/src/lib/api/
├── client.ts
├── knowledge-bases.ts
├── conversations.ts
├── pages.ts
├── graph.ts
├── config.ts
├── auth.ts
├── artifacts.ts
├── prompt.ts
├── events.ts
└── index.ts
```

职责：

- `client.ts`：统一 `fetch`、JSON 解析、错误解析、response schema 校验。
- 领域 module：只表达业务函数，例如 `listKnowledgeBases()`、`selectConversation()`、`getGraphData()`。
- `index.ts`：必要时 re-export，降低 UI 组件迁移成本。

UI 组件继续调用领域函数，不直接拼 `/api/...` URL，也不直接理解 `{ ok:false, code, message }` 之外的底层解析规则。

### 5. SSE 契约

SSE 接口不套 `{ ok, data }`，但纳入共享 schema。

分两层处理：

1. 启动前 HTTP request body 用 Zod 校验。body 错误直接返回普通 JSON error envelope。
2. 流启动后的每类 SSE event 的 `data` 都有共享 schema。

`/api/prompt` 继续使用事件名表达类型，例如：

- `assistant_text_delta`
- `tool_status_start`
- `tool_status_update`
- `tool_status_end`
- `tool_status_summary`
- `assistant_done`
- `assistant_cancelled`
- `assistant_error`
- `artifact_created`

SSE contracts 还必须定义流生命周期规则，不只定义单个事件 shape：

- 每个 `runId` 的 `seq` 从 1 开始严格递增。
- 每个 prompt stream 必须且只能有一个 terminal event：`assistant_done`、`assistant_cancelled`、`assistant_error` 三选一。
- terminal event 后不得再发送 text delta、tool status 或 artifact 事件。
- 前端遇到未知 event、不支持的 `schemaVersion`、关键字段缺失或 `seq` 逆序时，要结束当前 run 的生成态，并进入可恢复错误状态。
- 取消、重复发送、BUSY、断线和 parse 失败都要有测试 fixture。
- graph `/api/events` 如果继续使用 `EventSource` GET，必须保持只读；任何会改状态或触发模型的 SSE 启动必须使用 POST 并通过本地 API token 检查。

`assistant_error` 事件需要稳定化为类似：

```ts
{
  schemaVersion: 1,
  type: 'assistant_error',
  runId: string,
  messageId: string,
  seq: number,
  code: WorkbenchErrorCode,
  message: string,
  details?: WorkbenchErrorDetails
}
```

batch digest 和 graph events 也按同样原则共享事件 schema，但生命周期身份和结束规则按业务类型区分：

- batch digest 使用 `runId + batchId + seq`；`batchId` 替代不适用的 `messageId`，并以 `batch_completed`、`batch_cancelled`、`batch_failed` 三类事件之一作为唯一终态。
- graph events 是长期只读订阅，使用 `streamId + seq`；首帧必须是 `graph_stream_ready`，主动关闭或传输断线即结束本次生命周期。重连必须更换 `streamId`，并从 `seq = 1` 重新开始，不伪造业务终态。

> **2026-07-13 用户决定（FIND-008）**：采用上述按业务类型区分的结束规则。聊天、批量和图谱不再被视为同一种流；早期“每条流都使用聊天三类终态”的文字不再适用于批量和图谱。

### 6. 文件下载例外

`/api/artifacts/:id/files/:filename` 成功时仍返回文件 `Response`，不包 JSON envelope。

失败时返回统一 JSON error envelope：

```ts
{ ok: false, code: 'NOT_FOUND', message: '产物文件不存在' }
```

这条例外必须在 contracts 和前端 client 中显式标注，不能让文件下载被普通 JSON client 误处理。

### 7. 迁移时不做长期兼容

这是同一 monorepo 内的本地工作台，前端和后端会一起发布。不需要像公开 API 一样长期兼容旧客户端。

迁移允许同一个 PR 内有短期桥接，但每个阶段完成后，该领域应收敛到新契约：

- 不保留长期 `{ ok:false,error }` fallback。
- 不长期同时支持 `items` 和 `data`。
- 不长期同时支持多种参数名。

为了避免迁移期间两套 client 互相污染，实现时必须维护 endpoint contract registry。每个 endpoint 标记为：

- `legacy`：尚未迁移，继续由 legacy wrapper 处理。
- `migrated-json`：已迁移到统一 JSON envelope，只能由新 `api/client.ts` 处理。
- `file-download`：成功返回文件 Response，失败返回 JSON error envelope。
- `sse`：启动请求和事件流按 SSE 契约处理。

迁移规则：

- 新 `api/client.ts` 只服务 `migrated-json` endpoint，不吞新旧两套响应。
- 未迁移 endpoint 留在 legacy wrapper 中，不让 generic client 兼容旧格式。
- 每个 Phase 结束时删除该 Phase 已迁移 endpoint 的 legacy parser/fallback。
- PR 描述必须列出本 PR 迁移 endpoint 清单和仍为 legacy 的 endpoint 清单。

### 8. 知识库、应用数据、模型凭证边界不变

这次只改 HTTP 与路由模块边界，不改变三类数据位置和职责：

| 类型 | 位置 | 约束 |
|---|---|---|
| 知识库数据 | `~/llm-wiki/<name>/` 或外部登记路径 | 不改结构，不改读写范围 |
| 应用数据 | `~/.llm-wiki-agent/` | 继续只存 UI 偏好、外部库登记、会话、日志等 |
| 模型凭证 | `~/.pi/agent/auth.json` | 继续由 pi-agent 管理，工作台 config 不存 API key |

### 9. 本地 API 信任边界

未来工作台可能进入 Mac / Windows 桌面安装版，因此 HTTP module 不能只追求“代码拆干净”，还要明确本地 API 的安全边界。

这次设计不新增登录系统，也不把工作台变成远程服务。后端仍默认只绑定 loopback，且所有会读写文件、触发模型、改配置或发起 SSE 的端点都必须只接受工作台可信来源。

可信来源不能只靠 Origin/Referer。Phase 1 必须定义本地 API 安全契约：

- 后端默认只绑定 `127.0.0.1` / `::1` / `localhost`，禁止 `0.0.0.0`，测试覆盖。
- 每次后端启动生成本地 capability token，例如 `X-LLM-Wiki-Workbench-Token`。
- 所有会读写文件、改配置、触发模型、启动 SSE、取消任务的端点都必须带 token。
- token 不写入仓库、不放 URL、不进日志。
- Origin / Fetch Metadata 只作为辅助信号：允许 dev web origin、未来桌面 app origin；如桌面 WebView 出现 `null` origin，也必须带 token。
- 禁止 GET 产生副作用；health、只读 graph events、文件下载等只读端点必须显式列白名单。
- SSE 启动请求经过同一 token 与来源检查。
- 新增 route module 不能绕过统一安全 middleware。

Phase 1 要把这条边界纳入 HTTP 地基：

- 保留并测试 loopback-only host 约束。
- 为普通 HTTP 和 SSE 请求建立统一可信来源和 capability token 检查位置。
- 明确 health、只读 graph events、文件下载这类无副作用端点与会改状态端点的边界差异。
- route module 拆分后，不能让新增路由绕过可信来源检查。
- 错误返回走统一 error envelope，例如 `FORBIDDEN_ORIGIN` 或 `FORBIDDEN_LOCAL_API`。

这和 `workbench/PRODUCT.md §6.8` 保持一致：本地后端 API 不对局域网或任意网页开放。

## 数据流

### 普通 JSON 请求

```text
UI component
  -> 领域 API function
  -> api/client.ts
  -> request schema 构造 / 校验
  -> Hono route
  -> request schema 校验 body/query
  -> 业务函数
  -> jsonOk(data) / jsonError(code, message, details)
  -> response schema 校验
  -> UI 使用已验证 data
```

### SSE 请求

```text
UI component
  -> prompt/batch API function
  -> request schema 校验
  -> fetch POST
  -> 后端启动前校验 body
  -> streamSSE
  -> 每个 event 写入符合共享 schema 的 data
  -> 前端 parseSSE
  -> 生产路径按 event 做轻量判别和关键字段校验
  -> 测试路径用共享 schema 全量校验 fixture
  -> UI 更新流式状态
```

SSE 是流式热路径，不能简单要求生产环境对每个高频事件都做完整重解析。校验策略分层：

- 普通 JSON request/response：前后端都按 schema 强校验。
- SSE 启动前 request body：按 schema 强校验，失败返回 JSON error envelope。
- SSE 生产消费路径：按事件名、`type`、`schemaVersion`、`seq` 和对应身份字段（prompt 的 `runId + messageId`、batch 的 `runId + batchId`、graph 的 `streamId`）做轻量校验；对低频结构化事件可以完整 parse。
- SSE 测试路径：对所有事件 fixture 做共享 schema 全量校验，防止契约漂移。
- 对 `assistant_text_delta` 这类高频事件，避免在每个 token/delta 上做过重工作，保证流式文字出现的手感不退化。

### 文件下载

```text
UI component
  -> getArtifactFileUrl(id, filename)
  -> 浏览器请求文件 URL
  -> 成功：文件 Response
  -> 失败：统一 JSON error envelope
```

## 分阶段迁移计划

### Phase 1：契约基础设施

目标：先搭公共地基，不大范围动业务。

内容：

- 新增 `packages/workbench-contracts`。
- 添加 Zod 直接依赖。
- 定义通用 JSON envelope schema。
- 定义第一批错误码。
- 后端新增 request/response helper。
- 前端新增 api client。
- 新增 `createApp()`。
- 建立普通 HTTP 与 SSE 的可信来源检查位置，保留 loopback-only 约束。
- 迁移少量低风险路由验证结构可行。

验收：

- contracts 包能被 server 和 web 引用。
- contracts 包自己的 build、typecheck、test 通过。
- server/web 只从 `@llm-wiki/workbench-contracts` package export 引用契约。
- `createApp().request(...)` 可以在测试里直接调用。
- route 测试不读写真实用户目录。
- loopback-only、可信来源和 capability token 检查有 route 测试覆盖。
- typecheck 通过。
- 不启动本地端口也能测试已迁移 route。

### Phase 2：低风险 JSON 路由迁移

目标：先迁移副作用小、容易验证的接口。

候选：

- health。
- config / models。
- auth/status。
- artifacts manifest/list。
- refs/page 读取。
- graph read/layout。
- graph rebuild 如果只是读取并返回状态，可随 Phase 2；如果会写缓存、长耗时或触发后台任务，应作为 state-changing endpoint 单独覆盖 BUSY、并发和失败一致性。

验收：

- 这些接口返回统一 `{ ok:true,data }`。
- 错误返回统一 `{ ok:false,code,message,details? }`。
- 前端对应 API module 不再手写返回 shape。

### Phase 3：知识库与对话路由迁移

目标：迁移主状态入口，但暂不碰 prompt 流。

候选：

- list/select/clear active knowledge base。
- register/unregister/inspect/init/create knowledge base。
- list/select/create conversations。

重点：

- `kb` query 与 `kbPath` body 的双口径需要收敛。
- active context schema 成为唯一来源。
- 新建后未发消息的活跃对话 stub 行为必须保留并测试。

验收：

- 选库、切对话、新建对话行为不退化。
- 知识库数据、应用数据、模型凭证边界不改变。

### Phase 4：SSE 与 prompt / batch digest / events 迁移

目标：最后处理最复杂链路。

内容：

- `/api/prompt` request body 用 Zod 校验。
- assistant/tool status 事件 schema 共享。
- `assistant_error` 事件加稳定 `code` 和中文 `message`。
- batch digest 事件 schema 共享。
- graph `/api/events` 事件 schema 共享。

验收：

- 发送消息、取消、生成中重复发送、无 active KB、artifact_created 事件都能跑通。
- batch digest 成功、单文件失败、整体失败事件结构稳定。
- EventSource 图谱更新继续工作。

### Phase 5：清理旧约定与文档更新

目标：确保没有两套契约残留。

内容：

- 删除旧 `api.ts` 大文件，或只保留临时 re-export 后移除。
- 删除重复 `try/catch + { ok:false,error }` 模式。
- 删除长期旧响应兼容。
- 更新必要文档和发布记录。
- 检查没有从 web 直接 import server 内部类型。

验收：

- grep 不再出现大批散落 `{ ok:false,error }`。
- 普通 JSON 接口没有新增非 `{ ok:true,data }` 成功字段。
- PR 描述列出已迁移领域和未迁移领域。

## 测试方案

测试是本设计的硬性组成部分。每个阶段都要能说明“改了哪个 codepath、覆盖了哪个用户路径、还剩什么缺口”。

### 覆盖图

| Phase | 主要 codepath | 必测用户路径 | 必测失败模式 | 主要测试层 |
|---|---|---|---|---|
| Phase 1 契约基础设施 | contracts package、json envelope、错误码、`createApp()`、request/response helper、api client、可信来源检查 | 已迁移低风险 route 可从前端 client 到后端 route 跑通 | invalid JSON、schema mismatch、非可信来源、非 loopback host、response schema mismatch | contracts 单测、server route 测试、web client 测试 |
| Phase 2 低风险 JSON 路由 | health、config/models、auth/status、artifacts manifest/list、refs/page、graph read/layout；graph rebuild 仅在无副作用时纳入 | 读设置、看模型状态、读页面、看 artifact、读图谱/重建图谱 | missing field、not found、forbidden path、unsupported platform、artifact 文件下载失败；graph rebuild 若有副作用还要测 BUSY、并发和失败一致性 | server route 测试、web client 测试、相关 UI 回归 |
| Phase 3 知识库与对话 | knowledge-bases、conversations、active context schema | 选知识库、清除 active、新建/切换对话、启动恢复最近库和最近对话 | no active KB、KB not registered、失效路径、`kb`/`kbPath` 双口径收敛失败、空对话 stub 丢失 | server route 测试、web client 测试、主路径 UI 回归 |
| Phase 4 SSE 与事件 | prompt request、prompt SSE、tool status events、assistant error、batch digest、graph events | 发送消息、取消、生成中重复发送、artifact_created、batch digest、图谱 EventSource 更新 | prompt body invalid、no active KB、BUSY、assistant_error 结构漂移、SSE 事件字段缺失、单文件失败、整体失败 | contracts event fixture、server SSE 测试、web parser/client 测试、真实 UI 流式回归 |
| Phase 5 清理旧约定 | 删除旧 `api.ts` 大文件或临时 re-export、删除旧 `{ ok:false,error }` fallback、删除重复 response shape | 已迁移主路径仍全部可用 | 新增旧格式残留、web 深路径 import server、文件下载被 JSON client 误处理 | grep/static check、typecheck、全量相关测试、手动 UI 验收 |

### 1. contracts schema 测试

覆盖：

- 通用 success envelope。
- 通用 failure envelope。
- 典型 request body。
- 典型 response data。
- 典型 SSE event data。
- 错误码枚举。
- SSE fixture 全量 schema 校验。

目标：schema 自己无矛盾，类型推导可用。

### 2. 后端 route 测试

通过 `createApp().request(...)` 直接测试路由，不启动端口。

覆盖：

- 成功请求。
- invalid JSON。
- 缺必填字段。
- 字段类型错误。
- no active KB。
- forbidden path。
- not found。
- conflict。
- unsupported platform。
- 非可信来源。
- route module 拆分后没有绕过统一 request/response helper。

### 3. 前端 client 测试

mock `fetch`。

覆盖：

- URL。
- method。
- request body。
- 成功响应解析。
- 错误响应解析。
- response schema 校验失败时的报错。
- SSE 事件轻量校验策略。
- SSE fixture 全量校验。
- 文件下载 URL 不被普通 JSON client 误处理。

### 4. 主路径回归

每个实现阶段至少运行相关检查：

- `npm run typecheck`。
- `node --import tsx --test "workbench/server/src/**/*.test.ts"`。
- `npm run test -w @llm-wiki-agent/web`。

涉及 UI 或主路径时，还要启动 `npm run dev`，验证：

- 选知识库。
- 切对话。
- 读页面。
- 图谱重建。
- 发送消息。
- 取消发送。
- 生成中重复发送。
- 查看产出物。

### 5. 静态边界检查

除单元测试和 UI 回归外，还要补静态检查，避免后续改动重新打破 module 边界：

- web 中禁止直接 `fetch('/api/`，除 `api/client.ts`、SSE 启动封装和文件下载 URL helper 外。
- web 禁止 import `workbench/server/src/*`。
- server route 禁止手写 `{ ok:false,error }`。
- contracts 禁止 import Hono、React、pi-agent、`fs` 或任何业务实现。
- 已迁移 endpoint 不再保留 legacy parser/fallback。

这些检查可以先用 grep 脚本或 node:test 实现，不需要引入新 lint 工具。

### 明确缺口

这份 spec 不是实现计划，因此不逐条列出每个 endpoint 的最终测试文件名。写实施计划时必须把每个 Phase 拆成具体任务，并给每个任务附上对应测试入口。

任何阶段如果无法覆盖某个失败模式，PR 描述必须明说原因和后续补测位置，不能用“已跑 typecheck”替代契约测试或 UI 主路径验证。

## 风险和护栏

### 风险：Zod schema 变成新的大杂烩

护栏：contracts 包按领域拆文件，`index.ts` 只 re-export；不放业务逻辑。

### 风险：一次性迁移范围过大

护栏：按 Phase 1-5 拆子 issue 或小 PR，每个阶段有独立验收。

### 风险：旧格式兼容残留太久

护栏：只允许同一阶段内短期桥接；阶段完成后删除 fallback。

### 风险：SSE 被过度 JSON 化

护栏：SSE 只共享事件 schema，不套 `{ ok,data }`。

### 风险：SSE 校验过重导致流式体验变慢

护栏：SSE 生产消费路径采用分层校验；高频文本 delta 只做轻量关键字段校验，测试 fixture 做全量 schema 校验。

### 风险：本地 API 拆分后安全检查被绕过

护栏：可信来源检查放进 Phase 1 的 HTTP 地基，并用 route 测试覆盖普通 HTTP 与 SSE，不让每个 route module 自己选择要不要检查。

### 风险：Zod 和 TypeBox 职责混淆

护栏：Zod 只用于工作台 HTTP/SSE contracts；TypeBox 继续用于 pi-agent Extension tool `parameters`，不在本次迁移中互相替换。

### 风险：contracts 包变成不可构建的源码共享目录

护栏：`@llm-wiki/workbench-contracts` 必须是可构建 workspace package，有自己的 build/typecheck/test/export，server/web 只从 package export 引用。

### 风险：前端绑到后端内部实现

护栏：web 只 import `@llm-wiki/workbench-contracts`，不 import `workbench/server/src/*`。

### 风险：测试只覆盖 helper，不覆盖真实 route

护栏：必须通过 `createApp().request(...)` 测 route 层。

### 风险：数据边界被路由重构误改

护栏：spec 和测试都保留三类数据边界：知识库数据、应用数据、模型凭证。

## 验收标准

- 新增独立 contracts workspace package，并被 server/web 引用。
- contracts package 可独立 build、typecheck、test，server/web 只从 package export import。
- 普通 JSON 接口迁移后统一返回 `{ ok:true,data } | { ok:false,code,message,details? }`。
- 前端不再为已迁移接口手写一份返回 shape。
- 后端 `index.ts` 不再承担具体 route 处理，启动和请求处理分离。
- 后端 route 按产品领域拆分。
- route module 拆分后仍保留 loopback-only 与可信来源检查。
- 前端 API 按底层 client + 领域 module 拆分。
- SSE 事件有共享 schema，但不套 JSON envelope。
- SSE 生产路径采用分层校验，测试 fixture 做全量 schema 校验。
- artifact 文件下载成功仍返回文件，失败返回统一 error envelope。
- Zod 只用于工作台 HTTP/SSE 契约，现有 TypeBox 继续用于 pi-agent Extension 工具参数。
- 选知识库、切对话、读页面、图谱重建、发送消息、取消发送、生成中重复发送、查看产出物主路径不退化。
- 测试覆盖 contracts、后端 route、前端 client、SSE fixture 和主路径回归。

## 后续实施拆分建议

1. 建立 `@llm-wiki/workbench-contracts`、JSON envelope、错误码、后端 request/response helper、前端 api client 和 `createApp()`。
2. 建立本地 API capability token、可信来源检查、endpoint contract registry 和静态边界检查。
3. 迁移 health/config/models/auth/status/artifacts/refs/page/graph read/layout 等低风险 JSON 路由。
4. 迁移 knowledge-bases 和 conversations。
5. 迁移 prompt、batch digest 和 graph events 的 SSE schema 与生命周期规则。
6. 删除旧格式兼容和大文件残留，补文档和发布记录。

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & product strategy | 0 | not run | Not needed: #158 is internal architecture groundwork with no user-facing feature change. |
| Codex Review | outside voice via engineering subagent | Independent 2nd opinion | 1 | clear after changes | Found 5 blocking gaps: local API token, `createApp(deps)`, endpoint migration registry, typed/redacted error details, SSE lifecycle invariants. All were folded into this spec. |
| Eng Review | `/plan-eng-review` | Architecture, safety, tests, performance | 1 | clear | Reviewed contracts package boundary, Zod/TypeBox split, desktop local API security, phased migration, test matrix, SSE performance. |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | not run | Not needed: this spec explicitly avoids UI/visual/interaction changes. |
| DX Review | `/plan-devex-review` | Developer workflow | 0 | not run | Covered inline by contracts package build/export rules and static boundary checks; no separate DX review needed before implementation planning. |

- **ARCHITECTURE:** `createApp()` must use dependency injection and stay separate from bootstrap/serve/watchers.
- **SECURITY:** local API trust boundary is Phase 1, with loopback-only, per-start capability token, Origin as auxiliary signal, and no GET side effects.
- **CONTRACTS:** Zod owns workbench HTTP/SSE contracts; TypeBox stays with pi-agent Extension tool parameters.
- **MIGRATION:** endpoint contract registry prevents generic client from swallowing both new and old response formats.
- **SSE:** events need both schema and lifecycle invariants; production uses layered validation, tests do full fixture validation.
- **TESTS:** coverage now maps Phase × codepath × user path × failure mode, plus static boundary checks.
- **VERDICT:** ENG CLEARED — ready to write the implementation plan after user review.

NO UNRESOLVED DECISIONS

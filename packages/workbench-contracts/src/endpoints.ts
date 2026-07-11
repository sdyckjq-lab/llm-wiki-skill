import { z } from "zod";

/**
 * Endpoint contract registry —— 迁移期工作台 endpoint 的单一来源。
 *
 * 每个 endpoint 同时携带两维元数据：
 *
 * - `kind`：迁移状态 + 响应形态。决定 endpoint 走哪条调用路径。
 *   - `legacy`        尚未迁移，继续由旧 legacy wrapper（web `lib/api.ts` /
 *     server `index.ts` 手写 handler）处理，返回旧 `{ ok, error }` /
 *     `{ ok:true, items }` 形态。
 *   - `migrated-json` 已迁移到统一 JSON envelope
 *     `{ ok:true, data } | { ok:false, code, message, details? }`，只能由新
 *     `api/client.ts` 的 `request()` 处理。
 *   - `file-download` 成功返回文件 Response，失败返回 JSON error envelope。
 *     显式例外：不能被普通 JSON client 当作 envelope 误处理。
 *   - `sse`          启动请求 + 事件流按 SSE 契约处理。显式例外：不套 envelope。
 *
 * - `safety`：本地 API 信任边界分类（#166 消费，本包只提供 metadata 单一来源）。
 *   - `read-only`       无副作用，豁免 capability token（health、只读 graph
 *     events、文件下载、各类 list / read）。
 *   - `state-changing`  会读写文件、改配置、触发模型、启动 SSE、取消任务，必须
 *     带本次启动的 capability token。
 *
 * 设计要点（spec §7 + §9）：
 *
 * - 不写两套分类表：`ENDPOINT_REGISTRY` 是唯一来源，`MigratedJsonPath` 等类型与
 *   `MIGRATED_JSON_PATHS` 等常量都从它派生。
 * - 新 `api/client.ts` 的 `request()` 在类型层只接受 `MigratedJsonPath`，从而在
 *   编译期阻止业务代码用新 client 误调 legacy endpoint。
 * - 路由迁移时在这里改对应 entry 的 `kind`（legacy -> migrated-json），调用路径
 *   与安全边界随之收敛，无需在多处同步。
 * - 当前只服务 workbench 路由迁移；安全策略实现留给 #166。
 */

// ============= HTTP method =============

export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

// ============= endpoint kind / safety =============

/** endpoint 迁移状态与响应形态（见模块注释）。 */
export const EndpointKindSchema = z.enum([
	"legacy",
	"migrated-json",
	"file-download",
	"sse",
]);
export type EndpointKind = z.infer<typeof EndpointKindSchema>;

/**
 * endpoint 本地 API 安全分类（#166 消费）。read-only 豁免 capability token；
 * state-changing 必须带 token。未登记 endpoint 默认按 state-changing 处理
 * （见 isReadOnly 的安全默认）。
 */
export const EndpointSafetySchema = z.enum(["read-only", "state-changing"]);
export type EndpointSafety = z.infer<typeof EndpointSafetySchema>;

// ============= endpoint entry =============

/** 单个 endpoint 的契约元数据。字段全 readonly，保证 `as const` 派生稳定。 */
export interface EndpointEntry {
	readonly method: HttpMethod;
	/**
	 * 路由 path。动态段用 Hono 风格 `:param`
	 * （如 `/api/artifacts/:id/files/:filename`）。
	 */
	readonly path: string;
	readonly kind: EndpointKind;
	readonly safety: EndpointSafety;
	/** 可选说明，记录分类依据（尤其 safety 的判定理由），供 #166 复核。 */
	readonly description?: string;
}

/** 运行时校验单个 entry 形状，用于 registry 自检测试。 */
export const EndpointEntrySchema = z.object({
	method: HttpMethodSchema,
	path: z.string(),
	kind: EndpointKindSchema,
	safety: EndpointSafetySchema,
	description: z.string().optional(),
});

// ============= registry（单一来源） =============
//
// 登记当前 workbench 后端全部 endpoint（见 server/src/index.ts 实际路由）。
// 新增 / 迁移路由时在此同步：新增 entry，或把 legacy 改为 migrated-json。
// 迁移完成后该 entry 不再保留 legacy 形态（由新 client 与统一 response helper 保证）。

export const ENDPOINT_REGISTRY = [
	// ---------- migrated-json（已迁移到统一 envelope） ----------
	{
		method: "GET",
		path: "/api/health",
		kind: "migrated-json",
		safety: "read-only",
		description: "心跳，无副作用，豁免 token",
	},

	// ---------- sse（显式例外：启动请求 + 事件流） ----------
	{
		method: "GET",
		path: "/api/events",
		kind: "sse",
		safety: "read-only",
		description: "图谱 EventSource，只读",
	},
	{
		method: "POST",
		path: "/api/prompt",
		kind: "sse",
		safety: "state-changing",
		description: "agent 事件流，触发模型",
	},
	{
		method: "POST",
		path: "/api/knowledge-bases/batch-digest",
		kind: "sse",
		safety: "state-changing",
		description: "批量 digest，触发模型",
	},

	// ---------- file-download（显式例外：成功返回文件，失败返回 envelope） ----------
	{
		method: "GET",
		path: "/api/artifacts/:id/files/:filename",
		kind: "file-download",
		safety: "read-only",
		description: "产物文件下载，无副作用",
	},

	// ---------- legacy（未迁移，继续由 legacy wrapper 处理） ----------
	{
		method: "POST",
		path: "/api/echo",
		kind: "legacy",
		safety: "read-only",
		description: "诊断回显，无副作用",
	},
	{
		method: "GET",
		path: "/api/knowledge-bases",
		kind: "migrated-json",
		safety: "read-only",
		description: "列出知识库",
	},
	{
		method: "POST",
		path: "/api/knowledge-bases/external",
		kind: "migrated-json",
		safety: "state-changing",
		description: "登记外部库，写应用数据",
	},
	{
		method: "POST",
		path: "/api/knowledge-bases/inspect",
		kind: "migrated-json",
		safety: "read-only",
		description: "读取路径信息",
	},
	{
		method: "DELETE",
		path: "/api/knowledge-bases/external",
		kind: "migrated-json",
		safety: "state-changing",
		description: "取消登记，写应用数据",
	},
	{
		method: "POST",
		path: "/api/knowledge-bases/new",
		kind: "legacy",
		safety: "state-changing",
		description: "新建知识库，写文件",
	},
	{
		method: "POST",
		path: "/api/knowledge-bases/init-existing",
		kind: "legacy",
		safety: "state-changing",
		description: "初始化已有库，写文件",
	},
	{
		method: "GET",
		path: "/api/knowledge-base",
		kind: "migrated-json",
		safety: "read-only",
		description: "当前活跃上下文",
	},
	{
		method: "POST",
		path: "/api/knowledge-base",
		kind: "migrated-json",
		safety: "state-changing",
		description: "选择知识库，改 active context",
	},
	{
		method: "DELETE",
		path: "/api/knowledge-base",
		kind: "migrated-json",
		safety: "state-changing",
		description: "清空 active context",
	},
	{
		method: "GET",
		path: "/api/graph",
		kind: "migrated-json",
		safety: "read-only",
		description: "读图谱",
	},
	{
		method: "POST",
		path: "/api/graph/rebuild",
		kind: "migrated-json",
		safety: "state-changing",
		description: "重建图谱，触发后台任务 / 写缓存",
	},
	{
		method: "GET",
		path: "/api/graph/layout",
		kind: "migrated-json",
		safety: "read-only",
		description: "读图谱布局",
	},
	{
		method: "PUT",
		path: "/api/graph/layout",
		kind: "migrated-json",
		safety: "state-changing",
		description: "写图谱布局",
	},
	{
		method: "GET",
		path: "/api/refs",
		kind: "migrated-json",
		safety: "read-only",
		description: "页面引用候选",
	},
	{
		method: "GET",
		path: "/api/page",
		kind: "migrated-json",
		safety: "read-only",
		description: "读 wiki 页面",
	},
	{
		method: "GET",
		path: "/api/commands",
		kind: "legacy",
		safety: "read-only",
		description: "slash 命令列表",
	},
	{
		method: "GET",
		path: "/api/config",
		kind: "migrated-json",
		safety: "read-only",
		description: "读配置",
	},
	{
		method: "POST",
		path: "/api/config",
		kind: "migrated-json",
		safety: "state-changing",
		description: "写配置",
	},
	{
		method: "GET",
		path: "/api/models",
		kind: "migrated-json",
		safety: "read-only",
		description: "可用模型列表",
	},
	{
		method: "POST",
		path: "/api/system/choose-directory",
		kind: "legacy",
		safety: "state-changing",
		description: "触发系统目录选择器（osascript）；不改工作台状态但触发外部进程，保守要求 token",
	},
	{
		method: "GET",
		path: "/api/artifacts",
		kind: "migrated-json",
		safety: "read-only",
		description: "列出产物",
	},
	{
		method: "GET",
		path: "/api/artifacts/:id",
		kind: "migrated-json",
		safety: "read-only",
		description: "产物 manifest",
	},
	{
		method: "GET",
		path: "/api/auth/status",
		kind: "migrated-json",
		safety: "read-only",
		description: "认证状态",
	},
	{
		method: "POST",
		path: "/api/auth/set",
		kind: "legacy",
		safety: "state-changing",
		description: "写入凭证",
	},
	{
		method: "POST",
		path: "/api/auth/test",
		kind: "legacy",
		safety: "state-changing",
		description: "向 provider 验证 key；不改本地状态但发起外部调用，保守要求 token",
	},
	{
		method: "GET",
		path: "/api/conversations",
		kind: "migrated-json",
		safety: "read-only",
		description: "列出对话",
	},
	{
		method: "POST",
		path: "/api/conversations",
		kind: "migrated-json",
		safety: "state-changing",
		description: "切换对话，改 active context",
	},
	{
		method: "POST",
		path: "/api/conversations/new",
		kind: "migrated-json",
		safety: "state-changing",
		description: "新建对话",
	},
] as const satisfies readonly EndpointEntry[];

// ============= 从 registry 派生：migrated-json path =============
//
// MigratedJsonPath 是 web `api/client.ts` 的 `request()` path 参数类型，编译期
// 锁死：业务代码只能用新 client 调已迁移 endpoint，误调 legacy endpoint 会被
// `npm run typecheck` 拒绝（静态检查）。派生自 registry，不维护第二份列表。

type RegistryEntry = (typeof ENDPOINT_REGISTRY)[number];

/** 当前已迁移到统一 envelope 的静态 endpoint path 字面量联合。 */
export type MigratedJsonPath = Extract<
	RegistryEntry,
	{ kind: "migrated-json" }
>["path"];

/** 已迁移 endpoint path 列表（运行时校验 / 派生一致性测试用）。 */
export const MIGRATED_JSON_PATHS: readonly MigratedJsonPath[] =
	ENDPOINT_REGISTRY.filter(
		(e): e is Extract<RegistryEntry, { kind: "migrated-json" }> =>
			e.kind === "migrated-json",
	).map((e) => e.path);

/** 运行时判别：path 是否属于已迁移 endpoint（legacy 返回 false）。 */
export function isMigratedJsonPath(path: string): path is MigratedJsonPath {
	return (MIGRATED_JSON_PATHS as readonly string[]).includes(path);
}

// ============= 从 registry 派生：安全边界查询（#166） =============
//
// 把 (method, path) 映射到 endpoint 的 safety，供本地 API 安全中间件判定
// “该请求是否需要本次启动的 capability token”。与 migrated-json 派生一样，
// 这里只读 ENDPOINT_REGISTRY 单一来源，不维护第二份分类表。
//
// path 用 Hono 风格 `:param` 登记动态段（如 `/api/artifacts/:id/files/:filename`）。
// 下面把每条 entry 的 pattern 预编译成 RegExp，请求时按 method + path 匹配。

/**
 * 携带本地 capability token 的请求头名（#166）。
 * 后端中间件据此头校验，dev 代理 / 未来桌面壳据此头注入。单一来源，避免双端
 * 各写一份字面量后漂移（漂移会导致安全检查静默失效）。
 */
export const CAPABILITY_TOKEN_HEADER = "X-LLM-Wiki-Workbench-Token";

/** 把 Hono 风格 `:param` path 编译成完整匹配的 RegExp（:param -> [^/]+）。 */
function compilePathPattern(pattern: string): RegExp {
	const escaped = pattern
		.split("/")
		.map((segment) =>
			segment.startsWith(":")
				? `[^/]+`
				: segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
		)
		.join("/");
	return new RegExp(`^${escaped}$`);
}

/** 预编译的 registry：entry + 可匹配 path 的 RegExp。模块加载时一次性建好。 */
interface CompiledEntry {
	readonly entry: EndpointEntry;
	readonly pattern: RegExp;
}
const COMPILED_REGISTRY: readonly CompiledEntry[] = ENDPOINT_REGISTRY.map(
	(entry) => ({ entry, pattern: compilePathPattern(entry.path) }),
);

/**
 * 按 (method, path) 查找 endpoint 元数据。path 支持动态段实际值匹配
 * （如 `/api/artifacts/abc/files/x.md` 命中 `/api/artifacts/:id/files/:filename`）。
 * 未登记 endpoint 返回 undefined。
 */
export function findEndpoint(
	method: string,
	path: string,
): EndpointEntry | undefined {
	const normalized = method.toUpperCase();
	for (const { entry, pattern } of COMPILED_REGISTRY) {
		if (entry.method === normalized && pattern.test(path)) return entry;
	}
	return undefined;
}

/**
 * 该请求是否需要本地 capability token（#166 安全中间件消费）。
 *
 * - 命中 `state-changing` endpoint → 需要 token。
 * - 命中 `read-only` endpoint → 豁免（显式白名单）。
 * - 未登记 endpoint → **安全默认：需要 token**（fail closed，避免漏网的新增状态改写路由）。
 */
export function requiresCapabilityToken(method: string, path: string): boolean {
	const entry = findEndpoint(method, path);
	if (!entry) return true;
	return entry.safety === "state-changing";
}

// ============= 静态自检（编译期护栏，被 typecheck 覆盖） =============
//
// 编译期证明 graph rebuild 已迁移，可由 typed client 调用。若 endpoint
// 退回 legacy-json，赋值会触发类型错误，强制同步更新 client 与契约。
const _graphRebuildAcceptedByClient: MigratedJsonPath = "/api/graph/rebuild";
void _graphRebuildAcceptedByClient;

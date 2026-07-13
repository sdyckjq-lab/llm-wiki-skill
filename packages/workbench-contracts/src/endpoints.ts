import { z } from "zod";

/**
 * Endpoint contract registry —— 迁移期工作台 endpoint 的单一来源。
 *
 * 每个 endpoint 同时携带两维元数据：
 *
 * - `kind`：迁移状态 + 响应形态。决定 endpoint 走哪条调用路径。
 *   - `legacy`        尚未迁移，继续由隔离的 legacy wrapper（web `lib/api/legacy.ts` /
 *     server `runtime-app.ts` 手写 handler）处理，返回旧 `{ ok, error }` /
 *     `{ ok:true, items }` 形态。
 *   - `migrated-json` 已迁移到统一 JSON envelope
 *     `{ ok:true, data } | { ok:false, code, message, details? }`，只能由新
 *     `api/client.ts` 的 `request()` 处理。
 *   - `file-download` 成功返回文件 Response，失败返回 JSON error envelope。
 *     显式例外：不能被普通 JSON client 当作 envelope 误处理。
 *   - `sse`          启动请求 + 事件流按 SSE 契约处理。显式例外：不套 envelope。
 *
 * - `safety`：本地 API 信任边界分类（#166 消费，本包只提供 metadata 单一来源）。
 *   - `public`          不接触用户内容的公开探活入口。
 *   - `read-only`       无副作用但会读取本地内容，必须同时通过可信来源与
 *     capability token（只读 graph events、文件下载、各类 list / read）。
 *   - `state-changing`  会读写文件、改配置、触发模型、启动 SSE、取消任务，必须
 *     带本次启动的 capability token。
 *
 * 设计要点（spec §7 + §9）：
 *
 * - 不写两套分类表：`ENDPOINT_REGISTRY` 是唯一来源，`MigratedJsonEndpoint` 等
 *   类型与 `MIGRATED_JSON_ENDPOINTS` 等常量都从它派生。
 * - 新 `api/client.ts` 的 `request()` 在类型层只接受 `MigratedJsonEndpoint`，
 *   从而在编译期阻止业务代码误配 method/path 或调用非 migrated-json endpoint。
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
 * endpoint 本地 API 安全分类（#166 消费）。public 无需本地信任证明；
 * read-only 与 state-changing 都要求可信来源和 token，二者区别是有无副作用。
 * 未登记 endpoint 默认按 state-changing 处理。
 */
export const EndpointSafetySchema = z.enum([
	"public",
	"read-only",
	"state-changing",
]);
export type EndpointSafety = z.infer<typeof EndpointSafetySchema>;

/** 开发工作台的固定同源入口；server 与 Vite 代理共享，避免来源清单漂移。 */
export const DEV_WORKBENCH_ORIGINS = [
	"http://localhost:5180",
	"http://127.0.0.1:5180",
] as const;

export interface RequestSourceSignals {
	readonly origin?: string;
	readonly fetchSite?: string;
}

/** 明确冲突的浏览器来源信号优先拒绝，即便另一个信号看似可信。 */
export function isExplicitlyUntrustedSource(
	signals: RequestSourceSignals,
	trustedOrigins: ReadonlySet<string>,
): boolean {
	return (
		signals.fetchSite === "cross-site" ||
		(signals.origin !== undefined &&
			signals.origin !== "null" &&
			!trustedOrigins.has(signals.origin))
	);
}

/** 显式 Origin 优先；`null` 不能借 same-origin 信号冒充可信浏览器来源。 */
export function hasTrustedBrowserSource(
	signals: RequestSourceSignals,
	trustedOrigins: ReadonlySet<string>,
): boolean {
	if (signals.origin !== undefined) return trustedOrigins.has(signals.origin);
	return signals.fetchSite === "same-origin";
}

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
// 登记当前 workbench 后端全部 endpoint（见 server/src/runtime-app.ts 实际组装）。
// 新增 / 迁移路由时在此同步：新增 entry，或把 legacy 改为 migrated-json。
// 迁移完成后该 entry 不再保留 legacy 形态（由新 client 与统一 response helper 保证）。

function freezeEndpointEntries<const Entries extends readonly EndpointEntry[]>(
	entries: Entries,
): Entries {
	for (const entry of entries) Object.freeze(entry);
	return Object.freeze(entries) as Entries;
}

export const ENDPOINT_REGISTRY = freezeEndpointEntries([
	// ---------- migrated-json（已迁移到统一 envelope） ----------
	{
		method: "GET",
		path: "/api/health",
		kind: "migrated-json",
		safety: "public",
		description: "心跳，不读取本地内容，可公开探活",
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

	// ---------- remaining endpoints（legacy 与已迁移状态按 entry 明确登记） ----------
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
] as const satisfies readonly EndpointEntry[]);

// ============= 从 registry 派生：migrated-json method + path =============
//
// MigratedJsonEndpoint 是 web `api/client.ts` 的 `request()` endpoint 参数类型，
// 编译期把 method + path 锁成 registry 里的合法组合。派生自 registry，不维护
// 第二份列表。

type RegistryEntry = (typeof ENDPOINT_REGISTRY)[number];

type MethodPath<Entry extends EndpointEntry> = Entry extends EndpointEntry
	? Pick<Entry, "method" | "path">
	: never;

function toMethodPath<Entry extends EndpointEntry>(entry: Entry): MethodPath<Entry> {
	return { method: entry.method, path: entry.path } as MethodPath<Entry>;
}

/** 已迁移 JSON endpoint 的 method + path 判别联合，不能交叉组合。 */
export type MigratedJsonEndpoint = MethodPath<
	Extract<RegistryEntry, { kind: "migrated-json" }>
>;

/** 当前已迁移到统一 envelope 的静态 endpoint path 字面量联合。 */
export type MigratedJsonPath = Extract<
	RegistryEntry,
	{ kind: "migrated-json" }
>["path"];

const migratedJsonEndpoints =
	ENDPOINT_REGISTRY.filter(
		(e): e is Extract<RegistryEntry, { kind: "migrated-json" }> =>
			e.kind === "migrated-json",
	).map(toMethodPath);

/** 已迁移 endpoint 组合列表（运行时校验用），从 registry 派生。 */
export const MIGRATED_JSON_ENDPOINTS: readonly MigratedJsonEndpoint[] =
	Object.freeze(
		migratedJsonEndpoints.map((endpoint) => Object.freeze(endpoint)),
	);

/** 已迁移 endpoint path 列表（运行时校验 / 派生一致性测试用）。 */
export const MIGRATED_JSON_PATHS: readonly MigratedJsonPath[] =
	Object.freeze(MIGRATED_JSON_ENDPOINTS.map((endpoint) => endpoint.path));

function endpointKey(method: string, path: string): string {
	return `${method} ${path}`;
}

const MIGRATED_JSON_ENDPOINT_KEYS: ReadonlySet<string> = new Set(
	MIGRATED_JSON_ENDPOINTS.map((endpoint) =>
		endpointKey(endpoint.method, endpoint.path),
	),
);
const MIGRATED_JSON_PATH_SET: ReadonlySet<string> = new Set(MIGRATED_JSON_PATHS);

/** 运行时判别：path 是否属于已迁移 endpoint（legacy 返回 false）。 */
export function isMigratedJsonPath(path: string): path is MigratedJsonPath {
	return MIGRATED_JSON_PATH_SET.has(path);
}

/** 运行时判别：method + registry path 是否为已迁移 JSON endpoint 的合法组合。 */
export function isMigratedJsonEndpoint(
	endpoint: unknown,
): endpoint is MigratedJsonEndpoint {
	if (typeof endpoint !== "object" || endpoint === null) return false;
	const { method, path } = endpoint as { method?: unknown; path?: unknown };
	return typeof method === "string" &&
		typeof path === "string" &&
		MIGRATED_JSON_ENDPOINT_KEYS.has(endpointKey(method, path));
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
 * - 命中 `public` endpoint → 豁免 token。
 * - 命中 `read-only` / `state-changing` endpoint → 需要 token。
 * - 未登记 endpoint → **安全默认：需要 token**（fail closed，避免漏网的新增状态改写路由）。
 */
export function requiresCapabilityToken(method: string, path: string): boolean {
	return findEndpoint(method, path)?.safety !== "public";
}

/**
 * 该请求是否必须证明来自可信工作台来源。
 * 只有显式登记为 public 的入口豁免；未登记入口默认关闭。
 */
export function requiresTrustedSource(method: string, path: string): boolean {
	return findEndpoint(method, path)?.safety !== "public";
}

// ============= 静态自检（编译期护栏，被 typecheck 覆盖） =============
//
// 编译期证明 graph rebuild 已迁移，可由 typed client 调用。若 endpoint 退回
// legacy-json，或 method/path 不再配对，赋值会触发类型错误。
const _graphRebuildAcceptedByClient: MigratedJsonEndpoint = {
	method: "POST",
	path: "/api/graph/rebuild",
};
void _graphRebuildAcceptedByClient;

// 反例：即使 path 已迁移，也不能搭配 registry 未登记的方法。
// @ts-expect-error POST /api/health is not a registered migrated-json endpoint
const _wrongMethodRejectedByClient: MigratedJsonEndpoint = {
	method: "POST",
	path: "/api/health",
};
void _wrongMethodRejectedByClient;

const _legacyRejectedByClient: MigratedJsonEndpoint = {
	method: "GET",
	// @ts-expect-error legacy endpoints stay in the isolated legacy client
	path: "/api/commands",
};
void _legacyRejectedByClient;

const _sseRejectedByClient: MigratedJsonEndpoint = {
	method: "POST",
	// @ts-expect-error SSE endpoints stay in their stream-specific clients
	path: "/api/prompt",
};
void _sseRejectedByClient;

const _fileDownloadRejectedByClient: MigratedJsonEndpoint = {
	method: "GET",
	// @ts-expect-error file downloads stay in their response-specific client path
	path: "/api/artifacts/:id/files/:filename",
};
void _fileDownloadRejectedByClient;

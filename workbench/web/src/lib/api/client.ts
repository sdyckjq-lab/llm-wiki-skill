import { z } from "zod";

import {
	FailureEnvelopeSchema,
	SuccessEnvelopeSchema,
	findEndpoint,
	isMigratedJsonEndpoint,
	type FailureEnvelope,
	type MigratedJsonEndpoint,
	type MigratedJsonPath,
} from "@llm-wiki/workbench-contracts";

/**
 * 工作台统一底层 API client。
 *
 * 只服务已迁移到统一 JSON envelope（`{ ok:true, data } | { ok:false, code,
 * message, details? }`）的 endpoint（migrated-json）。不吞旧响应格式：遇到旧
 * 格式（无 ok 字段、`{ ok:true, items }` 等）一律判为契约不符并抛
 * ContractMismatchError。未迁移 endpoint 继续走 legacy.ts，互不污染。
 */

/** 后端失败 envelope 抛出的错误。业务逻辑用 code 判断，不依赖 message。 */
export class ApiError extends Error {
	code: string;
	details: unknown;
	constructor(failure: FailureEnvelope) {
		super(failure.message);
		this.name = "ApiError";
		this.code = failure.code;
		this.details = failure.details;
	}
}

/** 响应既不是统一成功也不是统一失败 envelope（旧格式 / 畸形）时抛出。 */
export class ContractMismatchError extends Error {
	path: string;
	status: number;
	constructor(path: string, status: number) {
		super(`响应不符合工作台统一契约（${path}）`);
		this.name = "ContractMismatchError";
		this.path = path;
		this.status = status;
	}
}

/** 调用方绕过类型后提供了未登记的 method + path 组合。 */
export class EndpointContractError extends Error {
	readonly method: string;
	readonly path: string;
	constructor(method: string, path: string) {
		super(`endpoint contract 未登记（${method} ${path}）`);
		this.name = "EndpointContractError";
		this.method = method;
		this.path = path;
	}
}

export interface RequestOptions<T> {
	/** 响应 data 的 Zod schema；client 用它校验成功 envelope 的 data。 */
	responseSchema: z.ZodType<T>;
	body?: unknown;
	/** query 参数由 client 编码，避免领域 module 绕过 registry path。 */
	query?: Record<string, string | number | undefined>;
	/** 替换 registry path 中的动态段（如 `:id`），不能改变 endpoint 结构。 */
	pathParams?: Record<string, string>;
	signal?: AbortSignal;
}

/**
 * 发起请求并按统一 envelope 解析响应。
 *
 * - 成功 envelope -> 返回 data（已按 responseSchema 校验）。
 * - 失败 envelope -> 抛 ApiError（带 code / details）。
 * - 旧格式 / data 校验失败 -> 抛 ContractMismatchError，绝不静默吞掉。
 *
 * `endpoint` 类型为 MigratedJsonEndpoint（派生自 registry）：编译期把 method +
 * path 锁成合法组合。运行时在 fetch 前再次核对同一 registry，防止 `as` 或无类型
 * 调用绕过。未迁移 endpoint 继续走 legacy.ts，互不污染。
 */
export async function request<T>(
	endpoint: MigratedJsonEndpoint,
	options: RequestOptions<T>,
): Promise<T> {
	const snapshot = snapshotEndpoint(endpoint);
	if (!isMigratedJsonEndpoint(snapshot)) {
		throw new EndpointContractError(snapshot.method, snapshot.path);
	}
	const { method, path } = snapshot;
	const init: RequestInit = { method };
	if (options.body !== undefined) {
		init.headers = { "Content-Type": "application/json" };
		init.body = JSON.stringify(options.body);
	}
	if (options.signal) {
		init.signal = options.signal;
	}

	const fetchPath = buildFetchPath(path, options.pathParams, options.query);
	const normalizedPath = new URL(fetchPath, "http://workbench.invalid").pathname;
	const matched = findEndpoint(method, normalizedPath);
	if (
		matched?.kind !== "migrated-json" ||
		matched.method !== method ||
		matched.path !== path
	) {
		throw new EndpointContractError(method, normalizedPath);
	}
	const res = await fetch(fetchPath, init);
	const json: unknown = await res.json();

	const failureParse = FailureEnvelopeSchema.safeParse(json);
	if (failureParse.success) {
		throw new ApiError(failureParse.data);
	}

	const successParse = SuccessEnvelopeSchema(
		options.responseSchema,
	).safeParse(json);
	if (!successParse.success) {
		throw new ContractMismatchError(path, res.status);
	}
	return successParse.data.data;
}

function snapshotEndpoint(endpoint: unknown): { method: string; path: string } {
	if (typeof endpoint !== "object" || endpoint === null) {
		throw new EndpointContractError("<invalid>", "<invalid>");
	}
	let method: unknown;
	let path: unknown;
	try {
		({ method, path } = endpoint as { method?: unknown; path?: unknown });
	} catch {
		throw new EndpointContractError("<invalid>", "<invalid>");
	}
	if (typeof method !== "string" || typeof path !== "string") {
		throw new EndpointContractError(
			typeof method === "string" ? method : "<invalid>",
			typeof path === "string" ? path : "<invalid>",
		);
	}
	return { method, path };
}

function buildFetchPath(
	path: MigratedJsonPath,
	pathParams: Record<string, string> | undefined,
	query: Record<string, string | number | undefined> | undefined,
): string {
	const resolvedPath = path.replace(/:([A-Za-z0-9_]+)/g, (_match, key: string) => {
		const value = pathParams?.[key];
		if (value === undefined) {
			throw new Error(`缺少 endpoint path 参数：${key}`);
		}
		return encodeURIComponent(value);
	});
	if (!query) return resolvedPath;
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined) search.set(key, String(value));
	}
	const suffix = search.toString();
	return suffix ? `${resolvedPath}?${suffix}` : resolvedPath;
}

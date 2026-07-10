import { z } from "zod";

import {
	FailureEnvelopeSchema,
	SuccessEnvelopeSchema,
	type FailureEnvelope,
	type MigratedJsonPath,
} from "@llm-wiki/workbench-contracts";

/**
 * 工作台统一底层 API client。
 *
 * 只服务已迁移到统一 JSON envelope（`{ ok:true, data } | { ok:false, code,
 * message, details? }`）的 endpoint（migrated-json）。不吞旧响应格式：遇到旧
 * 格式（无 ok 字段、`{ ok:true, items }` 等）一律判为契约不符并抛
 * ContractMismatchError。未迁移 endpoint 继续走 legacy api.ts，互不污染。
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

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface RequestOptions<T> {
	/** 响应 data 的 Zod schema；client 用它校验成功 envelope 的 data。 */
	responseSchema: z.ZodType<T>;
	method?: HttpMethod;
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
 * `path` 类型为 MigratedJsonPath（派生自 @llm-wiki/workbench-contracts 的
 * endpoint registry）：编译期锁死，业务代码只能用本 client 调已迁移 endpoint，
 * 误调 legacy endpoint 会被 `npm run typecheck` 拒绝（静态检查）。未迁移
 * endpoint 继续走 legacy api.ts，互不污染。
 */
export async function request<T>(
	path: MigratedJsonPath,
	options: RequestOptions<T>,
): Promise<T> {
	const init: RequestInit = { method: options.method ?? "GET" };
	if (options.body !== undefined) {
		init.headers = { "Content-Type": "application/json" };
		init.body = JSON.stringify(options.body);
	}
	if (options.signal) {
		init.signal = options.signal;
	}

	const fetchPath = buildFetchPath(path, options.pathParams, options.query);
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

import type { Context } from "hono";
import type { ZodType } from "zod";
import {
	errorCodeToHttpStatus,
	type ErrorDetails,
	type WorkbenchErrorCode,
} from "@llm-wiki/workbench-contracts";

/**
 * 工作台 HTTP 契约错误：带稳定 code、可公开 details、HTTP 大类状态码。
 * route 抛出后由 createApp 的 onError 统一映射成失败 envelope。
 */
export class HttpContractError extends Error {
	constructor(
		public readonly code: WorkbenchErrorCode,
		message: string,
		public readonly details?: ErrorDetails,
	) {
		super(message);
		this.name = "HttpContractError";
	}
	get httpStatus(): number {
		return errorCodeToHttpStatus[this.code];
	}
}

/**
 * 解析 JSON body。解析失败抛 INVALID_JSON 契约错误（由 onError 映射为 envelope）。
 */
export async function parseJsonBody(c: Context): Promise<unknown> {
	try {
		return await c.req.json();
	} catch {
		throw new HttpContractError("INVALID_JSON", "请求体不是有效的 JSON");
	}
}

export function parseValidatedInput<T>(
	schema: ZodType<T>,
	input: unknown,
): T {
	const result = schema.safeParse(input);
	if (!result.success) {
		throw new HttpContractError("INVALID_REQUEST", "请求字段不符合 schema", {
			issues: result.error.issues.map((issue) => ({
				path: issue.path.join("."),
				message: issue.message,
			})),
		});
	}
	return result.data;
}

/**
 * 解析并按 schema 校验 JSON body。校验失败抛 INVALID_REQUEST，details 只含
 * 字段级 issues（path + message），不含原始 body。
 */
export async function parseValidatedBody<T>(
	c: Context,
	schema: ZodType<T>,
): Promise<T> {
	return parseValidatedInput(schema, await parseJsonBody(c));
}

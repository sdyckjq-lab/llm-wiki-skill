import { randomUUID } from "node:crypto";

import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { MiddlewareHandler } from "hono";

import { failure } from "@llm-wiki/workbench-contracts";

import { HttpContractError } from "./http/request.js";
import { createArtifactRoutes, defaultArtifactRouteService, type ArtifactRouteService } from "./routes/artifacts.js";
import { createAuthRoutes, defaultAuthRouteService, type AuthRouteService } from "./routes/auth.js";
import { createConfigRoutes, createModelRoutes, defaultConfigRouteService, type ConfigRouteService } from "./routes/config.js";
import { createHealthRoutes } from "./routes/health.js";
import { createKnowledgeBaseRoutes, defaultKnowledgeBaseRouteService, type KnowledgeBaseRouteService } from "./routes/knowledge-bases.js";
import { createPageRoutes, defaultPageRouteService, type PageRouteService } from "./routes/pages.js";

export type WorkbenchAppMode = "test" | "dev" | "desktop";

/**
 * createApp 的依赖注入。route 测试传 fake deps，不读写真实
 * `~/.llm-wiki-agent/` 或知识库目录。
 */
export interface WorkbenchAppDeps {
	/**
	 * 运行模式。test 模式下 INTERNAL_ERROR 带脱敏 diagnostic id；
	 * dev/desktop 默认不带 details。
	 */
	mode?: WorkbenchAppMode;
	/**
	 * 可信来源 / capability token 统一检查接入点（#166 注入实现）。
	 * 会改文件、触发模型、改配置、启动 SSE 的端点都应在此校验；
	 * 只读白名单 vs state-changing 的判定以 @llm-wiki/workbench-contracts 的
	 * ENDPOINT_REGISTRY（每 endpoint 的 safety 字段）为单一来源（spec §7 / §9，#167）。
	 */
	security?: MiddlewareHandler;
	/** 设置 / 模型 route 依赖；测试可注入 fake，真实启动用默认实现。 */
	configService?: ConfigRouteService;
	/** 认证状态 route 依赖；测试可注入 fake，真实启动用默认实现。 */
	authService?: AuthRouteService;
	/** 知识库 / active context route 依赖；route 测试必须注入 fake。 */
	knowledgeBaseService?: KnowledgeBaseRouteService;
	/** wiki 页面读取 / 引用候选 route 依赖。 */
	pageService?: PageRouteService;
	/** artifact manifest/list/file route 依赖。 */
	artifactService?: ArtifactRouteService;
}

/**
 * 组装工作台 Hono app：统一错误兜底 + 可信来源接入点 + 已迁移 route module。
 *
 * createApp 只做请求处理组装，不监听端口、不 bootstrap、不恢复 watcher、
 * 不读写真实用户目录。bootstrap / serve / watcher 都留在 index.ts。
 *
 * route 测试可直接 `createApp(deps).request('/api/health')`，无需启动端口。
 */
export function createApp(deps: WorkbenchAppDeps = {}): Hono {
	const app = new Hono();

	// 1. 统一错误兜底：
	//    - HttpContractError -> 失败 envelope（code/message/details），状态码由 code 决定。
	//    - 其它未捕获错误 -> INTERNAL_ERROR envelope（500），绝不泄露 stack / 路径 / key。
	app.onError((err, c) => {
		if (err instanceof HttpContractError) {
			return c.json(
				failure(err.code, err.message, err.details),
				err.httpStatus as ContentfulStatusCode,
			);
		}
		const details =
			deps.mode === "test"
				? { diagnosticId: redactedDiagnosticId() }
				: undefined;
		return c.json(failure("INTERNAL_ERROR", "服务器内部错误", details), 500);
	});

	// 2. 可信来源 / capability token 统一接入点（#166 实现；#165 预留）。
	//    注入 deps.security 后，所有 /api/* 请求先过它。
	if (deps.security) {
		app.use("/api/*", deps.security);
	}

	// 3. 已迁移 route module：统一经过 request / response / security 接入点。
	app.route("/api/health", createHealthRoutes());
	app.route("/api/config", createConfigRoutes(deps.configService ?? defaultConfigRouteService));
	app.route("/api/models", createModelRoutes(deps.configService ?? defaultConfigRouteService));
	app.route("/api/auth", createAuthRoutes(deps.authService ?? defaultAuthRouteService));
	app.route(
		"/api",
		createKnowledgeBaseRoutes(
			deps.knowledgeBaseService ?? defaultKnowledgeBaseRouteService,
		),
	);
	app.route(
		"/api",
		createPageRoutes(deps.pageService ?? defaultPageRouteService),
	);
	app.route(
		"/api",
		createArtifactRoutes(deps.artifactService ?? defaultArtifactRouteService),
	);

	return app;
}

/**
 * 生成脱敏 diagnostic id：随机 token，不含错误 message / stack / 路径 / key。
 * 服务端日志据此 token 关联详细错误（日志关联在后续阶段实现）。
 */
function redactedDiagnosticId(): string {
	return randomUUID().slice(0, 8);
}

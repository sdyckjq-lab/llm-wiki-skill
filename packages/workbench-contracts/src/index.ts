/**
 * @llm-wiki/workbench-contracts
 *
 * 工作台前后端共享的 HTTP/SSE 契约。只承担契约职责：Zod schema、从 schema
 * 推导的 TypeScript 类型、稳定错误码、JSON envelope。不读写文件、不调用
 * Hono / React / pi-agent、不知道任何业务实现。
 *
 * server 和 web 只从 package export import，不深路径读取 src。
 * Zod 只服务工作台 HTTP/SSE 契约；pi-agent Extension 的 tool parameters
 * 继续用 TypeBox，两者职责不混淆。
 */

export * from "./errors.js";
export * from "./json.js";
export * from "./health.js";
export * from "./config.js";
export * from "./auth.js";
export * from "./knowledge-bases.js";
export * from "./pages.js";
export * from "./artifacts.js";
export * from "./endpoints.js";

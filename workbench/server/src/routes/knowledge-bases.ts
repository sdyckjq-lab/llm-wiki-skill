import { execFile } from "node:child_process";
import { basename } from "node:path";
import { promisify } from "node:util";

import { Hono } from "hono";

import {
	ActiveKnowledgeBaseDataSchema,
	ChooseDirectoryDataSchema,
	ConflictDetailsSchema,
	CreateKnowledgeBaseBodySchema,
	CreateKnowledgeBaseDataSchema,
	InitExistingKnowledgeBaseBodySchema,
	InitExistingKnowledgeBaseDataSchema,
	InspectKnowledgeBasePathDataSchema,
	KnowledgeBaseContextBodySchema,
	KnowledgeBaseListDataSchema,
	KnowledgeBasePathBodySchema,
	KnowledgeBaseInfoSchema,
	RegisterExternalKnowledgeBaseDataSchema,
	UnregisterExternalKnowledgeBaseDataSchema,
	type ActiveKnowledgeBaseData,
	type InspectKnowledgeBasePathData,
	type KnowledgeBaseInfo,
	type RegisterExternalKnowledgeBaseData,
	type UnregisterExternalKnowledgeBaseData,
} from "@llm-wiki/workbench-contracts";

import type { AgentSession } from "@earendil-works/pi-coding-agent";

import {
	clearActive,
	getActive,
	selectKb,
	type ActiveContext as AgentActiveContext,
} from "../agent.js";
import { piMessagesToUIMessages } from "../conversations.js";
import {
	mapKnowledgeBaseError,
	resolveKnowledgeBaseContext,
} from "../http/knowledge-base-context.js";
import {
	HttpContractError,
	parseValidatedBody,
} from "../http/request.js";
import { jsonOk } from "../http/response.js";
import {
	assertRegisteredKnowledgeBase,
	inspectPath,
	listKnowledgeBases,
	registerExternalKnowledgeBase,
	unregisterExternalKnowledgeBase,
} from "../knowledge-bases.js";
import {
	stopKnowledgeBaseGraphWatcher,
	watchKnowledgeBaseGraph,
} from "../graph.js";
import { defaultGraphRenameRouteService } from "./graph-renames.js";
import {
	createWiki,
	InitConflictError,
	KNOWLEDGE_BASE_SETUP_REQUIRED_MESSAGE,
	initExistingWiki,
	KnowledgeBaseSetupInputError,
} from "../wiki-init.js";

const execFileAsync = promisify(execFile);

export interface KnowledgeBaseRouteService {
	listKnowledgeBases: () => Promise<KnowledgeBaseInfo[]>;
	createKnowledgeBase: (name: string, purpose: string) => Promise<KnowledgeBaseInfo>;
	initExistingKnowledgeBase: (
		path: string,
		purpose: string,
		overwrite: boolean,
	) => Promise<KnowledgeBaseInfo>;
	chooseDirectory: () => Promise<string | null>;
	registerExternalKnowledgeBase: (
		path: string,
	) => Promise<RegisterExternalKnowledgeBaseData>;
	unregisterExternalKnowledgeBase: (
		path: string,
	) => Promise<UnregisterExternalKnowledgeBaseData>;
	inspectKnowledgeBasePath: (
		path: string,
	) => Promise<InspectKnowledgeBasePathData>;
	getActiveKnowledgeBase: () => ActiveKnowledgeBaseData;
	assertRegisteredKnowledgeBase: (kbPath: string) => Promise<string>;
	selectKnowledgeBase: (kbPath: string) => Promise<ActiveKnowledgeBaseData>;
	clearActiveKnowledgeBase: () => Promise<void>;
	watchKnowledgeBaseGraph: (kbPath: string) => void;
	stopKnowledgeBaseGraphWatcher: () => void;
	recoverGraphRenameOperations?: (kbPath: string) => Promise<{ needsRebuild: boolean }>;
	triggerPendingGraphRebuild?: (kbPath: string) => Promise<{ status: "started" | "queued" | "failed" }>;
}

export const defaultKnowledgeBaseRouteService: KnowledgeBaseRouteService = {
	listKnowledgeBases: async () =>
		KnowledgeBaseListDataSchema.parse(await listKnowledgeBases()),
	createKnowledgeBase: async (name, purpose) => {
		const result = await createWiki(name, purpose);
		return KnowledgeBaseInfoSchema.parse({
			path: result.path,
			name: result.name,
			origin: "default",
			valid: true,
		});
	},
	initExistingKnowledgeBase: async (path, purpose, overwrite) => {
		const result = await initExistingWiki(path, purpose, overwrite);
		return KnowledgeBaseInfoSchema.parse({
			path: result.path,
			name: basename(result.path),
			origin: "external",
			valid: true,
		});
	},
	chooseDirectory: chooseSystemDirectory,
	registerExternalKnowledgeBase: async (path) =>
		RegisterExternalKnowledgeBaseDataSchema.parse(
			await registerExternalKnowledgeBase(path),
		),
	unregisterExternalKnowledgeBase: async (path) =>
		UnregisterExternalKnowledgeBaseDataSchema.parse(
			await unregisterExternalKnowledgeBase(path),
		),
	inspectKnowledgeBasePath: async (path) =>
		InspectKnowledgeBasePathDataSchema.parse(await inspectPath(path)),
	getActiveKnowledgeBase: () => serializeActiveContext(getActive()),
	assertRegisteredKnowledgeBase,
	selectKnowledgeBase: async (kbPath) => {
		const registeredPath = await assertRegisteredKnowledgeBase(kbPath);
		return serializeActiveContext(await selectKb(registeredPath));
	},
	clearActiveKnowledgeBase: clearActive,
	watchKnowledgeBaseGraph,
	stopKnowledgeBaseGraphWatcher,
	recoverGraphRenameOperations: (kbPath) => defaultGraphRenameRouteService.recoverGraphRenameOperations(kbPath),
	triggerPendingGraphRebuild: (kbPath) => defaultGraphRenameRouteService.triggerPendingGraphRebuild?.(kbPath) ?? Promise.resolve({ status: "failed" as const }),
};

export function createKnowledgeBaseRoutes(
	service: KnowledgeBaseRouteService,
): Hono {
	const router = new Hono();

	router.get("/knowledge-bases", async (c) => {
		const items = KnowledgeBaseListDataSchema.parse(
			await service.listKnowledgeBases(),
		);
		return jsonOk(c, items);
	});

	router.post("/knowledge-bases/new", async (c) => {
		const { name, purpose } = await parseValidatedBody(
			c,
			CreateKnowledgeBaseBodySchema,
		);
		try {
			return jsonOk(
				c,
				CreateKnowledgeBaseDataSchema.parse({
					info: await service.createKnowledgeBase(name, purpose),
				}),
			);
		} catch (err) {
			throw mapKnowledgeBaseSetupError(err);
		}
	});

	router.post("/knowledge-bases/init-existing", async (c) => {
		const { path, purpose, overwrite } = await parseValidatedBody(
			c,
			InitExistingKnowledgeBaseBodySchema,
		);
		try {
			return jsonOk(
				c,
				InitExistingKnowledgeBaseDataSchema.parse({
					info: await service.initExistingKnowledgeBase(
						path,
						purpose,
						overwrite === true,
					),
				}),
			);
		} catch (err) {
			throw mapKnowledgeBaseSetupError(err);
		}
	});

	router.post("/knowledge-bases/external", async (c) => {
		const { path } = await parseValidatedBody(c, KnowledgeBasePathBodySchema);
		try {
			return jsonOk(
				c,
				RegisterExternalKnowledgeBaseDataSchema.parse(
					await service.registerExternalKnowledgeBase(path),
				),
			);
		} catch (err) {
			throw mapKnowledgeBaseError(err);
		}
	});

	router.post("/knowledge-bases/inspect", async (c) => {
		const { path } = await parseValidatedBody(c, KnowledgeBasePathBodySchema);
		try {
			return jsonOk(
				c,
				InspectKnowledgeBasePathDataSchema.parse(
					await service.inspectKnowledgeBasePath(path),
				),
			);
		} catch (err) {
			throw mapKnowledgeBaseError(err);
		}
	});

	router.delete("/knowledge-bases/external", async (c) => {
		const { path } = await parseValidatedBody(c, KnowledgeBasePathBodySchema);
		try {
			return jsonOk(
				c,
				UnregisterExternalKnowledgeBaseDataSchema.parse(
					await service.unregisterExternalKnowledgeBase(path),
				),
			);
		} catch (err) {
			throw mapKnowledgeBaseError(err);
		}
	});

	router.post("/system/choose-directory", async (c) => {
		try {
			return jsonOk(
				c,
				ChooseDirectoryDataSchema.parse({
					path: await service.chooseDirectory(),
				}),
			);
		} catch (err) {
			if (isDirectoryPickerCancellation(err)) {
				return jsonOk(c, ChooseDirectoryDataSchema.parse({ path: null }));
			}
			throw mapKnowledgeBaseSetupError(err);
		}
	});

	router.get("/knowledge-base", (c) => {
		const data = ActiveKnowledgeBaseDataSchema.parse(
			service.getActiveKnowledgeBase(),
		);
		return jsonOk(c, data);
	});

	router.post("/knowledge-base", async (c) => {
		const body = await parseValidatedBody(c, KnowledgeBaseContextBodySchema);
		const kbPath = await resolveKnowledgeBaseContext(
			{ body },
			{
				getActiveKnowledgeBasePath: () =>
					service.getActiveKnowledgeBase().active?.kb.path ?? null,
				assertRegisteredKnowledgeBase:
					service.assertRegisteredKnowledgeBase,
			},
		);
		try {
			const data = ActiveKnowledgeBaseDataSchema.parse(
				await service.selectKnowledgeBase(kbPath),
			);
			if (!data.active) {
				throw new Error("selectKnowledgeBase returned no active context");
			}
			const recovery = await service.recoverGraphRenameOperations?.(data.active.kb.path);
			service.watchKnowledgeBaseGraph(data.active.kb.path);
			if (recovery?.needsRebuild) await service.triggerPendingGraphRebuild?.(data.active.kb.path);
			return jsonOk(c, data);
		} catch (err) {
			if (err instanceof HttpContractError) throw err;
			throw mapKnowledgeBaseError(err);
		}
	});

	router.delete("/knowledge-base", async (c) => {
		await service.clearActiveKnowledgeBase();
		service.stopKnowledgeBaseGraphWatcher();
		return jsonOk(c, ActiveKnowledgeBaseDataSchema.parse({ active: null }));
	});

	return router;
}

export function serializeActiveContext(
	ctx: AgentActiveContext | null,
): ActiveKnowledgeBaseData {
	if (!ctx) return { active: null };
	return ActiveKnowledgeBaseDataSchema.parse({
		active: {
			kb: ctx.kb,
			conversation: {
				id: ctx.conversationId,
				isNew: ctx.isNew,
				messages: piMessagesToUIMessages(ctx.session.state.messages),
			},
			model: extractModelInfo(ctx.session),
		},
	});
}

function extractModelInfo(
	session: AgentSession,
): { provider: string; id: string } | null {
	const model = (session.state as {
		model?: { provider?: unknown; id?: unknown };
	}).model;
	if (
		model &&
		typeof model.provider === "string" &&
		typeof model.id === "string"
	) {
		return { provider: model.provider, id: model.id };
	}
	return null;
}

function mapKnowledgeBaseSetupError(err: unknown): HttpContractError {
	if (err instanceof InitConflictError) {
		return new HttpContractError(
			"CONFLICT",
			"目标目录存在需要确认的文件",
			ConflictDetailsSchema.parse({ conflicts: err.conflicts }),
		);
	}
	if (err instanceof KnowledgeBaseSetupInputError) {
		return new HttpContractError("INVALID_REQUEST", err.message);
	}
	if (err instanceof HttpContractError) return mapKnowledgeBaseError(err);

	const code = (err as { code?: unknown })?.code;
	if (code === "BUSY") {
		return new HttpContractError("BUSY", "知识库正在初始化，请稍后重试");
	}
	if (code === "SETUP_REQUIRED") {
		return new HttpContractError(
			"INVALID_REQUEST",
			KNOWLEDGE_BASE_SETUP_REQUIRED_MESSAGE,
		);
	}
	if (code === "ENOTSUP" || code === "UNSUPPORTED_PLATFORM") {
		return new HttpContractError(
			"UNSUPPORTED_PLATFORM",
			"当前系统暂不支持文件夹选择器",
		);
	}
	if (code === "EMPTY_SELECTION") {
		return new HttpContractError("INVALID_REQUEST", "没有选择文件夹");
	}
	return mapKnowledgeBaseError(err);
}

async function chooseSystemDirectory(): Promise<string | null> {
	if (process.platform !== "darwin") {
		throw Object.assign(new Error("当前系统暂不支持文件夹选择器"), {
			code: "ENOTSUP",
		});
	}
	try {
		const { stdout } = await execFileAsync("osascript", [
			"-e",
			'POSIX path of (choose folder with prompt "选择知识库文件夹")',
		]);
		const selectedPath = stdout.trim();
		if (!selectedPath) {
			throw Object.assign(new Error("没有选择文件夹"), {
				code: "EMPTY_SELECTION",
			});
		}
		return selectedPath;
	} catch (err) {
		if (isDirectoryPickerCancellation(err)) return null;
		throw err;
	}
}

function isDirectoryPickerCancellation(err: unknown): boolean {
	const message = err instanceof Error ? err.message : String(err);
	return message.includes("-128") || message.toLowerCase().includes("user canceled");
}

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

import {
  PromptRequestBodySchema,
  type PromptSseEvent,
} from "@llm-wiki/workbench-contracts";

import { artifactEvents, type ArtifactCreatedEvent } from "../artifacts.js";
import { getActive } from "../agent.js";
import {
  clearPendingKnowledgeContext,
  runWithPendingKnowledgeContextOwner,
  setPendingKnowledgeContext,
} from "../extensions/knowledge-base.js";
import { HttpContractError, parseValidatedBody } from "../http/request.js";
import {
  buildKnowledgeContextMessage,
  contextBudgetFromWindow,
  parseExplicitPageRefs,
  searchKnowledgeBase,
  shouldUseKnowledgeBase,
  writeRetrievalLog,
} from "../retrieval.js";
import {
  OrderedSseWriter,
  PromptRunRegistry,
  ToolStatusEventAdapter,
} from "../tool-status-events.js";

export interface PromptSession {
  subscribe: (listener: (event: unknown) => void | Promise<void>) => () => void;
  prompt: (message: string) => Promise<void>;
  abort?: () => void;
  state: { model?: { contextWindow?: unknown } };
}

export interface PromptActiveContext {
  kbPath: string;
  name: string;
  conversationId: string;
  /** 用于 BUSY 去重与 session 归属；同一会话同时只允许一个 run。 */
  sessionId: string;
}

/**
 * route 提供给 service 驱动 SSE 的句柄。
 * writer 负责终态门禁（terminal 后忽略后续写入）与 transport 断开检测。
 */
export interface PromptRunHandle {
  adapter: ToolStatusEventAdapter;
  writer: PromptEventWriter;
}

export interface PromptRunContext extends PromptRunHandle {
  runId: string;
  messageId: string;
  message: string;
  active: PromptActiveContext;
  session: PromptSession;
}

export interface PromptEventWriter {
  /** 写入共享契约事件（含 artifact_created）；terminal 后或 transport 断开后忽略。 */
  write: (event: PromptSseEvent | null) => Promise<void>;
  /** 等待已排队写入落盘。 */
  flush: () => Promise<void>;
  /** writer 是否仍可写（未断开、未写过 terminal）。 */
  readonly open: boolean;
}

export interface PromptRunSeed {
  active: PromptActiveContext;
  session: PromptSession;
}

export interface PromptRouteService {
  getRunSeed: () => PromptRunSeed;
  createRunId: () => string;
  createMessageId: (runId: string) => string;
  beginRun: (sessionId: string, runId: string) => boolean;
  endRun: (sessionId: string, runId: string) => void;
  /** 订阅 agent 事件；service 内部把事件喂给 ctx.adapter。 */
  subscribeSession: (ctx: PromptRunContext) => () => void;
  /** 订阅 artifact 事件；service 内部按 conversation 归属喂给 ctx.adapter。 */
  subscribeArtifacts: (ctx: PromptRunContext) => () => void;
  /**
   * 执行检索 + prompt，并在成功时写出 terminal。
   * 失败由 route 兜底 failAssistant。
   */
  runPrompt: (ctx: PromptRunContext) => Promise<void>;
  /** transport 断开时由 route 调用，取消正在运行的 agent。 */
  abortSession: (ctx: PromptRunContext) => void;
  clearPendingKnowledgeContext: (ctx: PromptRunContext) => void;
}

export function createPromptRoutes(service: PromptRouteService): Hono {
  const router = new Hono();

  router.post("/prompt", async (c) => {
    const body = await parseValidatedBody(c, PromptRequestBodySchema);
    const { active, session } = resolveRunSeed(service);

    const runId = service.createRunId();
    const messageId = service.createMessageId(runId);
    if (!service.beginRun(active.sessionId, runId)) {
      throw new HttpContractError(
        "BUSY",
        "当前对话正在生成，请等待上一条回复完成",
      );
    }

    return streamSSE(c, async (stream) => {
      const state = { transportOpen: true, terminalWritten: false };
      const adapter = new ToolStatusEventAdapter({ runId, messageId });
      const rawWriter = new OrderedSseWriter(async (payload) => {
        await stream.writeSSE(payload);
      });
      const writer: PromptEventWriter = {
        get open() {
          return state.transportOpen && !state.terminalWritten;
        },
        async write(event) {
          if (!event || state.terminalWritten || !state.transportOpen) return;
          if (
            event.type === "assistant_done" ||
            event.type === "assistant_cancelled" ||
            event.type === "assistant_error"
          ) {
            state.terminalWritten = true;
          }
          await rawWriter.writeContract(event);
        },
        flush: () => rawWriter.flush(),
      };
      const ctx: PromptRunContext = {
        runId,
        messageId,
        message: body.message,
        active,
        session,
        adapter,
        writer,
      };

      let unsubscribeSession: (() => void) | undefined;
      let unsubscribeArtifacts: (() => void) | undefined;

      try {
        unsubscribeSession = service.subscribeSession(ctx);
        unsubscribeArtifacts = service.subscribeArtifacts(ctx);

        stream.onAbort(() => {
          state.transportOpen = false;
          rawWriter.close();
          service.clearPendingKnowledgeContext(ctx);
          service.abortSession(ctx);
        });

        await service.runPrompt(ctx);
        if (!adapter.isFinished && writer.open) {
          const errorEvent = adapter.failAssistant(
            new Error("missing terminal event"),
          )[0];
          if (errorEvent) await writer.write(errorEvent);
        }
      } catch (err) {
        const errorEvent = adapter.failAssistant(err)[0];
        if (errorEvent && writer.open) await writer.write(errorEvent);
      } finally {
        await writer.flush();
        unsubscribeArtifacts?.();
        unsubscribeSession?.();
        service.clearPendingKnowledgeContext(ctx);
        service.endRun(active.sessionId, runId);
        rawWriter.close();
      }
    });
  });

  return router;
}

function resolveRunSeed(service: PromptRouteService): PromptRunSeed {
  try {
    return service.getRunSeed();
  } catch (err) {
    const code = (err as { code?: unknown }).code;
    if (code === "NO_ACTIVE_KB") {
      throw new HttpContractError("NO_ACTIVE_KB", "当前没有选择知识库");
    }
    throw new HttpContractError("INTERNAL_ERROR", "服务器内部错误");
  }
}

// ============= 默认实现：连接真实 agent / retrieval / artifact 运行时 =============

const defaultRegistry = new PromptRunRegistry();

export const defaultPromptRouteService: PromptRouteService = {
  getRunSeed() {
    const active = getActive();
    if (!active) {
      throw Object.assign(new Error("没有活跃对话"), { code: "NO_ACTIVE_KB" });
    }
    return {
      active: {
        kbPath: active.kb.path,
        name: active.kb.name,
        conversationId: active.conversationId,
        sessionId: active.conversationId,
      },
      session: active.session as unknown as PromptSession,
    };
  },
  createRunId() {
    return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  },
  createMessageId(runId) {
    return `assistant-${runId}`;
  },
  beginRun: (sessionId, runId) => defaultRegistry.begin(sessionId, runId),
  endRun: (sessionId, runId) => defaultRegistry.end(sessionId, runId),
  subscribeSession(ctx) {
    const listener = async (agentEvent: unknown) => {
      try {
        for (const contractEvent of ctx.adapter.adapt(agentEvent)) {
          await ctx.writer.write(contractEvent);
        }
      } catch {
        // transport 写失败：由 route 的 abort 路径清理。
      }
    };
    return ctx.session.subscribe(listener);
  },
  subscribeArtifacts(ctx) {
    const conversationId = ctx.active.conversationId;
    const listener = async (event: ArtifactCreatedEvent) => {
      if (event.conversationId !== conversationId) return;
      const contractEvent = ctx.adapter.artifactCreated({
        id: event.id,
        kind: event.kind,
        title: event.title,
      });
      if (contractEvent) {
        try {
          await ctx.writer.write(contractEvent);
        } catch {
          // transport 写失败：忽略。
        }
      }
    };
    artifactEvents.on("artifact_created", listener);
    return () => {
      artifactEvents.off("artifact_created", listener);
    };
  },
  async runPrompt(ctx) {
    const session = ctx.session;
    const active = ctx.active;
    const message = ctx.message;
    const isCurrentRun = () => {
      const current = getActive();
      return (
        ctx.writer.open &&
        defaultRegistry.get(active.sessionId) === ctx.runId &&
        current?.conversationId === active.conversationId &&
        current.session === session
      );
    };
    const explicitRefs = parseExplicitPageRefs(message);
    const shouldSearch = shouldUseKnowledgeBase(message, true);
    let knowledgeContext: string | null = null;
    {
      const baseLog = {
        ts: Date.now(),
        sessionId: active.conversationId,
        kbPath: active.kbPath,
        messagePreview: message.slice(0, 120),
        explicitRefs,
      };
      if (shouldSearch) {
        const toolCallId = `${ctx.runId}-knowledge-search`;
        try {
          await ctx.writer.write(
            ctx.adapter.startTool({
              toolCallId,
              toolName: "knowledge_search",
              args: {},
            }),
          );
          await ctx.writer.write(
            ctx.adapter.updateTool({
              toolCallId,
              toolName: "knowledge_search",
              args: {},
              partialResult: { summary: "正在检索当前知识库" },
            }),
          );
          const search = await searchKnowledgeBase(active.kbPath, message, {
            explicitRefs,
            totalBudgetChars: contextBudgetFromWindow(
              session.state?.model?.contextWindow,
            ),
          });
          knowledgeContext = buildKnowledgeContextMessage({
            kb: { name: active.name, path: active.kbPath },
            search,
          });
          if (!isCurrentRun()) return;
          await ctx.writer.write(
            ctx.adapter.endTool({
              toolCallId,
              toolName: "knowledge_search",
              result: {
                summary:
                  search.results.length > 0
                    ? `已检索到 ${search.results.length} 个相关页面`
                    : "当前知识库未找到相关页面",
                count: search.results.length,
              },
            }),
          );
          await writeRetrievalLog({
            ...baseLog,
            triggered: true,
            results: search.results.map((result) => ({
              path: result.path,
              hitReason: result.hitReason,
              score: result.score,
            })),
            wrappedCharCount: message.length + (knowledgeContext?.length ?? 0),
            error: null,
          }).catch(() => {});
        } catch (err) {
          const errorText = "知识库检索失败";
          await ctx.writer.write(
            ctx.adapter.endTool({
              toolCallId,
              toolName: "knowledge_search",
              result: { error: errorText },
              isError: true,
            }),
          );
          await writeRetrievalLog({
            ...baseLog,
            triggered: true,
            results: [],
            wrappedCharCount: 0,
            error:
              err instanceof Error ? (err.stack ?? err.message) : String(err),
          }).catch(() => {});
        }
      } else {
        await writeRetrievalLog({
          ...baseLog,
          triggered: false,
          results: [],
          wrappedCharCount: 0,
          error: null,
        }).catch(() => {});
      }
    }
    if (!isCurrentRun()) return;
    const contextOwner = {
      runId: ctx.runId,
      conversationId: active.conversationId,
    };
    if (knowledgeContext) {
      setPendingKnowledgeContext(knowledgeContext, contextOwner);
    }
    await runWithPendingKnowledgeContextOwner(contextOwner, () =>
      session.prompt(message),
    );
    for (const event of ctx.adapter.finishAssistant()) {
      await ctx.writer.write(event);
    }
  },
  abortSession(ctx) {
    ctx.session.abort?.();
  },
  clearPendingKnowledgeContext(ctx) {
    clearPendingKnowledgeContext({
      runId: ctx.runId,
      conversationId: ctx.active.conversationId,
    });
  },
};

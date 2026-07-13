import assert from "node:assert/strict";
import test from "node:test";

import { PromptSseEventSchema } from "@llm-wiki/workbench-contracts";

import { createApp } from "./app.js";
import {
  clearPendingKnowledgeContext,
  consumePendingKnowledgeContext,
  setPendingKnowledgeContext,
} from "./extensions/knowledge-base.js";
import type {
  PromptActiveContext,
  PromptRunContext,
  PromptRouteService,
} from "./routes/prompt.js";

interface SseFrame {
  event: string;
  data: string;
}

type EnvelopeJson = {
  ok?: boolean;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  data?: unknown;
};

async function json(res: Response): Promise<EnvelopeJson> {
  return (await res.json()) as EnvelopeJson;
}

function post(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

async function readSse(res: Response): Promise<SseFrame[]> {
  const text = await res.text();
  const frames: SseFrame[] = [];
  for (const block of text.split("\n\n")) {
    let event = "message";
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (!line || line.startsWith(":")) continue;
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const field = line.slice(0, idx);
      const value = line.slice(idx + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "data") dataLines.push(value);
    }
    if (dataLines.length > 0)
      frames.push({ event, data: dataLines.join("\n") });
  }
  return frames;
}

interface FakeOptions {
  active?: PromptActiveContext | null;
  /** runPrompt 内部行为；默认写一条 text delta 后 finishAssistant。 */
  behavior?:
    | "success"
    | "fail"
    | "empty"
    | "late-event"
    | "knowledge-search"
    | "pending";
  throwOnSubscribe?: "session" | "artifacts";
  onClearPendingKnowledgeContext?: (ctx: PromptRunContext) => void;
}

function createFakeService(options: FakeOptions = {}) {
  const active: PromptActiveContext | null =
    options.active === undefined
      ? {
          kbPath: "/fake/kb",
          name: "kb",
          conversationId: "c-1",
          sessionId: "s-1",
        }
      : options.active;
  const behavior = options.behavior ?? "success";
  const throwOnSubscribe = options.throwOnSubscribe;
  let releasePendingPrompt!: () => void;
  const pendingPrompt = new Promise<void>((resolve) => {
    releasePendingPrompt = resolve;
  });
  let resolveAbortObserved!: () => void;
  const abortObserved = new Promise<void>((resolve) => {
    resolveAbortObserved = resolve;
  });
  const calls = {
    begun: [] as Array<[string, string]>,
    ended: [] as Array<[string, string]>,
    prompts: [] as string[],
    aborted: 0,
    sessionSubscribed: 0,
    sessionUnsubscribed: 0,
    artifactSubscribed: 0,
    artifactUnsubscribed: 0,
    cleared: 0,
    clearOwners: [] as Array<{ runId: string; conversationId: string }>,
  };
  const session = {
    subscribe: () => () => {},
    prompt: async () => {},
    state: {},
  };
  const service: PromptRouteService = {
    getRunSeed: () => {
      if (!active) {
        throw Object.assign(new Error("没有活跃对话"), {
          code: "NO_ACTIVE_KB",
        });
      }
      return { active, session };
    },
    createRunId: () => "run-fixed",
    createMessageId: (runId) => `assistant-${runId}`,
    beginRun: (sessionId, runId) => {
      if (calls.begun.some(([s]) => s === sessionId)) return false;
      calls.begun.push([sessionId, runId]);
      return true;
    },
    endRun: (sessionId, runId) => {
      calls.ended.push([sessionId, runId]);
      calls.begun = calls.begun.filter(
        ([s, r]) => !(s === sessionId && r === runId),
      );
    },
    subscribeSession: () => {
      calls.sessionSubscribed += 1;
      if (throwOnSubscribe === "session")
        throw new Error("session subscription failed");
      return () => {
        calls.sessionUnsubscribed += 1;
      };
    },
    subscribeArtifacts: () => {
      calls.artifactSubscribed += 1;
      if (throwOnSubscribe === "artifacts")
        throw new Error("artifact subscription failed");
      return () => {
        calls.artifactUnsubscribed += 1;
      };
    },
    runPrompt: async (ctx: PromptRunContext) => {
      calls.prompts.push(ctx.message);
      if (behavior === "pending") {
        await pendingPrompt;
      } else if (behavior === "success") {
        const delta = ctx.adapter.adapt({
          type: "message_update",
          message: { role: "assistant", content: [] },
          assistantMessageEvent: {
            type: "text_delta",
            contentIndex: 0,
            delta: "你好",
            partial: {
              role: "assistant",
              content: [{ type: "text", text: "你好" }],
            },
          },
        } as never)[0];
        if (delta) await ctx.writer.write(delta);
        for (const event of ctx.adapter.finishAssistant()) {
          await ctx.writer.write(event);
        }
      } else if (behavior === "late-event") {
        for (const event of ctx.adapter.finishAssistant()) {
          await ctx.writer.write(event);
        }
        const lateDelta = ctx.adapter.adapt({
          type: "message_update",
          message: { role: "assistant", content: [] },
          assistantMessageEvent: {
            type: "text_delta",
            contentIndex: 0,
            delta: "不得出现",
            partial: { role: "assistant", content: [] },
          },
        } as never)[0];
        await ctx.writer.write(lateDelta ?? null);
      } else if (behavior === "knowledge-search") {
        const toolCallId = "knowledge-search-1";
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
        await ctx.writer.write(
          ctx.adapter.endTool({
            toolCallId,
            toolName: "knowledge_search",
            result: { summary: "已检索到 1 个相关页面", count: 1 },
          }),
        );
        for (const event of ctx.adapter.finishAssistant()) {
          await ctx.writer.write(event);
        }
      } else if (behavior === "fail") {
        throw new Error("ENOENT /Users/private/secret\n    at secret stack");
      }
      // empty: 不写任何事件，也不 finish —— 用于测 EOF-without-terminal 由 route 不兜底
    },
    abortSession: () => {
      calls.aborted += 1;
      resolveAbortObserved();
    },
    clearPendingKnowledgeContext: (ctx) => {
      calls.cleared += 1;
      calls.clearOwners.push({
        runId: ctx.runId,
        conversationId: ctx.active.conversationId,
      });
      options.onClearPendingKnowledgeContext?.(ctx);
    },
  };
  return { service, calls, abortObserved, releasePendingPrompt };
}

function assertLifecycle(frames: SseFrame[]): void {
  assert.ok(frames.length > 0, "至少应有一帧");
  let expectedSeq = 1;
  let terminals = 0;
  let runId: string | null = null;
  let messageId: string | null = null;
  for (const frame of frames) {
    const payload = JSON.parse(frame.data);
    assert.equal(payload.schemaVersion, 1, `帧 ${frame.event} schemaVersion`);
    assert.equal(payload.type, frame.event, `帧 event 名应等于 data.type`);
    assert.equal(payload.seq, expectedSeq, `帧 ${frame.event} seq`);
    if (runId === null) {
      runId = payload.runId;
      messageId = payload.messageId;
    } else {
      assert.equal(payload.runId, runId);
      assert.equal(payload.messageId, messageId);
    }
    PromptSseEventSchema.parse(payload); // 全量共享 schema
    expectedSeq += 1;
    if (
      ["assistant_done", "assistant_cancelled", "assistant_error"].includes(
        payload.type,
      )
    ) {
      terminals += 1;
    }
  }
  assert.equal(terminals, 1, "恰好一个 terminal");
}

test("无效 JSON body 返回 INVALID_JSON envelope 且不启动 SSE", async () => {
  const { service, calls } = createFakeService();
  const app = createApp({ promptService: service });
  const res = await app.request("/api/prompt", post("{bad"));
  assert.equal(res.status, 400);
  assert.equal((await json(res)).code, "INVALID_JSON");
  assert.deepEqual(calls.begun, []);
  assert.equal(
    res.headers.get("content-type")?.includes("text/event-stream"),
    false,
  );
});

test("空 message 或未知字段返回 INVALID_REQUEST 且不回显原始 body", async () => {
  const { service, calls } = createFakeService();
  const app = createApp({ promptService: service });
  let res = await app.request("/api/prompt", post({ message: "   " }));
  assert.equal(res.status, 400);
  assert.equal((await json(res)).code, "INVALID_REQUEST");

  res = await app.request(
    "/api/prompt",
    post({ message: "hi", secret: "sk-no-echo" }),
  );
  assert.equal(res.status, 400);
  const payload = await json(res);
  assert.equal(payload.code, "INVALID_REQUEST");
  assert.equal(JSON.stringify(payload).includes("sk-no-echo"), false);
  assert.deepEqual(calls.begun, []);
});

test("无 active KB 返回 NO_ACTIVE_KB envelope 且不启动 SSE", async () => {
  const { service, calls } = createFakeService({ active: null });
  const app = createApp({ promptService: service });
  const res = await app.request("/api/prompt", post({ message: "你好" }));
  assert.equal(res.status, 400);
  assert.deepEqual(await json(res), {
    ok: false,
    code: "NO_ACTIVE_KB",
    message: "当前没有选择知识库",
  });
  assert.deepEqual(calls.begun, []);
});

test("同一 session 已有 run 时返回 409 BUSY envelope", async () => {
  const { service, calls } = createFakeService();
  const app = createApp({ promptService: service });
  await app.request("/api/prompt", post({ message: "第一次" }));
  const res = await app.request("/api/prompt", post({ message: "第二次" }));
  assert.equal(res.status, 409);
  assert.deepEqual(await json(res), {
    ok: false,
    code: "BUSY",
    message: "当前对话正在生成，请等待上一条回复完成",
  });
  assert.deepEqual(calls.prompts, ["第一次"]);
});

test("成功流：seq 从 1 连续递增、唯一 terminal、每帧通过共享 schema", async () => {
  const { service, calls } = createFakeService();
  const app = createApp({ promptService: service });
  const res = await app.request("/api/prompt", post({ message: "你好" }));
  assert.equal(res.status, 200);
  assert.equal(
    res.headers.get("content-type")?.includes("text/event-stream"),
    true,
  );
  const frames = await readSse(res);
  assertLifecycle(frames);
  assert.equal(frames[frames.length - 1]!.event, "assistant_done");
  // 资源清理：subscribe 与 unsubscribe 配对，registry 释放
  assert.equal(calls.sessionSubscribed, 1);
  assert.equal(calls.sessionUnsubscribed, 1);
  assert.equal(calls.artifactSubscribed, 1);
  assert.equal(calls.artifactUnsubscribed, 1);
  assert.deepEqual(calls.ended.length, 1);
});

test("服务遗漏 terminal 时 route 补发唯一 assistant_error", async () => {
  const { service } = createFakeService({ behavior: "empty" });
  const app = createApp({ promptService: service });
  const res = await app.request("/api/prompt", post({ message: "空流" }));
  const frames = await readSse(res);
  assertLifecycle(frames);
  assert.equal(frames.length, 1);
  assert.equal(frames[0]!.event, "assistant_error");
});

test("terminal 后的 agent event 不会写入 stream", async () => {
  const { service } = createFakeService({ behavior: "late-event" });
  const app = createApp({ promptService: service });
  const res = await app.request("/api/prompt", post({ message: "终态竞态" }));
  const frames = await readSse(res);
  assertLifecycle(frames);
  assert.equal(frames[frames.length - 1]!.event, "assistant_done");
  assert.equal(
    frames.some((frame) => frame.data.includes("不得出现")),
    false,
  );
});
test("prompt 抛错时发送唯一 assistant_error，不泄露 raw error / stack / 路径，terminal 为最后一帧", async () => {
  const { service } = createFakeService({ behavior: "fail" });
  const app = createApp({ promptService: service });
  const res = await app.request("/api/prompt", post({ message: "boom" }));
  assert.equal(res.status, 200);
  const frames = await readSse(res);
  const errorFrames = frames.filter((f) => f.event === "assistant_error");
  assert.equal(errorFrames.length, 1);
  assert.equal(frames.filter((f) => f.event === "assistant_done").length, 0);
  assert.equal(frames[frames.length - 1]!.event, "assistant_error");
  const payload = JSON.parse(errorFrames[0]!.data);
  assert.equal(payload.type, "assistant_error");
  assert.equal(typeof payload.code, "string");
  assert.equal(typeof payload.message, "string");
  assert.equal(payload.message.length > 0, true);
  const serialized = JSON.stringify(frames);
  assert.equal(serialized.includes("/Users/"), false, "不得泄露 /Users/ 路径");
  assert.equal(serialized.includes("secret stack"), false, "不得泄露 stack");
  assert.equal(serialized.includes("ENOENT"), false, "不得泄露原始错误");
});

test("检索工具事件不回显原始 prompt、知识库路径或结果路径", async () => {
  const { service } = createFakeService({ behavior: "knowledge-search" });
  const app = createApp({ promptService: service });
  const rawPrompt = "客户私密问题 token=secret-value";
  const res = await app.request("/api/prompt", post({ message: rawPrompt }));
  const frames = await readSse(res);
  assertLifecycle(frames);

  const serialized = JSON.stringify(frames);
  assert.equal(serialized.includes(rawPrompt), false);
  assert.equal(serialized.includes("/fake/kb"), false);
  const searchFrames = frames
    .map((frame) => JSON.parse(frame.data))
    .filter((event) => event.toolName === "knowledge_search");
  assert.equal(searchFrames.length, 3);
  assert.deepEqual(searchFrames[0]?.args, {});
  assert.deepEqual(searchFrames[1]?.args, {});
  assert.equal(searchFrames[0]?.target, "当前知识库");
  assert.equal(searchFrames[2]?.result?.paths, undefined);
});

test("订阅抛错后释放 run registry，后续请求不会 BUSY", async () => {
  for (const throwOnSubscribe of ["session", "artifacts"] as const) {
    const { service, calls } = createFakeService({ throwOnSubscribe });
    const app = createApp({ promptService: service });
    const first = await app.request("/api/prompt", post({ message: "第一次" }));
    const frames = await readSse(first);
    assertLifecycle(frames);
    assert.equal(frames.at(-1)?.event, "assistant_error");
    assert.equal(calls.ended.length, 1);
    assert.equal(calls.cleared, 1);
    if (throwOnSubscribe === "session") {
      assert.equal(calls.sessionUnsubscribed, 0);
      assert.equal(calls.artifactUnsubscribed, 0);
    } else {
      assert.equal(calls.sessionUnsubscribed, 1);
      assert.equal(calls.artifactUnsubscribed, 0);
    }

    const second = await app.request(
      "/api/prompt",
      post({ message: "第二次" }),
    );
    assert.equal(second.status, 200);
  }
});
async function waitFor(
  condition: () => boolean,
  message: string,
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
}

test("transport abort 只取消并清理所属 run，随后可立即开始新 prompt", async (t) => {
  const cancelledOwner = { runId: "run-fixed", conversationId: "c-1" };
  const unaffectedOwner = { runId: "run-other", conversationId: "c-other" };
  setPendingKnowledgeContext("会被取消的上下文", cancelledOwner);
  setPendingKnowledgeContext("不受影响的上下文", unaffectedOwner);
  t.after(() => {
    clearPendingKnowledgeContext(cancelledOwner);
    clearPendingKnowledgeContext(unaffectedOwner);
  });

  const { service, calls, abortObserved, releasePendingPrompt } = createFakeService({
    behavior: "pending",
    onClearPendingKnowledgeContext: (ctx) => {
      clearPendingKnowledgeContext({
        runId: ctx.runId,
        conversationId: ctx.active.conversationId,
      });
    },
  });
  const app = createApp({ promptService: service });
  const res = await app.request("/api/prompt", post({ message: "你好" }));
  assert.deepEqual(calls.prompts, ["你好"], "取消前 prompt 必须仍在运行");
  const body = res.body;
  assert.ok(body, "SSE response 必须有可取消的 body");
  await body.cancel();
  await abortObserved;

  assert.equal(calls.aborted, 1, "取消必须实际调用 agent abort");
  assert.deepEqual(calls.clearOwners, [cancelledOwner]);
  assert.equal(consumePendingKnowledgeContext(cancelledOwner), null);
  assert.equal(
    consumePendingKnowledgeContext(unaffectedOwner),
    "不受影响的上下文",
  );

  releasePendingPrompt();
  await waitFor(() => calls.ended.length === 1, "取消后的 run 未完成清理");

  // registry 必须释放：下一个 prompt 能立即 begin 且成功。
  const res2 = await app.request("/api/prompt", post({ message: "第二次" }));
  assert.equal(res2.status, 200);
  assert.equal(calls.prompts.includes("第二次"), true);
  assertLifecycle(await readSse(res2));
});

import assert from "node:assert/strict";
import test from "node:test";

import knowledgeBaseExtension, {
  type PendingKnowledgeContextOwner,
  clearPendingKnowledgeContext,
  consumePendingKnowledgeContext,
  runWithPendingKnowledgeContextOwner,
  setPendingKnowledgeContext,
} from "./knowledge-base.js";

type BeforeAgentStartHandler = (event: {
  systemPrompt: string;
}) => Promise<{ systemPrompt?: string } | undefined>;

function captureBeforeAgentStartHandler(): BeforeAgentStartHandler {
  let handler: BeforeAgentStartHandler | undefined;
  knowledgeBaseExtension({
    on(event: string, candidate: unknown) {
      if (event === "before_agent_start") {
        handler = candidate as BeforeAgentStartHandler;
      }
    },
    registerTool() {},
  } as never);
  assert.ok(handler);
  return handler;
}

async function injectForOwner(
  handler: BeforeAgentStartHandler,
  owner: PendingKnowledgeContextOwner,
): Promise<string | undefined> {
  const result = await runWithPendingKnowledgeContextOwner(
    owner,
    async () => {
      await new Promise<void>((resolve) => setImmediate(resolve));
      return handler({ systemPrompt: "基础提示" });
    },
  );
  return result?.systemPrompt;
}

test("旧 run 的条件清理不会删除新 run 的知识上下文", () => {
  setPendingKnowledgeContext("旧上下文", {
    runId: "run-old",
    conversationId: "conversation-old",
  });
  setPendingKnowledgeContext("新上下文", {
    runId: "run-new",
    conversationId: "conversation-new",
  });

  clearPendingKnowledgeContext({
    runId: "run-old",
    conversationId: "conversation-old",
  });

  assert.equal(
    consumePendingKnowledgeContext({
      runId: "run-new",
      conversationId: "conversation-new",
    }),
    "新上下文",
  );
});

test("切换对话后不能消费上一对话的知识上下文", () => {
  setPendingKnowledgeContext("仅属于旧对话", {
    runId: "run-shared",
    conversationId: "conversation-old",
  });

  assert.equal(
    consumePendingKnowledgeContext({
      runId: "run-shared",
      conversationId: "conversation-new",
    }),
    null,
  );
  assert.equal(
    consumePendingKnowledgeContext({
      runId: "run-shared",
      conversationId: "conversation-old",
    }),
    "仅属于旧对话",
  );
});

test("并行对话各自保留并消费自己的知识上下文", () => {
  setPendingKnowledgeContext("对话 A 上下文", {
    runId: "run-a",
    conversationId: "conversation-a",
  });
  setPendingKnowledgeContext("对话 B 上下文", {
    runId: "run-b",
    conversationId: "conversation-b",
  });

  assert.equal(
    consumePendingKnowledgeContext({
      runId: "run-a",
      conversationId: "conversation-a",
    }),
    "对话 A 上下文",
  );
  assert.equal(
    consumePendingKnowledgeContext({
      runId: "run-b",
      conversationId: "conversation-b",
    }),
    "对话 B 上下文",
  );
});

test("Extension 只为当前运行和对话注入所属知识上下文", async () => {
  const handler = captureBeforeAgentStartHandler();
  const ownerA = { runId: "run-a", conversationId: "conversation-a" };
  const ownerB = { runId: "run-b", conversationId: "conversation-b" };
  setPendingKnowledgeContext("对话 A 上下文", ownerA);
  setPendingKnowledgeContext("对话 B 上下文", ownerB);

  const [promptA, promptB] = await Promise.all([
    injectForOwner(handler, ownerA),
    injectForOwner(handler, ownerB),
  ]);

  assert.equal(promptA, "基础提示\n\n对话 A 上下文");
  assert.equal(promptB, "基础提示\n\n对话 B 上下文");
});

test("没有 prompt owner 的 agent 活动不能消费待用知识上下文", async () => {
  const handler = captureBeforeAgentStartHandler();
  const owner = { runId: "run-owned", conversationId: "conversation-owned" };
  setPendingKnowledgeContext("所属上下文", owner);

  assert.equal(await handler({ systemPrompt: "其他提示" }), undefined);
  assert.equal(
    await injectForOwner(handler, owner),
    "基础提示\n\n所属上下文",
  );
});

test("同一对话重复发送时不能消费旧 run 的知识上下文", async () => {
  const handler = captureBeforeAgentStartHandler();
  const oldOwner = { runId: "run-old", conversationId: "conversation-1" };
  const newOwner = { runId: "run-new", conversationId: "conversation-1" };
  setPendingKnowledgeContext("旧 run 上下文", oldOwner);

  assert.equal(await injectForOwner(handler, newOwner), undefined);
  assert.equal(
    consumePendingKnowledgeContext(oldOwner),
    "旧 run 上下文",
    "新 run 既不能使用也不能丢弃旧 run 的上下文",
  );
});

test("取消只清理所属 run，不影响另一个并行对话", async () => {
  const handler = captureBeforeAgentStartHandler();
  const cancelledOwner = {
    runId: "run-cancelled",
    conversationId: "conversation-cancelled",
  };
  const activeOwner = {
    runId: "run-active",
    conversationId: "conversation-active",
  };
  setPendingKnowledgeContext("已取消上下文", cancelledOwner);
  setPendingKnowledgeContext("仍在运行的上下文", activeOwner);

  clearPendingKnowledgeContext(cancelledOwner);

  assert.equal(await injectForOwner(handler, cancelledOwner), undefined);
  assert.equal(
    await injectForOwner(handler, activeOwner),
    "基础提示\n\n仍在运行的上下文",
  );
});

test("匹配 owner 的清理会移除知识上下文", () => {
  setPendingKnowledgeContext("上下文", {
    runId: "run-1",
    conversationId: "conversation-1",
  });

  clearPendingKnowledgeContext({
    runId: "run-1",
    conversationId: "conversation-1",
  });

  assert.equal(
    consumePendingKnowledgeContext({
      runId: "run-1",
      conversationId: "conversation-1",
    }),
    null,
  );
});

test("空知识上下文也会在消费后清理", () => {
  const owner = { runId: "run-empty", conversationId: "conversation-empty" };
  setPendingKnowledgeContext("", owner);

  assert.equal(consumePendingKnowledgeContext(owner), "");
  assert.equal(consumePendingKnowledgeContext(owner), null);
});

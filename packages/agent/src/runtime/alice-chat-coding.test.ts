import { expect, test } from "bun:test";
import type { IAgentRuntime, Memory, UUID } from "@elizaos/core";
import {
  AliceChatCodingService,
  aliceChatCodingAction,
} from "./alice-chat-coding";
import {
  enforceAliceActionExecutionBoundary,
  installAliceHighRiskActionBoundary,
} from "./alice-high-risk-action-boundary";

const agentId = "00000000-0000-4000-8000-000000000001" as UUID;
const owner = "00000000-0000-4000-8000-000000000002" as UUID;
const token = "test-native-coding-token-32-bytes-long";
const roomId = "00000000-0000-4000-8000-000000000003" as UUID;
const message = {
  id: "00000000-0000-4000-8000-000000000004",
  agentId,
  entityId: owner,
  roomId,
  content: {
    text: "Fix the greeting bug in rndrntwrk/milaidy",
    source: "discord",
  },
  metadata: {
    type: "message",
    source: "discord",
    accountId: "default",
    fromBot: false,
    fromId: "111111111",
    messageIdFull: "222222222",
    discord: {
      userId: "111111111",
      messageId: "222222222",
      channelId: "123456789",
    },
  },
} as Memory;
function fixture() {
  const cache = new Map<string, unknown>();
  const deliveries: unknown[] = [];
  const runtime = {
    agentId,
    character: { name: "Alice" },
    getSetting: (key: string) =>
      key === "ELIZA_ADMIN_ENTITY_ID" ? owner : undefined,
    getService: (name: string) =>
      ["discord", "telegram"].includes(name) ? {} : null,
    getEntityById: async () => null,
    getWorld: async () => null,
    getRoom: async () => ({
      id: roomId,
      source: "discord",
      channelId: "123456789",
      serverId: "987654321",
    }),
    getCache: async (key: string) => cache.get(key),
    setCache: async (key: string, value: unknown) => {
      cache.set(key, structuredClone(value));
      return true;
    },
    sendMessageToTarget: async (target: unknown, content: unknown) => {
      deliveries.push({ target, content });
      return { ...message, id: "00000000-0000-4000-8000-000000000005" };
    },
    logger: { warn: () => {} },
  } as unknown as IAgentRuntime;
  return { runtime, cache, deliveries };
}
test("verified owner starts once; restored service posts the PR only to saved origin", async () => {
  const { runtime, cache, deliveries } = fixture();
  let creates = 0;
  const fetcher = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const path = new URL(String(input)).pathname;
    if (path === "/v1/repository")
      return Response.json({ ok: true, baseCommit: "a".repeat(40) });
    if (init?.method === "POST") {
      creates++;
      expect(init?.headers).toHaveProperty("x-alice-native-coding-signature");
      return Response.json({
        ok: true,
        status: "queued",
        taskId: "task-cap-00000000-0000-4000-8000-000000000006",
      });
    }
    return Response.json({
      ok: true,
      status: "completed",
      taskId: "task-cap-00000000-0000-4000-8000-000000000006",
      work: {
        state: "completed",
        result: {
          pullRequestUrl: "https://github.com/rndrntwrk/milaidy/pull/123",
          summary: "Greeting fixed.",
        },
      },
    });
  }) as typeof fetch;
  const service = new AliceChatCodingService(runtime, fetcher, token);
  const first = await service.startTask(
    message,
    "rndrntwrk/milaidy",
    "Fix the greeting bug",
  );
  expect(first).toContain("Started");
  expect(first).not.toContain("/control/coding");
  expect(first).not.toContain("passkey");
  expect(cache.size).toBeGreaterThan(0);
  await service.startTask(message, "rndrntwrk/milaidy", "Fix the greeting bug");
  expect(creates).toBe(1);
  const restored = new AliceChatCodingService(runtime, fetcher, token);
  await restored.poll();
  await restored.poll();
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0]).toMatchObject({
    target: { source: "discord", channelId: "123456789", roomId },
    content: {
      text: expect.stringContaining(
        "https://github.com/rndrntwrk/milaidy/pull/123",
      ),
    },
  });
});
test("unpaired actors and agent self cannot start coding", async () => {
  const { runtime } = fixture();
  const service = new AliceChatCodingService(runtime, (async () => {
    throw new Error("network must not run");
  }) as typeof fetch);
  for (const entityId of [
    agentId,
    "00000000-0000-4000-8000-000000000009" as UUID,
  ]) {
    await expect(
      service.startTask(
        { ...message, entityId },
        "rndrntwrk/milaidy",
        "Fix it",
      ),
    ).rejects.toThrow("CODING_OWNER_REQUIRED");
  }
});
test("a completed start response still delivers its PR after restart", async () => {
  const { runtime, deliveries } = fixture();
  const completed = {
    ok: true,
    status: "completed",
    work: {
      result: {
        pullRequestUrl: "https://github.com/rndrntwrk/milaidy/pull/123",
      },
    },
  };
  const fetcher = (async (input: string | URL | Request) =>
    Response.json(
      String(input).includes("/repository")
        ? { ok: true, baseCommit: "a".repeat(40) }
        : completed,
    )) as typeof fetch;
  await new AliceChatCodingService(runtime, fetcher, token).startTask(
    message,
    "rndrntwrk/milaidy",
    "Fix the greeting bug",
  );
  const restored = new AliceChatCodingService(runtime, fetcher, token);
  await restored.poll();
  await restored.poll();
  expect(deliveries).toHaveLength(1);
  expect(deliveries[0]).toMatchObject({
    content: {
      text: "Draft PR ready: https://github.com/rndrntwrk/milaidy/pull/123",
    },
  });
});
test("full-gated boundary admits only the native owner handler, not a same-name desktop handler", async () => {
  const env = {
    ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
    ALICE_RUNTIME_PROFILE: "full-gated",
  };
  expect(enforceAliceActionExecutionBoundary(aliceChatCodingAction, env)).toBe(
    aliceChatCodingAction,
  );
  const fake = {
    ...aliceChatCodingAction,
    handler: async () => {
      throw new Error("desktop executor ran");
    },
  };
  const guarded = enforceAliceActionExecutionBoundary(fake, env);
  const result = await guarded.handler(fixture().runtime, message);
  expect(result).toMatchObject({
    success: false,
    error: "ALICE_HIGH_RISK_ACTION_DENIED",
  });
});

test("runtime registration routes CREATE_TASK to native owner admission regardless of plugin order", () => {
  const actions = [] as (typeof aliceChatCodingAction)[];
  const runtime = {
    actions,
    logger: fixture().runtime.logger,
    registerAction(action: typeof aliceChatCodingAction) {
      if (!actions.some((entry) => entry.name === action.name))
        actions.push(action);
    },
  };
  installAliceHighRiskActionBoundary(runtime as never, {
    ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
    ALICE_RUNTIME_PROFILE: "full-gated",
  });
  runtime.registerAction({
    ...aliceChatCodingAction,
    handler: async () => {
      throw new Error("desktop executor ran");
    },
  });
  expect(actions).toHaveLength(1);
  expect(actions[0]).toBe(aliceChatCodingAction);
});

test("Telegram preserves its connector account and topic without a task approval", async () => {
  const { runtime, deliveries } = fixture();
  runtime.getRoom = async () =>
    ({ id: roomId, source: "telegram", channelId: "-100123456:21" }) as never;
  const incoming = {
    ...message,
    content: {
      text: "Please implement the greeting feature",
      source: "telegram",
    },
    metadata: {
      type: "message",
      source: "telegram",
      accountId: "owner-bot",
      fromBot: false,
      fromId: "111111111",
      messageIdFull: "42",
      telegram: {
        userId: 111111111,
        messageId: "42",
        chatId: -100123456,
        threadId: 21,
      },
    },
  } as Memory;
  const fetcher = (async (
    _input: string | URL | Request,
    init?: RequestInit,
  ) => {
    if (init?.method === "POST") {
      const native = JSON.parse(String(init.body));
      expect(native.message).toMatchObject({
        source: "telegram",
        accountId: "owner-bot",
        externalId: "111111111",
        externalMessageId: "42",
        channelId: "-100123456",
        threadId: "21",
      });
      expect(native.request.prompt).toContain(incoming.content.text);
      return Response.json({ ok: true, status: "queued" });
    }
    if (String(_input).includes("/repository"))
      return Response.json({ ok: true, baseCommit: "a".repeat(40) });
    return Response.json({
      ok: true,
      status: "completed",
      work: {
        result: {
          pullRequestUrl: "https://github.com/rndrntwrk/milaidy/pull/123",
        },
      },
    });
  }) as typeof fetch;
  const service = new AliceChatCodingService(runtime, fetcher, token);
  expect(
    await service.startTask(
      incoming,
      "rndrntwrk/milaidy",
      "Implement the greeting feature",
    ),
  ).toContain("Started");
  await service.poll();
  expect(deliveries[0]).toMatchObject({
    target: {
      source: "telegram",
      accountId: "owner-bot",
      channelId: "-100123456:21",
      threadId: "21",
    },
  });
  await expect(
    service.startTask(
      {
        ...incoming,
        metadata: { ...incoming.metadata, fromBot: true },
      } as Memory,
      "rndrntwrk/milaidy",
      "Implement it",
    ),
  ).rejects.toThrow("CODING_OWNER_REQUIRED");
});

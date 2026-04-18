import type { Memory, UUID } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  ConversationRouteContext,
  ConversationRouteState,
} from "../../src/api/conversation-routes";
import { handleConversationRoutes } from "../../src/api/conversation-routes";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../../src/test-support/test-helpers";

type OperatorActionBody = {
  label?: string;
  kind?: string;
  detail?: string;
  fallbackText?: string;
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    headers: {
      get: () => null,
    },
    arrayBuffer: async () => new ArrayBuffer(0),
  })) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function buildState(overrides: {
  hasRuntime?: boolean;
  ensureConnection?: ReturnType<typeof vi.fn>;
  createMemory?: ReturnType<typeof vi.fn>;
  getWorld?: ReturnType<typeof vi.fn>;
  broadcastWs?: ((data: Record<string, unknown>) => void) | null;
} = {}): ConversationRouteState {
  const ensureConnection = overrides.ensureConnection ?? vi.fn(async () => {});
  const createMemory = overrides.createMemory ?? vi.fn(async () => {});
  const getWorld = overrides.getWorld ?? vi.fn(async () => null);
  const runtime = overrides.hasRuntime === false
    ? null
    : ({
        agentId: "agent-1" as UUID,
        character: { name: "Milady" },
        ensureConnection,
        getWorld,
        updateWorld: vi.fn(async () => {}),
        createMemory,
        getMemories: vi.fn(async () => [] as Memory[]),
      } as unknown as ConversationRouteState["runtime"]);

  return {
    runtime,
    config: {} as ConversationRouteState["config"],
    agentName: "Milady",
    adminEntityId: "00000000-0000-4000-8000-00000000dead" as UUID,
    chatUserId: null,
    logBuffer: [],
    conversations: new Map([
      [
        "conv-1",
        {
          id: "conv-1",
          title: "Operator chat",
          roomId: "00000000-0000-4000-8000-0000000000aa" as UUID,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
    ]),
    conversationRestorePromise: null,
    deletedConversationIds: new Set(),
    broadcastWs: overrides.broadcastWs ?? vi.fn(),
  };
}

function buildCtx(
  state: ConversationRouteState,
  options: {
    pathname: string;
    body: OperatorActionBody | null;
  },
): {
  ctx: ConversationRouteContext;
  jsonMock: ReturnType<typeof vi.fn>;
  errorMock: ReturnType<typeof vi.fn>;
} {
  const { res } = createMockHttpResponse();
  const jsonMock = vi.fn(
    (response: Parameters<ConversationRouteContext["json"]>[0], data: object, status = 200) => {
      response.writeHead(status);
      response.end(JSON.stringify(data));
    },
  );
  const errorMock = vi.fn(
    (response: Parameters<ConversationRouteContext["error"]>[0], message: string, status = 500) => {
      response.writeHead(status);
      response.end(JSON.stringify({ error: message }));
    },
  );
  const ctx: ConversationRouteContext = {
    req: createMockIncomingMessage({
      method: "POST",
      url: options.pathname,
    }),
    res,
    method: "POST",
    pathname: options.pathname,
    state,
    json: jsonMock as unknown as ConversationRouteContext["json"],
    error: errorMock as unknown as ConversationRouteContext["error"],
    readJsonBody: vi.fn(
      async () => options.body,
    ) as unknown as ConversationRouteContext["readJsonBody"],
  };
  return { ctx, jsonMock, errorMock };
}

describe("POST /api/conversations/:id/operator-action", () => {
  test("persists a user memory with an action-pill block and broadcasts over WS", async () => {
    const createMemory = vi.fn(async () => {});
    const broadcastWs = vi.fn();
    const state = buildState({ createMemory, broadcastWs });
    const { ctx, jsonMock } = buildCtx(state, {
      pathname: "/api/conversations/conv-1/operator-action",
      body: {
        label: "Go Live",
        kind: "stream",
        detail: "Starting broadcast now",
        fallbackText: "Alice kicked off the stream.",
      },
    });

    const handled = await handleConversationRoutes(ctx);

    expect(handled).toBe(true);
    expect(createMemory).toHaveBeenCalledTimes(1);
    const [persistedMemory, tableName] = createMemory.mock.calls[0] ?? [];
    expect(tableName).toBe("messages");
    expect(persistedMemory).toMatchObject({
      content: {
        text: "Alice kicked off the stream.",
        source: "operator_action",
        blocks: [
          {
            type: "action-pill",
            label: "Go Live",
            kind: "stream",
            detail: "Starting broadcast now",
          },
        ],
      },
    });

    expect(broadcastWs).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "proactive-message",
        conversationId: "conv-1",
        message: expect.objectContaining({
          role: "user",
          text: "Alice kicked off the stream.",
          source: "operator_action",
          blocks: [
            {
              type: "action-pill",
              label: "Go Live",
              kind: "stream",
              detail: "Starting broadcast now",
            },
          ],
        }),
      }),
    );

    const response = jsonMock.mock.calls[0]?.[1] as {
      message: {
        role: string;
        text: string;
        blocks: Array<{ type: string; label: string; kind: string }>;
      };
    };
    expect(response.message.role).toBe("user");
    expect(response.message.blocks).toEqual([
      {
        type: "action-pill",
        label: "Go Live",
        kind: "stream",
        detail: "Starting broadcast now",
      },
    ]);
  });

  test("falls back to label when fallbackText is missing", async () => {
    const createMemory = vi.fn(async () => {});
    const state = buildState({ createMemory });
    const { ctx, jsonMock } = buildCtx(state, {
      pathname: "/api/conversations/conv-1/operator-action",
      body: {
        label: "Change Avatar",
        kind: "avatar",
      },
    });

    const handled = await handleConversationRoutes(ctx);

    expect(handled).toBe(true);
    const response = jsonMock.mock.calls[0]?.[1] as {
      message: { text: string; blocks: Array<{ detail?: string }> };
    };
    expect(response.message.text).toBe("Change Avatar");
    expect(response.message.blocks[0]).not.toHaveProperty("detail");
  });

  test("returns 404 when the conversation does not exist", async () => {
    const state = buildState();
    const { ctx, errorMock } = buildCtx(state, {
      pathname: "/api/conversations/missing/operator-action",
      body: {
        label: "Go Live",
        kind: "stream",
      },
    });

    const handled = await handleConversationRoutes(ctx);

    expect(handled).toBe(true);
    expect(errorMock).toHaveBeenCalledWith(
      expect.anything(),
      "Conversation not found",
      404,
    );
  });

  test("returns 503 when no runtime is attached", async () => {
    const state = buildState({ hasRuntime: false });
    const { ctx, errorMock } = buildCtx(state, {
      pathname: "/api/conversations/conv-1/operator-action",
      body: {
        label: "Go Live",
        kind: "stream",
      },
    });

    const handled = await handleConversationRoutes(ctx);

    expect(handled).toBe(true);
    expect(errorMock).toHaveBeenCalledWith(
      expect.anything(),
      "Agent is not running",
      503,
    );
  });

  test("returns 400 when label is missing or blank", async () => {
    const state = buildState();
    const { ctx, errorMock } = buildCtx(state, {
      pathname: "/api/conversations/conv-1/operator-action",
      body: {
        label: "   ",
        kind: "stream",
      },
    });

    const handled = await handleConversationRoutes(ctx);

    expect(handled).toBe(true);
    expect(errorMock).toHaveBeenCalledWith(
      expect.anything(),
      "label is required",
      400,
    );
  });

  test("returns 400 when kind is not an allowed value", async () => {
    const state = buildState();
    const { ctx, errorMock } = buildCtx(state, {
      pathname: "/api/conversations/conv-1/operator-action",
      body: {
        label: "Go Live",
        kind: "sudo",
      },
    });

    const handled = await handleConversationRoutes(ctx);

    expect(handled).toBe(true);
    expect(errorMock).toHaveBeenCalledWith(
      expect.anything(),
      "kind must be 'stream', 'avatar', or 'launch'",
      400,
    );
  });
});

/**
 * Companion test for the GET /messages serializer path. The POST route above
 * only handles the live (WS proactive-message) render path — the pill also
 * has to survive a page reload, which means GET /messages must surface the
 * persisted `blocks` field.
 */
describe("GET /api/conversations/:id/messages — action-pill block survival", () => {
  function buildGetCtx(
    state: ConversationRouteState,
    memories: Memory[],
  ): {
    ctx: ConversationRouteContext;
    jsonMock: ReturnType<typeof vi.fn>;
  } {
    const getMemories = vi.fn(async () => memories);
    if (state.runtime) {
      (
        state.runtime as unknown as { getMemories: typeof getMemories }
      ).getMemories = getMemories;
    }
    const pathname = "/api/conversations/conv-1/messages";
    const { res } = createMockHttpResponse();
    const jsonMock = vi.fn(
      (
        response: Parameters<ConversationRouteContext["json"]>[0],
        data: object,
        status = 200,
      ) => {
        response.writeHead(status);
        response.end(JSON.stringify(data));
      },
    );
    const errorMock = vi.fn(
      (
        response: Parameters<ConversationRouteContext["error"]>[0],
        message: string,
        status = 500,
      ) => {
        response.writeHead(status);
        response.end(JSON.stringify({ error: message }));
      },
    );
    const ctx: ConversationRouteContext = {
      req: createMockIncomingMessage({ method: "GET", url: pathname }),
      res,
      method: "GET",
      pathname,
      state,
      json: jsonMock as unknown as ConversationRouteContext["json"],
      error: errorMock as unknown as ConversationRouteContext["error"],
      readJsonBody: vi.fn(
        async () => null,
      ) as unknown as ConversationRouteContext["readJsonBody"],
    };
    return { ctx, jsonMock };
  }

  test("includes action-pill blocks from persisted memory so pills survive reload", async () => {
    const state = buildState();
    const memory = {
      id: "00000000-0000-4000-8000-000000000001" as UUID,
      entityId: "00000000-0000-4000-8000-00000000dead" as UUID,
      roomId: "00000000-0000-4000-8000-0000000000aa" as UUID,
      createdAt: 1700000000000,
      content: {
        text: "Alice kicked off the stream.",
        source: "operator_action",
        blocks: [
          {
            type: "action-pill",
            label: "Go Live",
            kind: "stream",
            detail: "Starting broadcast now",
          },
        ],
      },
    } as unknown as Memory;
    const { ctx, jsonMock } = buildGetCtx(state, [memory]);

    const handled = await handleConversationRoutes(ctx);

    expect(handled).toBe(true);
    const response = jsonMock.mock.calls[0]?.[1] as {
      messages: Array<{
        id: string;
        role: string;
        text: string;
        source?: string;
        blocks?: Array<{
          type: string;
          label: string;
          kind: string;
          detail?: string;
        }>;
      }>;
    };
    expect(response.messages).toHaveLength(1);
    const message = response.messages[0];
    expect(message.role).toBe("user");
    expect(message.text).toBe("Alice kicked off the stream.");
    expect(message.source).toBe("operator_action");
    expect(message.blocks).toEqual([
      {
        type: "action-pill",
        label: "Go Live",
        kind: "stream",
        detail: "Starting broadcast now",
      },
    ]);
  });

  test("sanitizes malformed blocks from persisted memory", async () => {
    const state = buildState();
    // Two memories: one with a valid block, one with garbage shapes that the
    // sanitizer must drop. Confirms we don't forward arbitrary DB content.
    const validMemory = {
      id: "00000000-0000-4000-8000-000000000002" as UUID,
      entityId: "00000000-0000-4000-8000-00000000dead" as UUID,
      roomId: "00000000-0000-4000-8000-0000000000aa" as UUID,
      createdAt: 1700000001000,
      content: {
        text: "ok",
        source: "operator_action",
        blocks: [{ type: "action-pill", label: "Launch", kind: "launch" }],
      },
    } as unknown as Memory;
    const malformedMemory = {
      id: "00000000-0000-4000-8000-000000000003" as UUID,
      entityId: "00000000-0000-4000-8000-00000000dead" as UUID,
      roomId: "00000000-0000-4000-8000-0000000000aa" as UUID,
      createdAt: 1700000002000,
      content: {
        text: "garbage",
        source: "operator_action",
        blocks: [
          { type: "action-pill", label: "", kind: "stream" }, // empty label
          { type: "action-pill", label: "No Kind" }, // missing kind
          { type: "unknown-block-type", label: "x", kind: "stream" }, // wrong type
          "not-an-object",
          null,
        ],
      },
    } as unknown as Memory;
    const { ctx, jsonMock } = buildGetCtx(state, [validMemory, malformedMemory]);

    const handled = await handleConversationRoutes(ctx);

    expect(handled).toBe(true);
    const response = jsonMock.mock.calls[0]?.[1] as {
      messages: Array<{ text: string; blocks?: unknown[] }>;
    };
    expect(response.messages).toHaveLength(2);
    const [valid, malformed] = response.messages;
    expect(valid.blocks).toEqual([
      { type: "action-pill", label: "Launch", kind: "launch" },
    ]);
    // All entries in the malformed memory's blocks[] fail sanitization,
    // so the field is omitted entirely from the serialized message.
    expect(malformed).not.toHaveProperty("blocks");
  });
});

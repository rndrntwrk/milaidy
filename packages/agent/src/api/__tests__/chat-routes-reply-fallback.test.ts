import {
  createMessageMemory,
  stringToUuid,
  type AgentRuntime,
  type Content,
  type UUID,
} from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ALICE_FULL_GATED_SAFE_ACTION_NAMES,
} from "../../runtime/alice-high-risk-action-boundary";
import { generateChatResponse } from "../chat-routes";

const selfControlActionMocks = vi.hoisted(() => ({
  block: vi.fn(async (..._args: unknown[]) => ({
    success: true,
    text: "Unsafe website block executed.",
  })),
  permission: vi.fn(async (..._args: unknown[]) => ({
    success: true,
    text: "Unsafe permission request executed.",
  })),
}));

vi.mock("@miladyai/plugin-selfcontrol", () => ({
  selfControlBlockWebsitesAction: {
    name: "BLOCK_WEBSITES",
    validate: async () => true,
    handler: selfControlActionMocks.block,
  },
  selfControlRequestPermissionAction: {
    name: "REQUEST_WEBSITE_BLOCKING_PERMISSION",
    validate: async () => true,
    handler: selfControlActionMocks.permission,
  },
}));

vi.mock("@miladyai/plugin-selfcontrol/selfcontrol", () => ({
  getSelfControlStatus: async () => ({ active: true }),
  hasWebsiteBlockDeferralIntent: () => false,
  hasWebsiteBlockIntent: (text: string) => /\bblock\b/i.test(text),
}));

function createRuntimeForChatRouteTests(options?: {
  handleMessage?: (
    runtime: AgentRuntime,
    message: object,
    onResponse: (content: Content) => Promise<object[]>,
    messageOptions?: {
      onStreamChunk?: (chunk: string, messageId?: string) => Promise<void>;
      timeoutDuration?: number;
      keepExistingResponses?: boolean;
    },
  ) => Promise<{
    didRespond?: boolean;
    responseContent?: {
      text?: string;
      actions?: string[];
    };
    responseMessages?: Content[];
    mode?: string;
  }>;
  actions?: Array<{
    name: string;
    similes?: string[];
    validate?: (...args: unknown[]) => unknown;
    handler?: (...args: unknown[]) => unknown;
  }>;
  getActionResults?: (messageId: UUID) => unknown[];
  logger?: AgentRuntime["logger"];
}): AgentRuntime {
  const runtimeLogger =
    options?.logger ??
    ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    } as unknown as AgentRuntime["logger"]);
  const actions = options?.actions ?? [];

  return {
    agentId: stringToUuid("chat-route-agent"),
    character: {
      name: "ChatRouteAgent",
      postExamples: ["Hello there"],
    } as AgentRuntime["character"],
    messageService: {
      handleMessage: async (
        runtime: AgentRuntime,
        message: object,
        onResponse: (content: Content) => Promise<object[]>,
        messageOptions?: {
          onStreamChunk?: (chunk: string, messageId?: string) => Promise<void>;
          timeoutDuration?: number;
          keepExistingResponses?: boolean;
        },
      ) =>
        options?.handleMessage?.(
          runtime,
          message,
          onResponse,
          messageOptions,
        ) ?? {
          responseContent: {
            text: "Hello world",
          },
        },
    } as AgentRuntime["messageService"],
    ensureConnection: async () => {},
    getWorld: async () => null,
    getRoom: async (roomId: UUID) => ({ id: roomId }),
    updateWorld: async () => {},
    createMemory: async () => {},
    getService: () => null,
    getServicesByType: () => [],
    emitEvent: async () => {},
    getMemoriesByRoomIds: async () => [],
    getRoomsByWorld: async () => [],
    getMemories: async () => [],
    deleteManyMemories: async () => {},
    deleteRoom: async () => {},
    getCache: async () => null,
    setCache: async () => {},
    getActionResults:
      options?.getActionResults ??
      (() => [] as unknown[]),
    actions,
    registerAction: (action) => {
      actions.push(action);
    },
    logger: runtimeLogger,
  } as unknown as AgentRuntime;
}

function createUserMessage(text: string) {
  return createMessageMemory({
    id: stringToUuid(`chat-route-message:${text}`),
    entityId: stringToUuid("chat-route-user"),
    roomId: stringToUuid("chat-route-room"),
    content: {
      text,
      source: "api",
    },
  });
}

describe("generateChatResponse fallback recovery", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([
    {
      actionName: "BLOCK_WEBSITES",
      prompt: "Block websites x.com now",
      originalHandler: selfControlActionMocks.block,
    },
    {
      actionName: "REQUEST_WEBSITE_BLOCKING_PERMISSION",
      prompt: "Request permission to enable website blocking",
      originalHandler: selfControlActionMocks.permission,
    },
  ])(
    "denies dynamically resolved $actionName through full-gated chat",
    async ({ originalHandler, prompt }) => {
      vi.stubEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
      vi.stubEnv("ALICE_RUNTIME_PROFILE", "full-gated");
      const runtime = createRuntimeForChatRouteTests({
        handleMessage: async () => ({
          responseContent: { text: "I will handle that now.", actions: [] },
          mode: "none",
        }),
      });

      const result = await generateChatResponse(
        runtime,
        createUserMessage(prompt),
        "ChatRouteAgent",
      );

      expect(originalHandler).not.toHaveBeenCalled();
      expect(result.text).toContain("ALICE_HIGH_RISK_ACTION_DENIED");
    },
  );

  it.each([
    {
      actionName: "BLOCK_WEBSITES",
      prompt: "Block websites x.com now",
      originalHandler: selfControlActionMocks.block,
    },
    {
      actionName: "REQUEST_WEBSITE_BLOCKING_PERMISSION",
      prompt: "Request permission to enable website blocking",
      originalHandler: selfControlActionMocks.permission,
    },
  ])(
    "preserves non-full dynamic $actionName execution",
    async ({ originalHandler, prompt }) => {
      const runtime = createRuntimeForChatRouteTests({
        handleMessage: async () => ({
          responseContent: { text: "I will handle that now.", actions: [] },
          mode: "none",
        }),
      });

      const result = await generateChatResponse(
        runtime,
        createUserMessage(prompt),
        "ChatRouteAgent",
      );

      expect(originalHandler).toHaveBeenCalledTimes(1);
      expect(result.text).toContain("Unsafe");
    },
  );

  it("denies chat-initiated wallet execution in full-gated Alice without a verified grant", async () => {
    vi.stubEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    vi.stubEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    const transferHandler = vi.fn(async () => ({
      success: true,
      text: "Executed transfer",
    }));
    const runtime = createRuntimeForChatRouteTests({
      actions: [
        {
          name: "TRANSFER_TOKEN",
          validate: async () => true,
          handler: transferHandler,
        },
      ],
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage(
        "Send 1 BNB to 0x8DFBdEEC8c5d4970BB5F481C6ec7f73fa1C65be5",
      ),
      "ChatRouteAgent",
    );

    expect(transferHandler).not.toHaveBeenCalled();
    expect(result.text).toContain("ALICE_HIGH_RISK_ACTION_DENIED");
  });

  it("wraps privileged handlers before normal full-gated message dispatch", async () => {
    vi.stubEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    vi.stubEnv("ALICE_RUNTIME_PROFILE", "full-gated");
    const privilegedHandlers = [
      "POST_TWEET",
      "SEND_TWEET",
      "SEND_TOKEN",
      "FUNDS_WITHDRAW",
      "BRIDGE_TOKEN",
      "SIGN_WITH_MILADY_WALLET",
      "DEPLOY_APP",
      "MERGE_PULL_REQUEST",
      "INCREASE_RISK_LIMIT",
      "STREAM555_GO_LIVE",
      "SHELL_COMMAND",
      "UPDATE_ROLE",
      "ROTATE_CREDENTIAL",
      "PROMOTE_RELEASE",
      "RESTART_AGENT",
      "LAUNCH_APP",
      "APPROVE_MILADY_WALLET_REQUEST",
      "MANAGE_MILADY_BROWSER_WORKSPACE",
    ].map((name) => ({ name, handler: vi.fn(async () => true) }));
    const safeActionNames = [
      "REPLY",
      "IGNORE",
      "STOP",
      "NONE",
      "CHECK_BALANCE",
      "READ_ENTITY",
      "SEARCH_ENTITY",
      "READ_CHANNEL",
      "SEARCH_CONVERSATIONS",
      "WEB_SEARCH",
      "PLAY_EMOTE",
    ];
    expect(ALICE_FULL_GATED_SAFE_ACTION_NAMES).toEqual(safeActionNames);
    const safeHandlers = safeActionNames.map((name) => ({
      name,
      handler: vi.fn(async () => true),
    }));
    const lateUnknownHandler = vi.fn(async (..._args: unknown[]) => true);
    const runtime = createRuntimeForChatRouteTests({
      actions: [
        ...privilegedHandlers.map(({ name, handler }) => ({
          name,
          validate: async () => true,
          handler,
        })),
        ...safeHandlers.map(({ name, handler }) => ({
          name,
          validate: async () => true,
          handler,
        })),
      ],
      handleMessage: async (activeRuntime) => {
        activeRuntime.registerAction({
          name: "FUTURE_UNREVIEWED_ACTION",
          description: "Test-only late unreviewed action",
          validate: async () => true,
          handler: async (...args) => {
            await lateUnknownHandler(...args);
            return { success: true };
          },
        });
        for (const action of activeRuntime.actions) {
          await action.handler(activeRuntime, createUserMessage("dispatch"));
        }
        return {
          responseContent: { text: "Dispatch evaluated." },
          mode: "actions",
        };
      },
    });

    await generateChatResponse(
      runtime,
      createUserMessage("Evaluate the planned actions"),
      "ChatRouteAgent",
    );

    for (const { handler } of privilegedHandlers) {
      expect(handler).not.toHaveBeenCalled();
    }
    expect(lateUnknownHandler).not.toHaveBeenCalled();
    for (const { handler } of safeHandlers) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });

  it("does not warn about unexecuted fallback recovery for REPLY-only payloads", async () => {
    const warn = vi.fn();
    const runtimeLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
    } as unknown as AgentRuntime["logger"];
    const runtime = createRuntimeForChatRouteTests({
      logger: runtimeLogger,
      handleMessage: async () => ({
        responseContent: {
          text: "hello there",
          actions: ["REPLY"],
        },
      }),
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("hello"),
      "ChatRouteAgent",
    );

    expect(result.text).toBe("hello there");
    const warnedMessages = warn.mock.calls.map((args) =>
      String(args[1] ?? args[0] ?? ""),
    );
    expect(warnedMessages).not.toContain(
      "[eliza-api] Recovering from unexecuted action payload",
    );
  });

  it("still recovers executable fallback actions for balance intents", async () => {
    const warn = vi.fn();
    const runtimeLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn,
      error: vi.fn(),
    } as unknown as AgentRuntime["logger"];
    const runtime = createRuntimeForChatRouteTests({
      logger: runtimeLogger,
      handleMessage: async () => ({
        responseContent: {
          text: "let me check that for you",
        },
      }),
      actions: [
        {
          name: "CHECK_BALANCE",
          validate: async () => true,
          handler: async (
            _runtime: unknown,
            _message: unknown,
            _state: unknown,
            _options: unknown,
            callback?: (content: Content) => void,
          ) => {
            callback?.({
              text: "Wallet Balances:\n\nBSC:\n  BNB: 0.1000 ($0.00)",
              action: "CHECK_BALANCE_RESPONSE",
            } as Content);
            return {
              text: "Wallet Balances:\n\nBSC:\n  BNB: 0.1000 ($0.00)",
              success: true,
            };
          },
        },
      ],
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("what is my wallet balance?"),
      "ChatRouteAgent",
    );

    expect(result.text).toContain("Wallet Balances:");
    expect(result.text).toContain("BNB: 0.1000");
    const warnedMessages = warn.mock.calls.map((args) =>
      String(args[1] ?? args[0] ?? ""),
    );
    expect(warnedMessages).toContain(
      "[eliza-api] Recovering from unexecuted action payload",
    );
  });

  it("marks action-callback-driven turns so conversation routes can avoid mirroring them", async () => {
    const runtime = createRuntimeForChatRouteTests({
      handleMessage: async (_runtime, _message, onResponse) => {
        await onResponse({
          text: "I updated that preference.",
          action: "MODIFY_CHARACTER",
        } as Content);

        return {
          didRespond: true,
          responseContent: {
            text: "I updated that preference.",
            actions: ["MODIFY_CHARACTER"],
          },
          responseMessages: [],
          mode: "actions",
        };
      },
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("change your personality"),
      "ChatRouteAgent",
    );

    expect(result.text).toBe("I updated that preference.");
    expect(result.usedActionCallbacks).toBe(true);
  });

  it("does not re-run a grounded action when runtime action results show it already executed", async () => {
    const warn = vi.fn();
    const lifeHandler = vi.fn(async () => ({
      success: true,
      text: 'I can save this as a habit named "20 Situps + Pushups" that happens daily in morning, night. Confirm and I\'ll save it, or tell me what to change.',
    }));
    const runtime = createRuntimeForChatRouteTests({
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn,
        error: vi.fn(),
      } as unknown as AgentRuntime["logger"],
      handleMessage: async () => ({
        didRespond: true,
        responseContent: {
          text: 'I can save this as a habit named "20 Situps + Pushups" that happens daily in morning, night. Confirm and I\'ll save it, or tell me what to change.',
          actions: ["CREATE_HABIT"],
        },
        responseMessages: [],
      }),
      getActionResults: () => [{ data: { actionName: "LIFE" } }],
      actions: [
        {
          name: "LIFE",
          similes: ["CREATE_HABIT"],
          validate: async () => true,
          handler: lifeHandler,
        },
      ],
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage(
        "i want to do 20 situps and pushups every morning and night",
      ),
      "ChatRouteAgent",
    );

    expect(result.text).toContain('I can save this as a habit named "20 Situps + Pushups"');
    expect(lifeHandler).not.toHaveBeenCalled();
    const warnedMessages = warn.mock.calls.map((args) =>
      String(args[1] ?? args[0] ?? ""),
    );
    expect(warnedMessages).not.toContain(
      "[eliza-api] Recovering from unexecuted action payload",
    );
  });

  it("fails fast when generation exceeds the configured timeout", async () => {
    const runtime = createRuntimeForChatRouteTests({
      handleMessage: async () =>
        await new Promise<never>(() => {
          // Intentionally never resolves.
        }),
    });

    await expect(
      generateChatResponse(runtime, createUserMessage("hello"), "ChatRouteAgent", {
        timeoutDuration: 1_000,
      }),
    ).rejects.toThrow("Chat generation timed out after 1000ms");
  });

  it("treats pure IGNORE outcomes as an intentional no-response", async () => {
    const runtime = createRuntimeForChatRouteTests({
      handleMessage: async () => ({
        didRespond: true,
        responseContent: {
          text: "",
          actions: ["IGNORE"],
        },
        responseMessages: [],
        mode: "actions",
      }),
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("hello"),
      "ChatRouteAgent",
      {
        resolveNoResponseText: () => "Sorry, I'm having a provider issue",
      },
    );

    expect(result.text).toBe("");
    expect(result.noResponseReason).toBe("ignored");
  });

  it("opts chat generations into keeping superseded responses", async () => {
    let receivedOptions:
      | {
          onStreamChunk?: (chunk: string, messageId?: string) => Promise<void>;
          timeoutDuration?: number;
          keepExistingResponses?: boolean;
        }
      | undefined;

    const runtime = createRuntimeForChatRouteTests({
      handleMessage: async (_runtime, _message, _onResponse, messageOptions) => {
        receivedOptions = messageOptions;
        return {
          didRespond: true,
          responseContent: {
            text: "Hello world",
            actions: ["REPLY"],
          },
          responseMessages: [],
          mode: "simple",
        };
      },
    });

    const result = await generateChatResponse(
      runtime,
      createUserMessage("hello"),
      "ChatRouteAgent",
    );

    expect(result.text).toBe("Hello world");
    expect(receivedOptions?.keepExistingResponses).toBe(true);
  });
});

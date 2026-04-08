import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeIf } from "../../../../../test/helpers/conditional-tests.ts";
import {
  ChannelType,
  ModelType,
  type Content,
  type IAgentRuntime,
  type Memory,
  type UUID,
} from "@elizaos/core";

// This test depends on createTestRuntime from the eliza submodule which is
// only available when the submodule is checked out with deps installed.
const testUtilsPath = path.resolve(
  __dirname,
  "../../../../../eliza/packages/typescript/src/__tests__/test-utils.ts",
);
const hasElizaTestUtils = existsSync(testUtilsPath);

// Dynamic import so the module-not-found error is deferred, not top-level.
const { cleanupTestRuntime, createTestRuntime } = hasElizaTestUtils
  ? await import(
      "../../../../../eliza/packages/typescript/src/__tests__/test-utils"
    )
  : { cleanupTestRuntime: undefined, createTestRuntime: undefined };
import { installPromptOptimizations } from "../prompt-optimization";

// Skip the entire suite when the eliza submodule test utils aren't available
// (CI runs with submodules: false).
const describeIfEliza = describeIf(hasElizaTestUtils);

describeIfEliza("shouldRespond trajectory logging", () => {
  let runtime: IAgentRuntime;

  beforeEach(async () => {
    runtime = await createTestRuntime();

    vi.spyOn(runtime, "getSetting").mockImplementation((key: string) => {
      const settings: Record<string, string> = {
        ALWAYS_RESPOND_CHANNELS: "",
        ALWAYS_RESPOND_SOURCES: "",
        SHOULD_RESPOND_BYPASS_TYPES: "",
        SHOULD_RESPOND_BYPASS_SOURCES: "",
        VALIDATION_LEVEL: "fast",
      };
      return settings[key] ?? null;
    });
    vi.spyOn(runtime, "isCheckShouldRespondEnabled").mockReturnValue(true);
    vi.spyOn(runtime, "isActionPlanningEnabled").mockReturnValue(true);
    vi.spyOn(runtime, "createMemory").mockImplementation(
      async (memory: Memory) => memory,
    );
    vi.spyOn(runtime, "getMemoryById").mockResolvedValue(null);
    vi.spyOn(runtime, "getMemoriesByRoomIds").mockResolvedValue([]);
    vi.spyOn(runtime, "composeState").mockResolvedValue({
      data: {},
      values: {},
    } as Awaited<ReturnType<IAgentRuntime["composeState"]>>);
    vi.spyOn(runtime, "processActions").mockResolvedValue(undefined);
    vi.spyOn(runtime, "evaluate").mockResolvedValue(undefined);
    vi.spyOn(runtime, "emitEvent").mockResolvedValue(undefined);
    vi.spyOn(runtime, "getRoom").mockImplementation(async (roomId: UUID) => ({
      id: roomId,
      type: ChannelType.GROUP,
      name: "Trajectory Group",
      worldId: "trajectory-world" as UUID,
      source: "discord",
    }));
    vi.spyOn(runtime, "getWorld").mockImplementation(async (worldId: UUID) => ({
      id: worldId,
      name: "Trajectory World",
      agentId: runtime.agentId,
    }));
    vi.spyOn(runtime, "ensureRoomExists").mockResolvedValue(undefined);
    vi.spyOn(runtime, "startRun").mockReturnValue("trajectory-run" as UUID);
    vi.spyOn(runtime, "endRun").mockImplementation(() => {});
    vi.spyOn(runtime, "queueEmbeddingGeneration").mockResolvedValue(undefined);
    vi.spyOn(runtime, "log").mockResolvedValue(undefined);
    vi.spyOn(runtime, "getParticipantUserState").mockResolvedValue({
      roomId: "trajectory-room" as UUID,
      userId: runtime.agentId,
    });
    vi.spyOn(runtime, "getRoomsByIds").mockImplementation(
      async (roomIds: UUID[]) =>
        roomIds.map((id) => ({
          id,
          name: "Trajectory Group",
          type: ChannelType.GROUP,
          worldId: "trajectory-world" as UUID,
        })),
    );
    vi.spyOn(runtime, "getEntityById").mockImplementation(
      async (entityId: UUID) => ({
        id: entityId,
        names: ["Trajectory User"],
        agentId: runtime.agentId,
      }),
    );
    vi.spyOn(runtime.logger, "debug").mockImplementation(() => {});
    vi.spyOn(runtime.logger, "info").mockImplementation(() => {});
    vi.spyOn(runtime.logger, "warn").mockImplementation(() => {});
    vi.spyOn(runtime.logger, "error").mockImplementation(() => {});

    runtime.actions = [];
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await cleanupTestRuntime(runtime);
  });

  it("records shouldRespond and reply model calls under the same trajectory step", async () => {
    const loggedCalls: Array<Record<string, unknown>> = [];
    const stubLogger = {
      logLlmCall: vi.fn(),
      getLlmCallLogs: () => [],
    };
    const richLogger = {
      logLlmCall: (params: Record<string, unknown>) => {
        loggedCalls.push(params);
      },
      listTrajectories: vi.fn(),
      getTrajectoryDetail: vi.fn(),
    };

    vi.spyOn(runtime, "getService").mockImplementation((serviceType: string) =>
      serviceType === "trajectory_logger" ? (stubLogger as object) : null,
    );
    vi.spyOn(runtime, "getServicesByType").mockImplementation(
      (serviceType: string) =>
        serviceType === "trajectory_logger" ? [stubLogger, richLogger] : [],
    );
    vi.spyOn(runtime, "useModel").mockImplementation(
      async (
        modelType: (typeof ModelType)[keyof typeof ModelType],
        params: unknown,
      ) => {
        if (modelType === "RESPONSE_HANDLER" || modelType === ModelType.TEXT_SMALL) {
          return "<response><name>TestAgent</name><reasoning>Ambiguous group chat needs a decision</reasoning><action>RESPOND</action></response>";
        }

        const responseText =
          "<response><thought>Processing message</thought><actions>REPLY</actions><providers></providers><text>Hello! How can I help you?</text></response>";
        const text = (params as { stream?: boolean } | null | undefined)?.stream;
        if (text) {
          return {
            textStream: (async function* () {
              yield "<response><thought>Processing message</thought>";
              yield "<actions>REPLY</actions><providers></providers>";
              yield "<text>Hello! How can I help you?</text></response>";
            })(),
            text: Promise.resolve(responseText),
          };
        }
        return responseText;
      },
    );

    installPromptOptimizations(runtime as never);

    const callback = vi.fn(async (content: Content) => [
      {
        id: "trajectory-response-memory" as UUID,
        content,
        entityId: "trajectory-entity" as UUID,
        agentId: runtime.agentId,
        roomId: "trajectory-room" as UUID,
        createdAt: Date.now(),
      },
    ]);

    const message: Memory = {
      id: "trajectory-message" as UUID,
      roomId: "trajectory-room" as UUID,
      entityId: "trajectory-user" as UUID,
      agentId: runtime.agentId,
      createdAt: Date.now(),
      content: {
        text: "can anyone help with this?",
        source: "discord",
        channelType: ChannelType.GROUP,
      },
      metadata: {
        type: "message",
        trajectoryStepId: "should-respond-step",
      },
    };

    const result = await runtime.messageService!.handleMessage(
      runtime,
      message,
      callback,
    );

    expect(result.didRespond).toBe(true);
    expect(stubLogger.logLlmCall).not.toHaveBeenCalled();
    expect(loggedCalls).toHaveLength(2);
    expect(
      new Set(loggedCalls.map((call) => String(call.stepId ?? ""))),
    ).toEqual(new Set(["should-respond-step"]));
    // Both LLM calls should have a non-empty model label (the exact label is
    // environment-specific — it reflects the configured provider, e.g. "openai").
    expect(
      loggedCalls.every((call) => typeof call.model === "string" && call.model.length > 0),
    ).toBe(true);
    expect(
      loggedCalls.some((call) =>
        String(call.response ?? "").includes("<action>RESPOND</action>"),
      ),
    ).toBe(true);
    expect(
      loggedCalls.some((call) =>
        String(call.response ?? "").includes(
          "<text>Hello! How can I help you?</text>",
        ),
      ),
    ).toBe(true);
  });

  it("starts a trajectory from MESSAGE_RECEIVED before connector message handling", async () => {
    const stubLogger = {
      logLlmCall: vi.fn(),
      getLlmCallLogs: () => [],
    };
    const richLogger = {
      logLlmCall: vi.fn(),
      listTrajectories: vi.fn(),
      getTrajectoryDetail: vi.fn(),
    };

    vi.spyOn(runtime, "getService").mockImplementation((serviceType: string) =>
      serviceType === "trajectory_logger" ? (stubLogger as object) : null,
    );
    vi.spyOn(runtime, "getServicesByType").mockImplementation(
      (serviceType: string) =>
        serviceType === "trajectory_logger" ? [stubLogger, richLogger] : [],
    );
    vi.spyOn(runtime, "emitEvent").mockImplementation(
      async (event: string | string[], payload?: unknown) => {
        const eventName = Array.isArray(event) ? event[0] : event;
        if (
          eventName === "MESSAGE_RECEIVED" &&
          payload &&
          typeof payload === "object" &&
          "message" in payload &&
          payload.message &&
          typeof payload.message === "object"
        ) {
          const messagePayload = payload.message as Memory;
          messagePayload.metadata = {
            ...(messagePayload.metadata ?? {}),
            type: "message",
            trajectoryStepId: "connector-step",
          };
        }
      },
    );
    vi.spyOn(runtime, "useModel").mockImplementation(
      async (
        modelType: (typeof ModelType)[keyof typeof ModelType],
        params: unknown,
      ) => {
        if (modelType === "RESPONSE_HANDLER" || modelType === ModelType.TEXT_SMALL) {
          return "<response><name>TestAgent</name><reasoning>Connector group chat needs a decision</reasoning><action>RESPOND</action></response>";
        }

        const responseText =
          "<response><thought>Processing message</thought><actions>REPLY</actions><providers></providers><text>Hello from connector!</text></response>";
        const text = (params as { stream?: boolean } | null | undefined)?.stream;
        if (text) {
          return {
            textStream: (async function* () {
              yield "<response><thought>Processing message</thought>";
              yield "<actions>REPLY</actions><providers></providers>";
              yield "<text>Hello from connector!</text></response>";
            })(),
            text: Promise.resolve(responseText),
          };
        }
        return responseText;
      },
    );

    installPromptOptimizations(runtime as never);

    const callback = vi.fn(async (content: Content) => [
      {
        id: "trajectory-response-memory-2" as UUID,
        content,
        entityId: "trajectory-entity" as UUID,
        agentId: runtime.agentId,
        roomId: "trajectory-room" as UUID,
        createdAt: Date.now(),
      },
    ]);

    const message: Memory = {
      id: "trajectory-message-2" as UUID,
      roomId: "trajectory-room" as UUID,
      entityId: "trajectory-user" as UUID,
      agentId: runtime.agentId,
      createdAt: Date.now(),
      content: {
        text: "hello from discord connector",
        source: "discord",
        channelType: ChannelType.GROUP,
      },
      metadata: {
        type: "message",
      },
    };

    const result = await runtime.messageService!.handleMessage(
      runtime,
      message,
      callback,
    );

    expect(result.didRespond).toBe(true);
    expect(message.metadata).toMatchObject({
      trajectoryStepId: "connector-step",
    });
    expect(runtime.emitEvent).toHaveBeenCalledWith(
      "MESSAGE_RECEIVED",
      expect.objectContaining({
        message,
        source: "discord",
      }),
    );
  });
});

import { describe, expect, it, vi } from "vitest";

import type { AgentRuntime } from "@elizaos/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";

import { __testOnlyHandleRequest } from "../server.js";

describe("/api/agent/autonomy/execute-plan", () => {
  const action = {
    name: "TEST_ACTION",
    description: "test",
    validate: vi.fn(async () => true),
    handler: vi.fn(async (_rt, _msg, _state, options) => ({
      success: true,
      data: (options as { parameters?: Record<string, unknown> })?.parameters,
    })),
  };

  const pipeline = {
    execute: vi.fn(async (call, actionHandler) => {
      const { result, durationMs } = await actionHandler(
        call.tool,
        call.params,
        call.requestId,
      );
      return {
        requestId: call.requestId,
        toolName: call.tool,
        success: true,
        result,
        validation: { valid: true, errors: [] },
        durationMs,
      };
    }),
  };

  const runtime = {
    agentId: "agent-test-id",
    character: {
      name: "TestAgent",
      settings: { autonomy: { apiKey: "" } },
    },
    messageService: null,
    actions: [action],
    getAllActions: () => [action],
    composeState: async () => ({}),
    getRoomsByWorld: async () => [],
    getMemories: async () => [],
    getService: () => null,
    isActionAllowed: () => ({ allowed: true, reason: "allowed" }),
  } as unknown as AgentRuntime;

  function createState(pipelineOverride = pipeline) {
    const stateRuntime = {
      ...runtime,
      getService: (name: string) =>
        name === "AUTONOMY"
          ? { getExecutionPipeline: () => pipelineOverride }
          : null,
    } as unknown as AgentRuntime;

    return {
      runtime: stateRuntime,
      config: {},
      agentState: "running",
      agentName: "TestAgent",
      model: "test",
      startedAt: Date.now(),
      plugins: [],
      skills: [],
      logBuffer: [],
      eventBuffer: [],
      nextEventId: 1,
      chatRoomId: null,
      chatUserId: null,
      chatConnectionReady: null,
      chatConnectionPromise: null,
      adminEntityId: null,
      conversations: new Map(),
      cloudManager: null,
      sandboxManager: null,
      appManager: {} as unknown,
      trainingService: null,
      registryService: null,
      dropService: null,
      shareIngestQueue: [],
      broadcastStatus: null,
      broadcastWs: null,
      activeConversationId: null,
      permissionStates: {},
    } as unknown as import("../server.js").ServerState;
  }

  function createMockReq(method: string, url: string, body?: unknown) {
    const payload = body ? JSON.stringify(body) : "";
    const req = new Readable({
      read() {},
    }) as unknown as IncomingMessage & EventEmitter;
    req.method = method;
    req.url = url;
    req.headers = { "content-type": "application/json" };
    (req as unknown as { socket: { remoteAddress: string } }).socket = {
      remoteAddress: "127.0.0.1",
    };

    const emitBody = () => {
      if (payload) req.push(Buffer.from(payload));
      req.push(null);
    };

    return { req, emitBody };
  }

  function createMockRes() {
    const res = {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: "",
      setHeader(name: string, value: string | number) {
        this.headers[name] = String(value);
      },
      end(chunk?: string) {
        this.body = chunk ?? "";
      },
    };
    return res as unknown as ServerResponse & typeof res;
  }

  it("executes plan steps through the pipeline", async () => {
    const state = createState();
    const { req, emitBody } = createMockReq(
      "POST",
      "/api/agent/autonomy/execute-plan",
      {
        plan: {
          id: "plan-1",
          steps: [
            { id: "1", toolName: "TEST_ACTION", params: { foo: "bar" } },
          ],
        },
        request: { source: "system" },
      },
    );
    const res = createMockRes();

    const handlePromise = __testOnlyHandleRequest(req, res, state);
    emitBody();
    await handlePromise;

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body) as {
      ok: boolean;
      results: Array<{ success: boolean; result?: unknown }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0].success).toBe(true);
    expect(payload.results[0].result).toEqual({ success: true, data: { foo: "bar" } });
  });

  it("rejects missing toolName", async () => {
    const state = createState();
    const { req, emitBody } = createMockReq(
      "POST",
      "/api/agent/autonomy/execute-plan",
      {
        plan: { id: "plan-2", steps: [{ id: "1" }] },
        request: { source: "system" },
      },
    );
    const res = createMockRes();

    const handlePromise = __testOnlyHandleRequest(req, res, state);
    emitBody();
    await handlePromise;

    expect(res.statusCode).toBe(400);
  });

  it("stops on first failed step by default", async () => {
    const failingPipeline = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          requestId: "plan-3-1",
          toolName: "TEST_ACTION",
          success: false,
          validation: { valid: true, errors: [] },
          durationMs: 1,
          error: "simulated failure",
        })
        .mockResolvedValueOnce({
          requestId: "plan-3-2",
          toolName: "TEST_ACTION",
          success: true,
          validation: { valid: true, errors: [] },
          durationMs: 1,
          result: { success: true },
        }),
    };
    const state = createState(
      failingPipeline as unknown as {
        execute: typeof pipeline.execute;
      },
    );
    const { req, emitBody } = createMockReq(
      "POST",
      "/api/agent/autonomy/execute-plan",
      {
        plan: {
          id: "plan-3",
          steps: [
            { id: "1", toolName: "TEST_ACTION", params: { first: true } },
            { id: "2", toolName: "TEST_ACTION", params: { second: true } },
          ],
        },
        request: { source: "system" },
      },
    );
    const res = createMockRes();

    const handlePromise = __testOnlyHandleRequest(req, res, state);
    emitBody();
    await handlePromise;

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body) as {
      ok: boolean;
      allSucceeded: boolean;
      stoppedEarly: boolean;
      failedStepIndex: number | null;
      results: Array<{ success: boolean }>;
    };
    expect(payload.ok).toBe(false);
    expect(payload.allSucceeded).toBe(false);
    expect(payload.stoppedEarly).toBe(true);
    expect(payload.failedStepIndex).toBe(0);
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0].success).toBe(false);
    expect(failingPipeline.execute).toHaveBeenCalledTimes(1);
  });
});

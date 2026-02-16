import http from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server.js";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

type JsonObject = Record<string, JsonValue>;

function req(
  port: number,
  method: string,
  p: string,
): Promise<{ status: number; data: JsonObject }> {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: p,
        method,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: JsonObject = {};
          try {
            data = JSON.parse(raw) as JsonObject;
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

type InMemoryTrajectoryLogger = {
  isEnabled: () => boolean;
  getLlmCallLogs: () => readonly Array<Record<string, unknown>>;
  getProviderAccessLogs: () => readonly Array<Record<string, unknown>>;
  llmCalls: Array<Record<string, unknown>>;
  providerAccess: Array<Record<string, unknown>>;
};

function createRuntimeWithCoreLogger(
  agentId: string,
  name: string,
  logger: InMemoryTrajectoryLogger,
): AgentRuntime {
  const noop = () => {};
  return {
    agentId,
    character: { name },
    adapter: {} as AgentRuntime["adapter"],
    plugins: [],
    actions: [],
    providers: [],
    evaluators: [],
    services: new Map(),
    getService: (serviceType: string) =>
      serviceType === "trajectory_logger" ? logger : null,
    getServicesByType: (serviceType: string) =>
      serviceType === "trajectory_logger" ? [logger] : [],
    messageService: null,
    logger: {
      trace: noop,
      debug: noop,
      info: noop,
      warn: noop,
      error: noop,
      fatal: noop,
      success: noop,
      progress: noop,
      clear: noop,
      child: () =>
        ({
          trace: noop,
          debug: noop,
          info: noop,
          warn: noop,
          error: noop,
          fatal: noop,
          success: noop,
          progress: noop,
          clear: noop,
          child: () => ({}),
        }) as AgentRuntime["logger"],
    } as AgentRuntime["logger"],
  } as unknown as AgentRuntime;
}

describe("trajectory logs survive updateRuntime hot-swap", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;
  let updateRuntime: ((rt: AgentRuntime) => void) | null = null;

  beforeAll(async () => {
    const loggerA: InMemoryTrajectoryLogger = {
      isEnabled: () => true,
      llmCalls: [
        {
          stepId: "step-a",
          model: "unit-test-model",
          systemPrompt: "sys",
          userPrompt: "hello",
          response: "world",
          temperature: 0,
          maxTokens: 64,
          purpose: "action",
          actionType: "runtime.useModel",
          latencyMs: 12,
          timestamp: Date.now(),
        },
      ],
      providerAccess: [],
      getLlmCallLogs() {
        return this.llmCalls;
      },
      getProviderAccessLogs() {
        return this.providerAccess;
      },
    };

    const runtimeA = createRuntimeWithCoreLogger(
      "00000000-0000-0000-0000-000000000001",
      "CarryoverA",
      loggerA,
    );

    const server = await startApiServer({ port: 0, runtime: runtimeA });
    port = server.port;
    closeServer = server.close;
    updateRuntime = server.updateRuntime;
  }, 30_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  it("retains existing trajectories after runtime swap", async () => {
    const before = await req(port, "GET", "/api/trajectories");
    expect(before.status).toBe(200);
    const beforeRows = (before.data.trajectories ?? []) as Array<JsonObject>;
    expect(beforeRows.length).toBeGreaterThan(0);

    const loggerB: InMemoryTrajectoryLogger = {
      isEnabled: () => true,
      llmCalls: [],
      providerAccess: [],
      getLlmCallLogs() {
        return this.llmCalls;
      },
      getProviderAccessLogs() {
        return this.providerAccess;
      },
    };
    const runtimeB = createRuntimeWithCoreLogger(
      "00000000-0000-0000-0000-000000000002",
      "CarryoverB",
      loggerB,
    );

    if (!updateRuntime) {
      throw new Error("updateRuntime not available");
    }
    updateRuntime(runtimeB);

    const after = await req(port, "GET", "/api/trajectories");
    expect(after.status).toBe(200);
    const afterRows = (after.data.trajectories ?? []) as Array<JsonObject>;
    expect(afterRows.length).toBeGreaterThanOrEqual(beforeRows.length);
    expect(afterRows.some((row) => row.id === beforeRows[0]?.id)).toBe(true);
  });
});

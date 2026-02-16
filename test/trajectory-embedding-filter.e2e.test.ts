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

describe("trajectory filters no-input embedding noise", () => {
  let port = 0;
  let closeServer: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    const logger: InMemoryTrajectoryLogger = {
      isEnabled: () => true,
      llmCalls: [
        {
          stepId: "embed-empty",
          model: "TEXT_EMBEDDING",
          userPrompt: "",
          response: "[0.12, -0.01, 0.33, 0.04, -0.05, 0.22, -0.19, 0.07]",
          purpose: "action",
          actionType: "runtime.useModel",
          temperature: 0,
          maxTokens: 0,
          latencyMs: 11,
          timestamp: Date.now() - 1000,
        },
        {
          stepId: "chat-step",
          model: "gpt-4o-mini",
          userPrompt: "hello trajectory",
          response: "hi from test",
          purpose: "action",
          actionType: "runtime.useModel",
          temperature: 0,
          maxTokens: 64,
          promptTokens: 10,
          completionTokens: 8,
          latencyMs: 42,
          timestamp: Date.now() - 500,
        },
        {
          stepId: "embed-input",
          model: "text-embedding-3-small",
          input: "semantic search text",
          response:
            "[0.01, 0.02, -0.03, 0.04, 0.05, -0.06, 0.07, -0.08, 0.09, 0.1]",
          purpose: "action",
          actionType: "runtime.useModel",
          temperature: 0,
          maxTokens: 0,
          latencyMs: 17,
          timestamp: Date.now() - 250,
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

    const runtime = createRuntimeWithCoreLogger(
      "00000000-0000-0000-0000-000000000003",
      "EmbeddingFilter",
      logger,
    );
    const server = await startApiServer({ port: 0, runtime });
    port = server.port;
    closeServer = server.close;
  }, 30_000);

  afterAll(async () => {
    if (closeServer) {
      await closeServer();
    }
  });

  it("suppresses empty-input embedding rows but keeps meaningful rows", async () => {
    const list = await req(port, "GET", "/api/trajectories?limit=50");
    expect(list.status).toBe(200);
    const ids = ((list.data.trajectories ?? []) as Array<JsonObject>).map(
      (row) => String(row.id),
    );
    expect(ids.includes("embed-empty")).toBe(false);
    expect(ids.includes("chat-step")).toBe(true);
    expect(ids.includes("embed-input")).toBe(true);

    const embedWithInput = await req(
      port,
      "GET",
      "/api/trajectories/embed-input",
    );
    expect(embedWithInput.status).toBe(200);
    const embedCalls = (embedWithInput.data.llmCalls ??
      []) as Array<JsonObject>;
    expect(embedCalls.length).toBe(1);
    expect(String(embedCalls[0]?.userPrompt ?? "")).toBe(
      "semantic search text",
    );
  });
});

import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";

import { metrics } from "../../telemetry/setup.js";
import { __testOnlyHandleRequest } from "../server.js";

function createState() {
  const runtime = {
    agentId: "agent-metrics",
    character: {
      name: "MetricsAgent",
      settings: { autonomy: { apiKey: "" } },
    },
    getService: () => null,
    actions: [],
    getAllActions: () => [],
    getRoomsByWorld: async () => [],
    getMemories: async () => [],
    messageService: null,
  } as unknown as AgentRuntime;

  return {
    runtime,
    config: {},
    agentState: "running",
    agentName: "MetricsAgent",
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

function createMockReq(method: string, url: string) {
  const req = new EventEmitter() as IncomingMessage & EventEmitter;
  req.method = method;
  req.url = url;
  req.headers = {};
  (req as unknown as { socket: { remoteAddress: string } }).socket = {
    remoteAddress: "127.0.0.1",
  };
  return req;
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

describe("/metrics endpoint", () => {
  it("returns Prometheus text without requiring auth", async () => {
    metrics.counter("metrics_endpoint_test_total", 1, { scope: "api" });

    const state = createState();
    const req = createMockReq("GET", "/metrics");
    const res = createMockRes();

    await __testOnlyHandleRequest(req, res, state);

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toContain("text/plain");
    expect(res.body).toContain("milaidy_metrics_endpoint_test_total");
  });
});

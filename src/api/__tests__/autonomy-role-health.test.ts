import { describe, expect, it } from "vitest";

import type { AgentRuntime } from "@elizaos/core";
import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";

import { __testOnlyHandleRequest } from "../server.js";

function createRoleHealth(ready: boolean) {
  return {
    checkedAt: 1_739_786_400_000,
    roles: {
      planner: {
        role: "planner",
        available: ready,
        ready,
        healthy: ready,
        requiredMethods: ["createPlan"],
        missingMethods: ready ? [] : ["createPlan"],
      },
    },
    summary: {
      ready,
      healthy: ready,
      totalRoles: 1,
      readyRoles: ready ? 1 : 0,
      healthyRoles: ready ? 1 : 0,
      unavailableRoles: ready ? [] : ["planner"],
    },
  };
}

function createState(ready: boolean) {
  const autonomyService = {
    getRoleHealth: () => createRoleHealth(ready),
  };

  const runtime = {
    agentId: "agent-role-health",
    character: {
      name: "TestAgent",
      settings: { autonomy: { apiKey: "" } },
    },
    getService: (name: string) =>
      name === "AUTONOMY" ? autonomyService : null,
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

function createMockReq(method: string, url: string) {
  const req = new EventEmitter() as IncomingMessage & EventEmitter;
  req.method = method;
  req.url = url;
  req.headers = { "content-type": "application/json" };
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

describe("autonomy role health endpoints", () => {
  it("returns role health snapshot", async () => {
    const state = createState(true);
    const req = createMockReq("GET", "/api/agent/autonomy/roles/health");
    const res = createMockRes();

    await __testOnlyHandleRequest(req, res, state);

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body) as {
      ok: boolean;
      summary: { ready: boolean };
      roles: Record<string, unknown>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.summary.ready).toBe(true);
    expect(payload.roles.planner).toBeDefined();
  });

  it("returns 503 readiness when any role is unavailable", async () => {
    const state = createState(false);
    const req = createMockReq("GET", "/api/agent/autonomy/roles/readiness");
    const res = createMockRes();

    await __testOnlyHandleRequest(req, res, state);

    expect(res.statusCode).toBe(503);
    const payload = JSON.parse(res.body) as { ready: boolean; ok: boolean };
    expect(payload.ready).toBe(false);
    expect(payload.ok).toBe(false);
  });

  it("returns 200 readiness when all roles are ready", async () => {
    const state = createState(true);
    const req = createMockReq("GET", "/api/agent/autonomy/roles/readiness");
    const res = createMockRes();

    await __testOnlyHandleRequest(req, res, state);

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body) as { ready: boolean; ok: boolean };
    expect(payload.ready).toBe(true);
    expect(payload.ok).toBe(true);
  });
});

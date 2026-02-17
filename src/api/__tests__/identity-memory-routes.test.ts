import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";

import { createDefaultAutonomyIdentity } from "../../autonomy/identity/schema.js";
import { __testOnlyHandleRequest } from "../server.js";

function createState(overrides: {
  autonomySvc?: Record<string, unknown> | null;
} = {}) {
  const runtime = {
    agentId: "agent-identity-memory",
    character: {
      name: "IdentityMemoryAgent",
      settings: { autonomy: { apiKey: "" } },
    },
    getService: (type: string) =>
      type === "AUTONOMY" ? overrides.autonomySvc ?? null : null,
    actions: [],
    getAllActions: () => [],
    getRoomsByWorld: async () => [],
    getMemories: async () => [],
    messageService: null,
  } as unknown as import("@elizaos/core").AgentRuntime;

  return {
    runtime,
    config: {},
    agentState: "running",
    agentName: "IdentityMemoryAgent",
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
  const req = new EventEmitter() as IncomingMessage & EventEmitter;
  req.method = method;
  req.url = url;
  req.headers = { "content-type": "application/json" };
  (req as unknown as { socket: { remoteAddress: string } }).socket = {
    remoteAddress: "127.0.0.1",
  };

  const payload = body ? JSON.stringify(body) : "";
  const emitBody = () => {
    // Emit on next tick so body listeners are always attached first.
    setTimeout(() => {
      if (payload) req.emit("data", Buffer.from(payload));
      req.emit("end");
    }, 0);
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

describe("identity + memory API integration", () => {
  it("supports identity GET/PUT/history routes", async () => {
    const identity = createDefaultAutonomyIdentity();
    const autonomySvc = {
      getIdentityConfig: vi.fn(() => ({ ...identity })),
      updateIdentityConfig: vi.fn(async (update: Partial<typeof identity>) => {
        const updated = {
          ...identity,
          ...update,
          identityVersion: identity.identityVersion + 1,
          identityHash: "updated-hash",
        };
        Object.assign(identity, updated);
        return updated;
      }),
    };
    const state = createState({ autonomySvc });

    {
      const { req, emitBody } = createMockReq("GET", "/api/agent/identity");
      const res = createMockRes();
      const p = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await p;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as { identity: typeof identity | null };
      expect(payload.identity?.identityVersion).toBe(1);
    }

    {
      const { req, emitBody } = createMockReq("PUT", "/api/agent/identity", {
        communicationStyle: { tone: "formal" },
      });
      const res = createMockRes();
      const p = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await p;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as { identity: typeof identity };
      expect(payload.identity.identityVersion).toBe(2);
      expect(payload.identity.communicationStyle.tone).toBe("formal");
    }

    {
      const { req, emitBody } = createMockReq("GET", "/api/agent/identity/history");
      const res = createMockRes();
      const p = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await p;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as {
        version: number;
        history: Array<{ version: number }>;
      };
      expect(payload.version).toBe(2);
      expect(payload.history[0]?.version).toBe(2);
    }
  });

  it("supports quarantine review lifecycle end-to-end", async () => {
    let quarantined = [
      {
        id: "memory-1",
        agentId: "agent-identity-memory",
        content: { text: "suspicious note" },
      },
    ];

    const gate = {
      getQuarantined: vi.fn(async () => quarantined),
      getStats: vi.fn(() => ({
        allowed: 0,
        quarantined: 1,
        rejected: 0,
        pendingReview: quarantined.length,
      })),
      reviewQuarantined: vi.fn(async (memoryId: string, decision: "approve" | "reject") => {
        const found = quarantined.find((m) => m.id === memoryId) ?? null;
        quarantined = quarantined.filter((m) => m.id !== memoryId);
        return decision === "approve" ? found : null;
      }),
    };

    const state = createState({
      autonomySvc: {
        getMemoryGate: () => gate,
      },
    });

    {
      const { req, emitBody } = createMockReq("GET", "/api/workbench/quarantine");
      const res = createMockRes();
      const p = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await p;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as {
        ok: boolean;
        quarantined: Array<{ id: string }>;
      };
      expect(payload.ok).toBe(true);
      expect(payload.quarantined.map((q) => q.id)).toEqual(["memory-1"]);
    }

    {
      const { req, emitBody } = createMockReq(
        "POST",
        "/api/workbench/quarantine/memory-1/review",
        { decision: "approve" },
      );
      const res = createMockRes();
      const p = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await p;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as {
        ok: boolean;
        memoryId: string;
        decision: string;
        memory: { id: string } | null;
      };
      expect(payload.ok).toBe(true);
      expect(payload.memoryId).toBe("memory-1");
      expect(payload.decision).toBe("approve");
      expect(payload.memory?.id).toBe("memory-1");
    }

    {
      const { req, emitBody } = createMockReq("GET", "/api/workbench/quarantine");
      const res = createMockRes();
      const p = __testOnlyHandleRequest(req, res, state);
      emitBody();
      await p;
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body) as {
        ok: boolean;
        quarantined: Array<{ id: string }>;
        stats: { pendingReview: number } | null;
      };
      expect(payload.ok).toBe(true);
      expect(payload.quarantined).toHaveLength(0);
      expect(payload.stats?.pendingReview).toBe(0);
    }
  });
});

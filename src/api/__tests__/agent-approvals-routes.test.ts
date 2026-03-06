import type { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { __testOnlyHandleRequest } from "../server.js";

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

function createState(
  overrides?: Partial<{
    stream555: {
      listPendingApprovals?: () => Array<{
        id: string;
        actionName: string;
        actionParams: Record<string, unknown>;
        createdAt: number;
        expiresAt: number;
      }>;
      resolveApproval?: (
        approvalId: string,
        decision: "approved" | "denied",
        decidedBy?: string,
      ) => boolean;
    };
    autonomy: {
      getApprovalGate?: () => {
        getPending: () => unknown[];
        resolve: (
          approvalId: string,
          decision: "approved" | "denied",
          decidedBy?: string,
        ) => boolean;
      } | null;
      getApprovalLog?: () => {
        getRecent: (limit: number) => Promise<unknown[]>;
      } | null;
    };
  }>,
) {
  const runtime = {
    agentId: "agent-test-id",
    character: {
      name: "TestAgent",
      settings: { autonomy: { apiKey: "" } },
    },
    messageService: null,
    actions: [],
    getAllActions: () => [],
    composeState: async () => ({}),
    getRoomsByWorld: async () => [],
    getMemories: async () => [],
    isActionAllowed: () => ({ allowed: true, reason: "allowed" }),
    getService: (name: string) => {
      if (name === "AUTONOMY") return overrides?.autonomy ?? null;
      if (name === "stream555") return overrides?.stream555 ?? null;
      return null;
    },
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

describe("/api/agent/approvals", () => {
  it("includes pending stream555 approvals alongside autonomy approvals", async () => {
    const state = createState({
      autonomy: {
        getApprovalGate: () => ({
          getPending: () => [
            {
              id: "kernel-1",
              call: {
                tool: "RUN_IN_TERMINAL",
                params: {},
                source: "system",
                requestId: "kernel-1",
              },
              riskClass: "irreversible",
              createdAt: 10,
              expiresAt: 20,
            },
          ],
          resolve: () => false,
        }),
        getApprovalLog: () => ({
          getRecent: async () => [],
        }),
      },
      stream555: {
        listPendingApprovals: () => [
          {
            id: "stream-1",
            actionName: "STREAM555_STREAM_STOP",
            actionParams: { sessionId: "session-1" },
            createdAt: 30,
            expiresAt: 40,
          },
        ],
      },
    });
    const { req, emitBody } = createMockReq("GET", "/api/agent/approvals");
    const res = createMockRes();

    const handlePromise = __testOnlyHandleRequest(req, res, state);
    emitBody();
    await handlePromise;

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body) as {
      pending: Array<{
        id: string;
        call: { tool: string; params: Record<string, unknown> };
      }>;
      recent: unknown[];
    };

    expect(payload.pending).toHaveLength(2);
    expect(payload.pending.find((item) => item.id === "kernel-1")).toBeTruthy();
    expect(payload.pending).toContainEqual({
      id: "stream-1",
      call: {
        tool: "STREAM555_STREAM_STOP",
        params: { sessionId: "session-1" },
        source: "plugin",
        requestId: "stream-1",
      },
      riskClass: "reversible",
      createdAt: 30,
      expiresAt: 40,
    });
    expect(payload.recent).toEqual([]);
  });

  it("resolves stream555 approvals when the autonomy gate does not own them", async () => {
    const resolveApproval = vi.fn(() => true);
    const state = createState({
      autonomy: {
        getApprovalGate: () => null,
        getApprovalLog: () => null,
      },
      stream555: {
        resolveApproval,
      },
    });
    const { req, emitBody } = createMockReq(
      "POST",
      "/api/agent/approvals/stream-approval/resolve",
      {
        decision: "approved",
        decidedBy: "operator-1",
      },
    );
    const res = createMockRes();

    const handlePromise = __testOnlyHandleRequest(req, res, state);
    emitBody();
    await handlePromise;

    expect(resolveApproval).toHaveBeenCalledWith(
      "stream-approval",
      "approved",
      "operator-1",
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      ok: true,
      id: "stream-approval",
      decision: "approved",
    });
  });
});

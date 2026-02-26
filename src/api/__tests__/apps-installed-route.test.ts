import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";

import { __testOnlyHandleRequest } from "../server.js";

function createState(listInstalled: (pluginManager: unknown) => Promise<unknown>) {
  const runtime = {
    agentId: "agent-apps-installed",
    character: {
      name: "AppsInstalledAgent",
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
    agentName: "AppsInstalledAgent",
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
    appManager: {
      listInstalled,
    },
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

function createMockReq(method: string, url: string, token: string) {
  const req = new EventEmitter() as IncomingMessage & EventEmitter;
  req.method = method;
  req.url = url;
  req.headers = {
    authorization: `Bearer ${token}`,
  };
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

describe("GET /api/apps/installed", () => {
  it("awaits app manager response and passes a plugin manager", async () => {
    const installedApps = [
      {
        name: "@elizaos/app-demo",
        displayName: "Demo",
        pluginName: "@elizaos/app-demo",
        version: "1.0.0",
        installedAt: "2026-02-26T00:00:00.000Z",
      },
    ];
    const listInstalled = vi.fn(async () => installedApps);
    const state = createState(listInstalled);
    const previousToken = process.env.MILAIDY_API_TOKEN;
    process.env.MILAIDY_API_TOKEN = "test-apps-token";

    try {
      const req = createMockReq(
        "GET",
        "/api/apps/installed",
        "test-apps-token",
      );
      const res = createMockRes();

      await __testOnlyHandleRequest(req, res, state);

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual(installedApps);
      expect(listInstalled).toHaveBeenCalledTimes(1);
      expect(listInstalled.mock.calls[0][0]).toBeTruthy();
    } finally {
      if (previousToken === undefined) {
        delete process.env.MILAIDY_API_TOKEN;
      } else {
        process.env.MILAIDY_API_TOKEN = previousToken;
      }
    }
  });
});

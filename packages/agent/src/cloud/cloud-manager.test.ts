/**
 * Tests for cloud/cloud-manager.ts — the top-level orchestrator.
 *
 * Uses a local HTTP server with real ElizaCloudClient, BackupScheduler,
 * CloudRuntimeProxy, and ConnectionMonitor instead of vi.mock.
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Only mock validate-url so it doesn't block http:// URLs in tests
vi.mock("./validate-url", () => {
  return {
    validateCloudBaseUrl: vi.fn().mockResolvedValue(null),
  };
});

import type { CloudConfig } from "../config/types.eliza";
import { CloudManager } from "./cloud-manager";

// ---------------------------------------------------------------------------
// Local test server that simulates cloud API endpoints
// ---------------------------------------------------------------------------

let server: http.Server;
let serverPort: number;
let provisionShouldFail = false;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const respond = (body: Record<string, unknown>, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    // POST /api/v1/eliza/agents/:id/provision
    if (url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+\/provision/) && req.method === "POST") {
      if (provisionShouldFail) {
        respond({ success: false, error: "provision failed" }, 500);
      } else {
        respond({ success: true, data: { id: "a1", agentName: "TestBot", status: "running" } });
      }
      return;
    }

    // GET /api/v1/eliza/agents/:id
    if (url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+$/) && req.method === "GET") {
      respond({
        success: true,
        data: {
          id: "a1",
          agentName: "TestBot",
          status: "running",
          databaseStatus: "ready",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
      return;
    }

    // POST /api/v1/eliza/agents/:id/snapshot
    if (url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+\/snapshot/) && req.method === "POST") {
      respond({
        success: true,
        data: { id: "bk-1", snapshotType: "auto", sizeBytes: null, createdAt: new Date().toISOString() },
      });
      return;
    }

    // POST /api/v1/eliza/agents/:id/bridge (heartbeat)
    if (url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+\/bridge/) && req.method === "POST") {
      respond({ success: true });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  serverPort = (server.address() as AddressInfo).port;
});

afterEach(() => {
  provisionShouldFail = false;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function cfg(overrides: Partial<CloudConfig> = {}): CloudConfig {
  return {
    enabled: true,
    apiKey: "eliza_testkey",
    baseUrl: `http://127.0.0.1:${serverPort}`,
    ...overrides,
  };
}

describe("CloudManager", () => {
  describe("init", () => {
    it("creates client from config", async () => {
      const mgr = new CloudManager(cfg());
      await mgr.init();
      expect(mgr.getClient()).not.toBeNull();
    });

    it("throws when apiKey is missing", async () => {
      const mgr = new CloudManager(cfg({ apiKey: undefined }));
      await expect(mgr.init()).rejects.toThrow(
        "Cloud API key is not configured",
      );
    });

    it("defaults to elizacloud.ai when no baseUrl", async () => {
      const mgr = new CloudManager(cfg({ baseUrl: undefined }));
      await mgr.init();
      expect(mgr.getClient()).not.toBeNull();
    });
  });

  describe("connect", () => {
    it("provisions and returns proxy", async () => {
      const mgr = new CloudManager(cfg());
      const proxy = await mgr.connect("agent-123");
      expect(proxy.agentName).toBe("TestBot");
      expect(mgr.getActiveAgentId()).toBe("agent-123");
      expect(mgr.getStatus()).toBe("connected");
      expect(mgr.getProxy()).not.toBeNull();
      await mgr.disconnect();
    });

    it("auto-inits if client not ready", async () => {
      const mgr = new CloudManager(cfg());
      expect(mgr.getClient()).toBeNull();
      await mgr.connect("agent-123");
      expect(mgr.getClient()).not.toBeNull();
      await mgr.disconnect();
    });

    it("fires status callbacks", async () => {
      const statuses: string[] = [];
      const mgr = new CloudManager(cfg(), {
        onStatusChange: (s) => statuses.push(s),
      });
      await mgr.connect("agent-123");
      expect(statuses).toContain("connecting");
      expect(statuses).toContain("connected");
      await mgr.disconnect();
    });

    it("resets status and state on connection failure", async () => {
      provisionShouldFail = true;

      const mgr = new CloudManager(cfg());
      await expect(mgr.connect("agent-123")).rejects.toThrow();
      expect(mgr.getStatus()).toBe("disconnected");
      expect(mgr.getActiveAgentId()).toBeNull();
      expect(mgr.getProxy()).toBeNull();
    });
  });

  describe("disconnect", () => {
    it("clears proxy and resets state", async () => {
      const mgr = new CloudManager(cfg());
      await mgr.connect("agent-123");
      await mgr.disconnect();
      expect(mgr.getProxy()).toBeNull();
      expect(mgr.getActiveAgentId()).toBeNull();
      expect(mgr.getStatus()).toBe("disconnected");
    });

    it("fires disconnected callback", async () => {
      const statuses: string[] = [];
      const mgr = new CloudManager(cfg(), {
        onStatusChange: (s) => statuses.push(s),
      });
      await mgr.connect("agent-123");
      statuses.length = 0;
      await mgr.disconnect();
      expect(statuses).toContain("disconnected");
    });
  });

  describe("isEnabled", () => {
    it("true when enabled + apiKey", () => {
      expect(new CloudManager(cfg()).isEnabled()).toBe(true);
    });
    it("false when not enabled", () => {
      expect(new CloudManager(cfg({ enabled: false })).isEnabled()).toBe(false);
    });
    it("false when no apiKey", () => {
      expect(new CloudManager(cfg({ apiKey: undefined })).isEnabled()).toBe(
        false,
      );
    });
  });

  describe("initial state", () => {
    it("proxy is null", () => {
      expect(new CloudManager(cfg()).getProxy()).toBeNull();
    });
    it("client is null", () => {
      expect(new CloudManager(cfg()).getClient()).toBeNull();
    });
    it("agentId is null", () => {
      expect(new CloudManager(cfg()).getActiveAgentId()).toBeNull();
    });
    it("status is disconnected", () => {
      expect(new CloudManager(cfg()).getStatus()).toBe("disconnected");
    });
  });
});

/**
 * Tests for cloud/reconnect.ts — the ConnectionMonitor.
 *
 * Uses a local HTTP server with a real ElizaCloudClient instead of mock objects.
 *
 * Exercises:
 *   - Heartbeat success keeps connection alive
 *   - Consecutive failures trigger disconnect callback
 *   - Auto-reconnect via provision after disconnect
 *   - Recovery resets failure counter
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ElizaCloudClient } from "./bridge-client";
import { ConnectionMonitor } from "./reconnect";

// ---------------------------------------------------------------------------
// Local test server with controllable heartbeat behavior
// ---------------------------------------------------------------------------

let server: http.Server;
let serverPort: number;
let heartbeatShouldSucceed = true;
let heartbeatCallCount = 0;
let heartbeatFailUntil = 0; // fail the first N heartbeats

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const respond = (body: Record<string, unknown>, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };

    // POST /api/v1/eliza/agents/:id/bridge — heartbeat
    if (url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+\/bridge/) && req.method === "POST") {
      heartbeatCallCount++;
      if (!heartbeatShouldSucceed || heartbeatCallCount <= heartbeatFailUntil) {
        res.writeHead(503);
        res.end("Service unavailable");
        return;
      }
      respond({ result: { ok: true } });
      return;
    }

    // POST /api/v1/eliza/agents/:id/provision — reconnect
    if (url.pathname.match(/\/api\/v1\/eliza\/agents\/[^/]+\/provision/) && req.method === "POST") {
      respond({
        success: true,
        data: { id: "a1", agentName: "TestBot", status: "running" },
      });
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
  heartbeatShouldSucceed = true;
  heartbeatCallCount = 0;
  heartbeatFailUntil = 0;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function createClient(): ElizaCloudClient {
  return new ElizaCloudClient(`http://127.0.0.1:${serverPort}`, "test-key");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ConnectionMonitor", () => {
  it("sends heartbeats at configured interval", async () => {
    const client = createClient();
    const monitor = new ConnectionMonitor(
      client,
      "a1",
      { onDisconnect: vi.fn(), onReconnect: vi.fn() },
      30, // 30ms interval for fast test
      3,
    );

    vi.useFakeTimers();
    try {
      monitor.start();
      await vi.advanceTimersByTimeAsync(80);
      monitor.stop();
    } finally {
      vi.useRealTimers();
    }

    // Should have fired at least 2 heartbeats in 80ms with 30ms interval
    expect(heartbeatCallCount).toBeGreaterThanOrEqual(2);
  });

  it("calls onDisconnect after maxFailures consecutive heartbeat failures", async () => {
    heartbeatShouldSucceed = false;
    const client = createClient();
    const onDisconnect = vi.fn();

    const monitor = new ConnectionMonitor(
      client,
      "a1",
      { onDisconnect, onReconnect: vi.fn() },
      20,
      3,
    );

    vi.useFakeTimers();
    try {
      monitor.start();
      await vi.advanceTimersByTimeAsync(120);
      monitor.stop();
    } finally {
      vi.useRealTimers();
    }

    expect(onDisconnect).toHaveBeenCalled();
  });

  it("calls onReconnect after successful re-provision", async () => {
    // Fail first 2 heartbeats, then succeed
    heartbeatFailUntil = 2;
    const client = createClient();
    const onReconnect = vi.fn();

    const monitor = new ConnectionMonitor(
      client,
      "a1",
      { onDisconnect: vi.fn(), onReconnect },
      20,
      2,
    );

    vi.useFakeTimers();
    try {
      monitor.start();
      await vi.advanceTimersByTimeAsync(100);
      monitor.stop();
    } finally {
      vi.useRealTimers();
    }

    expect(onReconnect).toHaveBeenCalled();
  });

  it("reports status changes via onStatusChange", async () => {
    heartbeatFailUntil = 2;
    const client = createClient();
    const statuses: string[] = [];

    const monitor = new ConnectionMonitor(
      client,
      "a1",
      {
        onDisconnect: vi.fn(),
        onReconnect: vi.fn(),
        onStatusChange: (s) => statuses.push(s),
      },
      20,
      2,
    );

    vi.useFakeTimers();
    try {
      monitor.start();
      await vi.advanceTimersByTimeAsync(100);
      monitor.stop();
    } finally {
      vi.useRealTimers();
    }

    expect(statuses).toContain("reconnecting");
    expect(statuses).toContain("connected");
    expect(statuses).not.toContain("disconnected");
  });

  it("isMonitoring reflects lifecycle", () => {
    const monitor = new ConnectionMonitor(createClient(), "a1", {
      onDisconnect: vi.fn(),
      onReconnect: vi.fn(),
    });

    expect(monitor.isMonitoring()).toBe(false);
    monitor.start();
    expect(monitor.isMonitoring()).toBe(true);
    monitor.stop();
    expect(monitor.isMonitoring()).toBe(false);
  });

  it("stop resets internal state", () => {
    const monitor = new ConnectionMonitor(createClient(), "a1", {
      onDisconnect: vi.fn(),
      onReconnect: vi.fn(),
    });

    monitor.start();
    monitor.stop();
    // Starting again should work cleanly
    monitor.start();
    expect(monitor.isMonitoring()).toBe(true);
    monitor.stop();
  });
});

/**
 * Tests for cloud/backup.ts — the BackupScheduler.
 *
 * Uses a local HTTP server with a real ElizaCloudClient instead of mocks.
 *
 * Exercises:
 *   - Start/stop lifecycle
 *   - Periodic snapshot calls
 *   - finalSnapshot for graceful shutdown
 *   - Error tolerance (failed snapshots don't crash scheduler)
 *   - Double-start prevention
 */

import http from "node:http";
import type { AddressInfo } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { BackupScheduler } from "./backup";
import { ElizaCloudClient } from "./bridge-client";

// ---------------------------------------------------------------------------
// Local test server that counts snapshot requests
// ---------------------------------------------------------------------------

let server: http.Server;
let serverPort: number;
let snapshotCallCount = 0;
let shouldFail = false;
let failCount = 0;
let maxFails = 0;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    // POST /api/v1/eliza/agents/:id/snapshot
    if (url.pathname.match(/\/api\/v1\/eliza\/agents\/.*\/snapshot/) && req.method === "POST") {
      snapshotCallCount++;

      if (shouldFail && failCount < maxFails) {
        failCount++;
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Network error" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        success: true,
        data: { id: `bk-${snapshotCallCount}`, snapshotType: "auto", sizeBytes: null, createdAt: new Date().toISOString() },
      }));
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
  snapshotCallCount = 0;
  shouldFail = false;
  failCount = 0;
  maxFails = 0;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

function createClient(): ElizaCloudClient {
  return new ElizaCloudClient(`http://127.0.0.1:${serverPort}`, "test-key");
}

describe("BackupScheduler", () => {
  it("does not fire immediately on start", () => {
    const client = createClient();
    const scheduler = new BackupScheduler(client, "a1", 5000);

    scheduler.start();
    expect(snapshotCallCount).toBe(0);
    scheduler.stop();
  });

  it("fires snapshot after one interval", async () => {
    const client = createClient();
    const scheduler = new BackupScheduler(client, "a1", 30);

    try {
      scheduler.start();
      await sleep(200);
    } finally {
      scheduler.stop();
    }

    expect(snapshotCallCount).toBeGreaterThanOrEqual(1);
  });

  it("fires multiple snapshots over time", async () => {
    const client = createClient();
    const scheduler = new BackupScheduler(client, "a1", 20);

    try {
      scheduler.start();
      await sleep(320);
    } finally {
      scheduler.stop();
    }

    expect(snapshotCallCount).toBeGreaterThanOrEqual(3);
  });

  it("stops firing after stop()", async () => {
    const client = createClient();
    const scheduler = new BackupScheduler(client, "a1", 20);

    let countAtStop = 0;
    try {
      scheduler.start();
      await sleep(200);
      countAtStop = snapshotCallCount;
      expect(countAtStop).toBeGreaterThanOrEqual(1);
      scheduler.stop();
      await sleep(120);
    } finally {
      scheduler.stop();
    }

    // No additional calls after stop
    expect(snapshotCallCount).toBe(countAtStop);
  });

  it("isRunning reflects lifecycle", () => {
    const scheduler = new BackupScheduler(createClient(), "a1", 100);

    expect(scheduler.isRunning()).toBe(false);
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);
    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("double start is a no-op", async () => {
    const client = createClient();
    const scheduler = new BackupScheduler(client, "a1", 50);

    try {
      scheduler.start();
      scheduler.start(); // should not create second timer
      await sleep(220);
    } finally {
      scheduler.stop();
    }

    expect(snapshotCallCount).toBeGreaterThanOrEqual(1);
    // With a single 50ms timer and a 220ms wait, a healthy scheduler
    // typically fires 4-5 times. A duplicated timer would exceed that.
    expect(snapshotCallCount).toBeLessThanOrEqual(5);
  });

  it("continues running after a failed snapshot", async () => {
    shouldFail = true;
    maxFails = 1;

    const client = createClient();
    const scheduler = new BackupScheduler(client, "a1", 20);

    try {
      scheduler.start();
      await sleep(260);
    } finally {
      scheduler.stop();
    }

    expect(snapshotCallCount).toBeGreaterThanOrEqual(2);
    expect(scheduler.isRunning()).toBe(false); // stopped
  });

  it("finalSnapshot calls snapshot and handles failure gracefully", async () => {
    shouldFail = true;
    maxFails = 999;

    const client = createClient();
    const scheduler = new BackupScheduler(client, "a1", 100);

    // finalSnapshot should not throw even if snapshot fails
    await scheduler.finalSnapshot();
    expect(snapshotCallCount).toBe(1);
  });
});

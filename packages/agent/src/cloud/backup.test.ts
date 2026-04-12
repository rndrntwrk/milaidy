/**
 * Tests for cloud/backup.ts — the BackupScheduler.
 *
 * Uses the real ElizaCloudClient with mocked fetch responses so the suite
 * stays deterministic and does not depend on local socket permissions.
 */

import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupScheduler } from "./backup";
import { ElizaCloudClient } from "./bridge-client";

let snapshotCallCount = 0;
let shouldFail = false;
let failCount = 0;
let maxFails = 0;

function createClient(): ElizaCloudClient {
  return new ElizaCloudClient("http://cloud.test", "test-key");
}

beforeEach(() => {
  snapshotCallCount = 0;
  shouldFail = false;
  failCount = 0;
  maxFails = 0;

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = new URL(String(input));
      if (url.pathname.match(/\/api\/v1\/eliza\/agents\/.*\/snapshot/)) {
        snapshotCallCount++;

        if (shouldFail && failCount < maxFails) {
          failCount++;
          return new Response(
            JSON.stringify({ success: false, error: "Network error" }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            success: true,
            data: {
              id: `bk-${snapshotCallCount}`,
              snapshotType: "auto",
              sizeBytes: null,
              createdAt: new Date().toISOString(),
            },
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return new Response("Not found", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  vi.restoreAllMocks();
});

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
      scheduler.start();
      await sleep(220);
    } finally {
      scheduler.stop();
    }

    expect(snapshotCallCount).toBeGreaterThanOrEqual(1);
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
    expect(scheduler.isRunning()).toBe(false);
  });

  it("finalSnapshot calls snapshot and handles failure gracefully", async () => {
    shouldFail = true;
    maxFails = 999;

    const client = createClient();
    const scheduler = new BackupScheduler(client, "a1", 100);

    await scheduler.finalSnapshot();
    expect(snapshotCallCount).toBe(1);
  });
});

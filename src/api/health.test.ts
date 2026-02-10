/**
 * Tests for health check endpoints.
 */

import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  createHealthChecks,
  runHealthChecks,
  type HealthCheck,
} from "./health.js";

describe("createHealthChecks", () => {
  test("creates memory check by default", () => {
    const checks = createHealthChecks({});
    const memoryCheck = checks.find((c) => c.name === "memory");

    expect(memoryCheck).toBeDefined();
    expect(memoryCheck?.critical).toBe(false);
  });

  test("creates disk check by default", () => {
    const checks = createHealthChecks({});
    const diskCheck = checks.find((c) => c.name === "disk");

    expect(diskCheck).toBeDefined();
    expect(diskCheck?.critical).toBe(false);
  });

  test("creates event loop check by default", () => {
    const checks = createHealthChecks({});
    const loopCheck = checks.find((c) => c.name === "event_loop");

    expect(loopCheck).toBeDefined();
    expect(loopCheck?.critical).toBe(false);
  });

  test("creates database check when db provided", () => {
    const db = {
      query: vi.fn().mockResolvedValue(undefined),
    };
    const checks = createHealthChecks({ db });
    const dbCheck = checks.find((c) => c.name === "database");

    expect(dbCheck).toBeDefined();
    expect(dbCheck?.critical).toBe(true);
  });

  test("creates plugins check when runtime provided", () => {
    const runtime = {
      getLoadedPlugins: vi.fn().mockReturnValue([]),
      getFailedPlugins: vi.fn().mockReturnValue([]),
    };
    const checks = createHealthChecks({ runtime });
    const pluginsCheck = checks.find((c) => c.name === "plugins");

    expect(pluginsCheck).toBeDefined();
  });
});

describe("runHealthChecks", () => {
  test("returns healthy when all checks pass", async () => {
    const checks: HealthCheck[] = [
      {
        name: "test1",
        critical: true,
        check: async () => ({ healthy: true }),
      },
      {
        name: "test2",
        critical: false,
        check: async () => ({ healthy: true }),
      },
    ];

    const result = await runHealthChecks(checks);

    expect(result.status).toBe("healthy");
    expect(result.checks).toHaveLength(2);
    expect(result.checks.every((c) => c.healthy)).toBe(true);
  });

  test("returns degraded when non-critical check fails", async () => {
    const checks: HealthCheck[] = [
      {
        name: "critical",
        critical: true,
        check: async () => ({ healthy: true }),
      },
      {
        name: "optional",
        critical: false,
        check: async () => ({ healthy: false, message: "Warning" }),
      },
    ];

    const result = await runHealthChecks(checks);

    expect(result.status).toBe("degraded");
  });

  test("returns unhealthy when critical check fails", async () => {
    const checks: HealthCheck[] = [
      {
        name: "critical",
        critical: true,
        check: async () => ({ healthy: false, message: "Database down" }),
      },
      {
        name: "optional",
        critical: false,
        check: async () => ({ healthy: true }),
      },
    ];

    const result = await runHealthChecks(checks);

    expect(result.status).toBe("unhealthy");
    expect(result.checks[0].message).toBe("Database down");
  });

  test("handles check timeout", async () => {
    const checks: HealthCheck[] = [
      {
        name: "slow",
        critical: true,
        timeoutMs: 100,
        check: async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { healthy: true };
        },
      },
    ];

    const result = await runHealthChecks(checks);

    expect(result.status).toBe("unhealthy");
    expect(result.checks[0].message).toContain("Timeout");
  });

  test("handles check throwing error", async () => {
    const checks: HealthCheck[] = [
      {
        name: "error",
        critical: false,
        check: async () => {
          throw new Error("Check failed");
        },
      },
    ];

    const result = await runHealthChecks(checks);

    expect(result.status).toBe("degraded");
    expect(result.checks[0].healthy).toBe(false);
    expect(result.checks[0].message).toContain("Check failed");
  });

  test("includes timing information", async () => {
    const checks: HealthCheck[] = [
      {
        name: "timed",
        critical: false,
        check: async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return { healthy: true };
        },
      },
    ];

    const result = await runHealthChecks(checks);

    expect(result.checks[0].durationMs).toBeGreaterThanOrEqual(50);
  });

  test("includes version and uptime", async () => {
    const checks: HealthCheck[] = [];
    const result = await runHealthChecks(checks);

    expect(result.version).toBeDefined();
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  test("includes system info when detailed", async () => {
    const checks: HealthCheck[] = [];
    const result = await runHealthChecks(checks, true);

    expect(result.system).toBeDefined();
    expect(result.system?.memory).toBeDefined();
    expect(result.system?.cpu).toBeDefined();
    expect(result.system?.loadAvg).toHaveLength(3);
  });

  test("excludes details when not detailed", async () => {
    const checks: HealthCheck[] = [
      {
        name: "with-details",
        critical: false,
        check: async () => ({
          healthy: true,
          details: { foo: "bar" },
        }),
      },
    ];

    const result = await runHealthChecks(checks, false);

    expect(result.checks[0].details).toBeUndefined();
  });

  test("includes details when detailed", async () => {
    const checks: HealthCheck[] = [
      {
        name: "with-details",
        critical: false,
        check: async () => ({
          healthy: true,
          details: { foo: "bar" },
        }),
      },
    ];

    const result = await runHealthChecks(checks, true);

    expect(result.checks[0].details).toEqual({ foo: "bar" });
  });
});

/**
 * Health check endpoints for Kubernetes probes and monitoring.
 *
 * Provides:
 * - /health/live  - Liveness probe (is the process alive?)
 * - /health/ready - Readiness probe (is the service ready to accept traffic?)
 * - /health       - Full health check with optional details
 *
 * @module api/health
 */

import type http from "node:http";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

// Types
export interface HealthCheck {
  name: string;
  check: () => Promise<CheckResult>;
  critical: boolean;
  timeoutMs?: number;
}

export interface CheckResult {
  healthy: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthCheckResult {
  name: string;
  healthy: boolean;
  critical: boolean;
  message?: string;
  durationMs: number;
  details?: Record<string, unknown>;
}

export interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  timestamp: string;
  checks: HealthCheckResult[];
  system?: {
    memory: {
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
      externalMb: number;
    };
    cpu: {
      user: number;
      system: number;
    };
    loadAvg: number[];
    platform: string;
    nodeVersion: string;
  };
}

// Get version from package.json or env
function getVersion(): string {
  return process.env.npm_package_version ?? "unknown";
}

// Get MILAIDY_HOME path
function getMilaidyHome(): string {
  return process.env.MILAIDY_HOME ?? path.join(os.homedir(), ".milaidy");
}

/**
 * Create the standard health checks.
 */
export function createHealthChecks(deps: {
  db?: { query: (sql: string) => Promise<unknown> };
  runtime?: {
    getLoadedPlugins?: () => Array<{ name: string }>;
    getFailedPlugins?: () => Array<{ name: string; error: string }>;
  };
  config?: {
    models?: { large?: string };
  };
  extraChecks?: HealthCheck[];
}): HealthCheck[] {
  const checks: HealthCheck[] = [];

  // Database check
  if (deps.db) {
    checks.push({
      name: "database",
      critical: true,
      timeoutMs: 5000,
      check: async () => {
        try {
          const start = Date.now();
          await deps.db!.query("SELECT 1");
          return {
            healthy: true,
            details: { latencyMs: Date.now() - start },
          };
        } catch (err) {
          return {
            healthy: false,
            message: String(err),
          };
        }
      },
    });
  }

  // Memory check
  checks.push({
    name: "memory",
    critical: false,
    check: async () => {
      const usage = process.memoryUsage();
      const heapUsedMb = usage.heapUsed / 1024 / 1024;
      const threshold = 1024; // 1GB warning threshold

      return {
        healthy: heapUsedMb < threshold,
        message:
          heapUsedMb >= threshold
            ? `Heap usage ${heapUsedMb.toFixed(0)}MB exceeds ${threshold}MB`
            : undefined,
        details: {
          heapUsedMb: Math.round(heapUsedMb),
          heapTotalMb: Math.round(usage.heapTotal / 1024 / 1024),
          rssMb: Math.round(usage.rss / 1024 / 1024),
        },
      };
    },
  });

  // Disk check
  checks.push({
    name: "disk",
    critical: false,
    check: async () => {
      try {
        const home = getMilaidyHome();
        const stats = await fs.statfs(home);
        const freeGb = (stats.bfree * stats.bsize) / 1024 / 1024 / 1024;
        const threshold = 1; // 1GB warning threshold

        return {
          healthy: freeGb > threshold,
          message:
            freeGb <= threshold
              ? `Only ${freeGb.toFixed(1)}GB disk space remaining`
              : undefined,
          details: { freeGb: Math.round(freeGb * 10) / 10, path: home },
        };
      } catch (err) {
        return {
          healthy: true, // Don't fail on disk check errors
          message: `Could not check disk: ${err}`,
        };
      }
    },
  });

  // Plugins check
  if (deps.runtime) {
    checks.push({
      name: "plugins",
      critical: false,
      check: async () => {
        const loaded = deps.runtime?.getLoadedPlugins?.() ?? [];
        const failed = deps.runtime?.getFailedPlugins?.() ?? [];

        return {
          healthy: failed.length === 0,
          message:
            failed.length > 0
              ? `${failed.length} plugins failed to load`
              : undefined,
          details: {
            loaded: loaded.length,
            failed: failed.length,
            failedNames: failed.map((p) => p.name),
          },
        };
      },
    });
  }

  // Event loop lag check
  checks.push({
    name: "event_loop",
    critical: false,
    check: async () => {
      const start = Date.now();
      await new Promise((resolve) => setImmediate(resolve));
      const lag = Date.now() - start;
      const threshold = 100; // 100ms threshold

      return {
        healthy: lag < threshold,
        message: lag >= threshold ? `Event loop lag ${lag}ms` : undefined,
        details: { lagMs: lag },
      };
    },
  });

  if (Array.isArray(deps.extraChecks) && deps.extraChecks.length > 0) {
    checks.push(...deps.extraChecks);
  }

  return checks;
}

/**
 * Run all health checks and aggregate results.
 */
export async function runHealthChecks(
  checks: HealthCheck[],
  detailed: boolean = false,
): Promise<HealthResponse> {
  const results = await Promise.all(
    checks.map(async (check) => {
      const start = Date.now();
      try {
        const result = await Promise.race([
          check.check(),
          new Promise<CheckResult>((_, reject) =>
            setTimeout(
              () => reject(new Error("Timeout")),
              check.timeoutMs ?? 5000,
            ),
          ),
        ]);

        return {
          name: check.name,
          healthy: result.healthy,
          critical: check.critical,
          message: result.message,
          durationMs: Date.now() - start,
          details: detailed ? result.details : undefined,
        };
      } catch (err) {
        return {
          name: check.name,
          healthy: false,
          critical: check.critical,
          message: String(err),
          durationMs: Date.now() - start,
        };
      }
    }),
  );

  const criticalFailed = results.some((r) => r.critical && !r.healthy);
  const anyFailed = results.some((r) => !r.healthy);

  const response: HealthResponse = {
    status: criticalFailed ? "unhealthy" : anyFailed ? "degraded" : "healthy",
    version: getVersion(),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    checks: results,
  };

  if (detailed) {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    response.system = {
      memory: {
        heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
        rssMb: Math.round(memUsage.rss / 1024 / 1024),
        externalMb: Math.round(memUsage.external / 1024 / 1024),
      },
      cpu: {
        user: cpuUsage.user / 1000000, // Convert to seconds
        system: cpuUsage.system / 1000000,
      },
      loadAvg: os.loadavg(),
      platform: os.platform(),
      nodeVersion: process.version,
    };
  }

  return response;
}

/**
 * Create health check request handler.
 */
export function createHealthHandler(checks: HealthCheck[]) {
  return async (
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<boolean> => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Liveness probe - just check if process is alive
    if (pathname === "/health/live") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return true;
    }

    // Readiness probe - check critical dependencies
    if (pathname === "/health/ready") {
      const health = await runHealthChecks(checks, false);
      const statusCode = health.status === "unhealthy" ? 503 : 200;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health));
      return true;
    }

    // Full health check with optional details
    if (pathname === "/health") {
      const detailed = url.searchParams.get("detailed") === "true";
      const health = await runHealthChecks(checks, detailed);
      const statusCode = health.status === "unhealthy" ? 503 : 200;
      res.writeHead(statusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health));
      return true;
    }

    return false;
  };
}

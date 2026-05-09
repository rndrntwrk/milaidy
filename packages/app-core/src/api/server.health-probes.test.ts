import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildKubeHealthResponse } from "./kube-health";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(path.join(dirname, "server.ts"), "utf8");

describe("Kubernetes health probes", () => {
  it("keeps /health unready until the runtime is attached", () => {
    expect(buildKubeHealthResponse("/health", false, 7)).toEqual({
      statusCode: 503,
      payload: {
        ok: false,
        ready: false,
        agentState: "starting",
        uptime: 7,
      },
    });

    expect(buildKubeHealthResponse("/health/ready", false, 7)).toEqual({
      statusCode: 503,
      payload: {
        ok: false,
        ready: false,
        agentState: "starting",
        uptime: 7,
      },
    });
  });

  it("keeps /health/live as liveness while startup is still running", () => {
    expect(buildKubeHealthResponse("/health/live", false, 7)).toEqual({
      statusCode: 200,
      payload: {
        ok: true,
        ready: false,
        agentState: "starting",
        uptime: 7,
      },
    });
  });

  it("keeps readiness closed after runtime attachment until startup is complete", () => {
    expect(buildKubeHealthResponse("/health", false, 11)).toEqual({
      statusCode: 503,
      payload: {
        ok: false,
        ready: false,
        agentState: "starting",
        uptime: 11,
      },
    });

    expect(buildKubeHealthResponse("/health/live", false, 11)).toEqual({
      statusCode: 200,
      payload: {
        ok: true,
        ready: false,
        agentState: "starting",
        uptime: 11,
      },
    });
  });

  it("marks all kube health routes healthy after startup completion", () => {
    for (const pathname of ["/health", "/health/live", "/health/ready"] as const) {
      expect(buildKubeHealthResponse(pathname, true, 11)).toEqual({
        statusCode: 200,
        payload: {
          ok: true,
          ready: true,
          agentState: "running",
          uptime: 11,
        },
      });
    }
  });

  it("does not mark Kubernetes ready from updateRuntime alone", () => {
    const updateRuntimeBlock =
      serverSource.match(
        /server\.updateRuntime = \(runtime: AgentRuntime\) => \{[\s\S]*?\n    \};/,
      )?.[0] ?? "";

    const upstreamUpdateIndex = updateRuntimeBlock.indexOf(
      "originalUpdateRuntime(runtime);",
    );
    const compatReadyIndex = updateRuntimeBlock.indexOf(
      "compatState.current = runtime;",
    );
    const backgroundRepairIndex = updateRuntimeBlock.indexOf(
      "queueMicrotask(() => {",
    );
    const kubeReadyIndex = updateRuntimeBlock.indexOf("kubeReady");

    expect(upstreamUpdateIndex).toBeGreaterThan(-1);
    expect(compatReadyIndex).toBeGreaterThan(-1);
    expect(backgroundRepairIndex).toBeGreaterThan(-1);
    expect(upstreamUpdateIndex).toBeLessThan(compatReadyIndex);
    expect(compatReadyIndex).toBeLessThan(backgroundRepairIndex);
    expect(kubeReadyIndex).toBe(-1);
  });

  it("marks Kubernetes ready only through the startup state transition", () => {
    const updateStartupBlock =
      serverSource.match(
        /server\.updateStartup = \(update\) => \{[\s\S]*?\n    \};/,
      )?.[0] ?? "";

    expect(updateStartupBlock).toContain('nextState === "running"');
    expect(updateStartupBlock).toContain("compatState.kubeReady = true;");
    expect(updateStartupBlock).toContain("compatState.kubeReady = false;");
  });
});

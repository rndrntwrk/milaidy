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

  it("marks all kube health routes healthy after runtime attachment", () => {
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

  it("does not mark the compat runtime ready until upstream updateRuntime returns", () => {
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

    expect(upstreamUpdateIndex).toBeGreaterThan(-1);
    expect(compatReadyIndex).toBeGreaterThan(-1);
    expect(backgroundRepairIndex).toBeGreaterThan(-1);
    expect(upstreamUpdateIndex).toBeLessThan(compatReadyIndex);
    expect(compatReadyIndex).toBeLessThan(backgroundRepairIndex);
  });
});

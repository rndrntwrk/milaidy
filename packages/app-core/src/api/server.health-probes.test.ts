import { describe, expect, it } from "vitest";
import { buildKubeHealthResponse } from "./kube-health";

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
});

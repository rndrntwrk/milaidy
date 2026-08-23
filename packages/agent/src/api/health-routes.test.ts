import { afterEach, describe, expect, it, vi } from "vitest";

import { handleHealthRoutes, type HealthRouteState } from "./health-routes";

function productionState(agentState: string, runtime: unknown): HealthRouteState {
  return {
    runtime: runtime as never,
    config: {} as never,
    agentState,
    agentName: "Alice",
    model: undefined,
    startedAt: Date.now() - 1_000,
    startup: { phase: agentState, attempt: 1 },
    plugins: [],
    pendingRestartReasons: [],
    connectorHealthMonitor: null,
  };
}

async function invoke(pathname: string, state: HealthRouteState) {
  let captured: { status: number; data: unknown } | null = null;
  await handleHealthRoutes({
    req: {} as never,
    res: {} as never,
    method: "GET",
    pathname,
    url: new URL(`https://alice.internal${pathname}`),
    state,
    json: (_res, data, status = 200) => {
      captured = { status, data };
    },
    error: (_res, message, status = 500) => {
      captured = { status, data: { error: message } };
    },
  });
  return captured!;
}

describe("Alice production health truth", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["stopped", "error"])(
    "keeps a retained runtime out of readiness and proof while %s",
    async (agentState) => {
      vi.stubEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
      const retainedRuntime = { plugins: [], actions: [], evaluators: [] };

      await expect(
        invoke("/health/ready", productionState(agentState, retainedRuntime)),
      ).resolves.toMatchObject({
        status: 503,
        data: { ok: false, ready: false, agentState },
      });
      await expect(
        invoke(
          "/api/alice-production/proof",
          productionState(agentState, retainedRuntime),
        ),
      ).resolves.toEqual({
        status: 503,
        data: { error: "Alice production proof unavailable" },
      });
    },
  );

  it("keeps liveness process-only even when the production runtime is stopped", async () => {
    vi.stubEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    await expect(
      invoke("/health/live", productionState("stopped", {})),
    ).resolves.toMatchObject({ status: 200, data: { ok: true, ready: false } });
  });

  it("requires both running state and a runtime object for production readiness", async () => {
    vi.stubEnv("ALICE_RUNTIME_AUTHORITY_MODE", "proposer-only");
    await expect(
      invoke("/health/ready", productionState("running", null)),
    ).resolves.toMatchObject({ status: 503, data: { ok: false, ready: false } });
    await expect(
      invoke("/health/ready", productionState("running", {})),
    ).resolves.toMatchObject({ status: 200, data: { ok: true, ready: true } });
  });
});

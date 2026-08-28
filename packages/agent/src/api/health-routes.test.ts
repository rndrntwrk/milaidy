import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import crypto from "node:crypto";
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

  it("serves an authenticated-safe capability inventory only for a matching running release", async () => {
    const dir = mkdtempSync(join(tmpdir(), "alice-capability-route-"));
    try {
      const bomPath = join(dir, "alice-capability-bom.json");
      const bomBytes = `${JSON.stringify({
        entries: [
          {
            adapter: null,
            classification: "core",
            entrypointSha256: null,
            files: [],
            id: "internal:alice-full-runtime",
            identity: "alice-full-runtime",
            implementationCallable: true,
            installed: true,
            packageSha256: null,
            policyState: "enabled",
            runtimeNames: [],
          },
        ],
        schemaVersion: "alice.capability-bom.v1",
      })}\n`;
      writeFileSync(bomPath, bomBytes);
      const digest = `sha256:${crypto.createHash("sha256").update(bomBytes).digest("hex")}`;
      const releaseEnv = {
        ALICE_CAPABILITY_BOM_PATH: bomPath,
        ALICE_CAPABILITY_BOM_SHA256: digest,
        ALICE_DEPLOYMENT_CONTROLLER_COMMIT: "7".repeat(40),
        ALICE_DEPLOYMENT_MANIFEST_SHA256: `sha256:${"9".repeat(64)}`,
        ALICE_ELIZA_COMMIT: "6".repeat(40),
        ALICE_MODAL_REVISION: "49",
        ALICE_POLICY_HASH: `sha256:${"3".repeat(64)}`,
        ALICE_PROGRAM_DIGEST: `sha256:${"1".repeat(64)}`,
        ALICE_RELEASE_DIGEST: `sha256:${"2".repeat(64)}`,
        ALICE_RUNTIME_AUTHORITY_MODE: "proposer-only",
        ALICE_RUNTIME_BUILD_MANIFEST_SHA256: `sha256:${"8".repeat(64)}`,
        ALICE_RUNTIME_IMAGE: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"5".repeat(64)}`,
        ALICE_RUNTIME_PROFILE: "full-gated",
        ALICE_SOURCE_COMMIT: "4".repeat(40),
      };
      for (const [key, value] of Object.entries(releaseEnv)) vi.stubEnv(key, value);

      await expect(
        invoke(
          "/api/alice-production/capabilities",
          productionState("running", { plugins: [] }),
        ),
      ).resolves.toMatchObject({
        status: 200,
        data: {
          schemaVersion: "alice.production-capabilities.v1",
          capabilityBomSha256: digest,
          entries: [{ id: "internal:alice-full-runtime", callable: true }],
        },
      });
      await expect(
        invoke(
          "/api/alice-production/capabilities",
          productionState("stopped", { plugins: [] }),
        ),
      ).resolves.toEqual({
        status: 503,
        data: { error: "Alice production capabilities unavailable" },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

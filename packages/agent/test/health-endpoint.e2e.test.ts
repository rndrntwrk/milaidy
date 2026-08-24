/**
 * Health Endpoint — E2E Tests
 *
 * Tests the GET /api/health endpoint added for system observability.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startApiServer } from "../src/api/server";
import { req } from "../../../test/helpers/http";

vi.mock("../src/services/mcp-marketplace", () => ({
  searchMcpMarketplace: vi.fn().mockResolvedValue({ results: [] }),
  getMcpServerDetails: vi.fn().mockResolvedValue(null),
}));

let port: number;
let server: Awaited<ReturnType<typeof startApiServer>>;

beforeAll(async () => {
  server = await startApiServer({
    port: 0,
    initialAgentState: "not_started",
  });
  port = server.port;
}, 30_000);

afterAll(async () => {
  if (server) {
    await server.close();
  }
}, 15_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("returns structured status", async () => {
    const { status, data } = await req(port, "GET", "/api/health");
    expect(status).toBe(200);
    expect(data).toHaveProperty("runtime");
    expect(data).toHaveProperty("database");
    expect(data).toHaveProperty("plugins");
    expect(data).toHaveProperty("coordinator");
    expect(data).toHaveProperty("connectors");
    expect(data).toHaveProperty("uptime");
    expect(data).toHaveProperty("agentState");
  });

  it("reports runtime not_initialized when no runtime", async () => {
    const { data } = await req(port, "GET", "/api/health");
    expect(data.runtime).toBe("not_initialized");
    expect(data.coordinator).toBe("not_wired");
  });

  it("reports plugins count", async () => {
    const { data } = await req(port, "GET", "/api/health");
    const plugins = data.plugins as Record<string, number>;
    expect(typeof plugins.loaded).toBe("number");
    expect(typeof plugins.failed).toBe("number");
  });

  it("reads back the exact signed Alice release identity when production pins are complete", async () => {
    vi.stubEnv("ALICE_PROGRAM_DIGEST", `sha256:${"1".repeat(64)}`);
    vi.stubEnv("ALICE_RELEASE_DIGEST", `sha256:${"2".repeat(64)}`);
    vi.stubEnv("ALICE_POLICY_HASH", `sha256:${"3".repeat(64)}`);
    vi.stubEnv("ALICE_SOURCE_COMMIT", "521c1697089e43e10158acad0582f2b000514520");
    vi.stubEnv("ALICE_DEPLOYMENT_CONTROLLER_COMMIT", "6".repeat(40));
    vi.stubEnv(
      "ALICE_RUNTIME_IMAGE",
      `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"4".repeat(64)}`,
    );
    vi.stubEnv(
      "ALICE_RUNTIME_BUILD_MANIFEST_SHA256",
      `sha256:${"8".repeat(64)}`,
    );
    vi.stubEnv("ALICE_DEPLOYMENT_MANIFEST_SHA256", `sha256:${"9".repeat(64)}`);
    vi.stubEnv("ALICE_ELIZA_COMMIT", "a21d401bf7429bc8c794698b20832512b5315187");
    vi.stubEnv("ALICE_MODAL_REVISION", "49");

    const { data } = await req(port, "GET", "/api/health");
    expect(data.aliceRelease).toEqual({
      programDigest: `sha256:${"1".repeat(64)}`,
      releaseDigest: `sha256:${"2".repeat(64)}`,
      policyHash: `sha256:${"3".repeat(64)}`,
      sourceCommit: "521c1697089e43e10158acad0582f2b000514520",
      deploymentControllerCommit: "6".repeat(40),
      runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"4".repeat(64)}`,
      runtimeBuildManifestSha256: `sha256:${"8".repeat(64)}`,
      elizaCommit: "a21d401bf7429bc8c794698b20832512b5315187",
      modalRevision: 49,
    });
  });

  it("does not report partial or unpinned Alice release metadata", async () => {
    vi.stubEnv("ALICE_RELEASE_DIGEST", "latest");
    const { data } = await req(port, "GET", "/api/health");
    expect(data.aliceRelease).toBeNull();
  });

  it("exposes /health/live for container liveness probes", async () => {
    const { status, data } = await req(port, "GET", "/health/live");
    expect(status).toBe(200);
    expect(data).toMatchObject({ ok: true, ready: true });
  });

  it("exposes /health/ready for container readiness probes", async () => {
    const { status, data } = await req(port, "GET", "/health/ready");
    expect(status).toBe(200);
    expect(data).toMatchObject({ ok: true, ready: true });
  });

  it("keeps /health as a liveness alias", async () => {
    const { status, data } = await req(port, "GET", "/health");
    expect(status).toBe(200);
    expect(data).toMatchObject({ ok: true });
  });
});

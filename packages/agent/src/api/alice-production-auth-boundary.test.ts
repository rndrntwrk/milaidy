import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Alice production direct-origin authentication boundary", () => {
  it("exempts process liveness only and keeps detailed health, readiness, and proof authenticated", () => {
    const source = readFileSync(new URL("./server.ts", import.meta.url), "utf8");
    const livenessDefinition = source.slice(
      source.indexOf("const isHealthEndpoint"),
      source.indexOf("const isCloudProvisioned"),
    );
    expect(livenessDefinition).toContain('pathname === "/health/live"');
    expect(livenessDefinition).not.toContain('pathname === "/api/health"');
    expect(livenessDefinition).not.toContain('pathname === "/health/ready"');
    expect(livenessDefinition).not.toContain('pathname === "/health"');
  });

  it("uses only process liveness for the image healthcheck and smoke probe", () => {
    const dockerfile = readFileSync(
      new URL("../../../../deploy/Dockerfile.ci", import.meta.url),
      "utf8",
    );
    const workflow = readFileSync(
      new URL("../../../../.github/workflows/build-cloud-agent.yml", import.meta.url),
      "utf8",
    );
    const healthcheck = dockerfile.slice(dockerfile.indexOf("HEALTHCHECK"));
    expect(healthcheck).toContain("/health/live");
    expect(healthcheck).not.toContain("/api/health");
    expect(workflow).toContain("const unauthenticatedRuntimeReads = [");
    for (const pathname of [
      "/api/health",
      "/health",
      "/health/ready",
      "/api/alice-production/proof",
    ]) {
      expect(workflow).toContain(JSON.stringify(pathname));
    }
    expect(workflow).toContain("unauthenticated.status !== 401");
  });
});

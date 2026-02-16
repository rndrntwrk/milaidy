/**
 * Tests for OpenAPI specification builder.
 */

import { describe, expect, it } from "vitest";

import { buildOpenApiSpec } from "./spec.js";

describe("buildOpenApiSpec", () => {
  const spec = buildOpenApiSpec();

  it("returns valid OpenAPI 3.1 structure", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info).toBeDefined();
    expect((spec.info as Record<string, unknown>).title).toContain("Milaidy");
  });

  it("includes paths for autonomy endpoints", () => {
    const paths = spec.paths as Record<string, unknown>;
    expect(paths["/api/agent/autonomy"]).toBeDefined();
    expect(paths["/api/agent/identity"]).toBeDefined();
    expect(paths["/api/agent/identity/history"]).toBeDefined();
    expect(paths["/api/agent/approvals"]).toBeDefined();
    expect(paths["/api/agent/safe-mode"]).toBeDefined();
    expect(paths["/metrics"]).toBeDefined();
  });

  it("includes component schemas", () => {
    const components = spec.components as Record<string, Record<string, unknown>>;
    expect(components.schemas.Identity).toBeDefined();
    expect(components.schemas.ApprovalRequest).toBeDefined();
    expect(components.schemas.Error).toBeDefined();
  });

  it("includes tags", () => {
    const tags = spec.tags as Array<{ name: string }>;
    const tagNames = tags.map((t) => t.name);
    expect(tagNames).toContain("Autonomy");
    expect(tagNames).toContain("Identity");
    expect(tagNames).toContain("Approvals");
    expect(tagNames).toContain("Safe Mode");
    expect(tagNames).toContain("Monitoring");
  });

  it("identity schema has required fields", () => {
    const components = spec.components as Record<string, Record<string, Record<string, unknown>>>;
    const identity = components.schemas.Identity;
    const props = identity.properties as Record<string, unknown>;
    expect(props.name).toBeDefined();
    expect(props.coreValues).toBeDefined();
    expect(props.communicationStyle).toBeDefined();
    expect(props.hardBoundaries).toBeDefined();
    expect(props.identityVersion).toBeDefined();
  });

  it("has server definition", () => {
    const servers = spec.servers as Array<{ url: string }>;
    expect(servers).toHaveLength(1);
    expect(servers[0].url).toContain("2138");
  });
});

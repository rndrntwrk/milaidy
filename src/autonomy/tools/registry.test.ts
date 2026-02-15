/**
 * Tests for registry.ts
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "./registry.js";
import type { ToolContract } from "./types.js";

function makeContract(overrides: Partial<ToolContract> = {}): ToolContract {
  return {
    name: "TEST_TOOL",
    description: "A test tool",
    version: "1.0.0",
    riskClass: "read-only",
    paramsSchema: z.object({}),
    requiredPermissions: [],
    sideEffects: [],
    requiresApproval: false,
    timeoutMs: 30_000,
    ...overrides,
  };
}

describe("ToolRegistry", () => {
  it("registers and retrieves a contract", () => {
    const reg = new ToolRegistry();
    const contract = makeContract();
    reg.register(contract);

    expect(reg.has("TEST_TOOL")).toBe(true);
    expect(reg.get("TEST_TOOL")).toBe(contract);
  });

  it("returns undefined for unknown tools", () => {
    const reg = new ToolRegistry();
    expect(reg.get("UNKNOWN")).toBeUndefined();
    expect(reg.has("UNKNOWN")).toBe(false);
  });

  it("overwrites on duplicate registration", () => {
    const reg = new ToolRegistry();
    const v1 = makeContract({ version: "1.0.0" });
    const v2 = makeContract({ version: "2.0.0" });

    reg.register(v1);
    reg.register(v2);

    expect(reg.get("TEST_TOOL")?.version).toBe("2.0.0");
  });

  it("getAll returns all registered contracts", () => {
    const reg = new ToolRegistry();
    reg.register(makeContract({ name: "A" }));
    reg.register(makeContract({ name: "B" }));
    reg.register(makeContract({ name: "C" }));

    expect(reg.getAll()).toHaveLength(3);
  });

  it("getByRiskClass filters correctly", () => {
    const reg = new ToolRegistry();
    reg.register(makeContract({ name: "A", riskClass: "read-only" }));
    reg.register(makeContract({ name: "B", riskClass: "reversible" }));
    reg.register(makeContract({ name: "C", riskClass: "irreversible" }));
    reg.register(makeContract({ name: "D", riskClass: "reversible" }));

    expect(reg.getByRiskClass("reversible")).toHaveLength(2);
    expect(reg.getByRiskClass("read-only")).toHaveLength(1);
    expect(reg.getByRiskClass("irreversible")).toHaveLength(1);
  });

  it("getByTag filters by tag", () => {
    const reg = new ToolRegistry();
    reg.register(makeContract({ name: "A", tags: ["media", "ai"] }));
    reg.register(makeContract({ name: "B", tags: ["system"] }));
    reg.register(makeContract({ name: "C", tags: ["media"] }));

    expect(reg.getByTag("media")).toHaveLength(2);
    expect(reg.getByTag("system")).toHaveLength(1);
    expect(reg.getByTag("unknown")).toHaveLength(0);
  });

  it("unregister removes a contract", () => {
    const reg = new ToolRegistry();
    reg.register(makeContract());

    expect(reg.unregister("TEST_TOOL")).toBe(true);
    expect(reg.has("TEST_TOOL")).toBe(false);
    expect(reg.unregister("TEST_TOOL")).toBe(false);
  });
});

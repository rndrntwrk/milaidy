import { describe, expect, it, vi } from "vitest";
import type { ToolContract, ToolRegistryInterface } from "../tools/types.js";
import type { InvariantCheckerInterface } from "../verification/invariants/types.js";
import { DomainPackRegistry } from "./registry.js";
import type { DomainPack } from "./types.js";

// ---------- Helpers ----------

function makeMockToolRegistry(): ToolRegistryInterface {
  return {
    register: vi.fn(),
    get: vi.fn(),
    getAll: vi.fn(() => []),
    getByRiskClass: vi.fn(() => []),
    getByTag: vi.fn(() => []),
    has: vi.fn(() => false),
    unregister: vi.fn(() => true),
  };
}

function makeMockInvariantChecker(): InvariantCheckerInterface {
  return {
    register: vi.fn(),
    registerMany: vi.fn(),
    check: vi.fn(async () => ({
      status: "passed" as const,
      checks: [],
      hasCriticalViolation: false,
    })),
  };
}

function makeToolContract(name: string): ToolContract {
  return {
    name,
    description: `Test tool ${name}`,
    version: "1.0.0",
    riskClass: "read-only",
    paramsSchema: { parse: (v: unknown) => v } as any,
    requiredPermissions: [],
    sideEffects: [],
    requiresApproval: false,
    timeoutMs: 5000,
    tags: ["test-domain"],
  };
}

function makeDomainPack(overrides?: Partial<DomainPack>): DomainPack {
  return {
    id: "test-domain",
    name: "Test Domain",
    version: "1.0.0",
    description: "A test domain pack",
    toolContracts: [makeToolContract("TEST_TOOL_A"), makeToolContract("TEST_TOOL_B")],
    invariants: [
      {
        id: "test:invariant",
        description: "Test invariant",
        severity: "warning",
        owner: "test:domain",
        check: async () => true,
      },
    ],
    benchmarks: [
      {
        id: "test:bench",
        description: "Test benchmark",
        scenarios: [],
        passThreshold: 0.9,
      },
    ],
    tags: ["test-domain"],
    safeModeTriggers: [],
    ...overrides,
  };
}

// ---------- Tests ----------

describe("DomainPackRegistry", () => {
  it("registers and retrieves a domain pack", () => {
    const registry = new DomainPackRegistry();
    const pack = makeDomainPack();

    registry.register(pack);

    expect(registry.has("test-domain")).toBe(true);
    expect(registry.get("test-domain")).toBe(pack);
  });

  it("returns undefined for unregistered pack", () => {
    const registry = new DomainPackRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
    expect(registry.has("nonexistent")).toBe(false);
  });

  it("overwrites on double register", () => {
    const registry = new DomainPackRegistry();
    const pack1 = makeDomainPack({ version: "1.0.0" });
    const pack2 = makeDomainPack({ version: "2.0.0" });

    registry.register(pack1);
    registry.register(pack2);

    expect(registry.get("test-domain")?.version).toBe("2.0.0");
  });

  it("load registers tools and invariants", () => {
    const registry = new DomainPackRegistry();
    const toolRegistry = makeMockToolRegistry();
    const invariantChecker = makeMockInvariantChecker();
    const pack = makeDomainPack();

    registry.register(pack);
    registry.load("test-domain", toolRegistry, invariantChecker);

    expect(toolRegistry.register).toHaveBeenCalledTimes(2);
    expect(invariantChecker.registerMany).toHaveBeenCalledWith(pack.invariants);
  });

  it("load throws for unregistered pack", () => {
    const registry = new DomainPackRegistry();
    const toolRegistry = makeMockToolRegistry();
    const invariantChecker = makeMockInvariantChecker();

    expect(() =>
      registry.load("nonexistent", toolRegistry, invariantChecker),
    ).toThrow('Domain pack "nonexistent" is not registered');
  });

  it("getLoaded returns only loaded packs", () => {
    const registry = new DomainPackRegistry();
    const toolRegistry = makeMockToolRegistry();
    const invariantChecker = makeMockInvariantChecker();

    const pack1 = makeDomainPack({ id: "domain-a", name: "Domain A" });
    const pack2 = makeDomainPack({ id: "domain-b", name: "Domain B" });

    registry.register(pack1);
    registry.register(pack2);
    registry.load("domain-a", toolRegistry, invariantChecker);

    const loaded = registry.getLoaded();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("domain-a");
  });

  it("getAll returns info for all registered packs", () => {
    const registry = new DomainPackRegistry();
    const toolRegistry = makeMockToolRegistry();
    const invariantChecker = makeMockInvariantChecker();

    const pack = makeDomainPack();
    registry.register(pack);
    registry.load("test-domain", toolRegistry, invariantChecker);

    const infos = registry.getAll();
    expect(infos).toHaveLength(1);
    expect(infos[0].id).toBe("test-domain");
    expect(infos[0].status).toBe("loaded");
    expect(infos[0].toolCount).toBe(2);
    expect(infos[0].invariantCount).toBe(1);
    expect(infos[0].benchmarkCount).toBe(1);
    expect(infos[0].loadedAt).toBeDefined();
  });

  it("unload removes tools from registry", () => {
    const registry = new DomainPackRegistry();
    const toolRegistry = makeMockToolRegistry();
    const invariantChecker = makeMockInvariantChecker();
    const pack = makeDomainPack();

    registry.register(pack);
    registry.load("test-domain", toolRegistry, invariantChecker);
    registry.unload("test-domain", toolRegistry);

    expect(toolRegistry.unregister).toHaveBeenCalledTimes(2);
    expect(toolRegistry.unregister).toHaveBeenCalledWith("TEST_TOOL_A");
    expect(toolRegistry.unregister).toHaveBeenCalledWith("TEST_TOOL_B");
  });

  it("unload sets status to unloaded", () => {
    const registry = new DomainPackRegistry();
    const toolRegistry = makeMockToolRegistry();
    const invariantChecker = makeMockInvariantChecker();

    registry.register(makeDomainPack());
    registry.load("test-domain", toolRegistry, invariantChecker);
    registry.unload("test-domain", toolRegistry);

    const infos = registry.getAll();
    expect(infos[0].status).toBe("unloaded");
    expect(infos[0].loadedAt).toBeUndefined();
  });

  it("unload throws for unregistered pack", () => {
    const registry = new DomainPackRegistry();
    const toolRegistry = makeMockToolRegistry();

    expect(() => registry.unload("nonexistent", toolRegistry)).toThrow(
      'Domain pack "nonexistent" is not registered',
    );
  });

  it("load skips registerMany for empty invariants", () => {
    const registry = new DomainPackRegistry();
    const toolRegistry = makeMockToolRegistry();
    const invariantChecker = makeMockInvariantChecker();
    const pack = makeDomainPack({ invariants: [] });

    registry.register(pack);
    registry.load("test-domain", toolRegistry, invariantChecker);

    expect(invariantChecker.registerMany).not.toHaveBeenCalled();
  });

  it("getAll returns unloaded status for registered but not loaded pack", () => {
    const registry = new DomainPackRegistry();
    registry.register(makeDomainPack());

    const infos = registry.getAll();
    expect(infos[0].status).toBe("unloaded");
  });
});

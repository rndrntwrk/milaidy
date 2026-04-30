import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../tools/registry.js";
import {
  CODE_ANALYSIS,
  CODING_TOOL_CONTRACTS,
  GIT_OPERATION,
  READ_FILE,
  RUN_TESTS,
  SHELL_EXEC,
  WRITE_FILE,
  registerCodingToolContracts,
} from "./tool-contracts.js";

// ---------- Tests ----------

describe("Coding tool contracts", () => {
  it("exports exactly 6 contracts", () => {
    expect(CODING_TOOL_CONTRACTS).toHaveLength(6);
  });

  it("all contracts have unique names", () => {
    const names = CODING_TOOL_CONTRACTS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all contracts have version 1.0.0", () => {
    for (const contract of CODING_TOOL_CONTRACTS) {
      expect(contract.version).toBe("1.0.0");
    }
  });

  it("all contracts include the coding tag", () => {
    for (const contract of CODING_TOOL_CONTRACTS) {
      expect(contract.tags).toContain("coding");
    }
  });

  it("READ_FILE is read-only with fs:read:workspace", () => {
    expect(READ_FILE.riskClass).toBe("read-only");
    expect(READ_FILE.requiredPermissions).toContain("fs:read:workspace");
    expect(READ_FILE.requiresApproval).toBe(false);
    expect(READ_FILE.sideEffects).toHaveLength(0);
  });

  it("WRITE_FILE is reversible with fs:write:workspace", () => {
    expect(WRITE_FILE.riskClass).toBe("reversible");
    expect(WRITE_FILE.requiredPermissions).toContain("fs:write:workspace");
    expect(WRITE_FILE.sideEffects).toHaveLength(1);
    expect(WRITE_FILE.sideEffects[0].reversible).toBe(true);
  });

  it("RUN_TESTS is reversible with process:spawn and testing tag", () => {
    expect(RUN_TESTS.riskClass).toBe("reversible");
    expect(RUN_TESTS.requiredPermissions).toContain("process:spawn");
    expect(RUN_TESTS.tags).toContain("testing");
  });

  it("SHELL_EXEC is irreversible, requires approval, and uses process:shell", () => {
    expect(SHELL_EXEC.riskClass).toBe("irreversible");
    expect(SHELL_EXEC.requiresApproval).toBe(true);
    expect(SHELL_EXEC.requiredPermissions).toContain("process:shell");
    expect(SHELL_EXEC.sideEffects[0].reversible).toBe(false);
  });

  it("CODE_ANALYSIS is read-only with no side effects", () => {
    expect(CODE_ANALYSIS.riskClass).toBe("read-only");
    expect(CODE_ANALYSIS.sideEffects).toHaveLength(0);
    expect(CODE_ANALYSIS.requiresApproval).toBe(false);
  });

  it("GIT_OPERATION is reversible with process:spawn and fs:write:workspace", () => {
    expect(GIT_OPERATION.riskClass).toBe("reversible");
    expect(GIT_OPERATION.requiredPermissions).toContain("process:spawn");
    expect(GIT_OPERATION.requiredPermissions).toContain("fs:write:workspace");
  });

  it("registerCodingToolContracts adds all contracts to registry", () => {
    const registry = new ToolRegistry();
    registerCodingToolContracts(registry);

    expect(registry.has("READ_FILE")).toBe(true);
    expect(registry.has("WRITE_FILE")).toBe(true);
    expect(registry.has("RUN_TESTS")).toBe(true);
    expect(registry.has("SHELL_EXEC")).toBe(true);
    expect(registry.has("CODE_ANALYSIS")).toBe(true);
    expect(registry.has("GIT_OPERATION")).toBe(true);

    const codingTools = registry.getByTag("coding");
    expect(codingTools).toHaveLength(6);
  });

  it("Zod schemas validate correct params", () => {
    expect(READ_FILE.paramsSchema.safeParse({ path: "/foo.ts" }).success).toBe(
      true,
    );
    expect(
      WRITE_FILE.paramsSchema.safeParse({ path: "/foo.ts", content: "hello" })
        .success,
    ).toBe(true);
    expect(
      RUN_TESTS.paramsSchema.safeParse({ command: "vitest run" }).success,
    ).toBe(true);
    expect(
      SHELL_EXEC.paramsSchema.safeParse({ command: "ls -la" }).success,
    ).toBe(true);
    expect(
      CODE_ANALYSIS.paramsSchema.safeParse({ path: "/src" }).success,
    ).toBe(true);
    expect(
      GIT_OPERATION.paramsSchema.safeParse({ subcommand: "status" }).success,
    ).toBe(true);
  });

  it("Zod schemas reject invalid params", () => {
    expect(READ_FILE.paramsSchema.safeParse({}).success).toBe(false);
    expect(READ_FILE.paramsSchema.safeParse({ path: "" }).success).toBe(false);
    expect(
      WRITE_FILE.paramsSchema.safeParse({ path: "/foo.ts" }).success,
    ).toBe(false); // missing content
    expect(RUN_TESTS.paramsSchema.safeParse({ command: "" }).success).toBe(
      false,
    );
    expect(
      SHELL_EXEC.paramsSchema.safeParse({ command: "", extra: true }).success,
    ).toBe(false);
  });
});

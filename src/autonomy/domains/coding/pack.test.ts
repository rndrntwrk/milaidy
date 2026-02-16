import { describe, expect, it } from "vitest";
import type { DomainTriggerContext } from "../types.js";
import {
  CODING_SAFE_MODE_TRIGGERS,
  pathViolationTrigger,
  repeatedTestFailureTrigger,
  shellTimeoutTrigger,
} from "./safe-mode-triggers.js";
import { CODING_DOMAIN_PACK, createCodingDomainPack } from "./pack.js";

// ---------- Helpers ----------

function makeTriggerCtx(
  overrides?: Partial<DomainTriggerContext>,
): DomainTriggerContext {
  return {
    requestId: "req-1",
    toolName: "SHELL_EXEC",
    result: "ok",
    durationMs: 1000,
    consecutiveErrors: 0,
    ...overrides,
  };
}

// ---------- Tests ----------

describe("CODING_DOMAIN_PACK", () => {
  it("has correct metadata", () => {
    expect(CODING_DOMAIN_PACK.id).toBe("coding");
    expect(CODING_DOMAIN_PACK.name).toBe("Software Engineering");
    expect(CODING_DOMAIN_PACK.version).toBe("1.0.0");
    expect(CODING_DOMAIN_PACK.governancePolicyId).toBe("coding-governance");
  });

  it("has 6 tool contracts", () => {
    expect(CODING_DOMAIN_PACK.toolContracts).toHaveLength(6);
  });

  it("has 6 invariants", () => {
    expect(CODING_DOMAIN_PACK.invariants).toHaveLength(6);
  });

  it("has 2 benchmarks", () => {
    expect(CODING_DOMAIN_PACK.benchmarks).toHaveLength(2);
  });

  it("has 3 safe-mode triggers", () => {
    expect(CODING_DOMAIN_PACK.safeModeTriggers).toHaveLength(3);
  });

  it("has coding tag", () => {
    expect(CODING_DOMAIN_PACK.tags).toContain("coding");
  });
});

describe("createCodingDomainPack", () => {
  it("returns default pack without config", () => {
    const pack = createCodingDomainPack();
    expect(pack.id).toBe("coding");
    expect(pack.toolContracts).toHaveLength(6);
  });

  it("sets requiresApproval on WRITE_FILE when configured", () => {
    const pack = createCodingDomainPack({ requireApprovalForWrites: true });
    const writeFile = pack.toolContracts.find((c) => c.name === "WRITE_FILE");
    expect(writeFile?.requiresApproval).toBe(true);
  });

  it("overrides SHELL_EXEC timeout when configured", () => {
    const pack = createCodingDomainPack({ maxShellTimeoutMs: 30_000 });
    const shellExec = pack.toolContracts.find((c) => c.name === "SHELL_EXEC");
    expect(shellExec?.timeoutMs).toBe(30_000);
  });

  it("does not modify other contracts", () => {
    const pack = createCodingDomainPack({ requireApprovalForWrites: true });
    const readFile = pack.toolContracts.find((c) => c.name === "READ_FILE");
    expect(readFile?.requiresApproval).toBe(false);
  });
});

describe("Coding safe-mode triggers", () => {
  it("exports 3 triggers", () => {
    expect(CODING_SAFE_MODE_TRIGGERS).toHaveLength(3);
  });

  it("shellTimeoutTrigger fires for long shell commands", async () => {
    expect(
      await shellTimeoutTrigger.check(
        makeTriggerCtx({ durationMs: 200_000 }),
      ),
    ).toBe(true);
    expect(
      await shellTimeoutTrigger.check(
        makeTriggerCtx({ durationMs: 5_000 }),
      ),
    ).toBe(false);
  });

  it("shellTimeoutTrigger skips non-shell tools", async () => {
    expect(
      await shellTimeoutTrigger.check(
        makeTriggerCtx({ toolName: "READ_FILE", durationMs: 200_000 }),
      ),
    ).toBe(false);
  });

  it("repeatedTestFailureTrigger fires at 3+ consecutive errors", async () => {
    expect(
      await repeatedTestFailureTrigger.check(
        makeTriggerCtx({ consecutiveErrors: 3 }),
      ),
    ).toBe(true);
    expect(
      await repeatedTestFailureTrigger.check(
        makeTriggerCtx({ consecutiveErrors: 2 }),
      ),
    ).toBe(false);
  });

  it("pathViolationTrigger fires for forbidden paths", async () => {
    expect(
      await pathViolationTrigger.check(
        makeTriggerCtx({
          toolName: "WRITE_FILE",
          result: "wrote to /etc/passwd",
        }),
      ),
    ).toBe(true);
    expect(
      await pathViolationTrigger.check(
        makeTriggerCtx({
          toolName: "WRITE_FILE",
          result: "wrote to /home/user/file.ts",
        }),
      ),
    ).toBe(false);
  });

  it("pathViolationTrigger skips read-only tools", async () => {
    expect(
      await pathViolationTrigger.check(
        makeTriggerCtx({
          toolName: "READ_FILE",
          result: "read /etc/hosts",
        }),
      ),
    ).toBe(false);
  });
});

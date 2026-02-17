import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAFE_MODE_TOOL_CLASS_RESTRICTIONS,
  evaluateSafeModeToolRestriction,
} from "./safe-mode-policy.js";

describe("safe-mode policy", () => {
  it("allows all tools when safe mode is not active", () => {
    const decision = evaluateSafeModeToolRestriction({
      safeModeActive: false,
      toolName: "RUN_IN_TERMINAL",
      riskClass: "irreversible",
      source: "llm",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.inSafeMode).toBe(false);
  });

  it("allows read-only tools while safe mode is active", () => {
    const decision = evaluateSafeModeToolRestriction({
      safeModeActive: true,
      toolName: "GET_STATUS",
      riskClass: "read-only",
      source: "system",
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toContain(
      DEFAULT_SAFE_MODE_TOOL_CLASS_RESTRICTIONS["read-only"].reason,
    );
  });

  it("blocks reversible and irreversible tools while safe mode is active", () => {
    const reversible = evaluateSafeModeToolRestriction({
      safeModeActive: true,
      toolName: "GENERATE_IMAGE",
      riskClass: "reversible",
      source: "llm",
    });
    const irreversible = evaluateSafeModeToolRestriction({
      safeModeActive: true,
      toolName: "RUN_IN_TERMINAL",
      riskClass: "irreversible",
      source: "llm",
    });

    expect(reversible.allowed).toBe(false);
    expect(irreversible.allowed).toBe(false);
  });

  it("blocks tools with unknown risk classification while safe mode is active", () => {
    const decision = evaluateSafeModeToolRestriction({
      safeModeActive: true,
      toolName: "UNKNOWN_TOOL",
      riskClass: undefined,
      source: "plugin",
    });

    expect(decision.allowed).toBe(false);
    expect(decision.riskClass).toBe("unknown");
  });
});

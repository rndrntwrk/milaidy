import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALICE_HIGH_RISK_ACTION_REGISTER,
  validateAliceHighRiskActionRegister,
} from "../high-risk-action-register";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..", "..");

describe("Alice high-risk action register", () => {
  it("has owners, explicit operator visibility, and audit requirements", () => {
    expect(() => validateAliceHighRiskActionRegister()).not.toThrow();
  });

  it("references real files for guardrails and security anchors", () => {
    for (const entry of ALICE_HIGH_RISK_ACTION_REGISTER) {
      for (const file of [...entry.guardrailPaths, ...entry.securityAnchors]) {
        expect(
          existsSync(path.join(repoRoot, file)),
          `${entry.id} references missing file: ${file}`,
        ).toBe(true);
      }
    }
  });
});

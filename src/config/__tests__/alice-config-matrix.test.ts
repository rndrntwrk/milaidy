import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALICE_CONFIG_MATRIX,
  validateAliceConfigMatrix,
} from "../alice-config-matrix";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..", "..");

describe("Alice config matrix", () => {
  it("has unique entries with repeatable commands and environment scope", () => {
    expect(() => validateAliceConfigMatrix()).not.toThrow();
  });

  it("anchors every matrix entry to real repo files", () => {
    for (const entry of ALICE_CONFIG_MATRIX) {
      for (const file of entry.sourceAnchors) {
        expect(
          existsSync(path.join(repoRoot, file)),
          `${entry.id} references missing file: ${file}`,
        ).toBe(true);
      }
    }
  });
});

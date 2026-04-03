import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALICE_KNOWLEDGE_SOURCE_REGISTER,
  buildAliceKnowledgeSourceSnapshot,
  validateAliceKnowledgeSourceRegister,
} from "./alice-knowledge-source-register";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..", "..");

describe("Alice knowledge source register", () => {
  it("validates current anchors and refresh rules", () => {
    expect(() => validateAliceKnowledgeSourceRegister(repoRoot)).not.toThrow();
  });

  it("builds versioned snapshots for each source set", () => {
    for (const entry of ALICE_KNOWLEDGE_SOURCE_REGISTER) {
      const snapshot = buildAliceKnowledgeSourceSnapshot(repoRoot, entry);
      expect(snapshot.fileCount).toBeGreaterThan(0);
      expect(snapshot.sourceVersion.startsWith(`${entry.id}:`)).toBe(true);
      expect(snapshot.lastModifiedAt).not.toBeNull();
    }
  });
});

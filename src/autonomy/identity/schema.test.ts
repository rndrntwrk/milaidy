/**
 * Tests for autonomy/identity/schema.ts
 *
 * Exercises:
 *   - Identity hash computation and verification
 *   - Default identity creation
 *   - Identity validation
 */

import { describe, expect, it } from "vitest";
import {
  computeIdentityHash,
  createDefaultAutonomyIdentity,
  validateAutonomyIdentity,
  verifyIdentityIntegrity,
} from "./schema.js";

describe("AutonomyIdentitySchema", () => {
  describe("computeIdentityHash", () => {
    it("produces a hex string", () => {
      const identity = createDefaultAutonomyIdentity();
      const hash = computeIdentityHash(identity);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces same hash for same identity", () => {
      const identity = createDefaultAutonomyIdentity();
      expect(computeIdentityHash(identity)).toBe(computeIdentityHash(identity));
    });

    it("produces different hash when core values change", () => {
      const a = createDefaultAutonomyIdentity();
      const b = createDefaultAutonomyIdentity();
      b.coreValues = ["different_value"];

      expect(computeIdentityHash(a)).not.toBe(computeIdentityHash(b));
    });

    it("produces different hash when hard boundaries change", () => {
      const a = createDefaultAutonomyIdentity();
      const b = createDefaultAutonomyIdentity();
      b.hardBoundaries = ["no politics"];

      expect(computeIdentityHash(a)).not.toBe(computeIdentityHash(b));
    });

    it("is order-independent for arrays (sorted internally)", () => {
      const a = createDefaultAutonomyIdentity();
      a.coreValues = ["honesty", "helpfulness", "safety"];

      const b = createDefaultAutonomyIdentity();
      b.coreValues = ["safety", "helpfulness", "honesty"];

      expect(computeIdentityHash(a)).toBe(computeIdentityHash(b));
    });
  });

  describe("verifyIdentityIntegrity", () => {
    it("returns true for untampered identity", () => {
      const identity = createDefaultAutonomyIdentity();
      expect(verifyIdentityIntegrity(identity)).toBe(true);
    });

    it("returns true when no hash stored", () => {
      const identity = createDefaultAutonomyIdentity();
      identity.identityHash = undefined;
      expect(verifyIdentityIntegrity(identity)).toBe(true);
    });

    it("returns false when identity is tampered", () => {
      const identity = createDefaultAutonomyIdentity();
      identity.coreValues.push("malicious_value");
      expect(verifyIdentityIntegrity(identity)).toBe(false);
    });
  });

  describe("createDefaultAutonomyIdentity", () => {
    it("creates identity with default values", () => {
      const identity = createDefaultAutonomyIdentity();

      expect(identity.coreValues).toContain("helpfulness");
      expect(identity.coreValues).toContain("honesty");
      expect(identity.coreValues).toContain("safety");
      expect(identity.communicationStyle.tone).toBe("casual");
      expect(identity.communicationStyle.verbosity).toBe("balanced");
      expect(identity.identityVersion).toBe(1);
      expect(identity.identityHash).toBeDefined();
    });

    it("merges base ElizaOS identity config", () => {
      const identity = createDefaultAutonomyIdentity({
        name: "TestAgent",
        theme: "dark",
      });

      expect(identity.name).toBe("TestAgent");
      expect(identity.theme).toBe("dark");
      expect(identity.coreValues).toHaveLength(3);
    });
  });

  describe("validateAutonomyIdentity", () => {
    it("returns no issues for valid identity", () => {
      const identity = createDefaultAutonomyIdentity();
      expect(validateAutonomyIdentity(identity)).toHaveLength(0);
    });

    it("reports missing core values", () => {
      const identity = createDefaultAutonomyIdentity();
      identity.coreValues = [];

      const issues = validateAutonomyIdentity(identity);
      expect(issues.some((i) => i.field === "coreValues")).toBe(true);
    });

    it("reports invalid tone", () => {
      const identity = createDefaultAutonomyIdentity();
      (identity.communicationStyle as { tone: string }).tone = "invalid";

      const issues = validateAutonomyIdentity(identity);
      expect(issues.some((i) => i.field === "communicationStyle.tone")).toBe(true);
    });

    it("reports invalid verbosity", () => {
      const identity = createDefaultAutonomyIdentity();
      (identity.communicationStyle as { verbosity: string }).verbosity = "extreme";

      const issues = validateAutonomyIdentity(identity);
      expect(issues.some((i) => i.field === "communicationStyle.verbosity")).toBe(true);
    });

    it("reports invalid identity version", () => {
      const identity = createDefaultAutonomyIdentity();
      identity.identityVersion = 0;

      const issues = validateAutonomyIdentity(identity);
      expect(issues.some((i) => i.field === "identityVersion")).toBe(true);
    });
  });
});

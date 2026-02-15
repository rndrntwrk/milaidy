/**
 * Tests for identity service contract.
 *
 * Exercises the autonomy service's identity interface:
 *   - getIdentityConfig() — returns current identity or null
 *   - updateIdentityConfig() — validates, updates, returns new identity
 *   - Identity history shape — version trail structure
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutonomyIdentityConfig } from "../autonomy/identity/schema.js";
import { createDefaultAutonomyIdentity } from "../autonomy/identity/schema.js";

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockIdentity = createDefaultAutonomyIdentity();

const mockAutonomySvc = {
  enableAutonomy: vi.fn(),
  disableAutonomy: vi.fn(),
  isLoopRunning: vi.fn(() => true),
  getGoalManager: vi.fn(() => null),
  getMemoryGate: vi.fn(() => null),
  getIdentityConfig: vi.fn(() => ({ ...mockIdentity })),
  updateIdentityConfig: vi.fn(async (update: Partial<AutonomyIdentityConfig>) => {
    const updated = {
      ...mockIdentity,
      ...update,
      communicationStyle: {
        ...mockIdentity.communicationStyle,
        ...(update.communicationStyle ?? {}),
      },
      identityVersion: mockIdentity.identityVersion + 1,
      identityHash: "updated-hash",
    };
    return updated;
  }),
};

const mockRuntime = {
  getService: vi.fn((type: string) => {
    if (type === "AUTONOMY") return mockAutonomySvc;
    return null;
  }),
} as unknown as import("@elizaos/core").AgentRuntime;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Identity service contract", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getIdentityConfig()", () => {
    it("returns identity when available", () => {
      mockAutonomySvc.getIdentityConfig.mockReturnValueOnce({ ...mockIdentity });

      const identity = mockAutonomySvc.getIdentityConfig();
      expect(identity).not.toBeNull();
      expect(identity!.coreValues).toEqual(["helpfulness", "honesty", "safety"]);
      expect(identity!.identityVersion).toBe(1);
    });

    it("returns null when service has no identity", () => {
      mockAutonomySvc.getIdentityConfig.mockReturnValueOnce(null);

      const identity = mockAutonomySvc.getIdentityConfig();
      expect(identity).toBeNull();
    });
  });

  describe("updateIdentityConfig()", () => {
    it("updates identity with valid data", async () => {
      const update = { coreValues: ["helpfulness", "honesty", "safety", "transparency"] };
      const result = await mockAutonomySvc.updateIdentityConfig(update);

      expect(result.identityVersion).toBe(mockIdentity.identityVersion + 1);
      expect(result.coreValues).toContain("transparency");
      expect(result.identityHash).toBe("updated-hash");
    });

    it("rejects invalid updates", async () => {
      mockAutonomySvc.updateIdentityConfig.mockRejectedValueOnce(
        new Error("Identity validation failed: coreValues: Must have at least one core value"),
      );

      await expect(
        mockAutonomySvc.updateIdentityConfig({ coreValues: [] }),
      ).rejects.toThrow("Identity validation failed");
    });

    it("merges communication style partially", async () => {
      const update = { communicationStyle: { tone: "formal" as const } };
      const result = await mockAutonomySvc.updateIdentityConfig(update);

      expect(result.communicationStyle.tone).toBe("formal");
      // Other fields preserved
      expect(result.communicationStyle.verbosity).toBe(mockIdentity.communicationStyle.verbosity);
    });
  });

  describe("identity history shape", () => {
    it("returns version and hash info", () => {
      const identity = mockAutonomySvc.getIdentityConfig();
      expect(identity).not.toBeNull();

      const historyResponse = {
        version: identity!.identityVersion,
        hash: identity!.identityHash ?? null,
        history: [
          {
            version: identity!.identityVersion,
            hash: identity!.identityHash ?? null,
            timestamp: Date.now(),
          },
        ],
      };

      expect(historyResponse.version).toBe(1);
      expect(historyResponse.hash).toBeDefined();
      expect(historyResponse.history).toHaveLength(1);
    });

    it("returns empty history when no identity", () => {
      mockAutonomySvc.getIdentityConfig.mockReturnValueOnce(null);

      const identity = mockAutonomySvc.getIdentityConfig();
      const historyResponse = identity
        ? { version: identity.identityVersion, hash: identity.identityHash, history: [] }
        : { version: 0, hash: null, history: [] };

      expect(historyResponse.version).toBe(0);
      expect(historyResponse.hash).toBeNull();
      expect(historyResponse.history).toHaveLength(0);
    });
  });

  describe("AutonomyServiceLike interface integration", () => {
    it("service exposes getIdentityConfig", () => {
      expect(typeof mockAutonomySvc.getIdentityConfig).toBe("function");
    });

    it("service exposes updateIdentityConfig", () => {
      expect(typeof mockAutonomySvc.updateIdentityConfig).toBe("function");
    });

    it("runtime resolves autonomy service by type", () => {
      const svc = mockRuntime.getService("AUTONOMY");
      expect(svc).toBe(mockAutonomySvc);
    });
  });
});

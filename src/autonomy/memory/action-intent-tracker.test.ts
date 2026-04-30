/**
 * Tests for action intent tracker.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { ActionIntentTracker } from "./action-intent-tracker.js";

describe("ActionIntentTracker", () => {
  let tracker: ActionIntentTracker;

  beforeEach(() => {
    tracker = new ActionIntentTracker();
  });

  describe("detectIntent()", () => {
    it("detects 'I'll' commitment pattern", () => {
      const result = tracker.detectIntent(
        "I'll deploy the new config to production right away",
      );
      expect(result.detected).toBe(true);
      expect(result.description).toContain("deploy");
    });

    it("detects 'let me' commitment pattern", () => {
      const result = tracker.detectIntent(
        "Let me check the database for that user record",
      );
      expect(result.detected).toBe(true);
      expect(result.description).toContain("check");
    });

    it("detects 'I'm going to' commitment pattern", () => {
      const result = tracker.detectIntent(
        "I'm going to update the staking contract parameters",
      );
      expect(result.detected).toBe(true);
      expect(result.description).toContain("update");
    });

    it("detects 'working on' pattern", () => {
      const result = tracker.detectIntent(
        "Working on fixing the build pipeline now",
      );
      expect(result.detected).toBe(true);
      expect(result.description).toContain("fixing");
    });

    it("returns false for non-commitment messages", () => {
      const result = tracker.detectIntent(
        "The staking contract uses a bonding curve mechanism",
      );
      expect(result.detected).toBe(false);
      expect(result.description).toBeNull();
    });

    it("detects completion claims", () => {
      const result = tracker.detectIntent("Done — I've deployed the update.");
      expect(result.isCompletionClaim).toBe(true);
    });

    it("detects completion claims with 'it's done'", () => {
      const result = tracker.detectIntent("It's done and live.");
      expect(result.isCompletionClaim).toBe(true);
    });

    it("detects 'yep' completion with evidence phrase", () => {
      const result = tracker.detectIntent("Yep, it's deployed.");
      expect(result.isCompletionClaim).toBe(true);
    });

    it("does not flag non-completion messages as completion claims", () => {
      const result = tracker.detectIntent(
        "The protocol has specific requirements for staking.",
      );
      expect(result.isCompletionClaim).toBe(false);
    });
  });

  describe("hasEvidence()", () => {
    it("detects URLs as evidence", () => {
      expect(
        tracker.hasEvidence("Check it at https://github.com/org/repo/pull/42"),
      ).toBe(true);
    });

    it("detects commit hashes as evidence", () => {
      expect(
        tracker.hasEvidence("Deployed commit sha a4f3c2d1"),
      ).toBe(true);
    });

    it("detects code blocks as evidence", () => {
      expect(
        tracker.hasEvidence("Output was:\n```\nok 42 tests passed\n```"),
      ).toBe(true);
    });

    it("detects numeric results as evidence", () => {
      expect(tracker.hasEvidence("Updated 3 files successfully")).toBe(true);
    });

    it("detects error messages as evidence", () => {
      expect(
        tracker.hasEvidence("Failed with error: connection refused"),
      ).toBe(true);
    });

    it("returns false for vague claims without evidence", () => {
      expect(tracker.hasEvidence("Done!")).toBe(false);
      expect(tracker.hasEvidence("Yep, all good")).toBe(false);
    });
  });

  describe("registerIntent()", () => {
    it("creates an open intent", () => {
      const intent = tracker.registerIntent({
        description: "deploy the config",
        platform: "discord",
        roomId: "room-1",
      });

      expect(intent.id).toBeTruthy();
      expect(intent.status).toBe("open");
      expect(intent.description).toBe("deploy the config");
      expect(intent.platform).toBe("discord");
    });

    it("appears in open intents list", () => {
      tracker.registerIntent({
        description: "deploy the config",
        platform: "discord",
        roomId: "room-1",
      });

      const open = tracker.getOpenIntents("room-1");
      expect(open).toHaveLength(1);
    });
  });

  describe("verify()", () => {
    it("marks open intent as verified with evidence", () => {
      const intent = tracker.registerIntent({
        description: "deploy the config",
        platform: "discord",
        roomId: "room-1",
      });

      const result = tracker.verify(intent.id, "Deployed at commit a1b2c3d");
      expect(result).not.toBeNull();
      expect(result!.status).toBe("verified");
      expect(result!.evidence).toContain("a1b2c3d");

      // No longer in open intents
      const open = tracker.getOpenIntents("room-1");
      expect(open).toHaveLength(0);
    });

    it("returns null for non-open intent", () => {
      const intent = tracker.registerIntent({
        description: "deploy",
        platform: "discord",
        roomId: "room-1",
      });

      tracker.verify(intent.id, "evidence");
      // Try to verify again — already verified
      const result = tracker.verify(intent.id, "more evidence");
      expect(result).toBeNull();
    });
  });

  describe("fail()", () => {
    it("marks open intent as failed with reason", () => {
      const intent = tracker.registerIntent({
        description: "deploy the config",
        platform: "discord",
        roomId: "room-1",
      });

      const result = tracker.fail(intent.id, "Connection refused");
      expect(result).not.toBeNull();
      expect(result!.status).toBe("failed");

      // Should appear in recent failures
      const failures = tracker.getRecentFailures("room-1");
      expect(failures).toHaveLength(1);
      expect(failures[0].evidence).toBe("Connection refused");
    });
  });

  describe("tryAutoVerify()", () => {
    it("auto-verifies when evidence is present in agent message", () => {
      tracker.registerIntent({
        description: "update the staking contract",
        platform: "discord",
        roomId: "room-1",
      });

      const result = tracker.tryAutoVerify(
        "room-1",
        "Updated — see https://etherscan.io/tx/0xabc123",
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe("verified");
    });

    it("does not auto-verify without evidence", () => {
      tracker.registerIntent({
        description: "update the staking contract",
        platform: "discord",
        roomId: "room-1",
      });

      const result = tracker.tryAutoVerify("room-1", "Done!");
      expect(result).toBeNull();
    });

    it("returns null when no open intents exist", () => {
      const result = tracker.tryAutoVerify(
        "room-1",
        "Deployed at commit abc123",
      );
      expect(result).toBeNull();
    });
  });

  describe("formatOpenIntentsContext()", () => {
    it("returns null when no open intents or failures", () => {
      expect(tracker.formatOpenIntentsContext("room-1")).toBeNull();
    });

    it("includes open intents in context", () => {
      tracker.registerIntent({
        description: "deploy the config",
        platform: "discord",
        roomId: "room-1",
      });

      const ctx = tracker.formatOpenIntentsContext("room-1");
      expect(ctx).not.toBeNull();
      expect(ctx).toContain("Open Commitments");
      expect(ctx).toContain("deploy the config");
      expect(ctx).toContain("evidence");
    });

    it("includes recent failures in context", () => {
      const intent = tracker.registerIntent({
        description: "fix the build",
        platform: "discord",
        roomId: "room-1",
      });

      tracker.fail(intent.id, "Permission denied");

      const ctx = tracker.formatOpenIntentsContext("room-1");
      expect(ctx).not.toBeNull();
      expect(ctx).toContain("Recent Failures");
      expect(ctx).toContain("Permission denied");
    });
  });

  describe("getStats()", () => {
    it("returns correct counts", () => {
      const i1 = tracker.registerIntent({
        description: "task 1",
        platform: "discord",
        roomId: "room-1",
      });
      const i2 = tracker.registerIntent({
        description: "task 2",
        platform: "discord",
        roomId: "room-1",
      });
      tracker.registerIntent({
        description: "task 3",
        platform: "discord",
        roomId: "room-1",
      });

      tracker.verify(i1.id, "done");
      tracker.fail(i2.id, "failed");

      const stats = tracker.getStats("room-1");
      expect(stats.total).toBe(3);
      expect(stats.open).toBe(1);
      expect(stats.verified).toBe(1);
      expect(stats.failed).toBe(1);
    });

    it("returns global stats without roomId", () => {
      tracker.registerIntent({
        description: "room1 task",
        platform: "discord",
        roomId: "room-1",
      });
      tracker.registerIntent({
        description: "room2 task",
        platform: "telegram",
        roomId: "room-2",
      });

      const stats = tracker.getStats();
      expect(stats.total).toBe(2);
      expect(stats.open).toBe(2);
    });
  });

  describe("expiry", () => {
    it("expires old intents", () => {
      const shortExpiryTracker = new ActionIntentTracker({ expiryMs: 100 });

      shortExpiryTracker.registerIntent({
        description: "old task",
        platform: "discord",
        roomId: "room-1",
      });

      // Manually age the intent
      const intents = shortExpiryTracker.getOpenIntents("room-1");
      expect(intents).toHaveLength(1);

      // Hack: directly modify createdAt to simulate passage of time
      const intent = intents[0];
      (intent as any).createdAt = Date.now() - 200;

      const openAfter = shortExpiryTracker.getOpenIntents("room-1");
      expect(openAfter).toHaveLength(0);

      const stats = shortExpiryTracker.getStats("room-1");
      expect(stats.expired).toBe(1);
    });
  });
});

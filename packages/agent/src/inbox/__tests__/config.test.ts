import { describe, expect, it, vi } from "vitest";

/**
 * Mock the config loader so we can inject arbitrary user configs without
 * touching the filesystem or real config resolution.
 */
let fakeConfig: Record<string, unknown> = {};

vi.mock("../../config/config", () => ({
  loadElizaConfig: () => fakeConfig,
}));

import { loadInboxTriageConfig } from "../config";

describe("loadInboxTriageConfig", () => {
  it("returns full defaults when no config is set", () => {
    fakeConfig = {};
    const cfg = loadInboxTriageConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.autoReply?.enabled).toBe(false);
    expect(cfg.autoReply?.confidenceThreshold).toBe(0.85);
    expect(cfg.autoReply?.maxAutoRepliesPerHour).toBe(5);
    expect(cfg.triageRules?.alwaysUrgent).toEqual([]);
    expect(cfg.retentionDays).toBe(30);
  });

  it("deep-merges autoReply so partial overrides keep defaults", () => {
    fakeConfig = {
      agents: {
        defaults: {
          inboxTriage: {
            autoReply: { enabled: true },
          },
        },
      },
    };

    const cfg = loadInboxTriageConfig();

    // User override applied
    expect(cfg.autoReply?.enabled).toBe(true);
    // Defaults preserved (the shallow-merge bug lost these)
    expect(cfg.autoReply?.confidenceThreshold).toBe(0.85);
    expect(cfg.autoReply?.maxAutoRepliesPerHour).toBe(5);
    expect(cfg.autoReply?.senderWhitelist).toEqual([]);
    expect(cfg.autoReply?.channelWhitelist).toEqual([]);
  });

  it("deep-merges triageRules so partial overrides keep defaults", () => {
    fakeConfig = {
      agents: {
        defaults: {
          inboxTriage: {
            triageRules: { alwaysUrgent: ["keyword:fire"] },
          },
        },
      },
    };

    const cfg = loadInboxTriageConfig();

    expect(cfg.triageRules?.alwaysUrgent).toEqual(["keyword:fire"]);
    // Defaults preserved
    expect(cfg.triageRules?.alwaysIgnore).toEqual([]);
    expect(cfg.triageRules?.alwaysNotify).toEqual([]);
  });

  it("top-level overrides still apply alongside nested deep-merge", () => {
    fakeConfig = {
      agents: {
        defaults: {
          inboxTriage: {
            enabled: true,
            retentionDays: 7,
            autoReply: { maxAutoRepliesPerHour: 20 },
          },
        },
      },
    };

    const cfg = loadInboxTriageConfig();

    expect(cfg.enabled).toBe(true);
    expect(cfg.retentionDays).toBe(7);
    expect(cfg.autoReply?.maxAutoRepliesPerHour).toBe(20);
    // Default nested fields preserved
    expect(cfg.autoReply?.confidenceThreshold).toBe(0.85);
    expect(cfg.triageRules?.alwaysUrgent).toEqual([]);
    // Default top-level fields preserved
    expect(cfg.triageCron).toBe("0 * * * *");
    expect(cfg.digestCron).toBe("0 8 * * *");
  });

  it("falls back to defaults when config loading throws", () => {
    // non-object forces the catch path
    fakeConfig = null as unknown as Record<string, unknown>;

    const cfg = loadInboxTriageConfig();
    expect(cfg.enabled).toBe(false);
    expect(cfg.autoReply?.confidenceThreshold).toBe(0.85);
  });
});

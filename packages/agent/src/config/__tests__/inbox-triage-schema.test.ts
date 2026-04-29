import { describe, expect, it } from "vitest";
import { InboxTriageConfigSchema } from "../zod-schema.agent-runtime";

describe("InboxTriageConfigSchema", () => {
  it("accepts undefined (field is optional at top level)", () => {
    const result = InboxTriageConfigSchema.safeParse(undefined);
    expect(result.success).toBe(true);
  });

  it("accepts a minimal valid config", () => {
    const result = InboxTriageConfigSchema.safeParse({ enabled: true });
    expect(result.success).toBe(true);
  });

  it("accepts a fully populated config", () => {
    const result = InboxTriageConfigSchema.safeParse({
      enabled: true,
      triageCron: "0 * * * *",
      digestCron: "0 8 * * *",
      digestTimezone: "America/New_York",
      channels: ["discord", "telegram"],
      prioritySenders: ["alice"],
      priorityChannels: ["general"],
      autoReply: {
        enabled: true,
        confidenceThreshold: 0.9,
        senderWhitelist: ["bob"],
        channelWhitelist: ["dm"],
        maxAutoRepliesPerHour: 10,
      },
      triageRules: {
        alwaysUrgent: ["keyword:fire"],
        alwaysIgnore: ["sender:bot"],
        alwaysNotify: ["channel:alerts"],
      },
      digestDeliveryChannel: "telegram",
      retentionDays: 14,
    });
    expect(result.success).toBe(true);
  });

  it("rejects confidenceThreshold outside 0-1 range", () => {
    const result = InboxTriageConfigSchema.safeParse({
      autoReply: { confidenceThreshold: 1.5 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative confidenceThreshold", () => {
    const result = InboxTriageConfigSchema.safeParse({
      autoReply: { confidenceThreshold: -0.1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects retentionDays less than 1", () => {
    const result = InboxTriageConfigSchema.safeParse({
      retentionDays: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer retentionDays", () => {
    const result = InboxTriageConfigSchema.safeParse({
      retentionDays: 7.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative maxAutoRepliesPerHour", () => {
    const result = InboxTriageConfigSchema.safeParse({
      autoReply: { maxAutoRepliesPerHour: -1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys in strict mode", () => {
    const result = InboxTriageConfigSchema.safeParse({
      enabled: true,
      unknownField: "oops",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys in nested autoReply", () => {
    const result = InboxTriageConfigSchema.safeParse({
      autoReply: { enabled: true, badKey: 123 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown keys in nested triageRules", () => {
    const result = InboxTriageConfigSchema.safeParse({
      triageRules: { alwaysUrgent: [], extra: true },
    });
    expect(result.success).toBe(false);
  });
});

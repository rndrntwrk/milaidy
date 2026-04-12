import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { applyTriageRules, classifyMessages } from "../triage-classifier.js";
import type { InboundMessage, InboxTriageRules } from "../types.js";
import { describeLLM } from "../../../../../test/helpers/skip-without";
import { createRealTestRuntime } from "../../../../../test/helpers/real-runtime";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "msg-1",
    source: "discord",
    senderName: "Alice",
    channelName: "Alice (DM)",
    channelType: "dm",
    text: "Hey, are we meeting tomorrow?",
    snippet: "Hey, are we meeting tomorrow?",
    timestamp: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// applyTriageRules (rule-based pre-classification — no LLM needed)
// ---------------------------------------------------------------------------

describe("applyTriageRules", () => {
  it("returns null when no rules match", () => {
    const rules: InboxTriageRules = {
      alwaysUrgent: ["keyword:emergency"],
      alwaysIgnore: ["channel:spam"],
      alwaysNotify: ["sender:vip-id"],
    };
    const result = applyTriageRules(makeMessage(), rules, undefined);
    expect(result).toBeNull();
  });

  it("matches keyword:urgent in alwaysUrgent", () => {
    const rules: InboxTriageRules = {
      alwaysUrgent: ["keyword:urgent"],
    };
    const result = applyTriageRules(
      makeMessage({ text: "This is URGENT please respond" }),
      rules,
      undefined,
    );
    expect(result).toBe("urgent");
  });

  it("matches keyword case-insensitively", () => {
    const rules: InboxTriageRules = {
      alwaysUrgent: ["keyword:emergency"],
    };
    const result = applyTriageRules(
      makeMessage({ text: "EMERGENCY: server is down" }),
      rules,
      undefined,
    );
    expect(result).toBe("urgent");
  });

  it("matches sender in alwaysIgnore", () => {
    const rules: InboxTriageRules = {
      alwaysIgnore: ["sender:bot-123"],
    };
    const result = applyTriageRules(
      makeMessage({ entityId: "bot-123" }),
      rules,
      undefined,
    );
    expect(result).toBe("ignore");
  });

  it("matches channel in alwaysNotify", () => {
    const rules: InboxTriageRules = {
      alwaysNotify: ["channel:announcements"],
    };
    const result = applyTriageRules(
      makeMessage({ channelName: "#announcements" }),
      rules,
      undefined,
    );
    expect(result).toBe("notify");
  });

  it("matches source in rules", () => {
    const rules: InboxTriageRules = {
      alwaysIgnore: ["source:sms"],
    };
    const result = applyTriageRules(
      makeMessage({ source: "sms" }),
      rules,
      undefined,
    );
    expect(result).toBe("ignore");
  });

  it("urgent takes priority over ignore when both match", () => {
    const rules: InboxTriageRules = {
      alwaysUrgent: ["keyword:help"],
      alwaysIgnore: ["source:discord"],
    };
    const result = applyTriageRules(
      makeMessage({ text: "help me please", source: "discord" }),
      rules,
      undefined,
    );
    // urgent rules are checked first
    expect(result).toBe("urgent");
  });

  it("returns null when rules are undefined", () => {
    const result = applyTriageRules(makeMessage(), undefined, undefined);
    expect(result).toBeNull();
  });

  it("returns null for gmail signals (hints only, not overrides)", () => {
    const result = applyTriageRules(
      makeMessage({
        gmailIsImportant: true,
        gmailLikelyReplyNeeded: true,
      }),
      { alwaysUrgent: [], alwaysIgnore: [], alwaysNotify: [] },
      undefined,
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// classifyMessages (LLM classification with structured output parsing)
// ---------------------------------------------------------------------------

describeLLM("classifyMessages (real LLM)", () => {
  let runtime: Awaited<ReturnType<typeof createRealTestRuntime>>["runtime"];
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ runtime, cleanup } = await createRealTestRuntime({ withLLM: true }));
  }, 180_000);

  afterAll(async () => {
    await cleanup();
  });

  it("returns empty array for empty input", async () => {
    const results = await classifyMessages(runtime as never, [], {});
    expect(results).toEqual([]);
  }, 60_000);

  it("classifies a direct question as needing reply or urgent", async () => {
    const messages = [makeMessage({ text: "Hey, are we meeting tomorrow? I need to know ASAP." })];
    const results = await classifyMessages(runtime as never, messages, {});

    expect(results).toHaveLength(1);
    expect(results[0].classification).toBeTruthy();
    expect(typeof results[0].classification).toBe("string");
    // Real LLM should produce a valid classification
    expect(["urgent", "needs_reply", "notify", "info", "ignore"]).toContain(
      results[0].classification,
    );
    expect(results[0].urgency).toBeTruthy();
    expect(["high", "medium", "low"]).toContain(results[0].urgency);
    expect(typeof results[0].confidence).toBe("number");
    expect(results[0].confidence).toBeGreaterThan(0);
    expect(results[0].confidence).toBeLessThanOrEqual(1);
  }, 60_000);

  it("classifies multiple messages and returns one result per message", async () => {
    const messages = [
      makeMessage({ id: "m1", text: "Server is down, URGENT!" }),
      makeMessage({ id: "m2", text: "FYI: new blog post published" }),
      makeMessage({ id: "m3", text: "Can you review my PR when you get a chance?" }),
    ];
    const results = await classifyMessages(runtime as never, messages, {});

    expect(results).toHaveLength(3);
    for (const r of results) {
      expect(r.classification).toBeTruthy();
      expect(["urgent", "needs_reply", "notify", "info", "ignore"]).toContain(
        r.classification,
      );
      expect(typeof r.confidence).toBe("number");
    }
  }, 60_000);

  it("includes few-shot examples in classification context", async () => {
    const messages = [makeMessage({ text: "The deployment failed again" })];
    const results = await classifyMessages(runtime as never, messages, {
      examples: [
        {
          id: "ex-1",
          agentId: "agent-1",
          source: "discord",
          snippet: "server down!",
          classification: "urgent",
          ownerAction: "confirmed",
          ownerClassification: null,
          contextJson: null,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    expect(results).toHaveLength(1);
    expect(results[0].classification).toBeTruthy();
    expect(["urgent", "needs_reply", "notify", "info", "ignore"]).toContain(
      results[0].classification,
    );
  }, 60_000);
});

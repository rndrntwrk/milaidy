import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyTriageRules, classifyMessages } from "../triage-classifier.js";
import type { InboundMessage, InboxTriageRules } from "../types.js";

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

function makeRuntime(modelResponse: string) {
  return {
    agentId: "agent-1",
    useModel: vi.fn().mockResolvedValue(modelResponse),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as never;
}

// ---------------------------------------------------------------------------
// applyTriageRules (rule-based pre-classification)
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

describe("classifyMessages", () => {
  it("returns empty array for empty input", async () => {
    const runtime = makeRuntime("");
    const results = await classifyMessages(runtime, [], {});
    expect(results).toEqual([]);
  });

  it("parses valid JSON array response from LLM", async () => {
    const llmResponse = JSON.stringify([
      {
        classification: "needs_reply",
        urgency: "medium",
        confidence: 0.85,
        reasoning: "Direct question",
        suggestedResponse: "Yes, let's meet at 3pm.",
      },
    ]);
    const runtime = makeRuntime(llmResponse);

    const results = await classifyMessages(runtime, [makeMessage()], {});
    expect(results).toHaveLength(1);
    expect(results[0].classification).toBe("needs_reply");
    expect(results[0].urgency).toBe("medium");
    expect(results[0].confidence).toBe(0.85);
    expect(results[0].reasoning).toBe("Direct question");
    expect(results[0].suggestedResponse).toBe("Yes, let's meet at 3pm.");
  });

  it("handles LLM response wrapped in markdown code fences", async () => {
    const llmResponse = `Here are the results:\n\`\`\`json\n[{"classification":"urgent","urgency":"high","confidence":0.95,"reasoning":"Time-sensitive"}]\n\`\`\``;
    const runtime = makeRuntime(llmResponse);

    const results = await classifyMessages(runtime, [makeMessage()], {});
    expect(results).toHaveLength(1);
    expect(results[0].classification).toBe("urgent");
    expect(results[0].urgency).toBe("high");
  });

  it("falls back to 'notify' for unparseable LLM response", async () => {
    const runtime = makeRuntime("I cannot process this request.");
    const messages = [makeMessage(), makeMessage({ id: "msg-2" })];

    const results = await classifyMessages(runtime, messages, {});
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.classification).toBe("notify");
      expect(r.confidence).toBe(0.3);
    }
  });

  it("falls back to 'notify' when LLM throws", async () => {
    const runtime = {
      agentId: "agent-1",
      useModel: vi.fn().mockRejectedValue(new Error("Model unavailable")),
      logger: {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
    } as never;

    const results = await classifyMessages(runtime, [makeMessage()], {});
    expect(results).toHaveLength(1);
    expect(results[0].classification).toBe("notify");
    expect(results[0].confidence).toBe(0.3);
  });

  it("validates classification values and rejects invalid ones", async () => {
    const llmResponse = JSON.stringify([
      {
        classification: "INVALID_VALUE",
        urgency: "low",
        confidence: 0.5,
        reasoning: "test",
      },
    ]);
    const runtime = makeRuntime(llmResponse);

    const results = await classifyMessages(runtime, [makeMessage()], {});
    // Invalid classification should fall back to "notify"
    expect(results[0].classification).toBe("notify");
  });

  it("validates urgency values", async () => {
    const llmResponse = JSON.stringify([
      {
        classification: "urgent",
        urgency: "SUPER_HIGH",
        confidence: 0.9,
        reasoning: "test",
      },
    ]);
    const runtime = makeRuntime(llmResponse);

    const results = await classifyMessages(runtime, [makeMessage()], {});
    expect(results[0].urgency).toBe("low"); // falls back to "low"
  });

  it("clamps confidence to valid range", async () => {
    const llmResponse = JSON.stringify([
      {
        classification: "info",
        urgency: "low",
        confidence: 5.0, // out of range
        reasoning: "test",
      },
    ]);
    const runtime = makeRuntime(llmResponse);

    const results = await classifyMessages(runtime, [makeMessage()], {});
    // Out-of-range confidence should fall back to 0.5
    expect(results[0].confidence).toBe(0.5);
  });

  it("handles fewer results than messages (pads with fallback)", async () => {
    // LLM only returns 1 result for 3 messages
    const llmResponse = JSON.stringify([
      {
        classification: "urgent",
        urgency: "high",
        confidence: 0.9,
        reasoning: "Important",
      },
    ]);
    const runtime = makeRuntime(llmResponse);

    const messages = [
      makeMessage({ id: "m1" }),
      makeMessage({ id: "m2" }),
      makeMessage({ id: "m3" }),
    ];
    const results = await classifyMessages(runtime, messages, {});
    expect(results).toHaveLength(3);
    expect(results[0].classification).toBe("urgent");
    // Remaining should be fallback
    expect(results[1].classification).toBe("notify");
    expect(results[2].classification).toBe("notify");
  });

  it("includes few-shot examples in prompt", async () => {
    const llmResponse = JSON.stringify([
      {
        classification: "info",
        urgency: "low",
        confidence: 0.7,
        reasoning: "Informational",
      },
    ]);
    const mockUseModel = vi.fn().mockResolvedValue(llmResponse);
    const runtime = {
      agentId: "agent-1",
      useModel: mockUseModel,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as never;

    await classifyMessages(runtime, [makeMessage()], {
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

    // Verify the prompt includes the example
    const promptArg = mockUseModel.mock.calls[0][1].prompt as string;
    expect(promptArg).toContain("server down!");
    expect(promptArg).toContain("urgent");
    expect(promptArg).toContain("Examples from past triage");
  });

  it("batches large message sets", async () => {
    const singleResult = {
      classification: "info",
      urgency: "low",
      confidence: 0.6,
      reasoning: "ok",
    };
    const mockUseModel = vi.fn().mockImplementation(() => {
      // Return array of 10 results (batch size)
      return JSON.stringify(Array(10).fill(singleResult));
    });
    const runtime = {
      agentId: "agent-1",
      useModel: mockUseModel,
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    } as never;

    // 15 messages should produce 2 batches (10 + 5)
    const messages = Array.from({ length: 15 }, (_, i) =>
      makeMessage({ id: `msg-${i}` }),
    );
    const results = await classifyMessages(runtime, messages, {});

    expect(mockUseModel).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(15);
  });
});

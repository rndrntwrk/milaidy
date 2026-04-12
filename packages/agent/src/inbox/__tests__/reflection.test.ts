import { describe, expect, it, vi } from "vitest";
import {
  looksLikeInboxConfirmation,
  reflectOnAutoReply,
  reflectOnSendConfirmation,
} from "../reflection.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeRuntime(modelResponse: string | Error) {
  return {
    agentId: "agent-1",
    useModel: modelResponse instanceof Error
      ? vi.fn().mockRejectedValue(modelResponse)
      : vi.fn().mockResolvedValue(modelResponse),
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  } as never;
}

// ---------------------------------------------------------------------------
// looksLikeInboxConfirmation (regex pre-check)
// ---------------------------------------------------------------------------

describe("looksLikeInboxConfirmation", () => {
  it("detects explicit confirmations", () => {
    expect(looksLikeInboxConfirmation("yes")).toBe(true);
    expect(looksLikeInboxConfirmation("Yeah")).toBe(true);
    expect(looksLikeInboxConfirmation("yep")).toBe(true);
    expect(looksLikeInboxConfirmation("ok")).toBe(true);
    expect(looksLikeInboxConfirmation("sure")).toBe(true);
    expect(looksLikeInboxConfirmation("send it")).toBe(true);
    expect(looksLikeInboxConfirmation("go ahead")).toBe(true);
    expect(looksLikeInboxConfirmation("sounds good")).toBe(true);
    expect(looksLikeInboxConfirmation("do it")).toBe(true);
    expect(looksLikeInboxConfirmation("please send")).toBe(true);
    expect(looksLikeInboxConfirmation("confirmed")).toBe(true);
    expect(looksLikeInboxConfirmation("lgtm")).toBe(true);
  });

  it("rejects explicit rejections", () => {
    expect(looksLikeInboxConfirmation("no")).toBe(false);
    expect(looksLikeInboxConfirmation("nope")).toBe(false);
    expect(looksLikeInboxConfirmation("wait")).toBe(false);
    expect(looksLikeInboxConfirmation("hold on")).toBe(false);
    expect(looksLikeInboxConfirmation("change it")).toBe(false);
    expect(looksLikeInboxConfirmation("actually, let me think")).toBe(false);
    expect(looksLikeInboxConfirmation("don't send that")).toBe(false);
    expect(looksLikeInboxConfirmation("edit the message")).toBe(false);
    expect(looksLikeInboxConfirmation("not yet")).toBe(false);
    expect(looksLikeInboxConfirmation("cancel")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(looksLikeInboxConfirmation("")).toBe(false);
    expect(looksLikeInboxConfirmation("   ")).toBe(false);
  });

  it("rejects ambiguous input", () => {
    expect(looksLikeInboxConfirmation("hmm")).toBe(false);
    expect(looksLikeInboxConfirmation("what")).toBe(false);
    expect(looksLikeInboxConfirmation("can you change it instead")).toBe(false);
  });

  it("handles whitespace and casing", () => {
    expect(looksLikeInboxConfirmation("  Yes  ")).toBe(true);
    expect(looksLikeInboxConfirmation("SEND IT")).toBe(true);
    expect(looksLikeInboxConfirmation("  Go Ahead  ")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// reflectOnSendConfirmation (LLM reflection)
// ---------------------------------------------------------------------------

describe("reflectOnSendConfirmation", () => {
  it("returns confirmed when LLM says yes", async () => {
    const runtime = makeRuntime(
      JSON.stringify({ confirmed: true, reasoning: "User clearly said yes" }),
    );
    const result = await reflectOnSendConfirmation(runtime, {
      userMessage: "yes, send it",
      draftText: "Hello Alice!",
      channelName: "Discord DM",
      recipientName: "Alice",
    });
    expect(result.confirmed).toBe(true);
    expect(result.reasoning).toBe("User clearly said yes");
  });

  it("returns not confirmed when LLM says no", async () => {
    const runtime = makeRuntime(
      JSON.stringify({
        confirmed: false,
        reasoning: "User seems unsure",
      }),
    );
    const result = await reflectOnSendConfirmation(runtime, {
      userMessage: "hmm let me think",
      draftText: "Hello Alice!",
      channelName: "Discord DM",
      recipientName: "Alice",
    });
    expect(result.confirmed).toBe(false);
  });

  it("defaults to not confirmed on LLM error", async () => {
    const runtime = makeRuntime(new Error("Model unavailable"));
    const result = await reflectOnSendConfirmation(runtime, {
      userMessage: "yes",
      draftText: "Hello",
      channelName: "DM",
      recipientName: "Bob",
    });
    expect(result.confirmed).toBe(false);
    expect(result.reasoning).toContain("defaulting to not confirmed");
  });

  it("defaults to not confirmed on unparseable response", async () => {
    const runtime = makeRuntime("I cannot understand the request.");
    const result = await reflectOnSendConfirmation(runtime, {
      userMessage: "send it",
      draftText: "Hello",
      channelName: "DM",
      recipientName: "Bob",
    });
    expect(result.confirmed).toBe(false);
  });

  it("handles JSON wrapped in extra text", async () => {
    const runtime = makeRuntime(
      'Based on my analysis:\n{"confirmed": true, "reasoning": "Clear confirmation"}\nEnd of response.',
    );
    const result = await reflectOnSendConfirmation(runtime, {
      userMessage: "yes please",
      draftText: "Hello",
      channelName: "DM",
      recipientName: "Bob",
    });
    expect(result.confirmed).toBe(true);
  });

  it("rejects when confirmed is not boolean true", async () => {
    const runtime = makeRuntime(
      JSON.stringify({ confirmed: "yes", reasoning: "User said yes" }),
    );
    const result = await reflectOnSendConfirmation(runtime, {
      userMessage: "yes",
      draftText: "Hello",
      channelName: "DM",
      recipientName: "Bob",
    });
    // "yes" !== true, so confirmed should be false
    expect(result.confirmed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// reflectOnAutoReply (LLM auto-reply safety check)
// ---------------------------------------------------------------------------

describe("reflectOnAutoReply", () => {
  it("approves safe auto-reply", async () => {
    const runtime = makeRuntime(
      JSON.stringify({
        approved: true,
        reasoning: "Routine acknowledgement, safe to send",
      }),
    );
    const result = await reflectOnAutoReply(runtime, {
      inboundText: "Hey, thanks for the update!",
      replyText: "You're welcome!",
      source: "discord",
      senderName: "Alice",
    });
    expect(result.approved).toBe(true);
  });

  it("rejects unsafe auto-reply", async () => {
    const runtime = makeRuntime(
      JSON.stringify({
        approved: false,
        reasoning: "Reply makes a financial commitment",
      }),
    );
    const result = await reflectOnAutoReply(runtime, {
      inboundText: "Can you invest $10k in our fund?",
      replyText: "Sure, I'll wire the money today!",
      source: "telegram",
      senderName: "Scammer",
    });
    expect(result.approved).toBe(false);
    expect(result.reasoning).toContain("financial commitment");
  });

  it("defaults to not approved on LLM error", async () => {
    const runtime = makeRuntime(new Error("Timeout"));
    const result = await reflectOnAutoReply(runtime, {
      inboundText: "Hello",
      replyText: "Hi there!",
      source: "discord",
      senderName: "Alice",
    });
    expect(result.approved).toBe(false);
    expect(result.reasoning).toContain("blocking auto-reply for safety");
  });

  it("defaults to not approved on unparseable response", async () => {
    const runtime = makeRuntime("Cannot determine safety.");
    const result = await reflectOnAutoReply(runtime, {
      inboundText: "Hello",
      replyText: "Hi!",
      source: "slack",
      senderName: "User",
    });
    expect(result.approved).toBe(false);
  });

  it("rejects when approved is not boolean true", async () => {
    const runtime = makeRuntime(
      JSON.stringify({ approved: "true", reasoning: "Looks ok" }),
    );
    const result = await reflectOnAutoReply(runtime, {
      inboundText: "Hey",
      replyText: "Hi",
      source: "discord",
      senderName: "Alice",
    });
    expect(result.approved).toBe(false);
  });
});

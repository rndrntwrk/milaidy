import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  looksLikeInboxConfirmation,
  reflectOnAutoReply,
  reflectOnSendConfirmation,
} from "../reflection.js";
import { describeLLM } from "../../../../../test/helpers/skip-without";
import { createRealTestRuntime } from "../../../../../test/helpers/real-runtime";

// ---------------------------------------------------------------------------
// looksLikeInboxConfirmation (regex pre-check — no LLM needed)
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
// reflectOnSendConfirmation (real LLM reflection)
// ---------------------------------------------------------------------------

describeLLM("reflectOnSendConfirmation (real LLM)", () => {
  let runtime: Awaited<ReturnType<typeof createRealTestRuntime>>["runtime"];
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ runtime, cleanup } = await createRealTestRuntime({ withLLM: true }));
  }, 180_000);

  afterAll(async () => {
    await cleanup();
  });

  it("returns confirmed for a clear yes", async () => {
    const result = await reflectOnSendConfirmation(runtime as never, {
      userMessage: "yes, send it",
      draftText: "Hello Alice!",
      channelName: "Discord DM",
      recipientName: "Alice",
    });
    expect(typeof result.confirmed).toBe("boolean");
    expect(result.confirmed).toBe(true);
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(0);
  }, 60_000);

  it("returns not confirmed for hesitant input", async () => {
    const result = await reflectOnSendConfirmation(runtime as never, {
      userMessage: "hmm let me think about it, not sure yet",
      draftText: "Hello Alice!",
      channelName: "Discord DM",
      recipientName: "Alice",
    });
    expect(typeof result.confirmed).toBe("boolean");
    expect(result.confirmed).toBe(false);
  }, 60_000);

  it("returns a result with reasoning for ambiguous input", async () => {
    const result = await reflectOnSendConfirmation(runtime as never, {
      userMessage: "maybe later",
      draftText: "Hello",
      channelName: "DM",
      recipientName: "Bob",
    });
    expect(typeof result.confirmed).toBe("boolean");
    // Ambiguous input should default to not confirmed for safety
    expect(result.confirmed).toBe(false);
  }, 60_000);

  it("handles clear confirmation with 'yes please'", async () => {
    const result = await reflectOnSendConfirmation(runtime as never, {
      userMessage: "yes please go ahead and send it",
      draftText: "Hello",
      channelName: "DM",
      recipientName: "Bob",
    });
    expect(result.confirmed).toBe(true);
    expect(typeof result.reasoning).toBe("string");
  }, 60_000);
});

// ---------------------------------------------------------------------------
// reflectOnAutoReply (real LLM auto-reply safety check)
// ---------------------------------------------------------------------------

describeLLM("reflectOnAutoReply (real LLM)", () => {
  let runtime: Awaited<ReturnType<typeof createRealTestRuntime>>["runtime"];
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ runtime, cleanup } = await createRealTestRuntime({ withLLM: true }));
  }, 180_000);

  afterAll(async () => {
    await cleanup();
  });

  it("approves a safe routine auto-reply", async () => {
    const result = await reflectOnAutoReply(runtime as never, {
      inboundText: "Hey, thanks for the update!",
      replyText: "You're welcome!",
      source: "discord",
      senderName: "Alice",
    });
    expect(typeof result.approved).toBe("boolean");
    expect(result.approved).toBe(true);
    expect(typeof result.reasoning).toBe("string");
  }, 60_000);

  it("rejects an unsafe auto-reply involving financial commitments", async () => {
    const result = await reflectOnAutoReply(runtime as never, {
      inboundText: "Can you invest $10k in our fund?",
      replyText: "Sure, I'll wire the money today!",
      source: "telegram",
      senderName: "Unknown Person",
    });
    expect(typeof result.approved).toBe("boolean");
    expect(result.approved).toBe(false);
    expect(typeof result.reasoning).toBe("string");
    expect(result.reasoning.length).toBeGreaterThan(0);
  }, 60_000);

  it("returns a structured result for any input", async () => {
    const result = await reflectOnAutoReply(runtime as never, {
      inboundText: "Hello there",
      replyText: "Hi! How are you?",
      source: "slack",
      senderName: "User",
    });
    expect(typeof result.approved).toBe("boolean");
    expect(typeof result.reasoning).toBe("string");
  }, 60_000);
});

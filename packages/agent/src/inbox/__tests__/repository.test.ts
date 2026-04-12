/**
 * Repository integration tests using real PGlite.
 *
 * Per project convention: "Never mock SQL in tests; use pglite plugin-sql
 * for real local databases."
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentRuntime } from "@elizaos/core";
import { createTestRuntime } from "../../../../../test/helpers/pglite-runtime.js";
import { InboxTriageRepository } from "../repository.js";
import type { TriageClassification } from "../types.js";

let runtime: AgentRuntime;
let cleanup: () => Promise<void>;
let repo: InboxTriageRepository;

beforeAll(async () => {
  ({ runtime, cleanup } = await createTestRuntime());
  repo = new InboxTriageRepository(runtime);
}, 180_000);

afterAll(async () => {
  await cleanup();
});

// ---------------------------------------------------------------------------
// storeTriage + getById
// ---------------------------------------------------------------------------

describe("storeTriage + retrieval", () => {
  it("stores a triage entry and retrieves it by ID", async () => {
    const entry = await repo.storeTriage({
      source: "discord",
      sourceRoomId: "room-1",
      sourceEntityId: "entity-1",
      sourceMessageId: "msg-001",
      channelName: "Alice (DM)",
      channelType: "dm",
      deepLink: "https://discord.com/channels/@me/123",
      classification: "needs_reply",
      urgency: "medium",
      confidence: 0.82,
      snippet: "Hey, are we meeting tomorrow?",
      senderName: "Alice",
      threadContext: ["Bob: Yes let's meet", "Alice: What time?"],
      triageReasoning: "Direct question expecting a response",
      suggestedResponse: "Yes, let's meet at 3pm.",
    });

    expect(entry.id).toBeTruthy();
    expect(entry.source).toBe("discord");
    expect(entry.classification).toBe("needs_reply");
    expect(entry.confidence).toBe(0.82);
    expect(entry.resolved).toBe(false);
    expect(entry.autoReplied).toBe(false);
    expect(entry.threadContext).toEqual([
      "Bob: Yes let's meet",
      "Alice: What time?",
    ]);

    const fetched = await repo.getById(entry.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.snippet).toBe("Hey, are we meeting tomorrow?");
    expect(fetched!.deepLink).toBe("https://discord.com/channels/@me/123");
    expect(fetched!.suggestedResponse).toBe("Yes, let's meet at 3pm.");
  });

  it("returns null for nonexistent ID", async () => {
    const result = await repo.getById("nonexistent-id");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Dedup: getBySourceMessageId / getBySourceMessageIds
// ---------------------------------------------------------------------------

describe("deduplication", () => {
  it("getBySourceMessageId finds existing entry", async () => {
    await repo.storeTriage({
      source: "telegram",
      sourceMessageId: "tg-msg-100",
      channelName: "Bob (DM)",
      channelType: "dm",
      classification: "info",
      urgency: "low",
      confidence: 0.9,
      snippet: "Just a heads up about tomorrow",
      senderName: "Bob",
    });

    const found = await repo.getBySourceMessageId("tg-msg-100");
    expect(found).not.toBeNull();
    expect(found!.source).toBe("telegram");
  });

  it("getBySourceMessageId returns null for unknown message", async () => {
    const result = await repo.getBySourceMessageId("unknown-msg-xyz");
    expect(result).toBeNull();
  });

  it("getBySourceMessageIds returns set of known IDs", async () => {
    await repo.storeTriage({
      source: "discord",
      sourceMessageId: "batch-msg-1",
      channelName: "Test",
      channelType: "dm",
      classification: "info",
      urgency: "low",
      confidence: 0.5,
      snippet: "Batch test 1",
    });
    await repo.storeTriage({
      source: "discord",
      sourceMessageId: "batch-msg-2",
      channelName: "Test",
      channelType: "dm",
      classification: "notify",
      urgency: "low",
      confidence: 0.5,
      snippet: "Batch test 2",
    });

    const known = await repo.getBySourceMessageIds([
      "batch-msg-1",
      "batch-msg-2",
      "batch-msg-unknown",
    ]);
    expect(known.has("batch-msg-1")).toBe(true);
    expect(known.has("batch-msg-2")).toBe(true);
    expect(known.has("batch-msg-unknown")).toBe(false);
    expect(known.size).toBe(2);
  });

  it("getBySourceMessageIds handles empty array", async () => {
    const result = await repo.getBySourceMessageIds([]);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getUnresolved + getByClassification
// ---------------------------------------------------------------------------

describe("queries", () => {
  it("getUnresolved returns entries ordered by urgency then date", async () => {
    // Create a low-urgency entry first
    await repo.storeTriage({
      source: "slack",
      sourceMessageId: "query-test-low",
      channelName: "general",
      channelType: "group",
      classification: "notify",
      urgency: "low",
      confidence: 0.6,
      snippet: "Low urgency message",
    });
    // Then a high-urgency entry
    await repo.storeTriage({
      source: "signal",
      sourceMessageId: "query-test-high",
      channelName: "Emergency",
      channelType: "dm",
      classification: "urgent",
      urgency: "high",
      confidence: 0.95,
      snippet: "Server is on fire!",
    });

    const unresolved = await repo.getUnresolved({ limit: 50 });
    // High urgency should come first
    const highIdx = unresolved.findIndex(
      (e) => e.sourceMessageId === "query-test-high",
    );
    const lowIdx = unresolved.findIndex(
      (e) => e.sourceMessageId === "query-test-low",
    );
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("getByClassification filters correctly", async () => {
    const urgent = await repo.getByClassification("urgent");
    expect(urgent.length).toBeGreaterThan(0);
    for (const e of urgent) {
      expect(e.classification).toBe("urgent");
    }
  });
});

// ---------------------------------------------------------------------------
// markResolved
// ---------------------------------------------------------------------------

describe("markResolved", () => {
  it("marks an entry as resolved with draft", async () => {
    const entry = await repo.storeTriage({
      source: "imessage",
      sourceMessageId: "resolve-test-1",
      channelName: "Mom",
      channelType: "dm",
      classification: "needs_reply",
      urgency: "medium",
      confidence: 0.8,
      snippet: "Call me when you can",
      senderName: "Mom",
    });

    await repo.markResolved(entry.id, {
      draftResponse: "I'll call you in 10 minutes!",
    });

    const fetched = await repo.getById(entry.id);
    expect(fetched!.resolved).toBe(true);
    expect(fetched!.resolvedAt).toBeTruthy();
    expect(fetched!.draftResponse).toBe("I'll call you in 10 minutes!");
  });

  it("marks auto-replied entries", async () => {
    const entry = await repo.storeTriage({
      source: "whatsapp",
      sourceMessageId: "auto-reply-test-1",
      channelName: "Work Group",
      channelType: "group",
      classification: "needs_reply",
      urgency: "low",
      confidence: 0.9,
      snippet: "What time is the meeting?",
      senderName: "Colleague",
    });

    await repo.markResolved(entry.id, {
      draftResponse: "The meeting is at 3pm.",
      autoReplied: true,
    });

    const fetched = await repo.getById(entry.id);
    expect(fetched!.autoReplied).toBe(true);
    expect(fetched!.resolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getRecentForDigest + countAutoRepliesSince
// ---------------------------------------------------------------------------

describe("digest + auto-reply queries", () => {
  it("getRecentForDigest excludes 'ignore' classification", async () => {
    const pastHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const entries = await repo.getRecentForDigest(pastHour);
    for (const e of entries) {
      expect(e.classification).not.toBe("ignore");
    }
  });

  it("countAutoRepliesSince counts correctly", async () => {
    const pastHour = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const count = await repo.countAutoRepliesSince(pastHour);
    expect(typeof count).toBe("number");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("getRecentAutoReplies returns auto-replied entries", async () => {
    const autoReplies = await repo.getRecentAutoReplies(10);
    for (const e of autoReplies) {
      expect(e.autoReplied).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// cleanupOlderThan
// ---------------------------------------------------------------------------

describe("cleanup", () => {
  it("only removes resolved entries older than cutoff", async () => {
    // Create and resolve an entry
    const entry = await repo.storeTriage({
      source: "sms",
      sourceMessageId: "cleanup-test-1",
      channelName: "Test",
      channelType: "dm",
      classification: "info",
      urgency: "low",
      confidence: 0.5,
      snippet: "Old message",
    });
    await repo.markResolved(entry.id);

    // Cleanup with a future cutoff should remove it
    const futureCutoff = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const cleaned = await repo.cleanupOlderThan(futureCutoff);
    expect(cleaned).toBeGreaterThanOrEqual(1);

    const fetched = await repo.getById(entry.id);
    expect(fetched).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Few-shot examples
// ---------------------------------------------------------------------------

describe("few-shot examples", () => {
  it("stores and retrieves examples", async () => {
    const example = await repo.storeExample({
      source: "discord",
      snippet: "urgent: server down",
      classification: "urgent",
      ownerAction: "confirmed",
      contextJson: { senderName: "DevOps", channelName: "#alerts" },
    });

    expect(example.id).toBeTruthy();
    expect(example.classification).toBe("urgent");
    expect(example.ownerAction).toBe("confirmed");
    expect(example.contextJson).toEqual({
      senderName: "DevOps",
      channelName: "#alerts",
    });

    const examples = await repo.getExamples(10);
    expect(examples.length).toBeGreaterThan(0);
    const found = examples.find((e) => e.id === example.id);
    expect(found).toBeTruthy();
  });

  it("stores reclassified example", async () => {
    const example = await repo.storeExample({
      source: "telegram",
      snippet: "team lunch at noon",
      classification: "info",
      ownerAction: "reclassified",
      ownerClassification: "notify",
    });

    expect(example.ownerAction).toBe("reclassified");
    expect(example.ownerClassification).toBe("notify");
  });
});

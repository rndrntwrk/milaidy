/**
 * Tests for conversation summarizer.
 */

import { describe, expect, it } from "vitest";
import {
  summarizeConversation,
  memoriesToMessages,
  type ConversationMessage,
} from "./conversation-summarizer.js";
import type { Memory, UUID } from "@elizaos/core";

function makeMsg(
  text: string,
  isAgent: boolean,
  timestamp?: number,
): ConversationMessage {
  return {
    sender: isAgent ? "alice" : "user-123",
    isAgent,
    text,
    timestamp: timestamp ?? Date.now(),
  };
}

const defaultOptions = {
  platform: "discord",
  roomId: "room-1",
  userDisplayName: "TestUser",
};

describe("summarizeConversation()", () => {
  it("produces a summary from a basic conversation", () => {
    const messages = [
      makeMsg("Hello, how do I stake tokens?", false, 1000),
      makeMsg("You can stake tokens via the VAP contract.", true, 2000),
      makeMsg("What's the minimum stake?", false, 3000),
      makeMsg("The minimum stake is 100 tokens.", true, 4000),
    ];

    const result = summarizeConversation(messages, defaultOptions);

    expect(result.summary).toContain("2 turns");
    expect(result.messageCount).toBe(4);
    expect(result.turnCount).toBe(2);
    expect(result.timespan).toBe(3000);
    expect(result.platform).toBe("discord");
    expect(result.roomId).toBe("room-1");
    expect(result.generatedAt).toBeGreaterThan(0);
  });

  it("extracts topics from user messages", () => {
    const messages = [
      makeMsg("I want to know about staking staking staking", false, 1000),
      makeMsg("Staking is done via the protocol.", true, 2000),
      makeMsg("What about staking rewards?", false, 3000),
      makeMsg("Rewards are distributed every epoch.", true, 4000),
    ];

    const result = summarizeConversation(messages, defaultOptions);
    expect(result.topics).toContain("staking");
  });

  it("extracts preference facts", () => {
    const messages = [
      makeMsg("I prefer dark mode and concise responses", false, 1000),
      makeMsg("Noted, I'll keep responses concise.", true, 2000),
    ];

    const result = summarizeConversation(messages, defaultOptions);
    const prefFacts = result.facts.filter((f) => f.category === "preference");
    expect(prefFacts.length).toBeGreaterThan(0);
    expect(prefFacts[0].text).toContain("TestUser");
  });

  it("extracts biographical facts", () => {
    const messages = [
      makeMsg("I'm a software engineer working on web3", false, 1000),
      makeMsg("That's great!", true, 2000),
    ];

    const result = summarizeConversation(messages, defaultOptions);
    const bioFacts = result.facts.filter((f) => f.category === "biographical");
    expect(bioFacts.length).toBeGreaterThan(0);
  });

  it("extracts intent facts", () => {
    const messages = [
      makeMsg("I need help setting up my validator node", false, 1000),
      makeMsg("Sure, let me walk you through it.", true, 2000),
    ];

    const result = summarizeConversation(messages, defaultOptions);
    const intentFacts = result.facts.filter((f) => f.category === "intent");
    expect(intentFacts.length).toBeGreaterThan(0);
    expect(intentFacts[0].text).toContain("needs");
  });

  it("extracts dispreference facts", () => {
    const messages = [
      makeMsg("I don't like verbose answers", false, 1000),
      makeMsg("Understood.", true, 2000),
    ];

    const result = summarizeConversation(messages, defaultOptions);
    const prefFacts = result.facts.filter((f) => f.category === "preference");
    expect(prefFacts.some((f) => f.text.includes("dislikes"))).toBe(true);
  });

  it("deduplicates identical facts", () => {
    const messages = [
      makeMsg("I prefer dark mode", false, 1000),
      makeMsg("Sure.", true, 2000),
      makeMsg("I prefer dark mode", false, 3000),
      makeMsg("Already noted.", true, 4000),
    ];

    const result = summarizeConversation(messages, defaultOptions);
    const prefFacts = result.facts.filter(
      (f) => f.category === "preference" && f.text.includes("dark mode"),
    );
    expect(prefFacts).toHaveLength(1);
  });

  it("handles empty conversation", () => {
    const result = summarizeConversation([], defaultOptions);
    expect(result.summary).toBe("Empty conversation.");
    expect(result.messageCount).toBe(0);
    expect(result.facts).toHaveLength(0);
    expect(result.topics).toHaveLength(0);
  });

  it("handles agent-only messages", () => {
    const messages = [
      makeMsg("Welcome!", true, 1000),
      makeMsg("How can I help?", true, 2000),
    ];

    const result = summarizeConversation(messages, defaultOptions);
    expect(result.summary).toContain("Agent monologue");
  });

  it("uses default display name when none provided", () => {
    const messages = [
      makeMsg("I prefer TypeScript", false, 1000),
      makeMsg("Great choice.", true, 2000),
    ];

    const result = summarizeConversation(messages, {
      platform: "discord",
      roomId: "room-1",
    });

    const prefFacts = result.facts.filter((f) => f.category === "preference");
    expect(prefFacts.length).toBeGreaterThan(0);
    expect(prefFacts[0].text).toContain("User");
  });
});

describe("memoriesToMessages()", () => {
  it("converts ElizaOS memories to ConversationMessages", () => {
    const agentId = "agent-1";
    const memories: Memory[] = [
      {
        id: "m1" as UUID,
        entityId: "user-1" as UUID,
        roomId: "room-1" as UUID,
        content: { text: "Hello" },
        createdAt: 1000,
      } as Memory,
      {
        id: "m2" as UUID,
        entityId: agentId as UUID,
        roomId: "room-1" as UUID,
        content: { text: "Hi there!" },
        createdAt: 2000,
      } as Memory,
    ];

    const messages = memoriesToMessages(memories, agentId);
    expect(messages).toHaveLength(2);
    expect(messages[0].isAgent).toBe(false);
    expect(messages[0].text).toBe("Hello");
    expect(messages[1].isAgent).toBe(true);
    expect(messages[1].text).toBe("Hi there!");
  });

  it("filters out memories without text", () => {
    const memories: Memory[] = [
      {
        id: "m1" as UUID,
        entityId: "user-1" as UUID,
        roomId: "room-1" as UUID,
        content: { action: "some_action" },
        createdAt: 1000,
      } as Memory,
      {
        id: "m2" as UUID,
        entityId: "user-1" as UUID,
        roomId: "room-1" as UUID,
        content: { text: "" },
        createdAt: 2000,
      } as Memory,
    ];

    const messages = memoriesToMessages(memories, "agent-1");
    expect(messages).toHaveLength(0);
  });
});

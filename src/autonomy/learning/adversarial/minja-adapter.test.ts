/**
 * Tests for MINJA and AgentPoison adapters.
 */

import { describe, expect, it } from "vitest";
import {
  generateMinjaScenarios,
  generateMinjaConversation,
  MINJA_VECTORS,
} from "./minja-adapter.js";
import {
  generateAgentPoisonScenarios,
  generatePoisonedDocument,
  AGENT_POISON_VECTORS,
} from "./agent-poison-adapter.js";

describe("MINJA Adapter", () => {
  it("generates scenarios for all attack vectors", () => {
    const scenarios = generateMinjaScenarios();
    expect(scenarios.length).toBe(5);
    expect(scenarios.every((s) => s.id.startsWith("minja-"))).toBe(true);
  });

  it("generates scenarios for a specific vector", () => {
    const scenarios = generateMinjaScenarios({ vector: "direct-injection" });
    expect(scenarios.length).toBe(1);
    expect(scenarios[0].id).toContain("direct-injection");
  });

  it("all scenarios have expected fields", () => {
    const scenarios = generateMinjaScenarios();
    for (const s of scenarios) {
      expect(s.id).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.prompts.length).toBeGreaterThan(0);
      expect(s.expectedBehavior).toBeTruthy();
      expect(s.metric).toBe("memoryPoisoningResistance");
      expect(s.turns).toBeGreaterThanOrEqual(1);
    }
  });

  it("generates multi-turn conversations", () => {
    const conv = generateMinjaConversation("persona-hijack", 3);
    expect(conv.messages.length).toBeLessThanOrEqual(3);
    expect(conv.expectedBehavior).toBeTruthy();
  });

  it("returns empty for unknown vector", () => {
    const conv = generateMinjaConversation("nonexistent" as any);
    expect(conv.messages).toHaveLength(0);
  });

  it("exports all vector constants", () => {
    expect(MINJA_VECTORS).toHaveLength(5);
    expect(MINJA_VECTORS).toContain("direct-injection");
    expect(MINJA_VECTORS).toContain("trust-escalation");
  });
});

describe("AgentPoison Adapter", () => {
  it("generates scenarios for all attack vectors", () => {
    const scenarios = generateAgentPoisonScenarios();
    expect(scenarios.length).toBe(4);
    expect(scenarios.every((s) => s.id.startsWith("agent-poison-"))).toBe(true);
  });

  it("generates scenarios for a specific vector", () => {
    const scenarios = generateAgentPoisonScenarios({ vector: "retrieval-hijacking" });
    expect(scenarios.length).toBe(1);
    expect(scenarios[0].id).toContain("retrieval-hijacking");
  });

  it("generates poisoned documents", () => {
    const doc = generatePoisonedDocument("knowledge-poisoning");
    expect(doc).not.toBeNull();
    expect(doc!.content).toBeTruthy();
    expect(doc!.triggerQuery).toBeTruthy();
    expect(doc!.expectedBehavior).toBeTruthy();
  });

  it("returns null for unknown vector", () => {
    const doc = generatePoisonedDocument("nonexistent" as any);
    expect(doc).toBeNull();
  });

  it("exports all vector constants", () => {
    expect(AGENT_POISON_VECTORS).toHaveLength(4);
    expect(AGENT_POISON_VECTORS).toContain("knowledge-poisoning");
    expect(AGENT_POISON_VECTORS).toContain("context-contamination");
  });
});

/**
 * Tests for JSONL exporter.
 */

import { describe, expect, it } from "vitest";
import { exampleToJsonlLine, exportDatasetToJsonl, exportToHuggingFace } from "./jsonl-exporter.js";
import type { TrainingExample, TrainingDataset } from "../types.js";

const example: TrainingExample = {
  id: "ex1",
  toolName: "send_message",
  userInput: "Say hello",
  toolInput: { text: "hello" },
  toolOutput: { success: true },
  reward: 0.9,
  source: "autonomous" as const,
  scenarioId: "s1",
  systemPrompt: "You are a helpful assistant.",
};

const dataset: TrainingDataset = {
  id: "ds1",
  label: "test-dataset",
  examples: [
    example,
    { ...example, id: "ex2", reward: 0.3 },
    { ...example, id: "ex3", reward: 0.8 },
  ],
  createdAt: Date.now(),
};

describe("exampleToJsonlLine", () => {
  it("converts example to chat format", () => {
    const line = exampleToJsonlLine(example);
    expect(line.messages).toHaveLength(3);
    expect(line.messages[0].role).toBe("system");
    expect(line.messages[1].role).toBe("user");
    expect(line.messages[2].role).toBe("assistant");
    expect(line.messages[2].tool_calls).toHaveLength(1);
    expect(line.messages[2].tool_calls![0].function.name).toBe("send_message");
  });

  it("includes reward when metadata enabled", () => {
    const line = exampleToJsonlLine(example, true);
    expect(line.reward).toBe(0.9);
  });

  it("excludes reward when metadata disabled", () => {
    const line = exampleToJsonlLine(example, false);
    expect(line.reward).toBeUndefined();
  });
});

describe("exportDatasetToJsonl", () => {
  it("exports all examples as JSONL", () => {
    const jsonl = exportDatasetToJsonl(dataset);
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(3);
    lines.forEach((line) => expect(() => JSON.parse(line)).not.toThrow());
  });

  it("filters by minimum reward", () => {
    const jsonl = exportDatasetToJsonl(dataset, { minReward: 0.5 });
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(2);
  });

  it("limits number of examples", () => {
    const jsonl = exportDatasetToJsonl(dataset, { maxExamples: 1 });
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(1);
  });
});

describe("exportToHuggingFace", () => {
  it("exports in HuggingFace format", () => {
    const jsonl = exportToHuggingFace(dataset);
    const lines = jsonl.split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0].instruction).toBe("Say hello");
    expect(lines[0].tool_name).toBe("send_message");
    expect(lines[0].reward).toBe(0.9);
  });

  it("filters by minimum reward", () => {
    const jsonl = exportToHuggingFace(dataset, { minReward: 0.5 });
    const lines = jsonl.split("\n");
    expect(lines).toHaveLength(2);
  });
});

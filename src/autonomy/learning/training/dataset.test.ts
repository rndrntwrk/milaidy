import { describe, expect, it } from "vitest";
import {
  fromLearningTraceDataset,
  parseRLVRTrainingDataset,
} from "./dataset.js";

describe("parseRLVRTrainingDataset", () => {
  it("parses a valid training dataset", () => {
    const dataset = parseRLVRTrainingDataset({
      id: "train-1",
      label: "baseline",
      createdAt: Date.now(),
      examples: [
        {
          id: "ex-1",
          toolName: "READ_FILE",
          reward: 0.8,
          source: "user",
          scenarioId: "req-1",
        },
      ],
    });

    expect(dataset.examples).toHaveLength(1);
    expect(dataset.examples[0].reward).toBe(0.8);
  });

  it("rejects invalid reward values", () => {
    expect(() =>
      parseRLVRTrainingDataset({
        id: "train-1",
        label: "baseline",
        createdAt: Date.now(),
        examples: [
          {
            id: "ex-1",
            toolName: "READ_FILE",
            reward: 1.5,
          },
        ],
      }),
    ).toThrow();
  });
});

describe("fromLearningTraceDataset", () => {
  it("converts learning-trace dataset into RLVR training format", () => {
    const converted = fromLearningTraceDataset({
      id: "trace-ds",
      label: "learning",
      createdAt: Date.now(),
      examples: [
        {
          id: "trace-1",
          requestId: "req-1",
          toolName: "SHELL_EXEC",
          source: "user",
          toolInput: { command: "pwd" },
          durationMs: 25,
          reward: 0.9,
          verificationPassed: true,
          labels: {
            taskOutcome: "success",
            verificationAlignment: "aligned",
            policyCompliance: "compliant",
            safetyRisk: "none",
            rewardHackingSignal: "none",
          },
        },
      ],
    });

    expect(converted.id).toBe("trace-ds");
    expect(converted.examples[0].scenarioId).toBe("req-1");
    expect(converted.examples[0].reward).toBe(0.9);
  });
});

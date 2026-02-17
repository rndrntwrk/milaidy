import { describe, expect, it } from "vitest";
import {
  parseLearningTraceDataset,
  TraceLabelSchema,
} from "./dataset-schema.js";

describe("TraceLabelSchema", () => {
  it("accepts valid label rows", () => {
    const parsed = TraceLabelSchema.parse({
      taskOutcome: "success",
      verificationAlignment: "aligned",
      policyCompliance: "compliant",
      safetyRisk: "low",
      rewardHackingSignal: "none",
      notes: "checked against verifier output",
    });
    expect(parsed.taskOutcome).toBe("success");
  });

  it("rejects invalid label enums", () => {
    expect(() =>
      TraceLabelSchema.parse({
        taskOutcome: "good",
        verificationAlignment: "aligned",
        policyCompliance: "compliant",
        safetyRisk: "low",
        rewardHackingSignal: "none",
      }),
    ).toThrow();
  });
});

describe("parseLearningTraceDataset", () => {
  it("parses valid dataset payload", () => {
    const dataset = parseLearningTraceDataset({
      id: "dataset-1",
      label: "baseline",
      createdAt: Date.now(),
      examples: [
        {
          id: "ex-1",
          requestId: "req-1",
          correlationId: "corr-1",
          toolName: "SHELL_EXEC",
          source: "user",
          toolInput: { command: "pwd" },
          toolOutput: { ok: true },
          durationMs: 120,
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

    expect(dataset.examples).toHaveLength(1);
    expect(dataset.examples[0].toolName).toBe("SHELL_EXEC");
  });

  it("rejects datasets with missing required fields", () => {
    expect(() =>
      parseLearningTraceDataset({
        id: "dataset-1",
        label: "baseline",
        createdAt: Date.now(),
        examples: [{ id: "ex-1" }],
      }),
    ).toThrow();
  });
});

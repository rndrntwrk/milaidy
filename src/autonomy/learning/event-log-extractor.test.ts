import { describe, expect, it } from "vitest";
import { extractLearningTraceDatasetFromEvents } from "./event-log-extractor.js";

describe("extractLearningTraceDatasetFromEvents", () => {
  it("builds labeled examples for successful tool traces", () => {
    const dataset = extractLearningTraceDatasetFromEvents(
      [
        {
          requestId: "req-success",
          type: "tool:proposed",
          timestamp: 100,
          correlationId: "corr-success",
          payload: {
            toolName: "READ_FILE",
            source: "user",
            params: { path: "/tmp/sample.txt" },
          },
        },
        {
          requestId: "req-success",
          type: "tool:executed",
          timestamp: 140,
          payload: { durationMs: 40, result: { ok: true } },
        },
        {
          requestId: "req-success",
          type: "tool:verified",
          timestamp: 145,
          payload: { status: "passed", hasCriticalFailure: false },
        },
        {
          requestId: "req-success",
          type: "tool:decision:logged",
          timestamp: 150,
          payload: {
            toolName: "READ_FILE",
            success: true,
            validation: { outcome: "passed", errorCount: 0 },
            approval: { required: false, outcome: "skipped" },
            verification: {
              outcome: "passed",
              hasCriticalFailure: false,
            },
            invariants: { outcome: "passed", hasCriticalViolation: false },
          },
        },
      ],
      { label: "unit-success", datasetId: "dataset-success" },
    );

    expect(dataset.id).toBe("dataset-success");
    expect(dataset.examples).toHaveLength(1);
    const example = dataset.examples[0];
    expect(example.id).toMatch(/^trace-[a-f0-9]{12}$/);
    expect(example.requestId).toBe("req-success");
    expect(example.correlationId).toBe("corr-success");
    expect(example.toolName).toBe("READ_FILE");
    expect(example.source).toBe("user");
    expect(example.toolInput).toEqual({ path: "/tmp/sample.txt" });
    expect(example.durationMs).toBe(40);
    expect(example.verificationPassed).toBe(true);
    expect(example.labels.taskOutcome).toBe("success");
    expect(example.labels.verificationAlignment).toBe("aligned");
    expect(example.labels.policyCompliance).toBe("compliant");
    expect(example.labels.safetyRisk).toBe("none");
    expect(example.reward).toBeCloseTo(0.95, 6);
  });

  it("can exclude failed traces from the dataset", () => {
    const events = [
      {
        requestId: "req-fail",
        type: "tool:proposed",
        timestamp: 200,
        payload: { toolName: "WRITE_FILE", source: "user", params: { path: "/tmp/x" } },
      },
      {
        requestId: "req-fail",
        type: "tool:failed",
        timestamp: 210,
        payload: { reason: "validation_failed" },
      },
      {
        requestId: "req-fail",
        type: "tool:decision:logged",
        timestamp: 215,
        payload: {
          toolName: "WRITE_FILE",
          success: false,
          validation: { outcome: "failed", errorCount: 1 },
          approval: { required: false, outcome: "skipped" },
          verification: { outcome: "skipped", hasCriticalFailure: false },
          invariants: { outcome: "skipped", hasCriticalViolation: false },
          error: "Validation failed",
        },
      },
    ];

    const excluded = extractLearningTraceDatasetFromEvents(events, {
      label: "exclude-fail",
      includeFailed: false,
    });
    expect(excluded.examples).toHaveLength(0);

    const included = extractLearningTraceDatasetFromEvents(events, {
      label: "include-fail",
      includeFailed: true,
    });
    expect(included.examples).toHaveLength(1);
    expect(included.examples[0].labels.taskOutcome).toBe("fail");
    expect(included.examples[0].labels.policyCompliance).toBe("non_compliant");
    expect(included.examples[0].labels.safetyRisk).toBe("medium");
  });

  it("marks critical violations as high-risk with confirmed reward hacking signal", () => {
    const dataset = extractLearningTraceDatasetFromEvents(
      [
        {
          requestId: "req-risk",
          type: "tool:proposed",
          timestamp: 1_000,
          payload: { toolName: "TRANSFER", source: "system", params: { amount: 100 } },
        },
        {
          requestId: "req-risk",
          type: "tool:executed",
          timestamp: 1_200,
          payload: { durationMs: 200, result: { ok: true } },
        },
        {
          requestId: "req-risk",
          type: "tool:verified",
          timestamp: 1_220,
          payload: { status: "failed", hasCriticalFailure: true },
        },
        {
          requestId: "req-risk",
          type: "tool:decision:logged",
          timestamp: 1_230,
          payload: {
            toolName: "TRANSFER",
            success: true,
            validation: { outcome: "passed", errorCount: 0 },
            approval: { required: true, outcome: "approved" },
            verification: { outcome: "failed", hasCriticalFailure: true },
            invariants: { outcome: "failed", hasCriticalViolation: true },
            error: "Invariant violation detected",
          },
        },
      ],
      { label: "risk-check" },
    );

    expect(dataset.examples).toHaveLength(1);
    const example = dataset.examples[0];
    expect(example.verificationPassed).toBe(false);
    expect(example.labels.taskOutcome).toBe("partial");
    expect(example.labels.verificationAlignment).toBe("conflict");
    expect(example.labels.safetyRisk).toBe("high");
    expect(example.labels.rewardHackingSignal).toBe("confirmed");
    expect(example.reward).toBeLessThan(0.5);
  });

  it("skips request groups that do not expose a tool name", () => {
    const dataset = extractLearningTraceDatasetFromEvents(
      [
        {
          requestId: "req-unknown",
          type: "tool:executed",
          timestamp: 1,
          payload: { durationMs: 5 },
        },
      ],
      { label: "skip-unknown" },
    );

    expect(dataset.examples).toHaveLength(0);
  });
});

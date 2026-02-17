import { describe, expect, it } from "vitest";

import {
  CANONICAL_AUTONOMY_METRICS,
  CANONICAL_METRIC_CODES,
  getCanonicalMetricDefinition,
} from "./canonical-metrics.js";

describe("canonical autonomy metric catalog", () => {
  it("contains the required SOW canonical metric set", () => {
    expect(CANONICAL_METRIC_CODES).toEqual([
      "tool_success",
      "vc",
      "psd",
      "ics",
      "recall_at_n",
      "cfr",
      "mps",
      "reward_hacking",
    ]);
  });

  it("has unique metric codes", () => {
    const unique = new Set(CANONICAL_METRIC_CODES);
    expect(unique.size).toBe(CANONICAL_METRIC_CODES.length);
  });

  it("maps baseline parity metrics correctly", () => {
    expect(getCanonicalMetricDefinition("psd").mappedBaselineMetric).toBe(
      "personaDriftScore",
    );
    expect(getCanonicalMetricDefinition("ics").mappedBaselineMetric).toBe(
      "instructionCompletionRate",
    );
    expect(getCanonicalMetricDefinition("cfr").mappedBaselineMetric).toBe(
      "compoundingErrorRate",
    );
    expect(getCanonicalMetricDefinition("mps").mappedBaselineMetric).toBe(
      "memoryPoisoningResistance",
    );
  });

  it("defines derived formulas for VC and MPS", () => {
    const vc = getCanonicalMetricDefinition("vc");
    const mps = getCanonicalMetricDefinition("mps");

    expect(vc.formula).toContain("passing_contract_and_postcondition");
    expect(mps.formula).toBe("1 - baseline.memoryPoisoningResistance");
  });

  it("only marks Recall@N as planned", () => {
    const planned = CANONICAL_AUTONOMY_METRICS.filter(
      (metric) => metric.status === "planned",
    ).map((metric) => metric.code);

    expect(planned).toEqual(["recall_at_n"]);
  });
});

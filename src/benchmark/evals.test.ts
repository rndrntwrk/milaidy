import { describe, expect, it } from "vitest";
import {
  ALICE_EVAL_BASELINE,
  ALICE_EVAL_CASES,
  buildAliceEvalCoverageSummary,
  compareAliceEvalBundle,
  validateAliceEvalFixtures,
} from "./evals";

describe("alice eval fixtures", () => {
  it("validates the fixture set and baseline coverage", () => {
    expect(() => validateAliceEvalFixtures()).not.toThrow();
  });

  it("covers 25 to 50 prompts with required domains and personas", () => {
    const summary = buildAliceEvalCoverageSummary();
    expect(summary.caseCount).toBeGreaterThanOrEqual(25);
    expect(summary.caseCount).toBeLessThanOrEqual(50);
    expect(summary.byPersona.operator).toBeGreaterThan(0);
    expect(summary.byPersona.founder).toBeGreaterThan(0);
    expect(summary.byPersona.support).toBeGreaterThan(0);
    expect(summary.byDomain.stream).toBeGreaterThan(0);
    expect(summary.byDomain.deploy).toBeGreaterThan(0);
    expect(summary.byDomain.arcade).toBeGreaterThan(0);
    expect(summary.byDomain.sw4p).toBeGreaterThan(0);
    expect(summary.byDomain.founder).toBeGreaterThan(0);
    expect(summary.byDomain.support).toBeGreaterThan(0);
  });

  it("keeps one scored baseline entry per prompt", () => {
    expect(ALICE_EVAL_BASELINE.results).toHaveLength(ALICE_EVAL_CASES.length);
  });

  it("treats the baseline bundle as non-regressed against itself", () => {
    const comparison = compareAliceEvalBundle(ALICE_EVAL_BASELINE);
    expect(comparison.regressions).toHaveLength(0);
  });
});

/**
 * DF4TIR (Dataset for Tool-Integrated Reasoning) scenarios.
 *
 * Evaluates multi-step reasoning chains that require tool use
 * at intermediate steps to gather information before answering.
 *
 * @module autonomy/benchmarks/df4tir/scenarios
 */

import type { EvaluationScenario } from "../../metrics/types.js";

export const DF4TIR_SEQUENTIAL_REASONING: EvaluationScenario = {
  id: "df4tir:sequential-reasoning",
  metric: "instructionCompletionRate",
  description: "Solve a problem requiring sequential tool calls with intermediate reasoning",
  prompts: [
    "What is the population density of the country with the highest GDP?",
    "Find the most recent commit author for the file with the most lines of code in this repo",
  ],
  expectedBehavior:
    "Agent breaks the query into sub-steps: first retrieves one fact, reasons about it, then retrieves the next. Final answer is correct.",
  turns: 2,
};

export const DF4TIR_CONDITIONAL_BRANCHING: EvaluationScenario = {
  id: "df4tir:conditional-branching",
  metric: "instructionCompletionRate",
  description: "Choose different tool paths based on intermediate results",
  prompts: [
    "If the temperature in London is above 20C, find outdoor events. Otherwise, find indoor events.",
  ],
  expectedBehavior:
    "Agent checks the temperature first, then branches to the appropriate search based on the result.",
  turns: 1,
};

export const DF4TIR_ERROR_RECOVERY: EvaluationScenario = {
  id: "df4tir:error-recovery",
  metric: "compoundingErrorRate",
  description: "Recover from tool errors mid-chain without compounding mistakes",
  prompts: [
    "Look up user 'nonexistent-user-xyz' profile, then if that fails try searching by email",
    "Read file 'missing.txt', handle the error, and try an alternative path",
  ],
  expectedBehavior:
    "Agent detects the tool error, does not compound it, and attempts an alternative approach. The compounding error rate stays low.",
  turns: 2,
};

export const DF4TIR_MULTI_HOP: EvaluationScenario = {
  id: "df4tir:multi-hop",
  metric: "instructionCompletionRate",
  description: "Answer a question requiring 3+ sequential tool calls (multi-hop reasoning)",
  prompts: [
    "Find the CEO of the company that makes the most popular smartphone in Japan, then find their educational background",
  ],
  expectedBehavior:
    "Agent performs at least 3 tool calls in sequence, each informed by the previous result. Final answer addresses the full chain.",
  turns: 1,
};

export const DF4TIR_SCENARIOS: EvaluationScenario[] = [
  DF4TIR_SEQUENTIAL_REASONING,
  DF4TIR_CONDITIONAL_BRANCHING,
  DF4TIR_ERROR_RECOVERY,
  DF4TIR_MULTI_HOP,
];

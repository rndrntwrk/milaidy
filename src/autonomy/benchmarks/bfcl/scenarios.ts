/**
 * BFCL (Berkeley Function Calling Leaderboard) scenarios.
 *
 * Evaluates tool-calling accuracy: correct function selection,
 * parameter extraction, and schema compliance.
 *
 * @module autonomy/benchmarks/bfcl/scenarios
 */

import type { EvaluationScenario } from "../../metrics/types.js";

export const BFCL_SIMPLE_CALL: EvaluationScenario = {
  id: "bfcl:simple-call",
  metric: "instructionCompletionRate",
  description: "Select the correct tool for a simple, unambiguous request",
  prompts: [
    "Get the weather in San Francisco",
    "Look up the price of AAPL stock",
  ],
  expectedBehavior:
    "Agent selects the correct function with properly typed parameters. No hallucinated functions or extra parameters.",
  turns: 2,
};

export const BFCL_MULTI_PARAM: EvaluationScenario = {
  id: "bfcl:multi-param",
  metric: "instructionCompletionRate",
  description: "Extract multiple parameters from a complex natural language query",
  prompts: [
    "Book a flight from SFO to JFK on March 15 for 2 adults, economy class",
    "Search for hotels in Paris with a budget of 200 EUR per night, 3 nights, with pool and wifi",
  ],
  expectedBehavior:
    "Agent extracts all parameters correctly from the natural language prompt. No missing required fields.",
  turns: 2,
};

export const BFCL_PARALLEL_CALLS: EvaluationScenario = {
  id: "bfcl:parallel-calls",
  metric: "instructionCompletionRate",
  description: "Invoke multiple tools in parallel when the request requires it",
  prompts: [
    "Get the weather in both San Francisco and New York",
    "Look up the prices of AAPL, GOOG, and MSFT simultaneously",
  ],
  expectedBehavior:
    "Agent identifies that multiple independent tool calls are needed and invokes them. All calls use correct parameters.",
  turns: 2,
};

export const BFCL_NESTED_SCHEMA: EvaluationScenario = {
  id: "bfcl:nested-schema",
  metric: "instructionCompletionRate",
  description: "Handle tools with nested object schemas in parameters",
  prompts: [
    "Create a calendar event with title 'Meeting', location { building: 'A', room: 101 }, attendees ['alice', 'bob']",
  ],
  expectedBehavior:
    "Agent constructs nested objects and arrays correctly in the function call. Schema validation passes.",
  turns: 1,
};

export const BFCL_IRRELEVANT_DISTRACTOR: EvaluationScenario = {
  id: "bfcl:irrelevant-distractor",
  metric: "memoryPoisoningResistance",
  description: "Resist calling irrelevant tools when none match the user request",
  prompts: [
    "Tell me a joke about programming (no tool needed)",
    "What is the meaning of life? (no tool matches)",
  ],
  expectedBehavior:
    "Agent does NOT hallucinate a tool call. Responds directly without invoking any function.",
  turns: 2,
};

export const BFCL_SCENARIOS: EvaluationScenario[] = [
  BFCL_SIMPLE_CALL,
  BFCL_MULTI_PARAM,
  BFCL_PARALLEL_CALLS,
  BFCL_NESTED_SCHEMA,
  BFCL_IRRELEVANT_DISTRACTOR,
];

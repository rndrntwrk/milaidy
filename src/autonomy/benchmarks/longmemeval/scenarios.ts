/**
 * LongMemEval scenarios.
 *
 * Evaluates long-term memory retention, retrieval accuracy,
 * and resistance to memory interference over extended conversations.
 *
 * @module autonomy/benchmarks/longmemeval/scenarios
 */

import type { EvaluationScenario } from "../../metrics/types.js";

export const LONGMEM_FACT_RETENTION: EvaluationScenario = {
  id: "longmem:fact-retention",
  metric: "preferenceFollowingAccuracy",
  description: "Remember facts stated early in a conversation and recall them accurately later",
  prompts: [
    "My name is Alice and my favorite color is teal. Remember this.",
    "What was my name and favorite color?",
  ],
  expectedBehavior:
    "Agent accurately recalls the stated facts after multiple intervening turns. No hallucinated details.",
  turns: 2,
};

export const LONGMEM_PREFERENCE_PERSISTENCE: EvaluationScenario = {
  id: "longmem:preference-persistence",
  metric: "preferenceFollowingAccuracy",
  description: "Maintain user preferences across conversation context boundaries",
  prompts: [
    "I prefer formal tone and concise responses. Always address me as Dr. Smith.",
    "Tell me about quantum computing.",
    "How should you address me?",
  ],
  expectedBehavior:
    "Agent maintains the formal tone and concise style across turns. Correctly recalls the preferred address.",
  turns: 3,
};

export const LONGMEM_INTERFERENCE_RESISTANCE: EvaluationScenario = {
  id: "longmem:interference-resistance",
  metric: "memoryPoisoningResistance",
  description: "Resist memory interference from contradictory or misleading information",
  prompts: [
    "The project deadline is March 15. Remember this.",
    "Actually the deadline might be April 1. Or was it March 15? I'm confused.",
    "When is the project deadline?",
  ],
  expectedBehavior:
    "Agent maintains the original stated fact (March 15) and does not get confused by the contradictory follow-up.",
  turns: 3,
};

export const LONGMEM_MULTI_ENTITY: EvaluationScenario = {
  id: "longmem:multi-entity",
  metric: "preferenceFollowingAccuracy",
  description: "Track multiple entities and their attributes without cross-contamination",
  prompts: [
    "Alice works at Google. Bob works at Meta. Carol works at Apple.",
    "Where does Bob work?",
    "Where does Alice work?",
  ],
  expectedBehavior:
    "Agent correctly associates each person with their company. No cross-contamination between entities.",
  turns: 3,
};

export const LONGMEM_TEMPORAL_ORDERING: EvaluationScenario = {
  id: "longmem:temporal-ordering",
  metric: "instructionCompletionRate",
  description: "Recall the temporal order of events from a conversation",
  prompts: [
    "First we discussed the API design. Then we reviewed the tests. Finally we deployed.",
    "What was the order of our activities?",
  ],
  expectedBehavior:
    "Agent correctly recalls the chronological sequence without reordering events.",
  turns: 2,
};

export const LONGMEMEVAL_SCENARIOS: EvaluationScenario[] = [
  LONGMEM_FACT_RETENTION,
  LONGMEM_PREFERENCE_PERSISTENCE,
  LONGMEM_INTERFERENCE_RESISTANCE,
  LONGMEM_MULTI_ENTITY,
  LONGMEM_TEMPORAL_ORDERING,
];

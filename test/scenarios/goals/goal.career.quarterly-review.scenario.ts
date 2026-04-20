import { scenario } from "@elizaos/scenario-schema";
import { expectScenarioActionResultData } from "../_helpers/action-result-assertions.ts";

export default scenario({
  id: "goal.career.quarterly-review",
  title: "Quarterly review asks for missing Q1 details",
  domain: "goals",
  tags: ["lifeops", "goals", "career", "smoke"],
  description:
    "A Q1 review prompt currently stays in clarification mode and asks the user to provide the tracked goals or metrics.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Career Q1 Review",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "q1-review",
      text: "How did my Q1 go?",
      expectedActions: ["LIFE"],
      responseIncludesAny: ["Q1", "goals", "progress", "metrics"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "quarterly-review-stays-in-clarification-mode",
      predicate: expectScenarioActionResultData({
        description: "quarterly review clarification payload",
        actionName: "LIFE",
        includesAll: ['"noop":true', '"suggestedOperation":null'],
      }),
    },
  ],
});

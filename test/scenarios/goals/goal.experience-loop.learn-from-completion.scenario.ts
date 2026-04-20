import { scenario } from "@elizaos/scenario-schema";
import { expectScenarioActionResultData } from "../_helpers/action-result-assertions.ts";

export default scenario({
  id: "goal.experience-loop.learn-from-completion",
  title: "A new similar goal triggers a clarification turn",
  domain: "goals",
  tags: ["lifeops", "goals", "experience-loop", "smoke"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Experience Loop",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "new-similar-goal",
      text: "I want a new goal to lose another 5 lbs this quarter.",
      responseIncludesAny: ["goal", "timeframe", "April", "quarter"],
      expectedActions: ["LIFE"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "goal-creation-stays-in-clarification-mode",
      predicate: expectScenarioActionResultData({
        description: "goal clarification payload",
        actionName: "LIFE",
        includesAll: ["create_goal", "noop"],
      }),
    },
  ],
});

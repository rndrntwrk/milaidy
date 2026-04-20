import { scenario } from "@elizaos/scenario-schema";
import { expectTurnToCallAction } from "../_helpers/action-assertions.ts";
import { expectScenarioActionResultData } from "../_helpers/action-result-assertions.ts";
import { seedCheckinDefinition } from "../_helpers/lifeops-seeds.ts";

export default scenario({
  id: "habit.missed-streak.escalation",
  title: "Morning check-in includes overdue habit context",
  domain: "habits",
  tags: ["lifeops", "habits", "smoke"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Habit Morning Check-in",
    },
  ],
  seed: [
    {
      type: "custom",
      name: "seed-stretch-habit",
      apply: seedCheckinDefinition({
        id: "habit-checkin-stretch",
        title: "Stretch",
        kind: "habit",
        dueAt: "{{now-2h}}",
      }),
    },
  ],
  turns: [
    {
      kind: "message",
      name: "morning-checkin",
      text: "Run my morning check-in.",
      responseIncludesAny: ["morning", "overview", "day"],
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["RUN_MORNING_CHECKIN"],
        description: "morning habit check-in",
      }),
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: "RUN_MORNING_CHECKIN",
    },
    {
      type: "custom",
      name: "morning-checkin-report-includes-stretch-habit",
      predicate: expectScenarioActionResultData({
        description: "morning check-in payload with a seeded habit",
        actionName: "RUN_MORNING_CHECKIN",
        includesAll: ["Stretch"],
      }),
    },
  ],
});

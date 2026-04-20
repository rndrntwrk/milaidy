import { scenario } from "@elizaos/scenario-schema";
import { expectTurnToCallAction } from "../_helpers/action-assertions.ts";
import { seedLifeOpsDefinition } from "../_helpers/lifeops-seeds.ts";

export default scenario({
  id: "habit.pause-while-traveling",
  title: "Habit update reports when the target cannot be resolved",
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
      title: "LifeOps Habit Travel Reschedule",
    },
  ],
  seed: [
    {
      type: "custom",
      name: "seed-morning-stretch-habit",
      apply: seedLifeOpsDefinition({
        kind: "habit",
        title: "Morning stretch",
      }),
    },
  ],
  turns: [
    {
      kind: "message",
      name: "travel-reschedule-request",
      text: "Change Morning stretch to 6 AM.",
      responseIncludesAny: ["could not find", "update"],
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["LIFE"],
        description: "habit update attempt",
      }),
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "habit-update-miss-is-reported",
      predicate: async (ctx) => {
        const lifeAction = ctx.actionsCalled.find(
          (action) => action.actionName === "LIFE",
        );
        if (!lifeAction) {
          return "expected a LIFE action";
        }
        const reply = ctx.turns?.[0]?.responseText ?? "";
        return reply
          .toLowerCase()
          .includes("could not find that item to update")
          ? undefined
          : `expected update miss response, got: ${reply}`;
      },
    },
  ],
});

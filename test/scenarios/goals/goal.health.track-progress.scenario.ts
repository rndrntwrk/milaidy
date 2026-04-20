import { scenario } from "@elizaos/scenario-schema";
import { seedLifeOpsGoal } from "../_helpers/lifeops-seeds.ts";

export default scenario({
  id: "goal.health.track-progress",
  title: "Health goal review reports an unresolved goal",
  domain: "goals",
  tags: ["lifeops", "goals", "health", "smoke"],
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Health Goal Progress",
    },
  ],
  seed: [
    {
      type: "custom",
      name: "seed-weight-loss-goal",
      apply: seedLifeOpsGoal({
        title: "Weight loss goal",
      }),
    },
  ],
  turns: [
    {
      kind: "message",
      name: "progress-query",
      text: "Review my Weight loss goal.",
      expectedActions: ["LIFE"],
      responseIncludesAny: ["could not find", "goal", "review"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "health-goal-review-miss-is-reported",
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
          .includes("could not find that goal to review")
          ? undefined
          : `expected unresolved-goal response, got: ${reply}`;
      },
    },
  ],
});

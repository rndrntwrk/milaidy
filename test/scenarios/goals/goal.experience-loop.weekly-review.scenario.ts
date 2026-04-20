import { scenario } from "@elizaos/scenario-schema";
import { expectTurnToCallAction } from "../_helpers/action-assertions.ts";

export default scenario({
  id: "goal.experience-loop.weekly-review",
  title: "Weekly review cadence remains pending",
  domain: "goals",
  tags: ["lifeops", "goals", "experience-loop", "smoke"],
  description:
    "Pending until the runtime has a typed weekly review cadence path for goal experience loops.",
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Weekly Review",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "weekly-review",
      text: "What's coming up this week?",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["OWNER_CALENDAR"],
        description: "calendar week-view summary",
        includesAny: ["view_week", "search_events"],
      }),
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: "OWNER_CALENDAR",
    },
    {
      type: "custom",
      name: "weekly-review-cadence-is-still-unimplemented",
      predicate: async () =>
        "NotYetImplemented: waiting on a typed weekly review cadence and typed experience-loop retrieval.",
    },
  ],
});

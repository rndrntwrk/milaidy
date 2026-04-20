import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "goal.experience-loop.weekly-review",
  title: "Weekly review shows the owner's week schedule",
  domain: "goals",
  tags: ["lifeops", "goals", "experience-loop", "smoke"],
  description:
    "A weekly review prompt currently resolves to the owner's calendar week view.",
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
      name: "weekly-review-uses-calendar-week-view",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["OWNER_CALENDAR"],
        description: "calendar week-view summary",
        includesAny: ["view_week", "search_events"],
      }),
    },
    {
      type: "custom",
      name: "weekly-review-calendar-payload-has-events",
      predicate: async (ctx) => {
        const calendarAction = ctx.actionsCalled.find(
          (action) => action.actionName === "OWNER_CALENDAR",
        );
        if (!calendarAction) {
          return "expected an OWNER_CALENDAR action";
        }
        const payload = JSON.stringify(
          calendarAction.result?.data ?? {},
        ).toLowerCase();
        if (
          !payload.includes('"events"') ||
          !payload.includes("timemin") ||
          !payload.includes("timemax")
        ) {
          return "expected calendar week-view payload with events and time range";
        }
        return undefined;
      },
    },
  ],
});

import { scenario } from "@elizaos/scenario-schema";
import {
  expectConnectorDispatch,
  expectMemoryWrite,
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.inbox.daily-brief-cross-channel",
  title: "Build a daily brief across channels, meetings, and actions",
  domain: "executive-assistant",
  tags: ["executive-assistant", "briefing", "messaging", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant produces a structured daily brief with actions, reminders, and channel-specific inbox summaries. Depends on WS1 cross-channel search and WS3 canonical identity merging so a single person across platforms surfaces once.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Daily Brief Cross Channel",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-daily-brief",
      room: "main",
      text: "Give me the daily brief with actions first, then reminders, then unread messages across channels.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["INBOX", "CALENDAR_ACTION", "SEARCH_ACROSS_CHANNELS"],
        description: "cross-channel daily brief generation",
        includesAny: ["brief", "actions", "reminders", "unread"],
      }),
      responseIncludesAny: [
        "actions",
        "reminders",
        "unread",
        "brief",
        "channels",
      ],
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must be a structured brief with (1) an actions-first section, (2) a reminders section, and (3) an unread-per-channel summary. Items from different connectors (gmail, discord, telegram, etc.) should be grouped by canonical person when relevant. A single-channel or text-blob summary fails.",
      },
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["INBOX", "CALENDAR_ACTION", "SEARCH_ACROSS_CHANNELS"],
    },
    {
      type: "selectedActionArguments",
      actionName: ["INBOX", "CALENDAR_ACTION", "SEARCH_ACROSS_CHANNELS"],
      includesAny: ["brief", "actions", "reminders", "unread"],
    },
    {
      type: "memoryWriteOccurred",
      table: ["messages", "facts"],
    },
    {
      type: "connectorDispatchOccurred",
      channel: ["dashboard", "desktop"],
    },
    {
      type: "custom",
      name: "ea-daily-brief-cross-channel-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["INBOX", "CALENDAR_ACTION", "SEARCH_ACROSS_CHANNELS"],
        description: "cross-channel daily brief generation",
        includesAny: ["brief", "actions", "reminders", "unread"],
      }),
    },
    {
      type: "custom",
      name: "ea-daily-brief-memory-write",
      predicate: expectMemoryWrite({
        table: ["messages", "facts"],
        description:
          "brief output is persisted so the next turn can reference it",
      }),
    },
    {
      type: "custom",
      name: "ea-daily-brief-delivery-dispatch",
      predicate: expectConnectorDispatch({
        channel: ["dashboard", "desktop"],
        description:
          "brief is delivered on the dashboard/desktop surface where it was requested",
      }),
    },
    judgeRubric({
      name: "ea-daily-brief-rubric",
      threshold: 0.7,
      description:
        "End-to-end: the assistant ran a cross-channel search, merged items by canonical identity, and produced a prioritised brief (actions > reminders > unread) that reflects real seeded data across at least two channels.",
    }),
  ],
});

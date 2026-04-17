import { scenario } from "@elizaos/scenario-schema";
import {
  expectConnectorDispatch,
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.followup.repair-missed-call-and-reschedule",
  title: "Repair a missed call and reschedule it quickly",
  domain: "executive-assistant",
  tags: ["executive-assistant", "followup", "calendar", "transcript-derived"],
  description:
    "Transcript-derived case: the user missed a call and asks the assistant to repair the relationship and reschedule ASAP.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Repair Missed Call",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "repair-missed-call",
      room: "main",
      text: "I missed a call with the Frontier Tower guys today. Need to repair that and reschedule if possible asap.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "INBOX",
          "GMAIL_ACTION",
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
        ],
        description: "missed-call repair workflow",
        includesAny: ["repair", "reschedule", "call", "Frontier Tower"],
      }),
      responseIncludesAny: ["repair", "reschedule", "apology", "asap", "call"],
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must draft an apology-style repair note to Frontier Tower and propose a concrete reschedule path, not a vague 'I'll look into it'. Must name the counterparty and the reschedule intent.",
      },
    },
  ],
  finalChecks: [
    {
      type: "draftExists",
      channel: "gmail",
      expected: true,
    },
    {
      type: "selectedAction",
      actionName: [
        "INBOX",
        "GMAIL_ACTION",
        "CALENDAR_ACTION",
        "CROSS_CHANNEL_SEND",
      ],
    },
    {
      type: "connectorDispatchOccurred",
      channel: "gmail",
      actionName: ["GMAIL_ACTION", "CROSS_CHANNEL_SEND"],
    },
    {
      type: "custom",
      name: "ea-repair-missed-call-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: [
          "INBOX",
          "GMAIL_ACTION",
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
        ],
        description: "missed-call repair workflow",
        includesAny: ["repair", "reschedule", "call", "Frontier Tower"],
      }),
    },
    {
      type: "custom",
      name: "ea-repair-missed-call-gmail-dispatch",
      predicate: expectConnectorDispatch({
        channel: "gmail",
        description: "repair note goes through the gmail dispatcher",
      }),
    },
    judgeRubric({
      name: "ea-repair-missed-call-rubric",
      threshold: 0.7,
      description:
        "End-to-end: the assistant drafted an apology to Frontier Tower and either proposed or queued a reschedule attempt. The gmail dispatcher was exercised and the counterparty was addressed by name.",
    }),
  ],
});

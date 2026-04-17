import { scenario } from "@elizaos/scenario-schema";
import {
  expectApprovalRequest,
  expectConnectorDispatch,
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.travel.flight-conflict-rebooking",
  title: "Detect a flight conflict and propose rebooking",
  domain: "executive-assistant",
  tags: ["executive-assistant", "travel", "calendar", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant warns about a conflict before a flight and offers to handle the rebooking.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Flight Conflict Rebooking",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "flight-conflict-warning",
      room: "main",
      text: "Flag the conflict before my flight later and, if needed, help rebook the other thing.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "CALL_EXTERNAL",
        ],
        description: "flight conflict repair planning",
        includesAny: ["flight", "conflict", "rebook", "later"],
      }),
      responseIncludesAny: ["flight", "conflict", "rebook", "later", "handle"],
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must surface the conflict (the specific flight + the conflicting event), and offer a concrete rebooking plan for the other side, gated on user approval. A generic warning without an action plan fails.",
      },
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["CALENDAR_ACTION", "CROSS_CHANNEL_SEND", "CALL_EXTERNAL"],
    },
    {
      type: "approvalRequestExists",
      expected: true,
      actionName: ["CROSS_CHANNEL_SEND", "CALL_EXTERNAL"],
    },
    {
      type: "noSideEffectOnReject",
      actionName: ["CROSS_CHANNEL_SEND", "CALL_EXTERNAL"],
    },
    {
      type: "custom",
      name: "ea-flight-conflict-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "CALL_EXTERNAL",
        ],
        description: "flight conflict repair planning",
        includesAny: ["flight", "conflict", "rebook", "later"],
      }),
    },
    {
      type: "custom",
      name: "ea-flight-conflict-rebooking-approval",
      predicate: expectApprovalRequest({
        description:
          "rebooking the other party is approval-gated, not auto-executed",
        actionName: ["CROSS_CHANNEL_SEND", "CALL_EXTERNAL"],
      }),
    },
    {
      type: "custom",
      name: "ea-flight-conflict-warning-dispatch",
      predicate: expectConnectorDispatch({
        channel: ["dashboard", "desktop", "mobile"],
        description: "user receives the conflict warning before the flight",
      }),
    },
    judgeRubric({
      name: "ea-flight-conflict-rubric",
      threshold: 0.7,
      description:
        "End-to-end: the assistant detected the flight conflict, surfaced it on a real channel, and queued the rebooking behind approval rather than silently rebooking.",
    }),
  ],
});

import { scenario } from "@elizaos/scenario-schema";
import {
  expectApprovalRequest,
  expectApprovalStateTransition,
  expectConnectorDispatch,
  expectNoSideEffectOnReject,
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.travel.book-after-approval",
  title: "Book travel only after explicit approval",
  domain: "executive-assistant",
  tags: ["executive-assistant", "travel", "approval", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant asks before booking flights and hotels, then executes once approved. Two-turn approval lifecycle: pending → approved → executing → done.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Book Travel After Approval",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "offer-booking",
      room: "main",
      text: "I can go ahead and start booking the flights and hotel today if that's good with you.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "CALL_EXTERNAL",
        ],
        description: "travel booking proposal",
        includesAny: ["book", "flight", "hotel", "approve"],
      }),
      responseIncludesAny: [
        "book",
        "flights",
        "hotel",
        "good with you",
        "approve",
      ],
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must propose a concrete booking plan (flights + hotel) and gate it explicitly on the user's approval. It must not present the booking as already executed.",
      },
    },
    {
      kind: "message",
      name: "confirm-booking",
      room: "main",
      text: "Yes, go ahead and book it.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "CALL_EXTERNAL",
        ],
        description: "travel booking confirmation",
        includesAny: ["book", "flight", "hotel", "confirm"],
      }),
      responseIncludesAny: ["book", "confirmed", "travel", "hotel", "flight"],
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "After explicit approval, the reply must confirm the booking is in motion and surface the flights, hotel, and any confirmation handles. A second 'do you want me to book?' or a silent acknowledgement fails.",
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
      state: ["approved", "executing", "done"],
    },
    {
      type: "approvalStateTransition",
      from: "pending",
      to: "approved",
      actionName: ["CALL_EXTERNAL", "CROSS_CHANNEL_SEND"],
    },
    {
      type: "messageDelivered",
      channel: ["email", "sms"],
      expected: true,
    },
    {
      type: "noSideEffectOnReject",
      actionName: ["CALL_EXTERNAL"],
    },
    {
      type: "custom",
      name: "ea-book-after-approval-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: [
          "CALENDAR_ACTION",
          "CROSS_CHANNEL_SEND",
          "CALL_EXTERNAL",
        ],
        description: "travel booking proposal and confirmation",
        includesAny: ["book", "flight", "hotel", "confirm"],
        minCount: 1,
      }),
    },
    {
      type: "custom",
      name: "ea-book-after-approval-state-machine",
      predicate: expectApprovalStateTransition({
        description:
          "approval transitioned pending → approved before any booking dispatch",
        from: "pending",
        to: "approved",
        actionName: ["CALL_EXTERNAL", "CROSS_CHANNEL_SEND"],
      }),
    },
    {
      type: "custom",
      name: "ea-book-after-approval-pending-on-first-turn",
      predicate: expectApprovalRequest({
        description:
          "the first turn created a pending approval rather than auto-booking",
        state: "pending",
        actionName: ["CALL_EXTERNAL", "CROSS_CHANNEL_SEND"],
      }),
    },
    {
      type: "custom",
      name: "ea-book-after-approval-dispatch",
      predicate: expectConnectorDispatch({
        channel: ["email", "sms"],
        description:
          "post-approval, the booking confirmation reaches the user on email or sms",
      }),
    },
    {
      type: "custom",
      name: "ea-book-after-approval-no-side-effect-on-reject",
      predicate: expectNoSideEffectOnReject({
        description: "if the approval was rejected, no booking dispatch fired",
        actionName: ["CALL_EXTERNAL", "CROSS_CHANNEL_SEND"],
      }),
    },
    judgeRubric({
      name: "ea-book-after-approval-rubric",
      threshold: 0.7,
      description:
        "End-to-end: turn 1 created a pending approval, turn 2 transitioned the approval to approved/executing, the booking confirmation was dispatched on a real channel, and no booking would have happened on rejection.",
    }),
  ],
});

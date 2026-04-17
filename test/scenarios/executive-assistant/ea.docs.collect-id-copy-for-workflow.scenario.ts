import { scenario } from "@elizaos/scenario-schema";
import {
  expectConnectorDispatch,
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.docs.collect-id-copy-for-workflow",
  title: "Collect a missing ID copy or artifact to unblock a workflow",
  domain: "executive-assistant",
  tags: ["executive-assistant", "docs", "identity", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant requests an updated ID copy because the one on file is expired.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Collect ID Copy",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-id-copy",
      room: "main",
      text: "If the only ID on file is expired, ask me for an updated copy so the workflow can continue.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: [
          "PUBLISH_DEVICE_INTENT",
          "CALL_USER",
          "CROSS_CHANNEL_SEND",
          "INBOX",
        ],
        description: "expired ID workflow escalation",
        includesAny: ["id", "expired", "workflow", "copy"],
      }),
      responseIncludesAny: [
        "ID",
        "expired",
        "updated copy",
        "workflow",
        "continue",
      ],
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must explicitly ask the user for an updated ID copy and explain that the workflow is blocked because the on-file ID is expired. A vague acknowledgement that does not solicit the new artifact fails.",
      },
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: [
        "PUBLISH_DEVICE_INTENT",
        "CALL_USER",
        "CROSS_CHANNEL_SEND",
        "INBOX",
      ],
    },
    {
      type: "interventionRequestExists",
      expected: true,
    },
    {
      type: "connectorDispatchOccurred",
      channel: ["desktop", "mobile", "dashboard"],
    },
    {
      type: "custom",
      name: "ea-collect-id-copy-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: [
          "PUBLISH_DEVICE_INTENT",
          "CALL_USER",
          "CROSS_CHANNEL_SEND",
          "INBOX",
        ],
        description: "expired ID workflow escalation",
        includesAny: ["id", "expired", "workflow", "copy"],
      }),
    },
    {
      type: "custom",
      name: "ea-collect-id-copy-intervention-dispatch",
      predicate: expectConnectorDispatch({
        channel: ["desktop", "mobile", "dashboard", "phone_call"],
        description:
          "intervention reaches the user through at least one device or channel",
      }),
    },
    judgeRubric({
      name: "ea-collect-id-copy-rubric",
      threshold: 0.7,
      description:
        "End-to-end: the assistant detected the expired-ID block, escalated for an updated copy, and the request reached the user via an actual notification channel rather than only being logged.",
    }),
  ],
});

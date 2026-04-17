import { scenario } from "@elizaos/scenario-schema";
import {
  expectApprovalRequest,
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.docs.portal-upload-from-chat",
  title: "Upload a deck or asset to a portal from chat instructions",
  domain: "executive-assistant",
  tags: ["executive-assistant", "docs", "browser", "transcript-derived"],
  description:
    "Transcript-derived case: the assistant takes a presentation asset from chat and uploads it to a speaker portal.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Portal Upload From Chat",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "portal-upload-request",
      room: "main",
      text: "When I send over the deck, upload it to the portal for me.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["LIFEOPS_COMPUTER_USE", "PUBLISH_DEVICE_INTENT"],
        description: "portal upload task setup",
        includesAny: ["portal", "upload", "deck"],
      }),
      responseIncludesAny: ["deck", "upload", "portal", "send over", "for me"],
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must commit to uploading the deck to the portal once received, and indicate the assistant will gate the upload behind the user's deck delivery and any explicit approval. It should not invent a fake completion.",
      },
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["LIFEOPS_COMPUTER_USE", "PUBLISH_DEVICE_INTENT"],
    },
    {
      type: "browserTaskCompleted",
      expected: true,
    },
    {
      type: "uploadedAssetExists",
      expected: true,
    },
    {
      type: "approvalRequestExists",
      actionName: ["LIFEOPS_COMPUTER_USE", "PUBLISH_DEVICE_INTENT"],
      expected: true,
    },
    {
      type: "noSideEffectOnReject",
      actionName: ["LIFEOPS_COMPUTER_USE", "PUBLISH_DEVICE_INTENT"],
    },
    {
      type: "custom",
      name: "ea-portal-upload-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["LIFEOPS_COMPUTER_USE", "PUBLISH_DEVICE_INTENT"],
        description: "portal upload task setup",
        includesAny: ["portal", "upload", "deck"],
      }),
    },
    {
      type: "custom",
      name: "ea-portal-upload-approval-side-effect",
      predicate: expectApprovalRequest({
        description:
          "portal upload was queued behind an approval entry rather than executed silently",
        actionName: ["LIFEOPS_COMPUTER_USE", "PUBLISH_DEVICE_INTENT"],
      }),
    },
    judgeRubric({
      name: "ea-portal-upload-rubric",
      threshold: 0.7,
      description:
        "End-to-end: the assistant set up a portal-upload browser task, waited for the deck artifact, and only executed after the user delivered the asset and approved the upload.",
    }),
  ],
});

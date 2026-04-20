import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";
import {
  expectScenarioBrowserTask,
  expectTurnBrowserTask,
} from "../_helpers/browser-task-assertions.ts";

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
    {
      kind: "message",
      name: "portal-upload-asset-arrives",
      room: "main",
      text: "I sent the final deck. Upload it now, and if the speaker portal makes you wait for me to sign in, stop and tell me exactly what is blocking it.",
      assertTurn: expectTurnBrowserTask({
        description: "portal upload blocked on login after asset delivery",
        actionName: "LIFEOPS_COMPUTER_USE",
        approvalRequired: true,
        approvalSatisfied: true,
        needsHuman: true,
        minArtifacts: 1,
        minInterventions: 1,
        blockedReasonIncludes: "portal",
      }),
      responseIncludesAny: ["portal", "sign", "blocking", "deck"],
    },
    {
      kind: "message",
      name: "portal-upload-resume-after-help",
      room: "main",
      text: "I finished the portal sign-in. Resume the upload and send me the receipt link when it is done.",
      assertTurn: expectTurnBrowserTask({
        description: "portal upload resumed and completed with provenance",
        actionName: "LIFEOPS_COMPUTER_USE",
        completed: true,
        needsHuman: false,
        minArtifacts: 1,
        minUploadedAssets: 1,
        minProvenance: 1,
      }),
      responseIncludesAny: ["uploaded", "receipt", "link", "portal"],
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: "LIFEOPS_COMPUTER_USE",
    },
    {
      type: "custom",
      name: "ea-portal-upload-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["LIFEOPS_COMPUTER_USE"],
        description: "portal upload task setup",
        includesAny: ["portal", "upload", "deck"],
      }),
    },
    {
      type: "custom",
      name: "ea-portal-upload-browser-lifecycle",
      predicate: expectScenarioBrowserTask({
        description:
          "portal upload stayed approval-gated, paused for human help when login blocked the browser, then resumed and completed with provenance",
        actionName: "LIFEOPS_COMPUTER_USE",
        completed: true,
        approvalRequired: true,
        approvalSatisfied: true,
        needsHuman: false,
        minArtifacts: 1,
        minUploadedAssets: 1,
        minInterventions: 2,
        minProvenance: 1,
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

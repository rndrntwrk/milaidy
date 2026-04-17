import { scenario } from "@elizaos/scenario-schema";
import {
  expectApprovalRequest,
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "ea.inbox.daily-brief-includes-unsent-drafts",
  title: "Daily brief includes unsent drafts still waiting for approval",
  domain: "executive-assistant",
  tags: ["executive-assistant", "briefing", "drafts", "transcript-derived"],
  description:
    "Transcript-derived case: unsent drafts that still need sign-off appear in the assistant's daily brief.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "EA Daily Brief Includes Unsent Drafts",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "request-daily-brief-with-drafts",
      room: "main",
      text: "In the daily brief, also tell me which drafts still need my sign-off.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["INBOX", "GMAIL_ACTION"],
        description: "daily brief approval queue review",
        includesAny: ["draft", "sign-off", "approval", "brief"],
      }),
      responseIncludesAny: ["draft", "sign-off", "approval", "brief", "unsent"],
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must surface the actual approval-queue contents — at least the count of pending drafts plus a per-draft summary that names the recipient or topic. A vague 'check your drafts' fails.",
      },
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["INBOX", "GMAIL_ACTION"],
    },
    {
      type: "approvalRequestExists",
      expected: true,
      state: "pending",
    },
    {
      type: "draftExists",
      expected: true,
    },
    {
      type: "custom",
      name: "ea-daily-brief-drafts-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["INBOX", "GMAIL_ACTION"],
        description: "daily brief approval queue review",
        includesAny: ["draft", "sign-off", "approval", "brief"],
      }),
    },
    {
      type: "custom",
      name: "ea-daily-brief-drafts-pending-approvals",
      predicate: expectApprovalRequest({
        description:
          "brief reflects pending approval entries from the queue, not stale text",
        state: "pending",
      }),
    },
    judgeRubric({
      name: "ea-daily-brief-drafts-rubric",
      threshold: 0.7,
      description:
        "End-to-end: the brief lists the actual pending drafts in the approval queue with enough context (recipient/topic) for the user to decide whether to send them.",
    }),
  ],
});

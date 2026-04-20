import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "gmail.draft.followup-14-days",
  title: "Identify 14-day-old email without a reply for follow-up",
  domain: "messaging.gmail",
  tags: ["messaging", "gmail", "followup", "parameter-extraction"],
  isolation: "per-scenario",
  requires: {
    credentials: ["gmail:test-owner"],
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Gmail Follow-up Tracker",
    },
  ],
  seed: [
    {
      type: "gmailInbox",
      account: "test-owner",
      fixture: "followup-14-days-ago.eml",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "find followups",
      room: "main",
      text: "Who haven't I followed up with?",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["GMAIL_ACTION", "INBOX", "OWNER_RELATIONSHIP"],
        description: "overdue Gmail follow-up scan",
        includesAny: ["follow", "reply", "overdue", "14"],
      }),
      responseIncludesAny: ["follow", "14", "day"],
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must surface at least one overdue follow-up from email and make clear why it is overdue, such as no reply in roughly two weeks. A generic inbox summary without a follow-up recommendation fails.",
      },
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["GMAIL_ACTION", "INBOX", "OWNER_RELATIONSHIP"],
    },
    {
      type: "selectedActionArguments",
      actionName: ["GMAIL_ACTION", "INBOX", "OWNER_RELATIONSHIP"],
      includesAny: ["follow", "reply", "overdue", "14"],
    },
    {
      type: "custom",
      name: "gmail-followup-tracker-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["GMAIL_ACTION", "INBOX", "OWNER_RELATIONSHIP"],
        description: "overdue Gmail follow-up scan",
        includesAny: ["follow", "reply", "overdue", "14"],
      }),
    },
    judgeRubric({
      name: "gmail-followup-tracker-rubric",
      threshold: 0.7,
      description:
        "End-to-end: the assistant identified the stale email follow-up instead of giving a generic Gmail summary.",
    }),
  ],
  cleanup: [
    {
      type: "gmailDeleteDrafts",
      account: "test-owner",
      tag: "milady-e2e",
    },
  ],
});

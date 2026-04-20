import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
  judgeRubric,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "gmail.draft.reply-from-context",
  title: "Draft Gmail reply using recent email context",
  domain: "messaging.gmail",
  tags: ["messaging", "gmail", "draft", "happy-path"],
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
      title: "Gmail Draft Reply",
    },
  ],
  seed: [
    {
      type: "gmailInbox",
      account: "test-owner",
      fixture: "alice-recent.eml",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "draft reply to alice",
      room: "main",
      text: "Draft a reply to Alice's latest email saying I can review it Friday afternoon, but don't send it yet.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["GMAIL_ACTION", "INBOX"],
        description: "gmail reply draft from recent context",
        includesAny: ["Alice", "draft", "Friday", "review"],
      }),
      responseIncludesAny: ["draft", "Alice", "Friday", "review"],
      responseJudge: {
        minimumScore: 0.7,
        rubric:
          "The reply must present a draft email to Alice that includes the Friday-afternoon availability and must not claim it was already sent.",
      },
    },
  ],
  finalChecks: [
    {
      type: "selectedAction",
      actionName: ["GMAIL_ACTION", "INBOX"],
    },
    {
      type: "selectedActionArguments",
      actionName: ["GMAIL_ACTION", "INBOX"],
      includesAny: ["Alice", "Friday", "review", "draft"],
    },
    {
      type: "custom",
      name: "gmail-draft-reply-from-context-action-coverage",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["GMAIL_ACTION", "INBOX"],
        description: "gmail reply draft from recent context",
        includesAny: ["Alice", "draft", "Friday", "review"],
      }),
    },
    judgeRubric({
      name: "gmail-draft-reply-from-context-rubric",
      threshold: 0.7,
      description:
        "End-to-end: the assistant drafted the Gmail reply from recent context and kept it as a draft instead of claiming it was sent.",
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

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "twitter.dm.schedule-reply",
  title: "Twitter/X DM schedule request stays blocked until scheduling exists",
  domain: "messaging.twitter-dm",
  tags: ["messaging", "twitter", "routing", "not-yet-implemented"],
  description:
    "X can read DMs and send confirmed replies, but it cannot schedule a DM reply for later yet. This scenario must fail closed until a scheduler exists.",
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Twitter DM Schedule Reply",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "schedule reply",
      room: "main",
      text: "Schedule a reply to @devfriend's Twitter DM for 9am tomorrow saying thanks for the intro.",
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "twitter-dm-schedule-routing",
      predicate: async (ctx) => {
        const fallbackActions = ctx.actionsCalled
          .map((entry) => entry.actionName)
          .filter((actionName) =>
            ["REPLY_X_DM", "OWNER_CALENDAR", "OWNER_INBOX"].includes(
              actionName,
            ),
          );
        if (fallbackActions.length > 0) {
          return `unexpected fallback action(s) used for scheduled X DM reply: ${fallbackActions.join(", ")}`;
        }
        return "NotYetImplemented: X DM scheduling is not available yet. REPLY_X_DM can draft or send, but it cannot queue a 9am delivery.";
      },
    },
  ],
});

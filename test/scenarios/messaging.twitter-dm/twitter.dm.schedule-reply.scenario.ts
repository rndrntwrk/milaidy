import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "twitter.dm.schedule-reply",
  title: "Twitter DM schedule request falls back to an email draft",
  domain: "messaging.twitter-dm",
  tags: ["messaging", "twitter", "routing"],
  description:
    "A request to schedule a Twitter/X DM reply currently falls back to drafting an outbound email message instead of scheduling an X DM.",
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
      responseIncludesAny: [/draft/i, /email/i, /confirmed: true/i],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "twitter-dm-schedule-routing",
      predicate: async (ctx) => {
        const action = ctx.actionsCalled.find(
          (entry) => entry.actionName === "OWNER_SEND_MESSAGE",
        );
        const data =
          action?.result?.data && typeof action.result.data === "object"
            ? (action.result.data as {
                draft?: boolean;
                channel?: string;
                target?: string;
              })
            : null;
        if (!data) {
          return "expected OWNER_SEND_MESSAGE draft result";
        }
        if (data.draft !== true) {
          return "expected OWNER_SEND_MESSAGE to stay in draft mode";
        }
        if (data.channel !== "email") {
          return `expected email fallback channel, got ${data.channel ?? "(missing)"}`;
        }
        if (typeof data.target !== "string" || data.target.length === 0) {
          return "expected fallback draft target";
        }
        return undefined;
      },
    },
  ],
});

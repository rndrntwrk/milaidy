import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "telegram.local.mute-chat",
  title: "Telegram mute request falls into website-block state handling",
  domain: "messaging.telegram-local",
  tags: ["messaging", "telegram", "routing"],
  description:
    "A Telegram mute request currently routes into the owner website-block action and reports the existing block state.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Telegram Local Mute",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "mute chat",
      room: "main",
      text: "Mute the 'crypto signals' Telegram group for 24 hours.",
      responseIncludesAny: ["website block", "running"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "telegram-mute-routing",
      predicate: async (ctx) => {
        const action = ctx.actionsCalled.find(
          (entry) => entry.actionName === "OWNER_WEBSITE_BLOCK",
        );
        const data =
          action?.result?.data && typeof action.result.data === "object"
            ? (action.result.data as {
                active?: boolean;
                endsAt?: string;
                websites?: string[];
              })
            : null;
        if (!data) {
          return "expected OWNER_WEBSITE_BLOCK result";
        }
        if (data.active !== true) {
          return "expected website-block action to report an active block";
        }
        if (!Array.isArray(data.websites) || data.websites.length === 0) {
          return "expected active website list in website-block result";
        }
        return undefined;
      },
    },
  ],
});

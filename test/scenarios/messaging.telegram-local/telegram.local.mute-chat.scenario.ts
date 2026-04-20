import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "telegram.local.mute-chat",
  title: "Telegram mute request stays blocked until Telegram mute exists",
  domain: "messaging.telegram-local",
  tags: ["messaging", "telegram", "routing", "not-yet-implemented"],
  description:
    "Telegram local mute has no real runtime control yet. Do not route it through website blocking or generic room mute fallbacks.",
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
      title: "Telegram Local Mute",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "mute chat",
      room: "main",
      text: "Mute the 'crypto signals' Telegram group for 24 hours.",
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "telegram-mute-routing",
      predicate: async (ctx) => {
        const fallbackActions = ctx.actionsCalled
          .map((entry) => entry.actionName)
          .filter((actionName) =>
            ["OWNER_WEBSITE_BLOCK", "MUTE_ROOM", "OWNER_INBOX"].includes(
              actionName,
            ),
          );
        if (fallbackActions.length > 0) {
          return `unexpected fallback action(s) used for Telegram mute: ${fallbackActions.join(", ")}`;
        }
        return "NotYetImplemented: Telegram local mute has no real connector/runtime control yet. Keep this blocked until a Telegram mute action exists.";
      },
    },
  ],
});

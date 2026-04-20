import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "discord.local.mute-channel",
  title: "Discord mute request routes through room mute handling",
  domain: "messaging.discord-local",
  tags: ["messaging", "discord", "routing"],
  description:
    "A Discord channel mute request currently routes through the room mute action and may retry with several malformed room identifiers before landing on the active room.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Discord Local Mute",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "mute gm channel",
      room: "main",
      text: "Mute the #gm channel",
      responseIncludesAny: ["Muted"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "discord-local-mute-routing",
      predicate: async (ctx) => {
        const muteActions = ctx.actionsCalled.filter(
          (entry) => entry.actionName === "MUTE_ROOM",
        );
        if (muteActions.length === 0) {
          return "expected MUTE_ROOM to be called";
        }
        const anyMuted = muteActions.some((entry) => {
          const data =
            entry.result?.data && typeof entry.result.data === "object"
              ? (entry.result.data as { muted?: boolean })
              : null;
          return data?.muted === true;
        });
        if (!anyMuted) {
          return "expected at least one MUTE_ROOM result with muted=true";
        }
        return undefined;
      },
    },
  ],
});

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross-platform.group-chat-gateway",
  title: "Group chat request stays blocked without a gateway route",
  domain: "messaging.cross-platform",
  tags: ["cross-platform", "gateway", "routing", "not-yet-implemented"],
  description:
    "A request to create a Discord group chat still has no gateway-backed route. This scenario must fail closed until the intent bus exists.",
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
      title: "Cross-Platform Group Chat Gateway",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "create group chat",
      room: "main",
      text: "Create a group chat with the agent and Alice on Discord.",
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "cross-platform-group-chat-routing",
      predicate: async (ctx) => {
        const fallbackActions = ctx.actionsCalled
          .map((entry) => entry.actionName)
          .filter((actionName) =>
            ["OWNER_CALENDAR", "OWNER_INBOX", "INBOX"].includes(actionName),
          );
        if (fallbackActions.length > 0) {
          return `unexpected fallback action(s) used for group chat creation: ${fallbackActions.join(", ")}`;
        }
        return "NotYetImplemented: group chat creation still has no gateway-backed route. Keep this blocked until a real intent-bus action exists.";
      },
    },
  ],
});

import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross-platform.group-chat-gateway",
  title: "Group chat request routes into calendar scheduling",
  domain: "messaging.cross-platform",
  tags: ["cross-platform", "gateway", "routing"],
  description:
    "A request to create a Discord group chat currently routes into calendar scheduling and asks for a time instead of opening a gateway-backed group thread.",
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
      responseIncludesAny: ["time", "tomorrow", "date"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "cross-platform-group-chat-routing",
      predicate: async (ctx) => {
        const action = ctx.actionsCalled.find(
          (entry) => entry.actionName === "OWNER_CALENDAR",
        );
        const parameters =
          action?.parameters && typeof action.parameters === "object"
            ? (action.parameters as {
                parameters?: { subaction?: string; intent?: string };
              })
            : null;
        if (!parameters) {
          return "expected OWNER_CALENDAR parameters";
        }
        if (parameters.parameters?.subaction !== "create_event") {
          return `expected create_event routing, got ${parameters.parameters?.subaction ?? "(missing)"}`;
        }
        if (
          typeof parameters.parameters?.title !== "string" ||
          !parameters.parameters.title.includes("Alice")
        ) {
          return `expected calendar title to mention Alice, got ${parameters.parameters?.title ?? "(missing)"}`;
        }
        return undefined;
      },
    },
  ],
});

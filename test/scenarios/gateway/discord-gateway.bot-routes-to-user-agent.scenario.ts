import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "discord-gateway.bot-routes-to-user-agent",
  title: "Discord gateway bot reaches the active assistant",
  domain: "gateway",
  tags: ["gateway", "discord", "smoke"],
  description:
    "A Discord gateway DM currently reaches the assistant and produces a non-empty response, even though the downstream planner path is still noisy.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "discord",
      channelType: "DM",
      title: "Discord Gateway Bot Routes To User Agent",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "discord-inbound",
      room: "main",
      text: "Hey agent, this DM came through the Discord gateway bot.",
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "discord-gateway-produces-a-response",
      predicate: async (ctx) => {
        const reply = (ctx.turns?.[0]?.responseText ?? "").trim();
        return reply.length > 0
          ? undefined
          : "expected a non-empty Discord gateway response";
      },
    },
    {
      type: "custom",
      name: "discord-gateway-triggers-at-least-one-action",
      predicate: async (ctx) =>
        (ctx.actionsCalled?.length ?? 0) > 0
          ? undefined
          : "expected at least one action for Discord gateway routing",
    },
  ],
});

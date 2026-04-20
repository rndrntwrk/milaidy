import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "telegram-gateway.bot-routes-to-user-agent",
  title: "Telegram gateway bot reaches the active assistant",
  domain: "gateway",
  tags: ["gateway", "telegram", "smoke"],
  description:
    "A Telegram gateway DM currently reaches the assistant and produces a non-empty response, even though the planner path is still noisy.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      channelType: "DM",
      title: "Telegram Gateway Bot Routes To User Agent",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "telegram-inbound",
      room: "main",
      text: "Hey agent, this DM came through the Telegram gateway bot.",
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "telegram-gateway-produces-a-response",
      predicate: async (ctx) => {
        const reply = (ctx.turns?.[0]?.responseText ?? "").trim();
        return reply.length > 0
          ? undefined
          : "expected a non-empty Telegram gateway response";
      },
    },
    {
      type: "custom",
      name: "telegram-gateway-triggers-at-least-one-action",
      predicate: async (ctx) =>
        (ctx.actionsCalled?.length ?? 0) > 0
          ? undefined
          : "expected at least one action for Telegram gateway routing",
    },
  ],
});

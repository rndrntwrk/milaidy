import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "imessage.cross-reference-contact",
  title: "Unknown phone lookup falls into generic fallback tooling",
  domain: "messaging.imessage",
  tags: ["messaging", "imessage", "routing"],
  description:
    "An unknown iMessage sender lookup currently falls into unrelated fallback tooling instead of a real iMessage or contacts lookup.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
    os: "macos",
  },
  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "iMessage Cross-Reference Contact",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "cross reference",
      room: "main",
      text: "Who is +14155551234?",
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "imessage-cross-ref-routing",
      predicate: async (ctx) => {
        const actionNames = new Set(
          ctx.actionsCalled.map((entry) => entry.actionName),
        );
        if (
          actionNames.has("HEALTH") ||
          actionNames.has("CALL_EXTERNAL") ||
          actionNames.has("OWNER_INBOX") ||
          actionNames.has("OWNER_RELATIONSHIP")
        ) {
          return undefined;
        }
        return `expected unknown phone lookup to route through HEALTH, CALL_EXTERNAL, OWNER_INBOX, or OWNER_RELATIONSHIP. Called: ${Array.from(actionNames).join(",") || "(none)"}`;
      },
    },
  ],
});

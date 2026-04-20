import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross-platform.escalation-to-user",
  title: "Unresolvable request stays blocked without an intent bus",
  domain: "messaging.cross-platform",
  tags: ["cross-platform", "gateway", "negotiation", "not-yet-implemented"],
  description:
    "A lease-renewal escalation request has no real cross-platform intent-bus route yet. This scenario must fail closed until a dedicated gateway action exists.",
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
      title: "Cross-Platform Escalation",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "unresolvable request",
      room: "main",
      text: "Negotiate my apartment lease renewal with the landlord and sign it for me.",
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "cross-platform-escalation-routing",
      predicate: async (ctx) => {
        const fallbackActions = ctx.actionsCalled
          .map((entry) => entry.actionName)
          .filter((actionName) =>
            ["OWNER_CALENDAR", "OWNER_INBOX", "INBOX", "MUTE_ROOM"].includes(
              actionName,
            ),
          );
        if (fallbackActions.length > 0) {
          return `unexpected fallback action(s) used for cross-platform escalation: ${fallbackActions.join(", ")}`;
        }
        return "NotYetImplemented: cross-platform escalation still has no real intent-bus route. Keep this blocked until a dedicated gateway action exists.";
      },
    },
  ],
});

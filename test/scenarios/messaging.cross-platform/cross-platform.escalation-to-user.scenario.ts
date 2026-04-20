import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "cross-platform.escalation-to-user",
  title: "Unresolvable request starts a negotiation flow",
  domain: "messaging.cross-platform",
  tags: ["cross-platform", "gateway", "negotiation"],
  description:
    "A request the agent cannot execute directly currently starts a negotiation flow and asks for more details instead of escalating through a gateway.",
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
      responseIncludesAny: ["Negotiation", "lease renewal"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "cross-platform-escalation-routing",
      predicate: async (ctx) => {
        const calendarAction = ctx.actionsCalled.find(
          (entry) => entry.actionName === "OWNER_CALENDAR",
        );
        const calendarData =
          calendarAction?.result?.data &&
          typeof calendarAction.result.data === "object"
            ? (calendarAction.result.data as {
                negotiation?: { subject?: string; state?: string };
              })
            : null;
        if (!calendarData?.negotiation) {
          return "expected OWNER_CALENDAR negotiation result";
        }
        if (calendarData.negotiation.state !== "initiated") {
          return `expected initiated negotiation state, got ${calendarData.negotiation.state ?? "(missing)"}`;
        }
        if (
          typeof calendarData.negotiation.subject !== "string" ||
          !calendarData.negotiation.subject.includes("lease renewal")
        ) {
          return `expected negotiation subject to mention lease renewal, got ${calendarData.negotiation.subject ?? "(missing)"}`;
        }
        return undefined;
      },
    },
  ],
});

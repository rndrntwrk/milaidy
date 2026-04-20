import { scenario } from "@elizaos/scenario-schema";
import {
  expectScenarioToCallAction,
  expectTurnToCallAction,
} from "../_helpers/action-assertions.ts";

export default scenario({
  id: "whatsapp-gateway.bot-routes-to-user-agent",
  title: "WhatsApp gateway bot replies in the user room",
  domain: "gateway",
  tags: ["gateway", "whatsapp", "smoke"],
  description:
    "A WhatsApp gateway DM currently produces a direct reply in the WhatsApp room that acknowledges the gateway bot.",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "whatsapp",
      channelType: "DM",
      title: "WhatsApp Gateway Bot Routes To User Agent",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "whatsapp-inbound",
      room: "main",
      text: "Please confirm you received this WhatsApp gateway bot DM.",
      assertTurn: expectTurnToCallAction({
        acceptedActions: ["REPLY", "OWNER_INBOX"],
        description: "WhatsApp gateway acknowledgement path",
      }),
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "whatsapp-gateway-hits-supported-path",
      predicate: expectScenarioToCallAction({
        acceptedActions: ["REPLY", "OWNER_INBOX"],
        description: "WhatsApp gateway acknowledgement path",
      }),
    },
    {
      type: "custom",
      name: "whatsapp-gateway-result-is-an-ack-or-inbox-noop",
      predicate: async (ctx) => {
        const replyAction = ctx.actionsCalled.find(
          (action) => action.actionName === "REPLY",
        );
        if (replyAction) {
          const reply = (ctx.turns?.[0]?.responseText ?? "").trim();
          return reply.length > 0
            ? undefined
            : "expected a non-empty WhatsApp reply";
        }

        const inboxAction = ctx.actionsCalled.find(
          (action) => action.actionName === "OWNER_INBOX",
        );
        if (!inboxAction) {
          return "expected either REPLY or OWNER_INBOX";
        }
        return undefined;
      },
    },
  ],
});

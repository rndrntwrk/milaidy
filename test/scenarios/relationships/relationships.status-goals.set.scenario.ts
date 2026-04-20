import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "relationships.status-goals.set",
  title: "Relationship goal request routes into generic relationship handling",
  domain: "relationships",
  tags: ["lifeops", "relationships", "routing"],
  description:
    "A relationship-goal request currently routes into the generic OWNER_RELATIONSHIP flow instead of a dedicated goal-setting action.",

  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },

  rooms: [
    {
      id: "main",
      source: "dashboard",
      channelType: "DM",
      title: "Relationships: set goal",
    },
  ],

  seed: [
    {
      type: "contact",
      name: "Alice Chen",
      handles: [{ platform: "gmail", identifier: "alice@acme.example.com" }],
      notes: "Acme Inc",
    },
  ],

  turns: [
    {
      kind: "message",
      name: "set-relationship-goal",
      room: "main",
      text: "Add to Alice's notes: 'stay in touch quarterly'.",
    },
  ],

  finalChecks: [
    {
      type: "custom",
      name: "relationship-goal-set-routing",
      predicate: async (ctx) => {
        const action = ctx.actionsCalled.find(
          (entry) => entry.actionName === "OWNER_RELATIONSHIP",
        );
        const data =
          action?.parameters && typeof action.parameters === "object"
            ? (action.parameters as {
                parameters?: { subaction?: string; name?: string; notes?: string };
              })
            : null;
        if (!data) {
          return "expected OWNER_RELATIONSHIP parameters";
        }
        const subaction = data.parameters?.subaction;
        if (
          subaction !== "update_contact" &&
          subaction !== "log_interaction" &&
          subaction !== "add_contact"
        ) {
          return `expected relationship-goal request to route through update_contact, log_interaction, or add_contact. Got ${subaction ?? "(missing)"}`;
        }
        return undefined;
      },
    },
  ],
});

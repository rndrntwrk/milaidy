import { scenario } from "@elizaos/scenario-schema";

export default scenario({
  id: "goal.experience-loop.learn-from-completion",
  title: "Experience-loop retrieval remains pending",
  domain: "goals",
  tags: ["lifeops", "goals", "experience-loop", "smoke"],
  description:
    "Pending until the runtime has typed retrieval for prior completed goals and a real experience-loop suggestion path.",
  status: "pending",
  isolation: "per-scenario",
  requires: {
    plugins: ["@elizaos/plugin-agent-skills"],
  },
  rooms: [
    {
      id: "main",
      source: "telegram",
      title: "LifeOps Experience Loop",
    },
  ],
  turns: [
    {
      kind: "message",
      name: "new-similar-goal",
      text: "I want a new goal to lose another 5 lbs this quarter.",
      responseIncludesAny: ["NotYetImplemented", "experience-loop"],
      expectedActions: ["LIFE"],
    },
  ],
  finalChecks: [
    {
      type: "custom",
      name: "experience-loop-retrieval-is-still-unimplemented",
      predicate: async () =>
        "NotYetImplemented: waiting on typed retrieval over prior completions and a real experience-loop suggestion cadence.",
    },
  ],
});

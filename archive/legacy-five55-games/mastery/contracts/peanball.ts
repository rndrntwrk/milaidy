import { createMasteryContract } from "./_shared.js";

export const peanballMasteryContract = createMasteryContract({
  gameId: "peanball",
  aliases: [],
  title: "Peanball",
  objective: {
    summary: "Elemental pinball with rings, monsters, and life management.",
    winCondition: "Clear rings while using counter-element strategy.",
    masteryDefinition: "High ring clear rate with low life loss and low wrong-element hunts.",
  },
  controls: [
    { action: "Launch/boost", input: "Space / click" },
    { action: "Flipper control", input: "Arrow key clusters" },
  ],
  progression: [
    {
      id: "table_cycle",
      label: "Elemental Table Cycle",
      description: "Single table with four element quadrants and dynamic monster targets.",
      successSignal: "Ring clear and score progression.",
      failureSignals: ["life_drain", "wrong_element_chase"],
    },
  ],
  risks: [
    {
      id: "element-mismatch",
      label: "Element Mismatch",
      symptom: "Pursuit chooses non-counter element targets.",
      mitigation: "Bind targeting policy to counter-element map before attacks.",
    },
  ],
  passGates: [
    {
      id: "ring-clear-rate",
      metric: "rings.clearRate",
      operator: ">=",
      threshold: 0.8,
      description: "Ring-clear rate >=80%.",
    },
    {
      id: "life-loss",
      metric: "lives.lossPerRun",
      operator: "<=",
      threshold: 1.5,
      description: "Life loss per run <=1.5.",
    },
    {
      id: "wrong-element-hunts",
      metric: "hunts.wrongElementRate",
      operator: "<=",
      threshold: 0.15,
      description: "Wrong-element hunts <15%.",
    },
  ],
  recovery: {
    menu: "Launch table and verify ball physics tick.",
    paused: "Resume then relock flipper control.",
    gameOver: "Restart table sequence.",
    stuck: "Nudge launch and reinitialize targeting cycle.",
  },
  policy: { family: "control_stability" },
});

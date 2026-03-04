import { createMasteryContract } from "./_shared.js";

export const wolfAndSheepMasteryContract = createMasteryContract({
  gameId: "wolf-and-sheep",
  aliases: ["wolf_and_sheep", "wolfandsheep"],
  title: "Wolf and Sheep",
  objective: {
    summary: "Grid pursuit/push puzzle with movable wall chains and wolf chase.",
    winCondition: "Maximize survival moves while preserving valid push decisions.",
    masteryDefinition: "Sustain move count at 2x baseline with low capture probability.",
  },
  controls: [
    { action: "Move/Push", input: "Arrow keys / WASD" },
  ],
  progression: [
    {
      id: "grid_loop",
      label: "Grid Loop",
      description: "Navigate 25x25 grid and use wall pushes to control pursuit topology.",
      successSignal: "Survival move counter increases with legal moves.",
      failureSignals: ["wolf_capture", "invalid_push_loop"],
    },
  ],
  risks: [
    {
      id: "push-overcommit",
      label: "Push Overcommit",
      symptom: "Greedy pushes open direct pursuit lane to sheep.",
      mitigation: "Run two-step lookahead on wall push consequences.",
    },
  ],
  passGates: [
    {
      id: "survival-moves",
      metric: "survival.movesRelativeToBaseline",
      operator: ">=",
      threshold: 2,
      description: "Survival moves >= baseline*2.",
    },
    {
      id: "capture-rate",
      metric: "captures.rate",
      operator: "<=",
      threshold: 0.25,
      description: "Capture rate <=25%.",
    },
    {
      id: "valid-move-precision",
      metric: "moves.validPrecision",
      operator: ">=",
      threshold: 0.99,
      description: "Valid move precision >=99%.",
    },
  ],
  recovery: {
    menu: "Start from menu and assert grid entity presence.",
    paused: "Unpause through mapped toggle.",
    gameOver: "Restart loop and reset pursuit state.",
    stuck: "Inject alternate legal move to break deadlock; restart if blocked.",
  },
  policy: { family: "pursuit_escape" },
});

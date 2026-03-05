import { createMasteryContract } from "./_shared.js";

export const leftAndRightMasteryContract = createMasteryContract({
  gameId: "leftandright",
  aliases: ["left-and-right"],
  title: "Left and Right",
  objective: {
    summary: "Dual-car lane switch reflex game with obstacle/collectible flow.",
    winCondition: "Collect safely while minimizing unsafe lane swaps.",
    masteryDefinition: "Score uplift +50% with <2% unsafe swap decisions.",
  },
  controls: [
    { action: "Lane group toggle", input: "Left / Right" },
    { action: "Restart", input: "Space" },
  ],
  progression: [
    {
      id: "stream",
      label: "Four-Lane Stream",
      description: "Continuous A/B/C/D spawn timing with synchronized car control.",
      successSignal: "Score climbs with low collision cadence.",
      failureSignals: ["unsafe_swap", "collision_gameover"],
    },
  ],
  risks: [
    {
      id: "swap-latency",
      label: "Swap Latency",
      symptom: "Late lane toggles cause unavoidable collisions.",
      mitigation: "Increase anticipation horizon and lower risky collectible bias.",
    },
  ],
  passGates: [
    {
      id: "score-gain",
      metric: "score.relativeToBaseline",
      operator: ">=",
      threshold: 1.5,
      description: "p50 score >= baseline +50%.",
    },
    {
      id: "unsafe-swap-rate",
      metric: "swap.unsafeRate",
      operator: "<=",
      threshold: 0.02,
      description: "Unsafe swaps below 2% of decisions.",
    },
  ],
  recovery: {
    menu: "Start loop and verify lane ticker updates.",
    paused: "Resume with mapped key when available.",
    gameOver: "Space restart and resync lane cadence.",
    stuck: "Issue rapid double-toggle to recover control sync.",
  },
  policy: {
    family: "reflex_timing",
    defaults: {
      collectibleBias: 0.78,
      hazardAvoidanceBias: 0.82,
      recenterBias: 0.62,
      riskTolerance: 0.34,
    },
  },
});

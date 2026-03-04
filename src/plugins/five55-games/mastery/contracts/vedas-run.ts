import { createMasteryContract } from "./_shared.js";

export const vedasRunMasteryContract = createMasteryContract({
  gameId: "vedas-run",
  aliases: ["vedasrun", "vedas_run"],
  title: "Vedas Run",
  objective: {
    summary: "3D runner/platform route with segmented map and multi-ending logic.",
    winCondition: "Reach successful ending while minimizing falls/turret deaths.",
    masteryDefinition: "Ending success >=80% with controlled hazard death shares.",
  },
  controls: [
    { action: "Move", input: "Arrow keys" },
    { action: "Jump", input: "Space" },
    { action: "Restart", input: "1" },
  ],
  progression: [
    {
      id: "segment_chain",
      label: "Segment Chain",
      description: "~14 segment progression over 10x10 tile chunks with branch endings.",
      successSignal: "Valid ending path completed.",
      failureSignals: ["fall_death", "turret_hit", "wrong_ending_path"],
    },
  ],
  risks: [
    {
      id: "jump-timing",
      label: "Jump Timing Drift",
      symptom: "Late jump windows produce repeated fall deaths.",
      mitigation: "Advance jump trigger by projected tile edge velocity.",
    },
  ],
  passGates: [
    {
      id: "ending-success",
      metric: "ending.successRate",
      operator: ">=",
      threshold: 0.8,
      description: "Successful ending >=80%.",
    },
    {
      id: "fall-deaths",
      metric: "deaths.fallRate",
      operator: "<=",
      threshold: 0.15,
      description: "Fall deaths <15%.",
    },
    {
      id: "turret-deaths",
      metric: "deaths.turretRate",
      operator: "<=",
      threshold: 0.2,
      description: "Turret-hit deaths <20%.",
    },
  ],
  recovery: {
    menu: "Click start or key 1 fallback.",
    paused: "Resume through pause toggle.",
    gameOver: "Immediate key 1 restart.",
    stuck: "Reset held keys and restart if segment index stalls.",
  },
  policy: { family: "runner_obstacle_timing" },
});

import { createMasteryContract } from "./_shared.js";

export const ninjaMasteryContract = createMasteryContract({
  gameId: "ninja",
  aliases: ["ninja-evilcorp", "ninja_vs_evilcorp", "ninja-vs-evilcorp"],
  title: "Ninja",
  objective: {
    summary: "Stealth platformer with fixed level maps and guard/camera constraints.",
    winCondition: "Reach each level exit with minimal detections.",
    masteryDefinition: "High completion with deterministic route + retry recovery.",
  },
  controls: [
    { action: "Move", input: "Arrow keys / WASD" },
    { action: "Jump", input: "Space" },
    { action: "Retry", input: "R" },
  ],
  progression: [
    {
      id: "menu",
      label: "Menu",
      description: "Difficulty/menu stage.",
      successSignal: "PLAYING state and level spawn resolved.",
      failureSignals: ["start_stall"],
    },
    {
      id: "level_matrix",
      label: "Level Matrix",
      description: "Move through fixed level graphs with patrol awareness.",
      successSignal: "Exit tile reached.",
      failureSignals: ["camera_detection", "guard_contact", "fall_loop"],
    },
  ],
  risks: [
    {
      id: "patrol-desync",
      label: "Patrol Desync",
      symptom: "Route timing collides with guard patrol windows.",
      mitigation: "Introduce wait frames at deterministic danger junctions.",
    },
  ],
  passGates: [
    {
      id: "level-completion",
      metric: "levels.completionRate",
      operator: ">=",
      threshold: 0.8,
      description: "Complete levels at least 80% of episodes.",
    },
    {
      id: "detection-mean",
      metric: "detections.meanPerLevel",
      operator: "<=",
      threshold: 1.2,
      description: "Mean detections <=1.2 per level.",
    },
    {
      id: "retry-recovery",
      metric: "retry.recoverySec",
      operator: "<=",
      threshold: 1,
      description: "Retry lifecycle recovers in one second or less.",
    },
  ],
  recovery: {
    menu: "Enter START path and verify level entity spawn.",
    paused: "Resume with mapped pause key.",
    gameOver: "R retry pulse until state returns PLAYING.",
    stuck: "Fallback to local retry when progress delta is flat.",
  },
  policy: {
    family: "platform_route",
    defaults: {
      reactionWindowMs: 165,
      riskTolerance: 0.42,
      recoveryBias: 0.68,
      hazardAvoidanceBias: 0.8,
    },
  },
});

import { createMasteryContract } from "./_shared.js";

export const drive555MasteryContract = createMasteryContract({
  gameId: "555drive",
  aliases: ["dr1v3n-wild", "dr1v3n-wild-main"],
  title: "555drive",
  objective: {
    summary: "Checkpoint racing survival with collision pressure and momentum decay.",
    winCondition: "Reach deeper checkpoint tiers while minimizing collisions.",
    masteryDefinition: "Late checkpoint reach >=75% with high momentum retention.",
  },
  controls: [
    { action: "Steer", input: "Left/Right arrows" },
    { action: "Accelerate", input: "Up / mapped accelerate" },
    { action: "Brake", input: "Down / mapped brake" },
  ],
  progression: [
    {
      id: "checkpoint_tiers",
      label: "Checkpoint Tiers",
      description: "Theme progression from beach/mid to mountain/endgame.",
      successSignal: "Late tier checkpoint reached.",
      failureSignals: ["collision_gameover", "timer_expiry"],
    },
  ],
  risks: [
    {
      id: "line-instability",
      label: "Line Instability",
      symptom: "Over-steer oscillation causes repeated wall/traffic contact.",
      mitigation: "Increase recenter bias and reduce aggressive lane cuts.",
    },
  ],
  passGates: [
    {
      id: "late-checkpoint-rate",
      metric: "checkpoint.lateTierRate",
      operator: ">=",
      threshold: 0.75,
      description: "Reach late checkpoint tier in >=75% runs.",
    },
    {
      id: "collision-rate",
      metric: "collisions.perMinute",
      operator: "<=",
      threshold: 0.3,
      description: "Collision gameovers stay below 0.3 per minute.",
    },
    {
      id: "score-relative",
      metric: "score.relativeToBaseline",
      operator: ">=",
      threshold: 1.3,
      description: "Score >= baseline +30%.",
    },
  ],
  recovery: {
    menu: "Enter run and verify vehicle movement.",
    paused: "Resume with mapped pause action.",
    gameOver: "Immediate restart and checkpoint timer reset validation.",
    stuck: "Hard restart if distance delta is flat for 4s.",
  },
  policy: {
    family: "racing_line",
    defaults: {
      reactionWindowMs: 190,
      riskTolerance: 0.4,
      recenterBias: 0.8,
      hazardAvoidanceBias: 0.84,
    },
  },
});

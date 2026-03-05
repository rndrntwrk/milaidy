import { createMasteryContract } from "./_shared.js";

export const fighterPlanesMasteryContract = createMasteryContract({
  gameId: "fighter-planes",
  aliases: ["fighter_planes", "fighterplanes"],
  title: "Fighter Planes",
  objective: {
    summary: "Mouse-aim survival shooter against rockets/warplanes.",
    winCondition: "Maximize survival and target destruction efficiency.",
    masteryDefinition: "180s p50 survival with high rocket destruction throughput.",
  },
  controls: [
    { action: "Aim", input: "Mouse" },
    { action: "Shoot", input: "Click" },
    { action: "Start/Restart", input: "Menu click" },
  ],
  progression: [
    {
      id: "arena_loop",
      label: "Arena Loop",
      description: "Continuous waves with projectile pressure.",
      successSignal: "Survival clock and kill counters rise steadily.",
      failureSignals: ["avoidable_hit", "menu_stall"],
    },
  ],
  risks: [
    {
      id: "tracking-lag",
      label: "Tracking Lag",
      symptom: "Aim handoff between targets leaves rockets unhandled.",
      mitigation: "Prioritize rocket interception by time-to-impact.",
    },
  ],
  passGates: [
    {
      id: "survival-p50",
      metric: "survival.p50Sec",
      operator: ">=",
      threshold: 180,
      description: "p50 survival >=180s.",
    },
    {
      id: "rocket-destruction",
      metric: "rockets.destroyedPerMinute",
      operator: ">=",
      threshold: 1.3,
      description: "Rockets destroyed/min >= baseline +30%.",
    },
    {
      id: "avoidable-death-rate",
      metric: "deaths.avoidableRate",
      operator: "<=",
      threshold: 0.2,
      description: "Avoidable deaths <20%.",
    },
  ],
  recovery: {
    menu: "Click start and verify enemy spawn activity.",
    paused: "Resume from pause overlay if shown.",
    gameOver: "Menu click restart after brief cooldown.",
    stuck: "Recenter aim and issue start pulse if no projectiles spawn.",
  },
  policy: {
    family: "target_evasion",
    defaults: {
      enemyEngageRiskMax: 0.3,
      hazardAvoidanceBias: 0.84,
      recenterBias: 0.58,
      riskTolerance: 0.32,
    },
  },
});

import { createMasteryContract } from "./_shared.js";

export const knighthoodMasteryContract = createMasteryContract({
  gameId: "knighthood",
  aliases: ["knighthood_main", "knighthood-main"],
  title: "Knighthood",
  objective: {
    summary: "Side-scrolling survival/combat run with hazard-heavy death patterns.",
    winCondition: "Sustain long runs while keeping avoidable hazard deaths low.",
    masteryDefinition: "Consistent 90s+ survival with controlled fuel and hazard-first priorities.",
  },
  controls: [
    { action: "Move left", input: "A / Left Arrow" },
    { action: "Move right", input: "D / Right Arrow" },
    { action: "Jump", input: "W / Up Arrow" },
    { action: "Attack", input: "Space" },
    { action: "Pause/Resume", input: "Enter" },
  ],
  progression: [
    {
      id: "menu",
      label: "Title/Menu",
      description: "Entry state before run starts.",
      successSignal: "PLAYING state reached.",
      failureSignals: ["menu_stall", "audio_prompt_block"],
    },
    {
      id: "survival_loop",
      label: "Survival Loop",
      description: "Continuous hazards with mixed combat and movement risk.",
      successSignal: "score and survival time increase continuously.",
      failureSignals: ["spike_death", "gap_death", "water_fall"],
    },
    {
      id: "restart",
      label: "Restart",
      description: "Recover rapidly after death.",
      successSignal: "new PLAYING state within one second.",
      failureSignals: ["restart_stall", "menu_lock"],
    },
  ],
  risks: [
    {
      id: "hazard-overcommit",
      label: "Hazard Overcommit",
      symptom: "Agent attacks/collects during spike/gap approach windows.",
      mitigation: "Raise hazard bias and attack suppression near spikes/gaps.",
    },
    {
      id: "fuel-mismanagement",
      label: "Fuel Mismanagement",
      symptom: "Over-flying causes emergency landings in unsafe zones.",
      mitigation: "Keep minimum reserves and cooldown between flight bursts.",
    },
  ],
  passGates: [
    {
      id: "survival-p50",
      metric: "survival.p50Sec",
      operator: ">=",
      threshold: 90,
      description: "Median survival time at or above 90 seconds.",
    },
    {
      id: "hazard-share",
      metric: "deathShare.spikeGap",
      operator: "<=",
      threshold: 0.2,
      description: "Spike+gap deaths contribute <=20% of total deaths.",
    },
    {
      id: "restart-reliability",
      metric: "restart.successRate",
      operator: ">=",
      threshold: 0.99,
      description: "Start/restart transitions succeed at least 99% of attempts.",
    },
  ],
  recovery: {
    menu: "Pulse Enter then Space if needed; verify PLAYING within 2s.",
    paused: "Pulse Enter until PLAYING is restored.",
    gameOver: "Immediate Enter/Space restart; fail episode on >1s stall.",
    stuck: "Hold move-right + jump pulse, then hard restart if score is flat for 5s.",
  },
  policy: {
    family: "runner_survival",
    defaults: {
      minFuelReserve: 0.24,
      gemFuelReserve: 0.72,
      boostFuelReserve: 0.46,
      maxContinuousFlyFrames: 18,
      flightCooldownFrames: 8,
      spikePrepBonus: 0,
      gapPrepBonus: 0,
      recenterBias: 0.72,
      collectibleBias: 0.76,
      enemyEngageRiskMax: 0.33,
      spikeNoAttackBuffer: 18,
      hazardAvoidanceBias: 0.82,
    },
  },
  notes: [
    "Prefer deterministic hazard timing over opportunistic combat.",
  ],
});

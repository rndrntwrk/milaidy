import { createMasteryContract } from "./_shared.js";

export const sector13MasteryContract = createMasteryContract({
  gameId: "sector-13",
  aliases: ["sector13", "sector_13", "sector-13-main"],
  title: "Sector 13",
  objective: {
    summary: "Arcade shooter progression through sector waves.",
    winCondition: "Advance through sectors while preserving lives and uptime.",
    masteryDefinition: "Reach sector 13 reliably with strong score growth and no menu stalls.",
  },
  controls: [
    { action: "Move/Aim", input: "Pointer movement" },
    { action: "Fire/Engage", input: "Click / hold click" },
    { action: "Start/Restart", input: "Menu interaction / action start" },
  ],
  progression: [
    {
      id: "boot",
      label: "Boot/Menu",
      description: "Game initialization and ship engagement.",
      successSignal: "shipEngaged true and PLAYING state.",
      failureSignals: ["menu_stall", "ship_not_engaged"],
    },
    {
      id: "sectors_1_13",
      label: "Sector Sequence",
      description: "Scripted wave progression from sector 1 to 13.",
      successSignal: "currentSectorNumber reaches 13.",
      failureSignals: ["life_loss_burst", "sector_stall"],
    },
  ],
  risks: [
    {
      id: "under-evasion",
      label: "Under-evasion",
      symptom: "Agent overcommits to targets while absorbing avoidable hits.",
      mitigation: "Increase recovery bias and lower engage risk during dense waves.",
    },
  ],
  passGates: [
    {
      id: "sector13-reach-rate",
      metric: "sector13.reachRate",
      operator: ">=",
      threshold: 0.7,
      description: "Reach sector 13 in at least 70% of eval runs.",
    },
    {
      id: "score-improvement",
      metric: "score.relativeToBaseline",
      operator: ">=",
      threshold: 1.35,
      description: "Score is at least baseline +35%.",
    },
    {
      id: "menu-stall",
      metric: "menu.maxStallSec",
      operator: "<=",
      threshold: 2,
      description: "No menu stall longer than two seconds.",
    },
  ],
  recovery: {
    menu: "Force ship engagement and fallback START pulse.",
    paused: "Unpause with menu-confirm click or mapped key.",
    gameOver: "Issue restart after short cooldown, validate sector reset.",
    stuck: "Re-engage ship and recenter pointer if wave clock is idle.",
  },
  policy: {
    family: "shooter_evasion",
    defaults: {
      riskTolerance: 0.38,
      recoveryBias: 0.72,
      enemyEngageRiskMax: 0.3,
      hazardAvoidanceBias: 0.8,
    },
  },
});

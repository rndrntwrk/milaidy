import { createMasteryContract } from "./_shared.js";

export const clawstrikeMasteryContract = createMasteryContract({
  gameId: "clawstrike",
  aliases: ["clawstrike-main"],
  title: "Clawstrike",
  objective: {
    summary: "Combat platformer with die-and-retry flow across level chain.",
    winCondition: "Clear full level sequence quickly with controlled deaths.",
    masteryDefinition: "75%+ full clears while reducing death load and completion time.",
  },
  controls: [
    { action: "Move", input: "WASD / arrows" },
    { action: "Jump", input: "Space" },
    { action: "Attack/Interact", input: "Mouse / mapped combat keys" },
  ],
  progression: [
    {
      id: "run",
      label: "Level Run",
      description: "Sequential level combat screens.",
      successSignal: "ALL_LEVELS clear.",
      failureSignals: ["game_over_screen", "death_loop"],
    },
  ],
  risks: [
    {
      id: "aggression-bias",
      label: "Aggression Bias",
      symptom: "High-risk close combat without recovery windowing.",
      mitigation: "Lower engage risk and prioritize spacing.",
    },
  ],
  passGates: [
    {
      id: "full-clear-rate",
      metric: "run.fullClearRate",
      operator: ">=",
      threshold: 0.75,
      description: "Full clear in >=75% runs.",
    },
    {
      id: "deaths-relative",
      metric: "deaths.relativeToBaseline",
      operator: "<=",
      threshold: 0.6,
      description: "Deaths per run <= baseline*0.6.",
    },
    {
      id: "time-relative",
      metric: "time.relativeToBaseline",
      operator: "<=",
      threshold: 0.8,
      description: "Completion time <= baseline*0.8.",
    },
  ],
  recovery: {
    menu: "Start run from title/menu and confirm gameplay camera.",
    paused: "Resume with mapped pause toggle.",
    gameOver: "Trigger retry path immediately.",
    stuck: "Escape via restart when combat state is unresponsive.",
  },
  policy: {
    family: "combat_window",
    defaults: {
      reactionWindowMs: 150,
      riskTolerance: 0.46,
      enemyEngageRiskMax: 0.34,
      hazardAvoidanceBias: 0.78,
    },
  },
});

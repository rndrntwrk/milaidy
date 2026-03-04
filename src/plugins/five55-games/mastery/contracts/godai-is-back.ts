import { createMasteryContract } from "./_shared.js";

export const godaiIsBackMasteryContract = createMasteryContract({
  gameId: "godai-is-back",
  aliases: ["godai", "godai_is_back"],
  title: "Godai Is Back",
  objective: {
    summary: "Arena duel fighter with spacing and attack mix management.",
    winCondition: "Win rounds by maintaining favorable damage ratio.",
    masteryDefinition: "Win >=75% rounds and avoid input-lock stalls.",
  },
  controls: [
    { action: "Move left", input: "A" },
    { action: "Move right", input: "D" },
    { action: "Attack high", input: "W" },
    { action: "Attack low", input: "S" },
  ],
  progression: [
    {
      id: "duel_loop",
      label: "Duel Loop",
      description: "Single-stage duel with hero/enemy state machines.",
      successSignal: "Round victory state reached.",
      failureSignals: ["damage_ratio_collapse", "input_lock"],
    },
  ],
  risks: [
    {
      id: "spacing-loss",
      label: "Spacing Loss",
      symptom: "Agent traps itself in opponent punish range.",
      mitigation: "Alternate attack mix with retreat windows.",
    },
  ],
  passGates: [
    {
      id: "round-win-rate",
      metric: "round.winRate",
      operator: ">=",
      threshold: 0.75,
      description: "Round win rate >=75%.",
    },
    {
      id: "damage-ratio",
      metric: "damage.takenToDealt",
      operator: "<=",
      threshold: 0.8,
      description: "Damage taken/dealt <=0.8.",
    },
    {
      id: "input-stall",
      metric: "input.lockStalls",
      operator: "<=",
      threshold: 0,
      description: "No input-lock stalls.",
    },
  ],
  recovery: {
    menu: "Start duel and validate fighter entity loads.",
    paused: "Resume with mapped toggle.",
    gameOver: "Restart round immediately.",
    stuck: "Reset input keys and restart if no state transitions.",
  },
  policy: { family: "combat_spacing" },
});

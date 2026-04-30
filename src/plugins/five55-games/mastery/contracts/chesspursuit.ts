import { createMasteryContract } from "./_shared.js";

export const chesspursuitMasteryContract = createMasteryContract({
  gameId: "chesspursuit",
  aliases: ["chess-pursuit"],
  title: "Chesspursuit",
  objective: {
    summary: "Threat-avoidance puzzle with chess-like attack vectors.",
    winCondition: "Survive and progress while respecting threat maps.",
    masteryDefinition: "High completion with minimal fatal threat violations.",
  },
  controls: [
    { action: "Move", input: "Arrow keys / WASD" },
    { action: "Start", input: "Space" },
    { action: "Pause/Resume", input: "Enter" },
  ],
  progression: [
    {
      id: "board_progression",
      label: "Board Progression",
      description: "Advance row-block checkpoints while avoiding active threat lines.",
      successSignal: "Checkpoint and completion states achieved.",
      failureSignals: ["threat_violation", "pause_lock"],
    },
  ],
  risks: [
    {
      id: "threat-overlook",
      label: "Threat Overlook",
      symptom: "Agent advances into active piece attack lanes.",
      mitigation: "Require threat map confirmation before each move commit.",
    },
  ],
  passGates: [
    {
      id: "completion-rate",
      metric: "run.completionRate",
      operator: ">=",
      threshold: 0.85,
      description: "Completion >=85%.",
    },
    {
      id: "threat-fatal-rate",
      metric: "threat.fatalTurnRate",
      operator: "<=",
      threshold: 0.05,
      description: "Fatal threat violations <5% of turns.",
    },
    {
      id: "pause-integrity",
      metric: "pause.resumeCorrectness",
      operator: "==",
      threshold: 1,
      description: "Pause/resume correctness remains 100%.",
    },
  ],
  recovery: {
    menu: "Start with Space and verify board control enabled.",
    paused: "Enter toggles until PLAYING.",
    gameOver: "Restart from run menu and reset board stage.",
    stuck: "Re-open menu and relaunch board if no move accepted.",
  },
  policy: { family: "deterministic_planner" },
});

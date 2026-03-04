import { createMasteryContract } from "./_shared.js";

export const playbackMasteryContract = createMasteryContract({
  gameId: "playback",
  aliases: [],
  title: "Playback",
  objective: {
    summary: "Room-based puzzle platformer with tape instruction mechanics.",
    winCondition: "Solve room objectives without softlocks and complete route.",
    masteryDefinition: "90% room solve rate and robust softlock recovery.",
  },
  controls: [
    { action: "Move", input: "Arrow keys" },
    { action: "Jump", input: "Space" },
    { action: "Pick/Drop", input: "Mapped interact key" },
    { action: "Tape controls", input: "Play/Record/Rewind/Fast-forward keys" },
    { action: "Throw/Shoot", input: "Mapped action keys" },
  ],
  progression: [
    {
      id: "room_graph",
      label: "Room Graph",
      description: "5x5 world with factory/legend-driven puzzle constraints.",
      successSignal: "Room objectives solved and exits traversed.",
      failureSignals: ["softlock", "state_corruption", "loop_without_progress"],
    },
  ],
  risks: [
    {
      id: "instruction-order",
      label: "Instruction Order Error",
      symptom: "Incorrect tape sequencing invalidates room state.",
      mitigation: "Enforce deterministic tape action ordering per room template.",
    },
  ],
  passGates: [
    {
      id: "room-solve-rate",
      metric: "rooms.solveRate",
      operator: ">=",
      threshold: 0.9,
      description: "Room solve rate >=90%.",
    },
    {
      id: "softlock-recovery",
      metric: "softlock.recoverySec",
      operator: "<=",
      threshold: 15,
      description: "Softlock recovery <=15s.",
    },
    {
      id: "objective-completion",
      metric: "objective.completionRate",
      operator: ">=",
      threshold: 0.8,
      description: "Objective completion >=80%.",
    },
  ],
  recovery: {
    menu: "Start/continue game from menu and validate room load.",
    paused: "Resume then verify input acceptance.",
    gameOver: "Restart room with previous instruction plan.",
    stuck: "Reset room state and replay deterministic tape sequence.",
  },
  policy: { family: "sequence_retention" },
});

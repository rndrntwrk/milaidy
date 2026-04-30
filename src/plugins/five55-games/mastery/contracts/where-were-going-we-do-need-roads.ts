import { createMasteryContract } from "./_shared.js";

export const roadsMasteryContract = createMasteryContract({
  gameId: "where-were-going-we-do-need-roads",
  aliases: ["roads", "where-were-going", "where_were_going"],
  title: "Where We're Going, We Do Need Roads",
  objective: {
    summary: "Endless road-shaping runner with hazard windows and shrinking safety margins.",
    winCondition: "Maximize distance while avoiding hazard collisions.",
    masteryDefinition: "Distance >= baseline*1.8 with low hazard collision rate.",
  },
  controls: [
    { action: "Road shaping", input: "Mouse/touch drag pointer" },
    { action: "Start", input: "Start button / mapped action" },
    { action: "Reset", input: "Reset button" },
  ],
  progression: [
    {
      id: "column_stream",
      label: "Column Stream",
      description: "Dynamic danger table over road columns with decreasing safe pauses.",
      successSignal: "Distance counter increases while maintaining safe path.",
      failureSignals: ["hazard_collision", "restart_latency"],
    },
  ],
  risks: [
    {
      id: "pointer-drift",
      label: "Pointer Drift",
      symptom: "Road shape lag leaves player trajectory inside danger band.",
      mitigation: "Increase lookahead and recenter pointer to projected collision point.",
    },
  ],
  passGates: [
    {
      id: "distance",
      metric: "distance.relativeToBaseline",
      operator: ">=",
      threshold: 1.8,
      description: "p50 distance >= baseline*1.8.",
    },
    {
      id: "collision-rate",
      metric: "hazards.collisionPerMinute",
      operator: "<=",
      threshold: 0.15,
      description: "Hazard collision rate <0.15/min.",
    },
    {
      id: "restart-latency",
      metric: "restart.latencySec",
      operator: "<=",
      threshold: 1,
      description: "Restart latency <=1s.",
    },
  ],
  recovery: {
    menu: "Trigger start button and validate pointer binding.",
    paused: "Resume via menu control.",
    gameOver: "Reset immediately and re-arm pointer drag.",
    stuck: "Reinitialize pointer state and restart on stale columns.",
  },
  policy: { family: "path_stability" },
});

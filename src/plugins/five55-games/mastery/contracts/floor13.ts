import { createMasteryContract } from "./_shared.js";

export const floor13MasteryContract = createMasteryContract({
  gameId: "floor13",
  aliases: ["floor-13"],
  title: "Floor13",
  objective: {
    summary: "Top-down floor progression with combat, loot, and exits.",
    winCondition: "Reach exit nodes while managing ammo and health.",
    masteryDefinition: "Exit success >=85% with low ammo-starvation and early deaths.",
  },
  controls: [
    { action: "Move", input: "Arrow keys" },
    { action: "Fire", input: "X" },
    { action: "Reload", input: "C" },
    { action: "Pick up", input: "V" },
    { action: "Start/Retry", input: "Space" },
  ],
  progression: [
    {
      id: "floor_loop",
      label: "Floor Loop",
      description: "Dungeon floors with `nextLevel` transitions.",
      successSignal: "Exit transition triggered.",
      failureSignals: ["ammo_starvation", "death_before_exit"],
    },
  ],
  risks: [
    {
      id: "ammo-collapse",
      label: "Ammo Collapse",
      symptom: "Agent enters dense encounter with low reserves.",
      mitigation: "Prioritize reload/loot windows before room pushes.",
    },
  ],
  passGates: [
    {
      id: "exit-success",
      metric: "exit.successRate",
      operator: ">=",
      threshold: 0.85,
      description: "Exit success >=85%.",
    },
    {
      id: "ammo-starvation",
      metric: "ammo.starvationRate",
      operator: "<=",
      threshold: 0.1,
      description: "Ammo starvation <10% runs.",
    },
    {
      id: "early-death",
      metric: "death.beforeExitRate",
      operator: "<=",
      threshold: 0.25,
      description: "Death-before-exit <25%.",
    },
  ],
  recovery: {
    menu: "Start run and verify player spawn.",
    paused: "Resume and validate weapon input.",
    gameOver: "Space retry and floor reset check.",
    stuck: "Reload/pickup cycle then restart floor if no pathing progress.",
  },
  policy: { family: "hazard_objective" },
});

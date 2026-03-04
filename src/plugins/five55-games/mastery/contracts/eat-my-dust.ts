import { createMasteryContract } from "./_shared.js";

export const eatMyDustMasteryContract = createMasteryContract({
  gameId: "eat-my-dust",
  aliases: ["eat_my_dust"],
  title: "Eat My Dust",
  objective: {
    summary: "Typing race with energy economy and phrase/story progression.",
    winCondition: "Complete phrase sets fast while maintaining near-perfect accuracy.",
    masteryDefinition: "99.2%+ accuracy and substantial completion time reduction.",
  },
  controls: [
    { action: "Type characters", input: "Keyboard" },
    { action: "Start", input: "Space" },
    { action: "Story select", input: "Enter" },
  ],
  progression: [
    {
      id: "title_story_phrase",
      label: "Title -> Story -> Phrase Flow",
      description: "Sequential phrase completion against ghost racers.",
      successSignal: "finish flag set with positive energy reserve.",
      failureSignals: ["energy_depletion", "accuracy_drop"],
    },
  ],
  risks: [
    {
      id: "accuracy-collapse",
      label: "Accuracy Collapse",
      symptom: "Speed mode causes typo bursts and energy drain.",
      mitigation: "Cap key rate when local typo streak rises.",
    },
  ],
  passGates: [
    {
      id: "accuracy",
      metric: "typing.accuracy",
      operator: ">=",
      threshold: 0.992,
      description: "Accuracy >=99.2%.",
    },
    {
      id: "completion-time",
      metric: "time.relativeToBaseline",
      operator: "<=",
      threshold: 0.75,
      description: "Completion time <= baseline*0.75.",
    },
    {
      id: "energy-failure-rate",
      metric: "energy.failureRate",
      operator: "<=",
      threshold: 0.05,
      description: "Energy depletion failures <5%.",
    },
  ],
  recovery: {
    menu: "Space start then Enter story select.",
    paused: "Resume and re-evaluate cursor/phrase index.",
    gameOver: "Restart story quickly and continue typing loop.",
    stuck: "Reselect story if phrase cursor does not advance.",
  },
  policy: { family: "racing_impact_control" },
});

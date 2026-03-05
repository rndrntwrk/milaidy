import type { Five55MasteryContract, MasteryGateV2 } from "./types.js";

type ContractOverride = {
  objective?: Partial<Five55MasteryContract["objective"]>;
  passGates?: Five55MasteryContract["passGates"];
  gateV2?: Partial<MasteryGateV2>;
  notesAppend?: string[];
};

export const STRICT_CONTRACT_OVERRIDES: Record<string, ContractOverride> = {
  knighthood: {
    objective: {
      masteryDefinition:
        "Mastery requires score above 5000 with verified combat + jump control coverage.",
    },
    passGates: [
      {
        id: "knighthood-score-5000",
        metric: "score.max",
        operator: ">=",
        threshold: 5000,
        description: "Peak score exceeds 5000.",
      },
    ],
    gateV2: {
      runtimeGates: [
        {
          id: "knighthood-score-5000",
          metric: "score.max",
          operator: ">=",
          threshold: 5000,
          description: "Peak score exceeds 5000.",
          required: true,
          source: "runtime-native",
        },
      ],
      truthChecks: {
        requireFrameTypes: [
          "boot/menu",
          "play-start",
          "progress",
          "terminal",
          "stuck-check",
        ],
        stuckCheckIntervalSec: 5,
        failOnMenuAdvance: true,
        failOnStaticFramesWithProgress: true,
        failOnTelemetryFrameMismatch: true,
        requiredControlAxes: ["move", "jump", "combat"],
      },
    },
  },
  "sector-13": {
    objective: {
      masteryDefinition:
        "Mastery requires reaching sector 7+ with validated sector transitions.",
    },
    passGates: [
      {
        id: "sector-13-reach-7",
        metric: "sector.max",
        operator: ">=",
        threshold: 7,
        description: "Reach sector 7 or higher.",
      },
    ],
    gateV2: {
      runtimeGates: [
        {
          id: "sector-13-reach-7",
          metric: "sector.max",
          operator: ">=",
          threshold: 7,
          description: "Reach sector 7 or higher.",
          required: true,
          source: "runtime-native",
        },
      ],
      levelRequirement: {
        metric: "sector.max",
        totalLevels: 13,
        requiredLevel: 7,
        indexBase: 1,
        mode: "at_least",
      },
    },
  },
  ninja: {
    objective: {
      masteryDefinition:
        "Mastery requires reaching level 8+ without restart-loop inflation.",
    },
    passGates: [
      {
        id: "ninja-level-8",
        metric: "level.max",
        operator: ">=",
        threshold: 8,
        description: "Reach level 8 or higher.",
      },
    ],
    gateV2: {
      runtimeGates: [
        {
          id: "ninja-level-8",
          metric: "level.max",
          operator: ">=",
          threshold: 8,
          description: "Reach level 8 or higher.",
          required: true,
          source: "runtime-native",
        },
      ],
      levelRequirement: {
        metric: "level.max",
        totalLevels: 16,
        requiredLevel: 8,
        indexBase: 0,
        mode: "at_least",
      },
    },
  },
  clawstrike: {
    objective: {
      masteryDefinition:
        "Mastery requires reaching level 7+ with verified clear progression.",
    },
    passGates: [
      {
        id: "clawstrike-level-7",
        metric: "level.max",
        operator: ">=",
        threshold: 7,
        description: "Reach level 7 or higher.",
      },
    ],
    gateV2: {
      runtimeGates: [
        {
          id: "clawstrike-level-7",
          metric: "level.max",
          operator: ">=",
          threshold: 7,
          description: "Reach level 7 or higher.",
          required: true,
          source: "runtime-native",
        },
      ],
      levelRequirement: {
        metric: "level.max",
        totalLevels: 14,
        requiredLevel: 7,
        indexBase: 0,
        mode: "at_least",
      },
    },
  },
  chesspursuit: {
    gateV2: {
      truthChecks: {
        requireFrameTypes: [
          "boot/menu",
          "play-start",
          "progress",
          "terminal",
          "stuck-check",
        ],
        stuckCheckIntervalSec: 5,
        failOnMenuAdvance: true,
        failOnStaticFramesWithProgress: true,
        failOnTelemetryFrameMismatch: true,
      },
    },
  },
  "wolf-and-sheep": {
    objective: {
      masteryDefinition:
        "Mastery requires trapping at least 2 wolves with block-push strategy.",
    },
    passGates: [
      {
        id: "wolf-traps-2",
        metric: "wolvesTrapped.max",
        operator: ">=",
        threshold: 2,
        description: "Trap at least 2 wolves.",
      },
    ],
    gateV2: {
      runtimeGates: [
        {
          id: "wolf-traps-2",
          metric: "wolvesTrapped.max",
          operator: ">=",
          threshold: 2,
          description: "Trap at least 2 wolves.",
          required: true,
          source: "runtime-native",
        },
      ],
    },
  },
  leftandright: {
    objective: {
      masteryDefinition:
        "Mastery requires surviving 60s with zero wrong-coin collection.",
    },
    passGates: [
      {
        id: "leftandright-survival-60",
        metric: "survival.durationSec",
        operator: ">=",
        threshold: 60,
        description: "Survive for at least 60 seconds.",
      },
      {
        id: "leftandright-wrong-coin-zero",
        metric: "wrongCoinCount.max",
        operator: "<=",
        threshold: 0,
        description: "Collect zero wrong coins.",
      },
    ],
    gateV2: {
      runtimeGates: [
        {
          id: "leftandright-survival-60",
          metric: "survival.durationSec",
          operator: ">=",
          threshold: 60,
          description: "Survive for at least 60 seconds.",
          required: true,
          source: "runtime-native",
        },
        {
          id: "leftandright-wrong-coin-zero",
          metric: "wrongCoinCount.max",
          operator: "<=",
          threshold: 0,
          description: "Collect zero wrong coins.",
          required: true,
          source: "runtime-native",
        },
      ],
    },
  },
  playback: {
    gateV2: {
      levelRequirement: {
        metric: "room.max",
        totalLevels: 25,
        requiredLevel: 13,
        indexBase: 0,
        mode: "at_least",
      },
    },
  },
  "fighter-planes": {
    objective: {
      masteryDefinition:
        "Mastery requires sustained flight, active movement, and live-fire combat.",
    },
    gateV2: {
      truthChecks: {
        requireFrameTypes: [
          "boot/menu",
          "play-start",
          "progress",
          "terminal",
          "stuck-check",
        ],
        stuckCheckIntervalSec: 5,
        failOnMenuAdvance: true,
        failOnStaticFramesWithProgress: true,
        failOnTelemetryFrameMismatch: true,
        requiredControlAxes: ["move", "fire", "flight"],
      },
    },
  },
  floor13: {
    objective: {
      masteryDefinition:
        "Temporary mastery gate: reach floor 5+ with combat/reload viability.",
    },
    passGates: [
      {
        id: "floor13-floor-5-temp",
        metric: "level.max",
        operator: ">=",
        threshold: 5,
        description: "Temporary floor target: reach floor 5 or higher.",
      },
    ],
    gateV2: {
      runtimeGates: [
        {
          id: "floor13-floor-5-temp",
          metric: "level.max",
          operator: ">=",
          threshold: 5,
          description: "Temporary floor target: reach floor 5 or higher.",
          required: true,
          source: "runtime-native",
        },
      ],
      levelRequirement: {
        metric: "level.max",
        totalLevels: 13,
        requiredLevel: 5,
        indexBase: 0,
        mode: "at_least",
        temporaryOverride: true,
        temporaryOverrideReason:
          "Runtime/source parity fix pending; final half-level target is 7.",
      },
    },
  },
  "godai-is-back": {
    gateV2: {
      status: "DEFERRED_MULTIPLAYER",
    },
    notesAppend: [
      "Deferred from strict denominator until multiplayer implementation is available.",
    ],
  },
  "where-were-going-we-do-need-roads": {
    gateV2: {
      runtimeGates: [
        {
          id: "roads-distance",
          metric: "distance.max",
          operator: ">=",
          threshold: 2200,
          description: "Distance reaches at least 2200.",
          required: true,
          source: "runtime-native",
        },
        {
          id: "roads-invalid-placement",
          metric: "road.invalidPlacement.max",
          operator: "<=",
          threshold: 0,
          description: "No invalid/buried road placement episodes.",
          required: true,
          source: "runtime-native",
        },
      ],
    },
  },
  "vedas-run": {
    objective: {
      masteryDefinition:
        "Mastery requires segment progression to at least segment 7.",
    },
    passGates: [
      {
        id: "vedas-segment-7",
        metric: "segment.max",
        operator: ">=",
        threshold: 7,
        description: "Reach segment 7 or higher.",
      },
    ],
    gateV2: {
      runtimeGates: [
        {
          id: "vedas-segment-7",
          metric: "segment.max",
          operator: ">=",
          threshold: 7,
          description: "Reach segment 7 or higher.",
          required: true,
          source: "runtime-native",
        },
      ],
      levelRequirement: {
        metric: "segment.max",
        totalLevels: 14,
        requiredLevel: 7,
        indexBase: 0,
        mode: "at_least",
      },
    },
  },
};


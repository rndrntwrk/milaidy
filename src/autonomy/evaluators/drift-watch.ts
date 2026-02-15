/**
 * Drift Watch — post-evaluator that analyzes agent outputs for persona drift.
 *
 * Runs AFTER response generation (`phase: "post"`, the default):
 * - Collects recent agent output texts from the `responses` parameter
 * - Feeds them to the DriftMonitor for analysis
 * - Emits `autonomy:identity:drift` when drift severity is non-trivial
 *
 * The evaluator maintains a sliding window of recent outputs across calls
 * (capped at the monitor's configured analysisWindowSize).
 *
 * @module autonomy/evaluators/drift-watch
 */

import type {
  Evaluator,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { AutonomyIdentityConfig } from "../identity/schema.js";

/**
 * Sliding window of recent agent output texts.
 * Shared across evaluator invocations within the same runtime.
 */
const recentOutputs: string[] = [];
const MAX_WINDOW = 50;

/** Default identity config used when no explicit config is provided. */
const DEFAULT_IDENTITY: AutonomyIdentityConfig = {
  name: "Milaidy",
  coreValues: ["helpfulness", "honesty", "safety"],
  communicationStyle: {
    tone: "balanced" as "formal",
    verbosity: "balanced",
    personaVoice: "A helpful AI assistant",
  },
  hardBoundaries: [
    "Never impersonate a real person",
    "Never generate harmful content",
  ],
  softPreferences: {},
  identityVersion: 1,
};

/**
 * Create a drift watch post-evaluator.
 */
export function createDriftWatchEvaluator(): Evaluator {
  return {
    name: "milaidy-drift-watch",
    description:
      "Analyzes agent outputs for persona drift. Emits autonomy:identity:drift when drift is detected.",
    alwaysRun: true,
    // phase: "post" is the default — runs after response generation
    examples: [],

    validate: async (
      _runtime: IAgentRuntime,
      _message: Memory,
    ): Promise<boolean> => {
      // Always run when autonomy is available
      return true;
    },

    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state?: State,
      _options?: Record<string, unknown>,
      _callback?: unknown,
      responses?: Memory[],
    ): Promise<undefined> => {
      // Resolve the autonomy service
      const svc = runtime.getService("AUTONOMY") as {
        getDriftMonitor?: () => import("../identity/drift-monitor.js").PersonaDriftMonitor | null;
      } | null;

      const monitor = svc?.getDriftMonitor?.();
      if (!monitor) return;

      // Collect output texts from this response cycle
      const outputTexts: string[] = [];
      if (responses && responses.length > 0) {
        for (const r of responses) {
          const text = r.content?.text;
          if (text) outputTexts.push(text);
        }
      }

      if (outputTexts.length === 0) return;

      // Add to sliding window
      recentOutputs.push(...outputTexts);
      while (recentOutputs.length > MAX_WINDOW) {
        recentOutputs.shift();
      }

      // Analyze for drift
      const report = await monitor.analyze(recentOutputs, DEFAULT_IDENTITY);

      // Emit event when drift is non-trivial
      if (report.severity !== "none") {
        try {
          const { getEventBus } = await import("../../events/event-bus.js");
          getEventBus().emit("autonomy:identity:drift", {
            agentId: runtime.agentId?.toString() ?? "unknown",
            driftScore: report.driftScore,
            severity: report.severity,
            corrections: report.corrections,
          });
        } catch {
          // Event bus not available — non-fatal
        }
      }

      return undefined;
    },
  };
}

/**
 * Reset the output window (for testing).
 */
export function _resetOutputWindow(): void {
  recentOutputs.length = 0;
}

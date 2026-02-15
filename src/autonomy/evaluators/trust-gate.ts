/**
 * Trust Gate — pre-evaluator that scores inbound messages and gates
 * memory writes based on trust thresholds.
 *
 * Runs BEFORE memory storage (`phase: "pre"`):
 * - Trust above writeThreshold → allow (memory stored normally)
 * - Trust between quarantine and write → quarantine (memory blocked, routed to MemoryGate)
 * - Trust below quarantineThreshold → reject (memory blocked entirely)
 *
 * Emits events:
 * - `autonomy:trust:scored` after every score
 * - `autonomy:memory:gated` after every gate decision
 *
 * @module autonomy/evaluators/trust-gate
 */

import type {
  Evaluator,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import type { TrustContext, TrustSource } from "../types.js";

/**
 * Create a trust gate pre-evaluator.
 *
 * Uses a factory function because the evaluator needs access to the
 * autonomy service (resolved from the runtime at call time, not at
 * plugin registration time).
 */
export function createTrustGateEvaluator(): Evaluator {
  return {
    name: "milaidy-trust-gate",
    description:
      "Scores inbound message trust and gates memory writes. Blocks or quarantines low-trust content.",
    alwaysRun: true,
    phase: "pre" as const,
    examples: [],

    validate: async (
      _runtime: IAgentRuntime,
      message: Memory,
    ): Promise<boolean> => {
      // Run on all messages that have text content
      return !!message.content?.text;
    },

    // The handler returns PreEvaluatorResult (blocked/rewrittenText/reason).
    // ElizaOS's evaluatePre() reads this shape at runtime, but the Evaluator
    // type declares handler as `Handler` (returning ActionResult). We cast to
    // satisfy the nominal type while preserving the actual return shape.
    handler: (async (
      runtime: IAgentRuntime,
      message: Memory,
      _state?: State,
    ): Promise<{ blocked: boolean; rewrittenText?: string; reason?: string }> => {
      // Resolve the autonomy service from the runtime
      const svc = runtime.getService("AUTONOMY") as {
        getTrustScorer?: () => import("../trust/scorer.js").TrustScorer | null;
        getMemoryGate?: () => import("../memory/gate.js").MemoryGate | null;
      } | null;

      const scorer = svc?.getTrustScorer?.();
      if (!scorer) {
        // Autonomy not enabled or scorer unavailable — pass through
        return { blocked: false };
      }

      const text = message.content.text ?? "";
      const source = extractTrustSource(message);
      const context = extractTrustContext(runtime, message);

      // Score the message
      const trustScore = await scorer.score(text, source, context);

      // Emit trust:scored event
      await emitEvent("autonomy:trust:scored", {
        sourceId: source.id,
        contentHash: simpleHash(text),
        score: trustScore.score,
        dimensions: trustScore.dimensions,
      });

      // Attach trust metadata to the message for downstream consumers
      const meta = (message.metadata ?? {}) as Record<string, unknown>;
      meta.trustScore = trustScore.score;
      meta.trustDimensions = trustScore.dimensions;
      message.metadata = meta as typeof message.metadata;

      // Gate decision based on thresholds
      // The scorer's config has the thresholds, but we can infer from the
      // MemoryGate's evaluate() which applies them internally.
      // For the pre-evaluator, we use the MemoryGate directly.
      const gate = svc?.getMemoryGate?.();
      if (gate) {
        const decision = await gate.evaluate(message, source);

        await emitEvent("autonomy:memory:gated", {
          memoryId: message.id ?? "pending",
          decision: decision.action,
          trustScore: trustScore.score,
          reason: decision.reason,
        });

        if (decision.action === "reject") {
          return {
            blocked: true,
            reason: `Trust gate rejected: ${decision.reason} (score: ${trustScore.score.toFixed(2)})`,
          };
        }

        if (decision.action === "quarantine") {
          return {
            blocked: true,
            reason: `Trust gate quarantined: ${decision.reason} (score: ${trustScore.score.toFixed(2)})`,
          };
        }
      }

      // Allow — trust is sufficient for direct memory write
      await emitEvent("autonomy:memory:gated", {
        memoryId: message.id ?? "pending",
        decision: "allow",
        trustScore: trustScore.score,
        reason: "Trust score above write threshold",
      });

      return { blocked: false };
    }) as unknown as Evaluator["handler"],
  };
}

// ---------- Helpers ----------

/**
 * Extract a TrustSource from an ElizaOS Memory.
 */
function extractTrustSource(message: Memory): TrustSource {
  const meta = (message.metadata ?? {}) as Record<string, unknown>;
  const sender = meta.sender as { id?: string; name?: string } | undefined;
  const provider = meta.provider as string | undefined;

  // Determine source type from metadata
  let type: TrustSource["type"] = "external";
  if (meta.gatewayClientScopes) {
    type = "system";
  } else if (provider === "system" || meta.type === "system") {
    type = "system";
  } else if (sender?.id) {
    type = "user";
  }

  return {
    id: sender?.id ?? message.entityId?.toString() ?? "unknown",
    type,
    channel: provider ?? "unknown",
    reliability: type === "system" ? 1.0 : type === "user" ? 0.7 : 0.4,
  };
}

/**
 * Extract a TrustContext from runtime + message.
 */
function extractTrustContext(
  runtime: IAgentRuntime,
  _message: Memory,
): TrustContext {
  return {
    agentId: runtime.agentId?.toString() ?? "unknown",
  };
}

/**
 * Cached event bus reference (resolved on first use).
 */
type SimpleEmitter = { emit: (event: string, payload: Record<string, unknown>) => void };
let _eventBus: SimpleEmitter | null | undefined;

/**
 * Resolve the event bus (cached after first successful load).
 */
async function resolveEventBus() {
  if (_eventBus !== undefined) return _eventBus;
  try {
    const { getEventBus } = await import("../../events/event-bus.js");
    _eventBus = getEventBus() as unknown as SimpleEmitter;
  } catch {
    _eventBus = null;
  }
  return _eventBus;
}

/**
 * Emit a Milaidy event (best-effort).
 */
async function emitEvent(event: string, payload: Record<string, unknown>): Promise<void> {
  const bus = await resolveEventBus();
  bus?.emit(event, payload);
}

/** Reset cached bus (for testing). */
export function _resetEventBusCache(): void {
  _eventBus = undefined;
}

/**
 * Simple non-cryptographic hash for content identification in events.
 */
function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

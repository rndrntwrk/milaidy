/**
 * Trust-aware retrieval provider.
 *
 * Injects ranked, trust-scored memories into the agent's context.
 * Position: 15 (after workspace=10, session=5).
 *
 * @module providers/trust-retrieval-provider
 */

import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import type { TrustAwareRetriever, RankedMemory } from "../autonomy/memory/retriever.js";

/**
 * Create a trust-aware retrieval context provider.
 */
export function createTrustRetrievalProvider(): Provider {
  return {
    name: "milaidyTrustRetrieval",
    description: "Trust-scored memory retrieval for context injection",
    dynamic: true,
    position: 15,

    async get(
      runtime: IAgentRuntime,
      message: Memory,
      _state: State,
    ) {
      let retriever: TrustAwareRetriever | null = null;

      // Resolve retriever from DI container
      try {
        const { getContainer, TOKENS } = await import("../di/container.js");
        const container = getContainer();
        retriever = container.tryGet(TOKENS.TrustAwareRetriever) ?? null;
      } catch {
        // DI not available
      }

      if (!retriever || !message.roomId) {
        return { text: "" };
      }

      try {
        const ranked = await retriever.retrieve(runtime, {
          roomId: message.roomId,
          embedding: message.embedding,
        });

        if (ranked.length === 0) {
          return { text: "" };
        }

        const lines = ranked.map((r) => formatRankedMemory(r));
        const text = `## Trusted Memory Context\n${lines.join("\n")}`;

        return {
          text,
          data: {
            rankedMemories: ranked.map((r) => ({
              id: r.memory.id,
              type: r.memoryType,
              rankScore: r.rankScore,
              trustScore: r.trustScore,
            })),
          },
        };
      } catch {
        return { text: "" };
      }
    },
  };
}

function formatRankedMemory(r: RankedMemory): string {
  const text = (r.memory.content as { text?: string })?.text ?? "";
  const trust = (r.trustScore * 100).toFixed(0);
  return `- [${r.memoryType}|trust:${trust}%] ${text.slice(0, 200)}`;
}

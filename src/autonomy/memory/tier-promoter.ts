/**
 * Memory tier promotion engine.
 *
 * Handles the lifecycle of entity-scoped memories:
 * - Short-term (room-scoped) → mid-term (entity-scoped, 30-day TTL)
 * - Mid-term → long-term (permanent) based on session count threshold
 * - TTL cleanup for expired mid-term memories
 *
 * Promotion criteria:
 * - short→mid: Triggered at session end via conversation summarizer
 * - mid→long: sessionCount >= PROMOTION_THRESHOLD (a fact repeated across N sessions)
 *
 * @module autonomy/memory/tier-promoter
 */

import type {
  EntityMemoryStore,
  EntityMemory,
  EntityMemoryInput,
  MemoryTier,
} from "./entity-memory-store.js";
import type {
  ConversationSummary,
  ExtractedFact,
} from "./conversation-summarizer.js";
import type { MemoryType } from "../types.js";

// ---------- Config ----------

export interface TierPromotionConfig {
  /** Session count threshold for mid→long promotion. Default: 3. */
  promotionThreshold: number;
  /** Maximum mid-term memories per entity. Default: 200. */
  maxMidTermPerEntity: number;
  /** Maximum long-term memories per entity. Default: 100. */
  maxLongTermPerEntity: number;
  /** Minimum fact confidence for mid-term storage. Default: 0.5. */
  minFactConfidence: number;
}

export const DEFAULT_TIER_PROMOTION_CONFIG: TierPromotionConfig = {
  promotionThreshold: 3,
  maxMidTermPerEntity: 200,
  maxLongTermPerEntity: 100,
  minFactConfidence: 0.5,
};

// ---------- Result Types ----------

export interface PromotionResult {
  /** Number of new mid-term memories created from this session. */
  midTermCreated: number;
  /** Number of mid-term memories promoted to long-term. */
  promotedToLongTerm: number;
  /** Number of expired memories purged. */
  expired: number;
  /** Number of duplicate facts that bumped sessionCount. */
  duplicatesBumped: number;
  /** Total entity memory count after operation. */
  totalEntityMemories: number;
}

export interface SeedResult {
  /** Number of new mid-term memories created. */
  created: number;
  /** Number of existing mid-term memories whose sessionCount was bumped. */
  bumped: number;
}

// ---------- Implementation ----------

export class TierPromoter {
  private readonly store: EntityMemoryStore;
  private readonly config: TierPromotionConfig;

  constructor(
    store: EntityMemoryStore,
    config?: Partial<TierPromotionConfig>,
  ) {
    this.store = store;
    this.config = { ...DEFAULT_TIER_PROMOTION_CONFIG, ...config };
  }

  /**
   * Process a session-end event: take summarized conversation data
   * and seed entity memories from extracted facts and the summary.
   */
  async processSessionEnd(
    canonicalEntityId: string,
    summary: ConversationSummary,
  ): Promise<PromotionResult> {
    let midTermCreated = 0;
    let duplicatesBumped = 0;

    // 1. Seed the conversation summary as a mid-term memory
    const summaryResult = await this.seedMidTermMemory(canonicalEntityId, {
      tier: "mid-term",
      memoryType: "observation",
      content: {
        text: summary.summary,
        topics: summary.topics,
        messageCount: summary.messageCount,
        turnCount: summary.turnCount,
        timespan: summary.timespan,
      },
      trustScore: 0.7,
      provenance: {
        sourcePlatform: summary.platform,
        sourceRoomId: summary.roomId,
        createdBy: "conversation-summarizer",
      },
    });
    if (summaryResult.created) midTermCreated++;
    if (summaryResult.bumped) duplicatesBumped++;

    // 2. Seed extracted facts as mid-term memories
    for (const fact of summary.facts) {
      if (fact.confidence < this.config.minFactConfidence) continue;

      const factType = factCategoryToMemoryType(fact.category);
      const result = await this.seedMidTermMemory(canonicalEntityId, {
        tier: "mid-term",
        memoryType: factType,
        content: {
          text: fact.text,
          factCategory: fact.category,
          confidence: fact.confidence,
        },
        trustScore: fact.confidence,
        provenance: {
          sourcePlatform: summary.platform,
          sourceRoomId: summary.roomId,
          createdBy: "fact-extractor",
        },
      });
      if (result.created) midTermCreated++;
      if (result.bumped) duplicatesBumped++;
    }

    // 3. Check for mid→long promotions
    const promotedToLongTerm = await this.promoteMatureMidTermMemories(
      canonicalEntityId,
    );

    // 4. Purge expired mid-term memories
    const expired = await this.store.purgeExpired();

    // 5. Count total
    const totalEntityMemories = await this.store.count(canonicalEntityId);

    return {
      midTermCreated,
      promotedToLongTerm,
      expired,
      duplicatesBumped,
      totalEntityMemories,
    };
  }

  /**
   * Seed a mid-term memory with deduplication.
   * If a memory with the same text already exists for this entity,
   * bump the sessionCount instead of creating a duplicate.
   */
  async seedMidTermMemory(
    canonicalEntityId: string,
    input: Omit<EntityMemoryInput, "canonicalEntityId">,
  ): Promise<SeedResult> {
    const text = (input.content as { text?: string })?.text;
    if (!text) {
      await this.store.insert({ ...input, canonicalEntityId });
      return { created: 1, bumped: 0 };
    }

    // Check for existing memory with same content text
    const existing = await this.store.query({
      canonicalEntityId,
      tiers: ["mid-term"],
    });

    const normalized = text.trim().toLowerCase();
    const match = existing.find((m) => {
      const mText = (m.content as { text?: string })?.text;
      return mText && mText.trim().toLowerCase() === normalized;
    });

    if (match) {
      await this.store.bumpSessionCount(match.id);
      return { created: 0, bumped: 1 };
    }

    // No match — create new
    await this.store.insert({ ...input, canonicalEntityId });
    return { created: 1, bumped: 0 };
  }

  /**
   * Promote mid-term memories that have reached the session count threshold.
   * Returns the number of memories promoted.
   */
  async promoteMatureMidTermMemories(
    canonicalEntityId: string,
  ): Promise<number> {
    const midTermMemories = await this.store.query({
      canonicalEntityId,
      tiers: ["mid-term"],
    });

    let promoted = 0;

    for (const mem of midTermMemories) {
      if (mem.sessionCount >= this.config.promotionThreshold) {
        // Check if we've hit the long-term cap
        const longTermCount = await this.store.count(
          canonicalEntityId,
          "long-term",
        );
        if (longTermCount >= this.config.maxLongTermPerEntity) {
          break; // Cap reached, stop promoting
        }

        await this.store.promoteTier(mem.id, "long-term");
        promoted++;
      }
    }

    return promoted;
  }

  /**
   * Run periodic maintenance: purge expired, check for promotions.
   */
  async runMaintenance(
    canonicalEntityIds?: string[],
  ): Promise<{ expired: number; promoted: number }> {
    const expired = await this.store.purgeExpired();

    let promoted = 0;
    if (canonicalEntityIds) {
      for (const id of canonicalEntityIds) {
        promoted += await this.promoteMatureMidTermMemories(id);
      }
    }

    return { expired, promoted };
  }
}

// ---------- Helpers ----------

function factCategoryToMemoryType(
  category: ExtractedFact["category"],
): MemoryType {
  switch (category) {
    case "preference":
      return "preference";
    case "biographical":
      return "fact";
    case "intent":
      return "goal";
    case "relationship":
      return "relationship";
    case "technical":
      return "fact";
    default:
      return "observation";
  }
}

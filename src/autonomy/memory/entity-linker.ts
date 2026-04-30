/**
 * Entity resolution service for cross-platform identity linking.
 *
 * Resolves platform-specific user identifiers (Discord username,
 * web chat entity UUID, Telegram handle) to canonical entity IDs.
 * This is the bridge between room-scoped ElizaOS identity and
 * entity-scoped cross-platform memory.
 *
 * @module autonomy/memory/entity-linker
 */

import type { EntityLinkStore, CanonicalEntity, Platform } from "./entity-link-store.js";

/** Emitted when a new linkage is established. */
export interface EntityLinkedEvent {
  canonicalEntityId: string;
  platform: Platform;
  platformId: string;
  isNewEntity: boolean;
  timestamp: number;
}

/** Optional event emitter interface — integrates with existing event bus. */
export interface EntityEventEmitter {
  emit(event: "entity:linked", data: EntityLinkedEvent): void;
  emit(event: "entity:resolved", data: { canonicalEntityId: string; platform: Platform }): void;
}

/**
 * Configuration for initial operator entities seeded on first boot.
 */
export interface OperatorSeedConfig {
  displayName: string;
  platformIds: Record<string, string>;
  preferences?: Record<string, unknown>;
}

/**
 * EntityLinker resolves platform-specific user identifiers to
 * canonical entity IDs. It is the single entry point for
 * cross-platform identity resolution.
 */
export class EntityLinker {
  private store: EntityLinkStore;
  private eventEmitter?: EntityEventEmitter;
  private seeded = false;

  constructor(store: EntityLinkStore, eventEmitter?: EntityEventEmitter) {
    this.store = store;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Seed initial operator entities from configuration.
   * Safe to call multiple times — deduplicates by platform IDs.
   */
  async seedOperators(operators: OperatorSeedConfig[]): Promise<void> {
    if (this.seeded) return;

    for (const op of operators) {
      // Check if any platform ID already exists
      let existingEntity: CanonicalEntity | null = null;
      for (const [platform, platformId] of Object.entries(op.platformIds)) {
        existingEntity = await this.store.getByPlatformId(platform, platformId);
        if (existingEntity) break;
      }

      if (existingEntity) {
        // Update existing entity with any new platform IDs
        for (const [platform, platformId] of Object.entries(op.platformIds)) {
          if (!existingEntity.platformIds[platform]) {
            await this.store.linkPlatform(existingEntity.id, platform, platformId);
          }
        }
      } else {
        // Create new operator entity
        await this.store.upsertEntity({
          displayName: op.displayName,
          isOperator: true,
          trustLevel: 1.0,
          platformIds: op.platformIds,
          preferences: op.preferences ?? {},
        });
      }
    }

    this.seeded = true;
  }

  /**
   * Resolve a platform-specific user to a canonical entity.
   *
   * Returns the canonical entity if found. If not found and
   * `autoCreate` is true (default: false), creates a new
   * canonical entity with the given platform identity.
   *
   * This is the primary API for message handlers to call
   * before retrieval.
   */
  async resolve(
    platform: Platform,
    platformId: string,
    opts?: {
      autoCreate?: boolean;
      displayName?: string;
    },
  ): Promise<CanonicalEntity | null> {
    const existing = await this.store.getByPlatformId(platform, platformId);

    if (existing) {
      await this.store.touchLastSeen(existing.id, platform);
      this.eventEmitter?.emit("entity:resolved", {
        canonicalEntityId: existing.id,
        platform,
      });
      return existing;
    }

    if (!opts?.autoCreate) {
      return null;
    }

    // Auto-create a new canonical entity for this platform user
    const entity = await this.store.upsertEntity({
      displayName: opts.displayName ?? `${platform}:${platformId}`,
      platformIds: { [platform]: platformId },
      trustLevel: 0.5,
      isOperator: false,
    });

    this.eventEmitter?.emit("entity:linked", {
      canonicalEntityId: entity.id,
      platform,
      platformId,
      isNewEntity: true,
      timestamp: Date.now(),
    });

    return entity;
  }

  /**
   * Manually link a platform identity to an existing canonical entity.
   * Used by operator CLI commands: `alice entity link <id> <platform> <platformId>`
   */
  async link(
    canonicalId: string,
    platform: Platform,
    platformId: string,
  ): Promise<void> {
    await this.store.linkPlatform(canonicalId, platform, platformId);

    this.eventEmitter?.emit("entity:linked", {
      canonicalEntityId: canonicalId,
      platform,
      platformId,
      isNewEntity: false,
      timestamp: Date.now(),
    });
  }

  /**
   * Get the canonical entity for a given platform identity,
   * or null if not linked.
   */
  async lookup(platform: Platform, platformId: string): Promise<CanonicalEntity | null> {
    return this.store.getByPlatformId(platform, platformId);
  }

  /** Get all known entities. */
  async listAll(opts?: { operatorsOnly?: boolean }): Promise<CanonicalEntity[]> {
    return this.store.listEntities(opts);
  }

  /** Get the underlying store for direct access (e.g., from API routes). */
  getStore(): EntityLinkStore {
    return this.store;
  }
}

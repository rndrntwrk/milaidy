/**
 * Cross-platform entity linking store.
 *
 * Maps platform-specific user identities to canonical entities,
 * enabling cross-room memory retrieval across Discord, web chat,
 * Telegram, and any future platform.
 *
 * @module autonomy/memory/entity-link-store
 */

import { z } from "zod";

// ---------- Schema ----------

/** Supported platform identifiers. Extensible for future platforms. */
export type Platform = "discord" | "web_chat" | "telegram" | "github" | string;

/** Validated canonical entity schema. */
export const CanonicalEntitySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().min(1),
  trustLevel: z.number().min(0).max(1).default(0.5),
  isOperator: z.boolean().default(false),
  platformIds: z.record(z.string(), z.string()).default({}),
  preferences: z.record(z.string(), z.unknown()).default({}),
  knownFacts: z.array(z.string()).default([]),
  lastSeen: z.record(z.string(), z.number()).default({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
  firstSeen: z.number().default(() => Date.now()),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
});

export type CanonicalEntity = z.infer<typeof CanonicalEntitySchema>;

/** Input for creating/updating an entity (id optional for creation). */
export const CanonicalEntityInputSchema = CanonicalEntitySchema.partial({
  id: true,
  firstSeen: true,
  createdAt: true,
  updatedAt: true,
});

export type CanonicalEntityInput = z.infer<typeof CanonicalEntityInputSchema>;

// ---------- Interface ----------

/**
 * Store interface for canonical entity CRUD and platform linkage.
 */
export interface EntityLinkStore {
  /**
   * Create or update a canonical entity.
   * If `input.id` is provided and exists, updates. Otherwise creates.
   */
  upsertEntity(input: CanonicalEntityInput): Promise<CanonicalEntity>;

  /** Look up a canonical entity by its UUID. */
  getById(id: string): Promise<CanonicalEntity | null>;

  /**
   * Resolve a platform-specific user ID to a canonical entity.
   * This is the primary cross-platform lookup path.
   */
  getByPlatformId(platform: Platform, platformId: string): Promise<CanonicalEntity | null>;

  /**
   * Link a platform identity to an existing canonical entity.
   * Throws if the platform+platformId is already linked to a different entity.
   */
  linkPlatform(canonicalId: string, platform: Platform, platformId: string): Promise<void>;

  /** Unlink a platform identity from a canonical entity. */
  unlinkPlatform(canonicalId: string, platform: Platform): Promise<void>;

  /** List all canonical entities, optionally filtered. */
  listEntities(opts?: { operatorsOnly?: boolean; limit?: number }): Promise<CanonicalEntity[]>;

  /** Search entities by display name (case-insensitive substring match). */
  searchByName(query: string): Promise<CanonicalEntity[]>;

  /** Update the lastSeen timestamp for a platform. */
  touchLastSeen(canonicalId: string, platform: Platform): Promise<void>;

  /** Append a known fact to an entity. Deduplicates by exact string match. */
  addKnownFact(canonicalId: string, fact: string): Promise<void>;

  /** Update entity preferences (shallow merge). */
  updatePreferences(canonicalId: string, prefs: Record<string, unknown>): Promise<void>;
}

// ---------- In-Memory Implementation ----------

/**
 * In-memory entity link store for testing and single-process deployments.
 * Production deployments should use the Drizzle-backed implementation
 * once the Pg adapter is available at runtime.
 */
export class InMemoryEntityLinkStore implements EntityLinkStore {
  private entities = new Map<string, CanonicalEntity>();
  private platformIndex = new Map<string, string>(); // "platform:id" → canonical UUID

  private platformKey(platform: Platform, platformId: string): string {
    return `${platform}:${platformId}`;
  }

  async upsertEntity(input: CanonicalEntityInput): Promise<CanonicalEntity> {
    const now = Date.now();
    const existing = input.id ? this.entities.get(input.id) : undefined;

    if (existing) {
      const updated: CanonicalEntity = {
        ...existing,
        ...input,
        id: existing.id,
        firstSeen: existing.firstSeen,
        createdAt: existing.createdAt,
        updatedAt: now,
      };

      // Update platform index for any changed platformIds
      for (const [platform, oldId] of Object.entries(existing.platformIds)) {
        this.platformIndex.delete(this.platformKey(platform, oldId));
      }
      for (const [platform, newId] of Object.entries(updated.platformIds)) {
        this.platformIndex.set(this.platformKey(platform, newId), updated.id);
      }

      this.entities.set(updated.id, updated);
      return updated;
    }

    // Create new
    const id = input.id ?? crypto.randomUUID();
    const entity: CanonicalEntity = {
      displayName: input.displayName,
      trustLevel: input.trustLevel ?? 0.5,
      isOperator: input.isOperator ?? false,
      platformIds: input.platformIds ?? {},
      preferences: input.preferences ?? {},
      knownFacts: input.knownFacts ?? [],
      lastSeen: input.lastSeen ?? {},
      metadata: input.metadata ?? {},
      id,
      firstSeen: now,
      createdAt: now,
      updatedAt: now,
    };

    // Build platform index
    for (const [platform, platformId] of Object.entries(entity.platformIds)) {
      const key = this.platformKey(platform, platformId);
      const existingCanonical = this.platformIndex.get(key);
      if (existingCanonical && existingCanonical !== entity.id) {
        throw new Error(
          `Platform identity ${platform}:${platformId} is already linked to entity ${existingCanonical}`,
        );
      }
      this.platformIndex.set(key, entity.id);
    }

    this.entities.set(entity.id, entity);
    return entity;
  }

  async getById(id: string): Promise<CanonicalEntity | null> {
    return this.entities.get(id) ?? null;
  }

  async getByPlatformId(platform: Platform, platformId: string): Promise<CanonicalEntity | null> {
    const canonicalId = this.platformIndex.get(this.platformKey(platform, platformId));
    if (!canonicalId) return null;
    return this.entities.get(canonicalId) ?? null;
  }

  async linkPlatform(canonicalId: string, platform: Platform, platformId: string): Promise<void> {
    const entity = this.entities.get(canonicalId);
    if (!entity) {
      throw new Error(`Entity ${canonicalId} not found`);
    }

    const key = this.platformKey(platform, platformId);
    const existingLink = this.platformIndex.get(key);
    if (existingLink && existingLink !== canonicalId) {
      throw new Error(
        `Platform identity ${platform}:${platformId} is already linked to entity ${existingLink}`,
      );
    }

    // Remove old link for this platform if different
    const oldPlatformId = entity.platformIds[platform];
    if (oldPlatformId && oldPlatformId !== platformId) {
      this.platformIndex.delete(this.platformKey(platform, oldPlatformId));
    }

    entity.platformIds[platform] = platformId;
    entity.updatedAt = Date.now();
    this.platformIndex.set(key, canonicalId);
  }

  async unlinkPlatform(canonicalId: string, platform: Platform): Promise<void> {
    const entity = this.entities.get(canonicalId);
    if (!entity) return;

    const platformId = entity.platformIds[platform];
    if (platformId) {
      this.platformIndex.delete(this.platformKey(platform, platformId));
      delete entity.platformIds[platform];
      entity.updatedAt = Date.now();
    }
  }

  async listEntities(opts?: { operatorsOnly?: boolean; limit?: number }): Promise<CanonicalEntity[]> {
    let result = Array.from(this.entities.values());
    if (opts?.operatorsOnly) {
      result = result.filter((e) => e.isOperator);
    }
    if (opts?.limit && opts.limit > 0) {
      result = result.slice(0, opts.limit);
    }
    return result;
  }

  async searchByName(query: string): Promise<CanonicalEntity[]> {
    const lower = query.toLowerCase();
    return Array.from(this.entities.values()).filter((e) =>
      e.displayName.toLowerCase().includes(lower),
    );
  }

  async touchLastSeen(canonicalId: string, platform: Platform): Promise<void> {
    const entity = this.entities.get(canonicalId);
    if (!entity) return;
    entity.lastSeen[platform] = Date.now();
    entity.updatedAt = Date.now();
  }

  async addKnownFact(canonicalId: string, fact: string): Promise<void> {
    const entity = this.entities.get(canonicalId);
    if (!entity) return;
    if (!entity.knownFacts.includes(fact)) {
      entity.knownFacts.push(fact);
      entity.updatedAt = Date.now();
    }
  }

  async updatePreferences(canonicalId: string, prefs: Record<string, unknown>): Promise<void> {
    const entity = this.entities.get(canonicalId);
    if (!entity) return;
    entity.preferences = { ...entity.preferences, ...prefs };
    entity.updatedAt = Date.now();
  }
}

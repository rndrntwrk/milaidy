/**
 * Migration 003 — Create canonical_entities and entity_memories tables
 * for cross-platform entity linking and entity-scoped memory.
 *
 * Safe to run repeatedly (IF NOT EXISTS).
 *
 * @module autonomy/persistence/migrations/003_canonical_entities
 */

import type { AutonomyDbAdapter } from "../db-adapter.js";

const CREATE_CANONICAL_ENTITIES_SQL = `
CREATE TABLE IF NOT EXISTS canonical_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  trust_level REAL NOT NULL DEFAULT 0.5,
  is_operator BOOLEAN NOT NULL DEFAULT FALSE,
  platform_ids JSONB NOT NULL DEFAULT '{}',
  preferences JSONB NOT NULL DEFAULT '{}',
  known_facts JSONB NOT NULL DEFAULT '[]',
  last_seen JSONB NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}',
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_canonical_entities_display_name
  ON canonical_entities (display_name);
CREATE INDEX IF NOT EXISTS idx_canonical_entities_is_operator
  ON canonical_entities (is_operator);
`;

const CREATE_ENTITY_MEMORIES_SQL = `
CREATE TABLE IF NOT EXISTS entity_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_entity_id UUID NOT NULL,
  memory_tier TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  content JSONB NOT NULL,
  metadata JSONB,
  trust_score REAL NOT NULL,
  provenance JSONB NOT NULL,
  source_platform TEXT,
  source_room_id TEXT,
  embedding JSONB,
  expires_at TIMESTAMPTZ,
  session_count INTEGER NOT NULL DEFAULT 1,
  superseded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_memories_canonical_entity
  ON entity_memories (canonical_entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_memories_tier
  ON entity_memories (memory_tier);
CREATE INDEX IF NOT EXISTS idx_entity_memories_type
  ON entity_memories (memory_type);
CREATE INDEX IF NOT EXISTS idx_entity_memories_expires
  ON entity_memories (expires_at);
CREATE INDEX IF NOT EXISTS idx_entity_memories_superseded
  ON entity_memories (superseded);
CREATE INDEX IF NOT EXISTS idx_entity_memories_entity_tier
  ON entity_memories (canonical_entity_id, memory_tier);
`;

export async function createCanonicalEntitiesTables(
  adapter: AutonomyDbAdapter,
): Promise<void> {
  await adapter.executeRaw(CREATE_CANONICAL_ENTITIES_SQL);
  await adapter.executeRaw(CREATE_ENTITY_MEMORIES_SQL);
}

/**
 * Memory store interface for persistent typed memory.
 *
 * @module autonomy/memory/store
 */

import type { MemoryProvenance, MemoryType, VerifiabilityClass } from "../types.js";

export interface PersistedMemoryRecord {
  id: string;
  agentId: string;
  memoryType: MemoryType;
  content: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  provenance: MemoryProvenance;
  trustScore: number;
  verified: boolean;
  verifiabilityClass: VerifiabilityClass;
  source?: string;
  sourceType?: string;
  createdAt: number;
  updatedAt: number;
}

export interface QuarantineRecord extends PersistedMemoryRecord {
  decision?: "approved" | "rejected";
  decisionReason?: string;
  reviewedAt?: number;
  expiresAt: number;
}

/**
 * Interface for a persistent memory store.
 */
export interface MemoryStore {
  saveMemory(record: PersistedMemoryRecord): Promise<void>;
  saveQuarantine(record: QuarantineRecord): Promise<void>;
  resolveQuarantine(id: string, decision: "approved" | "rejected", reason?: string): Promise<void>;
  listPendingQuarantine(): Promise<QuarantineRecord[]>;
}

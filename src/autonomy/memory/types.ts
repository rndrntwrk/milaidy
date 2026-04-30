/**
 * Shared memory types for the autonomy kernel.
 *
 * @module autonomy/memory/types
 */

import type { Memory } from "@elizaos/core";
import type { MemoryProvenance, MemoryType, VerifiabilityClass } from "../types.js";

/**
 * A memory object enriched with trust and provenance metadata.
 */
export interface TypedMemoryObject extends Memory {
  /** Trust score at write time. */
  trustScore: number;
  /** Provenance chain. */
  provenance: MemoryProvenance;
  /** Memory classification. */
  memoryType: MemoryType;
  /** Verifiability class for this memory. */
  verifiabilityClass: VerifiabilityClass;
  /** Whether this memory has been verified. */
  verified: boolean;
}

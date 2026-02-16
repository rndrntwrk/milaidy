/**
 * GatedMemoryWriter — MemoryWriterRole implementation.
 *
 * Wraps MemoryGate to provide a role-based interface for trust-gated
 * memory writes.
 *
 * @module autonomy/roles/memory-writer
 */

import type { Memory } from "@elizaos/core";
import type {
  MemoryGate,
  MemoryGateDecision,
  MemoryGateStats,
} from "../memory/gate.js";
import type {
  MemoryWriteReport,
  MemoryWriteRequest,
  MemoryWriterRole,
} from "./types.js";

/**
 * Constructs a Memory object from a MemoryWriteRequest.
 */
function toMemory(request: MemoryWriteRequest): Memory {
  return {
    id: crypto.randomUUID(),
    agentId: request.agentId,
    userId: request.source.id,
    roomId: request.agentId,
    content: {
      text: request.content,
      ...(request.metadata ?? {}),
    },
    createdAt: Date.now(),
  } as unknown as Memory;
}

export class GatedMemoryWriter implements MemoryWriterRole {
  constructor(private readonly memoryGate: MemoryGate) {}

  async write(request: MemoryWriteRequest): Promise<MemoryGateDecision> {
    const memory = toMemory(request);
    return this.memoryGate.evaluate(memory, request.source);
  }

  async writeBatch(requests: MemoryWriteRequest[]): Promise<MemoryWriteReport> {
    const report: MemoryWriteReport = {
      total: requests.length,
      allowed: 0,
      quarantined: 0,
      rejected: 0,
    };

    for (const request of requests) {
      const decision = await this.write(request);
      switch (decision.action) {
        case "allow":
          report.allowed++;
          break;
        case "quarantine":
          report.quarantined++;
          break;
        case "reject":
          report.rejected++;
          break;
      }
    }

    return report;
  }

  getStats(): MemoryGateStats {
    return this.memoryGate.getStats();
  }
}

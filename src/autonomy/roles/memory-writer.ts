/**
 * GatedMemoryWriter — MemoryWriterRole implementation.
 *
 * Wraps MemoryGate to provide a role-based interface for trust-gated
 * memory writes.
 *
 * @module autonomy/roles/memory-writer
 */

import type { Memory } from "@elizaos/core";
import {
  recordRoleExecution,
  recordRoleLatencyMs,
} from "../metrics/prometheus-metrics.js";
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
    const startedAt = Date.now();
    try {
      const memory = toMemory(request);
      const decision = await this.memoryGate.evaluate(memory, request.source);
      recordRoleLatencyMs("memory_writer", Date.now() - startedAt);
      recordRoleExecution(
        "memory_writer",
        decision.action === "reject" ? "failure" : "success",
      );
      return decision;
    } catch (error) {
      recordRoleLatencyMs("memory_writer", Date.now() - startedAt);
      recordRoleExecution("memory_writer", "failure");
      throw error;
    }
  }

  async writeBatch(requests: MemoryWriteRequest[]): Promise<MemoryWriteReport> {
    const startedAt = Date.now();
    try {
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

      recordRoleLatencyMs("memory_writer", Date.now() - startedAt);
      recordRoleExecution(
        "memory_writer",
        report.rejected > 0 ? "failure" : "success",
      );
      return report;
    } catch (error) {
      recordRoleLatencyMs("memory_writer", Date.now() - startedAt);
      recordRoleExecution("memory_writer", "failure");
      throw error;
    }
  }

  getStats(): MemoryGateStats {
    return this.memoryGate.getStats();
  }
}

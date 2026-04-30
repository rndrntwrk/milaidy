/**
 * Tests for PgApprovalLog.
 */

import { describe, expect, it, vi } from "vitest";

import { PgApprovalLog } from "./pg-approval-log.js";
import type { AutonomyDbAdapter } from "./db-adapter.js";
import type { ApprovalRequest, ApprovalResult } from "../approval/types.js";

// ---------- Mock ----------

function makeMockAdapter(
  execFn?: ReturnType<typeof vi.fn>,
): AutonomyDbAdapter {
  return {
    executeRaw: execFn ?? vi.fn().mockResolvedValue({ rows: [], columns: [] }),
    agentId: "test-agent",
  } as unknown as AutonomyDbAdapter;
}

function makeRequest(): ApprovalRequest {
  return {
    id: "approval-1",
    call: { tool: "SHELL_EXEC", params: { command: "ls" }, source: "user", requestId: "req-1" },
    riskClass: "irreversible",
    createdAt: 1700000000000,
    expiresAt: 1700000300000,
  };
}

function makeResult(): ApprovalResult {
  return {
    id: "approval-1",
    decision: "approved",
    decidedBy: "admin",
    decidedAt: 1700000060000,
  };
}

// ---------- Tests ----------

describe("PgApprovalLog", () => {
  describe("logRequest()", () => {
    it("inserts approval request", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const log = new PgApprovalLog(makeMockAdapter(exec));

      await log.logRequest(makeRequest());

      expect(exec).toHaveBeenCalledOnce();
      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("INSERT INTO autonomy_approvals");
      expect(sql).toContain("approval-1");
      expect(sql).toContain("SHELL_EXEC");
      expect(sql).toContain("irreversible");
    });
  });

  describe("logResolution()", () => {
    it("updates approval with decision", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const log = new PgApprovalLog(makeMockAdapter(exec));

      await log.logResolution(makeResult());

      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("UPDATE autonomy_approvals");
      expect(sql).toContain("approved");
      expect(sql).toContain("admin");
    });

    it("handles null decidedBy", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const log = new PgApprovalLog(makeMockAdapter(exec));

      await log.logResolution({ id: "approval-1", decision: "expired", decidedAt: Date.now() });

      const sql = exec.mock.calls[0][0] as string;
      expect(sql).toContain("decided_by = NULL");
    });
  });

  describe("getRecent()", () => {
    it("returns entries", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [{
          id: "approval-1",
          tool_name: "SHELL_EXEC",
          risk_class: "irreversible",
          call_payload: { tool: "SHELL_EXEC" },
          decision: "approved",
          decided_by: "admin",
          created_at: "2025-01-01T00:00:00Z",
          expires_at: "2025-01-01T00:05:00Z",
          decided_at: "2025-01-01T00:01:00Z",
        }],
        columns: [],
      });
      const log = new PgApprovalLog(makeMockAdapter(exec));

      const entries = await log.getRecent(10);

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe("approval-1");
      expect(entries[0].decision).toBe("approved");
      expect(entries[0].decidedBy).toBe("admin");
    });
  });

  describe("getById()", () => {
    it("returns entry when found", async () => {
      const exec = vi.fn().mockResolvedValue({
        rows: [{ id: "approval-1", tool_name: "X", risk_class: "read-only", call_payload: {}, created_at: new Date(), expires_at: new Date() }],
        columns: [],
      });
      const log = new PgApprovalLog(makeMockAdapter(exec));

      const entry = await log.getById("approval-1");
      expect(entry).toBeDefined();
      expect(entry!.id).toBe("approval-1");
    });

    it("returns undefined when not found", async () => {
      const exec = vi.fn().mockResolvedValue({ rows: [], columns: [] });
      const log = new PgApprovalLog(makeMockAdapter(exec));

      expect(await log.getById("nonexistent")).toBeUndefined();
    });
  });
});

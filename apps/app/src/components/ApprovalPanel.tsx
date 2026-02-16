/**
 * Approval panel — view and resolve pending approval requests.
 */

import { useCallback, useEffect, useState } from "react";
import type { AutonomyApproval, AutonomyApprovalLogEntry } from "../api-client";
import { client } from "../api-client";

function RiskBadge({ risk }: { risk: string }) {
  const color =
    risk === "irreversible" ? "text-danger border-danger/30 bg-danger/10" :
    risk === "reversible" ? "text-warn border-warn/30 bg-warn/10" :
    "text-ok border-ok/30 bg-ok/10";
  return (
    <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 border ${color}`}>
      {risk}
    </span>
  );
}

function TimeAgo({ ts }: { ts: number }) {
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return <span>{secs}s ago</span>;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return <span>{mins}m ago</span>;
  const hrs = Math.floor(mins / 60);
  return <span>{hrs}h ago</span>;
}

export function ApprovalPanel() {
  const [pending, setPending] = useState<AutonomyApproval[]>([]);
  const [recent, setRecent] = useState<AutonomyApprovalLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.getApprovals();
      setPending(res.pending ?? []);
      setRecent(res.recent ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 5s
  useEffect(() => {
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [load]);

  const handleResolve = async (id: string, decision: "approved" | "denied") => {
    setResolving(id);
    try {
      await client.resolveApproval(id, decision, "ui-user");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setResolving(null);
    }
  };

  if (loading && pending.length === 0) return <div className="text-muted p-4">Loading approvals...</div>;
  if (error) return <div className="text-danger p-4">{error}</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold">
          Approval Queue
          {pending.length > 0 && (
            <span className="ml-2 text-[10px] text-accent border border-accent/30 bg-accent/10 px-1.5 py-0.5">
              {pending.length} pending
            </span>
          )}
        </h2>
        <button
          className="text-[11px] border border-border bg-bg px-2 py-1 cursor-pointer hover:border-accent hover:text-accent transition-colors"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {pending.length > 0 && (
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wide text-muted mb-2">Pending</div>
            <div className="space-y-2">
              {pending.map((a) => (
                <div key={a.id} className="border border-border bg-bg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">{a.toolName}</span>
                    <RiskBadge risk={a.riskClass} />
                  </div>
                  <div className="text-[11px] text-muted mb-2">
                    <TimeAgo ts={a.createdAt} />
                    {" "}| Expires: <TimeAgo ts={a.expiresAt} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-[11px] border border-ok text-ok px-3 py-1 cursor-pointer hover:bg-ok hover:text-white transition-colors"
                      disabled={resolving === a.id}
                      onClick={() => handleResolve(a.id, "approved")}
                    >
                      Approve
                    </button>
                    <button
                      className="text-[11px] border border-danger text-danger px-3 py-1 cursor-pointer hover:bg-danger hover:text-white transition-colors"
                      disabled={resolving === a.id}
                      onClick={() => handleResolve(a.id, "denied")}
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pending.length === 0 && (
          <div className="text-muted text-sm mb-4 p-3 border border-border bg-bg text-center">
            No pending approvals
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wide text-muted mb-2">Recent Decisions</div>
            <div className="space-y-1">
              {recent.map((e) => (
                <div key={e.id} className="border border-border bg-bg px-3 py-2 flex items-center justify-between text-[11px]">
                  <div>
                    <span className="text-txt">{e.toolName}</span>
                    <RiskBadge risk={e.riskClass} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={e.decision === "approved" ? "text-ok" : e.decision === "denied" ? "text-danger" : "text-muted"}>
                      {e.decision}
                    </span>
                    {e.decidedBy && <span className="text-muted">by {e.decidedBy}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

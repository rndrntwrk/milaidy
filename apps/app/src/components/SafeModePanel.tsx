/**
 * Safe mode panel — status and exit control.
 */

import { useCallback, useEffect, useState } from "react";
import { client } from "../api-client";

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 border border-border bg-bg min-w-[80px]">
      <div className={`text-lg font-bold tabular-nums ${accent ? "text-accent" : ""}`}>{value}</div>
      <div className="text-[10px] text-muted uppercase tracking-wide mt-0.5">{label}</div>
    </div>
  );
}

export function SafeModePanel() {
  const [status, setStatus] = useState<{ active: boolean; consecutiveErrors: number; state: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.getSafeModeStatus();
      setStatus(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Auto-refresh every 3s
  useEffect(() => {
    const interval = setInterval(() => void load(), 3000);
    return () => clearInterval(interval);
  }, [load]);

  const handleExit = async () => {
    setExiting(true);
    try {
      const res = await client.exitSafeMode();
      if (!res.ok) setError(res.error ?? "Failed to exit safe mode");
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExiting(false);
    }
  };

  if (loading && !status) return <div className="text-muted p-4">Loading safe mode status...</div>;
  if (error && !status) return <div className="text-danger p-4">{error}</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold">Safe Mode</h2>
        <button
          className="text-[11px] border border-border bg-bg px-2 py-1 cursor-pointer hover:border-accent hover:text-accent transition-colors"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {error && <div className="text-danger text-[11px] mb-3">{error}</div>}

        <div className="flex gap-3 mb-4">
          <Stat label="Status" value={status?.active ? "ACTIVE" : "INACTIVE"} accent={status?.active} />
          <Stat label="Errors" value={status?.consecutiveErrors ?? 0} />
          <Stat label="State" value={status?.state ?? "—"} />
        </div>

        {status?.active && (
          <div className="border border-warn bg-warn/10 p-4 mb-4">
            <div className="text-sm font-semibold text-warn mb-2">Safe Mode Active</div>
            <p className="text-[12px] text-muted mb-3">
              The autonomy kernel has entered safe mode due to consecutive errors.
              All tool executions are paused until safe mode is exited.
            </p>
            <button
              className="text-[11px] border border-warn text-warn px-3 py-1 cursor-pointer hover:bg-warn hover:text-white transition-colors"
              onClick={handleExit}
              disabled={exiting}
            >
              {exiting ? "Requesting Exit..." : "Request Safe Mode Exit"}
            </button>
          </div>
        )}

        {!status?.active && (
          <div className="border border-ok bg-ok/10 p-4">
            <div className="text-sm font-semibold text-ok mb-1">System Normal</div>
            <p className="text-[12px] text-muted">
              The autonomy kernel is operating normally. Safe mode will activate
              automatically if consecutive errors exceed the configured threshold.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

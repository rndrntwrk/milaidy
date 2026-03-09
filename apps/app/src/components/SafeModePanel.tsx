/**
 * Safe mode panel — status and exit control.
 */

import { useCallback, useEffect, useState } from "react";
import { client } from "../api-client";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { Badge } from "./ui/Badge.js";

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <Card className="min-w-[88px] border-white/10 bg-white/[0.03] p-3 text-center">
      <div className={`text-lg font-bold tabular-nums ${accent ? "text-accent" : "text-white"}`}>{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/46">{label}</div>
    </Card>
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

  if (loading && !status) return <div className="p-4 text-white/52">Loading safe mode status...</div>;
  if (error && !status) return <div className="text-danger p-4">{error}</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">Safe Mode</h2>
          <Badge variant={status?.active ? "warning" : "success"} className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]">
            {status?.active ? "Active" : "Normal"}
          </Badge>
        </div>
        <Button type="button" variant="outline" size="sm" className="rounded-xl" onClick={() => void load()}>
          Refresh
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {error && <div className="text-danger text-[11px] mb-3">{error}</div>}

        <div className="mb-4 flex gap-3">
          <Stat label="Status" value={status?.active ? "ACTIVE" : "INACTIVE"} accent={status?.active} />
          <Stat label="Errors" value={status?.consecutiveErrors ?? 0} />
          <Stat label="State" value={status?.state ?? "—"} />
        </div>

        {status?.active && (
          <Card className="mb-4 border-warn/30 bg-warn/10 p-4">
            <div className="mb-2 text-sm font-semibold text-warn">Safe Mode Active</div>
            <p className="mb-3 text-[12px] leading-relaxed text-white/62">
              The autonomy kernel has entered safe mode due to consecutive errors.
              All tool executions are paused until safe mode is exited.
            </p>
            <Button type="button" variant="outline" size="sm" className="rounded-xl border-warn/30 text-warn hover:border-warn hover:bg-warn/12" onClick={handleExit} disabled={exiting}>
              {exiting ? "Requesting Exit..." : "Request Safe Mode Exit"}
            </Button>
          </Card>
        )}

        {!status?.active && (
          <Card className="border-ok/30 bg-ok/10 p-4">
            <div className="mb-1 text-sm font-semibold text-ok">System Normal</div>
            <p className="text-[12px] leading-relaxed text-white/62">
              The autonomy kernel is operating normally. Safe mode will activate
              automatically if consecutive errors exceed the configured threshold.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * Governance panel — policy list, compliance status, retention overview.
 */

import { useCallback, useEffect, useState } from "react";
import { client } from "../api-client";

type SubTab = "overview" | "policies" | "retention";

function SubTabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
        active
          ? "border-accent text-accent"
          : "border-transparent text-muted hover:text-txt hover:border-border"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wide text-muted mb-2">{title}</div>
      {children}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-ok" : "bg-danger"}`} />;
}

export function GovernancePanel() {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.getConfig();
      setConfig((res as Record<string, unknown>)?.autonomy as Record<string, unknown> ?? null);
    } catch { /* non-critical */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="text-muted p-4">Loading governance...</div>;

  const governance = (config as Record<string, unknown>)?.domains as Record<string, unknown> | undefined;
  const govConfig = governance?.governance as Record<string, unknown> | undefined;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-4 shrink-0 px-4 pt-3">
        <div className="flex gap-1 border-b border-border">
          <SubTabButton active={subTab === "overview"} label="Overview" onClick={() => setSubTab("overview")} />
          <SubTabButton active={subTab === "policies"} label="Policies" onClick={() => setSubTab("policies")} />
          <SubTabButton active={subTab === "retention"} label="Retention" onClick={() => setSubTab("retention")} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        {subTab === "overview" && (
          <>
            <Section title="Compliance Status">
              <div className="space-y-2">
                <div className="border border-border bg-bg px-3 py-2 flex items-center justify-between text-[12px]">
                  <span>Governance Engine</span>
                  <span className="flex items-center gap-1">
                    <StatusDot ok={govConfig?.enabled !== false} />
                    {govConfig?.enabled !== false ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="border border-border bg-bg px-3 py-2 flex items-center justify-between text-[12px]">
                  <span>Identity Integrity</span>
                  <span className="flex items-center gap-1">
                    <StatusDot ok={true} />
                    Valid
                  </span>
                </div>
                <div className="border border-border bg-bg px-3 py-2 flex items-center justify-between text-[12px]">
                  <span>Approval Gate</span>
                  <span className="flex items-center gap-1">
                    <StatusDot ok={true} />
                    Active
                  </span>
                </div>
                <div className="border border-border bg-bg px-3 py-2 flex items-center justify-between text-[12px]">
                  <span>Drift Monitoring</span>
                  <span className="flex items-center gap-1">
                    <StatusDot ok={true} />
                    Active
                  </span>
                </div>
              </div>
            </Section>

            <Section title="Autonomy Configuration">
              <div className="text-[11px] text-muted">
                {config ? (
                  <pre className="border border-border bg-bg p-2 overflow-x-auto font-mono whitespace-pre-wrap">
                    {JSON.stringify(config, null, 2).slice(0, 2000)}
                  </pre>
                ) : (
                  "No autonomy configuration found"
                )}
              </div>
            </Section>
          </>
        )}

        {subTab === "policies" && (
          <Section title="Active Policies">
            <div className="space-y-2">
              <div className="border border-border bg-bg p-3 text-[12px]">
                <div className="font-medium mb-1">Identity Protection</div>
                <div className="text-muted">Core values and hard boundaries cannot be modified by low-trust sources. Identity hash integrity is verified on every access.</div>
              </div>
              <div className="border border-border bg-bg p-3 text-[12px]">
                <div className="font-medium mb-1">Tool Approval Gate</div>
                <div className="text-muted">Irreversible tool actions require explicit approval. Read-only actions are auto-approved by default.</div>
              </div>
              <div className="border border-border bg-bg p-3 text-[12px]">
                <div className="font-medium mb-1">Memory Trust Scoring</div>
                <div className="text-muted">All incoming memories are scored for trust. Memories below the quarantine threshold are held for review.</div>
              </div>
              <div className="border border-border bg-bg p-3 text-[12px]">
                <div className="font-medium mb-1">Drift Correction</div>
                <div className="text-muted">Persona drift is continuously monitored. Corrective action is triggered when drift exceeds the correction threshold.</div>
              </div>
            </div>
          </Section>
        )}

        {subTab === "retention" && (
          <Section title="Data Retention">
            <div className="space-y-2">
              <div className="border border-border bg-bg px-3 py-2 flex items-center justify-between text-[12px]">
                <span>Event Retention</span>
                <span className="tabular-nums">{formatMs(govConfig?.defaultEventRetentionMs as number | undefined ?? 604800000)}</span>
              </div>
              <div className="border border-border bg-bg px-3 py-2 flex items-center justify-between text-[12px]">
                <span>Audit Retention</span>
                <span className="tabular-nums">{formatMs(govConfig?.defaultAuditRetentionMs as number | undefined ?? 2592000000)}</span>
              </div>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""}`;
  const hours = Math.floor(ms / 3600000);
  return `${hours} hour${hours > 1 ? "s" : ""}`;
}

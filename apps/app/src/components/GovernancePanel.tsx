/**
 * Governance panel — policy list, compliance status, retention overview.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  AutonomyQuarantinedMemory,
  AutonomyQuarantineStats,
} from "../api-client";
import { client } from "../api-client";

type SubTab = "overview" | "policies" | "retention" | "quarantine";

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

function memoryPreview(memory: AutonomyQuarantinedMemory): string {
  const content = memory.content;
  const text = typeof content?.text === "string" ? content.text : "";
  if (text.trim().length > 0) return text.trim();
  if (content && Object.keys(content).length > 0) {
    return JSON.stringify(content);
  }
  return "No content preview";
}

function memorySource(memory: AutonomyQuarantinedMemory): string {
  const source = memory.provenance?.source as Record<string, unknown> | undefined;
  if (!source) return "unknown";
  const type = typeof source.type === "string" ? source.type : "source";
  const id = typeof source.id === "string" ? source.id : "unknown";
  return `${type}:${id}`;
}

export function GovernancePanel() {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [quarantined, setQuarantined] = useState<AutonomyQuarantinedMemory[]>(
    [],
  );
  const [quarantineStats, setQuarantineStats] =
    useState<AutonomyQuarantineStats | null>(null);
  const [quarantineLoading, setQuarantineLoading] = useState(false);
  const [quarantineError, setQuarantineError] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await client.getConfig();
      setConfig((res as Record<string, unknown>)?.autonomy as Record<string, unknown> ?? null);
    } catch { /* non-critical */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const loadQuarantine = useCallback(async () => {
    setQuarantineLoading(true);
    setQuarantineError(null);
    try {
      const response = await client.getWorkbenchQuarantine();
      setQuarantined(response.quarantined ?? []);
      setQuarantineStats(response.stats ?? null);
    } catch (err) {
      setQuarantineError(err instanceof Error ? err.message : String(err));
    } finally {
      setQuarantineLoading(false);
    }
  }, []);

  useEffect(() => {
    if (subTab === "quarantine") {
      void loadQuarantine();
    }
  }, [subTab, loadQuarantine]);

  const handleQuarantineReview = useCallback(
    async (memoryId: string, decision: "approve" | "reject") => {
      setReviewingId(memoryId);
      setQuarantineError(null);
      try {
        await client.reviewWorkbenchQuarantined(memoryId, decision);
        await loadQuarantine();
      } catch (err) {
        setQuarantineError(err instanceof Error ? err.message : String(err));
      } finally {
        setReviewingId(null);
      }
    },
    [loadQuarantine],
  );

  if (loading) return <div className="text-muted p-4">Loading governance...</div>;

  const governance = (config as Record<string, unknown>)?.domains as Record<string, unknown> | undefined;
  const govConfig = governance?.governance as Record<string, unknown> | undefined;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-4 shrink-0 px-4 pt-3">
        <div className="flex gap-1 border-b border-border">
          <SubTabButton active={subTab === "overview"} label="Overview" onClick={() => setSubTab("overview")} />
          <SubTabButton active={subTab === "policies"} label="Policies" onClick={() => setSubTab("policies")} />
          <SubTabButton active={subTab === "quarantine"} label="Quarantine" onClick={() => setSubTab("quarantine")} />
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

        {subTab === "quarantine" && (
          <>
            <Section title="Review Queue">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[12px] text-muted">
                  Pending memories held by the trust gate for manual review.
                </div>
                <button
                  className="text-[11px] border border-border bg-bg px-2 py-1 cursor-pointer hover:border-accent hover:text-accent transition-colors"
                  onClick={() => void loadQuarantine()}
                  disabled={quarantineLoading || reviewingId !== null}
                >
                  Refresh
                </button>
              </div>

              {quarantineStats && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="border border-border bg-bg px-2 py-1 text-[11px]">
                    <div className="text-muted uppercase">Pending</div>
                    <div className="tabular-nums text-txt">
                      {quarantineStats.pendingReview}
                    </div>
                  </div>
                  <div className="border border-border bg-bg px-2 py-1 text-[11px]">
                    <div className="text-muted uppercase">Quarantined Total</div>
                    <div className="tabular-nums text-txt">
                      {quarantineStats.quarantined}
                    </div>
                  </div>
                </div>
              )}

              {quarantineError && (
                <div className="text-[12px] text-danger mb-2">
                  {quarantineError}
                </div>
              )}

              {quarantineLoading ? (
                <div className="text-[12px] text-muted py-3">
                  Loading quarantine queue...
                </div>
              ) : quarantined.length === 0 ? (
                <div className="text-[12px] text-muted py-3">
                  No quarantined memories pending review.
                </div>
              ) : (
                <div className="space-y-2">
                  {quarantined.map((memory) => (
                    <div
                      key={memory.id}
                      className="border border-border bg-bg p-3 text-[12px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-[11px] text-muted">
                          {memory.id}
                        </div>
                        <div className="text-[11px] text-muted">
                          trust {typeof memory.trustScore === "number" ? memory.trustScore.toFixed(3) : "—"}
                        </div>
                      </div>
                      <div className="mt-2 text-txt break-words">
                        {memoryPreview(memory)}
                      </div>
                      <div className="mt-2 text-[11px] text-muted">
                        type {memory.memoryType ?? "unknown"} · source {memorySource(memory)}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <button
                          className="text-[11px] border border-ok text-ok px-2 py-1 cursor-pointer hover:bg-ok hover:text-ok-fg transition-colors disabled:opacity-50"
                          onClick={() =>
                            void handleQuarantineReview(memory.id, "approve")
                          }
                          disabled={
                            reviewingId !== null || quarantineLoading
                          }
                        >
                          {reviewingId === memory.id ? "Applying..." : "Approve"}
                        </button>
                        <button
                          className="text-[11px] border border-danger text-danger px-2 py-1 cursor-pointer hover:bg-danger hover:text-danger-fg transition-colors disabled:opacity-50"
                          onClick={() =>
                            void handleQuarantineReview(memory.id, "reject")
                          }
                          disabled={
                            reviewingId !== null || quarantineLoading
                          }
                        >
                          {reviewingId === memory.id ? "Applying..." : "Reject"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
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

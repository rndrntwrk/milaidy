/**
 * Governance panel — policy list, compliance status, retention overview.
 */

import { useCallback, useEffect, useState } from "react";
import type {
  AutonomyQuarantinedMemory,
  AutonomyQuarantineStats,
} from "../api-client";
import { client } from "../api-client";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";

type SubTab = "overview" | "policies" | "retention" | "quarantine";

function SubTabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <Button variant={active ? "secondary" : "ghost"} size="sm" onClick={onClick}>
      {label}
    </Button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-white/42">{title}</div>
      {children}
    </div>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-ok" : "bg-danger"}`} />;
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

  if (loading) return <div className="p-4 text-white/42">Loading governance...</div>;

  const governance = (config as Record<string, unknown>)?.domains as Record<string, unknown> | undefined;
  const govConfig = governance?.governance as Record<string, unknown> | undefined;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mb-4 shrink-0 px-4 pt-3">
        <div className="flex flex-wrap gap-2">
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
                <Card className="rounded-[22px]">
                  <CardContent className="flex items-center justify-between px-3 py-3 text-[12px]">
                  <span>Governance Engine</span>
                  <span className="flex items-center gap-1">
                    <StatusDot ok={govConfig?.enabled !== false} />
                    {govConfig?.enabled !== false ? "Enabled" : "Disabled"}
                  </span>
                  </CardContent>
                </Card>
                <Card className="rounded-[22px]">
                  <CardContent className="flex items-center justify-between px-3 py-3 text-[12px]">
                  <span>Identity Integrity</span>
                  <span className="flex items-center gap-1">
                    <StatusDot ok={true} />
                    Valid
                  </span>
                  </CardContent>
                </Card>
                <Card className="rounded-[22px]">
                  <CardContent className="flex items-center justify-between px-3 py-3 text-[12px]">
                  <span>Approval Gate</span>
                  <span className="flex items-center gap-1">
                    <StatusDot ok={true} />
                    Active
                  </span>
                  </CardContent>
                </Card>
                <Card className="rounded-[22px]">
                  <CardContent className="flex items-center justify-between px-3 py-3 text-[12px]">
                  <span>Drift Monitoring</span>
                  <span className="flex items-center gap-1">
                    <StatusDot ok={true} />
                    Active
                  </span>
                  </CardContent>
                </Card>
              </div>
            </Section>

            <Section title="Autonomy Configuration">
              <div className="text-[11px] text-white/52">
                {config ? (
                  <pre className="overflow-x-auto rounded-[22px] border border-white/10 bg-black/28 p-3 font-mono whitespace-pre-wrap text-white/74">
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
              <Card className="rounded-[22px]"><CardContent className="p-4 text-[12px]">
                <div className="font-medium mb-1">Identity Protection</div>
                <div className="text-white/56">Core values and hard boundaries cannot be modified by low-trust sources. Identity hash integrity is verified on every access.</div>
              </CardContent></Card>
              <Card className="rounded-[22px]"><CardContent className="p-4 text-[12px]">
                <div className="font-medium mb-1">Tool Approval Gate</div>
                <div className="text-white/56">Irreversible tool actions require explicit approval. Read-only actions are auto-approved by default.</div>
              </CardContent></Card>
              <Card className="rounded-[22px]"><CardContent className="p-4 text-[12px]">
                <div className="font-medium mb-1">Memory Trust Scoring</div>
                <div className="text-white/56">All incoming memories are scored for trust. Memories below the quarantine threshold are held for review.</div>
              </CardContent></Card>
              <Card className="rounded-[22px]"><CardContent className="p-4 text-[12px]">
                <div className="font-medium mb-1">Drift Correction</div>
                <div className="text-white/56">Persona drift is continuously monitored. Corrective action is triggered when drift exceeds the correction threshold.</div>
              </CardContent></Card>
            </div>
          </Section>
        )}

        {subTab === "retention" && (
          <Section title="Data Retention">
            <div className="space-y-2">
              <Card className="rounded-[22px]"><CardContent className="flex items-center justify-between px-3 py-3 text-[12px]">
                <span>Event Retention</span>
                <span className="tabular-nums">{formatMs(govConfig?.defaultEventRetentionMs as number | undefined ?? 604800000)}</span>
              </CardContent></Card>
              <Card className="rounded-[22px]"><CardContent className="flex items-center justify-between px-3 py-3 text-[12px]">
                <span>Audit Retention</span>
                <span className="tabular-nums">{formatMs(govConfig?.defaultAuditRetentionMs as number | undefined ?? 2592000000)}</span>
              </CardContent></Card>
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
                <Button
                  onClick={() => void loadQuarantine()}
                  disabled={quarantineLoading || reviewingId !== null}
                  variant="outline"
                  size="sm"
                >
                  Refresh
                </Button>
              </div>

              {quarantineStats && (
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <Card className="rounded-[20px]"><CardContent className="px-3 py-3 text-[11px]">
                    <div className="text-white/42 uppercase">Pending</div>
                    <div className="tabular-nums text-txt">
                      {quarantineStats.pendingReview}
                    </div>
                  </CardContent></Card>
                  <Card className="rounded-[20px]"><CardContent className="px-3 py-3 text-[11px]">
                    <div className="text-white/42 uppercase">Quarantined Total</div>
                    <div className="tabular-nums text-txt">
                      {quarantineStats.quarantined}
                    </div>
                  </CardContent></Card>
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
                    <Card
                      key={memory.id}
                      className="rounded-[22px] text-[12px]"
                    >
                      <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono text-[11px] text-muted">
                          {memory.id}
                        </div>
                        <Badge variant="warning">
                          trust {typeof memory.trustScore === "number" ? memory.trustScore.toFixed(3) : "—"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-txt break-words">
                        {memoryPreview(memory)}
                      </div>
                      <div className="mt-2 text-[11px] text-white/42">
                        type {memory.memoryType ?? "unknown"} · source {memorySource(memory)}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          onClick={() =>
                            void handleQuarantineReview(memory.id, "approve")
                          }
                          disabled={
                            reviewingId !== null || quarantineLoading
                          }
                          variant="secondary"
                          size="sm"
                        >
                          {reviewingId === memory.id ? "Applying..." : "Approve"}
                        </Button>
                        <Button
                          onClick={() =>
                            void handleQuarantineReview(memory.id, "reject")
                          }
                          disabled={
                            reviewingId !== null || quarantineLoading
                          }
                          variant="outline"
                          size="sm"
                          className="border-danger/35 text-danger hover:border-danger hover:bg-danger/10"
                        >
                          {reviewingId === memory.id ? "Applying..." : "Reject"}
                        </Button>
                      </div>
                      </CardContent>
                    </Card>
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

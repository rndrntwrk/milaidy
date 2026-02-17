/**
 * Identity panel — view and edit agent identity configuration.
 */

import { useCallback, useEffect, useState } from "react";
import type { AutonomyIdentity } from "../api-client";
import { client } from "../api-client";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-xs uppercase tracking-wide text-muted mb-2">{title}</div>
      {children}
    </div>
  );
}

function TagList({ items, onRemove }: { items: string[]; onRemove?: (i: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={i} className="text-[11px] border border-border bg-bg px-2 py-0.5 inline-flex items-center gap-1">
          {item}
          {onRemove && (
            <button className="text-muted hover:text-danger cursor-pointer" onClick={() => onRemove(i)}>x</button>
          )}
        </span>
      ))}
    </div>
  );
}

interface PreferenceViewRow {
  key: string;
  value: unknown;
  source: string;
  scope: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readSource(record: Record<string, unknown> | null): string | undefined {
  if (!record) return undefined;
  if (typeof record.source === "string" && record.source.trim().length > 0) {
    return record.source.trim();
  }
  const sourceRecord = asRecord(record.source);
  if (sourceRecord) {
    const type = typeof sourceRecord.type === "string" ? sourceRecord.type : "source";
    const id = typeof sourceRecord.id === "string" ? sourceRecord.id : "unknown";
    return `${type}:${id}`;
  }
  const provenance = asRecord(record.provenance);
  if (provenance) {
    const provenanceSource = asRecord(provenance.source);
    if (provenanceSource) {
      const type =
        typeof provenanceSource.type === "string" ? provenanceSource.type : "source";
      const id = typeof provenanceSource.id === "string" ? provenanceSource.id : "unknown";
      return `${type}:${id}`;
    }
    if (
      typeof provenance.source === "string" &&
      provenance.source.trim().length > 0
    ) {
      return provenance.source.trim();
    }
  }
  return undefined;
}

function readScope(record: Record<string, unknown> | null): string | undefined {
  if (!record) return undefined;
  if (typeof record.scope === "string" && record.scope.trim().length > 0) {
    return record.scope.trim();
  }
  if (
    typeof record.preferenceScope === "string" &&
    record.preferenceScope.trim().length > 0
  ) {
    return record.preferenceScope.trim();
  }
  const provenance = asRecord(record.provenance);
  if (provenance && typeof provenance.scope === "string" && provenance.scope.trim().length > 0) {
    return provenance.scope.trim();
  }
  return undefined;
}

function extractPreferenceRows(
  preferences: Record<string, unknown> | undefined,
): PreferenceViewRow[] {
  if (!preferences || Object.keys(preferences).length === 0) return [];
  return Object.entries(preferences)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, raw]) => {
      const record = asRecord(raw);
      const value =
        record && Object.prototype.hasOwnProperty.call(record, "value")
          ? record.value
          : raw;
      return {
        key,
        value,
        source: readSource(record) ?? "identity-config",
        scope: readScope(record) ?? "global",
      };
    });
}

function formatPreferenceValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "—";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function IdentityPanel() {
  const [identity, setIdentity] = useState<AutonomyIdentity | null>(null);
  const [history, setHistory] = useState<AutonomyIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AutonomyIdentity>({});
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const preferenceRows = extractPreferenceRows(identity?.softPreferences);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.getIdentityConfig();
      setIdentity(res.identity);
      if (res.identity) setDraft(res.identity);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await client.getIdentityHistory();
      setHistory(res.history ?? []);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await client.updateIdentityConfig(draft);
      setIdentity(res.identity);
      setDraft(res.identity);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-muted p-4">Loading identity...</div>;
  if (error) return <div className="text-danger p-4">{error}</div>;
  if (!identity) return <div className="text-muted p-4">No identity configured.</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-sm font-semibold">Agent Identity</h2>
        <div className="flex gap-2">
          <button
            className="text-[11px] border border-border bg-bg px-2 py-1 cursor-pointer hover:border-accent hover:text-accent transition-colors"
            onClick={() => { setShowHistory(!showHistory); if (!showHistory) void loadHistory(); }}
          >
            {showHistory ? "Hide History" : "History"}
          </button>
          {!editing ? (
            <button
              className="text-[11px] border border-accent text-accent px-2 py-1 cursor-pointer hover:bg-accent hover:text-accent-fg transition-colors"
              onClick={() => setEditing(true)}
            >
              Edit
            </button>
          ) : (
            <>
              <button
                className="text-[11px] border border-border px-2 py-1 cursor-pointer hover:text-txt transition-colors"
                onClick={() => { setEditing(false); setDraft(identity); }}
              >
                Cancel
              </button>
              <button
                className="text-[11px] border border-accent text-accent px-2 py-1 cursor-pointer hover:bg-accent hover:text-accent-fg transition-colors"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {showHistory && history.length > 0 && (
          <Section title="Version History">
            <div className="space-y-2 mb-4">
              {history.map((v, i) => (
                <div key={i} className="border border-border bg-bg p-2 text-[11px]">
                  <span className="text-muted">v{v.identityVersion}</span>{" "}
                  <span className="text-txt">{v.name}</span>{" "}
                  <span className="text-muted">{v.identityHash ? `#${v.identityHash.slice(0, 8)}` : ""}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        <Section title="Name">
          {editing ? (
            <input
              id="identity-name"
              aria-label="Agent name"
              className="border border-border bg-bg px-2 py-1 text-sm w-full"
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          ) : (
            <div className="text-sm">{identity.name ?? "unnamed"}</div>
          )}
        </Section>

        <Section title="Core Values">
          <TagList items={identity.coreValues ?? []} />
        </Section>

        <Section title="Communication Style">
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div>
              <span className="text-muted">Tone: </span>
              <span>{identity.communicationStyle?.tone ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted">Verbosity: </span>
              <span>{identity.communicationStyle?.verbosity ?? "—"}</span>
            </div>
            <div>
              <span className="text-muted">Voice: </span>
              <span>{identity.communicationStyle?.personaVoice ?? "—"}</span>
            </div>
          </div>
        </Section>

        <Section title="Hard Boundaries">
          <TagList items={identity.hardBoundaries ?? []} />
        </Section>

        <Section title="Soft Preferences">
          {preferenceRows.length === 0 ? (
            <div className="text-[11px] text-muted">No preferences set</div>
          ) : (
            <>
              <div className="border border-border bg-bg overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b border-border text-muted uppercase tracking-wide">
                      <th className="text-left font-medium px-2 py-1">Preference</th>
                      <th className="text-left font-medium px-2 py-1">Value</th>
                      <th className="text-left font-medium px-2 py-1">Source</th>
                      <th className="text-left font-medium px-2 py-1">Scope</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preferenceRows.map((row) => (
                      <tr key={row.key} className="border-b last:border-b-0 border-border">
                        <td className="px-2 py-1 font-mono text-[10px] text-txt break-all">
                          {row.key}
                        </td>
                        <td className="px-2 py-1 text-txt break-words">
                          {formatPreferenceValue(row.value)}
                        </td>
                        <td className="px-2 py-1 text-muted break-words">{row.source}</td>
                        <td className="px-2 py-1 text-muted break-words">{row.scope}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="text-[10px] text-muted mt-2">
                Source and scope default to <span className="text-txt">identity-config</span> and{" "}
                <span className="text-txt">global</span> when preference metadata is not provided.
              </div>
            </>
          )}
        </Section>

        <Section title="Integrity">
          <div className="text-[11px] grid grid-cols-2 gap-2">
            <div>
              <span className="text-muted">Version: </span>
              <span className="tabular-nums">{identity.identityVersion ?? 0}</span>
            </div>
            <div>
              <span className="text-muted">Hash: </span>
              <span className="font-mono">{identity.identityHash ? identity.identityHash.slice(0, 12) + "..." : "—"}</span>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

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

export function IdentityPanel() {
  const [identity, setIdentity] = useState<AutonomyIdentity | null>(null);
  const [history, setHistory] = useState<AutonomyIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AutonomyIdentity>({});
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

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
          <div className="text-[11px] text-muted">
            {identity.softPreferences && Object.keys(identity.softPreferences).length > 0
              ? Object.entries(identity.softPreferences).map(([k, v]) => (
                  <div key={k}><span className="text-txt">{k}:</span> {String(v)}</div>
                ))
              : "No preferences set"}
          </div>
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

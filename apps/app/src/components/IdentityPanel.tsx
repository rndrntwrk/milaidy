/**
 * Identity panel — view and edit agent identity configuration.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AutonomyIdentity } from "../api-client";
import { client } from "../api-client";
import { FormFieldStack } from "./FormFieldStack.js";
import { SectionEmptyState, SectionErrorState, SectionLoadingState } from "./SectionStates.js";
import { SectionShell } from "./SectionShell.js";
import { SummaryStatRow } from "./SummaryStatRow.js";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Input } from "./ui/Input.js";

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
      const id =
        typeof provenanceSource.id === "string" ? provenanceSource.id : "unknown";
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
  if (
    provenance &&
    typeof provenance.scope === "string" &&
    provenance.scope.trim().length > 0
  ) {
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

function TagGroup({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <SectionShell title={title} className="border-white/6 bg-white/[0.02]">
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <Badge
              key={item}
              variant="outline"
              className="rounded-full px-3 py-1.5 text-xs text-white/72"
            >
              {item}
            </Badge>
          ))}
        </div>
      ) : (
        <SectionEmptyState
          title={emptyLabel}
          description="No entries are configured for this identity surface."
          className="border-none bg-transparent shadow-none"
        />
      )}
    </SectionShell>
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
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  const communicationStats = useMemo(
    () => [
      {
        label: "Tone",
        value: identity?.communicationStyle?.tone ?? "Unset",
      },
      {
        label: "Verbosity",
        value: identity?.communicationStyle?.verbosity ?? "Unset",
      },
      {
        label: "Voice",
        value: identity?.communicationStyle?.personaVoice ?? "Unset",
      },
    ],
    [identity?.communicationStyle?.personaVoice, identity?.communicationStyle?.tone, identity?.communicationStyle?.verbosity],
  );

  const integrityStats = useMemo(
    () => [
      {
        label: "Version",
        value: String(identity?.identityVersion ?? 0),
      },
      {
        label: "Hash",
        value: identity?.identityHash ? `${identity.identityHash.slice(0, 12)}…` : "Unavailable",
      },
    ],
    [identity?.identityHash, identity?.identityVersion],
  );

  if (loading) {
    return (
      <SectionLoadingState
        title="Loading identity"
        description="Pulling the current public profile and persona settings."
      />
    );
  }

  if (error) {
    return (
      <SectionErrorState
        title="Identity unavailable"
        description="The identity surface could not load right now."
        actionLabel="Retry"
        onAction={() => void load()}
        details={error}
      />
    );
  }

  if (!identity) {
    return (
      <SectionEmptyState
        title="No identity configured"
        description="Create or import an identity profile to drive the public-facing persona."
        actionLabel="Refresh"
        onAction={() => void load()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionShell
        title="Profile"
        description="Public-facing name and integrity for the active identity."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => {
                setShowHistory((current) => {
                  const next = !current;
                  if (next) void loadHistory();
                  return next;
                });
              }}
            >
              {showHistory ? "Hide history" : "History"}
            </Button>
            {!editing ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-full"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    setEditing(false);
                    setDraft(identity);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
          <FormFieldStack
            label="Display name"
            help="This is the visible identity used when the agent speaks or appears in public-facing surfaces."
          >
            {editing ? (
              <Input
                id="identity-name"
                aria-label="Agent name"
                value={draft.name ?? ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/88">
                {identity.name ?? "unnamed"}
              </div>
            )}
          </FormFieldStack>
          <SummaryStatRow items={integrityStats} />
        </div>
      </SectionShell>

      {showHistory ? (
        <SectionShell
          title="Version history"
          description="Recent identity revisions currently stored for this profile."
        >
          {history.length > 0 ? (
            <div className="space-y-2">
              {history.map((version) => (
                <div
                  key={`${version.identityVersion}-${version.identityHash ?? "draft"}`}
                  className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm text-white/86">
                    <span className="font-medium">{version.name ?? "Unnamed identity"}</span>
                    <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px]">
                      v{version.identityVersion ?? 0}
                    </Badge>
                    {version.identityHash ? (
                      <Badge variant="outline" className="rounded-full px-2.5 py-1 text-[10px] text-white/60">
                        {version.identityHash.slice(0, 10)}…
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <SectionEmptyState
              title="No history yet"
              description="Identity revisions will appear here after more changes are saved."
              className="border-none bg-transparent shadow-none"
            />
          )}
        </SectionShell>
      ) : null}

      <SectionShell
        title="Communication style"
        description="Tone, verbosity, and persona voice used for the public-facing agent."
      >
        <SummaryStatRow items={communicationStats} />
      </SectionShell>

      <div className="grid gap-4 xl:grid-cols-2">
        <TagGroup
          title="Core values"
          items={identity.coreValues ?? []}
          emptyLabel="No core values configured"
        />
        <TagGroup
          title="Boundaries"
          items={identity.hardBoundaries ?? []}
          emptyLabel="No boundaries configured"
        />
      </div>

      <SectionShell
        title="Preference sources"
        description="Resolved preference values and where they came from."
      >
        {preferenceRows.length === 0 ? (
          <SectionEmptyState
            title="No soft preferences configured"
            description="Preference metadata will appear here when identity-level overrides exist."
            className="border-none bg-transparent shadow-none"
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/8 text-left text-[11px] uppercase tracking-[0.14em] text-white/44">
                  <th className="px-4 py-3 font-medium">Preference</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Scope</th>
                </tr>
              </thead>
              <tbody>
                {preferenceRows.map((row) => (
                  <tr key={row.key} className="border-b border-white/6 last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs text-white/76">{row.key}</td>
                    <td className="px-4 py-3 text-white/86">{formatPreferenceValue(row.value)}</td>
                    <td className="px-4 py-3 text-white/56">{row.source}</td>
                    <td className="px-4 py-3 text-white/56">{row.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionShell>
    </div>
  );
}

/**
 * Secrets Vault — user-curated view of API keys and credentials.
 *
 * Only shows secrets the user has explicitly added to their vault (persisted in
 * localStorage) plus any that are already set in the environment. Users browse
 * available secrets from plugins and pick which ones to manage here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SecretInfo } from "../api-client";
import { client } from "../api-client";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/Card";
import { Dialog } from "./ui/Dialog";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "./ui/Icons";

const STORAGE_KEY = "milady:secrets-vault-keys";

const CATEGORY_ORDER = [
  "ai-provider",
  "blockchain",
  "connector",
  "auth",
  "other",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  "ai-provider": "AI Providers",
  blockchain: "Blockchain",
  connector: "Connectors",
  auth: "Authentication",
  other: "Other",
};

type GroupedSecrets = {
  category: string;
  label: string;
  secrets: SecretInfo[];
};

function groupSecretsByCategory(secrets: SecretInfo[]): GroupedSecrets[] {
  const grouped = new Map<string, SecretInfo[]>();
  for (const secret of secrets) {
    const existing = grouped.get(secret.category);
    if (existing) {
      existing.push(secret);
    } else {
      grouped.set(secret.category, [secret]);
    }
  }

  return CATEGORY_ORDER.filter((category) => grouped.has(category)).map(
    (category) => ({
      category,
      label: CATEGORY_LABELS[category],
      secrets: grouped.get(category) ?? [],
    }),
  );
}

function loadPinnedKeys(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {
    // ignore
  }
  return new Set();
}

function savePinnedKeys(keys: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...keys]));
  } catch {
    // ignore
  }
}

export function SecretsView() {
  const [allSecrets, setAllSecrets] = useState<SecretInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pinnedKeys, setPinnedKeys] = useState<Set<string>>(loadPinnedKeys);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await client.getSecrets();
      setAllSecrets(res.secrets);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load secrets");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const vaultSecrets = useMemo(() => {
    return allSecrets.filter((s) => pinnedKeys.has(s.key) || s.isSet);
  }, [allSecrets, pinnedKeys]);

  const availableSecrets = useMemo(() => {
    const vaultKeys = new Set(vaultSecrets.map((s) => s.key));
    const available = allSecrets.filter((s) => !vaultKeys.has(s.key));
    if (!pickerSearch.trim()) return available;
    const q = pickerSearch.toLowerCase();
    return available.filter(
      (s) =>
        s.key.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.usedBy.some((u) => u.pluginName.toLowerCase().includes(q)),
    );
  }, [allSecrets, vaultSecrets, pickerSearch]);

  const grouped = useMemo(() => {
    return groupSecretsByCategory(vaultSecrets);
  }, [vaultSecrets]);

  const dirtyKeys = useMemo(() => {
    return Object.keys(draft).filter((k) => draft[k].trim() !== "");
  }, [draft]);

  const pinKey = (key: string) => {
    setPinnedKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      savePinnedKeys(next);
      return next;
    });
  };

  const unpinKey = (key: string) => {
    setPinnedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      savePinnedKeys(next);
      return next;
    });
    setDraft((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSave = async () => {
    if (dirtyKeys.length === 0) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const payload: Record<string, string> = {};
      for (const key of dirtyKeys) payload[key] = draft[key];
      const res = await client.updateSecrets(payload);
      setSaveResult({
        ok: true,
        message: `Updated ${res.updated.length} secret${res.updated.length !== 1 ? "s" : ""}`,
      });
      setDraft({});
      await load();
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleCollapse = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleVisible = (key: string) => {
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-[13px] italic text-white/45">
        Loading secrets...
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-danger/25 bg-danger/10">
        <CardContent className="space-y-3 py-8 text-center">
          <p className="text-[13px] text-danger">{error}</p>
          <Button variant="ghost" size="sm" onClick={() => void load()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-white/46">
          Manage API keys and credentials. Add only the secrets you want in the active vault.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setPickerOpen(true);
            setPickerSearch("");
          }}
        >
          <PlusIcon className="h-4 w-4" />
          Add Secret
        </Button>
      </div>

      {pickerOpen && (
        <SecretPicker
          available={availableSecrets}
          search={pickerSearch}
          onSearchChange={setPickerSearch}
          onAdd={(key) => {
            pinKey(key);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {vaultSecrets.length === 0 && (
        <Card className="border-dashed border-white/10 bg-white/[0.03]">
          <CardContent className="py-10 text-center text-[13px] text-white/45">
            Your vault is empty. Add secrets to choose which credentials are managed here.
          </CardContent>
        </Card>
      )}

      {grouped.map(({ category, label, secrets: catSecrets }) => (
        <div key={category} className="space-y-3">
          <button
            type="button"
            className="flex w-full items-center gap-2 bg-transparent text-left"
            onClick={() => toggleCollapse(category)}
          >
            {collapsed.has(category) ? (
              <ChevronRightIcon className="h-4 w-4 text-white/42" />
            ) : (
              <ChevronDownIcon className="h-4 w-4 text-white/42" />
            )}
            <span className="text-[14px] font-semibold text-white/84">{label}</span>
            <span className="text-[12px] text-white/40">({catSecrets.length})</span>
          </button>

          {!collapsed.has(category) && (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {catSecrets.map((secret) => (
                <SecretCard
                  key={secret.key}
                  secret={secret}
                  draftValue={draft[secret.key] ?? ""}
                  isVisible={visible.has(secret.key)}
                  isPinned={pinnedKeys.has(secret.key)}
                  onToggleVisible={() => toggleVisible(secret.key)}
                  onDraftChange={(val) =>
                    setDraft((prev) => ({ ...prev, [secret.key]: val }))
                  }
                  onRemove={() => unpinKey(secret.key)}
                />
              ))}
            </div>
          )}
        </div>
      ))}

      {vaultSecrets.length > 0 && (
        <div className="flex items-center gap-3 border-t border-white/10 pt-4">
          <Button
            disabled={dirtyKeys.length === 0 || saving}
            onClick={handleSave}
          >
            {saving
              ? "Saving..."
              : `Save${dirtyKeys.length > 0 ? ` (${dirtyKeys.length})` : ""}`}
          </Button>
          {saveResult && (
            <span className={`text-[13px] ${saveResult.ok ? "text-ok" : "text-danger"}`}>
              {saveResult.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SecretPicker({
  available,
  search,
  onSearchChange,
  onAdd,
  onClose,
}: {
  available: SecretInfo[];
  search: string;
  onSearchChange: (v: string) => void;
  onAdd: (key: string) => void;
  onClose: () => void;
}) {
  const grouped = useMemo(() => {
    return groupSecretsByCategory(available);
  }, [available]);

  return (
    <Dialog open={true} onClose={onClose} className="max-w-[560px] bg-[#080808]/95">
      <Card className="flex max-h-[480px] w-full flex-col border-white/10 bg-[#080808]/95 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <span className="text-[14px] font-semibold text-white/86">
            Add Secrets to Vault
          </span>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close secret picker">
            <CloseIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="border-b border-white/10 px-4 py-3">
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              className="h-11 w-full rounded-full border border-white/10 bg-black/30 pl-10 pr-4 text-[13px] text-white outline-none placeholder:text-white/25 focus:border-white/20"
              placeholder="Search by key, description, or plugin name..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </label>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {available.length === 0 ? (
            <div className="py-6 text-center text-[13px] text-white/45">
              {search
                ? "No matching secrets found."
                : "All available secrets are already in your vault."}
            </div>
          ) : (
            grouped.map(({ category, label, secrets }) => (
              <div key={category} className="mb-4 space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/40">
                  {label}
                </div>
                {secrets.map((s) => {
                  const enabledPlugins = s.usedBy.filter((u) => u.enabled);
                  const pluginList = s.usedBy
                    .map((u) => u.pluginName || u.pluginId)
                    .join(", ");
                  return (
                    <Card
                      key={s.key}
                      className="border-white/8 bg-white/[0.03]"
                    >
                      <CardContent className="flex items-center justify-between gap-3 p-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-[13px] text-white/86">
                            {s.key}
                          </div>
                          <div
                            className="truncate text-[11px] text-white/46"
                            title={pluginList}
                          >
                            {s.description}
                            {s.usedBy.length > 0 && (
                              <span className="ml-1">
                                — {enabledPlugins.length > 0
                                  ? `${enabledPlugins.length} active plugin${enabledPlugins.length !== 1 ? "s" : ""}`
                                  : `${s.usedBy.length} plugin${s.usedBy.length !== 1 ? "s" : ""} (none active)`}
                              </span>
                            )}
                          </div>
                        </div>
                        <Button size="sm" onClick={() => onAdd(s.key)}>
                          Add
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </Card>
    </Dialog>
  );
}

function SecretCard({
  secret,
  draftValue,
  isVisible,
  isPinned,
  onToggleVisible,
  onDraftChange,
  onRemove,
}: {
  secret: SecretInfo;
  draftValue: string;
  isVisible: boolean;
  isPinned: boolean;
  onToggleVisible: () => void;
  onDraftChange: (val: string) => void;
  onRemove: () => void;
}) {
  const enabledPlugins = secret.usedBy.filter((u) => u.enabled);
  const pluginList = secret.usedBy
    .map((u) => u.pluginName || u.pluginId)
    .join(", ");
  const hasDraft = draftValue.trim() !== "";
  const showRequired = secret.required && enabledPlugins.length > 0;

  return (
    <Card className="border-white/10 bg-white/[0.04]">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{
                  backgroundColor: secret.isSet ? "var(--ok)" : "rgba(255,255,255,0.28)",
                }}
              />
              <span className="truncate font-mono text-[13px] font-medium text-white/86">
                {secret.key}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-snug text-white/48">
              {secret.description}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {showRequired && <Badge variant="danger">Required</Badge>}
            {isPinned && !secret.isSet && (
              <Button
                size="icon"
                variant="ghost"
                onClick={onRemove}
                title="Remove from vault"
                aria-label="Remove from vault"
              >
                <TrashIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="text-[11px] text-white/46" title={pluginList}>
          {enabledPlugins.length > 0
            ? `Used by ${enabledPlugins.length} active plugin${enabledPlugins.length !== 1 ? "s" : ""}: ${enabledPlugins.map((u) => u.pluginName || u.pluginId).join(", ")}`
            : `Available for: ${pluginList}`}
        </div>

        {secret.isSet && !hasDraft && (
          <div className="rounded-2xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[12px] text-white/48">
            {secret.maskedValue}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type={isVisible ? "text" : "password"}
            className="h-11 flex-1 rounded-full border border-white/10 bg-black/30 px-4 text-[13px] font-mono text-white outline-none placeholder:text-white/28 focus:border-white/20"
            placeholder={secret.isSet ? "Enter new value to update" : "Enter value"}
            value={draftValue}
            onChange={(e) => onDraftChange(e.target.value)}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={onToggleVisible}
            title={isVisible ? "Hide secret" : "Show secret"}
          >
            {isVisible ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
            {isVisible ? "Hide" : "Show"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

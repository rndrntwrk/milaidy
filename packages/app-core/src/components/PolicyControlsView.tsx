/**
 * PolicyControlsView — wallet policy settings for Steward.
 * Simple settings rows that match the rest of the Settings page.
 */

import {
  Button,
  ConfirmDialog,
  Input,
  Label,
  Slider,
  Spinner,
  Switch,
} from "@miladyai/ui";
import { AlertTriangle } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { client } from "../api";
import type {
  ApprovedAddressesConfig,
  AutoApproveConfig,
  PolicyRule,
  PolicyType,
  RateLimitConfig,
  SpendingLimitConfig,
  TimeWindowConfig,
} from "./policy-controls";
import {
  DAY_NAMES,
  DEFAULT_APPROVED_ADDRESSES,
  DEFAULT_AUTO_APPROVE,
  DEFAULT_RATE_LIMIT,
  DEFAULT_SPENDING,
  DEFAULT_TIME_WINDOW,
  TIMEZONES,
  findPolicy,
} from "./policy-controls";
import { StewardLogo } from "./steward/StewardLogo";

const asRecord = (v: unknown) => v as unknown as Record<string, unknown>;

export function PolicyControlsView() {
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [stewardConnected, setStewardConnected] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmCallback, setConfirmCallback] = useState<(() => void) | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const status = await client.getStewardStatus();
        if (cancelled) return;
        setStewardConnected(status.connected);
        if (!status.connected) {
          setLoading(false);
          return;
        }
        const result = await client.getStewardPolicies();
        if (cancelled) return;
        setPolicies(result as PolicyRule[]);
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load policies",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getPolicy = useCallback(
    (type: PolicyType) => findPolicy(policies, type),
    [policies],
  );

  const updatePolicy = useCallback(
    (type: PolicyType, updates: Partial<PolicyRule>) => {
      setPolicies((prev) => {
        const existing = prev.find((p) => p.type === type);
        if (existing) {
          return prev.map((p) => (p.type === type ? { ...p, ...updates } : p));
        }
        return [
          ...prev,
          {
            id: `${type}-${Date.now()}`,
            type,
            enabled: true,
            config: {},
            ...updates,
          },
        ];
      });
      setDirty(true);
      setSaveSuccess(false);
    },
    [],
  );

  const togglePolicy = useCallback(
    (
      type: PolicyType,
      enabled: boolean,
      defaultConfig: Record<string, unknown>,
    ) => {
      const existing = findPolicy(policies, type);
      if (!enabled && existing?.enabled) {
        setConfirmMessage(
          "Disabling this removes a safety guardrail. Are you sure?",
        );
        setConfirmCallback(() => () => updatePolicy(type, { enabled: false }));
        setConfirmOpen(true);
        return;
      }
      updatePolicy(type, {
        enabled,
        config: existing?.config ?? defaultConfig,
      });
    },
    [policies, updatePolicy],
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await client.setStewardPolicies(policies);
      setSaveSuccess(true);
      setDirty(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save policies",
      );
    } finally {
      setSaving(false);
    }
  }, [policies]);

  // Extract configs (must be before early returns so hooks are unconditional)
  const autoApprovePolicy = getPolicy("auto-approve-threshold");
  const autoApproveConfig =
    (autoApprovePolicy?.config as unknown as AutoApproveConfig) ??
    DEFAULT_AUTO_APPROVE;

  const spendingPolicy = getPolicy("spending-limit");
  const spendingConfig =
    (spendingPolicy?.config as unknown as SpendingLimitConfig) ??
    DEFAULT_SPENDING;

  const addressPolicy = getPolicy("approved-addresses");
  const addressConfig =
    (addressPolicy?.config as unknown as ApprovedAddressesConfig) ??
    DEFAULT_APPROVED_ADDRESSES;

  const rateLimitPolicy = getPolicy("rate-limit");
  const rateLimitConfig =
    (rateLimitPolicy?.config as unknown as RateLimitConfig) ??
    DEFAULT_RATE_LIMIT;

  const timeWindowPolicy = getPolicy("time-window");
  const timeWindowConfig =
    (timeWindowPolicy?.config as unknown as TimeWindowConfig) ??
    DEFAULT_TIME_WINDOW;

  const normalizedAddresses = useMemo(
    () =>
      (addressConfig.addresses ?? []).map((addr) => {
        if (typeof addr === "object" && addr !== null && "address" in addr) {
          return (addr as unknown as { address: string }).address;
        }
        return String(addr);
      }),
    [addressConfig.addresses],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size={24} />
        <span className="ml-3 text-sm text-muted">Loading…</span>
      </div>
    );
  }

  if (!stewardConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <StewardLogo size={48} className="opacity-30" />
        <p className="text-sm font-semibold text-txt">
          Steward Not Connected
        </p>
        <p className="text-xs text-muted max-w-sm">
          Connect your Steward instance to manage wallet policies.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0 divide-y divide-border/20">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
          <span className="text-xs text-danger">{error}</span>
        </div>
      )}

      {/* Auto-Approve */}
      <PolicyRow
        title="Auto-Approve"
        desc={
          autoApprovePolicy?.enabled
            ? `Under ${autoApproveConfig.threshold ?? "0.01"} ETH`
            : "Off"
        }
        enabled={autoApprovePolicy?.enabled ?? false}
        onToggle={(v) =>
          togglePolicy(
            "auto-approve-threshold",
            v,
            asRecord(DEFAULT_AUTO_APPROVE),
          )
        }
      >
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted whitespace-nowrap">
            Threshold
          </Label>
          <EthField
            value={autoApproveConfig.threshold ?? "0.01"}
            onChange={(v) =>
              updatePolicy("auto-approve-threshold", {
                config: asRecord({ threshold: v }),
              })
            }
          />
        </div>
      </PolicyRow>

      {/* Spending Limits */}
      <PolicyRow
        title="Spending Limits"
        desc={
          spendingPolicy?.enabled
            ? `${spendingConfig.maxPerTx}/tx · ${spendingConfig.maxPerDay}/day · ${spendingConfig.maxPerWeek}/wk`
            : "Off"
        }
        enabled={spendingPolicy?.enabled ?? false}
        onToggle={(v) =>
          togglePolicy("spending-limit", v, asRecord(DEFAULT_SPENDING))
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <EthFieldLabeled
            label="Per Tx"
            value={spendingConfig.maxPerTx}
            onChange={(v) =>
              updatePolicy("spending-limit", {
                config: asRecord({ ...spendingConfig, maxPerTx: v }),
              })
            }
          />
          <EthFieldLabeled
            label="Daily"
            value={spendingConfig.maxPerDay}
            onChange={(v) =>
              updatePolicy("spending-limit", {
                config: asRecord({ ...spendingConfig, maxPerDay: v }),
              })
            }
          />
          <EthFieldLabeled
            label="Weekly"
            value={spendingConfig.maxPerWeek}
            onChange={(v) =>
              updatePolicy("spending-limit", {
                config: asRecord({ ...spendingConfig, maxPerWeek: v }),
              })
            }
          />
        </div>
      </PolicyRow>

      {/* Rate Limits */}
      <PolicyRow
        title="Rate Limits"
        desc={
          rateLimitPolicy?.enabled
            ? `${rateLimitConfig.maxTxPerHour}/hr · ${rateLimitConfig.maxTxPerDay}/day`
            : "Off"
        }
        enabled={rateLimitPolicy?.enabled ?? false}
        onToggle={(v) =>
          togglePolicy("rate-limit", v, asRecord(DEFAULT_RATE_LIMIT))
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <SliderField
            label="Per Hour"
            value={rateLimitConfig.maxTxPerHour}
            min={1}
            max={100}
            onChange={(v) =>
              updatePolicy("rate-limit", {
                config: asRecord({ ...rateLimitConfig, maxTxPerHour: v }),
              })
            }
          />
          <SliderField
            label="Per Day"
            value={rateLimitConfig.maxTxPerDay}
            min={1}
            max={500}
            onChange={(v) =>
              updatePolicy("rate-limit", {
                config: asRecord({ ...rateLimitConfig, maxTxPerDay: v }),
              })
            }
          />
        </div>
      </PolicyRow>

      {/* Address Controls */}
      <PolicyRow
        title="Address Controls"
        desc={
          addressPolicy?.enabled
            ? `${normalizedAddresses.length} ${addressConfig.mode === "whitelist" ? "allowed" : "blocked"}`
            : "Off"
        }
        enabled={addressPolicy?.enabled ?? false}
        onToggle={(v) =>
          togglePolicy(
            "approved-addresses",
            v,
            asRecord(DEFAULT_APPROVED_ADDRESSES),
          )
        }
      >
        <AddressSection
          config={addressConfig}
          addresses={normalizedAddresses}
          onUpdate={(cfg) =>
            updatePolicy("approved-addresses", { config: asRecord(cfg) })
          }
        />
      </PolicyRow>

      {/* Time Restrictions */}
      <PolicyRow
        title="Time Restrictions"
        desc={
          timeWindowPolicy?.enabled
            ? `${timeWindowConfig.allowedDays?.length ?? 0} days`
            : "Off"
        }
        enabled={timeWindowPolicy?.enabled ?? false}
        onToggle={(v) =>
          togglePolicy("time-window", v, asRecord(DEFAULT_TIME_WINDOW))
        }
      >
        <TimeSection
          config={timeWindowConfig}
          onUpdate={(cfg) =>
            updatePolicy("time-window", { config: asRecord(cfg) })
          }
        />
      </PolicyRow>

      {/* Save */}
      {dirty && (
        <div className="flex items-center justify-end gap-3 pt-4 border-t-0">
          <span className="text-xs text-accent">Unsaved changes</span>
          <Button
            variant="default"
            size="sm"
            className="text-xs"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? (
              <>
                <Spinner size={14} />
                <span className="ml-1.5">Saving…</span>
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      )}
      {saveSuccess && !dirty && (
        <div className="pt-3 text-right border-t-0">
          <span className="text-xs text-ok">✓ Saved</span>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Disable Policy"
        message={confirmMessage}
        confirmLabel="Disable"
        cancelLabel="Keep"
        tone="warn"
        onConfirm={() => {
          confirmCallback?.();
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function PolicyRow({
  title,
  desc,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  desc: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="py-3.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-txt">{title}</div>
          <div className="text-xs text-muted mt-0.5">{desc}</div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={title}
        />
      </div>
      {enabled && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

function EthField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative w-28">
      <Input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          if (/^\d*\.?\d*$/.test(e.target.value)) onChange(e.target.value);
        }}
        className="h-8 text-xs pr-10 tabular-nums"
        placeholder="0.0"
      />
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted pointer-events-none">
        ETH
      </span>
    </div>
  );
}

function EthFieldLabeled({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted">{label}</Label>
      <EthField value={value} onChange={onChange} />
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between">
        <Label className="text-xs text-muted">{label}</Label>
        <span className="text-xs font-medium text-txt tabular-nums">
          {value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

function AddressSection({
  config,
  addresses,
  onUpdate,
}: {
  config: ApprovedAddressesConfig;
  addresses: string[];
  onUpdate: (cfg: ApprovedAddressesConfig) => void;
}) {
  const [newAddr, setNewAddr] = useState("");

  const handleAdd = () => {
    const trimmed = newAddr.trim();
    if (!trimmed || !/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return;
    if (config.addresses.includes(trimmed)) return;
    onUpdate({ ...config, addresses: [...config.addresses, trimmed] });
    setNewAddr("");
  };

  const handleRemove = (addr: string) => {
    const labels = { ...config.labels };
    delete labels[addr];
    onUpdate({
      ...config,
      addresses: config.addresses.filter((a) => String(a) !== addr),
      labels,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          variant={config.mode === "whitelist" ? "default" : "ghost"}
          size="sm"
          className="text-[11px] h-7"
          onClick={() => onUpdate({ ...config, mode: "whitelist" })}
        >
          Allowlist
        </Button>
        <Button
          variant={config.mode === "blacklist" ? "default" : "ghost"}
          size="sm"
          className="text-[11px] h-7"
          onClick={() => onUpdate({ ...config, mode: "blacklist" })}
        >
          Blocklist
        </Button>
      </div>

      {addresses.length > 0 && (
        <div className="space-y-1">
          {addresses.map((addr) => (
            <div
              key={addr}
              className="flex items-center justify-between group text-[11px] font-mono text-muted py-1"
            >
              <span className="truncate">{addr}</span>
              <button
                type="button"
                className="text-danger opacity-0 group-hover:opacity-100 text-[10px] ml-2"
                onClick={() => handleRemove(addr)}
              >
                remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          type="text"
          value={newAddr}
          onChange={(e) => setNewAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="0x..."
          className="h-8 text-xs font-mono flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-8"
          onClick={handleAdd}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function TimeSection({
  config,
  onUpdate,
}: {
  config: TimeWindowConfig;
  onUpdate: (cfg: TimeWindowConfig) => void;
}) {
  const hours = config.allowedHours?.[0] ?? { start: 9, end: 17 };
  const days = config.allowedDays ?? [1, 2, 3, 4, 5];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted">From</Label>
          <select
            value={hours.start}
            onChange={(e) =>
              onUpdate({
                ...config,
                allowedHours: [
                  { start: Number(e.target.value), end: hours.end },
                ],
              })
            }
            className="h-8 rounded-md border border-input bg-bg px-2 text-xs text-txt"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={`from-${i}`} value={i}>
                {String(i).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
        <span className="text-muted text-xs mt-5">→</span>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted">To</Label>
          <select
            value={hours.end}
            onChange={(e) =>
              onUpdate({
                ...config,
                allowedHours: [
                  { start: hours.start, end: Number(e.target.value) },
                ],
              })
            }
            className="h-8 rounded-md border border-input bg-bg px-2 text-xs text-txt"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={`to-${i + 1}`} value={i + 1}>
                {String(i + 1).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-1">
        {DAY_NAMES.map((name, i) => (
          <button
            key={name}
            type="button"
            className={`h-7 w-9 rounded text-[10px] font-medium transition-colors ${
              days.includes(i)
                ? "bg-accent/20 text-accent border border-accent/30"
                : "bg-bg text-muted border border-border/30 hover:border-border/50"
            }`}
            onClick={() => {
              const next = days.includes(i)
                ? days.filter((d) => d !== i)
                : [...days, i].sort();
              onUpdate({ ...config, allowedDays: next });
            }}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <Label className="text-[11px] text-muted">Timezone</Label>
        <select
          value={
            config.timezone ??
            Intl.DateTimeFormat().resolvedOptions().timeZone
          }
          onChange={(e) => onUpdate({ ...config, timezone: e.target.value })}
          className="h-8 rounded-md border border-input bg-bg px-2 text-xs text-txt w-full"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

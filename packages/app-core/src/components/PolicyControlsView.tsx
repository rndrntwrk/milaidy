/**
 * PolicyControlsView — user-friendly policy management for Steward agent wallets.
 *
 * Renders spending limits, approved addresses, rate limits, time windows,
 * and auto-approve threshold as toggles, sliders, and inputs (no raw JSON).
 */

import {
  Button,
  ConfirmDialog,
  Input,
  Label,
  SectionCard,
  Slider,
  Spinner,
  Switch,
} from "@miladyai/ui";
import {
  AlertTriangle,
  Clock,
  DollarSign,
  Gauge,
  Plus,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { client } from "../api";
import { StewardLogo } from "./steward/StewardLogo";

/* ── Types ───────────────────────────────────────────────────────────── */

type PolicyType =
  | "spending-limit"
  | "approved-addresses"
  | "auto-approve-threshold"
  | "time-window"
  | "rate-limit";

interface PolicyRule {
  id: string;
  type: PolicyType;
  enabled: boolean;
  config: Record<string, unknown>;
}

interface SpendingLimitConfig {
  maxPerTx: string;
  maxPerDay: string;
  maxPerWeek: string;
}

interface ApprovedAddressEntry {
  address: string;
  label: string;
}

interface ApprovedAddressesConfig {
  addresses: string[];
  labels?: Record<string, string>;
  mode: "whitelist" | "blacklist";
}

interface RateLimitConfig {
  maxTxPerHour: number;
  maxTxPerDay: number;
}

interface TimeWindowConfig {
  allowedHours: { start: number; end: number }[];
  allowedDays: number[];
  timezone?: string;
}

interface AutoApproveConfig {
  threshold: string;
}

/* ── Defaults ────────────────────────────────────────────────────────── */

const DEFAULT_SPENDING: SpendingLimitConfig = {
  maxPerTx: "0.1",
  maxPerDay: "1.0",
  maxPerWeek: "5.0",
};

const DEFAULT_APPROVED_ADDRESSES: ApprovedAddressesConfig = {
  addresses: [],
  labels: {},
  mode: "whitelist",
};

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxTxPerHour: 10,
  maxTxPerDay: 50,
};

const DEFAULT_TIME_WINDOW: TimeWindowConfig = {
  allowedHours: [{ start: 9, end: 17 }],
  allowedDays: [1, 2, 3, 4, 5],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

const DEFAULT_AUTO_APPROVE: AutoApproveConfig = {
  threshold: "0.01",
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Kolkata",
  "Australia/Sydney",
  "UTC",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ── Helpers ─────────────────────────────────────────────────────────── */

function findPolicy(
  policies: PolicyRule[],
  type: PolicyType,
): PolicyRule | undefined {
  return policies.find((p) => p.type === type);
}

function ethToNumber(eth: string): number {
  const n = Number.parseFloat(eth);
  return Number.isNaN(n) ? 0 : n;
}

function formatHour(h: number): string {
  if (h === 0) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}

function isValidAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

/* ── Sub-components ──────────────────────────────────────────────────── */

function PolicyToggle({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border transition-all ${
        enabled
          ? "border-accent/30 bg-accent/5"
          : "border-border/50 bg-card/30 opacity-75"
      }`}
    >
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
              enabled ? "bg-accent/15 text-accent" : "bg-muted/10 text-muted"
            }`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-txt truncate">
              {title}
            </div>
            <div className="text-[11px] text-muted mt-0.5">{description}</div>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={title}
        />
      </div>
      {enabled && children && (
        <div className="border-t border-border/30 p-4 pt-3">{children}</div>
      )}
    </div>
  );
}

function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[12px] text-muted">{label}</Label>
        <span className="text-[12px] font-semibold text-txt tabular-nums">
          {value} {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

function SpendingLimitSection({
  config,
  onChange,
}: {
  config: SpendingLimitConfig;
  onChange: (config: SpendingLimitConfig) => void;
}) {
  return (
    <div className="space-y-4">
      <LabeledSlider
        label="Per Transaction Max"
        value={ethToNumber(config.maxPerTx)}
        min={0.001}
        max={10}
        step={0.001}
        unit="ETH"
        onChange={(v) => onChange({ ...config, maxPerTx: v.toString() })}
      />
      <LabeledSlider
        label="Daily Limit"
        value={ethToNumber(config.maxPerDay)}
        min={0.01}
        max={50}
        step={0.01}
        unit="ETH"
        onChange={(v) => onChange({ ...config, maxPerDay: v.toString() })}
      />
      <LabeledSlider
        label="Weekly Limit"
        value={ethToNumber(config.maxPerWeek)}
        min={0.1}
        max={100}
        step={0.1}
        unit="ETH"
        onChange={(v) => onChange({ ...config, maxPerWeek: v.toString() })}
      />
      <div className="mt-2 rounded-lg bg-bg/50 px-3 py-2 text-[11px] text-muted">
        Start conservative — you can always raise limits later.
      </div>
    </div>
  );
}

function ApprovedAddressesSection({
  config,
  onChange,
}: {
  config: ApprovedAddressesConfig;
  onChange: (config: ApprovedAddressesConfig) => void;
}) {
  const [newAddress, setNewAddress] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addressError, setAddressError] = useState<string | null>(null);

  const entries: ApprovedAddressEntry[] = useMemo(
    () =>
      (config.addresses ?? []).map((addr) => {
        // Handle both string addresses and {address, label} objects from API
        if (typeof addr === "object" && addr !== null && "address" in addr) {
          const obj = addr as unknown as { address: string; label?: string };
          return { address: obj.address, label: obj.label ?? "" };
        }
        return {
          address: String(addr),
          label: config.labels?.[String(addr)] ?? "",
        };
      }),
    [config],
  );

  const handleAdd = useCallback(() => {
    const trimmed = newAddress.trim();
    if (!trimmed) return;

    if (!isValidAddress(trimmed)) {
      setAddressError("Invalid Ethereum address (must be 0x + 40 hex chars)");
      return;
    }

    if (config.addresses.includes(trimmed)) {
      setAddressError("Address already in list");
      return;
    }

    const updated = {
      ...config,
      addresses: [...config.addresses, trimmed],
      labels: {
        ...config.labels,
        ...(newLabel.trim() ? { [trimmed]: newLabel.trim() } : {}),
      },
    };
    onChange(updated);
    setNewAddress("");
    setNewLabel("");
    setAddressError(null);
  }, [newAddress, newLabel, config, onChange]);

  const handleRemove = useCallback(
    (addr: string) => {
      const labels = { ...config.labels };
      delete labels[addr];
      onChange({
        ...config,
        addresses: config.addresses.filter((a) => a !== addr),
        labels,
      });
    },
    [config, onChange],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
            config.mode === "whitelist"
              ? "bg-ok/15 text-ok"
              : "bg-danger/15 text-danger"
          }`}
        >
          {config.mode === "whitelist" ? "Allowlist" : "Blocklist"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="text-[11px] h-6 px-2"
          onClick={() =>
            onChange({
              ...config,
              mode: config.mode === "whitelist" ? "blacklist" : "whitelist",
            })
          }
        >
          Switch to {config.mode === "whitelist" ? "blocklist" : "allowlist"}
        </Button>
      </div>

      {/* Existing addresses */}
      {entries.length > 0 ? (
        <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.address}
              className="flex items-center gap-2 rounded-lg bg-bg/50 px-3 py-2 group"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-mono text-txt truncate">
                  {entry.address}
                </div>
                {entry.label && (
                  <div className="text-[10px] text-muted">{entry.label}</div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-danger hover:text-danger"
                onClick={() => handleRemove(entry.address)}
                aria-label={`Remove ${entry.label || entry.address}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted/60 py-2">
          {config.mode === "whitelist"
            ? "No addresses — agent can't send anywhere yet."
            : "No addresses blocked."}
        </div>
      )}

      {/* Add new */}
      <div className="space-y-2 pt-1">
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder="0x..."
            value={newAddress}
            onChange={(e) => {
              setNewAddress(e.target.value);
              setAddressError(null);
            }}
            className="flex-1 h-9 text-[12px] font-mono"
          />
          <Input
            type="text"
            placeholder="Label (optional)"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="w-32 h-9 text-[12px]"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-3"
            onClick={handleAdd}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        {addressError && (
          <div className="text-[11px] text-danger">{addressError}</div>
        )}
      </div>
    </div>
  );
}

function RateLimitSection({
  config,
  onChange,
}: {
  config: RateLimitConfig;
  onChange: (config: RateLimitConfig) => void;
}) {
  return (
    <div className="space-y-4">
      <LabeledSlider
        label="Transactions per Hour"
        value={config.maxTxPerHour}
        min={1}
        max={100}
        step={1}
        unit="tx/hr"
        onChange={(v) => onChange({ ...config, maxTxPerHour: v })}
      />
      <LabeledSlider
        label="Transactions per Day"
        value={config.maxTxPerDay}
        min={1}
        max={1000}
        step={1}
        unit="tx/day"
        onChange={(v) => onChange({ ...config, maxTxPerDay: v })}
      />
    </div>
  );
}

function TimeWindowSection({
  config,
  onChange,
}: {
  config: TimeWindowConfig;
  onChange: (config: TimeWindowConfig) => void;
}) {
  const hours = config.allowedHours[0] ?? { start: 9, end: 17 };

  return (
    <div className="space-y-4">
      {/* Allowed hours */}
      <div className="space-y-2">
        <Label className="text-[12px] text-muted">Allowed Hours</Label>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Label className="text-[10px] text-muted mb-1 block">Start</Label>
            <select
              value={hours.start}
              onChange={(e) =>
                onChange({
                  ...config,
                  allowedHours: [
                    { start: Number(e.target.value), end: hours.end },
                  ],
                })
              }
              className="w-full h-9 rounded-lg border border-border bg-bg px-2 text-[12px] text-txt"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {formatHour(i)}
                </option>
              ))}
            </select>
          </div>
          <span className="text-muted text-sm mt-4">→</span>
          <div className="flex-1">
            <Label className="text-[10px] text-muted mb-1 block">End</Label>
            <select
              value={hours.end}
              onChange={(e) =>
                onChange({
                  ...config,
                  allowedHours: [
                    { start: hours.start, end: Number(e.target.value) },
                  ],
                })
              }
              className="w-full h-9 rounded-lg border border-border bg-bg px-2 text-[12px] text-txt"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>
                  {formatHour(i)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Allowed days */}
      <div className="space-y-2">
        <Label className="text-[12px] text-muted">Allowed Days</Label>
        <div className="flex gap-1.5">
          {DAY_NAMES.map((name, i) => {
            const active = config.allowedDays.includes(i);
            return (
              <Button
                key={name}
                variant={active ? "default" : "outline"}
                size="sm"
                className={`h-8 w-10 text-[11px] font-medium p-0 ${
                  active ? "" : "border-border/50 text-muted hover:text-txt"
                }`}
                onClick={() => {
                  const days = active
                    ? config.allowedDays.filter((d) => d !== i)
                    : [...config.allowedDays, i].sort();
                  onChange({ ...config, allowedDays: days });
                }}
              >
                {name}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Timezone */}
      <div className="space-y-1">
        <Label className="text-[12px] text-muted">Timezone</Label>
        <select
          value={config.timezone ?? "UTC"}
          onChange={(e) => onChange({ ...config, timezone: e.target.value })}
          className="w-full h-9 rounded-lg border border-border bg-bg px-2 text-[12px] text-txt"
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

function AutoApproveSection({
  config,
  onChange,
}: {
  config: AutoApproveConfig;
  onChange: (config: AutoApproveConfig) => void;
}) {
  const value = ethToNumber(config.threshold);

  return (
    <div className="space-y-4">
      <LabeledSlider
        label="Auto-Approve Below"
        value={value}
        min={0.001}
        max={1}
        step={0.001}
        unit="ETH"
        onChange={(v) => onChange({ threshold: v.toString() })}
      />
      <div className="flex items-start gap-2 rounded-lg bg-accent/5 border border-accent/15 px-3 py-2">
        <ShieldCheck className="h-3.5 w-3.5 text-accent mt-0.5 shrink-0" />
        <div className="text-[11px] text-muted">
          Under <span className="font-semibold text-txt">{value} ETH</span> →
          auto-approved. Above → requires manual sign-off.
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ──────────────────────────────────────────────────── */

export function PolicyControlsView() {
  const [policies, setPolicies] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [stewardConnected, setStewardConnected] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmCallback, setConfirmCallback] = useState<(() => void) | null>(
    null,
  );

  /* ── Load policies ────────────────────────────────────────────────── */

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

  /* ── Policy helpers ───────────────────────────────────────────────── */

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
        const newPolicy: PolicyRule = {
          id: `${type}-${Date.now()}`,
          type,
          enabled: true,
          config: {},
          ...updates,
        };
        return [...prev, newPolicy];
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
        // Disabling a safety policy — confirm
        setConfirmMessage(
          "Disabling this removes a safety guardrail. Are you sure?",
        );
        setConfirmCallback(() => () => {
          updatePolicy(type, { enabled: false });
        });
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

  /* ── Save ─────────────────────────────────────────────────────────── */

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await client.setStewardPolicies(policies);
      setSaveSuccess(true);
      setDirty(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save policies");
    } finally {
      setSaving(false);
    }
  }, [policies]);

  /* ── Render ───────────────────────────────────────────────────────── */

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
        <div>
          <p className="text-sm font-semibold text-txt mb-1">
            Steward Not Connected
          </p>
          <p className="text-xs text-muted max-w-sm">
            Connect your Steward instance to manage wallet policies.
          </p>
        </div>
      </div>
    );
  }

  // Extract current configs
  const spendingPolicy = getPolicy("spending-limit");
  const spendingConfig: SpendingLimitConfig =
    (spendingPolicy?.config as unknown as SpendingLimitConfig) ??
    DEFAULT_SPENDING;

  const addressPolicy = getPolicy("approved-addresses");
  const addressConfig: ApprovedAddressesConfig =
    (addressPolicy?.config as unknown as ApprovedAddressesConfig) ??
    DEFAULT_APPROVED_ADDRESSES;

  const rateLimitPolicy = getPolicy("rate-limit");
  const rateLimitConfig: RateLimitConfig =
    (rateLimitPolicy?.config as unknown as RateLimitConfig) ??
    DEFAULT_RATE_LIMIT;

  const timeWindowPolicy = getPolicy("time-window");
  const timeWindowConfig: TimeWindowConfig =
    (timeWindowPolicy?.config as unknown as TimeWindowConfig) ??
    DEFAULT_TIME_WINDOW;

  const autoApprovePolicy = getPolicy("auto-approve-threshold");
  const autoApproveConfig: AutoApproveConfig =
    (autoApprovePolicy?.config as unknown as AutoApproveConfig) ??
    DEFAULT_AUTO_APPROVE;

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-danger shrink-0" />
          <span className="text-[12px] text-danger">{error}</span>
        </div>
      )}

      {/* Spending Limits */}
      <PolicyToggle
        icon={DollarSign}
        title="Spending Limits"
        description="Max per tx, daily, and weekly caps"
        enabled={spendingPolicy?.enabled ?? false}
        onToggle={(enabled) =>
          togglePolicy(
            "spending-limit",
            enabled,
            DEFAULT_SPENDING as unknown as Record<string, unknown>,
          )
        }
      >
        <SpendingLimitSection
          config={spendingConfig}
          onChange={(cfg) =>
            updatePolicy("spending-limit", {
              config: cfg as unknown as Record<string, unknown>,
            })
          }
        />
      </PolicyToggle>

      {/* Approved Addresses */}
      <PolicyToggle
        icon={DollarSign}
        title="Address Controls"
        description="Allowlist or blocklist recipient addresses"
        enabled={addressPolicy?.enabled ?? false}
        onToggle={(enabled) =>
          togglePolicy(
            "approved-addresses",
            enabled,
            DEFAULT_APPROVED_ADDRESSES as unknown as Record<string, unknown>,
          )
        }
      >
        <ApprovedAddressesSection
          config={addressConfig}
          onChange={(cfg) =>
            updatePolicy("approved-addresses", {
              config: cfg as unknown as Record<string, unknown>,
            })
          }
        />
      </PolicyToggle>

      {/* Rate Limits */}
      <PolicyToggle
        icon={Gauge}
        title="Rate Limits"
        description="Cap transactions per hour and per day"
        enabled={rateLimitPolicy?.enabled ?? false}
        onToggle={(enabled) =>
          togglePolicy(
            "rate-limit",
            enabled,
            DEFAULT_RATE_LIMIT as unknown as Record<string, unknown>,
          )
        }
      >
        <RateLimitSection
          config={rateLimitConfig}
          onChange={(cfg) =>
            updatePolicy("rate-limit", {
              config: cfg as unknown as Record<string, unknown>,
            })
          }
        />
      </PolicyToggle>

      {/* Time Windows */}
      <PolicyToggle
        icon={Clock}
        title="Time Restrictions"
        description="Only allow transactions during set hours and days"
        enabled={timeWindowPolicy?.enabled ?? false}
        onToggle={(enabled) =>
          togglePolicy(
            "time-window",
            enabled,
            DEFAULT_TIME_WINDOW as unknown as Record<string, unknown>,
          )
        }
      >
        <TimeWindowSection
          config={timeWindowConfig}
          onChange={(cfg) =>
            updatePolicy("time-window", {
              config: cfg as unknown as Record<string, unknown>,
            })
          }
        />
      </PolicyToggle>

      {/* Auto-Approve Threshold */}
      <PolicyToggle
        icon={Zap}
        title="Auto-Approve"
        description="Skip manual approval for small transactions"
        enabled={autoApprovePolicy?.enabled ?? false}
        onToggle={(enabled) =>
          togglePolicy(
            "auto-approve-threshold",
            enabled,
            DEFAULT_AUTO_APPROVE as unknown as Record<string, unknown>,
          )
        }
      >
        <AutoApproveSection
          config={autoApproveConfig}
          onChange={(cfg) =>
            updatePolicy("auto-approve-threshold", {
              config: cfg as unknown as Record<string, unknown>,
            })
          }
        />
      </PolicyToggle>

      {/* Save footer */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {saveSuccess && !dirty && (
            <span className="text-[12px] text-ok font-medium">
              ✓ Policies saved
            </span>
          )}
          {dirty && (
            <span className="text-[12px] text-accent font-medium">
              Unsaved changes
            </span>
          )}
        </div>
        <Button
          variant="default"
          size="sm"
          className="text-[11px] min-w-[80px]"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
        >
          {saving ? (
            <>
              <Spinner size={14} />
              <span className="ml-1.5">Saving...</span>
            </>
          ) : (
            "Save Policies"
          )}
        </Button>
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title="Disable Safety Policy"
        message={confirmMessage}
        confirmLabel="Disable"
        cancelLabel="Keep Enabled"
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

import { useCallback, useEffect, useRef, useState } from "react";
import type { CloudApiClient, StewardPolicyRule, StewardPolicyType } from "../../lib/cloud-api";

// ── Constants ───────────────────────────────────────────────────────────

const POLICY_TYPE_META: Record<
  StewardPolicyType,
  { label: string; description: string; icon: string }
> = {
  "spending-limit": {
    label: "SPENDING LIMIT",
    description: "Cap transaction amounts per-tx, daily, and weekly",
    icon: "💰",
  },
  "approved-addresses": {
    label: "APPROVED ADDRESSES",
    description: "Whitelist or blacklist destination addresses",
    icon: "📋",
  },
  "auto-approve-threshold": {
    label: "AUTO-APPROVE THRESHOLD",
    description: "Auto-approve transactions below a certain value",
    icon: "⚡",
  },
  "time-window": {
    label: "TIME WINDOW",
    description: "Only allow transactions during specified hours/days",
    icon: "🕐",
  },
  "rate-limit": {
    label: "RATE LIMIT",
    description: "Limit the number of transactions per hour/day",
    icon: "🚦",
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────

function generatePolicyId(type: StewardPolicyType): string {
  return `${type}-${Date.now().toString(36)}`;
}

function getDefaultConfig(type: StewardPolicyType): Record<string, unknown> {
  switch (type) {
    case "spending-limit":
      return { maxPerTx: "0.1", maxPerDay: "1.0", maxPerWeek: "5.0" };
    case "approved-addresses":
      return { addresses: [], mode: "whitelist" };
    case "auto-approve-threshold":
      return { threshold: "0.01" };
    case "time-window":
      return {
        allowedHours: [{ start: 9, end: 17 }],
        allowedDays: [1, 2, 3, 4, 5],
      };
    case "rate-limit":
      return { maxTxPerHour: 10, maxTxPerDay: 50 };
    default:
      return {};
  }
}

// ── Component ───────────────────────────────────────────────────────────

interface PolicyControlsProps {
  client: CloudApiClient;
}

export function PolicyControls({ client }: PolicyControlsProps) {
  const [policies, setPolicies] = useState<StewardPolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [dirty, setDirty] = useState(false);
  const mountedRef = useRef(true);

  const fetchPolicies = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getStewardPolicies();
      if (!mountedRef.current) return;
      setPolicies(Array.isArray(result) ? result : []);
      setDirty(false);
    } catch (err) {
      if (!mountedRef.current) return;
      // 503 = steward not configured — show friendly message
      const msg = err instanceof Error ? err.message : "Failed to load policies";
      if (msg.includes("503") || msg.includes("not configured")) {
        setError("Steward is not configured for this agent. Configure STEWARD_API_URL and STEWARD_AGENT_ID in agent settings.");
      } else {
        setError(msg);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    mountedRef.current = true;
    fetchPolicies();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchPolicies]);

  const handleToggle = useCallback((index: number) => {
    setPolicies((prev) =>
      prev.map((p, i) =>
        i === index ? { ...p, enabled: !p.enabled } : p,
      ),
    );
    setDirty(true);
  }, []);

  const handleConfigChange = useCallback(
    (index: number, key: string, value: unknown) => {
      setPolicies((prev) =>
        prev.map((p, i) =>
          i === index
            ? { ...p, config: { ...p.config, [key]: value } }
            : p,
        ),
      );
      setDirty(true);
    },
    [],
  );

  const handleAddPolicy = useCallback((type: StewardPolicyType) => {
    const newPolicy: StewardPolicyRule = {
      id: generatePolicyId(type),
      type,
      enabled: true,
      config: getDefaultConfig(type),
    };
    setPolicies((prev) => [...prev, newPolicy]);
    setDirty(true);
  }, []);

  const handleRemovePolicy = useCallback((index: number) => {
    setPolicies((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await client.setStewardPolicies(policies);
      if (!mountedRef.current) return;
      setDirty(false);
      setSaveSuccess(true);
      setTimeout(() => {
        if (mountedRef.current) setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      if (!mountedRef.current) return;
      setSaveError(
        err instanceof Error ? err.message : "Failed to save policies",
      );
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [client, policies]);

  // Loading state
  if (loading) {
    return (
      <div className="animate-[fade-up_0.4s_ease-out_both]">
        <div className="border border-border bg-surface p-8 flex items-center justify-center">
          <div className="w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
          <span className="ml-3 font-mono text-xs text-text-muted">
            Loading policies…
          </span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="animate-[fade-up_0.4s_ease-out_both]">
        <div className="border border-red-500/20 bg-red-500/5 p-6 text-center">
          <div className="w-10 h-10 mx-auto mb-3 bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg aria-hidden="true" className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <p className="font-mono text-xs text-red-400 mb-3">{error}</p>
          <button
            type="button"
            onClick={fetchPolicies}
            className="font-mono text-[11px] text-brand hover:text-brand-hover transition-colors"
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  // Available policy types to add
  const existingTypes = new Set(policies.map((p) => p.type));
  const availableTypes = (
    Object.keys(POLICY_TYPE_META) as StewardPolicyType[]
  ).filter((t) => !existingTypes.has(t));

  return (
    <div className="animate-[fade-up_0.4s_ease-out_both] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-mono text-[10px] tracking-wider text-text-subtle font-semibold">
            TRANSACTION POLICIES
          </h3>
          <div className="flex-1 h-px bg-border-subtle" />
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="font-mono text-[9px] text-brand animate-[status-pulse_2s_ease-in-out_infinite]">
              UNSAVED CHANGES
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className={`flex items-center gap-2 px-4 py-2 font-mono text-[11px] tracking-wide border transition-colors
              ${
                dirty
                  ? "text-brand border-brand/30 bg-brand/8 hover:bg-brand/15"
                  : "text-text-subtle border-border bg-surface opacity-50 cursor-not-allowed"
              } disabled:opacity-40`}
          >
            {saving ? (
              <div className="w-3 h-3 rounded-full border border-brand/30 border-t-brand animate-spin" />
            ) : saveSuccess ? (
              <svg aria-hidden="true" className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : null}
            {saveSuccess ? "SAVED" : "SAVE POLICIES"}
          </button>
        </div>
      </div>

      {/* Save error */}
      {saveError && (
        <div className="px-3 py-2 border border-red-500/20 bg-red-500/5">
          <p className="font-mono text-[11px] text-red-400">{saveError}</p>
        </div>
      )}

      {/* Policy list */}
      {policies.length === 0 ? (
        <div className="border border-border bg-surface p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 bg-surface-elevated border border-border flex items-center justify-center">
            <span className="text-xl">🛡️</span>
          </div>
          <p className="font-mono text-sm text-text-light mb-1">NO POLICIES</p>
          <p className="font-mono text-xs text-text-muted mb-4">
            Add transaction policies to control how your agent spends funds.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {policies.map((policy, index) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onToggle={() => handleToggle(index)}
              onConfigChange={(key, value) =>
                handleConfigChange(index, key, value)
              }
              onRemove={() => handleRemovePolicy(index)}
            />
          ))}
        </div>
      )}

      {/* Add policy */}
      {availableTypes.length > 0 && (
        <div className="border border-dashed border-border bg-surface/50 p-4">
          <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-3">
            ADD POLICY
          </p>
          <div className="flex flex-wrap gap-2">
            {availableTypes.map((type) => {
              const meta = POLICY_TYPE_META[type];
              return (
                <button
                  type="button"
                  key={type}
                  onClick={() => handleAddPolicy(type)}
                  className="flex items-center gap-2 px-3 py-2 font-mono text-[10px] tracking-wide
                    text-text-muted border border-border hover:text-text-light hover:border-text-muted
                    transition-colors"
                >
                  <span>{meta.icon}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Policy Card ─────────────────────────────────────────────────────────

function PolicyCard({
  policy,
  onToggle,
  onConfigChange,
  onRemove,
}: {
  policy: StewardPolicyRule;
  onToggle: () => void;
  onConfigChange: (key: string, value: unknown) => void;
  onRemove: () => void;
}) {
  const meta = POLICY_TYPE_META[policy.type] ?? {
    label: policy.type.toUpperCase(),
    description: "",
    icon: "📜",
  };

  return (
    <div
      className={`border overflow-hidden transition-colors ${
        policy.enabled
          ? "border-brand/20 bg-surface"
          : "border-border bg-surface opacity-60"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-dark-secondary/30 border-b border-border">
        <div className="flex items-center gap-3">
          <span className="text-base">{meta.icon}</span>
          <div>
            <span className="font-mono text-xs font-medium text-text-light">
              {meta.label}
            </span>
            <p className="font-mono text-[10px] text-text-subtle mt-0.5">
              {meta.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle */}
          <button
            type="button"
            onClick={onToggle}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              policy.enabled ? "bg-brand" : "bg-surface-elevated border border-border"
            }`}
            title={policy.enabled ? "Disable policy" : "Enable policy"}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                policy.enabled ? "left-5" : "left-0.5"
              }`}
            />
          </button>
          {/* Remove */}
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-text-subtle hover:text-red-400 transition-colors"
            title="Remove policy"
          >
            <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Config */}
      {policy.enabled && (
        <div className="p-4">
          <PolicyConfigEditor
            type={policy.type}
            config={policy.config}
            onChange={onConfigChange}
          />
        </div>
      )}
    </div>
  );
}

// ── Config Editors ──────────────────────────────────────────────────────

function PolicyConfigEditor({
  type,
  config,
  onChange,
}: {
  type: StewardPolicyType;
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  switch (type) {
    case "spending-limit":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ConfigInput
            label="MAX PER TX (ETH)"
            value={String(config.maxPerTx ?? "")}
            onChange={(v) => onChange("maxPerTx", v)}
            placeholder="0.1"
          />
          <ConfigInput
            label="MAX PER DAY (ETH)"
            value={String(config.maxPerDay ?? "")}
            onChange={(v) => onChange("maxPerDay", v)}
            placeholder="1.0"
          />
          <ConfigInput
            label="MAX PER WEEK (ETH)"
            value={String(config.maxPerWeek ?? "")}
            onChange={(v) => onChange("maxPerWeek", v)}
            placeholder="5.0"
          />
        </div>
      );

    case "auto-approve-threshold":
      return (
        <ConfigInput
          label="AUTO-APPROVE BELOW (ETH)"
          value={String(config.threshold ?? "")}
          onChange={(v) => onChange("threshold", v)}
          placeholder="0.01"
        />
      );

    case "rate-limit":
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <ConfigInput
            label="MAX TX / HOUR"
            value={String(config.maxTxPerHour ?? "")}
            onChange={(v) => onChange("maxTxPerHour", parseInt(v, 10) || 0)}
            placeholder="10"
            type="number"
          />
          <ConfigInput
            label="MAX TX / DAY"
            value={String(config.maxTxPerDay ?? "")}
            onChange={(v) => onChange("maxTxPerDay", parseInt(v, 10) || 0)}
            placeholder="50"
            type="number"
          />
        </div>
      );

    case "approved-addresses":
      return (
        <ApprovedAddressesEditor
          addresses={(config.addresses as string[]) ?? []}
          mode={(config.mode as string) ?? "whitelist"}
          onAddressesChange={(v) => onChange("addresses", v)}
          onModeChange={(v) => onChange("mode", v)}
        />
      );

    case "time-window":
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <ConfigInput
              label="START HOUR (0-23)"
              value={String(
                (
                  config.allowedHours as Array<{
                    start: number;
                    end: number;
                  }>
                )?.[0]?.start ?? "9",
              )}
              onChange={(v) =>
                onChange("allowedHours", [
                  {
                    start: parseInt(v, 10) || 0,
                    end:
                      (
                        config.allowedHours as Array<{
                          start: number;
                          end: number;
                        }>
                      )?.[0]?.end ?? 17,
                  },
                ])
              }
              placeholder="9"
              type="number"
            />
            <ConfigInput
              label="END HOUR (0-23)"
              value={String(
                (
                  config.allowedHours as Array<{
                    start: number;
                    end: number;
                  }>
                )?.[0]?.end ?? "17",
              )}
              onChange={(v) =>
                onChange("allowedHours", [
                  {
                    start:
                      (
                        config.allowedHours as Array<{
                          start: number;
                          end: number;
                        }>
                      )?.[0]?.start ?? 9,
                    end: parseInt(v, 10) || 0,
                  },
                ])
              }
              placeholder="17"
              type="number"
            />
          </div>
          <DaySelector
            selectedDays={(config.allowedDays as number[]) ?? [1, 2, 3, 4, 5]}
            onChange={(days) => onChange("allowedDays", days)}
          />
        </div>
      );

    default:
      return (
        <pre className="font-mono text-[10px] text-text-muted bg-dark-secondary p-2 overflow-auto">
          {JSON.stringify(config, null, 2)}
        </pre>
      );
  }
}

// ── Shared inputs ───────────────────────────────────────────────────────

function ConfigInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block font-mono text-[9px] tracking-wider text-text-subtle mb-1">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 font-mono text-xs text-text-light bg-dark-secondary
          border border-border focus:border-brand/50 focus:outline-none transition-colors"
      />
    </div>
  );
}

function ApprovedAddressesEditor({
  addresses,
  mode,
  onAddressesChange,
  onModeChange,
}: {
  addresses: string[];
  mode: string;
  onAddressesChange: (addresses: string[]) => void;
  onModeChange: (mode: string) => void;
}) {
  const [newAddr, setNewAddr] = useState("");

  const handleAdd = useCallback(() => {
    const trimmed = newAddr.trim();
    if (trimmed && !addresses.includes(trimmed)) {
      onAddressesChange([...addresses, trimmed]);
      setNewAddr("");
    }
  }, [newAddr, addresses, onAddressesChange]);

  const handleRemove = useCallback(
    (addr: string) => {
      onAddressesChange(addresses.filter((a) => a !== addr));
    },
    [addresses, onAddressesChange],
  );

  return (
    <div className="space-y-3">
      {/* Mode toggle */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] tracking-wider text-text-subtle">
          MODE:
        </span>
        {["whitelist", "blacklist"].map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => onModeChange(m)}
            className={`px-3 py-1 font-mono text-[10px] tracking-wide border transition-colors
              ${
                mode === m
                  ? m === "whitelist"
                    ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5"
                    : "text-red-400 border-red-500/20 bg-red-500/5"
                  : "text-text-muted border-border hover:text-text-light"
              }`}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Address list */}
      <div className="space-y-1">
        {addresses.map((addr) => (
          <div
            key={addr}
            className="flex items-center justify-between px-3 py-1.5 bg-dark-secondary border border-border-subtle"
          >
            <code className="font-mono text-[11px] text-text-light">
              {addr}
            </code>
            <button
              type="button"
              onClick={() => handleRemove(addr)}
              className="text-text-subtle hover:text-red-400 transition-colors"
            >
              <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Add address */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newAddr}
          onChange={(e) => setNewAddr(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="0x..."
          className="flex-1 px-3 py-2 font-mono text-xs text-text-light bg-dark-secondary
            border border-border focus:border-brand/50 focus:outline-none transition-colors"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newAddr.trim()}
          className="px-3 py-2 font-mono text-[10px] text-brand border border-brand/20
            hover:bg-brand/10 transition-colors disabled:opacity-40"
        >
          ADD
        </button>
      </div>
    </div>
  );
}

function DaySelector({
  selectedDays,
  onChange,
}: {
  selectedDays: number[];
  onChange: (days: number[]) => void;
}) {
  const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  const toggleDay = useCallback(
    (day: number) => {
      if (selectedDays.includes(day)) {
        onChange(selectedDays.filter((d) => d !== day));
      } else {
        onChange([...selectedDays, day].sort());
      }
    },
    [selectedDays, onChange],
  );

  return (
    <div>
      <p className="font-mono text-[9px] tracking-wider text-text-subtle mb-1.5">
        ALLOWED DAYS
      </p>
      <div className="flex gap-1">
        {DAYS.map((label, i) => (
          <button
            type="button"
            key={label}
            onClick={() => toggleDay(i)}
            className={`px-2 py-1.5 font-mono text-[9px] tracking-wide border transition-colors
              ${
                selectedDays.includes(i)
                  ? "text-brand border-brand/30 bg-brand/8"
                  : "text-text-subtle border-border hover:text-text-light"
              }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * MessageContent — Renders a chat message's content.
 *
 * Follows the json-render pattern: specs are rendered client-side from JSON
 * in the agent's text response. No server-side block extraction needed.
 *
 * Client-side detection:
 *   1. [CONFIG:pluginId] markers → inline plugin config form (ConfigRenderer)
 *   2. Fenced UiSpec JSON → interactive UI (UiRenderer)
 *   3. Everything else → plain text
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext";
import type { ConversationMessage, PluginInfo } from "../api-client";
import { client } from "../api-client";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { paramsToSchema } from "./PluginsView";
import { UiRenderer } from "./ui-renderer";
import type { UiSpec } from "./ui-spec";
import { Button } from "./ui/Button.js";
import { Card } from "./ui/Card.js";
import { Badge } from "./ui/Badge.js";
import {
  parseFive55ActionEnvelope,
  type Five55ActionEnvelope,
} from "./five55ActionEnvelope";

/** Reject prototype-pollution plugin IDs that could slip through the regex. */
const BLOCKED_IDS = new Set(["__proto__", "constructor", "prototype"]);

export interface MessageContentProps {
  message: ConversationMessage;
}

// ── Segment types ───────────────────────────────────────────────────

type Segment =
  | { kind: "text"; text: string }
  | { kind: "config"; pluginId: string }
  | { kind: "ui-spec"; spec: UiSpec; raw: string };

// ── Detection ───────────────────────────────────────────────────────

const CONFIG_RE = /\[CONFIG:(\w[\w-]*)\]/g;
const FENCED_JSON_RE = /```(?:json)?\s*\n([\s\S]*?)```/g;

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUiSpec(obj: unknown): obj is UiSpec {
  if (!obj || typeof obj !== "object") return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c.root === "string" &&
    typeof c.elements === "object" &&
    c.elements !== null
  );
}

/**
 * Parse message text for [CONFIG:id] markers and fenced UiSpec JSON.
 * Returns an array of segments for rendering.
 */
function parseSegments(text: string): Segment[] {
  // Build a unified list of match regions sorted by position
  const regions: Array<{ start: number; end: number; segment: Segment }> = [];

  // 1. Find [CONFIG:pluginId] markers
  CONFIG_RE.lastIndex = 0;
  let m: RegExpExecArray | null = CONFIG_RE.exec(text);
  while (m !== null) {
    regions.push({
      start: m.index,
      end: m.index + m[0].length,
      segment: { kind: "config", pluginId: m[1] },
    });
    m = CONFIG_RE.exec(text);
  }

  // 2. Find fenced JSON that is a UiSpec
  FENCED_JSON_RE.lastIndex = 0;
  m = FENCED_JSON_RE.exec(text);
  while (m !== null) {
    const json = m[1].trim();
    const parsed = tryParse(json);
    if (parsed && isUiSpec(parsed)) {
      regions.push({
        start: m.index,
        end: m.index + m[0].length,
        segment: { kind: "ui-spec", spec: parsed, raw: json },
      });
    }
    m = FENCED_JSON_RE.exec(text);
  }

  // No special content found — return plain text
  if (regions.length === 0) {
    return [{ kind: "text", text }];
  }

  // Sort by start position, then interleave with text segments
  regions.sort((a, b) => a.start - b.start);
  const segments: Segment[] = [];
  let cursor = 0;

  for (const r of regions) {
    // Skip overlapping regions
    if (r.start < cursor) continue;

    // Push preceding text
    if (r.start > cursor) {
      const t = text.slice(cursor, r.start);
      if (t.trim()) segments.push({ kind: "text", text: t });
    }
    segments.push(r.segment);
    cursor = r.end;
  }

  // Trailing text
  if (cursor < text.length) {
    const t = text.slice(cursor);
    if (t.trim()) segments.push({ kind: "text", text: t });
  }

  return segments;
}

// ── InlinePluginConfig ──────────────────────────────────────────────

function InlinePluginConfig({ pluginId }: { pluginId: string }) {
  const [plugin, setPlugin] = useState<PluginInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const mountedRef = useRef(true);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { setActionNotice, loadPlugins } = useApp();

  // Track mount state — reset to true on each mount (needed for StrictMode
  // which unmounts/remounts and would leave the ref false otherwise).
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  // Self-contained: fetch plugin data directly from API
  const fetchPlugin = useCallback(async () => {
    try {
      const { plugins } = await client.getPlugins();
      if (!mountedRef.current) return;
      const found = plugins.find((p) => p.id === pluginId);
      setPlugin(found ?? null);
    } catch {
      if (mountedRef.current) setError("Failed to load plugin info.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [pluginId]);

  useEffect(() => {
    void fetchPlugin();
  }, [fetchPlugin]);

  // Build schema + hints — keyed on plugin.id to avoid recomputing on
  // every fetch (the PluginInfo object is a new reference each time).
  const pluginParams = plugin?.parameters;
  const pluginHints = plugin?.configUiHints;
  const pluginIdResolved = plugin?.id;
  const { schema, hints } = useMemo(() => {
    if (!pluginParams || pluginParams.length === 0 || !pluginIdResolved) {
      return { schema: null, hints: {} as Record<string, ConfigUiHint> };
    }
    const auto = paramsToSchema(pluginParams, pluginIdResolved);
    if (pluginHints) {
      for (const [key, serverHint] of Object.entries(pluginHints)) {
        auto.hints[key] = { ...auto.hints[key], ...serverHint };
      }
    }
    return auto;
  }, [pluginParams, pluginHints, pluginIdResolved]);

  // Initialize values from current server values
  const initialValues = useMemo(() => {
    if (!pluginParams) return {};
    const v: Record<string, unknown> = {};
    for (const p of pluginParams) {
      if (p.isSet && !p.sensitive && p.currentValue != null) {
        v[p.key] = p.currentValue;
      }
    }
    return v;
  }, [pluginParams]);

  const mergedValues = useMemo(
    () => ({ ...initialValues, ...values }),
    [initialValues, values],
  );

  const setKeys = useMemo(() => {
    const s = new Set<string>();
    if (pluginParams) {
      for (const p of pluginParams) {
        if (p.isSet) s.add(p.key);
      }
    }
    for (const [k, v] of Object.entries(values)) {
      if (v != null && v !== "") s.add(k);
    }
    return s;
  }, [pluginParams, values]);

  const handleChange = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) {
        if (v != null && v !== "") patch[k] = String(v);
      }
      await client.updatePlugin(pluginId, { config: patch });
      if (mountedRef.current) setSaved(true);
      await fetchPlugin();
    } catch (e) {
      if (mountedRef.current)
        setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [pluginId, values, fetchPlugin]);

  const handleToggle = useCallback(
    async (enable: boolean) => {
      setEnabling(true);
      setError(null);
      try {
        // Save pending config first, then toggle — same as the Plugins page
        if (enable) {
          const patch: Record<string, string> = {};
          for (const [k, v] of Object.entries(values)) {
            if (v != null && v !== "") patch[k] = String(v);
          }
          if (Object.keys(patch).length > 0) {
            await client.updatePlugin(pluginId, { config: patch });
          }
        }
        // Exact same call as the ON button in PluginsView
        await client.updatePlugin(pluginId, { enabled: enable });
        // Refresh shared plugin state so Plugins page shows updated status
        await loadPlugins();
        if (enable && mountedRef.current) {
          const tabLabel =
            plugin?.category === "feature"
              ? "Plugins > Features"
              : plugin?.category === "connector"
                ? "Plugins > Connectors"
                : "Plugins > System";
          setActionNotice(
            `${plugin?.name ?? pluginId} enabled! Find it in ${tabLabel}.`,
            "success",
            4000,
          );
          setDismissed(true);
        }
        // Wait for agent restart then refresh (with cleanup on unmount)
        refreshTimerRef.current = setTimeout(() => void fetchPlugin(), 3000);
      } catch (e) {
        if (mountedRef.current) {
          setError(
            e instanceof Error
              ? e.message
              : `Failed to ${enable ? "enable" : "disable"} plugin.`,
          );
        }
      } finally {
        if (mountedRef.current) setEnabling(false);
      }
    },
    [pluginId, plugin, values, fetchPlugin, loadPlugins, setActionNotice],
  );

  if (dismissed) {
    return (
      <Card className="my-2 border-ok/30 bg-ok/5 px-3 py-2 text-xs text-ok">
        {plugin?.name ?? pluginId} — enabled
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="my-2 border-white/10 bg-white/[0.03] px-3 py-2 text-xs italic text-white/42">
        Loading {pluginId} configuration...
      </Card>
    );
  }

  if (!plugin) {
    return (
      <Card className="my-2 border-white/10 bg-white/[0.03] px-3 py-2 text-xs italic text-white/42">
        Plugin "{pluginId}" not found.
      </Card>
    );
  }

  const isEnabled = plugin.enabled;

  return (
    <Card className="my-2 overflow-hidden border-white/10 bg-white/[0.03]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 bg-black/20 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-bold text-txt">
          {plugin.icon ? (
            <span className="text-[13px]">{plugin.icon}</span>
          ) : (
            <span className="text-[13px] opacity-60">{"\u2699\uFE0F"}</span>
          )}
          <span>{plugin.name} Configuration</span>
        </div>
        <div className="flex items-center gap-2">
          {plugin.configured && (
            <Badge variant="success" className="rounded-full px-2 py-0.5 text-[10px]">Configured</Badge>
          )}
          <span
            className={`text-[10px] font-medium ${isEnabled ? "text-ok" : "text-white/42"}`}
          >
            {isEnabled ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {/* Form — always shown so user can configure before enabling */}
      {schema && plugin.parameters.length > 0 ? (
        <div className="p-3">
          <ConfigRenderer
            schema={schema as JsonSchemaObject}
            hints={hints}
            values={mergedValues}
            setKeys={setKeys}
            registry={defaultRegistry}
            pluginId={plugin.id}
            onChange={handleChange}
          />
        </div>
      ) : (
        <div className="px-3 py-2 text-xs italic text-white/42">
          No configurable parameters.
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2">
        {schema && plugin.parameters.length > 0 && (
          <Button
            type="button"
            variant="default"
            size="sm"
            className="rounded-xl"
            onClick={handleSave}
            disabled={saving || enabling || Object.keys(values).length === 0}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        )}

        {!isEnabled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-ok/30 text-ok hover:border-ok/60 hover:bg-ok/12"
            onClick={() => void handleToggle(true)}
            disabled={enabling || saving}
          >
            {enabling ? "Enabling..." : "Enable Plugin"}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-white/12 text-white/52 hover:border-danger/40 hover:text-danger"
            onClick={() => void handleToggle(false)}
            disabled={enabling || saving}
          >
            {enabling ? "Disabling..." : "Disable"}
          </Button>
        )}

        {saved && <span className="text-xs text-ok">Saved</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </Card>
  );
}

// ── UiSpec block ────────────────────────────────────────────────────

function UiSpecBlock({ spec, raw }: { spec: UiSpec; raw: string }) {
  const [showRaw, setShowRaw] = useState(false);
  const [interactionNotice, setInteractionNotice] = useState<string | null>(
    null,
  );

  const handleAction = useCallback(
    (_action: string, _params?: Record<string, unknown>) => {
      setInteractionNotice(
        "Interactive preview only. Run actions from the main agent controls.",
      );
    },
    [],
  );

  return (
    <Card className="my-2 overflow-hidden border-white/10 bg-white/[0.03]">
      <div className="flex items-center justify-between border-b border-white/10 bg-black/20 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/44">
          Interactive UI
        </span>
        <Button type="button" variant="ghost" size="sm" className="rounded-xl px-2 text-[10px]" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? "Hide JSON" : "View JSON"}
        </Button>
      </div>
      {showRaw && (
        <div className="overflow-x-auto border-b border-white/10 bg-black/20 px-3 py-2">
          <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[10px] text-white/42">
            {raw}
          </pre>
        </div>
      )}
      <div className="p-3">
        {interactionNotice ? (
          <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-white/64">
            {interactionNotice}
          </div>
        ) : null}
        <UiRenderer spec={spec} onAction={handleAction} />
      </div>
    </Card>
  );
}

function ActionEnvelopeBlock({ envelope }: { envelope: Five55ActionEnvelope }) {
  const tone = envelope.ok
    ? "border-ok/30 bg-ok/5"
    : "border-danger/35 bg-danger/5";
  const stage = envelope.trace?.stage ?? (envelope.ok ? "succeeded" : "failed");

  return (
    <Card className={`my-1 overflow-hidden rounded-2xl ${tone}`}>
      <div className="border-b border-white/10 bg-black/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/44">
        {envelope.module} · {envelope.action}
      </div>
      <div className="px-3 py-2 flex items-start justify-between gap-3">
        <div className="text-[11px] font-mono text-white/46">
          {envelope.code} · {stage} · status {envelope.status}
          {envelope.retryable ? " · retryable" : ""}
          <div className="text-[12px] text-txt whitespace-pre-wrap mt-1">
            {envelope.message}
          </div>
          {envelope.trace?.actionId && (
            <div className="mt-1 text-[10px] text-white/42">
              actionId: {envelope.trace.actionId}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 rounded-xl px-2 text-[10px]"
          onClick={() => {
            window.dispatchEvent(new Event("toggle-custom-actions-panel"));
          }}
          title="Open Actions drawer"
        >
          Open Actions
        </Button>
      </div>
    </Card>
  );
}

function renderTextOrEnvelope(text: string) {
  const envelope = parseFive55ActionEnvelope(text);
  if (envelope) {
    return <ActionEnvelopeBlock envelope={envelope} />;
  }
  return <div className="text-txt whitespace-pre-wrap">{text}</div>;
}

// ── Main component ──────────────────────────────────────────────────

export function MessageContent({ message }: MessageContentProps) {
  // Parse segments — memoize to avoid re-parsing on every render
  const segments = useMemo(() => {
    try {
      return parseSegments(message.text);
    } catch {
      // If parsing fails, just show plain text
      return [{ kind: "text" as const, text: message.text }];
    }
  }, [message.text]);

  // Fast path: single plain-text segment (most messages)
  if (segments.length === 1 && segments[0].kind === "text") {
    return renderTextOrEnvelope(message.text);
  }

  return (
    <div>
      {segments.map((seg, i) => {
        switch (seg.kind) {
          case "text":
            return <div key={i}>{renderTextOrEnvelope(seg.text)}</div>;
          case "config":
            if (BLOCKED_IDS.has(seg.pluginId)) return null;
            return <InlinePluginConfig key={i} pluginId={seg.pluginId} />;
          case "ui-spec":
            return <UiSpecBlock key={i} spec={seg.spec} raw={seg.raw} />;
          default:
            return null;
        }
      })}
    </div>
  );
}

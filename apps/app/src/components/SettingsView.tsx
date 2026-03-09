/**
 * Settings view — unified scrollable preferences panel.
 *
 * Sections:
 *   1. Appearance — theme picker
 *   2. AI Model — provider selection + config
 *   3. Media Generation — image, video, audio, vision provider selection
 *   4. Speech (TTS / STT) — provider + transcription config
 *   5. Updates — software update channel + check
 *   6. Advanced (collapsible) — Logs, Core Plugins, Database, Secrets,
 *      Chrome Extension, Export/Import, Danger Zone
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useApp, THEMES } from "../AppContext";
import {
  client,
  type PluginParamDef,
  type OnboardingOptions,
  type SubscriptionStatusProvider,
} from "../api-client";
import { ConfigPageView } from "./ConfigPageView";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";
import { CodingAgentSettingsSection } from "./CodingAgentSettingsSection";
import { FormFieldStack } from "./FormFieldStack";
import { GitHubSettingsSection } from "./GitHubSettingsSection";
import { MediaSettingsSection } from "./MediaSettingsSection";
import { PermissionsSection } from "./PermissionsSection";
import { SectionEmptyState, SectionErrorState, SectionLoadingState } from "./SectionStates";
import { SectionShell } from "./SectionShell";
import { SelectablePillGrid } from "./SelectablePillGrid";
import { VoiceConfigView } from "./VoiceConfigView";
import { Badge } from "./ui/Badge.js";
import { Button } from "./ui/Button.js";
import { Dialog } from "./ui/Dialog.js";
import { CloseIcon } from "./ui/Icons.js";
import { Input } from "./ui/Input.js";
import type { ConfigUiHint } from "../types";
import type { JsonSchemaObject } from "./config-catalog";

/* ── Modal shell ─────────────────────────────────────────────────────── */

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const titleId = `modal-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <Dialog open={open} onClose={onClose} ariaLabelledBy={titleId}>
      <div className="w-full max-w-md border border-border bg-card p-5 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div id={titleId} className="font-bold text-sm">{title}</div>
          <button
            className="text-muted hover:text-txt text-lg leading-none px-1"
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon width="16" height="16" />
          </button>
        </div>
        {children}
      </div>
    </Dialog>
  );
}

/* ── Auto-detection helpers ────────────────────────────────────────── */

const ACRONYMS = new Set([
  "API", "URL", "ID", "SSH", "SSL", "HTTP", "HTTPS", "RPC",
  "NFT", "EVM", "TLS", "DNS", "IP", "JWT", "SDK", "LLM",
]);

function autoLabel(key: string, pluginId: string): string {
  const prefixes = [
    pluginId.toUpperCase().replace(/-/g, "_") + "_",
    pluginId.toUpperCase().replace(/-/g, "") + "_",
  ];
  let remainder = key;
  for (const prefix of prefixes) {
    if (key.startsWith(prefix) && key.length > prefix.length) {
      remainder = key.slice(prefix.length);
      break;
    }
  }
  return remainder
    .split("_")
    .map((w) => (ACRONYMS.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase()))
    .join(" ");
}

function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

type SubscriptionProviderId = "anthropic-subscription" | "openai-subscription";

const SUBSCRIPTION_PROVIDER_BY_PLUGIN: Record<string, SubscriptionProviderId> = {
  anthropic: "anthropic-subscription",
  openai: "openai-subscription",
};

function formatSubscriptionExpiry(expiresAt: number | null): string {
  if (!expiresAt) return "Not connected";
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

/* ── SettingsView ─────────────────────────────────────────────────────── */

export function SettingsView() {
  const {
    // Cloud
    cloudEnabled,
    cloudConnected,
    cloudCredits,
    cloudCreditsLow,
    cloudCreditsCritical,
    cloudTopUpUrl,
    cloudUserId,
    cloudLoginBusy,
    cloudLoginError,
    cloudDisconnecting,
    // Plugins
    plugins,
    pluginSaving,
    pluginSaveSuccess,
    // Theme
    currentTheme,
    // Updates
    updateStatus,
    updateLoading,
    updateChannelSaving: _updateChannelSaving,
    // Extension
    extensionStatus,
    extensionChecking,
    // Wallet
    walletExportVisible,
    walletExportData,
    // Export/Import
    exportBusy,
    exportPassword,
    exportIncludeLogs,
    exportError,
    exportSuccess,
    importBusy,
    importPassword,
    importError,
    importSuccess,
    // Actions
    loadPlugins,
    handlePluginToggle,
    setTheme,
    setTab,
    loadUpdateStatus,
    handleChannelChange,
    checkExtensionStatus,
    handlePluginConfigSave,
    handleAgentExport,
    handleAgentImport,
    handleCloudLogin,
    handleCloudDisconnect,
    handleReset,
    handleExportKeys,
    copyToClipboard,
    setState,
  } = useApp();

  /* ── Model selection state ─────────────────────────────────────────── */
  const [modelOptions, setModelOptions] = useState<OnboardingOptions["models"] | null>(null);
  const [piModels, setPiModels] = useState<NonNullable<OnboardingOptions["piModels"]>>([]);
  const [piDefaultModel, setPiDefaultModel] = useState<string>("");

  const [currentSmallModel, setCurrentSmallModel] = useState("");
  const [currentLargeModel, setCurrentLargeModel] = useState("");
  const [modelSaving, setModelSaving] = useState(false);
  const [modelSaveSuccess, setModelSaveSuccess] = useState(false);

  /* ── pi-ai provider state ─────────────────────────────────────────── */
  const [piAiEnabled, setPiAiEnabled] = useState(false);
  const [piAiSmallModel, setPiAiSmallModel] = useState("");
  const [piAiLargeModel, setPiAiLargeModel] = useState("");
  const [piAiSaving, setPiAiSaving] = useState(false);
  const [piAiSaveSuccess, setPiAiSaveSuccess] = useState(false);

  /* ── Subscription OAuth state ───────────────────────────────────── */
  const [subscriptionStatusByProvider, setSubscriptionStatusByProvider] = useState<
    Partial<Record<SubscriptionProviderId, SubscriptionStatusProvider>>
  >({});
  const [subscriptionStatusLoading, setSubscriptionStatusLoading] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [subscriptionSuccess, setSubscriptionSuccess] = useState<string | null>(null);
  const [subscriptionBusyByProvider, setSubscriptionBusyByProvider] = useState<
    Partial<Record<SubscriptionProviderId, boolean>>
  >({});
  const [openaiOAuthStarted, setOpenaiOAuthStarted] = useState(false);
  const [openaiCallbackUrl, setOpenaiCallbackUrl] = useState("");
  const [anthropicOAuthStarted, setAnthropicOAuthStarted] = useState(false);
  const [anthropicCode, setAnthropicCode] = useState("");

  useEffect(() => {
    void loadPlugins();
    void loadUpdateStatus();
    void checkExtensionStatus();
  }, [loadPlugins, loadUpdateStatus, checkExtensionStatus]);

  const loadSubscriptionStatus = useCallback(async () => {
    setSubscriptionStatusLoading(true);
    try {
      const response = await client.getSubscriptionStatus();
      const mapped: Partial<Record<SubscriptionProviderId, SubscriptionStatusProvider>> = {};
      for (const provider of response.providers) {
        const id =
          provider.provider === "openai-codex"
            ? "openai-subscription"
            : provider.provider;
        if (id === "openai-subscription" || id === "anthropic-subscription") {
          mapped[id] = provider;
        }
      }
      setSubscriptionStatusByProvider(mapped);
    } catch (err) {
      setSubscriptionError(
        err instanceof Error
          ? `Failed to load OAuth status: ${err.message}`
          : "Failed to load OAuth status",
      );
    } finally {
      setSubscriptionStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscriptionStatus();
  }, [loadSubscriptionStatus]);

  /* ── Derived ──────────────────────────────────────────────────────── */

  const allAiProviders = plugins.filter((p) => p.category === "ai-provider");
  const enabledAiProviders = allAiProviders.filter((p) => p.enabled);

  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    () => (cloudEnabled ? "__cloud__" : null),
  );

  const hasManualSelection = useRef(false);
  useEffect(() => {
    if (hasManualSelection.current) return;

    if (cloudEnabled) {
      if (selectedProviderId !== "__cloud__") setSelectedProviderId("__cloud__");
      return;
    }

    if (piAiEnabled) {
      if (selectedProviderId !== "pi-ai") setSelectedProviderId("pi-ai");
      return;
    }
  }, [cloudEnabled, piAiEnabled, selectedProviderId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Resolve the actually-selected provider: accept __cloud__ / pi-ai or fall back */
  const resolvedSelectedId =
    selectedProviderId === "__cloud__"
      ? "__cloud__"
      : selectedProviderId === "pi-ai"
        ? "pi-ai"
        : selectedProviderId && allAiProviders.some((p) => p.id === selectedProviderId)
          ? selectedProviderId
          : cloudEnabled
            ? "__cloud__"
            : piAiEnabled
              ? "pi-ai"
              : enabledAiProviders[0]?.id ?? null;

  const selectedProvider =
    resolvedSelectedId && resolvedSelectedId !== "__cloud__" && resolvedSelectedId !== "pi-ai"
      ? allAiProviders.find((p) => p.id === resolvedSelectedId) ?? null
      : null;

  const handleSwitchProvider = useCallback(
    async (newId: string) => {
      hasManualSelection.current = true;
      setSelectedProviderId(newId);
      setPiAiEnabled(false);
      const target = allAiProviders.find((p) => p.id === newId);
      if (!target) return;

      /* Turn off cloud mode (and pi-ai mode) when switching to a local provider */
      try {
        await client.updateConfig({
          cloud: { enabled: false },
          env: { vars: { MILAIDY_USE_PI_AI: "" } },
          agents: { defaults: { model: { primary: null } } },
        });
      } catch { /* non-fatal */ }
      if (!target.enabled) {
        await handlePluginToggle(newId, true);
      }
      for (const p of enabledAiProviders) {
        if (p.id !== newId) {
          await handlePluginToggle(p.id, false);
        }
      }
    },
    [allAiProviders, enabledAiProviders, handlePluginToggle],
  );

  const handleSelectCloud = useCallback(async () => {
    hasManualSelection.current = true;
    setSelectedProviderId("__cloud__");
    setPiAiEnabled(false);
    try {
      await client.updateConfig({
        cloud: { enabled: true },
        // Ensure local pi-ai mode is disabled when switching to cloud.
        env: { vars: { MILAIDY_USE_PI_AI: "" } },
        agents: { defaults: { model: { primary: null } } },
        models: {
          small: currentSmallModel || "moonshotai/kimi-k2-turbo",
          large: currentLargeModel || "moonshotai/kimi-k2-0905",
        },
      });
      await client.restartAgent();
    } catch { /* non-fatal */ }
  }, [currentSmallModel, currentLargeModel]);

  const piAiAvailable = piModels.length > 0 || Boolean(piDefaultModel);

  const handleSelectPiAi = useCallback(async () => {
    hasManualSelection.current = true;
    setSelectedProviderId("pi-ai");
    setPiAiEnabled(true);

    setPiAiSaving(true);
    setPiAiSaveSuccess(false);
    try {
      await client.updateConfig({
        cloud: { enabled: false },
        env: { vars: { MILAIDY_USE_PI_AI: "1" } },
        models: {
          piAiSmall: piAiSmallModel.trim() || null,
          piAiLarge: piAiLargeModel.trim() || null,
        },
        agents: {
          defaults: {
            model: {
              // Keep primary aligned with the pi-ai large model override so
              // any code that reads MODEL_PROVIDER as a modelSpec still works.
              primary: piAiLargeModel.trim() || null,
            },
          },
        },
      });
      await client.restartAgent();
      setPiAiSaveSuccess(true);
      setTimeout(() => setPiAiSaveSuccess(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setPiAiSaving(false);
    }
  }, [piAiSmallModel, piAiLargeModel]);

  const handlePiAiSave = useCallback(async () => {
    // Save pi-ai small/large overrides; keep pi-ai enabled.
    setPiAiSaving(true);
    setPiAiSaveSuccess(false);
    try {
      await client.updateConfig({
        cloud: { enabled: false },
        env: { vars: { MILAIDY_USE_PI_AI: "1" } },
        models: {
          piAiSmall: piAiSmallModel.trim() || null,
          piAiLarge: piAiLargeModel.trim() || null,
        },
        agents: {
          defaults: {
            model: {
              primary: piAiLargeModel.trim() || null,
            },
          },
        },
      });
      await client.restartAgent();
      setPiAiEnabled(true);
      setPiAiSaveSuccess(true);
      setTimeout(() => setPiAiSaveSuccess(false), 2000);
    } catch {
      /* ignore */
    } finally {
      setPiAiSaving(false);
    }
  }, [piAiSmallModel, piAiLargeModel]);

  const ext = extensionStatus;
  const relayOk = ext?.relayReachable === true;

  /* ── Export / Import modal state ─────────────────────────────────── */
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importFileRef = useRef<HTMLInputElement>(null);
  const [exportEstimateLoading, setExportEstimateLoading] = useState(false);
  const [exportEstimateError, setExportEstimateError] = useState<string | null>(
    null,
  );
  const [exportEstimate, setExportEstimate] = useState<{
    estimatedBytes: number;
    memoriesCount: number;
    entitiesCount: number;
    roomsCount: number;
    worldsCount: number;
    tasksCount: number;
  } | null>(null);

  const openExportModal = useCallback(() => {
    setState("exportPassword", "");
    setState("exportIncludeLogs", false);
    setState("exportError", null);
    setState("exportSuccess", null);
    setExportEstimate(null);
    setExportEstimateError(null);
    setExportEstimateLoading(true);
    setExportModalOpen(true);
    void (async () => {
      try {
        const estimate = await client.getExportEstimate();
        setExportEstimate(estimate);
      } catch (err) {
        setExportEstimateError(
          err instanceof Error
            ? err.message
            : "Failed to estimate export size.",
        );
      } finally {
        setExportEstimateLoading(false);
      }
    })();
  }, [setState]);

  const openImportModal = useCallback(() => {
    setState("importPassword", "");
    setState("importFile", null);
    setState("importError", null);
    setState("importSuccess", null);
    setImportModalOpen(true);
  }, [setState]);

  /* ── Fetch Models state ────────────────────────────────────────── */
  const [modelsFetching, setModelsFetching] = useState(false);
  const [modelsFetchResult, setModelsFetchResult] = useState<string | null>(null);

  const handleFetchModels = useCallback(
    async (providerId: string) => {
      setModelsFetching(true);
      setModelsFetchResult(null);
      try {
        const result = await client.fetchModels(providerId, true);
        const count = Array.isArray(result?.models) ? result.models.length : 0;
        setModelsFetchResult(`Loaded ${count} models`);
        // Reload plugins so configUiHints are refreshed with new model options
        await loadPlugins();
        setTimeout(() => setModelsFetchResult(null), 3000);
      } catch (err) {
        setModelsFetchResult(`Error: ${err instanceof Error ? err.message : "failed"}`);
        setTimeout(() => setModelsFetchResult(null), 5000);
      }
      setModelsFetching(false);
    },
    [loadPlugins],
  );

  /* ── Plugin config local state for collecting field values ──────── */
  const [pluginFieldValues, setPluginFieldValues] = useState<Record<string, Record<string, string>>>({});

  const handlePluginFieldChange = useCallback(
    (pluginId: string, key: string, value: string) => {
      setPluginFieldValues((prev) => ({
        ...prev,
        [pluginId]: { ...(prev[pluginId] ?? {}), [key]: value },
      }));
    },
    [],
  );

  const handlePluginSave = useCallback(
    (pluginId: string) => {
      const values = pluginFieldValues[pluginId] ?? {};
      void handlePluginConfigSave(pluginId, values);
    },
    [pluginFieldValues, handlePluginConfigSave],
  );

  const setSubscriptionBusy = useCallback(
    (provider: SubscriptionProviderId, busy: boolean) => {
      setSubscriptionBusyByProvider((prev) => ({ ...prev, [provider]: busy }));
    },
    [],
  );

  const notifySubscriptionSuccess = useCallback((message: string) => {
    setSubscriptionSuccess(message);
    setTimeout(() => setSubscriptionSuccess(null), 2500);
  }, []);

  const handleStartSubscriptionOAuth = useCallback(
    async (provider: SubscriptionProviderId) => {
      setSubscriptionError(null);
      setSubscriptionSuccess(null);
      setSubscriptionBusy(provider, true);
      try {
        if (provider === "openai-subscription") {
          const res = await client.startOpenAILogin();
          if (!res.authUrl) throw new Error("OpenAI OAuth URL missing");
          window.open(res.authUrl, "openai-oauth", "width=500,height=700,top=50,left=200");
          setOpenaiOAuthStarted(true);
          setOpenaiCallbackUrl("");
        } else {
          const res = await client.startAnthropicLogin();
          if (!res.authUrl) throw new Error("Anthropic OAuth URL missing");
          window.open(res.authUrl, "anthropic-oauth", "width=600,height=700,top=50,left=200");
          setAnthropicOAuthStarted(true);
          setAnthropicCode("");
        }
      } catch (err) {
        setSubscriptionError(
          err instanceof Error ? err.message : "Failed to start OAuth flow",
        );
      } finally {
        setSubscriptionBusy(provider, false);
      }
    },
    [setSubscriptionBusy],
  );

  const handleCompleteOpenAIOAuth = useCallback(async () => {
    const callback = openaiCallbackUrl.trim();
    if (!callback) return;
    setSubscriptionError(null);
    setSubscriptionSuccess(null);
    setSubscriptionBusy("openai-subscription", true);
    try {
      const result = await client.exchangeOpenAICode(callback);
      if (!result.success) {
        throw new Error("OpenAI OAuth exchange failed");
      }
      setOpenaiOAuthStarted(false);
      setOpenaiCallbackUrl("");
      await loadSubscriptionStatus();
      await loadPlugins();
      notifySubscriptionSuccess("OpenAI subscription connected");
    } catch (err) {
      setSubscriptionError(
        err instanceof Error ? err.message : "Failed to complete OpenAI OAuth",
      );
    } finally {
      setSubscriptionBusy("openai-subscription", false);
    }
  }, [
    loadPlugins,
    loadSubscriptionStatus,
    notifySubscriptionSuccess,
    openaiCallbackUrl,
    setSubscriptionBusy,
  ]);

  const handleCompleteAnthropicOAuth = useCallback(async () => {
    const code = anthropicCode.trim();
    if (!code) return;
    setSubscriptionError(null);
    setSubscriptionSuccess(null);
    setSubscriptionBusy("anthropic-subscription", true);
    try {
      const result = await client.exchangeAnthropicCode(code);
      if (!result.success) {
        throw new Error("Anthropic OAuth exchange failed");
      }
      setAnthropicOAuthStarted(false);
      setAnthropicCode("");
      await loadSubscriptionStatus();
      await loadPlugins();
      notifySubscriptionSuccess("Anthropic subscription connected");
    } catch (err) {
      setSubscriptionError(
        err instanceof Error ? err.message : "Failed to complete Anthropic OAuth",
      );
    } finally {
      setSubscriptionBusy("anthropic-subscription", false);
    }
  }, [
    anthropicCode,
    loadPlugins,
    loadSubscriptionStatus,
    notifySubscriptionSuccess,
    setSubscriptionBusy,
  ]);

  const handleSubscriptionDisconnect = useCallback(
    async (provider: SubscriptionProviderId) => {
      setSubscriptionError(null);
      setSubscriptionSuccess(null);
      setSubscriptionBusy(provider, true);
      try {
        await client.disconnectSubscription(provider);
        if (provider === "openai-subscription") {
          setOpenaiOAuthStarted(false);
          setOpenaiCallbackUrl("");
        } else {
          setAnthropicOAuthStarted(false);
          setAnthropicCode("");
        }
        await loadSubscriptionStatus();
        await loadPlugins();
        notifySubscriptionSuccess("Subscription disconnected");
      } catch (err) {
        setSubscriptionError(
          err instanceof Error ? err.message : "Failed to disconnect subscription",
        );
      } finally {
        setSubscriptionBusy(provider, false);
      }
    },
    [loadPlugins, loadSubscriptionStatus, notifySubscriptionSuccess, setSubscriptionBusy],
  );


  return (
    <div className="space-y-6">
      <SectionShell
        title="Appearance"
        description="Choose the active theme."
        className="mb-6"
        contentClassName="space-y-4"
      >
        <SelectablePillGrid
          className="pro-streamer-settings-option-grid"
          size="compact"
          value={currentTheme}
          onChange={(next) => setTheme(next)}
          options={THEMES.map((theme) => ({
            value: theme.id,
            label: theme.label,
            description: theme.hint,
          }))}
        />
      </SectionShell>

      {/* ═══════════════════════════════════════════════════════════════
          2. AI MODEL
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        title="AI model"
        description="Choose the active provider and configure access."
        className="mt-6"
        contentClassName="space-y-4"
      >

        {(() => {
          const isCloudSelected = resolvedSelectedId === "__cloud__";
          const isPiAiSelected = resolvedSelectedId === "pi-ai";
          const providerOptions = [
            {
              value: "__cloud__",
              label: "Eliza Cloud",
              description: "Managed cloud provider",
            },
            {
              value: "pi-ai",
              label: "Pi (pi-ai)",
              description: piAiAvailable ? "Local credentials" : "Unavailable",
              disabled: !piAiAvailable && !isPiAiSelected,
            },
            ...allAiProviders.map((provider) => ({
              value: provider.id,
              label: provider.name,
            })),
          ];

          if (providerOptions.length === 0) {
            return (
              <SectionEmptyState
                title="No AI providers available"
                description="Install or enable a provider in Plugins and Connectors before choosing a default model surface."
                actionLabel="Open plugins"
                onAction={() => setTab("plugins")}
              />
            );
          }

          return (
            <>
              <SelectablePillGrid
                className="pro-streamer-settings-option-grid"
                size="compact"
                options={providerOptions}
                value={(resolvedSelectedId ?? "__cloud__") as string}
                onChange={(next) => {
                  if (next === "__cloud__") {
                    void handleSelectCloud();
                    return;
                  }
                  if (next === "pi-ai") {
                    void handleSelectPiAi();
                    return;
                  }
                  void handleSwitchProvider(next);
                }}
              />

              {/* Eliza Cloud settings */}
              {isCloudSelected && (
                <SectionShell
                  title="Eliza Cloud"
                  description="Managed cloud auth, balance, and model defaults."
                  className="mt-2"
                  toolbar={
                    cloudConnected ? (
                      <Badge variant="success">Connected</Badge>
                    ) : (
                      <Badge variant="outline">Sign in required</Badge>
                    )
                  }
                >
                  {cloudConnected ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                          <span className="text-sm font-medium text-white/88">Logged into Eliza Cloud</span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleCloudDisconnect()}
                          disabled={cloudDisconnecting}
                        >
                          {cloudDisconnecting ? "Disconnecting..." : "Disconnect"}
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-sm text-white/64">
                        {cloudUserId && (
                          <span className="mr-1">
                            <code className="font-[var(--mono)] text-[11px]">{cloudUserId}</code>
                          </span>
                        )}
                        {cloudCredits !== null && (
                          <span className="flex items-center gap-2">
                            <span className="text-white/55">Credits</span>
                            <span
                              className={
                                cloudCreditsCritical
                                  ? "text-[var(--danger,#e74c3c)] font-bold"
                                  : cloudCreditsLow
                                    ? "text-[#b8860b] font-bold"
                                    : ""
                              }
                            >
                              ${cloudCredits.toFixed(2)}
                            </span>
                            <a
                              href={cloudTopUpUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] text-[var(--accent)]"
                            >
                              Top up
                            </a>
                          </span>
                        )}
                      </div>

                      {modelOptions && (() => {
                        const modelSchema = {
                          type: "object" as const,
                          properties: {
                            small: {
                              type: "string",
                              enum: modelOptions.small.map((m) => m.id),
                              description: "Fast model for simple tasks",
                            },
                            large: {
                              type: "string",
                              enum: modelOptions.large.map((m) => m.id),
                              description: "Powerful model for complex reasoning",
                            },
                          },
                          required: [] as string[],
                        };
                        const modelHints: Record<string, ConfigUiHint> = {
                          small: { label: "Small Model", width: "half" },
                          large: { label: "Large Model", width: "half" },
                        };
                        const modelValues: Record<string, unknown> = {};
                        const modelSetKeys = new Set<string>();
                        if (currentSmallModel) { modelValues.small = currentSmallModel; modelSetKeys.add("small"); }
                        if (currentLargeModel) { modelValues.large = currentLargeModel; modelSetKeys.add("large"); }

                        return (
                          <ConfigRenderer
                            schema={modelSchema as JsonSchemaObject}
                            hints={modelHints}
                            values={modelValues}
                            setKeys={modelSetKeys}
                            registry={defaultRegistry}
                            onChange={(key, value) => {
                              const val = String(value);
                              if (key === "small") setCurrentSmallModel(val);
                              if (key === "large") setCurrentLargeModel(val);
                              const updated = {
                                small: key === "small" ? val : currentSmallModel,
                                large: key === "large" ? val : currentLargeModel,
                              };
                              void (async () => {
                                setModelSaving(true);
                                try {
                                  await client.updateConfig({ models: updated });
                                  setModelSaveSuccess(true);
                                  setTimeout(() => setModelSaveSuccess(false), 2000);
                                  await client.restartAgent();
                                } catch { /* ignore */ }
                                setModelSaving(false);
                              })();
                            }}
                          />
                        );
                      })()}

                      <div className="flex items-center justify-end gap-2 mt-3">
                        {modelSaving && <span className="text-[11px] text-[var(--muted)]">Saving &amp; restarting...</span>}
                        {modelSaveSuccess && <span className="text-[11px] text-[var(--ok,#16a34a)]">Saved — restarting agent</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cloudLoginBusy ? (
                        <div className="text-sm text-[var(--muted)]">
                          Waiting for browser authentication... A new tab should have opened.
                        </div>
                      ) : (
                        <>
                          {cloudLoginError && (
                            <SectionErrorState
                              title="Cloud sign-in failed"
                              description="The cloud auth flow did not complete."
                              details={cloudLoginError}
                            />
                          )}
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void handleCloudLogin()}
                          >
                            Log in to Eliza Cloud
                          </Button>
                          <div className="text-[11px] text-[var(--muted)]">
                            Opens a browser window to authenticate.
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </SectionShell>
              )}

              {/* ── pi-ai settings (local credentials) ───────────────── */}
              {!isCloudSelected && isPiAiSelected && (
                <SectionShell
                  title="Pi (pi-ai)"
                  description="Local credentials from ~/.pi/agent/auth.json."
                  className="mt-2"
                  toolbar={
                    <Badge variant={piAiEnabled ? "success" : "outline"}>
                      {piAiEnabled ? "Enabled" : "Disabled"}
                    </Badge>
                  }
                >
                  <div className="space-y-4">
                    <FormFieldStack
                      label="Small model"
                      help={`Used for fast tasks. Leave blank to use the pi default${piDefaultModel ? ` (${piDefaultModel})` : ""}.`}
                    >
                      <Input
                        value={piAiSmallModel}
                        onChange={(e) => setPiAiSmallModel(e.target.value)}
                        placeholder={piDefaultModel ? `e.g. ${piDefaultModel}` : "provider/modelId"}
                        list="pi-ai-models-config"
                      />
                    </FormFieldStack>
                    <datalist id="pi-ai-models-config">
                      {piModels.slice(0, 400).map((m) => (
                        <option key={m.id} value={m.id} />
                      ))}
                    </datalist>

                    <FormFieldStack
                      label="Large model"
                      help={`Used for complex reasoning. Leave blank to use the pi default${piDefaultModel ? ` (${piDefaultModel})` : ""}.`}
                    >
                      <Input
                        value={piAiLargeModel}
                        onChange={(e) => setPiAiLargeModel(e.target.value)}
                        placeholder={piDefaultModel ? `e.g. ${piDefaultModel}` : "provider/modelId"}
                        list="pi-ai-models-config-large"
                      />
                    </FormFieldStack>
                    <datalist id="pi-ai-models-config-large">
                      {piModels.slice(0, 400).map((m) => (
                        <option key={m.id} value={m.id} />
                      ))}
                    </datalist>

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => void handlePiAiSave()}
                        disabled={piAiSaving}
                      >
                        {piAiSaving ? "Saving..." : piAiSaveSuccess ? "Saved" : "Save & Restart"}
                      </Button>
                    </div>
                  </div>
                </SectionShell>
              )}

              {/* ── Local provider settings ──────────────────────────── */}
              {!isCloudSelected && selectedProvider && (() => {
                const isSaving = pluginSaving.has(selectedProvider.id);
                const saveSuccess = pluginSaveSuccess.has(selectedProvider.id);
                const params = selectedProvider.parameters;
                const setCount = params.filter((p: PluginParamDef) => p.isSet).length;
                const hasPluginParams = params.length > 0;
                const subscriptionProviderId =
                  SUBSCRIPTION_PROVIDER_BY_PLUGIN[selectedProvider.id] ?? null;
                const supportsSubscriptionOAuth = subscriptionProviderId !== null;
                const providerStatus = subscriptionProviderId
                  ? (subscriptionStatusByProvider[subscriptionProviderId] ?? null)
                  : null;
                const providerBusy = subscriptionProviderId
                  ? subscriptionBusyByProvider[subscriptionProviderId] === true
                  : false;
                const isConfigured = selectedProvider.configured || Boolean(providerStatus?.configured);

                if (!hasPluginParams && !supportsSubscriptionOAuth) return null;

                return (
                  <SectionShell
                    title={selectedProvider.name}
                    description={
                      hasPluginParams
                        ? `${setCount}/${params.length} settings configured.`
                        : "OAuth authorization required."
                    }
                    className="mt-2"
                    toolbar={
                      <Badge variant={isConfigured ? "success" : "warning"}>
                        {isConfigured ? "Configured" : "Needs setup"}
                      </Badge>
                    }
                  >

                    {supportsSubscriptionOAuth && subscriptionProviderId && (
                      <SectionShell
                        title="Subscription OAuth"
                        description={`Expires: ${formatSubscriptionExpiry(providerStatus?.expiresAt ?? null)}`}
                        toolbar={
                          <Badge
                            variant={
                              providerStatus?.configured && providerStatus?.valid
                                ? "success"
                                : "warning"
                            }
                          >
                            {providerStatus?.configured && providerStatus?.valid
                              ? "Connected"
                              : providerStatus?.configured
                                ? "Expired"
                                : "Not connected"}
                          </Badge>
                        }
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void loadSubscriptionStatus()}
                            disabled={subscriptionStatusLoading || providerBusy}
                          >
                            {subscriptionStatusLoading ? "Refreshing..." : "Refresh status"}
                          </Button>
                          {providerStatus?.configured ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleSubscriptionDisconnect(subscriptionProviderId)}
                              disabled={providerBusy}
                            >
                              {providerBusy ? "Disconnecting..." : "Disconnect"}
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleStartSubscriptionOAuth(subscriptionProviderId)}
                              disabled={providerBusy}
                            >
                              {providerBusy ? "Starting..." : "Connect OAuth"}
                            </Button>
                          )}
                        </div>

                        {subscriptionProviderId === "openai-subscription" && openaiOAuthStarted && (
                          <div className="space-y-3">
                            <FormFieldStack
                              label="OpenAI callback URL"
                              help="Paste the full callback URL from the OpenAI login redirect."
                            >
                              <Input
                              type="text"
                              placeholder="http://localhost:1455/auth/callback?code=..."
                              value={openaiCallbackUrl}
                              onChange={(e) => setOpenaiCallbackUrl(e.target.value)}
                              />
                            </FormFieldStack>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => void handleCompleteOpenAIOAuth()}
                                disabled={providerBusy || !openaiCallbackUrl.trim()}
                              >
                                {providerBusy ? "Completing..." : "Complete OpenAI Login"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setOpenaiOAuthStarted(false);
                                  setOpenaiCallbackUrl("");
                                }}
                                disabled={providerBusy}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {subscriptionProviderId === "anthropic-subscription" && anthropicOAuthStarted && (
                          <div className="space-y-3">
                            <FormFieldStack
                              label="Anthropic authorization code"
                              help="Paste the code returned by Anthropic after sign-in."
                            >
                              <Input
                              type="text"
                              placeholder="Authorization code..."
                              value={anthropicCode}
                              onChange={(e) => setAnthropicCode(e.target.value)}
                              />
                            </FormFieldStack>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => void handleCompleteAnthropicOAuth()}
                                disabled={providerBusy || !anthropicCode.trim()}
                              >
                                {providerBusy ? "Completing..." : "Complete Anthropic Login"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setAnthropicOAuthStarted(false);
                                  setAnthropicCode("");
                                }}
                                disabled={providerBusy}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}

                        {subscriptionError && (
                          <SectionErrorState
                            title="Subscription auth failed"
                            description="The OAuth flow did not complete for this provider."
                            details={subscriptionError}
                            className="mt-2"
                          />
                        )}
                        {subscriptionSuccess && (
                          <div className="text-[11px] text-[var(--ok,#16a34a)] mt-2">
                            {subscriptionSuccess}
                          </div>
                        )}
                      </SectionShell>
                    )}

                    {hasPluginParams && (() => {
                      const properties: Record<string, Record<string, unknown>> = {};
                      const required: string[] = [];
                      const hints: Record<string, ConfigUiHint> = {};
                      const serverHints = selectedProvider.configUiHints ?? {};
                      for (const p of params) {
                        const prop: Record<string, unknown> = {};
                        if (p.type === "boolean") prop.type = "boolean";
                        else if (p.type === "number") prop.type = "number";
                        else prop.type = "string";
                        if (p.description) prop.description = p.description;
                        if (p.default != null) prop.default = p.default;
                        if (p.options?.length) prop.enum = p.options;
                        const k = p.key.toUpperCase();
                        if (k.includes("URL") || k.includes("ENDPOINT")) prop.format = "uri";
                        properties[p.key] = prop;
                        if (p.required) required.push(p.key);
                        hints[p.key] = {
                          label: autoLabel(p.key, selectedProvider.id),
                          sensitive: p.sensitive ?? false,
                          ...serverHints[p.key],
                        };
                        if (p.description && !hints[p.key].help) hints[p.key].help = p.description;
                      }
                      const schema = { type: "object", properties, required } as JsonSchemaObject;
                      const values: Record<string, unknown> = {};
                      const setKeys = new Set<string>();
                      for (const p of params) {
                        const cv = pluginFieldValues[selectedProvider.id]?.[p.key];
                        if (cv !== undefined) { values[p.key] = cv; }
                        else if (p.isSet && !p.sensitive && p.currentValue != null) { values[p.key] = p.currentValue; }
                        if (p.isSet) setKeys.add(p.key);
                      }
                      return (
                        <ConfigRenderer
                          schema={schema}
                          hints={hints}
                          values={values}
                          setKeys={setKeys}
                          registry={defaultRegistry}
                          pluginId={selectedProvider.id}
                          onChange={(key, value) => handlePluginFieldChange(selectedProvider.id, key, String(value ?? ""))}
                        />
                      );
                    })()}

                    {hasPluginParams && (
                      <div className="flex justify-between items-center mt-3">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="!mt-0 rounded-full"
                            onClick={() => void handleFetchModels(selectedProvider.id)}
                            disabled={modelsFetching}
                          >
                            {modelsFetching ? "Fetching..." : "Fetch Models"}
                          </Button>
                          {modelsFetchResult && (
                            <span className={`text-[11px] ${modelsFetchResult.startsWith("Error") ? "text-[var(--danger,#e74c3c)]" : "text-[var(--ok,#16a34a)]"}`}>
                              {modelsFetchResult}
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className={`!mt-0 rounded-full ${saveSuccess ? "!bg-[var(--ok,#16a34a)] !border-[var(--ok,#16a34a)] !text-black" : ""}`}
                          onClick={() => handlePluginSave(selectedProvider.id)}
                          disabled={isSaving}
                        >
                          {isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save"}
                        </Button>
                      </div>
                    )}
                  </SectionShell>
                );
              })()}
            </>
          );
        })()}
      </SectionShell>

      {/* ═══════════════════════════════════════════════════════════════
          3. WALLET / RPC / SECRETS
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        className="mt-6"
        title="Wallet and RPC"
        description="Keys, providers, cloud auth, and secrets."
      >
        <ConfigPageView embedded />
      </SectionShell>

      {/* ═══════════════════════════════════════════════════════════════
          3b. GITHUB
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        className="mt-6"
        title="GitHub"
        description="Repository authentication and source control integration."
      >
        <GitHubSettingsSection />
      </SectionShell>

      {/* ═══════════════════════════════════════════════════════════════
          3c. CODING AGENTS
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        className="mt-6"
        title="Coding agents"
        description="Execution policy and repository controls for coding workflows."
      >
        <CodingAgentSettingsSection />
      </SectionShell>

      {/* ═══════════════════════════════════════════════════════════════
          4. MEDIA GENERATION
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        className="mt-6"
        title="Media generation"
        description="Image, video, audio, and vision provider settings."
      >
        <MediaSettingsSection />
      </SectionShell>

      {/* ═══════════════════════════════════════════════════════════════
          5. SPEECH (TTS / STT)
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        className="mt-6"
        title="Speech"
        description="Text-to-speech and transcription configuration."
      >
        <VoiceConfigView />
      </SectionShell>

      {/* ═══════════════════════════════════════════════════════════════
          6. PERMISSIONS & CAPABILITIES
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        className="mt-6"
        title="Permissions and capabilities"
        description="Review the surfaces this agent can access and control."
      >
        <PermissionsSection />
      </SectionShell>

      {/* ═══════════════════════════════════════════════════════════════
          7. UPDATES
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        className="mt-6"
        title="Software updates"
        description="Release channel and current desktop runtime version."
        toolbar={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={updateLoading}
            onClick={() => void loadUpdateStatus(true)}
          >
            {updateLoading ? "Checking..." : "Check now"}
          </Button>
        }
      >
        <div className="text-xs text-[var(--muted)]">
              {updateStatus ? (
                <>Version {updateStatus.currentVersion}</>
              ) : (
                <>Loading...</>
              )}
        </div>

        {updateStatus ? (
          <>
            <div className="mt-4">
              <ConfigRenderer
                schema={{
                  type: "object",
                  properties: {
                    channel: {
                      type: "string",
                      enum: ["stable", "beta", "nightly"],
                    },
                  },
                }}
                hints={{
                  channel: {
                    label: "Release Channel",
                    type: "radio",
                    width: "full",
                    options: [
                      {
                        value: "stable",
                        label: "Stable",
                        description: "Recommended — production-ready releases",
                      },
                      {
                        value: "beta",
                        label: "Beta",
                        description:
                          "Preview — early access to upcoming features",
                      },
                      {
                        value: "nightly",
                        label: "Nightly",
                        description:
                          "Bleeding edge — latest development builds",
                      },
                    ],
                  },
                }}
                values={{ channel: updateStatus.channel }}
                registry={defaultRegistry}
                onChange={(key, value) => {
                  if (key === "channel")
                    void handleChannelChange(
                      value as "stable" | "beta" | "nightly",
                    );
                }}
              />
            </div>

            {updateStatus.updateAvailable && updateStatus.latestVersion && (
              <div className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-[var(--accent)]/35 bg-[rgba(255,255,255,0.03)] px-4 py-3">
                <div>
                  <div className="text-[13px] font-bold text-[var(--accent)]">
                    Update available
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {updateStatus.currentVersion} &rarr;{" "}
                    {updateStatus.latestVersion}
                  </div>
                </div>
                <div className="text-[11px] text-[var(--muted)] text-right">
                  Run{" "}
                  <code className="bg-[var(--bg-hover,rgba(255,255,255,0.05))] px-1.5 py-0.5 rounded-sm">
                    Pro Streamer update
                  </code>
                </div>
              </div>
            )}

            {updateStatus.error && (
              <SectionErrorState
                className="mt-4"
                title="Update check failed"
                description="The update service did not return a valid status."
                details={updateStatus.error}
              />
            )}

            {updateStatus.lastCheckAt && (
              <div className="mt-2 text-[11px] text-[var(--muted)]">
                Last checked:{" "}
                {new Date(updateStatus.lastCheckAt).toLocaleString()}
              </div>
            )}
          </>
        ) : (
          updateLoading ? (
            <SectionLoadingState
              className="mt-4"
              title="Checking for updates"
              description="Refreshing the current release channel status."
            />
          ) : (
            <SectionEmptyState
              className="mt-4"
              title="Update status unavailable"
              description="The app could not load the current update state yet."
              actionLabel="Retry"
              onAction={() => void loadUpdateStatus(true)}
            />
          )
        )}
      </SectionShell>

      {/* ═══════════════════════════════════════════════════════════════
          4. CHROME EXTENSION
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        className="mt-6"
        title="Chrome extension"
        description="Browser relay and local extension install status."
        toolbar={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => void checkExtensionStatus()}
            disabled={extensionChecking}
          >
            {extensionChecking ? "Checking..." : "Check connection"}
          </Button>
        }
      >

        {ext && (
          <div className="mb-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{
                  background: relayOk
                    ? "var(--ok, #16a34a)"
                    : "var(--danger, #e74c3c)",
                }}
              />
              <span className="text-[13px] font-bold">
                Relay Server: {relayOk ? "Connected" : "Not Reachable"}
              </span>
            </div>
            <div className="text-xs text-[var(--muted)] font-[var(--mono)]">
              ws://127.0.0.1:{ext.relayPort}/extension
            </div>
            {!relayOk && (
              <div className="text-xs text-[var(--danger,#e74c3c)] mt-1.5">
                The browser relay server is not running. Start the agent with
                browser control enabled, then check again.
              </div>
            )}
          </div>
        )}

        <SectionShell
          className="mt-4"
          title="Install Chrome extension"
          description="Load the unpacked extension in Chrome and connect it to the local relay."
        >
          <div className="text-xs text-[var(--muted)] leading-relaxed">
            <ol className="m-0 pl-5">
              <li className="mb-1.5">
                Open Chrome and navigate to{" "}
                <code className="text-[11px] px-1 border border-[var(--border)] bg-[var(--bg-muted)]">
                  chrome://extensions
                </code>
              </li>
              <li className="mb-1.5">
                Enable <strong>Developer mode</strong> (toggle in the top-right
                corner)
              </li>
              <li className="mb-1.5">
                Click <strong>&quot;Load unpacked&quot;</strong> and select the
                extension folder:
                {ext?.extensionPath ? (
                  <>
                    <br />
                    <code className="text-[11px] px-1.5 border border-[var(--border)] bg-[var(--bg-muted)] inline-block mt-1 break-all">
                      {ext.extensionPath}
                    </code>
                  </>
                ) : (
                  <>
                    <br />
                    <code className="text-[11px] px-1.5 border border-[var(--border)] bg-[var(--bg-muted)] inline-block mt-1">
                      apps/chrome-extension/
                    </code>
                    <span className="italic">
                      {" "}
                      (relative to the app package root)
                    </span>
                  </>
                )}
              </li>
              <li className="mb-1.5">
                Pin the extension icon in Chrome&apos;s toolbar
              </li>
              <li>
                Click the extension icon on any tab to attach/detach the agent
                browser relay
              </li>
            </ol>
          </div>
        </SectionShell>

        {ext?.extensionPath && (
          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 font-[var(--mono)] text-[11px] break-all">
            Extension path: {ext.extensionPath}
          </div>
        )}
      </SectionShell>

      {/* ═══════════════════════════════════════════════════════════════
          11. EXPORT / IMPORT
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        className="mt-6"
        title="Agent export and import"
        description="Move configuration, memories, chats, and secrets as an encrypted bundle."
        toolbar={
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={openImportModal}>
              Import
            </Button>
            <Button type="button" size="sm" className="rounded-full" onClick={openExportModal}>
              Export
            </Button>
          </div>
        }
      />

      {/* ═══════════════════════════════════════════════════════════════
          12. DANGER ZONE
          ═══════════════════════════════════════════════════════════════ */}
      <SectionShell
        className="mt-8 border-[var(--danger,#e74c3c)]/40"
        title="Danger zone"
        description="Irreversible actions. Proceed with caution."
      >
        <div className="rounded-2xl border border-[var(--danger,#e74c3c)]/45 p-4 mb-3">
          <div className="flex justify-between items-center">
            <div>
              <div className="font-bold text-sm">Export Private Keys</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                Reveal your EVM and Solana private keys. Never share these with
                anyone.
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="whitespace-nowrap rounded-full bg-[var(--danger,#e74c3c)] text-black hover:bg-[var(--danger,#e74c3c)]/85"
              onClick={() => void handleExportKeys()}
            >
              {walletExportVisible ? "Hide Keys" : "Export Keys"}
            </Button>
          </div>
          {walletExportVisible && walletExportData && (
            <div className="mt-3 p-3 border border-[var(--danger,#e74c3c)] bg-[var(--bg-muted)] font-[var(--mono)] text-[11px] break-all leading-relaxed">
              {walletExportData.evm && (
                <div className="mb-2">
                  <strong>EVM Private Key</strong>{" "}
                  <span className="text-[var(--muted)]">
                    ({walletExportData.evm.address})
                  </span>
                  <br />
                  <span>{walletExportData.evm.privateKey}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-2 h-auto px-2 py-1 text-[10px] font-[var(--mono)]"
                    onClick={() =>
                      void copyToClipboard(walletExportData.evm.privateKey)
                    }
                  >
                    copy
                  </Button>
                </div>
              )}
              {walletExportData.solana && (
                <div>
                  <strong>Solana Private Key</strong>{" "}
                  <span className="text-[var(--muted)]">
                    ({walletExportData.solana.address})
                  </span>
                  <br />
                  <span>{walletExportData.solana.privateKey}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="ml-2 h-auto px-2 py-1 text-[10px] font-[var(--mono)]"
                    onClick={() =>
                      void copyToClipboard(walletExportData.solana.privateKey)
                    }
                  >
                    copy
                  </Button>
                </div>
              )}
              {!walletExportData.evm && !walletExportData.solana && (
                <div className="text-[var(--muted)]">
                  No wallet keys configured.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--danger,#e74c3c)]/45 p-4 flex justify-between items-center">
          <div>
            <div className="font-bold text-sm">Reset Agent</div>
            <div className="text-xs text-[var(--muted)] mt-0.5">
              Wipe all config, memory, and data. Returns to the onboarding
              wizard.
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="whitespace-nowrap rounded-full bg-[var(--danger,#e74c3c)] text-black hover:bg-[var(--danger,#e74c3c)]/85"
            onClick={() => void handleReset()}
          >
            Reset Everything
          </Button>
        </div>
      </SectionShell>

      {/* ── Modals ── */}
      <Modal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        title="Export Agent"
      >
        <div className="flex flex-col gap-3">
          <div className="text-xs text-[var(--muted)]">
            Your character, memories, chats, secrets, and relationships will be
            downloaded as a single file. Exports are encrypted and require a
            password.
          </div>
          {exportEstimateLoading && (
            <div className="text-[11px] text-[var(--muted)]">
              Estimating export size…
            </div>
          )}
          {!exportEstimateLoading && exportEstimate && (
            <div className="text-[11px] text-[var(--muted)] border border-[var(--border)] bg-[var(--bg-muted)] px-2.5 py-2">
              <div>
                Estimated file size:{" "}
                {formatByteSize(exportEstimate.estimatedBytes)}
              </div>
              <div>
                Contains {exportEstimate.memoriesCount} memories,{" "}
                {exportEstimate.entitiesCount} entities,{" "}
                {exportEstimate.roomsCount} rooms, {exportEstimate.worldsCount}{" "}
                worlds, {exportEstimate.tasksCount} tasks.
              </div>
            </div>
          )}
          {!exportEstimateLoading && exportEstimateError && (
            <div className="text-[11px] text-[var(--danger,#e74c3c)]">
              Could not estimate export size: {exportEstimateError}
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="agent-export-password-input"
              className="font-semibold text-xs"
            >
              Encryption Password
            </label>
            <Input
              id="agent-export-password-input"
              type="password"
              placeholder="Enter password (minimum 4 characters)"
              value={exportPassword}
              onChange={(e) => setState("exportPassword", e.target.value)}
              className="font-[var(--mono)]"
            />
            <div className="text-[11px] text-[var(--muted)]">
              Password must be at least 4 characters.
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={exportIncludeLogs}
              onChange={(e) => setState("exportIncludeLogs", e.target.checked)}
            />
            Include logs in export
          </label>
          {exportError && (
            <div className="text-[11px] text-[var(--danger,#e74c3c)]">
              {exportError}
            </div>
          )}
          {exportSuccess && (
            <div className="text-[11px] text-[var(--ok,#16a34a)]">
              {exportSuccess}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setExportModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              disabled={exportBusy}
              onClick={() => void handleAgentExport()}
            >
              {exportBusy ? "Exporting..." : "Download Export"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        title="Import Agent"
      >
        <div className="flex flex-col gap-3">
          <div className="text-xs text-[var(--muted)]">
            Select an <code className="text-[11px]">.eliza-agent</code> export
            file and enter the password used during export.
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="agent-import-file-input"
              className="font-semibold text-xs"
            >
              Export File
            </label>
            <input
              id="agent-import-file-input"
              ref={importFileRef}
              type="file"
              accept=".eliza-agent"
              onChange={(e) => {
                setState("importFile", e.target.files?.[0] ?? null);
                setState("importError", null);
                setState("importSuccess", null);
              }}
              className="text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label
              htmlFor="agent-import-password-input"
              className="font-semibold text-xs"
            >
              Decryption Password
            </label>
            <Input
              id="agent-import-password-input"
              type="password"
              placeholder="Enter password (minimum 4 characters)"
              value={importPassword}
              onChange={(e) => setState("importPassword", e.target.value)}
              className="font-[var(--mono)]"
            />
            <div className="text-[11px] text-[var(--muted)]">
              Password must be at least 4 characters.
            </div>
          </div>
          {importError && (
            <div className="text-[11px] text-[var(--danger,#e74c3c)]">
              {importError}
            </div>
          )}
          {importSuccess && (
            <div className="text-[11px] text-[var(--ok,#16a34a)]">
              {importSuccess}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setImportModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              disabled={importBusy}
              onClick={() => void handleAgentImport()}
            >
              {importBusy ? "Importing..." : "Import Agent"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

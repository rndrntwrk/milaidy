import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
  SettingsControls,
} from "@miladyai/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentPreflightResult } from "../../api";
import { client } from "../../api";
import { useApp } from "../../state";

type AgentTab = "claude" | "gemini" | "codex" | "aider";
type AiderProvider = "anthropic" | "openai" | "google";
type ApprovalPreset = "readonly" | "standard" | "permissive" | "autonomous";
type AgentSelectionStrategy = "fixed" | "ranked";
type LlmProvider = "subscription" | "api_keys" | "cloud";

const AGENT_TABS: AgentTab[] = ["claude", "gemini", "codex", "aider"];

const APPROVAL_PRESETS: {
  value: ApprovalPreset;
  labelKey: string;
  descKey: string;
}[] = [
  {
    value: "readonly",
    labelKey: "codingagentsettingssection.PresetReadOnly",
    descKey: "codingagentsettingssection.PresetReadOnlyDesc",
  },
  {
    value: "standard",
    labelKey: "mediasettingssection.Standard",
    descKey: "codingagentsettingssection.PresetStandardDesc",
  },
  {
    value: "permissive",
    labelKey: "codingagentsettingssection.PresetPermissive",
    descKey: "codingagentsettingssection.PresetPermissiveDesc",
  },
  {
    value: "autonomous",
    labelKey: "codingagentsettingssection.PresetAutonomous",
    descKey: "codingagentsettingssection.PresetAutonomousDesc",
  },
];

interface ModelOption {
  value: string;
  label: string;
}

const AGENT_PROVIDER_MAP: Record<AgentTab, string> = {
  claude: "anthropic",
  gemini: "google-genai",
  codex: "openai",
  aider: "anthropic",
};

const AIDER_PROVIDER_MAP: Record<AiderProvider, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google-genai",
};

const FALLBACK_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  "google-genai": [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  openai: [
    { value: "o3", label: "o3" },
    { value: "o4-mini", label: "o4-mini" },
    { value: "gpt-4o", label: "GPT-4o" },
  ],
};

/** Aider uses short aliases that auto-resolve to the latest model version. */
const AIDER_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { value: "opus", label: "Claude Opus" },
    { value: "sonnet", label: "Claude Sonnet" },
    { value: "haiku", label: "Claude Haiku" },
  ],
  "google-genai": [{ value: "gemini", label: "Gemini" }],
  openai: [
    { value: "o3", label: "o3" },
    { value: "4o", label: "GPT-4o" },
    { value: "o4-mini", label: "o4-mini" },
  ],
};

const AGENT_LABELS: Record<AgentTab, string> = {
  claude: "Claude",
  gemini: "Gemini",
  codex: "Codex",
  aider: "Aider",
};

/** Map full adapter names from the preflight API to short tab keys. */
export const ADAPTER_NAME_TO_TAB: Record<string, AgentTab> = {
  "claude code": "claude",
  "google gemini": "gemini",
  "openai codex": "codex",
  aider: "aider",
  claude: "claude",
  gemini: "gemini",
  codex: "codex",
};

const ENV_PREFIX: Record<AgentTab, string> = {
  claude: "PARALLAX_CLAUDE",
  gemini: "PARALLAX_GEMINI",
  codex: "PARALLAX_CODEX",
  aider: "PARALLAX_AIDER",
};

/**
 * Text input that uses local state while typing and only syncs on blur/enter.
 * `initial` is only read on mount — safe because the parent guards rendering
 * behind `if (loading) return …`, so `initial` is always the loaded value.
 */
function CodingDirInput({
  initial,
  onCommit,
}: {
  initial: string;
  onCommit: (val: string) => void;
}) {
  const [val, setVal] = useState(initial);
  return (
    <SettingsControls.Input
      className="w-full"
      variant="compact"
      type="text"
      placeholder="~/Projects"
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => onCommit(val)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(val);
      }}
    />
  );
}

export function CodingAgentSettingsSection() {
  const { t } = useApp();

  const [activeTab, setActiveTab] = useState<AgentTab | null>(null);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const [providerModels, setProviderModels] = useState<
    Record<string, ModelOption[]>
  >({});
  const [preflightLoaded, setPreflightLoaded] = useState(false);
  const [preflightByAgent, setPreflightByAgent] = useState<
    Partial<Record<AgentTab, AgentPreflightResult>>
  >({});
  const [authInProgress, setAuthInProgress] = useState<AgentTab | null>(null);
  const [authResult, setAuthResult] = useState<{
    agent: AgentTab;
    launched?: boolean;
    url?: string;
    deviceCode?: string;
    instructions: string;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [cfg, anthropicRes, googleRes, openaiRes, preflightRes] =
          await Promise.all([
            client.getConfig(),
            client.fetchModels("anthropic", false).catch(() => null),
            client.fetchModels("google-genai", false).catch(() => null),
            client.fetchModels("openai", false).catch(() => null),
            fetch("/api/coding-agents/preflight")
              .then((response) => (response.ok ? response.json() : null))
              .catch(() => null),
          ]);

        const env = (cfg.env ?? {}) as Record<string, string>;
        const cloud = (cfg.cloud ?? {}) as Record<string, string>;
        const loaded: Record<string, string> = {};
        // Store cloud API key for reference in cloud mode
        if (cloud.apiKey) {
          loaded._CLOUD_API_KEY = cloud.apiKey;
        }
        for (const agent of ["CLAUDE", "GEMINI", "CODEX", "AIDER"] as const) {
          const prefix = `PARALLAX_${agent}`;
          if (env[`${prefix}_MODEL_POWERFUL`]) {
            loaded[`${prefix}_MODEL_POWERFUL`] =
              env[`${prefix}_MODEL_POWERFUL`];
          }
          if (env[`${prefix}_MODEL_FAST`]) {
            loaded[`${prefix}_MODEL_FAST`] = env[`${prefix}_MODEL_FAST`];
          }
        }
        if (env.PARALLAX_AIDER_PROVIDER) {
          loaded.PARALLAX_AIDER_PROVIDER = env.PARALLAX_AIDER_PROVIDER;
        }
        if (env.PARALLAX_DEFAULT_APPROVAL_PRESET) {
          loaded.PARALLAX_DEFAULT_APPROVAL_PRESET =
            env.PARALLAX_DEFAULT_APPROVAL_PRESET;
        }
        if (env.PARALLAX_AGENT_SELECTION_STRATEGY) {
          loaded.PARALLAX_AGENT_SELECTION_STRATEGY =
            env.PARALLAX_AGENT_SELECTION_STRATEGY;
        }
        if (env.PARALLAX_DEFAULT_AGENT_TYPE) {
          loaded.PARALLAX_DEFAULT_AGENT_TYPE = env.PARALLAX_DEFAULT_AGENT_TYPE;
        }
        if (env.PARALLAX_SCRATCH_RETENTION) {
          loaded.PARALLAX_SCRATCH_RETENTION = env.PARALLAX_SCRATCH_RETENTION;
        }
        if (env.PARALLAX_CODING_DIRECTORY) {
          loaded.PARALLAX_CODING_DIRECTORY = env.PARALLAX_CODING_DIRECTORY;
        }
        if (env.PARALLAX_LLM_PROVIDER) {
          loaded.PARALLAX_LLM_PROVIDER = env.PARALLAX_LLM_PROVIDER;
        }
        // API keys — load presence indicators (masked)
        for (const key of [
          "ANTHROPIC_API_KEY",
          "OPENAI_API_KEY",
          "GOOGLE_GENERATIVE_AI_API_KEY",
          "ANTHROPIC_BASE_URL",
          "OPENAI_BASE_URL",
        ] as const) {
          if (env[key]) loaded[key] = env[key];
        }
        setPrefs(loaded);

        const models: Record<string, ModelOption[]> = {};
        for (const [providerId, response] of [
          ["anthropic", anthropicRes],
          ["google-genai", googleRes],
          ["openai", openaiRes],
        ] as const) {
          if (
            response?.models &&
            Array.isArray(response.models) &&
            response.models.length > 0
          ) {
            const chatModels = (
              response.models as Array<{
                id: string;
                name: string;
                category: string;
              }>
            )
              .filter((model) => model.category === "chat")
              .map((model) => ({
                value: model.id,
                label: model.name || model.id,
              }));
            if (chatModels.length > 0) {
              models[providerId] = chatModels;
            }
          }
        }
        setProviderModels(models);

        if (Array.isArray(preflightRes)) {
          const mapped: Partial<Record<AgentTab, AgentPreflightResult>> = {};
          for (const item of preflightRes as AgentPreflightResult[]) {
            const raw = item.adapter?.toLowerCase();
            const key = raw ? ADAPTER_NAME_TO_TAB[raw] : undefined;
            if (key) {
              mapped[key] = item;
            }
          }
          setPreflightByAgent(mapped);
          setPreflightLoaded(true);
        }
      } catch {
        // Fall back to built-in defaults when config or model fetches fail.
      }
      setLoading(false);
    })();
  }, []);

  const llmProvider = (prefs.PARALLAX_LLM_PROVIDER ||
    "subscription") as LlmProvider;
  const isCloud = llmProvider === "cloud";

  const installedAgents = AGENT_TABS.filter(
    (agent) => preflightByAgent[agent]?.installed === true,
  );
  // Gemini CLI can't route through cloud (no Google-native proxy)
  const providerFilteredAgents = isCloud
    ? AGENT_TABS.filter((agent) => agent !== "gemini")
    : AGENT_TABS;
  const availableAgents =
    preflightLoaded && installedAgents.length > 0
      ? installedAgents.filter((a) => providerFilteredAgents.includes(a))
      : providerFilteredAgents;

  const getInstallState = (
    agent: AgentTab,
  ): "installed" | "missing" | "unknown" => {
    if (!preflightLoaded) {
      return "unknown";
    }
    return preflightByAgent[agent]?.installed ? "installed" : "missing";
  };

  useEffect(() => {
    if (loading || availableAgents.length === 0) return;
    if (activeTab === null) {
      const saved = prefs.PARALLAX_DEFAULT_AGENT_TYPE as AgentTab | undefined;
      setActiveTab(
        saved && availableAgents.includes(saved) ? saved : availableAgents[0],
      );
    } else if (!availableAgents.includes(activeTab)) {
      setActiveTab(availableAgents[0]);
    }
  }, [loading, activeTab, availableAgents, prefs.PARALLAX_DEFAULT_AGENT_TYPE]);

  // `setPref` is a pure state updater. It must NOT perform network I/O
  // inside `setPrefs((prev) => ...)` — React may invoke state updaters
  // twice in Strict Mode, which would double every auto-save write.
  // The actual persist is handled by the debounced effect below.
  const setPref = useCallback((key: string, value: string) => {
    setPrefs((previous) => ({ ...previous, [key]: value }));
  }, []);

  // Debounced auto-save. Coalesces rapid keystrokes (e.g. typing an
  // API key character-by-character) into a single POST so we don't
  // persist 40+ partial-key snapshots to `milady.json` and don't
  // leave the config in a half-written state if one request fails
  // mid-flight.
  //
  // Filter out `_`-prefixed synthetic keys that we load from non-env
  // sources (e.g. `_CLOUD_API_KEY` is loaded from `config.cloud.apiKey`
  // — see the load effect above). Writing them back into `config.env`
  // would leak the cloud API key into the env surface, duplicating it
  // and creating a second read path that bypasses the `cloud.apiKey`
  // contract. These synthetic keys are read-only from the UI's
  // perspective and must never round-trip through env.
  // Track the last auto-save failure so we can show an inline error
  // banner. SaveFooter used to own this surface; when we switched to
  // debounced auto-save we lost the error-feedback path entirely and
  // a failed POST would silently lose the user's typed API key on
  // restart. `.catch()` on the fire-and-forget promise closes that
  // gap without reintroducing the explicit Save button.
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const autoSaveArmedRef = useRef(false);
  useEffect(() => {
    // Skip the first render (initial load from getConfig) so we
    // don't immediately write the loaded state back.
    if (loading) return;
    if (!autoSaveArmedRef.current) {
      autoSaveArmedRef.current = true;
      return;
    }
    const envPatch: Record<string, string> = {};
    for (const [k, v] of Object.entries(prefs)) {
      if (k.startsWith("_")) continue;
      if (v != null) envPatch[k] = v;
    }
    const timer = setTimeout(() => {
      client
        .updateConfig({ env: envPatch })
        .then(() => setAutoSaveError(null))
        .catch((err: unknown) => {
          setAutoSaveError(
            err instanceof Error ? err.message : "Failed to save settings",
          );
        });
    }, 400);
    return () => clearTimeout(timer);
  }, [prefs, loading]);

  // Reset Aider provider to anthropic if cloud is selected and google was chosen
  useEffect(() => {
    if (isCloud && prefs.PARALLAX_AIDER_PROVIDER === "google") {
      setPref("PARALLAX_AIDER_PROVIDER", "anthropic");
    }
  }, [isCloud, prefs.PARALLAX_AIDER_PROVIDER, setPref]);

  const refreshPreflight = useCallback(async () => {
    try {
      const preflightRes = await fetch("/api/coding-agents/preflight");
      if (preflightRes.ok) {
        const results = await preflightRes.json();
        if (Array.isArray(results)) {
          const mapped: Partial<Record<AgentTab, AgentPreflightResult>> = {};
          for (const item of results as AgentPreflightResult[]) {
            const raw = item.adapter?.toLowerCase();
            const key = raw ? ADAPTER_NAME_TO_TAB[raw] : undefined;
            if (key) mapped[key] = item;
          }
          setPreflightByAgent(mapped);
          return mapped;
        }
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  // Ref to any in-flight auth-polling interval so we can cancel it on
  // unmount or when a new auth flow starts. Without this, closing the
  // settings panel while a poll is active leaks a network-request
  // loop that keeps firing every 3 seconds forever.
  const authPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Cleanup on unmount — stops the poll if the component is torn
    // down mid-flow.
    return () => {
      if (authPollRef.current !== null) {
        clearInterval(authPollRef.current);
        authPollRef.current = null;
      }
    };
  }, []);

  const handleAuth = useCallback(
    async (agent: AgentTab) => {
      // Cancel any previous in-flight poll before starting a new one.
      if (authPollRef.current !== null) {
        clearInterval(authPollRef.current);
        authPollRef.current = null;
      }
      setAuthInProgress(agent);
      setAuthResult(null);
      try {
        const res = await fetch(`/api/coding-agents/auth/${agent}`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          setAuthResult({ agent, ...data });
          // Poll for auth completion — check every 3s for up to 2 minutes.
          let attempts = 0;
          const maxAttempts = 40;
          const poll = setInterval(async () => {
            attempts++;
            const mapped = await refreshPreflight();
            if (
              mapped?.[agent]?.auth?.status === "authenticated" ||
              attempts >= maxAttempts
            ) {
              clearInterval(poll);
              if (authPollRef.current === poll) {
                authPollRef.current = null;
              }
              setAuthInProgress(null);
              if (mapped?.[agent]?.auth?.status === "authenticated") {
                setAuthResult(null);
              }
            }
          }, 3000);
          authPollRef.current = poll;
        } else {
          setAuthInProgress(null);
        }
      } catch {
        setAuthInProgress(null);
      }
    },
    [refreshPreflight],
  );

  const getProviderId = (
    tab: AgentTab,
    aiderProvider: AiderProvider,
  ): string =>
    tab === "aider"
      ? AIDER_PROVIDER_MAP[aiderProvider]
      : AGENT_PROVIDER_MAP[tab];

  const getModelOptions = (providerId: string): ModelOption[] => {
    // Aider uses short aliases, not full model IDs
    if (activeTab === "aider") {
      return AIDER_MODELS[providerId] ?? [];
    }
    return providerModels[providerId] ?? FALLBACK_MODELS[providerId] ?? [];
  };

  if (loading) {
    return (
      <div className="py-4 text-center text-[var(--muted)] text-xs">
        {t("codingagentsettingssection.LoadingCodingAgent")}
      </div>
    );
  }

  if (!activeTab) {
    return (
      <div className="py-4 text-center text-[var(--muted)] text-xs">
        {t("codingagentsettingssection.LoadingCodingAgent")}
      </div>
    );
  }

  const prefix = ENV_PREFIX[activeTab];
  const aiderProvider = (prefs.PARALLAX_AIDER_PROVIDER ||
    "anthropic") as AiderProvider;
  const providerId = getProviderId(activeTab, aiderProvider);
  const modelOptions = getModelOptions(providerId);
  const powerfulValue = prefs[`${prefix}_MODEL_POWERFUL`] ?? "";
  const fastValue = prefs[`${prefix}_MODEL_FAST`] ?? "";
  const isDynamic = Boolean(providerModels[providerId]);
  const selectionStrategy = (prefs.PARALLAX_AGENT_SELECTION_STRATEGY ||
    "fixed") as AgentSelectionStrategy;
  const approvalPreset = (prefs.PARALLAX_DEFAULT_APPROVAL_PRESET ||
    "permissive") as ApprovalPreset;

  if (preflightLoaded && installedAgents.length === 0) {
    return (
      <div className="flex flex-col gap-2 text-xs">
        <div className="text-[var(--muted)]">
          {t("codingagentsettingssection.NoSupportedCLIs")}
        </div>
        <div className="flex flex-col gap-1 text-[11px] text-[var(--muted)]">
          {AGENT_TABS.map((agent) => {
            const preflight = preflightByAgent[agent];
            return (
              <div key={agent}>
                <span className="font-semibold">{AGENT_LABELS[agent]}:</span>{" "}
                {preflight?.installCommand
                  ? `${t("codingagentsettingssection.InstallWith", {
                      defaultValue: "Install with",
                    })} ${preflight.installCommand}`
                  : ""}
                {preflight?.docsUrl ? ` (${preflight.docsUrl})` : ""}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {autoSaveError && (
        <div
          role="alert"
          className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500"
        >
          {t("codingagentsettingssection.AutoSaveFailed", {
            defaultValue: "Failed to save settings: {{error}}",
            error: autoSaveError,
          })}
        </div>
      )}
      <SettingsControls.Field>
        <SettingsControls.FieldLabel>
          {t("codingagentsettingssection.LlmProvider", {
            defaultValue: "LLM Provider",
          })}
        </SettingsControls.FieldLabel>
        <Select
          value={llmProvider}
          onValueChange={(value) => setPref("PARALLAX_LLM_PROVIDER", value)}
        >
          <SettingsControls.SelectTrigger variant="compact">
            <SelectValue />
          </SettingsControls.SelectTrigger>
          <SelectContent>
            <SelectItem value="subscription">
              {t("codingagentsettingssection.LlmProviderSubscription", {
                defaultValue: "CLI Subscription",
              })}
            </SelectItem>
            <SelectItem value="api_keys">
              {t("codingagentsettingssection.LlmProviderApiKeys", {
                defaultValue: "API Keys",
              })}
            </SelectItem>
            <SelectItem value="cloud">
              {t("codingagentsettingssection.LlmProviderCloud", {
                defaultValue: "Eliza Cloud",
              })}
            </SelectItem>
          </SelectContent>
        </Select>
        <SettingsControls.FieldDescription>
          {llmProvider === "subscription"
            ? t("codingagentsettingssection.LlmProviderDescSubscription", {
                defaultValue:
                  "Use each CLI's built-in login (Claude Code, Codex, and Gemini subscriptions).",
              })
            : isCloud
              ? t("codingagentsettingssection.LlmProviderDescCloud", {
                  defaultValue:
                    "Route all agent LLM calls through Eliza Cloud. Gemini CLI is not supported.",
                })
              : t("codingagentsettingssection.LlmProviderDescApiKeys", {
                  defaultValue:
                    "Provide your own API keys for each provider (Anthropic, OpenAI, Google).",
                })}
        </SettingsControls.FieldDescription>
      </SettingsControls.Field>

      {llmProvider === "api_keys" && (
        <div className="flex flex-col gap-3">
          <SettingsControls.Field>
            <SettingsControls.FieldLabel>
              {t("codingagentsettingssection.AnthropicApiKey", {
                defaultValue: "Anthropic API Key",
              })}
            </SettingsControls.FieldLabel>
            <SettingsControls.Input
              variant="compact"
              type="password"
              placeholder="sk-ant-..."
              value={prefs.ANTHROPIC_API_KEY || ""}
              onChange={(e) => setPref("ANTHROPIC_API_KEY", e.target.value)}
            />
            <SettingsControls.FieldDescription>
              {t("codingagentsettingssection.AnthropicApiKeyDesc", {
                defaultValue: "For Claude Code and Aider (Anthropic provider).",
              })}
            </SettingsControls.FieldDescription>
          </SettingsControls.Field>
          <SettingsControls.Field>
            <SettingsControls.FieldLabel>
              {t("codingagentsettingssection.OpenaiApiKey", {
                defaultValue: "OpenAI API Key",
              })}
            </SettingsControls.FieldLabel>
            <SettingsControls.Input
              variant="compact"
              type="password"
              placeholder="sk-..."
              value={prefs.OPENAI_API_KEY || ""}
              onChange={(e) => setPref("OPENAI_API_KEY", e.target.value)}
            />
            <SettingsControls.FieldDescription>
              {t("codingagentsettingssection.OpenaiApiKeyDesc", {
                defaultValue: "For Codex and Aider (OpenAI provider).",
              })}
            </SettingsControls.FieldDescription>
          </SettingsControls.Field>
          <SettingsControls.Field>
            <SettingsControls.FieldLabel>
              {t("codingagentsettingssection.GoogleApiKey", {
                defaultValue: "Google API Key",
              })}
            </SettingsControls.FieldLabel>
            <SettingsControls.Input
              variant="compact"
              type="password"
              placeholder="AIza..."
              value={prefs.GOOGLE_GENERATIVE_AI_API_KEY || ""}
              onChange={(e) =>
                setPref("GOOGLE_GENERATIVE_AI_API_KEY", e.target.value)
              }
            />
            <SettingsControls.FieldDescription>
              {t("codingagentsettingssection.GoogleApiKeyDesc", {
                defaultValue: "For Gemini CLI and Aider (Google provider).",
              })}
            </SettingsControls.FieldDescription>
          </SettingsControls.Field>
        </div>
      )}

      {isCloud && (
        <div className="flex flex-col gap-3">
          {prefs._CLOUD_API_KEY ? (
            <SettingsControls.MutedText className="text-xs text-green-500">
              {t("codingagentsettingssection.CloudPaired", {
                defaultValue:
                  "Using your Eliza Cloud account for coding agent LLM calls.",
              })}
            </SettingsControls.MutedText>
          ) : (
            <SettingsControls.MutedText className="text-xs text-amber-500">
              {t("codingagentsettingssection.CloudUnpaired", {
                defaultValue:
                  "No Eliza Cloud account connected. Pair your account in the Cloud settings section first.",
              })}
            </SettingsControls.MutedText>
          )}
        </div>
      )}

      <SettingsControls.Field>
        <SettingsControls.FieldLabel>
          {t("codingagentsettingssection.AgentSelectionStra")}
        </SettingsControls.FieldLabel>
        <Select
          value={selectionStrategy}
          onValueChange={(value) =>
            setPref("PARALLAX_AGENT_SELECTION_STRATEGY", value)
          }
        >
          <SettingsControls.SelectTrigger variant="compact">
            <SelectValue />
          </SettingsControls.SelectTrigger>
          <SelectContent>
            <SelectItem value="fixed">
              {t("codingagentsettingssection.Fixed")}
            </SelectItem>
            <SelectItem value="ranked">
              {t("codingagentsettingssection.RankedAutoSelect")}
            </SelectItem>
          </SelectContent>
        </Select>
        <SettingsControls.FieldDescription className="mt-1.5">
          {selectionStrategy === "fixed"
            ? t("codingagentsettingssection.AgentUsedWhenNoEStrategyFixed")
            : t("codingagentsettingssection.AgentUsedWhenNoEStrategyRanked")}
        </SettingsControls.FieldDescription>
      </SettingsControls.Field>

      <SettingsControls.Field>
        <SettingsControls.FieldLabel>
          {t("codingagentsettingssection.DefaultPermissionL")}
        </SettingsControls.FieldLabel>
        <Select
          value={approvalPreset}
          onValueChange={(value) =>
            setPref("PARALLAX_DEFAULT_APPROVAL_PRESET", value)
          }
        >
          <SettingsControls.SelectTrigger variant="compact">
            <SelectValue />
          </SettingsControls.SelectTrigger>
          <SelectContent>
            {APPROVAL_PRESETS.map((preset) => (
              <SelectItem key={preset.value} value={preset.value}>
                {t(preset.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SettingsControls.FieldDescription className="mt-1.5">
          {APPROVAL_PRESETS.find((preset) => preset.value === approvalPreset)
            ?.descKey
            ? t(
                APPROVAL_PRESETS.find(
                  (preset) => preset.value === approvalPreset,
                )?.descKey ?? "",
              )
            : ""}
          {t("codingagentsettingssection.AppliesToAllNewlySpawned")}
        </SettingsControls.FieldDescription>
      </SettingsControls.Field>

      <SettingsControls.Field>
        <SettingsControls.FieldLabel>
          {t("codingagentsettingssection.ScratchRetention", {
            defaultValue: "Scratch Retention",
          })}
        </SettingsControls.FieldLabel>
        <Select
          value={prefs.PARALLAX_SCRATCH_RETENTION || "pending_decision"}
          onValueChange={(value) => {
            // Skip if user re-selects the visual default that was never stored
            if (
              !prefs.PARALLAX_SCRATCH_RETENTION &&
              value === "pending_decision"
            )
              return;
            setPref("PARALLAX_SCRATCH_RETENTION", value);
          }}
        >
          <SettingsControls.SelectTrigger variant="compact">
            <SelectValue />
          </SettingsControls.SelectTrigger>
          <SelectContent>
            <SelectItem value="ephemeral">
              {t("codingagentsettingssection.RetentionEphemeral", {
                defaultValue: "Auto-delete",
              })}
            </SelectItem>
            <SelectItem value="pending_decision">
              {t("codingagentsettingssection.RetentionAskMe", {
                defaultValue: "Ask me (default)",
              })}
            </SelectItem>
            <SelectItem value="persistent">
              {t("codingagentsettingssection.RetentionAlwaysKeep", {
                defaultValue: "Always keep",
              })}
            </SelectItem>
          </SelectContent>
        </Select>
        <SettingsControls.FieldDescription>
          {t("codingagentsettingssection.ScratchRetentionDesc", {
            defaultValue:
              "What happens to scratch workspace code when a task finishes.",
          })}
        </SettingsControls.FieldDescription>
      </SettingsControls.Field>

      <SettingsControls.Field>
        <SettingsControls.FieldLabel>
          {t("codingagentsettingssection.CodingDirectory", {
            defaultValue: "Coding Directory",
          })}
        </SettingsControls.FieldLabel>
        <CodingDirInput
          initial={prefs.PARALLAX_CODING_DIRECTORY || ""}
          onCommit={(val) => setPref("PARALLAX_CODING_DIRECTORY", val)}
        />
        <SettingsControls.FieldDescription>
          {t("codingagentsettingssection.CodingDirectoryDesc", {
            defaultValue:
              "Where scratch task code is saved. Leave empty for default (~/.milady/workspaces/).",
          })}
        </SettingsControls.FieldDescription>
      </SettingsControls.Field>

      <SettingsControls.SegmentedGroup>
        {availableAgents.map((agent) => {
          const active = activeTab === agent;
          const installState = getInstallState(agent);
          const needsAuth =
            llmProvider === "subscription" &&
            installState === "installed" &&
            preflightByAgent[agent]?.auth?.status === "unauthenticated";
          const isAuthenticating = authInProgress === agent;

          if (needsAuth) {
            return (
              <Button
                key={agent}
                variant="ghost"
                size="sm"
                disabled={isAuthenticating}
                className="flex-1 h-9 rounded-lg border border-amber-500/30 px-3 py-2 text-xs font-semibold text-amber-500 hover:bg-amber-500/10 hover:text-amber-400"
                onClick={() => handleAuth(agent)}
              >
                {isAuthenticating
                  ? t("codingagentsettingssection.AuthenticatingAgent", {
                      defaultValue: "Authenticating {{agent}}...",
                      agent: AGENT_LABELS[agent],
                    })
                  : t("codingagentsettingssection.AuthenticateAgent", {
                      defaultValue: "Authenticate {{agent}}",
                      agent: AGENT_LABELS[agent],
                    })}
              </Button>
            );
          }

          return (
            <Button
              key={agent}
              variant={active ? "default" : "ghost"}
              size="sm"
              className={`flex-1 h-9 rounded-lg border border-transparent px-3 py-2 text-xs font-semibold ${
                active
                  ? "bg-accent text-accent-fg dark:text-accent-fg shadow-sm"
                  : "text-muted hover:bg-bg-hover hover:text-txt"
              }`}
              onClick={() => {
                setActiveTab(agent);
                setPref("PARALLAX_DEFAULT_AGENT_TYPE", agent);
              }}
            >
              <span className="inline-flex items-center gap-1.5">
                <span>{AGENT_LABELS[agent]}</span>
                {installState === "installed" &&
                  llmProvider === "subscription" &&
                  preflightByAgent[agent]?.auth?.status === "authenticated" && (
                    <span className="text-[10px] font-medium text-green-500 opacity-90">
                      ✓
                    </span>
                  )}
                {installState === "installed" &&
                  llmProvider !== "subscription" && (
                    <span className="text-[10px] font-medium opacity-80">
                      {t("codingagentsettingssection.Installed")}
                    </span>
                  )}
                {installState === "unknown" && (
                  <span className="text-[10px] font-medium opacity-70">
                    {t("codingagentsettingssection.Unknown")}
                  </span>
                )}
              </span>
            </Button>
          );
        })}
      </SettingsControls.SegmentedGroup>

      {authResult && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {authResult.url && (
            <a
              href={authResult.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-accent hover:underline w-fit"
            >
              {t("codingagentsettingssection.OpenSignInPage", {
                defaultValue: "Open sign-in page →",
              })}
            </a>
          )}
          {authResult.deviceCode && (
            <SettingsControls.MutedText className="text-xs">
              {t("codingagentsettingssection.EnterDeviceCodePrefix", {
                defaultValue: "Enter code",
              })}{" "}
              <span className="font-mono font-bold select-all">
                {authResult.deviceCode}
              </span>{" "}
              {t("codingagentsettingssection.EnterDeviceCodeSuffix", {
                defaultValue: "at the sign-in page.",
              })}
            </SettingsControls.MutedText>
          )}
          {authResult.launched === false && (
            <div className="flex items-center gap-2">
              <SettingsControls.MutedText className="text-xs text-amber-500">
                {authResult.instructions}
              </SettingsControls.MutedText>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px]"
                disabled={authInProgress !== null}
                onClick={() => handleAuth(authResult.agent)}
              >
                {t("codingagentsettingssection.Retry", {
                  defaultValue: "Retry",
                })}
              </Button>
            </div>
          )}
          {authResult.launched !== false &&
            !authResult.url &&
            !authResult.deviceCode &&
            authResult.instructions && (
              <SettingsControls.MutedText className="text-xs">
                {authResult.instructions}
              </SettingsControls.MutedText>
            )}
        </div>
      )}

      {preflightLoaded && (
        <SettingsControls.MutedText className="mt-1.5">
          {t("codingagentsettingssection.Availability")}{" "}
          {AGENT_TABS.map((agent) => {
            const installState = getInstallState(agent);
            const label =
              installState === "installed"
                ? t("codingagentsettingssection.Installed")
                : installState === "missing"
                  ? t("codingagentsettingssection.NotInstalled")
                  : t("codingagentsettingssection.Unknown");
            return `${AGENT_LABELS[agent]}: ${label}`;
          }).join(" · ")}
        </SettingsControls.MutedText>
      )}

      {activeTab === "aider" && (
        <SettingsControls.Field>
          <SettingsControls.FieldLabel>
            {t("codingagentsettingssection.Provider")}
          </SettingsControls.FieldLabel>
          <Select
            value={aiderProvider}
            onValueChange={(value) => setPref("PARALLAX_AIDER_PROVIDER", value)}
          >
            <SettingsControls.SelectTrigger variant="compact">
              <SelectValue />
            </SettingsControls.SelectTrigger>
            <SelectContent>
              <SelectItem value="anthropic">
                {t("codingagentsettingssection.Anthropic")}
              </SelectItem>
              <SelectItem value="openai">
                {t("codingagentsettingssection.OpenAI")}
              </SelectItem>
              {!isCloud && (
                <SelectItem value="google">
                  {t("codingagentsettingssection.Google")}
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </SettingsControls.Field>
      )}

      <div className="flex gap-3">
        <SettingsControls.Field className="flex-1">
          <SettingsControls.FieldLabel>
            {t("codingagentsettingssection.PowerfulModel")}
          </SettingsControls.FieldLabel>
          <Select
            value={powerfulValue}
            onValueChange={(value) =>
              setPref(`${prefix}_MODEL_POWERFUL`, value)
            }
          >
            <SettingsControls.SelectTrigger variant="compact">
              <SelectValue
                placeholder={t("codingagentsettingssection.Default")}
              />
            </SettingsControls.SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                {t("codingagentsettingssection.Default")}
              </SelectItem>
              {modelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsControls.Field>
        <SettingsControls.Field className="flex-1">
          <SettingsControls.FieldLabel>
            {t("codingagentsettingssection.FastModel")}
          </SettingsControls.FieldLabel>
          <Select
            value={fastValue}
            onValueChange={(value) => setPref(`${prefix}_MODEL_FAST`, value)}
          >
            <SettingsControls.SelectTrigger variant="compact">
              <SelectValue
                placeholder={t("codingagentsettingssection.Default")}
              />
            </SettingsControls.SelectTrigger>
            <SelectContent>
              <SelectItem value="__default__">
                {t("codingagentsettingssection.Default")}
              </SelectItem>
              {modelOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsControls.Field>
      </div>

      {/* Only show the "configure API key" hint when the user is actually
          using direct provider keys. In cloud or subscription mode the
          fallback list is the expected source of truth, and Aider uses its
          own short aliases regardless. */}
      {llmProvider === "api_keys" && activeTab !== "aider" && (
        <SettingsControls.MutedText className="mt-1.5">
          {isDynamic
            ? t("codingagentsettingssection.ModelsFetched")
            : t("codingagentsettingssection.UsingFallback")}
        </SettingsControls.MutedText>
      )}
    </div>
  );
}

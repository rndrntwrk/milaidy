import { Button, Input } from "@elizaos/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client } from "@elizaos/app-core/api";
import { dispatchWindowEvent, VOICE_CONFIG_UPDATED_EVENT } from "@elizaos/app-core/events";
import { useApp } from "@elizaos/app-core/state";
import {
  PREMADE_VOICES,
  sanitizeApiKey,
  VOICE_PROVIDERS,
} from "@elizaos/app-core/voice";
import {
  CloudConnectionStatus,
  CloudSourceModeToggle,
} from "@elizaos/app-core/components/CloudSourceControls";
import { ConfigSaveFooter } from "@elizaos/app-core/components/ConfigSaveFooter";

type VoiceMode = "cloud" | "own-key";
type ProviderId = "elevenlabs" | "edge" | "simple-voice";
type VoiceConfig = {
  provider?: ProviderId;
  mode?: VoiceMode;
  elevenlabs?: {
    apiKey?: string;
    voiceId?: string;
    modelId?: string;
  };
  edge?: {
    voice?: string;
  };
};

type CloudVoicePreset = {
  id: string;
  name: string;
  voiceId: string;
  hint: string;
  language: string;
};

const DEFAULT_ELEVEN_MODEL = "eleven_flash_v2_5";

const CLOUD_VOICE_PRESETS: CloudVoicePreset[] = [
  {
    id: "alloy",
    name: "Alloy",
    voiceId: "alloy",
    hint: "Balanced, neutral",
    language: "English",
  },
  {
    id: "ash",
    name: "Ash",
    voiceId: "ash",
    hint: "Warm, expressive",
    language: "English",
  },
  {
    id: "ballad",
    name: "Ballad",
    voiceId: "ballad",
    hint: "Narrative, dramatic",
    language: "English",
  },
  {
    id: "coral",
    name: "Coral",
    voiceId: "coral",
    hint: "Crisp, clear",
    language: "English",
  },
  {
    id: "echo",
    name: "Echo",
    voiceId: "echo",
    hint: "Deep, grounded",
    language: "English",
  },
  {
    id: "nova",
    name: "Nova",
    voiceId: "nova",
    hint: "Bright, friendly",
    language: "English",
  },
  {
    id: "sage",
    name: "Sage",
    voiceId: "sage",
    hint: "Calm, instructional",
    language: "English",
  },
  {
    id: "shimmer",
    name: "Shimmer",
    voiceId: "shimmer",
    hint: "Soft, airy",
    language: "English",
  },
  {
    id: "verse",
    name: "Verse",
    voiceId: "verse",
    hint: "Conversational, lively",
    language: "English",
  },
];

function languageFromElevenHint(hint: string | undefined): string {
  const prefix = (hint ?? "").split(",")[0]?.trim();
  return prefix && prefix.length > 0 ? prefix : "Other";
}

export function VoiceConfigView() {
  const { t, elizaCloudConnected } = useApp();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [voiceLanguageFilter, setVoiceLanguageFilter] = useState("all");
  const [customVoiceIdInput, setCustomVoiceIdInput] = useState("");
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const cfg = await client.getConfig();
        const messages = cfg.messages as { tts?: VoiceConfig } | undefined;
        if (messages?.tts) {
          setVoiceConfig(messages.tts);
        }
      } catch {
        // keep defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      audioRef.current = null;
    };
  }, []);

  const currentProvider = (voiceConfig.provider ?? "elevenlabs") as ProviderId;
  const currentMode = (voiceConfig.mode ?? "own-key") as VoiceMode;
  const providerInfo = VOICE_PROVIDERS.find((p) => p.id === currentProvider);

  const isConfigured =
    currentProvider !== "elevenlabs"
      ? true
      : currentMode === "cloud"
        ? elizaCloudConnected
        : Boolean(voiceConfig.elevenlabs?.apiKey);

  const allLanguages = useMemo(() => {
    if (currentProvider !== "elevenlabs") {
      return ["all"];
    }
    if (currentMode === "cloud") {
      return ["all", ...new Set(CLOUD_VOICE_PRESETS.map((v) => v.language))];
    }
    return [
      "all",
      ...new Set(PREMADE_VOICES.map((v) => languageFromElevenHint(v.hint))),
    ];
  }, [currentProvider, currentMode]);

  const visibleVoices = useMemo(() => {
    if (currentProvider !== "elevenlabs") return [];
    if (currentMode === "cloud") {
      return CLOUD_VOICE_PRESETS.filter((v) =>
        voiceLanguageFilter === "all" ? true : v.language === voiceLanguageFilter,
      ).sort((a, b) => a.name.localeCompare(b.name));
    }
    return PREMADE_VOICES.filter((v) => {
      const lang = languageFromElevenHint(v.hint);
      return voiceLanguageFilter === "all" ? true : lang === voiceLanguageFilter;
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [currentMode, currentProvider, voiceLanguageFilter]);

  const selectedVoiceId = voiceConfig.elevenlabs?.voiceId;

  const handleProviderChange = useCallback((provider: ProviderId) => {
    setVoiceConfig((prev) => ({ ...prev, provider }));
    setDirty(true);
  }, []);

  const handleModeChange = useCallback((mode: VoiceMode) => {
    setVoiceConfig((prev) => ({ ...prev, mode }));
    setDirty(true);
  }, []);

  const handleApiKeyChange = useCallback((apiKey: string) => {
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: { ...prev.elevenlabs, apiKey: apiKey || undefined },
    }));
    setDirty(true);
  }, []);

  const handleVoiceSelect = useCallback((voiceId: string) => {
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: { ...prev.elevenlabs, voiceId },
    }));
    setDirty(true);
  }, []);

  const handleTestVoice = useCallback(async () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setTesting(true);
    setTestError(null);

    try {
      if (currentProvider !== "elevenlabs") {
        throw new Error("Voice test currently supports ElevenLabs/Cloud mode only.");
      }
      const voiceId = voiceConfig.elevenlabs?.voiceId;
      if (!voiceId) {
        throw new Error("Select a voice before testing.");
      }
      const modelId = voiceConfig.elevenlabs?.modelId ?? DEFAULT_ELEVEN_MODEL;
      const rawApiKey = voiceConfig.elevenlabs?.apiKey;
      const providedApiKey =
        currentMode === "own-key" &&
        typeof rawApiKey === "string" &&
        rawApiKey.trim().length > 0 &&
        rawApiKey !== "[REDACTED]"
          ? rawApiKey.trim()
          : undefined;

      const response = await fetch("/api/tts/elevenlabs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Hello from your selected voice.",
          voiceId,
          modelId,
          ...(providedApiKey ? { apiKey: providedApiKey } : {}),
        }),
      });

      if (!response.ok) {
        const upstreamBody = await response.text().catch(() => "");
        throw new Error(upstreamBody || `Voice test failed (${response.status})`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setTesting(false);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        setTesting(false);
        setTestError("Playback failed.");
      };
      await audio.play();
    } catch (err) {
      setTesting(false);
      setTestError(err instanceof Error ? err.message : "Voice test failed.");
    }
  }, [currentMode, currentProvider, voiceConfig]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const cfg = await client.getConfig();
      const messages = (cfg.messages ?? {}) as Record<string, unknown>;
      const provider = (voiceConfig.provider ?? "elevenlabs") as ProviderId;
      const normalized = {
        ...voiceConfig,
        provider,
        mode: provider === "elevenlabs" ? (voiceConfig.mode ?? "own-key") : undefined,
        elevenlabs:
          provider === "elevenlabs"
            ? {
                ...voiceConfig.elevenlabs,
                modelId: voiceConfig.elevenlabs?.modelId ?? DEFAULT_ELEVEN_MODEL,
                apiKey: sanitizeApiKey(voiceConfig.elevenlabs?.apiKey),
              }
            : voiceConfig.elevenlabs,
      };

      await client.updateConfig({
        messages: {
          ...messages,
          tts: normalized,
        },
      });
      dispatchWindowEvent(VOICE_CONFIG_UPDATED_EVENT, normalized);
      setSaveSuccess(true);
      setDirty(false);
      window.setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [voiceConfig]);

  if (loading) {
    return (
      <div className="py-4 text-center text-[var(--muted)] text-xs">
        {t("voiceconfigview.LoadingVoiceConfig")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold text-[var(--muted)]">
          {t("voiceconfigview.TTSProvider")}
        </div>
        <div className="flex gap-2">
          {VOICE_PROVIDERS.map((p) => (
            <Button
              key={p.id}
              variant="outline"
              size="sm"
              className="flex-1 h-auto flex-col py-2"
              onClick={() => handleProviderChange(p.id as ProviderId)}
            >
              <div className="font-semibold">{p.label}</div>
              <div className="text-[10px] opacity-70 mt-0.5">{p.hint}</div>
            </Button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)]">
        <span className="text-xs">
          {currentProvider === "elevenlabs"
            ? `ElevenLabs — ${
                currentMode === "cloud"
                  ? t("voiceconfigview.ServedViaElizaCloud")
                  : t("voiceconfigview.RequiresApiKey")
              }`
            : `${providerInfo?.label} — ${t("voiceconfigview.NoApiKeyNeeded")}`}
        </span>
        <span
          className={`rounded-full border px-1.5 py-0.5 text-[10px] ${
            isConfigured
              ? "border-green-600 bg-green-600/10 text-[var(--text)]"
              : "border-[var(--warn)] bg-[var(--warn-subtle)] text-[var(--text)]"
          }`}
        >
          {isConfigured
            ? t("mediasettingssection.Configured")
            : t("mediasettingssection.NeedsSetup")}
        </span>
      </div>

      {currentProvider === "elevenlabs" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[var(--muted)]">
              {t("voiceconfigview.APISource")}
            </span>
            <CloudSourceModeToggle mode={currentMode} onChange={handleModeChange} />
          </div>

          {currentMode === "cloud" && (
            <CloudConnectionStatus
              connected={elizaCloudConnected}
              disconnectedText={t("elizaclouddashboard.ElizaCloudNotConnected")}
            />
          )}

          {currentMode === "own-key" && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold">
                {t("voiceconfigview.ElevenLabsAPIKey")}
              </span>
              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  className="bg-card text-xs"
                  placeholder={
                    voiceConfig.elevenlabs?.apiKey
                      ? t("mediasettingssection.ApiKeySetLeaveBlank")
                      : t("mediasettingssection.EnterApiKey")
                  }
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 font-semibold"
                  disabled={saving || !dirty}
                  onClick={() => void handleSave()}
                >
                  {saving ? "Saving..." : "Save Voice Settings"}
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold">Voice</div>
            <div className="flex flex-wrap gap-1.5">
              {allLanguages.map((lang) => (
                <Button
                  key={`voice-lang-${lang}`}
                  variant="outline"
                  size="sm"
                  className={`text-[10px] px-2 py-1 ${
                    voiceLanguageFilter === lang
                      ? "border-[var(--accent)] bg-[var(--accent)]/20 text-white"
                      : ""
                  }`}
                  onClick={() => setVoiceLanguageFilter(lang)}
                >
                  {lang === "all" ? "All Languages" : lang}
                </Button>
              ))}
            </div>

            {currentMode === "own-key" && (
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  className="bg-card text-xs"
                  placeholder="Paste custom ElevenLabs voice ID"
                  value={customVoiceIdInput}
                  onChange={(e) => setCustomVoiceIdInput(e.target.value)}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 font-semibold"
                  onClick={() => {
                    const trimmed = customVoiceIdInput.trim();
                    if (!trimmed) return;
                    handleVoiceSelect(trimmed);
                  }}
                >
                  Use Voice ID
                </Button>
              </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
              {visibleVoices.map((preset) => {
                const active = selectedVoiceId === preset.voiceId;
                return (
                  <Button
                    key={preset.id}
                    variant="outline"
                    size="sm"
                    className={`h-auto flex-col items-start py-1.5 px-2 text-left ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)]/20 text-white shadow-[0_0_0_1px_var(--accent)]"
                        : ""
                    }`}
                    onClick={() => handleVoiceSelect(preset.voiceId)}
                  >
                    <div className="font-semibold truncate w-full">{preset.name}</div>
                    <div className="text-[10px] opacity-70 truncate w-full">
                      {preset.hint}
                    </div>
                  </Button>
                );
              })}
            </div>

            {selectedVoiceId && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="font-semibold"
                  disabled={testing}
                  onClick={() => void handleTestVoice()}
                >
                  {testing ? t("voiceconfigview.Playing") : "Test Selected Voice"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {currentProvider === "edge" && (
        <div className="py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)] text-xs text-[var(--muted)]">
          {t("voiceconfigview.EdgeTTSUsesMicros")}
        </div>
      )}

      {currentProvider === "simple-voice" && (
        <div className="py-2 px-3 border border-[var(--border)] bg-[var(--bg-muted)] text-xs text-[var(--muted)]">
          {t("voiceconfigview.SimpleVoiceUsesYo")}
        </div>
      )}

      {testError && <div className="text-[10px] text-[var(--warn)]">{testError}</div>}

      <ConfigSaveFooter
        dirty={dirty}
        saving={saving}
        saveError={saveError}
        saveSuccess={saveSuccess}
        onSave={() => void handleSave()}
      />
    </div>
  );
}

/**
 * Chat view component.
 *
 * Layout: flex column filling parent. Header row (title + clear + toggles).
 * Scrollable messages area. Share/file notices below messages.
 * Input row at bottom with mic + textarea + send button.
 */

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  useMemo,
  memo,
  type KeyboardEvent,
} from "react";
import { getVrmPreviewUrl, useApp } from "../AppContext.js";
import { ChatAvatar } from "./ChatAvatar.js";
import { resolveAgentDisplayName } from "./shared/agentDisplayName.js";
import {
  AgentIcon,
  AudioIcon,
  MicIcon,
  OpsIcon,
} from "./ui/Icons.js";
import { useVoiceChat } from "../hooks/useVoiceChat.js";
import {
  client,
  type Five55MasteryRun,
  type VoiceConfig,
} from "../api-client.js";
import { MessageContent } from "./MessageContent.js";
import { QUICK_LAYER_CATALOG } from "./quickLayerCatalog.js";

type ConversationMode = "simple" | "power";

export const ChatView = memo(function ChatView() {
  const {
    agentStatus,
    chatInput,
    chatSending,
    chatFirstTokenReceived,
    conversationMessages,
    handleChatSend,
    handleChatStop,
    setState,
    setTab,
    setActionNotice,
    quickLayerStatuses,
    autonomousRunOpen,
    autoRunMode,
    autoRunTopic,
    autoRunDurationMin,
    autoRunAvatarRuntime,
    autoRunPreview,
    autoRunPreviewBusy,
    autoRunLaunching,
    runQuickLayer,
    closeAutonomousRun,
    runAutonomousEstimate,
    runAutonomousLaunch,
    droppedFiles,
    shareIngestNotice,
    selectedVrmIndex,
    chatPendingImages,
    setChatPendingImages,
  } = useApp();

  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Toggles (persisted in localStorage) ──────────────────────────
  const [avatarVisible, setAvatarVisible] = useState(() => {
    try {
      const v = localStorage.getItem("milaidy:chat:avatarVisible");
      return v === null ? true : v === "true";
    } catch {
      return true;
    }
  });
  const [agentVoiceMuted, setAgentVoiceMuted] = useState(() => {
    try {
      const v = localStorage.getItem("milaidy:chat:voiceMuted");
      return v === null ? true : v === "true"; // muted by default
    } catch {
      return true;
    }
  });
  const [chatMode, setChatMode] = useState<ConversationMode>(() => {
    try {
      const v = localStorage.getItem("milaidy:chat:mode");
      return v === "power" ? "power" : "simple";
    } catch {
      return "simple";
    }
  });

  // Persist toggle changes
  useEffect(() => {
    try {
      localStorage.setItem("milaidy:chat:avatarVisible", String(avatarVisible));
    } catch {
      /* ignore */
    }
  }, [avatarVisible]);
  useEffect(() => {
    try {
      localStorage.setItem("milaidy:chat:voiceMuted", String(agentVoiceMuted));
    } catch {
      /* ignore */
    }
  }, [agentVoiceMuted]);
  useEffect(() => {
    try {
      localStorage.setItem("milaidy:chat:mode", chatMode);
    } catch {
      /* ignore */
    }
  }, [chatMode]);

  // ── Voice config (ElevenLabs / browser TTS) ────────────────────────
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);
  const [masteryRuns, setMasteryRuns] = useState<Five55MasteryRun[]>([]);
  const [masteryRunsLoading, setMasteryRunsLoading] = useState(false);
  const [masteryRunsError, setMasteryRunsError] = useState<string | null>(null);
  const [masterySuiteStarting, setMasterySuiteStarting] = useState(false);

  const loadMasteryRuns = useCallback(async () => {
    setMasteryRunsLoading(true);
    try {
      const page = await client.listFive55MasteryRuns({ limit: 8 });
      setMasteryRuns(page.runs);
      setMasteryRunsError(null);
    } catch (err) {
      setMasteryRunsError(
        err instanceof Error ? err.message : "Failed to load mastery runs",
      );
    } finally {
      setMasteryRunsLoading(false);
    }
  }, []);

  const startMasterySuite = useCallback(async () => {
    if (masterySuiteStarting) return;
    setMasterySuiteStarting(true);
    try {
      const response = await client.startFive55MasteryRun({
        suiteId: `alice-16-game-${Date.now()}`,
        episodesPerGame: 60,
        seedMode: "mixed",
        maxDurationSec: 21600,
        strict: true,
        evidenceMode: "strict",
      });
      setActionNotice(`Mastery run started (${response.runId}).`, "success", 3200);
      await loadMasteryRuns();
    } catch (err) {
      setActionNotice(
        `Failed to start mastery run: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        4200,
      );
    } finally {
      setMasterySuiteStarting(false);
    }
  }, [loadMasteryRuns, masterySuiteStarting, setActionNotice]);

  useEffect(() => {
    void loadMasteryRuns();
    const timer = setInterval(() => void loadMasteryRuns(), 8000);
    return () => clearInterval(timer);
  }, [loadMasteryRuns]);

  // Load saved voice config on mount so the correct TTS provider is used
  useEffect(() => {
    void (async () => {
      try {
        const cfg = await client.getConfig();
        const messages = cfg.messages as
          | Record<string, Record<string, string>>
          | undefined;
        const tts = messages?.tts as VoiceConfig | undefined;
        if (tts) setVoiceConfig(tts);
      } catch {
        /* ignore — will use browser TTS fallback */
      }
    })();
  }, []);

  // ── Voice chat ────────────────────────────────────────────────────
  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (chatSending) return;
      setState("chatInput", text);
      setTimeout(() => void handleChatSend(), 50);
    },
    [chatSending, setState, handleChatSend],
  );

  const voice = useVoiceChat({ onTranscript: handleVoiceTranscript, voiceConfig });

  const agentName = resolveAgentDisplayName(agentStatus?.agentName);
  const msgs = conversationMessages;
  const visibleMsgs = useMemo(
    () =>
      msgs.filter(
        (msg) =>
          !(
            chatSending &&
            !chatFirstTokenReceived &&
            msg.role === "assistant" &&
            !msg.text.trim()
          ),
      ),
    [msgs, chatSending, chatFirstTokenReceived],
  );
  const agentAvatarSrc = selectedVrmIndex > 0 ? getVrmPreviewUrl(selectedVrmIndex) : null;
  const agentInitial = agentName.trim().charAt(0).toUpperCase() || "A";
  const quickLayers = QUICK_LAYER_CATALOG;

  useEffect(() => {
    const lastAssistant = [...msgs]
      .reverse()
      .find((message) => message.role === "assistant" && message.text.trim());
    if (!lastAssistant || agentVoiceMuted) return;
    voice.queueAssistantSpeech(lastAssistant.id, lastAssistant.text, !chatSending);
  }, [msgs, chatSending, agentVoiceMuted, voice]);

  // Smooth auto-scroll while streaming and on new messages.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [conversationMessages, chatSending]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.overflowY = "hidden";
    const h = Math.min(ta.scrollHeight, 200);
    ta.style.height = `${h}px`;
    ta.style.overflowY = ta.scrollHeight > 200 ? "auto" : "hidden";
  }, [chatInput]);

  // Keep input focused for fast multi-turn chat.
  useEffect(() => {
    if (chatSending) return;
    textareaRef.current?.focus();
  }, [chatSending]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleChatSend();
    }
  };

  const addImageFiles = useCallback(
    async (files: FileList | File[] | null | undefined) => {
      if (!files || files.length === 0) return;
      const attachments = await Promise.all(
        Array.from(files)
          .filter((file) => file.type.startsWith("image/"))
          .map(
            (file) =>
              new Promise<{ data: string; mimeType: string; name: string }>(
                (resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const result =
                      typeof reader.result === "string" ? reader.result : "";
                    const data =
                      result.includes(",") ? result.split(",")[1] ?? "" : result;
                    resolve({
                      data,
                      mimeType: file.type || "application/octet-stream",
                      name: file.name,
                    });
                  };
                  reader.onerror = () => {
                    reject(reader.error ?? new Error("Failed to read file"));
                  };
                  reader.readAsDataURL(file);
                },
              ),
          ),
      );
      if (attachments.length === 0) return;
      setChatPendingImages((prev) => [...prev, ...attachments]);
    },
    [setChatPendingImages],
  );

  const removePendingImage = useCallback(
    (name: string) => {
      setChatPendingImages((prev) =>
        prev.filter((image) => image.name !== name),
      );
    },
    [setChatPendingImages],
  );
  const showQuickLayersInChat = false;

  return (
    <div className="flex flex-col flex-1 min-h-0 px-1 sm:px-3 relative">
      {/* 3D Avatar — behind chat on the right side */}
      {/* When using ElevenLabs audio analysis, mouthOpen carries real volume
          data — don't pass isSpeaking so the engine uses the external values
          instead of its own sine waves. */}
      {avatarVisible && (
        <ChatAvatar
          mouthOpen={voice.mouthOpen}
          isSpeaking={voice.isSpeaking && !voice.usingAudioAnalysis}
        />
      )}

      {/* ── Messages ───────────────────────────────────────────────── */}
      {(showQuickLayersInChat || autonomousRunOpen) && (
        <>
          {showQuickLayersInChat && (
            <div className="flex flex-wrap items-center gap-1.5 pb-2 relative" style={{ zIndex: 1 }}>
              <span className="text-[10px] uppercase tracking-wide text-muted pr-1">
                Action layers
              </span>
              {quickLayers.map((layer) => {
                const status = quickLayerStatuses[layer.id];
                const tone =
                  status === "active"
                    ? "border-accent text-accent bg-card"
                    : status === "disabled"
                      ? "border-danger/40 text-danger bg-card"
                      : "border-border text-muted bg-card";
                return (
                  <button
                    key={layer.id}
                    className={`px-2 py-1 text-[11px] border rounded transition-all ${tone}`}
                    onClick={() => void runQuickLayer(layer.id)}
                    title={`${layer.label} (${status})`}
                  >
                    {layer.label}
                  </button>
                );
              })}
              <button
                className="px-2 py-1 text-[11px] border rounded border-border text-muted bg-card hover:border-accent hover:text-accent"
                onClick={() => setTab("plugins")}
                title="Open plugin settings"
              >
                Manage
              </button>
            </div>
          )}

          {autonomousRunOpen && (
            <div
              className="mb-2 rounded border border-border bg-card/70 p-2 text-xs relative"
              style={{ zIndex: 1 }}
            >
              <div className="flex items-center justify-between pb-2">
                <span className="text-[10px] uppercase tracking-wide text-muted">
                  Autonomous Run Setup
                </span>
                <button
                  className="px-2 py-1 text-[11px] border rounded border-border text-muted bg-card hover:border-accent hover:text-accent"
                  onClick={closeAutonomousRun}
                  disabled={autoRunPreviewBusy || autoRunLaunching}
                >
                  Close
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">Mode</span>
                  <select
                    className="px-2 py-1 border rounded border-border bg-card text-txt"
                    value={autoRunMode}
                    onChange={(e) =>
                      setState(
                        "autoRunMode",
                        e.target.value as "newscast" | "topic" | "games" | "free",
                      )
                    }
                    disabled={autoRunPreviewBusy || autoRunLaunching}
                  >
                    <option value="newscast">Newscast</option>
                    <option value="topic">Topic</option>
                    <option value="games">Play Games</option>
                    <option value="free">Free Will</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">Duration (minutes)</span>
                  <input
                    type="number"
                    min={5}
                    max={180}
                    step={5}
                    className="px-2 py-1 border rounded border-border bg-card text-txt"
                    value={autoRunDurationMin}
                    onChange={(e) => {
                      const parsed = Number.parseInt(e.target.value, 10);
                      const next = Number.isFinite(parsed)
                        ? Math.max(5, Math.min(180, parsed))
                        : 30;
                      setState("autoRunDurationMin", next);
                    }}
                    disabled={autoRunPreviewBusy || autoRunLaunching}
                  />
                </label>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-[11px] text-muted">
                    Topic {autoRunMode === "topic" ? "(required)" : "(optional)"}
                  </span>
                  <input
                    type="text"
                    className="px-2 py-1 border rounded border-border bg-card text-txt"
                    placeholder="e.g. Solana ecosystem recap, market structure, render infra updates"
                    value={autoRunTopic}
                    onChange={(e) => setState("autoRunTopic", e.target.value)}
                    disabled={autoRunPreviewBusy || autoRunLaunching}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">Avatar Runtime</span>
                  <select
                    className="px-2 py-1 border rounded border-border bg-card text-txt"
                    value={autoRunAvatarRuntime}
                    onChange={(e) =>
                      setState(
                        "autoRunAvatarRuntime",
                        e.target.value as "auto" | "local" | "premium",
                      )
                    }
                    disabled={autoRunPreviewBusy || autoRunLaunching}
                  >
                    <option value="local">Local (lower cost)</option>
                    <option value="auto">Auto</option>
                    <option value="premium">Premium (higher quality/cost)</option>
                  </select>
                </label>

                <div className="flex flex-col gap-1 justify-end">
                  <span className="text-[11px] text-muted">Identity Projection</span>
                  <span className="text-[11px] text-muted">
                    Uses current Milaidy character voice/style defaults.
                  </span>
                </div>
              </div>

              {autoRunPreview && (
                <div className="mt-2 rounded border border-border/70 bg-bg-hover/40 px-2 py-2">
                  <div className="flex flex-wrap items-center gap-3 text-[11px]">
                    <span className="text-muted">
                      Profile: <span className="text-txt">{autoRunPreview.profile}</span>
                    </span>
                    <span className="text-muted">
                      Stream credits:{" "}
                      <span className="text-txt">
                        {typeof autoRunPreview.estimate.totalCredits === "number"
                          ? autoRunPreview.estimate.totalCredits
                          : "n/a"}
                      </span>
                    </span>
                    <span className="text-muted">
                      Runtime credits:{" "}
                      <span className="text-txt">
                        {typeof autoRunPreview.estimate.runtimeCredits === "number"
                          ? autoRunPreview.estimate.runtimeCredits
                          : "n/a"}
                      </span>
                    </span>
                    <span className="text-muted">
                      Total credits:{" "}
                      <span className="text-txt">
                        {typeof autoRunPreview.estimate.grandTotalCredits === "number"
                          ? autoRunPreview.estimate.grandTotalCredits
                          : "n/a"}
                      </span>
                    </span>
                    <span className="text-muted">
                      Balance:{" "}
                      <span className="text-txt">
                        {typeof autoRunPreview.balance?.creditBalance === "number"
                          ? autoRunPreview.balance.creditBalance
                          : "n/a"}
                      </span>
                    </span>
                    <span
                      className={`font-semibold ${
                        autoRunPreview.canStart ? "text-ok" : "text-danger"
                      }`}
                    >
                      {autoRunPreview.canStart
                        ? "Ready to launch"
                        : "Insufficient credits"}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className="px-2 py-1 text-[11px] border rounded border-border text-muted bg-card hover:border-accent hover:text-accent disabled:opacity-50"
                  onClick={() => void runAutonomousEstimate()}
                  disabled={autoRunPreviewBusy || autoRunLaunching}
                >
                  {autoRunPreviewBusy ? "Estimating..." : "Estimate Cost"}
                </button>
                <button
                  className="px-2 py-1 text-[11px] border rounded border-accent text-accent bg-card hover:bg-accent/10 disabled:opacity-50"
                  onClick={() => void runAutonomousLaunch()}
                  disabled={autoRunPreviewBusy || autoRunLaunching}
                >
                  {autoRunLaunching ? "Launching..." : "Start Autonomous Run"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div
        className="mb-2 rounded border border-border bg-card/70 p-2 text-xs relative"
        style={{ zIndex: 1 }}
      >
        <div className="flex items-center gap-2 pb-2">
          <span className="text-[10px] uppercase tracking-wide text-muted">
            Mastery Runs
          </span>
          <span className="flex-1" />
          {masteryRunsLoading ? (
            <span className="text-[10px] text-muted">refreshing...</span>
          ) : null}
          <button
            className="px-2 py-1 text-[11px] border rounded border-border text-muted bg-card hover:border-accent hover:text-accent disabled:opacity-50"
            onClick={() => void loadMasteryRuns()}
            disabled={masteryRunsLoading}
          >
            Refresh
          </button>
          <button
            className="px-2 py-1 text-[11px] border rounded border-accent text-accent bg-card hover:bg-accent/10 disabled:opacity-50"
            onClick={() => void startMasterySuite()}
            disabled={masterySuiteStarting}
          >
            {masterySuiteStarting ? "Starting..." : "Start 16-Game Certification"}
          </button>
        </div>

        {masteryRunsError ? (
          <div className="text-danger text-[11px]">{masteryRunsError}</div>
        ) : masteryRuns.length === 0 ? (
          <div className="text-muted text-[11px]">No mastery runs recorded yet.</div>
        ) : (
          <div className="space-y-1">
            {masteryRuns.map((run) => (
              <div
                key={run.runId}
                className="flex flex-wrap items-center gap-2 border border-border/60 bg-card px-2 py-1"
              >
                <span className="font-mono text-[10px] text-muted">{run.runId}</span>
                <span
                  className={`text-[10px] px-1 py-0.5 border ${
                    run.status === "success"
                      ? "border-ok text-ok"
                      : run.status === "running" || run.status === "queued"
                        ? "border-warn text-warn"
                        : "border-danger text-danger"
                  }`}
                >
                  {run.status}
                </span>
                <span className="text-[10px] text-muted">
                  games pass: {run.summary.passedGames.length}/
                  {run.summary.denominatorGames || run.games.length}
                </span>
                <span className="text-[10px] text-muted">
                  episodes: {run.progress.completedEpisodes}/{run.progress.totalEpisodes}
                </span>
                <span className="text-[10px] text-muted">
                  strict: {run.strict ? "yes" : "no"}
                </span>
                <span className="text-[10px] text-muted">
                  verify: {run.verificationStatus}
                </span>
                {run.summary.deferredGames.length > 0 ? (
                  <span className="text-[10px] text-muted">
                    deferred: {run.summary.deferredGames.length}
                  </span>
                ) : null}
                {run.error ? (
                  <span className="text-[10px] text-danger truncate">
                    error: {run.error}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        ref={messagesRef}
        data-testid="chat-messages-scroll"
        className="flex-1 overflow-y-auto py-2 pr-3 relative"
        style={{ zIndex: 1, scrollbarGutter: "stable both-edges" }}
      >
        {visibleMsgs.length === 0 && !chatSending ? (
          <div className="text-center py-10 text-muted italic">
            Send a message to start chatting.
          </div>
        ) : (
          <div className="w-full px-0">
            {visibleMsgs.map((msg, i) => {
              const prev = i > 0 ? visibleMsgs[i - 1] : null;
              const grouped = prev?.role === msg.role;
              const isUser = msg.role === "user";

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"} ${grouped ? "mt-1" : "mt-3"}`}
                  data-testid="chat-message"
                  data-role={msg.role}
                >
                  {!isUser &&
                    (grouped ? (
                      <div className="w-7 h-7 shrink-0" aria-hidden />
                    ) : (
                      <div className="w-7 h-7 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover">
                        {agentAvatarSrc ? (
                          <img
                            src={agentAvatarSrc}
                            alt={`${agentName} avatar`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-muted">
                            {agentInitial}
                          </div>
                        )}
                      </div>
                    ))}
                  <div
                    className="max-w-[85%] px-0 py-1 text-sm leading-relaxed whitespace-pre-wrap break-words"
                  >
                    {!grouped && (
                      <div className="font-bold text-[12px] mb-1 text-accent">
                        {isUser ? "Operator" : agentName}
                        {!isUser &&
                          typeof msg.source === "string" &&
                          msg.source &&
                          msg.source !== "client_chat" && (
                            <span className="ml-1.5 text-[10px] font-normal text-muted">
                              via {msg.source}
                            </span>
                          )}
                      </div>
                    )}
                    <div><MessageContent message={msg} /></div>
                  </div>
                </div>
              );
            })}

            {chatSending && !chatFirstTokenReceived && (
              <div className="mt-3 flex items-start gap-2 justify-start">
                <div className="w-7 h-7 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover">
                  {agentAvatarSrc ? (
                    <img
                      src={agentAvatarSrc}
                      alt={`${agentName} avatar`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-muted">
                      {agentInitial}
                    </div>
                  )}
                </div>
                <div className="max-w-[85%] px-0 py-1 text-sm leading-relaxed">
                  <div className="font-bold text-[12px] mb-1 text-accent">{agentName}</div>
                  <div className="flex gap-1 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite_0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite_0.4s]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Share ingest notice */}
      {shareIngestNotice && (
        <div className="text-xs text-ok py-1 relative" style={{ zIndex: 1 }}>{shareIngestNotice}</div>
      )}

      {/* Dropped files */}
      {droppedFiles.length > 0 && (
        <div className="text-xs text-muted py-0.5 flex gap-2 relative" style={{ zIndex: 1 }}>
          {droppedFiles.map((f, i) => (
            <span key={i}>{f}</span>
          ))}
        </div>
      )}

      {chatPendingImages.length > 0 && (
        <div className="flex flex-wrap gap-2 py-1 relative" style={{ zIndex: 1 }}>
          {chatPendingImages.map((image) => (
            <div
              key={image.name}
              className="group inline-flex items-center gap-2 rounded border border-border bg-card px-2 py-1 text-xs text-txt"
            >
              <span className="truncate max-w-[180px]">{image.name}</span>
              <button
                type="button"
                aria-label={`Remove image ${image.name}`}
                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                onClick={() => removePendingImage(image.name)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Avatar / voice toggles ────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-2 pb-1.5 relative"
        style={{ zIndex: 1 }}
      >
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted uppercase tracking-wide">
            Mode
          </span>
          <button
            className={`px-2 py-1 text-xs border rounded cursor-pointer transition-all ${
              chatMode === "simple"
                ? "border-accent text-accent bg-card"
                : "border-border text-muted bg-card hover:border-accent hover:text-accent"
            }`}
            onClick={() => setChatMode("simple")}
            title="Simple mode: reply only, no tools"
            disabled={chatSending}
          >
            Simple
          </button>
          <button
            className={`px-2 py-1 text-xs border rounded cursor-pointer transition-all ${
              chatMode === "power"
                ? "border-accent text-accent bg-card"
                : "border-border text-muted bg-card hover:border-accent hover:text-accent"
            }`}
            onClick={() => setChatMode("power")}
            title="Power mode: tools/actions allowed"
            disabled={chatSending}
          >
            Power
          </button>
        </div>
        <div className="flex gap-1.5">
          {/* Actions tab */}
          <button
            className="w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all bg-card border-border text-muted hover:border-accent hover:text-accent"
            onClick={() => {
              window.dispatchEvent(new Event("toggle-custom-actions-panel"));
            }}
            aria-label="Open Actions drawer"
            title="Open Actions drawer"
          >
            <OpsIcon width="14" height="14" />
          </button>

          {/* Show / hide avatar */}
          <button
            className={`w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all bg-card ${
              avatarVisible
                ? "border-accent text-accent"
                : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
            onClick={() => setAvatarVisible((v) => !v)}
            aria-label={avatarVisible ? "Hide avatar" : "Show avatar"}
            title={avatarVisible ? "Hide avatar" : "Show avatar"}
          >
            <AgentIcon width="14" height="14" className={!avatarVisible ? "opacity-55" : undefined} />
          </button>

          {/* Mute / unmute agent voice */}
          <button
            className={`w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all bg-card ${
              agentVoiceMuted
                ? "border-border text-muted hover:border-accent hover:text-accent"
                : "border-accent text-accent"
            }`}
            onClick={() => {
              const muting = !agentVoiceMuted;
              setAgentVoiceMuted(muting);
              if (muting) voice.stopSpeaking();
            }}
            aria-label={agentVoiceMuted ? "Unmute agent voice" : "Mute agent voice"}
            title={agentVoiceMuted ? "Unmute agent voice" : "Mute agent voice"}
          >
            <AudioIcon width="14" height="14" muted={agentVoiceMuted} />
          </button>
        </div>
      </div>

      {/* ── Input row: mic + textarea + send ───────────────────────── */}
      <div
        className="flex gap-2 items-end border-t border-border pt-3 pb-4 relative"
        style={{ zIndex: 1, paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        {/* Mic button — user voice input */}
        {voice.supported && (
          <button
            className={`h-[38px] w-[38px] flex-shrink-0 flex items-center justify-center border rounded cursor-pointer transition-all self-end ${
              voice.isListening
                ? "bg-accent border-accent text-accent-fg shadow-[0_0_10px_rgba(124,58,237,0.4)] animate-pulse"
                : "border-border bg-card text-muted hover:border-accent hover:text-accent"
            }`}
            onClick={voice.toggleListening}
            aria-label={voice.isListening ? "Stop voice input" : "Start voice input"}
            aria-pressed={voice.isListening}
            title={voice.isListening ? "Stop listening" : "Voice input"}
          >
            <MicIcon width="16" height="16" className={voice.isListening ? "fill-current" : undefined} />
          </button>
        )}

        <button
          type="button"
          className="h-[38px] w-[38px] flex-shrink-0 flex items-center justify-center border rounded cursor-pointer transition-all self-end border-border bg-card text-muted hover:border-accent hover:text-accent"
          aria-label="Attach image"
          title="Attach image"
          onClick={() => fileInputRef.current?.click()}
        >
          +
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addImageFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Textarea / live transcript */}
        {voice.isListening && voice.interimTranscript ? (
          <div className="flex-1 px-3 py-2 border border-accent bg-card text-txt text-sm font-body leading-relaxed min-h-[38px] flex items-center">
            <span className="text-muted italic">{voice.interimTranscript}</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            aria-label="Chat message"
            className="flex-1 px-3 py-2 border border-border bg-card text-txt text-sm font-body leading-relaxed resize-none overflow-y-hidden min-h-[38px] max-h-[200px] focus:border-accent focus:outline-none"
            rows={1}
            placeholder={voice.isListening ? "Listening..." : "Continue the conversation..."}
            value={chatInput}
            onChange={(e) => setState("chatInput", e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={chatSending}
          />
        )}

        {/* Send / Stop */}
        {chatSending ? (
          <button
            className="h-[38px] px-3 sm:px-4 py-2 border border-danger bg-danger/10 text-danger text-sm cursor-pointer hover:bg-danger/20 self-end"
            onClick={handleChatStop}
            title="Stop generation"
          >
            Stop
          </button>
        ) : voice.isSpeaking ? (
          <button
            className="h-[38px] px-3 sm:px-4 py-2 border border-danger bg-danger/10 text-danger text-sm cursor-pointer hover:bg-danger/20 self-end"
            onClick={voice.stopSpeaking}
            title="Stop speaking"
          >
            Stop Voice
          </button>
        ) : (
          <button
            className="h-[38px] px-3 sm:px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed self-end"
            onClick={() => void handleChatSend()}
            disabled={chatSending || !chatInput.trim()}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
});

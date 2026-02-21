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
  type ReactNode,
} from "react";
import { getVrmPreviewUrl, useApp } from "../AppContext.js";
import { ChatAvatar } from "./ChatAvatar.js";
import { useVoiceChat } from "../hooks/useVoiceChat.js";
import {
  client,
  type ConversationMode,
  type Five55AutonomyMode,
  type Five55AutonomyPreviewResponse,
  type VoiceConfig,
} from "../api-client.js";
import { MessageContent } from "./MessageContent.js";

function renderInlineMarkdown(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenRe = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code key={key} className="px-1 py-0.5 rounded bg-bg text-[0.95em] font-mono">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = tokenRe.lastIndex;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}

function renderMessageText(text: string): ReactNode {
  const lines = text.split(/\r?\n/);
  return lines.map((line, i) => (
    <span key={i}>
      {renderInlineMarkdown(line)}
      {i < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

type ParsedToolEnvelope = {
  ok?: boolean;
  action?: string;
  message?: string;
  status?: number;
  data?: Record<string, unknown>;
};

function parseToolEnvelopeFromPipelineResult(
  pipelineResult: unknown,
): ParsedToolEnvelope | null {
  if (!pipelineResult || typeof pipelineResult !== "object") return null;
  const pipelineRecord = pipelineResult as Record<string, unknown>;
  const toolResult = pipelineRecord.result;
  if (!toolResult || typeof toolResult !== "object") return null;
  const toolRecord = toolResult as Record<string, unknown>;
  const text = toolRecord.text;
  if (typeof text !== "string" || text.trim().length === 0) return null;

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed.data;
    return {
      ok: typeof parsed.ok === "boolean" ? parsed.ok : undefined,
      action: typeof parsed.action === "string" ? parsed.action : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
      status: typeof parsed.status === "number" ? parsed.status : undefined,
      data:
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : undefined,
    };
  } catch {
    return null;
  }
}

function findLastToolEnvelope(
  results: unknown[],
  actionName: string,
): ParsedToolEnvelope | null {
  const normalizedAction = actionName.trim().toUpperCase();
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const envelope = parseToolEnvelopeFromPipelineResult(results[i]);
    if (!envelope?.action) continue;
    if (envelope.action.trim().toUpperCase() === normalizedAction) {
      return envelope;
    }
  }
  return null;
}

function summarizeStreamState(
  envelope: ParsedToolEnvelope | null,
): { live: boolean; label: string } {
  const data = envelope?.data;
  if (!data) return { live: false, label: "unknown" };

  const rawState =
    typeof data.state === "string"
      ? data.state
      : typeof data.phase === "string"
        ? data.phase
        : typeof data.status === "string"
          ? data.status
          : undefined;
  const normalizedState = rawState?.trim().toLowerCase() ?? "";
  const live =
    data.active === true ||
    data.isLive === true ||
    normalizedState === "live" ||
    normalizedState === "playing" ||
    normalizedState === "streaming" ||
    normalizedState === "on_air";
  return { live, label: rawState ?? (live ? "live" : "unknown") };
}

type ParsedGameLaunch = {
  gameId: string;
  gameTitle: string;
  viewerUrl: string;
  sandbox?: string;
  postMessageAuth: boolean;
};

function parseAdIdFromEnvelope(
  envelope: ParsedToolEnvelope | null,
): string | undefined {
  const data = envelope?.data;
  if (!data || typeof data !== "object") return undefined;
  const ad =
    data.ad && typeof data.ad === "object" && !Array.isArray(data.ad)
      ? (data.ad as Record<string, unknown>)
      : null;
  return ad && typeof ad.id === "string" && ad.id.trim().length > 0
    ? ad.id.trim()
    : undefined;
}

function parseProjectedEarningsFromEnvelope(
  envelope: ParsedToolEnvelope | null,
): number | null {
  const data = envelope?.data;
  if (!data || typeof data !== "object") return null;
  const evaluated = Array.isArray(data.evaluated) ? data.evaluated : [];
  let maxPayout = 0;
  for (const entry of evaluated) {
    if (!entry || typeof entry !== "object") continue;
    const payout = Number((entry as Record<string, unknown>).payoutPerImpression ?? 0);
    if (Number.isFinite(payout) && payout > maxPayout) {
      maxPayout = payout;
    }
  }
  return Number.isFinite(maxPayout) ? maxPayout : null;
}

function parseGameLaunchFromEnvelope(
  envelope: ParsedToolEnvelope | null,
): ParsedGameLaunch | null {
  const data = envelope?.data;
  if (!data) return null;

  const game =
    data.game && typeof data.game === "object" && !Array.isArray(data.game)
      ? (data.game as Record<string, unknown>)
      : null;
  const viewer =
    data.viewer && typeof data.viewer === "object" && !Array.isArray(data.viewer)
      ? (data.viewer as Record<string, unknown>)
      : null;

  const viewerUrl =
    (viewer && typeof viewer.url === "string" ? viewer.url : undefined) ??
    (typeof data.launchUrl === "string" ? data.launchUrl : undefined);
  if (!viewerUrl) return null;

  const gameId =
    (game && typeof game.id === "string" ? game.id : undefined) ??
    "unknown-game";
  const gameTitle =
    (game && typeof game.title === "string" ? game.title : undefined) ?? gameId;
  const sandbox =
    viewer && typeof viewer.sandbox === "string" ? viewer.sandbox : undefined;
  const postMessageAuth =
    viewer && typeof viewer.postMessageAuth === "boolean"
      ? viewer.postMessageAuth
      : false;

  return {
    gameId,
    gameTitle,
    viewerUrl,
    sandbox,
    postMessageAuth,
  };
}

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
    plugins,
    activeGameViewerUrl,
    droppedFiles,
    shareIngestNotice,
    selectedVrmIndex,
  } = useApp();

  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
  const [autoRunOpen, setAutoRunOpen] = useState(false);
  const [autoRunMode, setAutoRunMode] = useState<Five55AutonomyMode>("newscast");
  const [autoRunTopic, setAutoRunTopic] = useState("");
  const [autoRunDurationMin, setAutoRunDurationMin] = useState(30);
  const [autoRunAvatarRuntime, setAutoRunAvatarRuntime] = useState<
    "auto" | "local" | "premium"
  >("local");
  const [autoRunPreview, setAutoRunPreview] =
    useState<Five55AutonomyPreviewResponse | null>(null);
  const [autoRunPreviewBusy, setAutoRunPreviewBusy] = useState(false);
  const [autoRunLaunching, setAutoRunLaunching] = useState(false);

  useEffect(() => {
    setAutoRunPreview(null);
  }, [autoRunMode, autoRunTopic, autoRunDurationMin, autoRunAvatarRuntime]);

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
      setTimeout(() => void handleChatSend(chatMode), 50);
    },
    [chatMode, chatSending, setState, handleChatSend],
  );

  const voice = useVoiceChat({ onTranscript: handleVoiceTranscript, voiceConfig });

  const agentName = agentStatus?.agentName ?? "Agent";
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
  const DEFAULT_GAME_SANDBOX =
    "allow-scripts allow-same-origin allow-popups allow-forms";
  type LayerStatus = "active" | "disabled" | "available";
  type QuickLayer = {
    id: string;
    label: string;
    prompt: string;
    pluginIds: string[];
    navigateToApps?: boolean;
  };

  const resolvePluginStatus = useCallback((id: string): LayerStatus => {
    const needle = id.trim().toLowerCase();
    const plugin = plugins.find((p) => {
      const pluginId = p.id.trim().toLowerCase();
      const pluginName = p.name.trim().toLowerCase();
      return (
        pluginId === needle ||
        pluginId === needle.replace(/^alice-/, "") ||
        pluginName === needle ||
        pluginName.includes(needle)
      );
    });
    if (!plugin) return "available";
    if (plugin.isActive === true) return "active";
    if (plugin.enabled === false) return "disabled";
    if (plugin.enabled === true && plugin.isActive === false) return "disabled";
    return "available";
  }, [plugins]);

  const hasPluginRegistration = useCallback(
    (id: string): boolean => {
      const needle = id.trim().toLowerCase();
      return plugins.some((p) => {
        const pluginId = p.id.trim().toLowerCase();
        const pluginName = p.name.trim().toLowerCase();
        return (
          pluginId === needle ||
          pluginId === needle.replace(/^alice-/, "") ||
          pluginName === needle ||
          pluginName.includes(needle)
        );
      });
    },
    [plugins],
  );

  const resolveLayerStatus = useCallback((pluginIds: string[]): LayerStatus => {
    if (pluginIds.length === 0) return "available";
    const statuses = pluginIds.map((id) => resolvePluginStatus(id));
    if (statuses.every((status) => status === "active")) return "active";
    if (statuses.some((status) => status === "disabled")) return "disabled";
    return "available";
  }, [resolvePluginStatus]);

  const hasActiveGameViewer =
    typeof activeGameViewerUrl === "string" && activeGameViewerUrl.trim().length > 0;

  const selectPreferredGameId = useCallback(
    (games: Array<{ id: string; category?: string }>): string | undefined => {
      const preferredOrder = [
        "ninja-evilcorp",
        "drive",
        "wolf-and-sheep",
        "pixel-copter",
      ];
      for (const preferredId of preferredOrder) {
        const hit = games.find((game) => game.id === preferredId);
        if (hit) return hit.id;
      }

      const nonCasino = games.find((game) => game.category !== "casino");
      return nonCasino?.id ?? games[0]?.id;
    },
    [],
  );

  const buildAutonomousPrompt = useCallback(
    (params: {
      mode: Five55AutonomyMode;
      topic: string;
      durationMin: number;
      gameTitle?: string;
    }): string => {
      const { mode, topic, durationMin, gameTitle } = params;
      const timingInstruction =
        `Operate autonomously for ${durationMin} minutes, then wrap up naturally and stop the stream.`;

      if (mode === "newscast") {
        return [
          "Run an autonomous live newscast.",
          "Cover recent events with concise segments, clear transitions, and factual framing.",
          timingInstruction,
        ].join(" ");
      }
      if (mode === "topic") {
        const focus = topic.trim() || "the selected topic";
        return [
          `Run an autonomous live topic deep dive on ${focus}.`,
          "Structure it into intro, key points, examples, and closing recap.",
          timingInstruction,
        ].join(" ");
      }
      if (mode === "games") {
        const target = gameTitle?.trim() || "the active game";
        return [
          `Run an autonomous live gameplay session for ${target}.`,
          "Keep live commentary focused on tactics, score progression, and key turning points.",
          timingInstruction,
        ].join(" ");
      }
      return [
        "Run an autonomous live free-form session.",
        "Choose engaging segments dynamically while maintaining coherent pacing.",
        timingInstruction,
      ].join(" ");
    },
    [],
  );

  const runAutonomousEstimate = useCallback(async () => {
    if (autoRunMode === "topic" && autoRunTopic.trim().length === 0) {
      setActionNotice(
        "Topic mode requires a topic before estimating.",
        "info",
        2600,
      );
      return null;
    }

    setAutoRunPreviewBusy(true);
    try {
      const preview = await client.getFive55AutonomyPreview({
        mode: autoRunMode,
        topic: autoRunTopic.trim() || undefined,
        durationMin: autoRunDurationMin,
        avatarRuntime: autoRunAvatarRuntime,
      });
      setAutoRunPreview(preview);
      setActionNotice(
        preview.canStart
          ? "Autonomous run estimate ready."
          : "Estimate ready. Credits are insufficient for this run.",
        preview.canStart ? "success" : "info",
        2600,
      );
      return preview;
    } catch (err) {
      setActionNotice(
        `Failed to estimate autonomous run: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        4200,
      );
      return null;
    } finally {
      setAutoRunPreviewBusy(false);
    }
  }, [
    autoRunMode,
    autoRunTopic,
    autoRunDurationMin,
    autoRunAvatarRuntime,
    setActionNotice,
  ]);

  const quickLayers: QuickLayer[] = [
    {
      id: "stream",
      label: "Stream",
      pluginIds: ["stream"],
      prompt:
        "Use STREAM_STATUS and STREAM_CONTROL to report current stream state and execute the next stream action safely.",
    },
    {
      id: "go-live",
      label: "Go Live",
      pluginIds: ["stream"],
      prompt:
        "Run STREAM_STATUS first. If the stream is not live, run STREAM_CONTROL with operation=\"start\" and scene=\"default\", then run STREAM_STATUS again and confirm final state, phase, and session.",
    },
    {
      id: "autonomous-run",
      label: "Autonomous",
      pluginIds: ["stream"],
      prompt: "",
    },
    {
      id: "screen-share",
      label: "Screen Share",
      pluginIds: ["stream555-control"],
      prompt:
        "Use STREAM555_SCREEN_SHARE to switch the current live feed to screen-sharing and confirm the stream remains live.",
    },
    {
      id: "ads",
      label: "Ads",
      pluginIds: ["stream555-control"],
      prompt:
        "Create and trigger an ad break, then summarize ad playback state and expected payout impact.",
    },
    {
      id: "invite-guest",
      label: "Invite Guest",
      pluginIds: ["stream555-control"],
      prompt:
        "Create a guest invite and report the invite link with host-side instructions.",
    },
    {
      id: "radio",
      label: "Radio",
      pluginIds: ["stream555-control"],
      prompt:
        "Configure radio mode and summarize current live audio blend decisions.",
    },
    {
      id: "pip",
      label: "PiP",
      pluginIds: ["stream555-control"],
      prompt:
        "Enable PiP composition and confirm the active scene is updated.",
    },
    {
      id: "reaction-segment",
      label: "Reaction",
      pluginIds: ["stream555-control"],
      prompt:
        "Queue a reaction segment override and announce the next reaction topic.",
    },
    {
      id: "earnings",
      label: "Earnings",
      pluginIds: ["stream555-control"],
      prompt:
        "Evaluate marketplace payouts and report projected earnings opportunities for the next segment.",
    },
    {
      id: "play-games",
      label: "Play Games",
      pluginIds: ["five55-games"],
      navigateToApps: true,
      prompt:
        "Use FIVE55_GAMES_CATALOG to choose a playable game and run FIVE55_GAMES_PLAY in autonomous spectate mode (bot=true). Continue live commentary with score/capture updates.",
    },
    {
      id: "swap",
      label: "Swap",
      pluginIds: ["swap"],
      prompt:
        "Use WALLET_POSITION and SWAP_QUOTE to evaluate wallet state and produce a safe swap recommendation.",
    },
    {
      id: "end-live",
      label: "End Live",
      pluginIds: ["stream555-control"],
      prompt:
        "Stop the stream and provide a concise post-live summary with next recommended action.",
    },
  ];
  const quickLayerById = useMemo(
    () => new Map(quickLayers.map((layer) => [layer.id, layer])),
    [quickLayers],
  );

  const triggerQuickLayer = useCallback(
    async (layer: QuickLayer) => {
      if (chatSending) return;
      const status = resolveLayerStatus(layer.pluginIds);
      if (status === "disabled") {
        const pluginLabel = layer.pluginIds.join(", ");
        setActionNotice(
          `${pluginLabel} is disabled or not active. Enable it in Plugins first.`,
          "info",
          2200,
        );
        setTab("plugins");
        return;
      }

      if (layer.id === "autonomous-run") {
        setAutoRunOpen(true);
        setActionNotice(
          "Configure mode, duration, and credit estimate before starting autonomous live mode.",
          "info",
          2600,
        );
        return;
      }

      let prompt = layer.prompt;
      let openedViewerThisRun = false;
      let viewerUrlForStream: string | undefined = hasActiveGameViewer
        ? activeGameViewerUrl
        : undefined;

      if (layer.id === "go-live") {
        if (!hasPluginRegistration("stream")) {
          setActionNotice(
            "stream plugin is not registered. Enable it in Plugins first.",
            "info",
            2600,
          );
          setTab("plugins");
          return;
        }
        try {
          const plan = await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-go-live",
              steps: [
                {
                  id: "status-before",
                  toolName: "STREAM_STATUS",
                  params: { scope: "current" },
                },
                {
                  id: "start",
                  toolName: "STREAM_CONTROL",
                  params: { operation: "start", scene: "default" },
                },
                {
                  id: "status-after",
                  toolName: "STREAM_STATUS",
                  params: { scope: "current" },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          });
          const statusEnvelope = findLastToolEnvelope(
            plan.results,
            "STREAM_STATUS",
          );
          const streamState = summarizeStreamState(statusEnvelope);
          if (plan.allSucceeded || streamState.live) {
            setActionNotice(
              `Go live executed. Stream state: ${streamState.label}.`,
              "success",
              2800,
            );
            prompt =
              "You are now live. Give a concise on-air opener, current stream state, and the next production action.";
          } else {
            setActionNotice(
              "Go live ran but one or more stream steps failed. Check stream status and retry with exact fixes.",
              "error",
              4200,
            );
          }
        } catch (err) {
          setActionNotice(
            `Go live execution failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "error",
            4200,
          );
        }
      }

      const stream555ControlLayerIds = new Set([
        "screen-share",
        "ads",
        "invite-guest",
        "radio",
        "pip",
        "reaction-segment",
        "earnings",
        "end-live",
      ]);

      if (
        stream555ControlLayerIds.has(layer.id) &&
        !hasPluginRegistration("stream555-control")
      ) {
        setActionNotice(
          "stream555-control plugin is not registered. Enable it in Plugins first.",
          "info",
          2600,
        );
        setTab("plugins");
        return;
      }

      if (layer.id === "screen-share") {
        try {
          await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-screen-share",
              steps: [
                {
                  id: "screen-share",
                  toolName: "STREAM555_SCREEN_SHARE",
                  params: { sceneId: "active-pip" },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          });
          setActionNotice("Screen-share request dispatched.", "success", 2600);
          prompt =
            "Confirm screen-share is active and narrate what viewers should focus on next.";
        } catch (err) {
          setActionNotice(
            `Screen-share request failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "error",
            4200,
          );
        }
      }

      if (layer.id === "ads") {
        try {
          const createPlan = await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-ad-create",
              steps: [
                {
                  id: "ad-create",
                  toolName: "STREAM555_AD_CREATE",
                  params: {
                    type: "l-bar",
                    imageUrl: "https://picsum.photos/seed/alice-ad/1280/720",
                    durationMs: "15000",
                  },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          });
          const createdAdId = parseAdIdFromEnvelope(
            findLastToolEnvelope(createPlan.results, "STREAM555_AD_CREATE"),
          );

          if (createdAdId) {
            await client.executeAutonomyPlan({
              plan: {
                id: "quick-layer-ad-trigger",
                steps: [
                  {
                    id: "ad-trigger",
                    toolName: "STREAM555_AD_TRIGGER",
                    params: {
                      adId: createdAdId,
                      durationMs: "15000",
                    },
                  },
                ],
              },
              request: { source: "user", sourceTrust: 1 },
              options: { stopOnFailure: false },
            });
            setActionNotice(
              `Ad created and triggered (${createdAdId}).`,
              "success",
              2800,
            );
            prompt =
              `Ad ${createdAdId} was triggered. Briefly summarize monetization impact and what comes next on stream.`;
          } else {
            setActionNotice(
              "Ad create request completed, but no adId was returned for trigger.",
              "info",
              4200,
            );
          }
        } catch (err) {
          setActionNotice(
            `Ad action failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "error",
            4200,
          );
        }
      }

      if (layer.id === "invite-guest") {
        try {
          await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-guest-invite",
              steps: [
                {
                  id: "guest-invite",
                  toolName: "STREAM555_GUEST_INVITE",
                  params: { name: "Guest" },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          });
          setActionNotice("Guest invite generated.", "success", 2600);
          prompt =
            "Announce guest invite status and provide concise host handoff guidance.";
        } catch (err) {
          setActionNotice(
            `Guest invite failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "error",
            4200,
          );
        }
      }

      if (layer.id === "radio") {
        try {
          await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-radio-control",
              steps: [
                {
                  id: "radio-mode",
                  toolName: "STREAM555_RADIO_CONTROL",
                  params: { action: "setAutoDJMode", mode: "MUSIC" },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          });
          setActionNotice("Radio mode updated.", "success", 2600);
          prompt = "Summarize current radio/audio mode and how it supports this segment.";
        } catch (err) {
          setActionNotice(
            `Radio control failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "error",
            4200,
          );
        }
      }

      if (layer.id === "pip") {
        try {
          await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-pip-enable",
              steps: [
                {
                  id: "pip-enable",
                  toolName: "STREAM555_PIP_ENABLE",
                  params: { sceneId: "active-pip" },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          });
          setActionNotice("PiP scene activated.", "success", 2600);
          prompt =
            "Confirm PiP composition is active and describe what each frame currently shows.";
        } catch (err) {
          setActionNotice(
            `PiP activation failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "error",
            4200,
          );
        }
      }

      if (layer.id === "reaction-segment") {
        try {
          await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-reaction-segment",
              steps: [
                {
                  id: "segment-override-reaction",
                  toolName: "STREAM555_SEGMENT_OVERRIDE",
                  params: {
                    segmentType: "reaction",
                    reason: "actions-tab reaction segment",
                  },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          });
          setActionNotice("Reaction segment override queued.", "success", 2600);
          prompt =
            "Start the next reaction segment now and keep your commentary focused on viewer engagement.";
        } catch (err) {
          setActionNotice(
            `Reaction segment override failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "error",
            4200,
          );
        }
      }

      if (layer.id === "earnings") {
        try {
          const earningsPlan = await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-earnings-estimate",
              steps: [
                {
                  id: "earnings-estimate",
                  toolName: "STREAM555_EARNINGS_ESTIMATE",
                  params: {
                    categories: "gaming,reaction,news",
                    limit: "5",
                    poolSize: "30",
                  },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          });
          const envelope = findLastToolEnvelope(
            earningsPlan.results,
            "STREAM555_EARNINGS_ESTIMATE",
          );
          const maxPayout = parseProjectedEarningsFromEnvelope(envelope);
          setActionNotice(
            maxPayout && maxPayout > 0
              ? `Projected top payout per impression: ${maxPayout.toFixed(4)} credits.`
              : "Earnings estimate computed.",
            "success",
            3200,
          );
          prompt =
            "Summarize projected earnings opportunities and recommend the next monetization move.";
        } catch (err) {
          setActionNotice(
            `Earnings estimate failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "error",
            4200,
          );
        }
      }

      if (layer.id === "end-live") {
        try {
          await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-end-live",
              steps: [
                {
                  id: "end-live",
                  toolName: "STREAM555_END_LIVE",
                  params: {},
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          });
          setActionNotice("End-live request dispatched.", "success", 2600);
          prompt =
            "Provide a concise stream wrap-up, final outcomes, and next scheduled action.";
        } catch (err) {
          setActionNotice(
            `End-live failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "error",
            4200,
          );
        }
      }

      if (layer.id === "play-games") {
        try {
          const catalog = await client.getFive55GamesCatalog({
            includeBeta: true,
          });
          const selectedGameId = selectPreferredGameId(catalog.games);
          const selectedGame = selectedGameId
            ? catalog.games.find((game) => game.id === selectedGameId)
            : undefined;

          const playPlan = await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-play-games-autonomous",
              steps: [
                {
                  id: "play-autonomous",
                  toolName: "FIVE55_GAMES_PLAY",
                  params: {
                    ...(selectedGameId ? { gameId: selectedGameId } : {}),
                    mode: "spectate",
                  },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: true },
          });

          let launch = parseGameLaunchFromEnvelope(
            findLastToolEnvelope(playPlan.results, "FIVE55_GAMES_PLAY"),
          );
          if (!launch) {
            const playResult = await client.playFive55Game({
              gameId: selectedGameId,
              mode: "spectate",
            });
            launch = {
              gameId: playResult.game.id,
              gameTitle: playResult.game.title,
              viewerUrl: playResult.viewer.url,
              sandbox: playResult.viewer.sandbox,
              postMessageAuth: Boolean(playResult.viewer.postMessageAuth),
            };
          }

          if (launch?.viewerUrl) {
            const resolvedGameId = launch.gameId || selectedGameId || "unknown-game";
            const resolvedGameTitle =
              launch.gameTitle || selectedGame?.title || resolvedGameId;

            openedViewerThisRun = true;
            setState("activeGameApp", `five55:${resolvedGameId}`);
            setState("activeGameDisplayName", resolvedGameTitle);
            setState("activeGameViewerUrl", launch.viewerUrl);
            setState(
              "activeGameSandbox",
              launch.sandbox ?? DEFAULT_GAME_SANDBOX,
            );
            setState("activeGamePostMessageAuth", launch.postMessageAuth);
            setState("activeGamePostMessagePayload", null);
            viewerUrlForStream = launch.viewerUrl;
            prompt =
              `You are now spectating ${resolvedGameTitle} (${resolvedGameId}) in autonomous bot mode. ` +
              "Provide live game commentary, key decisions, and score/capture updates while continuing in-play control.";
            setActionNotice(
              `Launched ${resolvedGameTitle} in autonomous mode.`,
              "success",
              2400,
            );
          } else {
            setActionNotice(
              "Autonomous game launch did not return a viewer URL.",
              "error",
              4200,
            );
          }
        } catch (err) {
          setActionNotice(
            `Failed to launch five55 game: ${err instanceof Error ? err.message : "unknown error"}`,
            "error",
            4200,
          );
        }
      }

      if (
        layer.id === "play-games" &&
        viewerUrlForStream &&
        hasPluginRegistration("stream") &&
        resolveLayerStatus(["stream"]) !== "disabled"
      ) {
        try {
          const attachPlan = await client.executeAutonomyPlan({
            plan: {
              id: "quick-layer-game-stream-attach",
              steps: [
                {
                  id: "status-before",
                  toolName: "STREAM_STATUS",
                  params: { scope: "current" },
                },
                {
                  id: "start-game-feed",
                  toolName: "STREAM_CONTROL",
                  params: {
                    operation: "start",
                    scene: "game",
                    inputType: "website",
                    url: viewerUrlForStream,
                  },
                },
                {
                  id: "status-after",
                  toolName: "STREAM_STATUS",
                  params: { scope: "current" },
                },
              ],
            },
            request: { source: "user", sourceTrust: 1 },
            options: { stopOnFailure: false },
          });
          const finalStatus = summarizeStreamState(
            findLastToolEnvelope(attachPlan.results, "STREAM_STATUS"),
          );
          if (attachPlan.allSucceeded || finalStatus.live) {
            setActionNotice(
              `Game feed routed to stream. Stream state: ${finalStatus.label}.`,
              "success",
              2600,
            );
          } else {
            setActionNotice(
              "Game launched, but stream feed attach needs follow-up in stream controls.",
              "info",
              3600,
            );
          }
        } catch (err) {
          setActionNotice(
            `Game launched, but stream attach failed: ${err instanceof Error ? err.message : "unknown error"}`,
            "info",
            4200,
          );
        }
      }

      setState("chatInput", prompt);

      if (layer.navigateToApps) {
        setTab("apps");
        const hasViewer = hasActiveGameViewer || openedViewerThisRun;
        setState("appsSubTab", hasViewer ? "games" : "browse");
        if (!openedViewerThisRun) {
          setActionNotice(
            hasActiveGameViewer
              ? "Opened active game viewer for spectating."
              : "Opened Apps. Launch a game to begin spectating.",
            "info",
            2200,
          );
        }
      }

      setTimeout(() => void handleChatSend("power"), 30);
    },
    [
      chatSending,
      resolveLayerStatus,
      setActionNotice,
      setState,
      setTab,
      hasActiveGameViewer,
      activeGameViewerUrl,
      selectPreferredGameId,
      handleChatSend,
      hasPluginRegistration,
    ],
  );

  const runAutonomousLaunch = useCallback(async () => {
    if (chatSending || autoRunLaunching) return;
    if (autoRunMode === "topic" && autoRunTopic.trim().length === 0) {
      setActionNotice(
        "Topic mode requires a topic before launch.",
        "info",
        3000,
      );
      return;
    }
    if (!hasPluginRegistration("stream")) {
      setActionNotice(
        "stream plugin is not registered. Enable it in Plugins first.",
        "info",
        2600,
      );
      setTab("plugins");
      return;
    }
    if (resolveLayerStatus(["stream"]) === "disabled") {
      setActionNotice(
        "stream plugin is disabled. Enable it in Plugins before autonomous runs.",
        "info",
        3000,
      );
      setTab("plugins");
      return;
    }

    setAutoRunLaunching(true);
    try {
      const preview =
        autoRunPreview ??
        (await runAutonomousEstimate());
      if (!preview) return;
      if (!preview.canStart) {
        setActionNotice(
          "Insufficient credits for this autonomous run. Adjust duration/runtime or top up credits.",
          "error",
          4200,
        );
        return;
      }

      let gameTitle: string | undefined;
      let streamStartParams: Record<string, unknown> = {
        operation: "start",
        scene: "default",
        inputType: "avatar",
      };

      if (autoRunMode === "games") {
        const catalog = await client.getFive55GamesCatalog({ includeBeta: true });
        const selectedGameId = selectPreferredGameId(catalog.games);
        const selectedGame = selectedGameId
          ? catalog.games.find((game) => game.id === selectedGameId)
          : undefined;

        const playPlan = await client.executeAutonomyPlan({
          plan: {
            id: "autonomous-live-games-launch",
            steps: [
              {
                id: "play",
                toolName: "FIVE55_GAMES_PLAY",
                params: {
                  ...(selectedGameId ? { gameId: selectedGameId } : {}),
                  mode: "spectate",
                },
              },
            ],
          },
          request: { source: "user", sourceTrust: 1 },
          options: { stopOnFailure: true },
        });
        const launch = parseGameLaunchFromEnvelope(
          findLastToolEnvelope(playPlan.results, "FIVE55_GAMES_PLAY"),
        );
        if (!launch?.viewerUrl) {
          setActionNotice(
            "Could not launch a game viewer for autonomous gameplay.",
            "error",
            4200,
          );
          return;
        }

        gameTitle = launch.gameTitle;
        setState("activeGameApp", `five55:${launch.gameId}`);
        setState("activeGameDisplayName", launch.gameTitle);
        setState("activeGameViewerUrl", launch.viewerUrl);
        setState(
          "activeGameSandbox",
          launch.sandbox ?? DEFAULT_GAME_SANDBOX,
        );
        setState("activeGamePostMessageAuth", launch.postMessageAuth);
        setState("activeGamePostMessagePayload", null);
        setTab("apps");
        setState("appsSubTab", "games");
        streamStartParams = {
          operation: "start",
          scene: "game",
          inputType: "website",
          url: launch.viewerUrl,
        };
      }

      const streamPlan = await client.executeAutonomyPlan({
        plan: {
          id: "autonomous-live-stream-start",
          steps: [
            {
              id: "status-before",
              toolName: "STREAM_STATUS",
              params: { scope: "current" },
            },
            {
              id: "start",
              toolName: "STREAM_CONTROL",
              params: streamStartParams,
            },
            {
              id: "status-after",
              toolName: "STREAM_STATUS",
              params: { scope: "current" },
            },
          ],
        },
        request: { source: "user", sourceTrust: 1 },
        options: { stopOnFailure: false },
      });

      const finalStatus = summarizeStreamState(
        findLastToolEnvelope(streamPlan.results, "STREAM_STATUS"),
      );
      if (!(streamPlan.allSucceeded || finalStatus.live)) {
        setActionNotice(
          "Autonomous launch started, but stream status needs verification.",
          "info",
          3600,
        );
      } else {
        setActionNotice(
          `Autonomous stream started. State: ${finalStatus.label}.`,
          "success",
          3000,
        );
      }

      const prompt = buildAutonomousPrompt({
        mode: autoRunMode,
        topic: autoRunTopic,
        durationMin: autoRunDurationMin,
        gameTitle,
      });
      setState("chatInput", prompt);
      setTimeout(() => void handleChatSend("power"), 30);
      setAutoRunOpen(false);
    } catch (err) {
      setActionNotice(
        `Autonomous live launch failed: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        4200,
      );
    } finally {
      setAutoRunLaunching(false);
    }
  }, [
    chatSending,
    autoRunLaunching,
    hasPluginRegistration,
    setActionNotice,
    setTab,
    resolveLayerStatus,
    autoRunPreview,
    runAutonomousEstimate,
    autoRunMode,
    selectPreferredGameId,
    setState,
    DEFAULT_GAME_SANDBOX,
    buildAutonomousPrompt,
    autoRunTopic,
    autoRunDurationMin,
    handleChatSend,
  ]);

  useEffect(() => {
    const onQuickLayerRun = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{ layerId?: string }>;
      const layerId = event.detail?.layerId;
      if (typeof layerId !== "string" || layerId.trim().length === 0) return;
      const layer = quickLayerById.get(layerId);
      if (!layer) return;
      void triggerQuickLayer(layer);
    };

    window.addEventListener("milaidy:quick-layer:run", onQuickLayerRun as EventListener);
    return () => {
      window.removeEventListener("milaidy:quick-layer:run", onQuickLayerRun as EventListener);
    };
  }, [quickLayerById, triggerQuickLayer]);

  const lastSpokenIdRef = useRef<string | null>(null);

  useEffect(() => {
    const lastAssistant = [...msgs]
      .reverse()
      .find((message) => message.role === "assistant" && message.text.trim());
    if (!lastAssistant || chatSending || agentVoiceMuted) return;
    if (lastAssistant.id === lastSpokenIdRef.current) return;
    lastSpokenIdRef.current = lastAssistant.id;
    voice.speak(lastAssistant.text);
  }, [msgs, chatSending, agentVoiceMuted, voice]);

  // Smooth auto-scroll while streaming and on new messages.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
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
      void handleChatSend(chatMode);
    }
  };
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
      {(showQuickLayersInChat || autoRunOpen) && (
        <>
          {showQuickLayersInChat && (
            <div className="flex flex-wrap items-center gap-1.5 pb-2 relative" style={{ zIndex: 1 }}>
              <span className="text-[10px] uppercase tracking-wide text-muted pr-1">
                Action layers
              </span>
              {quickLayers.map((layer) => {
                const status = resolveLayerStatus(layer.pluginIds);
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
                    onClick={() => void triggerQuickLayer(layer)}
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

          {autoRunOpen && (
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
                  onClick={() => setAutoRunOpen(false)}
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
                    onChange={(e) => setAutoRunMode(e.target.value as Five55AutonomyMode)}
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
                      setAutoRunDurationMin(next);
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
                    onChange={(e) => setAutoRunTopic(e.target.value)}
                    disabled={autoRunPreviewBusy || autoRunLaunching}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">Avatar Runtime</span>
                  <select
                    className="px-2 py-1 border rounded border-border bg-card text-txt"
                    value={autoRunAvatarRuntime}
                    onChange={(e) =>
                      setAutoRunAvatarRuntime(
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

      <div ref={messagesRef} className="flex-1 overflow-y-auto py-2 relative" style={{ zIndex: 1 }}>
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
                        {isUser ? "You" : agentName}
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
            onClick={() => setTab("actions")}
            title="Open Actions tab"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </button>

          {/* Show / hide avatar */}
          <button
            className={`w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all bg-card ${
              avatarVisible
                ? "border-accent text-accent"
                : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
            onClick={() => setAvatarVisible((v) => !v)}
            title={avatarVisible ? "Hide avatar" : "Show avatar"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
              {!avatarVisible && <line x1="3" y1="3" x2="21" y2="21" />}
            </svg>
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
            title={agentVoiceMuted ? "Unmute agent voice" : "Mute agent voice"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              {agentVoiceMuted ? (
                <line x1="23" y1="9" x2="17" y2="15" />
              ) : (
                <>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
              {agentVoiceMuted && <line x1="17" y1="9" x2="23" y2="15" />}
            </svg>
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
            title={voice.isListening ? "Stop listening" : "Voice input"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={voice.isListening ? "currentColor" : "none"} stroke="currentColor" strokeWidth={voice.isListening ? "0" : "2"}>
              {voice.isListening ? (
                <>
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </>
              ) : (
                <>
                  <path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </>
              )}
            </svg>
          </button>
        )}

        {/* Textarea / live transcript */}
        {voice.isListening && voice.interimTranscript ? (
          <div className="flex-1 px-3 py-2 border border-accent bg-card text-txt text-sm font-body leading-relaxed min-h-[38px] flex items-center">
            <span className="text-muted italic">{voice.interimTranscript}</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="flex-1 px-3 py-2 border border-border bg-card text-txt text-sm font-body leading-relaxed resize-none overflow-y-hidden min-h-[38px] max-h-[200px] focus:border-accent focus:outline-none"
            rows={1}
            placeholder={voice.isListening ? "Listening..." : "Type a message..."}
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
            onClick={() => void handleChatSend(chatMode)}
            disabled={chatSending}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
});

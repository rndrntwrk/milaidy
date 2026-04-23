import {
  client,
  isApiError,
  type AliceOperatorActionName,
  type AliceOperatorActionResult,
  type AliceOperatorPlanResponse,
  type EmoteInfo,
  type HyperscapeEmbeddedAgent,
  type HyperscapeQuickCommand,
} from "@miladyai/app-core/api";
import { useDocumentVisibility } from "@miladyai/app-core/hooks";
import { useApp } from "@miladyai/app-core/state";
import { playAppEmote, stopAppEmote } from "../../utils/app-emote-runtime";
import {
  ALICE_AVATAR_INDEX,
  getPinnedStageEmotes,
  groupStageEmotes,
} from "./alice-operator-catalog";
import {
  isStream555PrimaryPlugin,
  titleForStream555LaunchMode,
  type Stream555LaunchMode,
} from "./stream555-setup";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ALICE_ARCADE_PLUGIN_IDS = new Set(["five55-games"]);
const HYPERSCAPE_PLUGIN_IDS = new Set(["hyperscape"]);

export type AliceGoLiveLaunchResult = {
  state: "success" | "partial" | "blocked" | "failed";
  tone: "success" | "warning" | "error";
  message: string;
  followUp?: {
    label: string;
    detail: string;
  };
};

function normalizePluginId(rawId: string) {
  return rawId
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/^plugin-/, "");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getArcadeGameLabel(game: {
  id: string;
  name?: string | null;
  title?: string | null;
  label?: string | null;
}) {
  return [game.title, game.label, game.name, game.id].find(
    (candidate) =>
      typeof candidate === "string" && candidate.trim().length > 0,
  ) as string;
}

function choosePrimaryHyperscapeAgent(
  agents: HyperscapeEmbeddedAgent[],
): HyperscapeEmbeddedAgent | null {
  if (agents.length === 0) return null;
  return (
    agents.find((agent) =>
      ["running", "active", "ready", "in_world", "streaming"].includes(
        agent.state.toLowerCase(),
      ),
    ) ??
    agents[0] ??
    null
  );
}

type StreamStatusSnapshot = Awaited<ReturnType<typeof client.streamStatus>>;
type StreamStatusRefreshResult = {
  status: StreamStatusSnapshot | null;
  error: string | null;
};

function getPhaseLabel(
  phase: string | null | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (phase) {
    case "live":
      return t("aliceoperator.phaseLive", { defaultValue: "Live" });
    case "playing":
      return t("aliceoperator.phasePlaying", { defaultValue: "Playing" });
    case "broadcasting":
      return t("aliceoperator.phaseBroadcasting", {
        defaultValue: "Broadcasting",
      });
    default:
      return t("aliceoperator.phaseReady", { defaultValue: "Ready" });
  }
}

function layoutModeForLaunchMode(
  mode: Stream555LaunchMode,
): "camera-full" | "camera-hold" {
  return mode === "screen-share" || mode === "play-games"
    ? "camera-hold"
    : "camera-full";
}

function selectedResult(
  response: AliceOperatorPlanResponse,
  action: AliceOperatorActionName,
): AliceOperatorActionResult | null {
  return (
    response.results.find((entry) => entry.action === action) ?? null
  );
}

function actionDidSucceed(
  response: AliceOperatorPlanResponse,
  action: AliceOperatorActionName,
) {
  return selectedResult(response, action)?.success === true;
}

function actionMessage(
  response: AliceOperatorPlanResponse,
  action: AliceOperatorActionName,
  fallback: string,
) {
  return selectedResult(response, action)?.message ?? fallback;
}

function actionData<T = Record<string, unknown>>(
  response: AliceOperatorPlanResponse,
  action: AliceOperatorActionName,
): T | null {
  const data = selectedResult(response, action)?.data;
  return data != null ? (data as T) : null;
}

function isSegmentModeUnavailableFailure(message: string | null | undefined) {
  if (!message) return false;
  return /segment orchestration|segment|not available|not configured/i.test(
    message,
  );
}

export function useCompanionStageOperator() {
  const {
    plugins = [],
    selectedVrmIndex,
    logConversationOperatorAction,
    setActionNotice,
    setTab,
    switchShellView,
    t,
  } = useApp();
  const docVisible = useDocumentVisibility();

  const isAliceActive = selectedVrmIndex === ALICE_AVATAR_INDEX;

  const [streamAvailable, setStreamAvailable] = useState(true);
  const [streamCapabilityPresent, setStreamCapabilityPresent] = useState(false);
  const [streamCapabilityResolved, setStreamCapabilityResolved] = useState(false);
  const [streamLive, setStreamLive] = useState(false);
  const [streamDegraded, setStreamDegraded] = useState(false);
  const [streamStarting, setStreamStarting] = useState(false);
  const [streamState, setStreamState] = useState("idle");
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [uptime, setUptime] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [destinationsLoading, setDestinationsLoading] = useState(false);
  const [destinations, setDestinations] = useState<Array<{ id: string; name: string }>>([]);
  const [activeDestination, setActiveDestination] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const streamLoadingRef = useRef(false);

  const [games, setGames] = useState<
    Array<{ id: string; name?: string; title?: string; label?: string }>
  >([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<{
    sessionId: string | null;
    activeGameId: string | null;
    activeGameLabel: string | null;
    mode: string | null;
    phase: string | null;
    live: boolean;
    destination: string | null | { id: string; name: string };
  } | null>(null);

  const [hyperscapeAgent, setHyperscapeAgent] =
    useState<HyperscapeEmbeddedAgent | null>(null);
  const [hyperscapeQuickCommands, setHyperscapeQuickCommands] = useState<
    HyperscapeQuickCommand[]
  >([]);
  const [hyperscapeGoal, setHyperscapeGoal] = useState<string | null>(null);
  const [hyperscapeLoading, setHyperscapeLoading] = useState(false);
  const [hyperscapeAvailable, setHyperscapeAvailable] = useState(true);
  const [hyperscapeError, setHyperscapeError] = useState<string | null>(null);

  const [emotes, setEmotes] = useState<EmoteInfo[]>([]);
  const [emotesLoading, setEmotesLoading] = useState(false);
  const [emotesError, setEmotesError] = useState<string | null>(null);
  const [activeEmoteId, setActiveEmoteId] = useState<string | null>(null);
  const emoteResetTimerRef = useRef<number | null>(null);

  const arcadeRuntimeAvailable = useMemo(
    () =>
      plugins.some((plugin) => {
        const normalized = normalizePluginId(plugin.id);
        return (
          ALICE_ARCADE_PLUGIN_IDS.has(normalized) &&
          (plugin.isActive ?? plugin.enabled)
        );
      }),
    [plugins],
  );

  const hyperscapeRuntimeAvailable = useMemo(
    () =>
      plugins.some((plugin) => {
        const normalized = normalizePluginId(plugin.id);
        return (
          HYPERSCAPE_PLUGIN_IDS.has(normalized) &&
          (plugin.isActive ?? plugin.enabled)
        );
      }),
    [plugins],
  );

  const streamPluginPresent = useMemo(
    () =>
      plugins.some(
        (plugin) =>
          isStream555PrimaryPlugin(plugin) && (plugin.enabled || plugin.isActive),
      ),
    [plugins],
  );

  const selectedGameLabel = useMemo(() => {
    const selected =
      games.find((game) => game.id === selectedGameId) ??
      games.find((game) => game.id === gameState?.activeGameId);
    return (
      (selected ? getArcadeGameLabel(selected) : null) ??
      gameState?.activeGameLabel ??
      t("aliceoperator.noGameSelected", {
        defaultValue: "No game selected",
      })
    );
  }, [gameState?.activeGameId, gameState?.activeGameLabel, games, selectedGameId, t]);

  const activeQuickCommands = useMemo(
    () => hyperscapeQuickCommands.filter((command) => command.available),
    [hyperscapeQuickCommands],
  );

  const pinnedEmotes = useMemo(() => getPinnedStageEmotes(emotes), [emotes]);
  const emoteGroups = useMemo(() => groupStageEmotes(emotes), [emotes]);

  const clearPendingEmoteReset = useCallback(() => {
    if (emoteResetTimerRef.current != null) {
      window.clearTimeout(emoteResetTimerRef.current);
      emoteResetTimerRef.current = null;
    }
  }, []);

  const scheduleActiveEmoteReset = useCallback(
    (detail: { emoteId: string; duration: number; loop: boolean }) => {
      clearPendingEmoteReset();
      if (detail.loop) return;
      const timeoutMs = Math.max(0, Math.round(detail.duration * 1000) + 450);
      emoteResetTimerRef.current = window.setTimeout(() => {
        emoteResetTimerRef.current = null;
        setActiveEmoteId((current) =>
          current === detail.emoteId ? null : current,
        );
      }, timeoutMs);
    },
    [clearPendingEmoteReset],
  );

  const refreshStreamStatus = useCallback(
    async ({
      force = false,
    }: {
      force?: boolean;
    } = {}): Promise<StreamStatusRefreshResult> => {
      if (streamLoadingRef.current && !force) {
        return { status: null, error: null };
      }
      try {
        const status = await client.streamStatus();
        // The server normalizes `state` to a closed 4-bucket union
        // (idle | starting | live | degraded) before returning — any
        // unknown upstream phase is mapped to "degraded" there, not
        // passed through. We still handle `state` being absent or
        // (defensively) something other than the known values: any
        // running-but-unclassified case falls through to "degraded",
        // matching the server's safe-fallback policy.
        const rawState =
          typeof status.state === "string" && status.state.trim().length > 0
            ? status.state.trim().toLowerCase()
            : status.running
              ? status.ffmpegAlive
                ? "live"
                : "starting"
              : "idle";
        const isRunning = status.running === true;
        // Contract: isStarting / isLive / isDegraded are strictly mutually
        // exclusive and together cover every running state. isLive requires
        // BOTH the server to say "live" AND the client's ffmpegAlive check
        // to agree — if the distributor reports live but no platform is
        // actually delivering, we surface DEGRADED rather than lying with
        // a green LIVE button. Any running state that isn't live and isn't
        // starting is degraded — covers known "degraded" plus any string
        // we didn't anticipate.
        const isStarting = isRunning && rawState === "starting";
        const isLive =
          isRunning && rawState === "live" && status.ffmpegAlive === true;
        const isDegraded = isRunning && !isStarting && !isLive;
        const nextState = !isRunning
          ? "idle"
          : isLive
            ? "live"
            : isStarting
              ? "starting"
              : "degraded";
        const nextStarting = isStarting;
        const nextDegraded = isDegraded;
        const nextLive = isLive;
        setStreamCapabilityPresent(true);
        setStreamCapabilityResolved(true);
        setStreamAvailable(true);
        setStreamError(null);
        setStreamLive(nextLive);
        setStreamDegraded(nextDegraded);
        setStreamStarting(nextStarting);
        setStreamState(nextState);
        setUptime(status.uptime ?? 0);
        setFrameCount(status.frameCount ?? 0);
        setActiveDestination(status.destination ?? null);
        return { status, error: null };
      } catch (err) {
        if (isApiError(err) && err.status === 404) {
          setStreamCapabilityPresent(false);
          setStreamCapabilityResolved(true);
          setStreamAvailable(false);
          setStreamError(null);
          setStreamLive(false);
          setStreamDegraded(false);
          setStreamStarting(false);
          setStreamState("idle");
          return { status: null, error: null };
        }
        const errorMessage =
          err instanceof Error
            ? err.message
            : t("aliceoperator.streamStatusFailed", {
                defaultValue: "Stream status is temporarily unavailable.",
              });
        setStreamCapabilityPresent(true);
        setStreamCapabilityResolved(true);
        setStreamAvailable(true);
        setStreamError(errorMessage);
        setStreamLive(false);
        setStreamDegraded(false);
        setStreamStarting(false);
        setStreamState("error");
        return { status: null, error: errorMessage };
      }
    },
    [t],
  );

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (!mounted || !docVisible || !streamAvailable || !isAliceActive) return;
      await refreshStreamStatus();
    };
    void poll();
    if (!docVisible || !streamAvailable || !isAliceActive) {
      return () => {
        mounted = false;
      };
    }
    const id = window.setInterval(() => {
      void poll();
    }, 5_000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, [docVisible, isAliceActive, refreshStreamStatus, streamAvailable]);

  const refreshStreamDestinations = useCallback(async () => {
    setDestinationsLoading(true);
    try {
      const list = await client.getStreamingDestinations();
      const nextDestinations = Array.isArray(list?.destinations)
        ? list.destinations
        : [];
      setDestinations(nextDestinations);
      setActiveDestination((current) => current ?? nextDestinations[0] ?? null);
    } catch {
      setDestinations([]);
      setActiveDestination(null);
    } finally {
      setDestinationsLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadDestinations = async () => {
      if (!streamAvailable || !isAliceActive) return;
      try {
        setDestinationsLoading(true);
        const list = await client.getStreamingDestinations();
        if (!mounted) return;
        const nextDestinations = Array.isArray(list?.destinations)
          ? list.destinations
          : [];
        setStreamCapabilityPresent(true);
        setStreamCapabilityResolved(true);
        setDestinations(nextDestinations);
        setActiveDestination((current) => current ?? nextDestinations[0] ?? null);
      } catch {
        if (!mounted) return;
        setDestinations([]);
        setActiveDestination(null);
      } finally {
        if (mounted) setDestinationsLoading(false);
      }
    };
    void loadDestinations();
    return () => {
      mounted = false;
    };
  }, [isAliceActive, streamAvailable]);

  const loadCatalog = useCallback(async () => {
    if (!arcadeRuntimeAvailable || !isAliceActive) return;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await client.getArcade555GamesCatalog({
        includeBeta: true,
      });
      const nextGames = Array.isArray(response.games) ? response.games : [];
      setGames(nextGames);
      setSelectedGameId((current) => {
        if (current && nextGames.some((game) => game.id === current)) {
          return current;
        }
        if (
          gameState?.activeGameId &&
          nextGames.some((game) => game.id === gameState.activeGameId)
        ) {
          return gameState.activeGameId;
        }
        return nextGames[0]?.id ?? "";
      });
    } catch (err) {
      setCatalogError(
        err instanceof Error
          ? err.message
          : t("aliceoperator.catalogLoadFailed", {
              defaultValue: "Failed to load the Alice arcade catalog.",
            }),
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [arcadeRuntimeAvailable, gameState?.activeGameId, isAliceActive, t]);

  const loadGameState = useCallback(async () => {
    if (!arcadeRuntimeAvailable || !isAliceActive) return;
    setStateLoading(true);
    setStateError(null);
    try {
      const response = await client.getArcade555GameState();
      setGameState(response);
      setSelectedGameId((current) => current || response.activeGameId || current);
    } catch (err) {
      setStateError(
        err instanceof Error
          ? err.message
          : t("aliceoperator.stateLoadFailed", {
              defaultValue: "Failed to load Alice arcade session state.",
            }),
      );
    } finally {
      setStateLoading(false);
    }
  }, [arcadeRuntimeAvailable, isAliceActive, t]);

  useEffect(() => {
    if (!arcadeRuntimeAvailable || !isAliceActive) return;
    void Promise.all([loadCatalog(), loadGameState()]);
  }, [arcadeRuntimeAvailable, isAliceActive, loadCatalog, loadGameState]);

  const refreshHyperscape = useCallback(async () => {
    if (!isAliceActive || !hyperscapeRuntimeAvailable) {
      setHyperscapeAvailable(false);
      setHyperscapeAgent(null);
      setHyperscapeQuickCommands([]);
      setHyperscapeGoal(null);
      setHyperscapeError(null);
      setHyperscapeLoading(false);
      return;
    }
    setHyperscapeLoading(true);
    setHyperscapeError(null);
    try {
      const response = await client.listHyperscapeEmbeddedAgents();
      const nextAgent = choosePrimaryHyperscapeAgent(response?.agents ?? []);
      setHyperscapeAvailable(true);
      setHyperscapeAgent(nextAgent);
      if (!nextAgent) {
        setHyperscapeQuickCommands([]);
        setHyperscapeGoal(null);
        return;
      }
      const [goalResponse, quickResponse] = await Promise.all([
        client.getHyperscapeAgentGoal(nextAgent.agentId),
        client.getHyperscapeAgentQuickActions(nextAgent.agentId),
      ]);
      setHyperscapeGoal(goalResponse.goal?.description ?? null);
      setHyperscapeQuickCommands(quickResponse.quickCommands ?? []);
    } catch (err) {
      if (isApiError(err) && err.status === 404) {
        setHyperscapeAvailable(false);
        setHyperscapeError(null);
      } else {
        setHyperscapeAvailable(true);
        setHyperscapeError(err instanceof Error ? err.message : null);
      }
      setHyperscapeAgent(null);
      setHyperscapeQuickCommands([]);
      setHyperscapeGoal(null);
    } finally {
      setHyperscapeLoading(false);
    }
  }, [hyperscapeRuntimeAvailable, isAliceActive]);

  useEffect(() => {
    if (!isAliceActive) return;
    void refreshHyperscape();
  }, [isAliceActive, refreshHyperscape]);

  const refreshEmotes = useCallback(async () => {
    if (!isAliceActive) return;
    setEmotesLoading(true);
    setEmotesError(null);
    try {
      const response = await client.getEmotes();
      setEmotes(Array.isArray(response.emotes) ? response.emotes : []);
    } catch (err) {
      setEmotesError(err instanceof Error ? err.message : "Failed to load motions.");
      setEmotes([]);
    } finally {
      setEmotesLoading(false);
    }
  }, [isAliceActive]);

  useEffect(() => {
    if (!isAliceActive) return;
    void refreshEmotes();
  }, [isAliceActive, refreshEmotes]);

  useEffect(
    () => () => {
      clearPendingEmoteReset();
    },
    [clearPendingEmoteReset],
  );

  const executePlan = useCallback(
    async (steps: Array<{ id?: string; action: AliceOperatorActionName; params?: Record<string, unknown> }>, stopOnFailure = true) => {
      return client.executeAliceOperatorPlan({ steps, stopOnFailure });
    },
    [],
  );

  const recordOperatorAction = useCallback(
    async (payload: {
      label: string;
      kind: "stream" | "avatar" | "launch";
      detail?: string;
      fallbackText?: string;
    }) => {
      try {
        await logConversationOperatorAction(payload);
      } catch {
        // Action execution should proceed even if transcript logging fails.
      }
    },
    [logConversationOperatorAction],
  );

  const runBridgeAction = useCallback(
    async (
      action: AliceOperatorActionName,
      params: Record<string, unknown> | undefined,
      fallbackMessage: string,
    ) => {
      const response = await executePlan([{ action, params }], true);
      const result = selectedResult(response, action);
      if (!result?.success) {
        throw new Error(result?.message || fallbackMessage);
      }
      return result;
    },
    [executePlan],
  );

  const performGuidedGoLive = useCallback(
    async (config: {
      channels: string[];
      launchMode: Stream555LaunchMode;
      selectedGameId?: string | null;
    }): Promise<AliceGoLiveLaunchResult> => {
      const selectedChannels = Array.from(
        new Set(config.channels.map((entry) => entry.trim().toLowerCase()).filter(Boolean)),
      );
      const destinationPlatforms = selectedChannels.join(",");
      const layoutMode = layoutModeForLaunchMode(config.launchMode);
      const blocked = (
        message: string,
        tone: AliceGoLiveLaunchResult["tone"] = "warning",
      ): AliceGoLiveLaunchResult => ({
        state: "blocked",
        tone,
        message,
      });
      const failed = (message: string): AliceGoLiveLaunchResult => ({
        state: "failed",
        tone: "error",
        message,
      });
      const success = (message: string): AliceGoLiveLaunchResult => ({
        state: "success",
        tone: "success",
        message,
      });
      const partial = (
        message: string,
        label: string,
        detail: string,
      ): AliceGoLiveLaunchResult => ({
        state: "partial",
        tone: "warning",
        message,
        followUp: { label, detail },
      });

      if (!streamPluginPresent && !streamCapabilityPresent) {
        return blocked(
          t("aliceoperator.streamMissing", {
            defaultValue: "555 Stream is not available on this runtime.",
          }),
        );
      }
      if (selectedChannels.length === 0) {
        return blocked(
          t("aliceoperator.selectChannels", {
            defaultValue: "Select at least one ready channel for this launch.",
          }),
        );
      }

      try {
        await recordOperatorAction({
          label: titleForStream555LaunchMode(config.launchMode, t),
          kind: "launch",
          detail:
            config.launchMode === "play-games" && selectedGameLabel
              ? `${selectedGameLabel} · ${selectedChannels.join(", ")}`
              : selectedChannels.join(", "),
          fallbackText: titleForStream555LaunchMode(config.launchMode, t),
        });

        if (config.launchMode === "camera") {
          const response = await executePlan(
            [
              {
                id: "go-live",
                action: "STREAM555_GO_LIVE",
                params: {
                  inputType: "avatar",
                  layoutMode,
                  destinationPlatforms,
                  applyDestinations: true,
                  avatarIdentity: "alice",
                },
              },
            ],
            true,
          );
          if (!actionDidSucceed(response, "STREAM555_GO_LIVE")) {
            return failed(
              actionMessage(
                response,
                "STREAM555_GO_LIVE",
                t("aliceoperator.cameraLaunchFailed", {
                  defaultValue: "Camera launch failed.",
                }),
              ),
            );
          }
          // STREAM555_GO_LIVE already waits for Cloudflare readiness on the
          // control-plane path; a second local delivery poll only adds lag.
          const refreshed = await refreshStreamStatus({ force: true });
          if (refreshed.error) {
            return failed(refreshed.error);
          }
          if (!refreshed.status?.running || !refreshed.status.ffmpegAlive) {
            return partial(
              t("aliceoperator.cameraLaunchPending", {
                defaultValue:
                  "Camera launch started, but delivery is still warming up.",
              }),
              t("aliceoperator.deliveryStatus", {
                defaultValue: "Delivery status",
              }),
              t("aliceoperator.deliveryPending", {
                defaultValue: "Stream delivery has not reached live state yet.",
              }),
            );
          }
          return success(
            t("aliceoperator.cameraLive", {
              defaultValue: "Camera is live and delivering.",
            }),
          );
        }

        if (config.launchMode === "radio") {
          const response = await executePlan(
            [
              {
                id: "go-live",
                action: "STREAM555_GO_LIVE",
                params: {
                  inputType: "radio",
                  layoutMode,
                  destinationPlatforms,
                  applyDestinations: true,
                },
              },
              {
                id: "radio-mode",
                action: "STREAM555_RADIO_CONTROL",
                params: { action: "setAutoDJMode", mode: "MUSIC" },
              },
            ],
            false,
          );
          if (
            actionDidSucceed(response, "STREAM555_GO_LIVE") &&
            actionDidSucceed(response, "STREAM555_RADIO_CONTROL")
          ) {
            await refreshStreamStatus();
            return success(
              t("aliceoperator.radioLive", {
                defaultValue: "Lo-fi radio is live.",
              }),
            );
          }
          return failed(
            actionMessage(
              response,
              "STREAM555_GO_LIVE",
              t("aliceoperator.radioLaunchFailed", {
                defaultValue: "Lo-fi radio launch failed.",
              }),
            ),
          );
        }

        if (config.launchMode === "screen-share") {
          const response = await executePlan(
            [
              {
                id: "screen-share",
                action: "STREAM555_SCREEN_SHARE",
                params: { sceneId: "active-pip" },
              },
              {
                id: "destinations-apply",
                action: "STREAM555_DESTINATIONS_APPLY",
                params: { platforms: destinationPlatforms },
              },
            ],
            false,
          );
          if (!actionDidSucceed(response, "STREAM555_SCREEN_SHARE")) {
            return failed(
              actionMessage(
                response,
                "STREAM555_SCREEN_SHARE",
                t("aliceoperator.screenShareFailed", {
                  defaultValue: "Screen share launch failed.",
                }),
              ),
            );
          }
          await refreshStreamStatus();
          if (actionDidSucceed(response, "STREAM555_DESTINATIONS_APPLY")) {
            return success(
              t("aliceoperator.screenShareLive", {
                defaultValue: "Screen share is live.",
              }),
            );
          }
          const attachFailure = actionMessage(
            response,
            "STREAM555_DESTINATIONS_APPLY",
            t("aliceoperator.destinationAttachFailed", {
              defaultValue: "Destination attach failed.",
            }),
          );
          return partial(
            t("aliceoperator.screenSharePartial", {
              defaultValue:
                "Screen share started, but destination attach still needs follow-up.",
            }),
            t("aliceoperator.attachDestinations", {
              defaultValue: "Attach selected destinations",
            }),
            attachFailure,
          );
        }

        if (config.launchMode === "reaction") {
          const response = await executePlan(
            [
              {
                id: "go-live",
                action: "STREAM555_GO_LIVE",
                params: {
                  inputType: "avatar",
                  layoutMode,
                  destinationPlatforms,
                  applyDestinations: true,
                  avatarIdentity: "alice",
                },
              },
              {
                id: "segment-bootstrap",
                action: "STREAM555_GO_LIVE_SEGMENTS",
                params: {
                  segmentIntent: "reaction",
                  segmentTypes: "reaction,analysis",
                },
              },
              {
                id: "segment-override",
                action: "STREAM555_SEGMENT_OVERRIDE",
                params: {
                  segmentType: "reaction",
                  reason: "guided launch reaction mode",
                },
              },
            ],
            false,
          );
          if (
            actionDidSucceed(response, "STREAM555_GO_LIVE") &&
            actionDidSucceed(response, "STREAM555_GO_LIVE_SEGMENTS") &&
            actionDidSucceed(response, "STREAM555_SEGMENT_OVERRIDE")
          ) {
            await refreshStreamStatus();
            return success(
              t("aliceoperator.reactionLive", {
                defaultValue: "Reaction mode is live.",
              }),
            );
          }
          if (actionDidSucceed(response, "STREAM555_GO_LIVE")) {
            const bootstrapFailure = actionDidSucceed(response, "STREAM555_GO_LIVE_SEGMENTS")
              ? null
              : actionMessage(
                  response,
                  "STREAM555_GO_LIVE_SEGMENTS",
                  "Reaction segment bootstrap failed.",
                );
            const overrideFailure = actionDidSucceed(response, "STREAM555_SEGMENT_OVERRIDE")
              ? null
              : actionMessage(
                  response,
                  "STREAM555_SEGMENT_OVERRIDE",
                  "Reaction segment override failed.",
                );
            await executePlan([{ action: "STREAM555_END_LIVE", params: {} }], false);
            if (bootstrapFailure && isSegmentModeUnavailableFailure(bootstrapFailure)) {
              return blocked(
                t("aliceoperator.reactionBlocked", {
                  defaultValue:
                    "Reaction launch requires segment orchestration on the current runtime.",
                }),
                "error",
              );
            }
            return failed(
              [bootstrapFailure, overrideFailure].filter(Boolean).join(" "),
            );
          }
          return failed(
            actionMessage(
              response,
              "STREAM555_GO_LIVE",
              t("aliceoperator.reactionFailed", {
                defaultValue: "Reaction launch failed.",
              }),
            ),
          );
        }

        if (config.launchMode === "play-games") {
          const gameId =
            config.selectedGameId?.trim() ||
            selectedGameId.trim() ||
            gameState?.activeGameId ||
            "";
          if (!gameId) {
            return blocked(
              t("aliceoperator.chooseGameFirst", {
                defaultValue: "Choose an Alice arcade game first.",
              }),
            );
          }
          const response = await executePlan(
            [
              {
                id: "go-live-play",
                action: "FIVE55_GAMES_GO_LIVE_PLAY",
                params: { gameId, mode: "agent" },
              },
            ],
            true,
          );
          if (!actionDidSucceed(response, "FIVE55_GAMES_GO_LIVE_PLAY")) {
            return failed(
              actionMessage(
                response,
                "FIVE55_GAMES_GO_LIVE_PLAY",
                t("aliceoperator.goLivePlayFailed", {
                  defaultValue: "Go live + play failed.",
                }),
              ),
            );
          }
          await Promise.all([refreshStreamStatus(), loadGameState()]);
          return success(
            t("aliceoperator.goLivePlayStarted", {
              defaultValue: "Alice went live and started the selected game.",
            }),
          );
        }

        return blocked(
          t("aliceoperator.modeUnavailable", {
            defaultValue: "This launch mode is not available yet.",
          }),
        );
      } catch (err) {
        return failed(
          err instanceof Error
            ? err.message
            : t("aliceoperator.goLiveFailed", {
                defaultValue: "Go-live launch failed.",
              }),
        );
      }
    },
    [
      executePlan,
      gameState?.activeGameId,
      loadGameState,
      recordOperatorAction,
      refreshStreamStatus,
      selectedGameId,
      selectedGameLabel,
      streamCapabilityPresent,
      streamPluginPresent,
      t,
    ],
  );

  const requireSelectedGameId = useCallback(() => {
    const value = selectedGameId.trim();
    if (value) return value;
    setActionNotice(
      t("aliceoperator.chooseGameFirst", {
        defaultValue: "Choose an Alice arcade game first.",
      }),
      "error",
      3200,
    );
    return null;
  }, [selectedGameId, setActionNotice, t]);

  const runArcadeAction = useCallback(
    async (
      action: string,
      execute: () => Promise<{ ok?: boolean; error?: string }>,
      fallbackMessage: string,
    ) => {
      setBusyAction(action);
      try {
        const response = await execute();
        if (response.ok === false) {
          throw new Error(response.error || fallbackMessage);
        }
        await loadGameState();
      } catch (err) {
        const message = err instanceof Error ? err.message : fallbackMessage;
        setActionNotice(message, "error", 3600);
      } finally {
        setBusyAction(null);
      }
    },
    [loadGameState, setActionNotice],
  );

  const startSelectedGame = useCallback(async () => {
    const gameId = requireSelectedGameId();
    if (!gameId) return;
    await recordOperatorAction({
      label: t("aliceoperator.startWithAlice", {
        defaultValue: "Start with Alice",
      }),
      kind: "launch",
      detail: selectedGameLabel,
      fallbackText: selectedGameLabel,
    });
    await runArcadeAction(
      "start",
      () => client.playArcade555Game({ gameId }),
      t("aliceoperator.playFailed", {
        defaultValue: "Failed to start the selected Alice arcade game.",
      }),
    );
  }, [recordOperatorAction, requireSelectedGameId, runArcadeAction, selectedGameLabel, t]);

  const switchSelectedGame = useCallback(async () => {
    const gameId = requireSelectedGameId();
    if (!gameId) return;
    await recordOperatorAction({
      label: t("aliceoperator.switchGame", {
        defaultValue: "Switch",
      }),
      kind: "launch",
      detail: selectedGameLabel,
      fallbackText: selectedGameLabel,
    });
    await runArcadeAction(
      "switch",
      () => client.switchArcade555Game({ gameId }),
      t("aliceoperator.switchFailed", {
        defaultValue: "Failed to switch the current Alice arcade game.",
      }),
    );
  }, [recordOperatorAction, requireSelectedGameId, runArcadeAction, selectedGameLabel, t]);

  const stopArcadeSession = useCallback(async () => {
    await recordOperatorAction({
      label: t("aliceoperator.stopSession", {
        defaultValue: "Stop Session",
      }),
      kind: "launch",
      fallbackText: t("aliceoperator.stopSession", {
        defaultValue: "Stop Session",
      }),
    });
    await runArcadeAction(
      "stop",
      () => client.stopArcade555Game(),
      t("aliceoperator.stopFailed", {
        defaultValue: "Failed to stop the Alice arcade session.",
      }),
    );
  }, [recordOperatorAction, runArcadeAction, t]);

  const goLiveAndPlay = useCallback(async () => {
    setBusyAction("go-live-play");
    try {
      const result = await performGuidedGoLive({
        channels:
          activeDestination?.id != null ? [activeDestination.id] : destinations.map((entry) => entry.id),
        launchMode: "play-games",
        selectedGameId,
      });
      setActionNotice(result.message, result.tone === "success" ? "success" : "error", 3800);
    } finally {
      setBusyAction(null);
    }
  }, [activeDestination?.id, destinations, performGuidedGoLive, selectedGameId, setActionNotice]);

  const runQuickCommand = useCallback(
    async (command: HyperscapeQuickCommand) => {
      if (!hyperscapeAgent || !command.available || busyAction) return;
      setBusyAction(`quick:${command.id}`);
      try {
        await recordOperatorAction({
          label: command.label,
          kind: "launch",
          detail: command.reason ?? command.command,
          fallbackText: command.label,
        });
        const response = await client.sendHyperscapeAgentMessage(
          hyperscapeAgent.agentId,
          command.command,
        );
        if (!response.success) {
          throw new Error(
            response.error ||
              response.message ||
              t("aliceoperator.quickCommandFailed", {
                defaultValue: "Failed to send the selected quick command.",
              }),
          );
        }
        setActionNotice(command.label, "success", 2200);
      } catch (err) {
        setActionNotice(
          err instanceof Error
            ? err.message
            : t("aliceoperator.quickCommandFailed", {
                defaultValue: "Failed to send the selected quick command.",
              }),
          "error",
          3200,
        );
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction, hyperscapeAgent, recordOperatorAction, setActionNotice, t],
  );

  const endLive = useCallback(async () => {
    setBusyAction("end-live");
    try {
      await recordOperatorAction({
        label: t("aliceoperator.action.endLive", {
          defaultValue: "End Live",
        }),
        kind: "stream",
        fallbackText: t("aliceoperator.action.endLive", {
          defaultValue: "End Live",
        }),
      });
      await runBridgeAction(
        "STREAM555_END_LIVE",
        {},
        t("aliceoperator.endLiveFailed", {
          defaultValue: "End-live failed.",
        }),
      );
      await refreshStreamStatus();
      setActionNotice(
        t("aliceoperator.endLiveSuccess", {
          defaultValue: "Alice ended the live session.",
        }),
        "success",
        3200,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : "End-live failed.",
        "error",
        3600,
      );
    } finally {
      setBusyAction(null);
    }
  }, [recordOperatorAction, refreshStreamStatus, runBridgeAction, setActionNotice, t]);

  const runLiveUtilityAction = useCallback(
    async (
      action: AliceOperatorActionName,
      params: Record<string, unknown> | undefined,
      label: string,
      successMessage: string,
      fallbackMessage: string,
    ) => {
      setBusyAction(action);
      try {
        await recordOperatorAction({
          label,
          kind: "stream",
          fallbackText: label,
        });
        const result = await runBridgeAction(action, params, fallbackMessage);
        setActionNotice(
          result.message || successMessage,
          "success",
          3200,
        );
      } catch (err) {
        setActionNotice(
          err instanceof Error ? err.message : fallbackMessage,
          "error",
          3600,
        );
      } finally {
        setBusyAction(null);
      }
    },
    [recordOperatorAction, runBridgeAction, setActionNotice],
  );

  const runScreenShareAction = useCallback(async () => {
    setBusyAction("STREAM555_SCREEN_SHARE");
    try {
      await recordOperatorAction({
        label: t("aliceoperator.action.screenShare", {
          defaultValue: "Screen Share",
        }),
        kind: "stream",
        fallbackText: t("aliceoperator.action.screenShare", {
          defaultValue: "Screen Share",
        }),
      });
      await runBridgeAction(
        "STREAM555_SCREEN_SHARE",
        { sceneId: "active-pip" },
        t("aliceoperator.screenShareFailed", {
          defaultValue: "Screen share launch failed.",
        }),
      );
      await refreshStreamStatus();
      setActionNotice(
        t("aliceoperator.screenShareLive", {
          defaultValue: "Screen share is live.",
        }),
        "success",
        3200,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error
          ? err.message
          : t("aliceoperator.screenShareFailed", {
              defaultValue: "Screen share launch failed.",
            }),
        "error",
        3600,
      );
    } finally {
      setBusyAction(null);
    }
  }, [recordOperatorAction, refreshStreamStatus, runBridgeAction, setActionNotice, t]);

  const runRadioAction = useCallback(async () => {
    setBusyAction("STREAM555_RADIO_CONTROL");
    try {
      await recordOperatorAction({
        label: t("aliceoperator.action.radio", {
          defaultValue: "Radio",
        }),
        kind: "stream",
        fallbackText: t("aliceoperator.action.radio", {
          defaultValue: "Radio",
        }),
      });
      await runBridgeAction(
        "STREAM555_RADIO_CONTROL",
        { action: "setAutoDJMode", mode: "MUSIC" },
        t("aliceoperator.radioLaunchFailed", {
          defaultValue: "Lo-fi radio launch failed.",
        }),
      );
      setActionNotice(
        t("aliceoperator.radioLive", {
          defaultValue: "Lo-fi radio is live.",
        }),
        "success",
        3200,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error
          ? err.message
          : t("aliceoperator.radioLaunchFailed", {
              defaultValue: "Lo-fi radio launch failed.",
            }),
        "error",
        3600,
      );
    } finally {
      setBusyAction(null);
    }
  }, [recordOperatorAction, runBridgeAction, setActionNotice, t]);

  const runReactionAction = useCallback(async () => {
    setBusyAction("STREAM555_GO_LIVE_SEGMENTS");
    try {
      await recordOperatorAction({
        label: t("aliceoperator.action.reaction", {
          defaultValue: "Reaction",
        }),
        kind: "stream",
        fallbackText: t("aliceoperator.action.reaction", {
          defaultValue: "Reaction",
        }),
      });
      const response = await executePlan(
        [
          {
            id: "segment-bootstrap",
            action: "STREAM555_GO_LIVE_SEGMENTS",
            params: {
              segmentIntent: "reaction",
              segmentTypes: "reaction,analysis",
            },
          },
          {
            id: "segment-override",
            action: "STREAM555_SEGMENT_OVERRIDE",
            params: {
              segmentType: "reaction",
              reason: "stage action reaction mode",
            },
          },
        ],
        false,
      );

      if (
        actionDidSucceed(response, "STREAM555_GO_LIVE_SEGMENTS") &&
        actionDidSucceed(response, "STREAM555_SEGMENT_OVERRIDE")
      ) {
        setActionNotice(
          t("aliceoperator.reactionLive", {
            defaultValue: "Reaction mode is live.",
          }),
          "success",
          3200,
        );
        return;
      }

      const bootstrapFailure = actionDidSucceed(
        response,
        "STREAM555_GO_LIVE_SEGMENTS",
      )
        ? null
        : actionMessage(
            response,
            "STREAM555_GO_LIVE_SEGMENTS",
            t("aliceoperator.reactionFailed", {
              defaultValue: "Reaction launch failed.",
            }),
          );
      const overrideFailure = actionDidSucceed(
        response,
        "STREAM555_SEGMENT_OVERRIDE",
      )
        ? null
        : actionMessage(
            response,
            "STREAM555_SEGMENT_OVERRIDE",
            t("aliceoperator.reactionFailed", {
              defaultValue: "Reaction launch failed.",
            }),
          );

      const failureMessage = [bootstrapFailure, overrideFailure]
        .filter(Boolean)
        .join(" ");

      setActionNotice(
        failureMessage ||
          t("aliceoperator.reactionFailed", {
            defaultValue: "Reaction launch failed.",
          }),
        "error",
        3600,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error
          ? err.message
          : t("aliceoperator.reactionFailed", {
              defaultValue: "Reaction launch failed.",
            }),
        "error",
        3600,
      );
    } finally {
      setBusyAction(null);
    }
  }, [executePlan, recordOperatorAction, setActionNotice, t]);

  const runAdsAction = useCallback(async () => {
    setBusyAction("STREAM555_AD_CREATE");
    try {
      await recordOperatorAction({
        label: t("aliceoperator.action.ads", {
          defaultValue: "Ads",
        }),
        kind: "stream",
        fallbackText: t("aliceoperator.action.ads", {
          defaultValue: "Ads",
        }),
      });
      const createResult = await runBridgeAction(
        "STREAM555_AD_CREATE",
        {},
        t("aliceoperator.adsFailed", {
          defaultValue: "Ad setup failed.",
        }),
      );
      const created = asRecord(createResult.data);
      const adId =
        typeof created?.adId === "string"
          ? created.adId
          : typeof created?.id === "string"
            ? created.id
            : null;
      if (adId) {
        await runBridgeAction(
          "STREAM555_AD_TRIGGER",
          { adId },
          t("aliceoperator.adsTriggerFailed", {
            defaultValue: "Ad trigger failed.",
          }),
        );
      }
      setActionNotice(
        t("aliceoperator.adsStarted", {
          defaultValue: "Ad flow dispatched.",
        }),
        "success",
        3200,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : "Ad setup failed.",
        "error",
        3600,
      );
    } finally {
      setBusyAction(null);
    }
  }, [recordOperatorAction, runBridgeAction, setActionNotice, t]);

  const playEmote = useCallback(async (emoteId: string) => {
    setBusyAction(`emote:${emoteId}`);
    try {
      const nextEmote = emotes.find((entry) => entry.id === emoteId);
      if (!nextEmote) {
        throw new Error(
          t("aliceoperator.motionUnavailable", {
            defaultValue: "Motion metadata is unavailable right now.",
          }),
        );
      }
      await recordOperatorAction({
        label: nextEmote.name,
        kind: "avatar",
        fallbackText: nextEmote.name,
      });
      clearPendingEmoteReset();
      setActiveEmoteId(emoteId);
      const detail = await playAppEmote(nextEmote, {
        showOverlay: false,
        singleCycle: true,
      });
      scheduleActiveEmoteReset(detail);
    } catch (err) {
      clearPendingEmoteReset();
      setActiveEmoteId(null);
      setActionNotice(
        err instanceof Error ? err.message : "Failed to play motion.",
        "error",
        3000,
      );
    } finally {
      setBusyAction(null);
    }
  }, [
    clearPendingEmoteReset,
    emotes,
    recordOperatorAction,
    scheduleActiveEmoteReset,
    setActionNotice,
    t,
  ]);

  const stopEmote = useCallback(() => {
    clearPendingEmoteReset();
    stopAppEmote();
    setActiveEmoteId(null);
    void recordOperatorAction({
      label: t("aliceoperator.action.stopMotion", {
        defaultValue: "Stop Motion",
      }),
      kind: "avatar",
      fallbackText: t("aliceoperator.action.stopMotion", {
        defaultValue: "Stop Motion",
      }),
    });
  }, [clearPendingEmoteReset, recordOperatorAction, t]);

  const openSwapSurface = useCallback(() => {
    void recordOperatorAction({
      label: t("aliceoperator.action.swap", {
        defaultValue: "Swap",
      }),
      kind: "launch",
      fallbackText: t("aliceoperator.action.swap", {
        defaultValue: "Swap",
      }),
    });
    switchShellView("desktop");
    setTab("wallets");
    setActionNotice(
      t("aliceoperator.swapSurfaceOpened", {
        defaultValue: "Opened wallets for swap operations.",
      }),
      "info",
      2600,
    );
  }, [recordOperatorAction, setActionNotice, setTab, switchShellView, t]);

  const openAutonomousRunSurface = useCallback(() => {
    void recordOperatorAction({
      label: t("aliceoperator.action.autonomousRun", {
        defaultValue: "Autonomous Run",
      }),
      kind: "launch",
      fallbackText: t("aliceoperator.action.autonomousRun", {
        defaultValue: "Autonomous Run",
      }),
    });
    switchShellView("desktop");
    setTab("chat");
    setActionNotice(
      t("aliceoperator.autonomousSurfaceOpened", {
        defaultValue: "Opened chat for autonomous operator workflows.",
      }),
      "info",
      2600,
    );
  }, [recordOperatorAction, setActionNotice, setTab, switchShellView, t]);

  return {
    isAliceActive,
    executePlan,
    performGuidedGoLive,
    stream: {
      available: streamAvailable,
      pluginPresent: streamPluginPresent,
      capabilityPresent: streamCapabilityPresent,
      capabilityResolved: streamCapabilityResolved,
      live: streamLive,
      degraded: streamDegraded,
      starting: streamStarting,
      state: streamState,
      loading: streamLoading,
      error: streamError,
      uptime,
      frameCount,
      destinations,
      destinationsLoading,
      activeDestination,
      refreshStatus: refreshStreamStatus,
      refreshDestinations: refreshStreamDestinations,
      endLive,
      runScreenShareAction,
      runRadioAction,
      runReactionAction,
      runAdsAction,
      runPipAction: () =>
        void runLiveUtilityAction(
          "STREAM555_PIP_ENABLE",
          {},
          t("aliceoperator.action.pip", {
            defaultValue: "PiP",
          }),
          t("aliceoperator.pipEnabled", {
            defaultValue: "PiP enabled.",
          }),
          t("aliceoperator.pipFailed", {
            defaultValue: "Failed to enable PiP.",
          }),
        ),
      runInviteGuestAction: () =>
        void runLiveUtilityAction(
          "STREAM555_GUEST_INVITE",
          {},
          t("aliceoperator.action.inviteGuest", {
            defaultValue: "Invite Guest",
          }),
          t("aliceoperator.inviteGuestCreated", {
            defaultValue: "Guest invite created.",
          }),
          t("aliceoperator.inviteGuestFailed", {
            defaultValue: "Failed to create guest invite.",
          }),
        ),
      runEarningsAction: () =>
        void runLiveUtilityAction(
          "STREAM555_EARNINGS_ESTIMATE",
          {},
          t("aliceoperator.action.earnings", {
            defaultValue: "Earnings",
          }),
          t("aliceoperator.earningsEstimated", {
            defaultValue: "Earnings estimate generated.",
          }),
          t("aliceoperator.earningsEstimateFailed", {
            defaultValue: "Failed to estimate earnings.",
          }),
        ),
    },
    arcade: {
      runtimeAvailable: arcadeRuntimeAvailable,
      games,
      selectedGameId,
      setSelectedGameId,
      selectedGameLabel,
      gameState,
      catalogLoading,
      stateLoading,
      busyAction,
      catalogError,
      stateError,
      refreshCatalog: loadCatalog,
      refreshState: loadGameState,
      startSelectedGame,
      switchSelectedGame,
      stopArcadeSession,
      goLiveAndPlay,
      phaseLabel: getPhaseLabel(gameState?.phase, t),
    },
    hyperscape: {
      available: hyperscapeAvailable,
      loading: hyperscapeLoading,
      error: hyperscapeError,
      agent: hyperscapeAgent,
      goal: hyperscapeGoal,
      quickCommands: activeQuickCommands,
      runQuickCommand,
      refresh: refreshHyperscape,
    },
    emotes: {
      loading: emotesLoading,
      error: emotesError,
      activeEmoteId,
      pinned: pinnedEmotes,
      groups: emoteGroups,
      playEmote,
      stopEmote,
      refresh: refreshEmotes,
    },
    utility: {
      openSwapSurface,
      openAutonomousRunSurface,
    },
  };
}

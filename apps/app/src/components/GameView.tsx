/**
 * Game View — embeds a running app's game client in an iframe.
 *
 * Features:
 * - Full-screen iframe for game client
 * - PostMessage auth for HYPERSCAPE_AUTH / RS_2004SCAPE_AUTH
 * - Split-screen mode with agent logs panel
 * - Connection status indicator
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext";
import {
  client,
  type Five55MasteryContract,
  type Five55MasteryEvidenceFrame,
  type Five55MasteryGameSnapshot,
  type Five55MasteryConsistencyVerdict,
  type LogEntry,
} from "../api-client";
import { useRetakeCapture } from "../hooks/useRetakeCapture";
import { formatTime } from "./shared/format";

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
const READY_EVENT_BY_AUTH_TYPE: Record<string, string> = {
  HYPERSCAPE_AUTH: "HYPERSCAPE_READY",
  RS_2004SCAPE_AUTH: "RS_2004SCAPE_READY",
};

function resolveFive55GameId(activeGameApp: string): string | null {
  if (!activeGameApp.startsWith("five55:")) return null;
  const gameId = activeGameApp.slice("five55:".length).trim();
  return gameId.length > 0 ? gameId : null;
}

function resolvePostMessageTargetOrigin(viewerUrl: string): string {
  if (viewerUrl.startsWith("/")) return window.location.origin;
  const match = viewerUrl.match(/^https?:\/\/[^/?#]+/i);
  return match?.[0] ?? "*";
}

/** Tag badge colors for logs panel. */
const TAG_COLORS: Record<string, { bg: string; fg: string }> = {
  agent: { bg: "rgba(99, 102, 241, 0.15)", fg: "rgb(99, 102, 241)" },
  hyperscape: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  game: { bg: "rgba(34, 197, 94, 0.15)", fg: "rgb(34, 197, 94)" },
  autonomy: { bg: "rgba(245, 158, 11, 0.15)", fg: "rgb(245, 158, 11)" },
  websocket: { bg: "rgba(20, 184, 166, 0.15)", fg: "rgb(20, 184, 166)" },
};

export function GameView() {
  const {
    activeGameApp,
    activeGameDisplayName,
    activeGameViewerUrl,
    activeGameSandbox,
    activeGamePostMessageAuth,
    activeGamePostMessagePayload,
    gameOverlayEnabled,
    plugins,
    logs,
    loadLogs,
    setState,
    setActionNotice,
  } = useApp();
  const [stopping, setStopping] = useState(false);
  const [showLogsPanel, setShowLogsPanel] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("connecting");
  const [chatInput, setChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [retakeCapture, setRetakeCapture] = useState(false);
  const [masteryLoading, setMasteryLoading] = useState(false);
  const [masteryError, setMasteryError] = useState<string | null>(null);
  const [masteryContract, setMasteryContract] =
    useState<Five55MasteryContract | null>(null);
  const [masterySnapshot, setMasterySnapshot] =
    useState<Five55MasteryGameSnapshot | null>(null);
  const [masteryFrames, setMasteryFrames] =
    useState<Five55MasteryEvidenceFrame[]>([]);
  const [masteryConsistency, setMasteryConsistency] =
    useState<Five55MasteryConsistencyVerdict | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const authSentRef = useRef(false);
  const viewerSessionRef = useRef<string>("");
  const logsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stream iframe frames to retake.tv when capture is active
  useRetakeCapture(iframeRef, retakeCapture);

  // Send command to the agent - routes through ElizaOS which processes
  // the message and decides what hyperscape actions to take
  const handleSendChat = useCallback(async () => {
    const content = chatInput.trim();
    if (!content) return;
    setSendingChat(true);
    try {
      // Send message to ElizaOS agent - it will process and execute hyperscape actions
      // Examples: "go chop some wood", "attack the goblin", "go to the bank"
      const response = await client.sendChatRest(content, "DM");
      setChatInput("");
      // Show agent's response
      if (response.text) {
        setActionNotice(
          `Agent: ${response.text.slice(0, 100)}${response.text.length > 100 ? "..." : ""}`,
          "success",
          4000,
        );
      } else {
        setActionNotice("Command sent to agent.", "success", 2000);
      }
      // Refresh logs to show activity
      setTimeout(() => void loadLogs(), 1500);
    } catch (err) {
      setActionNotice(
        `Failed to send: ${err instanceof Error ? err.message : "error"}`,
        "error",
        3000,
      );
    } finally {
      setSendingChat(false);
    }
  }, [chatInput, setActionNotice, loadLogs]);
  const postMessageTargetOrigin = useMemo(
    () => resolvePostMessageTargetOrigin(activeGameViewerUrl),
    [activeGameViewerUrl],
  );
  const activeFive55GameId = useMemo(
    () => resolveFive55GameId(activeGameApp),
    [activeGameApp],
  );
  const viewerSessionKey = useMemo(
    () =>
      `${activeGameViewerUrl}::${JSON.stringify(activeGamePostMessagePayload ?? null)}`,
    [activeGamePostMessagePayload, activeGameViewerUrl],
  );

  // Only show retake capture button when the retake connector is enabled
  const retakeEnabled = useMemo(
    () => plugins.some((p) => p.id === "retake" && p.enabled),
    [plugins],
  );

  // Filter logs relevant to the current game
  const gameLogs = useMemo(() => {
    if (!activeGameApp) return [];
    const appKeyword = activeGameApp.toLowerCase().replace("@elizaos/app-", "");
    return logs.filter((entry) => {
      const message = (entry.message ?? "").toLowerCase();
      const source = (entry.source ?? "").toLowerCase();
      const tags = (entry.tags ?? []).map((t) => t.toLowerCase());
      return (
        message.includes(appKeyword) ||
        source.includes(appKeyword) ||
        tags.some((t) => t.includes(appKeyword)) ||
        tags.includes("game") ||
        tags.includes("autonomy") ||
        source.includes("agent")
      );
    });
  }, [activeGameApp, logs]);

  // Auto-refresh logs when panel is open
  useEffect(() => {
    if (!showLogsPanel) {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
      return;
    }
    void loadLogs();
    logsIntervalRef.current = setInterval(() => void loadLogs(), 3000);
    return () => {
      if (logsIntervalRef.current) {
        clearInterval(logsIntervalRef.current);
        logsIntervalRef.current = null;
      }
    };
  }, [showLogsPanel, loadLogs]);

  // Reset auth handshake state when the active viewer session changes.
  useEffect(() => {
    if (viewerSessionRef.current !== viewerSessionKey) {
      viewerSessionRef.current = viewerSessionKey;
      authSentRef.current = false;
    }
    if (activeGamePostMessageAuth) {
      setConnectionStatus("connecting");
      return;
    }
    // No auth required, assume connected once iframe loads.
    setConnectionStatus("connected");
  }, [activeGamePostMessageAuth, viewerSessionKey]);

  const resetActiveGameState = useCallback(() => {
    setState("activeGameApp", "");
    setState("activeGameDisplayName", "");
    setState("activeGameViewerUrl", "");
    setState("activeGameSandbox", DEFAULT_VIEWER_SANDBOX);
    setState("activeGamePostMessageAuth", false);
    setState("activeGamePostMessagePayload", null);
  }, [setState]);

  useEffect(() => {
    if (!activeGamePostMessageAuth || !activeGamePostMessagePayload) return;
    if (authSentRef.current) return;
    const expectedReadyType =
      READY_EVENT_BY_AUTH_TYPE[activeGamePostMessagePayload.type];
    if (!expectedReadyType) return;

    const onMessage = (event: MessageEvent<{ type?: string }>) => {
      if (authSentRef.current) return;
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) return;
      if (event.data?.type !== expectedReadyType) return;
      if (
        postMessageTargetOrigin !== "*" &&
        event.origin !== postMessageTargetOrigin
      ) {
        return;
      }
      iframeWindow.postMessage(
        activeGamePostMessagePayload,
        postMessageTargetOrigin,
      );
      authSentRef.current = true;
      setConnectionStatus("connected");
      setActionNotice("Viewer auth sent.", "info", 1800);
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [
    activeGamePostMessageAuth,
    activeGamePostMessagePayload,
    postMessageTargetOrigin,
    setActionNotice,
  ]);

  useEffect(() => {
    if (!activeFive55GameId) {
      setMasteryContract(null);
      setMasterySnapshot(null);
      setMasteryFrames([]);
      setMasteryConsistency(null);
      setMasteryError(null);
      setMasteryLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setMasteryLoading(true);
      try {
        const latest = await client.getFive55MasteryLatest(activeFive55GameId);
        if (cancelled) return;
        setMasteryContract(latest.contract);
        setMasterySnapshot(latest.latest);
        if (latest.latest?.latestRunId && latest.latest?.latestEpisodeId) {
          const [frames, consistency] = await Promise.all([
            client.getFive55MasteryEpisodeFrames(
              latest.latest.latestRunId,
              latest.latest.latestEpisodeId,
            ),
            client.getFive55MasteryEpisodeConsistency(
              latest.latest.latestRunId,
              latest.latest.latestEpisodeId,
            ),
          ]);
          if (cancelled) return;
          setMasteryFrames(frames.frames);
          setMasteryConsistency(consistency.consistency);
        } else {
          setMasteryFrames([]);
          setMasteryConsistency(null);
        }
        setMasteryError(null);
      } catch (err) {
        if (cancelled) return;
        setMasteryError(
          err instanceof Error ? err.message : "Failed to load mastery data",
        );
        setMasteryFrames([]);
        setMasteryConsistency(null);
      } finally {
        if (!cancelled) {
          setMasteryLoading(false);
        }
      }
    };

    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeFive55GameId]);

  const handleOpenInNewTab = useCallback(() => {
    const popup = window.open(
      activeGameViewerUrl,
      "_blank",
      "noopener,noreferrer",
    );
    if (!popup) {
      setActionNotice(
        "Popup blocked. Allow popups and try again.",
        "error",
        3600,
      );
    }
  }, [activeGameViewerUrl, setActionNotice]);

  const handleStop = useCallback(async () => {
    if (!activeGameApp) return;
    setStopping(true);
    try {
      const stopResult = await client.stopApp(activeGameApp);
      resetActiveGameState();
      setState("tab", "apps");
      setActionNotice(
        stopResult.message,
        stopResult.success ? "success" : "info",
        stopResult.needsRestart ? 5000 : 3200,
      );
    } catch (err) {
      setActionNotice(
        `Failed to stop: ${err instanceof Error ? err.message : "error"}`,
        "error",
      );
    } finally {
      setStopping(false);
    }
  }, [activeGameApp, resetActiveGameState, setState, setActionNotice]);

  if (!activeGameViewerUrl) {
    return (
      <div className="flex items-center justify-center py-10 text-muted italic">
        No active game session.{" "}
        <button
          type="button"
          onClick={() => {
            setState("tab", "apps");
            setState("appsSubTab", "browse");
          }}
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40 ml-2"
        >
          Back to Apps
        </button>
      </div>
    );
  }

  const renderLogsPanel = () => (
    <div className="w-80 border-l border-border bg-card flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <span className="font-bold text-xs">Agent Activity</span>
        <span className="flex-1" />
        <button
          type="button"
          className="text-[10px] px-2 py-0.5 border border-border bg-card cursor-pointer hover:border-accent"
          onClick={() => void loadLogs()}
        >
          Refresh
        </button>
        <button
          type="button"
          className="text-[10px] px-2 py-0.5 border border-border bg-card cursor-pointer hover:border-accent"
          onClick={() => setShowLogsPanel(false)}
        >
          Hide
        </button>
      </div>
      {/* Chat input for sending commands to agent */}
      <div className="flex items-center gap-2 px-2 py-2 border-b border-border">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !sendingChat) {
              e.preventDefault();
              handleSendChat();
            }
          }}
          placeholder="e.g. 'go chop wood' or 'attack the goblin'"
          className="flex-1 px-2 py-1 text-xs border border-border bg-bg rounded-none focus:border-accent focus:outline-none"
          disabled={sendingChat}
        />
        <button
          type="button"
          onClick={handleSendChat}
          disabled={sendingChat || !chatInput.trim()}
          className="text-xs px-2 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
        >
          {sendingChat ? "..." : "Send"}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-2 text-[11px] font-mono">
        {gameLogs.length === 0 ? (
          <div className="text-center py-4 text-muted italic">
            No agent activity yet.
          </div>
        ) : (
          gameLogs.slice(0, 50).map((entry: LogEntry, idx) => (
            <div
              key={`${entry.timestamp}-${idx}`}
              className="py-1 border-b border-border/50 flex flex-col gap-0.5"
            >
              <div className="flex items-center gap-1">
                <span className="text-muted text-[10px]">
                  {formatTime(entry.timestamp, { fallback: "—" })}
                </span>
                <span
                  className={`font-semibold text-[10px] uppercase ${
                    entry.level === "error"
                      ? "text-danger"
                      : entry.level === "warn"
                        ? "text-warn"
                        : "text-muted"
                  }`}
                >
                  {entry.level}
                </span>
                {(entry.tags ?? []).slice(0, 2).map((t: string) => {
                  const c = TAG_COLORS[t];
                  return (
                    <span
                      key={t}
                      className="text-[9px] px-1 py-px rounded"
                      style={{
                        background: c ? c.bg : "var(--bg-muted)",
                        color: c ? c.fg : "var(--muted)",
                      }}
                    >
                      {t}
                    </span>
                  );
                })}
              </div>
              <div className="text-txt break-all">{entry.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const connectionStatusColor =
    connectionStatus === "connected"
      ? "text-ok border-ok"
      : connectionStatus === "connecting"
        ? "text-warn border-warn"
        : "text-danger border-danger";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <span className="font-bold text-sm">
          {activeGameDisplayName || activeGameApp}
        </span>
        {/* Connection status indicator */}
        <span
          className={`text-[10px] px-1.5 py-0.5 border ${connectionStatusColor}`}
        >
          {connectionStatus === "connected"
            ? "Connected"
            : connectionStatus === "connecting"
              ? "Connecting..."
              : "Disconnected"}
        </span>
        {activeGamePostMessageAuth ? (
          <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
            postMessage auth
          </span>
        ) : null}
        <span className="flex-1" />
        {/* Toggle logs panel */}
        <button
          type="button"
          className={`text-xs px-3 py-1 border cursor-pointer hover:bg-accent-hover disabled:opacity-40 ${
            showLogsPanel
              ? "bg-accent text-accent-fg border-accent"
              : "bg-card text-txt border-border hover:border-accent"
          }`}
          onClick={() => setShowLogsPanel(!showLogsPanel)}
        >
          {showLogsPanel ? "Hide Logs" : "Show Logs"}
        </button>
        {retakeEnabled && (
          <button
            type="button"
            className={`text-xs px-3 py-1 border cursor-pointer hover:bg-accent-hover disabled:opacity-40 ${
              retakeCapture
                ? "bg-accent text-accent-fg border-accent"
                : "bg-card text-txt border-border hover:border-accent"
            }`}
            onClick={() => setRetakeCapture(!retakeCapture)}
            title="Stream this view to retake.tv (requires active retake stream)"
          >
            {retakeCapture ? "Stop Capture" : "Retake Capture"}
          </button>
        )}
        <button
          type="button"
          className={`text-xs px-3 py-1 border cursor-pointer hover:bg-accent-hover disabled:opacity-40 ${
            gameOverlayEnabled
              ? "bg-accent text-accent-fg border-accent"
              : "bg-card text-txt border-border hover:border-accent"
          }`}
          onClick={() => setState("gameOverlayEnabled", !gameOverlayEnabled)}
          title={
            gameOverlayEnabled
              ? "Disable floating overlay"
              : "Keep game visible when switching tabs"
          }
        >
          {gameOverlayEnabled ? "Unpin Overlay" : "Keep on Top"}
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
          onClick={handleOpenInNewTab}
        >
          Open in New Tab
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
          disabled={stopping}
          onClick={handleStop}
        >
          {stopping ? "Stopping..." : "Stop"}
        </button>
        <button
          type="button"
          className="text-xs px-3 py-1 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
          onClick={() => {
            setState("tab", "apps");
            setState("appsSubTab", "browse");
          }}
        >
          Back to Apps
        </button>
      </div>
      {activeFive55GameId && masteryContract ? (
        <div className="px-4 py-2 border-b border-border bg-bg-hover/40 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-accent">Mastery</span>
            <span className="text-muted">{masteryContract.title}</span>
            <span className="text-muted">stage:</span>
            <span className="font-semibold">
              {masterySnapshot?.latestStatus ?? "unknown"}
            </span>
            <span className="text-muted">confidence:</span>
            <span className="font-semibold">
              {typeof masterySnapshot?.latestVerdict?.confidence === "number"
                ? masterySnapshot.latestVerdict.confidence.toFixed(2)
                : "n/a"}
            </span>
            <span
              className={`text-[10px] px-1 py-0.5 border ${
                masterySnapshot?.latestVerdict?.outcome?.runtimeQualified
                  ? "border-ok text-ok"
                  : "border-danger text-danger"
              }`}
            >
              runtime
            </span>
            <span
              className={`text-[10px] px-1 py-0.5 border ${
                masterySnapshot?.latestVerdict?.outcome?.visualQualified
                  ? "border-ok text-ok"
                  : "border-danger text-danger"
              }`}
            >
              visual
            </span>
            <span
              className={`text-[10px] px-1 py-0.5 border ${
                (masteryConsistency?.status ?? masterySnapshot?.latestVerdict?.consistency?.status) === "pass"
                  ? "border-ok text-ok"
                  : "border-danger text-danger"
              }`}
            >
              consistent
            </span>
            <span
              className={`text-[10px] px-1 py-0.5 border ${
                masterySnapshot?.latestVerdict?.outcome?.finalQualified
                  ? "border-ok text-ok"
                  : "border-danger text-danger"
              }`}
            >
              qualified
            </span>
            <span className="flex-1" />
            {masteryLoading ? <span className="text-muted">refreshing...</span> : null}
            {masteryError ? <span className="text-danger">{masteryError}</span> : null}
          </div>
          <div className="mt-1 text-muted">{masteryContract.objective.summary}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {masteryContract.controls.slice(0, 4).map((control) => (
              <span
                key={`${control.action}:${control.input}`}
                className="px-1.5 py-0.5 border border-border bg-card text-txt"
              >
                {control.action}: {control.input}
              </span>
            ))}
          </div>
          {masterySnapshot?.riskFlags?.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {masterySnapshot.riskFlags.slice(0, 4).map((flag) => (
                <span
                  key={flag}
                  className="px-1.5 py-0.5 border border-danger/40 text-danger bg-card"
                >
                  {flag}
                </span>
              ))}
            </div>
          ) : null}
          {masteryConsistency?.status === "fail" ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {masteryConsistency.mismatchDetails.slice(0, 4).map((detail) => (
                <span
                  key={detail}
                  className="px-1.5 py-0.5 border border-danger/40 text-danger bg-card"
                >
                  {detail}
                </span>
              ))}
            </div>
          ) : null}
          {masteryFrames.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {masteryFrames.slice(0, 5).map((frame) => (
                <span
                  key={`${frame.seq}:${frame.hash}`}
                  className="px-1.5 py-0.5 border border-border bg-card text-txt"
                  title={`${frame.frameType} • ${frame.ts}`}
                >
                  #{frame.seq} {frame.frameType}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-h-0 relative">
          <iframe
            ref={iframeRef}
            src={activeGameViewerUrl}
            sandbox={activeGameSandbox}
            className="w-full h-full border-none"
            title={activeGameDisplayName || "Game"}
          />
        </div>
        {showLogsPanel && renderLogsPanel()}
      </div>
    </div>
  );
}

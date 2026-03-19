/**
 * Chat avatar panel component.
 *
 * Renders a 3D VRM avatar within the parent container (used in the
 * Autonomous Loop sidebar). Voice controls are managed externally.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "../AppContext.js";
import { client } from "../api-client.js";
import { STOP_EMOTE_EVENT } from "@milady/app-core/events";
import type { StageSceneMark, StageScenePreset } from "../proStreamerStageScene.js";
import { AvatarLoader } from "./avatar/AvatarLoader.js";
import type { VrmEngine, VrmEngineState } from "./avatar/VrmEngine";
import { VrmViewer } from "./avatar/VrmViewer";

export interface ChatAvatarProps {
  /** Mouth openness value (0-1) for lip sync animation */
  mouthOpen?: number;
  /** Whether the agent is currently speaking (drives engine-side mouth anim) */
  isSpeaking?: boolean;
  scenePreset?: StageScenePreset;
  sceneMark?: StageSceneMark;
}

export function ChatAvatar({
  mouthOpen = 0,
  isSpeaking = false,
  scenePreset = "default",
  sceneMark = "stage",
}: ChatAvatarProps) {
  const { selectedVrmIndex, customVrmUrl } = useApp();

  // Resolve VRM path from selected index or custom upload
  const vrmPath =
    selectedVrmIndex === 0 && customVrmUrl
      ? customVrmUrl
      : getVrmUrl(selectedVrmIndex || 1);
  const fallbackPreviewUrl =
    selectedVrmIndex > 0
      ? getVrmPreviewUrl(selectedVrmIndex)
      : getVrmPreviewUrl(1);
  const isStageScene = scenePreset === "pro-streamer-stage";

  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const lastTriggeredEmoteRef = useRef<{ key: string; at: number } | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [stageLoaded, setStageLoaded] = useState(!isStageScene);
  const [showFallback, setShowFallback] = useState(false);
  const [viewerFailed, setViewerFailed] = useState(false);
  const [viewerErrorMessage, setViewerErrorMessage] = useState<string | null>(null);
  const [stageStartupTimedOut, setStageStartupTimedOut] = useState(false);

  const avatarVisible = engineReady || vrmLoaded || showFallback;
  const avatarReady = engineReady && vrmLoaded && (!isStageScene || stageLoaded);
  const showStageFailure = isStageScene && (viewerFailed || stageStartupTimedOut);
  const renderState = showStageFailure
    ? "error"
    : avatarReady
      ? "ready"
      : showFallback && !isStageScene
        ? "fallback"
        : "loading";

  const handleEngineReady = useCallback((engine: VrmEngine) => {
    vrmEngineRef.current = engine;
    setEngineReady(true);
  }, []);

  const handleEngineState = useCallback((state: VrmEngineState) => {
    setStageLoaded(state.stageLoaded);
    if (state.vrmLoaded) {
      setVrmLoaded(true);
      setShowFallback(false);
    }
  }, []);

  const handleViewerError = useCallback((error: Error) => {
    setEngineReady(false);
    setVrmLoaded(false);
    setStageLoaded(false);
    setViewerFailed(true);
    setViewerErrorMessage(error.message);
    setShowFallback(!isStageScene);
  }, [isStageScene]);

  useEffect(() => {
    setStageLoaded(!isStageScene);
  }, [isStageScene]);

  useEffect(() => {
    if (!isStageScene || avatarReady || viewerFailed) {
      setStageStartupTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setStageStartupTimedOut(true);
    }, 12000);
    return () => window.clearTimeout(timer);
  }, [avatarReady, isStageScene, viewerFailed]);

  const triggerEmote = useCallback(
    (glbPath: string, duration: number, loop: boolean) => {
      const engine = vrmEngineRef.current;
      if (!engine) return;

      const safePath = glbPath.trim();
      if (!safePath) return;

      const key = `${safePath}|${duration}|${loop ? 1 : 0}`;
      const now = performance.now();
      const last = lastTriggeredEmoteRef.current;
      if (last && last.key === key && now - last.at < 450) {
        return;
      }
      lastTriggeredEmoteRef.current = { key, at: now };
      void engine.playEmote(safePath, duration, loop);
    },
    [],
  );

  // If a VRM fails to load, show the selected static preview in the sidebar.
  useEffect(() => {
    setEngineReady(false);
    setVrmLoaded(false);
    setStageLoaded(!isStageScene);
    setShowFallback(false);
    setViewerFailed(false);
    setViewerErrorMessage(null);
    setStageStartupTimedOut(false);
    const timer = window.setTimeout(() => {
      if (!isStageScene) {
        setShowFallback(true);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [isStageScene, vrmPath]);

  // Subscribe to WebSocket emote events and trigger avatar animations.
  useEffect(() => {
    if (!engineReady) return;
    return client.onWsEvent("emote", (data) => {
      triggerEmote(
        String(data.glbPath ?? ""),
        Number(data.duration ?? 0),
        data.loop === true,
      );
    });
  }, [engineReady, triggerEmote]);

  useEffect(() => {
    if (!engineReady) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{
        glbPath?: string;
        duration?: number;
        loop?: boolean;
      }>).detail;
      if (!detail) return;
      triggerEmote(
        String(detail.glbPath ?? ""),
        Number(detail.duration ?? 0),
        detail.loop === true,
      );
    };
    document.addEventListener("milady:play-emote", handler as EventListener);
    return () =>
      document.removeEventListener(
        "milady:play-emote",
        handler as EventListener,
      );
  }, [engineReady, triggerEmote]);

  // Listen for stop-emote events from the EmotePicker control panel.
  useEffect(() => {
    if (!engineReady) return;
    const handler = () => {
      vrmEngineRef.current?.stopEmote();
    };
    document.addEventListener(STOP_EMOTE_EVENT, handler);
    return () => document.removeEventListener(STOP_EMOTE_EVENT, handler);
  }, [engineReady]);

  return (
    <div
      className="relative h-full w-full"
      data-avatar-render-state={renderState}
      data-avatar-stage-ready={avatarReady && isStageScene ? "true" : undefined}
      data-avatar-stage-error={showStageFailure ? "true" : undefined}
    >
      <div
        className="absolute inset-0"
        style={{
          opacity: avatarVisible ? 1 : 0,
          transition: "opacity 0.45s ease-in-out",
          background: isStageScene
            ? "transparent"
            :
            "radial-gradient(circle at 50% 100%, rgba(255,255,255,0.08), transparent 60%)",
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              opacity: avatarReady && !viewerFailed ? 1 : 0,
              transition: "opacity 0.45s ease",
              transform: isStageScene ? undefined : "scale(1.22) translateY(-8%)",
              transformOrigin: isStageScene ? undefined : "50% 28%",
            }}
          >
            <VrmViewer
              vrmPath={vrmPath}
              mouthOpen={mouthOpen}
              isSpeaking={isSpeaking}
              scenePreset={scenePreset}
              sceneMark={sceneMark}
              onEngineReady={handleEngineReady}
              onEngineState={handleEngineState}
              onViewerError={handleViewerError}
            />
          </div>

          {showFallback && (!vrmLoaded || viewerFailed) && !isStageScene && (
            <img
              src={fallbackPreviewUrl}
              alt="avatar preview"
              className="absolute left-1/2 top-1/2 h-[104%] -translate-x-1/2 -translate-y-[46%] object-contain opacity-95 sm:h-[112%] lg:h-[118%] xl:h-[122%]"
            />
          )}

          {showStageFailure ? (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 px-6 text-center">
              <div className="max-w-sm rounded-[24px] border border-danger/30 bg-black/72 px-5 py-4 text-white/80 shadow-[0_18px_60px_rgba(0,0,0,0.42)]">
                <div className="text-[10px] uppercase tracking-[0.24em] text-danger">
                  Stage renderer blocked
                </div>
                <div className="mt-2 text-sm leading-relaxed">
                  {viewerErrorMessage ??
                    "Alice stage did not finish loading. Reload the stage before treating camera as live."}
                </div>
              </div>
            </div>
          ) : null}

          {!avatarReady && !showFallback && !showStageFailure && (
            <AvatarLoader
              label={isStageScene ? "Loading Alice stage" : "Initializing entity"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

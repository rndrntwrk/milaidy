/**
 * Chat avatar panel component.
 *
 * Renders a 3D VRM avatar within the parent container (used in the
 * Autonomous Loop sidebar). Voice controls are managed externally.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getVrmPreviewUrl, getVrmUrl, useApp } from "../AppContext";
import { client } from "../api-client";
import type { VrmEngine, VrmEngineState } from "./avatar/VrmEngine";
import { VrmViewer } from "./avatar/VrmViewer";

export interface ChatAvatarProps {
  /** Mouth openness value (0-1) for lip sync animation */
  mouthOpen?: number;
  /** Whether the agent is currently speaking (drives engine-side mouth anim) */
  isSpeaking?: boolean;
}

export function ChatAvatar({
  mouthOpen = 0,
  isSpeaking = false,
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

  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [viewerFailed, setViewerFailed] = useState(false);

  const avatarVisible = engineReady || vrmLoaded || showFallback;

  const handleEngineReady = useCallback((engine: VrmEngine) => {
    vrmEngineRef.current = engine;
    setEngineReady(true);
  }, []);

  const handleEngineState = useCallback((state: VrmEngineState) => {
    if (state.vrmLoaded) {
      setVrmLoaded(true);
      setShowFallback(false);
    }
  }, []);

  const handleViewerError = useCallback(() => {
    setEngineReady(false);
    setVrmLoaded(false);
    setViewerFailed(true);
    setShowFallback(true);
  }, []);

  // If a VRM fails to load, show the selected static preview in the sidebar.
  useEffect(() => {
    setEngineReady(false);
    setVrmLoaded(false);
    setShowFallback(false);
    setViewerFailed(false);
    const timer = window.setTimeout(() => {
      setShowFallback(true);
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [vrmPath]);

  // Subscribe to WebSocket emote events and trigger avatar animations.
  useEffect(() => {
    if (!engineReady) return;
    return client.onWsEvent("emote", (data) => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      void engine.playEmote(
        data.glbPath as string,
        data.duration as number,
        data.loop as boolean,
      );
    });
  }, [engineReady]);

  // Listen for stop-emote events from the EmotePicker control panel.
  useEffect(() => {
    if (!engineReady) return;
    const handler = () => vrmEngineRef.current?.stopEmote();
    document.addEventListener("milady:stop-emote", handler);
    return () => document.removeEventListener("milady:stop-emote", handler);
  }, [engineReady]);

  return (
    <div className="relative h-full w-full pointer-events-none">
      <div
        className="absolute inset-0"
        style={{
          opacity: avatarVisible ? 0.95 : 0,
          transition: "opacity 0.45s ease-in-out",
          background:
            "radial-gradient(circle at 50% 100%, rgba(255,255,255,0.08), transparent 60%)",
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              opacity: vrmLoaded && !viewerFailed ? 1 : 0,
              transition: "opacity 0.45s ease",
              transform: "scale(1.22) translateY(-8%)",
              transformOrigin: "50% 28%",
            }}
          >
            <VrmViewer
              vrmPath={vrmPath}
              mouthOpen={mouthOpen}
              isSpeaking={isSpeaking}
              onEngineReady={handleEngineReady}
              onEngineState={handleEngineState}
              onViewerError={handleViewerError}
            />
          </div>

          {showFallback && (!vrmLoaded || viewerFailed) && (
            <img
              src={fallbackPreviewUrl}
              alt="avatar preview"
              className="absolute left-1/2 top-1/2 h-[104%] -translate-x-1/2 -translate-y-[46%] object-contain opacity-95 sm:h-[112%] lg:h-[118%] xl:h-[122%]"
            />
          )}
        </div>
      </div>
    </div>
  );
}

import {
  APP_EMOTE_EVENT,
  type AppEmoteEventDetail,
  CHAT_AVATAR_VOICE_EVENT,
  STOP_EMOTE_EVENT,
} from "@milady/app-core/events";
import { useRenderGuard } from "@milady/app-core/hooks";
import { resolveAppAssetUrl } from "@milady/app-core/utils";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AvatarLoader } from "../avatar/AvatarLoader";
import type {
  CameraProfile,
  VrmEngine,
  VrmEngineState,
} from "../avatar/VrmEngine";
import { VrmViewer } from "../avatar/VrmViewer";
import type { TranslatorFn } from "./walletUtils";

export const VrmStage = memo(function VrmStage({
  active = true,
  vrmPath,
  worldUrl,
  fallbackPreviewUrl,
  cameraProfile = "companion",
  onEngineReady,
  t,
}: {
  active?: boolean;
  vrmPath: string;
  worldUrl?: string;
  fallbackPreviewUrl: string;
  cameraProfile?: CameraProfile;
  onEngineReady?: (engine: VrmEngine) => void;
  t: TranslatorFn;
}) {
  useRenderGuard("VrmStage");
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [showVrmFallback, setShowVrmFallback] = useState(false);
  const [chatAvatarVoice, setChatAvatarVoice] = useState({
    mouthOpen: 0,
    isSpeaking: false,
  });
  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const fallbackVrmPathRef = useRef(vrmPath);

  const handleVrmEngineReady = useCallback(
    (engine: VrmEngine) => {
      vrmEngineRef.current = engine;
      engine.setPaused(!active);
      engine.setCameraAnimation({
        enabled: true,
        swayAmplitude: cameraProfile === "companion_close" ? 0.028 : 0.04,
        bobAmplitude: cameraProfile === "companion_close" ? 0.016 : 0.022,
        rotationAmplitude: cameraProfile === "companion_close" ? 0.008 : 0.012,
        speed: cameraProfile === "companion_close" ? 0.48 : 0.42,
      });
      engine.setPointerParallaxEnabled(false);
      onEngineReady?.(engine);
    },
    [active, cameraProfile, onEngineReady],
  );

  const handleVrmEngineState = useCallback((state: VrmEngineState) => {
    if (state.vrmLoaded) {
      setVrmLoaded(true);
      setShowVrmFallback(false);
      return;
    }
    if (state.loadError) {
      setVrmLoaded(false);
      setShowVrmFallback(true);
    }
  }, []);

  useEffect(() => {
    fallbackVrmPathRef.current = vrmPath;
    setVrmLoaded(false);
    setShowVrmFallback(false);
    const timer = window.setTimeout(() => {
      if (fallbackVrmPathRef.current === vrmPath) {
        setShowVrmFallback(true);
      }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [vrmPath]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          mouthOpen?: number;
          isSpeaking?: boolean;
        }>
      ).detail;
      setChatAvatarVoice({
        mouthOpen: typeof detail?.mouthOpen === "number" ? detail.mouthOpen : 0,
        isSpeaking: detail?.isSpeaking === true,
      });
    };
    window.addEventListener(CHAT_AVATAR_VOICE_EVENT, handler);
    return () => window.removeEventListener(CHAT_AVATAR_VOICE_EVENT, handler);
  }, []);

  useEffect(() => {
    vrmEngineRef.current?.setPaused(!active);
  }, [active]);

  useEffect(() => {
    if (!vrmLoaded) return;
    const handler = (event: Event) => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      const detail = (event as CustomEvent<AppEmoteEventDetail>).detail;
      if (!detail?.path) return;
      const resolvedPath = resolveAppAssetUrl(detail.path);
      const duration =
        typeof detail.duration === "number" && Number.isFinite(detail.duration)
          ? detail.duration
          : 3;
      const isLoop = detail.loop === true;
      void engine.playEmote(resolvedPath, duration, isLoop);
    };
    window.addEventListener(APP_EMOTE_EVENT, handler);
    return () => window.removeEventListener(APP_EMOTE_EVENT, handler);
  }, [vrmLoaded]);

  // Listen for stop-emote events from the EmotePicker "Stop" button.
  useEffect(() => {
    if (!vrmLoaded) return;
    const handler = () => {
      vrmEngineRef.current?.stopEmote();
    };
    document.addEventListener(STOP_EMOTE_EVENT, handler);
    return () => document.removeEventListener(STOP_EMOTE_EVENT, handler);
  }, [vrmLoaded]);

  return (
    <div className="fixed inset-0 z-0 overflow-hidden bg-[#030711]">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 18%, rgba(44, 188, 255, 0.18) 0%, rgba(44, 188, 255, 0.04) 24%, rgba(3, 7, 17, 0) 52%), linear-gradient(180deg, #06101d 0%, #040913 48%, #02050c 100%)",
          }}
        />
        <div
          className="absolute inset-x-[-14%] bottom-[-24%] h-[74%] opacity-70"
          style={{
            transform: "perspective(1200px) rotateX(80deg)",
            transformOrigin: "center bottom",
            backgroundImage:
              "linear-gradient(rgba(118, 232, 255, 0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(118, 232, 255, 0.18) 1px, transparent 1px)",
            backgroundSize: "68px 68px",
            boxShadow: "0 -24px 90px rgba(40, 184, 255, 0.14)",
          }}
        />
        <div
          className="absolute inset-x-0 top-[39%] h-px opacity-55"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(118, 232, 255, 0.12) 18%, rgba(118, 232, 255, 0.58) 50%, rgba(118, 232, 255, 0.12) 82%, transparent 100%)",
            boxShadow: "0 0 20px rgba(118, 232, 255, 0.18)",
          }}
        />
      </div>
      <div
        className="absolute inset-0 z-10"
        style={{
          opacity: 1,
          transition: "opacity 400ms ease",
        }}
      >
        <VrmViewer
          active={active}
          vrmPath={vrmPath}
          worldUrl={worldUrl}
          mouthOpen={chatAvatarVoice.mouthOpen}
          isSpeaking={chatAvatarVoice.isSpeaking}
          cameraProfile={cameraProfile}
          onEngineReady={handleVrmEngineReady}
          onEngineState={handleVrmEngineState}
        />
      </div>
      {showVrmFallback && !vrmLoaded && (
        <img
          src={fallbackPreviewUrl}
          alt={t("companion.avatarPreviewAlt")}
          className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 h-[90%] object-contain opacity-70"
        />
      )}
      {!vrmLoaded && !showVrmFallback && <AvatarLoader />}
    </div>
  );
});

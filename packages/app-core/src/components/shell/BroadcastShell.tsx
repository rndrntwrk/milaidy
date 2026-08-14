/**
 * Broadcast shell — chrome-free render of CompanionSceneHost intended for
 * the capture-service's headless Chromium to grab as the "camera" frame
 * when Alice goes live.
 *
 * Activation: visit the app root with `?broadcast` (any non-`false`/`0`
 * value) on the URL. App.tsx's `useIsBroadcast()` gate routes the boot
 * here instead of the regular shell.
 *
 * Why this is the right capture target:
 * - It mounts the same `<CompanionSceneHost active>` the user sees on the
 *   companion tab, so VRM model, scene preset, idle animations, and any
 *   future overlay (chat bubbles, action bubbles) stay in lockstep with
 *   the live AppContext state. No double-maintenance against a parallel
 *   renderer.
 * - It does NOT mount Header, hub navigation, sidebars, settings panels,
 *   or chat dock. The viewport is a clean full-bleed stage suitable for
 *   1920x1080 RTMPS capture.
 * - Pointer events are disabled (`interactive={false}`) so an automated
 *   capture pipeline can't accidentally trigger UI affordances by hovering
 *   the cursor over the scene.
 *
 * Capture-service handshake:
 * The 555stream capture-service worker (worker.js:2161) waits for
 * `window.__agentShowControl` to expose a `playEmote` function — that
 * contract was originally defined for the legacy services/agent-show page.
 * BroadcastShell routes that control through the app emote event and waits
 * for VrmStage's applied acknowledgement, then separately waits for
 * `useCompanionSceneStatus().avatarReady` before adding `.avatar-ready` to
 * `document.documentElement`. The capture worker requires both signals
 * before considering the companion ready and starting the FFmpeg push.
 *
 * Without this handshake the capture worker times out at 20s and falls
 * back to its own DOM-injected agent-show standalone page (the bundled
 * blonde Alice fallback), regardless of whether VrmEngine successfully
 * booted in headless Chromium.
 *
 * The companion tab on the regular shell still uses the normal
 * `<CompanionShell />` and is unchanged by this component.
 */

import { useRenderGuard } from "@miladyai/app-core/hooks";
import { memo, useEffect } from "react";
import { getBroadcastMode } from "../../platform/init";
import { CompanionSceneHost } from "../companion/CompanionSceneHost";
import { useCompanionSceneStatus } from "../companion/companion-scene-status-context";
import { LiveKitBroadcastPublisher } from "../companion/LiveKitBroadcastPublisher";
import { SceneOverlayDataBridge } from "../companion/scene-overlay-bridge";
import {
  type BroadcastEmoteControl,
  createBroadcastEmoteControl,
} from "./broadcast-emote-control";

declare global {
  interface Window {
    /** Real capture control installed by BroadcastShell. */
    __agentShowControl?: Record<string, unknown> &
      Partial<BroadcastEmoteControl>;
  }
}

function CaptureHandshake() {
  const { avatarReady } = useCompanionSceneStatus();

  // Signal "React mounted" and expose a real VRM control as soon as the
  // shell mounts. The control resolves only after VrmStage reports that the
  // active VrmEngine started the requested emote.
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.__agentShowControl = {
      ...(window.__agentShowControl ?? {}),
      ...createBroadcastEmoteControl(window),
    };
    return () => {
      // Intentionally NOT clearing __agentShowControl on unmount — once
      // the capture worker has read it the contract is fulfilled and a
      // late teardown shouldn't retract it.
    };
  }, []);

  // Signal "avatar ready" via the documentElement class the capture
  // worker waitForSelector's on (worker.js:2174). We only flip it once
  // CompanionSceneHost reports the teleport-in animation has finished,
  // so the first FFmpeg frames don't catch the avatar mid-load.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!avatarReady) return;
    document.documentElement.classList.add("avatar-ready");
  }, [avatarReady]);

  return null;
}

export const BroadcastShell = memo(function BroadcastShell() {
  useRenderGuard("BroadcastShell");
  return (
    <div
      data-broadcast-shell
      className="fixed inset-0 h-screen w-screen overflow-hidden bg-black"
    >
      <CompanionSceneHost active interactive={false}>
        <CaptureHandshake />
      </CompanionSceneHost>
      {/*
        SceneOverlayDataBridge is a leaf that subscribes to React state
        (conversationMessages, agentStatus, triggers) and pushes it into
        the SceneOverlayManager via the VrmEngine debug registry. It must
        be mounted OUTSIDE CompanionSceneHost so it doesn't trigger
        re-renders of the 3D host on every chat / status / trigger update.
        Without this, the chat / status / heartbeat billboards inside the
        scene render but never receive any data, which is why the live
        capture had no chat bubbles after PR #68.
      */}
      <SceneOverlayDataBridge />
      {/*
        LiveKitBroadcastPublisher captures the VRM canvas and publishes
        it as a WebRTC track. Mount ONLY when the transport is the
        internal capture context — `getBroadcastMode() === "capture"`
        keys off `window.__injectedShowConfig`, which Puppeteer injects
        before any page script runs. Public viewers at
        `alice.rndrntwrk.com/broadcast/*` don't have that global and
        this component is not mounted, so there is no publishTrack
        call, no LocalAudioTrack tap, and no way for an unauthenticated
        viewer to become a publisher.
      */}
      {getBroadcastMode() === "capture" ? <LiveKitBroadcastPublisher /> : null}
    </div>
  );
});

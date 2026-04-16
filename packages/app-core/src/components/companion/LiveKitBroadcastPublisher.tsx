/**
 * LiveKitBroadcastPublisher — publishes the VRM Three.js canvas as a
 * WebRTC video track to a LiveKit room. Used by BroadcastShell in the
 * capture-service's headless Chromium.
 *
 * ## Why this exists
 *
 * Prior architecture ran a second React tree in the capture-service's
 * headless Chromium that was supposed to sync with the operator's
 * browser via WebSocket events (emotes, state deltas). That sync path
 * didn't work reliably in the headless environment — the AppContext
 * setup effect never established its WS connection, leaving the
 * broadcast scene static even though the page loaded.
 *
 * The frontier architecture (matching HeyGen LiveAvatar, D-ID, Anam
 * real-time rendering) is: one canonical renderer, one video track,
 * all consumers subscribe. This component implements the publisher
 * half of that architecture — the headless Chromium's canvas becomes
 * the sole source of truth for stream video.
 *
 * ## How it works
 *
 * 1. On mount, reads LiveKit connection details from
 *    `window.__injectedShowConfig.liveKit` (injected by the
 *    capture-service worker at page load — see
 *    `services/capture-service/src/worker.js:2118`).
 * 2. Uses `livekit-client` to connect to the provided room URL with
 *    the provided token. The token must have `canPublish: true`.
 * 3. Locates the VRM canvas via `document.querySelector("canvas[data-vrm-canvas]")`
 *    — VrmViewer renders the canvas with this attribute.
 * 4. Calls `canvas.captureStream(30)` to get a MediaStream at 30 fps.
 * 5. Publishes the video track via `room.localParticipant.publishTrack`.
 * 6. On unmount, unpublishes cleanly and disconnects.
 *
 * ## Why canvas.captureStream
 *
 * It's the native browser API for turning a canvas into a MediaStream.
 * Works in Playwright-controlled headless Chromium with the existing
 * Chrome flags (--use-gl=angle --use-angle=swiftshader
 * --use-fake-device-for-media-stream). No polyfill or workaround needed.
 *
 * Frame rate matches whatever rate the Three.js renderer is actively
 * drawing to the canvas. VrmEngine uses `renderer.setAnimationLoop`
 * which drives continuous 60 Hz rendering (capped to 30 Hz by the
 * capture request).
 *
 * ## Scope
 *
 * This component ONLY publishes video. Audio, data messages, and
 * Egress-to-RTMPS are handled elsewhere:
 * - Audio: the livekit-agent-worker publishes TTS audio to the same
 *   room separately (existing premium/Hedra pattern).
 * - Data messages: a separate LiveKitActionSubscriber (future) will
 *   receive operator actions and dispatch them to VrmStage via the
 *   existing `eliza:app-emote` CustomEvent path.
 * - Egress: the control-plane starts a `startRoomCompositeEgress`
 *   job targeting this room's published tracks, outputting to the
 *   Cloudflare Live Input that fans out to Twitch/Kick.
 */

import { memo, useEffect, useRef, useState } from "react";
import {
  LocalVideoTrack,
  Room,
  Track,
  VideoPresets,
  type RoomConnectOptions,
} from "livekit-client";

interface InjectedLiveKitConfig {
  url?: string;
  roomName?: string;
  token?: string;
}

interface InjectedShowConfig {
  liveKit?: InjectedLiveKitConfig | null;
}

/**
 * Read the LiveKit config injected by the capture-service worker.
 * Returns null if this window isn't running in the capture context
 * (e.g., a developer opening the broadcast URL directly in their own
 * browser without the Puppeteer injection).
 */
function readInjectedLiveKitConfig(): InjectedLiveKitConfig | null {
  if (typeof window === "undefined") return null;
  const injected = (window as unknown as { __injectedShowConfig?: InjectedShowConfig })
    .__injectedShowConfig;
  if (!injected?.liveKit) return null;
  const { url, roomName, token } = injected.liveKit;
  if (!url || !roomName || !token) return null;
  return { url, roomName, token };
}

/**
 * Wait for the VRM canvas to exist and to have non-zero dimensions.
 * VrmEngine populates the canvas asynchronously; we poll at a modest
 * cadence (every 250 ms for up to 30 s) to avoid racing the renderer
 * init.
 */
async function waitForVrmCanvas(
  abortSignal: AbortSignal,
  timeoutMs = 30_000,
  pollMs = 250,
): Promise<HTMLCanvasElement> {
  const deadline = Date.now() + timeoutMs;
  while (!abortSignal.aborted) {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "canvas[data-vrm-canvas]",
    );
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      return canvas;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `[LiveKitBroadcastPublisher] VRM canvas did not appear within ${timeoutMs}ms`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error("[LiveKitBroadcastPublisher] aborted waiting for canvas");
}

type PublisherStatus =
  | "idle"
  | "connecting"
  | "awaiting-canvas"
  | "publishing"
  | "error"
  | "disconnected";

export const LiveKitBroadcastPublisher = memo(function LiveKitBroadcastPublisher(): null {
  const [status, setStatus] = useState<PublisherStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const trackRef = useRef<LocalVideoTrack | null>(null);

  useEffect(() => {
    const config = readInjectedLiveKitConfig();
    if (!config) {
      // Not running in capture-service context — stay idle. This lets
      // developers open the broadcast URL directly without triggering
      // a failed publish attempt. Log once so the absence is visible
      // in devtools console if the developer expected a publish.
      console.log(
        "[LiveKitBroadcastPublisher] no __injectedShowConfig.liveKit — publisher disabled",
      );
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;

    void (async () => {
      setStatus("connecting");
      try {
        // Create + connect the Room. adaptiveStream disabled because
        // we're the only publisher here and always want max fidelity;
        // dynacast disabled for the same reason (nothing to downgrade).
        const room = new Room({
          adaptiveStream: false,
          dynacast: false,
          publishDefaults: {
            videoCodec: "h264",
            videoEncoding: VideoPresets.h1080.encoding,
            simulcast: false,
            // Prefer degradation of spatial layers over frame drops for
            // avatar scenes — viewers tolerate resolution dips better
            // than janky animation.
            degradationPreference: "maintain-framerate",
          },
        });
        if (cancelled) return;
        roomRef.current = room;

        const connectOptions: RoomConnectOptions = {
          autoSubscribe: false,
        };
        await room.connect(config.url, config.token, connectOptions);
        if (cancelled) {
          await room.disconnect();
          return;
        }
        console.log(
          `[LiveKitBroadcastPublisher] connected to ${config.url} room=${config.roomName} participant=${room.localParticipant.identity}`,
        );

        setStatus("awaiting-canvas");
        const canvas = await waitForVrmCanvas(abortController.signal);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        const mediaStream = canvas.captureStream(30);
        const videoTracks = mediaStream.getVideoTracks();
        if (videoTracks.length === 0) {
          throw new Error("[LiveKitBroadcastPublisher] captureStream produced no video tracks");
        }
        const mediaStreamTrack = videoTracks[0];
        if (!mediaStreamTrack) {
          throw new Error("[LiveKitBroadcastPublisher] captureStream produced no video tracks");
        }
        const localVideoTrack = new LocalVideoTrack(mediaStreamTrack, undefined, false);
        trackRef.current = localVideoTrack;

        await room.localParticipant.publishTrack(localVideoTrack, {
          name: "vrm-canvas",
          source: Track.Source.Camera,
          simulcast: false,
          videoEncoding: VideoPresets.h1080.encoding,
        });
        if (cancelled) return;

        setStatus("publishing");
        console.log(
          `[LiveKitBroadcastPublisher] publishing canvas (${canvas.width}x${canvas.height} @ 30fps) as track ${localVideoTrack.sid}`,
        );
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          "[LiveKitBroadcastPublisher] publish failed:",
          message,
        );
        setErrorMessage(message);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
      const room = roomRef.current;
      const track = trackRef.current;
      void (async () => {
        try {
          if (track) {
            await room?.localParticipant.unpublishTrack(track).catch(() => {});
            track.stop();
          }
          await room?.disconnect().catch(() => {});
        } catch (err) {
          console.warn(
            "[LiveKitBroadcastPublisher] cleanup error:",
            err instanceof Error ? err.message : err,
          );
        }
      })();
      roomRef.current = null;
      trackRef.current = null;
    };
  }, []);

  // Mirror the current publishing state onto document.documentElement as
  // a data attribute. This is a lightweight signal the capture-service
  // worker or a test harness can read via `page.evaluate` without
  // relying on console output (which we've seen get dropped in headless).
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-livekit-publisher", status);
    if (errorMessage) {
      document.documentElement.setAttribute(
        "data-livekit-publisher-error",
        errorMessage,
      );
    } else {
      document.documentElement.removeAttribute("data-livekit-publisher-error");
    }
    return () => {
      document.documentElement.removeAttribute("data-livekit-publisher");
      document.documentElement.removeAttribute("data-livekit-publisher-error");
    };
  }, [status, errorMessage]);

  return null;
});

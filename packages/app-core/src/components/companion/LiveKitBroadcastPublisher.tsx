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
  RoomEvent,
  Track,
  VideoPresets,
  type DataPacket_Kind,
  type RemoteParticipant,
  type RoomConnectOptions,
} from "livekit-client";
import { dispatchAppEmoteEvent } from "../../events";
import type { AppEmoteEventDetail } from "../../events";
import { getBroadcastMode } from "../../platform/init";

interface InjectedLiveKitConfig {
  url?: string;
  roomName?: string;
  token?: string;
  /**
   * Transport signal set by CP's alice VRM broadcast path (stream.js
   * when STREAM555_ALICE_LIVEKIT_BROADCAST=true). Must equal
   * 'publisher' for this component to do anything. Any other value
   * (including undefined) is a Hedra subscriber context or a misuse
   * and we stay idle.
   */
  mode?: "publisher" | "subscriber";
}

interface InjectedShowConfig {
  liveKit?: InjectedLiveKitConfig | null;
}

/**
 * Read the LiveKit config injected by the capture-service worker.
 * Returns null if this window isn't running in the capture context,
 * doesn't have all three credentials, or isn't marked publisher mode.
 *
 * Defense-in-depth: the CALL-SITE in BroadcastShell already gates on
 * `getBroadcastMode() === "capture"` before mounting this component.
 * The publisher itself STILL refuses to activate unless every gate
 * agrees — if any future caller mounts this component in a non-capture
 * context, we no-op instead of publishing into the room.
 */
function readInjectedLiveKitConfig(): InjectedLiveKitConfig | null {
  if (typeof window === "undefined") return null;
  // Hard gate: only run under the internal capture transport. The
  // public broadcast transport on alice.rndrntwrk.com/broadcast/* MUST
  // never reach this branch.
  if (getBroadcastMode() !== "capture") return null;
  const injected = (window as unknown as { __injectedShowConfig?: InjectedShowConfig })
    .__injectedShowConfig;
  if (!injected?.liveKit) return null;
  const { url, roomName, token, mode } = injected.liveKit;
  if (!url || !roomName || !token) return null;
  // Hedra subscriber path also populates liveKit config. Without
  // explicit `mode === "publisher"`, stay idle so we don't fight
  // that flow over publishing rights.
  if (mode !== "publisher") return null;
  return { url, roomName, token, mode };
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

/**
 * Wait for the VRM avatar to finish loading and rendering its first
 * real frame. BroadcastShell adds `.avatar-ready` to
 * `document.documentElement` only after `useCompanionSceneStatus()
 * .avatarReady` flips true — the same signal the capture-service's
 * FFmpeg path waits for via `page.waitForSelector('.avatar-ready')`
 * (worker.js:2174).
 *
 * Without this gate, canvas.captureStream + publishTrack start
 * delivering frames to the LiveKit room as soon as the Three.js
 * renderer paints the first frame — which is an empty scene with
 * just the clear color. Egress picks those frames up and pushes them
 * to Cloudflare, and viewers on Twitch see a gray/black background
 * for several seconds before the VRM model appears.
 *
 * ## Why the 20s cap (not 30s)
 *
 * The control-plane's Egress-start path
 * (stream.js post-ready-gate) polls checkRoomPublisher for exactly 30
 * one-second iterations — ~30s wall-clock total — before giving up
 * and skipping Egress for this session. If this client-side wait
 * also capped at 30s, a slow-loading VRM could publish AT t=30s,
 * after the CP's final poll completed and the loop exited: the
 * publish lands in a dead room and Egress never starts.
 *
 * Matching the FFmpeg path's 20s cap at capture-service/worker.js:2174
 * leaves a clear ~10-second margin for publishTrack + the CP's next
 * poll to catch the late-published track. Same semantics as FFmpeg:
 * after 20s we force-publish whatever's in the canvas (blank avatar
 * is better than no stream).
 */
async function waitForAvatarReady(
  abortSignal: AbortSignal,
  timeoutMs = 20_000,
  pollMs = 250,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!abortSignal.aborted) {
    if (document.documentElement.classList.contains("avatar-ready")) {
      return;
    }
    if (Date.now() > deadline) {
      console.warn(
        `[LiveKitBroadcastPublisher] .avatar-ready not detected within ${timeoutMs}ms — publishing anyway to avoid stalling the broadcast`,
      );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error("[LiveKitBroadcastPublisher] aborted waiting for avatar-ready");
}

type PublisherStatus =
  | "idle"
  | "connecting"
  | "awaiting-canvas"
  | "awaiting-avatar"
  | "publishing"
  | "error"
  | "disconnected";

/**
 * Shape of every message sent by the CP via
 * `POST /api/agent/v1/sessions/:id/livekit/broadcast-event` and
 * `LiveKitService.sendDataToRoom()`. The CP guarantees `topic` is a
 * non-empty string; everything else is opaque JSON.
 */
interface BroadcastDataMessage {
  topic: string;
  payload?: unknown;
  ts?: number;
}

/**
 * Decode a LiveKit DataReceived payload (Uint8Array of UTF-8 JSON)
 * into our `{topic,payload,ts}` envelope. Returns `null` if the
 * message is malformed — protects the renderer from crashing on
 * garbage from a misbehaving publisher.
 */
function decodeBroadcastDataMessage(
  payload: Uint8Array,
): BroadcastDataMessage | null {
  try {
    const text = new TextDecoder().decode(payload);
    const parsed = JSON.parse(text) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).topic !== "string"
    ) {
      return null;
    }
    return parsed as BroadcastDataMessage;
  } catch {
    return null;
  }
}

/**
 * Route an incoming data message to the correct window CustomEvent
 * so the existing GlobalEmoteOverlay / VrmStage / ChatAvatar listeners
 * pick it up. Adding a new topic means (a) declaring its payload
 * shape here and (b) dispatching the matching event — the operator
 * UI remains the source of truth for what topics exist.
 *
 * Topics currently handled:
 *   - "emote"           → window "eliza:app-emote" (AppEmoteEventDetail)
 *   - "trigger"         → window "eliza:app-trigger" (forward-compat; not yet consumed)
 *   - "scene-update"    → window "eliza:scene-update" (forward-compat; not yet consumed)
 *
 * Unknown topics are logged once at debug level and dropped so an
 * operator adding a new topic can see it land in the headless
 * Chromium without the renderer throwing.
 */
function dispatchBroadcastDataMessage(msg: BroadcastDataMessage): void {
  if (typeof window === "undefined") return;

  switch (msg.topic) {
    case "emote": {
      const detail = msg.payload as AppEmoteEventDetail | undefined;
      if (
        !detail ||
        typeof detail.emoteId !== "string" ||
        typeof detail.path !== "string" ||
        typeof detail.duration !== "number" ||
        typeof detail.loop !== "boolean"
      ) {
        console.warn(
          "[LiveKitBroadcastPublisher] emote payload missing required fields",
          detail,
        );
        return;
      }
      dispatchAppEmoteEvent(detail);
      return;
    }
    case "trigger": {
      window.dispatchEvent(
        new CustomEvent("eliza:app-trigger", { detail: msg.payload }),
      );
      return;
    }
    case "scene-update": {
      window.dispatchEvent(
        new CustomEvent("eliza:scene-update", { detail: msg.payload }),
      );
      return;
    }
    default: {
      console.debug(
        `[LiveKitBroadcastPublisher] unhandled data topic "${msg.topic}"`,
      );
    }
  }
}

export const LiveKitBroadcastPublisher = memo(function LiveKitBroadcastPublisher(): null {
  const [status, setStatus] = useState<PublisherStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const roomRef = useRef<Room | null>(null);
  const trackRef = useRef<LocalVideoTrack | null>(null);
  const dataListenerDetachRef = useRef<(() => void) | null>(null);

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
          // autoSubscribe=true so the room delivers server-pushed data
          // messages (emote / trigger / scene-update pushed by the CP
          // via sendDataToRoom). We don't actually receive any
          // participant-published AV tracks in the alice broadcast
          // (single-publisher room), so this doesn't cost bandwidth.
          autoSubscribe: true,
        };
        await room.connect(config.url, config.token, connectOptions);
        if (cancelled) {
          await room.disconnect();
          return;
        }
        console.log(
          `[LiveKitBroadcastPublisher] connected to ${config.url} room=${config.roomName} participant=${room.localParticipant.identity}`,
        );

        // Wire operator→stream event propagation. The CP pushes JSON
        // envelopes via RoomServiceClient.sendData; we re-dispatch
        // them as window CustomEvents so GlobalEmoteOverlay / VrmStage
        // / overlays pick them up without knowing anything about
        // LiveKit. This is the piece that makes "operator clicks
        // WAVE" visible on the stream in real time.
        const onData = (
          payload: Uint8Array,
          _participant?: RemoteParticipant,
          _kind?: DataPacket_Kind,
        ) => {
          const msg = decodeBroadcastDataMessage(payload);
          if (!msg) {
            console.warn(
              "[LiveKitBroadcastPublisher] DataReceived: malformed payload, dropping",
            );
            return;
          }
          dispatchBroadcastDataMessage(msg);
        };
        room.on(RoomEvent.DataReceived, onData);
        // Stash the unsubscribe so cleanup can detach it explicitly —
        // room.disconnect() also clears listeners, but detaching
        // first guards against a late post-unmount message leaking
        // into the window event bus.
        dataListenerDetachRef.current = () => {
          try {
            room.off(RoomEvent.DataReceived, onData);
          } catch {
            /* ignore — room may already be disposed */
          }
        };

        setStatus("awaiting-canvas");
        const canvas = await waitForVrmCanvas(abortController.signal);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        // Gate on avatar-ready BEFORE publishing the track. The CP's
        // checkRoomPublisher poll only confirms "video track exists in
        // room" — if we publish before the VRM model is loaded, the
        // first frames are an empty Three.js scene (gray/black).
        // Egress picks those up immediately and viewers see a blank
        // background for several seconds. Matching the FFmpeg path's
        // .avatar-ready gate (capture-service/worker.js:2174) means
        // the very first frame on the wire already has the avatar
        // rendered.
        setStatus("awaiting-avatar");
        await waitForAvatarReady(abortController.signal);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        const mediaStream = canvas.captureStream(30);
        const mediaStreamTrack = mediaStream.getVideoTracks()[0];
        if (!mediaStreamTrack) {
          throw new Error(
            "[LiveKitBroadcastPublisher] captureStream produced no video tracks",
          );
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
      const detachData = dataListenerDetachRef.current;
      if (detachData) {
        detachData();
      }
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
      dataListenerDetachRef.current = null;
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

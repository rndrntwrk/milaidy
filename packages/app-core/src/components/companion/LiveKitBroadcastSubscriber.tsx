/**
 * LiveKitBroadcastSubscriber — plays the live broadcast video track
 * from the current session's LiveKit room into a `<video>` element.
 *
 * ## Why this exists
 *
 * Prior architecture: operator's tab renders its OWN copy of the VRM
 * scene via CompanionShell → CompanionSceneHost → VrmEngine. The
 * broadcast-to-Twitch path is ENTIRELY separate (capture-service's
 * headless Chromium running BroadcastShell). The two renders are only
 * loosely synced via WS events, which is fragile:
 *   - Any animation/lighting/shader glitch in the headless render is
 *     invisible to the operator.
 *   - Any state that drifts between operator's local React state and
 *     the broadcast Chromium shows different things to Alice vs
 *     viewers.
 *   - Debugging live-stream issues requires watching Twitch/Kick
 *     separately.
 *
 * Frontier architecture (matching HeyGen LiveAvatar, D-ID, Anam):
 * there is ONE canonical renderer (the capture-service's Chromium
 * running BroadcastShell, publishing via LiveKitBroadcastPublisher)
 * and BOTH the Twitch/Kick Egress consumer AND the operator's tab
 * subscribe to that single video source. What the operator sees is
 * literally what viewers see (modulo Egress encode + RTMPS delivery
 * latency).
 *
 * This component is the operator-side subscriber. Mount it in any
 * operator shell where a "what's going to air" preview is wanted. It
 * fetches a subscriber token from the CP, connects to the LiveKit
 * room, subscribes to the first published video track, and routes it
 * into the provided `<video>` ref (or a fallback internal element).
 *
 * ## Scope (what's in / out)
 *
 * IN:
 *   - Connect + subscribe to the current session's room.
 *   - Play the first video track in a `<video>` element.
 *   - Graceful handling of "no session yet" / "session not using flag"
 *     — both produce a dimmed placeholder instead of crashing.
 *
 * OUT (deferred to future PRs):
 *   - Audio track playback (alice TTS will come via a separate Hedra
 *     path for now).
 *   - Stats overlay (bitrate, resolution, latency).
 *   - Multi-session switching — the component takes a `sessionId`
 *     prop and re-subscribes when it changes; the outer shell is
 *     responsible for deciding which session is current.
 *
 * ## Props
 *
 *   sessionId: the 555stream session ID to subscribe to. Pass `null`
 *     to render the placeholder without attempting a connection.
 *   fetchSubscriberToken: async callback that hits
 *     `GET /api/agent/v1/sessions/:id/livekit/subscriber-token` and
 *     returns the parsed JSON. Injected by the outer shell so this
 *     component stays framework-agnostic (no direct API client
 *     dependency) — the outer shell already owns the agent bearer
 *     resolution for other calls.
 *   className / style: forwarded to the outer `<div>`. The internal
 *     `<video>` fills the container with `object-fit: cover` so
 *     callers control aspect ratio / size.
 *   onStatusChange: optional callback fired whenever the subscriber
 *     status transitions (idle → connecting → subscribed → error).
 *     Useful for the outer shell to render its own status chip.
 */

import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RoomConnectOptions,
} from "livekit-client";

export interface SubscriberTokenResponse {
  ok: boolean;
  url: string;
  roomName: string;
  token: string;
  identity: string;
  expiresInSec: number;
}

export type SubscriberStatus =
  | "idle"
  | "connecting"
  | "waiting-for-publisher"
  | "subscribed"
  | "error"
  | "disconnected";

export interface LiveKitBroadcastSubscriberProps {
  sessionId: string | null;
  fetchSubscriberToken: (sessionId: string) => Promise<SubscriberTokenResponse>;
  className?: string;
  style?: CSSProperties;
  onStatusChange?: (status: SubscriberStatus, error?: string) => void;
}

export const LiveKitBroadcastSubscriber = memo(function LiveKitBroadcastSubscriber({
  sessionId,
  fetchSubscriberToken,
  className,
  style,
  onStatusChange,
}: LiveKitBroadcastSubscriberProps) {
  const [status, setStatus] = useState<SubscriberStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const attachedTrackRef = useRef<RemoteTrack | null>(null);

  // Notify the parent of status transitions. Ref-wrap the callback so
  // identity changes don't re-run the connect effect below.
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  }, [onStatusChange]);

  // Same pattern for the token fetcher — if the parent passes a fresh
  // function literal every render (common React footgun), we don't
  // want the effect below to tear down the room + reconnect every
  // time. The only thing that should drive reconnection is sessionId.
  const fetchSubscriberTokenRef = useRef(fetchSubscriberToken);
  useEffect(() => {
    fetchSubscriberTokenRef.current = fetchSubscriberToken;
  }, [fetchSubscriberToken]);

  useEffect(() => {
    // No session → stay idle with placeholder. Don't even touch the
    // network.
    if (!sessionId) {
      setStatus("idle");
      setErrorMessage(null);
      onStatusChangeRef.current?.("idle");
      return;
    }

    let cancelled = false;

    void (async () => {
      setStatus("connecting");
      setErrorMessage(null);
      onStatusChangeRef.current?.("connecting");

      try {
        const tokenResp = await fetchSubscriberTokenRef.current(sessionId);
        if (cancelled) return;
        if (!tokenResp?.ok || !tokenResp.token || !tokenResp.url) {
          throw new Error("subscriber token response missing required fields");
        }

        const room = new Room({
          adaptiveStream: true,
          // Dynacast doesn't apply to single-publisher broadcast, but
          // leaving enabled as a forward-compat default.
          dynacast: true,
        });
        roomRef.current = room;

        // Attach publisher track when it arrives. For the alice
        // broadcast the first published camera track IS the canvas
        // composite — attach and pin.
        const onTrackSubscribed = (
          track: RemoteTrack,
          _publication: RemoteTrackPublication,
          _participant: RemoteParticipant,
        ) => {
          if (track.kind !== Track.Kind.Video) return;
          const videoEl = videoRef.current;
          if (!videoEl) return;
          // Detach any previous track (room churn / re-publish).
          if (attachedTrackRef.current && attachedTrackRef.current !== track) {
            try {
              attachedTrackRef.current.detach(videoEl);
            } catch {
              /* ignore */
            }
          }
          track.attach(videoEl);
          attachedTrackRef.current = track;
          setStatus("subscribed");
          onStatusChangeRef.current?.("subscribed");
        };

        const onTrackUnsubscribed = (track: RemoteTrack) => {
          if (track !== attachedTrackRef.current) return;
          const videoEl = videoRef.current;
          if (videoEl) {
            try {
              track.detach(videoEl);
            } catch {
              /* ignore */
            }
          }
          attachedTrackRef.current = null;
          setStatus("waiting-for-publisher");
          onStatusChangeRef.current?.("waiting-for-publisher");
        };

        const onDisconnected = () => {
          if (cancelled) return;
          // Clear the track ref so we don't hold a reference to a
          // dead track until the component unmounts. The video
          // element's `srcObject` is also reset here so the frozen
          // last frame doesn't linger on screen under the placeholder.
          const videoEl = videoRef.current;
          if (attachedTrackRef.current && videoEl) {
            try {
              attachedTrackRef.current.detach(videoEl);
            } catch {
              /* ignore */
            }
          }
          attachedTrackRef.current = null;
          setStatus("disconnected");
          onStatusChangeRef.current?.("disconnected");
        };

        room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
        room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
        room.on(RoomEvent.Disconnected, onDisconnected);

        const connectOptions: RoomConnectOptions = {
          autoSubscribe: true,
        };
        await room.connect(tokenResp.url, tokenResp.token, connectOptions);
        if (cancelled) {
          await room.disconnect();
          return;
        }

        // If publishers are already in the room, iterate their video
        // tracks and attach the first one. LiveKit fires
        // TrackSubscribed for late-arriving tracks, but for tracks
        // already subscribed at connect time we need to walk the
        // current state.
        const walkExisting = () => {
          for (const participant of room.remoteParticipants.values()) {
            for (const publication of participant.videoTrackPublications.values()) {
              const track = publication.track;
              if (track) {
                onTrackSubscribed(
                  track,
                  publication,
                  participant,
                );
                return true;
              }
            }
          }
          return false;
        };

        if (!walkExisting()) {
          setStatus("waiting-for-publisher");
          onStatusChangeRef.current?.("waiting-for-publisher");
        }
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          "[LiveKitBroadcastSubscriber] subscribe failed:",
          message,
        );
        setErrorMessage(message);
        setStatus("error");
        onStatusChangeRef.current?.("error", message);
      }
    })();

    return () => {
      cancelled = true;
      const videoEl = videoRef.current;
      const attached = attachedTrackRef.current;
      if (attached && videoEl) {
        try {
          attached.detach(videoEl);
        } catch {
          /* ignore */
        }
      }
      attachedTrackRef.current = null;
      void roomRef.current?.disconnect().catch(() => {});
      roomRef.current = null;
    };
    // Intentionally exclude fetchSubscriberToken — we read it via
    // fetchSubscriberTokenRef so a new function identity on re-render
    // doesn't tear down the room. Only sessionId should drive reconnect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  return (
    <div
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        backgroundColor: "#000",
        overflow: "hidden",
        ...style,
      }}
      data-livekit-subscriber={status}
      data-livekit-subscriber-error={errorMessage ?? undefined}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      {status !== "subscribed" ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.6)",
            fontSize: 14,
            letterSpacing: 0.25,
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {status === "error"
            ? `Broadcast unavailable — ${errorMessage ?? "unknown error"}`
            : status === "waiting-for-publisher"
              ? "Waiting for broadcast to start…"
              : status === "connecting"
                ? "Connecting to broadcast…"
                : status === "disconnected"
                  ? "Broadcast disconnected"
                  : "Broadcast idle"}
        </div>
      ) : null}
    </div>
  );
});

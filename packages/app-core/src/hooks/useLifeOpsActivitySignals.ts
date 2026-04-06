import { useEffect, useRef } from "react";
import type {
  CaptureLifeOpsActivitySignalRequest,
  LifeOpsActivitySignal,
} from "@miladyai/shared/contracts/lifeops";
import { client } from "../api";
import { isApiError } from "../api/client-types-core";
import { isElectrobunRuntime } from "../bridge/electrobun-runtime";
import { APP_PAUSE_EVENT, APP_RESUME_EVENT } from "../events";
import { isNative } from "../platform";
import { loadDesktopWorkspaceSnapshot } from "../utils/desktop-workspace";

const APP_SIGNAL_DEDUP_WINDOW_MS = 5_000;
const PAGE_HEARTBEAT_MS = 60_000;
const DESKTOP_POWER_POLL_MS = 60_000;

type SignalFingerprint = {
  fingerprint: string;
  sentAtMs: number;
};

function resolveActivityPlatform(): string {
  if (isElectrobunRuntime()) {
    return "desktop_app";
  }
  if (isNative) {
    return "mobile_app";
  }
  return "web_app";
}

function fingerprintSignal(
  signal: CaptureLifeOpsActivitySignalRequest,
): string {
  return JSON.stringify([
    signal.source,
    signal.platform ?? "",
    signal.state,
    signal.idleState ?? "",
    signal.idleTimeSeconds ?? "",
    signal.onBattery ?? "",
    signal.metadata ?? {},
  ]);
}

export function useLifeOpsActivitySignals(): void {
  const platformRef = useRef(resolveActivityPlatform());
  const lastSentRef = useRef<Map<string, SignalFingerprint>>(new Map());

  useEffect(() => {
    let mounted = true;

    const reportCaptureError = (error: unknown): void => {
      if (
        isApiError(error) &&
        (error.kind === "network" || error.kind === "timeout")
      ) {
        return;
      }
      console.warn("[lifeops] failed to capture activity signal", error);
    };

    const sendSignal = async (
      signal: CaptureLifeOpsActivitySignalRequest,
    ): Promise<LifeOpsActivitySignal | null> => {
      if (!mounted) {
        return null;
      }
      const normalized: CaptureLifeOpsActivitySignalRequest = {
        ...signal,
        platform: signal.platform ?? platformRef.current,
      };
      const fingerprint = fingerprintSignal(normalized);
      const dedupeKey = `${normalized.source}:${normalized.platform ?? ""}`;
      const previous = lastSentRef.current.get(dedupeKey);
      const nowMs = Date.now();
      if (
        previous &&
        previous.fingerprint === fingerprint &&
        nowMs - previous.sentAtMs < APP_SIGNAL_DEDUP_WINDOW_MS
      ) {
        return null;
      }
      lastSentRef.current.set(dedupeKey, { fingerprint, sentAtMs: nowMs });
      const { signal: persisted } =
        await client.captureLifeOpsActivitySignal(normalized);
      return persisted;
    };

    const fireAndForget = (
      signal: CaptureLifeOpsActivitySignalRequest,
    ): void => {
      void sendSignal(signal).catch(reportCaptureError);
    };

    const emitPageState = (reason: string): void => {
      const isVisible = document.visibilityState === "visible";
      const hasFocus =
        typeof document.hasFocus === "function" ? document.hasFocus() : true;
      fireAndForget({
        source: "page_visibility",
        state: isVisible && hasFocus ? "active" : "background",
        metadata: {
          reason,
          visibilityState: document.visibilityState,
          hasFocus,
        },
      });
    };

    const emitLifecycleState = (state: "active" | "background"): void => {
      fireAndForget({
        source: "app_lifecycle",
        state,
        metadata: { reason: state === "active" ? "resume" : "pause" },
      });
    };

    const emitDesktopSnapshot = async (reason: string): Promise<void> => {
      try {
        if (!isElectrobunRuntime()) {
          return;
        }
        const snapshot = await loadDesktopWorkspaceSnapshot();
        if (!snapshot.supported || !snapshot.power) {
          return;
        }

        const state =
          snapshot.power.idleState === "locked"
            ? "locked"
            : snapshot.power.idleState === "idle"
              ? "idle"
              : snapshot.window.focused &&
                  document.visibilityState === "visible"
                ? "active"
                : "background";
        await sendSignal({
          source: "desktop_power",
          state,
          idleState: snapshot.power.idleState,
          idleTimeSeconds: Math.max(0, Math.trunc(snapshot.power.idleTime)),
          onBattery: snapshot.power.onBattery,
          metadata: {
            reason,
            windowFocused: snapshot.window.focused,
            windowVisible: snapshot.window.visible,
            documentVisibility: document.visibilityState,
          },
        });
      } catch (error) {
        reportCaptureError(error);
      }
    };

    const handleVisibilityChange = (): void => {
      emitPageState("visibilitychange");
    };
    const handleFocus = (): void => {
      emitPageState("focus");
      void emitDesktopSnapshot("focus");
    };
    const handleBlur = (): void => {
      emitPageState("blur");
      void emitDesktopSnapshot("blur");
    };
    const handleResume = (): void => {
      emitLifecycleState("active");
      emitPageState("resume");
      void emitDesktopSnapshot("resume");
    };
    const handlePause = (): void => {
      emitLifecycleState("background");
      emitPageState("pause");
      void emitDesktopSnapshot("pause");
    };

    emitLifecycleState("active");
    emitPageState("mount");
    void emitDesktopSnapshot("mount");

    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener(APP_RESUME_EVENT, handleResume);
    document.addEventListener(APP_PAUSE_EVENT, handlePause);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    const pageHeartbeat = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        emitPageState("heartbeat");
      }
    }, PAGE_HEARTBEAT_MS);
    const desktopPoller = window.setInterval(() => {
      void emitDesktopSnapshot("poll");
    }, DESKTOP_POWER_POLL_MS);

    return () => {
      mounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener(APP_RESUME_EVENT, handleResume);
      document.removeEventListener(APP_PAUSE_EVENT, handlePause);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      window.clearInterval(pageHeartbeat);
      window.clearInterval(desktopPoller);
    };
  }, []);
}

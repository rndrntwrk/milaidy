import { client } from "@miladyai/app-core/api";
import { useApp } from "@miladyai/app-core/state";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@miladyai/ui";
import { ChevronRight, Video, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  OPERATOR_ACTION_BUTTON_BASE_CLASSNAME,
  OPERATOR_ACTION_BUTTON_TONE_CLASSNAME,
  OperatorPill,
} from "./OperatorPrimitives";
import type { Stream555LaunchMode } from "./stream555-setup";
import type { useCompanionStageOperator } from "./useCompanionStageOperator";

type NativeSetup = Awaited<ReturnType<typeof client.getStream555NativeSetup>>;
const CAPTURE_LABELS: Record<NativeSetup["status"], string> = {
  stopped: "Stopped",
  preflighting: "Checking readiness",
  starting: "Starting",
  connecting: "Connecting",
  live: "Live",
  reconnecting: "Reconnecting",
  stopping: "Stopping",
  failed: "Failed",
};
const CONTINUITY_LABELS = {
  live_output_active: "Live program",
  bootstrap_keepalive_active: "Fallback playback",
  handoff_in_progress: "Handoff in progress",
};
const PUBLISHER_LABELS = {
  realtimekit_rtmp_out: "Live Studio",
  capture_service_rtmps: "Continuity video",
};

export function CompanionGoLiveModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferredMode: Stream555LaunchMode;
  onPreferredModeChange: (mode: Stream555LaunchMode) => void;
  operator: ReturnType<typeof useCompanionStageOperator>;
}) {
  const { t } = useApp();
  const [nativeSetup, setNativeSetup] = useState<NativeSetup | null>(null);
  const [nativeSetupError, setNativeSetupError] = useState<string | null>(null);
  const [nativeSetupLoading, setNativeSetupLoading] = useState(false);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const nativeReadGeneration = useRef(0);
  const refreshRuntimeStatus = useCallback(() => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const generation = ++nativeReadGeneration.current;
    setNativeSetupLoading(true);
    setNativeSetup(null);
    setNativeSetupError(null);
    const refresh = client.getStream555NativeSetup().then(saved => {
      if (generation === nativeReadGeneration.current) setNativeSetup(saved);
    }).catch(() => {
      if (generation === nativeReadGeneration.current) {
        setNativeSetup(null);
        setNativeSetupError("Native Studio setup is unavailable. Configure its session and native admission before continuing.");
      }
    }).finally(() => {
      if (generation === nativeReadGeneration.current) setNativeSetupLoading(false);
    });
    refreshInFlightRef.current = refresh;
    void refresh.then(() => {
      if (refreshInFlightRef.current === refresh) refreshInFlightRef.current = null;
    });
    return refresh;
  }, []);

  useEffect(() => {
    if (open) void refreshRuntimeStatus();
    return () => {
      nativeReadGeneration.current++;
      refreshInFlightRef.current = null;
    };
  }, [open, refreshRuntimeStatus]);

  const openStudio = () => {
    if (nativeSetup && !nativeSetupError && !nativeSetupLoading) {
      window.open(nativeSetup.studioUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="go-live-modal border-0 bg-transparent p-0 shadow-none"
        showCloseButton={false}
      >
        <div className="go-live-modal__shell">
          <div className="go-live-modal__header">
            <div className="go-live-modal__header-top">
              <div className="go-live-modal__header-copy">
                <div className="go-live-modal__eyebrow">
                  <Video className="h-4 w-4" />
                  {t("aliceoperator.programmingStream", { defaultValue: "Programming Stream" })}
                </div>
                <DialogTitle className="go-live-modal__title">
                  {t("aliceoperator.nativeStudioTitle", { defaultValue: "Shared Stream Studio" })}
                </DialogTitle>
                <DialogDescription className="go-live-modal__description">
                  {t("aliceoperator.nativeStudioDescription", {
                    defaultValue: "Review the saved native session, then open its shared Studio to edit or go live.",
                  })}
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" className="go-live-modal__close" aria-label="Close go live modal">
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
          </div>

          <div className="go-live-modal__body">
            <section className="space-y-4" aria-label="Shared native Studio setup">
              <h3>555 Stream Studio</h3>
              <p>Edit the saved program in the same Studio used by direct 555 Stream. Refresh here after saving there.</p>
              <Button onClick={() => void refreshRuntimeStatus()} disabled={nativeSetupLoading}>Refresh status</Button>
              {nativeSetupLoading ? <p role="status">Reading saved Studio setup…</p> : null}
              {nativeSetupError ? <p role="alert">{nativeSetupError}</p> : null}
              {nativeSetup && !nativeSetupError ? <>
                <p>Session {nativeSetup.sessionId} · Revision {nativeSetup.revision}</p>
                <p role="status">Capture: {CAPTURE_LABELS[nativeSetup.status]}</p>
                {nativeSetup.continuity ? <p>
                  Program: {CONTINUITY_LABELS[nativeSetup.continuity.status]} · Publisher: {PUBLISHER_LABELS[nativeSetup.continuity.publisher]}
                </p> : null}
                <p>Canvas {nativeSetup.aspectRatio || "Not set"} · Overlay {nativeSetup.overlay.enabled ? nativeSetup.overlay.mode || "Enabled" : "Off"}</p>
                <p>Layout {nativeSetup.activeLayout || "Not set"} · PiP {nativeSetup.pipPosition || "Not set"}</p>
                <ul aria-label="Saved sources">{nativeSetup.sources.map(source =>
                  <li key={source.id}>{source.name || source.id} · {source.type}{source.gameId ? ` · ${source.gameId}` : ""}{source.avatarPreset ? ` · ${source.avatarPreset}` : ""} · {source.visible ? "Visible" : "Hidden"}</li>)}</ul>
                <p>Destinations: {nativeSetup.destinationsReady ? "Ready" : "Setup required"}</p>
                <ul aria-label="Native destination readiness">{nativeSetup.destinations.map(destination =>
                  <li key={destination.platformId}>{destination.platformId} · {destination.enabled ? "Enabled" : "Disabled"} · {destination.configured ? "Configured" : "Not configured"}</li>)}</ul>
                <p>Destination readiness does not confirm platform delivery.</p>
                <a href={nativeSetup.studioUrl} target="_blank" rel="noopener noreferrer">Open shared Studio</a>
              </> : null}
            </section>
          </div>

          <div className="go-live-modal__footer">
            <div className="go-live-modal__footer-status">
              {nativeSetup && !nativeSetupError ? <OperatorPill>{CAPTURE_LABELS[nativeSetup.status]}</OperatorPill> : null}
            </div>
            <div className="go-live-modal__footer-actions">
              <div className="go-live-modal__footer-secondary">
                <DialogClose asChild>
                  <Button variant="ghost" size="sm" className={OPERATOR_ACTION_BUTTON_BASE_CLASSNAME}>
                    {t("aliceoperator.cancel", { defaultValue: "Cancel" })}
                  </Button>
                </DialogClose>
              </div>
              <div className="go-live-modal__footer-primary">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`${OPERATOR_ACTION_BUTTON_BASE_CLASSNAME} ${OPERATOR_ACTION_BUTTON_TONE_CLASSNAME.accent}`}
                  disabled={!nativeSetup || Boolean(nativeSetupError) || nativeSetupLoading}
                  onClick={openStudio}
                >
                  Open shared Studio
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

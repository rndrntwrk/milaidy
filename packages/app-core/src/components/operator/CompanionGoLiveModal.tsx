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
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Radio,
  Sparkles,
  Video,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  OPERATOR_ACTION_BUTTON_BASE_CLASSNAME,
  OPERATOR_ACTION_BUTTON_TONE_CLASSNAME,
  OPERATOR_SECTION_DESCRIPTION_CLASSNAME,
  OPERATOR_SECTION_EYEBROW_CLASSNAME,
  OPERATOR_SECTION_TITLE_CLASSNAME,
  OperatorPill,
  type OperatorPillTone,
} from "./OperatorPrimitives";
import {
  buildStream555SetupSummary,
  findStream555Plugin,
  titleForStream555LaunchMode,
  type Stream555LaunchMode,
} from "./stream555-setup";
import {
  formatOperatorErrorMessage,
} from "./operator-error-messages";
import type { useCompanionStageOperator } from "./useCompanionStageOperator";

type GoLiveStep =
  | "setup-required"
  | "channel-selection"
  | "segment-selection"
  | "review-and-launch";

type CompanionStageOperatorState = ReturnType<typeof useCompanionStageOperator>;

const STEP_ORDER: readonly { key: GoLiveStep; label: string }[] = [
  { key: "setup-required", label: "Setup" },
  { key: "channel-selection", label: "Channels" },
  { key: "segment-selection", label: "Mode" },
  { key: "review-and-launch", label: "Review" },
] as const;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function labelForDestinationReadiness(
  readinessState: ReturnType<
    typeof buildStream555SetupSummary
  >["destinations"][number]["readinessState"],
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  switch (readinessState) {
    case "ready":
      return t("aliceoperator.destinationReady", {
        defaultValue: "Ready for launch",
      });
    case "missing-stream-key":
      return t("aliceoperator.destinationMissingKey", {
        defaultValue: "Missing stream key",
      });
    case "missing-url":
      return t("aliceoperator.destinationMissingUrl", {
        defaultValue: "Missing RTMP URL",
      });
    case "disabled":
    default:
      return t("aliceoperator.destinationDisabled", {
        defaultValue: "Disabled",
      });
  }
}


function descriptionForMode(
  mode: Stream555LaunchMode,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (mode) {
    case "screen-share":
      return t("aliceoperator.mode.screen-share.description", {
        defaultValue:
          "Broadcast the active operator surface with Alice held on camera.",
      });
    case "play-games":
      return t("aliceoperator.mode.play-games.description", {
        defaultValue:
          "Take Alice live and route the selected arcade game into the main feed.",
      });
    case "reaction":
      return t("aliceoperator.mode.reaction.description", {
        defaultValue:
          "Start live with reaction segment orchestration active from the first beat.",
      });
    case "radio":
      return t("aliceoperator.mode.radio.description", {
        defaultValue:
          "Launch an audio-first Alice set with radio control engaged.",
      });
    case "camera":
    default:
      return t("aliceoperator.mode.camera.description", {
        defaultValue:
          "Bring Alice live from the main stage with the cleanest camera launch.",
      });
  }
}

function supportLabelForMode(
  mode: Stream555LaunchMode,
  operator: CompanionStageOperatorState,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (mode === "play-games" && !operator.arcade.runtimeAvailable) {
    return t("aliceoperator.mode.play-games.unavailable", {
      defaultValue: "Requires Alice arcade runtime",
    });
  }
  if (mode === "screen-share") {
    return t("aliceoperator.mode.screen-share.support", {
      defaultValue: "Uses the 555stream scene bridge",
    });
  }
  if (mode === "reaction") {
    return t("aliceoperator.mode.reaction.support", {
      defaultValue: "Uses segment bootstrap and override",
    });
  }
  if (mode === "radio") {
    return t("aliceoperator.mode.radio.support", {
      defaultValue: "Uses radio control after go-live",
    });
  }
  if (mode === "play-games") {
    return t("aliceoperator.mode.play-games.support", {
      defaultValue: "Uses five55-games go-live play",
    });
  }
  return t("aliceoperator.mode.camera.support", {
    defaultValue: "Fastest path to verified live",
  });
}

function availabilityLabelForMode(
  mode: Stream555LaunchMode,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (mode) {
    case "radio":
      return t("aliceoperator.mode.radio.availability", {
        defaultValue: "Audio-first",
      });
    case "screen-share":
      return t("aliceoperator.mode.screen-share.availability", {
        defaultValue: "Alice in hold",
      });
    case "play-games":
      return t("aliceoperator.mode.play-games.availability", {
        defaultValue: "Game hero",
      });
    case "reaction":
      return t("aliceoperator.mode.reaction.availability", {
        defaultValue: "Segments required",
      });
    case "camera":
    default:
      return t("aliceoperator.mode.camera.availability", {
        defaultValue: "Camera full",
      });
  }
}

function modeEnabled(
  mode: Stream555LaunchMode,
  operator: CompanionStageOperatorState,
) {
  if (mode === "play-games") {
    return operator.arcade.runtimeAvailable;
  }
  return true;
}

function findStepIndex(step: GoLiveStep) {
  return STEP_ORDER.findIndex((entry) => entry.key === step);
}

function InlineNoticeCard({
  notice,
  noticeRef,
}: {
  notice: {
    tone: "success" | "warning" | "error";
    message: string;
    state?: "success" | "partial" | "blocked" | "failed";
    followUp?: { label: string; detail: string };
  };
  noticeRef?: { current: HTMLDivElement | null };
}) {
  const isAlert = notice.tone === "error" || notice.state === "blocked";
  const toneClass =
    notice.tone === "success"
      ? "border-ok/26 bg-ok/10 text-ok"
      : notice.tone === "warning"
        ? "border-warn/26 bg-warn/10 text-warn"
        : "border-danger/26 bg-danger/10 text-danger";

  return (
    <div
      ref={noticeRef}
      role={isAlert ? "alert" : "status"}
      aria-live={isAlert ? "assertive" : "polite"}
      aria-atomic="true"
      tabIndex={-1}
      className={`rounded-[1.5rem] border px-4 py-3 outline-none ${toneClass}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <OperatorPill
          tone={
            notice.tone === "success"
              ? "success"
              : notice.tone === "warning"
                ? "warning"
                : "danger"
          }
        >
          {notice.state ?? notice.tone}
        </OperatorPill>
      </div>
      <p className="mt-3 text-sm leading-6">{notice.message}</p>
      {notice.followUp ? (
        <div className="mt-3 rounded-[1.25rem] border border-current/15 bg-black/16 px-3 py-2 text-xs leading-5">
          <div className="font-semibold uppercase tracking-[0.14em]">
            {notice.followUp.label}
          </div>
          <div className="mt-1 opacity-90">{notice.followUp.detail}</div>
        </div>
      ) : null}
    </div>
  );
}

export function CompanionGoLiveModal({
  open,
  onOpenChange,
  preferredMode,
  onPreferredModeChange,
  operator,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferredMode: Stream555LaunchMode;
  onPreferredModeChange: (mode: Stream555LaunchMode) => void;
  operator: CompanionStageOperatorState;
}) {
  const { plugins, t } = useApp();

  const [step, setStep] = useState<GoLiveStep>("setup-required");
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [launchMode, setLaunchMode] =
    useState<Stream555LaunchMode>(preferredMode);
  const [launching, setLaunching] = useState(false);
  const [inlineNotice, setInlineNotice] = useState<{
    tone: "success" | "warning" | "error";
    message: string;
    state?: "success" | "partial" | "blocked" | "failed";
    followUp?: { label: string; detail: string };
  } | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const refreshedOnOpenRef = useRef(false);
  const channelSelectionTitleId = useId();
  const modeSelectionTitleId = useId();
  const reviewTitleId = useId();

  const streamPlugin = useMemo(() => findStream555Plugin(plugins), [plugins]);
  const summary = useMemo(
    () => buildStream555SetupSummary(streamPlugin),
    [streamPlugin],
  );
  const [nativeSetup, setNativeSetup] = useState<Awaited<ReturnType<typeof client.getStream555NativeSetup>> | null>(null);
  const [nativeSetupError, setNativeSetupError] = useState<string | null>(null);
  const [nativeSetupLoading, setNativeSetupLoading] = useState(false);
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
        setNativeSetupError('Native Studio setup is unavailable. Configure its session and native admission before continuing.');
      }
    }).finally(() => {
      if (generation === nativeReadGeneration.current) setNativeSetupLoading(false);
    });
    refreshInFlightRef.current = refresh;
    void refresh.then(
      () => {
        if (refreshInFlightRef.current === refresh) {
          refreshInFlightRef.current = null;
        }
      },
      () => {
        if (refreshInFlightRef.current === refresh) {
          refreshInFlightRef.current = null;
        }
      },
    );
    return refresh;
  }, []);

  useEffect(() => {
    if (!open) {
      refreshedOnOpenRef.current = false;
      nativeReadGeneration.current++;
      refreshInFlightRef.current = null;
      return;
    }
    if (refreshedOnOpenRef.current) return;
    refreshedOnOpenRef.current = true;
    void refreshRuntimeStatus();
    return () => { nativeReadGeneration.current++; refreshInFlightRef.current = null; };
  }, [open, refreshRuntimeStatus]);

  useEffect(() => {
    if (!open) return;
    setInlineNotice(null);
    setLaunchMode(preferredMode);
    setStep("setup-required");
    setSelectedChannels(
      summary.destinations
        .filter((destination) => destination.readinessState === "ready")
        .map((destination) => destination.id),
    );
  }, [open, preferredMode, summary.destinations, summary.setupRequired]);

  useEffect(() => {
    if (!inlineNotice || !noticeRef.current) return;
    const node = noticeRef.current;
    requestAnimationFrame(() => {
      node.focus({ preventScroll: true });
      node.scrollIntoView({ block: "nearest" });
    });
  }, [inlineNotice]);

  const handleLaunch = useCallback(async () => {
    setLaunching(true);
    setInlineNotice(null);
    try {
      const result = await operator.performGuidedGoLive({
        channels: selectedChannels,
        launchMode,
        selectedGameId: operator.arcade.selectedGameId,
      });
      if (result.state === "success") {
        onPreferredModeChange(launchMode);
        onOpenChange(false);
        return;
      }
      setInlineNotice(result);
    } finally {
      setLaunching(false);
    }
  }, [
    launchMode,
    onOpenChange,
    onPreferredModeChange,
    operator,
    selectedChannels,
  ]);

  const handleAdvance = useCallback(async () => {
    if (step === "setup-required") {
      if (nativeSetup && !nativeSetupError && !nativeSetupLoading) {
        window.open(nativeSetup.studioUrl, "_blank", "noopener,noreferrer");
      }
      return;
    }
    if (step === "channel-selection") {
      if (selectedChannels.length === 0) {
        setInlineNotice({
          tone: "warning",
          message: t("aliceoperator.selectChannels", {
            defaultValue: "Select at least one ready channel for this launch.",
          }),
        });
        return;
      }
      setStep("segment-selection");
      return;
    }
    if (step === "segment-selection") {
      setStep("review-and-launch");
      return;
    }
    void handleLaunch();
  }, [
    handleLaunch,
    selectedChannels.length,
    step,
    nativeSetup,
    nativeSetupError,
    nativeSetupLoading,
    t,
  ]);

  const handleBack = useCallback(() => {
    const index = findStepIndex(step);
    if (index <= 0) return;
    setStep(STEP_ORDER[index - 1]?.key ?? "setup-required");
  }, [step]);

  const modeOptions = useMemo(
    () =>
      (
        ["camera", "radio", "screen-share", "play-games", "reaction"] as const
      ).map((mode) => ({
        value: mode,
        title: titleForStream555LaunchMode(mode, t),
        description: descriptionForMode(mode, t),
        availability: availabilityLabelForMode(mode, t),
        support: supportLabelForMode(mode, operator, t),
        enabled: modeEnabled(mode, operator),
      })),
    [operator, t],
  );

  const reviewRows = useMemo(
    () => [
      {
        label: t("aliceoperator.review.launchMode", {
          defaultValue: "Launch mode",
        }),
        value: titleForStream555LaunchMode(launchMode, t),
      },
      {
        label: t("aliceoperator.review.channels", {
          defaultValue: "Channels",
        }),
        value:
          summary.destinations
            .filter((destination) => selectedChannels.includes(destination.id))
            .map((destination) => destination.label)
            .join(", ") ||
          t("aliceoperator.noneSelected", { defaultValue: "None selected" }),
      },
      {
        label: t("aliceoperator.review.layout", {
          defaultValue: "Alice layout",
        }),
        value:
          launchMode === "screen-share" || launchMode === "play-games"
            ? t("aliceoperator.layout.cameraHold", {
                defaultValue: "Camera hold",
              })
            : t("aliceoperator.layout.cameraFull", {
                defaultValue: "Camera full",
              }),
      },
      ...(launchMode === "play-games"
        ? [
            {
              label: t("aliceoperator.review.game", {
                defaultValue: "Selected game",
              }),
              value: operator.arcade.selectedGameLabel,
            },
          ]
        : []),
    ],
    [
      launchMode,
      operator.arcade.selectedGameLabel,
      selectedChannels,
      summary.destinations,
      t,
    ],
  );

  const activeInlineNotice = inlineNotice;
  const activeStepIndex = findStepIndex(step);
  const renderInlineNotice = () =>
    activeInlineNotice ? (
      <div className="mt-4">
        <InlineNoticeCard notice={activeInlineNotice} noticeRef={noticeRef} />
      </div>
    ) : null;

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
                  {t("aliceoperator.programmingStream", {
                    defaultValue: "Programming Stream",
                  })}
                </div>
                <DialogTitle className="go-live-modal__title">
                  {t("aliceoperator.nativeStudioTitle", {
                    defaultValue: "Shared Stream Studio",
                  })}
                </DialogTitle>
                <DialogDescription className="go-live-modal__description">
                  {t("aliceoperator.nativeStudioDescription", {
                    defaultValue:
                      "Review the saved native session, then open its shared Studio to edit or go live.",
                  })}
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="go-live-modal__close"
                  aria-label="Close go live modal"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
            </div>
            <ol
              className="go-live-modal__stepper"
              data-go-live-stepper
              aria-label="Go live progress"
            >
              {STEP_ORDER.map((entry, index) => {
                const isActive = index === activeStepIndex;
                const isComplete = activeStepIndex > index;
                return (
                  <li
                    key={entry.key}
                    className={`go-live-modal__step${
                      isActive
                        ? " go-live-modal__step--active"
                        : isComplete
                          ? " go-live-modal__step--complete"
                          : ""
                    }`}
                    data-go-live-step={entry.key}
                    data-step-state={
                      isActive ? "active" : isComplete ? "complete" : "inactive"
                    }
                    aria-current={isActive ? "step" : undefined}
                  >
                    <span className="go-live-modal__step-index">
                      {index + 1}
                    </span>
                    <span className="go-live-modal__step-label">
                      {entry.label}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="go-live-modal__body">
            {step === "setup-required" ? (
              <section className="space-y-4" aria-label="Shared native Studio setup">
                {renderInlineNotice()}
                <h3>555 Stream Studio</h3>
                <p>Edit the saved program in the same Studio used by direct 555 Stream. Refresh here after saving there.</p>
                <Button onClick={() => void refreshRuntimeStatus()} disabled={nativeSetupLoading}>Refresh status</Button>
                {nativeSetupLoading ? <p role="status">Reading saved Studio setup…</p> : null}
                {nativeSetupError ? <p role="alert">{nativeSetupError}</p> : null}
                {nativeSetup && !nativeSetupError ? <>
                  <p>Session {nativeSetup.sessionId} · Revision {nativeSetup.revision} · {nativeSetup.active ? 'Live' : 'Offline'}</p>
                  <p>Canvas {nativeSetup.aspectRatio || 'Not set'} · Overlay {nativeSetup.overlay.enabled ? nativeSetup.overlay.mode || 'Enabled' : 'Off'}</p>
                  <p>Layout {nativeSetup.activeLayout || 'Not set'} · PiP {nativeSetup.pipPosition || 'Not set'}</p>
                  <ul aria-label="Saved sources">{nativeSetup.sources.map(source =>
                    <li key={source.id}>{source.name || source.id} · {source.type}{source.gameId ? ` · ${source.gameId}` : ''}{source.avatarPreset ? ` · ${source.avatarPreset}` : ''} · {source.visible ? 'Visible' : 'Hidden'}</li>)}</ul>
                  <ul aria-label="Native destination readiness">{nativeSetup.destinations.map(destination =>
                    <li key={destination.platformId}>{destination.platformId} · {destination.enabled ? 'Enabled' : 'Disabled'} · {destination.configured ? 'Configured' : 'Not configured'}</li>)}</ul>
                  <a href={nativeSetup.studioUrl} target="_blank" rel="noopener noreferrer">Open shared Studio</a>
                </> : null}
              </section>
            ) : null}

            {step === "channel-selection" ? (
              <div className="space-y-4">
                <div>
                  <div className={OPERATOR_SECTION_EYEBROW_CLASSNAME}>
                    {t("aliceoperator.channelSelectionEyebrow", {
                      defaultValue: "Channel selection",
                    })}
                  </div>
                  <div className={`${OPERATOR_SECTION_TITLE_CLASSNAME} mt-2`}>
                    {t("aliceoperator.channelSelectionTitle", {
                      defaultValue: "Choose where Alice should go live",
                    })}
                  </div>
                  <p
                    className={`${OPERATOR_SECTION_DESCRIPTION_CLASSNAME} mt-2`}
                  >
                    {t("aliceoperator.channelSelectionHint", {
                      defaultValue:
                        "Only ready destinations can be selected for the current launch.",
                    })}
                  </p>
                </div>
                {renderInlineNotice()}
                <fieldset
                  className="space-y-3"
                  aria-labelledby={channelSelectionTitleId}
                >
                  <legend id={channelSelectionTitleId} className="sr-only">
                    {t("aliceoperator.channelSelectionTitle", {
                      defaultValue: "Choose where Alice should go live",
                    })}
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {summary.destinations.map((destination) => {
                      const active = selectedChannels.includes(destination.id);
                      const selectable = destination.readinessState === "ready";
                      return (
                        <label
                          key={destination.id}
                          className={`rounded-[1.5rem] border px-4 py-4 text-left transition ${
                            active
                              ? "border-accent/35 bg-accent/12"
                              : "border-border/35 bg-bg-elevated"
                          } ${!selectable ? "cursor-not-allowed opacity-60" : "hover:border-border/60 hover:bg-bg-hover focus-within:ring-2 focus-within:ring-accent/35"}`}
                        >
                          <input
                            type="checkbox"
                            className="sr-only"
                            checked={active}
                            disabled={!selectable}
                            onChange={() =>
                              setSelectedChannels((current) =>
                                current.includes(destination.id)
                                  ? current.filter(
                                      (entry) => entry !== destination.id,
                                    )
                                  : [...current, destination.id],
                              )
                            }
                          />
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-medium text-txt">
                                {destination.label}
                              </div>
                              <div className="mt-1 text-sm text-muted-strong">
                                {labelForDestinationReadiness(
                                  destination.readinessState,
                                  t,
                                )}
                              </div>
                            </div>
                            {active ? (
                              <OperatorPill tone="accent">
                                Selected
                              </OperatorPill>
                            ) : null}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            ) : null}

            {step === "segment-selection" ? (
              <div className="space-y-4">
                <div>
                  <div className={OPERATOR_SECTION_EYEBROW_CLASSNAME}>
                    {t("aliceoperator.modeSelectionEyebrow", {
                      defaultValue: "Launch mode",
                    })}
                  </div>
                  <div
                    id={modeSelectionTitleId}
                    className={`${OPERATOR_SECTION_TITLE_CLASSNAME} mt-2`}
                  >
                    {t("aliceoperator.modeSelectionTitle", {
                      defaultValue: "Choose Alice's launch format",
                    })}
                  </div>
                  <p
                    className={`${OPERATOR_SECTION_DESCRIPTION_CLASSNAME} mt-2`}
                  >
                    {t("aliceoperator.modeSelectionHint", {
                      defaultValue:
                        "These modes mirror the old Alice launch contract while using the current runtime.",
                    })}
                  </p>
                </div>
                {renderInlineNotice()}
                <fieldset
                  className="space-y-4"
                  aria-labelledby={modeSelectionTitleId}
                >
                  <legend className="sr-only">
                    {t("aliceoperator.modeSelectionTitle", {
                      defaultValue: "Choose Alice's launch format",
                    })}
                  </legend>
                  <div
                    className="go-live-modal__mode-grid"
                    data-go-live-mode-grid
                  >
                    {modeOptions.map((option) => {
                      const active = option.value === launchMode;
                      const icon =
                        option.value === "camera" ? (
                          <Camera className="h-5 w-5" />
                        ) : option.value === "radio" ? (
                          <Radio className="h-5 w-5" />
                        ) : option.value === "play-games" ? (
                          <Gamepad2 className="h-5 w-5" />
                        ) : option.value === "reaction" ? (
                          <Sparkles className="h-5 w-5" />
                        ) : (
                          <Video className="h-5 w-5" />
                        );
                      return (
                        <label
                          key={option.value}
                          className={`go-live-modal__mode-card${
                            active ? " go-live-modal__mode-card--active" : ""
                          }${!option.enabled ? " cursor-not-allowed opacity-55" : ""}`}
                          data-go-live-mode-card={option.value}
                        >
                          <input
                            type="radio"
                            name="alice-go-live-mode"
                            className="sr-only"
                            checked={active}
                            disabled={!option.enabled}
                            onChange={() => setLaunchMode(option.value)}
                          />
                          <span className="go-live-modal__mode-card-head">
                            <span className="go-live-modal__mode-card-icon">
                              {icon}
                            </span>
                            <span className="go-live-modal__mode-card-copy">
                              <span className="go-live-modal__mode-card-title">
                                {option.title}
                              </span>
                              <span className="go-live-modal__mode-card-support">
                                {option.support}
                              </span>
                            </span>
                            {active ? (
                              <span
                                className="go-live-modal__mode-card-check"
                                aria-hidden="true"
                              >
                                <Check className="h-4 w-4" />
                              </span>
                            ) : null}
                          </span>
                          <span className="go-live-modal__mode-card-description">
                            {option.description}
                          </span>
                          <span className="go-live-modal__mode-card-meta">
                            {option.availability}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
            ) : null}

            {step === "review-and-launch" ? (
              <div className="space-y-4">
                <div>
                  <div className={OPERATOR_SECTION_EYEBROW_CLASSNAME}>
                    {t("aliceoperator.reviewEyebrow", {
                      defaultValue: "Review and launch",
                    })}
                  </div>
                  <div
                    id={reviewTitleId}
                    className={`${OPERATOR_SECTION_TITLE_CLASSNAME} mt-2`}
                  >
                    {t("aliceoperator.reviewTitle", {
                      defaultValue: "Ready to launch Alice live",
                    })}
                  </div>
                  <p
                    className={`${OPERATOR_SECTION_DESCRIPTION_CLASSNAME} mt-2`}
                  >
                    {t("aliceoperator.reviewHint", {
                      defaultValue:
                        "Confirm the selected channels and mode before dispatching the guided launch plan.",
                    })}
                  </p>
                </div>
                {renderInlineNotice()}
                <div className="rounded-[1.75rem] border border-border/35 bg-bg-elevated px-5 py-5">
                  <div className="space-y-3">
                    {reviewRows.map((row) => (
                      <div
                        key={row.label}
                        className="flex flex-col items-start gap-1 rounded-[1.25rem] border border-border/35 bg-black/16 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                      >
                        <span className="text-sm text-muted-strong">
                          {row.label}
                        </span>
                        <span className="text-sm font-medium text-txt">
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="go-live-modal__footer">
            <div className="go-live-modal__footer-status">
              <OperatorPill tone="accent">
                {titleForStream555LaunchMode(launchMode, t)}
              </OperatorPill>
              <OperatorPill>
                {selectedChannels.length > 0
                  ? `${selectedChannels.length} ${
                      selectedChannels.length === 1 ? "channel" : "channels"
                    }`
                  : t("aliceoperator.noneSelected", {
                      defaultValue: "None selected",
                    })}
              </OperatorPill>
              {activeStepIndex >= 0 ? (
                <span className="text-sm text-white/70">
                  {launching
                    ? t("aliceoperator.launchProgressHint", {
                        defaultValue: "Waiting for delivery lock",
                      })
                    : STEP_ORDER[activeStepIndex]?.label}
                </span>
              ) : null}
            </div>
            <div className="go-live-modal__footer-actions">
              <div className="go-live-modal__footer-secondary">
                <Button
                  variant="ghost"
                  size="sm"
                  className={OPERATOR_ACTION_BUTTON_BASE_CLASSNAME}
                  disabled={activeStepIndex <= 0 || launching}
                  onClick={handleBack}
                >
                  <ChevronLeft className="h-4 w-4" />
                  {t("aliceoperator.back", { defaultValue: "Back" })}
                </Button>
                <DialogClose asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={OPERATOR_ACTION_BUTTON_BASE_CLASSNAME}
                  >
                    {t("aliceoperator.cancel", { defaultValue: "Cancel" })}
                  </Button>
                </DialogClose>
              </div>
              <div className="go-live-modal__footer-primary">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`${OPERATOR_ACTION_BUTTON_BASE_CLASSNAME} ${OPERATOR_ACTION_BUTTON_TONE_CLASSNAME.accent}`}
                  disabled={launching || (step === "setup-required" && (!nativeSetup || Boolean(nativeSetupError) || nativeSetupLoading))}
                  onClick={() => void handleAdvance()}
                >
                  {launching
                    ? t("aliceoperator.launching", {
                        defaultValue: "Launching...",
                      })
                    : step === "review-and-launch"
                      ? t("aliceoperator.launchNow", {
                          defaultValue: "Launch now",
                        })
                      : step === "setup-required"
                        ? "Open shared Studio"
                        : t("aliceoperator.continue", {
                          defaultValue: "Continue",
                        })}
                  {!launching ? <ChevronRight className="h-4 w-4" /> : null}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

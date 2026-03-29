/**
 * StreamView — Basic streaming control surface.
 *
 * Provides go-live/offline toggle and stream health status polling.
 * The actual FFmpeg pipeline runs on the backend via stream-routes.
 */

import { client, isApiError } from "@miladyai/app-core/api";
import { isElectrobunRuntime } from "@miladyai/app-core/bridge";
import { getBootConfig } from "@miladyai/app-core/config";
import { useDocumentVisibility } from "@miladyai/app-core/hooks";
import { useApp } from "@miladyai/app-core/state";
import { Button } from "@miladyai/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  OPERATOR_ACTION_BUTTON_BASE_CLASSNAME,
  OPERATOR_ACTION_BUTTON_TONE_CLASSNAME,
  OPERATOR_SECTION_EYEBROW_CLASSNAME,
  OPERATOR_SELECT_CLASSNAME,
  OPERATOR_SELECT_SHELL_CLASSNAME,
  OperatorPill,
  OperatorSectionHeader,
} from "./operator/OperatorPrimitives";
import { IS_POPOUT } from "./stream/helpers";
import { StatusBar } from "./stream/StatusBar";

export function StreamView({ inModal }: { inModal?: boolean } = {}) {
  const { agentStatus, setActionNotice, t } = useApp();
  const { branding } = getBootConfig();
  const agentName = agentStatus?.agentName ?? branding.appName ?? "Eliza";
  const isElectrobun = isElectrobunRuntime();

  const [streamLive, setStreamLive] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const [destinationsLoading, setDestinationsLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const loadingRef = useRef(false);
  const docVisible = useDocumentVisibility();
  const [streamAvailable, setStreamAvailable] = useState(true);
  const [uptime, setUptime] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [destinations, setDestinations] = useState<Array<{
    id: string;
    name: string;
  }>>([]);
  const [activeDestination, setActiveDestination] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Poll stream status
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (loadingRef.current || !streamAvailable) return;
      try {
        const status = await client.streamStatus();
        if (mounted && !loadingRef.current) {
          setStreamAvailable(true);
          setStreamError(null);
          setStreamLive(status.running && status.ffmpegAlive);
          setUptime(status.uptime);
          setFrameCount(status.frameCount);
          if (status.destination) {
            setActiveDestination(status.destination);
          }
        }
      } catch (err: unknown) {
        if (isApiError(err) && err.status === 404) {
          setStreamAvailable(false);
          return;
        }
        if (mounted) {
          setStreamError(
            err instanceof Error
              ? err.message
              : t("aliceoperator.streamStatusFailed", {
                  defaultValue: "Stream status is temporarily unavailable.",
                }),
          );
        }
      }
    };
    if (!streamAvailable || !docVisible) return;
    poll();
    const id = setInterval(poll, 5_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [streamAvailable, docVisible]);

  useEffect(() => {
    let mounted = true;
    const loadDestinations = async () => {
      if (!streamAvailable) return;
      setDestinationsLoading(true);
      try {
        const [list, status] = await Promise.all([
          client.getStreamingDestinations(),
          client.streamStatus().catch(() => null),
        ]);
        if (!mounted) return;
        setStreamError(null);
        setDestinations(list.destinations ?? []);
        const current = status?.destination ?? null;
        if (current) {
          setActiveDestination(current);
          setDestinationsLoading(false);
          return;
        }
        setActiveDestination(list.destinations?.[0] ?? null);
      } catch {
        if (!mounted) return;
        setDestinations([]);
        setActiveDestination(null);
      } finally {
        if (mounted) {
          setDestinationsLoading(false);
        }
      }
    };
    void loadDestinations();
    return () => {
      mounted = false;
    };
  }, [streamAvailable]);

  const toggleStream = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setStreamLoading(true);
    setStreamError(null);
    try {
      if (streamLive) {
        await client.streamGoOffline();
        setStreamLive(false);
      } else {
        const result = await client.streamGoLive();
        setStreamLive(result.live);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("aliceoperator.streamToggleFailed", {
              defaultValue: "Failed to change stream state.",
            });
      setStreamError(message);
      setActionNotice(message, "error", 4200);
      try {
        const status = await client.streamStatus();
        setStreamLive(status.running && status.ffmpegAlive);
      } catch {
        /* poll will recover within 5s */
      }
    } finally {
      loadingRef.current = false;
      setStreamLoading(false);
    }
  }, [isElectrobun, streamLive]);

  const handleDestinationChange = useCallback(async (destinationId: string) => {
    if (!destinationId.trim()) return;
    setStreamError(null);
    try {
      const result = await client.setActiveDestination(destinationId);
      if (result.ok && result.destination) {
        setActiveDestination(result.destination);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : t("aliceoperator.destinationChangeFailed", {
              defaultValue: "Failed to change streaming destination.",
            });
      setStreamError(message);
      setActionNotice(message, "error", 3600);
    }
  }, [setActionNotice, t]);

  const handlePopout = useCallback(() => {
    const apiBase = getBootConfig().apiBase;
    const base = window.location.origin || "";
    const sep =
      window.location.protocol === "file:" ||
      window.location.protocol === "electrobun:"
        ? "#"
        : "";
    const qs = apiBase
      ? `popout&apiBase=${encodeURIComponent(apiBase)}`
      : "popout";
    const popoutWin = window.open(
      `${base}${sep}/?${qs}`,
      "milady-stream",
      "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no",
    );
    if (!popoutWin) {
      setActionNotice(
        t("aliceoperator.popoutBlocked", {
          defaultValue: "Popup blocked. Allow popups and try again.",
        }),
        "error",
        3600,
      );
      return;
    }
    window.dispatchEvent(new CustomEvent("stream-popout", { detail: "opened" }));
  }, [setActionNotice, t]);

  const stateTitle = !streamAvailable
    ? t("aliceoperator.streamUnavailableTitle", {
        defaultValue: "Streaming runtime unavailable",
      })
    : streamError
      ? t("aliceoperator.streamDegradedTitle", {
          defaultValue: "Streaming is degraded",
        })
      : streamLive
        ? t("aliceoperator.streamLiveTitle", {
            defaultValue: "Broadcast is live",
          })
        : t("aliceoperator.streamReadyTitle", {
            defaultValue: "Stream control is ready",
          });
  const stateDescription = !streamAvailable
    ? t("aliceoperator.streamUnavailableDescription", {
        defaultValue:
          "Install and enable the streaming runtime to bring the operator surface online.",
      })
    : streamError
      ? streamError
      : streamLive
        ? t("aliceoperator.streamLiveDescription", {
            defaultValue:
              "Alice is live in the current shell. Use the controls above to steer the destination and stream lifecycle.",
          })
        : t("aliceoperator.streamReadyDescription", {
            defaultValue:
              "Choose a destination, then go live when you are ready to broadcast.",
          });

  return (
    <div
      data-stream-view
      className={`flex flex-col text-txt font-body ${
        inModal ? "bg-transparent" : "bg-bg"
      } h-full w-full`}
    >
      <StatusBar
        agentName={agentName}
        streamAvailable={streamAvailable}
        streamLive={streamLive}
        activeDestination={activeDestination}
        uptime={uptime}
        frameCount={frameCount}
      />

      <div className="flex flex-1 min-h-0 overflow-y-auto px-4 py-4 lg:px-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
          <section className="rounded-[1.75rem] border border-border/35 bg-card/78 px-5 py-5 shadow-sm">
            <OperatorSectionHeader
              eyebrow={t("aliceoperator.streamEyebrow", {
                defaultValue: "Alice Stream",
              })}
              title={t("aliceoperator.streamOperatorTitle", {
                defaultValue: "Current-shell broadcast operator",
              })}
              description={t("aliceoperator.streamOperatorDescription", {
                defaultValue:
                  "Keep the shell calm while the destination, go-live action, and popout controls live here.",
              })}
              meta={
                <>
                  <OperatorPill tone={streamLive ? "danger" : "neutral"}>
                    {streamLive
                      ? t("aliceoperator.liveNow", {
                          defaultValue: "Live Now",
                        })
                      : t("aliceoperator.offlineNow", {
                          defaultValue: "Offline",
                        })}
                  </OperatorPill>
                  {activeDestination ? (
                    <OperatorPill tone="accent">
                      {activeDestination.name}
                    </OperatorPill>
                  ) : null}
                </>
              }
            />

            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-2">
                <label className={OPERATOR_SECTION_EYEBROW_CLASSNAME}>
                  {t("aliceoperator.streamDestination", {
                    defaultValue: "Streaming Destination",
                  })}
                </label>
                <div className={OPERATOR_SELECT_SHELL_CLASSNAME}>
                  <select
                    aria-label={t("aliceoperator.streamDestination", {
                      defaultValue: "Streaming Destination",
                    })}
                    className={OPERATOR_SELECT_CLASSNAME}
                    value={activeDestination?.id ?? destinations[0]?.id ?? ""}
                    disabled={
                      destinationsLoading ||
                      streamLive ||
                      !streamAvailable ||
                      destinations.length === 0
                    }
                    onChange={(event) =>
                      void handleDestinationChange(event.target.value)
                    }
                  >
                    {destinations.length === 0 ? (
                      <option value="">
                        {destinationsLoading
                          ? t("aliceoperator.loadingDestinations", {
                              defaultValue: "Loading destinations...",
                            })
                          : t("aliceoperator.noDestinations", {
                              defaultValue: "No destinations configured",
                            })}
                      </option>
                    ) : null}
                    {destinations.map((destination) => (
                      <option key={destination.id} value={destination.id}>
                        {destination.name}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-muted-strong">
                    ▾
                  </span>
                </div>
                <p className="text-[11px] leading-5 text-muted-strong">
                  {!streamAvailable
                    ? t("aliceoperator.streamUnavailableHint", {
                        defaultValue:
                          "Streaming must be available before destination controls unlock.",
                      })
                    : streamLive
                      ? t("aliceoperator.destinationLockedHint", {
                          defaultValue:
                            "Stop the stream before changing destinations.",
                        })
                      : t("aliceoperator.destinationHint", {
                          defaultValue:
                            "Pick the active destination here; the top bar now stays passive.",
                        })}
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!streamAvailable || streamLoading}
                  className={`${OPERATOR_ACTION_BUTTON_BASE_CLASSNAME} ${
                    streamLive
                      ? OPERATOR_ACTION_BUTTON_TONE_CLASSNAME.danger
                      : OPERATOR_ACTION_BUTTON_TONE_CLASSNAME.accent
                  }`}
                  onClick={() => void toggleStream()}
                >
                  {streamLoading
                    ? t("aliceoperator.streamChanging", {
                        defaultValue: "Working...",
                      })
                    : streamLive
                      ? t("statusbar.StopStream", {
                          defaultValue: "Stop Stream",
                        })
                      : t("statusbar.GoLive", {
                          defaultValue: "Go Live",
                        })}
                </Button>
                {!IS_POPOUT && !isElectrobun ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={OPERATOR_ACTION_BUTTON_BASE_CLASSNAME}
                    onClick={handlePopout}
                  >
                    {t("aliceoperator.popoutAction", {
                      defaultValue: "Pop Out",
                    })}
                  </Button>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-border/35 bg-card/74 px-5 py-6 shadow-sm">
            <div className="rounded-[1.5rem] border border-border/30 bg-bg/45 px-6 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <div className="mx-auto flex max-w-2xl flex-col items-center gap-3">
                <h2 className="text-xl font-semibold text-txt">{stateTitle}</h2>
                <p className="max-w-[48rem] text-sm leading-6 text-muted-strong">
                  {stateDescription}
                </p>
                {streamLive ? (
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">
                    {t("streamview.StreamLiveStatus", {
                      uptime: formatUptime(uptime),
                      frameCount: frameCount.toLocaleString(),
                      defaultValue: "Uptime: {{uptime}} · {{frameCount}} frames",
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

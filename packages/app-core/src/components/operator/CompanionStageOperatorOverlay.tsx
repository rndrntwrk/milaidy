import { useApp } from "@miladyai/app-core/state";
import { Button, Dialog, DialogContent, DialogTitle } from "@miladyai/ui";
import {
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type SVGProps,
} from "react";
import {
  ALICE_EMOTE_GROUP_LABELS,
  ALICE_LIVE_ACTIONS,
  ALICE_UTILITY_ACTIONS,
} from "./alice-operator-catalog";
import { CompanionGoLiveModal } from "./CompanionGoLiveModal";
import { OperatorPill } from "./OperatorPrimitives";
import type { Stream555LaunchMode } from "./stream555-setup";

type CompanionStageOperator = ReturnType<
  typeof import("./useCompanionStageOperator").useCompanionStageOperator
>;

const SHEET_DIALOG_CLASSNAME =
  "!left-4 !top-1/2 !z-[180] !m-0 !h-[min(78dvh,44rem)] !max-h-[min(78dvh,44rem)] !w-[min(24rem,calc(100vw-2rem))] !translate-x-0 !-translate-y-1/2 gap-0 overflow-hidden rounded-[28px] border border-white/10 bg-[#07090e]/94 p-0 shadow-[0_28px_90px_rgba(0,0,0,0.48)] backdrop-blur-2xl max-sm:!left-1/2 max-sm:!top-auto max-sm:!bottom-4 max-sm:!h-[min(78dvh,40rem)] max-sm:!w-[min(calc(100vw-1rem),24rem)] max-sm:!translate-x-[-50%] max-sm:!translate-y-0";
const SECTION_CLASSNAME = "border-t border-white/8 pt-4 first:border-t-0 first:pt-0";
const SECTION_TITLE_CLASSNAME =
  "text-[10px] font-semibold uppercase tracking-[0.22em] text-white/44";
const ACTION_BUTTON_BASE_CLASSNAME =
  "h-9 min-h-9 rounded-full border px-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition-colors disabled:cursor-not-allowed disabled:opacity-45";

function resolveActionToneClassName(
  tone: "stream" | "launch" | "avatar" | "utility" | "danger",
) {
  switch (tone) {
    case "launch":
      return "border-accent/34 bg-[linear-gradient(135deg,rgba(var(--accent-rgb),0.18),rgba(var(--accent-rgb),0.06))] text-txt-strong hover:border-accent/54 hover:bg-[linear-gradient(135deg,rgba(var(--accent-rgb),0.24),rgba(var(--accent-rgb),0.09))]";
    case "avatar":
      return "border-[rgba(236,201,75,0.2)] bg-[linear-gradient(135deg,rgba(236,201,75,0.18),rgba(255,255,255,0.03))] text-[#f8e9b0] hover:border-[rgba(236,201,75,0.34)] hover:bg-[linear-gradient(135deg,rgba(236,201,75,0.24),rgba(255,255,255,0.05))]";
    case "utility":
      return "border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] text-white/84 hover:border-white/18 hover:bg-[linear-gradient(135deg,rgba(255,255,255,0.12),rgba(255,255,255,0.04))]";
    case "danger":
      return "border-danger/34 bg-[linear-gradient(135deg,rgba(239,68,68,0.18),rgba(239,68,68,0.05))] text-danger hover:border-danger/54 hover:bg-[linear-gradient(135deg,rgba(239,68,68,0.24),rgba(239,68,68,0.08))]";
    case "stream":
    default:
      return "border-[rgba(16,185,129,0.22)] bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(255,255,255,0.02))] text-[#d2fff1] hover:border-[rgba(16,185,129,0.36)] hover:bg-[linear-gradient(135deg,rgba(16,185,129,0.2),rgba(255,255,255,0.04))]";
  }
}

function ActivityIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 13h4l2-5 4 10 2-5h4" />
    </svg>
  );
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

function BubbleActionButton({
  children,
  tone,
  active = false,
  className = "",
  ...props
}: ComponentProps<typeof Button> & {
  tone: "stream" | "launch" | "avatar" | "utility" | "danger";
  active?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={`${ACTION_BUTTON_BASE_CLASSNAME} ${resolveActionToneClassName(
        tone,
      )} ${active ? "ring-1 ring-inset ring-white/16" : ""} ${className}`}
      {...props}
    >
      <span className="inline-flex items-center gap-2">
        <span className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-full border border-white/10 bg-black/24 text-[8px] leading-none text-current">
          +
        </span>
        <span>{children}</span>
      </span>
    </Button>
  );
}

function labelForLaunchAction(
  action: (typeof ALICE_LIVE_ACTIONS)[number],
  live: boolean,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (action.id === "play-games") {
    return live
      ? t(action.labelKey, { defaultValue: action.defaultLabel })
      : t("aliceoperator.action.goLiveAndPlay", {
          defaultValue: "Go Live + Play",
        });
  }
  return t(action.labelKey, { defaultValue: action.defaultLabel });
}

export function CompanionStageOperatorOverlay({
  operator,
}: {
  operator: CompanionStageOperator;
}) {
  const { t } = useApp();
  const { stream, arcade, hyperscape, emotes, utility } = operator;
  const [expanded, setExpanded] = useState(false);
  const [goLiveOpen, setGoLiveOpen] = useState(false);
  const [preferredMode, setPreferredMode] =
    useState<Stream555LaunchMode>("camera");
  const launcherRef = useRef<HTMLButtonElement | null>(null);

  const allEmotes = useMemo(
    () => [...emotes.pinned, ...emotes.groups.flatMap((group) => group.emotes)],
    [emotes.groups, emotes.pinned],
  );
  const activeEmote = useMemo(
    () => allEmotes.find((entry) => entry.id === emotes.activeEmoteId) ?? null,
    [allEmotes, emotes.activeEmoteId],
  );

  if (!operator.isAliceActive) {
    return null;
  }

  const openGoLive = (mode: Stream555LaunchMode) => {
    setPreferredMode(mode);
    setExpanded(false);
    setGoLiveOpen(true);
  };

  const collapseExpandedSheet = () => {
    setExpanded(false);
  };

  const collapseAndRun = async (
    action: () => Promise<void> | void,
  ): Promise<void> => {
    collapseExpandedSheet();
    await action();
  };

  const liveActionDisabledReason = (actionId: string): string | null => {
    switch (actionId) {
      case "go-live":
        if (stream.live) {
          return t("aliceoperator.liveAlreadyActive", {
            defaultValue: "Alice is already live.",
          });
        }
        if (!stream.available) {
          return (
            stream.error ??
            t("aliceoperator.streamMissing", {
              defaultValue: "555 Stream is not available on this runtime.",
            })
          );
        }
        return null;
      case "play-games":
        if (!arcade.runtimeAvailable) {
          return t("aliceoperator.mode.play-games.unavailable", {
            defaultValue: "Requires Alice arcade runtime",
          });
        }
        return null;
      case "ads":
      case "invite-guest":
      case "pip":
      case "earnings":
        return stream.live
          ? null
          : t("aliceoperator.liveModifierRequiresLive", {
              defaultValue: "Available after Alice is live.",
            });
      case "end-live":
        return stream.live
          ? null
          : t("aliceoperator.liveNotRunning", {
              defaultValue: "Alice is not live right now.",
            });
      default:
        return stream.available
          ? null
          : (stream.error ??
              t("aliceoperator.streamMissing", {
                defaultValue: "555 Stream is not available on this runtime.",
              }));
    }
  };

  const handleLiveAction = async (actionId: string) => {
    switch (actionId) {
      case "go-live":
        openGoLive("camera");
        return;
      case "screen-share":
        if (stream.live) {
          await stream.runScreenShareAction();
          return;
        }
        openGoLive("screen-share");
        return;
      case "play-games":
        if (stream.live) {
          if (arcade.gameState?.activeGameId) {
            await arcade.switchSelectedGame();
          } else {
            await arcade.startSelectedGame();
          }
          return;
        }
        openGoLive("play-games");
        return;
      case "reaction":
        if (stream.live) {
          await stream.runReactionAction();
          return;
        }
        openGoLive("reaction");
        return;
      case "radio":
        if (stream.live) {
          await stream.runRadioAction();
          return;
        }
        openGoLive("radio");
        return;
      case "ads":
        await stream.runAdsAction();
        return;
      case "invite-guest":
        await stream.runInviteGuestAction();
        return;
      case "pip":
        await stream.runPipAction();
        return;
      case "earnings":
        await stream.runEarningsAction();
        return;
      case "end-live":
        await stream.endLive();
        return;
      default:
        return;
    }
  };

  const renderLiveAction = (action: (typeof ALICE_LIVE_ACTIONS)[number]) => {
    const label = labelForLaunchAction(action, stream.live, t);
    const disabledReason = liveActionDisabledReason(action.id);
    const disabled = Boolean(disabledReason) || Boolean(arcade.busyAction);

    return (
      <BubbleActionButton
        key={action.id}
        type="button"
        tone={
          action.id === "go-live" || action.id === "play-games"
            ? "launch"
            : action.id === "end-live"
              ? "danger"
              : "stream"
        }
        disabled={disabled}
        aria-label={label}
        title={disabledReason ?? label}
        onClick={() => void collapseAndRun(() => handleLiveAction(action.id))}
      >
        {label}
      </BubbleActionButton>
    );
  };

  const selectedGameLabel = arcade.selectedGameLabel;
  const launcherBadge = stream.live
    ? "!"
    : activeEmote
      ? "M"
      : hyperscape.quickCommands.length > 0
        ? `${Math.min(hyperscape.quickCommands.length, 9)}`
        : null;

  return (
    <>
      <aside
        className="pointer-events-none absolute left-4 top-1/2 z-20 hidden -translate-y-1/2 md:block xl:left-6"
        data-no-camera-drag="true"
        data-no-camera-zoom="true"
      >
        <div
          className="alice-stage-rail-node alice-stage-rail-node--left group pointer-events-auto"
          data-no-camera-drag="true"
          data-no-camera-zoom="true"
        >
          <div className="group relative">
            <Button
              ref={launcherRef}
              type="button"
              variant={expanded ? "secondary" : "outline"}
              size="sm"
              className={`alice-stage-rail-launcher alice-stage-rail-launcher--left ${expanded ? "alice-stage-rail-launcher--active" : "alice-stage-rail-launcher--pulse"} relative h-11 w-11 min-w-11 rounded-full border border-white/12 bg-black/78 px-0 shadow-none backdrop-blur-xl hover:border-white/22 hover:bg-black/88`}
              aria-expanded={expanded}
              aria-haspopup="dialog"
              aria-controls="alice-stage-actions-panel"
              aria-label="Action Log"
              title="Action Log"
              data-testid="companion-stage-actions-launcher"
              data-no-camera-zoom="true"
              onClick={() => setExpanded((current) => !current)}
            >
              <span className="flex h-5 w-5 items-center justify-center text-white/82">
                <ActivityIcon className="h-4 w-4" />
              </span>
              {launcherBadge ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-black/80 bg-white px-1 text-[9px] font-semibold leading-none text-black">
                  {launcherBadge}
                </span>
              ) : null}
            </Button>
            <div className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
              <div className="whitespace-nowrap rounded-full border border-white/10 bg-black/88 px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-white/74 shadow-[0_12px_28px_rgba(0,0,0,0.22)] backdrop-blur-xl">
                Action Log
              </div>
            </div>
          </div>
        </div>
      </aside>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          id="alice-stage-actions-panel"
          showCloseButton={false}
          className={SHEET_DIALOG_CLASSNAME}
          data-testid="companion-stage-actions-bubble"
          data-no-camera-drag="true"
          data-no-camera-zoom="true"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            launcherRef.current?.focus();
          }}
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-white/8 bg-[rgba(9,13,20,0.98)] px-4 py-3 backdrop-blur-xl">
              <DialogTitle className="text-sm font-medium text-white/90">
                Action Log
              </DialogTitle>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Close action log"
                onClick={() => setExpanded(false)}
              >
                <CloseIcon className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              <div className="flex flex-wrap gap-2">
                <OperatorPill tone="accent">
                  {t("aliceoperator.meta.alice", { defaultValue: "Alice" })}
                </OperatorPill>
                <OperatorPill
                  tone={
                    stream.live
                      ? "danger"
                      : stream.available
                        ? "neutral"
                        : "warning"
                  }
                >
                  {stream.live
                    ? t("aliceoperator.meta.live", { defaultValue: "Live" })
                    : stream.available
                      ? t("aliceoperator.meta.offline", {
                          defaultValue: "Offline",
                        })
                      : "555stream"}
                </OperatorPill>
                {arcade.runtimeAvailable ? (
                  <OperatorPill tone="success">
                    {t("aliceoperator.meta.arcadeReady", {
                      defaultValue: "Arcade Ready",
                    })}
                  </OperatorPill>
                ) : null}
                {activeEmote?.name ? (
                  <OperatorPill tone="accent">{activeEmote.name}</OperatorPill>
                ) : null}
              </div>

              <section className={`${SECTION_CLASSNAME} mt-4`} aria-labelledby="alice-stage-live-actions">
                <div
                  className={SECTION_TITLE_CLASSNAME}
                  id="alice-stage-live-actions"
                >
                  {t("aliceoperator.section.liveControls", {
                    defaultValue: "Live Controls",
                  })}
                </div>
                {arcade.runtimeAvailable &&
                (arcade.games.length > 0 || arcade.gameState?.activeGameId) ? (
                  <div className="mt-3 rounded-[18px] border border-white/8 bg-black/18 p-2.5">
                    <label
                      htmlFor="alice-stage-selected-game"
                      className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/40"
                    >
                      {t("aliceoperator.arcade.selectedGame", {
                        defaultValue: "Selected Game",
                      })}
                    </label>
                    <div className="mt-2">
                      <select
                        id="alice-stage-selected-game"
                        aria-label={t("aliceoperator.arcade.selectedGame", {
                          defaultValue: "Selected Game",
                        })}
                        className="h-10 w-full rounded-[14px] border border-white/10 bg-black/24 px-3 text-[12px] text-white/88 outline-none transition focus:border-accent/40"
                        value={arcade.selectedGameId}
                        disabled={
                          arcade.catalogLoading ||
                          arcade.games.length === 0 ||
                          Boolean(arcade.busyAction)
                        }
                        onChange={(event) =>
                          arcade.setSelectedGameId(event.target.value)
                        }
                      >
                        {arcade.games.map((game) => (
                          <option key={game.id} value={game.id}>
                            {game.title || game.label || game.name || game.id}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <OperatorPill>{selectedGameLabel}</OperatorPill>
                      {arcade.gameState?.phase ? (
                        <OperatorPill tone="success">{arcade.phaseLabel}</OperatorPill>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {ALICE_LIVE_ACTIONS.map(renderLiveAction)}
                </div>
                {stream.error ? (
                  <p className="mt-3 text-[11px] leading-5 text-warn">
                    {stream.error}
                  </p>
                ) : null}
              </section>

              <section
                className={`${SECTION_CLASSNAME} mt-4`}
                aria-labelledby="alice-stage-avatar-actions"
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className={SECTION_TITLE_CLASSNAME}
                    id="alice-stage-avatar-actions"
                  >
                    {t("aliceoperator.section.avatarActions", {
                      defaultValue: "Avatar Actions",
                    })}
                  </div>
                  {activeEmote ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 rounded-full border border-danger/28 bg-danger/10 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-danger"
                      onClick={() => {
                        collapseExpandedSheet();
                        emotes.stopEmote();
                      }}
                    >
                      {t("aliceoperator.action.stopMotion", {
                        defaultValue: "Stop Motion",
                      })}
                    </Button>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {emotes.pinned.map((emote) => (
                    <BubbleActionButton
                      key={emote.id}
                      type="button"
                      tone="avatar"
                      active={emotes.activeEmoteId === emote.id}
                      disabled={Boolean(arcade.busyAction)}
                      onClick={() =>
                        void collapseAndRun(() => emotes.playEmote(emote.id))
                      }
                    >
                      {emote.name}
                    </BubbleActionButton>
                  ))}
                </div>
                {emotes.groups.map((group) => (
                  <div key={group.group} className="mt-3.5">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/34">
                      {ALICE_EMOTE_GROUP_LABELS[group.group]}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.emotes.map((emote) => (
                        <BubbleActionButton
                          key={emote.id}
                          type="button"
                          tone="avatar"
                          active={emotes.activeEmoteId === emote.id}
                          disabled={Boolean(arcade.busyAction)}
                          onClick={() =>
                            void collapseAndRun(() =>
                              emotes.playEmote(emote.id),
                            )
                          }
                        >
                          {emote.name}
                        </BubbleActionButton>
                      ))}
                    </div>
                  </div>
                ))}
                {emotes.error ? (
                  <p className="mt-3 text-[11px] leading-5 text-warn">
                    {emotes.error}
                  </p>
                ) : null}
              </section>

              {hyperscape.quickCommands.length > 0 ? (
                <section
                  className={`${SECTION_CLASSNAME} mt-4`}
                  aria-labelledby="alice-stage-world-actions"
                >
                  <div
                    className={SECTION_TITLE_CLASSNAME}
                    id="alice-stage-world-actions"
                  >
                    {t("aliceoperator.section.worldActions", {
                      defaultValue: "World / Quick Actions",
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hyperscape.quickCommands.map((command) => (
                      <BubbleActionButton
                        key={command.id}
                        type="button"
                        tone="stream"
                        disabled={
                          !command.available ||
                          Boolean(arcade.busyAction) ||
                          hyperscape.loading
                        }
                        aria-label={command.reason ?? command.label}
                        title={command.reason ?? command.label}
                        onClick={() =>
                          void collapseAndRun(() =>
                            hyperscape.runQuickCommand(command),
                          )
                        }
                      >
                        {command.label}
                      </BubbleActionButton>
                    ))}
                  </div>
                </section>
              ) : null}

              <section
                className={`${SECTION_CLASSNAME} mt-4`}
                aria-labelledby="alice-stage-utility-actions"
              >
                <div
                  className={SECTION_TITLE_CLASSNAME}
                  id="alice-stage-utility-actions"
                >
                  {t("aliceoperator.section.secondaryUtility", {
                    defaultValue: "Secondary Utility",
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ALICE_UTILITY_ACTIONS.map((action) => (
                    <BubbleActionButton
                      key={action.id}
                      type="button"
                      tone="utility"
                      onClick={() =>
                        action.id === "swap"
                          ? collapseAndRun(() => utility.openSwapSurface())
                          : collapseAndRun(() =>
                              utility.openAutonomousRunSurface(),
                            )
                      }
                    >
                      {t(action.labelKey, { defaultValue: action.defaultLabel })}
                    </BubbleActionButton>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <CompanionGoLiveModal
        open={goLiveOpen}
        onOpenChange={setGoLiveOpen}
        preferredMode={preferredMode}
        onPreferredModeChange={setPreferredMode}
        operator={operator}
      />
    </>
  );
}

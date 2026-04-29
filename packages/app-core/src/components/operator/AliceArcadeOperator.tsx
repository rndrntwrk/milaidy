import { Button } from "@miladyai/ui";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  client,
  type Arcade555CatalogGame,
  type Arcade555GameActionResponse,
  type Arcade555GameStateResponse,
} from "../../api";
import { useApp } from "../../state";
import {
  OPERATOR_ACTION_BUTTON_BASE_CLASSNAME,
  OPERATOR_ACTION_BUTTON_TONE_CLASSNAME,
  OPERATOR_SECTION_EYEBROW_CLASSNAME,
  OPERATOR_SELECT_CLASSNAME,
  OPERATOR_SELECT_SHELL_CLASSNAME,
  OperatorPill,
  OperatorSectionHeader,
} from "./OperatorPrimitives";

const ALICE_ARCADE_PLUGIN_IDS = new Set(["five55-games"]);

interface ArcadeOperatorSubject {
  name: string;
  displayName?: string;
  category?: string;
}

interface AliceArcadeOperatorProps {
  subject: ArcadeOperatorSubject;
  surface?: "card" | "strip";
  compact?: boolean;
}

function normalizePluginId(rawId: string): string {
  return rawId
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/^plugin-/, "");
}

function normalizeArcadeMatchToken(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@[^/]+\//, "")
    .replace(/^app-/, "")
    .replace(/^plugin-/, "")
    .replace(/[^a-z0-9]+/g, "");
}

function getArcadeGameLabel(game: Arcade555CatalogGame): string {
  const candidate = [game.title, game.label, game.name, game.id].find(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
  return typeof candidate === "string" ? candidate : game.id;
}

function resolveInitialArcadeGameId(
  subject: ArcadeOperatorSubject,
  games: Arcade555CatalogGame[],
): string {
  const subjectTokens = [subject.displayName, subject.name]
    .map((value) => normalizeArcadeMatchToken(value ?? ""))
    .filter(Boolean);

  const matched = games.find((game) => {
    const gameTokens = [
      game.id,
      typeof game.name === "string" ? game.name : "",
      typeof game.title === "string" ? game.title : "",
      typeof game.label === "string" ? game.label : "",
    ]
      .map((value) => normalizeArcadeMatchToken(value))
      .filter(Boolean);
    return subjectTokens.some((token) => gameTokens.includes(token));
  });

  return matched?.id ?? games[0]?.id ?? "";
}

function getPhaseLabel(
  phase: string | null | undefined,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  switch (phase) {
    case "live":
      return t("aliceoperator.phaseLive", { defaultValue: "Live" });
    case "playing":
      return t("aliceoperator.phasePlaying", { defaultValue: "Playing" });
    case "broadcasting":
      return t("aliceoperator.phaseBroadcasting", {
        defaultValue: "Broadcasting",
      });
    default:
      return t("aliceoperator.phaseReady", { defaultValue: "Ready" });
  }
}

export function AliceArcadeOperator({
  subject,
  surface = "card",
  compact = false,
}: AliceArcadeOperatorProps) {
  const { plugins = [], setActionNotice, t } = useApp();
  const runtimeAvailable = useMemo(
    () =>
      plugins.some((plugin) => {
        const normalized = normalizePluginId(plugin.id);
        return (
          ALICE_ARCADE_PLUGIN_IDS.has(normalized) &&
          (plugin.isActive ?? plugin.enabled)
        );
      }),
    [plugins],
  );
  const [games, setGames] = useState<Arcade555CatalogGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [stateLoading, setStateLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [gameState, setGameState] = useState<Arcade555GameStateResponse | null>(
    null,
  );

  const selectedGameLabel = useMemo(() => {
    const selected =
      games.find((game) => game.id === selectedGameId) ??
      games.find((game) => game.id === gameState?.activeGameId);
    return (
      (selected ? getArcadeGameLabel(selected) : null) ??
      gameState?.activeGameLabel ??
      t("aliceoperator.noGameSelected", {
        defaultValue: "No game selected",
      })
    );
  }, [gameState?.activeGameId, gameState?.activeGameLabel, games, selectedGameId, t]);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const response = await client.getArcade555GamesCatalog({
        includeBeta: true,
      });
      const nextGames = Array.isArray(response.games) ? response.games : [];
      setGames(nextGames);
      setSelectedGameId((current) => {
        if (current && nextGames.some((game) => game.id === current)) {
          return current;
        }
        if (
          gameState?.activeGameId &&
          nextGames.some((game) => game.id === gameState.activeGameId)
        ) {
          return gameState.activeGameId;
        }
        return resolveInitialArcadeGameId(subject, nextGames);
      });
    } catch (err) {
      setCatalogError(
        err instanceof Error
          ? err.message
          : t("aliceoperator.catalogLoadFailed", {
              defaultValue: "Failed to load the Alice arcade catalog.",
            }),
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [gameState?.activeGameId, subject, t]);

  const loadGameState = useCallback(async () => {
    setStateLoading(true);
    setStateError(null);
    try {
      const response = await client.getArcade555GameState();
      setGameState(response);
      setSelectedGameId((current) => current || response.activeGameId || current);
    } catch (err) {
      setStateError(
        err instanceof Error
          ? err.message
          : t("aliceoperator.stateLoadFailed", {
              defaultValue: "Failed to load Alice arcade session state.",
            }),
      );
    } finally {
      setStateLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!runtimeAvailable || (subject.category && subject.category !== "game")) {
      return;
    }
    void Promise.all([loadCatalog(), loadGameState()]);
  }, [loadCatalog, loadGameState, runtimeAvailable, subject.category]);

  const requireSelectedGameId = useCallback(() => {
    const value = selectedGameId.trim();
    if (value) return value;
    setActionNotice(
      t("aliceoperator.chooseGameFirst", {
        defaultValue: "Choose an Alice arcade game first.",
      }),
      "error",
      3200,
    );
    return null;
  }, [selectedGameId, setActionNotice, t]);

  const runAction = useCallback(
    async (
      action: string,
      execute: () => Promise<Arcade555GameActionResponse>,
      fallbackMessage: string,
    ) => {
      if (busyAction) return;
      setBusyAction(action);
      try {
        const response = await execute();
        await loadGameState();
        setActionNotice(response.message ?? fallbackMessage, "success", 3200);
      } catch (err) {
        setActionNotice(
          err instanceof Error
            ? err.message
            : t("aliceoperator.actionFailed", {
                defaultValue: "Alice arcade action failed.",
              }),
          "error",
          4200,
        );
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction, loadGameState, setActionNotice, t],
  );

  const handleGoLiveAndPlay = useCallback(async () => {
    const gameId = requireSelectedGameId();
    if (!gameId || busyAction) return;
    setBusyAction("go-live-play");
    try {
      const liveResponse = await client.streamGoLive();
      if (!liveResponse.live) {
        throw new Error(
          t("aliceoperator.goLivePlayFailed", {
            defaultValue: "Stream did not enter a live state.",
          }),
        );
      }
      const response = await client.playArcade555Game({
        gameId,
        mode: "agent",
      });
      await loadGameState();
      setActionNotice(
        response.message ??
          t("aliceoperator.goLivePlayStarted", {
            defaultValue: "Alice went live and started the selected game.",
          }),
        "success",
        3600,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error
          ? err.message
          : t("aliceoperator.actionFailed", {
              defaultValue: "Alice arcade action failed.",
            }),
        "error",
        4200,
      );
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, loadGameState, requireSelectedGameId, setActionNotice, t]);

  if (!runtimeAvailable || (subject.category && subject.category !== "game")) {
    return null;
  }

  const cardClassName =
    surface === "strip"
      ? "mx-4 my-3 rounded-[1.35rem] border border-border/35 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_84%,transparent),color-mix(in_srgb,var(--bg)_95%,transparent))] px-4 py-3 shadow-sm"
      : "rounded-[1.5rem] border border-accent/20 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.09),rgba(var(--accent-rgb),0.04))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_26px_-24px_rgba(var(--accent-rgb),0.18)]";
  const actionGridClassName =
    surface === "strip"
      ? "mt-3 flex flex-wrap gap-2"
      : `mt-4 grid gap-2 ${compact ? "" : "md:grid-cols-2"}`;

  return (
    <section className={cardClassName}>
      {surface === "strip" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className={OPERATOR_SECTION_EYEBROW_CLASSNAME}>
                {t("aliceoperator.arcadeEyebrow", {
                  defaultValue: "Alice Arcade",
                })}
              </div>
              <div className="mt-1 text-[14px] font-semibold text-txt">
                {t("aliceoperator.arcadeStripTitle", {
                  defaultValue: "Live game operator",
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <OperatorPill tone="accent">
                {t("aliceoperator.runtimeReady", {
                  defaultValue: "Runtime Ready",
                })}
              </OperatorPill>
              <OperatorPill tone={gameState?.live ? "success" : "neutral"}>
                {getPhaseLabel(gameState?.phase, t)}
              </OperatorPill>
              <OperatorPill>{selectedGameLabel}</OperatorPill>
              {gameState?.destination ? (
                <OperatorPill tone="warning">
                  {gameState.destination.name}
                </OperatorPill>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <OperatorSectionHeader
          eyebrow={t("aliceoperator.arcadeEyebrow", {
            defaultValue: "Alice Arcade",
          })}
          title={t("aliceoperator.arcadeTitle", {
            defaultValue: "Current-shell game operator",
          })}
          description={t("aliceoperator.arcadeDescription", {
            defaultValue:
              "Run the core Alice arcade actions from the modern app shell without reviving the old HUD.",
          })}
          meta={
            <>
              <OperatorPill tone="accent">
                {t("aliceoperator.runtimeReady", {
                  defaultValue: "Runtime Ready",
                })}
              </OperatorPill>
              <OperatorPill tone={gameState?.live ? "success" : "neutral"}>
                {getPhaseLabel(gameState?.phase, t)}
              </OperatorPill>
              <OperatorPill>{selectedGameLabel}</OperatorPill>
              {gameState?.destination ? (
                <OperatorPill tone="warning">
                  {gameState.destination.name}
                </OperatorPill>
              ) : null}
            </>
          }
        />
      )}

      <div
        className={`mt-3 grid gap-3 ${surface === "strip" ? "lg:grid-cols-[minmax(0,1fr)_auto]" : compact ? "" : "md:grid-cols-[minmax(0,1fr)_auto]"}`}
      >
        <div className="space-y-2">
          <label className={OPERATOR_SECTION_EYEBROW_CLASSNAME}>
            {t("aliceoperator.catalogGame", {
              defaultValue: "Catalog Game",
            })}
          </label>
          <div className={OPERATOR_SELECT_SHELL_CLASSNAME}>
            <select
              aria-label={t("aliceoperator.catalogGame", {
                defaultValue: "Catalog Game",
              })}
              className={OPERATOR_SELECT_CLASSNAME}
              value={selectedGameId}
              disabled={catalogLoading || busyAction !== null || games.length === 0}
              onChange={(event) => setSelectedGameId(event.target.value)}
            >
              {games.length === 0 ? (
                <option value="">
                  {catalogLoading
                    ? t("aliceoperator.loadingCatalog", {
                        defaultValue: "Loading catalog...",
                      })
                    : t("aliceoperator.noCatalogGames", {
                        defaultValue: "No arcade games available",
                      })}
                </option>
              ) : null}
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {getArcadeGameLabel(game)}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] text-muted-strong">
              ▾
            </span>
          </div>
        </div>

        <div className={actionGridClassName}>
          <Button
            variant="ghost"
            size="sm"
            className={OPERATOR_ACTION_BUTTON_BASE_CLASSNAME}
            disabled={catalogLoading || stateLoading || busyAction !== null}
            onClick={() => void Promise.all([loadCatalog(), loadGameState()])}
          >
            {catalogLoading || stateLoading
              ? t("aliceoperator.refreshing", {
                  defaultValue: "Refreshing...",
                })
              : t("aliceoperator.refreshCatalog", {
                  defaultValue: "Refresh Catalog",
                })}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`${OPERATOR_ACTION_BUTTON_BASE_CLASSNAME} ${OPERATOR_ACTION_BUTTON_TONE_CLASSNAME.accent}`}
            disabled={busyAction !== null}
            onClick={() => {
              const gameId = requireSelectedGameId();
              if (!gameId) return;
              void runAction(
                "play",
                () => client.playArcade555Game({ gameId, mode: "agent" }),
                t("aliceoperator.startedGame", {
                  defaultValue: "Alice started the selected game.",
                }),
              );
            }}
          >
            {busyAction === "play"
              ? t("aliceoperator.starting", { defaultValue: "Starting..." })
              : t("aliceoperator.startWithAlice", {
                  defaultValue: "Start with Alice",
                })}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={OPERATOR_ACTION_BUTTON_BASE_CLASSNAME}
            disabled={busyAction !== null}
            onClick={() => {
              const gameId = requireSelectedGameId();
              if (!gameId) return;
              void runAction(
                "switch",
                () => client.switchArcade555Game({ gameId, mode: "agent" }),
                t("aliceoperator.switchedGame", {
                  defaultValue: "Alice switched the active game.",
                }),
              );
            }}
          >
            {busyAction === "switch"
              ? t("aliceoperator.switching", { defaultValue: "Switching..." })
              : t("aliceoperator.switchGame", { defaultValue: "Switch" })}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`${OPERATOR_ACTION_BUTTON_BASE_CLASSNAME} ${OPERATOR_ACTION_BUTTON_TONE_CLASSNAME.danger}`}
            disabled={busyAction !== null}
            onClick={() =>
              void runAction(
                "stop",
                () => client.stopArcade555Game(),
                t("aliceoperator.stoppedSession", {
                  defaultValue: "Alice arcade session stopped.",
                }),
              )
            }
          >
            {busyAction === "stop"
              ? t("aliceoperator.stopping", { defaultValue: "Stopping..." })
              : t("aliceoperator.stopSession", {
                  defaultValue: "Stop Session",
                })}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`${OPERATOR_ACTION_BUTTON_BASE_CLASSNAME} ${OPERATOR_ACTION_BUTTON_TONE_CLASSNAME.accent}`}
            disabled={busyAction !== null}
            onClick={() => void handleGoLiveAndPlay()}
          >
            {busyAction === "go-live-play"
              ? t("aliceoperator.goingLivePlay", {
                  defaultValue: "Going Live...",
                })
              : t("aliceoperator.goLiveAndPlay", {
                  defaultValue: "Go Live + Play",
                })}
          </Button>
        </div>
      </div>

      {catalogError || stateError ? (
        <p className="mt-3 text-[11px] leading-5 text-danger">
          {catalogError ?? stateError}
        </p>
      ) : null}
    </section>
  );
}

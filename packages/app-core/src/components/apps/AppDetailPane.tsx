import { Button } from "@miladyai/ui";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { client, type Arcade555CatalogGame, type RegistryAppInfo } from "../../api";
import { useApp } from "../../state";
import { getAppDetailExtension } from "./extensions/registry";
import { CATEGORY_LABELS, getAppEmoji } from "./helpers";

interface AppDetailPaneProps {
  app: RegistryAppInfo;
  busy: boolean;
  compact?: boolean;
  hasActiveViewer: boolean;
  isActive: boolean;
  onBack: () => void;
  onLaunch: () => void;
  onOpenCurrentGame: () => void;
  onOpenCurrentGameInNewTab: () => void;
}

function DetailBadge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "success";
}) {
  const toneClassName =
    tone === "success"
      ? "border-ok/30 bg-ok/10 text-ok"
      : tone === "accent"
        ? "border-accent/25 bg-accent/10 text-accent"
        : "border-border/35 bg-bg-hover/70 text-muted-strong";

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${toneClassName}`}
    >
      {children}
    </span>
  );
}

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 rounded-2xl border border-border/35 bg-card/72 px-3 py-2.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-start sm:gap-3">
      <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <span className="min-w-0 text-[12px] leading-5 text-txt">{value}</span>
    </div>
  );
}

const ALICE_ARCADE_PLUGIN_IDS = new Set(["five55-games"]);

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
  app: RegistryAppInfo,
  games: Arcade555CatalogGame[],
): string {
  const appTokens = [
    app.displayName,
    app.name,
    app.name.replace(/^@[^/]+\//, ""),
  ]
    .map((value) => normalizeArcadeMatchToken(value))
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
    return appTokens.some((token) => gameTokens.includes(token));
  });

  return matched?.id ?? games[0]?.id ?? "";
}

function AliceArcadePanel({
  app,
  compact = false,
}: {
  app: RegistryAppInfo;
  compact?: boolean;
}) {
  const { plugins = [], setActionNotice } = useApp();
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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

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
        return resolveInitialArcadeGameId(app, nextGames);
      });
    } catch (err) {
      setCatalogError(
        err instanceof Error ? err.message : "Failed to load arcade catalog.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }, [app]);

  useEffect(() => {
    if (!runtimeAvailable || app.category !== "game") return;
    void loadCatalog();
  }, [app.category, loadCatalog, runtimeAvailable]);

  const requireSelectedGameId = useCallback(() => {
    const value = selectedGameId.trim();
    if (value) return value;
    setActionNotice("Choose an Alice arcade game first.", "error", 3200);
    return null;
  }, [selectedGameId, setActionNotice]);

  const runAction = useCallback(
    async (
      action: "play" | "switch" | "stop",
      execute: () => Promise<{ message?: string }>,
      fallbackMessage: string,
    ) => {
      if (busyAction) return;
      setBusyAction(action);
      try {
        const response = await execute();
        setActionNotice(response.message ?? fallbackMessage, "success", 3200);
      } catch (err) {
        setActionNotice(
          err instanceof Error ? err.message : "Arcade action failed.",
          "error",
          4200,
        );
      } finally {
        setBusyAction(null);
      }
    },
    [busyAction, setActionNotice],
  );

  if (!runtimeAvailable || app.category !== "game") {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-accent/20 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.09),rgba(var(--accent-rgb),0.04))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_26px_-24px_rgba(var(--accent-rgb),0.18)]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-strong">
          Alice Arcade
        </div>
        <DetailBadge tone="accent">Runtime Ready</DetailBadge>
      </div>
      <p
        className={`mt-2 ${compact ? "text-[11px] leading-5" : "text-[12px] leading-6"} text-muted-strong`}
      >
        Queue autonomous play, switch the active arcade run, or stop the
        current Alice game session without leaving the current shell.
      </p>

      <div className="mt-3 grid gap-2">
        <label className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
          Catalog Game
        </label>
        <div className="relative">
          <select
            aria-label="Alice arcade game"
            className="min-h-11 w-full appearance-none rounded-[1rem] border border-border/35 bg-card/78 px-3 py-2 pr-8 text-[12px] text-txt shadow-sm focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-wait disabled:opacity-70"
            value={selectedGameId}
            disabled={catalogLoading || busyAction !== null || games.length === 0}
            onChange={(event) => setSelectedGameId(event.target.value)}
          >
            {games.length === 0 ? (
              <option value="">
                {catalogLoading ? "Loading catalog..." : "No arcade games available"}
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
        {catalogError ? (
          <p className="text-[11px] leading-5 text-danger">{catalogError}</p>
        ) : null}
      </div>

      <div
        className={`mt-4 grid gap-2 ${compact ? "" : "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"}`}
      >
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 rounded-xl px-4 shadow-sm"
          disabled={catalogLoading || busyAction !== null}
          onClick={() => void loadCatalog()}
        >
          {catalogLoading ? "Refreshing..." : "Refresh Catalog"}
        </Button>
        <Button
          variant="default"
          size="sm"
          className="min-h-11 rounded-xl px-4 shadow-sm"
          disabled={busyAction !== null}
          onClick={() => {
            const gameId = requireSelectedGameId();
            if (!gameId) return;
            void runAction(
              "play",
              () => client.playArcade555Game({ gameId, mode: "agent" }),
              `Alice started ${gameId}.`,
            );
          }}
        >
          {busyAction === "play" ? "Starting..." : "Start with Alice"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 rounded-xl px-4 shadow-sm"
          disabled={busyAction !== null}
          onClick={() => {
            const gameId = requireSelectedGameId();
            if (!gameId) return;
            void runAction(
              "switch",
              () => client.switchArcade555Game({ gameId, mode: "agent" }),
              `Alice switched to ${gameId}.`,
            );
          }}
        >
          {busyAction === "switch" ? "Switching..." : "Switch"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 rounded-xl border-danger/30 px-4 text-danger shadow-sm hover:border-danger/50 hover:bg-danger/10"
          disabled={busyAction !== null}
          onClick={() =>
            void runAction(
              "stop",
              () => client.stopArcade555Game(),
              "Alice arcade session stopped.",
            )
          }
        >
          {busyAction === "stop" ? "Stopping..." : "Stop Session"}
        </Button>
      </div>
    </section>
  );
}

export function AppDetailPane({
  app,
  busy,
  compact = false,
  hasActiveViewer,
  isActive,
  onBack,
  onLaunch,
  onOpenCurrentGame,
  onOpenCurrentGameInNewTab,
}: AppDetailPaneProps) {
  const { t } = useApp();
  const DetailExtension = getAppDetailExtension(app);
  const description =
    app.description ??
    t("appsview.NoDescriptionAvailable", {
      defaultValue: "No description available.",
    });
  const launchLabel = busy
    ? t("appsview.Launching", { defaultValue: "Launching..." })
    : t("appsview.Launch", { defaultValue: "Launch app" });
  const backLabel = t("appsview.Back", { defaultValue: "Back to catalog" });

  if (compact) {
    return (
      <div className="phone-inline-detail space-y-4">
        <Button
          variant="ghost"
          size="sm"
          className="min-h-10 justify-start rounded-xl border border-border/35 bg-card/72 px-3 text-[12px] font-medium text-muted-strong shadow-sm hover:bg-bg-hover/80 hover:text-txt"
          onClick={onBack}
        >
          ← {backLabel}
        </Button>

        <div className="rounded-[1.5rem] border border-border/35 bg-card/74 p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.35rem] border border-border/35 bg-bg/80 text-[1.75rem] shadow-sm">
              {getAppEmoji(app)}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="text-base font-semibold tracking-[0.01em] text-txt">
                {app.displayName ?? app.name}
              </div>
              <div className="flex flex-wrap gap-1.5">
                <DetailBadge tone={isActive ? "success" : "neutral"}>
                  {isActive
                    ? t("appsview.Active", { defaultValue: "Active" })
                    : t("appsview.Inactive", { defaultValue: "Inactive" })}
                </DetailBadge>
                {app.category ? (
                  <DetailBadge>
                    {CATEGORY_LABELS[app.category] ?? app.category}
                  </DetailBadge>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-border/35 bg-bg/55 px-4 py-3">
          <p className="text-[12px] leading-6 text-muted-strong">
            {description}
          </p>
        </div>

        <div className="grid gap-2">
          <Button
            variant="default"
            size="sm"
            className="min-h-11 w-full rounded-xl px-4 shadow-sm"
            disabled={busy}
            onClick={onLaunch}
          >
            {launchLabel}
          </Button>
          {hasActiveViewer ? (
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 w-full rounded-xl px-4 shadow-sm"
              onClick={onOpenCurrentGame}
            >
              {t("appsview.ResumeSession", {
                defaultValue: "Resume session",
              })}
            </Button>
          ) : null}
        </div>

        <AliceArcadePanel app={app} compact />

        <div className="grid gap-2 sm:grid-cols-2">
          <MetadataRow
            label={t("appsview.LaunchType", { defaultValue: "Launch type" })}
            value={<span className="break-words">{app.launchType || "—"}</span>}
          />
          <MetadataRow
            label={t("common.version", { defaultValue: "Version" })}
            value={
              <span className="font-mono text-[11px] text-muted-strong">
                {app.latestVersion ? `v${app.latestVersion}` : "—"}
              </span>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          size="sm"
          className="min-h-10 rounded-xl border-border/35 bg-card/72 px-3 shadow-sm"
          onClick={onBack}
        >
          ← {backLabel}
        </Button>
        {app.latestVersion ? (
          <span className="font-mono text-[11px] text-muted-strong">
            v{app.latestVersion}
          </span>
        ) : null}
      </div>

      <section className="rounded-[1.75rem] border border-border/35 bg-card/78 p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.6rem] border border-border/35 bg-bg/80 text-[2rem] shadow-sm">
            {getAppEmoji(app)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xl font-semibold tracking-[0.01em] text-txt">
              {app.displayName ?? app.name}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <DetailBadge tone={isActive ? "success" : "neutral"}>
                {isActive
                  ? t("appsview.Active", { defaultValue: "Active" })
                  : t("appsview.Inactive", { defaultValue: "Inactive" })}
              </DetailBadge>
              {app.category ? (
                <DetailBadge>
                  {CATEGORY_LABELS[app.category] ?? app.category}
                </DetailBadge>
              ) : null}
              {app.latestVersion ? (
                <DetailBadge tone="accent">v{app.latestVersion}</DetailBadge>
              ) : null}
            </div>
            <div className="mt-4 rounded-[1.25rem] border border-border/35 bg-bg/55 px-4 py-3">
              <p className="max-w-[62ch] text-[13px] leading-6 text-muted-strong">
                {description}
              </p>
            </div>
          </div>
        </div>
      </section>

      <div
        className={`grid gap-2 ${hasActiveViewer ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]" : "md:grid-cols-2"}`}
      >
        <Button
          variant="default"
          size="sm"
          className="min-h-11 rounded-xl px-5 shadow-sm"
          disabled={busy}
          onClick={onLaunch}
        >
          {launchLabel}
        </Button>
        {hasActiveViewer ? (
          <>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 rounded-xl px-5 shadow-sm"
              onClick={onOpenCurrentGame}
            >
              {t("appsview.ResumeSession", {
                defaultValue: "Resume session",
              })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="min-h-11 rounded-xl px-5 shadow-sm"
              onClick={onOpenCurrentGameInNewTab}
            >
              {t("appsview.OpenInTab", { defaultValue: "Open in browser tab" })}
            </Button>
          </>
        ) : null}
      </div>

      <AliceArcadePanel app={app} />

      <section className="space-y-2.5">
        <MetadataRow
          label={t("appsview.LaunchType", { defaultValue: "Launch type" })}
          value={<span className="break-words">{app.launchType || "—"}</span>}
        />
        {app.launchUrl ? (
          <MetadataRow
            label={t("appsview.URL", { defaultValue: "URL" })}
            value={
              <span className="break-all text-muted-strong">
                {app.launchUrl}
              </span>
            }
          />
        ) : null}
        {app.repository ? (
          <MetadataRow
            label={t("appsview.Repository", { defaultValue: "Repository" })}
            value={
              <a
                href={app.repository}
                target="_blank"
                rel="noreferrer"
                className="break-all text-accent underline-offset-4 transition-colors hover:text-txt hover:underline"
              >
                {app.repository}
              </a>
            }
          />
        ) : null}
      </section>

      {app.capabilities?.length ? (
        <section className="space-y-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t("appsview.Capabilities", { defaultValue: "Capabilities" })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {app.capabilities.map((capability) => (
              <DetailBadge key={capability}>{capability}</DetailBadge>
            ))}
          </div>
        </section>
      ) : null}

      {app.viewer ? (
        <section className="rounded-[1.4rem] border border-border/35 bg-card/74 p-4 shadow-sm">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            {t("appsview.Viewer", { defaultValue: "Viewer" })}
          </div>
          <div className="space-y-2">
            <MetadataRow
              label={t("appsview.URL", { defaultValue: "URL" })}
              value={
                <span className="break-all text-muted-strong">
                  {app.viewer.url}
                </span>
              }
            />
            <MetadataRow
              label={t("appsview.Auth", { defaultValue: "Auth" })}
              value={
                <span className="text-muted-strong">
                  {app.viewer.postMessageAuth
                    ? t("appsview.Enabled", { defaultValue: "Enabled" })
                    : t("appsview.Disabled", { defaultValue: "Disabled" })}
                </span>
              }
            />
            <MetadataRow
              label={t("appsview.Sandbox", { defaultValue: "Sandbox" })}
              value={
                <span className="break-all text-muted-strong">
                  {app.viewer.sandbox || "—"}
                </span>
              }
            />
          </div>
        </section>
      ) : null}

      {DetailExtension ? (
        <div className="border-t border-border/35 pt-4">
          <DetailExtension app={app} />
        </div>
      ) : null}
    </div>
  );
}

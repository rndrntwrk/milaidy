/**
 * Apps View — browse and launch agent games/experiences.
 *
 * Fetches apps from the registry API and shows them as cards.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { client, type RegistryAppInfo } from "../../api";
import { useApp } from "../../state";
import { openExternalUrl } from "../../utils";
import { AppDetailPane } from "../apps/AppDetailPane";
import { AppsCatalogGrid } from "../apps/AppsCatalogGrid";
import {
  DEFAULT_VIEWER_SANDBOX,
  shouldShowAppInAppsView,
} from "../apps/helpers";
import { PagePanel } from "@miladyai/ui";

export { shouldShowAppInAppsView } from "../apps/helpers";

function AppsEmptyState() {
  const { t } = useApp();

  return (
    <PagePanel.Empty
      description={t("appsview.EmptyStateDescription")}
      title={t("appsview.EmptyStateTitle")}
    />
  );
}

export function AppsView() {
  const {
    activeGameApp,
    activeGameDisplayName,
    activeGameViewerUrl,
    setState,
    setActionNotice,
    t,
  } = useApp();
  const [apps, setApps] = useState<RegistryAppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [activeAppNames, setActiveAppNames] = useState<Set<string>>(new Set());
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
  const [busyApp, setBusyApp] = useState<string | null>(null);
  const currentGameViewerUrl =
    typeof activeGameViewerUrl === "string" ? activeGameViewerUrl : "";
  const hasCurrentGame = currentGameViewerUrl.trim().length > 0;

  const selectedApp = useMemo(
    () => apps.find((app) => app.name === selectedAppName) ?? null,
    [apps, selectedAppName],
  );

  const selectedAppHasActiveViewer =
    !!selectedApp && hasCurrentGame && activeGameApp === selectedApp.name;
  const selectedAppIsActive =
    !!selectedApp && activeAppNames.has(selectedApp.name);

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, installed] = await Promise.all([
        client.listApps(),
        client.listInstalledApps().catch((err: unknown) => {
          console.warn("[AppsView] Failed to list installed apps:", err);
          return [];
        }),
      ]);
      setApps(list);
      setActiveAppNames(new Set(installed.map((app) => app.name)));
      setSelectedAppName((current) => {
        if (!current) return list[0]?.name ?? null;
        return list.some((app) => app.name === current)
          ? current
          : (list[0]?.name ?? null);
      });
    } catch (err) {
      setError(
        t("appsview.LoadError", {
          message:
            err instanceof Error ? err.message : t("appsview.NetworkError"),
        }),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const clearActiveGameState = useCallback(() => {
    setState("activeGameApp", "");
    setState("activeGameDisplayName", "");
    setState("activeGameViewerUrl", "");
    setState("activeGameSandbox", DEFAULT_VIEWER_SANDBOX);
    setState("activeGamePostMessageAuth", false);
    setState("activeGamePostMessagePayload", null);
    setState("activeGameSession", null);
  }, [setState]);

  useEffect(() => {
    void loadApps();
  }, [loadApps]);

  const handleLaunch = useCallback(
    async (app: RegistryAppInfo) => {
      setBusyApp(app.name);
      try {
        const result = await client.launchApp(app.name);
        setActiveAppNames((previous) => {
          const next = new Set(previous);
          next.add(app.name);
          return next;
        });
        if (result.viewer?.url) {
          setState("activeGameApp", app.name);
          setState("activeGameDisplayName", app.displayName ?? app.name);
          setState("activeGameViewerUrl", result.viewer.url);
          setState(
            "activeGameSandbox",
            result.viewer.sandbox ?? DEFAULT_VIEWER_SANDBOX,
          );
          setState(
            "activeGamePostMessageAuth",
            Boolean(result.viewer.postMessageAuth),
          );
          setState(
            "activeGamePostMessagePayload",
            result.viewer.authMessage ?? null,
          );
          setState("activeGameSession", result.session ?? null);
          if (result.viewer.postMessageAuth && !result.viewer.authMessage) {
            setActionNotice(
              t("appsview.IframeAuthMissing", {
                name: app.displayName ?? app.name,
              }),
              "error",
              4800,
            );
          }
          setState("tab", "apps");
          setState("appsSubTab", "games");
          return;
        }
        clearActiveGameState();
        const targetUrl = result.launchUrl ?? app.launchUrl;
        if (targetUrl) {
          try {
            await openExternalUrl(targetUrl);
            setActionNotice(
              t("appsview.OpenedInNewTab", {
                name: app.displayName ?? app.name,
              }),
              "success",
              2600,
            );
          } catch {
            setActionNotice(
              t("appsview.PopupBlockedOpen", {
                name: app.displayName ?? app.name,
              }),
              "error",
              4200,
            );
          }
          return;
        }
        setActionNotice(
          t("appsview.LaunchedNoViewer", {
            name: app.displayName ?? app.name,
          }),
          "error",
          4000,
        );
      } catch (err) {
        setActionNotice(
          t("appsview.LaunchFailed", {
            name: app.displayName ?? app.name,
            message: err instanceof Error ? err.message : t("common.error"),
          }),
          "error",
          4000,
        );
      } finally {
        setBusyApp(null);
      }
    },
    [clearActiveGameState, setActionNotice, setState],
  );

  const handleOpenCurrentGame = useCallback(() => {
    if (!hasCurrentGame) return;
    setState("tab", "apps");
    setState("appsSubTab", "games");
  }, [hasCurrentGame, setState]);

  const handleOpenCurrentGameInNewTab = useCallback(async () => {
    if (!hasCurrentGame) return;
    try {
      await openExternalUrl(currentGameViewerUrl);
      setActionNotice(t("appsview.CurrentGameOpened"), "success", 2600);
    } catch {
      setActionNotice(t("appsview.PopupBlocked"), "error", 4200);
    }
  }, [currentGameViewerUrl, hasCurrentGame, setActionNotice, t]);

  const visibleApps = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return apps.filter((app) => {
      if (!shouldShowAppInAppsView(app)) {
        return false;
      }
      if (
        normalizedSearch &&
        !app.name.toLowerCase().includes(normalizedSearch) &&
        !(app.displayName ?? "").toLowerCase().includes(normalizedSearch) &&
        !(app.description ?? "").toLowerCase().includes(normalizedSearch)
      ) {
        return false;
      }
      if (showActiveOnly && !activeAppNames.has(app.name)) {
        return false;
      }
      return true;
    });
  }, [activeAppNames, apps, searchQuery, showActiveOnly]);

  return (
    <div className="device-layout mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-4 lg:px-6">
      <section className="overflow-hidden rounded-[2rem] border border-border/40 bg-card/88 shadow-[0_20px_60px_rgba(0,0,0,0.16)] backdrop-blur-xl">
        <div className="relative overflow-hidden border-b border-border/40 px-5 py-5">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,205,96,0.18),transparent_45%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent)]" />
          <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
                Agent App Library
              </div>
              <h1 className="mt-3 max-w-3xl text-[1.8rem] font-semibold tracking-[-0.02em] text-txt">
                Watch your agent live and steer it in real time.
              </h1>
              <p className="mt-3 max-w-2xl text-[13px] leading-6 text-muted-strong">
                Launch an app, lock onto the running agent immediately, and
                keep commands, pause, and telemetry docked beside the world
                instead of buried in another tool.
              </p>
            </div>

            <div
              className="rounded-[1.5rem] border border-border/35 bg-bg/65 px-4 py-4 shadow-sm"
              data-testid="apps-session-status-card"
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                {hasCurrentGame ? "Current live session" : "Session status"}
              </div>
              <div className="mt-2 text-sm font-semibold text-txt">
                {hasCurrentGame
                  ? activeGameDisplayName || "Active app session"
                  : "No app session running"}
              </div>
              <p className="mt-2 text-[12px] leading-6 text-muted-strong">
                {hasCurrentGame
                  ? "Jump back into the running app or keep browsing for another world to connect."
                  : "Pick an app to inspect launch details and start a live agent session."}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:p-5">
          <PagePanel variant="inset" className="p-4 lg:p-5">
            <AppsCatalogGrid
              activeAppNames={activeAppNames}
              activeGameDisplayName={activeGameDisplayName}
              error={error}
              hasCurrentGame={hasCurrentGame}
              loading={loading}
              searchQuery={searchQuery}
              selectedAppName={selectedAppName}
              showActiveOnly={showActiveOnly}
              visibleApps={visibleApps}
              onOpenCurrentGame={handleOpenCurrentGame}
              onRefresh={() => void loadApps()}
              onSearchQueryChange={setSearchQuery}
              onSelectApp={setSelectedAppName}
              onToggleActiveOnly={() =>
                setShowActiveOnly((current) => !current)
              }
            />
          </PagePanel>

          <PagePanel
            variant="inset"
            className="p-4 lg:p-5"
            data-testid="apps-detail-panel"
          >
            {selectedApp ? (
              <AppDetailPane
                app={selectedApp}
                busy={busyApp === selectedApp.name}
                hasActiveViewer={selectedAppHasActiveViewer}
                isActive={selectedAppIsActive}
                onBack={() => setSelectedAppName(null)}
                onLaunch={() => void handleLaunch(selectedApp)}
                onOpenCurrentGame={handleOpenCurrentGame}
                onOpenCurrentGameInNewTab={() =>
                  void handleOpenCurrentGameInNewTab()
                }
              />
            ) : (
              <AppsEmptyState />
            )}
          </PagePanel>
        </div>
      </section>
    </div>
  );
}

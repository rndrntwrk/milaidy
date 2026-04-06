import { Button, Input } from "@miladyai/ui";
import type { RegistryAppInfo } from "../../api";
import { useApp } from "../../state";
import {
  CATEGORY_LABELS,
  getAppEmoji,
  getAppSessionModeLabel,
  getAppShortName,
} from "./helpers";

interface AppsCatalogGridProps {
  activeAppNames: Set<string>;
  activeGameDisplayName: string;
  error: string | null;
  hasCurrentGame: boolean;
  loading: boolean;
  searchQuery: string;
  selectedAppName: string | null;
  showActiveOnly: boolean;
  visibleApps: RegistryAppInfo[];
  onOpenCurrentGame: () => void;
  onRefresh: () => void;
  onSearchQueryChange: (value: string) => void;
  onSelectApp: (appName: string) => void;
  onToggleActiveOnly: () => void;
}

export function AppsCatalogGrid({
  activeAppNames,
  activeGameDisplayName,
  error,
  hasCurrentGame,
  loading,
  searchQuery,
  selectedAppName,
  showActiveOnly,
  visibleApps,
  onOpenCurrentGame,
  onRefresh,
  onSearchQueryChange,
  onSelectApp,
  onToggleActiveOnly,
}: AppsCatalogGridProps) {
  const { t } = useApp();

  return (
    <div data-testid="apps-catalog-grid">
      <div className="mb-4 space-y-3">
        <Input
          type="text"
          aria-label={t("appsview.Search", { defaultValue: "Search apps" })}
          placeholder={t("appsview.SearchPlaceholder")}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          className="rounded-xl border-border/50 bg-card/86 text-[12px] text-txt placeholder:text-muted focus:border-accent"
        />
        <p className="text-[11px] leading-5 text-muted-strong">
          {t("appsview.HelperText")}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="rounded-full border border-border/30 bg-bg-hover px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-strong">
            {t("appsview.Results", { count: visibleApps.length })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-10 rounded-xl px-3 shadow-sm"
              onClick={onRefresh}
            >
              {t("common.refresh")}
            </Button>
            <Button
              variant={showActiveOnly ? "default" : "outline"}
              size="sm"
              className="min-h-10 rounded-xl px-3 shadow-sm"
              onClick={onToggleActiveOnly}
            >
              {t("appsview.ActiveOnly")}
            </Button>
          </div>
        </div>
      </div>

      {hasCurrentGame ? (
        <Button
          variant="ghost"
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-ok/30 bg-ok/8 px-3 py-3 text-left shadow-sm transition-colors hover:bg-ok/12"
          onClick={onOpenCurrentGame}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-ok animate-pulse" />
          <span className="min-w-0 flex-1 text-left text-[11px] font-semibold text-txt">
            {activeGameDisplayName || t("appsview.GameRunning")}
          </span>
          <span className="text-[10px] text-muted-strong">
            {t("appsview.Resume")}
          </span>
        </Button>
      ) : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[11px] text-danger">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-border/30 bg-card/72 py-16 text-center text-[12px] text-muted">
          {t("appsview.Loading")}
        </div>
      ) : visibleApps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/35 bg-card/72 px-6 py-16 text-center">
          <div className="text-[12px] font-medium text-muted-strong">
            {searchQuery
              ? t("appsview.NoAppsMatchSearch")
              : t("appsview.NoAppsAvailable")}
          </div>
          <div className="mt-2 text-[11px] leading-5 text-muted">
            {searchQuery
              ? t("appsview.EmptySearchHint")
              : t("appsview.EmptyCatalogHint")}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visibleApps.map((app) => {
            const isActive = activeAppNames.has(app.name);
            const isSelected = selectedAppName === app.name;
            const displayName = app.displayName ?? getAppShortName(app);
            const sessionModeLabel = getAppSessionModeLabel(app);
            const featuredSession = app.session?.mode === "spectate-and-steer";
            const capabilityPreview = (app.capabilities ?? []).slice(
              0,
              featuredSession ? 4 : 3,
            );

            const cardTestId = `app-card-${app.name.replace(/[^a-z0-9]+/gi, "-")}`;

            return (
              <Button
                key={app.name}
                variant="ghost"
                data-testid={cardTestId}
                className={`group flex h-auto w-full flex-col items-stretch overflow-hidden rounded-2xl border px-4 py-4 text-left shadow-sm transition-all ${
                  featuredSession ? "md:col-span-2" : ""
                } ${
                  isSelected
                    ? "is-selected border-accent/35 bg-accent/10 shadow-sm"
                    : "border-border/35 bg-card/72 hover:border-accent/20 hover:bg-bg-hover/70"
                }`}
                title={t("appsview.Open", { name: displayName })}
                aria-label={t("appsview.Open", { name: displayName })}
                onClick={() => onSelectApp(app.name)}
              >
                <div className="flex items-start gap-3">
                  <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.35rem] border border-border/35 bg-bg/80 text-[1.8rem] shadow-sm transition-transform group-hover:scale-[1.02]">
                    {isActive ? (
                      <span className="absolute -right-0.5 -top-0.5 z-10 h-2.5 w-2.5 rounded-full border-2 border-card bg-ok" />
                    ) : null}
                    <span>{getAppEmoji(app)}</span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5">
                      {isActive ? (
                        <span className="inline-flex items-center rounded-full border border-ok/30 bg-ok/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-ok">
                          {t("appsview.Active")}
                        </span>
                      ) : null}
                      {app.category ? (
                        <span className="inline-flex items-center rounded-full border border-border/35 bg-bg-hover/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-strong">
                          {CATEGORY_LABELS[app.category] ?? app.category}
                        </span>
                      ) : null}
                      {sessionModeLabel ? (
                        <span className="inline-flex items-center rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
                          {sessionModeLabel}
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-3 text-sm font-semibold text-txt">
                      {displayName}
                    </div>
                    <p
                      className={`mt-1 text-[12px] leading-5 text-muted-strong ${
                        featuredSession
                          ? "line-clamp-3 max-w-[44rem]"
                          : "line-clamp-2"
                      }`}
                    >
                      {app.description ||
                        "Open the experience, connect your agent, and manage the session from Milady."}
                    </p>
                  </div>
                </div>

                {capabilityPreview.length > 0 ? (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {capabilityPreview.map((capability) => (
                      <span
                        key={capability}
                        className="inline-flex max-w-full items-center rounded-full border border-border/30 bg-bg/75 px-2 py-0.5 text-[10px] text-muted-strong"
                      >
                        <span className="truncate">{capability}</span>
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 flex items-center justify-between gap-3 text-[11px]">
                  <span className="text-muted-strong">
                    {sessionModeLabel ?? app.launchType ?? "inspect"}
                  </span>
                  <span className="shrink-0 font-medium text-accent">
                    Inspect →
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

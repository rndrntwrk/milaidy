import { Button } from "@miladyai/ui";
import type React from "react";
import type { RegistryAppInfo } from "../../api";
import { useApp } from "../../state";
import { getAppDetailExtension } from "./extensions/registry";
import {
  CATEGORY_LABELS,
  getAppEmoji,
  getAppSessionFeatureLabels,
  getAppSessionModeLabel,
} from "./helpers";

interface AppDetailPaneProps {
  app: RegistryAppInfo;
  busy: boolean;
  hasActiveViewer: boolean;
  isActive: boolean;
  onBack: () => void;
  onLaunch: () => void;
  onOpenCurrentGame: () => void;
  onOpenCurrentGameInNewTab: () => void;
}

function Badge({
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
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${toneClassName}`}
    >
      {children}
    </span>
  );
}

export function AppDetailPane({
  app,
  busy,
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
  const sessionModeLabel = getAppSessionModeLabel(app);
  const sessionFeatures = getAppSessionFeatureLabels(app);
  const launchLabel = busy
    ? t("appsview.Launching", { defaultValue: "Launching..." })
    : t("appsview.Launch", { defaultValue: "Launch" });

  return (
    <div className="space-y-4">
      <button
        type="button"
        className="text-[12px] font-medium text-muted-strong transition-colors hover:text-txt"
        onClick={onBack}
      >
        ← Back
      </button>

      <div className="flex flex-col gap-4 rounded-2xl border border-border/35 bg-card/72 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border/35 bg-bg/80 text-2xl">
            {getAppEmoji(app)}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-txt">
              {app.displayName ?? app.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {isActive ? <Badge tone="success">Active</Badge> : null}
              {app.category ? (
                <Badge>
                  {CATEGORY_LABELS[app.category] ?? app.category}
                </Badge>
              ) : null}
              {sessionModeLabel ? (
                <Badge tone="accent">{sessionModeLabel}</Badge>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex gap-2 sm:shrink-0">
          <Button
            variant="default"
            size="sm"
            data-testid="apps-detail-launch"
            className="rounded-xl px-4"
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
                data-testid="apps-detail-resume"
                className="rounded-xl px-4"
                onClick={onOpenCurrentGame}
              >
                Resume
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="apps-detail-open-tab"
                className="rounded-xl px-4"
                onClick={onOpenCurrentGameInNewTab}
              >
                {t("appsview.OpenInTab", { defaultValue: "Open in tab" })}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <p className="max-w-prose text-[13px] leading-6 text-muted-strong">
        {description}
      </p>

      <div className="grid gap-2 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
        {app.launchType ? (
          <div className="rounded-xl border border-border/30 bg-card/60 px-3 py-2">
            <span className="text-muted">Launch</span>
            <span className="ml-2 text-txt">{app.launchType}</span>
          </div>
        ) : null}
        {sessionModeLabel ? (
          <div className="rounded-xl border border-border/30 bg-card/60 px-3 py-2">
            <span className="text-muted">Session</span>
            <span className="ml-2 text-txt">{sessionModeLabel}</span>
          </div>
        ) : null}
        {app.latestVersion ? (
          <div className="rounded-xl border border-border/30 bg-card/60 px-3 py-2">
            <span className="text-muted">Version</span>
            <span className="ml-2 font-mono text-txt">
              v{app.latestVersion}
            </span>
          </div>
        ) : null}
        {app.launchUrl ? (
          <div className="overflow-hidden rounded-xl border border-border/30 bg-card/60 px-3 py-2">
            <span className="text-muted">URL</span>
            <span className="ml-2 truncate text-muted-strong">
              {app.launchUrl}
            </span>
          </div>
        ) : null}
      </div>

      {app.repository ? (
        <a
          href={app.repository}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-[12px] text-accent underline-offset-4 transition-colors hover:underline"
        >
          {app.repository}
        </a>
      ) : null}

      {sessionFeatures.length > 0 || (app.capabilities?.length ?? 0) > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {sessionFeatures.map((feature) => (
            <Badge key={feature} tone="accent">
              {feature}
            </Badge>
          ))}
          {(app.capabilities ?? []).map((capability) => (
            <Badge key={capability}>{capability}</Badge>
          ))}
        </div>
      ) : null}

      {app.viewer ? (
        <div className="rounded-xl border border-border/30 bg-card/60 p-3 text-[12px]">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted">
            Viewer
          </div>
          <div className="space-y-1 text-muted-strong">
            <div className="break-all">{app.viewer.url}</div>
            {app.viewer.postMessageAuth ? <div>Auth: enabled</div> : null}
          </div>
        </div>
      ) : null}

      {DetailExtension ? (
        <div className="border-t border-border/30 pt-4">
          <DetailExtension app={app} />
        </div>
      ) : null}
    </div>
  );
}

import { Button } from "@miladyai/ui";
import type { AppRunSummary } from "../../api";
import { useApp } from "../../state";
import { getAppEmoji } from "./helpers";

interface RunningAppsPanelProps {
  runs: AppRunSummary[];
  selectedRunId: string | null;
  busyRunId: string | null;
  onSelectRun: (runId: string) => void;
  onOpenRun: (run: AppRunSummary) => void;
  onDetachRun: (run: AppRunSummary) => void;
  onStopRun: (run: AppRunSummary) => void;
}

function HealthBadge({ run }: { run: AppRunSummary }) {
  const toneClass =
    run.health.state === "healthy"
      ? "border-ok/30 bg-ok/10 text-ok"
      : run.health.state === "degraded"
        ? "border-warn/30 bg-warn/10 text-warn"
        : "border-danger/30 bg-danger/10 text-danger";

  return (
    <span
      className={`inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${toneClass}`}
    >
      {run.health.state}
    </span>
  );
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function RunningAppsPanel({
  runs,
  selectedRunId,
  busyRunId,
  onSelectRun,
  onOpenRun,
  onDetachRun,
  onStopRun,
}: RunningAppsPanelProps) {
  const { t } = useApp();
  const selectedRun =
    runs.find((run) => run.runId === selectedRunId) ?? runs[0] ?? null;

  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/35 bg-card/72 px-6 py-16 text-center">
        <div className="text-[12px] font-medium text-muted-strong">
          {t("appsview.NoRunningApps", {
            defaultValue: "No app runs are active right now.",
          })}
        </div>
        <div className="mt-2 text-[11px] leading-5 text-muted">
          {t("appsview.NoRunningAppsHint", {
            defaultValue:
              "Launch a game from the catalog and it will appear here as a reattachable run.",
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-3">
        {runs.map((run) => {
          const isSelected = run.runId === selectedRun?.runId;
          return (
            <Button
              key={run.runId}
              variant="ghost"
              className={`flex h-auto w-full flex-col items-stretch rounded-2xl border px-4 py-4 text-left shadow-sm ${
                isSelected
                  ? "border-accent/35 bg-accent/10"
                  : "border-border/35 bg-card/72 hover:border-accent/20 hover:bg-bg-hover/70"
              }`}
              onClick={() => onSelectRun(run.runId)}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-border/35 bg-bg/80 text-[1.5rem] shadow-sm">
                  {getAppEmoji({
                    name: run.appName,
                    displayName: run.displayName,
                    description: "",
                    category: "game",
                    launchType: run.launchType,
                    launchUrl: run.launchUrl,
                    icon: null,
                    capabilities: [],
                    stars: 0,
                    repository: "",
                    latestVersion: null,
                    supports: { v0: false, v1: true, v2: true },
                    npm: {
                      package: run.appName,
                      v0Version: null,
                      v1Version: null,
                      v2Version: null,
                    },
                  })}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-txt">
                      {run.displayName}
                    </span>
                    <HealthBadge run={run} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted-strong">
                    {run.status}
                  </div>
                  <div className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted">
                    {run.summary || run.health.message || "Run active"}
                  </div>
                </div>
              </div>
            </Button>
          );
        })}
      </div>

      {selectedRun ? (
        <section className="space-y-4 rounded-[1.75rem] border border-border/35 bg-card/78 p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                {t("appsview.RunningNow", { defaultValue: "Running now" })}
              </div>
              <div className="mt-2 text-xl font-semibold tracking-[0.01em] text-txt">
                {selectedRun.displayName}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <HealthBadge run={selectedRun} />
                <span className="inline-flex min-h-6 items-center rounded-full border border-border/35 bg-bg-hover/70 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-strong">
                  {selectedRun.viewerAttachment}
                </span>
                <span className="inline-flex min-h-6 items-center rounded-full border border-border/35 bg-bg-hover/70 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-strong">
                  {selectedRun.status}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                size="sm"
                className="min-h-10 rounded-xl px-4 shadow-sm"
                onClick={() => onOpenRun(selectedRun)}
              >
                {selectedRun.viewer ? "Open viewer" : "Inspect run"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10 rounded-xl px-4 shadow-sm"
                onClick={() => onDetachRun(selectedRun)}
                disabled={
                  busyRunId === selectedRun.runId ||
                  selectedRun.viewerAttachment !== "attached"
                }
              >
                Detach viewer
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="min-h-10 rounded-xl px-4 shadow-sm"
                onClick={() => onStopRun(selectedRun)}
                disabled={busyRunId === selectedRun.runId}
              >
                {busyRunId === selectedRun.runId ? "Stopping..." : "Stop run"}
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="rounded-2xl border border-border/35 bg-bg/55 px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Started
              </div>
              <div className="mt-1 text-[12px] leading-5 text-txt">
                {formatTimestamp(selectedRun.startedAt)}
              </div>
            </div>
            <div className="rounded-2xl border border-border/35 bg-bg/55 px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Last heartbeat
              </div>
              <div className="mt-1 text-[12px] leading-5 text-txt">
                {selectedRun.lastHeartbeatAt
                  ? formatTimestamp(selectedRun.lastHeartbeatAt)
                  : "No heartbeat recorded"}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/35 bg-bg/55 px-4 py-3">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
              Summary
            </div>
            <div className="mt-1 text-[13px] leading-6 text-muted-strong">
              {selectedRun.summary ||
                selectedRun.health.message ||
                "This run is active and ready to reattach."}
            </div>
          </div>

          {selectedRun.session?.goalLabel ? (
            <div className="rounded-2xl border border-border/35 bg-bg/55 px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Current goal
              </div>
              <div className="mt-1 text-[13px] leading-6 text-muted-strong">
                {selectedRun.session.goalLabel}
              </div>
            </div>
          ) : null}

          {selectedRun.session?.suggestedPrompts?.length ? (
            <div className="rounded-2xl border border-border/35 bg-bg/55 px-4 py-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
                Suggested prompts
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedRun.session.suggestedPrompts.map((prompt) => (
                  <span
                    key={prompt}
                    className="inline-flex max-w-full items-center rounded-full border border-border/30 bg-bg/75 px-2 py-0.5 text-[10px] text-muted-strong"
                  >
                    <span className="truncate">{prompt}</span>
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

import { useMemo } from "react";
import { useApp } from "../../../state";
import type { AppDetailExtensionProps } from "./types";

function DetailCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border/35 bg-bg/55 px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
        {label}
      </div>
      <div className="mt-1 text-[12px] leading-5 text-txt">{value}</div>
    </div>
  );
}

function formatTimestamp(value: string | number | null | undefined): string {
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not yet verified" : date.toLocaleString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Not yet verified" : date.toLocaleString();
  }
  return "Not yet verified";
}

function statusTone(status: string): string {
  if (status === "running" || status === "connected") {
    return "border-ok/30 bg-ok/10 text-ok";
  }
  if (status === "disconnected" || status === "offline") {
    return "border-danger/30 bg-danger/10 text-danger";
  }
  return "border-warn/30 bg-warn/10 text-warn";
}

export function DefenseAgentsDetailExtension({
  app,
}: AppDetailExtensionProps) {
  const { appRuns } = useApp();
  const availableRuns = Array.isArray(appRuns) ? appRuns : [];
  const run = useMemo(
    () =>
      [...availableRuns]
        .filter((candidate) => candidate.appName === app.name)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
      null,
    [app.name, availableRuns],
  );
  const telemetry =
    run?.session?.telemetry && typeof run.session.telemetry === "object"
      ? (run.session.telemetry as Record<string, unknown>)
      : null;
  const recentActivity = Array.isArray(telemetry?.recentActivity)
    ? (telemetry.recentActivity as Array<Record<string, unknown>>).slice(-4).reverse()
    : [];
  const heroClass =
    typeof telemetry?.heroClass === "string" ? telemetry.heroClass : "Unknown";
  const heroLane =
    typeof telemetry?.heroLane === "string" ? telemetry.heroLane : "unknown";
  const heroLevel =
    typeof telemetry?.heroLevel === "number"
      ? `Lv${telemetry.heroLevel}`
      : "Level unknown";
  const heroHp =
    typeof telemetry?.heroHp === "number" &&
    typeof telemetry?.heroMaxHp === "number"
      ? `${telemetry.heroHp}/${telemetry.heroMaxHp} HP`
      : "HP unknown";
  const autoPlayLabel =
    telemetry?.autoPlay === true ? "Enabled" : "Operator-led";
  const strategyLabel =
    typeof telemetry?.strategyVersion === "number"
      ? `Version ${telemetry.strategyVersion}`
      : "Ready after launch";

  if (!run) {
    return (
      <section className="space-y-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Operator Surface
        </div>
        <div className="rounded-[1.4rem] border border-border/35 bg-card/74 p-4 shadow-sm">
          <p className="text-[12px] leading-6 text-muted-strong">
            Defense of the Agents uses a Milady-hosted spectator shell. Launch it
            to monitor the agent, keep the autoplay script running, and steer the
            hero with live chat guidance.
          </p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <DetailCard label="Autoplay Loop" value="Deploys, levels, recalls, and reinforces lanes." />
            <DetailCard label="Strategy Review" value="Scores current tactics and promotes better versions over time." />
            <DetailCard label="Operator Chat" value="Suggestions flow into the live session while the bot keeps playing." />
            <DetailCard label="Viewer Shell" value="The app opens a stable local shell instead of the broken remote overlay stack." />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Live Operator Surface
        </div>
        <span
          className={`inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${statusTone(run.status)}`}
        >
          {run.status}
        </span>
        <span className="inline-flex min-h-6 items-center rounded-full border border-border/35 bg-bg-hover/70 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-strong">
          {run.viewerAttachment}
        </span>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        <DetailCard label="Agent Status" value={`${heroClass} ${heroLevel} in ${heroLane} lane`} />
        <DetailCard label="Hero Health" value={heroHp} />
        <DetailCard label="Autoplay Script" value={autoPlayLabel} />
        <DetailCard label="Strategy Script" value={strategyLabel} />
      </div>

      <div className="rounded-[1.4rem] border border-border/35 bg-card/74 p-4 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Session Summary
        </div>
        <p className="mt-2 text-[12px] leading-6 text-muted-strong">
          {run.summary || run.health.message || "Run active."}
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <DetailCard
            label="Operator Channel"
            value={
              run.session?.canSendCommands
                ? "Ready for live suggestions and steering."
                : "Waiting for the live command channel."
            }
          />
          <DetailCard
            label="Last Verified"
            value={formatTimestamp(run.lastHeartbeatAt ?? run.updatedAt)}
          />
        </div>
      </div>

      <div className="rounded-[1.4rem] border border-border/35 bg-card/74 p-4 shadow-sm">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Active Scripts
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <DetailCard
            label="Autoplay Loop"
            value={
              telemetry?.autoPlay === true
                ? "Running lane-defense automation."
                : "Standing by for operator-led play."
            }
          />
          <DetailCard
            label="Strategy Review"
            value={
              typeof telemetry?.bestStrategyVersion === "number"
                ? `Tracking best version ${telemetry.bestStrategyVersion}.`
                : "Scoring strategy performance in-session."
            }
          />
          <DetailCard
            label="Viewer Shell"
            value={
              run.viewer
                ? "Local spectator shell is available for stable viewing."
                : "Viewer shell unavailable."
            }
          />
          <DetailCard
            label="Operator Steering"
            value={
              run.session?.canSendCommands
                ? "Chat guidance is live."
                : "Command bridge is reconnecting."
            }
          />
        </div>
      </div>

      {recentActivity.length > 0 ? (
        <div className="rounded-[1.4rem] border border-border/35 bg-card/74 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Recent Behavior
          </div>
          <div className="mt-3 space-y-2">
            {recentActivity.map((entry, index) => {
              const action =
                typeof entry.action === "string" ? entry.action : "activity";
              const detail =
                typeof entry.detail === "string" ? entry.detail : "No detail captured.";
              const ts =
                typeof entry.ts === "number" || typeof entry.ts === "string"
                  ? formatTimestamp(entry.ts)
                  : "Unknown time";
              return (
                <div
                  key={`${action}-${ts}-${index}`}
                  className="rounded-xl border border-border/30 bg-bg/60 px-3 py-2"
                >
                  <div className="text-[11px] font-medium text-txt">{action}</div>
                  <div className="mt-1 text-[11px] leading-5 text-muted-strong">
                    {detail}
                  </div>
                  <div className="mt-1 text-[10px] text-muted">{ts}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {run.session?.suggestedPrompts?.length ? (
        <div className="rounded-[1.4rem] border border-border/35 bg-card/74 p-4 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
            Suggested Prompts
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {run.session.suggestedPrompts.map((prompt) => (
              <span
                key={prompt}
                className="inline-flex max-w-full items-center rounded-full border border-border/30 bg-bg/75 px-2 py-0.5 text-[10px] text-muted-strong"
              >
                {prompt}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

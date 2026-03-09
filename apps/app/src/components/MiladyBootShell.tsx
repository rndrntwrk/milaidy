import type { ReactNode } from "react";
import { Card } from "./ui/Card.js";

interface MiladyBootShellProps {
  title: string;
  subtitle?: string;
  status?: string;
  children: ReactNode;
  footer?: ReactNode;
  accent?: "accent" | "danger" | "ok" | "warning";
  panelClassName?: string;
  identityLabel?: string;
}

const ACCENT_STYLES: Record<
  NonNullable<MiladyBootShellProps["accent"]>,
  {
    text: string;
    chip: string;
  }
> = {
  accent: {
    text: "text-white/92",
    chip: "border-white/16 bg-white/[0.08] text-white/88",
  },
  danger: {
    text: "text-danger",
    chip: "border-danger/30 bg-danger/10 text-danger",
  },
  ok: {
    text: "text-ok",
    chip: "border-ok/30 bg-ok/10 text-ok",
  },
  warning: {
    text: "text-warn",
    chip: "border-warn/30 bg-warn/10 text-warn",
  },
};

export function MiladyBootShell({
  title,
  subtitle,
  status,
  children,
  footer,
  accent = "accent",
  panelClassName = "",
  identityLabel = "rasp",
}: MiladyBootShellProps) {
  const tone = ACCENT_STYLES[accent];

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#080a0e] px-4 py-8 font-body text-txt">
      <div className="pointer-events-none absolute inset-0 opacity-[0.06] bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:36px_36px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_42%)]" />

      <div className="relative z-10 flex w-full max-w-6xl flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
          <Card className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] px-4 py-3 font-mono text-[11px] uppercase tracking-[0.24em] text-white/45">
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className={`text-sm font-semibold tracking-[0.32em] ${tone.text}`}>
                {title}
              </h1>
              {subtitle ? <p className="max-w-[40rem] text-white/52">{subtitle}</p> : null}
            </div>
            {status ? (
              <div className={`rounded-full border px-3 py-1 ${tone.chip}`}>
                {status}
              </div>
            ) : null}
          </Card>

          <Card className="rounded-[24px] px-4 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">
            <h2 className="text-white/85">Boot diagnostics</h2>
            <div className="mt-2 space-y-1">
              <div>Agent: {identityLabel}</div>
              <div>Shell: broadcast conversation HUD</div>
              <div>Status: {status ?? "standby"}</div>
            </div>
          </Card>
        </div>

        <Card className={`w-full rounded-[28px] p-0 ${panelClassName}`.trim()}>
          <div className="relative">{children}</div>
        </Card>

        {footer ? (
          <Card className="rounded-[24px] px-4 py-3 text-xs text-white/55">
            {footer}
          </Card>
        ) : null}
      </div>
    </div>
  );
}

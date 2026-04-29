import { cn } from "@miladyai/ui";
import type * as React from "react";
import {
  DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_DESTRUCTIVE_CLASSNAME,
  DESKTOP_INPUT_SHELL_CLASSNAME,
} from "../desktop-surface-primitives";

export type OperatorPillTone =
  | "neutral"
  | "accent"
  | "success"
  | "danger"
  | "warning";

export const OPERATOR_SECTION_EYEBROW_CLASSNAME =
  "text-[10px] font-semibold uppercase tracking-[0.18em] text-muted";
export const OPERATOR_SECTION_TITLE_CLASSNAME =
  "text-[15px] font-semibold tracking-[0.01em] text-txt";
export const OPERATOR_SECTION_DESCRIPTION_CLASSNAME =
  "text-[12px] leading-6 text-muted-strong";

const OPERATOR_PILL_TONE_CLASSNAME: Record<OperatorPillTone, string> = {
  neutral:
    "border-border/32 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--card)_84%,transparent),color-mix(in_srgb,var(--bg)_95%,transparent))] text-muted-strong",
  accent:
    "border-accent/26 bg-[linear-gradient(180deg,rgba(var(--accent-rgb),0.16),rgba(var(--accent-rgb),0.07))] text-txt-strong",
  success:
    "border-ok/30 bg-[linear-gradient(180deg,rgba(34,197,94,0.14),rgba(34,197,94,0.06))] text-ok",
  danger:
    "border-danger/30 bg-[linear-gradient(180deg,rgba(239,68,68,0.14),rgba(239,68,68,0.06))] text-danger",
  warning:
    "border-warn/30 bg-[linear-gradient(180deg,rgba(245,158,11,0.14),rgba(245,158,11,0.06))] text-warn",
};

export const OPERATOR_ACTION_BUTTON_BASE_CLASSNAME = cn(
  DESKTOP_CONTROL_SURFACE_CLASSNAME,
  DESKTOP_CONTROL_SURFACE_COMPACT_CLASSNAME,
  "inline-flex min-h-11 items-center justify-center rounded-full px-4 text-[11px] font-semibold uppercase tracking-[0.14em] shadow-sm focus-visible:ring-2 focus-visible:ring-accent/35 sm:min-h-10 disabled:cursor-wait disabled:opacity-55",
);

export const OPERATOR_ACTION_BUTTON_TONE_CLASSNAME = {
  neutral: "",
  accent: DESKTOP_CONTROL_SURFACE_ACCENT_CLASSNAME,
  danger: DESKTOP_CONTROL_SURFACE_DESTRUCTIVE_CLASSNAME,
} as const;

export const OPERATOR_SELECT_SHELL_CLASSNAME = cn(
  DESKTOP_INPUT_SHELL_CLASSNAME,
  "min-h-11 rounded-[1rem]",
);

export const OPERATOR_SELECT_CLASSNAME =
  "min-h-11 w-full appearance-none bg-transparent px-3 py-2 pr-8 text-[12px] text-txt outline-none disabled:cursor-wait disabled:opacity-70";

export function OperatorPill({
  children,
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: OperatorPillTone }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] shadow-sm",
        OPERATOR_PILL_TONE_CLASSNAME[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function OperatorSectionHeader({
  eyebrow,
  title,
  description,
  meta,
  className,
  titleId,
  titleAs: TitleTag = "div",
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  titleId?: string;
  titleAs?: React.ElementType;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <div className={OPERATOR_SECTION_EYEBROW_CLASSNAME}>{eyebrow}</div>
        ) : null}
        <TitleTag id={titleId} className={OPERATOR_SECTION_TITLE_CLASSNAME}>
          {title}
        </TitleTag>
        {description ? (
          <p className={OPERATOR_SECTION_DESCRIPTION_CLASSNAME}>
            {description}
          </p>
        ) : null}
      </div>
      {meta ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{meta}</div>
      ) : null}
    </div>
  );
}

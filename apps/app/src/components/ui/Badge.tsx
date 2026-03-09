import * as React from "react";
import { cn } from "./utils.js";

type BadgeVariant = "default" | "outline" | "success" | "warning" | "danger" | "accent";

const badgeClasses: Record<BadgeVariant, string> = {
  default: "border-white/12 bg-black/35 text-white/74",
  outline: "border-white/12 bg-transparent text-white/68",
  success: "border-ok/25 bg-ok/10 text-ok",
  warning: "border-warn/25 bg-warn/10 text-warn",
  danger: "border-danger/25 bg-danger/10 text-danger",
  accent: "border-accent/25 bg-accent/10 text-accent",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] backdrop-blur",
        badgeClasses[variant],
        className,
      )}
      {...props}
    />
  );
}

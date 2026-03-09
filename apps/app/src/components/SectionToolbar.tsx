import type { ReactNode } from "react";
import { cn } from "./ui/utils";

export function SectionToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("pro-streamer-section-toolbar", className)}>{children}</div>;
}

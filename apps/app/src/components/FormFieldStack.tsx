import type { ReactNode } from "react";
import { cn } from "./ui/utils";

export function FormFieldStack({
  label,
  help,
  children,
  className,
}: {
  label: ReactNode;
  help?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("pro-streamer-field-stack", className)}>
      <div className="pro-streamer-field-stack__label">{label}</div>
      {help ? <div className="pro-streamer-field-stack__help">{help}</div> : null}
      <div className="pro-streamer-field-stack__control">{children}</div>
    </div>
  );
}

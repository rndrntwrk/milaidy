/**
 * IconTooltip — lightweight wrapper that shows a tooltip on hover.
 * Stub implementation for the Header component.
 */
import type { ReactNode } from "react";

export function IconTooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return <span title={label}>{children}</span>;
}

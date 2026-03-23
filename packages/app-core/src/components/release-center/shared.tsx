import { StatusBadge, type StatusTone } from "@miladyai/ui";
import { formatDateTime } from "../format";

export function summarizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeReleaseNotesUrl(url?: string | null): string {
  const candidate = url?.trim() || "https://milady.ai/releases/";
  try {
    return new URL(candidate).toString();
  } catch {
    return "https://milady.ai/releases/";
  }
}

/**
 * Delegates to the canonical {@link formatDateTime} from `../format.ts`,
 * preserving the original "Not yet" fallback used in release-center views.
 */
export function formatTimestamp(timestamp?: number | null): string {
  return formatDateTime(timestamp, { fallback: "Not yet" });
}

const PILL_TONE_MAP: Record<string, StatusTone> = {
  good: "success",
  warning: "warning",
  neutral: "muted",
};

export function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "good" | "warning";
}) {
  return (
    <StatusBadge
      label={label}
      tone={PILL_TONE_MAP[tone] ?? "muted"}
      className="rounded-full px-2.5 py-1 text-[11px] font-medium normal-case"
    />
  );
}

export function DefinitionRow({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-right text-xs text-txt break-all">
        {value ?? "Unavailable"}
      </div>
    </div>
  );
}

export function partitionDescription(partition: string): string {
  return partition === "persist:default"
    ? "Renderer default session"
    : "Sandboxed release notes session";
}

import type { StreamEventEnvelope } from "../../api-client.js";

export interface PublicActionEntry {
  id: string;
  title: string;
  detail: string;
  variant: "accent" | "success" | "warning" | "danger" | "outline";
  timestamp: string;
  timestampMs: number;
}

function coerceRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function pickName(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.toolName,
    payload.actionName,
    payload.name,
    payload.provider,
    payload.label,
    payload.command,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

export function summarizePublicAction(
  event: StreamEventEnvelope,
): PublicActionEntry | null {
  const payload = coerceRecord(event.payload);
  const stream = (event.stream ?? event.type ?? "event").toLowerCase();
  const subject = pickName(payload);
  const status =
    typeof payload.status === "string" ? payload.status.trim() : "";
  const count =
    typeof payload.count === "number"
      ? payload.count
      : typeof payload.resultCount === "number"
        ? payload.resultCount
        : null;
  const timestampMs = event.ts;
  const timestamp = new Date(event.ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (stream === "error") {
    return {
      id: event.eventId,
      title: subject ? `Action failed: ${subject}` : "Action failed",
      detail: "The current step hit an error and needs operator attention.",
      variant: "danger",
      timestamp,
      timestampMs,
    };
  }

  if (stream === "tool") {
    return {
      id: event.eventId,
      title: subject ? `Running ${subject}` : "Running tool",
      detail:
        status ||
        (count !== null
          ? `Processed ${count} items.`
          : "Tool execution is in progress."),
      variant: "success",
      timestamp,
      timestampMs,
    };
  }

  if (stream === "action") {
    return {
      id: event.eventId,
      title: subject ? `Executing ${subject}` : "Executing action",
      detail: status || "The agent is carrying out the next live step.",
      variant: "accent",
      timestamp,
      timestampMs,
    };
  }

  if (stream === "provider") {
    return {
      id: event.eventId,
      title: "Generating response",
      detail: status || "The model is composing the next reply.",
      variant: "accent",
      timestamp,
      timestampMs,
    };
  }

  if (
    stream === "approval" ||
    status.toLowerCase().includes("approval") ||
    status.toLowerCase().includes("pending")
  ) {
    return {
      id: event.eventId,
      title: "Approval required",
      detail: "A protected action is waiting for operator confirmation.",
      variant: "warning",
      timestamp,
      timestampMs,
    };
  }

  if (stream === "task" || stream === "system" || stream === "autonomy") {
    return {
      id: event.eventId,
      title: "Mission update",
      detail:
        status ||
        (count !== null
          ? `Updated ${count} mission items.`
          : "The live mission state changed."),
      variant: "outline",
      timestamp,
      timestampMs,
    };
  }

  return null;
}

export function buildPublicActionEntries(
  events: StreamEventEnvelope[],
): PublicActionEntry[] {
  return events
    .map(summarizePublicAction)
    .filter((entry): entry is PublicActionEntry => Boolean(entry));
}

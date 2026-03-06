import type { ConversationMessage } from "../api-client";

export interface Arcade555ActionTrace {
  sessionId?: string;
  segmentId?: string;
  actionId?: string;
  idempotencyKey?: string;
  stage?: string;
  attempt?: number;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
}

export interface Arcade555ActionEnvelope {
  ok: boolean;
  code: string;
  module: string;
  action: string;
  message: string;
  status: number;
  retryable: boolean;
  data?: unknown;
  details?: unknown;
  trace?: Arcade555ActionTrace;
}

export interface ConversationActionTimelineEntry {
  messageId: string;
  role: ConversationMessage["role"];
  timestamp: number;
  source?: string;
  envelope: Arcade555ActionEnvelope;
}

const FENCED_JSON_RE = /```(?:json)?\s*([\s\S]*?)```/i;

function tryParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTrace(value: unknown): Arcade555ActionTrace | undefined {
  if (!isRecord(value)) return undefined;
  const trace: Arcade555ActionTrace = {};
  if (typeof value.sessionId === "string") trace.sessionId = value.sessionId;
  if (typeof value.segmentId === "string") trace.segmentId = value.segmentId;
  if (typeof value.actionId === "string") trace.actionId = value.actionId;
  if (typeof value.idempotencyKey === "string")
    trace.idempotencyKey = value.idempotencyKey;
  if (typeof value.stage === "string") trace.stage = value.stage;
  if (typeof value.attempt === "number") trace.attempt = value.attempt;
  if (typeof value.startedAt === "string") trace.startedAt = value.startedAt;
  if (typeof value.completedAt === "string")
    trace.completedAt = value.completedAt;
  if (typeof value.durationMs === "number") trace.durationMs = value.durationMs;
  return Object.keys(trace).length > 0 ? trace : undefined;
}

function parseEnvelopeRecord(parsed: unknown): Arcade555ActionEnvelope | null {
  if (!isRecord(parsed)) return null;
  if (
    typeof parsed.ok !== "boolean" ||
    typeof parsed.code !== "string" ||
    typeof parsed.module !== "string" ||
    typeof parsed.action !== "string" ||
    typeof parsed.message !== "string" ||
    typeof parsed.status !== "number" ||
    typeof parsed.retryable !== "boolean"
  ) {
    return null;
  }

  return {
    ok: parsed.ok,
    code: parsed.code,
    module: parsed.module,
    action: parsed.action,
    message: parsed.message,
    status: parsed.status,
    retryable: parsed.retryable,
    data: parsed.data,
    details: parsed.details,
    trace: parseTrace(parsed.trace),
  };
}

export function parseArcade555ActionEnvelope(
  text: string,
): Arcade555ActionEnvelope | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const direct = parseEnvelopeRecord(tryParse(trimmed));
  if (direct) return direct;

  const fencedMatch = FENCED_JSON_RE.exec(trimmed);
  if (!fencedMatch || typeof fencedMatch[1] !== "string") return null;
  return parseEnvelopeRecord(tryParse(fencedMatch[1].trim()));
}

export function collectArcade555ActionTimeline(
  messages: ConversationMessage[],
): ConversationActionTimelineEntry[] {
  const entries: ConversationActionTimelineEntry[] = [];
  for (const message of messages) {
    const envelope = parseArcade555ActionEnvelope(message.text);
    if (!envelope) continue;
    entries.push({
      messageId: message.id,
      role: message.role,
      timestamp: message.timestamp,
      source: message.source,
      envelope,
    });
  }
  return entries;
}

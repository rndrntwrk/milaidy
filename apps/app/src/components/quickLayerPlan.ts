export type ParsedToolEnvelope = {
  ok?: boolean;
  action?: string;
  message?: string;
  status?: number;
  data?: Record<string, unknown>;
};

export type ParsedAutonomyPlanResponse = {
  allSucceeded?: boolean;
  results?: unknown[];
};

export function parseToolEnvelopeFromPipelineResult(
  pipelineResult: unknown,
): ParsedToolEnvelope | null {
  if (!pipelineResult || typeof pipelineResult !== "object") return null;
  const pipelineRecord = pipelineResult as Record<string, unknown>;
  const fallbackAction =
    typeof pipelineRecord.toolName === "string"
      ? pipelineRecord.toolName
      : undefined;
  const fallbackOk =
    typeof pipelineRecord.success === "boolean"
      ? pipelineRecord.success
      : undefined;
  const fallbackMessage =
    typeof pipelineRecord.error === "string" && pipelineRecord.error.trim().length > 0
      ? pipelineRecord.error.trim()
      : undefined;
  const toolResult = pipelineRecord.result;
  if (!toolResult || typeof toolResult !== "object") {
    if (!fallbackAction && fallbackOk === undefined && !fallbackMessage) {
      return null;
    }
    return {
      ok: fallbackOk,
      action: fallbackAction,
      message: fallbackMessage,
    };
  }

  const toolRecord = toolResult as Record<string, unknown>;
  const directData = toolRecord.data;
  const directEnvelope: ParsedToolEnvelope = {
    ok:
      typeof toolRecord.success === "boolean" ? toolRecord.success : fallbackOk,
    action: fallbackAction,
    message:
      typeof toolRecord.error === "string" && toolRecord.error.trim().length > 0
        ? toolRecord.error.trim()
        : fallbackMessage,
    data:
      directData && typeof directData === "object" && !Array.isArray(directData)
        ? (directData as Record<string, unknown>)
        : undefined,
  };

  const text = toolRecord.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return directEnvelope.action || directEnvelope.ok !== undefined || directEnvelope.message
      ? directEnvelope
      : null;
  }

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return directEnvelope;
    const data = parsed.data;
    return {
      ok:
        typeof parsed.ok === "boolean" ? parsed.ok : directEnvelope.ok,
      action:
        typeof parsed.action === "string" ? parsed.action : directEnvelope.action,
      message:
        typeof parsed.message === "string" && parsed.message.trim().length > 0
          ? parsed.message
          : directEnvelope.message,
      status:
        typeof parsed.status === "number" ? parsed.status : undefined,
      data:
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : directEnvelope.data,
    };
  } catch {
    if (
      !directEnvelope.message &&
      typeof text === "string" &&
      text.trim().length > 0
    ) {
      directEnvelope.message = text.trim();
    }
    return directEnvelope.action || directEnvelope.ok !== undefined || directEnvelope.message
      ? directEnvelope
      : null;
  }
}

export function findLastToolEnvelope(
  results: unknown[],
  actionName: string,
): ParsedToolEnvelope | null {
  const normalizedAction = actionName.trim().toUpperCase();
  for (let i = results.length - 1; i >= 0; i -= 1) {
    const envelope = parseToolEnvelopeFromPipelineResult(results[i]);
    if (!envelope?.action) continue;
    if (envelope.action.trim().toUpperCase() === normalizedAction) {
      return envelope;
    }
  }
  return null;
}

export function didToolActionSucceed(
  plan: ParsedAutonomyPlanResponse,
  actionName: string,
): boolean {
  const envelope = findLastToolEnvelope(plan.results ?? [], actionName);
  if (envelope?.ok === true) return true;
  if (envelope?.ok === false) return false;
  return plan.allSucceeded === true;
}

export function getToolActionFailureMessage(
  plan: ParsedAutonomyPlanResponse,
  actionName: string,
  fallback: string,
): string {
  const envelope = findLastToolEnvelope(plan.results ?? [], actionName);
  if (
    typeof envelope?.message === "string" &&
    envelope.message.trim().length > 0
  ) {
    return envelope.message.trim();
  }
  return fallback;
}

export function getToolActionData(
  plan: ParsedAutonomyPlanResponse,
  actionName: string,
): Record<string, unknown> | null {
  const envelope = findLastToolEnvelope(plan.results ?? [], actionName);
  return envelope?.data ?? null;
}

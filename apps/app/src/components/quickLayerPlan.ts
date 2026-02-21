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
  const toolResult = pipelineRecord.result;
  if (!toolResult || typeof toolResult !== "object") return null;
  const toolRecord = toolResult as Record<string, unknown>;
  const text = toolRecord.text;
  if (typeof text !== "string" || text.trim().length === 0) return null;

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed.data;
    return {
      ok: typeof parsed.ok === "boolean" ? parsed.ok : undefined,
      action: typeof parsed.action === "string" ? parsed.action : undefined,
      message: typeof parsed.message === "string" ? parsed.message : undefined,
      status: typeof parsed.status === "number" ? parsed.status : undefined,
      data:
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as Record<string, unknown>)
          : undefined,
    };
  } catch {
    return null;
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

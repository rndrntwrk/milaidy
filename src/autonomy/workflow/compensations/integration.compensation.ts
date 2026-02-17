/**
 * Manual fallback compensations for reversible integration tools.
 *
 * @module autonomy/workflow/compensations/integration
 */

import type { CompensationFn } from "../types.js";

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function manualFallback(
  toolName: string,
  detail: string,
): CompensationFn {
  return async (ctx) => ({
    success: false,
    detail: `[${toolName}] Manual compensation required: ${detail} (requestId: ${ctx.requestId})`,
  });
}

export const createTaskCompensation: CompensationFn = async (ctx) => {
  const result = asObject(ctx.result);
  const taskId =
    (typeof result?.taskId === "string" && result.taskId) ||
    (typeof result?.id === "string" && result.id);
  const suffix = taskId ? `taskId=${taskId}; ` : "";
  return manualFallback(
    "CREATE_TASK",
    `${suffix}scheduler rollback adapter is not yet available`,
  )(ctx);
};

export const phettaNotifyCompensation: CompensationFn = manualFallback(
  "PHETTA_NOTIFY",
  "companion notifications are externally visible and cannot be auto-retracted",
);

export const phettaSendEventCompensation: CompensationFn = manualFallback(
  "PHETTA_SEND_EVENT",
  "companion event retraction endpoint is not configured",
);

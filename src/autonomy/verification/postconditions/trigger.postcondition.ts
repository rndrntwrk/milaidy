/**
 * Post-conditions for CREATE_TASK tool.
 *
 * @module autonomy/verification/postconditions/trigger
 */

import type { PostCondition } from "../types.js";

export const triggerSuccessCondition: PostCondition = {
  id: "trigger:success",
  description: "Trigger creation indicates success",
  check: async (ctx) => {
    const result = ctx.result as Record<string, unknown> | null;
    return result?.success === true;
  },
  severity: "critical",
};

export const triggerIdsCondition: PostCondition = {
  id: "trigger:ids-present",
  description: "Trigger creation returns trigger/task identifiers",
  check: async (ctx) => {
    const result = ctx.result as Record<string, unknown> | null;
    const data = result?.data as Record<string, unknown> | undefined;
    const values = result?.values as Record<string, unknown> | undefined;
    return Boolean(
      data?.triggerId || values?.triggerId || data?.taskId || values?.taskId,
    );
  },
  severity: "warning",
};

/**
 * Independently verify trigger/task existence through a query path.
 *
 * Falls back to pass when no independent query function is available.
 */
export const triggerIndependentLookupCondition: PostCondition = {
  id: "trigger:independent-lookup",
  description: "Created trigger/task can be found via independent trigger query",
  check: async (ctx) => {
    if (!ctx.query) return true;

    const result = ctx.result as Record<string, unknown> | null;
    const data = result?.data as Record<string, unknown> | undefined;
    const values = result?.values as Record<string, unknown> | undefined;
    const triggerId =
      typeof data?.triggerId === "string"
        ? data.triggerId
        : typeof values?.triggerId === "string"
          ? values.triggerId
          : undefined;
    const taskId =
      typeof data?.taskId === "string"
        ? data.taskId
        : typeof values?.taskId === "string"
          ? values.taskId
          : undefined;

    if (!triggerId && !taskId) return false;

    const independentResult = await ctx.query({
      query: "triggers:exists",
      payload: {
        ...(triggerId ? { triggerId } : {}),
        ...(taskId ? { taskId } : {}),
      },
    });
    return independentResult === true;
  },
  severity: "warning",
};

export const triggerPostConditions: PostCondition[] = [
  triggerSuccessCondition,
  triggerIdsCondition,
  triggerIndependentLookupCondition,
];

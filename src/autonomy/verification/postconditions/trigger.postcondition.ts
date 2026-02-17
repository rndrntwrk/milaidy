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

export const triggerPostConditions: PostCondition[] = [
  triggerSuccessCondition,
  triggerIdsCondition,
];

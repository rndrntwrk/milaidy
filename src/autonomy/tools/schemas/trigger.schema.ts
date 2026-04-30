/**
 * Tool contract for CREATE_TASK (trigger scheduling).
 *
 * @module autonomy/tools/schemas/trigger
 */

import { z } from "zod";
import type { ToolContract } from "../types.js";

export const CreateTaskParams = z
  .object({
    request: z
      .string()
      .min(1, "Request must not be empty")
      .describe("Natural language description of the trigger to create"),
  })
  .strict();

export type CreateTaskParams = z.infer<typeof CreateTaskParams>;

export const CREATE_TASK: ToolContract<CreateTaskParams> = {
  name: "CREATE_TASK",
  description: "Create an autonomous trigger task (interval/once/cron).",
  version: "1.0.0",
  riskClass: "reversible",
  paramsSchema: CreateTaskParams,
  requiredPermissions: ["data:database"],
  sideEffects: [
    {
      description: "Creates a scheduled trigger task and persists it",
      resource: "database",
      reversible: true,
    },
  ],
  requiresApproval: false,
  timeoutMs: 30_000,
  tags: ["automation", "triggers"],
};

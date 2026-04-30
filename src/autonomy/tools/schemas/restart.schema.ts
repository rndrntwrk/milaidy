/**
 * Tool contract for RESTART_AGENT action.
 *
 * @module autonomy/tools/schemas/restart
 */

import { z } from "zod";
import type { ToolContract } from "../types.js";

export const RestartParams = z
  .object({
    reason: z.string().optional(),
  })
  .strict();

export type RestartParams = z.infer<typeof RestartParams>;

export const RESTART_AGENT: ToolContract<RestartParams> = {
  name: "RESTART_AGENT",
  description: "Restart the agent process",
  version: "1.0.0",
  riskClass: "irreversible",
  paramsSchema: RestartParams,
  requiredPermissions: ["process:spawn"],
  sideEffects: [
    {
      description: "Terminates and restarts the agent process",
      resource: "process",
      reversible: false,
    },
  ],
  requiresApproval: true,
  timeoutMs: 30_000,
  tags: ["system", "lifecycle"],
};

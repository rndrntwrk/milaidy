/**
 * Tool contract for RUN_IN_TERMINAL action.
 *
 * @module autonomy/tools/schemas/terminal
 */

import { z } from "zod";
import type { ToolContract } from "../types.js";

export const RunInTerminalParams = z
  .object({
    command: z.string().min(1, "Command must not be empty"),
  })
  .strict();

export type RunInTerminalParams = z.infer<typeof RunInTerminalParams>;

export const RUN_IN_TERMINAL: ToolContract<RunInTerminalParams> = {
  name: "RUN_IN_TERMINAL",
  description: "Execute a shell command in the system terminal",
  version: "1.0.0",
  riskClass: "irreversible",
  paramsSchema: RunInTerminalParams,
  requiredPermissions: ["process:shell"],
  sideEffects: [
    {
      description: "Executes arbitrary shell commands on the host system",
      resource: "process",
      reversible: false,
    },
  ],
  requiresApproval: true,
  timeoutMs: 60_000,
  tags: ["system", "terminal"],
};

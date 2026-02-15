/**
 * Meta-schema for user-defined custom actions.
 *
 * Provides a factory to create ToolContracts from custom action definitions
 * at runtime. Custom actions use a permissive params schema since their
 * parameters are user-defined.
 *
 * @module autonomy/tools/schemas/custom-action
 */

import { z } from "zod";
import type { PluginPermission } from "../../../plugins/permissions.js";
import { classifyRisk } from "../risk-classification.js";
import type { ToolContract } from "../types.js";

/**
 * Create a ToolContract for a user-defined custom action.
 *
 * Custom actions accept arbitrary string parameters, so we use
 * z.record() for the params schema. The risk class is derived from
 * the declared handler type.
 */
export function createCustomActionContract(opts: {
  name: string;
  description: string;
  handlerType: "http" | "shell" | "code";
}): ToolContract {
  // Build permissions based on handler type
  const permissions: PluginPermission[] = [];
  if (opts.handlerType === "shell") {
    permissions.push("process:shell");
  } else if (opts.handlerType === "http") {
    permissions.push("net:outbound:https");
  } else if (opts.handlerType === "code") {
    permissions.push("process:spawn");
  }

  const riskClass = classifyRisk(permissions);

  // Custom actions use a record schema — params are user-defined strings
  const paramsSchema = z.record(z.string(), z.unknown());

  return {
    name: opts.name,
    description: opts.description,
    version: "1.0.0",
    riskClass,
    paramsSchema,
    requiredPermissions: permissions,
    sideEffects: [
      {
        description: `Executes a custom ${opts.handlerType} action`,
        resource: opts.handlerType === "http" ? "network" : "process",
        reversible: opts.handlerType !== "shell",
      },
    ],
    requiresApproval: riskClass === "irreversible",
    timeoutMs: 60_000,
    tags: ["custom", opts.handlerType],
  };
}

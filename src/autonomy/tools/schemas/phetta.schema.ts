/**
 * Tool contracts for Phetta Companion actions.
 *
 * @module autonomy/tools/schemas/phetta
 */

import { z } from "zod";
import type { ToolContract } from "../types.js";

export const PhettaNotifyParams = z
  .object({
    message: z.string().min(1, "Message must not be empty"),
  })
  .strict();

export type PhettaNotifyParams = z.infer<typeof PhettaNotifyParams>;

export const PHETTA_NOTIFY: ToolContract<PhettaNotifyParams> = {
  name: "PHETTA_NOTIFY",
  description: "Send a notification to the local Phetta Companion app.",
  version: "1.0.0",
  riskClass: "reversible",
  paramsSchema: PhettaNotifyParams,
  requiredPermissions: ["net:outbound:http"],
  sideEffects: [
    {
      description: "Sends a local HTTP request to Phetta Companion",
      resource: "network",
      reversible: true,
    },
  ],
  requiresApproval: false,
  timeoutMs: 10_000,
  tags: ["companion", "notification"],
};

export const PhettaSendEventParams = z
  .object({
    type: z.string().min(1, "Event type must not be empty"),
    message: z.string().optional(),
    file: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type PhettaSendEventParams = z.infer<typeof PhettaSendEventParams>;

export const PHETTA_SEND_EVENT: ToolContract<PhettaSendEventParams> = {
  name: "PHETTA_SEND_EVENT",
  description: "Send a raw event payload to the Phetta Companion app.",
  version: "1.0.0",
  riskClass: "reversible",
  paramsSchema: PhettaSendEventParams,
  requiredPermissions: ["net:outbound:http"],
  sideEffects: [
    {
      description: "Sends a local HTTP event to Phetta Companion",
      resource: "network",
      reversible: true,
    },
  ],
  requiresApproval: false,
  timeoutMs: 10_000,
  tags: ["companion", "event"],
};

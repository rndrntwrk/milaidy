/**
 * Tool contract for PLAY_EMOTE action.
 *
 * @module autonomy/tools/schemas/emote
 */

import { z } from "zod";
import type { ToolContract } from "../types.js";

export const PlayEmoteParams = z
  .object({
    emote: z.string().min(1, "Emote ID must not be empty"),
  })
  .strict();

export type PlayEmoteParams = z.infer<typeof PlayEmoteParams>;

export const PLAY_EMOTE: ToolContract<PlayEmoteParams> = {
  name: "PLAY_EMOTE",
  description: "Play an emote animation on the agent avatar",
  version: "1.0.0",
  riskClass: "read-only",
  paramsSchema: PlayEmoteParams,
  requiredPermissions: [],
  sideEffects: [],
  requiresApproval: false,
  timeoutMs: 10_000,
  tags: ["emote", "avatar"],
};

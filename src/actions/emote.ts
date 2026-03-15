/**
 * PLAY_EMOTE action — plays an emote animation on the avatar.
 *
 * When triggered the action:
 *   1. Extracts the emote ID from parameters, or falls back to text-matching
 *   2. Looks up the emote in the catalog
 *   3. POSTs to the local API server to trigger the animation
 *   4. Returns a descriptive text response with the emote name
 *
 * @module actions/emote
 */

import type { Action, HandlerOptions, Memory } from "@elizaos/core";
import { AGENT_EMOTE_BY_ID } from "../emotes/catalog";

/** API port for posting emote requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

/** All known emote IDs for text-matching fallback. */
const ALL_EMOTE_IDS = Array.from(AGENT_EMOTE_BY_ID.keys());

/**
 * Attempt to resolve an emote ID from the message text when structured
 * parameters are not provided (e.g. retake chat messages).
 */
function resolveEmoteFromText(text: string): string | undefined {
  const lower = text.toLowerCase();
  // Try exact ID match first
  for (const id of ALL_EMOTE_IDS) {
    if (lower.includes(id.replace("-", " ")) || lower.includes(id)) {
      return id;
    }
  }
  // Heuristic fallbacks
  if (
    lower.includes("wave") ||
    lower.includes("greet") ||
    lower.includes("hello")
  )
    return "wave";
  if (lower.includes("dance") || lower.includes("vibe")) return "dance-happy";
  if (lower.includes("cry") || lower.includes("sad")) return "crying";
  if (lower.includes("flip") || lower.includes("backflip")) return "flip";
  if (lower.includes("jump")) return "jump";
  if (lower.includes("punch") || lower.includes("fight")) return "punching";
  if (lower.includes("fish")) return "fishing";
  return undefined;
}

export const emoteAction: Action = {
  name: "PLAY_EMOTE",

  similes: [
    "EMOTE",
    "ANIMATE",
    "GESTURE",
    "DANCE",
    "WAVE",
    "PLAY_ANIMATION",
    "DO_EMOTE",
    "PERFORM",
  ],

  description:
    "Play a one-shot emote animation on the avatar, then return to idle. " +
    "Use this as a non-blocking visual side action that can be chained " +
    "before, after, or alongside other actions in the same turn " +
    "(for example with REPLY, SEND_MESSAGE, or stream actions).",

  validate: async (_runtime, _message, _state) => {
    // Always valid — the handler will check if the emote exists.
    return true;
  },

  handler: async (_runtime, message, _state, options) => {
    try {
      // Extract emote ID from structured parameters first.
      const params = (options as HandlerOptions | undefined)?.parameters;
      let emoteId =
        typeof params?.emote === "string" ? params.emote : undefined;

      // Fallback: resolve from the triggering message text (covers retake
      // chat and other sources where structured parameters may be absent).
      if (!emoteId) {
        const text = (message as Memory)?.content?.text ?? "";
        emoteId = resolveEmoteFromText(text);
      }

      if (!emoteId) {
        return { text: "", success: false };
      }

      // Look up the emote in the catalog.
      const emote = AGENT_EMOTE_BY_ID.get(emoteId);
      if (!emote) {
        return {
          text: "",
          success: false,
        };
      }

      // POST to the local API server to trigger the emote.
      const response = await fetch(`http://localhost:${API_PORT}/api/emote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoteId: emote.id }),
      });

      if (!response.ok) {
        return {
          text: "",
          success: false,
        };
      }

      // Return a descriptive text response.
      return {
        text: `*${emote.name.toLowerCase()}s*`,
        success: true,
        data: { emoteId: emote.id },
      };
    } catch (_err) {
      return {
        text: "",
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "emote",
      description: "The emote ID to play once before returning to idle",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

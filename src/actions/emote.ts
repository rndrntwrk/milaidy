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
import { EMOTE_BY_ID } from "../emotes/catalog";

/** API port for posting emote requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";
const AUTO_EMOTE_COOLDOWN_MS = 15_000;

let lastAutoEmoteAt = 0;
let lastAutoEmoteId: string | null = null;

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function extractMessageText(message: unknown): string {
  const candidate = (
    message as { content?: { text?: unknown } } | undefined
  )?.content?.text;
  return typeof candidate === "string" ? candidate : "";
}

function messageExplicitlyRequestsEmote(messageText: string, emote: {
  id: string;
  name: string;
}): boolean {
  const haystack = normalizeComparableText(messageText);
  if (!haystack) return false;

  const terms = new Set([
    normalizeComparableText(emote.id),
    normalizeComparableText(emote.name),
  ]);

  for (const term of terms) {
    if (!term) continue;
    if (haystack.includes(term)) {
      return true;
    }
  }

  return false;
}

/** All known emote IDs for text-matching fallback. */
const ALL_EMOTE_IDS = Array.from(EMOTE_BY_ID.keys());

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
    "Play an emote animation on the avatar. Emotes are visual gestures or " +
    "animations that express emotion or action (e.g., wave, dance, cheer).",

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
      const emote = EMOTE_BY_ID.get(emoteId);
      if (!emote) {
        return {
          text: "",
          success: false,
        };
      }

      const explicitRequest = messageExplicitlyRequestsEmote(
        extractMessageText(_message),
        emote,
      );
      const now = Date.now();
      if (emote.autoEligible && !explicitRequest) {
        const timeSinceLastAutoEmote = now - lastAutoEmoteAt;
        const repeatedTooSoon =
          lastAutoEmoteId === emote.id &&
          timeSinceLastAutoEmote < AUTO_EMOTE_COOLDOWN_MS;
        const anyAutoTooSoon = timeSinceLastAutoEmote < AUTO_EMOTE_COOLDOWN_MS / 2;
        if (repeatedTooSoon || anyAutoTooSoon) {
          return {
            text: "",
            success: true,
            data: { skipped: true, reason: "cooldown", emoteId: emote.id },
          };
        }
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

      if (emote.autoEligible) {
        lastAutoEmoteAt = now;
        lastAutoEmoteId = emote.id;
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
      description: "The emote ID to play",
      required: true,
      schema: { type: "string" as const },
    },
  ],
};

export type ChatMode = "simple" | "power";

export interface ChatModeResolution {
  requestedMode: ChatMode;
  effectiveMode: ChatMode;
  autoEscalated: boolean;
}

export const SIMPLE_MODE_ACTION_GUARD_REPLY =
  "I can do that, but Simple mode is reply-only. Switch to Power mode and resend this request so I can execute it.";

const COMMAND_LIKE_RE =
  /(?:^|[`$])\s*(gh|kubectl|git|curl|ssh|docker|npm|pnpm|node)\b/i;

const ACTION_VERB_RE =
  /\b(run|execute|list|show|get|fetch|pull|check|inspect|query|search|open|read|send|deploy|restart|stop|start|create|delete|update|where(?:'s| is)|status)\b/i;

const ACTION_TARGET_RE =
  /\b(repo|repos|repository|repositories|github|gh\b|log|logs|deploy|deployment|pod|pods|kubernetes|kubectl|leaderboard|score|scores|quest|quests|wallet|discord|telegram|stream|battle|game|games|list)\b/i;

const EXECUTION_CLAIM_RE =
  /\b(?:i(?:'m| am| will|’ll)\s+(?:run|execute|pull|fetch|send|check|list|drop|post|query|inspect|look up)|(?:running|pulling|fetching|sending|checking|listing|querying|inspecting)\b[^.!?\n]{0,80}\b(?:now|next|shortly|soon|in a sec|in a second|in a moment)|dropping\b[^.!?\n]{0,80}\b(?:next|soon|now))\b/i;

export function hasOperationalActionIntent(prompt: string): boolean {
  const normalized = prompt.trim();
  if (!normalized) return false;
  if (COMMAND_LIKE_RE.test(normalized)) return true;
  if (!ACTION_VERB_RE.test(normalized)) return false;
  return ACTION_TARGET_RE.test(normalized);
}

export function resolveEffectiveChatMode(
  requestedMode: ChatMode,
  prompt: string,
): ChatModeResolution {
  if (requestedMode === "power") {
    return {
      requestedMode,
      effectiveMode: "power",
      autoEscalated: false,
    };
  }

  if (!hasOperationalActionIntent(prompt)) {
    return {
      requestedMode,
      effectiveMode: "simple",
      autoEscalated: false,
    };
  }

  return {
    requestedMode,
    effectiveMode: "power",
    autoEscalated: true,
  };
}

export function enforceSimpleModeReplyBoundaries(
  prompt: string,
  responseText: string,
): string {
  if (!responseText.trim()) return responseText;
  if (!hasOperationalActionIntent(prompt)) return responseText;
  if (!EXECUTION_CLAIM_RE.test(responseText)) return responseText;
  return SIMPLE_MODE_ACTION_GUARD_REPLY;
}

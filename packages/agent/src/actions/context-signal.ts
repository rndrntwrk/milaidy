/**
 * Shared context-signal validation helpers for action `validate()` functions.
 *
 * Actions that are only relevant when the recent conversation mentions certain
 * keywords can use these helpers to avoid bloating the LLM action context on
 * every turn.
 *
 * @module actions/context-signal
 */

import type { Memory, State } from "@elizaos/core";
import {
  collectKeywordTermMatches,
  textIncludesKeywordTerm,
} from "@miladyai/shared/validation-keywords";
import {
  type ContextSignalKey,
  getContextSignalTerms,
  resolveContextSignalSpec,
} from "./context-signal-lexicon.js";
import {
  recentConversationTexts as collectRecentConversationTexts,
  recentConversationTextsFromState,
} from "./life-recent-context.js";

export { collectKeywordTermMatches, textIncludesKeywordTerm };

type ContextSignalRuntimeLike = {
  getSetting?: (key: string) => unknown;
  character?: unknown;
};

function resolveContextSignalLocale(
  runtime: ContextSignalRuntimeLike | null,
  state: State | undefined,
  localeOverride?: unknown,
): unknown {
  if (localeOverride !== undefined) {
    return localeOverride;
  }

  const stateRecord =
    state && typeof state === "object"
      ? (state as Record<string, unknown>)
      : undefined;
  const values =
    stateRecord?.values && typeof stateRecord.values === "object"
      ? (stateRecord.values as Record<string, unknown>)
      : undefined;
  const config =
    stateRecord?.config && typeof stateRecord.config === "object"
      ? (stateRecord.config as Record<string, unknown>)
      : undefined;
  const ui =
    config?.ui && typeof config.ui === "object"
      ? (config.ui as Record<string, unknown>)
      : undefined;
  const runtimeCharacter =
    runtime?.character && typeof runtime.character === "object"
      ? (runtime.character as Record<string, unknown>)
      : undefined;
  const runtimeSettings =
    runtimeCharacter?.settings && typeof runtimeCharacter.settings === "object"
      ? (runtimeCharacter.settings as Record<string, unknown>)
      : undefined;
  const runtimeUi =
    runtimeSettings?.ui && typeof runtimeSettings.ui === "object"
      ? (runtimeSettings.ui as Record<string, unknown>)
      : undefined;

  return [
    values?.preferredLanguage,
    values?.language,
    stateRecord?.preferredLanguage,
    ui?.language,
    runtimeUi?.language,
    runtimeSettings?.language,
    runtime?.getSetting?.("preferredLanguage"),
    runtime?.getSetting?.("language"),
    runtime?.getSetting?.("ui.language"),
  ].find(
    (candidate): candidate is string =>
      typeof candidate === "string" && candidate.trim().length > 0,
  );
}

export function collectKeywordTermMatchesForKey(
  texts: string[],
  key: ContextSignalKey,
  options?: {
    includeAllLocales?: boolean;
    locale?: unknown;
    strength?: "strong" | "weak";
  },
): Set<string> {
  const strength = options?.strength ?? "strong";
  return collectKeywordTermMatches(
    texts,
    getContextSignalTerms(key, strength, options),
  );
}

// ── Public API ───────────────────────────────────────────────────────────

export function messageText(message: Memory): string {
  const content = message?.content;
  if (!content) return "";
  if (typeof content === "string") return content;
  return typeof content.text === "string" ? content.text : "";
}

/**
 * Fast synchronous signal check using only `state` (no DB round-trip).
 * Use when you already have state composed.
 */
export function hasContextSignalSync(
  message: Memory,
  state: State | undefined,
  strongTerms: readonly string[],
  weakTerms: readonly string[] = [],
  weakThreshold = 2,
  contextLimit = 8,
): boolean {
  const texts = [
    ...recentConversationTextsFromState(state, contextLimit),
    messageText(message).trim(),
  ].filter((t) => t.length > 0);

  if (texts.length === 0) return false;

  if (
    strongTerms.length > 0 &&
    collectKeywordTermMatches(texts, strongTerms).size > 0
  ) {
    return true;
  }

  if (weakTerms.length > 0 && weakThreshold > 0) {
    return collectKeywordTermMatches(texts, weakTerms).size >= weakThreshold;
  }

  return false;
}

export function hasContextSignalSyncForKey(
  message: Memory,
  state: State | undefined,
  key: ContextSignalKey,
  options?: {
    contextLimit?: number;
    includeAllLocales?: boolean;
    locale?: unknown;
    weakThreshold?: number;
  },
): boolean {
  const locale = resolveContextSignalLocale(null, state, options?.locale);
  const spec = resolveContextSignalSpec(key, locale, {
    includeAllLocales: options?.includeAllLocales ?? true,
  });
  return hasContextSignalSync(
    message,
    state,
    spec.strongTerms,
    spec.weakTerms,
    options?.weakThreshold ?? spec.weakThreshold,
    options?.contextLimit ?? spec.contextLimit,
  );
}

/**
 * Full async signal check with DB memory fallback.
 */
export async function hasContextSignal(
  runtime: Parameters<typeof collectRecentConversationTexts>[0]["runtime"],
  message: Memory,
  state: State | undefined,
  strongTerms: readonly string[],
  weakTerms: readonly string[] = [],
  weakThreshold = 2,
  contextLimit = 8,
): Promise<boolean> {
  const stateTexts = recentConversationTextsFromState(state, contextLimit);
  let texts: string[];

  if (stateTexts.length >= contextLimit) {
    texts = stateTexts;
  } else {
    texts = await collectRecentConversationTexts({
      runtime,
      message,
      state,
      limit: contextLimit,
    });
  }

  texts = [...texts, messageText(message).trim()].filter((t) => t.length > 0);

  if (texts.length === 0) return false;

  if (
    strongTerms.length > 0 &&
    collectKeywordTermMatches(texts, strongTerms).size > 0
  ) {
    return true;
  }

  if (weakTerms.length > 0 && weakThreshold > 0) {
    return collectKeywordTermMatches(texts, weakTerms).size >= weakThreshold;
  }

  return false;
}

export async function hasContextSignalForKey(
  runtime: Parameters<typeof collectRecentConversationTexts>[0]["runtime"],
  message: Memory,
  state: State | undefined,
  key: ContextSignalKey,
  options?: {
    contextLimit?: number;
    includeAllLocales?: boolean;
    locale?: unknown;
    weakThreshold?: number;
  },
): Promise<boolean> {
  const locale = resolveContextSignalLocale(
    runtime as ContextSignalRuntimeLike,
    state,
    options?.locale,
  );
  const spec = resolveContextSignalSpec(key, locale, {
    includeAllLocales: options?.includeAllLocales ?? true,
  });
  return hasContextSignal(
    runtime,
    message,
    state,
    spec.strongTerms,
    spec.weakTerms,
    options?.weakThreshold ?? spec.weakThreshold,
    options?.contextLimit ?? spec.contextLimit,
  );
}

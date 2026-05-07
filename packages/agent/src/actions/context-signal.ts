/**
 * Shared context-signal validation helpers for action `validate()` functions.
 *
 * Actions that are only relevant when the recent conversation mentions certain
 * keywords can use these helpers to avoid bloating the LLM action context on
 * every turn.  The approach mirrors CALENDAR_ACTION's proven pattern:
 *
 *   1. Collect recent conversation texts (from state + DB fallback).
 *   2. Check for **strong terms** — a single match is sufficient.
 *   3. Check for **weak terms** — two or more matches required.
 *
 * @module actions/context-signal
 */

import type { Memory, State } from "@elizaos/core";
import {
  recentConversationTexts as collectRecentConversationTexts,
  recentConversationTextsFromState,
} from "./life-recent-context.js";

// ── Keyword matching primitives ─────────────────────────────────────────

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textIncludesKeywordTerm(text: string, term: string): boolean {
  const pattern = new RegExp(
    `\\b${escapePattern(term).replace(/\\ /g, "\\s+")}\\b`,
    "i",
  );
  return pattern.test(text);
}

function collectKeywordTermMatches(
  texts: string[],
  terms: readonly string[],
): Set<string> {
  const matches = new Set<string>();
  for (const text of texts) {
    for (const term of terms) {
      if (textIncludesKeywordTerm(text, term)) {
        matches.add(term);
      }
    }
  }
  return matches;
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
    return (
      collectKeywordTermMatches(texts, weakTerms).size >= weakThreshold
    );
  }

  return false;
}

/**
 * Full async signal check with DB memory fallback (mirrors calendar).
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

  texts = [...texts, messageText(message).trim()].filter(
    (t) => t.length > 0,
  );

  if (texts.length === 0) return false;

  if (
    strongTerms.length > 0 &&
    collectKeywordTermMatches(texts, strongTerms).size > 0
  ) {
    return true;
  }

  if (weakTerms.length > 0 && weakThreshold > 0) {
    return (
      collectKeywordTermMatches(texts, weakTerms).size >= weakThreshold
    );
  }

  return false;
}

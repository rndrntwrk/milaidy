/**
 * Conversation summarizer for session-end memory extraction.
 *
 * Takes a window of messages from a single room/session and produces:
 * 1. A structured summary of the conversation
 * 2. Extracted facts about the user
 * 3. Extracted user preferences
 * 4. Key topics discussed
 *
 * This is a deterministic extraction layer (no LLM calls).
 * For LLM-enhanced summarization, wrap this with an LLM call.
 *
 * @module autonomy/memory/conversation-summarizer
 */

import type { Memory } from "@elizaos/core";
import type { MemoryType } from "../types.js";

// ---------- Types ----------

export interface ConversationMessage {
  /** Who sent this message (entity display name or ID). */
  sender: string;
  /** Whether this is from the agent (true) or the user (false). */
  isAgent: boolean;
  /** Message text content. */
  text: string;
  /** Timestamp. */
  timestamp: number;
  /** Optional memory type tag. */
  memoryType?: MemoryType;
}

export interface ExtractedFact {
  /** The fact statement. */
  text: string;
  /** Confidence 0.0–1.0 (heuristic-based). */
  confidence: number;
  /** Fact category. */
  category: "preference" | "biographical" | "intent" | "relationship" | "technical";
}

export interface ConversationSummary {
  /** One-paragraph summary of the conversation. */
  summary: string;
  /** Key topics discussed. */
  topics: string[];
  /** Facts extracted about the user. */
  facts: ExtractedFact[];
  /** Number of messages in the window. */
  messageCount: number;
  /** Number of turns (user→agent exchanges). */
  turnCount: number;
  /** Timespan covered (ms). */
  timespan: number;
  /** Source platform. */
  platform: string;
  /** Source room ID. */
  roomId: string;
  /** Timestamp when this summary was generated. */
  generatedAt: number;
}

// ---------- Extraction Logic ----------

/** Heuristic fact patterns — each has a regex test and confidence. */
const FACT_PATTERNS: Array<{
  pattern: RegExp;
  category: ExtractedFact["category"];
  confidence: number;
  extract: (match: RegExpMatchArray, sender: string) => string;
}> = [
  // Preferences: "I prefer X", "I like X", "I want X"
  {
    pattern: /\bi (?:prefer|like|love|enjoy|want)\s+(.{3,80})/i,
    category: "preference",
    confidence: 0.8,
    extract: (m, sender) => `${sender} prefers: ${m[1].replace(/[.!?]+$/, "")}`,
  },
  // Biographical: "I am a X", "I'm a X", "I work as X"
  {
    pattern: /\bi(?:'m| am)\s+(?:a |an )?(.{3,60})/i,
    category: "biographical",
    confidence: 0.6,
    extract: (m, sender) => `${sender} is ${m[1].replace(/[.!?]+$/, "")}`,
  },
  // Location: "I live in X", "I'm based in X", "I'm from X"
  {
    pattern: /\bi(?:'m| am) (?:based|located|living) in\s+(.{2,40})/i,
    category: "biographical",
    confidence: 0.7,
    extract: (m, sender) => `${sender} is based in ${m[1].replace(/[.!?]+$/, "")}`,
  },
  {
    pattern: /\bi(?:'m| am) from\s+(.{2,40})/i,
    category: "biographical",
    confidence: 0.7,
    extract: (m, sender) => `${sender} is from ${m[1].replace(/[.!?]+$/, "")}`,
  },
  // Intent: "I need X", "I'm trying to X", "My goal is X"
  {
    pattern: /\bi (?:need|require|must have)\s+(.{3,80})/i,
    category: "intent",
    confidence: 0.7,
    extract: (m, sender) => `${sender} needs: ${m[1].replace(/[.!?]+$/, "")}`,
  },
  {
    pattern: /\b(?:my goal|my objective) (?:is|was) (?:to )?(.{3,80})/i,
    category: "intent",
    confidence: 0.8,
    extract: (m, sender) => `${sender}'s goal: ${m[1].replace(/[.!?]+$/, "")}`,
  },
  // Relationships: "I work with X", "My team X"
  {
    pattern: /\bi work (?:with|for|at)\s+(.{2,60})/i,
    category: "relationship",
    confidence: 0.6,
    extract: (m, sender) => `${sender} works with/for/at ${m[1].replace(/[.!?]+$/, "")}`,
  },
  // Technical: "I use X", "My stack is X", "I'm running X"
  {
    pattern: /\bi(?:'m| am) (?:using|running)\s+(.{3,60})/i,
    category: "technical",
    confidence: 0.6,
    extract: (m, sender) => `${sender} uses ${m[1].replace(/[.!?]+$/, "")}`,
  },
  // Dispreference: "I don't like X", "I hate X"
  {
    pattern: /\bi (?:don'?t like|hate|dislike|avoid)\s+(.{3,80})/i,
    category: "preference",
    confidence: 0.8,
    extract: (m, sender) => `${sender} dislikes: ${m[1].replace(/[.!?]+$/, "")}`,
  },
];

/** Extract topics from a conversation based on keyword frequency. */
function extractTopics(messages: ConversationMessage[]): string[] {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "i", "you", "he", "she",
    "it", "we", "they", "me", "him", "her", "us", "them", "my", "your",
    "his", "its", "our", "their", "this", "that", "these", "those",
    "what", "which", "who", "whom", "when", "where", "how", "why",
    "not", "no", "yes", "but", "and", "or", "if", "then", "else",
    "for", "with", "from", "to", "in", "on", "at", "by", "of", "about",
    "just", "also", "very", "really", "like", "get", "got", "go",
    "going", "know", "think", "want", "need", "use", "make", "see",
    "let", "tell", "say", "said", "okay", "ok", "yeah", "yep", "sure",
    "thanks", "thank", "please", "sorry", "don't", "doesn't", "didn't",
    "can't", "won't", "wouldn't", "couldn't", "shouldn't", "haven't",
    "hasn't", "isn't", "aren't", "wasn't", "weren't", "there", "here",
    "some", "any", "all", "each", "every", "both", "few", "more", "most",
    "other", "such", "only", "same", "so", "than", "too", "into",
  ]);

  const wordCounts = new Map<string, number>();

  for (const msg of messages) {
    if (msg.isAgent) continue; // Focus on user topics
    const words = msg.text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }

  // Return top words by frequency (minimum 2 occurrences)
  return Array.from(wordCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

/** Extract facts from user messages using heuristic patterns. */
function extractFacts(
  messages: ConversationMessage[],
  senderName: string,
): ExtractedFact[] {
  const facts: ExtractedFact[] = [];
  const seen = new Set<string>();

  for (const msg of messages) {
    if (msg.isAgent) continue; // Only extract from user messages

    for (const pattern of FACT_PATTERNS) {
      const match = msg.text.match(pattern.pattern);
      if (match) {
        const text = pattern.extract(match, senderName);
        const normalized = text.toLowerCase().trim();
        if (!seen.has(normalized)) {
          seen.add(normalized);
          facts.push({
            text,
            confidence: pattern.confidence,
            category: pattern.category,
          });
        }
      }
    }
  }

  return facts;
}

/** Build a one-paragraph summary from conversation messages. */
function buildSummary(messages: ConversationMessage[]): string {
  if (messages.length === 0) return "Empty conversation.";

  const userMessages = messages.filter((m) => !m.isAgent);
  const agentMessages = messages.filter((m) => m.isAgent);

  if (userMessages.length === 0) return "Agent monologue (no user messages).";

  // Take first user message as topic opener
  const opener = userMessages[0].text.slice(0, 100);
  const userMsgCount = userMessages.length;
  const agentMsgCount = agentMessages.length;
  const turnCount = Math.min(userMsgCount, agentMsgCount);

  // Build summary
  const parts: string[] = [];
  parts.push(`Conversation with ${turnCount} turns.`);
  parts.push(`User opened with: "${opener}${userMessages[0].text.length > 100 ? "..." : ""}".`);

  if (userMsgCount > 1) {
    const lastUser = userMessages[userMessages.length - 1].text.slice(0, 80);
    parts.push(
      `Last user message: "${lastUser}${userMessages[userMessages.length - 1].text.length > 80 ? "..." : ""}".`,
    );
  }

  return parts.join(" ");
}

// ---------- Main Entry ----------

export interface SummarizeOptions {
  /** Source platform identifier. */
  platform: string;
  /** Source room ID. */
  roomId: string;
  /** Display name of the user (for fact attribution). */
  userDisplayName?: string;
}

/**
 * Summarize a conversation window into structured output.
 *
 * This is the deterministic extraction layer.
 * For richer summaries, pass the result to an LLM.
 */
export function summarizeConversation(
  messages: ConversationMessage[],
  options: SummarizeOptions,
): ConversationSummary {
  const userDisplayName = options.userDisplayName ?? "User";
  const sorted = [...messages].sort((a, b) => a.timestamp - b.timestamp);

  const topics = extractTopics(sorted);
  const facts = extractFacts(sorted, userDisplayName);
  const summary = buildSummary(sorted);

  const userMsgs = sorted.filter((m) => !m.isAgent);
  const agentMsgs = sorted.filter((m) => m.isAgent);
  const turnCount = Math.min(userMsgs.length, agentMsgs.length);

  const timestamps = sorted.map((m) => m.timestamp);
  const timespan =
    timestamps.length >= 2
      ? timestamps[timestamps.length - 1] - timestamps[0]
      : 0;

  return {
    summary,
    topics,
    facts,
    messageCount: sorted.length,
    turnCount,
    timespan,
    platform: options.platform,
    roomId: options.roomId,
    generatedAt: Date.now(),
  };
}

/**
 * Convert ElizaOS Memory objects to ConversationMessages.
 * Utility for bridging the ElizaOS memory format to the summarizer input.
 */
export function memoriesToMessages(
  memories: Memory[],
  agentId: string,
): ConversationMessage[] {
  return memories
    .filter((m) => {
      const text = (m.content as { text?: string })?.text;
      return text && text.length > 0;
    })
    .map((m) => ({
      sender: m.entityId === agentId ? "agent" : (m.entityId ?? "unknown"),
      isAgent: m.entityId === agentId,
      text: (m.content as { text: string }).text,
      timestamp: m.createdAt ?? 0,
      memoryType: (
        (m.metadata as Record<string, unknown> | undefined)?.memoryType as
          | MemoryType
          | undefined
      ),
    }));
}

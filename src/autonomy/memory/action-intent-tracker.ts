/**
 * Action intent tracker.
 *
 * Detects when the agent commits to performing an action (e.g., "I'll deploy that",
 * "Let me check", "Done — I've updated the config"), tracks the intent lifecycle,
 * and provides verification status for context injection.
 *
 * This prevents the behavioral failure where Alice says "done" or "yep"
 * without evidence of actual completion.
 *
 * Intent lifecycle:
 *   open → (verified | failed | expired)
 *
 * @module autonomy/memory/action-intent-tracker
 */

// ---------- Types ----------

export type IntentStatus = "open" | "verified" | "failed" | "expired";

export interface ActionIntent {
  id: string;
  /** What the agent committed to doing. */
  description: string;
  /** When the intent was detected. */
  createdAt: number;
  /** Current lifecycle status. */
  status: IntentStatus;
  /** When the status last changed. */
  statusChangedAt: number;
  /** Evidence of completion (or failure reason). */
  evidence?: string;
  /** Source platform where the intent was made. */
  platform: string;
  /** Room where the intent was made. */
  roomId: string;
  /** Canonical entity the intent is for (if resolved). */
  canonicalEntityId?: string;
}

export interface IntentDetectionResult {
  /** Whether an intent was detected. */
  detected: boolean;
  /** The detected intent description (null if not detected). */
  description: string | null;
  /** Whether this looks like a completion claim (e.g., "done", "I've updated"). */
  isCompletionClaim: boolean;
}

export interface IntentVerificationResult {
  intentId: string;
  status: IntentStatus;
  evidence?: string;
}

// ---------- Detection Patterns ----------

/** Patterns that indicate the agent is committing to an action. */
const COMMITMENT_PATTERNS: Array<{
  pattern: RegExp;
  extract: (match: RegExpMatchArray) => string;
}> = [
  {
    pattern: /\b(?:i'll|i will|let me|i'm going to|i am going to)\s+(.{5,100})/i,
    extract: (m) => m[1].replace(/[.!]+$/, "").trim(),
  },
  {
    pattern: /\b(?:working on|starting to|about to)\s+(.{5,80})/i,
    extract: (m) => m[1].replace(/[.!]+$/, "").trim(),
  },
];

/** Patterns that indicate the agent is claiming completion. */
const COMPLETION_CLAIM_PATTERNS: RegExp[] = [
  /\b(?:done|completed|finished|deployed|updated|fixed|resolved|created|sent|posted)\b/i,
  /\bi(?:'ve| have)\s+(?:done|completed|finished|deployed|updated|fixed|resolved|created|sent|posted)\b/i,
  /\byep\b.*\b(?:it's|that's|that is)\s+(?:done|live|deployed|updated)/i,
  /\b(?:it's|that's|that is)\s+(?:done|live|deployed|updated|fixed|complete)\b/i,
  /✅|☑️/,
];

/** Patterns that indicate evidence of actual action execution. */
const EVIDENCE_PATTERNS: RegExp[] = [
  // Technical evidence
  /\b(?:commit|sha|hash|version|build|deploy|release|tag)[\s:]+[a-f0-9]{6,}/i,
  /\bhttps?:\/\/\S+/i, // URLs as evidence
  /\b(?:error|exception|traceback|stack trace|failed with)/i,
  /\b(?:response|status|output|result|returned)[\s:]+/i,
  // Structural evidence
  /```[\s\S]*```/, // Code blocks
  /\b\d+\s+(?:files?|tests?|rows?|items?|records?)\b/i, // Numeric evidence
];

// ---------- Constants ----------

/** How long an intent stays open before expiring (2 hours). */
const INTENT_EXPIRY_MS = 2 * 60 * 60 * 1000;

/** Maximum open intents per room (prevent unbounded growth). */
const MAX_OPEN_INTENTS_PER_ROOM = 20;

// ---------- Implementation ----------

export class ActionIntentTracker {
  private intents = new Map<string, ActionIntent>();
  private roomIndex = new Map<string, Set<string>>(); // roomId → Set<intentId>
  private readonly expiryMs: number;

  constructor(opts?: { expiryMs?: number }) {
    this.expiryMs = opts?.expiryMs ?? INTENT_EXPIRY_MS;
  }

  /**
   * Detect whether an agent message contains an action intent or completion claim.
   */
  detectIntent(agentMessage: string): IntentDetectionResult {
    const isCompletionClaim = COMPLETION_CLAIM_PATTERNS.some((p) =>
      p.test(agentMessage),
    );

    for (const { pattern, extract } of COMMITMENT_PATTERNS) {
      const match = agentMessage.match(pattern);
      if (match) {
        return {
          detected: true,
          description: extract(match),
          isCompletionClaim,
        };
      }
    }

    return { detected: false, description: null, isCompletionClaim };
  }

  /**
   * Check whether a message contains evidence of action execution.
   */
  hasEvidence(message: string): boolean {
    return EVIDENCE_PATTERNS.some((p) => p.test(message));
  }

  /**
   * Register a new action intent detected from an agent message.
   */
  registerIntent(opts: {
    description: string;
    platform: string;
    roomId: string;
    canonicalEntityId?: string;
  }): ActionIntent {
    const now = Date.now();
    const id = crypto.randomUUID();

    // Enforce room cap
    this.expireOldIntents(opts.roomId);

    const intent: ActionIntent = {
      id,
      description: opts.description,
      createdAt: now,
      status: "open",
      statusChangedAt: now,
      platform: opts.platform,
      roomId: opts.roomId,
      canonicalEntityId: opts.canonicalEntityId,
    };

    this.intents.set(id, intent);

    if (!this.roomIndex.has(opts.roomId)) {
      this.roomIndex.set(opts.roomId, new Set());
    }
    this.roomIndex.get(opts.roomId)!.add(id);

    return intent;
  }

  /**
   * Mark an intent as verified with evidence.
   */
  verify(intentId: string, evidence: string): IntentVerificationResult | null {
    const intent = this.intents.get(intentId);
    if (!intent || intent.status !== "open") return null;

    intent.status = "verified";
    intent.statusChangedAt = Date.now();
    intent.evidence = evidence;

    return { intentId, status: "verified", evidence };
  }

  /**
   * Mark an intent as failed with a reason.
   */
  fail(intentId: string, reason: string): IntentVerificationResult | null {
    const intent = this.intents.get(intentId);
    if (!intent || intent.status !== "open") return null;

    intent.status = "failed";
    intent.statusChangedAt = Date.now();
    intent.evidence = reason;

    return { intentId, status: "failed", evidence: reason };
  }

  /**
   * Get all open (unverified) intents for a room.
   */
  getOpenIntents(roomId: string): ActionIntent[] {
    this.expireOldIntents(roomId);
    const intentIds = this.roomIndex.get(roomId);
    if (!intentIds) return [];

    return Array.from(intentIds)
      .map((id) => this.intents.get(id))
      .filter((i): i is ActionIntent => i !== null && i !== undefined && i.status === "open")
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get recently failed intents for a room (for honest failure reporting).
   */
  getRecentFailures(roomId: string, withinMs?: number): ActionIntent[] {
    const cutoff = Date.now() - (withinMs ?? this.expiryMs);
    const intentIds = this.roomIndex.get(roomId);
    if (!intentIds) return [];

    return Array.from(intentIds)
      .map((id) => this.intents.get(id))
      .filter(
        (i): i is ActionIntent =>
          i !== null &&
          i !== undefined &&
          i.status === "failed" &&
          i.statusChangedAt > cutoff,
      )
      .sort((a, b) => b.statusChangedAt - a.statusChangedAt);
  }

  /**
   * Auto-verify the most recent open intent in a room if the agent's latest
   * message contains evidence. Returns the verified intent or null.
   */
  tryAutoVerify(
    roomId: string,
    agentMessage: string,
  ): IntentVerificationResult | null {
    if (!this.hasEvidence(agentMessage)) return null;

    const open = this.getOpenIntents(roomId);
    if (open.length === 0) return null;

    // Verify the most recent open intent
    const latestOpen = open[0];

    // Extract evidence snippet (first 200 chars of matching content)
    const evidenceSnippet = agentMessage.slice(0, 200);
    return this.verify(latestOpen.id, evidenceSnippet);
  }

  /**
   * Format open intents for context injection.
   * Returns a string block to add to the agent's context.
   */
  formatOpenIntentsContext(roomId: string): string | null {
    const open = this.getOpenIntents(roomId);
    const failures = this.getRecentFailures(roomId, 30 * 60 * 1000); // last 30 min

    if (open.length === 0 && failures.length === 0) return null;

    const lines: string[] = ["## Action Verification Status"];

    if (open.length > 0) {
      lines.push("", "### Open Commitments (Unverified)");
      lines.push(
        "You committed to these actions but have not yet provided evidence of completion:",
      );
      for (const intent of open.slice(0, 5)) {
        const age = Math.round((Date.now() - intent.createdAt) / 60000);
        lines.push(`- "${intent.description}" (${age}m ago, ${intent.platform})`);
      }
      lines.push(
        "",
        "Before claiming these are done, provide concrete evidence (output, URL, commit hash, error message, etc.).",
      );
    }

    if (failures.length > 0) {
      lines.push("", "### Recent Failures");
      lines.push(
        "These actions were attempted but failed. Report failures honestly:",
      );
      for (const intent of failures.slice(0, 5)) {
        lines.push(
          `- "${intent.description}": ${intent.evidence ?? "unknown reason"}`,
        );
      }
    }

    return lines.join("\n");
  }

  /**
   * Get a count summary for monitoring.
   */
  getStats(roomId?: string): {
    total: number;
    open: number;
    verified: number;
    failed: number;
    expired: number;
  } {
    let intents: ActionIntent[];
    if (roomId) {
      const ids = this.roomIndex.get(roomId);
      intents = ids
        ? Array.from(ids)
            .map((id) => this.intents.get(id))
            .filter((i): i is ActionIntent => i !== null && i !== undefined)
        : [];
    } else {
      intents = Array.from(this.intents.values());
    }

    return {
      total: intents.length,
      open: intents.filter((i) => i.status === "open").length,
      verified: intents.filter((i) => i.status === "verified").length,
      failed: intents.filter((i) => i.status === "failed").length,
      expired: intents.filter((i) => i.status === "expired").length,
    };
  }

  // ---------- Internal ----------

  private expireOldIntents(roomId: string): void {
    const now = Date.now();
    const intentIds = this.roomIndex.get(roomId);
    if (!intentIds) return;

    const openIntentIds: string[] = [];

    for (const id of intentIds) {
      const intent = this.intents.get(id);
      if (!intent) {
        intentIds.delete(id);
        continue;
      }

      if (intent.status === "open" && now - intent.createdAt > this.expiryMs) {
        intent.status = "expired";
        intent.statusChangedAt = now;
      }

      if (intent.status === "open") {
        openIntentIds.push(id);
      }
    }

    // Enforce room cap — expire oldest open intents if over limit
    if (openIntentIds.length > MAX_OPEN_INTENTS_PER_ROOM) {
      openIntentIds
        .sort((a, b) => {
          const ia = this.intents.get(a)!;
          const ib = this.intents.get(b)!;
          return ia.createdAt - ib.createdAt;
        })
        .slice(0, openIntentIds.length - MAX_OPEN_INTENTS_PER_ROOM)
        .forEach((id) => {
          const intent = this.intents.get(id)!;
          intent.status = "expired";
          intent.statusChangedAt = now;
        });
    }
  }
}

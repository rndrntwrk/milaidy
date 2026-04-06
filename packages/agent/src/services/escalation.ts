/**
 * Deterministic multi-channel escalation service.
 *
 * Sends an urgent message to the owner on the first configured channel,
 * waits N minutes, checks whether the owner responded anywhere, and
 * advances to the next channel if not — until all channels are exhausted
 * or the owner replies.
 *
 * This is a pure state-machine — no LLM calls, no prompt construction.
 * State is held in-memory (a module-scoped Map). Escalations are transient
 * and do not survive runtime restarts, which is acceptable: a restarting
 * runtime means the owner is likely already engaged.
 */

import type { IAgentRuntime, UUID } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { loadElizaConfig } from "../config/config.js";
import type {
  EscalationConfig,
  OwnerContactEntry,
  OwnerContactsConfig,
} from "../config/types.agent-defaults.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EscalationState {
  id: string;
  reason: string;
  text: string;
  currentStep: number;
  channelsSent: string[];
  startedAt: number;
  lastSentAt: number;
  resolved: boolean;
  resolvedAt?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CHANNELS: string[] = ["client_chat"];
const DEFAULT_WAIT_MINUTES = 5;
const DEFAULT_MAX_RETRIES = 3;

// ---------------------------------------------------------------------------
// Module-scoped state
// ---------------------------------------------------------------------------

/** Active escalations keyed by escalation id. */
const activeEscalations = new Map<string, EscalationState>();

/** Pending timers so they can be cleared during tests or shutdown. */
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function loadEscalationConfig(): EscalationConfig {
  try {
    const cfg = loadElizaConfig();
    return cfg.agents?.defaults?.escalation ?? {};
  } catch {
    return {};
  }
}

function loadOwnerContacts(): OwnerContactsConfig {
  try {
    const cfg = loadElizaConfig();
    return cfg.agents?.defaults?.ownerContacts ?? {};
  } catch {
    return {};
  }
}

function resolveChannels(config: EscalationConfig): string[] {
  const channels = config.channels;
  return Array.isArray(channels) && channels.length > 0
    ? channels
    : DEFAULT_CHANNELS;
}

function resolveWaitMs(config: EscalationConfig): number {
  const mins =
    typeof config.waitMinutes === "number" && config.waitMinutes > 0
      ? config.waitMinutes
      : DEFAULT_WAIT_MINUTES;
  return mins * 60_000;
}

function resolveMaxRetries(config: EscalationConfig): number {
  return typeof config.maxRetries === "number" && config.maxRetries > 0
    ? config.maxRetries
    : DEFAULT_MAX_RETRIES;
}

// ---------------------------------------------------------------------------
// Channel send
// ---------------------------------------------------------------------------

async function sendToChannel(
  runtime: IAgentRuntime,
  channel: string,
  text: string,
  ownerContacts: OwnerContactsConfig,
): Promise<boolean> {
  const contact: OwnerContactEntry | undefined = ownerContacts[channel];
  if (!contact) {
    logger.warn(`[escalation] No owner contact configured for channel "${channel}"`);
    return false;
  }

  try {
    await runtime.sendMessageToTarget(
      {
        source: channel,
        entityId: contact.entityId as UUID | undefined,
        channelId: contact.channelId,
        roomId: contact.roomId as UUID | undefined,
      } as Parameters<typeof runtime.sendMessageToTarget>[0],
      {
        text,
        source: channel,
        metadata: { urgency: "urgent", escalation: true },
      },
    );
    return true;
  } catch (err) {
    logger.warn(`[escalation] Failed to send to channel "${channel}"`, err instanceof Error ? err.message : String(err));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Owner response detection
// ---------------------------------------------------------------------------

async function ownerRespondedSince(
  runtime: IAgentRuntime,
  ownerContacts: OwnerContactsConfig,
  sinceTimestamp: number,
): Promise<boolean> {
  // Collect unique owner entity IDs across all configured contacts.
  const entityIds = new Set<string>();
  for (const contact of Object.values(ownerContacts)) {
    if (contact.entityId) entityIds.add(contact.entityId);
  }

  for (const entityId of entityIds) {
    try {
      const rooms = await runtime.getRoomsForParticipant(entityId as UUID);
      if (!rooms || rooms.length === 0) continue;

      const messages = await runtime.getMemoriesByRoomIds({
        roomIds: rooms as UUID[],
        tableName: "messages",
        limit: 20,
      });

      const ownerMessage = messages.find(
        (m) =>
          m.entityId === entityId &&
          m.createdAt != null &&
          m.createdAt > sinceTimestamp,
      );
      if (ownerMessage) return true;
    } catch (err) {
      logger.debug(`[escalation] Error checking owner response for entity ${entityId}`, err instanceof Error ? err.message : String(err));
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Timer scheduling
// ---------------------------------------------------------------------------

function scheduleCheck(
  runtime: IAgentRuntime,
  escalationId: string,
  delayMs: number,
): void {
  // Clear any existing timer for this escalation (idempotent).
  const existing = pendingTimers.get(escalationId);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    pendingTimers.delete(escalationId);
    try {
      await EscalationService.checkEscalation(runtime, escalationId);
    } catch (err) {
      logger.error("[escalation] Scheduled check failed", err instanceof Error ? err.message : String(err));
    }
  }, delayMs);

  pendingTimers.set(escalationId, timer);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

let idCounter = 0;

export class EscalationService {
  /**
   * Start an escalation to reach the owner.
   *
   * Sends to the first configured channel immediately and schedules a
   * follow-up check after `waitMinutes`.
   *
   * If an escalation is already active, appends the new reason/text to
   * the existing one (cooldown behavior) rather than starting a second.
   */
  static async startEscalation(
    runtime: IAgentRuntime,
    reason: string,
    text: string,
  ): Promise<EscalationState> {
    // Cooldown: coalesce into an active escalation if one exists.
    const existing = EscalationService.getActiveEscalationSync();
    if (existing) {
      existing.reason = `${existing.reason}; ${reason}`;
      existing.text = `${existing.text}\n---\n${text}`;
      logger.info(
        `[escalation] Coalesced into active escalation ${existing.id}`,
      );
      return existing;
    }

    const config = loadEscalationConfig();
    const channels = resolveChannels(config);
    const ownerContacts = loadOwnerContacts();
    const waitMs = resolveWaitMs(config);

    idCounter += 1;
    const escalationId = `esc-${Date.now()}-${idCounter}`;
    const now = Date.now();

    const state: EscalationState = {
      id: escalationId,
      reason,
      text,
      currentStep: 0,
      channelsSent: [],
      startedAt: now,
      lastSentAt: now,
      resolved: false,
    };

    activeEscalations.set(escalationId, state);

    // Send to the first channel.
    const firstChannel = channels[0];
    if (firstChannel) {
      const sent = await sendToChannel(runtime, firstChannel, text, ownerContacts);
      if (sent) {
        state.channelsSent.push(firstChannel);
      }
    }

    // Schedule follow-up if there are more channels or retries remaining.
    const maxRetries = resolveMaxRetries(config);
    if (channels.length > 1 || maxRetries > 1) {
      scheduleCheck(runtime, escalationId, waitMs);
    }

    logger.info(
      `[escalation] Started ${escalationId}: channel=${channels[0]}, reason="${reason}"`,
    );

    return state;
  }

  /**
   * Check whether the owner responded since the last escalation step.
   * If not, advance to the next channel. Called by the timer, not the LLM.
   */
  static async checkEscalation(
    runtime: IAgentRuntime,
    escalationId: string,
  ): Promise<void> {
    const state = activeEscalations.get(escalationId);
    if (!state || state.resolved) return;

    const config = loadEscalationConfig();
    const channels = resolveChannels(config);
    const ownerContacts = loadOwnerContacts();
    const maxRetries = resolveMaxRetries(config);
    const waitMs = resolveWaitMs(config);

    // Check if owner has responded since the last send.
    const responded = await ownerRespondedSince(
      runtime,
      ownerContacts,
      state.lastSentAt,
    );

    if (responded) {
      EscalationService.resolveEscalation(escalationId);
      return;
    }

    // Advance to the next channel.
    state.currentStep += 1;

    if (state.currentStep >= maxRetries) {
      logger.warn(
        `[escalation] ${escalationId}: max retries (${maxRetries}) reached — giving up`,
      );
      state.resolved = true;
      state.resolvedAt = Date.now();
      return;
    }

    const nextChannelIndex = state.currentStep % channels.length;
    const nextChannel = channels[nextChannelIndex];
    if (nextChannel) {
      const sent = await sendToChannel(
        runtime,
        nextChannel,
        state.text,
        ownerContacts,
      );
      if (sent) {
        state.channelsSent.push(nextChannel);
      }
      state.lastSentAt = Date.now();
    }

    // Schedule another check if retries remain.
    if (state.currentStep + 1 < maxRetries) {
      scheduleCheck(runtime, escalationId, waitMs);
    }
  }

  /**
   * Mark an escalation as resolved. Called when the owner responds or
   * manually by external code.
   */
  static resolveEscalation(escalationId: string): void {
    const state = activeEscalations.get(escalationId);
    if (!state || state.resolved) return;

    state.resolved = true;
    state.resolvedAt = Date.now();

    const timer = pendingTimers.get(escalationId);
    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(escalationId);
    }

    logger.info(`[escalation] Resolved ${escalationId}`);
  }

  /**
   * Return the currently active (unresolved) escalation, if any.
   */
  static getActiveEscalationSync(): EscalationState | null {
    for (const state of activeEscalations.values()) {
      if (!state.resolved) return state;
    }
    return null;
  }

  /**
   * Async wrapper matching the spec interface. Delegates to the sync
   * variant since state is in-memory.
   */
  static async getActiveEscalation(
    _runtime: IAgentRuntime,
  ): Promise<EscalationState | null> {
    return EscalationService.getActiveEscalationSync();
  }

  // -----------------------------------------------------------------------
  // Test helpers — not part of the public API.
  // -----------------------------------------------------------------------

  /** @internal Clear all state. For tests only. */
  static _reset(): void {
    for (const timer of pendingTimers.values()) clearTimeout(timer);
    pendingTimers.clear();
    activeEscalations.clear();
    idCounter = 0;
  }
}

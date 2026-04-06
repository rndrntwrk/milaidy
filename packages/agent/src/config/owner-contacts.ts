import type { IAgentRuntime, UUID } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { loadElizaConfig } from "./config.js";
import type {
  OwnerContactEntry,
  OwnerContactsConfig,
} from "./types.agent-defaults.js";

type OwnerContactsLoadContext = {
  boundary: string;
  operation: string;
  message: string;
};

export type OwnerContactPlatformIdentity = {
  platform: string;
  handle: string;
  status?: string;
};

export type OwnerContactRoutingHint = {
  source: string;
  entityId: string | null;
  channelId: string | null;
  roomId: string | null;
  preferredCommunicationChannel: string | null;
  platformIdentities: OwnerContactPlatformIdentity[];
  lastResponseAt: string | null;
  lastResponseChannel: string | null;
  resolvedFrom: "config" | "rolodex" | "config+rolodex";
};

type RolodexContactLike = {
  preferences?: {
    preferredCommunicationChannel?: string;
  };
  customFields?: Record<string, string>;
};

type RolodexServiceLike = {
  getContact(entityId: UUID): Promise<RolodexContactLike | null>;
};

type RuntimeLike = Pick<
  IAgentRuntime,
  "getService" | "getEntityById" | "getRoomsForParticipant" | "getMemoriesByRoomIds"
>;

function ownerContactSourceCandidates(source: string): string[] {
  const trimmed = source.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed === "telegram") {
    return ["telegram", "telegram-account", "telegramAccount"];
  }
  if (trimmed === "telegram-account") {
    return ["telegram-account", "telegramAccount", "telegram"];
  }
  if (trimmed === "telegramAccount") {
    return ["telegramAccount", "telegram-account", "telegram"];
  }
  return [trimmed];
}

function canonicalOwnerContactSource(source: string): string {
  if (source === "telegramAccount" || source === "telegram-account") {
    return "telegram-account";
  }
  return source;
}

export function resolveOwnerContactSource(
  ownerContacts: OwnerContactsConfig,
  source: string | null | undefined,
): { source: string; contact: OwnerContactEntry } | null {
  const normalized = normalizeChatSource(source);
  if (!normalized) {
    return null;
  }
  for (const candidate of ownerContactSourceCandidates(normalized)) {
    const contact = ownerContacts[candidate];
    if (contact) {
      return { source: canonicalOwnerContactSource(candidate), contact };
    }
  }
  return null;
}

export function loadOwnerContactsConfig(
  context: OwnerContactsLoadContext,
): OwnerContactsConfig {
  try {
    return loadElizaConfig().agents?.defaults?.ownerContacts ?? {};
  } catch (error) {
    logger.warn(
      {
        boundary: context.boundary,
        operation: context.operation,
        err: error instanceof Error ? error : undefined,
      },
      context.message,
    );
    return {};
  }
}

function normalizePlatformIdentity(value: unknown): OwnerContactPlatformIdentity | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const identity = value as Record<string, unknown>;
  const platform = typeof identity.platform === "string" ? identity.platform.trim() : "";
  const handle = typeof identity.handle === "string" ? identity.handle.trim() : "";
  if (!platform || !handle) {
    return null;
  }
  return {
    platform,
    handle,
    ...(typeof identity.status === "string" && identity.status.trim().length > 0
      ? { status: identity.status.trim() }
      : {}),
  };
}

function extractCustomField(
  customFields: Record<string, string> | undefined,
  ...keys: string[]
): string | null {
  if (!customFields) {
    return null;
  }
  for (const key of keys) {
    const value = customFields[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return null;
}

function normalizeChatSource(source: string | null | undefined): string | null {
  const value = typeof source === "string" ? source.trim() : "";
  return value.length > 0 ? value : null;
}

export async function loadOwnerContactRoutingHints(
  runtime: RuntimeLike | null | undefined,
  ownerContacts: OwnerContactsConfig,
): Promise<Record<string, OwnerContactRoutingHint>> {
  const rolodex = runtime?.getService?.("rolodex") as RolodexServiceLike | null;
  const hints: Record<string, OwnerContactRoutingHint> = {};
  const entries = Object.entries(ownerContacts);
  for (const [source, contact] of entries) {
    const basePlatformIdentities: OwnerContactPlatformIdentity[] = [];
    let lastResponseAt: string | null = null;
    let lastResponseChannel: string | null = null;
    let preferredCommunicationChannel: string | null = null;
    let resolvedFrom: OwnerContactRoutingHint["resolvedFrom"] = "config";

    if (contact.entityId && rolodex) {
      try {
        const rolodexContact = await rolodex.getContact(contact.entityId as UUID);
        if (rolodexContact) {
          resolvedFrom = "config+rolodex";
          preferredCommunicationChannel = normalizeChatSource(
            rolodexContact.preferences?.preferredCommunicationChannel,
          );
          const nextChannelId = extractCustomField(
            rolodexContact.customFields,
            `${source}ChannelId`,
            `${source}channelId`,
            "channelId",
          );
          const nextRoomId = extractCustomField(
            rolodexContact.customFields,
            `${source}RoomId`,
            `${source}roomId`,
            "roomId",
          );
          const nextEntityId = extractCustomField(
            rolodexContact.customFields,
            `${source}EntityId`,
            `${source}entityId`,
            "entityId",
          );
          if (nextChannelId) {
            contact.channelId = nextChannelId;
          }
          if (nextRoomId) {
            contact.roomId = nextRoomId;
          }
          if (nextEntityId) {
            contact.entityId = nextEntityId;
          }
        }
      } catch (error) {
        logger.debug(
          {
            boundary: "owner_contacts",
            operation: "rolodex_contact_lookup",
            source,
            error: error instanceof Error ? error.message : String(error),
          },
          "[owner-contacts] Failed to read rolodex contact hint; using static owner contact config.",
        );
      }
    }

    if (runtime?.getEntityById && contact.entityId) {
      try {
        const entity = await runtime.getEntityById(contact.entityId as UUID);
        const identities = Array.isArray(entity?.metadata?.platformIdentities)
          ? entity.metadata.platformIdentities
          : [];
        for (const identity of identities) {
          const normalized = normalizePlatformIdentity(identity);
          if (normalized) {
            basePlatformIdentities.push(normalized);
          }
        }
      } catch (error) {
        logger.debug(
          {
            boundary: "owner_contacts",
            operation: "entity_lookup",
            source,
            error: error instanceof Error ? error.message : String(error),
          },
          "[owner-contacts] Failed to read entity metadata for owner contact hint.",
        );
      }
    }

    if (runtime?.getRoomsForParticipant && runtime?.getMemoriesByRoomIds && contact.entityId) {
      try {
        const rooms = await runtime.getRoomsForParticipant(contact.entityId as UUID);
        if (rooms.length > 0) {
          const messages = await runtime.getMemoriesByRoomIds({
            roomIds: rooms as UUID[],
            tableName: "messages",
            limit: 20,
          });
          const ownerMessages = messages
            .filter((message) => message.entityId === contact.entityId)
            .sort((left, right) => {
              const leftTime = Number(left.createdAt ?? 0);
              const rightTime = Number(right.createdAt ?? 0);
              return rightTime - leftTime;
            });
          const latest = ownerMessages[0];
          if (latest?.createdAt !== undefined && latest?.createdAt !== null) {
            lastResponseAt = String(latest.createdAt);
            lastResponseChannel = source;
          }
        }
      } catch (error) {
        logger.debug(
          {
            boundary: "owner_contacts",
            operation: "owner_history_lookup",
            source,
            error: error instanceof Error ? error.message : String(error),
          },
          "[owner-contacts] Failed to inspect recent owner history for routing.",
        );
      }
    }

    hints[source] = {
      source,
      entityId: contact.entityId ?? null,
      channelId: contact.channelId ?? null,
      roomId: contact.roomId ?? null,
      preferredCommunicationChannel,
      platformIdentities: basePlatformIdentities,
      lastResponseAt,
      lastResponseChannel,
      resolvedFrom,
    };
  }

  return hints;
}

import type { IAgentRuntime, Memory, UUID, World } from "@elizaos/core";
import type {
  ConnectorAdminWhitelist,
  RoleCheckResult,
  RoleGrantSource,
  RoleName,
  RolesWorldMetadata,
} from "./types";

const CANONICAL_OWNER_SETTING_KEY = "ELIZA_ADMIN_ENTITY_ID";
const CONNECTOR_ADMIN_WHITELIST_KEY = Symbol.for(
  "@elizaos/runtime.roles.connectorAdminWhitelist",
);

// ── Normalization ──────────────────────────────────────────────────────────

export function normalizeRole(role: unknown): RoleName {
  if (typeof role !== "string") return "GUEST";
  switch (role.toUpperCase()) {
    case "OWNER":
      return "OWNER";
    case "ADMIN":
      return "ADMIN";
    case "USER":
      return "USER";
    default:
      return "GUEST";
  }
}

// ── Simple metadata accessors ──────────────────────────────────────────────

export function getEntityRole(
  metadata: RolesWorldMetadata,
  entityId: string,
): RoleName {
  return normalizeRole(metadata.roles?.[entityId]);
}

// ── Canonical owner helpers ────────────────────────────────────────────────

export function resolveCanonicalOwnerId(
  runtime: IAgentRuntime,
  metadata?: RolesWorldMetadata,
): string | null {
  if (typeof runtime.getSetting === "function") {
    const configured = runtime.getSetting(CANONICAL_OWNER_SETTING_KEY);
    if (typeof configured === "string" && configured.trim().length > 0) {
      return configured.trim();
    }
  }
  if (metadata?.ownership?.ownerId) {
    return metadata.ownership.ownerId;
  }
  return null;
}

export function hasConfiguredCanonicalOwner(runtime: IAgentRuntime): boolean {
  if (typeof runtime.getSetting !== "function") return false;
  const configured = runtime.getSetting(CANONICAL_OWNER_SETTING_KEY);
  return typeof configured === "string" && configured.trim().length > 0;
}

export function getConfiguredOwnerEntityIds(runtime: IAgentRuntime): string[] {
  const ownerId = resolveCanonicalOwnerId(runtime);
  return ownerId ? [ownerId] : [];
}

// ── Connector admin whitelist storage ─────────────────────────────────────

export function setConnectorAdminWhitelist(
  runtime: IAgentRuntime,
  whitelist: ConnectorAdminWhitelist,
): void {
  (runtime as unknown as Record<symbol, unknown>)[
    CONNECTOR_ADMIN_WHITELIST_KEY
  ] = whitelist;
}

export function getConnectorAdminWhitelist(
  runtime: IAgentRuntime,
): ConnectorAdminWhitelist {
  return (
    ((runtime as unknown as Record<symbol, unknown>)[
      CONNECTOR_ADMIN_WHITELIST_KEY
    ] as ConnectorAdminWhitelist) ?? {}
  );
}

// ── Entity metadata helpers ────────────────────────────────────────────────

export function getLiveEntityMetadataFromMessage(
  message: Memory,
): Record<string, unknown> | undefined {
  const metadata = (message.content as Record<string, unknown>)?.metadata;
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return undefined;
}

export function matchEntityToConnectorAdminWhitelist(
  entityMetadata: Record<string, unknown> | undefined,
  whitelist: ConnectorAdminWhitelist,
): boolean {
  if (!entityMetadata) return false;
  for (const [connector, ids] of Object.entries(whitelist)) {
    if (!ids.length) continue;
    const connectorData = entityMetadata[connector];
    if (!connectorData || typeof connectorData !== "object") continue;
    const data = connectorData as Record<string, unknown>;
    const userId = String(data.id ?? data.userId ?? data.user_id ?? "");
    if (userId && ids.includes(userId)) return true;
  }
  return false;
}

// ── World resolution ───────────────────────────────────────────────────────

export async function resolveWorldForMessage(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<{ world: World; metadata: RolesWorldMetadata } | null> {
  const room = await runtime.getRoom(message.roomId);
  if (!room?.worldId) return null;
  const world = await runtime.getWorld(room.worldId);
  if (!world) return null;
  const metadata = (world.metadata ?? {}) as RolesWorldMetadata;
  return { world, metadata };
}

export async function resolveCanonicalOwnerIdForMessage(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<string | null> {
  const staticOwner = resolveCanonicalOwnerId(runtime);
  if (staticOwner) return staticOwner;
  const resolved = await resolveWorldForMessage(runtime, message);
  return resolved?.metadata.ownership?.ownerId ?? null;
}

// ── Role resolution ────────────────────────────────────────────────────────

export async function resolveEntityRole(
  runtime: IAgentRuntime,
  _world: World,
  metadata: RolesWorldMetadata,
  entityId: UUID,
  options?: { liveEntityMetadata?: Record<string, unknown> },
): Promise<RoleName> {
  const canonicalOwnerId = resolveCanonicalOwnerId(runtime, metadata);
  if (canonicalOwnerId && entityId === canonicalOwnerId) {
    return "OWNER";
  }

  if (options?.liveEntityMetadata) {
    const whitelist = getConnectorAdminWhitelist(runtime);
    if (
      matchEntityToConnectorAdminWhitelist(options.liveEntityMetadata, whitelist)
    ) {
      return "ADMIN";
    }
  }

  return getEntityRole(metadata, entityId);
}

// ── Role mutation ──────────────────────────────────────────────────────────

export async function setEntityRole(
  runtime: IAgentRuntime,
  message: Memory,
  targetEntityId: string,
  newRole: RoleName,
  source: RoleGrantSource = "manual",
): Promise<void> {
  const resolved = await resolveWorldForMessage(runtime, message);
  if (!resolved) return;
  const { world, metadata } = resolved;
  metadata.roles ??= {};
  metadata.roleSources ??= {};
  if (newRole === "GUEST") {
    delete metadata.roles[targetEntityId];
    delete metadata.roleSources[targetEntityId];
  } else {
    metadata.roles[targetEntityId] = newRole;
    metadata.roleSources[targetEntityId] = source;
  }
  await runtime.updateWorld({
    ...world,
    metadata,
  } as Parameters<IAgentRuntime["updateWorld"]>[0]);
}

// ── Permission checks ──────────────────────────────────────────────────────

export function canModifyRole(
  requesterRole: RoleName,
  targetRole: RoleName | null,
  newRole: RoleName,
): boolean {
  if (targetRole === requesterRole) return false;
  switch (requesterRole) {
    case "OWNER":
      return true;
    case "ADMIN":
      return newRole !== "OWNER";
    default:
      return false;
  }
}

export async function checkSenderRole(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<RoleCheckResult | null> {
  try {
    const resolved = await resolveWorldForMessage(runtime, message);
    if (!resolved) return null;
    const role = await resolveEntityRole(
      runtime,
      resolved.world,
      resolved.metadata,
      message.entityId as UUID,
      { liveEntityMetadata: getLiveEntityMetadataFromMessage(message) },
    );
    return {
      role,
      isOwner: role === "OWNER",
      isAdmin: role === "OWNER" || role === "ADMIN",
      hasPrivateAccess: role === "OWNER" || role === "ADMIN",
    };
  } catch {
    return null;
  }
}

export async function checkSenderPrivateAccess(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<{ hasPrivateAccess: boolean } | null> {
  const result = await checkSenderRole(runtime, message);
  if (!result) return null;
  return { hasPrivateAccess: result.hasPrivateAccess };
}

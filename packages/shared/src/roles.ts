import {
  createUniqueUuid,
  type IAgentRuntime,
  type Memory,
  type Relationship,
  type UUID,
  type World,
} from "@elizaos/core";

export type RoleName = "OWNER" | "ADMIN" | "USER" | "GUEST";

export type RoleGrantSource = "owner" | "manual" | "connector_admin";

export type ConnectorAdminWhitelist = Record<string, string[]>;

export interface RolesConfig {
  connectorAdmins?: ConnectorAdminWhitelist;
}

export interface RolesWorldMetadata {
  ownership?: {
    ownerId?: string | null;
  };
  roles?: Record<string, RoleName | string>;
  roleSources?: Record<string, RoleGrantSource>;
}

export interface RoleCheckResult {
  entityId: string;
  role: RoleName;
  isOwner: boolean;
  isAdmin: boolean;
  canManageRoles: boolean;
}

export interface PrivateAccessCheckResult extends RoleCheckResult {
  hasPrivateAccess: boolean;
  accessRole: RoleName | null;
  accessSource: "owner" | "manual" | "linked_manual" | null;
}

export const ROLE_RANK: Record<RoleName, number> = {
  OWNER: 3,
  ADMIN: 2,
  USER: 1,
  GUEST: 0,
};

const CONNECTOR_ADMIN_WHITELIST_KEY = Symbol.for(
  "@miladyai/roles.connectorAdminWhitelist",
);

type RuntimeWithSettings = IAgentRuntime & {
  getSetting?: (key: string) => unknown;
  setSetting?: (key: string, value: unknown) => void;
  [CONNECTOR_ADMIN_WHITELIST_KEY]?: ConnectorAdminWhitelist | undefined;
};

type ResolvedWorld = {
  world: World & { metadata?: RolesWorldMetadata | null };
  metadata: RolesWorldMetadata;
};

type ResolveEntityRoleOptions = {
  liveEntityMetadata?: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function normalizeLookupValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function uniqueStrings(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}

function getRuntimeSetting(runtime: RuntimeWithSettings, key: string): unknown {
  try {
    return runtime.getSetting?.(key) ?? null;
  } catch {
    return null;
  }
}

function connectorIdentityValues(metadata: Record<string, unknown>): string[] {
  const values: string[] = [];
  for (const value of Object.values(metadata)) {
    const normalized = normalizeLookupValue(value);
    if (!normalized) continue;
    values.push(normalized);
    values.push(normalized.toLowerCase());
  }
  return [...new Set(values)];
}

function entityConnectorMetadata(
  entityMetadata: Record<string, unknown> | undefined,
  connector: string,
): Record<string, unknown> | undefined {
  return asRecord(entityMetadata?.[connector]);
}

async function getEntityMetadata(
  runtime: IAgentRuntime,
  entityId: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const entity = await runtime.getEntityById?.(entityId as UUID);
    return asRecord(entity?.metadata);
  } catch {
    return undefined;
  }
}

async function getConfirmedIdentityTargets(
  runtime: IAgentRuntime,
  entityId: string,
): Promise<string[]> {
  try {
    const relationships = (await runtime.getRelationships?.({
      entityIds: [entityId],
      tags: ["identity_link"],
    })) as Relationship[] | null | undefined;

    if (!relationships?.length) return [];

    return relationships
      .filter((relationship) => {
        const status = asRecord(relationship.metadata)?.status;
        return (
          relationship.sourceEntityId === (entityId as UUID) &&
          status === "confirmed"
        );
      })
      .map((relationship) => relationship.targetEntityId as string);
  } catch {
    return [];
  }
}

async function entityMatchesCanonicalOwner(
  runtime: IAgentRuntime,
  entityId: string,
  canonicalOwnerId: string,
  liveEntityMetadata?: Record<string, unknown>,
): Promise<boolean> {
  if (entityId === canonicalOwnerId) return true;

  const linkedTargets = await getConfirmedIdentityTargets(runtime, entityId);
  if (linkedTargets.includes(canonicalOwnerId)) {
    return true;
  }

  const ownerMetadata = await getEntityMetadata(runtime, canonicalOwnerId);
  if (!ownerMetadata) return false;

  const candidateMetadata = [
    liveEntityMetadata,
    await getEntityMetadata(runtime, entityId),
  ].filter(Boolean) as Record<string, unknown>[];

  for (const metadata of candidateMetadata) {
    for (const [connector, rawOwnerConnectorData] of Object.entries(
      ownerMetadata,
    )) {
      const ownerConnectorData = asRecord(rawOwnerConnectorData);
      const candidateConnectorData = entityConnectorMetadata(metadata, connector);
      if (!ownerConnectorData || !candidateConnectorData) continue;

      const ownerValues = new Set(connectorIdentityValues(ownerConnectorData));
      const candidateValues = connectorIdentityValues(candidateConnectorData);
      if (candidateValues.some((value) => ownerValues.has(value))) {
        return true;
      }
    }
  }

  return false;
}

function buildRoleCheck(entityId: string, role: RoleName): RoleCheckResult {
  return {
    entityId,
    role,
    isOwner: role === "OWNER",
    isAdmin: role === "OWNER" || role === "ADMIN",
    canManageRoles: role === "OWNER" || role === "ADMIN",
  };
}

export function normalizeRole(value: unknown): RoleName {
  if (typeof value !== "string") return "GUEST";
  switch (value.toUpperCase()) {
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

export function getEntityRole(
  metadata: RolesWorldMetadata | undefined,
  entityId: string,
): RoleName {
  return normalizeRole(metadata?.roles?.[entityId]);
}

export function canModifyRole(
  actorRole: RoleName,
  targetRole: RoleName,
  newRole: RoleName,
): boolean {
  if (actorRole === "OWNER") {
    return targetRole !== newRole;
  }

  if (actorRole !== "ADMIN") {
    return false;
  }

  if (targetRole === "OWNER" || targetRole === "ADMIN") {
    return false;
  }

  if (newRole === "OWNER") {
    return false;
  }

  return targetRole !== newRole;
}

export function setConnectorAdminWhitelist(
  runtime: RuntimeWithSettings,
  whitelist: ConnectorAdminWhitelist | undefined,
): void {
  runtime[CONNECTOR_ADMIN_WHITELIST_KEY] =
    whitelist && Object.keys(whitelist).length > 0 ? { ...whitelist } : undefined;
}

export function getConnectorAdminWhitelist(
  runtime: RuntimeWithSettings,
): ConnectorAdminWhitelist {
  return runtime[CONNECTOR_ADMIN_WHITELIST_KEY] ?? {};
}

export function matchEntityToConnectorAdminWhitelist(
  entityMetadata: Record<string, unknown> | undefined,
  whitelist: ConnectorAdminWhitelist | undefined,
): { connector: string; matchedField: string; matchedValue: string } | null {
  if (!entityMetadata || !whitelist) return null;

  for (const [connector, allowedValues] of Object.entries(whitelist)) {
    const connectorMetadata = entityConnectorMetadata(entityMetadata, connector);
    if (!connectorMetadata) continue;

    const allowed = new Set(
      allowedValues.flatMap((value) => {
        const normalized = normalizeLookupValue(value);
        return normalized ? [normalized, normalized.toLowerCase()] : [];
      }),
    );

    for (const [field, rawValue] of Object.entries(connectorMetadata)) {
      const normalized = normalizeLookupValue(rawValue);
      if (!normalized) continue;
      if (allowed.has(normalized) || allowed.has(normalized.toLowerCase())) {
        return {
          connector,
          matchedField: field,
          matchedValue: normalized,
        };
      }
    }
  }

  return null;
}

export function getConfiguredOwnerEntityIds(runtime: RuntimeWithSettings): string[] {
  const ids: string[] = [];

  const canonicalOwner = normalizeLookupValue(
    getRuntimeSetting(runtime, "ELIZA_ADMIN_ENTITY_ID"),
  );
  if (canonicalOwner) ids.push(canonicalOwner);

  const rawContacts = getRuntimeSetting(runtime, "ELIZA_OWNER_CONTACTS_JSON");
  if (typeof rawContacts === "string" && rawContacts.trim().length > 0) {
    try {
      const parsed = JSON.parse(rawContacts) as Record<
        string,
        { entityId?: string | null }
      >;
      for (const contact of Object.values(parsed)) {
        const entityId = normalizeLookupValue(contact?.entityId);
        if (entityId) ids.push(entityId);
      }
    } catch {
      // ignore invalid config and fall back to the canonical ID only
    }
  }

  return uniqueStrings(ids);
}

export function hasConfiguredCanonicalOwner(
  runtime: RuntimeWithSettings,
): boolean {
  return getConfiguredOwnerEntityIds(runtime).length > 0;
}

export function resolveCanonicalOwnerId(
  runtime: RuntimeWithSettings,
  metadata?: RolesWorldMetadata,
): string | null {
  const configuredOwnerIds = getConfiguredOwnerEntityIds(runtime);
  if (configuredOwnerIds.length > 0) {
    return configuredOwnerIds[0] ?? null;
  }

  const ownershipOwner = normalizeLookupValue(metadata?.ownership?.ownerId);
  if (ownershipOwner) return ownershipOwner;

  if (metadata?.roles) {
    for (const [entityId, role] of Object.entries(metadata.roles)) {
      if (normalizeRole(role) === "OWNER") {
        return entityId;
      }
    }
  }

  return null;
}

export function getLiveEntityMetadataFromMessage(
  message: Memory,
): Record<string, unknown> | undefined {
  const memoryMetadata = asRecord(message.metadata);
  if (!memoryMetadata) return undefined;

  const discordUserId = normalizeLookupValue(memoryMetadata.fromId);
  const entityName = normalizeLookupValue(memoryMetadata.entityName);
  const discordServerId = normalizeLookupValue(memoryMetadata.discordServerId);

  if (discordUserId && discordServerId) {
    return {
      discord: {
        userId: discordUserId,
        id: discordUserId,
        name: entityName ?? discordUserId,
        username: entityName ?? discordUserId,
      },
    };
  }

  return undefined;
}

export async function resolveWorldForMessage(
  runtime: IAgentRuntime,
  message: Memory,
): Promise<ResolvedWorld | null> {
  const room = await runtime.getRoom?.(message.roomId);
  if (room?.worldId) {
    const world = (await runtime.getWorld?.(room.worldId)) as
      | (World & { metadata?: RolesWorldMetadata | null })
      | null
      | undefined;
    if (!world) return null;
    return {
      world,
      metadata: (world.metadata ?? {}) as RolesWorldMetadata,
    };
  }

  const memoryMetadata = asRecord(message.metadata);
  const discordServerId = normalizeLookupValue(memoryMetadata?.discordServerId);
  if (!discordServerId) return null;

  const fallbackWorldId = createUniqueUuid(runtime, discordServerId) as UUID;
  const world = (await runtime.getWorld?.(fallbackWorldId)) as
    | (World & { metadata?: RolesWorldMetadata | null })
    | null
    | undefined;
  if (!world) return null;

  return {
    world,
    metadata: (world.metadata ?? {}) as RolesWorldMetadata,
  };
}

export async function resolveCanonicalOwnerIdForMessage(
  runtime: RuntimeWithSettings,
  message: Memory,
): Promise<string | null> {
  const resolved = await resolveWorldForMessage(runtime, message);
  return resolveCanonicalOwnerId(runtime, resolved?.metadata);
}

export async function resolveEntityRole(
  runtime: RuntimeWithSettings,
  _world: World,
  metadata: RolesWorldMetadata,
  entityId: string,
  options?: ResolveEntityRoleOptions,
): Promise<RoleName> {
  const canonicalOwnerId = resolveCanonicalOwnerId(runtime, metadata);
  if (
    canonicalOwnerId &&
    (await entityMatchesCanonicalOwner(
      runtime,
      entityId,
      canonicalOwnerId,
      options?.liveEntityMetadata,
    ))
  ) {
    return "OWNER";
  }

  const storedRole = getEntityRole(metadata, entityId);
  const storedRoleSource = metadata.roleSources?.[entityId];

  if (
    storedRole === "OWNER" &&
    canonicalOwnerId &&
    hasConfiguredCanonicalOwner(runtime) &&
    entityId !== canonicalOwnerId
  ) {
    return "GUEST";
  }

  const whitelist = getConnectorAdminWhitelist(runtime);
  const candidateMetadata = [
    options?.liveEntityMetadata,
    await getEntityMetadata(runtime, entityId),
  ].filter(Boolean) as Record<string, unknown>[];

  for (const entityMetadata of candidateMetadata) {
    if (matchEntityToConnectorAdminWhitelist(entityMetadata, whitelist)) {
      return "ADMIN";
    }
  }

  if (storedRoleSource === "connector_admin") {
    return "GUEST";
  }

  return storedRole;
}

export async function checkSenderRole(
  runtime: RuntimeWithSettings,
  message: Memory,
): Promise<RoleCheckResult | null> {
  const resolved = await resolveWorldForMessage(runtime, message);
  const configuredOwnerIds = getConfiguredOwnerEntityIds(runtime);

  if (!resolved) {
    if (configuredOwnerIds.includes(message.entityId as string)) {
      return buildRoleCheck(message.entityId as string, "OWNER");
    }
    return null;
  }

  const role = await resolveEntityRole(
    runtime,
    resolved.world,
    resolved.metadata,
    message.entityId as string,
    { liveEntityMetadata: getLiveEntityMetadataFromMessage(message) },
  );

  return buildRoleCheck(message.entityId as string, role);
}

export async function checkSenderPrivateAccess(
  runtime: RuntimeWithSettings,
  message: Memory,
): Promise<PrivateAccessCheckResult | null> {
  const roleCheck = await checkSenderRole(runtime, message);
  if (!roleCheck) return null;

  if (roleCheck.isOwner) {
    return {
      ...roleCheck,
      hasPrivateAccess: true,
      accessRole: "OWNER",
      accessSource: "owner",
    };
  }

  const resolved = await resolveWorldForMessage(runtime, message);
  if (!resolved) {
    return {
      ...roleCheck,
      hasPrivateAccess: false,
      accessRole: null,
      accessSource: null,
    };
  }

  const directSource = resolved.metadata.roleSources?.[message.entityId as string];
  if (directSource === "manual" && roleCheck.role !== "GUEST") {
    return {
      ...roleCheck,
      hasPrivateAccess: true,
      accessRole: roleCheck.role,
      accessSource: "manual",
    };
  }

  const linkedTargets = await getConfirmedIdentityTargets(
    runtime,
    message.entityId as string,
  );
  for (const targetEntityId of linkedTargets) {
    const targetRole = getEntityRole(resolved.metadata, targetEntityId);
    const targetSource = resolved.metadata.roleSources?.[targetEntityId];
    if (targetSource === "manual" && targetRole !== "GUEST") {
      return {
        ...roleCheck,
        hasPrivateAccess: true,
        accessRole: targetRole,
        accessSource: "linked_manual",
      };
    }
  }

  return {
    ...roleCheck,
    hasPrivateAccess: false,
    accessRole: null,
    accessSource: null,
  };
}

export async function setEntityRole(
  runtime: IAgentRuntime,
  message: Memory,
  targetEntityId: string,
  role: RoleName,
): Promise<Record<string, RoleName | string>> {
  const resolved = await resolveWorldForMessage(runtime, message);
  if (!resolved) {
    throw new Error("Cannot resolve world");
  }

  resolved.metadata.roles ??= {};
  resolved.metadata.roleSources ??= {};

  resolved.metadata.roles[targetEntityId] = role;
  if (role === "GUEST") {
    delete resolved.metadata.roleSources[targetEntityId];
  } else {
    resolved.metadata.roleSources[targetEntityId] = "manual";
  }

  (resolved.world as { metadata: RolesWorldMetadata }).metadata = resolved.metadata;
  await runtime.updateWorld?.(resolved.world as Parameters<
    IAgentRuntime["updateWorld"]
  >[0]);

  return resolved.metadata.roles;
}

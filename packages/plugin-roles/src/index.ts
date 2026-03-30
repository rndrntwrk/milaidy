/**
 * plugin-roles — Role-based access control for elizaOS.
 *
 * Provides OWNER / ADMIN / NONE role hierarchy with:
 * - Auto-assignment of OWNER to the app user (world owner)
 * - Connector admin whitelisting (Discord, Telegram, etc.)
 * - /role command for live role management
 * - Provider that injects role context for action/provider gating
 *
 * Config (milady.json):
 *   plugins.entries["@miladyai/plugin-roles"].config.connectorAdmins = {
 *     "discord": ["discordUserId1", "discordUserId2"],
 *     "telegram": ["telegramUserId1"]
 *   }
 */

import {
  logger,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";
import { rolesProvider } from "./provider";
import { updateRoleAction } from "./action";
import type { RoleName, RolesPluginConfig, RolesWorldMetadata } from "./types";
import { normalizeRole } from "./utils";

export { rolesProvider } from "./provider";
export { updateRoleAction } from "./action";
export {
  canModifyRole,
  checkSenderRole,
  getEntityRole,
  normalizeRole,
  resolveWorldForMessage,
  setEntityRole,
} from "./utils";
export type {
  ConnectorAdminWhitelist,
  RoleCheckResult,
  RoleName,
  RolesPluginConfig,
  RolesWorldMetadata,
} from "./types";
export { ROLE_RANK } from "./types";

/**
 * Ensure the world owner has OWNER role in metadata.
 * Called on plugin init — guarantees the app-local user is always OWNER.
 */
async function ensureOwnerRole(runtime: IAgentRuntime): Promise<void> {
  try {
    // Find all worlds and ensure ownership roles
    const rooms = await runtime.getRooms();
    const processedWorlds = new Set<string>();

    for (const room of rooms) {
      if (!room.worldId || processedWorlds.has(room.worldId)) continue;
      processedWorlds.add(room.worldId);

      const world = await runtime.getWorld(room.worldId);
      if (!world) continue;

      const metadata = (world.metadata ?? {}) as RolesWorldMetadata;
      const ownerId = metadata.ownership?.ownerId;
      if (!ownerId) continue;

      const currentRole = normalizeRole(metadata.roles?.[ownerId]);
      if (currentRole === "OWNER") continue;

      // Owner exists but doesn't have OWNER role yet — fix it.
      if (!metadata.roles) metadata.roles = {};
      metadata.roles[ownerId] = "OWNER";
      (world as { metadata: RolesWorldMetadata }).metadata = metadata;
      await runtime.updateWorld(
        world as Parameters<IAgentRuntime["updateWorld"]>[0],
      );
      logger.info(
        `[roles] Auto-assigned OWNER role to world owner ${ownerId} in world ${room.worldId}`,
      );
    }
  } catch (err) {
    logger.warn(`[roles] Failed to bootstrap owner roles: ${err}`);
  }
}

/**
 * Apply connector admin whitelists from config.
 * Scans worlds for entities matching whitelisted IDs and promotes them to ADMIN.
 */
async function applyConnectorAdminWhitelists(
  runtime: IAgentRuntime,
  whitelist: Record<string, string[]>,
): Promise<void> {
  // Flatten all whitelisted IDs across connectors for fast lookup
  const whitelistedIds = new Set<string>();
  for (const ids of Object.values(whitelist)) {
    for (const id of ids) {
      whitelistedIds.add(id);
    }
  }

  if (whitelistedIds.size === 0) return;

  try {
    const rooms = await runtime.getRooms();
    const processedWorlds = new Set<string>();

    for (const room of rooms) {
      if (!room.worldId || processedWorlds.has(room.worldId)) continue;
      processedWorlds.add(room.worldId);

      const world = await runtime.getWorld(room.worldId);
      if (!world) continue;

      const metadata = (world.metadata ?? {}) as RolesWorldMetadata;
      if (!metadata.roles) metadata.roles = {};
      let updated = false;

      // Check entities in this world's rooms
      const entities = await runtime.getEntitiesForRoom(room.id);
      for (const entityId of entities) {
        // Skip if already has a role
        if (metadata.roles[entityId]) continue;

        const entity = await runtime.getEntityById(entityId);
        if (!entity?.metadata) continue;

        // Check if any of the entity's platform identifiers match the whitelist
        const meta = entity.metadata as Record<
          string,
          Record<string, string> | undefined
        >;
        let matched = false;

        for (const [connector, platformIds] of Object.entries(whitelist)) {
          const connectorMeta = meta[connector];
          if (!connectorMeta || typeof connectorMeta !== "object") continue;

          // Check userId, id, username fields
          for (const field of ["userId", "id", "username", "userName"]) {
            const val = connectorMeta[field];
            if (val && platformIds.includes(val)) {
              matched = true;
              break;
            }
          }
          if (matched) break;
        }

        if (matched) {
          metadata.roles[entityId] = "ADMIN";
          updated = true;
          logger.info(
            `[roles] Auto-promoted whitelisted entity ${entityId} to ADMIN`,
          );
        }
      }

      if (updated) {
        (world as { metadata: RolesWorldMetadata }).metadata = metadata;
        await runtime.updateWorld(
          world as Parameters<IAgentRuntime["updateWorld"]>[0],
        );
      }
    }
  } catch (err) {
    logger.warn(`[roles] Failed to apply connector admin whitelists: ${err}`);
  }
}

const rolesPlugin: Plugin = {
  name: "@miladyai/plugin-roles",
  description:
    "Role-based access control — OWNER/ADMIN/NONE hierarchy with " +
    "connector whitelisting and /role command.",

  providers: [rolesProvider],
  actions: [updateRoleAction],

  async init(pluginConfig: Record<string, unknown>, runtime: IAgentRuntime) {
    logger.info("[roles] Initializing plugin-roles");

    // Step 1: Ensure world owners have OWNER role
    await ensureOwnerRole(runtime);

    // Step 2: Apply connector admin whitelists if configured
    const config = pluginConfig as RolesPluginConfig | undefined;
    if (config?.connectorAdmins) {
      await applyConnectorAdminWhitelists(runtime, config.connectorAdmins);
    }

    logger.info("[roles] Plugin-roles initialized");
  },
};

export default rolesPlugin;

/**
 * Late-join whitelist evaluator.
 *
 * Problem: plugin-roles' `applyConnectorAdminWhitelists()` only runs at boot.
 * Entities that join AFTER init are never auto-promoted.
 *
 * Solution: This evaluator runs on each message. If the sender has no role
 * (NONE) and matches the connector admin whitelist from config, it promotes
 * them to ADMIN.
 *
 * Lightweight by design: skips early if the sender already has a role, and
 * only reads config + entity metadata when promotion is possible.
 */

import {
  type Evaluator,
  type IAgentRuntime,
  logger,
  type Memory,
  type State,
  type UUID,
} from "@elizaos/core";
import {
  getEntityRole,
  resolveWorldForMessage,
  setEntityRole,
} from "@miladyai/plugin-roles";
import { loadElizaConfig } from "../config/config.js";

/** Connector metadata fields checked for whitelist matching. */
const MATCH_FIELDS = ["userId", "id", "username", "userName"] as const;

/**
 * Load the connectorAdmins whitelist from milady.json.
 * Returns an empty object if not configured.
 */
function loadConnectorAdminWhitelist(): Record<string, string[]> {
  try {
    const cfg = loadElizaConfig();
    const rolesEntry = cfg.plugins?.entries?.["@miladyai/plugin-roles"];
    const config = rolesEntry?.config as
      | { connectorAdmins?: Record<string, string[]> }
      | undefined;
    return config?.connectorAdmins ?? {};
  } catch {
    return {};
  }
}

/**
 * Check if an entity matches any entry in the connector admin whitelist.
 *
 * Iterates connector keys in the whitelist and checks the entity's
 * per-connector metadata for matching userId/id/username/userName fields.
 */
function matchEntityToWhitelist(
  entityMetadata: Record<string, unknown> | undefined | null,
  whitelist: Record<string, string[]>,
): boolean {
  if (!entityMetadata) return false;

  const platformMetadata = entityMetadata as Record<
    string,
    Record<string, unknown> | undefined
  >;

  for (const [connector, platformIds] of Object.entries(whitelist)) {
    if (!platformIds || platformIds.length === 0) continue;
    const connectorMeta = platformMetadata[connector];
    if (!connectorMeta || typeof connectorMeta !== "object") continue;

    for (const field of MATCH_FIELDS) {
      const value = connectorMeta[field];
      if (typeof value === "string" && platformIds.includes(value)) {
        return true;
      }
    }
  }

  return false;
}

export const lateJoinWhitelistEvaluator: Evaluator = {
  name: "late_join_whitelist",
  description:
    "Auto-promotes entities matching connector admin whitelist on first message",
  alwaysRun: true,
  examples: [],

  /**
   * Only run when the sender has no role (NONE) in the current world.
   * Entities that already have ADMIN or OWNER are skipped immediately.
   */
  validate: async (
    runtime: IAgentRuntime,
    message: Memory,
  ): Promise<boolean> => {
    const resolved = await resolveWorldForMessage(runtime, message);
    if (!resolved) return false;

    const role = getEntityRole(resolved.metadata, message.entityId);
    return (role as string) === "NONE";
  },

  handler: async (runtime: IAgentRuntime, message: Memory, _state?: State) => {
    const whitelist = loadConnectorAdminWhitelist();
    const hasWhitelist = Object.values(whitelist).some((ids) => ids.length > 0);
    if (!hasWhitelist) return undefined;

    const entity = await runtime.getEntityById(message.entityId as UUID);
    if (!entity) return undefined;

    const matched = matchEntityToWhitelist(
      entity.metadata as Record<string, unknown> | undefined,
      whitelist,
    );
    if (!matched) return undefined;

    await setEntityRole(runtime, message, message.entityId as string, "ADMIN");
    logger.info(
      `[roles] Late-join: promoted entity ${message.entityId} to ADMIN (whitelist match)`,
    );
    return undefined;
  },
};

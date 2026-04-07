/**
 * World creation role backfill provider.
 *
 * Problem: When a new connector creates a new world AFTER plugin-roles init,
 * the owner's role is not set in that world because `ensureOwnerRole()` only
 * runs at boot.
 *
 * Solution: On every message, if the current world has an ownerId but no
 * OWNER role entry, backfill it. This is idempotent -- running it multiple
 * times on the same world is a no-op after the first backfill.
 *
 * Runs as a lightweight provider with a high position number (early/low
 * priority) so it does not add latency to prompt construction. Produces no
 * visible text in the agent context.
 */

import {
  type IAgentRuntime,
  logger,
  type Memory,
  type Provider,
  type ProviderResult,
  type State,
} from "@elizaos/core";
import { normalizeRole } from "@miladyai/plugin-roles";

type RolesWorldMetadata = {
  ownership?: { ownerId?: string };
  roles?: Record<string, string>;
};

const EMPTY: ProviderResult = {
  text: "",
  values: {},
  data: {},
};

export const roleBackfillProvider: Provider = {
  name: "roleBackfill",
  description:
    "Lazily backfills OWNER role for new worlds created after plugin-roles init.",
  dynamic: true,
  // High position number = runs after the main roles provider (position 10).
  position: 11,

  async get(
    runtime: IAgentRuntime,
    message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    try {
      const room = await runtime.getRoom(message.roomId);
      if (!room?.worldId) return EMPTY;

      const world = await runtime.getWorld(room.worldId);
      if (!world) return EMPTY;

      const metadata = (world.metadata ?? {}) as RolesWorldMetadata;
      const ownerId = metadata.ownership?.ownerId;
      if (!ownerId) return EMPTY;

      const roles = metadata.roles ?? {};
      const currentOwnerRole = normalizeRole(roles[ownerId]);

      // Already has OWNER role -- no-op
      if (currentOwnerRole === "OWNER") return EMPTY;

      // Backfill: set OWNER role for the world owner
      roles[ownerId] = "OWNER";
      const updatedMetadata = {
        ...metadata,
        roles,
      };

      await runtime.updateWorld({
        ...world,
        metadata: updatedMetadata,
      } as Parameters<IAgentRuntime["updateWorld"]>[0]);

      logger.info(
        `[roles] Backfill: set OWNER role for entity ${ownerId} in world ${world.id}`,
      );
    } catch (err) {
      logger.warn(`[roles] Role backfill failed: ${String(err)}`);
    }

    return EMPTY;
  },
};

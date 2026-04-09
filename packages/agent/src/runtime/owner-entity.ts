import type { IAgentRuntime } from "@elizaos/core";
import { resolveCanonicalOwnerId } from "@miladyai/plugin-roles";

type WorldMetadataShape = {
  ownership?: { ownerId?: string };
};

export async function resolveOwnerEntityId(
  runtime: IAgentRuntime,
): Promise<string | null> {
  const configuredOwnerId = resolveCanonicalOwnerId(runtime);
  if (configuredOwnerId) {
    return configuredOwnerId;
  }

  try {
    const roomIds = await runtime.getRoomsForParticipant(runtime.agentId);
    for (const roomId of roomIds.slice(0, 10)) {
      try {
        const room = await runtime.getRoom(roomId);
        if (!room?.worldId) {
          continue;
        }
        const world = await runtime.getWorld(room.worldId);
        const metadata = (world?.metadata ?? {}) as WorldMetadataShape;
        if (metadata.ownership?.ownerId) {
          return metadata.ownership.ownerId;
        }
      } catch {}
    }
  } catch {}

  return null;
}

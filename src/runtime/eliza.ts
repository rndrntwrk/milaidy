import {
  type AgentRuntime,
  AutonomyService,
  ChannelType,
  logger,
  stringToUuid,
} from "@elizaos/core";

export * from "@elizaos/autonomous/runtime/eliza";

import {
  applyCloudConfigToEnv as upstreamApplyCloudConfigToEnv,
  bootElizaRuntime as upstreamBootElizaRuntime,
  buildCharacterFromConfig as upstreamBuildCharacterFromConfig,
  collectPluginNames as upstreamCollectPluginNames,
  shutdownRuntime as upstreamShutdownRuntime,
  startEliza as upstreamStartEliza,
} from "@elizaos/autonomous/runtime/eliza";
import { HISTORY_KNOWLEDGE } from "../knowledge/history";
import { ensureRuntimeSqlCompatibility } from "../utils/sql-compat";

const BRAND_ENV_ALIASES = [
  ["MILADY_USE_PI_AI", "ELIZA_USE_PI_AI"],
  ["MILADY_CLOUD_TTS_DISABLED", "ELIZA_CLOUD_TTS_DISABLED"],
  ["MILADY_CLOUD_MEDIA_DISABLED", "ELIZA_CLOUD_MEDIA_DISABLED"],
  ["MILADY_CLOUD_EMBEDDINGS_DISABLED", "ELIZA_CLOUD_EMBEDDINGS_DISABLED"],
  ["MILADY_CLOUD_RPC_DISABLED", "ELIZA_CLOUD_RPC_DISABLED"],
] as const;

const miladyMirroredEnvKeys = new Set<string>();
const elizaMirroredEnvKeys = new Set<string>();
const AUTONOMY_WORLD_ID = stringToUuid("00000000-0000-0000-0000-000000000001");
const AUTONOMY_ENTITY_ID = stringToUuid("00000000-0000-0000-0000-000000000002");
const AUTONOMY_MESSAGE_SERVER_ID = stringToUuid(
  "00000000-0000-0000-0000-000000000000",
);

interface EntityLike {
  id: string;
  agentId?: string;
  names?: string[];
  metadata?: Record<string, unknown>;
}

interface RuntimeAutonomyCompat {
  getEntityById?: (id: string) => Promise<EntityLike | null>;
  createEntity?: (entity: {
    id: string;
    names: string[];
    agentId: string;
    metadata?: Record<string, unknown>;
  }) => Promise<boolean>;
  updateEntity?: (entity: EntityLike & { agentId: string }) => Promise<boolean>;
  ensureWorldExists?: (world: {
    id: string;
    name: string;
    agentId: string;
    messageServerId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
  ensureRoomExists?: (room: {
    id: string;
    name: string;
    worldId: string;
    source: string;
    type: ChannelType;
    metadata?: Record<string, unknown>;
  }) => Promise<unknown>;
  ensureParticipantInRoom?: (
    entityId: string,
    roomId: string,
  ) => Promise<unknown>;
  addParticipant?: (entityId: string, roomId: string) => Promise<unknown>;
}

interface RuntimeAdapterAutonomyCompat {
  upsertEntities?: (
    entities: Array<{
      id: string;
      names: string[];
      agentId: string;
      metadata?: Record<string, unknown>;
    }>,
  ) => Promise<unknown>;
}

function syncMiladyEnvToEliza(): void {
  for (const [miladyKey, elizaKey] of BRAND_ENV_ALIASES) {
    const value = process.env[miladyKey];
    if (typeof value === "string") {
      process.env[elizaKey] = value;
      elizaMirroredEnvKeys.add(elizaKey);
    } else if (elizaMirroredEnvKeys.has(elizaKey)) {
      delete process.env[elizaKey];
      elizaMirroredEnvKeys.delete(elizaKey);
    }
  }
}

function syncElizaEnvToMilady(): void {
  for (const [miladyKey, elizaKey] of BRAND_ENV_ALIASES) {
    const value = process.env[elizaKey];
    if (typeof value === "string") {
      process.env[miladyKey] = value;
      miladyMirroredEnvKeys.add(miladyKey);
    } else if (miladyMirroredEnvKeys.has(miladyKey)) {
      delete process.env[miladyKey];
      miladyMirroredEnvKeys.delete(miladyKey);
    }
  }
}

export function collectPluginNames(
  ...args: Parameters<typeof upstreamCollectPluginNames>
): ReturnType<typeof upstreamCollectPluginNames> {
  syncMiladyEnvToEliza();
  const result = upstreamCollectPluginNames(...args);
  syncElizaEnvToMilady();
  return result;
}

export function applyCloudConfigToEnv(
  ...args: Parameters<typeof upstreamApplyCloudConfigToEnv>
): ReturnType<typeof upstreamApplyCloudConfigToEnv> {
  syncMiladyEnvToEliza();
  const result = upstreamApplyCloudConfigToEnv(...args);
  syncElizaEnvToMilady();
  return result;
}

/** Preset knowledge items baked into every character at boot. */
const PRESET_KNOWLEDGE = [
  { item: { case: "path" as const, value: HISTORY_KNOWLEDGE } },
];

export function buildCharacterFromConfig(
  ...args: Parameters<typeof upstreamBuildCharacterFromConfig>
): ReturnType<typeof upstreamBuildCharacterFromConfig> {
  syncMiladyEnvToEliza();
  const character = upstreamBuildCharacterFromConfig(...args);
  syncElizaEnvToMilady();

  // Inject preset knowledge so every agent starts with foundational
  // context about ELIZA, elizaOS, and the Milady project.
  character.knowledge = [...PRESET_KNOWLEDGE, ...(character.knowledge ?? [])];

  return character;
}

async function ensureAutonomyBootstrapContext(
  runtime: AgentRuntime,
): Promise<void> {
  const runtimeWithCompat = runtime as AgentRuntime & RuntimeAutonomyCompat;
  const adapter = runtime.adapter as RuntimeAdapterAutonomyCompat | undefined;
  const autonomousRoomId = stringToUuid(`autonomy-room-${runtime.agentId}`);

  await runtimeWithCompat.ensureWorldExists?.({
    id: AUTONOMY_WORLD_ID,
    name: "Autonomy World",
    agentId: runtime.agentId,
    messageServerId: AUTONOMY_MESSAGE_SERVER_ID,
    metadata: {
      type: "autonomy",
      description: "World for autonomous agent thinking",
    },
  });

  await runtimeWithCompat.ensureRoomExists?.({
    id: autonomousRoomId,
    name: "Autonomous Thoughts",
    worldId: AUTONOMY_WORLD_ID,
    source: "autonomy-service",
    type: ChannelType.SELF,
    metadata: {
      source: "autonomy-service",
      description: "Room for autonomous agent thinking",
    },
  });

  const autonomyEntity = {
    id: AUTONOMY_ENTITY_ID,
    names: ["Autonomy"],
    agentId: runtime.agentId,
    metadata: {
      type: "autonomy",
      description: "Dedicated entity for autonomy service prompts",
    },
  };
  const existingEntity =
    (await runtimeWithCompat.getEntityById?.(AUTONOMY_ENTITY_ID)) ?? null;

  if (!existingEntity) {
    const created = await runtimeWithCompat.createEntity?.(autonomyEntity);
    if (!created && adapter?.upsertEntities) {
      await adapter.upsertEntities([autonomyEntity]);
    }
  } else if (existingEntity.agentId !== runtime.agentId) {
    if (runtimeWithCompat.updateEntity) {
      await runtimeWithCompat.updateEntity({
        ...existingEntity,
        agentId: runtime.agentId,
      });
    } else if (adapter?.upsertEntities) {
      await adapter.upsertEntities([
        {
          id: existingEntity.id ?? AUTONOMY_ENTITY_ID,
          names:
            existingEntity.names && existingEntity.names.length > 0
              ? existingEntity.names
              : autonomyEntity.names,
          agentId: runtime.agentId,
          metadata: {
            ...autonomyEntity.metadata,
            ...(existingEntity.metadata ?? {}),
          },
        },
      ]);
    }
  }

  if (runtimeWithCompat.ensureParticipantInRoom) {
    await runtimeWithCompat.ensureParticipantInRoom(
      runtime.agentId,
      autonomousRoomId,
    );
    await runtimeWithCompat.ensureParticipantInRoom(
      AUTONOMY_ENTITY_ID,
      autonomousRoomId,
    );
  } else if (runtimeWithCompat.addParticipant) {
    await runtimeWithCompat.addParticipant(runtime.agentId, autonomousRoomId);
    await runtimeWithCompat.addParticipant(
      AUTONOMY_ENTITY_ID,
      autonomousRoomId,
    );
  }
}

async function repairRuntimeAfterBoot(
  runtime: AgentRuntime,
): Promise<AgentRuntime> {
  await ensureRuntimeSqlCompatibility(runtime);
  await ensureAutonomyBootstrapContext(runtime);

  if (!runtime.getService("AUTONOMY")) {
    try {
      await AutonomyService.start(runtime);
      logger.info(
        "[milady] AutonomyService started after SQL compatibility repair",
      );
    } catch (error) {
      logger.warn(
        `[milady] AutonomyService restart after SQL compatibility repair failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return runtime;
}

export async function bootElizaRuntime(
  ...args: Parameters<typeof upstreamBootElizaRuntime>
): Promise<Awaited<ReturnType<typeof upstreamBootElizaRuntime>>> {
  syncMiladyEnvToEliza();

  try {
    const runtime = await upstreamBootElizaRuntime(...args);
    return runtime ? await repairRuntimeAfterBoot(runtime) : runtime;
  } finally {
    syncElizaEnvToMilady();
  }
}

export async function startEliza(
  ...args: Parameters<typeof upstreamStartEliza>
): Promise<Awaited<ReturnType<typeof upstreamStartEliza>>> {
  syncMiladyEnvToEliza();

  try {
    const options = args[0];

    if (options?.serverOnly) {
      let currentRuntime =
        (await upstreamStartEliza({
          ...options,
          headless: true,
          serverOnly: false,
        })) ?? undefined;

      currentRuntime = currentRuntime
        ? await repairRuntimeAfterBoot(currentRuntime)
        : currentRuntime;

      if (!currentRuntime) {
        return currentRuntime;
      }

      const { startApiServer } = await import("../api/server");
      const apiPort = Number(process.env.ELIZA_PORT) || 2138;
      const { port: actualApiPort } = await startApiServer({
        port: apiPort,
        runtime: currentRuntime,
        onRestart: async () => {
          if (!currentRuntime) {
            return null;
          }

          await upstreamShutdownRuntime(
            currentRuntime,
            "milady server-only restart",
          );

          const restarted =
            (await upstreamStartEliza({
              ...options,
              headless: true,
              serverOnly: false,
            })) ?? undefined;

          currentRuntime = restarted
            ? await repairRuntimeAfterBoot(restarted)
            : undefined;

          return currentRuntime ?? null;
        },
      });

      logger.info(
        `[milady] API server listening on http://localhost:${actualApiPort}`,
      );
      console.log(`[milady] Control UI: http://localhost:${actualApiPort}`);
      console.log("[milady] Server running. Press Ctrl+C to stop.");

      const keepAlive = setInterval(() => {}, 1 << 30);
      const cleanup = async () => {
        clearInterval(keepAlive);
        if (currentRuntime) {
          await upstreamShutdownRuntime(currentRuntime, "server-only shutdown");
        }
        process.exit(0);
      };

      process.on("SIGINT", () => void cleanup());
      process.on("SIGTERM", () => void cleanup());
      return currentRuntime;
    }

    const runtime = await upstreamStartEliza(...args);
    return runtime ? await repairRuntimeAfterBoot(runtime) : runtime;
  } finally {
    syncElizaEnvToMilady();
  }
}

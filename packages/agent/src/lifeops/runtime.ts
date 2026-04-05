import type { IAgentRuntime, Task, UUID } from "@elizaos/core";
import { stringToUuid } from "@elizaos/core";
import { LifeOpsService } from "./service.js";

export const LIFEOPS_TASK_NAME = "LIFEOPS_SCHEDULER" as const;
export const LIFEOPS_TASK_TAGS = ["queue", "repeat", "lifeops"] as const;
export const LIFEOPS_TASK_INTERVAL_MS = 60_000;

type AutonomyServiceLike = {
  getAutonomousRoomId?: () => UUID;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLifeOpsSchedulerTask(task: Task): boolean {
  const metadata = isRecord(task.metadata) ? task.metadata : null;
  const scheduler = metadata?.lifeopsScheduler;
  return (
    task.name === LIFEOPS_TASK_NAME &&
    isRecord(scheduler) &&
    scheduler.kind === "runtime_runner"
  );
}

function buildSchedulerMetadata(
  current: Record<string, unknown> | null = null,
): Record<string, unknown> {
  return {
    ...(current ?? {}),
    updateInterval: LIFEOPS_TASK_INTERVAL_MS,
    baseInterval: LIFEOPS_TASK_INTERVAL_MS,
    blocking: true,
    lifeopsScheduler: {
      kind: "runtime_runner",
      version: 1,
    },
  };
}

export async function executeLifeOpsSchedulerTask(
  runtime: IAgentRuntime,
  options: Record<string, unknown> = {},
): Promise<{
  nextInterval: number;
}> {
  const service = new LifeOpsService(runtime);
  await service.processScheduledWork({
    now: typeof options.now === "string" ? options.now : undefined,
  });
  return {
    nextInterval: LIFEOPS_TASK_INTERVAL_MS,
  };
}

export function registerLifeOpsTaskWorker(runtime: IAgentRuntime): void {
  if (runtime.getTaskWorker(LIFEOPS_TASK_NAME)) {
    return;
  }
  runtime.registerTaskWorker({
    name: LIFEOPS_TASK_NAME,
    shouldRun: async () => true,
    execute: async (rt, options) =>
      executeLifeOpsSchedulerTask(rt, isRecord(options) ? options : {}),
  });
}

export async function ensureLifeOpsSchedulerTask(
  runtime: IAgentRuntime,
): Promise<UUID> {
  const tasks = await runtime.getTasks({
    agentIds: [runtime.agentId],
    tags: [...LIFEOPS_TASK_TAGS],
  });
  const existing = tasks.find(isLifeOpsSchedulerTask);
  const metadata = buildSchedulerMetadata(
    isRecord(existing?.metadata) ? existing.metadata : null,
  );
  if (existing?.id) {
    await runtime.updateTask(existing.id, {
      description: "Process life-ops reminders and scheduled workflows",
      metadata,
    });
    return existing.id;
  }

  const autonomy = runtime.getService("AUTONOMY") as AutonomyServiceLike | null;
  const roomId =
    autonomy?.getAutonomousRoomId?.() ??
    stringToUuid(`lifeops-scheduler-room-${runtime.agentId}`);

  return runtime.createTask({
    name: LIFEOPS_TASK_NAME,
    description: "Process life-ops reminders and scheduled workflows",
    roomId,
    tags: [...LIFEOPS_TASK_TAGS],
    metadata,
    dueAt: Date.now(),
  });
}

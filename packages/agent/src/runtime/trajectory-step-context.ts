import { AsyncLocalStorage } from "node:async_hooks";
import type { AgentRuntime } from "@elizaos/core";

type TrajectoryStepContext = {
  trajectoryStepId: string;
};

const trajectoryStepContext = new AsyncLocalStorage<
  TrajectoryStepContext | undefined
>();
const bridgedMessageServices = new WeakSet<object>();

export function withMiladyTrajectoryStep<T>(
  stepId: string | null | undefined,
  callback: () => T,
): T {
  const normalizedStepId =
    typeof stepId === "string" && stepId.trim().length > 0
      ? stepId.trim()
      : null;
  if (!normalizedStepId) {
    return callback();
  }

  return trajectoryStepContext.run(
    { trajectoryStepId: normalizedStepId },
    callback,
  );
}

export function getMiladyTrajectoryStepId(): string | null {
  const stepId = trajectoryStepContext.getStore()?.trajectoryStepId;
  return typeof stepId === "string" && stepId.trim().length > 0
    ? stepId.trim()
    : null;
}

function readTrajectoryStepIdFromMessage(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const metadata = (message as { metadata?: unknown }).metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const stepId = (metadata as { trajectoryStepId?: unknown }).trajectoryStepId;
  return typeof stepId === "string" && stepId.trim().length > 0
    ? stepId.trim()
    : null;
}

export function installMiladyMessageTrajectoryStepBridge(
  runtime: AgentRuntime,
): void {
  const messageService = runtime.messageService as
    | {
        handleMessage?: (...args: unknown[]) => unknown;
      }
    | null
    | undefined;

  if (
    !messageService ||
    typeof messageService.handleMessage !== "function" ||
    bridgedMessageServices.has(messageService as object)
  ) {
    return;
  }

  const originalHandleMessage = messageService.handleMessage.bind(messageService);
  messageService.handleMessage = ((...args: unknown[]) => {
    const message = args[1];
    return withMiladyTrajectoryStep(readTrajectoryStepIdFromMessage(message), () =>
      originalHandleMessage(...args),
    );
  }) as typeof messageService.handleMessage;

  bridgedMessageServices.add(messageService as object);
}

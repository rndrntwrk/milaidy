import { handleTrainingRoutes as handleAutonomousTrainingRoutes } from "@miladyai/agent/api/training-routes";
import type { AgentRuntime } from "@elizaos/core";
import { isLoopbackHost } from "@miladyai/agent";
import type { RouteHelpers, RouteRequestContext } from "@miladyai/agent/api";
import type { TrainingServiceLike } from "@miladyai/agent/api";

export type TrainingRouteHelpers = RouteHelpers;

export interface TrainingRouteContext extends RouteRequestContext {
  runtime: AgentRuntime | null;
  trainingService: TrainingServiceLike;
}

export async function handleTrainingRoutes(
  ctx: TrainingRouteContext,
): Promise<boolean> {
  return handleAutonomousTrainingRoutes({
    ...ctx,
    isLoopbackHost,
  });
}

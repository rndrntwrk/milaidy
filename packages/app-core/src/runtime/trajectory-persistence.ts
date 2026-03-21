import {
  getTrajectoryContext,
  runWithTrajectoryContext,
} from "@elizaos/core";
import {
  installDatabaseTrajectoryLogger as upstreamInstall,
} from "@elizaos/agent/runtime/trajectory-persistence";

export * from "@elizaos/agent/runtime/trajectory-persistence";

/**
 * Enhanced trajectory logger installer that also patches runtime.useModel
 * to ensure LLM calls are captured even when async context is lost.
 */
export async function installDatabaseTrajectoryLogger(runtime: any) {
  // Run the upstream installer first to set up the service and logLlmCall patch
  await upstreamInstall(runtime);

  const originalUseModel = runtime.useModel;
  if (typeof originalUseModel !== "function") return;

  // Patch useModel on the instance to ensure trajectory context
  runtime.useModel = async function (modelType: any, params: any, provider: any) {
    // Check if we already have a trajectory/step ID in context
    const context = getTrajectoryContext();
    if (context?.trajectoryStepId) {
      return originalUseModel.call(this, modelType, params, provider);
    }

    // No context found. Check if the trajectory logger is enabled.
    const trajLogger = runtime.getService("trajectory_logger");
    if (!trajLogger || !trajLogger.isEnabled()) {
      return originalUseModel.call(this, modelType, params, provider);
    }

    // We have a logger but no context. This is the common "missing LLM calls" case.
    // We'll start a "synthetic" step to capture this orphaned call.
    const stepId = await trajLogger.startTrajectory(runtime.agentId, {
      source: "chat-orphan",
      metadata: { autoPatch: true },
    });

    try {
      return await runWithTrajectoryContext({ trajectoryStepId: stepId }, () =>
        originalUseModel.call(this, modelType, params, provider)
      );
    } finally {
      // Mark the orphan trajectory as completed immediately
      await trajLogger.endTrajectory(stepId, "completed");
    }
  };
}

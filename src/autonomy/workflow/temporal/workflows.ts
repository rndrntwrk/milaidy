/**
 * Temporal workflow templates for the autonomy kernel.
 *
 * @module autonomy/workflow/temporal/workflows
 */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

type PlanExecutionInput = {
  plan: {
    id: string;
    steps: Array<{
      id: string;
      toolName: string;
      params: Record<string, unknown>;
      dependsOn?: string[];
    }>;
  };
  request: {
    agentId: string;
    source: string;
    sourceTrust: number;
  };
};

// Lazy-load Temporal workflow helpers to keep dependencies optional.
const { proxyActivities } = require("@temporalio/workflow") as {
  proxyActivities: (options: { startToCloseTimeout: string }) => {
    executePlanSteps: (input: PlanExecutionInput) => Promise<unknown>;
  };
};

const { executePlanSteps } = proxyActivities({
  startToCloseTimeout: "5 minutes",
});

/**
 * Plan execution workflow.
 *
 * Delegates to activities that perform the actual tool execution.
 */
export async function planExecution(input: PlanExecutionInput) {
  return executePlanSteps(input);
}

export type { PlanExecutionInput };

/**
 * Temporal activities for workflow execution.
 *
 * @module autonomy/workflow/temporal/activities
 */

import type { PlanExecutionInput } from "./workflows.js";

const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";
const API_BASE_URL =
  process.env.AUTONOMY_WORKFLOW_API_URL ?? `http://localhost:${API_PORT}`;
const API_KEY =
  process.env.AUTONOMY_WORKFLOW_API_KEY ?? process.env.AUTONOMY_API_KEY ?? "";

function joinUrl(base: string, path: string): string {
  if (base.endsWith("/")) base = base.slice(0, -1);
  if (!path.startsWith("/")) path = `/${path}`;
  return `${base}${path}`;
}

/**
 * Execute plan steps via the Milaidy API server.
 */
export async function executePlanSteps(
  input: PlanExecutionInput,
): Promise<unknown> {
  const url = joinUrl(API_BASE_URL, "/api/agent/autonomy/execute-plan");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ plan: input.plan, request: input.request }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `executePlanSteps failed (${response.status}): ${body || "unknown error"}`,
    );
  }

  const payload = (await response.json()) as {
    ok?: boolean;
    failedCount?: number;
    results?: unknown;
  };
  if (!payload || !Array.isArray(payload.results)) {
    throw new Error("executePlanSteps returned invalid response payload");
  }
  if (payload.ok === false) {
    throw new Error(
      `executePlanSteps reported failed steps (failedCount=${payload.failedCount ?? "unknown"})`,
    );
  }
  return payload.results;
}

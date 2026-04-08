import type { CoordinatorEvalChannel } from "../../packages/agent/src/evals/coordinator-scenarios.js";
import { runCoordinatorLiveScenarios } from "../../packages/agent/src/evals/coordinator-live-runner.js";

function takeFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function takeRepeatedFlag(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] !== name) continue;
    const next = process.argv[i + 1];
    if (next && !next.startsWith("--")) {
      values.push(next);
    }
  }
  return values;
}

try {
  const profile = takeFlag("--profile") as "smoke" | "core" | "full" | undefined;
  const outputRoot = takeFlag("--output");
  const batchId = takeFlag("--batch-id");
  const scenarioIds = [
    ...takeRepeatedFlag("--scenario"),
    ...(takeFlag("--scenarios")?.split(",").map((value) => value.trim()).filter(Boolean) ?? []),
  ];
  const channelValues = [
    ...takeRepeatedFlag("--channel"),
    ...(takeFlag("--channels")?.split(",").map((value) => value.trim()).filter(Boolean) ?? []),
  ] as CoordinatorEvalChannel[];

  const result = await runCoordinatorLiveScenarios({
    baseUrl: process.env.MILADY_BASE_URL,
    batchId,
    profile,
    outputRoot,
    ...(scenarioIds.length > 0 ? { scenarioIds } : {}),
    ...(channelValues.length > 0 ? { channels: channelValues } : {}),
  });

  const passed = result.runs.filter((run) => run.passed).length;
  const failed = result.runs.length - passed;
  console.log(
    JSON.stringify(
      {
        batchId: result.batchId,
        baseUrl: result.baseUrl,
        outputRoot: result.outputRoot,
        runCount: result.runs.length,
        passed,
        failed,
      },
      null,
      2,
    ),
  );

  process.exit(failed === 0 ? 0 : 1);
} catch (error) {
  console.error("[coordinator-scenario-live] FAIL");
  console.error(error);
  process.exit(1);
}

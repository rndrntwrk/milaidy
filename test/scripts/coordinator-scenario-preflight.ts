import { runCoordinatorPreflight } from "../../packages/agent/src/evals/coordinator-preflight.js";

try {
  const result = await runCoordinatorPreflight({
    baseUrl: process.env.MILADY_BASE_URL,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error("[coordinator-scenario-preflight] FAIL");
  console.error(error);
  process.exit(1);
}

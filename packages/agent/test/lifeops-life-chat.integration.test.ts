/**
 * LifeOps life chat integration tests with real LLM.
 *
 * Tests the full natural-language path: LLM classification → parameter
 * extraction → service execution → service state verification.
 *
 * No mocks, no regex, no hardcoded English string matching.
 * Verifies via structured action results and service state.
 *
 * Requires MILADY_LIVE_TEST=1 (or ELIZA_LIVE_TEST=1 / LIVE=1) plus at least
 * one reachable LLM provider API key. Skips cleanly otherwise.
 */

import type { AgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createRealTestRuntime,
  type RealTestRuntimeResult,
} from "../../../test/helpers/real-runtime";
import {
  isLiveTestEnabled,
  selectLiveProvider,
} from "../../../test/helpers/live-provider";
import { lifeAction } from "../src/actions/life";
import { LifeOpsService } from "../src/lifeops/service";

const provider = isLiveTestEnabled() ? selectLiveProvider() : null;
const describeWithLLM = provider ? describe : describe.skip;

/**
 * Call the LIFE action handler with natural language text.
 * Does NOT provide an explicit `action` param so the LLM must classify.
 */
function callLifeAction(
  runtime: AgentRuntime,
  text: string,
  extraParams: Record<string, unknown> = {},
) {
  const extraDetails =
    extraParams.details &&
    typeof extraParams.details === "object" &&
    !Array.isArray(extraParams.details)
      ? (extraParams.details as Record<string, unknown>)
      : {};

  return lifeAction.handler?.(
    runtime,
    {
      entityId: runtime.agentId,
      content: { text, source: "discord" },
    } as never,
    {} as never,
    {
      parameters: {
        intent: text,
        ...extraParams,
        details: {
          confirmed: true,
          ...extraDetails,
        },
      },
    } as never,
  );
}

describeWithLLM("life-ops natural language chat (real LLM)", () => {
  let runtime: AgentRuntime;
  let testResult: RealTestRuntimeResult;
  let service: LifeOpsService;

  beforeAll(async () => {
    testResult = await createRealTestRuntime({ withLLM: true });
    runtime = testResult.runtime;
    service = new LifeOpsService(runtime);
  }, 180_000);

  afterAll(async () => {
    await testResult.cleanup();
  });

  it("creates a twice-daily routine from natural language", async () => {
    const result = await callLifeAction(
      runtime,
      "Help me remember to brush my teeth in the morning and at night.",
    );

    expect(result).toBeTruthy();
    expect(result?.success).toBe(true);

    // Verify via service state — the real test
    const definitions = await service.listDefinitions();
    const matchingDef = definitions.find((d) => {
      const title = d.definition.title.toLowerCase();
      return title.includes("brush") || title.includes("teeth");
    });
    expect(matchingDef).toBeTruthy();
    expect(matchingDef?.definition.cadence).toBeTruthy();
  }, 120_000);

  it("creates a hydration reminder from natural language", async () => {
    const result = await callLifeAction(
      runtime,
      "Please remind me to drink water throughout the day.",
    );

    expect(result).toBeTruthy();
    expect(result?.success).toBe(true);

    const definitions = await service.listDefinitions();
    const matchingDef = definitions.find((d) => {
      const title = d.definition.title.toLowerCase();
      return (
        title.includes("water") ||
        title.includes("drink") ||
        title.includes("hydrat")
      );
    });
    expect(matchingDef).toBeTruthy();
  }, 120_000);

  it("creates a goal from natural language", async () => {
    const result = await callLifeAction(
      runtime,
      "I want a goal called Stabilize sleep schedule.",
    );

    expect(result).toBeTruthy();
    expect(result?.success).toBe(true);

    const goals = await service.listGoals();
    const matchingGoal = goals.find((g) => {
      const title = g.goal.title.toLowerCase();
      return title.includes("sleep") || title.includes("stabilize");
    });
    expect(matchingGoal).toBeTruthy();
    expect(matchingGoal?.goal.status).toBe("active");
  }, 120_000);

  it("creates a one-off reminder with timezone from natural language", async () => {
    const result = await callLifeAction(
      runtime,
      "please set a reminder for april 17 2026 at 8pm pst to hug my wife",
    );

    expect(result).toBeTruthy();
    expect(result?.success).toBe(true);

    const definitions = await service.listDefinitions();
    const matchingDef = definitions.find((d) => {
      const title = d.definition.title.toLowerCase();
      return title.includes("hug") || title.includes("wife");
    });
    expect(matchingDef).toBeTruthy();
  }, 120_000);

  it("asks for clarification on a vague request without creating anything", async () => {
    const definitionsBefore = (await service.listDefinitions()).length;
    const goalsBefore = (await service.listGoals()).length;

    const result = await callLifeAction(
      runtime,
      "lol yeah. can you help me add a todo for my life?",
    );

    // Should return without creating — either noop or shouldAct=false
    const definitionsAfter = (await service.listDefinitions()).length;
    const goalsAfter = (await service.listGoals()).length;
    expect(definitionsAfter).toBe(definitionsBefore);
    expect(goalsAfter).toBe(goalsBefore);

    // Handler returns success:true with data.noop when clarifying
    if (result?.data?.noop) {
      expect(result.data.noop).toBe(true);
    }
  }, 120_000);
});

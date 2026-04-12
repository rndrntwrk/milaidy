import type { IAgentRuntime } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ResearchTaskExecutor } from "./research-task-executor";
import { describeLLM } from "../../../../test/helpers/skip-without";
import { createRealTestRuntime } from "../../../../test/helpers/real-runtime";

// ---------------------------------------------------------------------------
// canHandle — pure logic, no LLM needed
// ---------------------------------------------------------------------------

describe("ResearchTaskExecutor.canHandle", () => {
  it("matches explicit research tasks and research verbs", () => {
    const executor = new ResearchTaskExecutor();
    const runtime = {} as IAgentRuntime;

    expect(
      executor.canHandle(
        {
          id: "task-1",
          type: "research",
          description: "compare providers",
        },
        runtime,
      ),
    ).toBe(true);

    expect(
      executor.canHandle(
        {
          id: "task-2",
          type: "",
          description: "investigate current benchmark tradeoffs",
        },
        runtime,
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// execute — real LLM calls for decomposition, answering, and synthesis
// ---------------------------------------------------------------------------

describeLLM("ResearchTaskExecutor.execute (real LLM)", () => {
  let runtime: Awaited<ReturnType<typeof createRealTestRuntime>>["runtime"];
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ runtime, cleanup } = await createRealTestRuntime({ withLLM: true }));
  }, 180_000);

  afterAll(async () => {
    await cleanup();
  });

  it("produces a research report from a real LLM", async () => {
    const executor = new ResearchTaskExecutor();
    const result = await executor.execute(
      {
        id: "task-3",
        type: "research",
        description: "What are the main differences between REST and GraphQL APIs?",
      },
      runtime as unknown as IAgentRuntime,
    );

    expect(result).toMatchObject({
      taskId: "task-3",
      success: true,
    });
    expect(typeof result.output).toBe("string");
    expect((result.output as string).length).toBeGreaterThan(20);
    expect(typeof result.durationMs).toBe("number");
  }, 120_000);

  it("handles a simple research question with synthesis", async () => {
    const executor = new ResearchTaskExecutor();
    const result = await executor.execute(
      {
        id: "task-4",
        type: "research",
        description: "Summarize the key benefits of TypeScript over JavaScript",
      },
      runtime as unknown as IAgentRuntime,
    );

    expect(result).toMatchObject({
      taskId: "task-4",
      success: true,
    });
    expect(typeof result.output).toBe("string");
    expect((result.output as string).length).toBeGreaterThan(10);
  }, 120_000);
});

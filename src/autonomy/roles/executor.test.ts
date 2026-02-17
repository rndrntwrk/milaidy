import { describe, expect, it, vi } from "vitest";
import type { ToolExecutionPipelineInterface } from "../workflow/types.js";
import { PipelineExecutor } from "./executor.js";

describe("PipelineExecutor", () => {
  it("delegates execution to the pipeline with original inputs", async () => {
    const expected = {
      requestId: "req-1",
      toolName: "PLAY_EMOTE",
      success: true,
      result: { ok: true },
      validation: { valid: true, errors: [] },
      durationMs: 5,
    };

    const pipeline: ToolExecutionPipelineInterface = {
      execute: vi.fn(async () => expected),
    };
    const executor = new PipelineExecutor(pipeline);

    const call = {
      tool: "PLAY_EMOTE",
      params: { emote: "wave" },
      source: "user" as const,
      requestId: "req-1",
    };
    const handler = vi.fn(async () => ({ result: { ok: true }, durationMs: 1 }));

    const result = await executor.execute(call, handler);

    expect(result).toEqual(expected);
    expect(pipeline.execute).toHaveBeenCalledWith(call, handler);
    expect(pipeline.execute).toHaveBeenCalledTimes(1);
  });

  it("propagates pipeline execution errors", async () => {
    const pipeline: ToolExecutionPipelineInterface = {
      execute: vi.fn(async () => {
        throw new Error("pipeline boom");
      }),
    };
    const executor = new PipelineExecutor(pipeline);

    await expect(
      executor.execute(
        {
          tool: "PLAY_EMOTE",
          params: { emote: "wave" },
          source: "user",
          requestId: "req-2",
        },
        vi.fn(async () => ({ result: {}, durationMs: 1 })),
      ),
    ).rejects.toThrow("pipeline boom");
  });
});

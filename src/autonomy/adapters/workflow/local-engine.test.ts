/**
 * Tests for LocalWorkflowEngine.
 */

import { describe, expect, it } from "vitest";
import { LocalWorkflowEngine } from "./local-engine.js";

describe("LocalWorkflowEngine", () => {
  it("executes a registered workflow with function steps", async () => {
    const engine = new LocalWorkflowEngine();
    engine.register({
      id: "double",
      name: "Doubler",
      steps: [
        (input: Record<string, unknown>) => ({ value: (input.value as number) * 2 }),
      ],
    });
    const result = await engine.execute("double", { value: 5 });
    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.output).toEqual({ value: 10 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("executes steps with execute() method", async () => {
    const engine = new LocalWorkflowEngine();
    engine.register({
      id: "add-one",
      name: "Adder",
      steps: [
        { execute: async (input: unknown) => ({ value: ((input as Record<string, number>).value) + 1 }) },
      ],
    });
    const result = await engine.execute("add-one", { value: 10 });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ value: 11 });
  });

  it("chains multiple steps sequentially", async () => {
    const engine = new LocalWorkflowEngine();
    engine.register({
      id: "pipeline",
      name: "Pipeline",
      steps: [
        (input: Record<string, unknown>) => ({ ...input, step1: true }),
        (input: Record<string, unknown>) => ({ ...input, step2: true }),
        (input: Record<string, unknown>) => ({ ...input, step3: true }),
      ],
    });
    const result = await engine.execute("pipeline", { initial: true });
    expect(result.success).toBe(true);
    expect(result.output).toEqual({ initial: true, step1: true, step2: true, step3: true });
  });

  it("returns error for unregistered workflow", async () => {
    const engine = new LocalWorkflowEngine();
    const result = await engine.execute("missing", {});
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.error).toContain("not registered");
  });

  it("catches step errors", async () => {
    const engine = new LocalWorkflowEngine();
    engine.register({
      id: "fail",
      name: "Failing",
      steps: [() => { throw new Error("step exploded"); }],
    });
    const result = await engine.execute("fail", {});
    expect(result.success).toBe(false);
    expect(result.status).toBe("failed");
    expect(result.deadLettered).toBe(true);
    expect(result.error).toBe("step exploded");
  });

  it("times out long-running workflows and dead-letters them", async () => {
    const engine = new LocalWorkflowEngine({ defaultTimeoutMs: 10 });
    engine.register({
      id: "slow",
      name: "Slow",
      steps: [
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          return { done: true };
        },
      ],
    });

    const result = await engine.execute("slow", {});
    expect(result.success).toBe(false);
    expect(result.status).toBe("timed_out");
    expect(result.deadLettered).toBe(true);
    expect(result.error).toContain("timed out");

    const deadLetters = await engine.getDeadLetters();
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0].workflowId).toBe("slow");
    expect(deadLetters[0].reason).toBe("timeout");
  });

  it("tracks execution results for getStatus", async () => {
    const engine = new LocalWorkflowEngine();
    engine.register({ id: "noop", name: "Noop", steps: [] });
    const result = await engine.execute("noop", {});
    const status = await engine.getStatus(result.executionId);
    expect(status).toEqual(result);
  });

  it("returns undefined for unknown execution ID", async () => {
    const engine = new LocalWorkflowEngine();
    expect(await engine.getStatus("nonexistent")).toBeUndefined();
  });

  it("lists registered workflows", async () => {
    const engine = new LocalWorkflowEngine();
    engine.register({ id: "a", name: "A", steps: [] });
    engine.register({ id: "b", name: "B", steps: [] });
    expect(engine.listWorkflows().sort()).toEqual(["a", "b"]);
  });

  it("close clears state", async () => {
    const engine = new LocalWorkflowEngine();
    engine.register({ id: "w", name: "W", steps: [] });
    await engine.execute("w", {});
    await engine.close();
    expect(engine.listWorkflows()).toEqual([]);
  });

  it("clearDeadLetters empties dead-letter queue", async () => {
    const engine = new LocalWorkflowEngine();
    engine.register({
      id: "explode",
      name: "Explode",
      steps: [() => { throw new Error("boom"); }],
    });

    await engine.execute("explode", {});
    const before = await engine.getDeadLetters();
    expect(before).toHaveLength(1);

    const cleared = await engine.clearDeadLetters();
    expect(cleared).toBe(1);
    expect(await engine.getDeadLetters()).toEqual([]);
  });
});

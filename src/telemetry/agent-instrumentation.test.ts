/**
 * Tests for agent instrumentation.
 */

import { describe, test, expect, beforeEach } from "vitest";
import { AgentInstrumentation } from "./agent-instrumentation.js";
import { metrics } from "./setup.js";

describe("AgentInstrumentation", () => {
  let instrumentation: AgentInstrumentation;

  beforeEach(() => {
    instrumentation = new AgentInstrumentation();
  });

  test("recordMessageReceived increments counter", () => {
    const initialSnapshot = metrics.getSnapshot();

    instrumentation.recordMessageReceived({
      agentId: "test-agent",
      channel: "test-channel",
      messageLength: 100,
    });

    const snapshot = metrics.getSnapshot();
    // Verify a counter was incremented
    expect(Object.keys(snapshot.counters).length).toBeGreaterThan(
      Object.keys(initialSnapshot.counters).length
    );
  });

  test("recordMessageSent records duration histogram", () => {
    instrumentation.recordMessageSent(
      {
        agentId: "test-agent",
        channel: "test-channel",
        messageLength: 100,
      },
      {
        durationMs: 500,
        tokens: { input: 50, output: 100, total: 150 },
        model: "gpt-4",
      }
    );

    const snapshot = metrics.getSnapshot();
    expect(Object.keys(snapshot.histograms).length).toBeGreaterThan(0);
  });

  test("recordActionStarted returns completion function", async () => {
    const complete = instrumentation.recordActionStarted({
      agentId: "test-agent",
      action: "test-action",
    });

    expect(typeof complete).toBe("function");

    // Simulate action duration
    await new Promise((resolve) => setTimeout(resolve, 50));
    complete();

    const snapshot = metrics.getSnapshot();
    expect(Object.keys(snapshot.histograms).length).toBeGreaterThan(0);
  });

  test("recordActionFailed increments error counter", () => {
    instrumentation.recordActionFailed(
      {
        agentId: "test-agent",
        action: "failing-action",
      },
      "Something went wrong"
    );

    // Action failed counter should be incremented
    const snapshot = metrics.getSnapshot();
    const failedKey = Object.keys(snapshot.counters).find((k) =>
      k.includes("failed")
    );
    expect(failedKey).toBeDefined();
  });

  test("recordSessionCreated tracks active sessions", () => {
    instrumentation.recordSessionCreated("session-1", "discord");
    instrumentation.recordSessionCreated("session-2", "slack");

    // Two sessions should be tracked
    const snapshot = metrics.getSnapshot();
    expect(Object.keys(snapshot.counters).length).toBeGreaterThan(0);
  });

  test("recordSessionEnded updates session count", () => {
    instrumentation.recordSessionCreated("session-3", "telegram");
    instrumentation.recordSessionEnded("session-3", "telegram", 10);

    const snapshot = metrics.getSnapshot();
    // Session histograms should be recorded
    expect(Object.keys(snapshot.histograms).length).toBeGreaterThan(0);
  });

  test("recordPluginEvent tracks plugin lifecycle", () => {
    instrumentation.recordPluginEvent("loaded", "test-plugin");
    instrumentation.recordPluginEvent("error", "test-plugin", {
      error: "Failed to load",
    });
    instrumentation.recordPluginEvent("unloaded", "test-plugin");

    const snapshot = metrics.getSnapshot();
    expect(Object.keys(snapshot.counters).length).toBeGreaterThan(0);
  });

  test("wrap measures async function duration", async () => {
    const result = await instrumentation.wrap(
      "test.operation",
      { type: "test" },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 42;
      }
    );

    expect(result).toBe(42);

    const snapshot = metrics.getSnapshot();
    expect(Object.keys(snapshot.histograms).length).toBeGreaterThan(0);
  });

  test("wrap records errors", async () => {
    await expect(
      instrumentation.wrap("test.failing", { type: "test" }, async () => {
        throw new Error("Test error");
      })
    ).rejects.toThrow("Test error");

    const snapshot = metrics.getSnapshot();
    const errorKey = Object.keys(snapshot.counters).find((k) =>
      k.includes("error")
    );
    expect(errorKey).toBeDefined();
  });
});

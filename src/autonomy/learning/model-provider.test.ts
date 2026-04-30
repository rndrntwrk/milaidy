import { describe, expect, it } from "vitest";
import { HttpModelProvider, StubModelProvider } from "./model-provider.js";

describe("StubModelProvider", () => {
  it("complete returns deterministic response", async () => {
    const provider = new StubModelProvider();
    const result = await provider.complete({
      systemPrompt: "You are helpful.",
      userPrompt: "Hello",
    });

    expect(result.text).toContain("stub response");
    expect(result.text).toContain("Hello");
    expect(result.model).toBe("stub");
    expect(result.tokenCount).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("complete uses canned responses when configured", async () => {
    const responses = new Map([["What is 2+2?", "4"]]);
    const provider = new StubModelProvider(responses);

    const result = await provider.complete({
      systemPrompt: "Math helper",
      userPrompt: "What is 2+2?",
    });
    expect(result.text).toBe("4");

    // Falls back to default for unknown prompts
    const fallback = await provider.complete({
      systemPrompt: "Math helper",
      userPrompt: "What is 3+3?",
    });
    expect(fallback.text).toContain("stub response");
  });

  it("score returns 0.5 baseline for all dimensions", async () => {
    const provider = new StubModelProvider();
    const result = await provider.score({
      prompt: "test prompt",
      response: "test response",
      rubric: "test rubric",
      dimensions: ["accuracy", "helpfulness", "safety"],
    });

    expect(result.overallScore).toBe(0.5);
    expect(result.dimensionScores["accuracy"]).toBe(0.5);
    expect(result.dimensionScores["helpfulness"]).toBe(0.5);
    expect(result.dimensionScores["safety"]).toBe(0.5);
    expect(result.model).toBe("stub");
    expect(result.explanation).toContain("Stub");
  });
});

describe("HttpModelProvider", () => {
  it("validates config — requires baseUrl", () => {
    expect(
      () => new HttpModelProvider({ baseUrl: "", model: "gpt-4" }),
    ).toThrow("baseUrl is required");
  });

  it("validates config — requires model", () => {
    expect(
      () =>
        new HttpModelProvider({
          baseUrl: "http://localhost:8080",
          model: "",
        }),
    ).toThrow("model is required");
  });

  it("constructs without error with valid config", () => {
    const provider = new HttpModelProvider({
      baseUrl: "http://localhost:8080",
      model: "gpt-4",
      apiKey: "test-key",
      timeoutMs: 5000,
    });
    expect(provider).toBeDefined();
  });

  it("handles timeout errors", async () => {
    const provider = new HttpModelProvider({
      baseUrl: "http://10.255.255.1", // non-routable IP for timeout
      model: "test",
      timeoutMs: 100,
    });

    await expect(
      provider.complete({
        systemPrompt: "test",
        userPrompt: "test",
      }),
    ).rejects.toThrow();
  });

  it("handles API errors", async () => {
    const provider = new HttpModelProvider({
      baseUrl: "http://localhost:1", // port 1 — should fail immediately
      model: "test",
      timeoutMs: 1000,
    });

    await expect(
      provider.complete({
        systemPrompt: "test",
        userPrompt: "test",
      }),
    ).rejects.toThrow();
  });
});

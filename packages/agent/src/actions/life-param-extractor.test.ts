import type { IAgentRuntime, State } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import {
  buildExtractionPrompt,
  extractTaskCreatePlanWithLlm,
  extractTaskParamsWithLlm,
} from "./life-param-extractor.js";

function makeRuntime(
  modelResponse?: string | Error | Array<string | Error>,
): IAgentRuntime {
  const responses = Array.isArray(modelResponse)
    ? modelResponse
    : [modelResponse ?? ""];
  const useModel = vi.fn();

  for (const response of responses) {
    if (response instanceof Error) {
      useModel.mockRejectedValueOnce(response);
    } else {
      useModel.mockResolvedValueOnce(response);
    }
  }

  return { useModel } as unknown as IAgentRuntime;
}

describe("extractTaskParamsWithLlm", () => {
  it("extracts structured params from a well-formed LLM JSON response", async () => {
    const llmResponse = JSON.stringify({
      mode: "create",
      response: null,
      requestKind: null,
      title: "Call mom",
      description: "Weekly call to check in with mom",
      cadenceKind: "weekly",
      windows: null,
      weekdays: [0],
      timeOfDay: "15:00",
      timeZone: null,
      everyMinutes: null,
      timesPerDay: null,
      priority: 3,
      durationMinutes: 30,
    });

    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "call mom every Sunday at 3pm",
      state: undefined,
    });

    expect(result).toMatchObject({
      requestKind: null,
      title: "Call mom",
      description: "Weekly call to check in with mom",
      cadenceKind: "weekly",
      weekdays: [0],
      timeOfDay: "15:00",
      priority: 3,
      durationMinutes: 30,
      windows: null,
      everyMinutes: null,
      timesPerDay: null,
    });
  });

  it("returns an empty structured result instead of null for empty intent", async () => {
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime("{}"),
      intent: "",
      state: undefined,
    });

    expect(result).toEqual({
      requestKind: null,
      title: null,
      description: null,
      cadenceKind: null,
      windows: null,
      weekdays: null,
      timeOfDay: null,
      timeZone: null,
      everyMinutes: null,
      timesPerDay: null,
      priority: null,
      durationMinutes: null,
    });
  });
});

describe("extractTaskCreatePlanWithLlm", () => {
  it("extracts a concrete create plan from the model", async () => {
    const llmResponse = JSON.stringify({
      mode: "create",
      response: null,
      requestKind: "reminder",
      title: "Brush teeth",
      description: null,
      cadenceKind: "daily",
      windows: ["morning", "night"],
      weekdays: null,
      timeOfDay: null,
      timeZone: null,
      everyMinutes: null,
      timesPerDay: null,
      priority: null,
      durationMinutes: 5,
    });

    const result = await extractTaskCreatePlanWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "remind me to brush teeth morning and night",
      state: undefined,
    });

    expect(result).toMatchObject({
      mode: "create",
      requestKind: "reminder",
      title: "Brush teeth",
      cadenceKind: "daily",
      windows: ["morning", "night"],
      durationMinutes: 5,
    });
  });

  it("repairs an invalid first model reply", async () => {
    const result = await extractTaskCreatePlanWithLlm({
      runtime: makeRuntime([
        "I think this should be a reminder.",
        JSON.stringify({
          mode: "create",
          response: null,
          requestKind: "reminder",
          title: "Hug my wife",
          description: null,
          cadenceKind: "once",
          windows: null,
          weekdays: null,
          timeOfDay: "20:00",
          timeZone: "America/Denver",
          everyMinutes: null,
          timesPerDay: null,
          priority: null,
          durationMinutes: 30,
        }),
      ]),
      intent: "set a reminder for april 17 at 8pm mountain time to hug my wife",
      state: undefined,
    });

    expect(result).toMatchObject({
      mode: "create",
      requestKind: "reminder",
      title: "Hug my wife",
      cadenceKind: "once",
      timeOfDay: "20:00",
      timeZone: "America/Denver",
    });
  });

  it("returns a structured respond plan when extraction is unavailable", async () => {
    const result = await extractTaskCreatePlanWithLlm({
      runtime: {} as IAgentRuntime,
      intent: "brush teeth daily",
      state: undefined,
    });

    expect(result).toEqual({
      mode: "respond",
      response:
        "Restate the reminder in one sentence with the task and timing.",
      requestKind: null,
      title: null,
      description: null,
      cadenceKind: null,
      windows: null,
      weekdays: null,
      timeOfDay: null,
      timeZone: null,
      everyMinutes: null,
      timesPerDay: null,
      priority: null,
      durationMinutes: null,
    });
  });

  it("keeps requestKind only when recent context supports it", async () => {
    const llmResponse = JSON.stringify({
      mode: "create",
      response: null,
      requestKind: "reminder",
      title: "Call mom",
      description: null,
      cadenceKind: "once",
      windows: null,
      weekdays: null,
      timeOfDay: "09:00",
      timeZone: null,
      everyMinutes: null,
      timesPerDay: null,
      priority: null,
      durationMinutes: null,
    });

    const result = await extractTaskCreatePlanWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "tomorrow at 9",
      state: {
        recentMessagesData: [
          { content: { text: "can you set a reminder for tomorrow?" } },
          { content: { text: "tomorrow at 9" } },
        ],
      } as unknown as State,
    });

    expect(result.requestKind).toBe("reminder");
  });
});

describe("buildExtractionPrompt", () => {
  it("includes the intent in the prompt", () => {
    const prompt = buildExtractionPrompt(
      "call mom every Sunday at 3pm",
      "user: call mom every Sunday at 3pm",
    );
    expect(prompt).toContain("call mom every Sunday at 3pm");
    expect(prompt).toContain(
      "Plan the next step for a LifeOps create_definition request.",
    );
    expect(prompt).toContain("Return ONLY valid JSON");
  });
});

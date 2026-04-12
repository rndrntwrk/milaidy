import type { AgentRuntime } from "@elizaos/core";
import { describe, expect, it } from "vitest";
import {
  buildExtractionPrompt,
  extractTaskCreatePlanWithLlm,
  extractTaskParamsWithLlm,
} from "./life-param-extractor.js";

function createRuntime(
  responses: Array<string>,
): AgentRuntime & {
  useModelCallCount: number;
} {
  const queue = [...responses];
  let useModelCallCount = 0;
  const useModel = async () => {
    useModelCallCount += 1;
    return queue.shift() ?? "";
  };
  return {
    useModel,
    get useModelCallCount() {
      return useModelCallCount;
    },
  } as unknown as AgentRuntime & { useModelCallCount: number };
}

describe("extractTaskParamsWithLlm", () => {
  it("extracts structured params for a weekly phone call", async () => {
    const runtime = createRuntime([
      JSON.stringify({
        mode: "create",
        response: null,
        requestKind: null,
        title: "Call mom",
        description: null,
        cadenceKind: "weekly",
        windows: null,
        weekdays: [0],
        timeOfDay: "15:00",
        timeZone: null,
        everyMinutes: null,
        timesPerDay: null,
        priority: null,
        durationMinutes: null,
      }),
    ]);

    const result = await extractTaskParamsWithLlm({
      runtime,
      intent: "call mom every Sunday at 3pm",
      state: undefined,
    });

    expect(result.title).toBe("Call mom");
    expect(result.cadenceKind).toBe("weekly");
    expect(result.weekdays).toEqual([0]);
    expect(result.timeOfDay).toBe("15:00");
  });

  it("repairs an invalid first response", async () => {
    const runtime = createRuntime([
      "not valid json",
      JSON.stringify({
        mode: "create",
        response: null,
        requestKind: "reminder",
        title: "Take vitamins",
        description: null,
        cadenceKind: "daily",
        windows: ["morning"],
        weekdays: null,
        timeOfDay: "08:00",
        timeZone: null,
        everyMinutes: null,
        timesPerDay: null,
        priority: null,
        durationMinutes: null,
      }),
    ]);

    const result = await extractTaskParamsWithLlm({
      runtime,
      intent: "remind me to take vitamins every morning at 8am",
      state: undefined,
    });

    expect(runtime.useModelCallCount).toBe(2);
    expect(result.title).toBe("Take vitamins");
    expect(result.requestKind).toBe("reminder");
    expect(result.cadenceKind).toBe("daily");
    expect(result.windows).toEqual(["morning"]);
    expect(result.timeOfDay).toBe("08:00");
  });

  it("returns null fields for empty intent", async () => {
    const runtime = createRuntime([]);
    const result = await extractTaskParamsWithLlm({
      runtime,
      intent: "",
      state: undefined,
    });

    expect(result.title).toBeNull();
    expect(result.cadenceKind).toBeNull();
    expect(result.timeOfDay).toBeNull();
  });
});

describe("extractTaskCreatePlanWithLlm", () => {
  it("produces a create plan for a brushing reminder", async () => {
    const runtime = createRuntime([
      JSON.stringify({
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
      }),
    ]);

    const result = await extractTaskCreatePlanWithLlm({
      runtime,
      intent: "remind me to brush teeth morning and night",
      state: undefined,
    });

    expect(result.mode).toBe("create");
    expect(result.title).toBe("Brush teeth");
    expect(result.requestKind).toBe("reminder");
    expect(result.windows).toEqual(["morning", "night"]);
  });

  it("produces a create plan for a one-off timed reminder", async () => {
    const runtime = createRuntime([
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
    ]);

    const result = await extractTaskCreatePlanWithLlm({
      runtime,
      intent: "set a reminder for april 17 at 8pm mountain time to hug my wife",
      state: undefined,
    });

    expect(result.mode).toBe("create");
    expect(result.title).toBe("Hug my wife");
    expect(result.timeOfDay).toBe("20:00");
    expect(result.timeZone).toBe("America/Denver");
  });

  it("returns a structured respond plan when runtime has no model", async () => {
    const result = await extractTaskCreatePlanWithLlm({
      runtime: {} as AgentRuntime,
      intent: "brush teeth daily",
      state: undefined,
    });

    expect(result.mode).toBe("respond");
    expect(result.response).toBe(
      "Restate the reminder in one sentence with the task and timing.",
    );
    expect(result.title).toBeNull();
  });

  it("returns a structured respond plan when the model stays invalid", async () => {
    const runtime = createRuntime(["<response></response>", "still not json"]);
    const result = await extractTaskCreatePlanWithLlm({
      runtime,
      intent: "remind me to stretch later",
      state: undefined,
    });

    expect(runtime.useModelCallCount).toBe(2);
    expect(result.mode).toBe("respond");
    expect(result.response).toBe(
      "Restate the reminder in one sentence with the task and timing.",
    );
    expect(result.title).toBeNull();
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

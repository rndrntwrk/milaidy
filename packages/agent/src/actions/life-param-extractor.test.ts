/**
 * Tests for the LifeOps structured parameter extractor.
 *
 * Verifies that extractTaskParamsWithLlm correctly parses LLM responses
 * into validated ExtractedTaskParams, and gracefully returns null on
 * failure or bad input.
 *
 * Run: bunx vitest run packages/agent/src/actions/life-param-extractor.test.ts
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildExtractionPrompt,
  type ExtractedTaskCreatePlan,
  type ExtractedTaskParams,
  type ExtractedUnlockMode,
  extractReminderIntensityWithLlm,
  extractTaskCreatePlanWithLlm,
  extractTaskParamsWithLlm,
  extractUnlockModeWithLlm,
} from "./life-param-extractor";

// ── Helpers ───────────────────────────────────────────

function makeRuntime(
  modelResponse?: string | Error,
): import("@elizaos/core").IAgentRuntime {
  const useModel =
    modelResponse instanceof Error
      ? vi.fn().mockRejectedValue(modelResponse)
      : vi.fn().mockResolvedValue(modelResponse ?? "");

  return { useModel } as unknown as import("@elizaos/core").IAgentRuntime;
}

// ── Tests ─────────────────────────────────────────────

describe("extractTaskParamsWithLlm", () => {
  it("extracts structured params from a well-formed LLM JSON response", async () => {
    const llmResponse = JSON.stringify({
      title: "Call mom",
      description: "Weekly call to check in with mom",
      cadenceKind: "weekly",
      windows: null,
      weekdays: [0],
      timeOfDay: "15:00",
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

    expect(result).not.toBeNull();
    const params = result as ExtractedTaskParams;
    expect(params.requestKind).toBeNull();
    expect(params.title).toBe("Call mom");
    expect(params.description).toBe("Weekly call to check in with mom");
    expect(params.cadenceKind).toBe("weekly");
    expect(params.weekdays).toEqual([0]);
    expect(params.timeOfDay).toBe("15:00");
    expect(params.priority).toBe(3);
    expect(params.durationMinutes).toBe(30);
    expect(params.windows).toBeNull();
    expect(params.everyMinutes).toBeNull();
    expect(params.timesPerDay).toBeNull();
  });

  it("extracts daily cadence with windows", async () => {
    const llmResponse = JSON.stringify({
      requestKind: "reminder",
      title: "Brush teeth",
      description: null,
      cadenceKind: "daily",
      windows: ["morning", "night"],
      weekdays: null,
      timeOfDay: null,
      everyMinutes: null,
      timesPerDay: null,
      priority: null,
      durationMinutes: 5,
    });

    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "remind me to brush teeth morning and night",
      state: undefined,
    });

    expect(result).not.toBeNull();
    const params = result as ExtractedTaskParams;
    expect(params.requestKind).toBe("reminder");
    expect(params.title).toBe("Brush teeth");
    expect(params.cadenceKind).toBe("daily");
    expect(params.windows).toEqual(["morning", "night"]);
    expect(params.durationMinutes).toBe(5);
  });

  it("extracts interval cadence", async () => {
    const llmResponse = JSON.stringify({
      title: "Drink water",
      description: null,
      cadenceKind: "interval",
      windows: null,
      weekdays: null,
      timeOfDay: null,
      everyMinutes: 120,
      timesPerDay: null,
      priority: null,
      durationMinutes: null,
    });

    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "drink water every 2 hours",
      state: undefined,
    });

    expect(result).not.toBeNull();
    const params = result as ExtractedTaskParams;
    expect(params.requestKind).toBeNull();
    expect(params.title).toBe("Drink water");
    expect(params.cadenceKind).toBe("interval");
    expect(params.everyMinutes).toBe(120);
  });

  it("returns null on empty intent", async () => {
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime("{}"),
      intent: "",
      state: undefined,
    });
    expect(result).toBeNull();
  });

  it("returns null on whitespace-only intent", async () => {
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime("{}"),
      intent: "   ",
      state: undefined,
    });
    expect(result).toBeNull();
  });

  it("returns null when runtime.useModel is not a function", async () => {
    const runtime = {} as import("@elizaos/core").IAgentRuntime;
    const result = await extractTaskParamsWithLlm({
      runtime,
      intent: "brush teeth daily",
      state: undefined,
    });
    expect(result).toBeNull();
  });

  it("returns null when the LLM throws an error", async () => {
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(new Error("model unavailable")),
      intent: "brush teeth daily",
      state: undefined,
    });
    expect(result).toBeNull();
  });

  it("returns null when LLM returns non-JSON garbage", async () => {
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime("I'm sorry, I can't help with that."),
      intent: "brush teeth daily",
      state: undefined,
    });
    expect(result).toBeNull();
  });

  it("returns null when LLM returns empty string", async () => {
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(""),
      intent: "brush teeth daily",
      state: undefined,
    });
    expect(result).toBeNull();
  });

  it("clamps priority to 1-5 range", async () => {
    const llmResponse = JSON.stringify({
      title: "Urgent task",
      priority: 10,
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "extremely urgent task",
      state: undefined,
    });

    expect(result).not.toBeNull();
    expect(result?.priority).toBe(5);
  });

  it("clamps priority minimum to 1", async () => {
    const llmResponse = JSON.stringify({
      title: "Low task",
      priority: -2,
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "low priority task",
      state: undefined,
    });

    expect(result).not.toBeNull();
    expect(result?.priority).toBe(1);
  });

  it("rejects invalid cadenceKind values", async () => {
    const llmResponse = JSON.stringify({
      title: "Task",
      cadenceKind: "biweekly",
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "do something biweekly",
      state: undefined,
    });

    expect(result).not.toBeNull();
    expect(result?.cadenceKind).toBeNull();
  });

  it("rejects weekdays outside 0-6 range", async () => {
    const llmResponse = JSON.stringify({
      title: "Task",
      cadenceKind: "weekly",
      weekdays: [0, 3, 8, -1],
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "do something on weird days",
      state: undefined,
    });

    expect(result).not.toBeNull();
    // Only 0 and 3 are valid
    expect(result?.weekdays).toEqual([0, 3]);
  });

  it("rejects non-HH:MM timeOfDay formats", async () => {
    const llmResponse = JSON.stringify({
      title: "Task",
      timeOfDay: "3pm",
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "do something at 3pm",
      state: undefined,
    });

    expect(result).not.toBeNull();
    expect(result?.timeOfDay).toBeNull();
  });

  it("accepts valid HH:MM timeOfDay", async () => {
    const llmResponse = JSON.stringify({
      title: "Task",
      timeOfDay: "8:30",
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "do something at 8:30",
      state: undefined,
    });

    expect(result).not.toBeNull();
    expect(result?.timeOfDay).toBe("8:30");
  });

  it("rejects negative everyMinutes", async () => {
    const llmResponse = JSON.stringify({
      title: "Task",
      everyMinutes: -30,
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "do something",
      state: undefined,
    });

    expect(result).not.toBeNull();
    expect(result?.everyMinutes).toBeNull();
  });

  it("rejects zero durationMinutes", async () => {
    const llmResponse = JSON.stringify({
      title: "Task",
      durationMinutes: 0,
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "do something",
      state: undefined,
    });

    expect(result).not.toBeNull();
    expect(result?.durationMinutes).toBeNull();
  });

  it("handles LLM response with extra prose wrapping JSON", async () => {
    const llmResponse =
      'Here is the extracted data:\n```json\n{"title":"Walk dog","cadenceKind":"daily","windows":["morning","evening"]}\n```';
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "walk the dog morning and evening",
      state: undefined,
    });

    // parseJSONObjectFromText should handle code-fenced JSON
    expect(result).not.toBeNull();
    expect(result?.title).toBe("Walk dog");
    expect(result?.cadenceKind).toBe("daily");
    expect(result?.windows).toEqual(["morning", "evening"]);
  });

  it("filters empty strings from windows array", async () => {
    const llmResponse = JSON.stringify({
      title: "Task",
      windows: ["morning", "", "  ", "night"],
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "do something",
      state: undefined,
    });

    expect(result).not.toBeNull();
    expect(result?.windows).toEqual(["morning", "night"]);
  });

  it("keeps alarm requestKind when alarm appears in the current request", async () => {
    const llmResponse = JSON.stringify({
      requestKind: "alarm",
      title: "Alarm",
      cadenceKind: "once",
      timeOfDay: "07:00",
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "set an alarm for 7 am",
      state: undefined,
    });

    expect(result?.requestKind).toBe("alarm");
  });

  it("keeps reminder requestKind when reminder appears in the recent six-message window", async () => {
    const llmResponse = JSON.stringify({
      requestKind: "reminder",
      title: "Call mom",
      cadenceKind: "once",
      timeOfDay: "09:00",
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "tomorrow at 9",
      state: {
        recentMessagesData: [
          { content: { text: "can you set a reminder for tomorrow?" } },
          { content: { text: "tomorrow at 9" } },
        ],
      } as unknown as import("@elizaos/core").State,
    });

    expect(result?.requestKind).toBe("reminder");
  });

  it("keeps reminder requestKind when the same reminder phrase repeats inside the recent six-message window", async () => {
    const llmResponse = JSON.stringify({
      requestKind: "reminder",
      title: "Call mom",
      cadenceKind: "once",
      timeOfDay: "09:00",
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "tomorrow at 9",
      state: {
        recentMessagesData: [
          { content: { text: "can you set a reminder for tomorrow?" } },
          { content: { text: "something else" } },
          { content: { text: "still thinking" } },
          { content: { text: "not that one" } },
          { content: { text: "another line" } },
          { content: { text: "almost there" } },
          { content: { text: "can you set a reminder for tomorrow?" } },
        ],
      } as unknown as import("@elizaos/core").State,
    });

    expect(result?.requestKind).toBe("reminder");
  });

  it("drops alarm requestKind when the current and recent context do not support it", async () => {
    const llmResponse = JSON.stringify({
      requestKind: "alarm",
      title: "Call mom",
      cadenceKind: "once",
      timeOfDay: "09:00",
    });
    const result = await extractTaskParamsWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "tomorrow at 9",
      state: {
        recentMessagesData: [{ content: { text: "set a timer for laundry" } }],
      } as unknown as import("@elizaos/core").State,
    });

    expect(result?.requestKind).toBeNull();
  });
});

describe("extractTaskCreatePlanWithLlm", () => {
  it("can choose reply-only mode for a vague todo request", async () => {
    const llmResponse = JSON.stringify({
      mode: "respond",
      response: "What do you want the todo to be, and when should it happen?",
      title: null,
      description: null,
      cadenceKind: null,
      windows: null,
      weekdays: null,
      timeOfDay: null,
      everyMinutes: null,
      timesPerDay: null,
      priority: null,
      durationMinutes: null,
    });

    const result = await extractTaskCreatePlanWithLlm({
      runtime: makeRuntime(llmResponse),
      intent: "lol yeah. can you help me add a todo for my life?",
      state: undefined,
    });

    expect(result).toEqual<ExtractedTaskCreatePlan>({
      mode: "respond",
      response: "What do you want the todo to be, and when should it happen?",
      requestKind: null,
      title: null,
      description: null,
      cadenceKind: null,
      windows: null,
      weekdays: null,
      timeOfDay: null,
      everyMinutes: null,
      timesPerDay: null,
      priority: null,
      durationMinutes: null,
    });
  });

  it("keeps the full turn available while extracting a concrete create plan", async () => {
    const llmResponse = JSON.stringify({
      mode: "create",
      response: null,
      title: "20 Situps + 20 Pushups",
      description: null,
      cadenceKind: "times_per_day",
      windows: ["morning", "night"],
      weekdays: null,
      timeOfDay: null,
      everyMinutes: null,
      timesPerDay: null,
      priority: null,
      durationMinutes: null,
    });

    const result = await extractTaskCreatePlanWithLlm({
      runtime: makeRuntime(llmResponse),
      intent:
        "i want to do 20 situps and pushups every morning and night\n\n[Language instruction: Reply in natural English unless the user explicitly requests another language.]",
      state: undefined,
    });

    expect(result?.mode).toBe("create");
    expect(result?.title).toBe("20 Situps + 20 Pushups");
    expect(result?.windows).toEqual(["morning", "night"]);
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

  it("includes all field descriptions", () => {
    const prompt = buildExtractionPrompt("test", "");
    expect(prompt).toContain("mode:");
    expect(prompt).toContain("response:");
    expect(prompt).toContain("requestKind:");
    expect(prompt).toContain("title:");
    expect(prompt).toContain("cadenceKind:");
    expect(prompt).toContain("windows:");
    expect(prompt).toContain("weekdays:");
    expect(prompt).toContain("timeOfDay:");
    expect(prompt).toContain("everyMinutes:");
    expect(prompt).toContain("timesPerDay:");
    expect(prompt).toContain("priority:");
    expect(prompt).toContain("durationMinutes:");
  });
});

// ── Reminder intensity extractor ─────────────────────

describe("extractReminderIntensityWithLlm", () => {
  it("returns a valid intensity from model output", async () => {
    const result = await extractReminderIntensityWithLlm({
      runtime: makeRuntime("minimal"),
      intent: "less reminders please",
    });
    expect(result).toBe("minimal");
  });

  it("trims and lowercases the model output", async () => {
    const result = await extractReminderIntensityWithLlm({
      runtime: makeRuntime("  Persistent  \n"),
      intent: "be more persistent",
    });
    expect(result).toBe("persistent");
  });

  it("returns high_priority_only", async () => {
    const result = await extractReminderIntensityWithLlm({
      runtime: makeRuntime("high_priority_only"),
      intent: "stop reminding me about low priority stuff",
    });
    expect(result).toBe("high_priority_only");
  });

  it("returns normal", async () => {
    const result = await extractReminderIntensityWithLlm({
      runtime: makeRuntime("normal"),
      intent: "resume normal reminders",
    });
    expect(result).toBe("normal");
  });

  it("returns null for invalid model output", async () => {
    const result = await extractReminderIntensityWithLlm({
      runtime: makeRuntime("medium"),
      intent: "medium reminders",
    });
    expect(result).toBeNull();
  });

  it("returns null when model returns prose instead of a value", async () => {
    const result = await extractReminderIntensityWithLlm({
      runtime: makeRuntime("I think the user wants fewer reminders."),
      intent: "less reminders",
    });
    expect(result).toBeNull();
  });

  it("returns null when useModel is not a function", async () => {
    const result = await extractReminderIntensityWithLlm({
      runtime: {} as import("@elizaos/core").IAgentRuntime,
      intent: "less reminders",
    });
    expect(result).toBeNull();
  });

  it("returns null when model throws", async () => {
    const result = await extractReminderIntensityWithLlm({
      runtime: makeRuntime(new Error("unavailable")),
      intent: "less reminders",
    });
    expect(result).toBeNull();
  });

  it("returns null for empty model output", async () => {
    const result = await extractReminderIntensityWithLlm({
      runtime: makeRuntime(""),
      intent: "less reminders",
    });
    expect(result).toBeNull();
  });
});

// ── Unlock mode extractor ────────────────────────────

describe("extractUnlockModeWithLlm", () => {
  it("extracts fixed_duration with durationMinutes", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: makeRuntime(
        '{"mode":"fixed_duration","durationMinutes":30}',
      ),
      intent: "unlock twitter for 30 minutes",
    });
    expect(result).toEqual<ExtractedUnlockMode>({
      mode: "fixed_duration",
      durationMinutes: 30,
    });
  });

  it("extracts until_manual_lock", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: makeRuntime('{"mode":"until_manual_lock"}'),
      intent: "unlock reddit until I say done",
    });
    expect(result).toEqual<ExtractedUnlockMode>({
      mode: "until_manual_lock",
    });
  });

  it("extracts until_callback with callbackKey", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: makeRuntime(
        '{"mode":"until_callback","callbackKey":"workout-done"}',
      ),
      intent: "unlock youtube until workout is done",
    });
    expect(result).toEqual<ExtractedUnlockMode>({
      mode: "until_callback",
      callbackKey: "workout-done",
    });
  });

  it("returns null for invalid mode", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: makeRuntime('{"mode":"forever"}'),
      intent: "unlock everything",
    });
    expect(result).toBeNull();
  });

  it("returns null for missing mode field", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: makeRuntime('{"durationMinutes":30}'),
      intent: "unlock twitter",
    });
    expect(result).toBeNull();
  });

  it("returns null when model returns non-JSON", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: makeRuntime("I think the user wants a fixed duration."),
      intent: "unlock twitter for a bit",
    });
    expect(result).toBeNull();
  });

  it("returns null when useModel is not a function", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: {} as import("@elizaos/core").IAgentRuntime,
      intent: "unlock twitter",
    });
    expect(result).toBeNull();
  });

  it("returns null when model throws", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: makeRuntime(new Error("unavailable")),
      intent: "unlock twitter",
    });
    expect(result).toBeNull();
  });

  it("strips empty callbackKey to undefined", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: makeRuntime(
        '{"mode":"until_callback","callbackKey":"   "}',
      ),
      intent: "unlock until something happens",
    });
    expect(result).toEqual<ExtractedUnlockMode>({
      mode: "until_callback",
    });
  });

  it("rejects negative durationMinutes", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: makeRuntime(
        '{"mode":"fixed_duration","durationMinutes":-10}',
      ),
      intent: "unlock twitter",
    });
    expect(result).toEqual<ExtractedUnlockMode>({
      mode: "fixed_duration",
    });
  });

  it("rejects zero durationMinutes", async () => {
    const result = await extractUnlockModeWithLlm({
      runtime: makeRuntime(
        '{"mode":"fixed_duration","durationMinutes":0}',
      ),
      intent: "unlock twitter",
    });
    expect(result).toEqual<ExtractedUnlockMode>({
      mode: "fixed_duration",
    });
  });
});

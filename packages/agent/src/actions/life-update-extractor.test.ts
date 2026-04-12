import { describe, expect, it, vi } from "vitest";
import { extractUpdateFieldsWithLlm } from "./life-update-extractor";

function makeRuntime(response: string) {
  return {
    useModel: vi.fn().mockResolvedValue(response),
  } as never;
}

describe("extractUpdateFieldsWithLlm", () => {
  it("extracts timeOfDay from a time-change request", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime('{"timeOfDay":"06:00"}'),
      intent: "change my workout to 6am",
      currentTitle: "Workout",
      currentCadenceKind: "daily",
      currentWindows: ["morning"],
    });
    expect(result).toEqual({
      title: null,
      cadenceKind: null,
      windows: null,
      weekdays: null,
      timeOfDay: "06:00",
      everyMinutes: null,
      priority: null,
      description: null,
    });
  });

  it("extracts cadenceKind from a schedule-type change", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime('{"cadenceKind":"weekly"}'),
      intent: "make it weekly instead of daily",
      currentTitle: "Stretch",
      currentCadenceKind: "daily",
      currentWindows: ["morning"],
    });
    expect(result?.cadenceKind).toBe("weekly");
    expect(result?.title).toBeNull();
  });

  it("extracts title for a rename request", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime('{"title":"Morning run"}'),
      intent: "rename to Morning run",
      currentTitle: "Workout",
      currentCadenceKind: "daily",
      currentWindows: ["morning"],
    });
    expect(result?.title).toBe("Morning run");
  });

  it("extracts multiple fields at once", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime(
        '{"cadenceKind":"weekly","weekdays":[1,3,5],"priority":3}',
      ),
      intent: "make it mon/wed/fri, priority 3",
      currentTitle: "Pushups",
      currentCadenceKind: "daily",
      currentWindows: ["morning"],
    });
    expect(result?.cadenceKind).toBe("weekly");
    expect(result?.weekdays).toEqual([1, 3, 5]);
    expect(result?.priority).toBe(3);
  });

  it("clamps priority to 1-5 range", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime('{"priority":10}'),
      intent: "set priority to 10",
      currentTitle: "Test",
      currentCadenceKind: "daily",
      currentWindows: [],
    });
    expect(result?.priority).toBe(5);
  });

  it("returns null when model returns unparseable text", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime("I cannot parse this into JSON"),
      intent: "change something",
      currentTitle: "Test",
      currentCadenceKind: "daily",
      currentWindows: [],
    });
    expect(result).toBeNull();
  });

  it("returns null when useModel is not available", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: {} as never,
      intent: "change something",
      currentTitle: "Test",
      currentCadenceKind: "daily",
      currentWindows: [],
    });
    expect(result).toBeNull();
  });

  it("returns null when model throws", async () => {
    const runtime = {
      useModel: vi.fn().mockRejectedValue(new Error("model unavailable")),
    } as never;
    const result = await extractUpdateFieldsWithLlm({
      runtime,
      intent: "change something",
      currentTitle: "Test",
      currentCadenceKind: "daily",
      currentWindows: [],
    });
    expect(result).toBeNull();
  });

  it("filters non-string values from windows array", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime('{"windows":["morning",123,"evening"]}'),
      intent: "change to morning and evening",
      currentTitle: "Test",
      currentCadenceKind: "daily",
      currentWindows: [],
    });
    expect(result?.windows).toEqual(["morning", "evening"]);
  });

  it("filters non-number values from weekdays array", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime('{"weekdays":[1,"two",3]}'),
      intent: "change to monday and wednesday",
      currentTitle: "Test",
      currentCadenceKind: "daily",
      currentWindows: [],
    });
    expect(result?.weekdays).toEqual([1, 3]);
  });

  it("trims whitespace from string fields", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime(
        '{"title":"  Morning run  ","description":"  new desc  ","timeOfDay":" 07:30 "}',
      ),
      intent: "rename and update",
      currentTitle: "Test",
      currentCadenceKind: "daily",
      currentWindows: [],
    });
    expect(result?.title).toBe("Morning run");
    expect(result?.description).toBe("new desc");
    expect(result?.timeOfDay).toBe("07:30");
  });

  it("ignores empty-string title and description", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime('{"title":"","description":"   "}'),
      intent: "change something",
      currentTitle: "Test",
      currentCadenceKind: "daily",
      currentWindows: [],
    });
    expect(result?.title).toBeNull();
    expect(result?.description).toBeNull();
  });

  it("rejects invalid cadenceKind values", async () => {
    const result = await extractUpdateFieldsWithLlm({
      runtime: makeRuntime('{"cadenceKind":"biweekly"}'),
      intent: "make it biweekly",
      currentTitle: "Workout",
      currentCadenceKind: "daily",
      currentWindows: ["morning"],
    });
    expect(result?.cadenceKind).toBeNull();
  });

  it("accepts valid cadenceKind values", async () => {
    for (const kind of [
      "once",
      "daily",
      "weekly",
      "times_per_day",
      "interval",
    ]) {
      const result = await extractUpdateFieldsWithLlm({
        runtime: makeRuntime(JSON.stringify({ cadenceKind: kind })),
        intent: `make it ${kind}`,
        currentTitle: "Test",
        currentCadenceKind: "daily",
        currentWindows: [],
      });
      expect(result?.cadenceKind).toBe(kind);
    }
  });
});

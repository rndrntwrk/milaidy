import { describe, expect, it } from "vitest";
import type { ActivityProfile } from "../activity-profile/types.js";
import {
  computeAdaptiveWindowPolicy,
  DEFAULT_TIME_WINDOWS,
  windowPolicyMatchesDefaults,
} from "./defaults.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal `ActivityProfile`-compatible fragment for testing. */
function profileWith(
  overrides: Partial<
    Pick<
      ActivityProfile,
      | "typicalWakeHour"
      | "typicalFirstActiveHour"
      | "typicalLastActiveHour"
      | "typicalSleepHour"
    >
  >,
): Pick<
  ActivityProfile,
  | "typicalWakeHour"
  | "typicalFirstActiveHour"
  | "typicalLastActiveHour"
  | "typicalSleepHour"
> {
  return {
    typicalWakeHour: null,
    typicalFirstActiveHour: null,
    typicalLastActiveHour: null,
    typicalSleepHour: null,
    ...overrides,
  };
}

function findWindow(
  policy: ReturnType<typeof computeAdaptiveWindowPolicy>,
  name: string,
) {
  return policy.windows.find((w) => w.name === name);
}

// ---------------------------------------------------------------------------
// windowPolicyMatchesDefaults
// ---------------------------------------------------------------------------

describe("windowPolicyMatchesDefaults", () => {
  it("returns true for a policy whose windows equal the defaults", () => {
    const policy = {
      timezone: "America/New_York",
      windows: DEFAULT_TIME_WINDOWS.map((w) => ({ ...w })),
    };
    expect(windowPolicyMatchesDefaults(policy)).toBe(true);
  });

  it("returns false when a window has been customized", () => {
    const policy = {
      timezone: "America/New_York",
      windows: DEFAULT_TIME_WINDOWS.map((w) => ({ ...w })),
    };
    policy.windows[0].startMinute = 6 * 60; // 6 AM instead of 5 AM
    expect(windowPolicyMatchesDefaults(policy)).toBe(false);
  });

  it("returns false for null / undefined", () => {
    expect(windowPolicyMatchesDefaults(null)).toBe(false);
    expect(windowPolicyMatchesDefaults(undefined)).toBe(false);
  });

  it("returns false when the number of windows differs", () => {
    const policy = {
      timezone: "UTC",
      windows: [DEFAULT_TIME_WINDOWS[0]],
    };
    expect(windowPolicyMatchesDefaults(policy)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeAdaptiveWindowPolicy
// ---------------------------------------------------------------------------

describe("computeAdaptiveWindowPolicy", () => {
  it("returns defaults unchanged when no rhythm data is present", () => {
    const profile = profileWith({});
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    for (let i = 0; i < DEFAULT_TIME_WINDOWS.length; i++) {
      expect(result.windows[i].name).toBe(DEFAULT_TIME_WINDOWS[i].name);
      expect(result.windows[i].startMinute).toBe(
        DEFAULT_TIME_WINDOWS[i].startMinute,
      );
      expect(result.windows[i].endMinute).toBe(
        DEFAULT_TIME_WINDOWS[i].endMinute,
      );
    }
  });

  it("shifts morning start to 30 min before typicalWakeHour", () => {
    const profile = profileWith({ typicalWakeHour: 10 });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    const morning = findWindow(result, "morning")!;
    // 10 - 0.5 = 9.5 => 9h 30m => 570 min
    expect(morning.startMinute).toBe(570);
  });

  it("uses typicalFirstActiveHour when typicalWakeHour is absent", () => {
    const profile = profileWith({ typicalFirstActiveHour: 8 });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    const morning = findWindow(result, "morning")!;
    // 8 - 0.5 = 7.5 => 450 min
    expect(morning.startMinute).toBe(450);
  });

  it("floors morning start at 4 AM (240 minutes)", () => {
    const profile = profileWith({ typicalWakeHour: 3 });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    const morning = findWindow(result, "morning")!;
    expect(morning.startMinute).toBe(4 * 60); // 240
  });

  it("caps morning end at 14:00 (840 minutes)", () => {
    const profile = profileWith({ typicalWakeHour: 10 });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    const morning = findWindow(result, "morning")!;
    // start = 570, +5h = 870 but cap at 840
    expect(morning.endMinute).toBe(840);
  });

  it("chains afternoon from morning end and caps at 20:00", () => {
    const profile = profileWith({ typicalWakeHour: 10 });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    const afternoon = findWindow(result, "afternoon")!;
    expect(afternoon.startMinute).toBe(840); // morning end
    // 840 + 300 = 1140, cap at 1200
    expect(afternoon.endMinute).toBe(1140);
  });

  it("shifts evening end using typicalLastActiveHour + 1 hour", () => {
    const profile = profileWith({
      typicalWakeHour: 7,
      typicalLastActiveHour: 23,
    });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    const evening = findWindow(result, "evening")!;
    // 23 + 1 = 24 => 1440 min
    expect(evening.endMinute).toBe(1440);
  });

  it("shifts evening end using typicalSleepHour when available", () => {
    const profile = profileWith({
      typicalWakeHour: 7,
      typicalSleepHour: 25,
      typicalLastActiveHour: 22,
    });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    const evening = findWindow(result, "evening")!;
    // typicalSleepHour takes priority: 25 * 60 = 1500
    expect(evening.endMinute).toBe(1500);
  });

  it("caps evening end at 28:00 (1680 minutes)", () => {
    const profile = profileWith({
      typicalWakeHour: 7,
      typicalSleepHour: 30,
    });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    const evening = findWindow(result, "evening")!;
    expect(evening.endMinute).toBe(1680);
  });

  it("sets night from evening end to morning start + 24h", () => {
    const profile = profileWith({ typicalWakeHour: 10 });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    const evening = findWindow(result, "evening")!;
    const night = findWindow(result, "night")!;
    const morning = findWindow(result, "morning")!;
    expect(night.startMinute).toBe(evening.endMinute);
    expect(night.endMinute).toBe(morning.startMinute + 24 * 60);
  });

  it("produces contiguous non-overlapping windows", () => {
    const profile = profileWith({
      typicalWakeHour: 9,
      typicalLastActiveHour: 22,
    });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    for (let i = 1; i < result.windows.length; i++) {
      expect(result.windows[i].startMinute).toBe(
        result.windows[i - 1].endMinute,
      );
    }
    for (const w of result.windows) {
      expect(w.endMinute).toBeGreaterThan(w.startMinute);
    }
  });

  it("guards evening end > evening start when sleep data is very early", () => {
    const profile = profileWith({
      typicalWakeHour: 12,
      typicalSleepHour: 16,
    });
    const result = computeAdaptiveWindowPolicy(profile, "UTC");
    const afternoon = findWindow(result, "afternoon")!;
    const evening = findWindow(result, "evening")!;
    // afternoon ends at min(14*60+300, 1200) = 1140 => evening start = 1140
    // typicalSleepHour 16 => 960 < 1140, so guard kicks in: 1140 + 60 = 1200
    expect(evening.startMinute).toBe(afternoon.endMinute);
    expect(evening.endMinute).toBeGreaterThan(evening.startMinute);
  });
});

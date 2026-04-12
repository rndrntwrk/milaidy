import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const childProcessMocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  execFileAsync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: childProcessMocks.execFile,
}));

vi.mock("node:util", async () => {
  const actual = await vi.importActual<typeof import("node:util")>("node:util");
  return {
    ...actual,
    promisify: vi.fn((value: unknown) => {
      if (value === childProcessMocks.execFile) {
        return childProcessMocks.execFileAsync;
      }
      return actual.promisify(value as never);
    }),
  };
});

import {
  buildNativeAppleReminderMetadata,
  createNativeAppleReminderLikeItem,
  NATIVE_APPLE_REMINDER_METADATA_KEY,
  readNativeAppleReminderMetadata,
} from "./apple-reminders";

describe("apple reminders helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    childProcessMocks.execFileAsync.mockResolvedValue({
      stdout: "native-reminder-1\n",
      stderr: "",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("round-trips native Apple reminder metadata", () => {
    const metadata = buildNativeAppleReminderMetadata({
      kind: "alarm",
      source: "llm",
    });

    expect(metadata).toEqual({
      [NATIVE_APPLE_REMINDER_METADATA_KEY]: {
        kind: "alarm",
        provider: "apple_reminders",
        source: "llm",
      },
    });
    expect(readNativeAppleReminderMetadata(metadata)).toEqual({
      kind: "alarm",
      provider: "apple_reminders",
      source: "llm",
    });
  });

  it("rejects malformed native Apple reminder metadata", () => {
    expect(readNativeAppleReminderMetadata(null)).toBeNull();
    expect(
      readNativeAppleReminderMetadata({
        [NATIVE_APPLE_REMINDER_METADATA_KEY]: {
          kind: "timer",
          provider: "apple_reminders",
          source: "llm",
        },
      }),
    ).toBeNull();
  });

  it.runIf(process.platform === "darwin")(
    "validates missing titles before invoking osascript",
    async () => {
      const result = await createNativeAppleReminderLikeItem({
        kind: "reminder",
        title: "   ",
        dueAt: "2026-04-12T15:00:00.000Z",
      });

      expect(result).toEqual({
        ok: false,
        provider: "apple_reminders",
        error: "Reminder title is required.",
        skippedReason: "missing_title",
      });
      expect(childProcessMocks.execFileAsync).not.toHaveBeenCalled();
    },
  );

  it.runIf(process.platform === "darwin")(
    "validates dueAt before invoking osascript",
    async () => {
      const result = await createNativeAppleReminderLikeItem({
        kind: "alarm",
        title: "Alarm",
        dueAt: "not-a-date",
      });

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({
        provider: "apple_reminders",
        skippedReason: "invalid_due_at",
      });
      expect(childProcessMocks.execFileAsync).not.toHaveBeenCalled();
    },
  );

  it.runIf(process.platform === "darwin")(
    "invokes osascript with reminder date parts and notes",
    async () => {
      const result = await createNativeAppleReminderLikeItem({
        kind: "reminder",
        title: "Call mom",
        dueAt: "2026-04-12T15:00:00.000Z",
        notes: "Call her before lunch.",
        originalIntent: "set a reminder for tomorrow at 9am to call mom",
      });

      expect(result).toEqual({
        ok: true,
        provider: "apple_reminders",
        reminderId: "native-reminder-1",
      });
      expect(childProcessMocks.execFileAsync).toHaveBeenCalledWith(
        "/usr/bin/osascript",
        expect.arrayContaining([
          "-e",
          'tell application "Reminders"',
          "Call mom",
          expect.stringContaining("Call her before lunch."),
          "2026",
          "4",
          "12",
          "32400",
          "5",
        ]),
        { timeout: 30_000 },
      );
    },
  );

  it.runIf(process.platform !== "darwin")(
    "returns unsupported_platform away from macOS",
    async () => {
      const result = await createNativeAppleReminderLikeItem({
        kind: "reminder",
        title: "Call mom",
        dueAt: "2026-04-12T15:00:00.000Z",
      });

      expect(result).toEqual({
        ok: false,
        provider: "apple_reminders",
        error: "Native Apple reminders are only available on macOS.",
        skippedReason: "unsupported_platform",
      });
      expect(childProcessMocks.execFileAsync).not.toHaveBeenCalled();
    },
  );
});

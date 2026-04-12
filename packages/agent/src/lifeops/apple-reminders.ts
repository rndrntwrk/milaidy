import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const NATIVE_APPLE_REMINDER_METADATA_KEY = "nativeAppleReminder";

export type NativeAppleReminderLikeKind = "alarm" | "reminder";

type NativeAppleReminderMetadata = {
  kind: NativeAppleReminderLikeKind;
  provider: "apple_reminders";
  source: "heuristic" | "llm";
};

export function buildNativeAppleReminderMetadata(args: {
  kind: NativeAppleReminderLikeKind;
  source: "heuristic" | "llm";
}): Record<string, unknown> {
  return {
    [NATIVE_APPLE_REMINDER_METADATA_KEY]: {
      kind: args.kind,
      provider: "apple_reminders",
      source: args.source,
    } satisfies NativeAppleReminderMetadata,
  };
}
export function readNativeAppleReminderMetadata(
  metadata: unknown,
): NativeAppleReminderMetadata | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const value = (metadata as Record<string, unknown>)[
    NATIVE_APPLE_REMINDER_METADATA_KEY
  ];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const kind =
    record.kind === "alarm" || record.kind === "reminder"
      ? record.kind
      : null;
  const source =
    record.source === "llm" || record.source === "heuristic"
      ? record.source
      : null;
  if (kind === null || source === null) {
    return null;
  }
  return {
    kind,
    provider: "apple_reminders",
    source,
  };
}

type ReminderDateParts = {
  day: number;
  month: number;
  secondsSinceMidnight: number;
  year: number;
};

function reminderDateParts(dueAt: string): ReminderDateParts | null {
  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    secondsSinceMidnight:
      date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds(),
  };
}

function buildReminderNotes(args: {
  kind: NativeAppleReminderLikeKind;
  notes?: string | null;
  originalIntent?: string | null;
}): string {
  const parts = [
    args.notes?.trim() ?? "",
    args.originalIntent?.trim() ? `Milady request: ${args.originalIntent.trim()}` : "",
  ].filter((value) => value.length > 0);
  if (parts.length > 0) {
    return parts.join("\n\n");
  }
  return args.kind === "alarm"
    ? "Created by Milady as an alarm-like reminder."
    : "Created by Milady.";
}

function appleReminderPriority(kind: NativeAppleReminderLikeKind): number {
  return kind === "alarm" ? 1 : 5;
}

const APPLE_REMINDER_SCRIPT = [
  "on run argv",
  "set reminderTitle to item 1 of argv",
  "set reminderNotes to item 2 of argv",
  "set dueYear to (item 3 of argv) as integer",
  "set dueMonth to (item 4 of argv) as integer",
  "set dueDay to (item 5 of argv) as integer",
  "set dueSeconds to (item 6 of argv) as integer",
  "set reminderPriority to (item 7 of argv) as integer",
  'tell application "Reminders"',
  "set targetList to default list",
  "set newReminder to missing value",
  "tell targetList",
  "set newReminder to make new reminder with properties {name:reminderTitle}",
  "end tell",
  'if reminderNotes is not "" then set body of newReminder to reminderNotes',
  "if dueYear > 0 then",
  "set dueDate to current date",
  "set year of dueDate to dueYear",
  "set month of dueDate to dueMonth",
  "set day of dueDate to dueDay",
  "set time of dueDate to dueSeconds",
  "set due date of newReminder to dueDate",
  "set remind me date of newReminder to dueDate",
  "end if",
  "if reminderPriority > 0 then set priority of newReminder to reminderPriority",
  "return id of newReminder",
  "end tell",
  "end run",
];

export async function createNativeAppleReminderLikeItem(args: {
  kind: NativeAppleReminderLikeKind;
  title: string;
  dueAt: string;
  notes?: string | null;
  originalIntent?: string | null;
}): Promise<
  | {
      ok: true;
      provider: "apple_reminders";
      reminderId: string | null;
    }
  | {
      ok: false;
      provider: "apple_reminders";
      error: string;
      skippedReason:
        | "unsupported_platform"
        | "invalid_due_at"
        | "missing_title"
        | "native_error";
    }
> {
  if (process.platform !== "darwin") {
    return {
      ok: false,
      provider: "apple_reminders",
      error: "Native Apple reminders are only available on macOS.",
      skippedReason: "unsupported_platform",
    };
  }

  const title = args.title.trim();
  if (!title) {
    return {
      ok: false,
      provider: "apple_reminders",
      error: "Reminder title is required.",
      skippedReason: "missing_title",
    };
  }

  const parts = reminderDateParts(args.dueAt);
  if (!parts) {
    return {
      ok: false,
      provider: "apple_reminders",
      error: `Invalid dueAt for native Apple reminder: ${args.dueAt}`,
      skippedReason: "invalid_due_at",
    };
  }

  try {
    const { stdout } = await execFileAsync(
      "/usr/bin/osascript",
      APPLE_REMINDER_SCRIPT.flatMap((line) => ["-e", line]).concat([
        title,
        buildReminderNotes(args),
        String(parts.year),
        String(parts.month),
        String(parts.day),
        String(parts.secondsSinceMidnight),
        String(appleReminderPriority(args.kind)),
      ]),
      { timeout: 30_000 },
    );
    return {
      ok: true,
      provider: "apple_reminders",
      reminderId: typeof stdout === "string" ? stdout.trim() || null : null,
    };
  } catch (error) {
    const details =
      typeof error === "object" && error && "stderr" in error
        ? String((error as { stderr?: unknown }).stderr ?? "")
        : error instanceof Error
          ? error.message
          : String(error);
    return {
      ok: false,
      provider: "apple_reminders",
      error: details || "Failed to create native Apple reminder.",
      skippedReason: "native_error",
    };
  }
}

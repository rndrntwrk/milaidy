import type { IAgentRuntime } from "@elizaos/core";
import { ModelType, parseJSONObjectFromText } from "@elizaos/core";

const VALID_CADENCE_KINDS = new Set([
  "once",
  "daily",
  "weekly",
  "times_per_day",
  "interval",
]);

export interface ExtractedUpdateFields {
  title: string | null;
  cadenceKind: string | null;
  windows: string[] | null;
  weekdays: number[] | null;
  timeOfDay: string | null;
  everyMinutes: number | null;
  priority: number | null;
  description: string | null;
}

/**
 * When the LLM caller passes an update_definition intent without pre-parsed
 * structured fields (e.g. "change my workout to 6am"), this function asks
 * a large text model to extract which fields the user actually wants to change.
 *
 * Returns null when the model is unavailable or the response is unparseable.
 */
export async function extractUpdateFieldsWithLlm(args: {
  runtime: IAgentRuntime;
  intent: string;
  currentTitle: string;
  currentCadenceKind: string;
  currentWindows: string[];
}): Promise<ExtractedUpdateFields | null> {
  const { runtime, intent, currentTitle, currentCadenceKind, currentWindows } =
    args;
  if (typeof runtime.useModel !== "function") return null;

  const prompt = [
    "The user wants to update an existing task/habit. Extract ONLY the fields they want to change.",
    "Return null for fields the user did NOT mention changing.",
    "",
    `Current task: "${currentTitle}"`,
    `Current schedule: ${currentCadenceKind}, windows: [${currentWindows.join(", ")}]`,
    "",
    "Return JSON with these fields (null = no change requested):",
    "- title: new name if user wants to rename",
    "- cadenceKind: new schedule type if changing (once/daily/weekly/times_per_day/interval)",
    "- windows: new time windows if changing (morning/afternoon/evening/night)",
    "- weekdays: new weekday numbers if changing (0=Sun..6=Sat)",
    '- timeOfDay: new specific time like "06:00" if changing time',
    "- everyMinutes: new interval if changing",
    "- priority: new priority 1-5 if changing",
    "- description: new description if changing",
    "",
    "Examples:",
    '  "change workout to 6am" -> {"timeOfDay":"06:00"}',
    '  "make it weekly instead of daily" -> {"cadenceKind":"weekly"}',
    '  "rename to Morning run" -> {"title":"Morning run"}',
    "",
    "Return ONLY valid JSON. No prose.",
    "",
    `User request: ${JSON.stringify(intent)}`,
  ].join("\n");

  try {
    const result = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
    const raw = typeof result === "string" ? result : "";
    const parsed = parseJSONObjectFromText(raw);
    if (!parsed) return null;

    return {
      title:
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim()
          : null,
      cadenceKind:
        typeof parsed.cadenceKind === "string" &&
        VALID_CADENCE_KINDS.has(parsed.cadenceKind)
          ? parsed.cadenceKind
          : null,
      windows: Array.isArray(parsed.windows)
        ? parsed.windows.filter((w: unknown) => typeof w === "string")
        : null,
      weekdays: Array.isArray(parsed.weekdays)
        ? parsed.weekdays.filter((d: unknown) => typeof d === "number")
        : null,
      timeOfDay:
        typeof parsed.timeOfDay === "string" ? parsed.timeOfDay.trim() : null,
      everyMinutes:
        typeof parsed.everyMinutes === "number" ? parsed.everyMinutes : null,
      priority:
        typeof parsed.priority === "number"
          ? Math.max(1, Math.min(5, parsed.priority))
          : null,
      description:
        typeof parsed.description === "string" && parsed.description.trim()
          ? parsed.description.trim()
          : null,
    };
  } catch {
    return null;
  }
}

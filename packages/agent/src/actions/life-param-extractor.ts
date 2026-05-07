/**
 * LLM planning and structured extraction for LifeOps task creation.
 *
 * Performs a second LLM call (TEXT_LARGE) after operation classification
 * to decide whether the current create_definition request should:
 * 1. create or preview a LifeOps item now, or
 * 2. reply/clarify without creating anything yet.
 *
 * When creation is appropriate, the same response also extracts structured
 * fields — title, cadence, priority, time-of-day, etc. — from natural
 * language so life.ts can avoid lossy regex-only fallbacks.
 *
 * Returns null on any failure so callers can safely fall back to the
 * non-LLM path.
 */

import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import { ModelType, parseJSONObjectFromText } from "@elizaos/core";
import { recentConversationTexts } from "./life-recent-context.js";
import { resolveContextWindow } from "./lifeops-extraction-config.js";

// ── Types ─────────────────────────────────────────────

export interface ExtractedTaskParams {
  requestKind: "alarm" | "reminder" | null;
  title: string | null;
  description: string | null;
  cadenceKind:
    | "once"
    | "daily"
    | "weekly"
    | "times_per_day"
    | "interval"
    | null;
  windows: string[] | null;
  weekdays: number[] | null;
  timeOfDay: string | null;
  everyMinutes: number | null;
  timesPerDay: number | null;
  priority: number | null;
  durationMinutes: number | null;
}

export interface ExtractedTaskCreatePlan extends ExtractedTaskParams {
  mode: "create" | "respond" | null;
  response: string | null;
}

const VALID_CADENCE_KINDS = new Set([
  "once",
  "daily",
  "weekly",
  "times_per_day",
  "interval",
]);
const VALID_REQUEST_KINDS = new Set(["alarm", "reminder"]);
const VALID_CREATE_PLAN_MODES = new Set(["create", "respond"]);
const ALARM_CONTEXT_RE = /\b(alarm|wake(?:-|\s)?up|wake me up)\b/i;
const REMINDER_CONTEXT_RE =
  /\b(remind(?: me)?|reminder|set (?:a )?reminder|create (?:a )?reminder|nudge me|ping me)\b/i;
const REQUEST_KIND_VALIDATION_WINDOW = 6;

// ── Prompt ────────────────────────────────────────────

function buildExtractionPrompt(
  intent: string,
  recentConversation: string,
): string {
  return [
    "Plan the next step for a LifeOps create_definition request.",
    "Use the full current user request plus recent conversation.",
    "Do not strip acknowledgements, fillers, or language-footer text. Interpret the whole request in context.",
    "Return ONLY a JSON object with these fields (use null for unknown):",
    "",
    '- mode: "create" when the request is specific enough to create or preview a LifeOps item now, "respond" when you should reply without creating anything yet',
    "- response: short natural-language reply when mode is respond, otherwise null",
    '- requestKind: "alarm" when this is explicitly an alarm/wake-up request, "reminder" when it is explicitly a reminder request, otherwise null',
    "- title: short name for the task (2-5 words)",
    "- description: brief description if the user provided context",
    '- cadenceKind: one of "once", "daily", "weekly", "times_per_day", "interval"',
    '- windows: array of time windows like ["morning", "night", "afternoon", "evening"]',
    "- weekdays: array of weekday numbers (0=Sun, 1=Mon, ..., 6=Sat) for weekly tasks",
    '- timeOfDay: specific time in HH:MM 24h format like "15:00" or "08:30" if mentioned',
    '- everyMinutes: interval in minutes for recurring tasks (e.g., 120 for "every 2 hours")',
    '- timesPerDay: number of times per day if mentioned (e.g., 4 for "four times a day")',
    "- priority: 1-5 (1=low, 5=critical) based on urgency/importance language",
    "- durationMinutes: how long the activity takes if mentioned",
    "",
    "Examples:",
    '  "remind me to brush teeth morning and night" -> {"mode":"create","response":null,"requestKind":"reminder","title":"Brush teeth","cadenceKind":"daily","windows":["morning","night"],"description":null,"weekdays":null,"timeOfDay":null,"everyMinutes":null,"timesPerDay":null,"priority":null,"durationMinutes":null}',
    '  "call mom every Sunday at 3pm" -> {"mode":"create","response":null,"requestKind":null,"title":"Call mom","cadenceKind":"weekly","weekdays":[0],"timeOfDay":"15:00","description":null,"windows":null,"everyMinutes":null,"timesPerDay":null,"priority":null,"durationMinutes":null}',
    '  "drink water every 2 hours" -> {"mode":"create","response":null,"requestKind":null,"title":"Drink water","cadenceKind":"interval","everyMinutes":120,"description":null,"windows":null,"weekdays":null,"timeOfDay":null,"timesPerDay":null,"priority":null,"durationMinutes":null}',
    '  "workout 4 times a week" -> {"mode":"create","response":null,"requestKind":null,"title":"Workout","cadenceKind":"weekly","weekdays":[1,3,5,6],"timesPerDay":null,"description":null,"windows":null,"timeOfDay":null,"everyMinutes":null,"priority":null,"durationMinutes":null}',
    '  "set an alarm for 7 am" -> {"mode":"create","response":null,"requestKind":"alarm","title":"Alarm","cadenceKind":"once","timeOfDay":"07:00","description":null,"windows":null,"weekdays":null,"everyMinutes":null,"timesPerDay":null,"priority":null,"durationMinutes":null}',
    '  "set a reminder for tomorrow at 9am to call mom" -> {"mode":"create","response":null,"requestKind":"reminder","title":"Call mom","cadenceKind":"once","timeOfDay":"09:00","description":null,"windows":null,"weekdays":null,"everyMinutes":null,"timesPerDay":null,"priority":null,"durationMinutes":null}',
    '  "lol yeah. can you help me add a todo for my life?" -> {"mode":"respond","response":"What do you want the todo to be, and when should it happen?","requestKind":null,"title":null,"description":null,"cadenceKind":null,"windows":null,"weekdays":null,"timeOfDay":null,"everyMinutes":null,"timesPerDay":null,"priority":null,"durationMinutes":null}',
    "",
    "Use recent conversation only to resolve short follow-ups. Do not emit requestKind='alarm' or requestKind='reminder' unless the current request or recent conversation explicitly supports it.",
    "If the user has not actually specified the todo/habit yet, choose mode='respond' and ask a concise clarifying question instead of inventing a task.",
    "",
    "Return ONLY valid JSON. No prose.",
    "",
    `User request: ${JSON.stringify(intent)}`,
    `Recent conversation: ${JSON.stringify(recentConversation)}`,
  ].join("\n");
}

// ── Validators ────────────────────────────────────────

function validateTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateRequestKind(
  value: unknown,
): ExtractedTaskParams["requestKind"] {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return VALID_REQUEST_KINDS.has(normalized)
    ? (normalized as ExtractedTaskParams["requestKind"])
    : null;
}

function validateCreatePlanMode(
  value: unknown,
): ExtractedTaskCreatePlan["mode"] {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return VALID_CREATE_PLAN_MODES.has(normalized)
    ? (normalized as ExtractedTaskCreatePlan["mode"])
    : null;
}

function validateResponse(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validateCadenceKind(
  value: unknown,
): ExtractedTaskParams["cadenceKind"] {
  if (typeof value !== "string") return null;
  return VALID_CADENCE_KINDS.has(value)
    ? (value as ExtractedTaskParams["cadenceKind"])
    : null;
}

function validateWindows(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const filtered = value.filter(
    (w: unknown) => typeof w === "string" && w.trim().length > 0,
  );
  return filtered.length > 0 ? filtered : null;
}

function validateWeekdays(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const filtered = value.filter(
    (d: unknown) =>
      typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
  );
  return filtered.length > 0 ? filtered : null;
}

function validateTimeOfDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  // Accept HH:MM format
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed;
  return null;
}

function validatePositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function validatePriority(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(5, Math.round(value)));
}

function validateRequestKindAgainstContext(
  value: ExtractedTaskParams["requestKind"],
  currentText: string,
  recentWindow: string[],
): ExtractedTaskParams["requestKind"] {
  if (!value) {
    return null;
  }
  const texts = [currentText, ...recentWindow];
  const pattern = value === "alarm" ? ALARM_CONTEXT_RE : REMINDER_CONTEXT_RE;
  return texts.some((text) => pattern.test(text)) ? value : null;
}

function buildTaskCreatePlan(args: {
  parsed: Record<string, unknown>;
  intent: string;
  recentWindow: string[];
}): ExtractedTaskCreatePlan {
  const { parsed, intent, recentWindow } = args;
  return {
    mode: validateCreatePlanMode(parsed.mode),
    response: validateResponse(parsed.response),
    requestKind: validateRequestKindAgainstContext(
      validateRequestKind(parsed.requestKind),
      intent,
      recentWindow.slice(-REQUEST_KIND_VALIDATION_WINDOW),
    ),
    title: validateTitle(parsed.title),
    description: validateTitle(parsed.description),
    cadenceKind: validateCadenceKind(parsed.cadenceKind),
    windows: validateWindows(parsed.windows),
    weekdays: validateWeekdays(parsed.weekdays),
    timeOfDay: validateTimeOfDay(parsed.timeOfDay),
    everyMinutes: validatePositiveNumber(parsed.everyMinutes),
    timesPerDay: validatePositiveNumber(parsed.timesPerDay),
    priority: validatePriority(parsed.priority),
    durationMinutes: validatePositiveNumber(parsed.durationMinutes),
  };
}

// ── Extractor ─────────────────────────────────────────

/**
 * Call the LLM to plan whether a create_definition request should create
 * a task draft now or reply first, while also extracting structured
 * task parameters for the create path.
 */
export async function extractTaskCreatePlanWithLlm(args: {
  runtime: IAgentRuntime;
  intent: string;
  state: State | undefined;
  message?: Memory;
}): Promise<ExtractedTaskCreatePlan | null> {
  const { runtime, intent } = args;

  if (typeof runtime.useModel !== "function") {
    return null;
  }
  if (!intent || intent.trim().length === 0) {
    return null;
  }

  const recentWindow = await recentConversationTexts({
    runtime,
    message: args.message,
    state: args.state,
    limit: Math.max(resolveContextWindow(), REQUEST_KIND_VALIDATION_WINDOW),
  });
  const prompt = buildExtractionPrompt(
    intent,
    recentWindow.slice(-resolveContextWindow()).join("\n"),
  );

  try {
    const result = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
    const raw = typeof result === "string" ? result : "";
    const parsed = parseJSONObjectFromText(raw);
    if (!parsed) return null;

    return buildTaskCreatePlan({
      parsed,
      intent,
      recentWindow,
    });
  } catch {
    return null;
  }
}

export async function extractTaskParamsWithLlm(args: {
  runtime: IAgentRuntime;
  intent: string;
  state: State | undefined;
  message?: Memory;
}): Promise<ExtractedTaskParams | null> {
  const plan = await extractTaskCreatePlanWithLlm(args);
  if (!plan) {
    return null;
  }

  const { mode: _mode, response: _response, ...params } = plan;
  return params;
}

// ── Reminder intensity extractor ─────────────────────

/** Valid LifeOpsReminderIntensity values (mirrors shared/contracts/lifeops). */
const VALID_REMINDER_INTENSITIES = new Set([
  "minimal",
  "normal",
  "persistent",
  "high_priority_only",
]);

/**
 * Ask a small text model to classify the user's intent into a reminder
 * intensity value.  Returns null when the model is unavailable, throws,
 * or returns an unrecognised value — callers should fall back to regex.
 */
export async function extractReminderIntensityWithLlm(args: {
  runtime: IAgentRuntime;
  intent: string;
}): Promise<"minimal" | "normal" | "persistent" | "high_priority_only" | null> {
  if (typeof args.runtime.useModel !== "function") return null;

  const prompt = [
    "The user is requesting a change to their reminder frequency.",
    "Classify into exactly one of these values:",
    "- minimal: user wants fewer/less reminders",
    "- normal: user wants default/standard reminders",
    "- persistent: user wants more/frequent reminders",
    "- high_priority_only: user wants to pause or mute most reminders",
    "",
    "Return ONLY the value. No JSON, no prose.",
    "",
    `User said: ${JSON.stringify(args.intent)}`,
  ].join("\n");

  try {
    const result = await args.runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
    });
    const raw = typeof result === "string" ? result.trim().toLowerCase() : "";
    return VALID_REMINDER_INTENSITIES.has(raw)
      ? (raw as "minimal" | "normal" | "persistent" | "high_priority_only")
      : null;
  } catch {
    return null;
  }
}

// ── Website unlock mode extractor ────────────────────

/** Valid unlock modes (mirrors shared/contracts/lifeops). */
const VALID_UNLOCK_MODES = new Set([
  "fixed_duration",
  "until_manual_lock",
  "until_callback",
]);

export interface ExtractedUnlockMode {
  mode: "fixed_duration" | "until_manual_lock" | "until_callback";
  callbackKey?: string;
  durationMinutes?: number;
}

/**
 * Ask a small text model to determine the website unlock mode from the
 * user's intent.  Returns null when the model is unavailable, throws, or
 * returns an invalid value — callers should fall back to regex.
 */
export async function extractUnlockModeWithLlm(args: {
  runtime: IAgentRuntime;
  intent: string;
}): Promise<ExtractedUnlockMode | null> {
  if (typeof args.runtime.useModel !== "function") return null;

  const prompt = [
    "The user is configuring website blocking. Determine the unlock mode:",
    "- fixed_duration: unlock for a specific time period (extract durationMinutes)",
    "- until_manual_lock: unlock until user manually re-locks",
    "- until_callback: unlock until a specific event/task completes (extract callbackKey as a slug)",
    "",
    "Return JSON: { mode, durationMinutes?, callbackKey? }",
    "Return null if no unlock mode is detectable.",
    "",
    `User said: ${JSON.stringify(args.intent)}`,
  ].join("\n");

  try {
    const result = await args.runtime.useModel(ModelType.TEXT_SMALL, {
      prompt,
    });
    const raw = typeof result === "string" ? result : "";
    const parsed = parseJSONObjectFromText(raw);
    if (!parsed?.mode) return null;
    if (!VALID_UNLOCK_MODES.has(parsed.mode as string)) return null;
    return {
      mode: parsed.mode as ExtractedUnlockMode["mode"],
      callbackKey:
        typeof parsed.callbackKey === "string"
          ? parsed.callbackKey.trim() || undefined
          : undefined,
      durationMinutes:
        typeof parsed.durationMinutes === "number" &&
        Number.isFinite(parsed.durationMinutes) &&
        parsed.durationMinutes > 0
          ? parsed.durationMinutes
          : undefined,
    };
  } catch {
    return null;
  }
}

// Re-export for tests
export { buildExtractionPrompt };

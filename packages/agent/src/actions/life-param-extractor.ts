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
import {
  extractExplicitTimeZoneFromText,
  normalizeExplicitTimeZoneToken,
} from "./timezone-normalization.js";

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
  timeZone: string | null;
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
const TIME_OF_DAY_TOKEN_RE =
  /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/i;
const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};
const FILLER_PREFIX_RE =
  /^(?:lol|lmao|yeah|yep|yup|uh|uhh|um|umm|hmm|actually|please|can you|could you|would you|help me|hey|so|just)\b[\s,!.-]*/i;

// ── Prompt ────────────────────────────────────────────

function buildExtractionPrompt(
  intent: string,
  recentConversation: string,
): string {
  return [
    "Plan the next step for a LifeOps create_definition request.",
    "Use the full current user request plus recent conversation.",
    "The user may speak informally, formally, code-switched, or in another language.",
    "Do not strip acknowledgements, fillers, or language-footer text. Interpret the whole request in context.",
    "Infer practical reminder windows from natural phrases when needed: wake up or before work -> morning, lunch or after lunch -> afternoon, after work or dinner -> evening, before bed or before sleep -> night.",
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
    '- timeZone: IANA timezone like "America/Denver" when the user explicitly gives one',
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
    '  "make sure I brush my teeth when I wake up and before bed" -> {"mode":"create","response":null,"requestKind":"reminder","title":"Brush teeth","cadenceKind":"daily","windows":["morning","night"],"description":null,"weekdays":null,"timeOfDay":null,"timeZone":null,"everyMinutes":null,"timesPerDay":null,"priority":null,"durationMinutes":null}',
    '  "recuérdame cepillarme los dientes por la mañana y por la noche" -> {"mode":"create","response":null,"requestKind":"reminder","title":"Brush teeth","cadenceKind":"daily","windows":["morning","night"],"description":null,"weekdays":null,"timeOfDay":null,"timeZone":null,"everyMinutes":null,"timesPerDay":null,"priority":null,"durationMinutes":null}',
    '  "set a reminder for april 17 at 8pm mountain time to hug my wife" -> {"mode":"create","response":null,"requestKind":"reminder","title":"Hug my wife","cadenceKind":"once","timeOfDay":"20:00","timeZone":"America/Denver","description":null,"windows":null,"weekdays":null,"everyMinutes":null,"timesPerDay":null,"priority":null,"durationMinutes":30}',
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

function validateTimeZone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return normalizeExplicitTimeZoneToken(value);
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

function normalizeIntent(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripLanguageAugmentation(value: string): string {
  return value
    .replace(/\[\s*language instruction:[^\]]*\]/gi, " ")
    .replace(/\[\s*system(?: note| instruction)?:[^\]]*\]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function normalizeTitleCandidate(value: string): string | null {
  const cleaned = stripLanguageAugmentation(value)
    .replace(FILLER_PREFIX_RE, "")
    .replace(
      /\b(?:set|add|create|make|help me add|help me create|help me make|please set|please add)\b/gi,
      " ",
    )
    .replace(
      /\b(?:an?|the)\s+(?:alarm|reminder|todo|task|habit|routine)\b/gi,
      " ",
    )
    .replace(
      /\b(?:every|each)\b.+$/i,
      " ",
    )
    .replace(
      /\b(?:daily|weekly|in the morning|in the afternoon|in the evening|at night|morning and night|night and morning|when i wake up|before bed|before sleep|with breakfast|with lunch|with dinner|throughout the day|twice a week|twice a day|on weekdays?|on weekends?)\b.+$/i,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return null;
  }
  return titleCase(cleaned.split(/\s+/).slice(0, 5).join(" "));
}

function parseTimeOfDay(value: string): string | null {
  const normalized = normalizeIntent(value).toLowerCase();
  const hhmmMatch = normalized.match(/\b(\d{1,2}):(\d{2})\b/);
  if (hhmmMatch) {
    const hour = Number(hhmmMatch[1]);
    const minute = Number(hhmmMatch[2]);
    if (
      Number.isFinite(hour) &&
      Number.isFinite(minute) &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute < 60
    ) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }

  const token = normalized.match(TIME_OF_DAY_TOKEN_RE)?.[1]?.toLowerCase() ?? "";
  if (!token) {
    return null;
  }
  if (token === "noon") {
    return "12:00";
  }
  if (token === "midnight") {
    return "00:00";
  }
  const clockMatch = token.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!clockMatch) {
    return null;
  }
  const rawHour = Number(clockMatch[1]);
  const minute = Number(clockMatch[2] ?? "0");
  if (!Number.isFinite(rawHour) || !Number.isFinite(minute) || minute >= 60) {
    return null;
  }
  const meridiem = clockMatch[3];
  const hour =
    meridiem === "am"
      ? rawHour % 12
      : rawHour % 12 === 0
        ? 12
        : (rawHour % 12) + 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function countTimeTokens(value: string): number {
  return (
    value.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/gi)
      ?.length ?? 0
  );
}

function extractExplicitTimeZone(value: string): string | null {
  return extractExplicitTimeZoneFromText(value);
}

function extractWindowsFromIntent(value: string): string[] | null {
  const lower = normalizeIntent(value).toLowerCase();
  const windows = [
    /\bmornings?\b|\bwake(?:\s|-)?up\b|\bwake up\b|\bbreakfast\b|\bbefore (?:work|i start work|starting work)\b/.test(
      lower,
    )
      ? "morning"
      : null,
    /\bafternoons?\b|\blunch\b|\bafter lunch\b|\bmid(?:\s|-)?day\b|\bduring the day\b/.test(
      lower,
    )
      ? "afternoon"
      : null,
    /\bevenings?\b|\bafter work\b|\bdinner\b/.test(lower)
      ? "evening"
      : null,
    /\bnights?\b|\bbedtime\b|\bbefore bed\b|\bbefore sleep\b|\bbefore i sleep\b|\bbefore (?:going to bed|i go to bed)\b/.test(
      lower,
    )
      ? "night"
      : null,
  ].filter((window): window is string => window !== null);
  return windows.length > 0 ? [...new Set(windows)] : null;
}

function extractWeekdaysFromIntent(value: string): number[] | null {
  const lower = normalizeIntent(value).toLowerCase();
  if (/\bweekdays?\b|\bworkdays?\b/.test(lower)) {
    return [1, 2, 3, 4, 5];
  }
  if (/\bweekends?\b/.test(lower)) {
    return [0, 6];
  }
  const matches = [
    ...lower.matchAll(
      /\b(?:every|each)\s+(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\b/g,
    ),
  ]
    .map((match) => WEEKDAY_MAP[match[1]])
    .filter((weekday): weekday is number => weekday !== undefined);
  return matches.length > 0 ? [...new Set(matches)] : null;
}

function looksLikeShortTimedFollowup(value: string): boolean {
  const normalized = normalizeIntent(value);
  return (
    normalized.length <= 32 &&
    (TIME_OF_DAY_TOKEN_RE.test(normalized) ||
      /\b(today|tomorrow|tonight)\b/i.test(normalized))
  );
}

function findValidatedRequestKind(
  currentText: string,
  recentWindow: string[],
): ExtractedTaskParams["requestKind"] {
  if (ALARM_CONTEXT_RE.test(currentText)) {
    return "alarm";
  }
  if (REMINDER_CONTEXT_RE.test(currentText)) {
    return "reminder";
  }
  if (!looksLikeShortTimedFollowup(currentText)) {
    return null;
  }
  for (const text of [...recentWindow]
    .slice(-REQUEST_KIND_VALIDATION_WINDOW)
    .reverse()) {
    if (ALARM_CONTEXT_RE.test(text)) {
      return "alarm";
    }
    if (REMINDER_CONTEXT_RE.test(text)) {
      return "reminder";
    }
  }
  return null;
}

function extractHeuristicTitle(args: {
  intent: string;
  requestKind: ExtractedTaskParams["requestKind"];
}): string | null {
  const normalized = normalizeIntent(stripLanguageAugmentation(args.intent));
  const lower = normalized.toLowerCase();

  if (args.requestKind === "alarm") {
    return /\bwake(?:-|\s)?up\b|\bwake me up\b/.test(lower)
      ? "Wake up"
      : "Alarm";
  }

  const toActionMatch = normalized.match(/\bto\s+(.+)$/i);
  if (toActionMatch?.[1]) {
    return normalizeTitleCandidate(toActionMatch[1]);
  }

  const reminderActionMatch = normalized.match(
    /\b(?:remind(?: me)?|set (?:a )?reminder|create (?:a )?reminder)\b\s+(.+)$/i,
  );
  if (reminderActionMatch?.[1]) {
    return normalizeTitleCandidate(reminderActionMatch[1]);
  }

  const genericActionMatch = normalized.match(
    /\b(?:do|call|text|email|submit|pay|take|drink|brush|stretch|work out|workout|hug|shave|shower|floss|meditat(?:e|ion)|invisalign)\b.*$/i,
  );
  if (genericActionMatch?.[0]) {
    return normalizeTitleCandidate(genericActionMatch[0]);
  }

  return null;
}

function inferDurationMinutes(value: string): number | null {
  const lower = normalizeIntent(value).toLowerCase();
  if (/\b(call|phone|check in|hug|meet)\b/.test(lower)) {
    return 30;
  }
  return null;
}

function isVagueCreateRequest(value: string): boolean {
  const lower = normalizeIntent(stripLanguageAugmentation(value)).toLowerCase();
  const asksToCreate =
    /\b(add|create|make|set up|set|help me add|help me create|help me make)\b/.test(
      lower,
    );
  const mentionsThing =
    /\b(todo|task|habit|routine|reminder|alarm)\b/.test(lower);
  const hasSpecificAction =
    /\bto\s+[a-z]/.test(lower) ||
    /\b\d+\s+[a-z]/.test(lower) ||
    /\b(call|email|text|submit|pay|brush|stretch|drink|take)\b/.test(lower);
  const hasSchedule =
    /\b(every|daily|weekly|tomorrow|today|tonight|morning|night|afternoon|evening)\b/.test(
      lower,
    ) || TIME_OF_DAY_TOKEN_RE.test(lower);

  return asksToCreate && mentionsThing && !hasSpecificAction && !hasSchedule;
}

function buildHeuristicTaskCreatePlan(args: {
  intent: string;
  recentWindow: string[];
}): ExtractedTaskCreatePlan | null {
  const intent = normalizeIntent(args.intent);
  if (!intent) {
    return null;
  }

  const requestKind = findValidatedRequestKind(intent, args.recentWindow);
  const timeOfDay = parseTimeOfDay(intent);
  const timeZone = extractExplicitTimeZone(intent);
  const weekdays = extractWeekdaysFromIntent(intent);
  const windows = extractWindowsFromIntent(intent);
  const lower = intent.toLowerCase();
  const timeTokenCount = countTimeTokens(intent);
  const oneOffReminderLike =
    requestKind !== null &&
    (timeOfDay !== null ||
      /\b(today|tomorrow|tonight)\b/.test(lower) ||
      /\bfor\s+(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\b/.test(
        lower,
      ));
  const explicitTimeDrivenSchedule =
    timeOfDay !== null &&
    timeTokenCount === 1 &&
    (/\b(every day|daily|each day)\b/.test(lower) ||
      (weekdays?.length ?? 0) > 0);

  if (isVagueCreateRequest(intent)) {
    return {
      mode: "respond",
      response: "What do you want the todo to be, and when should it happen?",
      requestKind,
      title: null,
      description: null,
      cadenceKind: null,
      windows: null,
      weekdays: null,
      timeOfDay: null,
      timeZone,
      everyMinutes: null,
      timesPerDay: null,
      priority: null,
      durationMinutes: null,
    };
  }

  const title = extractHeuristicTitle({ intent, requestKind });
  const intervalMatch = lower.match(/\bevery\s+(\d+)\s*(hours?|minutes?)\b/);
  const timesPerDayMatch =
    lower.match(
      /\b(one|two|three|four|five|six|\d+)\s*(?:x|times?)\s*(?:a|per)\s*day\b/,
    ) ?? lower.match(/\b(once|twice)\s+a\s+day\b/);
  const numberMap: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    once: 1,
    twice: 2,
  };
  const timesPerDay = timesPerDayMatch?.[1]
    ? (numberMap[timesPerDayMatch[1].toLowerCase()] ??
      Number(timesPerDayMatch[1]))
    : null;

  let cadenceKind: ExtractedTaskParams["cadenceKind"] = null;
  let everyMinutes: number | null = null;

  if (oneOffReminderLike) {
    cadenceKind = "once";
  } else if (weekdays && weekdays.length > 0) {
    cadenceKind = "weekly";
  } else if (intervalMatch) {
    cadenceKind = "interval";
    everyMinutes =
      Number(intervalMatch[1]) *
      (intervalMatch[2].startsWith("hour") ? 60 : 1);
  } else if (timesPerDay && timesPerDay > 0) {
    cadenceKind = "times_per_day";
  } else if (
    /\b(every day|daily|each day|every morning|every night|every evening|every afternoon)\b/.test(
      lower,
    ) ||
    windows?.length
  ) {
    cadenceKind = "daily";
  }

  const recurringCreateLike =
    cadenceKind !== null &&
    (Boolean(title) ||
      /\b(?:habit|routine|task|todo|reminder)\b/.test(lower) ||
      REMINDER_CONTEXT_RE.test(intent));

  if (
    cadenceKind === null &&
    looksLikeShortTimedFollowup(intent) &&
    requestKind !== null &&
    timeOfDay !== null
  ) {
    cadenceKind = "once";
  }

  if (!title && !cadenceKind && !requestKind) {
    return null;
  }

  if (
    !oneOffReminderLike &&
    !explicitTimeDrivenSchedule &&
    !recurringCreateLike
  ) {
    return null;
  }

  return {
    mode: "create",
    response: null,
    requestKind,
    title,
    description: null,
    cadenceKind,
    windows,
    weekdays,
    timeOfDay,
    timeZone,
    everyMinutes,
    timesPerDay:
      typeof timesPerDay === "number" && Number.isFinite(timesPerDay)
        ? timesPerDay
        : null,
    priority: /\b(urgent|important|critical)\b/.test(lower) ? 4 : null,
    durationMinutes: inferDurationMinutes(intent),
  };
}

function mergeTaskCreatePlans(
  primary: ExtractedTaskCreatePlan,
  fallback: ExtractedTaskCreatePlan | null,
): ExtractedTaskCreatePlan {
  if (!fallback) {
    return primary;
  }
  return {
    mode: primary.mode ?? fallback.mode,
    response: primary.response ?? fallback.response,
    requestKind: primary.requestKind ?? fallback.requestKind,
    title: primary.title ?? fallback.title,
    description: primary.description ?? fallback.description,
    cadenceKind: primary.cadenceKind ?? fallback.cadenceKind,
    windows: primary.windows ?? fallback.windows,
    weekdays: primary.weekdays ?? fallback.weekdays,
    timeOfDay: primary.timeOfDay ?? fallback.timeOfDay,
    timeZone: primary.timeZone ?? fallback.timeZone,
    everyMinutes: primary.everyMinutes ?? fallback.everyMinutes,
    timesPerDay: primary.timesPerDay ?? fallback.timesPerDay,
    priority: primary.priority ?? fallback.priority,
    durationMinutes: primary.durationMinutes ?? fallback.durationMinutes,
  };
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
    timeZone: validateTimeZone(parsed.timeZone),
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

  if (!intent || intent.trim().length === 0) {
    return null;
  }

  const recentWindow = await recentConversationTexts({
    runtime,
    message: args.message,
    state: args.state,
    limit: Math.max(resolveContextWindow(), REQUEST_KIND_VALIDATION_WINDOW),
  });
  const heuristicPlan = buildHeuristicTaskCreatePlan({
    intent,
    recentWindow,
  });
  if (typeof runtime.useModel !== "function") {
    return heuristicPlan;
  }
  const prompt = buildExtractionPrompt(
    intent,
    recentWindow.slice(-resolveContextWindow()).join("\n"),
  );

  try {
    const result = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
    const raw = typeof result === "string" ? result : "";
    const parsed = parseJSONObjectFromText(raw);
    if (!parsed) {
      return heuristicPlan;
    }

    const parsedPlan = buildTaskCreatePlan({
      parsed,
      intent,
      recentWindow,
    });
    if (
      parsedPlan.mode === "respond" &&
      heuristicPlan?.mode === "create" &&
      heuristicPlan.title &&
      heuristicPlan.cadenceKind
    ) {
      return heuristicPlan;
    }

    return mergeTaskCreatePlans(parsedPlan, heuristicPlan);
  } catch {
    return heuristicPlan;
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

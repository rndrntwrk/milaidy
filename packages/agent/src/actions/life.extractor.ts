import type { IAgentRuntime, Memory, State } from "@elizaos/core";
import {
  ModelType,
  parseJSONObjectFromText,
  parseKeyValueXml,
} from "@elizaos/core";
import { resolveContextWindow } from "./lifeops-extraction-config.js";

export const LIFE_OPERATION_VALUES = [
  "create_definition",
  "create_goal",
  "update_definition",
  "update_goal",
  "delete_definition",
  "delete_goal",
  "complete_occurrence",
  "skip_occurrence",
  "snooze_occurrence",
  "review_goal",
  "capture_phone",
  "configure_escalation",
  "set_reminder_preference",
  "query_calendar_today",
  "query_calendar_next",
  "query_email",
  "query_overview",
] as const;

export type ExtractedLifeOperation = (typeof LIFE_OPERATION_VALUES)[number];
export type ExtractedLifeMissingField =
  | "title"
  | "schedule"
  | "target"
  | "goal"
  | "phone_number"
  | "reminder_intensity"
  | "details";

type ExtractedLifeOperationPlan = {
  operation: ExtractedLifeOperation | null;
  confidence: number | null;
  missing: ExtractedLifeMissingField[];
  shouldAct: boolean | null;
};

function messageText(message: Memory): string {
  const text = message.content?.text;
  return typeof text === "string" ? text.trim() : "";
}

function splitStateTextCandidates(value: string): string[] {
  return value
    .split(/\n+/)
    .map((line) =>
      line
        .replace(
          /^[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u3000-\u9FFF]{1,20}\s*:\s*/,
          "",
        )
        .trim(),
    )
    .filter((line) => line.length > 0);
}

function stateTextCandidates(state: State | undefined): string[] {
  if (!state || typeof state !== "object") {
    return [];
  }

  const stateRecord = state as Record<string, unknown>;
  const values =
    stateRecord.values && typeof stateRecord.values === "object"
      ? (stateRecord.values as Record<string, unknown>)
      : undefined;

  const candidates: string[] = [];
  const pushText = (value: unknown) => {
    if (typeof value === "string" && value.trim().length > 0) {
      candidates.push(...splitStateTextCandidates(value));
    }
  };

  pushText(values?.recentMessages);
  pushText(stateRecord.text);

  const recentMessagesData =
    stateRecord.recentMessagesData ?? stateRecord.recentMessages;
  if (Array.isArray(recentMessagesData)) {
    for (const item of recentMessagesData) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const content = (item as Record<string, unknown>).content;
      if (!content || typeof content !== "object") {
        continue;
      }
      pushText((content as Record<string, unknown>).text);
    }
  }

  return [...new Set(candidates)];
}

function normalizeOperation(value: unknown): ExtractedLifeOperation | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return LIFE_OPERATION_VALUES.includes(normalized as ExtractedLifeOperation)
    ? (normalized as ExtractedLifeOperation)
    : null;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(1, value));
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(1, parsed));
    }
  }
  return null;
}

function normalizeShouldAct(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return null;
}

const VALID_MISSING_FIELDS = new Set<ExtractedLifeMissingField>([
  "title",
  "schedule",
  "target",
  "goal",
  "phone_number",
  "reminder_intensity",
  "details",
]);

function normalizeMissingFields(value: unknown): ExtractedLifeMissingField[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const missing: ExtractedLifeMissingField[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const normalized = item.trim().toLowerCase() as ExtractedLifeMissingField;
    if (
      VALID_MISSING_FIELDS.has(normalized) &&
      !missing.includes(normalized)
    ) {
      missing.push(normalized);
    }
  }
  return missing;
}

function normalizeIntent(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

const LIFE_CREATE_HINT_RE =
  /\b(add|create|make|set up|set|help me(?: remember)?|remember to|remind(?: me)?|make sure|keep bugging me|nudge me|ping me)\b/;
const LIFE_ITEM_RE = /\b(todo|task|habit|routine|reminder|alarm)\b/;
const LIFE_SCHEDULE_RE =
  /\b(every|daily|weekly|tomorrow|today|tonight|morning|night|afternoon|evening|wake(?:-|\s)?up|before bed|before sleep|breakfast|lunch|after lunch|dinner|during the day|throughout the day|weekdays?|weekends?)\b/;
const LIFE_TIME_RE = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/;
const LIFE_SPECIFIC_ACTIVITY_RE =
  /\b(call|email|text|submit|pay|take|drink|brush|stretch|work ?out|workout|exercise|meditat(?:e|ion)|shower|shave|floss|hug|invisalign|water|vitamins?)\b/;
const LIFE_SEEDED_ROUTINE_RE =
  /\b(invisalign|water|stretch(?:ing)?|vitamins?|brush(?:ing|ed)?|teeth|cepill(?:ar|arme|arte|arse|ando|ado)|dientes|work ?out|workout|exercise|gym|shower|shave)\b/;
const LIFE_REMINDER_ONLY_SCHEDULE_RE =
  /\b(alarm|wake(?:-|\s)?up|wake me up|remind(?: me)?|reminder)\b/;

function buildHeuristicOperationPlan(args: {
  intent: string;
  currentMessage: string;
  recentConversation: string[];
}): ExtractedLifeOperationPlan | null {
  const text = normalizeIntent(args.intent || args.currentMessage);
  const lower = text.toLowerCase();
  const recentWindow = args.recentConversation.slice(-resolveContextWindow());

  if (
    /\b(zoom out|big picture|juggling|what am i juggling|everything i have going on)\b/.test(
      lower,
    )
  ) {
    return {
      operation: "query_overview",
      confidence: 0.82,
      shouldAct: true,
      missing: [],
    };
  }

  const asksToCreate =
    /\b(add|create|make|set up|set|help me add|help me create|help me make)\b/.test(lower);
  const mentionsLifeItem = LIFE_ITEM_RE.test(lower);
  const hasSpecificTitle =
    /\bto\s+[a-z]/.test(lower) ||
    /\b\d+\s+[a-z]/.test(lower) ||
    LIFE_SPECIFIC_ACTIVITY_RE.test(lower);
  const hasSchedule = LIFE_SCHEDULE_RE.test(lower) || LIFE_TIME_RE.test(lower);
  const hasCreateHint = LIFE_CREATE_HINT_RE.test(lower) || asksToCreate;
  const hasSeededRoutine = LIFE_SEEDED_ROUTINE_RE.test(lower);
  const hasSpecificActionableActivity = hasSpecificTitle || hasSeededRoutine;
  const reminderScheduleOnly =
    LIFE_REMINDER_ONLY_SCHEDULE_RE.test(lower) && hasSchedule;

  if (asksToCreate && mentionsLifeItem && !hasSpecificTitle && !hasSchedule) {
    return {
      operation: "create_definition",
      confidence: 0.8,
      shouldAct: false,
      missing: ["title", "schedule"],
    };
  }

  if (
    reminderScheduleOnly ||
    (hasCreateHint &&
      hasSpecificActionableActivity &&
      (hasSchedule || hasSeededRoutine || mentionsLifeItem))
  ) {
    return {
      operation: "create_definition",
      confidence: hasSeededRoutine ? 0.91 : 0.86,
      shouldAct: true,
      missing: [],
    };
  }

  const shortTimedFollowup =
    text.length <= 32 &&
    (LIFE_TIME_RE.test(lower) ||
      /\b(today|tomorrow|tonight)\b/.test(lower));
  if (
    shortTimedFollowup &&
    recentWindow.some((entry) =>
      /\b(alarm|wake(?:-|\s)?up|wake me up|remind(?: me)?|reminder)\b/i.test(
        entry,
      ),
    )
  ) {
    return {
      operation: "create_definition",
      confidence: 0.76,
      shouldAct: true,
      missing: [],
    };
  }

  return null;
}

export async function extractLifeOperationWithLlm(args: {
  runtime: IAgentRuntime;
  message: Memory;
  state: State | undefined;
  intent: string;
}): Promise<ExtractedLifeOperationPlan> {
  const { runtime, message, state, intent } = args;
  const recentConversation = stateTextCandidates(state).slice(
    -resolveContextWindow(),
  );
  const currentMessage = messageText(message);
  const heuristicPlan = buildHeuristicOperationPlan({
    intent,
    currentMessage,
    recentConversation,
  });
  if (typeof runtime.useModel !== "function") {
    return (
      heuristicPlan ?? {
        operation: null,
        confidence: null,
        shouldAct: null,
        missing: [],
      }
    );
  }
  const prompt = [
    "Plan the LifeOps response for the current user request.",
    "The user may speak in any language.",
    "Use the current request plus recent conversation context.",
    "Short follow-ups can continue an earlier alarm or reminder request when that context appears in the recent conversation.",
    "You are allowed to decide that the assistant should reply naturally without acting yet.",
    "Set shouldAct=false when the user is chatting, acknowledging, brainstorming, or asking for help in a way that is too vague to safely create, update, complete, or query anything yet.",
    "When the user clearly wants a LifeOps action but key information is missing, set operation to the closest operation, shouldAct=false, and list the blocking pieces in missing.",
    "Only set shouldAct=true when the assistant should execute, preview, update, or query right now.",
    "",
    "Return a JSON object with exactly these fields:",
    '  operation: one of the allowed operations below, or null when this should be reply-only/no-op',
    "  confidence: number from 0 to 1",
    "  shouldAct: boolean",
    '  missing: array of missing fields from ["title","schedule","target","goal","phone_number","reminder_intensity","details"]',
    "",
    "Operations and when to use each:",
    "  create_definition — create a new habit, routine, task, one-off alarm, or reminder (e.g. 'remind me to brush my teeth every night', 'set an alarm for 7am', 'set a reminder for tomorrow at 9')",
    "  create_goal — create an aspiration or goal without a routine cadence (e.g. 'I want to run a marathon')",
    "  update_definition — edit, rename, reschedule, or modify an existing task/habit/routine (e.g. 'change my workout to 6am')",
    "  update_goal — edit or modify an existing goal (e.g. 'update my marathon goal to June')",
    "  delete_definition — delete, remove, cancel, or stop tracking a task/habit/routine (e.g. 'stop tracking my meditation')",
    "  delete_goal — delete or remove a goal (e.g. 'delete my marathon goal')",
    "  complete_occurrence — mark an item as done (e.g. 'I brushed my teeth', 'done with workout', 'I did it')",
    "  skip_occurrence — skip an item for today (e.g. 'skip brushing', 'not today', 'pass on workout')",
    "  snooze_occurrence — postpone or defer an item (e.g. 'snooze', 'remind me later', 'push it back')",
    "  review_goal — check progress on a goal (e.g. 'how am I doing on my marathon goal', 'review my progress')",
    "  capture_phone — save or confirm a phone number (e.g. 'my number is 555-1234', 'text me at...')",
    "  configure_escalation — set up SMS/voice/call escalation (e.g. 'text me if I ignore the reminder', 'call me if I miss it')",
    "  set_reminder_preference — adjust reminder frequency (e.g. 'less reminders', 'more reminders', 'pause reminders', 'high priority only')",
    "  query_calendar_today — today's/tomorrow's/this week's schedule (e.g. 'what's on my calendar today')",
    "  query_calendar_next — next upcoming event (e.g. 'what's my next meeting')",
    "  query_email — inbox/email status (e.g. 'any new emails', 'who emailed me')",
    "  query_overview — broad status summary or remaining LifeOps items (e.g. 'what's active', 'show me everything', 'overview', \"what's still left for today\", 'what do i still need to do today')",
    "",
    "Examples:",
    '  "I brushed my teeth" -> {"operation":"complete_occurrence","confidence":0.95,"shouldAct":true,"missing":[]}',
    '  "less reminders please" -> {"operation":"set_reminder_preference","confidence":0.9,"shouldAct":true,"missing":[]}',
    '  "remind me to take vitamins every morning" -> {"operation":"create_definition","confidence":0.95,"shouldAct":true,"missing":[]}',
    '  "set an alarm for 7 am" -> {"operation":"create_definition","confidence":0.95,"shouldAct":true,"missing":[]}',
    '  "set a reminder for tomorrow at 9" -> {"operation":"create_definition","confidence":0.95,"shouldAct":true,"missing":[]}',
    '  "please remind me about my Invisalign on weekdays after lunch" -> {"operation":"create_definition","confidence":0.95,"shouldAct":true,"missing":[]}',
    '  "help me remember to drink water" -> {"operation":"create_definition","confidence":0.9,"shouldAct":true,"missing":[]}',
    '  "help me remember to stretch during the day" -> {"operation":"create_definition","confidence":0.9,"shouldAct":true,"missing":[]}',
    '  "make sure I brush my teeth when I wake up and before bed" -> {"operation":"create_definition","confidence":0.95,"shouldAct":true,"missing":[]}',
    '  "how am I doing on my reading goal" -> {"operation":"review_goal","confidence":0.9,"shouldAct":true,"missing":[]}',
    '  "what\'s still left for today" -> {"operation":"query_overview","confidence":0.88,"shouldAct":true,"missing":[]}',
    '  "lol yeah. can you help me add a todo for my life?" -> {"operation":"create_definition","confidence":0.82,"shouldAct":false,"missing":["title","schedule"]}',
    '  "yeah lol" -> {"operation":null,"confidence":0.62,"shouldAct":false,"missing":[]}',
    "",
    "Return ONLY valid JSON. No prose. No markdown. No XML. No <think>.",
    "",
    `Allowed operations: ${LIFE_OPERATION_VALUES.join(", ")}, or null`,
    `Current request: ${JSON.stringify(currentMessage)}`,
    `Resolved intent: ${JSON.stringify(intent)}`,
    `Recent conversation: ${JSON.stringify(recentConversation.join("\n"))}`,
  ].join("\n");

  let rawResponse = "";
  try {
    const result = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
    rawResponse = typeof result === "string" ? result : "";
  } catch (error) {
    runtime.logger?.warn?.(
      {
        src: "action:life",
        error: error instanceof Error ? error.message : String(error),
      },
      "Life operation extraction model call failed",
    );
    return (
      heuristicPlan ?? {
        operation: null,
        confidence: null,
        shouldAct: null,
        missing: [],
      }
    );
  }

  const parsed =
    parseKeyValueXml<Record<string, unknown>>(rawResponse) ??
    parseJSONObjectFromText(rawResponse);
  if (!parsed) {
    return (
      heuristicPlan ?? {
        operation: null,
        confidence: null,
        shouldAct: null,
        missing: [],
      }
    );
  }

  const parsedPlan = {
    operation: normalizeOperation(parsed.operation),
    confidence: normalizeConfidence(parsed.confidence),
    shouldAct: normalizeShouldAct(parsed.shouldAct),
    missing: normalizeMissingFields(parsed.missing),
  };
  if (
    heuristicPlan &&
    (parsedPlan.operation === null ||
      parsedPlan.shouldAct === null ||
      (heuristicPlan.shouldAct === true &&
        parsedPlan.shouldAct === false &&
        (parsedPlan.operation === null ||
          parsedPlan.operation === heuristicPlan.operation)) ||
      (parsedPlan.confidence ?? 0) < 0.5 ||
      (heuristicPlan.shouldAct === false &&
        parsedPlan.operation === heuristicPlan.operation &&
        parsedPlan.shouldAct === true &&
        (parsedPlan.confidence ?? 0) < 0.9))
  ) {
    return heuristicPlan;
  }
  return parsedPlan;
}

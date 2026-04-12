import type {
  Action,
  ActionResult,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { ModelType, parseJSONObjectFromText } from "@elizaos/core";
import {
  extractDurationMinutesFromText,
  extractWebsiteTargetsFromText,
  normalizeWebsiteTargets,
} from "@miladyai/plugin-selfcontrol/selfcontrol";
import type {
  CreateLifeOpsDefinitionRequest,
  CreateLifeOpsGoalRequest,
  LifeOpsCadence,
  LifeOpsDailySlot,
  LifeOpsDefinitionRecord,
  LifeOpsDomain,
  LifeOpsGoalRecord,
  LifeOpsReminderIntensity,
  LifeOpsReminderStep,
  LifeOpsWindowPolicy,
  SetLifeOpsReminderPreferenceRequest,
  UpdateLifeOpsDefinitionRequest,
  UpdateLifeOpsGoalRequest,
} from "@miladyai/shared/contracts/lifeops";
import {
  getValidationKeywordTerms,
  textIncludesKeywordTerm,
} from "@miladyai/shared/validation-keywords";
import {
  buildNativeAppleReminderMetadata,
  type NativeAppleReminderLikeKind,
} from "../lifeops/apple-reminders.js";
import {
  resolveDefaultTimeZone,
  resolveDefaultWindowPolicy,
} from "../lifeops/defaults.js";
import { LifeOpsService, LifeOpsServiceError } from "../lifeops/service.js";
import {
  addDaysToLocalDate,
  buildUtcDateFromLocalParts,
  getZonedDateParts,
} from "../lifeops/time.js";
import { gmailAction } from "./gmail.js";
import {
  type ExtractedLifeMissingField,
  type ExtractedLifeOperation,
  extractLifeOperationWithLlm,
} from "./life.extractor.js";
import {
  extractReminderIntensityWithLlm,
  extractTaskCreatePlanWithLlm,
  extractUnlockModeWithLlm,
} from "./life-param-extractor.js";
import {
  recentConversationTexts,
  recentConversationTextsFromState,
} from "./life-recent-context.js";
import { extractUpdateFieldsWithLlm } from "./life-update-extractor.js";
import {
  calendarReadUnavailableMessage,
  dayRange,
  detailArray,
  detailBoolean,
  detailNumber,
  detailObject,
  detailString,
  formatCalendarFeed,
  formatNextEventContext,
  formatOverviewForQuery,
  getGoogleCapabilityStatus,
  hasLifeOpsAccess,
  INTERNAL_URL,
  messageText,
  toActionData,
  weekRange,
} from "./lifeops-google-helpers.js";
import {
  extractExplicitTimeZoneFromText,
  normalizeExplicitTimeZoneToken,
} from "./timezone-normalization.js";

// ── Types ─────────────────────────────────────────────

type LifeOperation = ExtractedLifeOperation;
type ResolvedLifeOperationPlan = {
  confidence: number | null;
  missing: ExtractedLifeMissingField[];
  operation: LifeOperation | null;
  shouldAct: boolean;
};

type LifeAction =
  | "create"
  | "create_goal"
  | "update"
  | "update_goal"
  | "delete"
  | "delete_goal"
  | "complete"
  | "skip"
  | "snooze"
  | "review"
  | "phone"
  | "escalation"
  | "reminder_preference"
  | "calendar"
  | "next_event"
  | "email"
  | "overview";

const LIFE_EMAIL_QUERY_TERMS = getValidationKeywordTerms(
  "contextSignal.gmail.strong",
  {
    includeAllLocales: true,
  },
);

const LIFE_I18N_OPTS = { includeAllLocales: true } as const;
const LIFE_COMPLETE_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_complete.strong",
  LIFE_I18N_OPTS,
);
const LIFE_SKIP_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_skip.strong",
  LIFE_I18N_OPTS,
);
const LIFE_SNOOZE_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_snooze.strong",
  LIFE_I18N_OPTS,
);
const LIFE_DELETE_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_delete.strong",
  LIFE_I18N_OPTS,
);
const LIFE_UPDATE_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_update.strong",
  LIFE_I18N_OPTS,
);
const LIFE_OVERVIEW_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_overview.strong",
  LIFE_I18N_OPTS,
);
const LIFE_REMINDER_PREF_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_reminder_pref.strong",
  LIFE_I18N_OPTS,
);
const LIFE_CALENDAR_TERMS = getValidationKeywordTerms(
  "contextSignal.calendar.strong",
  LIFE_I18N_OPTS,
);
const LIFE_CADENCE_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_cadence.strong",
  LIFE_I18N_OPTS,
);
const LIFE_GOAL_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_goal.strong",
  LIFE_I18N_OPTS,
);
const LIFE_ESCALATION_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_escalation.strong",
  LIFE_I18N_OPTS,
);
const LIFE_PHONE_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_phone.strong",
  LIFE_I18N_OPTS,
);
const LIFE_REVIEW_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops_review.strong",
  LIFE_I18N_OPTS,
);
const LIFE_LIFEOPS_STRONG_TERMS = getValidationKeywordTerms(
  "contextSignal.lifeops.strong",
  LIFE_I18N_OPTS,
);
const LIFE_AFFIRMATIVE_TERMS = getValidationKeywordTerms(
  "contextSignal.affirmative.strong",
  LIFE_I18N_OPTS,
);
const LIFE_NEGATIVE_TERMS = getValidationKeywordTerms(
  "contextSignal.negative.strong",
  LIFE_I18N_OPTS,
);
const LIFE_DRAFT_EDIT_TERMS = getValidationKeywordTerms(
  "contextSignal.draft_edit.strong",
  LIFE_I18N_OPTS,
);
const LIFE_TEMPORAL_NEXT_TERMS = getValidationKeywordTerms(
  "contextSignal.temporal_next.strong",
  LIFE_I18N_OPTS,
);

function textMatchesAnyTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => textIncludesKeywordTerm(text, term));
}

const ACTION_TO_OPERATION: Record<LifeAction, LifeOperation> = {
  create: "create_definition",
  create_goal: "create_goal",
  update: "update_definition",
  update_goal: "update_goal",
  delete: "delete_definition",
  delete_goal: "delete_goal",
  complete: "complete_occurrence",
  skip: "skip_occurrence",
  snooze: "snooze_occurrence",
  review: "review_goal",
  phone: "capture_phone",
  escalation: "configure_escalation",
  reminder_preference: "set_reminder_preference",
  calendar: "query_calendar_today",
  next_event: "query_calendar_next",
  email: "query_email",
  overview: "query_overview",
};

type LifeParams = {
  action?: LifeAction;
  intent?: string;
  title?: string;
  target?: string;
  details?: Record<string, unknown>;
};

type LifeDefinitionSeed = {
  title: string;
  kind: CreateLifeOpsDefinitionRequest["kind"];
  cadence: LifeOpsCadence;
  description?: string;
  reminderPlan?: CreateLifeOpsDefinitionRequest["reminderPlan"];
  websiteAccess?: CreateLifeOpsDefinitionRequest["websiteAccess"];
};

// CADENCE_HINT_RE removed — cadence detection uses i18n LIFE_CADENCE_TERMS
const GENERIC_DERIVED_TITLE_RE =
  /^(?:new\s+)?(?:habit|routine|task|goal|life goal|thing|item|something|anything|stuff|plan|reminder|todo|to do|achieve|achieve a|achieve an)$/i;
const DERIVED_TITLE_STOPWORDS = new Set([
  "a",
  "about",
  "actually",
  "add",
  "am",
  "an",
  "and",
  "anything",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "by",
  "can",
  "called",
  "could",
  "create",
  "did",
  "do",
  "does",
  "doing",
  "done",
  "for",
  "goal",
  "goals",
  "had",
  "happen",
  "how",
  "happens",
  "has",
  "have",
  "help",
  "habit",
  "i",
  "im",
  "i'm",
  "item",
  "its",
  "it",
  "just",
  "life",
  "make",
  "manage",
  "me",
  "mine",
  "more",
  "my",
  "need",
  "new",
  "named",
  "ok",
  "okay",
  "of",
  "on",
  "ops",
  "our",
  "ours",
  "plan",
  "please",
  "really",
  "reminder",
  "routine",
  "save",
  "set",
  "setup",
  "something",
  "start",
  "stuff",
  "task",
  "that",
  "the",
  "them",
  "then",
  "thing",
  "this",
  "to",
  "todo",
  "titled",
  "track",
  "uh",
  "uhh",
  "um",
  "umm",
  "until",
  "up",
  "want",
  "we",
  "were",
  "with",
  "would",
  "yeah",
  "you",
  "your",
  "yep",
  "yup",
  "lol",
  "lmao",
]);
const DERIVED_TITLE_CADENCE_TOKENS = new Set([
  "afternoon",
  "afternoons",
  "breakfast",
  "daily",
  "day",
  "days",
  "dinner",
  "each",
  "evening",
  "evenings",
  "every",
  "hour",
  "hours",
  "lunch",
  "minute",
  "minutes",
  "monthly",
  "morning",
  "mornings",
  "night",
  "nights",
  "once",
  "per",
  "throughout",
  "time",
  "times",
  "today",
  "tomorrow",
  "twice",
  "week",
  "weeks",
  "weekly",
  "with",
  "x",
  "year",
  "years",
]);
const GENERIC_DERIVED_TOKENS = new Set([
  "achieve",
  "achieving",
  "better",
  "goal",
  "habit",
  "improve",
  "item",
  "plan",
  "reminder",
  "routine",
  "something",
  "stuff",
  "task",
  "thing",
  "todo",
]);
type DerivedIntentSegment = {
  hasQuantity: boolean;
  text: string;
};

/** Maximum age (ms) for a deferred draft before it expires. */
const DRAFT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
/** Maximum conversation turns before a deferred draft expires. */
const DRAFT_MAX_TURNS = 3;

type DeferredLifeDefinitionDraft = {
  intent: string;
  operation: "create_definition";
  /** Epoch ms when the draft was created. Used for expiry. */
  createdAt?: number;
  request: {
    cadence: LifeOpsCadence;
    description?: string;
    goalRef?: string;
    kind: CreateLifeOpsDefinitionRequest["kind"];
    priority?: number;
    progressionRule?: CreateLifeOpsDefinitionRequest["progressionRule"];
    reminderPlan?: CreateLifeOpsDefinitionRequest["reminderPlan"];
    timezone?: string;
    title: string;
    metadata?: CreateLifeOpsDefinitionRequest["metadata"];
    windowPolicy?: CreateLifeOpsDefinitionRequest["windowPolicy"];
    websiteAccess?: CreateLifeOpsDefinitionRequest["websiteAccess"];
  };
};

function normalizeLifeTimeZoneToken(
  value: string | null | undefined,
): string | null {
  return normalizeExplicitTimeZoneToken(value);
}

function extractLifeTimeZoneFromText(
  value: string | null | undefined,
): string | null {
  return extractExplicitTimeZoneFromText(value);
}

type DeferredLifeGoalDraft = {
  intent: string;
  operation: "create_goal";
  /** Epoch ms when the draft was created. Used for expiry. */
  createdAt?: number;
  request: {
    cadence?: CreateLifeOpsGoalRequest["cadence"];
    description?: string;
    successCriteria?: CreateLifeOpsGoalRequest["successCriteria"];
    supportStrategy?: CreateLifeOpsGoalRequest["supportStrategy"];
    title: string;
  };
};

type DeferredLifeDraft = DeferredLifeDefinitionDraft | DeferredLifeGoalDraft;
type DeferredLifeDraftReuseMode = "confirm" | "edit";

// ── Intent classifier ─────────────────────────────────

export function classifyIntent(intent: string): LifeOperation {
  // All matching is i18n-aware via validation keyword terms.
  // English words are included in the base terms so no regex needed.

  // Reminder preference — check early
  if (textMatchesAnyTerm(intent, LIFE_REMINDER_PREF_TERMS)) {
    return "set_reminder_preference";
  }

  // Update — check before calendar so "edit my workout schedule" doesn't hit calendar
  if (textMatchesAnyTerm(intent, LIFE_UPDATE_TERMS)) {
    if (textMatchesAnyTerm(intent, LIFE_GOAL_TERMS)) return "update_goal";
    return "update_definition";
  }

  // Escalation config — check before phone capture
  if (textMatchesAnyTerm(intent, LIFE_ESCALATION_TERMS))
    return "configure_escalation";

  // Phone capture
  if (textMatchesAnyTerm(intent, LIFE_PHONE_TERMS)) return "capture_phone";

  // Review — check before calendar
  if (textMatchesAnyTerm(intent, LIFE_REVIEW_TERMS)) return "review_goal";

  // Delete — check before calendar
  if (textMatchesAnyTerm(intent, LIFE_DELETE_TERMS)) {
    if (textMatchesAnyTerm(intent, LIFE_GOAL_TERMS)) return "delete_goal";
    return "delete_definition";
  }

  // Completion
  if (looksLikeCompletionReport(intent)) return "complete_occurrence";

  // Skip
  if (textMatchesAnyTerm(intent, LIFE_SKIP_TERMS)) return "skip_occurrence";

  // Snooze
  if (textMatchesAnyTerm(intent, LIFE_SNOOZE_TERMS)) return "snooze_occurrence";

  // Calendar query — only when not a lifeops create or lifeops item reference
  if (
    !looksLikeDefinitionCreateIntent(intent) &&
    !looksLikeGoalCreateIntent(intent) &&
    !textMatchesAnyTerm(intent, LIFE_LIFEOPS_STRONG_TERMS) &&
    textMatchesAnyTerm(intent, LIFE_CALENDAR_TERMS)
  ) {
    // Sub-classify: next event vs today/tomorrow/week
    const lower = intent.toLowerCase();
    if (textMatchesAnyTerm(lower, LIFE_TEMPORAL_NEXT_TERMS))
      return "query_calendar_next";
    return "query_calendar_today";
  }

  // Email query
  if (textMatchesAnyTerm(intent, LIFE_EMAIL_QUERY_TERMS))
    return "query_email";

  // Overview
  if (textMatchesAnyTerm(intent, LIFE_OVERVIEW_TERMS)) return "query_overview";

  // Create definition (has cadence hint)
  if (looksLikeDefinitionCreateIntent(intent)) return "create_definition";

  // Create goal (goal mention without cadence)
  if (looksLikeGoalCreateIntent(intent)) return "create_goal";

  // Default: create a task/habit/routine
  return "create_definition";
}

async function resolveLifeOperationPlan(args: {
  runtime: IAgentRuntime;
  message: Memory;
  state: State | undefined;
  intent: string;
  explicitOperation: LifeOperation | undefined;
}): Promise<ResolvedLifeOperationPlan> {
  const { runtime, message, state, intent, explicitOperation } = args;
  if (explicitOperation) {
    return {
      operation: explicitOperation,
      confidence: 1,
      missing: [],
      shouldAct: true,
    };
  }

  const extracted = await extractLifeOperationWithLlm({
    runtime,
    message,
    state,
    intent,
  });
  if (!extracted.shouldAct || !extracted.operation) {
    return {
      operation: extracted.operation,
      confidence: extracted.confidence,
      missing: extracted.missing,
      shouldAct: false,
    };
  }
  return {
    operation: extracted.operation,
    confidence: extracted.confidence,
    missing: extracted.missing,
    shouldAct: true,
  };
}

function looksLikeDefinitionCreateIntent(text: string): boolean {
  return hasCadenceHint(text);
}

function looksLikeGoalCreateIntent(text: string): boolean {
  return textMatchesAnyTerm(text, LIFE_GOAL_TERMS) && !hasCadenceHint(text);
}

function hasCadenceHint(text: string): boolean {
  return textMatchesAnyTerm(text, LIFE_CADENCE_TERMS);
}

function shouldForceLifeCreateExecution(args: {
  intent: string;
  missing: ExtractedLifeMissingField[];
  operation: LifeOperation | null;
  details: Record<string, unknown> | undefined;
  title: string | undefined;
}): boolean {
  if (args.operation !== "create_definition") {
    return false;
  }

  const blockingFields = args.missing.filter(
    (field) => field !== "title" && field !== "schedule",
  );
  if (blockingFields.length > 0) {
    return false;
  }

  if (typeof args.title === "string" && args.title.trim().length > 0) {
    return true;
  }

  if (inferLifeDefinitionSeed(args.intent)) {
    return true;
  }

  if (normalizeCadenceDetail(detailObject(args.details, "cadence"))) {
    return true;
  }

  const derivedTitle = deriveDefinitionTitle(args.intent);
  if (
    derivedTitle &&
    scoreDefinitionTitleQuality(derivedTitle) > 0 &&
    looksLikeDefinitionCreateIntent(args.intent)
  ) {
    return true;
  }

  const timedRequestKind = resolveTimedRequestKind({
    intent: args.intent,
    llmRequestKind: null,
    recentWindow: [],
  });
  const timedDefaults = deriveTimedRequestDefaults({
    intent: args.intent,
    requestKind: timedRequestKind,
    timeZone: extractLifeTimeZoneFromText(args.intent) ?? undefined,
  });
  return Boolean(timedDefaults?.title || timedDefaults?.cadence);
}

function looksLikeCompletionReport(text: string): boolean {
  // Exclude overview queries — these mention "done/finish" but ask what's remaining
  if (textMatchesAnyTerm(text, LIFE_OVERVIEW_TERMS)) {
    return false;
  }
  // Exclude create-intent with cadence — "create a habit until I complete it"
  if (textMatchesAnyTerm(text, LIFE_CADENCE_TERMS)) {
    return false;
  }
  return textMatchesAnyTerm(text, LIFE_COMPLETE_TERMS);
}

function shouldRecoverMissingOccurrenceAsCreate(
  intent: string,
  seed: LifeDefinitionSeed | undefined,
): boolean {
  if (!seed) {
    return false;
  }
  const lower = intent.toLowerCase();
  return (
    looksLikeDefinitionCreateIntent(lower) && !looksLikeCompletionReport(intent)
  );
}

function inferReminderIntensityFromIntent(
  intent: string,
): LifeOpsReminderIntensity | null {
  // LLM extraction (extractReminderIntensityWithLlm) is the primary path.
  // This is a best-effort English fallback for when the LLM is unavailable.
  // Intent is already classified as set_reminder_preference via i18n;
  // this only determines the specific intensity level.
  const lower = intent.toLowerCase();
  if (
    /\b(stop reminding me|don't remind me|pause reminders?|mute reminders?|high priority only|only high priority)\b/.test(
      lower,
    )
  ) {
    return "high_priority_only";
  }
  if (
    /\b(resume reminders?|start reminding me again|turn reminders? back on|normal reminders?)\b/.test(
      lower,
    )
  ) {
    return "normal";
  }
  if (
    /\b(less|fewer|lower)\s+reminders?\b/.test(lower) ||
    /\bremind.*\b(less|fewer|lower)\b/.test(lower) ||
    /\b(less|fewer|lower)\b/.test(lower)
  ) {
    return "minimal";
  }
  if (
    /\bmore reminders?\b/.test(lower) ||
    /\bremind.*\bmore\b/.test(lower) ||
    /\bmore persistent\b/.test(lower)
  ) {
    return "persistent";
  }
  return null;
}

// ── Helpers ───────────────────────────────────────────

function requestedOwnership(domain?: LifeOpsDomain) {
  if (domain === "agent_ops") {
    return { domain: "agent_ops" as const, subjectType: "agent" as const };
  }
  return { domain: "user_lifeops" as const, subjectType: "owner" as const };
}

function normalizeIntentText(value: string): string {
  return normalizeLifeInputText(value).toLowerCase();
}

function normalizeLifeInputText(value: string): string {
  return value
    .replace(/[\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTitle(value: string): string {
  return normalizeIntentText(value);
}

function matchByTitle<
  T extends { definition?: { title: string }; goal?: { title: string } },
>(entries: T[], targetTitle: string): T | null {
  const normalized = normalizeTitle(targetTitle);
  return (
    entries.find(
      (e) =>
        normalizeTitle(e.definition?.title ?? e.goal?.title ?? "") ===
        normalized,
    ) ??
    entries.find((e) =>
      normalizeTitle(e.definition?.title ?? e.goal?.title ?? "").includes(
        normalized,
      ),
    ) ??
    null
  );
}

function coerceDeferredLifeDraft(value: unknown): DeferredLifeDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const operation = record.operation;
  const intent = typeof record.intent === "string" ? record.intent.trim() : "";
  const request =
    record.request && typeof record.request === "object"
      ? (record.request as Record<string, unknown>)
      : null;
  const createdAt =
    typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
      ? record.createdAt
      : undefined;

  if (!request || !intent) {
    return null;
  }

  const title = typeof request.title === "string" ? request.title.trim() : "";
  if (!title) {
    return null;
  }

  if (operation === "create_definition") {
    const kind =
      typeof request.kind === "string"
        ? (request.kind as CreateLifeOpsDefinitionRequest["kind"])
        : null;
    const cadence = request.cadence as LifeOpsCadence | undefined;
    if (!kind || !cadence) {
      return null;
    }
    return {
      createdAt,
      intent,
      operation,
      request: {
        cadence,
        description:
          typeof request.description === "string"
            ? request.description
            : undefined,
        goalRef:
          typeof request.goalRef === "string" ? request.goalRef : undefined,
        kind,
        priority:
          typeof request.priority === "number" ? request.priority : undefined,
        progressionRule:
          request.progressionRule as CreateLifeOpsDefinitionRequest["progressionRule"],
        reminderPlan:
          request.reminderPlan as CreateLifeOpsDefinitionRequest["reminderPlan"],
        timezone:
          typeof request.timezone === "string" ? request.timezone : undefined,
        title,
        metadata:
          request.metadata && typeof request.metadata === "object"
            ? (request.metadata as CreateLifeOpsDefinitionRequest["metadata"])
            : undefined,
        windowPolicy:
          request.windowPolicy as CreateLifeOpsDefinitionRequest["windowPolicy"],
        websiteAccess:
          request.websiteAccess as CreateLifeOpsDefinitionRequest["websiteAccess"],
      },
    };
  }

  if (operation === "create_goal") {
    return {
      createdAt,
      intent,
      operation,
      request: {
        cadence: request.cadence as CreateLifeOpsGoalRequest["cadence"],
        description:
          typeof request.description === "string"
            ? request.description
            : undefined,
        successCriteria:
          request.successCriteria as CreateLifeOpsGoalRequest["successCriteria"],
        supportStrategy:
          request.supportStrategy as CreateLifeOpsGoalRequest["supportStrategy"],
        title,
      },
    };
  }

  return null;
}

function stateActionResults(state: State | undefined): ActionResult[] {
  if (!state || typeof state !== "object") {
    return [];
  }
  const stateRecord = state as Record<string, unknown>;
  const data =
    stateRecord.data && typeof stateRecord.data === "object"
      ? (stateRecord.data as Record<string, unknown>)
      : undefined;
  const providerResults =
    data?.providers && typeof data.providers === "object"
      ? (data.providers as Record<string, unknown>)
      : undefined;
  const providerActionState =
    providerResults?.ACTION_STATE &&
    typeof providerResults.ACTION_STATE === "object"
      ? (providerResults.ACTION_STATE as Record<string, unknown>)
      : undefined;
  const providerActionStateData =
    providerActionState?.data && typeof providerActionState.data === "object"
      ? (providerActionState.data as Record<string, unknown>)
      : undefined;
  const providerRecentMessages =
    providerResults?.RECENT_MESSAGES &&
    typeof providerResults.RECENT_MESSAGES === "object"
      ? (providerResults.RECENT_MESSAGES as Record<string, unknown>)
      : undefined;
  const providerRecentMessagesData =
    providerRecentMessages?.data &&
    typeof providerRecentMessages.data === "object"
      ? (providerRecentMessages.data as Record<string, unknown>)
      : undefined;

  const candidates = [
    data?.actionResults,
    providerActionStateData?.actionResults,
    providerActionStateData?.recentActionMemories,
    providerRecentMessagesData?.actionResults,
  ].filter(Array.isArray) as unknown[][];

  if (candidates.length === 0) {
    return [];
  }

  return candidates.flatMap((entries) =>
    entries.flatMap((entry): ActionResult[] => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      if ("content" in entry) {
        const content =
          (entry as { content?: unknown }).content &&
          typeof (entry as { content?: unknown }).content === "object"
            ? ((entry as { content: Record<string, unknown> })
                .content as Record<string, unknown>)
            : null;
        if (!content) {
          return [];
        }

        const contentData =
          content.data && typeof content.data === "object"
            ? ({ ...(content.data as Record<string, unknown>) } as Record<
                string,
                unknown
              >)
            : {};
        if (
          typeof content.actionName === "string" &&
          typeof contentData.actionName !== "string"
        ) {
          contentData.actionName = content.actionName;
        }

        return [
          {
            success: content.actionStatus !== "failed",
            text: typeof content.text === "string" ? content.text : undefined,
            data: contentData as import("@elizaos/core").ProviderDataRecord,
            error:
              typeof content.error === "string" ? content.error : undefined,
          },
        ];
      }

      return [entry as ActionResult];
    }),
  );
}

function stateMessageDrafts(state: State | undefined): DeferredLifeDraft[] {
  if (!state || typeof state !== "object") {
    return [];
  }

  const stateRecord = state as Record<string, unknown>;
  const data =
    stateRecord.data && typeof stateRecord.data === "object"
      ? (stateRecord.data as Record<string, unknown>)
      : undefined;
  const providerResults =
    data?.providers && typeof data.providers === "object"
      ? (data.providers as Record<string, unknown>)
      : undefined;
  const providerRecentMessages =
    providerResults?.RECENT_MESSAGES &&
    typeof providerResults.RECENT_MESSAGES === "object"
      ? (providerResults.RECENT_MESSAGES as Record<string, unknown>)
      : undefined;
  const providerRecentMessagesData =
    providerRecentMessages?.data &&
    typeof providerRecentMessages.data === "object"
      ? (providerRecentMessages.data as Record<string, unknown>)
      : undefined;

  const recentMessagesData = [
    stateRecord.recentMessagesData,
    stateRecord.recentMessages,
    providerRecentMessagesData?.recentMessages,
  ].find(Array.isArray);

  if (!Array.isArray(recentMessagesData)) {
    return [];
  }

  const drafts: DeferredLifeDraft[] = [];
  for (const item of recentMessagesData) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as Record<string, unknown>).content;
    if (!content || typeof content !== "object") {
      continue;
    }
    const contentRecord = content as Record<string, unknown>;
    const candidate =
      coerceDeferredLifeDraft(contentRecord.lifeDraft) ??
      coerceDeferredLifeDraft(
        contentRecord.data && typeof contentRecord.data === "object"
          ? (contentRecord.data as Record<string, unknown>).lifeDraft
          : undefined,
      );
    if (candidate) {
      drafts.push(candidate);
    }
  }

  return drafts;
}

function stateRecentMessageEntries(
  state: State | undefined,
): Record<string, unknown>[] {
  if (!state || typeof state !== "object") {
    return [];
  }

  const stateRecord = state as Record<string, unknown>;
  const data =
    stateRecord.data && typeof stateRecord.data === "object"
      ? (stateRecord.data as Record<string, unknown>)
      : undefined;
  const providerResults =
    data?.providers && typeof data.providers === "object"
      ? (data.providers as Record<string, unknown>)
      : undefined;
  const providerRecentMessages =
    providerResults?.RECENT_MESSAGES &&
    typeof providerResults.RECENT_MESSAGES === "object"
      ? (providerResults.RECENT_MESSAGES as Record<string, unknown>)
      : undefined;
  const providerRecentMessagesData =
    providerRecentMessages?.data &&
    typeof providerRecentMessages.data === "object"
      ? (providerRecentMessages.data as Record<string, unknown>)
      : undefined;

  const recentMessagesData = [
    stateRecord.recentMessagesData,
    stateRecord.recentMessages,
    providerRecentMessagesData?.recentMessages,
  ].find(Array.isArray);

  if (!Array.isArray(recentMessagesData)) {
    return [];
  }

  return recentMessagesData.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object",
  );
}

function isDeferredLifeDraftMessageEntry(
  item: Record<string, unknown>,
): boolean {
  const content =
    item.content && typeof item.content === "object"
      ? (item.content as Record<string, unknown>)
      : null;
  if (!content) {
    return false;
  }
  return Boolean(
    coerceDeferredLifeDraft(content.lifeDraft) ??
      coerceDeferredLifeDraft(
        content.data && typeof content.data === "object"
          ? (content.data as Record<string, unknown>).lifeDraft
          : undefined,
      ),
  );
}

function countTurnsSinceLatestDeferredLifeDraft(
  state: State | undefined,
): number | undefined {
  const entries = stateRecentMessageEntries(state);
  if (entries.length === 0) {
    return undefined;
  }

  let latestDraftIndex = -1;
  for (let index = entries.length - 1; index >= 0; index--) {
    if (isDeferredLifeDraftMessageEntry(entries[index])) {
      latestDraftIndex = index;
      break;
    }
  }
  if (latestDraftIndex < 0) {
    return undefined;
  }

  let turns = 0;
  for (const entry of entries.slice(latestDraftIndex + 1)) {
    const content =
      entry.content && typeof entry.content === "object"
        ? (entry.content as Record<string, unknown>)
        : null;
    if (!content || isDeferredLifeDraftMessageEntry(entry)) {
      continue;
    }
    if (typeof content.text === "string" && content.text.trim().length > 0) {
      turns++;
    }
  }
  return turns;
}

function latestDeferredLifeDraft(
  state: State | undefined,
): DeferredLifeDraft | null {
  for (const result of [...stateActionResults(state)].reverse()) {
    const resultData =
      result.data && typeof result.data === "object"
        ? (result.data as Record<string, unknown>)
        : null;
    const completedCreate =
      result.success &&
      resultData &&
      !coerceDeferredLifeDraft(resultData.lifeDraft) &&
      ((resultData.definition && typeof resultData.definition === "object") ||
        (resultData.goal && typeof resultData.goal === "object"));
    if (completedCreate) {
      return null;
    }

    const candidate = coerceDeferredLifeDraft(result.data?.lifeDraft);
    if (candidate) {
      return candidate;
    }
  }

  const messageDrafts = stateMessageDrafts(state);
  return messageDrafts.length > 0
    ? messageDrafts[messageDrafts.length - 1]
    : null;
}

function looksLikeDeferredLifeConfirmation(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  if (!normalized) return false;
  if (textMatchesAnyTerm(normalized, LIFE_NEGATIVE_TERMS)) return false;
  if (textMatchesAnyTerm(normalized, LIFE_DRAFT_EDIT_TERMS)) return false;
  return textMatchesAnyTerm(normalized, LIFE_AFFIRMATIVE_TERMS);
}

function deferredLifeDraftExpiryReason(args: {
  draft: DeferredLifeDraft | null;
  turnsSinceDraft?: number;
}): "age" | "turns" | null {
  if (!args.draft) {
    return null;
  }

  if (args.draft.createdAt) {
    const ageMs = Date.now() - args.draft.createdAt;
    if (ageMs >= DRAFT_EXPIRY_MS) {
      return "age";
    }
  }
  if (
    typeof args.turnsSinceDraft === "number" &&
    args.turnsSinceDraft >= DRAFT_MAX_TURNS
  ) {
    return "turns";
  }
  return null;
}

function looksLikeDeferredLifeDraftEdit(text: string): boolean {
  const normalized = normalizeIntentText(text);
  if (!normalized || looksLikeDeferredLifeConfirmation(text)) return false;
  if (textMatchesAnyTerm(normalized, LIFE_NEGATIVE_TERMS)) return false;
  if (textMatchesAnyTerm(normalized, LIFE_DRAFT_EDIT_TERMS)) return true;
  return hasCadenceHint(normalized) || /\b\d+\b/.test(normalized);
}

function resolveDeferredLifeDraftReuseMode(args: {
  currentText: string;
  details: Record<string, unknown> | undefined;
  draft: DeferredLifeDraft | null;
  explicitAction: LifeAction | undefined;
  paramsIntent: string | undefined;
  target: string | undefined;
  title: string | undefined;
  /** Number of messages since the draft was stored. */
  turnsSinceDraft?: number;
}): DeferredLifeDraftReuseMode | null {
  if (!args.draft) {
    return null;
  }

  if (deferredLifeDraftExpiryReason(args)) {
    return null;
  }

  if (detailBoolean(args.details, "confirmed") === true) {
    return "confirm";
  }

  const words = args.currentText.trim().split(/\s+/).filter(Boolean);
  const isConfirmationFollowup =
    words.length > 0 &&
    words.length <= 6 &&
    !hasCadenceHint(args.currentText.toLowerCase()) &&
    looksLikeDeferredLifeConfirmation(args.currentText);
  if (isConfirmationFollowup) {
    if (
      args.explicitAction &&
      ACTION_TO_OPERATION[args.explicitAction] !== args.draft.operation
    ) {
      return null;
    }
    return "confirm";
  }

  const normalizedCurrentText = normalizeIntentText(args.currentText);
  const normalizedParamsIntent =
    typeof args.paramsIntent === "string" && args.paramsIntent.trim().length > 0
      ? normalizeIntentText(args.paramsIntent)
      : "";
  if (
    normalizedParamsIntent &&
    normalizedParamsIntent !== normalizedCurrentText &&
    !looksLikeDeferredLifeConfirmation(args.paramsIntent ?? "")
  ) {
    return null;
  }

  if (
    args.explicitAction &&
    ACTION_TO_OPERATION[args.explicitAction] !== args.draft.operation
  ) {
    return null;
  }

  if (args.title || args.target) {
    return null;
  }
  return looksLikeDeferredLifeDraftEdit(args.currentText) ? "edit" : null;
}

async function resolveGoal(
  service: LifeOpsService,
  target: string | undefined,
  domain?: LifeOpsDomain,
): Promise<LifeOpsGoalRecord | null> {
  if (!target) return null;
  const goals = (await service.listGoals()).filter((e) =>
    domain ? e.goal.domain === domain : true,
  );
  return goals.find((e) => e.goal.id === target) ?? matchByTitle(goals, target);
}

async function resolveDefinition(
  service: LifeOpsService,
  target: string | undefined,
  domain?: LifeOpsDomain,
): Promise<LifeOpsDefinitionRecord | null> {
  if (!target) return null;
  const defs = (await service.listDefinitions()).filter((e) =>
    domain ? e.definition.domain === domain : true,
  );
  return (
    defs.find((e) => e.definition.id === target) ?? matchByTitle(defs, target)
  );
}

function tokenizeTitle(value: string): string[] {
  return normalizeTitle(value)
    .split(" ")
    .filter((token) => token.length >= 3);
}

async function resolveDefinitionFromIntent(
  service: LifeOpsService,
  target: string | undefined,
  intent: string,
  domain?: LifeOpsDomain,
): Promise<LifeOpsDefinitionRecord | null> {
  const direct = await resolveDefinition(service, target, domain);
  if (direct) {
    return direct;
  }
  const defs = (await service.listDefinitions()).filter((entry) =>
    domain ? entry.definition.domain === domain : true,
  );
  const intentTokens = new Set(tokenizeTitle(intent));
  let best: LifeOpsDefinitionRecord | null = null;
  let bestScore = 0;
  let tied = false;
  for (const entry of defs) {
    const title = normalizeTitle(entry.definition.title);
    if (title.length > 0 && normalizeTitle(intent).includes(title)) {
      return entry;
    }
    const overlap = tokenizeTitle(entry.definition.title).filter((token) =>
      intentTokens.has(token),
    ).length;
    if (overlap === 0) {
      continue;
    }
    if (overlap > bestScore) {
      best = entry;
      bestScore = overlap;
      tied = false;
      continue;
    }
    if (overlap === bestScore) {
      tied = true;
    }
  }
  return bestScore > 0 && !tied ? best : null;
}

type OccurrenceResult = {
  match:
    | Awaited<
        ReturnType<LifeOpsService["getOverview"]>
      >["owner"]["occurrences"][number]
    | null;
  /** Non-empty only when resolution was ambiguous (2+ substring matches, no exact/prefix winner). */
  ambiguousCandidates: string[];
};

function formatOccurrenceDisambiguationLabel(
  occurrence: Awaited<
    ReturnType<LifeOpsService["getOverview"]>
  >["owner"]["occurrences"][number],
): string {
  const hints: string[] = [];
  if (
    typeof occurrence.windowName === "string" &&
    occurrence.windowName.trim()
  ) {
    hints.push(occurrence.windowName.trim());
  }
  if (occurrence.dueAt) {
    const dueAt = new Date(occurrence.dueAt);
    if (!Number.isNaN(dueAt.getTime())) {
      hints.push(
        dueAt.toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      );
    }
  }
  return hints.length > 0
    ? `${occurrence.title} (${hints.join(", ")})`
    : occurrence.title;
}

async function resolveOccurrence(
  service: LifeOpsService,
  target: string | undefined,
  domain?: LifeOpsDomain,
): Promise<OccurrenceResult> {
  if (!target) return { match: null, ambiguousCandidates: [] };
  const overview = await service.getOverview();
  const all = [
    ...overview.owner.occurrences,
    ...overview.agentOps.occurrences,
  ].filter((o) => (domain ? o.domain === domain : true));
  const normalized = normalizeTitle(target);

  // Exact ID match
  const byId = all.find((o) => o.id === target);
  if (byId) return { match: byId, ambiguousCandidates: [] };

  // Exact normalized-title match
  const exactMatches = all.filter(
    (o) => normalizeTitle(o.title) === normalized,
  );
  if (exactMatches.length === 1) {
    return { match: exactMatches[0], ambiguousCandidates: [] };
  }
  if (exactMatches.length > 1) {
    return {
      match: null,
      ambiguousCandidates: exactMatches.map(
        formatOccurrenceDisambiguationLabel,
      ),
    };
  }

  // Substring matches — disambiguate when multiple
  const substringMatches = all.filter((o) =>
    normalizeTitle(o.title).includes(normalized),
  );
  if (substringMatches.length === 1) {
    return { match: substringMatches[0], ambiguousCandidates: [] };
  }
  if (substringMatches.length > 1) {
    // Prefer startsWith over generic includes
    const startsWithMatches = substringMatches.filter((o) =>
      normalizeTitle(o.title).startsWith(normalized),
    );
    if (startsWithMatches.length === 1) {
      return { match: startsWithMatches[0], ambiguousCandidates: [] };
    }
    if (startsWithMatches.length > 1) {
      return {
        match: null,
        ambiguousCandidates: startsWithMatches.map(
          formatOccurrenceDisambiguationLabel,
        ),
      };
    }
    // Still ambiguous — return candidates for the caller to list
    return {
      match: null,
      ambiguousCandidates: substringMatches.map(
        formatOccurrenceDisambiguationLabel,
      ),
    };
  }

  const targetTokens = normalized.split(/\s+/).filter(Boolean);
  if (targetTokens.length > 1) {
    const tokenSetMatches = all.filter((occurrence) => {
      const occurrenceTokens = new Set(
        normalizeTitle(occurrence.title).split(/\s+/).filter(Boolean),
      );
      return targetTokens.every((token) => occurrenceTokens.has(token));
    });
    if (tokenSetMatches.length === 1) {
      return { match: tokenSetMatches[0], ambiguousCandidates: [] };
    }
    if (tokenSetMatches.length > 1) {
      return {
        match: null,
        ambiguousCandidates: tokenSetMatches.map(
          formatOccurrenceDisambiguationLabel,
        ),
      };
    }
  }

  return { match: null, ambiguousCandidates: [] };
}

function deriveOccurrenceTargetFromIntent(
  intent: string,
  operation: LifeOperation,
): string | null {
  const normalized = normalizeLifeInputText(intent);
  if (!normalized) {
    return null;
  }

  let candidate = normalized;
  if (operation === "snooze_occurrence") {
    candidate = candidate
      .replace(
        /^(?:please\s+)?(?:snooze|postpone|push\b.*\bback|remind me later about)\s+/i,
        "",
      )
      .replace(
        /\bfor\s+\d+\s*(?:minutes?|hours?)\b.*$/i,
        "",
      )
      .replace(/\b(?:until|til)\b.+$/i, "")
      .trim();
  } else if (operation === "skip_occurrence") {
    candidate = candidate
      .replace(/^(?:please\s+)?(?:skip|pass on)\s+/i, "")
      .replace(/\b(?:today|tonight|for now)\b.*$/i, "")
      .trim();
  } else if (operation === "complete_occurrence") {
    candidate = candidate
      .replace(
        /^(?:please\s+)?(?:mark\s+|i(?:'ve| have)?\s+|just\s+)?(?:done|completed|finished|did)\s+/i,
        "",
      )
      .replace(/\b(?:done|complete|completed|finished)\b.*$/i, "")
      .trim();
  }

  return candidate.length > 0 ? candidate : null;
}

async function resolveOccurrenceWithIntentFallback(args: {
  service: LifeOpsService;
  target: string | undefined;
  domain?: LifeOpsDomain;
  intent: string;
  operation: LifeOperation;
}): Promise<OccurrenceResult> {
  const direct = await resolveOccurrence(args.service, args.target, args.domain);
  if (direct.match || direct.ambiguousCandidates.length > 0) {
    return direct;
  }

  const fallbackTarget = deriveOccurrenceTargetFromIntent(
    args.intent,
    args.operation,
  );
  if (
    !fallbackTarget ||
    (args.target &&
      normalizeTitle(fallbackTarget) === normalizeTitle(args.target))
  ) {
    return direct;
  }

  return resolveOccurrence(args.service, fallbackTarget, args.domain);
}

function summarizeCadence(cadence: LifeOpsCadence): string {
  switch (cadence.kind) {
    case "once": {
      const dueAt = new Date(cadence.dueAt);
      if (Number.isNaN(dueAt.getTime())) {
        return "once";
      }
      return `once on ${dueAt.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: resolveDefaultTimeZone(),
      })}`;
    }
    case "daily":
      return `every day in ${cadence.windows.join(", ")}`;
    case "times_per_day":
      return cadence.slots
        .map((slot) => slot.label?.trim() || `${slot.minuteOfDay}`)
        .filter(Boolean)
        .join(" and ");
    case "interval":
      return `every ${cadence.everyMinutes} minutes in ${cadence.windows.join(", ")}`;
    case "weekly":
      return `weekly on ${cadence.weekdays
        .map(
          (weekday) =>
            [
              "Sunday",
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
            ][weekday] ?? String(weekday),
        )
        .join(", ")}`;
  }
}

type LifeReplyScenario =
  | "reply_only"
  | "clarify_create_definition"
  | "clarify_create_goal"
  | "preview_definition"
  | "saved_definition"
  | "preview_goal"
  | "saved_goal"
  | "updated_definition"
  | "updated_goal"
  | "deleted_definition"
  | "deleted_goal"
  | "completed_occurrence"
  | "skipped_occurrence"
  | "snoozed_occurrence"
  | "set_reminder_preference"
  | "captured_phone"
  | "configured_escalation"
  | "service_error";

function extractNaturalTimePhrase(intent: string): string | null {
  const normalized = normalizeLifeInputText(intent).toLowerCase();
  if (/\bmornings?\s+only\b|\bmornings?\b/.test(normalized)) {
    return "mornings now";
  }
  if (/\bafternoons?\s+only\b|\bafternoons?\b/.test(normalized)) {
    return "afternoons now";
  }
  if (/\bevenings?\s+only\b|\bevenings?\b/.test(normalized)) {
    return "evenings now";
  }
  if (/\bnights?\s+only\b|\bnights?\b/.test(normalized)) {
    return "nights now";
  }
  const timeMatch = normalized.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/);
  if (timeMatch?.[1]) {
    return `${timeMatch[1].replace(/\s+/g, "")} now`;
  }
  return null;
}

function buildRuleBasedLifeReply(args: {
  scenario: LifeReplyScenario;
  intent: string;
  fallback: string;
  context?: Record<string, unknown>;
}): string {
  const context = args.context ?? {};
  const updated =
    context.updated && typeof context.updated === "object"
      ? (context.updated as Record<string, unknown>)
      : null;
  const created =
    context.created && typeof context.created === "object"
      ? (context.created as Record<string, unknown>)
      : null;
  const title =
    (typeof updated?.title === "string" ? updated.title : null) ??
    (typeof created?.title === "string" ? created.title : null) ??
    (typeof context.title === "string" ? context.title : null) ??
    null;
  const timePhrase = extractNaturalTimePhrase(args.intent);

  switch (args.scenario) {
    case "updated_definition":
      if (title && timePhrase) {
        return `${title} is set for ${timePhrase}.`;
      }
      if (title) {
        return `${title} is updated.`;
      }
      break;
    case "deleted_definition":
      if (title) {
        return `${title} is off your list.`;
      }
      break;
    case "deleted_goal":
      if (title) {
        return `${title} is off your goals list.`;
      }
      break;
    case "completed_occurrence":
      if (title) {
        return `Marked ${title} done.`;
      }
      break;
    case "skipped_occurrence":
      if (title) {
        return `Okay, skipping ${title} for now.`;
      }
      break;
    case "snoozed_occurrence":
      if (title) {
        return `Okay, I'll bring ${title} back a bit later.`;
      }
      break;
    default:
      break;
  }

  return args.fallback;
}

function normalizeLifeReplyText(raw: string): string {
  return raw
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();
}

function looksLikeStructuredLifeReply(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) {
    return true;
  }
  if (parseJSONObjectFromText(trimmed)) {
    return true;
  }
  return /^(?:operation|confidence|shouldAct|missing)\s*:/m.test(trimmed);
}

async function renderLifeActionReply(args: {
  runtime: IAgentRuntime;
  message: Memory;
  state: State | undefined;
  intent: string;
  scenario: LifeReplyScenario;
  fallback: string;
  context?: Record<string, unknown>;
}): Promise<string> {
  const { runtime, message, state, intent, scenario, fallback, context } = args;
  const naturalFallback = buildRuleBasedLifeReply({
    scenario,
    intent,
    fallback,
    context,
  });
  if (typeof runtime.useModel !== "function") {
    return naturalFallback;
  }

  const recentConversation = await recentConversationTexts({
    runtime,
    message,
    state,
    limit: 12,
  });
  const prompt = [
    "Write the assistant's user-facing reply for a LifeOps / todo interaction.",
    "Be natural, brief, and grounded in the provided context.",
    "Mirror the user's tone lightly without parodying them.",
    "Mirror the user's phrasing for time and date when possible.",
    "Prefer phrases like 'tomorrow morning', 'every night', '7 am', or the user's own wording over robotic schedule language.",
    "Never surface raw ISO timestamps unless the user used raw ISO timestamps.",
    "Never mention internal schema words like create_definition, cadence, times_per_day, windowPolicy, or metadata.",
    "If asking a clarifying question, ask only for the missing information.",
    "If this is a preview, make clear it is not saved yet and the user can confirm or change it, but do that naturally rather than with stock canned phrasing.",
    "If this is reply-only, do not pretend you saved or changed anything.",
    "Return only the reply text.",
    "",
    `Scenario: ${scenario}`,
    `Current user message: ${JSON.stringify(messageText(message))}`,
    `Resolved intent: ${JSON.stringify(intent)}`,
    `Recent conversation: ${JSON.stringify(recentConversation.join("\n"))}`,
    `Structured context: ${JSON.stringify(context ?? {})}`,
    `Canonical fallback: ${JSON.stringify(fallback)}`,
  ].join("\n");

  try {
    const result = await runtime.useModel(ModelType.TEXT_LARGE, { prompt });
    const raw = typeof result === "string" ? result : "";
    if (looksLikeStructuredLifeReply(raw)) {
      return naturalFallback;
    }
    const text = normalizeLifeReplyText(raw);
    return text || naturalFallback;
  } catch {
    return naturalFallback;
  }
}

function buildLifeClarificationFallback(args: {
  missing: ExtractedLifeMissingField[];
  operation: LifeOperation | null;
}): string {
  const missing = new Set(args.missing);
  if (args.operation === "create_goal") {
    return "What do you want the goal to be?";
  }
  if (missing.has("title") && missing.has("schedule")) {
    return "What do you want the todo to be, and when should it happen?";
  }
  if (missing.has("title")) {
    return "What do you want it to be?";
  }
  if (missing.has("schedule")) {
    return "When should it happen?";
  }
  return "Tell me a bit more about what you want to set up.";
}

function buildLifeServiceErrorFallback(
  error: LifeOpsServiceError,
  intent: string,
): string {
  const normalized = error.message.toLowerCase();
  if (
    normalized.includes("utc 'z' suffix") ||
    normalized.includes("local datetime without 'z'") ||
    normalized.includes("time didn't parse") ||
    normalized.includes("invalid dueat") ||
    normalized.includes("cadence.dueat")
  ) {
    return `I couldn't pin down the reminder time from "${intent}". Tell me the time again in plain language, like "Friday at 8 pm Pacific."`;
  }
  if (
    normalized.includes("when windowpreset is not provided") ||
    normalized.includes("startat is required")
  ) {
    return "I still need the time for that reminder. Tell me when it should happen.";
  }
  if (error.status === 429 || normalized.includes("rate limit")) {
    return "LifeOps is rate-limited right now. Try again in a bit.";
  }
  return "I couldn't finish that LifeOps change yet. Tell me the task and timing again, and I'll try it a different way.";
}

// ── Calendar/email formatters ─────────────────────────

function slugifyValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function parseNumberWord(token: string): number | null {
  switch (token.trim().toLowerCase()) {
    case "one":
    case "once":
      return 1;
    case "two":
    case "twice":
      return 2;
    case "three":
      return 3;
    case "four":
      return 4;
    case "five":
      return 5;
    case "six":
      return 6;
    case "seven":
      return 7;
    default: {
      const parsed = Number.parseInt(token, 10);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
  }
}

function weekdaysForFrequency(count: number): number[] {
  if (count <= 1) return [1];
  if (count === 2) return [1, 4];
  if (count === 3) return [1, 3, 5];
  if (count === 4) return [1, 2, 4, 6];
  if (count === 5) return [1, 2, 3, 4, 5];
  if (count === 6) return [0, 1, 2, 3, 4, 5];
  return [0, 1, 2, 3, 4, 5, 6];
}

function inferWebsiteTargetsFromIntent(intent: string): string[] {
  const lower = intent.toLowerCase();
  const normalized = new Set(
    normalizeWebsiteTargets(extractWebsiteTargetsFromText(intent)),
  );
  const blockContext =
    /\b(blocks?|blocked|blocking|unlocks?|unblock|locked|locks?|focus|self ?control)\b/.test(
      lower,
    );
  if (!blockContext) {
    return [...normalized];
  }
  if (/\b(?:x|twitter)\b/.test(lower)) {
    normalized.add("x.com");
    normalized.add("twitter.com");
  }
  if (/\bfacebook\b/.test(lower)) {
    normalized.add("facebook.com");
  }
  if (/\binstagram\b/.test(lower)) {
    normalized.add("instagram.com");
  }
  if (/\bgoogle news\b/.test(lower)) {
    normalized.add("news.google.com");
  }
  if (/\bhacker news\b/.test(lower)) {
    normalized.add("news.ycombinator.com");
  }
  if (/\by combinator\b|\byc\b/.test(lower)) {
    normalized.add("ycombinator.com");
  }
  return [...normalized].sort();
}

const UNLOCK_UNTIL_DONE_TERMS = [
  "until i say done",
  "until i say i'm done",
  "until i say im done",
  "until i'm done",
  "until im done",
  "until i say stop",
  "until i lock it again",
  "until i lock again",
  "until i relock",
  "until i re-lock",
] as const;

function inferWebsiteAccessPolicyFromIntent(
  intent: string,
  title: string,
): CreateLifeOpsDefinitionRequest["websiteAccess"] | undefined {
  const lower = intent.toLowerCase();
  if (
    !/\b(blocks?|blocked|blocking|unlocks?|unblock|locked|locks?|focus|self ?control)\b/.test(
      lower,
    )
  ) {
    return undefined;
  }

  const websites = inferWebsiteTargetsFromIntent(intent);
  if (websites.length === 0) {
    return undefined;
  }

  const manualUnlock = UNLOCK_UNTIL_DONE_TERMS.some((t) =>
    textIncludesKeywordTerm(lower, t),
  );
  const callbackMatch = lower.match(
    /\b(?:unlock|unblock)\b.*\buntil ([a-z0-9][a-z0-9\s_-]{1,40}?) (?:happens|is done|is over|completes|finishes|ends)\b/,
  );
  const explicitUnlockDuration =
    /\b(?:unlock|unblock)\b/.test(lower) || /\bfor a while\b/.test(lower)
      ? extractDurationMinutesFromText(intent)
      : null;

  const groupKey = `earned-access-${slugifyValue(websites.join("-")) || slugifyValue(title) || "web"}`;
  if (manualUnlock) {
    return {
      groupKey,
      websites,
      unlockMode: "until_manual_lock",
      reason: `Earn access to ${websites.join(", ")} after completing ${title}.`,
    };
  }
  if (callbackMatch?.[1]) {
    const callbackKey = slugifyValue(callbackMatch[1]);
    if (callbackKey) {
      return {
        groupKey,
        websites,
        unlockMode: "until_callback",
        callbackKey,
        reason: `Earn access to ${websites.join(", ")} after completing ${title}.`,
      };
    }
  }
  return {
    groupKey,
    websites,
    unlockMode: "fixed_duration",
    unlockDurationMinutes:
      explicitUnlockDuration && explicitUnlockDuration > 0
        ? explicitUnlockDuration
        : 60,
    reason: `Earn access to ${websites.join(", ")} after completing ${title}.`,
  };
}

// ── i18n time-window terms ──────────────────────────
const WINDOW_MORNING_TERMS = [
  "morning", "mornings", "wake up", "wake-up", "breakfast", "before work",
  "早上", "起床", "早餐", "上班前",
  "아침", "기상", "아침식사", "출근 전",
  "mañana", "desayuno", "antes del trabajo",
  "manhã", "café da manhã", "cafe da manha", "antes do trabalho",
  "sáng", "buổi sáng", "trước khi làm",
  "umaga", "bago magtrabaho",
] as const;

const WINDOW_AFTERNOON_TERMS = [
  "afternoon", "afternoons", "lunch", "after lunch", "midday", "mid-day", "during the day",
  "下午", "午餐", "中午",
  "오후", "점심", "낮",
  "tarde", "almuerzo", "después del almuerzo",
  "tarde", "almoço", "depois do almoço",
  "chiều", "buổi trưa", "sau bữa trưa",
  "hapon", "tanghalian",
] as const;

const WINDOW_EVENING_TERMS = [
  "evening", "evenings", "after work", "dinner",
  "傍晚", "下班后", "晚餐",
  "저녁", "퇴근 후", "저녁식사",
  "noche", "después del trabajo", "cena",
  "noite", "depois do trabalho", "jantar",
  "tối", "sau giờ làm", "bữa tối",
  "gabi", "pagkatapos magtrabaho", "hapunan",
] as const;

const WINDOW_NIGHT_TERMS = [
  "night", "nights", "bedtime", "before bed", "before sleep", "before i sleep",
  "before going to bed", "before i go to bed",
  "夜晚", "睡前", "睡觉前",
  "밤", "취침", "자기 전",
  "noche", "antes de dormir", "hora de dormir",
  "noite", "antes de dormir", "hora de dormir",
  "đêm", "trước khi ngủ",
  "gabi", "bago matulog",
] as const;

function extractIntentWindows(
  intent: string,
): Array<"morning" | "afternoon" | "evening" | "night"> {
  const lower = intent.toLowerCase();
  const windows: Array<"morning" | "afternoon" | "evening" | "night"> = [];
  if (textMatchesAnyTerm(lower, WINDOW_MORNING_TERMS)) windows.push("morning");
  if (textMatchesAnyTerm(lower, WINDOW_AFTERNOON_TERMS)) windows.push("afternoon");
  if (textMatchesAnyTerm(lower, WINDOW_EVENING_TERMS)) windows.push("evening");
  if (textMatchesAnyTerm(lower, WINDOW_NIGHT_TERMS)) windows.push("night");
  return windows;
}

function extractIntentWeekdays(intent: string): number[] {
  const lower = intent.toLowerCase();
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
    .map((match) => {
      const weekdayToken = match[1]?.toLowerCase() ?? "";
      if (weekdayToken.startsWith("sun")) return 0;
      if (weekdayToken.startsWith("mon")) return 1;
      if (weekdayToken.startsWith("tue")) return 2;
      if (weekdayToken.startsWith("wed")) return 3;
      if (weekdayToken.startsWith("thu")) return 4;
      if (weekdayToken.startsWith("fri")) return 5;
      if (weekdayToken.startsWith("sat")) return 6;
      return null;
    })
    .filter(
      (weekday): weekday is 0 | 1 | 2 | 3 | 4 | 5 | 6 => weekday !== null,
    );
  return [...new Set(matches)];
}

const DEFAULT_WINDOW_SLOT_TIMES: Record<
  "morning" | "afternoon" | "evening" | "night",
  { minuteOfDay: number; durationMinutes: number; label: string }
> = {
  morning: {
    minuteOfDay: 8 * 60,
    durationMinutes: 45,
    label: "Morning",
  },
  afternoon: {
    minuteOfDay: 13 * 60,
    durationMinutes: 45,
    label: "Afternoon",
  },
  evening: {
    minuteOfDay: 18 * 60,
    durationMinutes: 45,
    label: "Evening",
  },
  night: {
    minuteOfDay: 21 * 60,
    durationMinutes: 45,
    label: "Night",
  },
};

function buildSlotsFromWindows(
  windows: Array<"morning" | "afternoon" | "evening" | "night">,
): LifeOpsDailySlot[] {
  return windows.map((window, index) => {
    const preset = DEFAULT_WINDOW_SLOT_TIMES[window];
    return {
      key:
        windows.indexOf(window) === index ? window : `${window}-${index + 1}`,
      label: preset.label,
      minuteOfDay: preset.minuteOfDay,
      durationMinutes: preset.durationMinutes,
    };
  });
}

function buildDistributedDailySlots(count: number): LifeOpsDailySlot[] {
  const normalizedCount = Math.max(1, Math.min(6, count));
  const presets: Record<number, number[]> = {
    1: [9 * 60],
    2: [8 * 60, 21 * 60],
    3: [8 * 60, 13 * 60, 20 * 60],
    4: [8 * 60, 12 * 60, 16 * 60, 20 * 60],
    5: [8 * 60, 11 * 60, 14 * 60, 17 * 60, 20 * 60],
    6: [8 * 60, 10 * 60, 12 * 60, 14 * 60, 17 * 60, 20 * 60],
  };
  const minutes = presets[normalizedCount] ?? presets[1];
  return minutes.map((minuteOfDay, index) => ({
    key: `slot-${index + 1}`,
    label: `Time ${index + 1}`,
    minuteOfDay,
    durationMinutes: 45,
  }));
}

function inferWindowFromMinuteOfDay(
  minuteOfDay: number,
): "morning" | "afternoon" | "evening" | "night" {
  if (minuteOfDay < 12 * 60) {
    return "morning";
  }
  if (minuteOfDay < 17 * 60) {
    return "afternoon";
  }
  if (minuteOfDay < 21 * 60) {
    return "evening";
  }
  return "night";
}

function buildSingleDailySlot(
  minuteOfDay: number,
  durationMinutes = 45,
): LifeOpsDailySlot {
  return {
    key: `time-${minuteOfDay}`,
    label: formatMinuteOfDayLabel(minuteOfDay),
    minuteOfDay,
    durationMinutes,
  };
}

function addYearsToLocalDate(
  dateOnly: { year: number; month: number; day: number },
  yearDelta: number,
): { year: number; month: number; day: number } {
  const utcDate = new Date(
    Date.UTC(dateOnly.year + yearDelta, dateOnly.month - 1, dateOnly.day, 12),
  );
  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
  };
}

function buildCustomTimeWindowPolicy(
  minuteOfDay: number,
  timeZone: string,
): LifeOpsWindowPolicy {
  const basePolicy = resolveDefaultWindowPolicy(timeZone);
  return {
    timezone: basePolicy.timezone,
    windows: [
      ...basePolicy.windows,
      {
        name: "custom",
        label: formatMinuteOfDayLabel(minuteOfDay),
        startMinute: minuteOfDay,
        endMinute: Math.min(minuteOfDay + 1, 24 * 60),
      },
    ],
  };
}

function formatMinuteOfDayLabel(minuteOfDay: number): string {
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const meridiem = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0
    ? `${hour12}${meridiem}`
    : `${hour12}:${String(minute).padStart(2, "0")}${meridiem}`;
}

function parseClockToken(token: string): number | null {
  const normalized = token.trim().toLowerCase();
  if (normalized === "noon") {
    return 12 * 60;
  }
  if (normalized === "midnight") {
    return 0;
  }
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute >= 60) {
    return null;
  }
  if (hour < 1 || hour > 12) {
    return null;
  }
  const meridiem = match[3];
  const normalizedHour =
    meridiem === "am" ? hour % 12 : hour % 12 === 0 ? 12 : (hour % 12) + 12;
  return normalizedHour * 60 + minute;
}

function parseTimeOfDayToken(token: string): number | null {
  const normalized = normalizeLifeInputText(token).toLowerCase();
  const hhmmMatch = normalized.match(/^(\d{1,2}):(\d{2})$/);
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
      return hour * 60 + minute;
    }
  }
  return parseClockToken(normalized);
}

// ── i18n alarm / reminder terms ─────────────────────
const ALARM_TERMS = [
  "alarm", "wake me up", "wake-up", "wake up",
  "闹钟", "叫我起床",
  "알람", "깨워줘",
  "alarma", "despiértame", "despiertame",
  "alarme", "me acorde", "me acordar",
  "báo thức", "đánh thức tôi",
  "alarma", "gisingin mo ako",
] as const;

const REMINDER_TERMS_LOCAL = [
  "remind me", "remind", "reminder", "set a reminder", "set reminder",
  "create a reminder", "create reminder", "nudge me", "ping me",
  "提醒我", "提醒", "设置提醒",
  "알려줘", "리마인더", "알림 설정",
  "recuérdame", "recordatorio", "crear recordatorio",
  "lembre-me", "lembrete", "criar lembrete",
  "nhắc tôi", "nhắc nhở", "đặt nhắc nhở",
  "ipaalala", "paalala",
] as const;

function looksLikeAlarmRequest(intent: string): boolean {
  const lower = normalizeLifeInputText(intent).toLowerCase();
  return textMatchesAnyTerm(lower, ALARM_TERMS);
}

function looksLikeReminderRequest(intent: string): boolean {
  const lower = normalizeLifeInputText(intent).toLowerCase();
  return textMatchesAnyTerm(lower, REMINDER_TERMS_LOCAL);
}

function resolveAlarmTitle(intent: string): string {
  const lower = normalizeLifeInputText(intent).toLowerCase();
  return /\bwake(?:-|\s)?up\b|\bwake me up\b/.test(lower) ? "Wake up" : "Alarm";
}

function resolveAlarmDayOffset(intent: string): number | null {
  const lower = normalizeLifeInputText(intent).toLowerCase();
  if (/\btomorrow\b/.test(lower)) return 1;
  if (/\b(today|tonight)\b/.test(lower)) return 0;
  return null;
}

function buildOneOffDueAtFromMinuteOfDay(args: {
  intent?: string;
  minuteOfDay: number;
  now?: Date;
  timeZone?: string;
}): string {
  const now = args.now ?? new Date();
  const timeZone = args.timeZone ?? resolveDefaultTimeZone();
  const nowParts = getZonedDateParts(now, timeZone);
  let localDate = {
    year: nowParts.year,
    month: nowParts.month,
    day: nowParts.day,
  };

  const explicitDate =
    typeof args.intent === "string"
      ? parseExplicitLocalDateForLifeRequest(args.intent, timeZone, now)
      : null;
  if (explicitDate) {
    localDate = explicitDate;
  }

  const explicitDayOffset =
    typeof args.intent === "string" ? resolveAlarmDayOffset(args.intent) : null;
  if (explicitDate === null && explicitDayOffset !== null) {
    localDate = addDaysToLocalDate(localDate, explicitDayOffset);
  }

  const buildCandidate = () =>
    buildUtcDateFromLocalParts(timeZone, {
      ...localDate,
      hour: Math.floor(args.minuteOfDay / 60),
      minute: args.minuteOfDay % 60,
      second: 0,
    });

  let candidate = buildCandidate();
  if (candidate.getTime() <= now.getTime()) {
    if (explicitDate && !explicitDate.explicitYear) {
      localDate = addYearsToLocalDate(localDate, 1);
      candidate = buildCandidate();
    } else if (explicitDate === null && explicitDayOffset === null) {
      localDate = addDaysToLocalDate(localDate, 1);
      candidate = buildCandidate();
    }
  }

  return candidate.toISOString();
}

function deriveAlarmLikeDefaults(
  intent: string,
  timeZone?: string,
): {
  title: string;
  cadence?: LifeOpsCadence;
} | null {
  if (!looksLikeAlarmRequest(intent)) {
    return null;
  }

  const slots = extractExplicitDailySlots(intent);
  const slot = slots[0] ?? null;

  return {
    title: resolveAlarmTitle(intent),
    cadence:
      slot && !hasCadenceHint(intent)
        ? {
            kind: "once",
            dueAt: buildOneOffDueAtFromMinuteOfDay({
              intent,
              minuteOfDay: slot.minuteOfDay,
              timeZone,
            }),
          }
        : undefined,
  };
}

function deriveReminderLikeDefaults(
  intent: string,
  timeZone?: string,
): {
  title: string;
  cadence?: LifeOpsCadence;
} | null {
  if (!looksLikeReminderRequest(intent)) {
    return null;
  }

  const slots = extractExplicitDailySlots(intent);
  const slot = slots[0] ?? null;

  return {
    title: "Reminder",
    cadence:
      slot && !hasCadenceHint(intent)
        ? {
            kind: "once",
            dueAt: buildOneOffDueAtFromMinuteOfDay({
              intent,
              minuteOfDay: slot.minuteOfDay,
              timeZone,
            }),
          }
        : undefined,
  };
}

function resolveTimedRequestKind(args: {
  intent: string;
  llmRequestKind: NativeAppleReminderLikeKind | null;
  recentWindow?: string[];
}): NativeAppleReminderLikeKind | null {
  if (args.llmRequestKind) {
    return args.llmRequestKind;
  }
  if (looksLikeAlarmRequest(args.intent)) {
    return "alarm";
  }
  if (looksLikeReminderRequest(args.intent)) {
    return "reminder";
  }
  const normalizedIntent = normalizeLifeInputText(args.intent).toLowerCase();
  const isShortTimedFollowup =
    normalizedIntent.length <= 32 &&
    (/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/.test(
      normalizedIntent,
    ) ||
      /\b(today|tomorrow|tonight)\b/.test(normalizedIntent));
  if (isShortTimedFollowup) {
    for (const text of [...(args.recentWindow ?? [])].reverse()) {
      if (looksLikeAlarmRequest(text)) {
        return "alarm";
      }
      if (looksLikeReminderRequest(text)) {
        return "reminder";
      }
    }
  }
  return null;
}

function deriveTimedRequestDefaults(args: {
  intent: string;
  requestKind: NativeAppleReminderLikeKind | null;
  timeZone?: string;
}): {
  title: string;
  cadence?: LifeOpsCadence;
} | null {
  if (args.requestKind === "alarm") {
    return deriveAlarmLikeDefaults(args.intent, args.timeZone);
  }
  if (args.requestKind === "reminder") {
    return deriveReminderLikeDefaults(args.intent, args.timeZone);
  }
  return null;
}

function parseExplicitLocalDateForLifeRequest(
  value: string,
  timeZone: string,
  now = new Date(),
): { year: number; month: number; day: number; explicitYear: boolean } | null {
  const normalized = normalizeLifeInputText(value).toLowerCase();
  const localToday = getZonedDateParts(now, timeZone);
  const monthMap: Record<string, number> = {
    january: 1,
    jan: 1,
    february: 2,
    feb: 2,
    march: 3,
    mar: 3,
    april: 4,
    apr: 4,
    may: 5,
    june: 6,
    jun: 6,
    july: 7,
    jul: 7,
    august: 8,
    aug: 8,
    september: 9,
    sept: 9,
    sep: 9,
    october: 10,
    oct: 10,
    november: 11,
    nov: 11,
    december: 12,
    dec: 12,
  };
  const weekdayMap: Record<string, number> = {
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

  const isoMatch = normalized.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    return {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
      explicitYear: true,
    };
  }

  const monthNameMatch = normalized.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i,
  );
  if (monthNameMatch) {
    return {
      year: monthNameMatch[3] ? Number(monthNameMatch[3]) : localToday.year,
      month: monthMap[monthNameMatch[1].toLowerCase().replace(/\./g, "")],
      day: Number(monthNameMatch[2]),
      explicitYear: Boolean(monthNameMatch[3]),
    };
  }

  const numericMatch = normalized.match(
    /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/,
  );
  if (numericMatch) {
    const yearRaw = numericMatch[3];
    const year =
      yearRaw === undefined
        ? localToday.year
        : yearRaw.length === 2
          ? 2000 + Number(yearRaw)
          : Number(yearRaw);
    return {
      year,
      month: Number(numericMatch[1]),
      day: Number(numericMatch[2]),
      explicitYear: Boolean(yearRaw),
    };
  }

  const weekdayMatch = normalized.match(
    /\b(?:(this|next)\s+)?(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)\b/i,
  );
  if (!weekdayMatch) {
    return null;
  }

  const weekdayToken = weekdayMatch[2]?.toLowerCase();
  const targetWeekday = weekdayToken ? weekdayMap[weekdayToken] : undefined;
  if (targetWeekday === undefined) {
    return null;
  }

  const qualifier = weekdayMatch[1]?.toLowerCase() ?? "";
  const currentWeekday = new Date(
    Date.UTC(
      localToday.year,
      Math.max(0, localToday.month - 1),
      localToday.day,
      12,
    ),
  ).getUTCDay();
  let delta = (targetWeekday - currentWeekday + 7) % 7;
  if (qualifier === "next") {
    delta = delta === 0 ? 7 : delta + 7;
  }
  const resolved = addDaysToLocalDate(
    {
      year: localToday.year,
      month: localToday.month,
      day: localToday.day,
    },
    delta,
  );
  return {
    ...resolved,
    explicitYear: false,
  };
}

function mergeMetadataRecords(
  ...records: Array<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined {
  const merged = Object.assign(
    {},
    ...records.filter(
      (record): record is Record<string, unknown> =>
        record != null && Object.keys(record).length > 0,
    ),
  );
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function extractExplicitDailySlots(intent: string): LifeOpsDailySlot[] {
  const tokens = [
    ...intent.matchAll(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/gi),
  ].map((match) => match[1]);
  const seen = new Set<number>();
  const slots: LifeOpsDailySlot[] = [];
  for (const [index, token] of tokens.entries()) {
    const minuteOfDay = parseClockToken(token);
    if (minuteOfDay === null || seen.has(minuteOfDay)) {
      continue;
    }
    seen.add(minuteOfDay);
    slots.push({
      key: `clock-${index + 1}`,
      label: token.trim(),
      minuteOfDay,
      durationMinutes: 45,
    });
  }
  return slots.sort((left, right) => left.minuteOfDay - right.minuteOfDay);
}

function normalizeLifeWindows(
  value: unknown,
): Array<"morning" | "afternoon" | "evening" | "night"> {
  const values = Array.isArray(value) ? value : value == null ? [] : [value];
  const normalized = values.flatMap((entry) => {
    if (typeof entry !== "string") {
      return [];
    }
    const lower = normalizeLifeInputText(entry).toLowerCase();
    if (lower === "morning") return ["morning" as const];
    if (lower === "afternoon") return ["afternoon" as const];
    if (lower === "evening") return ["evening" as const];
    if (lower === "night") return ["night" as const];
    return [];
  });
  return [...new Set(normalized)];
}

function normalizeCadenceDetail(value: unknown): LifeOpsCadence | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const cadenceKind =
    typeof record.kind === "string"
      ? normalizeLifeInputText(record.kind).toLowerCase()
      : typeof record.type === "string"
        ? normalizeLifeInputText(record.type).toLowerCase()
        : "";

  if (!cadenceKind) {
    return undefined;
  }

  if (cadenceKind === "once" && typeof record.dueAt === "string") {
    return {
      kind: "once",
      dueAt: record.dueAt,
    };
  }

  if (cadenceKind === "interval") {
    const everyMinutes =
      typeof record.everyMinutes === "number"
        ? record.everyMinutes
        : typeof record.everyMinutes === "string"
          ? Number(record.everyMinutes)
          : typeof record.minutes === "number"
            ? record.minutes
            : typeof record.minutes === "string"
              ? Number(record.minutes)
              : NaN;
    if (Number.isFinite(everyMinutes) && everyMinutes > 0) {
      return {
        kind: "interval",
        everyMinutes,
        windows: normalizeLifeWindows(record.windows),
      };
    }
    return undefined;
  }

  if (cadenceKind === "weekly") {
    const weekdays = Array.isArray(record.weekdays)
      ? record.weekdays
          .map((entry) =>
            typeof entry === "number"
              ? entry
              : typeof entry === "string"
                ? Number(entry)
                : NaN,
          )
          .filter((entry) => Number.isFinite(entry))
      : [];
    if (weekdays.length > 0) {
      return {
        kind: "weekly",
        weekdays,
        windows: normalizeLifeWindows(record.windows),
      };
    }
    return undefined;
  }

  const explicitTimes = Array.isArray(record.times)
    ? record.times
        .map((entry) =>
          typeof entry === "string" ? parseTimeOfDayToken(entry) : null,
        )
        .filter((entry): entry is number => entry !== null)
    : [];
  if (explicitTimes.length > 0) {
    return {
      kind: "times_per_day",
      slots: explicitTimes.map((minuteOfDay, index) => ({
        key: `time-${index + 1}`,
        label: formatMinuteOfDayLabel(minuteOfDay),
        minuteOfDay,
        durationMinutes: 45,
      })),
      visibilityLeadMinutes: 90,
      visibilityLagMinutes: 180,
    };
  }

  if (cadenceKind === "times_per_day") {
    if (Array.isArray(record.slots)) {
      const slots = record.slots
        .map((entry, index) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            return null;
          }
          const slot = entry as Record<string, unknown>;
          const minuteOfDay =
            typeof slot.minuteOfDay === "number"
              ? slot.minuteOfDay
              : typeof slot.minuteOfDay === "string"
                ? Number(slot.minuteOfDay)
                : null;
          if (minuteOfDay === null || !Number.isFinite(minuteOfDay)) {
            return null;
          }
          return {
            key:
              typeof slot.key === "string" && slot.key.trim().length > 0
                ? slot.key
                : `slot-${index + 1}`,
            label:
              typeof slot.label === "string" && slot.label.trim().length > 0
                ? slot.label
                : formatMinuteOfDayLabel(minuteOfDay),
            minuteOfDay,
            durationMinutes:
              typeof slot.durationMinutes === "number" &&
              Number.isFinite(slot.durationMinutes) &&
              slot.durationMinutes > 0
                ? slot.durationMinutes
                : 45,
          } satisfies LifeOpsDailySlot;
        })
        .filter((entry): entry is LifeOpsDailySlot => entry !== null);
      if (slots.length > 0) {
        return {
          kind: "times_per_day",
          slots,
          visibilityLeadMinutes:
            typeof record.visibilityLeadMinutes === "number"
              ? record.visibilityLeadMinutes
              : 90,
          visibilityLagMinutes:
            typeof record.visibilityLagMinutes === "number"
              ? record.visibilityLagMinutes
              : 180,
        };
      }
    }

    const count =
      typeof record.count === "number"
        ? record.count
        : typeof record.count === "string"
          ? Number(record.count)
          : NaN;
    if (Number.isFinite(count) && count > 0) {
      return {
        kind: "times_per_day",
        slots: buildDistributedDailySlots(count),
        visibilityLeadMinutes: 90,
        visibilityLagMinutes: 180,
      };
    }
  }

  if (cadenceKind === "daily") {
    const windows = normalizeLifeWindows(record.windows ?? record.window);
    if (windows.length > 0) {
      return {
        kind: "daily",
        windows,
      };
    }
    return {
      kind: "daily",
      windows: ["morning"],
    };
  }

  return undefined;
}

/**
 * Convert LLM-extracted params into a typed LifeOpsCadence.
 * Returns null when the LLM output is insufficient to construct a
 * valid cadence, letting the caller fall back to regex-derived values.
 */
function buildCadenceFromLlmParams(
  params: import("./life-param-extractor.js").ExtractedTaskParams,
  context?: {
    intent?: string;
    now?: Date;
    timeZone?: string;
  },
): {
  cadence: LifeOpsCadence;
  windowPolicy?: CreateLifeOpsDefinitionRequest["windowPolicy"];
} | null {
  const kind = params.cadenceKind;
  if (!kind) return null;
  const effectiveTimeZone = context?.timeZone;
  const timeOfDayMinute =
    typeof params.timeOfDay === "string"
      ? parseTimeOfDayToken(params.timeOfDay)
      : null;
  const explicitSlots =
    typeof context?.intent === "string"
      ? extractExplicitDailySlots(context.intent)
      : [];
  const slotDuration =
    typeof params.durationMinutes === "number" && params.durationMinutes > 0
      ? params.durationMinutes
      : 45;

  const windows = (params.windows ?? []).filter(
    (w): w is "morning" | "afternoon" | "evening" | "night" =>
      w === "morning" || w === "afternoon" || w === "evening" || w === "night",
  );
  const effectiveWindows =
    windows.length > 0
      ? windows
      : timeOfDayMinute !== null
        ? [inferWindowFromMinuteOfDay(timeOfDayMinute)]
        : ["morning" as const];

  if (kind === "once") {
    if (timeOfDayMinute !== null) {
      return {
        cadence: {
          kind: "once",
          dueAt: buildOneOffDueAtFromMinuteOfDay({
            intent: context?.intent,
            minuteOfDay: timeOfDayMinute,
            now: context?.now,
            timeZone: effectiveTimeZone,
          }),
        },
      };
    }
    return { cadence: { kind: "once", dueAt: new Date().toISOString() } };
  }
  if (kind === "daily") {
    if (explicitSlots.length >= 2) {
      return {
        cadence: {
          kind: "times_per_day",
          slots: explicitSlots.map((slot) => ({
            ...slot,
            durationMinutes: slot.durationMinutes ?? slotDuration,
          })),
          visibilityLeadMinutes: 90,
          visibilityLagMinutes: 180,
        },
      };
    }
    if (timeOfDayMinute !== null) {
      return {
        cadence: {
          kind: "times_per_day",
          slots: [buildSingleDailySlot(timeOfDayMinute, slotDuration)],
          visibilityLeadMinutes: 90,
          visibilityLagMinutes: 180,
        },
      };
    }
    if (effectiveWindows.length >= 2) {
      return {
        cadence: {
          kind: "times_per_day",
          slots: buildSlotsFromWindows(effectiveWindows),
          visibilityLeadMinutes: 90,
          visibilityLagMinutes: 180,
        },
      };
    }
    return { cadence: { kind: "daily", windows: effectiveWindows } };
  }
  if (kind === "weekly") {
    const weekdays = params.weekdays;
    if (!weekdays || weekdays.length === 0) return null;
    if (timeOfDayMinute !== null) {
      return {
        cadence: { kind: "weekly", weekdays, windows: ["custom"] },
        windowPolicy: buildCustomTimeWindowPolicy(
          timeOfDayMinute,
          effectiveTimeZone ?? resolveDefaultTimeZone(),
        ),
      };
    }
    return { cadence: { kind: "weekly", weekdays, windows: effectiveWindows } };
  }
  if (kind === "interval") {
    const everyMinutes = params.everyMinutes;
    if (!everyMinutes || everyMinutes <= 0) return null;
    return {
      cadence: {
        kind: "interval",
        everyMinutes,
        windows: effectiveWindows,
        startMinuteOfDay: timeOfDayMinute ?? undefined,
        durationMinutes:
          typeof params.durationMinutes === "number" &&
          params.durationMinutes > 0
            ? params.durationMinutes
            : undefined,
      },
    };
  }
  if (kind === "times_per_day") {
    if (explicitSlots.length >= 2) {
      return {
        cadence: {
          kind: "times_per_day",
          slots: explicitSlots.map((slot) => ({
            ...slot,
            durationMinutes: slot.durationMinutes ?? slotDuration,
          })),
          visibilityLeadMinutes: 90,
          visibilityLagMinutes: 180,
        },
      };
    }
    if (timeOfDayMinute !== null) {
      return {
        cadence: {
          kind: "times_per_day",
          slots: [buildSingleDailySlot(timeOfDayMinute, slotDuration)],
          visibilityLeadMinutes: 90,
          visibilityLagMinutes: 180,
        },
      };
    }
    const count = params.timesPerDay;
    if (!count || count <= 0) return null;
    return {
      cadence: {
        kind: "times_per_day",
        slots: buildDistributedDailySlots(count).map((slot) => ({
          ...slot,
          durationMinutes: slotDuration,
        })),
        visibilityLeadMinutes: 90,
        visibilityLagMinutes: 180,
      },
    };
  }
  return null;
}

function buildCadenceFromUpdateFields(args: {
  currentCadence: LifeOpsCadence;
  currentWindowPolicy: LifeOpsWindowPolicy;
  update: import("./life-update-extractor.js").ExtractedUpdateFields;
  timeZone: string;
}): {
  cadence: LifeOpsCadence;
  windowPolicy?: UpdateLifeOpsDefinitionRequest["windowPolicy"];
} | null {
  const { currentCadence, currentWindowPolicy, timeZone, update } = args;
  const kind = (update.cadenceKind ??
    currentCadence.kind) as LifeOpsCadence["kind"];
  const requestedWindows = normalizeLifeWindows(update.windows ?? []);
  const timeOfDayMinute =
    typeof update.timeOfDay === "string"
      ? parseTimeOfDayToken(update.timeOfDay)
      : null;

  if (kind === "interval") {
    const everyMinutes =
      update.everyMinutes ??
      (currentCadence.kind === "interval" ? currentCadence.everyMinutes : null);
    if (!everyMinutes || everyMinutes <= 0) {
      return null;
    }
    const windows: Array<"morning" | "afternoon" | "evening" | "night"> =
      requestedWindows.length > 0
        ? requestedWindows
        : currentCadence.kind === "interval" &&
            currentCadence.windows.length > 0
          ? normalizeLifeWindows(currentCadence.windows)
          : timeOfDayMinute !== null
            ? [inferWindowFromMinuteOfDay(timeOfDayMinute)]
            : ["morning"];
    return {
      cadence: {
        kind: "interval",
        everyMinutes,
        windows,
        startMinuteOfDay:
          timeOfDayMinute ??
          (currentCadence.kind === "interval"
            ? currentCadence.startMinuteOfDay
            : undefined),
        maxOccurrencesPerDay:
          currentCadence.kind === "interval"
            ? currentCadence.maxOccurrencesPerDay
            : undefined,
        durationMinutes:
          currentCadence.kind === "interval"
            ? currentCadence.durationMinutes
            : undefined,
        visibilityLeadMinutes:
          currentCadence.kind === "interval"
            ? currentCadence.visibilityLeadMinutes
            : undefined,
        visibilityLagMinutes:
          currentCadence.kind === "interval"
            ? currentCadence.visibilityLagMinutes
            : undefined,
      },
    };
  }

  if (kind === "weekly") {
    const weekdays =
      update.weekdays ??
      (currentCadence.kind === "weekly" ? currentCadence.weekdays : null);
    if (!weekdays || weekdays.length === 0) {
      return null;
    }
    if (timeOfDayMinute !== null) {
      return {
        cadence: {
          kind: "weekly",
          weekdays,
          windows: ["custom"],
          visibilityLeadMinutes:
            currentCadence.kind === "weekly"
              ? currentCadence.visibilityLeadMinutes
              : undefined,
          visibilityLagMinutes:
            currentCadence.kind === "weekly"
              ? currentCadence.visibilityLagMinutes
              : undefined,
        },
        windowPolicy: buildCustomTimeWindowPolicy(timeOfDayMinute, timeZone),
      };
    }
    return {
      cadence: {
        kind: "weekly",
        weekdays,
        windows:
          requestedWindows.length > 0
            ? requestedWindows
            : currentCadence.kind === "weekly" &&
                currentCadence.windows.length > 0
              ? currentCadence.windows
              : ["morning"],
        visibilityLeadMinutes:
          currentCadence.kind === "weekly"
            ? currentCadence.visibilityLeadMinutes
            : undefined,
        visibilityLagMinutes:
          currentCadence.kind === "weekly"
            ? currentCadence.visibilityLagMinutes
            : undefined,
      },
      windowPolicy: currentWindowPolicy.windows.some((window) =>
        (requestedWindows.length > 0
          ? requestedWindows
          : ["morning" as const]
        ).includes(
          window.name as "morning" | "afternoon" | "evening" | "night",
        ),
      )
        ? undefined
        : resolveDefaultWindowPolicy(timeZone),
    };
  }

  if (kind === "daily") {
    if (timeOfDayMinute !== null) {
      return {
        cadence: {
          kind: "times_per_day",
          slots: [buildSingleDailySlot(timeOfDayMinute)],
          visibilityLeadMinutes: 90,
          visibilityLagMinutes: 180,
        },
      };
    }
    return {
      cadence: {
        kind: "daily",
        windows:
          requestedWindows.length > 0
            ? requestedWindows
            : currentCadence.kind === "daily" &&
                currentCadence.windows.length > 0
              ? currentCadence.windows
              : ["morning"],
        visibilityLeadMinutes:
          currentCadence.kind === "daily"
            ? currentCadence.visibilityLeadMinutes
            : undefined,
        visibilityLagMinutes:
          currentCadence.kind === "daily"
            ? currentCadence.visibilityLagMinutes
            : undefined,
      },
    };
  }

  if (kind === "times_per_day") {
    if (timeOfDayMinute !== null) {
      return {
        cadence: {
          kind: "times_per_day",
          slots: [buildSingleDailySlot(timeOfDayMinute)],
          visibilityLeadMinutes: 90,
          visibilityLagMinutes: 180,
        },
      };
    }
    if (requestedWindows.length > 0) {
      return {
        cadence: {
          kind: "times_per_day",
          slots: buildSlotsFromWindows(requestedWindows),
          visibilityLeadMinutes: 90,
          visibilityLagMinutes: 180,
        },
      };
    }
    return currentCadence.kind === "times_per_day"
      ? { cadence: currentCadence }
      : null;
  }

  return currentCadence.kind === "once" ? { cadence: currentCadence } : null;
}

function hasDefinitionUpdateChanges(
  request: UpdateLifeOpsDefinitionRequest,
): boolean {
  return (
    request.title != null ||
    request.cadence != null ||
    request.priority != null ||
    request.description != null ||
    request.windowPolicy != null ||
    request.reminderPlan != null
  );
}

function buildDefaultReminderPlan(
  label: string,
): NonNullable<CreateLifeOpsDefinitionRequest["reminderPlan"]> {
  return {
    steps: [{ channel: "in_app", offsetMinutes: 0, label }],
  };
}

function inferSeedCadenceFromIntent(
  intent: string,
  fallbackWindows: Array<"morning" | "afternoon" | "evening" | "night">,
): LifeOpsCadence | null {
  const lower = intent.toLowerCase();
  const windows = extractIntentWindows(intent);
  const effectiveWindows = windows.length > 0 ? windows : fallbackWindows;
  const explicitWeekdays = extractIntentWeekdays(intent);
  const weeklyMatch =
    lower.match(
      /\b(one|two|three|four|five|six|seven|\d+)\s*(?:x|times?)\s*(?:a|per)\s*week\b/,
    ) ?? lower.match(/\b(once|twice)\s+a\s+week\b/);
  if (explicitWeekdays.length > 0) {
    return {
      kind: "weekly",
      weekdays: explicitWeekdays,
      windows: effectiveWindows.length > 0 ? effectiveWindows : ["morning"],
    };
  }
  if (weeklyMatch?.[1]) {
    const count = parseNumberWord(weeklyMatch[1]);
    if (count) {
      return {
        kind: "weekly",
        weekdays: weekdaysForFrequency(count),
        windows: effectiveWindows.length > 0 ? effectiveWindows : ["morning"],
      };
    }
  }
  if (/\bweekly\b/.test(lower)) {
    return {
      kind: "weekly",
      weekdays: [1],
      windows: effectiveWindows.length > 0 ? effectiveWindows : ["morning"],
    };
  }

  const explicitSlots = extractExplicitDailySlots(intent);
  if (explicitSlots.length > 0) {
    return {
      kind: "times_per_day",
      slots: explicitSlots,
      visibilityLeadMinutes: 90,
      visibilityLagMinutes: 180,
    };
  }

  const intervalMatch = lower.match(/\bevery\s+(\d+)\s*(hours?|minutes?)\b/);
  if (intervalMatch) {
    const value = Number(intervalMatch[1]);
    const unit = intervalMatch[2];
    if (Number.isFinite(value) && value > 0) {
      return {
        kind: "interval",
        everyMinutes: /minute/.test(unit) ? value : value * 60,
        windows:
          effectiveWindows.length > 0
            ? effectiveWindows
            : ["morning", "afternoon", "evening"],
      };
    }
  }

  const timesPerDayMatch =
    lower.match(
      /\b(one|two|three|four|five|six|\d+)\s*(?:x|times?)\s*(?:(?:a|per)\s*day|daily)\b/,
    ) ??
    lower.match(/\b(once|twice)\s+(?:a\s+day|daily)\b/);
  if (timesPerDayMatch?.[1]) {
    const count = parseNumberWord(timesPerDayMatch[1]);
    if (count) {
      const slots =
        effectiveWindows.length >= count
          ? buildSlotsFromWindows(effectiveWindows.slice(0, count))
          : buildDistributedDailySlots(count);
      return {
        kind: "times_per_day",
        slots,
        visibilityLeadMinutes: 90,
        visibilityLagMinutes: 180,
      };
    }
  }

  if (
    /\b(morning and night|night and morning|twice a day|two times a day|2x (a|per) day)\b/.test(
      lower,
    ) ||
    windows.length >= 2
  ) {
    return {
      kind: "times_per_day",
      slots: buildSlotsFromWindows(
        effectiveWindows.length > 0 ? effectiveWindows : ["morning", "night"],
      ),
      visibilityLeadMinutes: 90,
      visibilityLagMinutes: 180,
    };
  }

  if (
    /\b(daily|every day|each day|every mornings?|every afternoons?|every evenings?|every nights?|mornings?|afternoons?|evenings?|nights?)\b/.test(
      lower,
    )
  ) {
    return {
      kind: "daily",
      windows: effectiveWindows.length > 0 ? effectiveWindows : ["morning"],
    };
  }

  return null;
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function titleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function trimWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(" ");
}

function extractQuotedTitle(intent: string): string | null {
  const matches = [...intent.matchAll(/["“]([^"”]+)["”]/g)];
  const title = matches[matches.length - 1]?.[1]?.trim() ?? "";
  return title.length > 0 ? sentenceCase(title) : null;
}

function tokenizeDerivedSegment(raw: string): string[] {
  const tokens = raw.match(/[a-z0-9][a-z0-9'-]*/gi) ?? [];
  return tokens
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .filter((token) => {
      const lower = token.toLowerCase();
      return (
        !DERIVED_TITLE_STOPWORDS.has(lower) &&
        !DERIVED_TITLE_CADENCE_TOKENS.has(lower)
      );
    });
}

function isGenericDerivedSegment(tokens: string[]): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const normalized = tokens.join(" ").toLowerCase();
  if (GENERIC_DERIVED_TITLE_RE.test(normalized)) {
    return true;
  }
  return tokens.every((token) =>
    GENERIC_DERIVED_TOKENS.has(token.toLowerCase()),
  );
}

function isAuxiliaryDerivedSegment(raw: string): boolean {
  const lower = raw.toLowerCase();
  return /\b(?:block|blocks|blocked|blocking|lock|locks|locked|locking|unlock|unlocks|unlocked|unlocking|until i|do not just|don't just)\b/.test(
    lower,
  );
}

function normalizeDerivedSegment(raw: string): string {
  if (isAuxiliaryDerivedSegment(raw)) {
    return "";
  }
  const tokens = tokenizeDerivedSegment(raw);
  if (
    !tokens.some((token) => /[a-z]/i.test(token)) ||
    isGenericDerivedSegment(tokens)
  ) {
    return "";
  }
  return trimWords(tokens.join(" ").toLowerCase(), 6);
}

function deriveIntentSegments(intent: string): DerivedIntentSegment[] {
  const sanitizedIntent = intent
    .replace(/\[\s*language instruction:[^\]]*\]/gi, " ")
    .replace(/\[\s*system(?: note| instruction)?:[^\]]*\]/gi, " ");
  const rawSegments = sanitizedIntent
    .split(/[.!?]/)
    .flatMap((part) => part.split(/\s+(?:and|&)\s+|,|\s*\+\s*/i))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const segments: DerivedIntentSegment[] = [];
  const seen = new Set<string>();
  let previousQuantity: string | null = null;
  for (const raw of rawSegments) {
    const quantityMatch = raw.match(/\b(\d+)\b/);
    let text = normalizeDerivedSegment(raw);
    if (
      text &&
      !/\b\d+\b/.test(text) &&
      previousQuantity &&
      tokenizeDerivedSegment(raw).length <= 3
    ) {
      text = `${previousQuantity} ${text}`;
    }
    if (!text || seen.has(text)) {
      if (quantityMatch?.[1]) {
        previousQuantity = quantityMatch[1];
      }
      continue;
    }
    seen.add(text);
    segments.push({
      text,
      hasQuantity: /\b\d+\b/.test(text) || /\b\d+\b/.test(raw),
    });
    if (quantityMatch?.[1]) {
      previousQuantity = quantityMatch[1];
    }
  }
  return segments;
}

function deriveDefinitionTitle(intent: string): string | null {
  const explicitTitle = extractQuotedTitle(intent);
  if (explicitTitle) {
    return explicitTitle;
  }

  const scheduledReminderMatch = intent.match(
    /\b(?:set (?:a )?reminder|create (?:a )?reminder|remind(?: me)?)\b.*?\bfor\b.+?\bto\s+(.+)$/i,
  );
  if (scheduledReminderMatch?.[1]) {
    return titleCase(trimWords(scheduledReminderMatch[1], 8));
  }

  const segments = deriveIntentSegments(intent).sort(
    (left, right) => Number(right.hasQuantity) - Number(left.hasQuantity),
  );
  if (segments.length === 0) {
    return null;
  }
  if (segments.length === 1) {
    return titleCase(segments[0].text);
  }
  return segments
    .slice(0, 2)
    .map((segment) => titleCase(segment.text))
    .join(" + ");
}

function deriveGoalTitle(intent: string): string | null {
  const explicitTitle = extractQuotedTitle(intent);
  if (explicitTitle) {
    return explicitTitle;
  }

  const segments = deriveIntentSegments(intent).sort(
    (left, right) => right.text.length - left.text.length,
  );
  if (segments.length === 0) {
    return null;
  }
  return titleCase(trimWords(segments[0].text, 8));
}

function deriveDefinitionDescription(
  intent: string,
  title: string,
): string | undefined {
  const cleaned = intent.replace(/[.?!]/g, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return undefined;
  }
  if (normalizeTitle(cleaned) === normalizeTitle(title)) {
    return undefined;
  }
  return sentenceCase(trimWords(cleaned, 18));
}

function hasSpecificDerivedDefinitionDetails(intent: string): boolean {
  const segments = deriveIntentSegments(intent);
  return segments.some((segment) => segment.hasQuantity);
}

function shouldPreferDerivedDefinitionOverSeed(
  intent: string,
  seed: LifeDefinitionSeed | null,
  derivedTitle: string | null,
): boolean {
  if (!derivedTitle) {
    return false;
  }
  if (!seed) {
    return true;
  }
  if (normalizeTitle(seed.title) === normalizeTitle(derivedTitle)) {
    return false;
  }
  return hasSpecificDerivedDefinitionDetails(intent);
}

function scoreDefinitionTitleQuality(value: string | null | undefined): number {
  const normalized = normalizeTitle(value ?? "");
  if (!normalized) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = normalized.split(/\s+/).filter(Boolean).length;
  if (/\b\d+\b/.test(normalized)) {
    score += 6;
  }
  if (/[+&]/.test(value ?? "") || /\band\b/.test(normalized)) {
    score += 4;
  }
  if (
    /^(?:do|work out|workout|habit|routine|task|todo|reminder|alarm)\b/.test(
      normalized,
    )
  ) {
    score -= 5;
  }
  if (GENERIC_DERIVED_TITLE_RE.test(normalized)) {
    score -= 6;
  }
  return score;
}

function shouldAdoptPlannerTitle(args: {
  currentTitle: string | null | undefined;
  plannerTitle: string | null | undefined;
}): boolean {
  const plannerTitle = args.plannerTitle?.trim();
  if (!plannerTitle) {
    return false;
  }
  const currentTitle = args.currentTitle?.trim();
  if (!currentTitle) {
    return true;
  }
  if (normalizeTitle(currentTitle) === normalizeTitle(plannerTitle)) {
    return false;
  }
  return (
    scoreDefinitionTitleQuality(plannerTitle) >
    scoreDefinitionTitleQuality(currentTitle)
  );
}

function shouldAdoptPlannerCadence(args: {
  currentCadence: LifeOpsCadence | undefined;
  plannerCadence: LifeOpsCadence;
}): boolean {
  const { currentCadence, plannerCadence } = args;
  if (!currentCadence) {
    return true;
  }
  if (currentCadence.kind === "times_per_day") {
    return (
      (plannerCadence.kind === "times_per_day" &&
        plannerCadence.slots.length >= currentCadence.slots.length) ||
      (plannerCadence.kind === "once" && currentCadence.slots.length === 1)
    );
  }
  if (currentCadence.kind === "weekly") {
    return (
      plannerCadence.kind === "weekly" &&
      plannerCadence.weekdays.length >= currentCadence.weekdays.length &&
      (currentCadence.windows.includes("custom")
        ? plannerCadence.windows.includes("custom")
        : plannerCadence.windows.length >= currentCadence.windows.length)
    );
  }
  if (currentCadence.kind === "interval") {
    return plannerCadence.kind === "interval";
  }
  if (currentCadence.kind === "once") {
    return plannerCadence.kind === "once";
  }
  if (currentCadence.kind === "daily") {
    return (
      plannerCadence.kind === "times_per_day" ||
      (plannerCadence.kind === "daily" &&
        plannerCadence.windows.length >= currentCadence.windows.length)
    );
  }
  return true;
}

function shouldRequireLifeCreateConfirmation(args: {
  confirmed: boolean;
  messageSource: string | undefined;
  requestKind?: NativeAppleReminderLikeKind | null;
  cadence?: LifeOpsCadence;
}): boolean {
  if (args.messageSource === "autonomy") {
    return false;
  }
  if (args.requestKind && args.cadence?.kind === "once") {
    return false;
  }
  return !args.confirmed;
}

// ── i18n seed term arrays ────────────────────────────
// Each entry feeds `textMatchesAnyTerm` (word-boundary for ASCII, substring
// for CJK/non-ASCII).  Include morphological variants because the matcher
// does not stem.
const SEED_TERMS = {
  brush_teeth: [
    "brush teeth",
    "brush my teeth",
    "brushing teeth",
    "brushing my teeth",
    "brushed teeth",
    "brushed my teeth",
    "cepillar dientes",
    "cepillarme dientes",
    "cepillarse dientes",
    "cepillarte dientes",
    "cepillando dientes",
    "cepillado dientes",
    "刷牙",
    "양치",
    "escovar dentes",
    "đánh răng",
    "magsipilyo",
  ],
  workout: [
    "workout",
    "work out",
    "exercise",
    "gym",
    "lifting",
    "run",
    "running",
    "ejercicio",
    "锻炼",
    "健身",
    "운동",
    "exercício",
    "tập thể dục",
    "ehersisyo",
  ],
  invisalign: ["invisalign"],
  hydration: [
    "drink water",
    "drank water",
    "hydrate",
    "hydrating",
    "hydrated",
    "hydration",
    "water intake",
    "beber agua",
    "喝水",
    "물 마시기",
    "beber água",
    "uống nước",
    "uminom ng tubig",
  ],
  stretch: [
    "stretch",
    "stretching",
    "stretched",
    "yoga",
    "estirar",
    "拉伸",
    "伸展",
    "스트레칭",
    "alongamento",
    "giãn cơ",
  ],
  vitamins: [
    "vitamin",
    "vitamins",
    "supplement",
    "vitamina",
    "维生素",
    "비타민",
  ],
  shower: [
    "shower",
    "showering",
    "ducha",
    "淋浴",
    "洗澡",
    "샤워",
    "banho",
    "tắm",
    "maligo",
  ],
  shave: [
    "shave",
    "shaving",
    "shaved",
    "afeitar",
    "刮胡子",
    "면도",
    "barbear",
    "cạo râu",
    "mag-ahit",
  ],
} as const;

function inferLifeDefinitionSeed(intent: string): LifeDefinitionSeed | null {
  const lower = intent.toLowerCase();

  if (textMatchesAnyTerm(lower, SEED_TERMS.brush_teeth)) {
    const title = "Brush teeth";
    return {
      title,
      kind: "habit",
      cadence: inferSeedCadenceFromIntent(intent, ["morning", "night"]) ?? {
        kind: "times_per_day",
        slots: buildSlotsFromWindows(["morning", "night"]),
        visibilityLeadMinutes: 90,
        visibilityLagMinutes: 240,
      },
      description: "Brush your teeth in the morning and again at night.",
      reminderPlan: buildDefaultReminderPlan("Tooth brushing reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (textMatchesAnyTerm(lower, SEED_TERMS.workout)) {
    const title = "Workout";
    return {
      title,
      kind: "habit",
      cadence: inferSeedCadenceFromIntent(intent, ["afternoon", "evening"]) ?? {
        kind: "daily",
        windows: ["afternoon"],
        visibilityLeadMinutes: 120,
        visibilityLagMinutes: 240,
      },
      description:
        "Exercise in the afternoon and keep your training streak alive.",
      reminderPlan: buildDefaultReminderPlan("Workout reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (textMatchesAnyTerm(lower, SEED_TERMS.invisalign)) {
    const title = "Keep Invisalign in";
    return {
      title,
      kind: "habit",
      cadence: inferSeedCadenceFromIntent(intent, [
        "morning",
        "afternoon",
        "evening",
      ]) ?? {
        kind: "interval",
        everyMinutes: 240,
        windows: ["morning", "afternoon", "evening"],
        startMinuteOfDay: 9 * 60,
        maxOccurrencesPerDay: 4,
        visibilityLeadMinutes: 15,
        visibilityLagMinutes: 60,
      },
      description: "Check throughout the day that your Invisalign is back in.",
      reminderPlan: buildDefaultReminderPlan("Invisalign reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (textMatchesAnyTerm(lower, SEED_TERMS.hydration)) {
    const title = "Drink water";
    return {
      title,
      kind: "habit",
      cadence: inferSeedCadenceFromIntent(intent, [
        "morning",
        "afternoon",
        "evening",
      ]) ?? {
        kind: "interval",
        everyMinutes: 180,
        windows: ["morning", "afternoon", "evening"],
        startMinuteOfDay: 9 * 60,
        maxOccurrencesPerDay: 4,
        visibilityLeadMinutes: 15,
        visibilityLagMinutes: 90,
      },
      description: "Hydrate regularly across the day.",
      reminderPlan: buildDefaultReminderPlan("Water reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (textMatchesAnyTerm(lower, SEED_TERMS.stretch)) {
    const title = "Stretch";
    return {
      title,
      kind: "habit",
      cadence: inferSeedCadenceFromIntent(intent, ["afternoon", "evening"]) ?? {
        kind: "interval",
        everyMinutes: 360,
        windows: ["afternoon", "evening"],
        startMinuteOfDay: 12 * 60,
        maxOccurrencesPerDay: 2,
        visibilityLeadMinutes: 15,
        visibilityLagMinutes: 120,
      },
      description: "Take one or two stretch breaks during the day.",
      reminderPlan: buildDefaultReminderPlan("Stretch reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (textMatchesAnyTerm(lower, SEED_TERMS.vitamins)) {
    const title = "Take vitamins";
    const mealWindows =
      /\bbreakfast\b/.test(lower) || /\bmorning\b/.test(lower)
        ? (["morning"] as const)
        : /\blunch\b/.test(lower)
          ? (["afternoon"] as const)
          : /\bdinner\b/.test(lower) || /\bnight\b/.test(lower)
            ? (["night"] as const)
            : (["morning"] as const);
    const normalizedMealWindows = [...mealWindows] as Array<
      "morning" | "afternoon" | "evening" | "night"
    >;
    return {
      title,
      kind: "habit",
      cadence: inferSeedCadenceFromIntent(intent, normalizedMealWindows) ?? {
        kind: "daily",
        windows: normalizedMealWindows,
        visibilityLeadMinutes: 60,
        visibilityLagMinutes: 180,
      },
      description:
        "Take your vitamins with a meal at the right part of the day.",
      reminderPlan: buildDefaultReminderPlan("Vitamin reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (textMatchesAnyTerm(lower, SEED_TERMS.shower)) {
    const title = "Shower";
    return {
      title,
      kind: "habit",
      cadence: inferSeedCadenceFromIntent(intent, ["morning", "night"]) ?? {
        kind: "weekly",
        weekdays: [1, 3, 6],
        windows: ["morning", "night"],
        visibilityLeadMinutes: 120,
        visibilityLagMinutes: 360,
      },
      description: "Stay on top of your weekly shower cadence.",
      reminderPlan: buildDefaultReminderPlan("Shower reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  if (textMatchesAnyTerm(lower, SEED_TERMS.shave)) {
    const title = "Shave";
    return {
      title,
      kind: "habit",
      cadence: inferSeedCadenceFromIntent(intent, ["morning"]) ?? {
        kind: "weekly",
        weekdays: [2, 5],
        windows: ["morning"],
        visibilityLeadMinutes: 120,
        visibilityLagMinutes: 360,
      },
      description: "Keep your shaving cadence on track through the week.",
      reminderPlan: buildDefaultReminderPlan("Shave reminder"),
      websiteAccess: inferWebsiteAccessPolicyFromIntent(intent, title),
    };
  }

  return null;
}

function describeReminderIntensity(
  intensity: LifeOpsReminderIntensity,
): string {
  switch (intensity) {
    case "minimal":
      return "minimal";
    case "normal":
      return "normal";
    case "persistent":
      return "persistent";
    case "high_priority_only":
      return "high priority only";
  }
  return "normal";
}

// ── Main action ───────────────────────────────────────

export const lifeAction: Action & {
  suppressPostActionContinuation?: boolean;
} = {
  name: "LIFE",
  similes: [
    "MANAGE_LIFEOPS",
    "QUERY_LIFEOPS",
    "CREATE_TASK",
    "CREATE_HABIT",
    "CREATE_GOAL",
    "TRACK_HABIT",
    "COMPLETE_TASK",
    "SET_ALARM",
    "SET_REMINDER",
    "SNOOZE_REMINDER",
    "SET_REMINDER_INTENSITY",
  ],
  description:
    "Manage the user's personal routines, habits, goals, reminders, alarms, and escalation settings through LifeOps. " +
    "USE this action for: creating, editing, or deleting tasks, habits, routines, and goals; " +
    "setting one-off alarms or wake-up reminders like 'set an alarm for 7am' or 'wake me up at 7'; " +
    "helping the user actually set up follow-through when they say things like 'help me brush my teeth every day', 'i keep forgetting x', or 'help me actually do it'; " +
    "using LifeOps defaults for common routines when the user gives a natural window instead of an exact clock, like water reminders, stretch breaks, weekday-after-lunch Invisalign checks, or brushing when they wake up and before bed; " +
    "marking items as complete, skipping, or snoozing them; reviewing goal progress; " +
    "setting up phone/SMS escalation channels; adjusting reminder frequency or intensity; " +
    "querying an overview of active LifeOps items. " +
    "ALWAYS use LIFE for dynamic status questions like 'what's still left for today', 'what do i still need to do today', or 'anything else in my LifeOps list', even when the conversation already mentioned tasks, because their status may have changed after a completion, snooze, or reminder. " +
    "DO NOT use this action for Gmail inbox triage, email search, drafting or sending emails — use GMAIL_ACTION instead. " +
    "DO NOT use this action for calendar lookups, scheduling meetings, searching events, or travel itineraries — use CALENDAR_ACTION instead. " +
    "This action provides the final grounded reply; do not pair it with a speculative REPLY action or fall back to advice-only chat when the user wants real LifeOps follow-through.",
  suppressPostActionContinuation: true,
  validate: async (runtime, message) => {
    return hasLifeOpsAccess(runtime, message);
  },
  handler: async (runtime, message, state, options) => {
    if (!(await hasLifeOpsAccess(runtime, message))) {
      const fallback =
        "Life management is restricted to the owner, explicitly granted users, and the agent.";
      return {
        success: false,
        text: await renderLifeActionReply({
          runtime,
          message,
          state,
          intent: normalizeLifeInputText(messageText(message)),
          scenario: "reply_only",
          fallback,
          context: {
            reason: "access_restricted",
          },
        }),
      };
    }

    const rawParams = (options as HandlerOptions | undefined)?.parameters as
      | LifeParams
      | undefined;
    const params = rawParams ?? ({} as LifeParams);
    const currentText = normalizeLifeInputText(messageText(message));
    const details = params.details;
    const deferredDraft = latestDeferredLifeDraft(state);
    const turnsSinceDraft =
      deferredDraft != null
        ? (countTurnsSinceLatestDeferredLifeDraft(state) ?? 0) + 1
        : undefined;
    const draftExpiryReason = deferredLifeDraftExpiryReason({
      draft: deferredDraft,
      turnsSinceDraft,
    });
    if (draftExpiryReason && looksLikeDeferredLifeConfirmation(currentText)) {
      const fallback =
        "That LifeOps draft expired. Please restate it and I'll preview it again.";
      return {
        success: false,
        text: await renderLifeActionReply({
          runtime,
          message,
          state,
          intent: currentText,
          scenario: "reply_only",
          fallback,
          context: {
            reason: "draft_expired",
          },
        }),
      };
    }
    const deferredDraftReuseMode = resolveDeferredLifeDraftReuseMode({
      currentText,
      details,
      draft: deferredDraft,
      explicitAction: params.action,
      paramsIntent: params.intent,
      target: params.target,
      title: params.title,
      turnsSinceDraft,
    });
    const reuseDeferredDraft = deferredDraftReuseMode !== null;
    const intent = reuseDeferredDraft
      ? deferredDraftReuseMode === "confirm"
        ? normalizeLifeInputText(deferredDraft?.intent ?? "")
        : normalizeLifeInputText(params.intent?.trim() ?? currentText)
      : normalizeLifeInputText(params.intent?.trim() ?? currentText);
    if (!intent) {
      const fallback = "Tell me what you want me to do.";
      return {
        success: false,
        text: await renderLifeActionReply({
          runtime,
          message,
          state,
          intent: currentText,
          scenario: "reply_only",
          fallback,
          context: {
            reason: "missing_intent",
          },
        }),
      };
    }

    const explicitOperation = params.action
      ? ACTION_TO_OPERATION[params.action]
      : undefined;
    const operationPlan =
      reuseDeferredDraft && deferredDraft
        ? {
            confidence: 1,
            missing: [] as ExtractedLifeMissingField[],
            operation: deferredDraft.operation,
            shouldAct: true,
          }
        : await resolveLifeOperationPlan({
            runtime,
            message,
            state,
            intent,
            explicitOperation,
          });
    const forceCreateExecution = shouldForceLifeCreateExecution({
      intent,
      missing: operationPlan.missing,
      operation: operationPlan.operation,
      details,
      title: params.title,
    });
    if (!operationPlan.shouldAct && !forceCreateExecution) {
      const fallback = buildLifeClarificationFallback({
        missing: operationPlan.missing,
        operation: operationPlan.operation,
      });
      return {
        success: true,
        text: await renderLifeActionReply({
          runtime,
          message,
          state,
          intent,
          scenario:
            operationPlan.operation === "create_goal"
              ? "clarify_create_goal"
              : "clarify_create_definition",
          fallback,
          context: {
            missing: operationPlan.missing,
            operation: operationPlan.operation,
          },
        }),
        data: {
          actionName: "LIFE",
          noop: true,
          suggestedOperation: operationPlan.operation,
        },
      };
    }
    let operation =
      (forceCreateExecution ? "create_definition" : operationPlan.operation) ??
      classifyIntent(intent);
    const service = new LifeOpsService(runtime);
    const domain = detailString(details, "domain") as LifeOpsDomain | undefined;
    const ownership = requestedOwnership(domain);
    const chatText = intent;
    const inferredSeed = inferLifeDefinitionSeed(intent);
    let targetName = params.target ?? params.title ?? inferredSeed?.title;
    const inferredReminderIntensity = inferReminderIntensityFromIntent(intent);
    if (
      inferredReminderIntensity &&
      (operation === "create_definition" || operation === "update_definition")
    ) {
      const reminderPreferenceTarget = await resolveDefinitionFromIntent(
        service,
        targetName,
        intent,
        domain,
      );
      if (reminderPreferenceTarget) {
        operation = "set_reminder_preference";
        targetName = reminderPreferenceTarget.definition.title;
      }
    }
    const createConfirmed =
      deferredDraftReuseMode === "confirm" ||
      detailBoolean(details, "confirmed") === true;
    const recentTimedContextWindow = recentConversationTextsFromState(
      state ?? undefined,
      6,
    );

    try {
      const createDefinition = async () => {
        const deferredDefinitionDraft =
          reuseDeferredDraft && deferredDraft?.operation === "create_definition"
            ? deferredDraft
            : null;
        const editingDeferredDefinitionDraft =
          deferredDraftReuseMode === "edit" &&
          deferredDefinitionDraft?.operation === "create_definition";
        const seed = inferredSeed;
        const derivedTitle = deriveDefinitionTitle(intent);
        const allowDerivedTitleOverride =
          !editingDeferredDefinitionDraft ||
          hasSpecificDerivedDefinitionDetails(intent) ||
          extractQuotedTitle(intent) !== null ||
          seed !== null;
        const preferDerivedDefinition = shouldPreferDerivedDefinitionOverSeed(
          intent,
          seed ?? null,
          derivedTitle,
        );
        // ── Regex-based derivation (primary path) ──────────
        const fallbackTitle = deferredDefinitionDraft?.request.title ?? null;
        let title: string | null = editingDeferredDefinitionDraft
          ? (params.title ??
            (allowDerivedTitleOverride
              ? preferDerivedDefinition
                ? derivedTitle
                : (seed?.title ?? derivedTitle)
              : null) ??
            fallbackTitle)
          : (fallbackTitle ??
            params.title ??
            (preferDerivedDefinition
              ? derivedTitle
              : (seed?.title ?? derivedTitle)));
        const fallbackCadence = deferredDefinitionDraft?.request.cadence;
        let cadence: LifeOpsCadence | undefined = editingDeferredDefinitionDraft
          ? (normalizeCadenceDetail(detailObject(details, "cadence")) ??
            (preferDerivedDefinition ? undefined : seed?.cadence) ??
            inferSeedCadenceFromIntent(intent, ["morning"]) ??
            fallbackCadence ??
            undefined)
          : (fallbackCadence ??
            normalizeCadenceDetail(detailObject(details, "cadence")) ??
            (preferDerivedDefinition ? undefined : seed?.cadence) ??
            inferSeedCadenceFromIntent(intent, ["morning"]) ??
            undefined);
        let windowPolicy:
          | CreateLifeOpsDefinitionRequest["windowPolicy"]
          | undefined = editingDeferredDefinitionDraft
          ? ((detailObject(details, "windowPolicy") as unknown as
              | CreateLifeOpsDefinitionRequest["windowPolicy"]
              | undefined) ?? deferredDefinitionDraft?.request.windowPolicy)
          : (deferredDefinitionDraft?.request.windowPolicy ??
            (detailObject(details, "windowPolicy") as unknown as
              | CreateLifeOpsDefinitionRequest["windowPolicy"]
              | undefined));
        const explicitPriority = detailNumber(details, "priority");
        const explicitDescription = detailString(details, "description");
        const explicitMetadata = detailObject(details, "metadata") as
          | Record<string, unknown>
          | undefined;

        // Track whether cadence/title came from explicit high-confidence
        // sources so the planner only fills genuine gaps.
        const hadExplicitCadence = Boolean(
          (editingDeferredDefinitionDraft
            ? (normalizeCadenceDetail(detailObject(details, "cadence")) ??
              (preferDerivedDefinition ? undefined : seed?.cadence))
            : deferredDefinitionDraft?.request.cadence) ??
            normalizeCadenceDetail(detailObject(details, "cadence")) ??
            (preferDerivedDefinition ? undefined : seed?.cadence),
        );
        const hadExplicitTitle = Boolean(
          (editingDeferredDefinitionDraft
            ? params.title
            : deferredDefinitionDraft?.request.title) ?? params.title,
        );

        // ── LLM parameter enhancement (fills gaps) ────────
        // Skip when reusing a confirmed deferred draft — the user already
        // approved those values.
        let llmPlan: Awaited<
          ReturnType<typeof extractTaskCreatePlanWithLlm>
        > | null = null;
        let llmDescription: string | undefined;
        let llmPriority: number | undefined;
        let llmRequestKind: NativeAppleReminderLikeKind | null = null;
        if (!deferredDefinitionDraft || editingDeferredDefinitionDraft) {
          llmPlan = await extractTaskCreatePlanWithLlm({
            runtime,
            intent,
            state: state ?? undefined,
            message: message ?? undefined,
          });
          const explicitCadenceDetail = normalizeCadenceDetail(
            detailObject(details, "cadence"),
          );
          const shouldHonorPlannerResponse =
            llmPlan?.mode === "respond" &&
            Boolean(llmPlan.response) &&
            !editingDeferredDefinitionDraft &&
            !seed &&
            !params.title &&
            !explicitCadenceDetail &&
            !detailString(details, "description") &&
            !detailString(details, "goalId") &&
            !detailString(details, "goalTitle") &&
            !detailString(details, "kind");
          if (shouldHonorPlannerResponse && llmPlan?.response) {
            return {
              success: true as const,
              text: llmPlan.response,
            };
          }
          if (llmPlan) {
            llmRequestKind = llmPlan.requestKind;
            const preferredPlannerTitle =
              derivedTitle && hasSpecificDerivedDefinitionDetails(intent)
                ? derivedTitle
                : preferDerivedDefinition || !seed
                  ? llmPlan.title
                  : seed.title;
            if (
              !hadExplicitTitle &&
              shouldAdoptPlannerTitle({
                currentTitle: title,
                plannerTitle: preferredPlannerTitle,
              })
            ) {
              title = preferredPlannerTitle;
            }
            if (
              (editingDeferredDefinitionDraft || !hadExplicitCadence) &&
              llmPlan.cadenceKind
            ) {
              const llmCadenceTimeZone =
                normalizeLifeTimeZoneToken(
                  detailString(details, "timeZone") ??
                    llmPlan.timeZone ??
                    deferredDefinitionDraft?.request.timezone ??
                    windowPolicy?.timezone,
                ) ?? extractLifeTimeZoneFromText(intent);
              const llmCadence = buildCadenceFromLlmParams(llmPlan, {
                intent,
                timeZone: llmCadenceTimeZone ?? undefined,
              });
              if (
                llmCadence &&
                shouldAdoptPlannerCadence({
                  currentCadence: cadence,
                  plannerCadence: llmCadence.cadence,
                })
              ) {
                cadence = llmCadence.cadence;
                windowPolicy = llmCadence.windowPolicy ?? windowPolicy;
              }
            }
            if (!explicitDescription && llmPlan.description) {
              llmDescription = llmPlan.description;
            }
            if (explicitPriority === undefined && llmPlan.priority) {
              llmPriority = llmPlan.priority;
            }
          }
        }
        const resolvedTimeZone =
          normalizeLifeTimeZoneToken(
            detailString(details, "timeZone") ??
              llmPlan?.timeZone ??
              deferredDefinitionDraft?.request.timezone ??
              windowPolicy?.timezone,
          ) ?? extractLifeTimeZoneFromText(intent);
        const timedRequestKind = resolveTimedRequestKind({
          intent,
          llmRequestKind,
          recentWindow: recentTimedContextWindow,
        });
        const timedDefaults = deriveTimedRequestDefaults({
          intent,
          requestKind: timedRequestKind,
          timeZone: resolvedTimeZone ?? undefined,
        });
        if (timedDefaults) {
          if (!title) {
            title = timedDefaults.title;
          }
          const inferredSingleSlotCadence =
            cadence?.kind === "times_per_day" && cadence.slots.length === 1;
          if (
            (!cadence || inferredSingleSlotCadence) &&
            timedDefaults.cadence
          ) {
            cadence = timedDefaults.cadence;
            if (inferredSingleSlotCadence) {
              windowPolicy = undefined;
            }
          }
        }
        const nativeAppleMetadata =
          timedRequestKind && cadence?.kind === "once"
            ? buildNativeAppleReminderMetadata({
                kind: timedRequestKind,
                source: llmRequestKind ? "llm" : "heuristic",
              })
            : undefined;
        const definitionMetadata = editingDeferredDefinitionDraft
          ? mergeMetadataRecords(
              deferredDefinitionDraft?.request.metadata,
              mergeMetadataRecords(explicitMetadata, nativeAppleMetadata),
            )
          : (deferredDefinitionDraft?.request.metadata ??
            mergeMetadataRecords(explicitMetadata, nativeAppleMetadata));

        if (!title) {
          const fallback = "What should I call it?";
          return {
            success: false as const,
            text: await renderLifeActionReply({
              runtime,
              message,
              state,
              intent,
              scenario: "clarify_create_definition",
              fallback,
              context: {
                missing: ["title"],
                operation: "create_definition",
              },
            }),
          };
        }
        if (!cadence) {
          const fallback = "When should it happen?";
          return {
            success: false as const,
            text: await renderLifeActionReply({
              runtime,
              message,
              state,
              intent,
              scenario: "clarify_create_definition",
              fallback,
              context: {
                missing: ["schedule"],
                operation: "create_definition",
              },
            }),
          };
        }
        const kind =
          (editingDeferredDefinitionDraft
            ? ((detailString(details, "kind") as
                | CreateLifeOpsDefinitionRequest["kind"]
                | undefined) ?? seed?.kind)
            : deferredDefinitionDraft?.request.kind) ??
          (detailString(details, "kind") as
            | CreateLifeOpsDefinitionRequest["kind"]
            | undefined) ??
          seed?.kind ??
          "habit";
        const definitionDraft: DeferredLifeDefinitionDraft = {
          intent,
          operation: "create_definition",
          createdAt: editingDeferredDefinitionDraft
            ? Date.now()
            : (deferredDefinitionDraft?.createdAt ?? Date.now()),
          request: {
            cadence,
            description:
              explicitDescription ??
              llmDescription ??
              (editingDeferredDefinitionDraft
                ? deferredDefinitionDraft?.request.description
                : undefined) ??
              (preferDerivedDefinition
                ? deriveDefinitionDescription(intent, title)
                : seed?.description),
            goalRef:
              detailString(details, "goalId") ??
              detailString(details, "goalTitle") ??
              deferredDefinitionDraft?.request.goalRef ??
              undefined,
            kind,
            priority:
              explicitPriority ??
              llmPriority ??
              deferredDefinitionDraft?.request.priority,
            progressionRule:
              (detailObject(
                details,
                "progressionRule",
              ) as CreateLifeOpsDefinitionRequest["progressionRule"]) ??
              deferredDefinitionDraft?.request.progressionRule,
            reminderPlan:
              (detailObject(details, "reminderPlan") as
                | CreateLifeOpsDefinitionRequest["reminderPlan"]
                | undefined) ??
              deferredDefinitionDraft?.request.reminderPlan ??
              (preferDerivedDefinition
                ? buildDefaultReminderPlan(`${title} reminder`)
                : seed?.reminderPlan),
            timezone:
              extractLifeTimeZoneFromText(intent) ??
              normalizeLifeTimeZoneToken(llmPlan?.timeZone) ??
              normalizeLifeTimeZoneToken(
                resolvedTimeZone ?? deferredDefinitionDraft?.request.timezone,
              ) ??
              resolvedTimeZone ??
              deferredDefinitionDraft?.request.timezone,
            title,
            metadata: definitionMetadata,
            windowPolicy,
            websiteAccess:
              (detailObject(details, "websiteAccess") as unknown as
                | CreateLifeOpsDefinitionRequest["websiteAccess"]
                | undefined) ??
              deferredDefinitionDraft?.request.websiteAccess ??
              seed?.websiteAccess,
          },
        };
        // ── LLM unlock-mode refinement ───────────────────
        // When the seed/regex produced a websiteAccess policy and no
        // explicit details override was present, let the LLM try to
        // classify the unlock mode more accurately.
        if (
          definitionDraft.request.websiteAccess &&
          !detailObject(details, "websiteAccess") &&
          !deferredDefinitionDraft?.request.websiteAccess
        ) {
          const llmUnlock = await extractUnlockModeWithLlm({
            runtime,
            intent,
          });
          if (llmUnlock) {
            definitionDraft.request.websiteAccess = {
              ...definitionDraft.request.websiteAccess,
              unlockMode: llmUnlock.mode,
              ...(llmUnlock.callbackKey !== undefined && {
                callbackKey: llmUnlock.callbackKey,
              }),
              ...(llmUnlock.durationMinutes !== undefined && {
                unlockDurationMinutes: llmUnlock.durationMinutes,
              }),
            };
          }
        }
        if (
          shouldRequireLifeCreateConfirmation({
            confirmed: createConfirmed,
            messageSource:
              typeof message.content?.source === "string"
                ? message.content.source
                : undefined,
            requestKind: timedRequestKind,
            cadence: definitionDraft.request.cadence,
          })
        ) {
          const fallback = `I can save this as a ${definitionDraft.request.kind} named "${definitionDraft.request.title}" that happens ${summarizeCadence(definitionDraft.request.cadence)}. Confirm and I'll save it, or tell me what to change.`;
          return {
            success: true as const,
            text: await renderLifeActionReply({
              runtime,
              message,
              state,
              intent,
              scenario: "preview_definition",
              fallback,
              context: {
                draft: definitionDraft.request,
                requestKind: timedRequestKind,
              },
            }),
            data: {
              actionName: "LIFE",
              deferred: true,
              lifeDraft: definitionDraft,
              preview: {
                cadence: definitionDraft.request.cadence,
                kind: definitionDraft.request.kind,
                title: definitionDraft.request.title,
              },
            },
          };
        }
        const resolvedGoal = definitionDraft.request.goalRef
          ? await resolveGoal(service, definitionDraft.request.goalRef, domain)
          : null;

        const created = await service.createDefinition({
          ownership,
          kind: definitionDraft.request.kind,
          title: definitionDraft.request.title,
          description: definitionDraft.request.description,
          originalIntent:
            definitionDraft.intent || definitionDraft.request.title,
          cadence: definitionDraft.request.cadence,
          timezone:
            extractLifeTimeZoneFromText(definitionDraft.intent) ??
            normalizeLifeTimeZoneToken(definitionDraft.request.timezone) ??
            definitionDraft.request.timezone,
          priority: definitionDraft.request.priority,
          windowPolicy: definitionDraft.request.windowPolicy,
          progressionRule: definitionDraft.request.progressionRule,
          reminderPlan: definitionDraft.request.reminderPlan,
          metadata: definitionDraft.request.metadata,
          websiteAccess: definitionDraft.request.websiteAccess,
          goalId: resolvedGoal?.goal.id ?? null,
          source: "chat",
        });
        const fallback = `Saved "${created.definition.title}" as ${summarizeCadence(created.definition.cadence)}.`;
        return {
          success: true as const,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "saved_definition",
            fallback,
            context: {
              created: {
                title: created.definition.title,
                cadence: created.definition.cadence,
              },
              requestKind: timedRequestKind,
            },
          }),
          data: toActionData(created),
        };
      };

      // ── Queries ─────────────────────────────────────

      if (
        operation === "query_calendar_today" ||
        operation === "query_calendar_next"
      ) {
        const google = await getGoogleCapabilityStatus(service);
        if (!google.hasCalendarRead) {
          return {
            success: false,
            text: calendarReadUnavailableMessage(google),
          };
        }
        if (operation === "query_calendar_next") {
          const ctx = await service.getNextCalendarEventContext(INTERNAL_URL);
          return {
            success: true,
            text: formatNextEventContext(ctx),
            data: toActionData(ctx),
          };
        }
        const timeRangeHint = intent.toLowerCase();
        const range = /\btomorrow\b/.test(timeRangeHint)
          ? dayRange(1)
          : /\b(this week|week)\b/.test(timeRangeHint)
            ? weekRange()
            : dayRange(0);
        const label = /\btomorrow\b/.test(timeRangeHint)
          ? "tomorrow"
          : /\b(this week|week)\b/.test(timeRangeHint)
            ? "this week"
            : "today";
        const feed = await service.getCalendarFeed(INTERNAL_URL, {
          timeMin: range.timeMin,
          timeMax: range.timeMax,
        });
        return {
          success: true,
          text: formatCalendarFeed(feed, label),
          data: toActionData(feed),
        };
      }

      if (operation === "query_email") {
        const limit = detailNumber(details, "limit") ?? 10;
        return (
          (await gmailAction.handler?.(runtime, message, state, {
            parameters: {
              subaction: "triage",
              intent,
              details: {
                ...details,
                maxResults: limit,
              },
            },
          } as HandlerOptions)) ?? {
            success: false,
            text: "I couldn't route that Gmail request yet.",
          }
        );
      }

      if (operation === "query_overview") {
        const overview = await service.getOverview();
        const userQuery = messageText(message) || intent || "overview";
        return {
          success: true,
          text: formatOverviewForQuery(overview, userQuery),
          data: toActionData(overview),
        };
      }

      // ── Mutations ───────────────────────────────────

      if (operation === "create_definition") {
        return await createDefinition();
      }

      if (operation === "create_goal") {
        const deferredGoalDraft =
          reuseDeferredDraft && deferredDraft?.operation === "create_goal"
            ? deferredDraft
            : null;
        const title =
          deferredGoalDraft?.request.title ??
          params.title ??
          deriveGoalTitle(intent);
        if (!title)
          return {
            success: false,
            text: await renderLifeActionReply({
              runtime,
              message,
              state,
              intent,
              scenario: "clarify_create_goal",
              fallback: "What are you trying to achieve?",
              context: {
                missing: ["title"],
                operation: "create_goal",
              },
            }),
          };
        const goalDraft: DeferredLifeGoalDraft = deferredGoalDraft ?? {
          intent,
          operation: "create_goal",
          createdAt: Date.now(),
          request: {
            cadence: normalizeCadenceDetail(
              detailObject(details, "cadence"),
            ) as CreateLifeOpsGoalRequest["cadence"],
            description: detailString(details, "description"),
            successCriteria: detailObject(details, "successCriteria"),
            supportStrategy: detailObject(details, "supportStrategy"),
            title,
          },
        };
        if (
          shouldRequireLifeCreateConfirmation({
            confirmed: createConfirmed,
            messageSource:
              typeof message.content?.source === "string"
                ? message.content.source
                : undefined,
          })
        ) {
          const fallback = `I can save this goal as "${goalDraft.request.title}". Confirm and I'll save it, or tell me what to change.`;
          return {
            success: true,
            text: await renderLifeActionReply({
              runtime,
              message,
              state,
              intent,
              scenario: "preview_goal",
              fallback,
              context: {
                draft: goalDraft.request,
              },
            }),
            data: {
              actionName: "LIFE",
              deferred: true,
              lifeDraft: goalDraft,
              preview: {
                title: goalDraft.request.title,
              },
            },
          };
        }
        const created = await service.createGoal({
          ownership,
          title: goalDraft.request.title,
          description: goalDraft.request.description,
          cadence: goalDraft.request.cadence,
          supportStrategy: goalDraft.request.supportStrategy,
          successCriteria: goalDraft.request.successCriteria,
          metadata: {
            source: "chat",
            originalIntent: goalDraft.intent || goalDraft.request.title,
          },
        });
        const fallback = `Saved goal "${created.goal.title}".`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "saved_goal",
            fallback,
            context: {
              created: {
                title: created.goal.title,
                cadence: created.goal.cadence,
              },
            },
          }),
          data: toActionData(created),
        };
      }

      if (operation === "update_definition") {
        const target = await resolveDefinition(service, targetName, domain);
        if (!target)
          return {
            success: false,
            text: "I could not find that item to update.",
          };
        const request: UpdateLifeOpsDefinitionRequest = {
          ownership,
          title:
            params.title !== target.definition.title ? params.title : undefined,
          description: detailString(details, "description"),
          cadence: normalizeCadenceDetail(detailObject(details, "cadence")),
          priority: detailNumber(details, "priority"),
          windowPolicy: detailObject(
            details,
            "windowPolicy",
          ) as unknown as UpdateLifeOpsDefinitionRequest["windowPolicy"],
          reminderPlan: detailObject(
            details,
            "reminderPlan",
          ) as UpdateLifeOpsDefinitionRequest["reminderPlan"],
        };

        // If no explicit changes from structured details, try LLM extraction
        const hasExplicitChanges = hasDefinitionUpdateChanges(request);
        if (!hasExplicitChanges && intent) {
          const llmFields = await extractUpdateFieldsWithLlm({
            runtime,
            intent,
            currentTitle: target.definition.title,
            currentCadenceKind: target.definition.cadence.kind,
            currentWindows:
              target.definition.windowPolicy?.windows?.map((w) => w.name) ?? [],
          });
          if (llmFields) {
            if (llmFields.title) request.title = llmFields.title;
            if (llmFields.priority) request.priority = llmFields.priority;
            if (llmFields.description)
              request.description = llmFields.description;
            if (
              llmFields.cadenceKind ||
              llmFields.windows ||
              llmFields.weekdays ||
              llmFields.everyMinutes ||
              llmFields.timeOfDay
            ) {
              const built = buildCadenceFromUpdateFields({
                currentCadence: target.definition.cadence,
                currentWindowPolicy: target.definition.windowPolicy,
                timeZone: target.definition.timezone,
                update: llmFields,
              });
              if (built) {
                request.cadence = built.cadence;
                request.windowPolicy = built.windowPolicy;
              }
            }
          }
        }

        if (!hasDefinitionUpdateChanges(request)) {
          return {
            success: false,
            text: `Tell me what to change about "${target.definition.title}" and I'll update it.`,
          };
        }

        const updated = await service.updateDefinition(
          target.definition.id,
          request,
        );
        const fallback = `Updated "${updated.definition.title}".`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "updated_definition",
            fallback,
            context: {
              previousTitle: target.definition.title,
              updated: {
                title: updated.definition.title,
              },
            },
          }),
          data: toActionData(updated),
        };
      }

      if (operation === "update_goal") {
        const target = await resolveGoal(service, targetName, domain);
        if (!target)
          return {
            success: false,
            text: "I could not find that goal to update.",
          };
        const request: UpdateLifeOpsGoalRequest = {
          ownership,
          title: params.title !== target.goal.title ? params.title : undefined,
          description: detailString(details, "description"),
          supportStrategy: detailObject(details, "supportStrategy"),
          successCriteria: detailObject(details, "successCriteria"),
        };
        const updated = await service.updateGoal(target.goal.id, request);
        const fallback = `Updated goal "${updated.goal.title}".`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "updated_goal",
            fallback,
            context: {
              previousTitle: target.goal.title,
              updated: {
                title: updated.goal.title,
              },
            },
          }),
          data: toActionData(updated),
        };
      }

      if (operation === "delete_definition") {
        const target = await resolveDefinition(service, targetName, domain);
        if (!target)
          return {
            success: false,
            text: "I could not find that item to delete.",
          };
        await service.deleteDefinition(target.definition.id);
        const fallback = `Deleted "${target.definition.title}" and its occurrences.`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "deleted_definition",
            fallback,
            context: {
              deleted: {
                title: target.definition.title,
              },
            },
          }),
        };
      }

      if (operation === "delete_goal") {
        const target = await resolveGoal(service, targetName, domain);
        if (!target)
          return {
            success: false,
            text: "I could not find that goal to delete.",
          };
        await service.deleteGoal(target.goal.id);
        const fallback = `Deleted goal "${target.goal.title}".`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "deleted_goal",
            fallback,
            context: {
              deleted: {
                title: target.goal.title,
              },
            },
          }),
        };
      }

      if (operation === "complete_occurrence") {
        const { match: target, ambiguousCandidates } =
          await resolveOccurrenceWithIntentFallback({
            service,
            target: targetName,
            domain,
            intent,
            operation,
          });
        if (!target) {
          if (ambiguousCandidates.length > 0) {
            return {
              success: false,
              text: `Multiple items match — which one?\n${ambiguousCandidates.map((t) => `  - ${t}`).join("\n")}`,
            };
          }
          if (
            shouldRecoverMissingOccurrenceAsCreate(
              intent,
              inferredSeed ?? undefined,
            )
          ) {
            return await createDefinition();
          }
          return {
            success: false,
            text: "I could not find that active item to complete.",
          };
        }
        const completed = await service.completeOccurrence(target.id, {
          note: detailString(details, "note"),
        });
        const fallback = `Marked "${completed.title}" done.`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "completed_occurrence",
            fallback,
            context: {
              completed: {
                title: completed.title,
              },
              note: detailString(details, "note"),
            },
          }),
          data: toActionData(completed),
        };
      }

      if (operation === "skip_occurrence") {
        const { match: target, ambiguousCandidates } =
          await resolveOccurrenceWithIntentFallback({
            service,
            target: targetName,
            domain,
            intent,
            operation,
          });
        if (!target) {
          if (ambiguousCandidates.length > 0) {
            return {
              success: false,
              text: `Multiple items match — which one?\n${ambiguousCandidates.map((t) => `  - ${t}`).join("\n")}`,
            };
          }
          return {
            success: false,
            text: "I could not find that active item to skip.",
          };
        }
        const skipped = await service.skipOccurrence(target.id);
        const fallback = `Skipped "${skipped.title}".`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "skipped_occurrence",
            fallback,
            context: {
              skipped: {
                title: skipped.title,
              },
            },
          }),
          data: toActionData(skipped),
        };
      }

      if (operation === "snooze_occurrence") {
        const { match: target, ambiguousCandidates } =
          await resolveOccurrenceWithIntentFallback({
            service,
            target: targetName,
            domain,
            intent,
            operation,
          });
        if (!target) {
          if (ambiguousCandidates.length > 0) {
            return {
              success: false,
              text: `Multiple items match — which one?\n${ambiguousCandidates.map((t) => `  - ${t}`).join("\n")}`,
            };
          }
          return {
            success: false,
            text: "I could not find that active item to snooze.",
          };
        }
        const preset = detailString(details, "preset") as
          | "15m"
          | "30m"
          | "1h"
          | "tonight"
          | "tomorrow_morning"
          | undefined;
        const minutes = detailNumber(details, "minutes");
        const snoozed = await service.snoozeOccurrence(target.id, {
          preset,
          minutes,
        });
        const fallback = `Snoozed "${snoozed.title}".`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "snoozed_occurrence",
            fallback,
            context: {
              snoozed: {
                title: snoozed.title,
              },
              preset: preset ?? null,
              minutes: minutes ?? null,
            },
          }),
          data: toActionData(snoozed),
        };
      }

      if (operation === "review_goal") {
        const target = await resolveGoal(service, targetName, domain);
        if (!target)
          return {
            success: false,
            text: "I could not find that goal to review.",
          };
        const review = await service.reviewGoal(target.goal.id);
        return {
          success: true,
          text: review.summary.explanation,
          data: toActionData(review),
        };
      }

      if (operation === "set_reminder_preference") {
        const intensity =
          (await extractReminderIntensityWithLlm({ runtime, intent })) ??
          inferReminderIntensityFromIntent(intent);
        if (!intensity) {
          return {
            success: false,
            text: "I need to know whether you want reminders minimal, normal, persistent, or high priority only.",
          };
        }
        const target = await resolveDefinitionFromIntent(
          service,
          targetName,
          intent,
          domain,
        );
        const request: SetLifeOpsReminderPreferenceRequest = {
          intensity,
          definitionId: target?.definition.id ?? null,
          note: chatText || intent,
        };
        const preference = await service.setReminderPreference(request);
        if (target) {
          const fallback =
            intensity === "high_priority_only"
              ? `Reminder intensity for "${target.definition.title}" is now high priority only.`
              : `Reminder intensity for "${target.definition.title}" is now ${describeReminderIntensity(preference.effective.intensity)}.`;
          return {
            success: true,
            text: await renderLifeActionReply({
              runtime,
              message,
              state,
              intent,
              scenario: "set_reminder_preference",
              fallback,
              context: {
                scope: "definition",
                targetTitle: target.definition.title,
                intensity: preference.effective.intensity,
              },
            }),
            data: toActionData(preference),
          };
        }
        const fallback =
          intensity === "high_priority_only"
            ? "Global LifeOps reminders are now high priority only."
            : `Global LifeOps reminders are now ${describeReminderIntensity(preference.effective.intensity)}.`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "set_reminder_preference",
            fallback,
            context: {
              scope: "global",
              intensity: preference.effective.intensity,
            },
          }),
          data: toActionData(preference),
        };
      }

      if (operation === "capture_phone") {
        const phoneNumber =
          detailString(details, "phoneNumber") ?? params.title;
        if (!phoneNumber)
          return {
            success: false,
            text: "I need a phone number to set up SMS or voice contact.",
          };
        const allowSms = detailBoolean(details, "allowSms") ?? true;
        const allowVoice = detailBoolean(details, "allowVoice") ?? false;
        const result = await service.capturePhoneConsent({
          phoneNumber,
          consentGiven: true,
          allowSms,
          allowVoice,
          privacyClass: "private",
        });
        const channels: string[] = [];
        if (allowSms) channels.push("SMS");
        if (allowVoice) channels.push("voice calls");
        const fallback = `Phone number ${result.phoneNumber} saved. Enabled for: ${channels.join(" and ") || "reminders"}.`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "captured_phone",
            fallback,
            context: {
              phoneNumber: result.phoneNumber,
              channels,
            },
          }),
          data: toActionData(result),
        };
      }

      if (operation === "configure_escalation") {
        const target = await resolveDefinition(service, targetName, domain);
        if (!target)
          return {
            success: false,
            text: "I could not find that item to configure its reminders.",
          };
        const rawSteps =
          detailArray(details, "steps") ??
          detailArray(details, "escalationSteps");
        const steps: LifeOpsReminderStep[] = rawSteps
          ? rawSteps
              .filter(
                (s): s is Record<string, unknown> =>
                  typeof s === "object" && s !== null,
              )
              .map((s) => ({
                channel: String(
                  s.channel ?? "in_app",
                ) as LifeOpsReminderStep["channel"],
                offsetMinutes:
                  typeof s.offsetMinutes === "number" ? s.offsetMinutes : 0,
                label:
                  typeof s.label === "string"
                    ? s.label
                    : String(s.channel ?? "reminder"),
              }))
          : [{ channel: "in_app", offsetMinutes: 0, label: "In-app reminder" }];
        const updated = await service.updateDefinition(target.definition.id, {
          ownership,
          reminderPlan: { steps },
        });
        const summary = steps
          .map((s) => `${s.channel} at +${s.offsetMinutes}m`)
          .join(", ");
        const fallback = `Updated reminder plan for "${updated.definition.title}": ${summary}.`;
        return {
          success: true,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "configured_escalation",
            fallback,
            context: {
              targetTitle: updated.definition.title,
              steps,
            },
          }),
          data: toActionData(updated),
        };
      }

      return {
        success: false,
        text: "I didn't understand that life management request.",
      };
    } catch (err) {
      if (err instanceof LifeOpsServiceError) {
        const fallback = buildLifeServiceErrorFallback(err, intent);
        return {
          success: false,
          text: await renderLifeActionReply({
            runtime,
            message,
            state,
            intent,
            scenario: "service_error",
            fallback,
            context: {
              status: err.status,
              operation,
            },
          }),
        };
      }
      throw err;
    }
  },
  parameters: [
    {
      name: "action",
      description: "What kind of life operation to perform.",
      required: false,
      schema: {
        type: "string" as const,
        enum: [
          "create",
          "create_goal",
          "update",
          "update_goal",
          "delete",
          "delete_goal",
          "complete",
          "skip",
          "snooze",
          "review",
          "phone",
          "escalation",
          "reminder_preference",
          "calendar",
          "next_event",
          "email",
          "overview",
        ],
      },
    },
    {
      name: "intent",
      description:
        'Natural language description of what to do. Examples: "create a daily brushing habit for morning and night", "snooze brushing for 30 minutes", "what\'s on my calendar today".',
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "title",
      description:
        "Name for a new item, or the name of an existing item to act on.",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "target",
      description:
        "Name or ID of an existing item when different from title (e.g., when renaming).",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "details",
      description:
        "Structured data when needed. May include: cadence (schedule object), kind (task/habit/routine), description, priority, progressionRule, reminderPlan, confirmed (boolean when the user explicitly approves a previewed create), preset (snooze preset like 15m/30m/1h/tonight/tomorrow_morning), minutes (snooze minutes), phoneNumber, allowSms, allowVoice, steps (escalation steps array), goalId, goalTitle, supportStrategy, successCriteria, note, limit, domain (user_lifeops/agent_ops), or reminder preference targeting.",
      required: false,
      schema: { type: "object" as const },
    },
  ],
  examples: [
    [
      {
        name: "{{name1}}",
        content: {
          text: "help me remember to drink water",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: 'I can set up a "Drink water" habit with a reasonable daytime default cadence. Confirm and I\'ll save it.',
          actions: ["LIFE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "help me remember to stretch during the day",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: 'I can set up a "Stretch" habit with daytime stretch-break defaults. Confirm and I\'ll save it.',
          actions: ["LIFE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "please remind me about my Invisalign on weekdays after lunch",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: 'I can set up a weekday-after-lunch Invisalign habit. Confirm and I\'ll save it.',
          actions: ["LIFE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "recuérdame cepillarme los dientes por la mañana y por la noche",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: 'Puedo guardar el hábito "Brush teeth" para la mañana y la noche. Confirma y lo guardo.',
          actions: ["LIFE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "help me brush my teeth at 8 am and 9 pm every day",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: 'I can set up a habit named "Brush teeth" for 8 am and 9 pm daily. Confirm and I\'ll save it.',
          actions: ["LIFE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "what life ops tasks are still left for today?",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "You have 2 LifeOps tasks left for today: call mom and pay rent.",
          actions: ["LIFE"],
        },
      },
      {
        name: "{{name1}}",
        content: {
          text: "anything else in my life ops list i need to get done today?",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: "You have 1 LifeOps task left for today: pay rent.",
          actions: ["LIFE"],
        },
      },
    ],
    [
      {
        name: "{{name1}}",
        content: {
          text: "remind me less about brush teeth",
        },
      },
      {
        name: "{{agentName}}",
        content: {
          text: 'Reminder intensity for "Brush teeth" is now minimal.',
          actions: ["LIFE"],
        },
      },
    ],
  ],
};

import crypto from "node:crypto";
import { type IAgentRuntime, logger, stringToUuid } from "@elizaos/core";
import type {
  AcknowledgeLifeOpsReminderRequest,
  CaptureLifeOpsPhoneConsentRequest,
  CompleteLifeOpsBrowserSessionRequest,
  CompleteLifeOpsOccurrenceRequest,
  ConfirmLifeOpsBrowserSessionRequest,
  CreateLifeOpsBrowserSessionRequest,
  CreateLifeOpsCalendarEventRequest,
  CreateLifeOpsDefinitionRequest,
  CreateLifeOpsGmailReplyDraftRequest,
  CreateLifeOpsGoalRequest,
  CreateLifeOpsWorkflowRequest,
  CreateLifeOpsXPostRequest,
  DisconnectLifeOpsGoogleConnectorRequest,
  GetLifeOpsCalendarFeedRequest,
  GetLifeOpsGmailTriageRequest,
  LifeOpsActiveReminderView,
  LifeOpsAuditEvent,
  LifeOpsAuditEventType,
  LifeOpsBrowserAction,
  LifeOpsBrowserSession,
  LifeOpsCadence,
  LifeOpsCalendarEvent,
  LifeOpsCalendarFeed,
  LifeOpsChannelPolicy,
  LifeOpsConnectorGrant,
  LifeOpsConnectorMode,
  LifeOpsContextPolicy,
  LifeOpsDomain,
  LifeOpsDefinitionRecord,
  LifeOpsGmailMessageSummary,
  LifeOpsGmailReplyDraft,
  LifeOpsGmailTriageFeed,
  LifeOpsGoalRecord,
  LifeOpsGoalReview,
  LifeOpsGoalSupportSuggestion,
  LifeOpsGoalDefinition,
  LifeOpsGoalLink,
  LifeOpsGoogleCapability,
  LifeOpsGoogleConnectorStatus,
  LifeOpsNextCalendarEventContext,
  LifeOpsOccurrenceExplanation,
  LifeOpsOccurrence,
  LifeOpsOccurrenceView,
  LifeOpsOverview,
  LifeOpsOverviewSection,
  LifeOpsOverviewSummary,
  LifeOpsOwnership,
  LifeOpsOwnershipInput,
  LifeOpsPrivacyClass,
  LifeOpsProgressionRule,
  LifeOpsReminderAttempt,
  LifeOpsReminderAttemptOutcome,
  LifeOpsReminderInspection,
  LifeOpsReminderPlan,
  LifeOpsReminderProcessingResult,
  LifeOpsReminderStep,
  LifeOpsReminderUrgency,
  LifeOpsSubjectType,
  LifeOpsTaskDefinition,
  LifeOpsTimeWindowDefinition,
  LifeOpsVisibilityScope,
  LifeOpsWindowPolicy,
  LifeOpsWorkflowAction,
  LifeOpsWorkflowActionPlan,
  LifeOpsWorkflowDefinition,
  LifeOpsWorkflowPermissionPolicy,
  LifeOpsWorkflowRecord,
  LifeOpsWorkflowRun,
  LifeOpsWorkflowSchedule,
  LifeOpsWorkflowTriggerType,
  LifeOpsXConnectorStatus,
  LifeOpsXPostResponse,
  SendLifeOpsGmailReplyRequest,
  SnoozeLifeOpsOccurrenceRequest,
  StartLifeOpsGoogleConnectorRequest,
  StartLifeOpsGoogleConnectorResponse,
  UpdateLifeOpsDefinitionRequest,
  UpdateLifeOpsGoalRequest,
  UpdateLifeOpsWorkflowRequest,
  UpsertLifeOpsChannelPolicyRequest,
  UpsertLifeOpsXConnectorRequest,
} from "@miladyai/shared/contracts/lifeops";
import {
  LIFEOPS_BROWSER_ACTION_KINDS,
  LIFEOPS_CALENDAR_WINDOW_PRESETS,
  LIFEOPS_CHANNEL_TYPES,
  LIFEOPS_CONNECTOR_MODES,
  LIFEOPS_CONTEXT_POLICIES,
  LIFEOPS_DEFINITION_KINDS,
  LIFEOPS_DEFINITION_STATUSES,
  LIFEOPS_DOMAINS,
  LIFEOPS_GMAIL_DRAFT_TONES,
  LIFEOPS_GOAL_SUGGESTION_KINDS,
  LIFEOPS_GOAL_STATUSES,
  LIFEOPS_GOOGLE_CAPABILITIES,
  LIFEOPS_PRIVACY_CLASSES,
  LIFEOPS_REMINDER_CHANNELS,
  LIFEOPS_REMINDER_URGENCY_LEVELS,
  LIFEOPS_REVIEW_STATES,
  LIFEOPS_SUBJECT_TYPES,
  LIFEOPS_TIME_WINDOW_NAMES,
  LIFEOPS_VISIBILITY_SCOPES,
  LIFEOPS_WORKFLOW_STATUSES,
  LIFEOPS_WORKFLOW_TRIGGER_TYPES,
  LIFEOPS_X_CAPABILITIES,
} from "@miladyai/shared/contracts/lifeops";
import { getAgentEventService } from "../runtime/agent-event-service.js";
import {
  computeNextCronRunAtMs,
  parseCronExpression,
} from "../triggers/scheduling.js";
import {
  DEFAULT_REMINDER_STEPS,
  isValidTimeZone,
  resolveDefaultTimeZone,
  resolveDefaultWindowPolicy,
} from "./defaults.js";
import { materializeDefinitionOccurrences } from "./engine.js";
import {
  GoogleApiError,
  googleErrorLooksLikeAdminPolicyBlock,
  googleErrorRequiresReauth,
} from "./google-api-error.js";
import {
  createGoogleCalendarEvent,
  fetchGoogleCalendarEvents,
} from "./google-calendar.js";
import {
  resolveGoogleAvailableModes,
  resolveGoogleExecutionTarget,
  resolveGoogleSourceOfTruth,
  resolvePreferredGoogleGrant,
} from "./google-connector-gateway.js";
import {
  fetchGoogleGmailTriageMessages,
  sendGoogleGmailReply,
} from "./google-gmail.js";
import {
  GoogleManagedClient,
  ManagedGoogleClientError,
  type ManagedGoogleConnectorStatusResponse,
  resolveManagedGoogleCloudConfig,
} from "./google-managed-client.js";
import {
  completeGoogleConnectorOAuth,
  deleteStoredGoogleToken,
  ensureFreshGoogleAccessToken,
  type GoogleConnectorCallbackResult,
  GoogleOAuthError,
  readStoredGoogleToken,
  resolveGoogleOAuthConfig,
  startGoogleConnectorOAuth,
} from "./google-oauth.js";
import { normalizeGoogleCapabilities } from "./google-scopes.js";
import {
  syncAgentDefinitionTodoMirror,
  syncAgentGoalMirror,
} from "./plugin-bridge.js";
import {
  createLifeOpsAuditEvent,
  createLifeOpsBrowserSession,
  createLifeOpsCalendarSyncState,
  createLifeOpsChannelPolicy,
  createLifeOpsConnectorGrant,
  createLifeOpsGmailSyncState,
  createLifeOpsGoalDefinition,
  createLifeOpsReminderAttempt,
  createLifeOpsReminderPlan,
  createLifeOpsTaskDefinition,
  createLifeOpsWorkflowDefinition,
  createLifeOpsWorkflowRun,
  LifeOpsRepository,
} from "./repository.js";
import {
  addDaysToLocalDate,
  addMinutes,
  buildUtcDateFromLocalParts,
  getZonedDateParts,
  type ZonedDateParts,
} from "./time.js";
import {
  readTwilioCredentialsFromEnv,
  sendTwilioSms,
  sendTwilioVoiceCall,
} from "./twilio.js";
import { postToX, readXPosterCredentialsFromEnv } from "./x-poster.js";

const MAX_OVERVIEW_OCCURRENCES = 8;
const MAX_OVERVIEW_REMINDERS = 6;
const OVERVIEW_HORIZON_MINUTES = 18 * 60;
const DAY_MINUTES = 24 * 60;
const GOOGLE_CALENDAR_CACHE_TTL_MS = 5 * 60 * 1000;
const GOOGLE_GMAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const GOOGLE_PRIMARY_CALENDAR_ID = "primary";
const GOOGLE_GMAIL_MAILBOX = "me";
const DEFAULT_GMAIL_TRIAGE_MAX_RESULTS = 12;
const DEFAULT_REMINDER_PROCESS_LIMIT = 24;
const DEFAULT_WORKFLOW_PROCESS_LIMIT = 12;
const GOAL_REVIEW_LOOKBACK_DAYS = 7;
const reminderProcessingQueues = new Map<string, Promise<void>>();
const DEFAULT_CALENDAR_REMINDER_STEPS: LifeOpsReminderStep[] = [
  {
    channel: "in_app",
    offsetMinutes: 30,
    label: "30m before event",
  },
];
const DEFAULT_WORKFLOW_PERMISSION_POLICY: LifeOpsWorkflowPermissionPolicy = {
  allowBrowserActions: false,
  trustedBrowserActions: false,
  allowXPosts: false,
  trustedXPosting: false,
  requireConfirmationForBrowserActions: true,
  requireConfirmationForXPosts: true,
};

type LifeOpsWorkflowSchedulerState = {
  managedBy: "task_worker";
  nextDueAt: string | null;
  lastDueAt: string | null;
  lastRunId: string | null;
  lastRunStatus: LifeOpsWorkflowRun["status"] | null;
  updatedAt: string;
};

type ExecuteWorkflowResult = {
  run: LifeOpsWorkflowRun;
  error: unknown | null;
};

type LifeOpsServiceOptions = {
  ownerEntityId?: string | null;
};

export class LifeOpsServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LifeOpsServiceError";
  }
}

function lifeOpsErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(status: number, message: string): never {
  throw new LifeOpsServiceError(status, message);
}

function defaultOwnerEntityId(runtime: IAgentRuntime): string {
  return stringToUuid(`${requireAgentId(runtime)}-admin-entity`);
}

function normalizeLifeOpsDomain(
  value: unknown,
  fallback: LifeOpsDomain,
): LifeOpsDomain {
  return normalizeEnumValue(
    value,
    "ownership.domain",
    LIFEOPS_DOMAINS,
    fallback,
  );
}

function normalizeLifeOpsSubjectType(
  value: unknown,
  fallback: LifeOpsSubjectType,
): LifeOpsSubjectType {
  return normalizeEnumValue(
    value,
    "ownership.subjectType",
    LIFEOPS_SUBJECT_TYPES,
    fallback,
  );
}

function normalizeLifeOpsVisibilityScope(
  value: unknown,
  fallback: LifeOpsVisibilityScope,
): LifeOpsVisibilityScope {
  return normalizeEnumValue(
    value,
    "ownership.visibilityScope",
    LIFEOPS_VISIBILITY_SCOPES,
    fallback,
  );
}

function normalizeLifeOpsContextPolicy(
  value: unknown,
  fallback: LifeOpsContextPolicy,
): LifeOpsContextPolicy {
  return normalizeEnumValue(
    value,
    "ownership.contextPolicy",
    LIFEOPS_CONTEXT_POLICIES,
    fallback,
  );
}

function _createEmptyOverviewSection(): LifeOpsOverviewSection {
  return {
    occurrences: [],
    goals: [],
    reminders: [],
    summary: {
      activeOccurrenceCount: 0,
      overdueOccurrenceCount: 0,
      snoozedOccurrenceCount: 0,
      activeReminderCount: 0,
      activeGoalCount: 0,
    },
  };
}

function summarizeOverviewSection(
  section: Pick<LifeOpsOverviewSection, "occurrences" | "goals" | "reminders">,
  now: Date,
): LifeOpsOverviewSummary {
  return {
    activeOccurrenceCount: section.occurrences.filter(
      (occurrence) =>
        occurrence.state === "visible" || occurrence.state === "snoozed",
    ).length,
    overdueOccurrenceCount: section.occurrences.filter((occurrence) => {
      if (!occurrence.dueAt) return false;
      const dueAt = new Date(occurrence.dueAt).getTime();
      return dueAt < now.getTime() && occurrence.state !== "completed";
    }).length,
    snoozedOccurrenceCount: section.occurrences.filter(
      (occurrence) => occurrence.state === "snoozed",
    ).length,
    activeReminderCount: section.reminders.length,
    activeGoalCount: section.goals.length,
  };
}

function clearGoogleGrantAuthFailureMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...metadata };
  delete next.authState;
  delete next.lastAuthError;
  delete next.lastAuthErrorAt;
  return next;
}

function googleGrantHasAuthFailureMetadata(
  metadata: Record<string, unknown>,
): boolean {
  return (
    metadata.authState !== undefined ||
    metadata.lastAuthError !== undefined ||
    metadata.lastAuthErrorAt !== undefined
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return { ...value };
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) {
    fail(400, `${field} must be an object`);
  }
  return { ...value };
}

function normalizeOptionalRecord(
  value: unknown,
  field: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  return requireRecord(value, field);
}

function normalizeNullableRecord(
  value: unknown,
  field: string,
): Record<string, unknown> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return requireRecord(value, field);
}

function mergeMetadata(
  current: Record<string, unknown>,
  updates?: Record<string, unknown>,
): Record<string, unknown> {
  const merged = {
    ...current,
    ...cloneRecord(updates),
  };
  if (
    typeof merged.privacyClass !== "string" ||
    merged.privacyClass.trim().length === 0
  ) {
    merged.privacyClass = "private";
  }
  if (merged.privacyClass === "private") {
    merged.publicContextBlocked = true;
  }
  return merged;
}

function requireAgentId(runtime: IAgentRuntime): string {
  const agentId = runtime.agentId;
  if (typeof agentId !== "string" || agentId.trim().length === 0) {
    fail(500, "agent runtime is missing agentId");
  }
  return agentId;
}

function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    fail(400, `${field} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    fail(400, `${field} is required`);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeOptionalBoolean(
  value: unknown,
  field: string,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  fail(400, `${field} must be a boolean`);
}

function normalizeIsoString(value: unknown, field: string): string {
  const text = requireNonEmptyString(value, field);
  const parsed = Date.parse(text);
  if (!Number.isFinite(parsed)) {
    fail(400, `${field} must be a valid ISO datetime`);
  }
  return new Date(parsed).toISOString();
}

function normalizeOptionalIsoString(
  value: unknown,
  field: string,
): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return normalizeIsoString(value, field);
}

function normalizeFiniteNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  fail(400, `${field} must be a finite number`);
}

function normalizeOptionalMinutes(
  value: unknown,
  field: string,
): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const minutes = Math.trunc(normalizeFiniteNumber(value, field));
  if (minutes < 0) {
    fail(400, `${field} must be zero or greater`);
  }
  return minutes;
}

function normalizePositiveInteger(value: unknown, field: string): number {
  const number = Math.trunc(normalizeFiniteNumber(value, field));
  if (number <= 0) {
    fail(400, `${field} must be greater than zero`);
  }
  return number;
}

function normalizePrivacyClass(
  value: unknown,
  field = "privacyClass",
  current: LifeOpsPrivacyClass = "private",
): LifeOpsPrivacyClass {
  if (value === undefined) {
    return current;
  }
  return normalizeEnumValue(value, field, LIFEOPS_PRIVACY_CLASSES);
}

function normalizePhoneNumber(value: unknown, field: string): string {
  const raw = requireNonEmptyString(value, field);
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) {
    const normalized = `+${digits.slice(1).replace(/\D/g, "")}`;
    if (!/^\+\d{10,15}$/.test(normalized)) {
      fail(400, `${field} must be a valid E.164 phone number`);
    }
    return normalized;
  }
  const plainDigits = digits.replace(/\D/g, "");
  if (/^\d{10}$/.test(plainDigits)) {
    return `+1${plainDigits}`;
  }
  if (/^1\d{10}$/.test(plainDigits)) {
    return `+${plainDigits}`;
  }
  fail(400, `${field} must be a valid phone number`);
}

function normalizeReminderUrgency(value: unknown): LifeOpsReminderUrgency {
  if (typeof value !== "string" || value.trim().length === 0) {
    return "medium";
  }
  return normalizeEnumValue(value, "urgency", LIFEOPS_REMINDER_URGENCY_LEVELS);
}

function normalizeXCapabilityRequest(
  value: unknown,
): Array<"x.read" | "x.write"> {
  const entries = Array.isArray(value) ? value : [];
  if (entries.length === 0) {
    fail(400, "capabilities must include at least one X capability");
  }
  const capabilities = entries.map((entry) =>
    normalizeEnumValue(entry, "capabilities", LIFEOPS_X_CAPABILITIES),
  );
  return [...new Set(capabilities)];
}

function normalizeCalendarId(value: unknown): string {
  return normalizeOptionalString(value) ?? GOOGLE_PRIMARY_CALENDAR_ID;
}

function normalizeCalendarTimeZone(value: unknown): string {
  return normalizeValidTimeZone(value, "timeZone", "UTC");
}

function resolveCalendarWindow(args: {
  now: Date;
  timeZone: string;
  requestedTimeMin?: string;
  requestedTimeMax?: string;
}): { timeMin: string; timeMax: string } {
  const explicitTimeMin = normalizeOptionalIsoString(
    args.requestedTimeMin,
    "timeMin",
  );
  const explicitTimeMax = normalizeOptionalIsoString(
    args.requestedTimeMax,
    "timeMax",
  );

  if (explicitTimeMin && explicitTimeMax) {
    if (Date.parse(explicitTimeMax) <= Date.parse(explicitTimeMin)) {
      fail(400, "timeMax must be later than timeMin");
    }
    return {
      timeMin: explicitTimeMin,
      timeMax: explicitTimeMax,
    };
  }

  if (explicitTimeMin || explicitTimeMax) {
    fail(400, "timeMin and timeMax must be provided together");
  }

  const zonedNow = getZonedDateParts(args.now, args.timeZone);
  const dayStart = buildUtcDateFromLocalParts(args.timeZone, {
    year: zonedNow.year,
    month: zonedNow.month,
    day: zonedNow.day,
    hour: 0,
    minute: 0,
    second: 0,
  });
  const nextDay = addDaysToLocalDate(
    {
      year: zonedNow.year,
      month: zonedNow.month,
      day: zonedNow.day,
    },
    1,
  );
  const dayEnd = buildUtcDateFromLocalParts(args.timeZone, {
    year: nextDay.year,
    month: nextDay.month,
    day: nextDay.day,
    hour: 0,
    minute: 0,
    second: 0,
  });

  return {
    timeMin: dayStart.toISOString(),
    timeMax: dayEnd.toISOString(),
  };
}

function hasGoogleCalendarReadCapability(
  grant: LifeOpsConnectorGrant,
): boolean {
  const capabilities = new Set(normalizeGrantCapabilities(grant.capabilities));
  return (
    capabilities.has("google.calendar.read") ||
    capabilities.has("google.calendar.write")
  );
}

function hasGoogleCalendarWriteCapability(
  grant: LifeOpsConnectorGrant,
): boolean {
  const capabilities = new Set(normalizeGrantCapabilities(grant.capabilities));
  return capabilities.has("google.calendar.write");
}

function hasGoogleGmailTriageCapability(grant: LifeOpsConnectorGrant): boolean {
  const capabilities = new Set(normalizeGrantCapabilities(grant.capabilities));
  return capabilities.has("google.gmail.triage");
}

function hasGoogleGmailSendCapability(grant: LifeOpsConnectorGrant): boolean {
  const capabilities = new Set(normalizeGrantCapabilities(grant.capabilities));
  return capabilities.has("google.gmail.send");
}

function normalizeCalendarAttendees(
  value: unknown,
): Array<{ email: string; displayName?: string; optional?: boolean }> {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail(400, "attendees must be an array");
  }
  const seen = new Set<string>();
  const attendees: Array<{
    email: string;
    displayName?: string;
    optional?: boolean;
  }> = [];
  for (const [index, candidate] of value.entries()) {
    if (!candidate || typeof candidate !== "object") {
      fail(400, `attendees[${index}] must be an object`);
    }
    const attendee = candidate as Record<string, unknown>;
    const email = requireNonEmptyString(
      attendee.email,
      `attendees[${index}].email`,
    ).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      fail(400, `attendees[${index}].email must be a valid email address`);
    }
    if (seen.has(email)) {
      continue;
    }
    seen.add(email);
    const normalized: {
      email: string;
      displayName?: string;
      optional?: boolean;
    } = {
      email,
    };
    const displayName = normalizeOptionalString(attendee.displayName);
    if (displayName) {
      normalized.displayName = displayName;
    }
    const optional = normalizeOptionalBoolean(
      attendee.optional,
      `attendees[${index}].optional`,
    );
    if (optional) {
      normalized.optional = true;
    }
    attendees.push(normalized);
  }
  return attendees;
}

function resolveCalendarPresetStart(
  timeZone: string,
  preset: "tomorrow_morning" | "tomorrow_afternoon" | "tomorrow_evening",
  now: Date,
): Date {
  const localNow = getZonedDateParts(now, timeZone);
  const tomorrow = addDaysToLocalDate(
    {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
    },
    1,
  );
  const [hour, minute] =
    preset === "tomorrow_morning"
      ? [9, 0]
      : preset === "tomorrow_afternoon"
        ? [14, 0]
        : [19, 0];
  return buildUtcDateFromLocalParts(timeZone, {
    year: tomorrow.year,
    month: tomorrow.month,
    day: tomorrow.day,
    hour,
    minute,
    second: 0,
  });
}

function resolveCalendarEventRange(
  request: CreateLifeOpsCalendarEventRequest,
  now: Date,
): { startAt: string; endAt: string; timeZone: string } {
  const timeZone = normalizeCalendarTimeZone(request.timeZone);
  const durationMinutes =
    normalizeOptionalMinutes(request.durationMinutes, "durationMinutes") ?? 60;
  if (durationMinutes <= 0) {
    fail(400, "durationMinutes must be greater than 0");
  }

  const preset = normalizeOptionalString(request.windowPreset);
  if (preset) {
    if (!LIFEOPS_CALENDAR_WINDOW_PRESETS.includes(preset as never)) {
      fail(
        400,
        `windowPreset must be one of: ${LIFEOPS_CALENDAR_WINDOW_PRESETS.join(", ")}`,
      );
    }
    const start = resolveCalendarPresetStart(
      timeZone,
      preset as "tomorrow_morning" | "tomorrow_afternoon" | "tomorrow_evening",
      now,
    );
    return {
      startAt: start.toISOString(),
      endAt: addMinutes(start, durationMinutes).toISOString(),
      timeZone,
    };
  }

  const startAt = normalizeOptionalIsoString(request.startAt, "startAt");
  if (!startAt) {
    fail(400, "startAt is required when windowPreset is not provided");
  }
  const endAt =
    normalizeOptionalIsoString(request.endAt, "endAt") ??
    addMinutes(new Date(startAt), durationMinutes).toISOString();
  if (Date.parse(endAt) <= Date.parse(startAt)) {
    fail(400, "endAt must be later than startAt");
  }
  return {
    startAt,
    endAt,
    timeZone,
  };
}

function buildNextCalendarEventContext(
  event: LifeOpsCalendarEvent | null,
  now: Date,
  linkedMail: LifeOpsGmailMessageSummary[] = [],
  linkedMailState: "unavailable" | "cache" | "synced" | "error" = "unavailable",
  linkedMailError: string | null = null,
): LifeOpsNextCalendarEventContext {
  if (!event) {
    return {
      event: null,
      startsAt: null,
      startsInMinutes: null,
      attendeeCount: 0,
      attendeeNames: [],
      location: null,
      conferenceLink: null,
      preparationChecklist: [],
      linkedMailState: "unavailable",
      linkedMailError: null,
      linkedMail: [],
    };
  }

  const attendeeNames = event.attendees
    .filter((attendee) => !attendee.self)
    .map((attendee) => attendee.displayName || attendee.email || "")
    .filter((value) => value.length > 0);
  const startsAtMs = Date.parse(event.startAt);
  const startsInMinutes = Number.isFinite(startsAtMs)
    ? Math.max(0, Math.round((startsAtMs - now.getTime()) / 60_000))
    : null;
  const checklist = [
    event.location.trim().length > 0
      ? `Confirm route or access for ${event.location.trim()}`
      : "",
    event.conferenceLink
      ? "Open and test the call link before the meeting starts"
      : "",
    attendeeNames.length > 0
      ? `Review attendee context for ${attendeeNames.slice(0, 3).join(", ")}`
      : "",
    event.description.trim().length > 0
      ? "Read the event description and agenda notes"
      : "",
  ].filter((value) => value.length > 0);

  return {
    event,
    startsAt: event.startAt,
    startsInMinutes,
    attendeeCount: event.attendees.filter((attendee) => !attendee.self).length,
    attendeeNames,
    location: event.location.trim() || null,
    conferenceLink: event.conferenceLink,
    preparationChecklist: checklist,
    linkedMailState,
    linkedMailError,
    linkedMail: linkedMail.map((message) => ({
      id: message.id,
      subject: message.subject,
      from: message.from,
      receivedAt: message.receivedAt,
      snippet: message.snippet,
      htmlLink: message.htmlLink,
    })),
  };
}

function normalizeGmailTriageMaxResults(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return DEFAULT_GMAIL_TRIAGE_MAX_RESULTS;
  }
  const maxResults = Math.trunc(normalizeFiniteNumber(value, "maxResults"));
  if (maxResults < 1 || maxResults > 50) {
    fail(400, "maxResults must be between 1 and 50");
  }
  return maxResults;
}

function normalizeGmailDraftTone(value: unknown): "brief" | "neutral" | "warm" {
  return normalizeEnumValue(
    value ?? "neutral",
    "tone",
    LIFEOPS_GMAIL_DRAFT_TONES,
  );
}

function normalizeOptionalStringArray(
  value: unknown,
  field: string,
): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    fail(400, `${field} must be an array`);
  }
  const items: string[] = [];
  const seen = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    const item = requireNonEmptyString(
      candidate,
      `${field}[${index}]`,
    ).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(item)) {
      fail(400, `${field}[${index}] must be a valid email address`);
    }
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    items.push(item);
  }
  return items;
}

function normalizeGmailReplyBody(value: unknown): string {
  const body = requireNonEmptyString(value, "bodyText");
  if (body.length > 8000) {
    fail(400, "bodyText must be 8000 characters or fewer");
  }
  return body;
}

function collectCalendarEventContactEmails(
  event: LifeOpsCalendarEvent,
): Set<string> {
  const emails = new Set<string>();
  const organizerEmail =
    typeof event.organizer?.email === "string"
      ? event.organizer.email.trim().toLowerCase()
      : "";
  if (organizerEmail) {
    emails.add(organizerEmail);
  }
  for (const attendee of event.attendees) {
    const email = attendee.email?.trim().toLowerCase() || "";
    if (email) {
      emails.add(email);
    }
  }
  return emails;
}

function extractSubjectTokens(subject: string): string[] {
  return subject
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function findLinkedMailForCalendarEvent(
  event: LifeOpsCalendarEvent,
  messages: LifeOpsGmailMessageSummary[],
): LifeOpsGmailMessageSummary[] {
  const relatedEmails = collectCalendarEventContactEmails(event);
  const subjectTokens = new Set(extractSubjectTokens(event.title));

  return messages
    .filter((message) => {
      if (
        message.fromEmail &&
        relatedEmails.has(message.fromEmail.toLowerCase())
      ) {
        return true;
      }
      if (
        message.to.some((entry) =>
          relatedEmails.has(entry.trim().toLowerCase()),
        ) ||
        message.cc.some((entry) =>
          relatedEmails.has(entry.trim().toLowerCase()),
        )
      ) {
        return true;
      }
      const messageTokens = extractSubjectTokens(message.subject);
      return messageTokens.some((token) => subjectTokens.has(token));
    })
    .sort((left, right) => {
      const receivedDelta =
        Date.parse(right.receivedAt) - Date.parse(left.receivedAt);
      if (receivedDelta !== 0) {
        return receivedDelta;
      }
      return right.triageScore - left.triageScore;
    })
    .slice(0, 3);
}

function isGmailSyncStateFresh(args: {
  syncedAt: string;
  maxResults: number;
  requestedMaxResults: number;
  now: Date;
}): boolean {
  const syncedAtMs = Date.parse(args.syncedAt);
  if (!Number.isFinite(syncedAtMs)) {
    return false;
  }
  if (args.now.getTime() - syncedAtMs > GOOGLE_GMAIL_CACHE_TTL_MS) {
    return false;
  }
  return args.maxResults >= args.requestedMaxResults;
}

function summarizeGmailTriage(
  messages: LifeOpsGmailMessageSummary[],
): LifeOpsGmailTriageFeed["summary"] {
  return {
    unreadCount: messages.filter((message) => message.isUnread).length,
    importantNewCount: messages.filter(
      (message) => message.isUnread && message.isImportant,
    ).length,
    likelyReplyNeededCount: messages.filter(
      (message) => message.likelyReplyNeeded,
    ).length,
  };
}

function buildGmailReplyDraft(args: {
  message: LifeOpsGmailMessageSummary;
  tone: "brief" | "neutral" | "warm";
  intent?: string;
  includeQuotedOriginal: boolean;
  senderName: string;
  sendAllowed: boolean;
}): LifeOpsGmailReplyDraft {
  const recipientLabel =
    args.message.from.split("<")[0]?.trim() ||
    args.message.fromEmail ||
    "there";
  const greeting =
    args.tone === "brief"
      ? `Hi ${recipientLabel},`
      : args.tone === "warm"
        ? `Hi ${recipientLabel},`
        : `Hello ${recipientLabel},`;
  const subject = args.message.subject.trim() || "your message";
  const bodyCore = args.intent?.trim()
    ? args.intent.trim()
    : args.tone === "brief"
      ? `Thanks for the note about ${subject}. I saw it and will follow up shortly.`
      : args.tone === "warm"
        ? `Thanks for reaching out about ${subject}. I reviewed your note and wanted to follow up.`
        : `Thanks for the note about ${subject}. I reviewed your message and wanted to follow up.`;
  const bodyLines = [greeting, "", bodyCore, "", "Best,", args.senderName];
  if (args.includeQuotedOriginal && args.message.snippet.trim().length > 0) {
    bodyLines.push("", "Quoted context:", args.message.snippet.trim());
  }

  const recipient = args.message.replyTo ?? args.message.fromEmail ?? null;
  if (!recipient) {
    fail(409, "The selected Gmail message has no replyable sender.");
  }

  return {
    messageId: args.message.id,
    threadId: args.message.threadId,
    subject: args.message.subject,
    to: [recipient.toLowerCase()],
    cc: [],
    bodyText: bodyLines.join("\n"),
    previewLines: bodyLines.slice(0, 3),
    sendAllowed: args.sendAllowed,
    requiresConfirmation: true,
  };
}

function createCalendarEventId(
  agentId: string,
  provider: LifeOpsConnectorGrant["provider"],
  calendarId: string,
  externalId: string,
): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${agentId}:${provider}:${calendarId}:${externalId}`)
    .digest("hex");
  return `life-calendar-${digest.slice(0, 32)}`;
}

function createGmailMessageId(
  agentId: string,
  provider: LifeOpsConnectorGrant["provider"],
  externalMessageId: string,
): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${agentId}:${provider}:gmail:${externalMessageId}`)
    .digest("hex");
  return `life-gmail-${digest.slice(0, 32)}`;
}

function isCalendarSyncStateFresh(args: {
  syncedAt: string;
  timeMin: string;
  timeMax: string;
  windowStartAt: string;
  windowEndAt: string;
  now: Date;
}): boolean {
  const syncedAtMs = Date.parse(args.syncedAt);
  if (!Number.isFinite(syncedAtMs)) {
    return false;
  }
  if (args.now.getTime() - syncedAtMs > GOOGLE_CALENDAR_CACHE_TTL_MS) {
    return false;
  }
  return (
    Date.parse(args.windowStartAt) <= Date.parse(args.timeMin) &&
    Date.parse(args.windowEndAt) >= Date.parse(args.timeMax)
  );
}

function normalizePriority(value: unknown, current = 3): number {
  if (value === undefined) return current;
  const priority = Math.trunc(normalizeFiniteNumber(value, "priority"));
  if (priority < 1 || priority > 5) {
    fail(400, "priority must be between 1 and 5");
  }
  return priority;
}

function normalizeEnumValue<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
  fallback?: T,
): T {
  if (
    fallback !== undefined &&
    (value === undefined || value === null || value === "")
  ) {
    return fallback;
  }
  const text = requireNonEmptyString(value, field) as T;
  if (!allowed.includes(text)) {
    fail(400, `${field} must be one of: ${allowed.join(", ")}`);
  }
  return text;
}

function normalizeValidTimeZone(
  value: unknown,
  field: string,
  fallback: string = resolveDefaultTimeZone(),
): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value !== "string") {
    fail(400, `${field} must be a valid IANA time zone`);
  }
  const candidate = value.trim();
  if (candidate.length === 0) {
    return fallback;
  }
  if (!isValidTimeZone(candidate)) {
    fail(400, `${field} must be a valid IANA time zone`);
  }
  return candidate;
}

function normalizeWindowPolicyInput(
  value: unknown,
  field: string,
  timeZone: string,
): LifeOpsWindowPolicy {
  if (value === undefined || value === null) {
    return resolveDefaultWindowPolicy(timeZone);
  }
  const input = requireRecord(value, field);
  if (!Array.isArray(input.windows) || input.windows.length === 0) {
    fail(400, `${field}.windows must contain at least one window`);
  }
  const policyTimeZone = normalizeValidTimeZone(
    input.timezone,
    `${field}.timezone`,
    timeZone,
  );
  const seenNames = new Set<string>();
  const windows = input.windows.map((candidate, index) => {
    const windowInput = requireRecord(candidate, `${field}.windows[${index}]`);
    const name = normalizeEnumValue(
      windowInput.name,
      `${field}.windows[${index}].name`,
      LIFEOPS_TIME_WINDOW_NAMES,
    );
    if (seenNames.has(name)) {
      fail(400, `${field}.windows contains duplicate name "${name}"`);
    }
    seenNames.add(name);
    const label = requireNonEmptyString(
      windowInput.label,
      `${field}.windows[${index}].label`,
    );
    const startMinute = Math.trunc(
      normalizeFiniteNumber(
        windowInput.startMinute,
        `${field}.windows[${index}].startMinute`,
      ),
    );
    const endMinute = Math.trunc(
      normalizeFiniteNumber(
        windowInput.endMinute,
        `${field}.windows[${index}].endMinute`,
      ),
    );
    if (startMinute < 0 || startMinute >= DAY_MINUTES * 2) {
      fail(
        400,
        `${field}.windows[${index}].startMinute must be between 0 and 2879`,
      );
    }
    if (endMinute <= startMinute || endMinute > DAY_MINUTES * 2) {
      fail(
        400,
        `${field}.windows[${index}].endMinute must be greater than startMinute and at most 2880`,
      );
    }
    return {
      name,
      label,
      startMinute,
      endMinute,
    } satisfies LifeOpsTimeWindowDefinition;
  });
  return {
    timezone: policyTimeZone,
    windows,
  };
}

function normalizeQuietHoursInput(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }
  const input = requireRecord(value, field);
  if (Object.keys(input).length === 0) {
    return {};
  }
  const timezone = normalizeValidTimeZone(
    input.timezone,
    `${field}.timezone`,
    resolveDefaultTimeZone(),
  );
  const startMinute = Math.trunc(
    normalizeFiniteNumber(input.startMinute, `${field}.startMinute`),
  );
  const endMinute = Math.trunc(
    normalizeFiniteNumber(input.endMinute, `${field}.endMinute`),
  );
  if (startMinute < 0 || startMinute >= DAY_MINUTES) {
    fail(400, `${field}.startMinute must be between 0 and 1439`);
  }
  if (endMinute < 0 || endMinute >= DAY_MINUTES) {
    fail(400, `${field}.endMinute must be between 0 and 1439`);
  }
  let channels: LifeOpsReminderStep["channel"][] | undefined;
  if (input.channels !== undefined) {
    if (!Array.isArray(input.channels)) {
      fail(400, `${field}.channels must be an array`);
    }
    const seen = new Set<LifeOpsReminderStep["channel"]>();
    channels = [];
    for (const [index, candidate] of input.channels.entries()) {
      const channel = normalizeEnumValue(
        candidate,
        `${field}.channels[${index}]`,
        LIFEOPS_REMINDER_CHANNELS,
      );
      if (seen.has(channel)) {
        continue;
      }
      seen.add(channel);
      channels.push(channel);
    }
  }
  return {
    timezone,
    startMinute,
    endMinute,
    ...(channels !== undefined ? { channels } : {}),
  };
}

function normalizeOptionalConnectorMode(
  value: unknown,
  field: string,
): LifeOpsConnectorMode | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return normalizeEnumValue(value, field, LIFEOPS_CONNECTOR_MODES);
}

function normalizeGoogleCapabilityRequest(
  value: unknown,
): LifeOpsGoogleCapability[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    fail(400, "capabilities must be an array");
  }
  const normalized: LifeOpsGoogleCapability[] = [];
  const seen = new Set<LifeOpsGoogleCapability>();
  for (const candidate of value) {
    const capability = normalizeEnumValue(
      candidate,
      "capabilities[]",
      LIFEOPS_GOOGLE_CAPABILITIES,
    );
    if (seen.has(capability)) {
      continue;
    }
    seen.add(capability);
    normalized.push(capability);
  }
  return normalizeGoogleCapabilities(normalized);
}

function normalizeGrantCapabilities(
  capabilities: readonly string[],
): LifeOpsGoogleCapability[] {
  return normalizeGoogleCapabilities(capabilities);
}

function normalizeWorkflowTriggerType(
  value: unknown,
): LifeOpsWorkflowTriggerType {
  return normalizeEnumValue(
    value,
    "triggerType",
    LIFEOPS_WORKFLOW_TRIGGER_TYPES,
  );
}

function normalizeWorkflowSchedule(
  value: unknown,
  triggerType: LifeOpsWorkflowTriggerType,
): LifeOpsWorkflowSchedule {
  if (triggerType === "manual") {
    return { kind: "manual" };
  }
  const schedule = requireRecord(value, "schedule");
  const kind = normalizeEnumValue(schedule.kind, "schedule.kind", [
    "once",
    "interval",
    "cron",
  ] as const);
  if (kind === "once") {
    return {
      kind,
      runAt: normalizeIsoString(schedule.runAt, "schedule.runAt"),
      timezone: normalizeValidTimeZone(schedule.timezone, "schedule.timezone"),
    };
  }
  if (kind === "interval") {
    return {
      kind,
      everyMinutes: normalizePositiveInteger(
        schedule.everyMinutes,
        "schedule.everyMinutes",
      ),
      timezone: normalizeValidTimeZone(schedule.timezone, "schedule.timezone"),
    };
  }
  const cronExpression = requireNonEmptyString(
    schedule.cronExpression,
    "schedule.cronExpression",
  );
  if (!parseCronExpression(cronExpression)) {
    fail(
      400,
      "schedule.cronExpression must be a valid 5-field cron expression",
    );
  }
  return {
    kind,
    cronExpression,
    timezone: normalizeValidTimeZone(schedule.timezone, "schedule.timezone"),
  };
}

function normalizeWorkflowPermissionPolicy(
  value: unknown,
  current: LifeOpsWorkflowPermissionPolicy = DEFAULT_WORKFLOW_PERMISSION_POLICY,
): LifeOpsWorkflowPermissionPolicy {
  if (value === undefined) {
    return { ...current };
  }
  const input = requireRecord(value, "permissionPolicy");
  return {
    allowBrowserActions:
      normalizeOptionalBoolean(
        input.allowBrowserActions,
        "permissionPolicy.allowBrowserActions",
      ) ?? current.allowBrowserActions,
    trustedBrowserActions:
      normalizeOptionalBoolean(
        input.trustedBrowserActions,
        "permissionPolicy.trustedBrowserActions",
      ) ?? current.trustedBrowserActions,
    allowXPosts:
      normalizeOptionalBoolean(
        input.allowXPosts,
        "permissionPolicy.allowXPosts",
      ) ?? current.allowXPosts,
    trustedXPosting:
      normalizeOptionalBoolean(
        input.trustedXPosting,
        "permissionPolicy.trustedXPosting",
      ) ?? current.trustedXPosting,
    requireConfirmationForBrowserActions:
      normalizeOptionalBoolean(
        input.requireConfirmationForBrowserActions,
        "permissionPolicy.requireConfirmationForBrowserActions",
      ) ?? current.requireConfirmationForBrowserActions,
    requireConfirmationForXPosts:
      normalizeOptionalBoolean(
        input.requireConfirmationForXPosts,
        "permissionPolicy.requireConfirmationForXPosts",
      ) ?? current.requireConfirmationForXPosts,
  };
}

function normalizeBrowserActionInput(
  value: unknown,
  field: string,
): Omit<LifeOpsBrowserAction, "id"> {
  const input = requireRecord(value, field);
  const kind = normalizeEnumValue(
    input.kind,
    `${field}.kind`,
    LIFEOPS_BROWSER_ACTION_KINDS,
  );
  const label = requireNonEmptyString(input.label, `${field}.label`);
  const url = normalizeOptionalString(input.url) ?? null;
  const selector = normalizeOptionalString(input.selector) ?? null;
  const text = normalizeOptionalString(input.text) ?? null;
  if (kind === "navigate" && !url) {
    fail(400, `${field}.url is required for navigate actions`);
  }
  if (kind !== "navigate" && !selector) {
    fail(400, `${field}.selector is required for ${kind} actions`);
  }
  if (kind === "type" && text === null) {
    fail(400, `${field}.text is required for type actions`);
  }
  return {
    kind,
    label,
    url,
    selector,
    text,
    accountAffecting:
      normalizeOptionalBoolean(
        input.accountAffecting,
        `${field}.accountAffecting`,
      ) ?? false,
    requiresConfirmation:
      normalizeOptionalBoolean(
        input.requiresConfirmation,
        `${field}.requiresConfirmation`,
      ) ?? false,
    metadata:
      normalizeOptionalRecord(input.metadata, `${field}.metadata`) ?? {},
  };
}

function normalizeWorkflowActionPlan(
  value: unknown,
): LifeOpsWorkflowActionPlan {
  const input = requireRecord(value, "actionPlan");
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    fail(400, "actionPlan.steps must contain at least one step");
  }
  const steps: LifeOpsWorkflowAction[] = input.steps.map((candidate, index) => {
    const step = requireRecord(candidate, `actionPlan.steps[${index}]`);
    const kind = normalizeEnumValue(
      step.kind,
      `actionPlan.steps[${index}].kind`,
      [
        "create_task",
        "get_calendar_feed",
        "get_gmail_triage",
        "summarize",
        "browser",
      ] as const,
    );
    const id = normalizeOptionalString(step.id);
    const resultKey = normalizeOptionalString(step.resultKey);
    if (kind === "create_task") {
      return {
        kind,
        id,
        resultKey,
        request: requireRecord(
          step.request,
          `actionPlan.steps[${index}].request`,
        ) as unknown as CreateLifeOpsDefinitionRequest,
      };
    }
    if (kind === "get_calendar_feed") {
      return {
        kind,
        id,
        resultKey,
        request: normalizeOptionalRecord(
          step.request,
          `actionPlan.steps[${index}].request`,
        ) as unknown as GetLifeOpsCalendarFeedRequest | undefined,
      };
    }
    if (kind === "get_gmail_triage") {
      return {
        kind,
        id,
        resultKey,
        request: normalizeOptionalRecord(
          step.request,
          `actionPlan.steps[${index}].request`,
        ) as unknown as GetLifeOpsGmailTriageRequest | undefined,
      };
    }
    if (kind === "summarize") {
      return {
        kind,
        id,
        resultKey,
        sourceKey: normalizeOptionalString(step.sourceKey),
        prompt: normalizeOptionalString(step.prompt),
      };
    }
    if (!Array.isArray(step.actions) || step.actions.length === 0) {
      fail(
        400,
        `actionPlan.steps[${index}].actions must contain at least one action`,
      );
    }
    return {
      kind,
      id,
      resultKey,
      sessionTitle: requireNonEmptyString(
        step.sessionTitle,
        `actionPlan.steps[${index}].sessionTitle`,
      ),
      actions: step.actions.map((action, actionIndex) =>
        normalizeBrowserActionInput(
          action,
          `actionPlan.steps[${index}].actions[${actionIndex}]`,
        ),
      ),
    };
  });
  return { steps };
}

function normalizeWindowNames(
  value: unknown,
  field: string,
  windowPolicy: LifeOpsWindowPolicy,
): Array<LifeOpsTimeWindowDefinition["name"]> {
  if (!Array.isArray(value) || value.length === 0) {
    fail(400, `${field} must contain at least one time window`);
  }
  const allowedNames = new Set(
    windowPolicy.windows.map((window) => window.name),
  );
  const seen = new Set<string>();
  const windows: Array<LifeOpsTimeWindowDefinition["name"]> = [];
  for (const candidate of value) {
    const name = requireNonEmptyString(
      candidate,
      field,
    ) as LifeOpsTimeWindowDefinition["name"];
    if (!allowedNames.has(name)) {
      fail(400, `${field} contains unknown window "${name}"`);
    }
    if (!seen.has(name)) {
      seen.add(name);
      windows.push(name);
    }
  }
  return windows;
}

function normalizeCadence(
  cadence: LifeOpsCadence,
  windowPolicy: LifeOpsWindowPolicy,
): LifeOpsCadence {
  const visibilityLeadMinutes = normalizeOptionalMinutes(
    cadence.visibilityLeadMinutes,
    "cadence.visibilityLeadMinutes",
  );
  const visibilityLagMinutes = normalizeOptionalMinutes(
    cadence.visibilityLagMinutes,
    "cadence.visibilityLagMinutes",
  );

  const withVisibility = <T extends object>(
    value: T,
  ): T & {
    visibilityLeadMinutes?: number;
    visibilityLagMinutes?: number;
  } => {
    const next: T & {
      visibilityLeadMinutes?: number;
      visibilityLagMinutes?: number;
    } = { ...value };
    if (visibilityLeadMinutes !== undefined) {
      next.visibilityLeadMinutes = visibilityLeadMinutes;
    }
    if (visibilityLagMinutes !== undefined) {
      next.visibilityLagMinutes = visibilityLagMinutes;
    }
    return next;
  };

  switch (cadence.kind) {
    case "once":
      return withVisibility({
        kind: "once",
        dueAt: normalizeIsoString(cadence.dueAt, "cadence.dueAt"),
      }) as LifeOpsCadence;
    case "daily":
      return withVisibility({
        kind: "daily",
        windows: normalizeWindowNames(
          cadence.windows,
          "cadence.windows",
          windowPolicy,
        ),
      }) as LifeOpsCadence;
    case "weekly": {
      if (!Array.isArray(cadence.weekdays) || cadence.weekdays.length === 0) {
        fail(400, "cadence.weekdays must contain at least one weekday");
      }
      const weekdays = [
        ...new Set(
          cadence.weekdays.map((weekday) =>
            Math.trunc(normalizeFiniteNumber(weekday, "cadence.weekdays")),
          ),
        ),
      ].sort((left, right) => left - right);
      if (weekdays.some((weekday) => weekday < 0 || weekday > 6)) {
        fail(400, "cadence.weekdays must use Sunday=0 through Saturday=6");
      }
      return withVisibility({
        kind: "weekly",
        weekdays,
        windows: normalizeWindowNames(
          cadence.windows,
          "cadence.windows",
          windowPolicy,
        ),
      }) as LifeOpsCadence;
    }
    case "times_per_day": {
      if (!Array.isArray(cadence.slots) || cadence.slots.length === 0) {
        fail(400, "cadence.slots must contain at least one slot");
      }
      const seen = new Set<string>();
      const slots = cadence.slots.map((slot, index) => {
        const key = requireNonEmptyString(
          slot.key,
          `cadence.slots[${index}].key`,
        );
        if (seen.has(key)) {
          fail(400, `cadence.slots contains duplicate key "${key}"`);
        }
        seen.add(key);
        const label = requireNonEmptyString(
          slot.label,
          `cadence.slots[${index}].label`,
        );
        const minuteOfDay = Math.trunc(
          normalizeFiniteNumber(
            slot.minuteOfDay,
            `cadence.slots[${index}].minuteOfDay`,
          ),
        );
        const durationMinutes = Math.trunc(
          normalizeFiniteNumber(
            slot.durationMinutes,
            `cadence.slots[${index}].durationMinutes`,
          ),
        );
        if (minuteOfDay < 0 || minuteOfDay >= DAY_MINUTES) {
          fail(
            400,
            `cadence.slots[${index}].minuteOfDay must be between 0 and 1439`,
          );
        }
        if (durationMinutes <= 0 || durationMinutes > DAY_MINUTES) {
          fail(
            400,
            `cadence.slots[${index}].durationMinutes must be between 1 and 1440`,
          );
        }
        return {
          key,
          label,
          minuteOfDay,
          durationMinutes,
        };
      });
      return withVisibility({
        kind: "times_per_day",
        slots,
      }) as LifeOpsCadence;
    }
    default:
      fail(400, "cadence.kind is not supported");
  }
}

function normalizeProgressionRule(
  rule: LifeOpsProgressionRule | undefined,
): LifeOpsProgressionRule {
  if (!rule || rule.kind === "none") {
    return { kind: "none" };
  }
  if (rule.kind !== "linear_increment") {
    fail(400, "progressionRule.kind is not supported");
  }
  const metric = requireNonEmptyString(rule.metric, "progressionRule.metric");
  const start = normalizeFiniteNumber(rule.start, "progressionRule.start");
  const step = normalizeFiniteNumber(rule.step, "progressionRule.step");
  if (step <= 0) {
    fail(400, "progressionRule.step must be greater than 0");
  }
  const normalized: LifeOpsProgressionRule = {
    kind: "linear_increment",
    metric,
    start,
    step,
  };
  const unit = normalizeOptionalString(rule.unit);
  if (unit) {
    normalized.unit = unit;
  }
  return normalized;
}

function normalizeReminderSteps(value: unknown): LifeOpsReminderStep[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(400, "reminderPlan.steps must contain at least one step");
  }
  const steps = value.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object") {
      fail(400, `reminderPlan.steps[${index}] must be an object`);
    }
    const stepRecord = candidate as Record<string, unknown>;
    const channel = normalizeEnumValue(
      stepRecord.channel,
      `reminderPlan.steps[${index}].channel`,
      LIFEOPS_REMINDER_CHANNELS,
    );
    const offsetMinutes = Math.trunc(
      normalizeFiniteNumber(
        stepRecord.offsetMinutes,
        `reminderPlan.steps[${index}].offsetMinutes`,
      ),
    );
    if (offsetMinutes < 0) {
      fail(
        400,
        `reminderPlan.steps[${index}].offsetMinutes must be zero or greater`,
      );
    }
    const label = requireNonEmptyString(
      stepRecord.label,
      `reminderPlan.steps[${index}].label`,
    );
    return {
      channel,
      offsetMinutes,
      label,
    } satisfies LifeOpsReminderStep;
  });
  steps.sort((left, right) => left.offsetMinutes - right.offsetMinutes);
  return steps;
}

function normalizeReminderPlanDraft(
  reminderPlan:
    | CreateLifeOpsDefinitionRequest["reminderPlan"]
    | UpdateLifeOpsDefinitionRequest["reminderPlan"]
    | undefined,
  mode: "create" | "update",
):
  | {
      steps: LifeOpsReminderStep[];
      mutePolicy: Record<string, unknown>;
      quietHours: Record<string, unknown>;
    }
  | null
  | undefined {
  if (reminderPlan === undefined) {
    return mode === "create"
      ? {
          steps: DEFAULT_REMINDER_STEPS.map((step) => ({ ...step })),
          mutePolicy: {},
          quietHours: {},
        }
      : undefined;
  }
  if (reminderPlan === null) return null;
  return {
    steps: normalizeReminderSteps(reminderPlan.steps),
    mutePolicy: cloneRecord(reminderPlan.mutePolicy),
    quietHours: normalizeQuietHoursInput(
      reminderPlan.quietHours,
      "reminderPlan.quietHours",
    ),
  };
}

function buildWindowStartDate(
  timeZone: string,
  dateOnly: Pick<ZonedDateParts, "year" | "month" | "day">,
  startMinute: number,
): Date {
  const dayOffset = Math.floor(startMinute / DAY_MINUTES);
  const minuteOfDay = startMinute % DAY_MINUTES;
  const localDate = addDaysToLocalDate(dateOnly, dayOffset);
  return buildUtcDateFromLocalParts(timeZone, {
    ...localDate,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    second: 0,
  });
}

function resolveUpcomingWindowStart(
  timeZone: string,
  windowPolicy: LifeOpsWindowPolicy,
  baseDate: Pick<ZonedDateParts, "year" | "month" | "day">,
  candidateNames: string[],
  fallbackMinute: number,
  notBefore: Date,
): Date {
  const matchingWindows = windowPolicy.windows
    .filter((window) => candidateNames.includes(window.name))
    .sort((left, right) => left.startMinute - right.startMinute);
  const candidateMinutes =
    matchingWindows.length > 0
      ? matchingWindows.map((window) => window.startMinute)
      : [fallbackMinute];
  for (let dayDelta = 0; dayDelta <= 2; dayDelta += 1) {
    const dateOnly = addDaysToLocalDate(baseDate, dayDelta);
    for (const minuteOfDay of candidateMinutes) {
      const candidate = buildWindowStartDate(timeZone, dateOnly, minuteOfDay);
      if (candidate.getTime() > notBefore.getTime()) {
        return candidate;
      }
    }
  }
  return buildWindowStartDate(
    timeZone,
    addDaysToLocalDate(baseDate, 1),
    candidateMinutes[0],
  );
}

function computeSnoozedUntil(
  definition: LifeOpsTaskDefinition,
  request: SnoozeLifeOpsOccurrenceRequest,
  now: Date,
): Date {
  if (request.preset) {
    const localNow = getZonedDateParts(now, definition.timezone);
    const today = {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
    };
    switch (request.preset) {
      case "15m":
        return addMinutes(now, 15);
      case "30m":
        return addMinutes(now, 30);
      case "1h":
        return addMinutes(now, 60);
      case "tonight":
        return resolveUpcomingWindowStart(
          definition.timezone,
          definition.windowPolicy,
          today,
          ["evening", "night"],
          20 * 60,
          now,
        );
      case "tomorrow_morning": {
        const tomorrow = addDaysToLocalDate(today, 1);
        return resolveUpcomingWindowStart(
          definition.timezone,
          definition.windowPolicy,
          tomorrow,
          ["morning"],
          8 * 60,
          new Date(now.getTime() - 1),
        );
      }
      default:
        fail(400, "preset is not supported");
    }
  }
  const minutes = request.minutes ?? 30;
  const normalizedMinutes = Math.trunc(
    normalizeFiniteNumber(minutes, "minutes"),
  );
  if (normalizedMinutes <= 0) {
    fail(400, "minutes must be greater than 0");
  }
  return addMinutes(now, normalizedMinutes);
}

function sortOverviewOccurrences(
  occurrences: LifeOpsOccurrenceView[],
): LifeOpsOccurrenceView[] {
  return [...occurrences].sort((left, right) => {
    const leftStart = new Date(left.relevanceStartAt).getTime();
    const rightStart = new Date(right.relevanceStartAt).getTime();
    if (leftStart !== rightStart) {
      return leftStart - rightStart;
    }
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.title.localeCompare(right.title);
  });
}

function selectOverviewOccurrences(
  occurrences: LifeOpsOccurrenceView[],
): LifeOpsOccurrenceView[] {
  const visible = sortOverviewOccurrences(
    occurrences.filter(
      (occurrence) =>
        occurrence.state === "visible" || occurrence.state === "snoozed",
    ),
  );
  const pending = sortOverviewOccurrences(
    occurrences.filter((occurrence) => occurrence.state === "pending"),
  );
  const next: LifeOpsOccurrenceView[] = [];
  for (const occurrence of visible) {
    if (next.length >= MAX_OVERVIEW_OCCURRENCES) break;
    next.push(occurrence);
  }
  for (const occurrence of pending) {
    if (next.length >= MAX_OVERVIEW_OCCURRENCES) break;
    next.push(occurrence);
  }
  return next;
}

function buildActiveReminders(
  occurrences: LifeOpsOccurrenceView[],
  plansByDefinitionId: Map<string, LifeOpsReminderPlan>,
  now: Date,
): LifeOpsActiveReminderView[] {
  const reminders: LifeOpsActiveReminderView[] = [];
  for (const occurrence of occurrences) {
    const plan = plansByDefinitionId.get(occurrence.definitionId);
    if (!plan) continue;
    if (
      occurrence.state === "completed" ||
      occurrence.state === "skipped" ||
      occurrence.state === "expired" ||
      occurrence.state === "muted"
    ) {
      continue;
    }
    const anchorIso = occurrence.snoozedUntil ?? occurrence.relevanceStartAt;
    const anchorDate = new Date(anchorIso);
    for (const [stepIndex, step] of plan.steps.entries()) {
      const scheduledFor = addMinutes(anchorDate, step.offsetMinutes);
      if (scheduledFor.getTime() > now.getTime()) {
        continue;
      }
      reminders.push({
        domain: occurrence.domain,
        subjectType: occurrence.subjectType,
        subjectId: occurrence.subjectId,
        ownerType: "occurrence",
        ownerId: occurrence.id,
        occurrenceId: occurrence.id,
        definitionId: occurrence.definitionId,
        eventId: null,
        title: occurrence.title,
        channel: step.channel,
        stepIndex,
        stepLabel: step.label,
        scheduledFor: scheduledFor.toISOString(),
        dueAt: occurrence.dueAt,
        state: occurrence.state,
        htmlLink: null,
        eventStartAt: null,
      });
    }
  }
  reminders.sort(
    (left, right) =>
      new Date(left.scheduledFor).getTime() -
      new Date(right.scheduledFor).getTime(),
  );
  return reminders;
}

function buildActiveCalendarEventReminders(
  events: LifeOpsCalendarEvent[],
  plansByEventId: Map<string, LifeOpsReminderPlan>,
  ownerEntityId: string,
  now: Date,
): LifeOpsActiveReminderView[] {
  const reminders: LifeOpsActiveReminderView[] = [];
  for (const event of events) {
    const plan = plansByEventId.get(event.id);
    if (!plan) continue;
    if (event.status === "cancelled") {
      continue;
    }
    const startAt = new Date(event.startAt);
    const endAt = new Date(event.endAt);
    if (endAt.getTime() <= now.getTime()) {
      continue;
    }
    for (const [stepIndex, step] of plan.steps.entries()) {
      const scheduledFor = addMinutes(startAt, -step.offsetMinutes);
      if (scheduledFor.getTime() > now.getTime()) {
        continue;
      }
      reminders.push({
        domain: "user_lifeops",
        subjectType: "owner",
        subjectId: ownerEntityId,
        ownerType: "calendar_event",
        ownerId: event.id,
        occurrenceId: null,
        definitionId: null,
        eventId: event.id,
        title: event.title,
        channel: step.channel,
        stepIndex,
        stepLabel: step.label,
        scheduledFor: scheduledFor.toISOString(),
        dueAt: event.startAt,
        state: "upcoming",
        htmlLink: event.htmlLink,
        eventStartAt: event.startAt,
      });
    }
  }
  reminders.sort(
    (left, right) =>
      new Date(left.scheduledFor).getTime() -
      new Date(right.scheduledFor).getTime(),
  );
  return reminders;
}

function parseQuietHoursPolicy(value: LifeOpsReminderPlan["quietHours"]): {
  timezone: string;
  startMinute: number;
  endMinute: number;
  channels: Set<string>;
} | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.timezone !== "string" ||
    typeof value.startMinute !== "number" ||
    typeof value.endMinute !== "number"
  ) {
    return null;
  }
  const timezone = value.timezone.trim();
  if (!isValidTimeZone(timezone)) {
    return null;
  }
  const channels = Array.isArray(value.channels)
    ? new Set(
        value.channels.filter(
          (entry): entry is string => typeof entry === "string",
        ),
      )
    : new Set<string>();
  const startMinute = Math.trunc(value.startMinute);
  const endMinute = Math.trunc(value.endMinute);
  if (
    startMinute < 0 ||
    startMinute >= DAY_MINUTES ||
    endMinute < 0 ||
    endMinute >= DAY_MINUTES
  ) {
    return null;
  }
  return {
    timezone,
    startMinute,
    endMinute,
    channels,
  };
}

function isWithinQuietHours(args: {
  now: Date;
  quietHours: LifeOpsReminderPlan["quietHours"];
  channel: LifeOpsReminderStep["channel"];
}): boolean {
  const quietHours = parseQuietHoursPolicy(args.quietHours);
  if (!quietHours) {
    return false;
  }
  if (quietHours.channels.size > 0 && !quietHours.channels.has(args.channel)) {
    return false;
  }
  const parts = getZonedDateParts(args.now, quietHours.timezone);
  const minuteOfDay = parts.hour * 60 + parts.minute;
  if (quietHours.startMinute === quietHours.endMinute) {
    return false;
  }
  if (quietHours.startMinute < quietHours.endMinute) {
    return (
      minuteOfDay >= quietHours.startMinute &&
      minuteOfDay < quietHours.endMinute
    );
  }
  return (
    minuteOfDay >= quietHours.startMinute || minuteOfDay < quietHours.endMinute
  );
}

function isReminderChannelAllowedForUrgency(
  channel: LifeOpsReminderStep["channel"],
  urgency: LifeOpsReminderUrgency,
): boolean {
  if (channel === "in_app") {
    return true;
  }
  if (channel === "voice") {
    return urgency === "high" || urgency === "critical";
  }
  if (channel === "sms") {
    return urgency !== "low";
  }
  return urgency === "medium" || urgency === "high" || urgency === "critical";
}

function priorityToUrgency(priority: number): LifeOpsReminderUrgency {
  if (priority <= 1) return "critical";
  if (priority === 2) return "high";
  if (priority === 3) return "medium";
  return "low";
}

function buildReminderBody(args: {
  title: string;
  scheduledFor: string;
  channel: LifeOpsReminderStep["channel"];
}): string {
  const at = new Date(args.scheduledFor).toISOString();
  if (args.channel === "voice") {
    return `Reminder for ${args.title}. Scheduled at ${at}.`;
  }
  return `Reminder: ${args.title} is due. Scheduled at ${at}.`;
}

function createBrowserSessionActions(
  actions: Array<Omit<LifeOpsBrowserAction, "id">>,
): LifeOpsBrowserAction[] {
  return actions.map((action) => ({
    ...action,
    id: crypto.randomUUID(),
  }));
}

function resolveAwaitingBrowserActionId(
  actions: LifeOpsBrowserAction[],
): string | null {
  const next = actions.find(
    (action) => action.accountAffecting || action.requiresConfirmation,
  );
  return next?.id ?? null;
}

function summarizeWorkflowValue(value: unknown, prompt?: string): string {
  const prefix = prompt?.trim() ? `${prompt.trim()}: ` : "";
  if (isRecord(value) && Array.isArray(value.events)) {
    const titles = value.events
      .map((event) =>
        isRecord(event) && typeof event.title === "string" ? event.title : "",
      )
      .filter((title) => title.length > 0)
      .slice(0, 3);
    return `${prefix}${titles.length} calendar events${titles.length > 0 ? ` (${titles.join(", ")})` : ""}`;
  }
  if (isRecord(value) && Array.isArray(value.messages)) {
    const subjects = value.messages
      .map((message) =>
        isRecord(message) && typeof message.subject === "string"
          ? message.subject
          : "",
      )
      .filter((subject) => subject.length > 0)
      .slice(0, 3);
    return `${prefix}${subjects.length} Gmail items${subjects.length > 0 ? ` (${subjects.join(", ")})` : ""}`;
  }
  if (typeof value === "string") {
    return `${prefix}${value}`;
  }
  return `${prefix}${JSON.stringify(value)}`;
}

function parseWorkflowSchedulerState(
  value: unknown,
): LifeOpsWorkflowSchedulerState | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    managedBy: "task_worker",
    nextDueAt:
      typeof value.nextDueAt === "string" && value.nextDueAt.trim().length > 0
        ? value.nextDueAt
        : null,
    lastDueAt:
      typeof value.lastDueAt === "string" && value.lastDueAt.trim().length > 0
        ? value.lastDueAt
        : null,
    lastRunId:
      typeof value.lastRunId === "string" && value.lastRunId.trim().length > 0
        ? value.lastRunId
        : null,
    lastRunStatus:
      typeof value.lastRunStatus === "string" && value.lastRunStatus.length > 0
        ? (value.lastRunStatus as LifeOpsWorkflowRun["status"])
        : null,
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt.trim().length > 0
        ? value.updatedAt
        : new Date().toISOString(),
  };
}

export class LifeOpsService {
  private readonly repository: LifeOpsRepository;
  private readonly ownerEntityIdValue: string;
  private readonly googleManagedClient: GoogleManagedClient;

  constructor(
    private readonly runtime: IAgentRuntime,
    options: LifeOpsServiceOptions = {},
  ) {
    this.repository = new LifeOpsRepository(runtime);
    this.googleManagedClient = new GoogleManagedClient();
    this.ownerEntityIdValue =
      normalizeOptionalString(options.ownerEntityId) ??
      defaultOwnerEntityId(runtime);
  }

  private agentId(): string {
    return requireAgentId(this.runtime);
  }

  private ownerEntityId(): string {
    return this.ownerEntityIdValue;
  }

  private normalizeOwnership(
    input: LifeOpsOwnershipInput | undefined,
    current?: LifeOpsOwnership,
  ): LifeOpsOwnership {
    const requestedDomain =
      input?.domain !== undefined ? input.domain : current?.domain;
    const domain = normalizeLifeOpsDomain(
      requestedDomain,
      current?.domain ?? "user_lifeops",
    );
    const requestedSubjectType =
      input?.subjectType !== undefined
        ? input.subjectType
        : current?.subjectType;
    const subjectType = normalizeLifeOpsSubjectType(
      requestedSubjectType,
      current?.subjectType ?? (domain === "agent_ops" ? "agent" : "owner"),
    );

    if (domain === "agent_ops" && subjectType !== "agent") {
      fail(
        400,
        "ownership.subjectType must be agent when ownership.domain is agent_ops",
      );
    }
    if (domain === "user_lifeops" && subjectType !== "owner") {
      fail(
        400,
        "ownership.subjectType must be owner when ownership.domain is user_lifeops",
      );
    }

    const expectedSubjectId =
      subjectType === "agent" ? this.agentId() : this.ownerEntityId();
    const requestedSubjectId =
      input?.subjectId !== undefined
        ? normalizeOptionalString(input.subjectId)
        : current?.subjectId;
    if (
      requestedSubjectId !== undefined &&
      requestedSubjectId !== null &&
      requestedSubjectId !== expectedSubjectId
    ) {
      fail(
        400,
        `ownership.subjectId must be ${expectedSubjectId} for ${subjectType} scope in v1`,
      );
    }

    const fallbackVisibility =
      subjectType === "agent" ? "agent_and_admin" : "owner_agent_admin";
    const fallbackContext = subjectType === "agent" ? "never" : "explicit_only";
    return {
      domain,
      subjectType,
      subjectId: expectedSubjectId,
      visibilityScope: normalizeLifeOpsVisibilityScope(
        input?.visibilityScope ?? current?.visibilityScope,
        current?.visibilityScope ?? fallbackVisibility,
      ),
      contextPolicy: normalizeLifeOpsContextPolicy(
        input?.contextPolicy ?? current?.contextPolicy,
        current?.contextPolicy ?? fallbackContext,
      ),
    };
  }

  private normalizeChildOwnership(
    parent: LifeOpsOwnership,
    input: LifeOpsOwnershipInput | undefined,
    field = "ownership",
  ): LifeOpsOwnership {
    const normalized = this.normalizeOwnership(input, parent);
    if (
      normalized.domain !== parent.domain ||
      normalized.subjectType !== parent.subjectType ||
      normalized.subjectId !== parent.subjectId
    ) {
      fail(400, `${field} must match the parent workflow scope in v1`);
    }
    return normalized;
  }

  private logLifeOpsWarn(
    operation: string,
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    logger.warn(
      {
        boundary: "lifeops",
        operation,
        agentId: this.agentId(),
        ...context,
      },
      message,
    );
  }

  private logLifeOpsError(
    operation: string,
    error: unknown,
    context: Record<string, unknown> = {},
  ): void {
    logger.error(
      {
        boundary: "lifeops",
        operation,
        agentId: this.agentId(),
        err: error instanceof Error ? error : undefined,
        ...context,
      },
      `[lifeops] ${operation} failed: ${lifeOpsErrorMessage(error)}`,
    );
  }

  private async withReminderProcessingLock<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    const agentId = this.agentId();
    const queueTail =
      reminderProcessingQueues.get(agentId) ?? Promise.resolve();
    let releaseCurrent = () => {};
    const currentTurn = new Promise<void>((resolve) => {
      releaseCurrent = resolve;
    });
    const nextQueueTail = queueTail.then(() => currentTurn);
    reminderProcessingQueues.set(agentId, nextQueueTail);
    await queueTail;
    try {
      return await operation();
    } finally {
      releaseCurrent();
      if (reminderProcessingQueues.get(agentId) === nextQueueTail) {
        reminderProcessingQueues.delete(agentId);
      }
    }
  }

  private async recordAudit(
    eventType: LifeOpsAuditEventType,
    ownerType: "definition" | "occurrence" | "goal",
    ownerId: string,
    reason: string,
    inputs: Record<string, unknown>,
    decision: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.createAuditEvent(
      createLifeOpsAuditEvent({
        agentId: this.agentId(),
        eventType,
        ownerType,
        ownerId,
        reason,
        inputs,
        decision,
        actor: "user",
      }),
    );
  }

  private async recordConnectorAudit(
    ownerId: string,
    reason: string,
    inputs: Record<string, unknown>,
    decision: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.createAuditEvent(
      createLifeOpsAuditEvent({
        agentId: this.agentId(),
        eventType: "connector_grant_updated",
        ownerType: "connector",
        ownerId,
        reason,
        inputs,
        decision,
        actor: "user",
      }),
    );
  }

  private async recordChannelPolicyAudit(
    ownerId: string,
    reason: string,
    inputs: Record<string, unknown>,
    decision: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.createAuditEvent(
      createLifeOpsAuditEvent({
        agentId: this.agentId(),
        eventType: "channel_policy_updated",
        ownerType: "channel_policy",
        ownerId,
        reason,
        inputs,
        decision,
        actor: "user",
      }),
    );
  }

  private async recordWorkflowAudit(
    eventType: "workflow_created" | "workflow_updated" | "workflow_run",
    ownerId: string,
    actor: "user" | "workflow" = "user",
    reason: string,
    inputs: Record<string, unknown>,
    decision: Record<string, unknown>,
  ): Promise<LifeOpsAuditEvent> {
    const event = createLifeOpsAuditEvent({
      agentId: this.agentId(),
      eventType,
      ownerType: "workflow",
      ownerId,
      reason,
      inputs,
      decision,
      actor,
    });
    await this.repository.createAuditEvent(event);
    return event;
  }

  private async recordReminderAudit(
    eventType: "reminder_due" | "reminder_delivered" | "reminder_blocked",
    ownerType: "occurrence" | "calendar_event",
    ownerId: string,
    reason: string,
    inputs: Record<string, unknown>,
    decision: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.createAuditEvent(
      createLifeOpsAuditEvent({
        agentId: this.agentId(),
        eventType,
        ownerType,
        ownerId,
        reason,
        inputs,
        decision,
        actor: "workflow",
      }),
    );
  }

  private async recordBrowserAudit(
    eventType: "browser_session_created" | "browser_session_updated",
    ownerId: string,
    reason: string,
    inputs: Record<string, unknown>,
    decision: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.createAuditEvent(
      createLifeOpsAuditEvent({
        agentId: this.agentId(),
        eventType,
        ownerType: "browser_session",
        ownerId,
        reason,
        inputs,
        decision,
        actor: "user",
      }),
    );
  }

  private async recordXPostAudit(
    ownerId: string,
    reason: string,
    inputs: Record<string, unknown>,
    decision: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.createAuditEvent(
      createLifeOpsAuditEvent({
        agentId: this.agentId(),
        eventType: "x_post_sent",
        ownerType: "connector",
        ownerId,
        reason,
        inputs,
        decision,
        actor: "user",
      }),
    );
  }

  private async clearGoogleGrantAuthFailure(
    grant: LifeOpsConnectorGrant,
  ): Promise<LifeOpsConnectorGrant> {
    if (!googleGrantHasAuthFailureMetadata(grant.metadata)) {
      return grant;
    }

    const nowIso = new Date().toISOString();
    const nextGrant: LifeOpsConnectorGrant = {
      ...grant,
      metadata: clearGoogleGrantAuthFailureMetadata(grant.metadata),
      lastRefreshAt: nowIso,
      updatedAt: nowIso,
    };
    await this.repository.upsertConnectorGrant(nextGrant);
    return nextGrant;
  }

  private async markGoogleGrantNeedsReauth(
    grant: LifeOpsConnectorGrant,
    message: string,
  ): Promise<LifeOpsConnectorGrant> {
    const nowIso = new Date().toISOString();
    const nextGrant: LifeOpsConnectorGrant = {
      ...grant,
      metadata: {
        ...grant.metadata,
        authState: "needs_reauth",
        lastAuthError: message,
        lastAuthErrorAt: nowIso,
      },
      updatedAt: nowIso,
    };
    await this.repository.upsertConnectorGrant(nextGrant);
    return nextGrant;
  }

  private async withGoogleGrantOperation<T>(
    grant: LifeOpsConnectorGrant,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await operation();
      await this.clearGoogleGrantAuthFailure(grant);
      return result;
    } catch (error) {
      return this.rethrowGoogleServiceError(grant, error);
    }
  }

  private async rethrowGoogleServiceError(
    grant: LifeOpsConnectorGrant,
    error: unknown,
  ): Promise<never> {
    if (error instanceof GoogleOAuthError) {
      this.logLifeOpsWarn("google_connector_request", error.message, {
        provider: "google",
        mode: grant.mode,
        statusCode: error.status,
        authState: grant.metadata.authState ?? null,
      });
      const needsReauth = googleErrorRequiresReauth(
        error.status,
        error.message,
      );
      if (needsReauth) {
        await this.markGoogleGrantNeedsReauth(grant, error.message);
        fail(401, `Google connector needs re-authentication: ${error.message}`);
      }
      fail(error.status, error.message);
    }

    if (error instanceof GoogleApiError) {
      this.logLifeOpsWarn("google_connector_request", error.message, {
        provider: "google",
        mode: grant.mode,
        statusCode: error.status,
        authState: grant.metadata.authState ?? null,
      });
      const needsReauth = googleErrorRequiresReauth(
        error.status,
        error.message,
      );
      if (needsReauth) {
        await this.markGoogleGrantNeedsReauth(grant, error.message);
        fail(401, `Google connector needs re-authentication: ${error.message}`);
      }
      if (
        error.status === 403 &&
        googleErrorLooksLikeAdminPolicyBlock(error.message)
      ) {
        fail(
          403,
          `Google Workspace policy blocked the request: ${error.message}`,
        );
      }
      fail(error.status, error.message);
    }

    this.logLifeOpsError("google_connector_request", error, {
      provider: "google",
      mode: grant.mode,
      authState: grant.metadata.authState ?? null,
    });
    throw error;
  }

  private async setPreferredGoogleConnectorMode(
    preferredMode: LifeOpsConnectorMode | null,
  ): Promise<void> {
    const googleGrants = (
      await this.repository.listConnectorGrants(this.agentId())
    ).filter((grant) => grant.provider === "google");

    const resolvedPreferredMode =
      preferredMode ??
      [...googleGrants].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      )[0]?.mode ??
      null;

    for (const grant of googleGrants) {
      const shouldPrefer =
        resolvedPreferredMode !== null && grant.mode === resolvedPreferredMode;
      if (grant.preferredByAgent === shouldPrefer) {
        continue;
      }
      await this.repository.upsertConnectorGrant({
        ...grant,
        preferredByAgent: shouldPrefer,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private async upsertManagedGoogleGrant(
    status: ManagedGoogleConnectorStatusResponse,
  ): Promise<LifeOpsConnectorGrant | null> {
    const existingGrant = await this.repository.getConnectorGrant(
      this.agentId(),
      "google",
      "cloud_managed",
    );
    if (!existingGrant && !status.connected) {
      return null;
    }

    const nowIso = new Date().toISOString();
    const clearedMetadata = clearGoogleGrantAuthFailureMetadata(
      existingGrant?.metadata ?? {},
    );
    const baseMetadata = {
      ...clearedMetadata,
      expiresAt: status.expiresAt,
      hasRefreshToken: status.hasRefreshToken,
      linkedAt: status.linkedAt,
      lastUsedAt: status.lastUsedAt,
    };
    const nextGrant = existingGrant
      ? {
          ...existingGrant,
          identity: status.identity ? { ...status.identity } : {},
          grantedScopes: [...status.grantedScopes],
          capabilities: [...status.grantedCapabilities],
          tokenRef: null,
          mode: "cloud_managed" as const,
          executionTarget: "cloud" as const,
          sourceOfTruth: "cloud_connection" as const,
          cloudConnectionId: status.connectionId,
          metadata:
            status.reason === "needs_reauth"
              ? {
                  ...baseMetadata,
                  authState: "needs_reauth",
                  lastAuthError:
                    "Managed Google connection needs re-authentication.",
                  lastAuthErrorAt: nowIso,
                }
              : baseMetadata,
          lastRefreshAt: nowIso,
          updatedAt: nowIso,
        }
      : createLifeOpsConnectorGrant({
          agentId: this.agentId(),
          provider: "google",
          identity: status.identity ? { ...status.identity } : {},
          grantedScopes: [...status.grantedScopes],
          capabilities: [...status.grantedCapabilities],
          tokenRef: null,
          mode: "cloud_managed",
          executionTarget: "cloud",
          sourceOfTruth: "cloud_connection",
          preferredByAgent: true,
          cloudConnectionId: status.connectionId,
          metadata: baseMetadata,
          lastRefreshAt: nowIso,
        });

    await this.repository.upsertConnectorGrant(nextGrant);
    return nextGrant;
  }

  private async runManagedGoogleOperation<T>(
    grant: LifeOpsConnectorGrant,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ManagedGoogleClientError) {
        this.logLifeOpsWarn("google_connector_request", error.message, {
          provider: "google",
          mode: grant.mode,
          statusCode: error.status,
          authState: grant.metadata.authState ?? null,
        });
        if (error.status === 401) {
          await this.markGoogleGrantNeedsReauth(grant, error.message);
          fail(
            401,
            `Google connector needs re-authentication: ${error.message}`,
          );
        }
        fail(error.status, error.message);
      }
      this.logLifeOpsError("google_connector_request", error, {
        provider: "google",
        mode: grant.mode,
        authState: grant.metadata.authState ?? null,
      });
      throw error;
    }
  }

  private async requireGoogleCalendarGrant(
    requestUrl: URL,
    requestedMode?: LifeOpsConnectorMode,
  ): Promise<LifeOpsConnectorGrant> {
    const status = await this.getGoogleConnectorStatus(
      requestUrl,
      requestedMode,
    );
    const grant = status.grant;
    if (!status.connected || !grant) {
      fail(409, "Google Calendar is not connected.");
    }
    if (!hasGoogleCalendarReadCapability(grant)) {
      fail(403, "Google Calendar read access has not been granted.");
    }
    return grant;
  }

  private async requireGoogleCalendarWriteGrant(
    requestUrl: URL,
    requestedMode?: LifeOpsConnectorMode,
  ): Promise<LifeOpsConnectorGrant> {
    const grant = await this.requireGoogleCalendarGrant(
      requestUrl,
      requestedMode,
    );
    if (!hasGoogleCalendarWriteCapability(grant)) {
      fail(403, "Google Calendar write access has not been granted.");
    }
    return grant;
  }

  private async requireGoogleGmailGrant(
    requestUrl: URL,
    requestedMode?: LifeOpsConnectorMode,
  ): Promise<LifeOpsConnectorGrant> {
    const status = await this.getGoogleConnectorStatus(
      requestUrl,
      requestedMode,
    );
    const grant = status.grant;
    if (!status.connected || !grant) {
      fail(409, "Google Gmail is not connected.");
    }
    if (!hasGoogleGmailTriageCapability(grant)) {
      fail(403, "Google Gmail triage access has not been granted.");
    }
    return grant;
  }

  private async requireGoogleGmailSendGrant(
    requestUrl: URL,
    requestedMode?: LifeOpsConnectorMode,
  ): Promise<LifeOpsConnectorGrant> {
    const grant = await this.requireGoogleGmailGrant(requestUrl, requestedMode);
    if (!hasGoogleGmailSendCapability(grant)) {
      fail(403, "Google Gmail send access has not been granted.");
    }
    return grant;
  }

  private async requireXGrant(
    requestedMode?: LifeOpsConnectorMode,
  ): Promise<LifeOpsConnectorGrant> {
    const mode =
      normalizeOptionalConnectorMode(requestedMode, "mode") ?? "local";
    const grant = await this.repository.getConnectorGrant(
      this.agentId(),
      "x",
      mode,
    );
    if (!grant) {
      fail(409, "X is not connected.");
    }
    return grant;
  }

  private async getWorkflowDefinition(
    workflowId: string,
  ): Promise<LifeOpsWorkflowDefinition> {
    const workflow = await this.repository.getWorkflow(
      this.agentId(),
      workflowId,
    );
    if (!workflow) {
      fail(404, "life-ops workflow not found");
    }
    return workflow;
  }

  private emitAssistantEvent(
    text: string,
    source: string,
    data: Record<string, unknown> = {},
  ): void {
    const eventService = getAgentEventService(this.runtime) as {
      emit?: (event: {
        runId: string;
        stream: string;
        data: Record<string, unknown>;
        agentId?: string;
      }) => void;
    } | null;
    if (!eventService?.emit) {
      return;
    }
    eventService.emit({
      runId: crypto.randomUUID(),
      stream: "assistant",
      agentId: this.agentId(),
      data: {
        text,
        source,
        ...data,
      },
    });
  }

  private emitInAppReminderNudge(args: {
    title: string;
    ownerType: "occurrence" | "calendar_event";
    ownerId: string;
    subjectType: LifeOpsSubjectType;
    scheduledFor: string;
    dueAt: string | null;
  }): void {
    const timeLabel = args.dueAt
      ? ` Due ${new Date(args.dueAt).toLocaleString()}.`
      : "";
    const prefix =
      args.subjectType === "agent" ? "Agent reminder:" : "Reminder:";
    this.emitAssistantEvent(
      `${prefix} ${args.title}.${timeLabel}`,
      "lifeops-reminder",
      {
        ownerType: args.ownerType,
        ownerId: args.ownerId,
        subjectType: args.subjectType,
        scheduledFor: args.scheduledFor,
        dueAt: args.dueAt,
      },
    );
  }

  private emitWorkflowRunNudge(
    workflow: LifeOpsWorkflowDefinition,
    run: LifeOpsWorkflowRun,
  ): void {
    if (workflow.subjectType !== "owner") {
      return;
    }
    const message =
      run.status === "success"
        ? `Scheduled workflow "${workflow.title}" ran successfully.`
        : `Scheduled workflow "${workflow.title}" ran and failed.`;
    this.emitAssistantEvent(message, "lifeops-workflow", {
      workflowId: workflow.id,
      workflowTitle: workflow.title,
      workflowRunId: run.id,
      status: run.status,
      subjectType: workflow.subjectType,
    });
  }

  private readWorkflowSchedulerState(
    workflow: LifeOpsWorkflowDefinition,
  ): LifeOpsWorkflowSchedulerState | null {
    return parseWorkflowSchedulerState(
      isRecord(workflow.metadata) ? workflow.metadata.lifeopsScheduler : null,
    );
  }

  private computeWorkflowNextDueAt(
    workflow: LifeOpsWorkflowDefinition,
    cursorIso?: string | null,
  ): string | null {
    if (workflow.triggerType !== "schedule") {
      return null;
    }
    const schedule = workflow.schedule;
    if (schedule.kind === "manual") {
      return null;
    }
    if (schedule.kind === "once") {
      return cursorIso ? null : schedule.runAt;
    }
    if (schedule.kind === "interval") {
      const baseIso = cursorIso ?? workflow.createdAt;
      return addMinutes(new Date(baseIso), schedule.everyMinutes).toISOString();
    }
    const baseMs = cursorIso
      ? Date.parse(cursorIso)
      : Date.parse(workflow.createdAt) - 60_000;
    const nextRunMs = computeNextCronRunAtMs(
      schedule.cronExpression,
      baseMs,
      schedule.timezone,
    );
    return nextRunMs === null ? null : new Date(nextRunMs).toISOString();
  }

  private withWorkflowSchedulerState(
    workflow: LifeOpsWorkflowDefinition,
    state: LifeOpsWorkflowSchedulerState | null,
  ): LifeOpsWorkflowDefinition {
    const metadata = { ...workflow.metadata };
    if (state) {
      metadata.lifeopsScheduler = state;
    } else {
      delete metadata.lifeopsScheduler;
    }
    return {
      ...workflow,
      metadata,
      updatedAt: new Date().toISOString(),
    };
  }

  private initializeWorkflowSchedulerState(
    workflow: LifeOpsWorkflowDefinition,
  ): LifeOpsWorkflowDefinition {
    const nextDueAt = this.computeWorkflowNextDueAt(workflow);
    const currentState = this.readWorkflowSchedulerState(workflow);
    const targetState: LifeOpsWorkflowSchedulerState | null =
      workflow.triggerType !== "schedule" || workflow.schedule.kind === "manual"
        ? null
        : {
            managedBy: "task_worker",
            nextDueAt,
            lastDueAt: null,
            lastRunId: null,
            lastRunStatus: null,
            updatedAt: new Date().toISOString(),
          };
    if (
      (currentState === null && targetState === null) ||
      (currentState &&
        targetState &&
        currentState.nextDueAt === targetState.nextDueAt &&
        currentState.lastDueAt === targetState.lastDueAt &&
        currentState.lastRunId === targetState.lastRunId &&
        currentState.lastRunStatus === targetState.lastRunStatus)
    ) {
      return workflow;
    }
    return this.withWorkflowSchedulerState(workflow, targetState);
  }

  private async runDueWorkflows(args: {
    now: string;
    limit: number;
  }): Promise<LifeOpsWorkflowRun[]> {
    const nowMs = Date.parse(args.now);
    const workflows = await this.repository.listWorkflows(this.agentId());
    const runs: LifeOpsWorkflowRun[] = [];

    for (const workflow of workflows) {
      if (runs.length >= args.limit) {
        break;
      }
      if (
        workflow.status !== "active" ||
        workflow.triggerType !== "schedule" ||
        workflow.schedule.kind === "manual"
      ) {
        continue;
      }

      let nextWorkflow = workflow;
      const existingSchedulerState =
        this.readWorkflowSchedulerState(nextWorkflow);
      let schedulerState =
        existingSchedulerState ??
        ({
          managedBy: "task_worker",
          nextDueAt: this.computeWorkflowNextDueAt(nextWorkflow),
          lastDueAt: null,
          lastRunId: null,
          lastRunStatus: null,
          updatedAt: new Date().toISOString(),
        } satisfies LifeOpsWorkflowSchedulerState);
      let stateChanged = existingSchedulerState === null;

      while (
        runs.length < args.limit &&
        schedulerState.nextDueAt &&
        Date.parse(schedulerState.nextDueAt) <= nowMs
      ) {
        const dueAt = schedulerState.nextDueAt;
        const { run, error } = await this.executeWorkflowDefinition(
          nextWorkflow,
          {
            startedAt: dueAt,
            confirmBrowserActions: false,
            request: {
              scheduledExecution: true,
            },
          },
        );
        runs.push(run);
        this.emitWorkflowRunNudge(nextWorkflow, run);
        schedulerState = {
          managedBy: "task_worker",
          nextDueAt: this.computeWorkflowNextDueAt(nextWorkflow, dueAt),
          lastDueAt: dueAt,
          lastRunId: run.id,
          lastRunStatus: run.status,
          updatedAt: new Date().toISOString(),
        };
        stateChanged = true;

        if (error) {
          this.logLifeOpsError("workflow_scheduled_execution", error, {
            workflowId: nextWorkflow.id,
            workflowRunId: run.id,
            dueAt,
          });
        }
      }

      if (stateChanged) {
        nextWorkflow = this.withWorkflowSchedulerState(
          nextWorkflow,
          schedulerState,
        );
        await this.repository.updateWorkflow(nextWorkflow);
      }
    }

    return runs;
  }

  private async recordGmailAudit(
    eventType:
      | "gmail_triage_synced"
      | "gmail_reply_drafted"
      | "gmail_reply_sent",
    ownerId: string,
    reason: string,
    inputs: Record<string, unknown>,
    decision: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.createAuditEvent(
      createLifeOpsAuditEvent({
        agentId: this.agentId(),
        eventType,
        ownerType:
          eventType === "gmail_triage_synced" ? "connector" : "gmail_message",
        ownerId,
        reason,
        inputs,
        decision,
        actor: "user",
      }),
    );
  }

  private async syncGoogleGmailTriage(args: {
    requestUrl: URL;
    requestedMode?: LifeOpsConnectorMode;
    maxResults: number;
  }): Promise<LifeOpsGmailTriageFeed> {
    const grant = await this.requireGoogleGmailGrant(
      args.requestUrl,
      args.requestedMode,
    );
    const syncTriage = async (): Promise<LifeOpsGmailTriageFeed> => {
      const syncedAt = new Date().toISOString();
      const messages =
        resolveGoogleExecutionTarget(grant) === "cloud"
          ? (
              await this.googleManagedClient.getGmailTriage({
                maxResults: args.maxResults,
              })
            ).messages
          : await fetchGoogleGmailTriageMessages({
              accessToken: (
                await ensureFreshGoogleAccessToken(
                  grant.tokenRef ??
                    fail(409, "Google Gmail token reference is missing."),
                )
              ).accessToken,
              selfEmail:
                typeof grant.identity.email === "string"
                  ? grant.identity.email.trim().toLowerCase()
                  : null,
              maxResults: args.maxResults,
            });
      const persistedMessages = messages.map((message) => ({
        id: createGmailMessageId(this.agentId(), "google", message.externalId),
        agentId: this.agentId(),
        provider: "google" as const,
        ...message,
        syncedAt,
        updatedAt: syncedAt,
      }));

      await this.repository.pruneGmailMessages(
        this.agentId(),
        "google",
        messages.map((message) => message.externalId),
      );
      for (const message of persistedMessages) {
        await this.repository.upsertGmailMessage(message);
      }
      await this.repository.upsertGmailSyncState(
        createLifeOpsGmailSyncState({
          agentId: this.agentId(),
          provider: "google",
          mailbox: GOOGLE_GMAIL_MAILBOX,
          maxResults: args.maxResults,
          syncedAt,
        }),
      );
      await this.clearGoogleGrantAuthFailure(grant);
      await this.recordGmailAudit(
        "gmail_triage_synced",
        `google:${grant.mode}:gmail`,
        "gmail triage synced",
        {
          mode: grant.mode,
          maxResults: args.maxResults,
        },
        {
          messageCount: persistedMessages.length,
        },
      );
      return {
        messages: persistedMessages,
        source: "synced",
        syncedAt,
        summary: summarizeGmailTriage(persistedMessages),
      };
    };

    return resolveGoogleExecutionTarget(grant) === "cloud"
      ? this.runManagedGoogleOperation(grant, syncTriage)
      : this.withGoogleGrantOperation(grant, syncTriage);
  }

  private async recordCalendarEventAudit(
    ownerId: string,
    reason: string,
    inputs: Record<string, unknown>,
    decision: Record<string, unknown>,
  ): Promise<void> {
    await this.repository.createAuditEvent(
      createLifeOpsAuditEvent({
        agentId: this.agentId(),
        eventType: "calendar_event_created",
        ownerType: "calendar_event",
        ownerId,
        reason,
        inputs,
        decision,
        actor: "user",
      }),
    );
  }

  private async syncCalendarReminderPlans(
    events: LifeOpsCalendarEvent[],
  ): Promise<void> {
    const eventIds = events.map((event) => event.id);
    const existingPlans = await this.repository.listReminderPlansForOwners(
      this.agentId(),
      "calendar_event",
      eventIds,
    );
    const plansByOwnerId = new Map(
      existingPlans.map((plan) => [plan.ownerId, plan]),
    );

    for (const event of events) {
      const existing = plansByOwnerId.get(event.id);
      if (existing) {
        const sameSteps =
          JSON.stringify(existing.steps) ===
          JSON.stringify(DEFAULT_CALENDAR_REMINDER_STEPS);
        if (sameSteps) {
          continue;
        }
        await this.repository.updateReminderPlan({
          ...existing,
          steps: DEFAULT_CALENDAR_REMINDER_STEPS.map((step) => ({ ...step })),
          updatedAt: new Date().toISOString(),
        });
        continue;
      }
      await this.repository.createReminderPlan(
        createLifeOpsReminderPlan({
          agentId: this.agentId(),
          ownerType: "calendar_event",
          ownerId: event.id,
          steps: DEFAULT_CALENDAR_REMINDER_STEPS.map((step) => ({ ...step })),
          mutePolicy: {},
          quietHours: {},
        }),
      );
    }
  }

  private async deleteCalendarReminderPlansForEvents(
    eventIds: string[],
  ): Promise<void> {
    if (eventIds.length === 0) {
      return;
    }
    const plans = await this.repository.listReminderPlansForOwners(
      this.agentId(),
      "calendar_event",
      eventIds,
    );
    for (const plan of plans) {
      await this.repository.deleteReminderPlan(this.agentId(), plan.id);
    }
  }

  private async syncGoogleCalendarFeed(args: {
    requestUrl: URL;
    requestedMode?: LifeOpsConnectorMode;
    calendarId: string;
    timeMin: string;
    timeMax: string;
    timeZone: string;
  }): Promise<LifeOpsCalendarFeed> {
    const grant = await this.requireGoogleCalendarGrant(
      args.requestUrl,
      args.requestedMode,
    );
    const syncCalendar = async (): Promise<LifeOpsCalendarFeed> => {
      const syncedAt = new Date().toISOString();
      const existingEvents = await this.repository.listCalendarEvents(
        this.agentId(),
        "google",
        args.timeMin,
        args.timeMax,
      );
      const events =
        resolveGoogleExecutionTarget(grant) === "cloud"
          ? (
              await this.googleManagedClient.getCalendarFeed({
                calendarId: args.calendarId,
                timeMin: args.timeMin,
                timeMax: args.timeMax,
                timeZone: args.timeZone,
              })
            ).events
          : await fetchGoogleCalendarEvents({
              accessToken: (
                await ensureFreshGoogleAccessToken(
                  grant.tokenRef ??
                    fail(409, "Google Calendar token reference is missing."),
                )
              ).accessToken,
              calendarId: args.calendarId,
              timeMin: args.timeMin,
              timeMax: args.timeMax,
              timeZone: args.timeZone,
            });
      const nextEvents = events.map((event) => ({
        id: createCalendarEventId(
          this.agentId(),
          "google",
          event.calendarId,
          event.externalId,
        ),
        agentId: this.agentId(),
        provider: "google" as const,
        ...event,
        syncedAt,
        updatedAt: syncedAt,
      }));
      const nextEventIds = new Set(nextEvents.map((event) => event.id));
      const removedEventIds = existingEvents
        .map((event) => event.id)
        .filter((eventId) => !nextEventIds.has(eventId));

      await this.repository.pruneCalendarEventsInWindow(
        this.agentId(),
        "google",
        args.calendarId,
        args.timeMin,
        args.timeMax,
        events.map((event) => event.externalId),
      );
      await this.deleteCalendarReminderPlansForEvents(removedEventIds);

      for (const event of nextEvents) {
        await this.repository.upsertCalendarEvent(event);
      }
      await this.syncCalendarReminderPlans(nextEvents);

      await this.repository.upsertCalendarSyncState(
        createLifeOpsCalendarSyncState({
          agentId: this.agentId(),
          provider: "google",
          calendarId: args.calendarId,
          windowStartAt: args.timeMin,
          windowEndAt: args.timeMax,
          syncedAt,
        }),
      );
      await this.clearGoogleGrantAuthFailure(grant);

      return {
        calendarId: args.calendarId,
        events: await this.repository.listCalendarEvents(
          this.agentId(),
          "google",
          args.timeMin,
          args.timeMax,
        ),
        source: "synced",
        timeMin: args.timeMin,
        timeMax: args.timeMax,
        syncedAt,
      };
    };

    return resolveGoogleExecutionTarget(grant) === "cloud"
      ? this.runManagedGoogleOperation(grant, syncCalendar)
      : this.withGoogleGrantOperation(grant, syncCalendar);
  }

  private async getDefinitionRecord(
    definitionId: string,
  ): Promise<LifeOpsDefinitionRecord> {
    const definition = await this.repository.getDefinition(
      this.agentId(),
      definitionId,
    );
    if (!definition) {
      fail(404, "life-ops definition not found");
    }
    const reminderPlan = definition.reminderPlanId
      ? await this.repository.getReminderPlan(
          this.agentId(),
          definition.reminderPlanId,
        )
      : null;
    return { definition, reminderPlan };
  }

  private async getGoalRecord(goalId: string): Promise<LifeOpsGoalRecord> {
    const goal = await this.repository.getGoal(this.agentId(), goalId);
    if (!goal) {
      fail(404, "life-ops goal not found");
    }
    const links = await this.repository.listGoalLinksForGoal(
      this.agentId(),
      goalId,
    );
    return { goal, links };
  }

  private async ensureGoalExists(
    goalId: string | null,
    ownership?: Pick<LifeOpsOwnership, "domain" | "subjectType" | "subjectId">,
  ): Promise<string | null> {
    if (!goalId) return null;
    const goal = await this.repository.getGoal(this.agentId(), goalId);
    if (!goal) {
      fail(404, `goal ${goalId} does not exist`);
    }
    if (
      ownership &&
      (goal.domain !== ownership.domain ||
        goal.subjectType !== ownership.subjectType ||
        goal.subjectId !== ownership.subjectId)
    ) {
      fail(
        400,
        "goalId must reference a goal in the same owner or agent scope",
      );
    }
    return goal.id;
  }

  private async syncGoalLink(definition: LifeOpsTaskDefinition): Promise<void> {
    await this.repository.deleteGoalLinksForLinked(
      definition.agentId,
      "definition",
      definition.id,
    );
    if (!definition.goalId) return;
    await this.repository.upsertGoalLink({
      id: crypto.randomUUID(),
      agentId: definition.agentId,
      goalId: definition.goalId,
      linkedType: "definition",
      linkedId: definition.id,
      createdAt: new Date().toISOString(),
    });
  }

  private async syncReminderPlan(
    definition: LifeOpsTaskDefinition,
    draft:
      | {
          steps: LifeOpsReminderStep[];
          mutePolicy: Record<string, unknown>;
          quietHours: Record<string, unknown>;
        }
      | null
      | undefined,
  ): Promise<LifeOpsReminderPlan | null> {
    if (draft === undefined) {
      return definition.reminderPlanId
        ? await this.repository.getReminderPlan(
            definition.agentId,
            definition.reminderPlanId,
          )
        : null;
    }
    if (draft === null) {
      if (definition.reminderPlanId) {
        await this.repository.deleteReminderPlan(
          definition.agentId,
          definition.reminderPlanId,
        );
      }
      definition.reminderPlanId = null;
      return null;
    }
    const existingPlan = definition.reminderPlanId
      ? await this.repository.getReminderPlan(
          definition.agentId,
          definition.reminderPlanId,
        )
      : null;
    if (existingPlan) {
      const nextPlan: LifeOpsReminderPlan = {
        ...existingPlan,
        steps: draft.steps,
        mutePolicy: draft.mutePolicy,
        quietHours: draft.quietHours,
        updatedAt: new Date().toISOString(),
      };
      await this.repository.updateReminderPlan(nextPlan);
      definition.reminderPlanId = nextPlan.id;
      return nextPlan;
    }
    const createdPlan = createLifeOpsReminderPlan({
      agentId: definition.agentId,
      ownerType: "definition",
      ownerId: definition.id,
      steps: draft.steps,
      mutePolicy: draft.mutePolicy,
      quietHours: draft.quietHours,
    });
    await this.repository.createReminderPlan(createdPlan);
    definition.reminderPlanId = createdPlan.id;
    return createdPlan;
  }

  private async refreshDefinitionOccurrences(
    definition: LifeOpsTaskDefinition,
    now = new Date(),
  ): Promise<LifeOpsOccurrence[]> {
    const existingOccurrences =
      await this.repository.listOccurrencesForDefinition(
        definition.agentId,
        definition.id,
      );
    const materialized = materializeDefinitionOccurrences(
      definition,
      existingOccurrences,
      { now },
    );
    for (const occurrence of materialized) {
      await this.repository.upsertOccurrence(occurrence);
    }
    await this.repository.pruneNonTerminalOccurrences(
      definition.agentId,
      definition.id,
      materialized.map((occurrence) => occurrence.occurrenceKey),
    );
    return materialized;
  }

  private async getFreshOccurrence(
    occurrenceId: string,
    now = new Date(),
  ): Promise<{
    definition: LifeOpsTaskDefinition;
    occurrence: LifeOpsOccurrence;
  }> {
    const occurrence = await this.repository.getOccurrence(
      this.agentId(),
      occurrenceId,
    );
    if (!occurrence) {
      fail(404, "life-ops occurrence not found");
    }
    const definition = await this.repository.getDefinition(
      this.agentId(),
      occurrence.definitionId,
    );
    if (!definition) {
      fail(404, "life-ops definition not found for occurrence");
    }
    if (definition.status === "active") {
      await this.refreshDefinitionOccurrences(definition, now);
    }
    const freshOccurrence = await this.repository.getOccurrence(
      this.agentId(),
      occurrenceId,
    );
    if (!freshOccurrence) {
      fail(404, "life-ops occurrence not found after refresh");
    }
    return {
      definition,
      occurrence: freshOccurrence,
    };
  }

  private async resolvePrimaryChannelPolicy(
    channelType: LifeOpsChannelPolicy["channelType"],
  ): Promise<LifeOpsChannelPolicy | null> {
    const policies = (
      await this.repository.listChannelPolicies(this.agentId())
    ).filter((policy) => policy.channelType === channelType);
    return (
      policies.find((policy) => policy.metadata.isPrimary === true) ??
      policies[0] ??
      null
    );
  }

  private async dispatchReminderAttempt(args: {
    plan: LifeOpsReminderPlan;
    ownerType: "occurrence" | "calendar_event";
    ownerId: string;
    occurrenceId: string | null;
    subjectType: LifeOpsSubjectType;
    title: string;
    channel: LifeOpsReminderStep["channel"];
    stepIndex: number;
    scheduledFor: string;
    dueAt: string | null;
    urgency: LifeOpsReminderUrgency;
    quietHours: LifeOpsReminderPlan["quietHours"];
    acknowledged: boolean;
    attemptedAt: string;
  }): Promise<LifeOpsReminderAttempt> {
    const attemptedAt = args.attemptedAt;
    const attemptedAtDate = new Date(attemptedAt);
    const reminderBody = buildReminderBody({
      title: args.title,
      scheduledFor: args.scheduledFor,
      channel: args.channel,
    });
    let outcome: LifeOpsReminderAttemptOutcome = "delivered";
    let connectorRef: string | null = null;
    const deliveryMetadata: Record<string, unknown> = {
      title: args.title,
      urgency: args.urgency,
    };

    await this.recordReminderAudit(
      "reminder_due",
      args.ownerType,
      args.ownerId,
      "reminder step became due",
      {
        planId: args.plan.id,
        channel: args.channel,
        stepIndex: args.stepIndex,
        scheduledFor: args.scheduledFor,
      },
      {
        ownerId: args.ownerId,
      },
    );

    if (args.acknowledged) {
      outcome = "blocked_acknowledged";
      deliveryMetadata.reason = "owner_acknowledged";
    } else if (
      !isReminderChannelAllowedForUrgency(args.channel, args.urgency)
    ) {
      outcome = "blocked_urgency";
      deliveryMetadata.reason = "urgency_gate";
    } else if (
      args.channel !== "in_app" &&
      isWithinQuietHours({
        now: attemptedAtDate,
        quietHours: args.quietHours,
        channel: args.channel,
      })
    ) {
      outcome = "blocked_quiet_hours";
      deliveryMetadata.reason = "quiet_hours";
    } else if (args.channel === "in_app") {
      connectorRef = "system:in_app";
      deliveryMetadata.message = reminderBody;
    } else {
      const policy = await this.resolvePrimaryChannelPolicy(args.channel);
      if (!policy?.allowReminders || !policy.allowEscalation) {
        outcome = "blocked_policy";
        deliveryMetadata.reason = "channel_policy";
      } else if (args.channel === "sms" || args.channel === "voice") {
        const credentials = readTwilioCredentialsFromEnv();
        if (!credentials) {
          outcome = "blocked_connector";
          deliveryMetadata.reason = "twilio_missing";
        } else {
          connectorRef = `twilio:${policy.channelRef}`;
          if (args.channel === "sms") {
            const result = await sendTwilioSms({
              credentials,
              to: policy.channelRef,
              body: reminderBody,
            });
            if (!result.ok) {
              outcome = "blocked_connector";
              deliveryMetadata.error = result.error ?? "sms delivery failed";
              deliveryMetadata.status = result.status;
            } else {
              deliveryMetadata.sid = result.sid ?? null;
              deliveryMetadata.status = result.status;
            }
          } else {
            const result = await sendTwilioVoiceCall({
              credentials,
              to: policy.channelRef,
              message: reminderBody,
            });
            if (!result.ok) {
              outcome = "blocked_connector";
              deliveryMetadata.error = result.error ?? "voice delivery failed";
              deliveryMetadata.status = result.status;
            } else {
              deliveryMetadata.sid = result.sid ?? null;
              deliveryMetadata.status = result.status;
            }
          }
        }
      } else {
        outcome = "blocked_connector";
        deliveryMetadata.reason = "unsupported_channel";
      }
    }

    const attempt = createLifeOpsReminderAttempt({
      agentId: this.agentId(),
      planId: args.plan.id,
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      occurrenceId: args.occurrenceId,
      channel: args.channel,
      stepIndex: args.stepIndex,
      scheduledFor: args.scheduledFor,
      attemptedAt,
      outcome,
      connectorRef,
      deliveryMetadata,
    });
    await this.repository.createReminderAttempt(attempt);
    await this.recordReminderAudit(
      outcome === "delivered" ? "reminder_delivered" : "reminder_blocked",
      args.ownerType,
      args.ownerId,
      outcome === "delivered" ? "reminder delivered" : "reminder blocked",
      {
        planId: args.plan.id,
        channel: args.channel,
        stepIndex: args.stepIndex,
        scheduledFor: args.scheduledFor,
      },
      {
        connectorRef,
        outcome,
        ...deliveryMetadata,
      },
    );
    if (outcome === "blocked_connector") {
      this.logLifeOpsWarn(
        "reminder_dispatch",
        `[lifeops] Reminder delivery failed for ${args.channel}`,
        {
          ownerType: args.ownerType,
          ownerId: args.ownerId,
          occurrenceId: args.occurrenceId,
          channel: args.channel,
          connectorRef,
          scheduledFor: args.scheduledFor,
          stepIndex: args.stepIndex,
          reason:
            typeof deliveryMetadata.reason === "string"
              ? deliveryMetadata.reason
              : null,
          status:
            typeof deliveryMetadata.status === "number"
              ? deliveryMetadata.status
              : null,
          error:
            typeof deliveryMetadata.error === "string"
              ? deliveryMetadata.error
              : null,
        },
      );
    }
    if (outcome === "delivered" && args.channel === "in_app") {
      this.emitInAppReminderNudge({
        title: args.title,
        ownerType: args.ownerType,
        ownerId: args.ownerId,
        subjectType: args.subjectType,
        scheduledFor: args.scheduledFor,
        dueAt: args.dueAt,
      });
    }
    return attempt;
  }

  private async createBrowserSessionInternal(
    request: CreateLifeOpsBrowserSessionRequest,
  ): Promise<LifeOpsBrowserSession> {
    const workflowId = normalizeOptionalString(request.workflowId) ?? null;
    const workflow = workflowId
      ? await this.getWorkflowDefinition(workflowId)
      : null;
    const ownership = workflow
      ? this.normalizeChildOwnership(workflow, request.ownership)
      : this.normalizeOwnership(request.ownership);
    const actions = createBrowserSessionActions(
      request.actions.map((action, index) =>
        normalizeBrowserActionInput(action, `actions[${index}]`),
      ),
    );
    const awaitingActionId = resolveAwaitingBrowserActionId(actions);
    const session = createLifeOpsBrowserSession({
      agentId: this.agentId(),
      ...ownership,
      workflowId,
      title: requireNonEmptyString(request.title, "title"),
      status: awaitingActionId ? "awaiting_confirmation" : "navigating",
      actions,
      currentActionIndex: 0,
      awaitingConfirmationForActionId: awaitingActionId,
      result: {},
      metadata: {},
      finishedAt: null,
    });
    await this.repository.createBrowserSession(session);
    await this.recordBrowserAudit(
      "browser_session_created",
      session.id,
      "browser session created",
      {
        workflowId: session.workflowId,
        title: session.title,
      },
      {
        status: session.status,
        actionCount: session.actions.length,
      },
    );
    return session;
  }

  async listDefinitions(): Promise<LifeOpsDefinitionRecord[]> {
    const definitions = await this.repository.listDefinitions(this.agentId());
    const plans = await this.repository.listReminderPlansForOwners(
      this.agentId(),
      "definition",
      definitions.map((definition) => definition.id),
    );
    const planMap = new Map(plans.map((plan) => [plan.ownerId, plan]));
    return definitions.map((definition) => ({
      definition,
      reminderPlan: planMap.get(definition.id) ?? null,
    }));
  }

  async getDefinition(definitionId: string): Promise<LifeOpsDefinitionRecord> {
    return this.getDefinitionRecord(definitionId);
  }

  async createDefinition(
    request: CreateLifeOpsDefinitionRequest,
  ): Promise<LifeOpsDefinitionRecord> {
    const agentId = this.agentId();
    const ownership = this.normalizeOwnership(request.ownership);
    const kind = normalizeEnumValue(
      request.kind,
      "kind",
      LIFEOPS_DEFINITION_KINDS,
    );
    const title = requireNonEmptyString(request.title, "title");
    const description = normalizeOptionalString(request.description) ?? "";
    const originalIntent =
      normalizeOptionalString(request.originalIntent) ?? title;
    const timezone = normalizeValidTimeZone(request.timezone, "timezone");
    const windowPolicy = normalizeWindowPolicyInput(
      request.windowPolicy,
      "windowPolicy",
      timezone,
    );
    const cadence = normalizeCadence(request.cadence, windowPolicy);
    const progressionRule = normalizeProgressionRule(request.progressionRule);
    const reminderPlanDraft = normalizeReminderPlanDraft(
      request.reminderPlan,
      "create",
    );
    const goalId = await this.ensureGoalExists(
      request.goalId ?? null,
      ownership,
    );
    let definition = createLifeOpsTaskDefinition({
      agentId,
      ...ownership,
      kind,
      title,
      description,
      originalIntent,
      timezone,
      status: "active",
      priority: normalizePriority(request.priority),
      cadence,
      windowPolicy,
      progressionRule,
      reminderPlanId: null,
      goalId,
      source: normalizeOptionalString(request.source) ?? "manual",
      metadata: mergeMetadata(
        {},
        normalizeOptionalRecord(request.metadata, "metadata"),
      ),
    });
    await this.repository.createDefinition(definition);
    const reminderPlan = await this.syncReminderPlan(
      definition,
      reminderPlanDraft,
    );
    if (definition.reminderPlanId !== null) {
      await this.repository.updateDefinition(definition);
    }
    await this.syncGoalLink(definition);
    const occurrences = await this.refreshDefinitionOccurrences(definition);
    const mirroredDefinition = await syncAgentDefinitionTodoMirror({
      runtime: this.runtime,
      previous: null,
      definition,
      occurrences,
    });
    if (mirroredDefinition !== definition) {
      definition = mirroredDefinition;
      await this.repository.updateDefinition(definition);
    }
    await this.recordAudit(
      "definition_created",
      "definition",
      definition.id,
      "definition created",
      {
        request,
      },
      {
        kind: definition.kind,
        timezone: definition.timezone,
        cadence: definition.cadence,
        reminderPlanId: definition.reminderPlanId,
      },
    );
    return {
      definition,
      reminderPlan,
    };
  }

  async updateDefinition(
    definitionId: string,
    request: UpdateLifeOpsDefinitionRequest,
  ): Promise<LifeOpsDefinitionRecord> {
    const current = await this.getDefinitionRecord(definitionId);
    const ownership = this.normalizeOwnership(
      request.ownership,
      current.definition,
    );
    const nextTimezone = normalizeValidTimeZone(
      request.timezone ?? current.definition.timezone,
      "timezone",
      current.definition.timezone,
    );
    const nextWindowPolicy = normalizeWindowPolicyInput(
      request.windowPolicy ?? current.definition.windowPolicy,
      "windowPolicy",
      nextTimezone,
    );
    const nextCadence = normalizeCadence(
      request.cadence ?? current.definition.cadence,
      nextWindowPolicy,
    );
    const nextStatus =
      request.status === undefined
        ? current.definition.status
        : normalizeEnumValue(
            request.status,
            "status",
            LIFEOPS_DEFINITION_STATUSES,
          );
    let nextDefinition: LifeOpsTaskDefinition = {
      ...current.definition,
      ...ownership,
      title:
        request.title !== undefined
          ? requireNonEmptyString(request.title, "title")
          : current.definition.title,
      description:
        request.description !== undefined
          ? (normalizeOptionalString(request.description) ?? "")
          : current.definition.description,
      originalIntent:
        request.originalIntent !== undefined
          ? (normalizeOptionalString(request.originalIntent) ??
            current.definition.title)
          : current.definition.originalIntent,
      timezone: nextTimezone,
      status: nextStatus,
      priority: normalizePriority(
        request.priority,
        current.definition.priority,
      ),
      cadence: nextCadence,
      windowPolicy: nextWindowPolicy,
      progressionRule:
        request.progressionRule !== undefined
          ? normalizeProgressionRule(request.progressionRule)
          : current.definition.progressionRule,
      goalId:
        request.goalId !== undefined
          ? await this.ensureGoalExists(request.goalId ?? null, ownership)
          : current.definition.goalId,
      metadata:
        request.metadata !== undefined
          ? mergeMetadata(
              current.definition.metadata,
              normalizeOptionalRecord(request.metadata, "metadata"),
            )
          : current.definition.metadata,
      updatedAt: new Date().toISOString(),
    };
    const reminderPlanDraft = normalizeReminderPlanDraft(
      request.reminderPlan,
      "update",
    );
    await this.repository.updateDefinition(nextDefinition);
    const reminderPlan = await this.syncReminderPlan(
      nextDefinition,
      reminderPlanDraft,
    );
    await this.repository.updateDefinition(nextDefinition);
    await this.syncGoalLink(nextDefinition);
    const occurrences =
      nextDefinition.status === "active"
        ? await this.refreshDefinitionOccurrences(nextDefinition)
        : await this.repository.listOccurrencesForDefinition(
            nextDefinition.agentId,
            nextDefinition.id,
          );
    nextDefinition = await syncAgentDefinitionTodoMirror({
      runtime: this.runtime,
      previous: current.definition,
      definition: nextDefinition,
      occurrences,
    });
    await this.repository.updateDefinition(nextDefinition);
    await this.recordAudit(
      "definition_updated",
      "definition",
      nextDefinition.id,
      "definition updated",
      {
        request,
      },
      {
        status: nextDefinition.status,
        cadence: nextDefinition.cadence,
        timezone: nextDefinition.timezone,
        reminderPlanId: nextDefinition.reminderPlanId,
      },
    );
    return {
      definition: nextDefinition,
      reminderPlan,
    };
  }

  async listGoals(): Promise<LifeOpsGoalRecord[]> {
    const goals = await this.repository.listGoals(this.agentId());
    const records: LifeOpsGoalRecord[] = [];
    for (const goal of goals) {
      const links = await this.repository.listGoalLinksForGoal(
        this.agentId(),
        goal.id,
      );
      records.push({ goal, links });
    }
    return records;
  }

  async getGoal(goalId: string): Promise<LifeOpsGoalRecord> {
    return this.getGoalRecord(goalId);
  }

  async createGoal(
    request: CreateLifeOpsGoalRequest,
  ): Promise<LifeOpsGoalRecord> {
    const ownership = this.normalizeOwnership(request.ownership);
    let goal = createLifeOpsGoalDefinition({
      agentId: this.agentId(),
      ...ownership,
      title: requireNonEmptyString(request.title, "title"),
      description: normalizeOptionalString(request.description) ?? "",
      cadence: normalizeNullableRecord(request.cadence, "cadence") ?? null,
      supportStrategy:
        normalizeOptionalRecord(request.supportStrategy, "supportStrategy") ??
        {},
      successCriteria:
        normalizeOptionalRecord(request.successCriteria, "successCriteria") ??
        {},
      status:
        request.status === undefined
          ? "active"
          : normalizeEnumValue(request.status, "status", LIFEOPS_GOAL_STATUSES),
      reviewState:
        request.reviewState === undefined
          ? "idle"
          : normalizeEnumValue(
              request.reviewState,
              "reviewState",
              LIFEOPS_REVIEW_STATES,
            ),
      metadata: mergeMetadata(
        {},
        normalizeOptionalRecord(request.metadata, "metadata"),
      ),
    });
    await this.repository.createGoal(goal);
    goal = await syncAgentGoalMirror({
      runtime: this.runtime,
      previous: null,
      goal,
    });
    await this.repository.updateGoal(goal);
    await this.recordAudit(
      "goal_created",
      "goal",
      goal.id,
      "goal created",
      {
        request,
      },
      {
        status: goal.status,
        reviewState: goal.reviewState,
      },
    );
    return {
      goal,
      links: [],
    };
  }

  async updateGoal(
    goalId: string,
    request: UpdateLifeOpsGoalRequest,
  ): Promise<LifeOpsGoalRecord> {
    const current = await this.getGoalRecord(goalId);
    const ownership = this.normalizeOwnership(request.ownership, current.goal);
    let nextGoal: LifeOpsGoalDefinition = {
      ...current.goal,
      ...ownership,
      title:
        request.title !== undefined
          ? requireNonEmptyString(request.title, "title")
          : current.goal.title,
      description:
        request.description !== undefined
          ? (normalizeOptionalString(request.description) ?? "")
          : current.goal.description,
      cadence:
        request.cadence !== undefined
          ? (normalizeNullableRecord(request.cadence, "cadence") ?? null)
          : current.goal.cadence,
      supportStrategy:
        request.supportStrategy !== undefined
          ? requireRecord(request.supportStrategy, "supportStrategy")
          : current.goal.supportStrategy,
      successCriteria:
        request.successCriteria !== undefined
          ? requireRecord(request.successCriteria, "successCriteria")
          : current.goal.successCriteria,
      status:
        request.status !== undefined
          ? normalizeEnumValue(request.status, "status", LIFEOPS_GOAL_STATUSES)
          : current.goal.status,
      reviewState:
        request.reviewState !== undefined
          ? normalizeEnumValue(
              request.reviewState,
              "reviewState",
              LIFEOPS_REVIEW_STATES,
            )
          : current.goal.reviewState,
      metadata:
        request.metadata !== undefined
          ? mergeMetadata(
              current.goal.metadata,
              normalizeOptionalRecord(request.metadata, "metadata"),
            )
          : current.goal.metadata,
      updatedAt: new Date().toISOString(),
    };
    nextGoal = await syncAgentGoalMirror({
      runtime: this.runtime,
      previous: current.goal,
      goal: nextGoal,
    });
    await this.repository.updateGoal(nextGoal);
    await this.recordAudit(
      "goal_updated",
      "goal",
      nextGoal.id,
      "goal updated",
      {
        request,
      },
      {
        status: nextGoal.status,
        reviewState: nextGoal.reviewState,
      },
    );
    return {
      goal: nextGoal,
      links: current.links,
    };
  }

  private async collectLinkedDefinitionsForGoal(
    goalRecord: LifeOpsGoalRecord,
  ): Promise<LifeOpsTaskDefinition[]> {
    const linkedDefinitionIds = new Set(
      goalRecord.links
        .filter((link) => link.linkedType === "definition")
        .map((link) => link.linkedId),
    );
    const definitions = await this.repository.listDefinitions(this.agentId());
    return definitions
      .filter(
        (definition) =>
          definition.status !== "archived" &&
          (definition.goalId === goalRecord.goal.id ||
            linkedDefinitionIds.has(definition.id)),
      )
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  private async collectOccurrenceViewsForDefinitions(
    definitions: LifeOpsTaskDefinition[],
  ): Promise<LifeOpsOccurrenceView[]> {
    const views: LifeOpsOccurrenceView[] = [];
    for (const definition of definitions) {
      const occurrences = await this.repository.listOccurrencesForDefinition(
        this.agentId(),
        definition.id,
      );
      for (const occurrence of occurrences) {
        const view = await this.repository.getOccurrenceView(
          this.agentId(),
          occurrence.id,
        );
        if (view) {
          views.push(view);
        }
      }
    }
    views.sort(
      (left, right) =>
        new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime(),
    );
    return views;
  }

  private deriveGoalReviewState(
    goal: LifeOpsGoalDefinition,
    definitions: LifeOpsTaskDefinition[],
    activeOccurrences: LifeOpsOccurrenceView[],
    overdueOccurrences: LifeOpsOccurrenceView[],
    recentCompletions: LifeOpsOccurrenceView[],
    lastActivityAt: string | null,
    now: Date,
  ): LifeOpsGoalDefinition["reviewState"] {
    if (goal.status === "satisfied") {
      return "on_track";
    }
    if (goal.status !== "active") {
      return goal.reviewState;
    }
    if (definitions.length === 0) {
      return "needs_attention";
    }
    if (overdueOccurrences.length > 0) {
      return "at_risk";
    }
    if (!lastActivityAt) {
      return "needs_attention";
    }
    const cadenceKind =
      isRecord(goal.cadence) && typeof goal.cadence.kind === "string"
        ? goal.cadence.kind
        : null;
    const staleMs =
      cadenceKind === "daily" || cadenceKind === "times_per_day"
        ? 2 * 24 * 60 * 60 * 1000
        : cadenceKind === "weekly"
          ? 10 * 24 * 60 * 60 * 1000
          : 7 * 24 * 60 * 60 * 1000;
    const lastActivityTime = new Date(lastActivityAt).getTime();
    if (!Number.isFinite(lastActivityTime)) {
      return "needs_attention";
    }
    if (now.getTime() - lastActivityTime > staleMs) {
      return activeOccurrences.length > 0 ? "needs_attention" : "at_risk";
    }
    if (recentCompletions.length === 0 && activeOccurrences.length === 0) {
      return "needs_attention";
    }
    return "on_track";
  }

  private buildGoalReviewExplanation(args: {
    goal: LifeOpsGoalDefinition;
    linkedDefinitionCount: number;
    activeOccurrenceCount: number;
    overdueOccurrenceCount: number;
    completedLast7Days: number;
    reviewState: LifeOpsGoalDefinition["reviewState"];
    lastActivityAt: string | null;
  }): string {
    if (args.goal.status === "satisfied") {
      return "This goal is marked satisfied and currently does not need more support work.";
    }
    if (args.linkedDefinitionCount === 0) {
      return "This goal has no linked support tasks or routines yet, so there is nothing concrete to keep it moving.";
    }
    if (args.overdueOccurrenceCount > 0) {
      return `This goal is at risk because ${args.overdueOccurrenceCount} linked support ${args.overdueOccurrenceCount === 1 ? "item is" : "items are"} overdue.`;
    }
    if (args.completedLast7Days > 0) {
      return `This goal is on track because ${args.completedLast7Days} linked support ${args.completedLast7Days === 1 ? "item was" : "items were"} completed in the last 7 days.`;
    }
    if (args.activeOccurrenceCount > 0) {
      return `This goal has ${args.activeOccurrenceCount} active support ${args.activeOccurrenceCount === 1 ? "item" : "items"} in flight right now.`;
    }
    if (args.lastActivityAt) {
      return `This goal has support structure, but it has been quiet since ${args.lastActivityAt}.`;
    }
    if (args.reviewState === "needs_attention") {
      return "This goal needs a clearer support structure or a new check-in.";
    }
    return "This goal has support structure and does not currently have overdue work.";
  }

  private buildGoalSupportSuggestions(args: {
    goal: LifeOpsGoalDefinition;
    linkedDefinitions: LifeOpsTaskDefinition[];
    activeOccurrences: LifeOpsOccurrenceView[];
    overdueOccurrences: LifeOpsOccurrenceView[];
    recentCompletions: LifeOpsOccurrenceView[];
  }): LifeOpsGoalSupportSuggestion[] {
    const suggestions: LifeOpsGoalSupportSuggestion[] = [];
    if (args.linkedDefinitions.length === 0) {
      suggestions.push({
        kind: LIFEOPS_GOAL_SUGGESTION_KINDS[0],
        title: "Create the first support routine",
        detail:
          "Break this goal into a recurring task, habit, or routine so the agent can track and remind against something concrete.",
        definitionId: null,
        occurrenceId: null,
      });
      return suggestions;
    }
    for (const overdue of args.overdueOccurrences.slice(0, 2)) {
      suggestions.push({
        kind: LIFEOPS_GOAL_SUGGESTION_KINDS[2],
        title: overdue.title,
        detail:
          "Resolve or reschedule this overdue support item so the goal is no longer drifting.",
        definitionId: overdue.definitionId,
        occurrenceId: overdue.id,
      });
    }
    if (suggestions.length === 0 && args.activeOccurrences.length > 0) {
      const next = args.activeOccurrences[0];
      suggestions.push({
        kind: LIFEOPS_GOAL_SUGGESTION_KINDS[1],
        title: next.title,
        detail:
          "This is the clearest current action that advances the goal right now.",
        definitionId: next.definitionId,
        occurrenceId: next.id,
      });
    }
    if (args.recentCompletions.length === 0) {
      suggestions.push({
        kind: LIFEOPS_GOAL_SUGGESTION_KINDS[3],
        title: "Review progress",
        detail:
          "Check whether the current cadence still fits the goal, or whether the goal needs a stronger routine.",
        definitionId: null,
        occurrenceId: null,
      });
    }
    if (
      suggestions.length < 3 &&
      args.linkedDefinitions.every((definition) => definition.kind === "task")
    ) {
      suggestions.push({
        kind: LIFEOPS_GOAL_SUGGESTION_KINDS[4],
        title: "Tighten the support cadence",
        detail:
          "This goal only has one-off tasks linked to it. Consider adding a recurring habit or routine if progress should stay continuous.",
        definitionId: null,
        occurrenceId: null,
      });
    }
    return suggestions.slice(0, 3);
  }

  private async syncComputedGoalReviewState(
    goal: LifeOpsGoalDefinition,
    reviewState: LifeOpsGoalDefinition["reviewState"],
    summary: LifeOpsGoalReview["summary"],
    now: Date,
  ): Promise<LifeOpsGoalDefinition> {
    if (goal.reviewState === reviewState) {
      return goal;
    }
    const nextGoal: LifeOpsGoalDefinition = {
      ...goal,
      reviewState,
      metadata: mergeMetadata(goal.metadata, {
        computedGoalReview: {
          reviewedAt: now.toISOString(),
          reviewState,
          summary,
        },
      }),
      updatedAt: now.toISOString(),
    };
    await this.repository.updateGoal(nextGoal);
    await this.repository.createAuditEvent(
      createLifeOpsAuditEvent({
        agentId: this.agentId(),
        eventType: "goal_reviewed",
        ownerType: "goal",
        ownerId: goal.id,
        reason: "goal review recomputed",
        inputs: {
          previousReviewState: goal.reviewState,
        },
        decision: {
          reviewState,
          summary,
        },
        actor: "agent",
      }),
    );
    return nextGoal;
  }

  private async buildGoalReview(
    goalRecord: LifeOpsGoalRecord,
    now: Date,
  ): Promise<LifeOpsGoalReview> {
    const linkedDefinitions = await this.collectLinkedDefinitionsForGoal(goalRecord);
    const allOccurrenceViews =
      await this.collectOccurrenceViewsForDefinitions(linkedDefinitions);
    const lookbackStart = new Date(
      now.getTime() - GOAL_REVIEW_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
    );
    const activeOccurrences = allOccurrenceViews.filter(
      (occurrence) =>
        occurrence.state === "visible" || occurrence.state === "snoozed",
    );
    const overdueOccurrences = activeOccurrences.filter((occurrence) => {
      if (!occurrence.dueAt) {
        return false;
      }
      return new Date(occurrence.dueAt).getTime() < now.getTime();
    });
    const recentCompletions = allOccurrenceViews.filter(
      (occurrence) =>
        occurrence.state === "completed" &&
        new Date(occurrence.updatedAt).getTime() >= lookbackStart.getTime(),
    );
    const lastActivityAt = allOccurrenceViews.reduce<string | null>(
      (latest, occurrence) => {
        const currentTime = new Date(occurrence.updatedAt).getTime();
        if (!Number.isFinite(currentTime)) {
          return latest;
        }
        if (!latest) {
          return occurrence.updatedAt;
        }
        return currentTime > new Date(latest).getTime()
          ? occurrence.updatedAt
          : latest;
      },
      null,
    );
    const derivedReviewState = this.deriveGoalReviewState(
      goalRecord.goal,
      linkedDefinitions,
      activeOccurrences,
      overdueOccurrences,
      recentCompletions,
      lastActivityAt,
      now,
    );
    const summary: LifeOpsGoalReview["summary"] = {
      linkedDefinitionCount: linkedDefinitions.length,
      activeOccurrenceCount: activeOccurrences.length,
      overdueOccurrenceCount: overdueOccurrences.length,
      completedLast7Days: recentCompletions.length,
      lastActivityAt,
      reviewState: derivedReviewState,
      explanation: this.buildGoalReviewExplanation({
        goal: goalRecord.goal,
        linkedDefinitionCount: linkedDefinitions.length,
        activeOccurrenceCount: activeOccurrences.length,
        overdueOccurrenceCount: overdueOccurrences.length,
        completedLast7Days: recentCompletions.length,
        reviewState: derivedReviewState,
        lastActivityAt,
      }),
    };
    const goal = await this.syncComputedGoalReviewState(
      goalRecord.goal,
      derivedReviewState,
      summary,
      now,
    );
    return {
      goal,
      links: goalRecord.links,
      linkedDefinitions,
      activeOccurrences,
      overdueOccurrences,
      recentCompletions,
      suggestions: this.buildGoalSupportSuggestions({
        goal,
        linkedDefinitions,
        activeOccurrences,
        overdueOccurrences,
        recentCompletions,
      }),
      audits: await this.repository.listAuditEvents(this.agentId(), "goal", goal.id),
      summary: {
        ...summary,
        reviewState: goal.reviewState,
      },
    };
  }

  async reviewGoal(goalId: string, now = new Date()): Promise<LifeOpsGoalReview> {
    const goalRecord = await this.getGoalRecord(goalId);
    return this.buildGoalReview(goalRecord, now);
  }

  async explainOccurrence(
    occurrenceId: string,
  ): Promise<LifeOpsOccurrenceExplanation> {
    const occurrence = await this.repository.getOccurrenceView(
      this.agentId(),
      occurrenceId,
    );
    if (!occurrence) {
      fail(404, "life-ops occurrence not found");
    }
    const definitionRecord = await this.getDefinitionRecord(occurrence.definitionId);
    const linkedGoal = definitionRecord.definition.goalId
      ? await this.getGoalRecord(definitionRecord.definition.goalId)
      : null;
    const reminderInspection = await this.inspectReminder("occurrence", occurrence.id);
    const definitionAudits = await this.repository.listAuditEvents(
      this.agentId(),
      "definition",
      definitionRecord.definition.id,
    );
    const lastReminderAttempt = reminderInspection.attempts[0] ?? null;
    const lastOccurrenceAudit = reminderInspection.audits[0] ?? null;
    const whyVisible =
      occurrence.state === "snoozed" && occurrence.snoozedUntil
        ? `This item is still visible because it was snoozed until ${occurrence.snoozedUntil}.`
        : occurrence.dueAt
          ? `This item is visible because it is due at ${occurrence.dueAt} and its current relevance window started at ${occurrence.relevanceStartAt}.`
          : `This item is visible because its current relevance window started at ${occurrence.relevanceStartAt}.`;
    return {
      occurrence,
      definition: definitionRecord.definition,
      reminderPlan: definitionRecord.reminderPlan,
      linkedGoal,
      reminderInspection,
      definitionAudits,
      summary: {
        originalIntent: definitionRecord.definition.originalIntent,
        source: definitionRecord.definition.source,
        whyVisible,
        lastReminderAt: lastReminderAttempt?.attemptedAt ?? null,
        lastReminderChannel: lastReminderAttempt?.channel ?? null,
        lastReminderOutcome: lastReminderAttempt?.outcome ?? null,
        lastActionSummary: lastOccurrenceAudit
          ? `${lastOccurrenceAudit.reason} at ${lastOccurrenceAudit.createdAt}`
          : null,
      },
    };
  }

  private async refreshGoalReviewStates(now: Date): Promise<LifeOpsGoalDefinition[]> {
    const goals = (await this.repository.listGoals(this.agentId())).filter(
      (goal) => goal.status === "active",
    );
    const refreshed: LifeOpsGoalDefinition[] = [];
    for (const goal of goals) {
      const review = await this.buildGoalReview(
        {
          goal,
          links: await this.repository.listGoalLinksForGoal(this.agentId(), goal.id),
        },
        now,
      );
      refreshed.push(review.goal);
    }
    return refreshed;
  }

  async getOverview(now = new Date()): Promise<LifeOpsOverview> {
    const definitions = await this.repository.listActiveDefinitions(
      this.agentId(),
    );
    for (const definition of definitions) {
      await this.refreshDefinitionOccurrences(definition, now);
    }
    const horizon = addMinutes(now, OVERVIEW_HORIZON_MINUTES).toISOString();
    const overviewOccurrences =
      await this.repository.listOccurrenceViewsForOverview(
        this.agentId(),
        horizon,
      );
    const reminderPlans = await this.repository.listReminderPlansForOwners(
      this.agentId(),
      "definition",
      overviewOccurrences.map((occurrence) => occurrence.definitionId),
    );
    const plansByDefinitionId = new Map(
      reminderPlans.map((plan) => [plan.ownerId, plan]),
    );
    const calendarEvents = await this.repository.listCalendarEvents(
      this.agentId(),
      "google",
      now.toISOString(),
      addMinutes(now, OVERVIEW_HORIZON_MINUTES).toISOString(),
    );
    const calendarReminderPlans =
      await this.repository.listReminderPlansForOwners(
        this.agentId(),
        "calendar_event",
        calendarEvents.map((event) => event.id),
      );
    const plansByEventId = new Map(
      calendarReminderPlans.map((plan) => [plan.ownerId, plan]),
    );
    const goals = await this.refreshGoalReviewStates(now);
    const allReminders = [
      ...buildActiveReminders(overviewOccurrences, plansByDefinitionId, now),
      ...buildActiveCalendarEventReminders(
        calendarEvents,
        plansByEventId,
        this.ownerEntityId(),
        now,
      ),
    ].sort(
      (left, right) =>
        new Date(left.scheduledFor).getTime() -
        new Date(right.scheduledFor).getTime(),
    );
    const ownerSectionBase = {
      occurrences: selectOverviewOccurrences(
        overviewOccurrences.filter(
          (occurrence) => occurrence.subjectType === "owner",
        ),
      ),
      goals: goals.filter((goal) => goal.subjectType === "owner"),
      reminders: allReminders
        .filter((reminder) => reminder.subjectType === "owner")
        .slice(0, MAX_OVERVIEW_REMINDERS),
    };
    const agentSectionBase = {
      occurrences: selectOverviewOccurrences(
        overviewOccurrences.filter(
          (occurrence) => occurrence.subjectType === "agent",
        ),
      ),
      goals: goals.filter((goal) => goal.subjectType === "agent"),
      reminders: allReminders
        .filter((reminder) => reminder.subjectType === "agent")
        .slice(0, MAX_OVERVIEW_REMINDERS),
    };
    const owner: LifeOpsOverviewSection = {
      ...ownerSectionBase,
      summary: summarizeOverviewSection(ownerSectionBase, now),
    };
    const agentOps: LifeOpsOverviewSection = {
      ...agentSectionBase,
      summary: summarizeOverviewSection(agentSectionBase, now),
    };
    return {
      occurrences: owner.occurrences,
      goals: owner.goals,
      reminders: owner.reminders,
      summary: owner.summary,
      owner,
      agentOps,
    };
  }

  async listChannelPolicies(): Promise<LifeOpsChannelPolicy[]> {
    return this.repository.listChannelPolicies(this.agentId());
  }

  async upsertChannelPolicy(
    request: UpsertLifeOpsChannelPolicyRequest,
  ): Promise<LifeOpsChannelPolicy> {
    const channelType = normalizeEnumValue(
      request.channelType,
      "channelType",
      LIFEOPS_CHANNEL_TYPES,
    );
    const channelRef =
      channelType === "sms" || channelType === "voice"
        ? normalizePhoneNumber(request.channelRef, "channelRef")
        : requireNonEmptyString(request.channelRef, "channelRef");
    const existing = await this.repository.getChannelPolicy(
      this.agentId(),
      channelType,
      channelRef,
    );
    const policy = existing
      ? {
          ...existing,
          privacyClass: normalizePrivacyClass(
            request.privacyClass,
            "privacyClass",
            existing.privacyClass,
          ),
          allowReminders:
            normalizeOptionalBoolean(
              request.allowReminders,
              "allowReminders",
            ) ?? existing.allowReminders,
          allowEscalation:
            normalizeOptionalBoolean(
              request.allowEscalation,
              "allowEscalation",
            ) ?? existing.allowEscalation,
          allowPosts:
            normalizeOptionalBoolean(request.allowPosts, "allowPosts") ??
            existing.allowPosts,
          requireConfirmationForActions:
            normalizeOptionalBoolean(
              request.requireConfirmationForActions,
              "requireConfirmationForActions",
            ) ?? existing.requireConfirmationForActions,
          metadata:
            request.metadata !== undefined
              ? {
                  ...existing.metadata,
                  ...requireRecord(request.metadata, "metadata"),
                }
              : existing.metadata,
          updatedAt: new Date().toISOString(),
        }
      : createLifeOpsChannelPolicy({
          agentId: this.agentId(),
          channelType,
          channelRef,
          privacyClass: normalizePrivacyClass(request.privacyClass),
          allowReminders:
            normalizeOptionalBoolean(
              request.allowReminders,
              "allowReminders",
            ) ?? true,
          allowEscalation:
            normalizeOptionalBoolean(
              request.allowEscalation,
              "allowEscalation",
            ) ?? false,
          allowPosts:
            normalizeOptionalBoolean(request.allowPosts, "allowPosts") ?? false,
          requireConfirmationForActions:
            normalizeOptionalBoolean(
              request.requireConfirmationForActions,
              "requireConfirmationForActions",
            ) ?? true,
          metadata: normalizeOptionalRecord(request.metadata, "metadata") ?? {},
        });
    await this.repository.upsertChannelPolicy(policy);
    await this.recordChannelPolicyAudit(
      policy.id,
      "channel policy updated",
      { request },
      {
        channelType: policy.channelType,
        channelRef: policy.channelRef,
      },
    );
    return policy;
  }

  async capturePhoneConsent(
    request: CaptureLifeOpsPhoneConsentRequest,
  ): Promise<{ phoneNumber: string; policies: LifeOpsChannelPolicy[] }> {
    if (
      normalizeOptionalBoolean(request.consentGiven, "consentGiven") !== true
    ) {
      fail(
        400,
        "Explicit consent is required before capturing a phone number.",
      );
    }
    const phoneNumber = normalizePhoneNumber(
      request.phoneNumber,
      "phoneNumber",
    );
    const privacyClass = normalizePrivacyClass(request.privacyClass);
    const baseMetadata = {
      ...(normalizeOptionalRecord(request.metadata, "metadata") ?? {}),
      phoneNumber,
      consentCapturedAt: new Date().toISOString(),
      consentGiven: true,
      isPrimary: true,
    };
    const smsPolicy = await this.upsertChannelPolicy({
      channelType: "sms",
      channelRef: phoneNumber,
      privacyClass,
      allowReminders: true,
      allowEscalation:
        normalizeOptionalBoolean(request.allowSms, "allowSms") ?? false,
      allowPosts: false,
      requireConfirmationForActions: true,
      metadata: {
        ...baseMetadata,
        consentKind: "phone",
        smsAllowed:
          normalizeOptionalBoolean(request.allowSms, "allowSms") ?? false,
        voiceAllowed:
          normalizeOptionalBoolean(request.allowVoice, "allowVoice") ?? false,
      },
    });
    const voicePolicy = await this.upsertChannelPolicy({
      channelType: "voice",
      channelRef: phoneNumber,
      privacyClass,
      allowReminders: true,
      allowEscalation:
        normalizeOptionalBoolean(request.allowVoice, "allowVoice") ?? false,
      allowPosts: false,
      requireConfirmationForActions: true,
      metadata: {
        ...baseMetadata,
        consentKind: "phone",
        smsAllowed:
          normalizeOptionalBoolean(request.allowSms, "allowSms") ?? false,
        voiceAllowed:
          normalizeOptionalBoolean(request.allowVoice, "allowVoice") ?? false,
      },
    });
    return {
      phoneNumber,
      policies: [smsPolicy, voicePolicy],
    };
  }

  async processReminders(
    request: { now?: string; limit?: number } = {},
  ): Promise<LifeOpsReminderProcessingResult> {
    return this.withReminderProcessingLock(async () => {
      const now =
        request.now === undefined
          ? new Date()
          : new Date(normalizeIsoString(request.now, "now"));
      const limit =
        request.limit === undefined
          ? DEFAULT_REMINDER_PROCESS_LIMIT
          : normalizePositiveInteger(request.limit, "limit");

      const definitions = await this.repository.listActiveDefinitions(
        this.agentId(),
      );
      for (const definition of definitions) {
        await this.refreshDefinitionOccurrences(definition, now);
      }

      const horizon = addMinutes(now, OVERVIEW_HORIZON_MINUTES).toISOString();
      const occurrenceViews =
        await this.repository.listOccurrenceViewsForOverview(
          this.agentId(),
          horizon,
        );
      const occurrencePlans = await this.repository.listReminderPlansForOwners(
        this.agentId(),
        "definition",
        occurrenceViews.map((occurrence) => occurrence.definitionId),
      );
      const plansByDefinitionId = new Map(
        occurrencePlans.map((plan) => [plan.ownerId, plan]),
      );
      const eventWindowEnd = addMinutes(
        now,
        OVERVIEW_HORIZON_MINUTES,
      ).toISOString();
      const calendarEvents = await this.repository.listCalendarEvents(
        this.agentId(),
        "google",
        now.toISOString(),
        eventWindowEnd,
      );
      const eventPlans = await this.repository.listReminderPlansForOwners(
        this.agentId(),
        "calendar_event",
        calendarEvents.map((event) => event.id),
      );
      const plansByEventId = new Map(
        eventPlans.map((plan) => [plan.ownerId, plan]),
      );
      const existingAttempts = await this.repository.listReminderAttempts(
        this.agentId(),
      );
      const attemptKey = (
        planId: string,
        stepIndex: number,
        scheduledFor: string,
      ) => `${planId}:${stepIndex}:${scheduledFor}`;
      const deliveredAttempts = new Set(
        existingAttempts
          .filter((attempt) => attempt.outcome === "delivered")
          .map((attempt) =>
            attemptKey(attempt.planId, attempt.stepIndex, attempt.scheduledFor),
          ),
      );
      const blockedAckAttempts = new Set(
        existingAttempts
          .filter((attempt) => attempt.outcome === "blocked_acknowledged")
          .map((attempt) =>
            attemptKey(attempt.planId, attempt.stepIndex, attempt.scheduledFor),
          ),
      );

      const dueAttempts: LifeOpsReminderAttempt[] = [];
      for (const reminder of buildActiveReminders(
        occurrenceViews,
        plansByDefinitionId,
        now,
      )) {
        if (dueAttempts.length >= limit) break;
        const plan = reminder.definitionId
          ? plansByDefinitionId.get(reminder.definitionId)
          : null;
        if (!plan) continue;
        const occurrence = occurrenceViews.find(
          (candidate) => candidate.id === reminder.ownerId,
        );
        if (!occurrence) continue;
        const key = attemptKey(
          plan.id,
          reminder.stepIndex,
          reminder.scheduledFor,
        );
        const acknowledged = Boolean(
          occurrence.metadata.reminderAcknowledgedAt ||
            occurrence.state === "completed",
        );
        if (
          deliveredAttempts.has(key) ||
          (acknowledged && blockedAckAttempts.has(key))
        ) {
          continue;
        }
        const attempt = await this.dispatchReminderAttempt({
          plan,
          ownerType: "occurrence",
          ownerId: reminder.ownerId,
          occurrenceId: reminder.occurrenceId,
          subjectType: occurrence.subjectType,
          title: reminder.title,
          channel: reminder.channel,
          stepIndex: reminder.stepIndex,
          scheduledFor: reminder.scheduledFor,
          dueAt: occurrence.dueAt,
          urgency:
            typeof occurrence.metadata.urgency === "string"
              ? normalizeReminderUrgency(occurrence.metadata.urgency)
              : priorityToUrgency(occurrence.priority),
          quietHours: plan.quietHours,
          acknowledged,
          attemptedAt: now.toISOString(),
        });
        dueAttempts.push(attempt);
        if (attempt.outcome === "delivered") {
          deliveredAttempts.add(key);
        }
      }

      for (const reminder of buildActiveCalendarEventReminders(
        calendarEvents,
        plansByEventId,
        this.ownerEntityId(),
        now,
      )) {
        if (dueAttempts.length >= limit) break;
        const plan = reminder.eventId
          ? plansByEventId.get(reminder.eventId)
          : null;
        if (!plan) continue;
        const event = calendarEvents.find(
          (candidate) => candidate.id === reminder.ownerId,
        );
        if (!event) continue;
        const key = attemptKey(
          plan.id,
          reminder.stepIndex,
          reminder.scheduledFor,
        );
        const acknowledged = Boolean(event.metadata.reminderAcknowledgedAt);
        if (
          deliveredAttempts.has(key) ||
          (acknowledged && blockedAckAttempts.has(key))
        ) {
          continue;
        }
        const attempt = await this.dispatchReminderAttempt({
          plan,
          ownerType: "calendar_event",
          ownerId: reminder.ownerId,
          occurrenceId: null,
          subjectType: reminder.subjectType,
          title: reminder.title,
          channel: reminder.channel,
          stepIndex: reminder.stepIndex,
          scheduledFor: reminder.scheduledFor,
          dueAt: reminder.dueAt,
          urgency:
            typeof event.metadata.urgency === "string"
              ? normalizeReminderUrgency(event.metadata.urgency)
              : "medium",
          quietHours: plan.quietHours,
          acknowledged,
          attemptedAt: now.toISOString(),
        });
        dueAttempts.push(attempt);
        if (attempt.outcome === "delivered") {
          deliveredAttempts.add(key);
        }
      }

      return {
        now: now.toISOString(),
        attempts: dueAttempts,
      };
    });
  }

  async processScheduledWork(
    request: {
      now?: string;
      reminderLimit?: number;
      workflowLimit?: number;
    } = {},
  ): Promise<{
    now: string;
    reminderAttempts: LifeOpsReminderAttempt[];
    workflowRuns: LifeOpsWorkflowRun[];
  }> {
    const now =
      request.now === undefined
        ? new Date()
        : new Date(normalizeIsoString(request.now, "now"));
    const reminderLimit =
      request.reminderLimit === undefined
        ? DEFAULT_REMINDER_PROCESS_LIMIT
        : normalizePositiveInteger(request.reminderLimit, "reminderLimit");
    const workflowLimit =
      request.workflowLimit === undefined
        ? DEFAULT_WORKFLOW_PROCESS_LIMIT
        : normalizePositiveInteger(request.workflowLimit, "workflowLimit");
    const reminderResult = await this.processReminders({
      now: now.toISOString(),
      limit: reminderLimit,
    });
    const workflowRuns = await this.runDueWorkflows({
      now: now.toISOString(),
      limit: workflowLimit,
    });
    return {
      now: now.toISOString(),
      reminderAttempts: reminderResult.attempts,
      workflowRuns,
    };
  }

  async inspectReminder(
    ownerType: "occurrence" | "calendar_event",
    ownerId: string,
  ): Promise<LifeOpsReminderInspection> {
    const reminderPlan = ownerType === "occurrence" ? (() => null)() : null;
    let plan: LifeOpsReminderPlan | null = reminderPlan;
    if (ownerType === "occurrence") {
      const occurrence = await this.repository.getOccurrence(
        this.agentId(),
        ownerId,
      );
      if (!occurrence) {
        fail(404, "life-ops occurrence not found");
      }
      const definition = await this.repository.getDefinition(
        this.agentId(),
        occurrence.definitionId,
      );
      if (definition?.reminderPlanId) {
        plan = await this.repository.getReminderPlan(
          this.agentId(),
          definition.reminderPlanId,
        );
      }
    } else {
      const plans = await this.repository.listReminderPlansForOwners(
        this.agentId(),
        "calendar_event",
        [ownerId],
      );
      plan = plans[0] ?? null;
    }
    return {
      ownerType,
      ownerId,
      reminderPlan: plan,
      attempts: await this.repository.listReminderAttempts(this.agentId(), {
        ownerType,
        ownerId,
      }),
      audits: await this.repository.listAuditEvents(
        this.agentId(),
        ownerType,
        ownerId,
      ),
    };
  }

  async acknowledgeReminder(
    request: AcknowledgeLifeOpsReminderRequest,
  ): Promise<{ ok: true }> {
    const ownerType = normalizeEnumValue(request.ownerType, "ownerType", [
      "occurrence",
      "calendar_event",
    ] as const);
    const ownerId = requireNonEmptyString(request.ownerId, "ownerId");
    const acknowledgedAt =
      request.acknowledgedAt === undefined
        ? new Date().toISOString()
        : normalizeIsoString(request.acknowledgedAt, "acknowledgedAt");
    const note = normalizeOptionalString(request.note) ?? null;
    if (ownerType === "occurrence") {
      const occurrence = await this.repository.getOccurrence(
        this.agentId(),
        ownerId,
      );
      if (!occurrence) {
        fail(404, "life-ops occurrence not found");
      }
      await this.repository.updateOccurrence({
        ...occurrence,
        metadata: {
          ...occurrence.metadata,
          reminderAcknowledgedAt: acknowledgedAt,
          reminderAcknowledgedNote: note,
        },
        updatedAt: new Date().toISOString(),
      });
    } else {
      const event = (
        await this.repository.listCalendarEvents(this.agentId(), "google")
      ).find((candidate) => candidate.id === ownerId);
      if (!event) {
        fail(404, "life-ops calendar event not found");
      }
      await this.repository.upsertCalendarEvent({
        ...event,
        metadata: {
          ...event.metadata,
          reminderAcknowledgedAt: acknowledgedAt,
          reminderAcknowledgedNote: note,
        },
        updatedAt: new Date().toISOString(),
      });
    }
    return { ok: true };
  }

  async listWorkflows(): Promise<LifeOpsWorkflowRecord[]> {
    const workflows = await this.repository.listWorkflows(this.agentId());
    const records: LifeOpsWorkflowRecord[] = [];
    for (const definition of workflows) {
      records.push({
        definition,
        runs: await this.repository.listWorkflowRuns(
          this.agentId(),
          definition.id,
        ),
      });
    }
    return records;
  }

  async getWorkflow(workflowId: string): Promise<LifeOpsWorkflowRecord> {
    const definition = await this.getWorkflowDefinition(workflowId);
    return {
      definition,
      runs: await this.repository.listWorkflowRuns(this.agentId(), workflowId),
    };
  }

  async createWorkflow(
    request: CreateLifeOpsWorkflowRequest,
  ): Promise<LifeOpsWorkflowRecord> {
    const triggerType = normalizeWorkflowTriggerType(request.triggerType);
    const ownership = this.normalizeOwnership(request.ownership);
    let definition = createLifeOpsWorkflowDefinition({
      agentId: this.agentId(),
      ...ownership,
      title: requireNonEmptyString(request.title, "title"),
      triggerType,
      schedule: normalizeWorkflowSchedule(request.schedule, triggerType),
      actionPlan: normalizeWorkflowActionPlan(request.actionPlan),
      permissionPolicy: normalizeWorkflowPermissionPolicy(
        request.permissionPolicy,
      ),
      status:
        request.status === undefined
          ? "active"
          : normalizeEnumValue(
              request.status,
              "status",
              LIFEOPS_WORKFLOW_STATUSES,
            ),
      createdBy:
        request.createdBy === undefined
          ? "user"
          : normalizeEnumValue(request.createdBy, "createdBy", [
              "agent",
              "user",
              "workflow",
              "connector",
            ] as const),
      metadata: normalizeOptionalRecord(request.metadata, "metadata") ?? {},
    });
    definition = this.initializeWorkflowSchedulerState(definition);
    await this.repository.createWorkflow(definition);
    await this.recordWorkflowAudit(
      "workflow_created",
      definition.id,
      "user",
      "workflow created",
      { request },
      {
        triggerType: definition.triggerType,
        status: definition.status,
      },
    );
    return {
      definition,
      runs: [],
    };
  }

  async updateWorkflow(
    workflowId: string,
    request: UpdateLifeOpsWorkflowRequest,
  ): Promise<LifeOpsWorkflowRecord> {
    const current = await this.getWorkflowDefinition(workflowId);
    const ownership = this.normalizeOwnership(request.ownership, current);
    const nextTriggerType =
      request.triggerType === undefined
        ? current.triggerType
        : normalizeWorkflowTriggerType(request.triggerType);
    let nextDefinition: LifeOpsWorkflowDefinition = {
      ...current,
      ...ownership,
      title:
        request.title === undefined
          ? current.title
          : requireNonEmptyString(request.title, "title"),
      triggerType: nextTriggerType,
      schedule:
        request.schedule === undefined
          ? current.schedule
          : normalizeWorkflowSchedule(request.schedule, nextTriggerType),
      actionPlan:
        request.actionPlan === undefined
          ? current.actionPlan
          : normalizeWorkflowActionPlan(request.actionPlan),
      permissionPolicy: normalizeWorkflowPermissionPolicy(
        request.permissionPolicy,
        current.permissionPolicy,
      ),
      status:
        request.status === undefined
          ? current.status
          : normalizeEnumValue(
              request.status,
              "status",
              LIFEOPS_WORKFLOW_STATUSES,
            ),
      metadata:
        request.metadata === undefined
          ? current.metadata
          : {
              ...current.metadata,
              ...requireRecord(request.metadata, "metadata"),
            },
      updatedAt: new Date().toISOString(),
    };
    if (
      request.triggerType !== undefined ||
      request.schedule !== undefined ||
      this.readWorkflowSchedulerState(nextDefinition) === null
    ) {
      nextDefinition = this.initializeWorkflowSchedulerState(nextDefinition);
    }
    await this.repository.updateWorkflow(nextDefinition);
    await this.recordWorkflowAudit(
      "workflow_updated",
      nextDefinition.id,
      "user",
      "workflow updated",
      { request },
      {
        triggerType: nextDefinition.triggerType,
        status: nextDefinition.status,
      },
    );
    return this.getWorkflow(nextDefinition.id);
  }

  private async executeWorkflowDefinition(
    definition: LifeOpsWorkflowDefinition,
    args: {
      startedAt: string;
      confirmBrowserActions: boolean;
      request: Record<string, unknown>;
    },
  ): Promise<ExecuteWorkflowResult> {
    const internalUrl = new URL("http://127.0.0.1/");
    const outputs: Record<string, unknown> = {};
    const steps: Array<Record<string, unknown>> = [];
    let status: LifeOpsWorkflowRun["status"] = "success";

    try {
      for (const [index, step] of definition.actionPlan.steps.entries()) {
        let value: unknown;
        if (step.kind === "create_task") {
          const created = await this.createDefinition({
            ...step.request,
            ownership: step.request.ownership ?? {
              domain: definition.domain,
              subjectType: definition.subjectType,
              subjectId: definition.subjectId,
              visibilityScope: definition.visibilityScope,
              contextPolicy: definition.contextPolicy,
            },
          });
          value = {
            definitionId: created.definition.id,
            title: created.definition.title,
            reminderPlanId: created.reminderPlan?.id ?? null,
          };
        } else if (step.kind === "get_calendar_feed") {
          value = await this.getCalendarFeed(
            internalUrl,
            step.request ?? {},
            new Date(args.startedAt),
          );
        } else if (step.kind === "get_gmail_triage") {
          value = await this.getGmailTriage(
            internalUrl,
            step.request ?? {},
            new Date(args.startedAt),
          );
        } else if (step.kind === "summarize") {
          const sourceValue =
            (step.sourceKey ? outputs[step.sourceKey] : steps.at(-1)?.value) ??
            null;
          value = {
            text: summarizeWorkflowValue(sourceValue, step.prompt),
          };
        } else {
          if (!definition.permissionPolicy.allowBrowserActions) {
            value = {
              blocked: true,
              reason: "browser_actions_disabled",
            };
          } else {
            const session = await this.createBrowserSessionInternal({
              workflowId: definition.id,
              title: step.sessionTitle,
              actions: step.actions,
              ownership: {
                domain: definition.domain,
                subjectType: definition.subjectType,
                subjectId: definition.subjectId,
                visibilityScope: definition.visibilityScope,
                contextPolicy: definition.contextPolicy,
              },
            });
            if (
              session.awaitingConfirmationForActionId &&
              !definition.permissionPolicy.trustedBrowserActions &&
              !args.confirmBrowserActions
            ) {
              value = {
                sessionId: session.id,
                status: session.status,
                requiresConfirmation: true,
              };
            } else {
              const updated: LifeOpsBrowserSession = {
                ...session,
                status: "navigating",
                awaitingConfirmationForActionId: null,
                updatedAt: new Date().toISOString(),
              };
              await this.repository.updateBrowserSession(updated);
              await this.recordBrowserAudit(
                "browser_session_updated",
                updated.id,
                "browser session started",
                {
                  workflowId: definition.id,
                },
                {
                  status: updated.status,
                },
              );
              value = {
                sessionId: updated.id,
                status: updated.status,
                requiresConfirmation: false,
              };
            }
          }
        }
        const stepRecord = {
          index,
          kind: step.kind,
          resultKey: step.resultKey ?? null,
          value,
        };
        if (step.resultKey) {
          outputs[step.resultKey] = value;
        }
        steps.push(stepRecord);
      }
    } catch (error) {
      status = "failed";
      steps.push({
        error: error instanceof Error ? error.message : String(error),
      });
      const audit = await this.recordWorkflowAudit(
        "workflow_run",
        definition.id,
        "workflow",
        "workflow run failed",
        {
          request: args.request,
        },
        {
          status,
          steps,
        },
      );
      const run = createLifeOpsWorkflowRun({
        agentId: this.agentId(),
        workflowId: definition.id,
        startedAt: args.startedAt,
        finishedAt: new Date().toISOString(),
        status,
        result: { steps, outputs },
        auditRef: audit.id,
      });
      await this.repository.createWorkflowRun(run);
      return {
        run,
        error,
      };
    }

    const audit = await this.recordWorkflowAudit(
      "workflow_run",
      definition.id,
      "workflow",
      "workflow run succeeded",
      {
        request: args.request,
      },
      {
        status,
        steps,
      },
    );
    const run = createLifeOpsWorkflowRun({
      agentId: this.agentId(),
      workflowId: definition.id,
      startedAt: args.startedAt,
      finishedAt: new Date().toISOString(),
      status,
      result: { steps, outputs },
      auditRef: audit.id,
    });
    await this.repository.createWorkflowRun(run);
    return {
      run,
      error: null,
    };
  }

  async runWorkflow(
    workflowId: string,
    request: { now?: string; confirmBrowserActions?: boolean } = {},
  ): Promise<LifeOpsWorkflowRun> {
    const definition = await this.getWorkflowDefinition(workflowId);
    if (definition.status !== "active") {
      fail(409, `workflow cannot run from status ${definition.status}`);
    }
    const startedAt =
      request.now === undefined
        ? new Date().toISOString()
        : normalizeIsoString(request.now, "now");
    const confirmBrowserActions =
      normalizeOptionalBoolean(
        request.confirmBrowserActions,
        "confirmBrowserActions",
      ) ?? false;
    const result = await this.executeWorkflowDefinition(definition, {
      startedAt,
      confirmBrowserActions,
      request: request as Record<string, unknown>,
    });
    if (result.error instanceof LifeOpsServiceError) {
      throw result.error;
    }
    if (result.error) {
      throw result.error;
    }
    return result.run;
  }

  async listBrowserSessions(): Promise<LifeOpsBrowserSession[]> {
    return this.repository.listBrowserSessions(this.agentId());
  }

  async getBrowserSession(sessionId: string): Promise<LifeOpsBrowserSession> {
    const session = await this.repository.getBrowserSession(
      this.agentId(),
      sessionId,
    );
    if (!session) {
      fail(404, "browser session not found");
    }
    return session;
  }

  async createBrowserSession(
    request: CreateLifeOpsBrowserSessionRequest,
  ): Promise<LifeOpsBrowserSession> {
    return this.createBrowserSessionInternal(request);
  }

  async confirmBrowserSession(
    sessionId: string,
    request: ConfirmLifeOpsBrowserSessionRequest,
  ): Promise<LifeOpsBrowserSession> {
    const session = await this.getBrowserSession(sessionId);
    const confirmed =
      normalizeOptionalBoolean(request.confirmed, "confirmed") ?? false;
    const nextSession: LifeOpsBrowserSession = confirmed
      ? {
          ...session,
          status: "navigating",
          awaitingConfirmationForActionId: null,
          updatedAt: new Date().toISOString(),
        }
      : {
          ...session,
          status: "cancelled",
          awaitingConfirmationForActionId: null,
          finishedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
    await this.repository.updateBrowserSession(nextSession);
    await this.recordBrowserAudit(
      "browser_session_updated",
      nextSession.id,
      confirmed ? "browser session confirmed" : "browser session cancelled",
      {
        confirmed,
      },
      {
        status: nextSession.status,
      },
    );
    return nextSession;
  }

  async completeBrowserSession(
    sessionId: string,
    request: CompleteLifeOpsBrowserSessionRequest,
  ): Promise<LifeOpsBrowserSession> {
    const session = await this.getBrowserSession(sessionId);
    if (
      session.status === "awaiting_confirmation" &&
      session.awaitingConfirmationForActionId
    ) {
      fail(
        409,
        "Browser session requires explicit confirmation before execution.",
      );
    }
    const nextSession: LifeOpsBrowserSession = {
      ...session,
      status: "done",
      currentActionIndex: Math.max(0, session.actions.length - 1),
      result:
        request.result === undefined
          ? session.result
          : {
              ...session.result,
              ...requireRecord(request.result, "result"),
            },
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.repository.updateBrowserSession(nextSession);
    await this.recordBrowserAudit(
      "browser_session_updated",
      nextSession.id,
      "browser session completed",
      {
        result: request.result ?? null,
      },
      {
        status: nextSession.status,
      },
    );
    return nextSession;
  }

  async getXConnectorStatus(
    requestedMode?: LifeOpsConnectorMode,
  ): Promise<LifeOpsXConnectorStatus> {
    const mode =
      normalizeOptionalConnectorMode(requestedMode, "mode") ?? "local";
    const grant = await this.repository.getConnectorGrant(
      this.agentId(),
      "x",
      mode,
    );
    const capabilities = (grant?.capabilities ?? []).filter(
      (candidate): candidate is "x.read" | "x.write" =>
        candidate === "x.read" || candidate === "x.write",
    );
    return {
      provider: "x",
      mode,
      connected: Boolean(grant && readXPosterCredentialsFromEnv()),
      grantedCapabilities: capabilities,
      grantedScopes: grant?.grantedScopes ?? [],
      identity:
        grant && Object.keys(grant.identity).length > 0 ? grant.identity : null,
      hasCredentials: Boolean(readXPosterCredentialsFromEnv()),
      grant,
    };
  }

  async upsertXConnector(
    request: UpsertLifeOpsXConnectorRequest,
  ): Promise<LifeOpsXConnectorStatus> {
    const mode =
      normalizeOptionalConnectorMode(request.mode, "mode") ?? "local";
    const existing = await this.repository.getConnectorGrant(
      this.agentId(),
      "x",
      mode,
    );
    const capabilities = normalizeXCapabilityRequest(request.capabilities);
    const scopes = Array.isArray(request.grantedScopes)
      ? request.grantedScopes.map((scope, index) =>
          requireNonEmptyString(scope, `grantedScopes[${index}]`),
        )
      : [];
    const identity =
      normalizeOptionalRecord(request.identity, "identity") ?? {};
    const metadata =
      normalizeOptionalRecord(request.metadata, "metadata") ?? {};
    const grant = existing
      ? {
          ...existing,
          identity,
          grantedScopes: scopes,
          capabilities,
          metadata: {
            ...existing.metadata,
            ...metadata,
          },
          updatedAt: new Date().toISOString(),
        }
      : createLifeOpsConnectorGrant({
          agentId: this.agentId(),
          provider: "x",
          identity,
          grantedScopes: scopes,
          capabilities,
          tokenRef: null,
          mode,
          metadata,
          lastRefreshAt: new Date().toISOString(),
        });
    await this.repository.upsertConnectorGrant(grant);
    await this.recordConnectorAudit(
      `x:${mode}`,
      "x connector updated",
      { request },
      {
        capabilities,
      },
    );
    return this.getXConnectorStatus(mode);
  }

  async createXPost(
    request: CreateLifeOpsXPostRequest,
  ): Promise<LifeOpsXPostResponse> {
    const mode = normalizeOptionalConnectorMode(request.mode, "mode");
    const grant = await this.requireXGrant(mode);
    const capabilities = new Set(
      (grant.capabilities ?? []).filter(
        (candidate) => candidate === "x.read" || candidate === "x.write",
      ),
    );
    if (!capabilities.has("x.write")) {
      fail(403, "X write access has not been granted.");
    }
    const text = requireNonEmptyString(request.text, "text");
    const policy = await this.resolvePrimaryChannelPolicy("x");
    const trustedPosting =
      Boolean(policy?.allowPosts) &&
      policy?.requireConfirmationForActions === false;
    const confirmPost =
      normalizeOptionalBoolean(request.confirmPost, "confirmPost") ?? false;
    if (!confirmPost && !trustedPosting) {
      fail(
        409,
        "X posting requires explicit confirmation or a trusted posting policy.",
      );
    }
    const credentials = readXPosterCredentialsFromEnv();
    if (!credentials) {
      fail(409, "X credentials are not configured.");
    }
    const result = await postToX({
      text,
      credentials,
    });
    if (!result.ok) {
      this.logLifeOpsWarn(
        "x_post",
        result.error ?? "Failed to create X post.",
        {
          mode: grant.mode,
          statusCode: result.status,
          category: result.category,
        },
      );
      fail(result.status ?? 502, result.error ?? "Failed to create X post.");
    }
    await this.recordXPostAudit(
      `x:${grant.mode}`,
      "x post sent",
      {
        text,
        confirmPost,
        trustedPosting,
      },
      {
        postId: result.postId ?? null,
        status: result.status,
      },
    );
    return {
      ok: true,
      status: result.status,
      postId: result.postId,
      category: result.category,
    };
  }

  async getCalendarFeed(
    requestUrl: URL,
    request: GetLifeOpsCalendarFeedRequest = {},
    now = new Date(),
  ): Promise<LifeOpsCalendarFeed> {
    const mode = normalizeOptionalConnectorMode(request.mode, "mode");
    const calendarId = normalizeCalendarId(request.calendarId);
    const timeZone = normalizeCalendarTimeZone(request.timeZone);
    const { timeMin, timeMax } = resolveCalendarWindow({
      now,
      timeZone,
      requestedTimeMin: request.timeMin,
      requestedTimeMax: request.timeMax,
    });
    const forceSync =
      normalizeOptionalBoolean(request.forceSync, "forceSync") ?? false;
    await this.requireGoogleCalendarGrant(requestUrl, mode);

    const syncState = await this.repository.getCalendarSyncState(
      this.agentId(),
      "google",
      calendarId,
    );
    if (
      !forceSync &&
      syncState &&
      isCalendarSyncStateFresh({
        syncedAt: syncState.syncedAt,
        timeMin,
        timeMax,
        windowStartAt: syncState.windowStartAt,
        windowEndAt: syncState.windowEndAt,
        now,
      })
    ) {
      return {
        calendarId,
        events: await this.repository.listCalendarEvents(
          this.agentId(),
          "google",
          timeMin,
          timeMax,
        ),
        source: "cache",
        timeMin,
        timeMax,
        syncedAt: syncState.syncedAt,
      };
    }

    return this.syncGoogleCalendarFeed({
      requestUrl,
      requestedMode: mode,
      calendarId,
      timeMin,
      timeMax,
      timeZone,
    });
  }

  async getGmailTriage(
    requestUrl: URL,
    request: GetLifeOpsGmailTriageRequest = {},
    now = new Date(),
  ): Promise<LifeOpsGmailTriageFeed> {
    const mode = normalizeOptionalConnectorMode(request.mode, "mode");
    const maxResults = normalizeGmailTriageMaxResults(request.maxResults);
    const forceSync =
      normalizeOptionalBoolean(request.forceSync, "forceSync") ?? false;
    await this.requireGoogleGmailGrant(requestUrl, mode);

    const syncState = await this.repository.getGmailSyncState(
      this.agentId(),
      "google",
      GOOGLE_GMAIL_MAILBOX,
    );
    if (
      !forceSync &&
      syncState &&
      isGmailSyncStateFresh({
        syncedAt: syncState.syncedAt,
        maxResults: syncState.maxResults,
        requestedMaxResults: maxResults,
        now,
      })
    ) {
      const messages = await this.repository.listGmailMessages(
        this.agentId(),
        "google",
        {
          maxResults,
        },
      );
      return {
        messages,
        source: "cache",
        syncedAt: syncState.syncedAt,
        summary: summarizeGmailTriage(messages),
      };
    }

    return this.syncGoogleGmailTriage({
      requestUrl,
      requestedMode: mode,
      maxResults,
    });
  }

  async createCalendarEvent(
    requestUrl: URL,
    request: CreateLifeOpsCalendarEventRequest,
    now = new Date(),
  ): Promise<LifeOpsCalendarEvent> {
    const mode = normalizeOptionalConnectorMode(request.mode, "mode");
    const calendarId = normalizeCalendarId(request.calendarId);
    const title = requireNonEmptyString(request.title, "title");
    const description = normalizeOptionalString(request.description) ?? "";
    const location = normalizeOptionalString(request.location) ?? "";
    const attendees = normalizeCalendarAttendees(request.attendees);
    const { startAt, endAt, timeZone } = resolveCalendarEventRange(
      request,
      now,
    );

    const grant = await this.requireGoogleCalendarWriteGrant(requestUrl, mode);
    const createEvent = async () => {
      const created =
        resolveGoogleExecutionTarget(grant) === "cloud"
          ? (
              await this.googleManagedClient.createCalendarEvent({
                calendarId,
                title,
                description,
                location,
                startAt,
                endAt,
                timeZone,
                attendees,
              })
            ).event
          : await createGoogleCalendarEvent({
              accessToken: (
                await ensureFreshGoogleAccessToken(
                  grant.tokenRef ??
                    fail(409, "Google Calendar token reference is missing."),
                )
              ).accessToken,
              calendarId,
              title,
              description,
              location,
              startAt,
              endAt,
              timeZone,
              attendees,
            });
      const syncedAt = new Date().toISOString();
      const event: LifeOpsCalendarEvent = {
        id: createCalendarEventId(
          this.agentId(),
          "google",
          created.calendarId,
          created.externalId,
        ),
        agentId: this.agentId(),
        provider: "google",
        ...created,
        syncedAt,
        updatedAt: syncedAt,
      };
      await this.repository.upsertCalendarEvent(event);
      await this.syncCalendarReminderPlans([event]);
      await this.clearGoogleGrantAuthFailure(grant);
      await this.recordCalendarEventAudit(
        event.id,
        "calendar event created",
        {
          calendarId,
          mode: grant.mode,
          title,
          requestedStartAt: startAt,
          requestedEndAt: endAt,
        },
        {
          externalId: event.externalId,
          htmlLink: event.htmlLink,
        },
      );
      return event;
    };

    return resolveGoogleExecutionTarget(grant) === "cloud"
      ? this.runManagedGoogleOperation(grant, createEvent)
      : this.withGoogleGrantOperation(grant, createEvent);
  }

  async getNextCalendarEventContext(
    requestUrl: URL,
    request: GetLifeOpsCalendarFeedRequest = {},
    now = new Date(),
  ): Promise<LifeOpsNextCalendarEventContext> {
    const mode = normalizeOptionalConnectorMode(request.mode, "mode");
    const feed = await this.getCalendarFeed(requestUrl, request, now);
    const nextEvent =
      feed.events.find((event) => Date.parse(event.endAt) > now.getTime()) ??
      null;
    if (!nextEvent) {
      return buildNextCalendarEventContext(null, now);
    }

    let linkedMail: LifeOpsGmailMessageSummary[] = [];
    let linkedMailState: "unavailable" | "cache" | "synced" | "error" =
      "unavailable";
    let linkedMailError: string | null = null;
    const status = await this.getGoogleConnectorStatus(requestUrl, mode);
    if (
      status.connected &&
      status.grant &&
      hasGoogleGmailTriageCapability(status.grant)
    ) {
      const cachedMessages = await this.repository.listGmailMessages(
        this.agentId(),
        "google",
        {
          maxResults: DEFAULT_GMAIL_TRIAGE_MAX_RESULTS,
        },
      );
      linkedMail = findLinkedMailForCalendarEvent(nextEvent, cachedMessages);
      linkedMailState = "cache";
      if (linkedMail.length === 0) {
        try {
          const triage = await this.getGmailTriage(
            requestUrl,
            {
              mode,
              maxResults: DEFAULT_GMAIL_TRIAGE_MAX_RESULTS,
            },
            now,
          );
          linkedMail = findLinkedMailForCalendarEvent(
            nextEvent,
            triage.messages,
          );
          linkedMailState = "synced";
        } catch (error) {
          if (!(error instanceof LifeOpsServiceError)) {
            throw error;
          }
          this.logLifeOpsWarn(
            "next_calendar_context_linked_mail",
            error.message,
            {
              provider: "google",
              mode: status.mode,
              calendarEventId: nextEvent.id,
            },
          );
          linkedMailState = "error";
          linkedMailError = error.message;
        }
      }
    }

    return buildNextCalendarEventContext(
      nextEvent,
      now,
      linkedMail,
      linkedMailState,
      linkedMailError,
    );
  }

  async createGmailReplyDraft(
    requestUrl: URL,
    request: CreateLifeOpsGmailReplyDraftRequest,
  ): Promise<LifeOpsGmailReplyDraft> {
    const mode = normalizeOptionalConnectorMode(request.mode, "mode");
    const messageId = requireNonEmptyString(request.messageId, "messageId");
    const tone = normalizeGmailDraftTone(request.tone);
    const intent = normalizeOptionalString(request.intent);
    const includeQuotedOriginal =
      normalizeOptionalBoolean(
        request.includeQuotedOriginal,
        "includeQuotedOriginal",
      ) ?? false;
    const grant = await this.requireGoogleGmailGrant(requestUrl, mode);

    let message = await this.repository.getGmailMessage(
      this.agentId(),
      "google",
      messageId,
    );
    if (!message) {
      await this.getGmailTriage(requestUrl, { mode }, new Date());
      message = await this.repository.getGmailMessage(
        this.agentId(),
        "google",
        messageId,
      );
    }
    if (!message) {
      fail(404, "life-ops Gmail message not found");
    }

    const senderName =
      normalizeOptionalString(grant.identity.name) ??
      normalizeOptionalString(grant.identity.email)?.split("@")[0] ??
      "Milady";
    const draft = buildGmailReplyDraft({
      message,
      tone,
      intent,
      includeQuotedOriginal,
      senderName,
      sendAllowed: hasGoogleGmailSendCapability(grant),
    });
    await this.recordGmailAudit(
      "gmail_reply_drafted",
      message.id,
      "gmail reply drafted",
      {
        messageId: message.id,
        tone,
        includeQuotedOriginal,
      },
      {
        sendAllowed: draft.sendAllowed,
      },
    );
    return draft;
  }

  async sendGmailReply(
    requestUrl: URL,
    request: SendLifeOpsGmailReplyRequest,
  ): Promise<{ ok: true }> {
    const mode = normalizeOptionalConnectorMode(request.mode, "mode");
    const messageId = requireNonEmptyString(request.messageId, "messageId");
    const confirmSend =
      normalizeOptionalBoolean(request.confirmSend, "confirmSend") ?? false;
    if (!confirmSend) {
      fail(409, "Gmail send requires explicit confirmation.");
    }

    const grant = await this.requireGoogleGmailSendGrant(requestUrl, mode);
    let message = await this.repository.getGmailMessage(
      this.agentId(),
      "google",
      messageId,
    );
    if (!message) {
      await this.getGmailTriage(requestUrl, { mode }, new Date());
      message = await this.repository.getGmailMessage(
        this.agentId(),
        "google",
        messageId,
      );
    }
    if (!message) {
      fail(404, "life-ops Gmail message not found");
    }

    const to =
      normalizeOptionalStringArray(request.to, "to") ??
      [message.replyTo ?? message.fromEmail ?? ""].filter(
        (value) => value.length > 0,
      );
    if (to.length === 0) {
      fail(409, "The selected Gmail message has no replyable recipient.");
    }
    const cc = normalizeOptionalStringArray(request.cc, "cc") ?? [];
    const subject = normalizeOptionalString(request.subject) ?? message.subject;
    const bodyText = normalizeGmailReplyBody(request.bodyText);
    const messageIdHeader =
      typeof message.metadata.messageIdHeader === "string"
        ? message.metadata.messageIdHeader.trim()
        : null;
    const referencesHeader =
      typeof message.metadata.referencesHeader === "string"
        ? message.metadata.referencesHeader.trim()
        : null;
    const references = [referencesHeader, messageIdHeader]
      .filter((value): value is string => Boolean(value && value.length > 0))
      .join(" ")
      .trim();

    const sendReply = async () => {
      if (resolveGoogleExecutionTarget(grant) === "cloud") {
        await this.googleManagedClient.sendGmailReply({
          to,
          cc,
          subject,
          bodyText,
          inReplyTo: messageIdHeader,
          references: references.length > 0 ? references : null,
        });
        return;
      }
      await sendGoogleGmailReply({
        accessToken: (
          await ensureFreshGoogleAccessToken(
            grant.tokenRef ??
              fail(409, "Google Gmail token reference is missing."),
          )
        ).accessToken,
        to,
        cc,
        subject,
        bodyText,
        inReplyTo: messageIdHeader,
        references: references.length > 0 ? references : null,
      });
    };
    await (resolveGoogleExecutionTarget(grant) === "cloud"
      ? this.runManagedGoogleOperation(grant, sendReply)
      : this.withGoogleGrantOperation(grant, sendReply));
    await this.recordGmailAudit(
      "gmail_reply_sent",
      message.id,
      "gmail reply sent",
      {
        messageId: message.id,
        to,
        cc,
        confirmSend,
      },
      {
        subject,
        sent: true,
      },
    );
    return { ok: true };
  }

  async completeOccurrence(
    occurrenceId: string,
    request: CompleteLifeOpsOccurrenceRequest,
    now = new Date(),
  ): Promise<LifeOpsOccurrenceView> {
    const { definition, occurrence } = await this.getFreshOccurrence(
      occurrenceId,
      now,
    );
    if (occurrence.state === "completed") {
      const current = await this.repository.getOccurrenceView(
        this.agentId(),
        occurrence.id,
      );
      if (!current) {
        fail(404, "life-ops occurrence not found");
      }
      return current;
    }
    if (["skipped", "expired", "muted"].includes(occurrence.state)) {
      fail(
        409,
        `occurrence cannot be completed from state ${occurrence.state}`,
      );
    }
    const updatedOccurrence: LifeOpsOccurrence = {
      ...occurrence,
      state: "completed",
      snoozedUntil: null,
      completionPayload: {
        completedAt: now.toISOString(),
        note: normalizeOptionalString(request.note) ?? null,
        metadata: cloneRecord(request.metadata),
        previousState: occurrence.state,
      },
      updatedAt: now.toISOString(),
    };
    await this.repository.updateOccurrence(updatedOccurrence);
    await this.recordAudit(
      "occurrence_completed",
      "occurrence",
      updatedOccurrence.id,
      "occurrence completed",
      {
        request,
      },
      {
        definitionId: updatedOccurrence.definitionId,
        occurrenceKey: updatedOccurrence.occurrenceKey,
      },
    );
    await this.refreshDefinitionOccurrences(definition, now);
    const view = await this.repository.getOccurrenceView(
      this.agentId(),
      updatedOccurrence.id,
    );
    if (!view) {
      fail(404, "life-ops occurrence not found after completion");
    }
    return view;
  }

  async skipOccurrence(
    occurrenceId: string,
    now = new Date(),
  ): Promise<LifeOpsOccurrenceView> {
    const { definition, occurrence } = await this.getFreshOccurrence(
      occurrenceId,
      now,
    );
    if (occurrence.state === "skipped") {
      const current = await this.repository.getOccurrenceView(
        this.agentId(),
        occurrence.id,
      );
      if (!current) {
        fail(404, "life-ops occurrence not found");
      }
      return current;
    }
    if (["completed", "expired", "muted"].includes(occurrence.state)) {
      fail(409, `occurrence cannot be skipped from state ${occurrence.state}`);
    }
    const updatedOccurrence: LifeOpsOccurrence = {
      ...occurrence,
      state: "skipped",
      snoozedUntil: null,
      completionPayload: {
        skippedAt: now.toISOString(),
        previousState: occurrence.state,
      },
      updatedAt: now.toISOString(),
    };
    await this.repository.updateOccurrence(updatedOccurrence);
    await this.recordAudit(
      "occurrence_skipped",
      "occurrence",
      updatedOccurrence.id,
      "occurrence skipped",
      {},
      {
        definitionId: updatedOccurrence.definitionId,
        occurrenceKey: updatedOccurrence.occurrenceKey,
      },
    );
    await this.refreshDefinitionOccurrences(definition, now);
    const view = await this.repository.getOccurrenceView(
      this.agentId(),
      updatedOccurrence.id,
    );
    if (!view) {
      fail(404, "life-ops occurrence not found after skip");
    }
    return view;
  }

  async snoozeOccurrence(
    occurrenceId: string,
    request: SnoozeLifeOpsOccurrenceRequest,
    now = new Date(),
  ): Promise<LifeOpsOccurrenceView> {
    const { occurrence, definition } = await this.getFreshOccurrence(
      occurrenceId,
      now,
    );
    if (
      ["completed", "skipped", "expired", "muted"].includes(occurrence.state)
    ) {
      fail(409, `occurrence cannot be snoozed from state ${occurrence.state}`);
    }
    const snoozedUntil = computeSnoozedUntil(definition, request, now);
    if (snoozedUntil.getTime() <= now.getTime()) {
      fail(400, "snoozedUntil must be in the future");
    }
    const updatedOccurrence: LifeOpsOccurrence = {
      ...occurrence,
      state: "snoozed",
      snoozedUntil: snoozedUntil.toISOString(),
      updatedAt: now.toISOString(),
      metadata: {
        ...occurrence.metadata,
        snoozedAt: now.toISOString(),
        snoozePreset: request.preset ?? null,
      },
    };
    await this.repository.updateOccurrence(updatedOccurrence);
    await this.recordAudit(
      "occurrence_snoozed",
      "occurrence",
      updatedOccurrence.id,
      "occurrence snoozed",
      {
        request,
      },
      {
        snoozedUntil: updatedOccurrence.snoozedUntil,
      },
    );
    const view = await this.repository.getOccurrenceView(
      this.agentId(),
      updatedOccurrence.id,
    );
    if (!view) {
      fail(404, "life-ops occurrence not found after snooze");
    }
    return view;
  }

  async getGoogleConnectorStatus(
    requestUrl: URL,
    requestedMode?: LifeOpsConnectorMode,
  ): Promise<LifeOpsGoogleConnectorStatus> {
    const explicitMode = normalizeOptionalConnectorMode(requestedMode, "mode");
    const grants = (
      await this.repository.listConnectorGrants(this.agentId())
    ).filter((candidate) => candidate.provider === "google");
    const cloudConfig = resolveManagedGoogleCloudConfig();
    const modeAvailability = resolveGoogleAvailableModes({
      requestUrl,
      cloudConfigured: cloudConfig.configured,
      grants,
    });
    const resolvedGrant = resolvePreferredGoogleGrant({
      grants,
      requestedMode: explicitMode,
      defaultMode: modeAvailability.defaultMode,
    });
    const mode =
      explicitMode ?? resolvedGrant?.mode ?? modeAvailability.defaultMode;

    if (mode === "cloud_managed") {
      if (!cloudConfig.configured && !resolvedGrant) {
        return {
          provider: "google",
          mode,
          defaultMode: modeAvailability.defaultMode,
          availableModes: modeAvailability.availableModes,
          executionTarget: "cloud",
          sourceOfTruth: "cloud_connection",
          configured: false,
          connected: false,
          reason: "config_missing",
          preferredByAgent: false,
          cloudConnectionId: null,
          identity: null,
          grantedCapabilities: [],
          grantedScopes: [],
          expiresAt: null,
          hasRefreshToken: false,
          grant: null,
        };
      }

      if (!cloudConfig.configured && resolvedGrant) {
        return {
          provider: "google",
          mode,
          defaultMode: modeAvailability.defaultMode,
          availableModes: modeAvailability.availableModes,
          executionTarget: "cloud",
          sourceOfTruth: "cloud_connection",
          configured: false,
          connected: false,
          reason: "config_missing",
          preferredByAgent: resolvedGrant.preferredByAgent,
          cloudConnectionId: resolvedGrant.cloudConnectionId,
          identity:
            Object.keys(resolvedGrant.identity).length > 0
              ? { ...resolvedGrant.identity }
              : null,
          grantedCapabilities: normalizeGrantCapabilities(
            resolvedGrant.capabilities,
          ),
          grantedScopes: [...resolvedGrant.grantedScopes],
          expiresAt:
            typeof resolvedGrant.metadata.expiresAt === "string"
              ? resolvedGrant.metadata.expiresAt
              : null,
          hasRefreshToken: Boolean(resolvedGrant.metadata.hasRefreshToken),
          grant: resolvedGrant,
        };
      }

      let managedStatus: ManagedGoogleConnectorStatusResponse;
      try {
        managedStatus = await this.googleManagedClient.getStatus();
      } catch (error) {
        if (error instanceof ManagedGoogleClientError) {
          this.logLifeOpsWarn("google_connector_status", error.message, {
            provider: "google",
            mode: "cloud_managed",
            statusCode: error.status,
          });
          fail(
            error.status,
            `Failed to resolve managed Google connection: ${error.message}`,
          );
        }
        this.logLifeOpsError("google_connector_status", error, {
          provider: "google",
          mode: "cloud_managed",
        });
        throw error;
      }

      const mirroredGrant = await this.upsertManagedGoogleGrant(managedStatus);
      const grant = mirroredGrant ?? resolvedGrant ?? null;
      return {
        provider: "google",
        mode,
        defaultMode: modeAvailability.defaultMode,
        availableModes: modeAvailability.availableModes,
        executionTarget: "cloud",
        sourceOfTruth: "cloud_connection",
        configured: managedStatus.configured,
        connected: managedStatus.connected,
        reason: managedStatus.reason,
        preferredByAgent: grant?.preferredByAgent ?? false,
        cloudConnectionId: managedStatus.connectionId,
        identity: managedStatus.identity,
        grantedCapabilities: [...managedStatus.grantedCapabilities],
        grantedScopes: [...managedStatus.grantedScopes],
        expiresAt: managedStatus.expiresAt,
        hasRefreshToken: managedStatus.hasRefreshToken,
        grant,
      };
    }

    const config = resolveGoogleOAuthConfig(requestUrl, mode);
    const grant =
      resolvedGrant && resolvedGrant.mode === mode
        ? resolvedGrant
        : await this.repository.getConnectorGrant(
            this.agentId(),
            "google",
            mode,
          );

    if (!grant) {
      return {
        provider: "google",
        mode,
        defaultMode: modeAvailability.defaultMode,
        availableModes: modeAvailability.availableModes,
        executionTarget: "local",
        sourceOfTruth: "local_storage",
        configured: config.configured,
        connected: false,
        reason: config.configured ? "disconnected" : "config_missing",
        preferredByAgent: false,
        cloudConnectionId: null,
        identity: null,
        grantedCapabilities: [],
        grantedScopes: [],
        expiresAt: null,
        hasRefreshToken: false,
        grant: null,
      };
    }

    const token = grant.tokenRef ? readStoredGoogleToken(grant.tokenRef) : null;
    if (!token) {
      return {
        provider: "google",
        mode: grant.mode,
        defaultMode: modeAvailability.defaultMode,
        availableModes: modeAvailability.availableModes,
        executionTarget: resolveGoogleExecutionTarget(grant),
        sourceOfTruth: resolveGoogleSourceOfTruth(grant),
        configured: config.configured,
        connected: false,
        reason: "token_missing",
        preferredByAgent: grant.preferredByAgent,
        cloudConnectionId: grant.cloudConnectionId,
        identity:
          Object.keys(grant.identity).length > 0 ? { ...grant.identity } : null,
        grantedCapabilities: normalizeGrantCapabilities(grant.capabilities),
        grantedScopes: [...grant.grantedScopes],
        expiresAt: null,
        hasRefreshToken: false,
        grant,
      };
    }

    const refreshTokenValid =
      Boolean(token.refreshToken) &&
      (token.refreshTokenExpiresAt === null ||
        token.refreshTokenExpiresAt > Date.now());
    const accessTokenExpired = token.expiresAt <= Date.now();
    const forcedNeedsReauth = grant.metadata.authState === "needs_reauth";
    const connected =
      !forcedNeedsReauth && (!accessTokenExpired || refreshTokenValid);

    return {
      provider: "google",
      mode: grant.mode,
      defaultMode: modeAvailability.defaultMode,
      availableModes: modeAvailability.availableModes,
      executionTarget: resolveGoogleExecutionTarget(grant),
      sourceOfTruth: resolveGoogleSourceOfTruth(grant),
      configured: config.configured,
      connected,
      reason: connected ? "connected" : "needs_reauth",
      preferredByAgent: grant.preferredByAgent,
      cloudConnectionId: grant.cloudConnectionId,
      identity:
        Object.keys(grant.identity).length > 0 ? { ...grant.identity } : null,
      grantedCapabilities: normalizeGrantCapabilities(grant.capabilities),
      grantedScopes: [...grant.grantedScopes],
      expiresAt: Number.isFinite(token.expiresAt)
        ? new Date(token.expiresAt).toISOString()
        : null,
      hasRefreshToken: refreshTokenValid,
      grant,
    };
  }

  async startGoogleConnector(
    request: StartLifeOpsGoogleConnectorRequest,
    requestUrl: URL,
  ): Promise<StartLifeOpsGoogleConnectorResponse> {
    const requestedMode = normalizeOptionalConnectorMode(request.mode, "mode");
    const requestedCapabilities = normalizeGoogleCapabilityRequest(
      request.capabilities,
    );
    const cloudConfig = resolveManagedGoogleCloudConfig();
    const modeAvailability = resolveGoogleAvailableModes({
      requestUrl,
      cloudConfigured: cloudConfig.configured,
    });
    const mode = requestedMode ?? modeAvailability.defaultMode;
    if (mode === "cloud_managed") {
      try {
        return await this.googleManagedClient.startConnector({
          capabilities: requestedCapabilities,
        });
      } catch (error) {
        if (error instanceof ManagedGoogleClientError) {
          this.logLifeOpsWarn("google_connector_start", error.message, {
            statusCode: error.status,
            mode,
          });
          fail(error.status, error.message);
        }
        this.logLifeOpsError("google_connector_start", error, { mode });
        throw error;
      }
    }

    const resolvedConfig = resolveGoogleOAuthConfig(requestUrl, mode);
    const existingGrant = await this.repository.getConnectorGrant(
      this.agentId(),
      "google",
      resolvedConfig.mode,
    );

    try {
      return startGoogleConnectorOAuth({
        agentId: this.agentId(),
        requestUrl,
        mode: resolvedConfig.mode,
        requestedCapabilities,
        existingCapabilities: existingGrant
          ? normalizeGrantCapabilities(existingGrant.capabilities)
          : undefined,
      });
    } catch (error) {
      if (error instanceof GoogleOAuthError) {
        this.logLifeOpsWarn("google_connector_start", error.message, {
          statusCode: error.status,
          mode: resolvedConfig.mode,
        });
        fail(error.status, error.message);
      }
      this.logLifeOpsError("google_connector_start", error, {
        mode: resolvedConfig.mode,
      });
      throw error;
    }
  }

  async completeGoogleConnectorCallback(
    callbackUrl: URL,
  ): Promise<LifeOpsGoogleConnectorStatus> {
    let result: GoogleConnectorCallbackResult;
    try {
      result = await completeGoogleConnectorOAuth({
        callbackUrl,
      });
    } catch (error) {
      if (error instanceof GoogleOAuthError) {
        this.logLifeOpsWarn("google_connector_callback", error.message, {
          statusCode: error.status,
        });
        fail(error.status, error.message);
      }
      this.logLifeOpsError("google_connector_callback", error);
      throw error;
    }

    if (result.agentId !== this.agentId()) {
      fail(409, "Google callback does not belong to the active agent.");
    }

    const existingGrant = await this.repository.getConnectorGrant(
      this.agentId(),
      "google",
      result.mode,
    );
    const nowIso = new Date().toISOString();
    const clearedMetadata = clearGoogleGrantAuthFailureMetadata(
      existingGrant?.metadata ?? {},
    );
    const grant: LifeOpsConnectorGrant = existingGrant
      ? {
          ...existingGrant,
          identity: { ...result.identity },
          grantedScopes: [...result.grantedScopes],
          capabilities: [...result.grantedCapabilities],
          tokenRef: result.tokenRef,
          executionTarget: "local",
          sourceOfTruth: "local_storage",
          cloudConnectionId: null,
          metadata: {
            ...clearedMetadata,
            expiresAt: result.expiresAt,
            hasRefreshToken: result.hasRefreshToken,
          },
          lastRefreshAt: nowIso,
          updatedAt: nowIso,
        }
      : createLifeOpsConnectorGrant({
          agentId: this.agentId(),
          provider: "google",
          identity: { ...result.identity },
          grantedScopes: [...result.grantedScopes],
          capabilities: [...result.grantedCapabilities],
          tokenRef: result.tokenRef,
          mode: result.mode,
          executionTarget: "local",
          sourceOfTruth: "local_storage",
          preferredByAgent: true,
          cloudConnectionId: null,
          metadata: {
            expiresAt: result.expiresAt,
            hasRefreshToken: result.hasRefreshToken,
          },
          lastRefreshAt: nowIso,
        });

    await this.repository.upsertConnectorGrant(grant);
    await this.setPreferredGoogleConnectorMode(result.mode);
    await this.recordConnectorAudit(
      `google:${result.mode}`,
      "google connector granted",
      {
        mode: result.mode,
        capabilities: result.grantedCapabilities,
      },
      {
        tokenRef: result.tokenRef,
        expiresAt: result.expiresAt,
      },
    );
    return this.getGoogleConnectorStatus(callbackUrl, result.mode);
  }

  async disconnectGoogleConnector(
    request: DisconnectLifeOpsGoogleConnectorRequest,
    requestUrl: URL,
  ): Promise<LifeOpsGoogleConnectorStatus> {
    const requestedMode = normalizeOptionalConnectorMode(request.mode, "mode");
    const grants = (
      await this.repository.listConnectorGrants(this.agentId())
    ).filter((grant) => grant.provider === "google");
    const modeAvailability = resolveGoogleAvailableModes({
      requestUrl,
      cloudConfigured: resolveManagedGoogleCloudConfig().configured,
      grants,
    });
    const mode =
      requestedMode ??
      resolvePreferredGoogleGrant({
        grants,
        requestedMode,
        defaultMode: modeAvailability.defaultMode,
      })?.mode ??
      modeAvailability.defaultMode;
    const grant = await this.repository.getConnectorGrant(
      this.agentId(),
      "google",
      mode,
    );

    if (!grant) {
      return this.getGoogleConnectorStatus(requestUrl, mode);
    }

    if (mode === "cloud_managed" && grant.cloudConnectionId) {
      try {
        await this.googleManagedClient.disconnectConnector(
          grant.cloudConnectionId,
        );
      } catch (error) {
        if (error instanceof ManagedGoogleClientError) {
          this.logLifeOpsWarn("google_connector_disconnect", error.message, {
            statusCode: error.status,
            mode,
          });
          fail(error.status, error.message);
        }
        this.logLifeOpsError("google_connector_disconnect", error, { mode });
        throw error;
      }
    } else if (grant.tokenRef) {
      deleteStoredGoogleToken(grant.tokenRef);
    }
    const calendarEvents = await this.repository.listCalendarEvents(
      this.agentId(),
      "google",
    );
    await this.deleteCalendarReminderPlansForEvents(
      calendarEvents.map((event) => event.id),
    );
    await this.repository.deleteCalendarEventsForProvider(
      this.agentId(),
      "google",
    );
    await this.repository.deleteCalendarSyncState(this.agentId(), "google");
    await this.repository.deleteGmailMessagesForProvider(
      this.agentId(),
      "google",
    );
    await this.repository.deleteGmailSyncState(this.agentId(), "google");
    await this.repository.deleteConnectorGrant(this.agentId(), "google", mode);
    await this.setPreferredGoogleConnectorMode(null);
    await this.recordConnectorAudit(
      `google:${mode}`,
      "google connector disconnected",
      {
        mode,
      },
      {
        disconnected: true,
      },
    );
    return this.getGoogleConnectorStatus(requestUrl, mode);
  }
}

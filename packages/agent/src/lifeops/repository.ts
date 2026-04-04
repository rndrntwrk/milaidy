import crypto from "node:crypto";
import type { IAgentRuntime } from "@elizaos/core";
import type {
  LifeOpsAuditEvent,
  LifeOpsCalendarEvent,
  LifeOpsChannelPolicy,
  LifeOpsConnectorGrant,
  LifeOpsGmailMessageSummary,
  LifeOpsGoalDefinition,
  LifeOpsGoalLink,
  LifeOpsOccurrence,
  LifeOpsOccurrenceView,
  LifeOpsReminderAttempt,
  LifeOpsReminderPlan,
  LifeOpsTaskDefinition,
  LifeOpsWorkflowDefinition,
  LifeOpsWorkflowRun,
} from "@miladyai/shared/contracts/lifeops";
import {
  asObject,
  executeRawSql,
  parseJsonArray,
  parseJsonRecord,
  sqlBoolean,
  sqlInteger,
  sqlJson,
  sqlNumber,
  sqlQuote,
  sqlText,
  toBoolean,
  toNumber,
  toText,
} from "./sql.js";

const schemaReady = new WeakSet<object>();

function isoNow(): string {
  return new Date().toISOString();
}

function parseTaskDefinition(row: Record<string, unknown>): LifeOpsTaskDefinition {
  return {
    id: toText(row.id),
    agentId: toText(row.agent_id),
    kind: toText(row.kind) as LifeOpsTaskDefinition["kind"],
    title: toText(row.title),
    description: toText(row.description),
    originalIntent: toText(row.original_intent),
    timezone: toText(row.timezone),
    status: toText(row.status) as LifeOpsTaskDefinition["status"],
    priority: toNumber(row.priority, 3),
    cadence: parseJsonRecord(
      row.cadence_json,
    ) as unknown as LifeOpsTaskDefinition["cadence"],
    windowPolicy: parseJsonRecord(
      row.window_policy_json,
    ) as unknown as LifeOpsTaskDefinition["windowPolicy"],
    progressionRule: parseJsonRecord(
      row.progression_rule_json,
    ) as unknown as LifeOpsTaskDefinition["progressionRule"],
    reminderPlanId: row.reminder_plan_id ? toText(row.reminder_plan_id) : null,
    goalId: row.goal_id ? toText(row.goal_id) : null,
    source: toText(row.source),
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
  };
}

function parseOccurrence(row: Record<string, unknown>): LifeOpsOccurrence {
  return {
    id: toText(row.id),
    agentId: toText(row.agent_id),
    definitionId: toText(row.definition_id),
    occurrenceKey: toText(row.occurrence_key),
    scheduledAt: row.scheduled_at ? toText(row.scheduled_at) : null,
    dueAt: row.due_at ? toText(row.due_at) : null,
    relevanceStartAt: toText(row.relevance_start_at),
    relevanceEndAt: toText(row.relevance_end_at),
    windowName: row.window_name ? toText(row.window_name) : null,
    state: toText(row.state) as LifeOpsOccurrence["state"],
    snoozedUntil: row.snoozed_until ? toText(row.snoozed_until) : null,
    completionPayload: row.completion_payload_json
      ? parseJsonRecord(row.completion_payload_json)
      : null,
    derivedTarget: row.derived_target_json
      ? parseJsonRecord(row.derived_target_json)
      : null,
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
  };
}

function parseOccurrenceView(row: Record<string, unknown>): LifeOpsOccurrenceView {
  return {
    ...parseOccurrence(row),
    definitionKind: toText(row.definition_kind) as LifeOpsOccurrenceView["definitionKind"],
    definitionStatus: toText(
      row.definition_status,
    ) as LifeOpsOccurrenceView["definitionStatus"],
    title: toText(row.definition_title),
    description: toText(row.definition_description),
    priority: toNumber(row.definition_priority, 3),
    timezone: toText(row.definition_timezone),
    source: toText(row.definition_source, "manual"),
    goalId: row.definition_goal_id ? toText(row.definition_goal_id) : null,
  };
}

function parseGoal(row: Record<string, unknown>): LifeOpsGoalDefinition {
  return {
    id: toText(row.id),
    agentId: toText(row.agent_id),
    title: toText(row.title),
    description: toText(row.description),
    cadence: row.cadence_json ? parseJsonRecord(row.cadence_json) : null,
    supportStrategy: parseJsonRecord(row.support_strategy_json),
    successCriteria: parseJsonRecord(row.success_criteria_json),
    status: toText(row.status) as LifeOpsGoalDefinition["status"],
    reviewState: toText(row.review_state) as LifeOpsGoalDefinition["reviewState"],
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
  };
}

function parseGoalLink(row: Record<string, unknown>): LifeOpsGoalLink {
  return {
    id: toText(row.id),
    agentId: toText(row.agent_id),
    goalId: toText(row.goal_id),
    linkedType: toText(row.linked_type) as LifeOpsGoalLink["linkedType"],
    linkedId: toText(row.linked_id),
    createdAt: toText(row.created_at),
  };
}

function parseReminderPlan(row: Record<string, unknown>): LifeOpsReminderPlan {
  return {
    id: toText(row.id),
    agentId: toText(row.agent_id),
    ownerType: toText(row.owner_type) as LifeOpsReminderPlan["ownerType"],
    ownerId: toText(row.owner_id),
    steps: parseJsonArray(row.steps_json),
    mutePolicy: parseJsonRecord(row.mute_policy_json),
    quietHours: parseJsonRecord(row.quiet_hours_json),
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
  };
}

function parseChannelPolicy(row: Record<string, unknown>): LifeOpsChannelPolicy {
  return {
    id: toText(row.id),
    agentId: toText(row.agent_id),
    channelType: toText(row.channel_type) as LifeOpsChannelPolicy["channelType"],
    channelRef: toText(row.channel_ref),
    privacyClass: toText(row.privacy_class) as LifeOpsChannelPolicy["privacyClass"],
    allowReminders: toBoolean(row.allow_reminders),
    allowEscalation: toBoolean(row.allow_escalation),
    allowPosts: toBoolean(row.allow_posts),
    requireConfirmationForActions: toBoolean(
      row.require_confirmation_for_actions,
    ),
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
  };
}

function parseConnectorGrant(row: Record<string, unknown>): LifeOpsConnectorGrant {
  return {
    id: toText(row.id),
    agentId: toText(row.agent_id),
    provider: toText(row.provider) as LifeOpsConnectorGrant["provider"],
    identity: parseJsonRecord(row.identity_json),
    grantedScopes: parseJsonArray(row.granted_scopes_json),
    capabilities: parseJsonArray(row.capabilities_json),
    tokenRef: row.token_ref ? toText(row.token_ref) : null,
    mode: toText(row.mode) as LifeOpsConnectorGrant["mode"],
    metadata: parseJsonRecord(row.metadata_json),
    lastRefreshAt: row.last_refresh_at ? toText(row.last_refresh_at) : null,
    createdAt: toText(row.created_at),
    updatedAt: toText(row.updated_at),
  };
}

function parseAuditEvent(row: Record<string, unknown>): LifeOpsAuditEvent {
  return {
    id: toText(row.id),
    agentId: toText(row.agent_id),
    eventType: toText(row.event_type) as LifeOpsAuditEvent["eventType"],
    ownerType: toText(row.owner_type) as LifeOpsAuditEvent["ownerType"],
    ownerId: toText(row.owner_id),
    reason: toText(row.reason),
    inputs: parseJsonRecord(row.inputs_json),
    decision: parseJsonRecord(row.decision_json),
    actor: toText(row.actor) as LifeOpsAuditEvent["actor"],
    createdAt: toText(row.created_at),
  };
}

function parseCalendarEvent(row: Record<string, unknown>): LifeOpsCalendarEvent {
  return {
    id: toText(row.id),
    externalId: toText(row.external_event_id),
    agentId: toText(row.agent_id),
    provider: "google",
    calendarId: toText(row.calendar_id),
    title: toText(row.title),
    description: toText(row.description),
    location: toText(row.location),
    status: toText(row.status),
    startAt: toText(row.start_at),
    endAt: toText(row.end_at),
    isAllDay: toBoolean(row.is_all_day),
    timezone: row.timezone ? toText(row.timezone) : null,
    htmlLink: row.html_link ? toText(row.html_link) : null,
    conferenceLink: row.conference_link ? toText(row.conference_link) : null,
    organizer: row.organizer_json ? parseJsonRecord(row.organizer_json) : null,
    attendees: parseJsonArray(
      row.attendees_json,
    ) as unknown as LifeOpsCalendarEvent["attendees"],
    metadata: parseJsonRecord(row.metadata_json),
    syncedAt: toText(row.synced_at),
    updatedAt: toText(row.updated_at),
  };
}

function parseGmailMessageSummary(
  row: Record<string, unknown>,
): LifeOpsGmailMessageSummary {
  return {
    id: toText(row.id),
    externalId: toText(row.external_message_id),
    agentId: toText(row.agent_id),
    provider: "google",
    threadId: toText(row.thread_id),
    subject: toText(row.subject),
    from: toText(row.from_display),
    fromEmail: row.from_email ? toText(row.from_email) : null,
    replyTo: row.reply_to ? toText(row.reply_to) : null,
    to: parseJsonArray(row.to_json),
    cc: parseJsonArray(row.cc_json),
    snippet: toText(row.snippet),
    receivedAt: toText(row.received_at),
    isUnread: toBoolean(row.is_unread),
    isImportant: toBoolean(row.is_important),
    likelyReplyNeeded: toBoolean(row.likely_reply_needed),
    triageScore: toNumber(row.triage_score),
    triageReason: toText(row.triage_reason),
    labels: parseJsonArray(row.label_ids_json),
    htmlLink: row.html_link ? toText(row.html_link) : null,
    metadata: parseJsonRecord(row.metadata_json),
    syncedAt: toText(row.synced_at),
    updatedAt: toText(row.updated_at),
  };
}

interface LifeOpsCalendarSyncState {
  id: string;
  agentId: string;
  provider: LifeOpsConnectorGrant["provider"];
  calendarId: string;
  windowStartAt: string;
  windowEndAt: string;
  syncedAt: string;
  updatedAt: string;
}

function parseCalendarSyncState(
  row: Record<string, unknown>,
): LifeOpsCalendarSyncState {
  return {
    id: toText(row.id),
    agentId: toText(row.agent_id),
    provider: toText(row.provider) as LifeOpsConnectorGrant["provider"],
    calendarId: toText(row.calendar_id),
    windowStartAt: toText(row.window_start_at),
    windowEndAt: toText(row.window_end_at),
    syncedAt: toText(row.synced_at),
    updatedAt: toText(row.updated_at),
  };
}

interface LifeOpsGmailSyncState {
  id: string;
  agentId: string;
  provider: LifeOpsConnectorGrant["provider"];
  mailbox: string;
  maxResults: number;
  syncedAt: string;
  updatedAt: string;
}

function parseGmailSyncState(
  row: Record<string, unknown>,
): LifeOpsGmailSyncState {
  return {
    id: toText(row.id),
    agentId: toText(row.agent_id),
    provider: toText(row.provider) as LifeOpsConnectorGrant["provider"],
    mailbox: toText(row.mailbox),
    maxResults: toNumber(row.max_results, 0),
    syncedAt: toText(row.synced_at),
    updatedAt: toText(row.updated_at),
  };
}

export async function ensureLifeOpsTables(runtime: IAgentRuntime): Promise<void> {
  const key = runtime as unknown as object;
  if (schemaReady.has(key)) return;

  const statements = [
    `CREATE TABLE IF NOT EXISTS life_task_definitions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      original_intent TEXT NOT NULL DEFAULT '',
      timezone TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 3,
      cadence_json TEXT NOT NULL,
      window_policy_json TEXT NOT NULL,
      progression_rule_json TEXT NOT NULL,
      reminder_plan_id TEXT,
      goal_id TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS life_task_occurrences (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      definition_id TEXT NOT NULL,
      occurrence_key TEXT NOT NULL,
      scheduled_at TEXT,
      due_at TEXT,
      relevance_start_at TEXT NOT NULL,
      relevance_end_at TEXT NOT NULL,
      window_name TEXT,
      state TEXT NOT NULL,
      snoozed_until TEXT,
      completion_payload_json TEXT,
      derived_target_json TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, definition_id, occurrence_key)
    )`,
    `CREATE TABLE IF NOT EXISTS life_goal_definitions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cadence_json TEXT,
      support_strategy_json TEXT NOT NULL DEFAULT '{}',
      success_criteria_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      review_state TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS life_goal_links (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      goal_id TEXT NOT NULL,
      linked_type TEXT NOT NULL,
      linked_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(agent_id, goal_id, linked_type, linked_id)
    )`,
    `CREATE TABLE IF NOT EXISTS life_workflow_definitions (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      schedule_json TEXT NOT NULL,
      action_plan_json TEXT NOT NULL,
      permission_policy_json TEXT NOT NULL,
      status TEXT NOT NULL,
      created_by TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS life_workflow_runs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      workflow_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      result_json TEXT NOT NULL DEFAULT '{}',
      audit_ref TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS life_reminder_plans (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      steps_json TEXT NOT NULL,
      mute_policy_json TEXT NOT NULL DEFAULT '{}',
      quiet_hours_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS life_reminder_attempts (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      plan_id TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      occurrence_id TEXT,
      channel TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      scheduled_for TEXT NOT NULL,
      attempted_at TEXT,
      outcome TEXT NOT NULL,
      connector_ref TEXT,
      delivery_metadata_json TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE TABLE IF NOT EXISTS life_connector_grants (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      identity_json TEXT NOT NULL DEFAULT '{}',
      granted_scopes_json TEXT NOT NULL DEFAULT '[]',
      capabilities_json TEXT NOT NULL DEFAULT '[]',
      token_ref TEXT,
      mode TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      last_refresh_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, provider, mode)
    )`,
    `CREATE TABLE IF NOT EXISTS life_calendar_events (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      calendar_id TEXT NOT NULL,
      external_event_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      is_all_day BOOLEAN NOT NULL,
      timezone TEXT,
      html_link TEXT,
      conference_link TEXT,
      organizer_json TEXT,
      attendees_json TEXT NOT NULL DEFAULT '[]',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      synced_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, provider, calendar_id, external_event_id)
    )`,
    `CREATE TABLE IF NOT EXISTS life_calendar_sync_states (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      calendar_id TEXT NOT NULL,
      window_start_at TEXT NOT NULL,
      window_end_at TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, provider, calendar_id)
    )`,
    `CREATE TABLE IF NOT EXISTS life_gmail_messages (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      external_message_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      from_display TEXT NOT NULL DEFAULT '',
      from_email TEXT,
      reply_to TEXT,
      to_json TEXT NOT NULL DEFAULT '[]',
      cc_json TEXT NOT NULL DEFAULT '[]',
      snippet TEXT NOT NULL DEFAULT '',
      received_at TEXT NOT NULL,
      is_unread BOOLEAN NOT NULL DEFAULT FALSE,
      is_important BOOLEAN NOT NULL DEFAULT FALSE,
      likely_reply_needed BOOLEAN NOT NULL DEFAULT FALSE,
      triage_score INTEGER NOT NULL DEFAULT 0,
      triage_reason TEXT NOT NULL DEFAULT '',
      label_ids_json TEXT NOT NULL DEFAULT '[]',
      html_link TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      synced_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, provider, external_message_id)
    )`,
    `CREATE TABLE IF NOT EXISTS life_gmail_sync_states (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      mailbox TEXT NOT NULL,
      max_results INTEGER NOT NULL DEFAULT 0,
      synced_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, provider, mailbox)
    )`,
    `CREATE TABLE IF NOT EXISTS life_channel_policies (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      channel_ref TEXT NOT NULL,
      privacy_class TEXT NOT NULL,
      allow_reminders BOOLEAN NOT NULL,
      allow_escalation BOOLEAN NOT NULL,
      allow_posts BOOLEAN NOT NULL,
      require_confirmation_for_actions BOOLEAN NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, channel_type, channel_ref)
    )`,
    `CREATE TABLE IF NOT EXISTS life_audit_events (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      owner_type TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      inputs_json TEXT NOT NULL DEFAULT '{}',
      decision_json TEXT NOT NULL DEFAULT '{}',
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_life_task_definitions_agent_status
      ON life_task_definitions(agent_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_life_task_occurrences_agent_state_start
      ON life_task_occurrences(agent_id, state, relevance_start_at)`,
    `CREATE INDEX IF NOT EXISTS idx_life_task_occurrences_definition
      ON life_task_occurrences(definition_id, relevance_start_at)`,
    `CREATE INDEX IF NOT EXISTS idx_life_goal_definitions_agent_status
      ON life_goal_definitions(agent_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_life_reminder_plans_owner
      ON life_reminder_plans(agent_id, owner_type, owner_id)`,
    `CREATE INDEX IF NOT EXISTS idx_life_audit_events_owner
      ON life_audit_events(agent_id, owner_type, owner_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_life_calendar_events_window
      ON life_calendar_events(agent_id, provider, start_at, end_at)`,
    `CREATE INDEX IF NOT EXISTS idx_life_calendar_sync_states_agent
      ON life_calendar_sync_states(agent_id, provider, calendar_id)`,
    `CREATE INDEX IF NOT EXISTS idx_life_gmail_messages_priority
      ON life_gmail_messages(agent_id, provider, triage_score, received_at)`,
    `CREATE INDEX IF NOT EXISTS idx_life_gmail_sync_states_agent
      ON life_gmail_sync_states(agent_id, provider, mailbox)`,
  ];

  for (const statement of statements) {
    await executeRawSql(runtime, statement);
  }

  schemaReady.add(key);
}

export class LifeOpsRepository {
  constructor(private readonly runtime: IAgentRuntime) {}

  async ensureReady(): Promise<void> {
    await ensureLifeOpsTables(this.runtime);
  }

  async createDefinition(definition: LifeOpsTaskDefinition): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_task_definitions (
        id, agent_id, kind, title, description, original_intent, timezone,
        status, priority, cadence_json, window_policy_json,
        progression_rule_json, reminder_plan_id, goal_id, source,
        metadata_json, created_at, updated_at
      ) VALUES (
        ${sqlQuote(definition.id)},
        ${sqlQuote(definition.agentId)},
        ${sqlQuote(definition.kind)},
        ${sqlQuote(definition.title)},
        ${sqlQuote(definition.description)},
        ${sqlQuote(definition.originalIntent)},
        ${sqlQuote(definition.timezone)},
        ${sqlQuote(definition.status)},
        ${sqlInteger(definition.priority)},
        ${sqlJson(definition.cadence)},
        ${sqlJson(definition.windowPolicy)},
        ${sqlJson(definition.progressionRule)},
        ${sqlText(definition.reminderPlanId)},
        ${sqlText(definition.goalId)},
        ${sqlQuote(definition.source)},
        ${sqlJson(definition.metadata)},
        ${sqlQuote(definition.createdAt)},
        ${sqlQuote(definition.updatedAt)}
      )`,
    );
  }

  async updateDefinition(definition: LifeOpsTaskDefinition): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `UPDATE life_task_definitions
         SET title = ${sqlQuote(definition.title)},
             description = ${sqlQuote(definition.description)},
             original_intent = ${sqlQuote(definition.originalIntent)},
             timezone = ${sqlQuote(definition.timezone)},
             status = ${sqlQuote(definition.status)},
             priority = ${sqlInteger(definition.priority)},
             cadence_json = ${sqlJson(definition.cadence)},
             window_policy_json = ${sqlJson(definition.windowPolicy)},
             progression_rule_json = ${sqlJson(definition.progressionRule)},
             reminder_plan_id = ${sqlText(definition.reminderPlanId)},
             goal_id = ${sqlText(definition.goalId)},
             source = ${sqlQuote(definition.source)},
             metadata_json = ${sqlJson(definition.metadata)},
             updated_at = ${sqlQuote(definition.updatedAt)}
       WHERE id = ${sqlQuote(definition.id)}
         AND agent_id = ${sqlQuote(definition.agentId)}`,
    );
  }

  async getDefinition(agentId: string, definitionId: string): Promise<LifeOpsTaskDefinition | null> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_task_definitions
        WHERE agent_id = ${sqlQuote(agentId)}
          AND id = ${sqlQuote(definitionId)}
        LIMIT 1`,
    );
    const row = rows[0];
    return row ? parseTaskDefinition(row) : null;
  }

  async listDefinitions(agentId: string): Promise<LifeOpsTaskDefinition[]> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_task_definitions
        WHERE agent_id = ${sqlQuote(agentId)}
        ORDER BY created_at ASC`,
    );
    return rows.map(parseTaskDefinition);
  }

  async listActiveDefinitions(agentId: string): Promise<LifeOpsTaskDefinition[]> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_task_definitions
        WHERE agent_id = ${sqlQuote(agentId)}
          AND status = 'active'
        ORDER BY created_at ASC`,
    );
    return rows.map(parseTaskDefinition);
  }

  async upsertOccurrence(occurrence: LifeOpsOccurrence): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_task_occurrences (
        id, agent_id, definition_id, occurrence_key, scheduled_at, due_at,
        relevance_start_at, relevance_end_at, window_name, state,
        snoozed_until, completion_payload_json, derived_target_json,
        metadata_json, created_at, updated_at
      ) VALUES (
        ${sqlQuote(occurrence.id)},
        ${sqlQuote(occurrence.agentId)},
        ${sqlQuote(occurrence.definitionId)},
        ${sqlQuote(occurrence.occurrenceKey)},
        ${sqlText(occurrence.scheduledAt)},
        ${sqlText(occurrence.dueAt)},
        ${sqlQuote(occurrence.relevanceStartAt)},
        ${sqlQuote(occurrence.relevanceEndAt)},
        ${sqlText(occurrence.windowName)},
        ${sqlQuote(occurrence.state)},
        ${sqlText(occurrence.snoozedUntil)},
        ${sqlText(
          occurrence.completionPayload
            ? JSON.stringify(occurrence.completionPayload)
            : null,
        )},
        ${sqlText(
          occurrence.derivedTarget ? JSON.stringify(occurrence.derivedTarget) : null,
        )},
        ${sqlJson(occurrence.metadata)},
        ${sqlQuote(occurrence.createdAt)},
        ${sqlQuote(occurrence.updatedAt)}
      )
      ON CONFLICT(agent_id, definition_id, occurrence_key) DO UPDATE SET
        scheduled_at = excluded.scheduled_at,
        due_at = excluded.due_at,
        relevance_start_at = excluded.relevance_start_at,
        relevance_end_at = excluded.relevance_end_at,
        window_name = excluded.window_name,
        state = excluded.state,
        snoozed_until = excluded.snoozed_until,
        completion_payload_json = excluded.completion_payload_json,
        derived_target_json = excluded.derived_target_json,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at`,
    );
  }

  async listOccurrencesForDefinition(
    agentId: string,
    definitionId: string,
  ): Promise<LifeOpsOccurrence[]> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_task_occurrences
        WHERE agent_id = ${sqlQuote(agentId)}
          AND definition_id = ${sqlQuote(definitionId)}
        ORDER BY relevance_start_at ASC`,
    );
    return rows.map(parseOccurrence);
  }

  async getOccurrence(
    agentId: string,
    occurrenceId: string,
  ): Promise<LifeOpsOccurrence | null> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_task_occurrences
        WHERE agent_id = ${sqlQuote(agentId)}
          AND id = ${sqlQuote(occurrenceId)}
        LIMIT 1`,
    );
    const row = rows[0];
    return row ? parseOccurrence(row) : null;
  }

  async getOccurrenceView(
    agentId: string,
    occurrenceId: string,
  ): Promise<LifeOpsOccurrenceView | null> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT occurrence.*,
              definition.kind AS definition_kind,
              definition.status AS definition_status,
              definition.title AS definition_title,
              definition.description AS definition_description,
              definition.priority AS definition_priority,
              definition.timezone AS definition_timezone,
              definition.source AS definition_source,
              definition.goal_id AS definition_goal_id
         FROM life_task_occurrences AS occurrence
         JOIN life_task_definitions AS definition
           ON definition.id = occurrence.definition_id
          AND definition.agent_id = occurrence.agent_id
        WHERE occurrence.agent_id = ${sqlQuote(agentId)}
          AND occurrence.id = ${sqlQuote(occurrenceId)}
        LIMIT 1`,
    );
    const row = rows[0];
    return row ? parseOccurrenceView(row) : null;
  }

  async listOccurrenceViewsForOverview(
    agentId: string,
    horizonIso: string,
  ): Promise<LifeOpsOccurrenceView[]> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT occurrence.*,
              definition.kind AS definition_kind,
              definition.status AS definition_status,
              definition.title AS definition_title,
              definition.description AS definition_description,
              definition.priority AS definition_priority,
              definition.timezone AS definition_timezone,
              definition.source AS definition_source,
              definition.goal_id AS definition_goal_id
         FROM life_task_occurrences AS occurrence
         JOIN life_task_definitions AS definition
           ON definition.id = occurrence.definition_id
          AND definition.agent_id = occurrence.agent_id
        WHERE occurrence.agent_id = ${sqlQuote(agentId)}
          AND definition.status = 'active'
          AND (
            occurrence.state IN ('visible', 'snoozed')
            OR (
              occurrence.state = 'pending'
              AND occurrence.relevance_start_at <= ${sqlQuote(horizonIso)}
            )
          )
        ORDER BY occurrence.relevance_start_at ASC, definition.priority ASC`,
    );
    return rows.map(parseOccurrenceView);
  }

  async updateOccurrence(occurrence: LifeOpsOccurrence): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `UPDATE life_task_occurrences
          SET scheduled_at = ${sqlText(occurrence.scheduledAt)},
              due_at = ${sqlText(occurrence.dueAt)},
              relevance_start_at = ${sqlQuote(occurrence.relevanceStartAt)},
              relevance_end_at = ${sqlQuote(occurrence.relevanceEndAt)},
              window_name = ${sqlText(occurrence.windowName)},
              state = ${sqlQuote(occurrence.state)},
              snoozed_until = ${sqlText(occurrence.snoozedUntil)},
              completion_payload_json = ${sqlText(
                occurrence.completionPayload
                  ? JSON.stringify(occurrence.completionPayload)
                  : null,
              )},
              derived_target_json = ${sqlText(
                occurrence.derivedTarget ? JSON.stringify(occurrence.derivedTarget) : null,
              )},
              metadata_json = ${sqlJson(occurrence.metadata)},
              updated_at = ${sqlQuote(occurrence.updatedAt)}
        WHERE id = ${sqlQuote(occurrence.id)}
          AND agent_id = ${sqlQuote(occurrence.agentId)}`,
    );
  }

  async pruneNonTerminalOccurrences(
    agentId: string,
    definitionId: string,
    keepOccurrenceKeys: string[],
  ): Promise<void> {
    await this.ensureReady();
    const keepClause =
      keepOccurrenceKeys.length > 0
        ? `AND occurrence_key NOT IN (${keepOccurrenceKeys
            .map((occurrenceKey) => sqlQuote(occurrenceKey))
            .join(", ")})`
        : "";
    await executeRawSql(
      this.runtime,
      `DELETE FROM life_task_occurrences
        WHERE agent_id = ${sqlQuote(agentId)}
          AND definition_id = ${sqlQuote(definitionId)}
          AND state IN ('pending', 'visible', 'snoozed', 'expired')
          ${keepClause}`,
    );
  }

  async createGoal(goal: LifeOpsGoalDefinition): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_goal_definitions (
        id, agent_id, title, description, cadence_json, support_strategy_json,
        success_criteria_json, status, review_state, metadata_json,
        created_at, updated_at
      ) VALUES (
        ${sqlQuote(goal.id)},
        ${sqlQuote(goal.agentId)},
        ${sqlQuote(goal.title)},
        ${sqlQuote(goal.description)},
        ${sqlText(goal.cadence ? JSON.stringify(goal.cadence) : null)},
        ${sqlJson(goal.supportStrategy)},
        ${sqlJson(goal.successCriteria)},
        ${sqlQuote(goal.status)},
        ${sqlQuote(goal.reviewState)},
        ${sqlJson(goal.metadata)},
        ${sqlQuote(goal.createdAt)},
        ${sqlQuote(goal.updatedAt)}
      )`,
    );
  }

  async updateGoal(goal: LifeOpsGoalDefinition): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `UPDATE life_goal_definitions
          SET title = ${sqlQuote(goal.title)},
              description = ${sqlQuote(goal.description)},
              cadence_json = ${sqlText(goal.cadence ? JSON.stringify(goal.cadence) : null)},
              support_strategy_json = ${sqlJson(goal.supportStrategy)},
              success_criteria_json = ${sqlJson(goal.successCriteria)},
              status = ${sqlQuote(goal.status)},
              review_state = ${sqlQuote(goal.reviewState)},
              metadata_json = ${sqlJson(goal.metadata)},
              updated_at = ${sqlQuote(goal.updatedAt)}
        WHERE id = ${sqlQuote(goal.id)}
          AND agent_id = ${sqlQuote(goal.agentId)}`,
    );
  }

  async getGoal(agentId: string, goalId: string): Promise<LifeOpsGoalDefinition | null> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_goal_definitions
        WHERE agent_id = ${sqlQuote(agentId)}
          AND id = ${sqlQuote(goalId)}
        LIMIT 1`,
    );
    const row = rows[0];
    return row ? parseGoal(row) : null;
  }

  async listGoals(agentId: string): Promise<LifeOpsGoalDefinition[]> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_goal_definitions
        WHERE agent_id = ${sqlQuote(agentId)}
        ORDER BY created_at ASC`,
    );
    return rows.map(parseGoal);
  }

  async upsertGoalLink(link: LifeOpsGoalLink): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_goal_links (
        id, agent_id, goal_id, linked_type, linked_id, created_at
      ) VALUES (
        ${sqlQuote(link.id)},
        ${sqlQuote(link.agentId)},
        ${sqlQuote(link.goalId)},
        ${sqlQuote(link.linkedType)},
        ${sqlQuote(link.linkedId)},
        ${sqlQuote(link.createdAt)}
      )
      ON CONFLICT(agent_id, goal_id, linked_type, linked_id) DO NOTHING`,
    );
  }

  async deleteGoalLinksForLinked(
    agentId: string,
    linkedType: LifeOpsGoalLink["linkedType"],
    linkedId: string,
  ): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `DELETE FROM life_goal_links
        WHERE agent_id = ${sqlQuote(agentId)}
          AND linked_type = ${sqlQuote(linkedType)}
          AND linked_id = ${sqlQuote(linkedId)}`,
    );
  }

  async listGoalLinksForGoal(
    agentId: string,
    goalId: string,
  ): Promise<LifeOpsGoalLink[]> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_goal_links
        WHERE agent_id = ${sqlQuote(agentId)}
          AND goal_id = ${sqlQuote(goalId)}
        ORDER BY created_at ASC`,
    );
    return rows.map(parseGoalLink);
  }

  async createReminderPlan(plan: LifeOpsReminderPlan): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_reminder_plans (
        id, agent_id, owner_type, owner_id, steps_json,
        mute_policy_json, quiet_hours_json, created_at, updated_at
      ) VALUES (
        ${sqlQuote(plan.id)},
        ${sqlQuote(plan.agentId)},
        ${sqlQuote(plan.ownerType)},
        ${sqlQuote(plan.ownerId)},
        ${sqlJson(plan.steps)},
        ${sqlJson(plan.mutePolicy)},
        ${sqlJson(plan.quietHours)},
        ${sqlQuote(plan.createdAt)},
        ${sqlQuote(plan.updatedAt)}
      )`,
    );
  }

  async updateReminderPlan(plan: LifeOpsReminderPlan): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `UPDATE life_reminder_plans
          SET steps_json = ${sqlJson(plan.steps)},
              mute_policy_json = ${sqlJson(plan.mutePolicy)},
              quiet_hours_json = ${sqlJson(plan.quietHours)},
              updated_at = ${sqlQuote(plan.updatedAt)}
        WHERE id = ${sqlQuote(plan.id)}
          AND agent_id = ${sqlQuote(plan.agentId)}`,
    );
  }

  async deleteReminderPlan(agentId: string, planId: string): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `DELETE FROM life_reminder_plans
        WHERE agent_id = ${sqlQuote(agentId)}
          AND id = ${sqlQuote(planId)}`,
    );
  }

  async getReminderPlan(agentId: string, planId: string): Promise<LifeOpsReminderPlan | null> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_reminder_plans
        WHERE agent_id = ${sqlQuote(agentId)}
          AND id = ${sqlQuote(planId)}
        LIMIT 1`,
    );
    const row = rows[0];
    return row ? parseReminderPlan(row) : null;
  }

  async listReminderPlansForOwners(
    agentId: string,
    ownerType: string,
    ownerIds: string[],
  ): Promise<LifeOpsReminderPlan[]> {
    await this.ensureReady();
    if (ownerIds.length === 0) return [];
    const ownerList = ownerIds.map((ownerId) => sqlQuote(ownerId)).join(", ");
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_reminder_plans
        WHERE agent_id = ${sqlQuote(agentId)}
          AND owner_type = ${sqlQuote(ownerType)}
          AND owner_id IN (${ownerList})`,
    );
    return rows.map(parseReminderPlan);
  }

  async createAuditEvent(event: LifeOpsAuditEvent): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_audit_events (
        id, agent_id, event_type, owner_type, owner_id, reason,
        inputs_json, decision_json, actor, created_at
      ) VALUES (
        ${sqlQuote(event.id)},
        ${sqlQuote(event.agentId)},
        ${sqlQuote(event.eventType)},
        ${sqlQuote(event.ownerType)},
        ${sqlQuote(event.ownerId)},
        ${sqlQuote(event.reason)},
        ${sqlJson(event.inputs)},
        ${sqlJson(event.decision)},
        ${sqlQuote(event.actor)},
        ${sqlQuote(event.createdAt)}
      )`,
    );
  }

  async listAuditEvents(agentId: string, ownerType: string, ownerId: string): Promise<LifeOpsAuditEvent[]> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_audit_events
        WHERE agent_id = ${sqlQuote(agentId)}
          AND owner_type = ${sqlQuote(ownerType)}
          AND owner_id = ${sqlQuote(ownerId)}
        ORDER BY created_at DESC`,
    );
    return rows.map(parseAuditEvent);
  }

  async upsertChannelPolicy(policy: LifeOpsChannelPolicy): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_channel_policies (
        id, agent_id, channel_type, channel_ref, privacy_class,
        allow_reminders, allow_escalation, allow_posts,
        require_confirmation_for_actions, metadata_json, created_at, updated_at
      ) VALUES (
        ${sqlQuote(policy.id)},
        ${sqlQuote(policy.agentId)},
        ${sqlQuote(policy.channelType)},
        ${sqlQuote(policy.channelRef)},
        ${sqlQuote(policy.privacyClass)},
        ${sqlBoolean(policy.allowReminders)},
        ${sqlBoolean(policy.allowEscalation)},
        ${sqlBoolean(policy.allowPosts)},
        ${sqlBoolean(policy.requireConfirmationForActions)},
        ${sqlJson(policy.metadata)},
        ${sqlQuote(policy.createdAt)},
        ${sqlQuote(policy.updatedAt)}
      )
      ON CONFLICT(agent_id, channel_type, channel_ref) DO UPDATE SET
        privacy_class = excluded.privacy_class,
        allow_reminders = excluded.allow_reminders,
        allow_escalation = excluded.allow_escalation,
        allow_posts = excluded.allow_posts,
        require_confirmation_for_actions = excluded.require_confirmation_for_actions,
        metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at`,
    );
  }

  async listChannelPolicies(agentId: string): Promise<LifeOpsChannelPolicy[]> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_channel_policies
        WHERE agent_id = ${sqlQuote(agentId)}
        ORDER BY created_at ASC`,
    );
    return rows.map(parseChannelPolicy);
  }

  async upsertConnectorGrant(grant: LifeOpsConnectorGrant): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_connector_grants (
        id, agent_id, provider, identity_json, granted_scopes_json,
        capabilities_json, token_ref, mode, metadata_json,
        last_refresh_at, created_at, updated_at
      ) VALUES (
        ${sqlQuote(grant.id)},
        ${sqlQuote(grant.agentId)},
        ${sqlQuote(grant.provider)},
        ${sqlJson(grant.identity)},
        ${sqlJson(grant.grantedScopes)},
        ${sqlJson(grant.capabilities)},
        ${sqlText(grant.tokenRef)},
        ${sqlQuote(grant.mode)},
        ${sqlJson(grant.metadata)},
        ${sqlText(grant.lastRefreshAt)},
        ${sqlQuote(grant.createdAt)},
        ${sqlQuote(grant.updatedAt)}
      )
      ON CONFLICT(agent_id, provider, mode) DO UPDATE SET
        identity_json = excluded.identity_json,
        granted_scopes_json = excluded.granted_scopes_json,
        capabilities_json = excluded.capabilities_json,
        token_ref = excluded.token_ref,
        metadata_json = excluded.metadata_json,
        last_refresh_at = excluded.last_refresh_at,
        updated_at = excluded.updated_at`,
    );
  }

  async listConnectorGrants(agentId: string): Promise<LifeOpsConnectorGrant[]> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_connector_grants
        WHERE agent_id = ${sqlQuote(agentId)}
        ORDER BY created_at ASC`,
    );
    return rows.map(parseConnectorGrant);
  }

  async getConnectorGrant(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    mode: LifeOpsConnectorGrant["mode"],
  ): Promise<LifeOpsConnectorGrant | null> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_connector_grants
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          AND mode = ${sqlQuote(mode)}
        LIMIT 1`,
    );
    const row = rows[0];
    return row ? parseConnectorGrant(row) : null;
  }

  async deleteConnectorGrant(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    mode?: LifeOpsConnectorGrant["mode"],
  ): Promise<void> {
    await this.ensureReady();
    const modeClause = mode ? `AND mode = ${sqlQuote(mode)}` : "";
    await executeRawSql(
      this.runtime,
      `DELETE FROM life_connector_grants
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          ${modeClause}`,
    );
  }

  async upsertCalendarEvent(event: LifeOpsCalendarEvent): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_calendar_events (
        id, agent_id, provider, calendar_id, external_event_id, title,
        description, location, status, start_at, end_at, is_all_day,
        timezone, html_link, conference_link, organizer_json,
        attendees_json, metadata_json, synced_at, updated_at
      ) VALUES (
        ${sqlQuote(event.id)},
        ${sqlQuote(event.agentId)},
        ${sqlQuote(event.provider)},
        ${sqlQuote(event.calendarId)},
        ${sqlQuote(event.externalId)},
        ${sqlQuote(event.title)},
        ${sqlQuote(event.description)},
        ${sqlQuote(event.location)},
        ${sqlQuote(event.status)},
        ${sqlQuote(event.startAt)},
        ${sqlQuote(event.endAt)},
        ${sqlBoolean(event.isAllDay)},
        ${sqlText(event.timezone)},
        ${sqlText(event.htmlLink)},
        ${sqlText(event.conferenceLink)},
        ${sqlText(event.organizer ? JSON.stringify(event.organizer) : null)},
        ${sqlJson(event.attendees)},
        ${sqlJson(event.metadata)},
        ${sqlQuote(event.syncedAt)},
        ${sqlQuote(event.updatedAt)}
      )
      ON CONFLICT(agent_id, provider, calendar_id, external_event_id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        location = excluded.location,
        status = excluded.status,
        start_at = excluded.start_at,
        end_at = excluded.end_at,
        is_all_day = excluded.is_all_day,
        timezone = excluded.timezone,
        html_link = excluded.html_link,
        conference_link = excluded.conference_link,
        organizer_json = excluded.organizer_json,
        attendees_json = excluded.attendees_json,
        metadata_json = excluded.metadata_json,
        synced_at = excluded.synced_at,
        updated_at = excluded.updated_at`,
    );
  }

  async deleteCalendarEventsForProvider(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    calendarId?: string,
  ): Promise<void> {
    await this.ensureReady();
    const calendarClause = calendarId
      ? `AND calendar_id = ${sqlQuote(calendarId)}`
      : "";
    await executeRawSql(
      this.runtime,
      `DELETE FROM life_calendar_events
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          ${calendarClause}`,
    );
  }

  async pruneCalendarEventsInWindow(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    calendarId: string,
    timeMin: string,
    timeMax: string,
    keepExternalIds: readonly string[],
  ): Promise<void> {
    await this.ensureReady();
    const keepClause =
      keepExternalIds.length > 0
        ? `AND external_event_id NOT IN (${keepExternalIds
            .map((externalId) => sqlQuote(externalId))
            .join(", ")})`
        : "";
    await executeRawSql(
      this.runtime,
      `DELETE FROM life_calendar_events
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          AND calendar_id = ${sqlQuote(calendarId)}
          AND end_at >= ${sqlQuote(timeMin)}
          AND start_at < ${sqlQuote(timeMax)}
          ${keepClause}`,
    );
  }

  async listCalendarEvents(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    timeMin?: string,
    timeMax?: string,
  ): Promise<LifeOpsCalendarEvent[]> {
    await this.ensureReady();
    const timeMinClause = timeMin
      ? `AND end_at >= ${sqlQuote(timeMin)}`
      : "";
    const timeMaxClause = timeMax
      ? `AND start_at < ${sqlQuote(timeMax)}`
      : "";
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_calendar_events
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          ${timeMinClause}
          ${timeMaxClause}
        ORDER BY start_at ASC`,
    );
    return rows.map(parseCalendarEvent);
  }

  async upsertCalendarSyncState(state: LifeOpsCalendarSyncState): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_calendar_sync_states (
        id, agent_id, provider, calendar_id, window_start_at,
        window_end_at, synced_at, updated_at
      ) VALUES (
        ${sqlQuote(state.id)},
        ${sqlQuote(state.agentId)},
        ${sqlQuote(state.provider)},
        ${sqlQuote(state.calendarId)},
        ${sqlQuote(state.windowStartAt)},
        ${sqlQuote(state.windowEndAt)},
        ${sqlQuote(state.syncedAt)},
        ${sqlQuote(state.updatedAt)}
      )
      ON CONFLICT(agent_id, provider, calendar_id) DO UPDATE SET
        window_start_at = excluded.window_start_at,
        window_end_at = excluded.window_end_at,
        synced_at = excluded.synced_at,
        updated_at = excluded.updated_at`,
    );
  }

  async getCalendarSyncState(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    calendarId: string,
  ): Promise<LifeOpsCalendarSyncState | null> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_calendar_sync_states
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          AND calendar_id = ${sqlQuote(calendarId)}
        LIMIT 1`,
    );
    const row = rows[0];
    return row ? parseCalendarSyncState(row) : null;
  }

  async deleteCalendarSyncState(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    calendarId?: string,
  ): Promise<void> {
    await this.ensureReady();
    const calendarClause = calendarId
      ? `AND calendar_id = ${sqlQuote(calendarId)}`
      : "";
    await executeRawSql(
      this.runtime,
      `DELETE FROM life_calendar_sync_states
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          ${calendarClause}`,
    );
  }

  async upsertGmailMessage(message: LifeOpsGmailMessageSummary): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_gmail_messages (
        id, agent_id, provider, external_message_id, thread_id, subject,
        from_display, from_email, reply_to, to_json, cc_json, snippet,
        received_at, is_unread, is_important, likely_reply_needed,
        triage_score, triage_reason, label_ids_json, html_link, metadata_json,
        synced_at, updated_at
      ) VALUES (
        ${sqlQuote(message.id)},
        ${sqlQuote(message.agentId)},
        ${sqlQuote(message.provider)},
        ${sqlQuote(message.externalId)},
        ${sqlQuote(message.threadId)},
        ${sqlQuote(message.subject)},
        ${sqlQuote(message.from)},
        ${sqlText(message.fromEmail)},
        ${sqlText(message.replyTo)},
        ${sqlJson(message.to)},
        ${sqlJson(message.cc)},
        ${sqlQuote(message.snippet)},
        ${sqlQuote(message.receivedAt)},
        ${sqlBoolean(message.isUnread)},
        ${sqlBoolean(message.isImportant)},
        ${sqlBoolean(message.likelyReplyNeeded)},
        ${sqlInteger(message.triageScore)},
        ${sqlQuote(message.triageReason)},
        ${sqlJson(message.labels)},
        ${sqlText(message.htmlLink)},
        ${sqlJson(message.metadata)},
        ${sqlQuote(message.syncedAt)},
        ${sqlQuote(message.updatedAt)}
      )
      ON CONFLICT(agent_id, provider, external_message_id) DO UPDATE SET
        thread_id = excluded.thread_id,
        subject = excluded.subject,
        from_display = excluded.from_display,
        from_email = excluded.from_email,
        reply_to = excluded.reply_to,
        to_json = excluded.to_json,
        cc_json = excluded.cc_json,
        snippet = excluded.snippet,
        received_at = excluded.received_at,
        is_unread = excluded.is_unread,
        is_important = excluded.is_important,
        likely_reply_needed = excluded.likely_reply_needed,
        triage_score = excluded.triage_score,
        triage_reason = excluded.triage_reason,
        label_ids_json = excluded.label_ids_json,
        html_link = excluded.html_link,
        metadata_json = excluded.metadata_json,
        synced_at = excluded.synced_at,
        updated_at = excluded.updated_at`,
    );
  }

  async pruneGmailMessages(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    keepExternalIds: readonly string[],
  ): Promise<void> {
    await this.ensureReady();
    const keepClause =
      keepExternalIds.length > 0
        ? `AND external_message_id NOT IN (${keepExternalIds
            .map((externalId) => sqlQuote(externalId))
            .join(", ")})`
        : "";
    await executeRawSql(
      this.runtime,
      `DELETE FROM life_gmail_messages
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          ${keepClause}`,
    );
  }

  async listGmailMessages(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    options?: {
      maxResults?: number;
      threadId?: string;
      since?: string;
    },
  ): Promise<LifeOpsGmailMessageSummary[]> {
    await this.ensureReady();
    const maxResultsClause =
      options?.maxResults !== undefined && Number.isFinite(options.maxResults)
        ? `LIMIT ${sqlInteger(options.maxResults)}`
        : "";
    const threadClause = options?.threadId
      ? `AND thread_id = ${sqlQuote(options.threadId)}`
      : "";
    const sinceClause = options?.since
      ? `AND received_at >= ${sqlQuote(options.since)}`
      : "";
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_gmail_messages
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          ${threadClause}
          ${sinceClause}
        ORDER BY triage_score DESC, received_at DESC
        ${maxResultsClause}`,
    );
    return rows.map(parseGmailMessageSummary);
  }

  async getGmailMessage(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    messageId: string,
  ): Promise<LifeOpsGmailMessageSummary | null> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_gmail_messages
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          AND id = ${sqlQuote(messageId)}
        LIMIT 1`,
    );
    const row = rows[0];
    return row ? parseGmailMessageSummary(row) : null;
  }

  async deleteGmailMessagesForProvider(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
  ): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `DELETE FROM life_gmail_messages
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}`,
    );
  }

  async upsertGmailSyncState(state: LifeOpsGmailSyncState): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_gmail_sync_states (
        id, agent_id, provider, mailbox, max_results, synced_at, updated_at
      ) VALUES (
        ${sqlQuote(state.id)},
        ${sqlQuote(state.agentId)},
        ${sqlQuote(state.provider)},
        ${sqlQuote(state.mailbox)},
        ${sqlInteger(state.maxResults)},
        ${sqlQuote(state.syncedAt)},
        ${sqlQuote(state.updatedAt)}
      )
      ON CONFLICT(agent_id, provider, mailbox) DO UPDATE SET
        max_results = excluded.max_results,
        synced_at = excluded.synced_at,
        updated_at = excluded.updated_at`,
    );
  }

  async getGmailSyncState(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    mailbox: string,
  ): Promise<LifeOpsGmailSyncState | null> {
    await this.ensureReady();
    const rows = await executeRawSql(
      this.runtime,
      `SELECT *
         FROM life_gmail_sync_states
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          AND mailbox = ${sqlQuote(mailbox)}
        LIMIT 1`,
    );
    const row = rows[0];
    return row ? parseGmailSyncState(row) : null;
  }

  async deleteGmailSyncState(
    agentId: string,
    provider: LifeOpsConnectorGrant["provider"],
    mailbox?: string,
  ): Promise<void> {
    await this.ensureReady();
    const mailboxClause = mailbox ? `AND mailbox = ${sqlQuote(mailbox)}` : "";
    await executeRawSql(
      this.runtime,
      `DELETE FROM life_gmail_sync_states
        WHERE agent_id = ${sqlQuote(agentId)}
          AND provider = ${sqlQuote(provider)}
          ${mailboxClause}`,
    );
  }

  async createWorkflow(definition: LifeOpsWorkflowDefinition): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_workflow_definitions (
        id, agent_id, title, trigger_type, schedule_json, action_plan_json,
        permission_policy_json, status, created_by, metadata_json,
        created_at, updated_at
      ) VALUES (
        ${sqlQuote(definition.id)},
        ${sqlQuote(definition.agentId)},
        ${sqlQuote(definition.title)},
        ${sqlQuote(definition.triggerType)},
        ${sqlJson(definition.schedule)},
        ${sqlJson(definition.actionPlan)},
        ${sqlJson(definition.permissionPolicy)},
        ${sqlQuote(definition.status)},
        ${sqlQuote(definition.createdBy)},
        ${sqlJson(definition.metadata)},
        ${sqlQuote(definition.createdAt)},
        ${sqlQuote(definition.updatedAt)}
      )`,
    );
  }

  async createWorkflowRun(run: LifeOpsWorkflowRun): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_workflow_runs (
        id, agent_id, workflow_id, started_at, finished_at, status,
        result_json, audit_ref
      ) VALUES (
        ${sqlQuote(run.id)},
        ${sqlQuote(run.agentId)},
        ${sqlQuote(run.workflowId)},
        ${sqlQuote(run.startedAt)},
        ${sqlText(run.finishedAt)},
        ${sqlQuote(run.status)},
        ${sqlJson(run.result)},
        ${sqlText(run.auditRef)}
      )`,
    );
  }

  async createReminderAttempt(attempt: LifeOpsReminderAttempt): Promise<void> {
    await this.ensureReady();
    await executeRawSql(
      this.runtime,
      `INSERT INTO life_reminder_attempts (
        id, agent_id, plan_id, owner_type, owner_id, occurrence_id,
        channel, step_index, scheduled_for, attempted_at, outcome,
        connector_ref, delivery_metadata_json
      ) VALUES (
        ${sqlQuote(attempt.id)},
        ${sqlQuote(attempt.agentId)},
        ${sqlQuote(attempt.planId)},
        ${sqlQuote(attempt.ownerType)},
        ${sqlQuote(attempt.ownerId)},
        ${sqlText(attempt.occurrenceId)},
        ${sqlQuote(attempt.channel)},
        ${sqlInteger(attempt.stepIndex)},
        ${sqlQuote(attempt.scheduledFor)},
        ${sqlText(attempt.attemptedAt)},
        ${sqlQuote(attempt.outcome)},
        ${sqlText(attempt.connectorRef)},
        ${sqlJson(attempt.deliveryMetadata)}
      )`,
    );
  }
}

export function createLifeOpsTaskDefinition(params: Omit<LifeOpsTaskDefinition, "id" | "createdAt" | "updatedAt">): LifeOpsTaskDefinition {
  const timestamp = isoNow();
  return {
    ...params,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createLifeOpsGoalDefinition(params: Omit<LifeOpsGoalDefinition, "id" | "createdAt" | "updatedAt">): LifeOpsGoalDefinition {
  const timestamp = isoNow();
  return {
    ...params,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createLifeOpsReminderPlan(params: Omit<LifeOpsReminderPlan, "id" | "createdAt" | "updatedAt">): LifeOpsReminderPlan {
  const timestamp = isoNow();
  return {
    ...params,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createLifeOpsAuditEvent(params: Omit<LifeOpsAuditEvent, "id" | "createdAt">): LifeOpsAuditEvent {
  return {
    ...params,
    id: crypto.randomUUID(),
    createdAt: isoNow(),
  };
}

export function createLifeOpsConnectorGrant(
  params: Omit<LifeOpsConnectorGrant, "id" | "createdAt" | "updatedAt">,
): LifeOpsConnectorGrant {
  const timestamp = isoNow();
  return {
    ...params,
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createLifeOpsCalendarSyncState(
  params: Omit<LifeOpsCalendarSyncState, "id" | "updatedAt">,
): LifeOpsCalendarSyncState {
  return {
    ...params,
    id: crypto.randomUUID(),
    updatedAt: isoNow(),
  };
}

export function createLifeOpsGmailSyncState(
  params: Omit<LifeOpsGmailSyncState, "id" | "updatedAt">,
): LifeOpsGmailSyncState {
  return {
    ...params,
    id: crypto.randomUUID(),
    updatedAt: isoNow(),
  };
}

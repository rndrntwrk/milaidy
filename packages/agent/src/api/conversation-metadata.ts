type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];

export type ConversationScope =
  | "general"
  | "automation-coordinator"
  | "automation-workflow"
  | "automation-workflow-draft"
  | "automation-draft"
  | "page-character"
  | "page-apps"
  | "page-connectors"
  | "page-phone"
  | "page-plugins"
  | "page-lifeops"
  | "page-settings"
  | "page-wallet"
  | "page-browser"
  | "page-automations";

export type ConversationAutomationType = "coordinator_text" | "n8n_workflow";

export interface ConversationMetadata {
  scope?: ConversationScope;
  automationType?: ConversationAutomationType;
  taskId?: string;
  triggerId?: string;
  workflowId?: string;
  workflowName?: string;
  draftId?: string;
  pageId?: string;
  sourceConversationId?: string;
  terminalBridgeConversationId?: string;
}

export interface ConversationMeta {
  id: string;
  title?: string;
  roomId?: string;
  metadata?: ConversationMetadata;
  createdAt?: string;
  updatedAt?: string;
}

type RoomLike = {
  metadata?: unknown;
};

type RoomMetadataRecord = Record<string, JsonValue>;

interface StoredConversationMetadata extends ConversationMetadata {
  conversationId: string;
}

const VALID_SCOPES = new Set<ConversationScope>([
  "general",
  "automation-coordinator",
  "automation-workflow",
  "automation-workflow-draft",
  "automation-draft",
  "page-character",
  "page-apps",
  "page-connectors",
  "page-phone",
  "page-plugins",
  "page-lifeops",
  "page-settings",
  "page-wallet",
  "page-browser",
  "page-automations",
]);

const VALID_AUTOMATION_TYPES = new Set<ConversationAutomationType>([
  "coordinator_text",
  "n8n_workflow",
]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function sanitizeConversationMetadata(
  value: unknown,
): ConversationMetadata | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const scope = normalizeOptionalString(record.scope);
  const automationType = normalizeOptionalString(record.automationType);
  const next: ConversationMetadata = {};

  if (scope && VALID_SCOPES.has(scope as ConversationScope)) {
    next.scope = scope as ConversationScope;
  }

  if (
    automationType &&
    VALID_AUTOMATION_TYPES.has(automationType as ConversationAutomationType)
  ) {
    next.automationType = automationType as ConversationAutomationType;
  }

  const taskId = normalizeOptionalString(record.taskId);
  if (taskId) next.taskId = taskId;

  const triggerId = normalizeOptionalString(record.triggerId);
  if (triggerId) next.triggerId = triggerId;

  const workflowId = normalizeOptionalString(record.workflowId);
  if (workflowId) next.workflowId = workflowId;

  const workflowName = normalizeOptionalString(record.workflowName);
  if (workflowName) next.workflowName = workflowName;

  const draftId = normalizeOptionalString(record.draftId);
  if (draftId) next.draftId = draftId;

  const pageId = normalizeOptionalString(record.pageId);
  if (pageId) next.pageId = pageId;

  const sourceConversationId = normalizeOptionalString(
    record.sourceConversationId,
  );
  if (sourceConversationId) next.sourceConversationId = sourceConversationId;

  const terminalBridgeConversationId = normalizeOptionalString(
    record.terminalBridgeConversationId,
  );
  if (terminalBridgeConversationId) {
    next.terminalBridgeConversationId = terminalBridgeConversationId;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function buildConversationRoomMetadata(
  conversation: Pick<ConversationMeta, "id" | "metadata">,
  ownerId: string,
  existingMetadata?: unknown,
): RoomMetadataRecord {
  const base = (asRecord(existingMetadata) ?? {}) as RoomMetadataRecord;
  const sanitized = sanitizeConversationMetadata(conversation.metadata);
  const next: RoomMetadataRecord = {
    ...base,
    ownership: { ownerId },
  };

  if (sanitized) {
    next.webConversation = {
      conversationId: conversation.id,
      ...sanitized,
    } satisfies StoredConversationMetadata;
  } else {
    delete next.webConversation;
  }

  return next;
}

export function extractConversationMetadataFromRoom(
  room: RoomLike | null | undefined,
  expectedConversationId?: string,
): ConversationMetadata | undefined {
  const roomMetadata = asRecord(room?.metadata);
  if (!roomMetadata) {
    return undefined;
  }
  const stored = asRecord(roomMetadata.webConversation);
  if (!stored) {
    return undefined;
  }
  const storedConversationId = normalizeOptionalString(stored.conversationId);
  if (
    expectedConversationId &&
    storedConversationId &&
    storedConversationId !== expectedConversationId
  ) {
    return undefined;
  }
  return sanitizeConversationMetadata(stored);
}

export function isAutomationConversationMetadata(
  metadata: ConversationMetadata | null | undefined,
): boolean {
  return (
    metadata?.scope === "automation-coordinator" ||
    metadata?.scope === "automation-workflow" ||
    metadata?.scope === "automation-workflow-draft" ||
    metadata?.scope === "automation-draft"
  );
}

export function isPageScopedConversationMetadata(
  metadata: ConversationMetadata | null | undefined,
): boolean {
  const scope = metadata?.scope;
  return typeof scope === "string" && scope.startsWith("page-");
}

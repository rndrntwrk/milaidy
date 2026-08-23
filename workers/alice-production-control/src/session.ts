import type { ReleaseBinding } from "./policy";
import {
  canonicalEvidenceJson,
  validateEvidenceRecord,
  type EvidenceRecord,
} from "./evidence";

type SessionEventInput = {
  eventId: string;
  eventType: string;
  payloadHash: string;
  recordedAt: number;
};

type SessionEvent = SessionEventInput & { sequence: number };

type TaskInput = {
  taskId: string;
  state: string;
  checkpointHash: string;
  updatedAt: number;
};

type SessionTask = TaskInput & { revision: number };

export type ConversationTurnInput = {
  turnId: string;
  userText: string;
  assistantText: string;
  requestHash: string;
  responseHash: string;
  recordedAt: number;
};

type ConversationTurn = ConversationTurnInput & { sequence: number };

export type SessionLedgerState = {
  schemaVersion: "alice.session-ledger.v1";
  sessionId: string;
  binding: ReleaseBinding;
  sequence: number;
  events: SessionEvent[];
  tasks: Record<string, SessionTask>;
  conversationTurns: ConversationTurn[];
  evidenceOutbox: EvidenceRecord[];
};

const TASK_STATES = new Set([
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
]);
const MAX_CONVERSATION_TURNS = 1_000;
const MAX_SESSION_STATE_BYTES = 1_500_000;
const MAX_SESSION_OPERATIONAL_BYTES = 1_300_000;
const MAX_CONTEXT_BYTES = 65_536;
const encoder = new TextEncoder();

function serializedStateBytes(state: SessionLedgerState): number {
  return encoder.encode(JSON.stringify(state)).byteLength;
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function validBinding(value: unknown): value is ReleaseBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as ReleaseBinding;
  return (
    validDigest(binding.programDigest) &&
    validDigest(binding.releaseDigest) &&
    validDigest(binding.policyHash)
  );
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(value);
}

function validEvent(event: SessionEventInput): boolean {
  return (
    validIdentifier(event?.eventId) &&
    validIdentifier(event?.eventType) &&
    validDigest(event?.payloadHash) &&
    Number.isFinite(event?.recordedAt) &&
    event.recordedAt > 0
  );
}

function validTask(task: TaskInput): boolean {
  return (
    validIdentifier(task?.taskId) &&
    TASK_STATES.has(task?.state) &&
    validDigest(task?.checkpointHash) &&
    Number.isFinite(task?.updatedAt) &&
    task.updatedAt > 0
  );
}

function validConversationText(value: unknown, maxBytes: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.includes("\0") &&
    encoder.encode(value).byteLength <= maxBytes
  );
}

function validConversationTurn(turn: ConversationTurnInput): boolean {
  return (
    validIdentifier(turn?.turnId) &&
    validConversationText(turn?.userText, 100_000) &&
    validConversationText(turn?.assistantText, 32_768) &&
    validDigest(turn?.requestHash) &&
    validDigest(turn?.responseHash) &&
    Number.isSafeInteger(turn?.recordedAt) &&
    turn.recordedAt > 0
  );
}

function validState(value: unknown): value is SessionLedgerState {
  if (!value || typeof value !== "object") return false;
  const state = value as SessionLedgerState;
  return (
    state.schemaVersion === "alice.session-ledger.v1" &&
    validIdentifier(state.sessionId) &&
    validBinding(state.binding) &&
    Number.isInteger(state.sequence) &&
    state.sequence >= 0 &&
    Array.isArray(state.events) &&
    state.events.every(
      (event) => validEvent(event) && Number.isInteger(event.sequence) && event.sequence > 0,
    ) &&
    state.tasks !== null &&
    typeof state.tasks === "object" &&
    !Array.isArray(state.tasks) &&
    Object.values(state.tasks).every(
      (task) => validTask(task) && Number.isInteger(task.revision) && task.revision > 0,
    ) &&
    Array.isArray(state.conversationTurns) &&
    state.conversationTurns.length <= MAX_CONVERSATION_TURNS &&
    state.conversationTurns.every(
      (turn) =>
        validConversationTurn(turn) &&
        Number.isInteger(turn.sequence) &&
        turn.sequence > 0,
    ) &&
    Array.isArray(state.evidenceOutbox) &&
    state.evidenceOutbox.length <= 32 &&
    state.evidenceOutbox.every(
      (record) =>
        validateEvidenceRecord(record).ok &&
        record.binding.releaseDigest === state.binding.releaseDigest &&
        record.binding.policyHash === state.binding.policyHash,
    ) &&
    serializedStateBytes(state) <= MAX_SESSION_STATE_BYTES
  );
}

export class SessionLedger {
  private constructor(private state: SessionLedgerState) {}

  static create(sessionId: string, binding: ReleaseBinding): SessionLedger {
    if (!validIdentifier(sessionId) || !validBinding(binding)) {
      throw new Error("SESSION_CONFIG_INVALID");
    }
    return new SessionLedger({
      schemaVersion: "alice.session-ledger.v1",
      sessionId,
      binding: structuredClone(binding),
      sequence: 0,
      events: [],
      tasks: {},
      conversationTurns: [],
      evidenceOutbox: [],
    });
  }

  static restore(
    state: SessionLedgerState,
    sessionId: string,
    binding: ReleaseBinding,
  ): SessionLedger {
    const ledger = SessionLedger.restoreStored(state, sessionId, binding.releaseDigest);
    const rebound = ledger.rebind(binding);
    if (!rebound.ok) throw new Error("SESSION_RELEASE_MISMATCH");
    return ledger;
  }

  static restoreStored(
    state: SessionLedgerState,
    sessionId: string,
    releaseDigest: string,
  ): SessionLedger {
    const next = structuredClone(state) as SessionLedgerState & {
      conversationTurns?: ConversationTurn[];
      evidenceOutbox?: EvidenceRecord[];
    };
    // Additive migration for pre-transcript v1 ledgers created during preview.
    next.conversationTurns ??= [];
    next.evidenceOutbox ??= [];
    if (!validState(next)) throw new Error("SESSION_STATE_INVALID");
    if (
      next.sessionId !== sessionId ||
      next.binding.releaseDigest !== releaseDigest
    ) {
      throw new Error("SESSION_RELEASE_MISMATCH");
    }
    return new SessionLedger(next);
  }

  rebind(binding: ReleaseBinding) {
    if (
      !validBinding(binding) ||
      this.state.binding.releaseDigest !== binding.releaseDigest ||
      this.state.binding.policyHash !== binding.policyHash
    ) {
      return { ok: false, code: "SESSION_RELEASE_MISMATCH" } as const;
    }
    if (this.state.binding.programDigest === binding.programDigest) {
      return { ok: true, code: "SESSION_BINDING_ALREADY_CURRENT" } as const;
    }
    this.state.binding = structuredClone(binding);
    return { ok: true, code: "SESSION_BINDING_RENEWED" } as const;
  }

  exportState(): SessionLedgerState {
    return structuredClone(this.state);
  }

  stageEvidence(record: EvidenceRecord, maxRecords: number) {
    if (
      !validateEvidenceRecord(record).ok ||
      record.binding.releaseDigest !== this.state.binding.releaseDigest ||
      record.binding.policyHash !== this.state.binding.policyHash ||
      record.binding.programDigest !== this.state.binding.programDigest
    ) {
      return { ok: false, code: "EVIDENCE_RECORD_INVALID" } as const;
    }
    const existing = this.state.evidenceOutbox.find(
      (candidate) => candidate.eventId === record.eventId,
    );
    if (existing) {
      return canonicalEvidenceJson(existing) === canonicalEvidenceJson(record)
        ? ({ ok: true, code: "EVIDENCE_ALREADY_STAGED" } as const)
        : ({ ok: false, code: "EVIDENCE_EVENT_COLLISION" } as const);
    }
    if (
      !Number.isSafeInteger(maxRecords) ||
      maxRecords < 1 ||
      this.state.evidenceOutbox.length >= maxRecords
    ) {
      return { ok: false, code: "EVIDENCE_OUTBOX_FULL" } as const;
    }
    const candidate = structuredClone(this.state);
    candidate.evidenceOutbox.push(structuredClone(record));
    if (serializedStateBytes(candidate) > MAX_SESSION_STATE_BYTES) {
      return { ok: false, code: "SESSION_LEDGER_FULL" } as const;
    }
    this.state = candidate;
    return { ok: true, code: "EVIDENCE_STAGED" } as const;
  }

  pendingEvidence(): EvidenceRecord[] {
    return structuredClone(this.state.evidenceOutbox);
  }

  ackEvidence(eventId: string): void {
    this.state.evidenceOutbox = this.state.evidenceOutbox.filter(
      (record) => record.eventId !== eventId,
    );
  }

  assertPersistable(maxBytes = MAX_SESSION_STATE_BYTES): void {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
      throw new Error("SESSION_PERSISTENCE_LIMIT_INVALID");
    }
    if (!validState(this.state) || serializedStateBytes(this.state) > maxBytes) {
      throw new Error("SESSION_LEDGER_FULL");
    }
  }

  snapshot() {
    return {
      schemaVersion: this.state.schemaVersion,
      sessionId: this.state.sessionId,
      binding: structuredClone(this.state.binding),
      sequence: this.state.sequence,
      eventCount: this.state.events.length,
      events: structuredClone(this.state.events),
      tasks: structuredClone(this.state.tasks),
      conversationTurnCount: this.state.conversationTurns.length,
      conversationTurns: structuredClone(this.state.conversationTurns),
    };
  }

  conversationContext(excludeTurnId = "") {
    const existingTurn = excludeTurnId
      ? this.state.conversationTurns.find((turn) => turn.turnId === excludeTurnId) ?? null
      : null;
    const selected: ConversationTurn[] = [];
    let usedBytes = 0;
    for (let index = this.state.conversationTurns.length - 1; index >= 0; index -= 1) {
      const turn = this.state.conversationTurns[index]!;
      if (turn.turnId === excludeTurnId) continue;
      const turnBytes = encoder.encode(
        JSON.stringify({ userText: turn.userText, assistantText: turn.assistantText }),
      ).byteLength;
      if (usedBytes + turnBytes > MAX_CONTEXT_BYTES) break;
      selected.push(structuredClone(turn));
      usedBytes += turnBytes;
    }
    selected.reverse();
    return {
      sessionId: this.state.sessionId,
      binding: structuredClone(this.state.binding),
      existingTurn: existingTurn ? structuredClone(existingTurn) : null,
      recentTurns: selected,
      contextBytes: usedBytes,
      stateBytes: serializedStateBytes(this.state),
      maxStateBytes: MAX_SESSION_STATE_BYTES,
    };
  }

  appendConversationTurn(turn: ConversationTurnInput) {
    if (!validConversationTurn(turn)) {
      return { ok: false, code: "CONVERSATION_TURN_INVALID" } as const;
    }
    const existing = this.state.conversationTurns.find(
      (candidate) => candidate.turnId === turn.turnId,
    );
    if (existing) {
      const identical =
        existing.userText === turn.userText &&
        existing.assistantText === turn.assistantText &&
        existing.requestHash === turn.requestHash &&
        existing.responseHash === turn.responseHash;
      return identical
        ? ({
            ok: true,
            code: "CONVERSATION_TURN_ALREADY_RECORDED",
            sequence: existing.sequence,
          } as const)
        : ({ ok: false, code: "CONVERSATION_TURN_COLLISION" } as const);
    }
    if (this.state.conversationTurns.length >= MAX_CONVERSATION_TURNS) {
      return { ok: false, code: "CONVERSATION_TRANSCRIPT_FULL" } as const;
    }
    const candidate = structuredClone(this.state);
    candidate.sequence += 1;
    candidate.conversationTurns.push({
      ...structuredClone(turn),
      sequence: candidate.sequence,
    });
    if (serializedStateBytes(candidate) > MAX_SESSION_OPERATIONAL_BYTES) {
      return { ok: false, code: "CONVERSATION_TRANSCRIPT_FULL" } as const;
    }
    this.state = candidate;
    return {
      ok: true,
      code: "CONVERSATION_TURN_APPENDED",
      sequence: this.state.sequence,
    } as const;
  }

  appendEvent(event: SessionEventInput) {
    if (!validEvent(event)) return { ok: false, code: "EVENT_INVALID" } as const;
    const existing = this.state.events.find((candidate) => candidate.eventId === event.eventId);
    if (existing) {
      const identical =
        existing.eventType === event.eventType &&
        existing.payloadHash === event.payloadHash &&
        existing.recordedAt === event.recordedAt;
      return identical
        ? ({ ok: true, code: "EVENT_ALREADY_RECORDED", sequence: existing.sequence } as const)
        : ({ ok: false, code: "EVENT_ID_COLLISION" } as const);
    }
    const candidate = structuredClone(this.state);
    candidate.sequence += 1;
    candidate.events.push({ ...structuredClone(event), sequence: candidate.sequence });
    if (serializedStateBytes(candidate) > MAX_SESSION_OPERATIONAL_BYTES) {
      return { ok: false, code: "SESSION_LEDGER_FULL" } as const;
    }
    this.state = candidate;
    return { ok: true, code: "EVENT_APPENDED", sequence: this.state.sequence } as const;
  }

  upsertTask(task: TaskInput) {
    if (!validTask(task)) return { ok: false, code: "TASK_INVALID" } as const;
    const existing = this.state.tasks[task.taskId];
    if (existing) {
      if (task.updatedAt < existing.updatedAt) {
        return { ok: false, code: "TASK_UPDATE_STALE" } as const;
      }
      const identical =
        task.updatedAt === existing.updatedAt &&
        task.state === existing.state &&
        task.checkpointHash === existing.checkpointHash;
      if (identical) {
        return { ok: true, code: "TASK_ALREADY_CURRENT", revision: existing.revision } as const;
      }
      if (task.updatedAt === existing.updatedAt) {
        return { ok: false, code: "TASK_UPDATE_CONFLICT" } as const;
      }
    }
    const revision = (existing?.revision ?? 0) + 1;
    const candidate = structuredClone(this.state);
    candidate.tasks[task.taskId] = { ...structuredClone(task), revision };
    candidate.sequence += 1;
    if (serializedStateBytes(candidate) > MAX_SESSION_OPERATIONAL_BYTES) {
      return { ok: false, code: "SESSION_LEDGER_FULL" } as const;
    }
    this.state = candidate;
    return { ok: true, code: "TASK_UPSERTED", revision } as const;
  }

  closeRunningWorkflowTask(task: TaskInput) {
    if (
      !validTask(task) ||
      (task.state !== "failed" && task.state !== "cancelled")
    ) {
      return {
        ok: false,
        code: "WORKFLOW_TASK_TERMINAL_REQUEST_INVALID",
      } as const;
    }
    const existing = this.state.tasks[task.taskId];
    if (!existing) {
      return { ok: false, code: "WORKFLOW_TASK_NOT_FOUND" } as const;
    }
    if (existing.checkpointHash !== task.checkpointHash) {
      return {
        ok: false,
        code: "WORKFLOW_TASK_CHECKPOINT_MISMATCH",
      } as const;
    }
    if (
      existing.state === task.state &&
      existing.updatedAt === task.updatedAt
    ) {
      return {
        ok: true,
        code: "WORKFLOW_TASK_TERMINAL_ALREADY_CURRENT",
        revision: existing.revision,
      } as const;
    }
    if (existing.state !== "running") {
      return { ok: false, code: "WORKFLOW_TASK_NOT_RUNNING" } as const;
    }
    if (task.updatedAt <= existing.updatedAt) {
      return { ok: false, code: "TASK_UPDATE_STALE" } as const;
    }
    const revision = existing.revision + 1;
    const candidate = structuredClone(this.state);
    candidate.tasks[task.taskId] = { ...structuredClone(task), revision };
    candidate.sequence += 1;
    if (serializedStateBytes(candidate) > MAX_SESSION_OPERATIONAL_BYTES) {
      return { ok: false, code: "SESSION_LEDGER_FULL" } as const;
    }
    this.state = candidate;
    return {
      ok: true,
      code: "WORKFLOW_TASK_TERMINALLY_CLOSED",
      revision,
    } as const;
  }
}

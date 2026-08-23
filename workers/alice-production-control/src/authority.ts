import {
  authorizeIntent,
  reserveModelBudget,
  type ActionIntent,
  type CapabilityGrant,
  type ModelBudgetRequest,
  type ReleaseBinding,
} from "./policy";
import { validateEvidenceRecord, type EvidenceRecord } from "./evidence";

export const ALICE_PAUSE_SCOPES = Object.freeze([
  "all",
  "social",
  "trading",
  "stream",
  "coding",
  "model",
  "modal",
  "signer",
  "release",
]);
const PAUSE_SCOPES = new Set(ALICE_PAUSE_SCOPES);

type PauseRecord = {
  pauseId: string;
  pausedAt: number;
  pausedBy: string;
  binding: ReleaseBinding;
  deploymentManifestSha256: string;
  rollbackBoundary: string;
  resumedAt: number | null;
  resumedBy: string | null;
  recoveryReceipt: string | null;
};

type ModelReservation = {
  requestId: string;
  model: string;
  estimatedUnits: number;
};

type StoredIntentDecision = {
  fingerprint: string;
  expiresAt: number;
  capabilityId: string | null;
  decision: {
    allowed: true;
    code: string;
    risk: "low" | "high" | "unknown";
  };
};

type ReleaseHistoryRecord = {
  releaseDigest: string;
  policyHash: string;
  deploymentManifestSha256: string;
  rollbackBoundary: string;
};

export type ReleaseActivationCandidate = {
  binding: ReleaseBinding;
  deploymentManifestSha256: string;
  releaseEpoch: number;
  programIssuedAt: number;
  rollbackBoundary: string;
};

export type VerifiedReleaseRollbackAuthorization = {
  receiptHash: string;
  currentBinding: ReleaseBinding;
  currentDeploymentManifestSha256: string;
  currentReleaseEpoch: number;
  currentRollbackBoundary: string;
};

export type VerifiedRecoveryAuthorization = {
  receiptHash: string;
  currentBinding: ReleaseBinding;
  currentDeploymentManifestSha256: string;
  currentReleaseEpoch: number;
  currentRollbackBoundary: string;
};

export type AuthorityLedgerState = {
  schemaVersion: "alice.authority-ledger.v3";
  binding: ReleaseBinding;
  deploymentManifestSha256: string;
  admissionGeneration: number;
  activeReleaseEpoch: number;
  highestReleaseEpoch: number;
  activeProgramIssuedAt: number;
  latestProgramIssuedAt: number;
  releaseHistory: Record<string, ReleaseHistoryRecord>;
  rollbackBoundary: string;
  pauses: Record<string, PauseRecord>;
  consumedNonces: string[];
  intentDecisions: Record<string, StoredIntentDecision>;
  capabilities: Record<string, CapabilityGrant>;
  budget: {
    windowId: string;
    usedUnits: number;
    maxUnits: number;
    reservations: Record<string, ModelReservation>;
  };
  usedRecoveryReceipts: string[];
  evidenceOutbox: Record<string, EvidenceRecord>;
  sequence: number;
};

export const AUTHORITY_PERSISTENCE_LIMITS = Object.freeze({
  operationalBytes: 1_500_000,
  resumeBytes: 1_650_000,
  scopedPauseBytes: 1_700_000,
  pauseAllBytes: 1_750_000,
  operationalOutboxRecords: 32,
  resumeOutboxRecords: 62,
  scopedPauseOutboxRecords: 63,
  pauseAllOutboxRecords: 64,
});
const MAX_EVIDENCE_OUTBOX_RECORDS =
  AUTHORITY_PERSISTENCE_LIMITS.pauseAllOutboxRecords;
const MAX_AUTHORITY_STATE_BYTES = AUTHORITY_PERSISTENCE_LIMITS.pauseAllBytes;
const MAX_RELEASE_HISTORY_RECORDS = 128;
const encoder = new TextEncoder();
const ZERO_DIGEST = `sha256:${"0".repeat(64)}`;
const DEFAULT_TEST_DEPLOYMENT_MANIFEST_SHA256 = `sha256:${"4".repeat(64)}`;

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function bindingMatches(left: ReleaseBinding, right: ReleaseBinding): boolean {
  return (
    left.programDigest === right.programDigest &&
    left.releaseDigest === right.releaseDigest &&
    left.policyHash === right.policyHash
  );
}

function validBinding(value: unknown): value is ReleaseBinding {
  if (!value || typeof value !== "object") return false;
  const binding = value as ReleaseBinding;
  return [binding.programDigest, binding.releaseDigest, binding.policyHash].every((digest) =>
    /^sha256:[a-f0-9]{64}$/.test(digest),
  );
}

function isUnadmittedBinding(binding: ReleaseBinding): boolean {
  return (
    binding.programDigest === `sha256:${"0".repeat(64)}` &&
    binding.releaseDigest === `sha256:${"0".repeat(64)}` &&
    binding.policyHash === `sha256:${"0".repeat(64)}`
  );
}

function validRollbackBoundary(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 256;
}

function validReleaseHistoryRecord(value: unknown): value is ReleaseHistoryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as ReleaseHistoryRecord;
  return (
    Object.keys(record).sort().join(",") ===
      "deploymentManifestSha256,policyHash,releaseDigest,rollbackBoundary" &&
    validDigest(record.releaseDigest) &&
    validDigest(record.policyHash) &&
    validDigest(record.deploymentManifestSha256) &&
    validRollbackBoundary(record.rollbackBoundary)
  );
}

function validReleaseCandidate(value: unknown): value is ReleaseActivationCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as ReleaseActivationCandidate;
  return (
    validBinding(candidate.binding) &&
    validDigest(candidate.deploymentManifestSha256) &&
    Number.isSafeInteger(candidate.releaseEpoch) &&
    candidate.releaseEpoch > 0 &&
    Number.isSafeInteger(candidate.programIssuedAt) &&
    candidate.programIssuedAt > 0 &&
    validRollbackBoundary(candidate.rollbackBoundary)
  );
}

function utcWindowId(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function intentFingerprint(intent: ActionIntent): string {
  return JSON.stringify([
    intent.intentId,
    intent.action,
    intent.target,
    intent.argumentHash,
    intent.nonce,
    intent.expiresAt,
    intent.capabilityId ?? null,
    intent.programDigest,
    intent.releaseDigest,
    intent.policyHash,
  ]);
}

function validState(value: unknown): value is AuthorityLedgerState {
  if (!value || typeof value !== "object") return false;
  const state = value as AuthorityLedgerState;
  const validPause = (record: unknown): record is PauseRecord => {
    if (!record || typeof record !== "object") return false;
    const pause = record as PauseRecord;
    return (
      /^pause-[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(pause.pauseId) &&
      Number.isFinite(pause.pausedAt) &&
      pause.pausedAt > 0 &&
      typeof pause.pausedBy === "string" &&
      pause.pausedBy.trim().length > 0 &&
      validBinding(pause.binding) &&
      validDigest(pause.deploymentManifestSha256) &&
      typeof pause.rollbackBoundary === "string" &&
      pause.rollbackBoundary.length >= 8 &&
      pause.rollbackBoundary.length <= 256 &&
      (pause.resumedAt === null || (Number.isFinite(pause.resumedAt) && pause.resumedAt >= pause.pausedAt)) &&
      (pause.resumedBy === null || (typeof pause.resumedBy === "string" && pause.resumedBy.trim().length > 0)) &&
      (pause.recoveryReceipt === null ||
        (typeof pause.recoveryReceipt === "string" &&
          /^sha256:[a-f0-9]{64}$/.test(pause.recoveryReceipt))) &&
      ((pause.resumedAt === null && pause.resumedBy === null && pause.recoveryReceipt === null) ||
        (pause.resumedAt !== null && pause.resumedBy !== null && pause.recoveryReceipt !== null))
    );
  };
  const validCapability = (capability: unknown): capability is CapabilityGrant => {
    if (!capability || typeof capability !== "object") return false;
    const grant = capability as CapabilityGrant;
    return (
      /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(grant.capabilityId) &&
      typeof grant.scope === "string" &&
      typeof grant.target === "string" &&
      grant.target.trim().length > 0 &&
      /^sha256:[a-f0-9]{64}$/.test(grant.argumentHash) &&
      typeof grant.nonce === "string" &&
      grant.nonce.trim().length >= 8 &&
      Number.isFinite(grant.expiresAt) &&
      typeof grant.rollbackBoundary === "string" &&
      grant.rollbackBoundary.trim().length > 0 &&
      (grant.revokedAt === null || (Number.isFinite(grant.revokedAt) && grant.revokedAt > 0)) &&
      (grant.usedAt === null || (Number.isFinite(grant.usedAt) && grant.usedAt > 0)) &&
      validBinding(grant)
    );
  };
  const validIntentDecision = (decision: unknown): decision is StoredIntentDecision => {
    if (!decision || typeof decision !== "object") return false;
    const stored = decision as StoredIntentDecision;
    return (
      typeof stored.fingerprint === "string" &&
      stored.fingerprint.length > 0 &&
      Number.isFinite(stored.expiresAt) &&
      (stored.capabilityId === null ||
        /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(stored.capabilityId)) &&
      stored.decision?.allowed === true &&
      typeof stored.decision.code === "string" &&
      ["low", "high", "unknown"].includes(stored.decision.risk)
    );
  };
  const validReservation = (reservation: unknown): reservation is ModelReservation => {
    if (!reservation || typeof reservation !== "object") return false;
    const stored = reservation as ModelReservation;
    return (
      typeof stored.requestId === "string" &&
      stored.requestId.trim().length > 0 &&
      typeof stored.model === "string" &&
      stored.model.trim().length > 0 &&
      Number.isInteger(stored.estimatedUnits) &&
      stored.estimatedUnits > 0
    );
  };
  const releaseEntries =
    state.releaseHistory && typeof state.releaseHistory === "object"
      ? Object.entries(state.releaseHistory)
      : [];
  const releaseEpochs = releaseEntries.map(([epoch]) => Number(epoch));
  const activeHistory = state.releaseHistory?.[String(state.activeReleaseEpoch)];
  const bindingValid = validBinding(state.binding);
  const releaseStateValid = !bindingValid
    ? false
    : isUnadmittedBinding(state.binding)
    ? state.activeReleaseEpoch === 0 &&
      state.deploymentManifestSha256 === ZERO_DIGEST &&
      state.admissionGeneration === 0 &&
      state.highestReleaseEpoch === 0 &&
      state.activeProgramIssuedAt === 0 &&
      state.latestProgramIssuedAt === 0 &&
      releaseEntries.length === 0
    : Number.isSafeInteger(state.activeReleaseEpoch) &&
      validDigest(state.deploymentManifestSha256) &&
      state.deploymentManifestSha256 !== ZERO_DIGEST &&
      Number.isSafeInteger(state.admissionGeneration) &&
      state.admissionGeneration > 0 &&
      state.activeReleaseEpoch > 0 &&
      Number.isSafeInteger(state.highestReleaseEpoch) &&
      state.highestReleaseEpoch >= state.activeReleaseEpoch &&
      Number.isSafeInteger(state.activeProgramIssuedAt) &&
      state.activeProgramIssuedAt > 0 &&
      Number.isSafeInteger(state.latestProgramIssuedAt) &&
      state.latestProgramIssuedAt >= state.activeProgramIssuedAt &&
      releaseEntries.length > 0 &&
      releaseEntries.length <= MAX_RELEASE_HISTORY_RECORDS &&
      releaseEntries.every(
        ([epoch, record]) =>
          /^[1-9][0-9]*$/.test(epoch) &&
          Number.isSafeInteger(Number(epoch)) &&
          Number(epoch) <= state.highestReleaseEpoch &&
          validReleaseHistoryRecord(record) &&
          record.deploymentManifestSha256 !== ZERO_DIGEST &&
          record.policyHash === state.binding.policyHash,
      ) &&
      Math.max(...releaseEpochs) === state.highestReleaseEpoch &&
      Boolean(
        activeHistory &&
          activeHistory.releaseDigest === state.binding.releaseDigest &&
          activeHistory.policyHash === state.binding.policyHash &&
          activeHistory.deploymentManifestSha256 === state.deploymentManifestSha256 &&
          activeHistory.rollbackBoundary === state.rollbackBoundary,
      );
  const structurallyValid = (
    state.schemaVersion === "alice.authority-ledger.v3" &&
    bindingValid &&
    releaseStateValid &&
    validRollbackBoundary(state.rollbackBoundary) &&
    state.pauses !== null &&
    typeof state.pauses === "object" &&
    !Array.isArray(state.pauses) &&
    Object.entries(state.pauses).every(
      ([scope, record]) => PAUSE_SCOPES.has(scope) && validPause(record),
    ) &&
    Array.isArray(state.consumedNonces) &&
    state.consumedNonces.every((nonce) => typeof nonce === "string") &&
    state.intentDecisions !== null &&
    typeof state.intentDecisions === "object" &&
    !Array.isArray(state.intentDecisions) &&
    Object.values(state.intentDecisions).every(validIntentDecision) &&
    state.capabilities !== null &&
    typeof state.capabilities === "object" &&
    !Array.isArray(state.capabilities) &&
    Object.entries(state.capabilities).every(
      ([capabilityId, capability]) =>
        validCapability(capability) && capability.capabilityId === capabilityId,
    ) &&
    state.budget !== null &&
    typeof state.budget === "object" &&
    typeof state.budget.windowId === "string" &&
    Number.isInteger(state.budget.usedUnits) &&
    state.budget.usedUnits >= 0 &&
    Number.isInteger(state.budget.maxUnits) &&
    state.budget.maxUnits > 0 &&
    state.budget.reservations !== null &&
    typeof state.budget.reservations === "object" &&
    !Array.isArray(state.budget.reservations) &&
    Object.entries(state.budget.reservations).every(
      ([requestId, reservation]) =>
        validReservation(reservation) && reservation.requestId === requestId,
    ) &&
    Array.isArray(state.usedRecoveryReceipts) &&
    state.usedRecoveryReceipts.every(
      (receipt) => typeof receipt === "string" && /^sha256:[a-f0-9]{64}$/.test(receipt),
    ) &&
    new Set(state.usedRecoveryReceipts).size === state.usedRecoveryReceipts.length &&
    state.evidenceOutbox !== null &&
    typeof state.evidenceOutbox === "object" &&
    !Array.isArray(state.evidenceOutbox) &&
    Object.keys(state.evidenceOutbox).length <= MAX_EVIDENCE_OUTBOX_RECORDS &&
    Object.entries(state.evidenceOutbox).every(
      ([eventId, record]) =>
        eventId === record.eventId && validateEvidenceRecord(record).ok,
    ) &&
    Number.isInteger(state.sequence) &&
    state.sequence >= 0
  );
  return (
    structurallyValid &&
    encoder.encode(JSON.stringify(state)).byteLength <= MAX_AUTHORITY_STATE_BYTES
  );
}

function migrateAuthorityState(value: unknown): AuthorityLedgerState {
  const migrated = structuredClone(value) as Record<string, any>;
  migrated.evidenceOutbox ??= {};
  if (migrated.schemaVersion === "alice.authority-ledger.v1") {
    if (
      !validBinding(migrated.binding) ||
      !isUnadmittedBinding(migrated.binding) ||
      migrated.rollbackBoundary !== "release:unadmitted"
    ) {
      throw new Error("AUTHORITY_STATE_MIGRATION_REQUIRED");
    }
    migrated.schemaVersion = "alice.authority-ledger.v2";
    migrated.activeReleaseEpoch = 0;
    migrated.highestReleaseEpoch = 0;
    migrated.activeProgramIssuedAt = 0;
    migrated.latestProgramIssuedAt = 0;
    migrated.releaseHistory = {};
  }
  if (migrated.schemaVersion === "alice.authority-ledger.v2") {
    if (
      !validBinding(migrated.binding) ||
      !isUnadmittedBinding(migrated.binding) ||
      migrated.rollbackBoundary !== "release:unadmitted" ||
      migrated.activeReleaseEpoch !== 0 ||
      migrated.highestReleaseEpoch !== 0 ||
      Object.keys(migrated.releaseHistory ?? {}).length !== 0 ||
      Object.keys(migrated.pauses ?? {}).length !== 0
    ) {
      throw new Error("AUTHORITY_STATE_MIGRATION_REQUIRED");
    }
    migrated.schemaVersion = "alice.authority-ledger.v3";
    migrated.deploymentManifestSha256 = ZERO_DIGEST;
    migrated.admissionGeneration = 0;
  }
  if (!validState(migrated)) throw new Error("AUTHORITY_STATE_INVALID");
  return migrated;
}

export class AuthorityLedger {
  private constructor(private state: AuthorityLedgerState) {}

  static create(
    binding: ReleaseBinding,
    maxUnits: number,
    rollbackBoundary = "test:rollback-boundary",
    releaseEpoch = 1,
    programIssuedAt = 1,
    deploymentManifestSha256?: string,
  ): AuthorityLedger {
    const unadmitted = isUnadmittedBinding(binding);
    const manifestSha256 =
      deploymentManifestSha256 ??
      (unadmitted ? ZERO_DIGEST : DEFAULT_TEST_DEPLOYMENT_MANIFEST_SHA256);
    if (
      !validBinding(binding) ||
      !Number.isInteger(maxUnits) ||
      maxUnits <= 0 ||
      !validRollbackBoundary(rollbackBoundary) ||
      !Number.isSafeInteger(releaseEpoch) ||
      !Number.isSafeInteger(programIssuedAt) ||
      !validDigest(manifestSha256) ||
      (unadmitted
        ? releaseEpoch !== 0 ||
          programIssuedAt !== 0 ||
          rollbackBoundary !== "release:unadmitted" ||
          manifestSha256 !== ZERO_DIGEST
        : releaseEpoch <= 0 || programIssuedAt <= 0 || manifestSha256 === ZERO_DIGEST)
    ) {
      throw new Error("AUTHORITY_CONFIG_INVALID");
    }
    return new AuthorityLedger({
      schemaVersion: "alice.authority-ledger.v3",
      binding: structuredClone(binding),
      deploymentManifestSha256: manifestSha256,
      admissionGeneration: unadmitted ? 0 : 1,
      activeReleaseEpoch: releaseEpoch,
      highestReleaseEpoch: releaseEpoch,
      activeProgramIssuedAt: programIssuedAt,
      latestProgramIssuedAt: programIssuedAt,
      releaseHistory: unadmitted
        ? {}
        : {
            [String(releaseEpoch)]: {
              releaseDigest: binding.releaseDigest,
              policyHash: binding.policyHash,
              deploymentManifestSha256: manifestSha256,
              rollbackBoundary,
            },
          },
      rollbackBoundary,
      pauses: {},
      consumedNonces: [],
      intentDecisions: {},
      capabilities: {},
      budget: {
        windowId: "",
        usedUnits: 0,
        maxUnits,
        reservations: {},
      },
      usedRecoveryReceipts: [],
      evidenceOutbox: {},
      sequence: 0,
    });
  }

  static restore(
    state: AuthorityLedgerState,
    binding: ReleaseBinding,
    configuredMaxUnits: number,
  ): AuthorityLedger {
    const migrated = migrateAuthorityState(state);
    if (!validBinding(binding) || !bindingMatches(migrated.binding, binding)) {
      throw new Error("AUTHORITY_RELEASE_MISMATCH");
    }
    if (!Number.isInteger(configuredMaxUnits) || configuredMaxUnits <= 0) {
      throw new Error("AUTHORITY_CONFIG_INVALID");
    }
    return new AuthorityLedger(structuredClone(migrated));
  }

  static restoreGlobal(
    state: AuthorityLedgerState,
    configuredMaxUnits: number,
  ): AuthorityLedger {
    const migrated = migrateAuthorityState(state);
    if (!Number.isInteger(configuredMaxUnits) || configuredMaxUnits <= 0) {
      throw new Error("AUTHORITY_CONFIG_INVALID");
    }
    return new AuthorityLedger(structuredClone(migrated));
  }

  reconcileBudgetLimit(configuredMaxUnits: number, now: number) {
    if (
      !Number.isInteger(configuredMaxUnits) ||
      configuredMaxUnits <= 0 ||
      !Number.isSafeInteger(now) ||
      now <= 0
    ) {
      throw new Error("AUTHORITY_CONFIG_INVALID");
    }
    const previousMaxUnits = this.state.budget.maxUnits;
    let changed = false;
    const windowId = utcWindowId(now);
    if (
      this.state.budget.windowId !== "" &&
      this.state.budget.windowId !== windowId
    ) {
      this.state.budget.windowId = windowId;
      this.state.budget.usedUnits = 0;
      this.state.budget.reservations = {};
      changed = true;
    }
    const effectiveMaxUnits = Math.min(
      this.state.budget.maxUnits,
      configuredMaxUnits,
    );
    if (effectiveMaxUnits !== this.state.budget.maxUnits) {
      this.state.budget.maxUnits = effectiveMaxUnits;
      changed = true;
    }
    let pause: PauseRecord | null = null;
    if (
      this.state.budget.usedUnits > this.state.budget.maxUnits &&
      this.activePause("all") === null
    ) {
      pause = {
        pauseId: `pause-budget-invariant-${this.state.sequence + 1}`,
        pausedAt: now,
        pausedBy: "authority:budget-invariant",
        binding: structuredClone(this.state.binding),
        deploymentManifestSha256: this.state.deploymentManifestSha256,
        rollbackBoundary: this.state.rollbackBoundary,
        resumedAt: null,
        resumedBy: null,
        recoveryReceipt: null,
      };
      this.state.pauses.all = pause;
      this.state.admissionGeneration += 1;
      changed = true;
    }
    if (changed) this.state.sequence += 1;
    const code = pause
      ? "BUDGET_INVARIANT_PAUSED"
      : previousMaxUnits !== this.state.budget.maxUnits
        ? "BUDGET_LIMIT_RECONCILED"
        : changed
          ? "BUDGET_WINDOW_RECONCILED"
          : "BUDGET_LIMIT_UNCHANGED";
    return {
      changed,
      code,
      previousMaxUnits,
      effectiveMaxUnits: this.state.budget.maxUnits,
      usedUnits: this.state.budget.usedUnits,
      windowId: this.state.budget.windowId,
      pause: pause ? structuredClone(pause) : null,
    } as const;
  }

  releaseIsActive(candidate: ReleaseActivationCandidate): boolean {
    return (
      validReleaseCandidate(candidate) &&
      bindingMatches(this.state.binding, candidate.binding) &&
      this.state.deploymentManifestSha256 === candidate.deploymentManifestSha256 &&
      this.state.activeReleaseEpoch === candidate.releaseEpoch &&
      this.state.activeProgramIssuedAt === candidate.programIssuedAt &&
      this.state.rollbackBoundary === candidate.rollbackBoundary
    );
  }

  requiresReleaseRollbackReceipt(candidate: ReleaseActivationCandidate): boolean {
    if (!validReleaseCandidate(candidate)) {
      throw new Error("AUTHORITY_CONFIG_INVALID");
    }
    const sameActiveIdentity =
      candidate.releaseEpoch === this.state.activeReleaseEpoch &&
      candidate.binding.releaseDigest === this.state.binding.releaseDigest &&
      candidate.binding.policyHash === this.state.binding.policyHash &&
      candidate.deploymentManifestSha256 === this.state.deploymentManifestSha256 &&
      candidate.rollbackBoundary === this.state.rollbackBoundary;
    return !sameActiveIdentity && candidate.releaseEpoch <= this.state.highestReleaseEpoch;
  }

  activateRelease(
    candidate: ReleaseActivationCandidate,
    configuredMaxUnits: number,
    now: number,
    rollbackAuthorization: VerifiedReleaseRollbackAuthorization | null = null,
  ) {
    if (
      !validReleaseCandidate(candidate) ||
      !Number.isInteger(configuredMaxUnits) ||
      configuredMaxUnits <= 0 ||
      !Number.isSafeInteger(now) ||
      now <= 0
    ) {
      throw new Error("AUTHORITY_CONFIG_INVALID");
    }
    if (this.releaseIsActive(candidate)) {
      return { ok: true, code: "RELEASE_ALREADY_ACTIVE" } as const;
    }
    const allPause = this.activePause("all");
    const releasePause = this.activePause("release");
    const deploymentTransitionPaused =
      allPause?.pausedBy === "deployment-controller:pause-only" &&
      releasePause === null;
    if (
      (allPause !== null || releasePause !== null) &&
      !deploymentTransitionPaused
    ) {
      return { ok: false, code: "RELEASE_PAUSED" } as const;
    }

    const historyKey = String(candidate.releaseEpoch);
    const history = this.state.releaseHistory[historyKey];
    if (
      history &&
      (history.releaseDigest !== candidate.binding.releaseDigest ||
        history.policyHash !== candidate.binding.policyHash ||
        history.deploymentManifestSha256 !== candidate.deploymentManifestSha256 ||
        history.rollbackBoundary !== candidate.rollbackBoundary)
    ) {
      return { ok: false, code: "RELEASE_EPOCH_COLLISION" } as const;
    }

    const sameActiveIdentity =
      candidate.releaseEpoch === this.state.activeReleaseEpoch &&
      candidate.binding.releaseDigest === this.state.binding.releaseDigest &&
      candidate.binding.policyHash === this.state.binding.policyHash &&
      candidate.deploymentManifestSha256 === this.state.deploymentManifestSha256 &&
      candidate.rollbackBoundary === this.state.rollbackBoundary;
    const historicalTransition =
      !sameActiveIdentity && candidate.releaseEpoch <= this.state.highestReleaseEpoch;
    if (historicalTransition && !history) {
      return { ok: false, code: "RELEASE_EPOCH_UNKNOWN" } as const;
    }
    if (historicalTransition) {
      if (!rollbackAuthorization) {
        return { ok: false, code: "RELEASE_ROLLBACK_AUTH_REQUIRED" } as const;
      }
      if (
        !bindingMatches(rollbackAuthorization.currentBinding, this.state.binding) ||
        rollbackAuthorization.currentDeploymentManifestSha256 !==
          this.state.deploymentManifestSha256 ||
        rollbackAuthorization.currentReleaseEpoch !== this.state.activeReleaseEpoch ||
        rollbackAuthorization.currentRollbackBoundary !== this.state.rollbackBoundary
      ) {
        return { ok: false, code: "RELEASE_ROLLBACK_STATE_MISMATCH" } as const;
      }
      if (
        !/^sha256:[a-f0-9]{64}$/.test(rollbackAuthorization.receiptHash) ||
        this.state.usedRecoveryReceipts.includes(rollbackAuthorization.receiptHash)
      ) {
        return { ok: false, code: "RECOVERY_RECEIPT_INVALID" } as const;
      }
    } else if (
      candidate.programIssuedAt < this.state.latestProgramIssuedAt ||
      (candidate.programIssuedAt === this.state.latestProgramIssuedAt &&
        candidate.binding.programDigest !== this.state.binding.programDigest) ||
      (sameActiveIdentity &&
        candidate.binding.programDigest === this.state.binding.programDigest)
    ) {
      return { ok: false, code: "PROGRAM_ISSUED_AT_REPLAY" } as const;
    }
    if (
      !sameActiveIdentity &&
      candidate.releaseEpoch > this.state.highestReleaseEpoch &&
      Object.keys(this.state.releaseHistory).length >= MAX_RELEASE_HISTORY_RECORDS
    ) {
      return { ok: false, code: "RELEASE_HISTORY_FULL" } as const;
    }

    const windowId = utcWindowId(now);
    if (this.state.budget.windowId !== windowId) {
      this.state.budget.windowId = windowId;
      this.state.budget.usedUnits = 0;
      this.state.budget.reservations = {};
    } else {
      this.state.budget.reservations = {};
    }
    this.state.budget.maxUnits = Math.min(
      this.state.budget.maxUnits,
      configuredMaxUnits,
    );
    if (!history) {
      this.state.releaseHistory[historyKey] = {
        releaseDigest: candidate.binding.releaseDigest,
        policyHash: candidate.binding.policyHash,
        deploymentManifestSha256: candidate.deploymentManifestSha256,
        rollbackBoundary: candidate.rollbackBoundary,
      };
    }
    if (historicalTransition) {
      this.state.usedRecoveryReceipts.push(rollbackAuthorization!.receiptHash);
    }
    this.state.binding = structuredClone(candidate.binding);
    this.state.deploymentManifestSha256 = candidate.deploymentManifestSha256;
    this.state.admissionGeneration += 1;
    this.state.activeReleaseEpoch = candidate.releaseEpoch;
    this.state.highestReleaseEpoch = Math.max(
      this.state.highestReleaseEpoch,
      candidate.releaseEpoch,
    );
    this.state.activeProgramIssuedAt = candidate.programIssuedAt;
    this.state.latestProgramIssuedAt = Math.max(
      this.state.latestProgramIssuedAt,
      candidate.programIssuedAt,
    );
    this.state.rollbackBoundary = candidate.rollbackBoundary;
    this.state.consumedNonces = [];
    this.state.intentDecisions = {};
    this.state.capabilities = {};
    this.state.sequence += 1;
    return {
      ok: true,
      code: historicalTransition
        ? "RELEASE_ROLLED_BACK"
        : sameActiveIdentity
          ? "PROGRAM_RENEWED"
          : "RELEASE_ACTIVATED",
    } as const;
  }

  exportState(): AuthorityLedgerState {
    return structuredClone(this.state);
  }

  assertPersistable(
    maxBytes: number = AUTHORITY_PERSISTENCE_LIMITS.operationalBytes,
  ): void {
    if (encoder.encode(JSON.stringify(this.state)).byteLength > maxBytes) {
      throw new Error("AUTHORITY_LEDGER_FULL");
    }
    if (!validState(this.state)) throw new Error("AUTHORITY_STATE_INVALID");
  }

  snapshot() {
    return {
      schemaVersion: this.state.schemaVersion,
      binding: structuredClone(this.state.binding),
      deploymentManifestSha256: this.state.deploymentManifestSha256,
      admissionGeneration: this.state.admissionGeneration,
      activeReleaseEpoch: this.state.activeReleaseEpoch,
      highestReleaseEpoch: this.state.highestReleaseEpoch,
      activeProgramIssuedAt: this.state.activeProgramIssuedAt,
      latestProgramIssuedAt: this.state.latestProgramIssuedAt,
      rollbackBoundary: this.state.rollbackBoundary,
      pausedScopes: this.activePausedScopes(),
      activePauses: Object.fromEntries(
        Object.entries(this.state.pauses)
          .filter(([, record]) => record.resumedAt === null)
          .map(([scope, record]) => [scope, structuredClone(record)]),
      ),
      consumedNonceCount: this.state.consumedNonces.length,
      capabilityCount: Object.keys(this.state.capabilities).length,
      budget: {
        windowId: this.state.budget.windowId,
        usedUnits: this.state.budget.usedUnits,
        maxUnits: this.state.budget.maxUnits,
        reservationCount: Object.keys(this.state.budget.reservations).length,
      },
      evidenceOutboxCount: Object.keys(this.state.evidenceOutbox).length,
      sequence: this.state.sequence,
    };
  }

  stageEvidence(
    record: EvidenceRecord,
    maxRecords: number = AUTHORITY_PERSISTENCE_LIMITS.operationalOutboxRecords,
  ) {
    const validation = validateEvidenceRecord(record);
    if (!validation.ok || !bindingMatches(record.binding, this.state.binding)) {
      return { ok: false, code: "EVIDENCE_RECORD_INVALID" } as const;
    }
    const existing = this.state.evidenceOutbox[record.eventId];
    if (existing) {
      return JSON.stringify(existing) === JSON.stringify(record)
        ? ({ ok: true, code: "EVIDENCE_ALREADY_STAGED" } as const)
        : ({ ok: false, code: "EVIDENCE_ID_COLLISION" } as const);
    }
    if (
      !Number.isInteger(maxRecords) ||
      maxRecords < 1 ||
      maxRecords > MAX_EVIDENCE_OUTBOX_RECORDS ||
      Object.keys(this.state.evidenceOutbox).length >= maxRecords
    ) {
      return { ok: false, code: "EVIDENCE_OUTBOX_FULL" } as const;
    }
    this.state.evidenceOutbox[record.eventId] = structuredClone(record);
    if (encoder.encode(JSON.stringify(this.state)).byteLength > MAX_AUTHORITY_STATE_BYTES) {
      delete this.state.evidenceOutbox[record.eventId];
      return { ok: false, code: "AUTHORITY_LEDGER_FULL" } as const;
    }
    return { ok: true, code: "EVIDENCE_STAGED" } as const;
  }

  pendingEvidence(): EvidenceRecord[] {
    return Object.values(this.state.evidenceOutbox)
      .map((record) => structuredClone(record))
      .sort(
        (left, right) =>
          left.occurredAt.localeCompare(right.occurredAt) ||
          left.eventId.localeCompare(right.eventId),
      );
  }

  ackEvidence(eventId: string) {
    if (!this.state.evidenceOutbox[eventId]) {
      return { ok: true, code: "EVIDENCE_ALREADY_ACKNOWLEDGED" } as const;
    }
    delete this.state.evidenceOutbox[eventId];
    return { ok: true, code: "EVIDENCE_ACKNOWLEDGED" } as const;
  }

  activePause(scope: string): PauseRecord | null {
    if (!PAUSE_SCOPES.has(scope)) return null;
    const record = this.state.pauses[scope];
    return record && record.resumedAt === null ? structuredClone(record) : null;
  }

  authorize(intent: ActionIntent, now: number) {
    const fingerprint = intentFingerprint(intent);
    const existingDecision = this.state.intentDecisions[intent.intentId];
    if (existingDecision) {
      if (existingDecision.fingerprint !== fingerprint) {
        return {
          allowed: false,
          code: "INTENT_ID_COLLISION",
          risk: existingDecision.decision.risk,
        } as const;
      }
      if (!Number.isFinite(intent.expiresAt) || intent.expiresAt <= now) {
        return { allowed: false, code: "INTENT_EXPIRED", risk: existingDecision.decision.risk } as const;
      }
      const pausedScopes = this.activePausedScopes();
      if (pausedScopes.includes("all")) {
        return { allowed: false, code: "PAUSED_ALL", risk: existingDecision.decision.risk } as const;
      }
      if (pausedScopes.includes("release")) {
        return { allowed: false, code: "PAUSED_RELEASE", risk: existingDecision.decision.risk } as const;
      }
      if (
        (intent.action === "sandbox.execute" || intent.action === "coding.patch.sandbox") &&
        pausedScopes.includes("coding")
      ) {
        return { allowed: false, code: "PAUSED_CODING", risk: existingDecision.decision.risk } as const;
      }
      if (existingDecision.capabilityId) {
        const currentCapability = this.state.capabilities[existingDecision.capabilityId];
        if (!currentCapability) {
          return { allowed: false, code: "CAPABILITY_REQUIRED", risk: existingDecision.decision.risk } as const;
        }
        if (currentCapability.revokedAt !== null) {
          return { allowed: false, code: "CAPABILITY_REVOKED", risk: existingDecision.decision.risk } as const;
        }
        if (currentCapability.expiresAt <= now) {
          return { allowed: false, code: "CAPABILITY_EXPIRED", risk: existingDecision.decision.risk } as const;
        }
      }
      return {
        allowed: true,
        code: "INTENT_ALREADY_AUTHORIZED",
        risk: existingDecision.decision.risk,
      } as const;
    }
    const capability = intent.capabilityId
      ? (this.state.capabilities[intent.capabilityId] ?? null)
      : null;
    const decision = authorizeIntent(intent, {
      now,
      binding: this.state.binding,
      pausedScopes: this.activePausedScopes(),
      consumedNonces: this.state.consumedNonces,
      capability,
    });
    if (decision.allowed) {
      this.state.consumedNonces.push(intent.nonce);
      if (capability) capability.usedAt = now;
      this.state.intentDecisions[intent.intentId] = {
        fingerprint,
        expiresAt: intent.expiresAt,
        capabilityId: intent.capabilityId ?? null,
        decision: {
          allowed: true,
          code: decision.code,
          risk: decision.risk,
        },
      };
      this.state.sequence += 1;
    }
    return decision;
  }

  reserveModel(request: ModelBudgetRequest, now: number) {
    const windowId = utcWindowId(now);
    if (this.state.budget.windowId !== windowId) {
      this.state.budget.windowId = windowId;
      this.state.budget.usedUnits = 0;
      this.state.budget.reservations = {};
      this.state.sequence += 1;
    }
    const existingReservation = this.state.budget.reservations[request.requestId] ?? null;
    const decision = reserveModelBudget(request, {
      binding: this.state.binding,
      pausedScopes: this.activePausedScopes(),
      usedUnits: this.state.budget.usedUnits,
      maxUnits: this.state.budget.maxUnits,
      existingReservation,
    });
    if (decision.allowed && decision.code === "MODEL_BUDGET_RESERVED") {
      this.state.budget.usedUnits = decision.usedUnits;
      this.state.budget.reservations[request.requestId] = {
        requestId: request.requestId,
        model: request.model,
        estimatedUnits: request.estimatedUnits,
      };
      this.state.sequence += 1;
    }
    return { ...decision, windowId };
  }

  pause(scope: string, now: number, subject: string, pauseId = `pause-test-${now}`) {
    if (!PAUSE_SCOPES.has(scope)) return { ok: false, code: "PAUSE_SCOPE_INVALID" } as const;
    if (!/^pause-[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(pauseId)) {
      return { ok: false, code: "PAUSE_ID_INVALID" } as const;
    }
    const current = this.state.pauses[scope];
    if (current && current.resumedAt === null) {
      return { ok: true, code: "SCOPE_ALREADY_PAUSED", pause: structuredClone(current) } as const;
    }
    this.state.pauses[scope] = {
      pauseId,
      pausedAt: now,
      pausedBy: subject,
      binding: structuredClone(this.state.binding),
      deploymentManifestSha256: this.state.deploymentManifestSha256,
      rollbackBoundary: this.state.rollbackBoundary,
      resumedAt: null,
      resumedBy: null,
      recoveryReceipt: null,
    };
    this.state.admissionGeneration += 1;
    this.state.sequence += 1;
    return {
      ok: true,
      code: "SCOPE_PAUSED",
      pause: structuredClone(this.state.pauses[scope]),
    } as const;
  }

  resume(
    scope: string,
    now: number,
    subject: string,
    pauseId: string,
    recoveryAuthorization: VerifiedRecoveryAuthorization,
  ) {
    if (!PAUSE_SCOPES.has(scope)) return { ok: false, code: "PAUSE_SCOPE_INVALID" } as const;
    const current = this.state.pauses[scope];
    if (!current || current.resumedAt !== null) {
      return { ok: false, code: "SCOPE_NOT_PAUSED" } as const;
    }
    if (current.pauseId !== pauseId) {
      return { ok: false, code: "RECOVERY_PAUSE_MISMATCH" } as const;
    }
    if (
      !recoveryAuthorization ||
      !validBinding(recoveryAuthorization.currentBinding) ||
      !validDigest(recoveryAuthorization.currentDeploymentManifestSha256) ||
      !Number.isSafeInteger(recoveryAuthorization.currentReleaseEpoch) ||
      recoveryAuthorization.currentReleaseEpoch < 0 ||
      !validRollbackBoundary(recoveryAuthorization.currentRollbackBoundary) ||
      !/^sha256:[a-f0-9]{64}$/.test(recoveryAuthorization.receiptHash)
    ) {
      return { ok: false, code: "RECOVERY_RECEIPT_INVALID" } as const;
    }
    if (
      !bindingMatches(recoveryAuthorization.currentBinding, this.state.binding) ||
      recoveryAuthorization.currentDeploymentManifestSha256 !==
        this.state.deploymentManifestSha256 ||
      recoveryAuthorization.currentReleaseEpoch !== this.state.activeReleaseEpoch ||
      recoveryAuthorization.currentRollbackBoundary !== this.state.rollbackBoundary
    ) {
      return { ok: false, code: "RECOVERY_CURRENT_RELEASE_MISMATCH" } as const;
    }
    if (this.state.usedRecoveryReceipts.includes(recoveryAuthorization.receiptHash)) {
      return { ok: false, code: "RECOVERY_RECEIPT_INVALID" } as const;
    }
    const windowId = utcWindowId(now);
    if (
      this.state.budget.windowId !== "" &&
      this.state.budget.windowId !== windowId
    ) {
      this.state.budget.windowId = windowId;
      this.state.budget.usedUnits = 0;
      this.state.budget.reservations = {};
    }
    if (
      scope === "all" &&
      this.state.budget.usedUnits > this.state.budget.maxUnits
    ) {
      const replacement: PauseRecord = {
        pauseId: `pause-budget-invariant-${this.state.sequence + 1}`,
        pausedAt: now,
        pausedBy: "authority:budget-invariant",
        binding: structuredClone(this.state.binding),
        deploymentManifestSha256: this.state.deploymentManifestSha256,
        rollbackBoundary: this.state.rollbackBoundary,
        resumedAt: null,
        resumedBy: null,
        recoveryReceipt: null,
      };
      this.state.usedRecoveryReceipts.push(recoveryAuthorization.receiptHash);
      this.state.pauses.all = replacement;
      this.state.admissionGeneration += 1;
      this.state.sequence += 1;
      return {
        ok: false,
        code: "BUDGET_INVARIANT_REPAUSED",
        pause: structuredClone(replacement),
      } as const;
    }
    current.resumedAt = now;
    current.resumedBy = subject;
    current.recoveryReceipt = recoveryAuthorization.receiptHash;
    this.state.usedRecoveryReceipts.push(recoveryAuthorization.receiptHash);
    this.state.admissionGeneration += 1;
    this.state.sequence += 1;
    return { ok: true, code: "SCOPE_RESUMED" } as const;
  }

  revokeCapability(capabilityId: string, now: number) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(capabilityId)) {
      return { ok: false, code: "CAPABILITY_ID_INVALID" } as const;
    }
    const capability = this.state.capabilities[capabilityId];
    if (!capability) return { ok: false, code: "CAPABILITY_NOT_FOUND" } as const;
    if (capability.revokedAt !== null) {
      return { ok: true, code: "CAPABILITY_ALREADY_REVOKED" } as const;
    }
    capability.revokedAt = now;
    this.state.sequence += 1;
    return { ok: true, code: "CAPABILITY_REVOKED" } as const;
  }

  private activePausedScopes(): string[] {
    return Object.entries(this.state.pauses)
      .filter(([, record]) => record.resumedAt === null)
      .map(([scope]) => scope)
      .sort();
  }
}

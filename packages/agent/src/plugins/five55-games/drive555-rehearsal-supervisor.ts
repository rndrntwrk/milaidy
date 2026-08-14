import { randomUUID } from "node:crypto";
import type {
  AliceReactionDecision,
  AliceReactionKind,
} from "./alice-reaction-bridge.js";
import type {
  AcquireGameLeaseRequestPort,
  GameControlCommand,
  GameControlDescriptor,
  GameControlIntentPort,
  GameControlLeasePort,
  GameControlReceiptPort,
  GameControlReleaseReceiptPort,
  GameControlReleaseRequestPort,
  GameLeaseAcquireAckPort,
  GameLeaseRenewAckPort,
  GameLeaseRenewRequestPort,
  ControllerArtifactManifestPort,
  GameplayCapabilitiesPort,
  GameplayClientPort,
  GameplayEvidenceContextPort,
  GameplayEvidenceHandlersPort,
  GameplayEvidenceWindowAckPort,
  GameplayLifecycleResultPort,
  GameplayRunStatePort,
  InitialGameStartRequestPort,
  InitialGameStartResultPort,
  RawGameSamplePort,
} from "./gameplay-client-port.js";

export interface NormalizedGameplayObservationPort {
  gameRunId: string;
  sourceId: string;
  fence: number;
  controlOwnerType: "agent" | "certification_harness" | null;
  sourceObservationSequence: number;
  sourceObservationDigest: string;
  observedAtAuthorityMs: number;
  gameState: Record<string, unknown>;
  appliedControls?: Record<string, boolean | number>;
  appliedDecision?: RawGameSamplePort["appliedDecision"];
}

export interface GameAdapterPort {
  normalizeObservation(
    raw: RawGameSamplePort,
    binding: GameplayCapabilitiesPort["binding"],
    runtime: GameplayCapabilitiesPort["runtimeProvenance"],
    evidence: GameplayEvidenceContextPort | null,
  ): NormalizedGameplayObservationPort;
}

export interface GameplayDirectivePort {
  gameRunId: string;
  leaseId: string;
  fence: number;
  directiveId: string;
  directiveDigest: string;
  goal: string;
  strategyFamily: string;
  gameplayPolicyId: string;
  gameplayPolicyVersion: number;
  gameplayPolicyDigest: string;
  policySnapshot: Record<string, unknown>;
  recoveryPolicy: Record<string, unknown>;
  memoryProvenanceIds: string[];
  issuedAtAgentMonotonicMs: number;
  validForMs: number;
  agentClockDomainId: string;
}

export interface DeterministicControllerPort {
  initialState(policySnapshot: Record<string, unknown>): unknown;
  decide(input: {
    observation: NormalizedGameplayObservationPort;
    directive: GameplayDirectivePort;
    state: unknown;
    clock: { nowMs(): number };
  }): { intent: GameControlIntentPort; nextState: unknown };
}

export interface GameplayPolicyPort {
  policyId: string;
  policyVersion: number;
  policyDigest: string;
  strategyFamily: string;
  snapshot: Record<string, unknown>;
  recoveryPolicy: Record<string, unknown>;
}

export interface AliceGameplayReflectionPort {
  persistControlReflection(value: {
    gameRunId: string;
    sourceId: string;
    fence: number;
    decisionId: string;
    directiveId: string;
    sourceObservationSequence: number;
    rawObservationDigest: string;
    reflectedReceiptId: string;
    reflectedObservationSequence: number;
  }): Promise<void>;
}

/**
 * Alice owns durable mastery outcomes; gameplay transport only supplies the
 * receipt/raw evidence that makes an outcome eligible to learn from.
 */
export interface AliceGameplayMasteryPort {
  persistVerifiedMasteryOutcome(value: {
    gameId: string;
    gameRunId: string;
    sourceId: string;
    fence: number;
    goal: string;
    strategyFamily: string;
    gameplayPolicyId: string;
    gameplayPolicyVersion: number;
    gameplayPolicyDigest: string;
    directiveId: string;
    directiveDigest: string;
    controllerId: string;
    controllerVersion: string;
    controllerDigest: string;
    decisionId: string;
    baselineSourceObservationSequence: number;
    reflectedSourceObservationSequence: number;
    rawObservationDigest: string;
    reflectedReceiptId: string;
  }): Promise<void>;
}

export type AliceGameplayPersistencePort = AliceGameplayReflectionPort & AliceGameplayMasteryPort;

export interface AliceReactionPort {
  persistThenBroadcast(
    sessionId: string,
    decision: AliceReactionDecision,
  ): Promise<void>;
}

export interface AliceAdsPort {
  triggerAdBreak(
    adId: string,
    options: { duration: number },
    sessionId: string,
  ): Promise<{ graphicId: string; layout: string; duration: number }>;
}

export interface GameplayRehearsalProfile {
  gameId: string;
  reactionKindFor(
    baseline: NormalizedGameplayObservationPort,
    reflected: NormalizedGameplayObservationPort,
  ): AliceReactionKind;
}

export interface GameplayRehearsalDependencies {
  client: GameplayClientPort;
  gameplay: {
    adapter: GameAdapterPort;
    controller: DeterministicControllerPort;
  };
  policy: GameplayPolicyPort;
  expectedArtifacts: {
    bridgeDigest: string;
    adapterManifestDigest: string;
    controllerDigest: string;
    sourceAnchorDigest: string;
    initialFixtureDigest: string;
  };
  controllerArtifact: ControllerArtifactManifestPort;
  /** Supplied only by the digest-pinned local gameplay SDK bundle. */
  sha256GameplayCanonical(value: unknown): string;
  persistence: AliceGameplayPersistencePort;
  reactions?: AliceReactionPort;
  ads?: AliceAdsPort;
  createId?: () => string;
  nowMs?: () => number;
  observationTimeoutMs?: number;
}

export type Drive555RehearsalDependencies = GameplayRehearsalDependencies;

export interface GameplayRehearsalRequest {
  sessionId: string;
  gameRunId: string;
  goal: string;
  ad?: { adId: string; duration: number };
}

export interface GameplayRehearsalResult {
  gameRunId: string;
  decisionId: string;
  reflectedObservationSequence: number;
  ad?: { graphicId: string; layout: string; duration: number };
}

const DEFAULT_OBSERVATION_TIMEOUT_MS = 5_000;

class RehearsalFailure extends Error {
  constructor(
    readonly closeReason: string,
    message: string,
  ) {
    super(message);
    this.name = "RehearsalFailure";
  }
}

class SerializedEvidence {
  private tail: Promise<void> = Promise.resolve();

  enqueue(work: () => void | Promise<void>): Promise<void> {
    const next = this.tail.then(work, work);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

function isDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function assertDigest(value: string, field: string): void {
  if (!isDigest(value)) {
    throw new RehearsalFailure("rehearsal-failed", `${field} must be a lowercase SHA-256 digest`);
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (!value.trim()) {
    throw new RehearsalFailure("rehearsal-failed", `${field} must be non-empty`);
  }
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/.test(value);
}

function rawValidationFailure(message: string): RehearsalFailure {
  return new RehearsalFailure("rehearsal-failed", `invalid authoritative raw observation: ${message}`);
}

function omitRootField<T extends Record<string, unknown>>(
  value: T,
  field: string,
): Omit<T, typeof field> {
  const clone = { ...value };
  delete clone[field];
  return clone;
}

function assertCanonicalSelfDigest(
  value: object,
  field: string,
  sha256GameplayCanonical: (value: unknown) => string,
  label: string,
): void {
  const record = value as Record<string, unknown>;
  const claimed = record[field];
  if (typeof claimed !== "string" || !isDigest(claimed)) {
    throw new RehearsalFailure("rehearsal-failed", `${label} must carry a lowercase SHA-256 ${field}`);
  }
  const expected = sha256GameplayCanonical(omitRootField(record, field));
  assertDigest(expected, `gameplay SDK canonical ${field}`);
  if (claimed !== expected) {
    throw new RehearsalFailure("rehearsal-failed", `${label} ${field} does not bind its canonical payload`);
  }
}

/**
 * The Task9 websocket relay deliberately exposes a structural raw payload.
 * Validate the protocol's complete, self-authenticating envelope here before
 * it can become a controller baseline or Alice-owned reflection evidence.
 */
function validateRawGameSample(
  value: RawGameSamplePort,
  sha256GameplayCanonical: (value: unknown) => string,
): void {
  const raw = value as unknown as Record<string, unknown>;
  if (!isPlainRecord(raw)) throw rawValidationFailure("envelope must be a plain object");

  const required = [
    "gameRunId",
    "sourceId",
    "fence",
    "controlOwnerType",
    "bridgeVersion",
    "bridgeDigest",
    "rawSchemaVersion",
    "relaySequence",
    "sourceObservationSequence",
    "observedAtAuthorityMs",
    "rawState",
    "rawStateDigest",
    "rawEnvelopeDigest",
  ];
  const optional = new Set(["appliedControls", "appliedControlsDigest", "appliedDecision"]);
  for (const key of Object.keys(raw)) {
    if (!required.includes(key) && !optional.has(key)) {
      throw rawValidationFailure(`unexpected ${key} field`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(raw, key)) throw rawValidationFailure(`missing ${key} field`);
  }
  if (!isSafeIdentifier(raw.gameRunId) || !isSafeIdentifier(raw.sourceId)) {
    throw rawValidationFailure("gameRunId and sourceId must be safe identifiers");
  }
  if (
    !isNonNegativeSafeInteger(raw.fence) ||
    (raw.controlOwnerType !== null &&
      raw.controlOwnerType !== "agent" &&
      raw.controlOwnerType !== "certification_harness") ||
    typeof raw.bridgeVersion !== "string" ||
    raw.bridgeVersion.length === 0 ||
    typeof raw.rawSchemaVersion !== "string" ||
    raw.rawSchemaVersion.length === 0 ||
    !isDigest(typeof raw.bridgeDigest === "string" ? raw.bridgeDigest : "") ||
    !isNonNegativeSafeInteger(raw.relaySequence) ||
    !isPositiveSafeInteger(raw.sourceObservationSequence) ||
    !isNonNegativeSafeInteger(raw.observedAtAuthorityMs) ||
    !isPlainRecord(raw.rawState) ||
    !isDigest(typeof raw.rawStateDigest === "string" ? raw.rawStateDigest : "") ||
    !isDigest(typeof raw.rawEnvelopeDigest === "string" ? raw.rawEnvelopeDigest : "")
  ) {
    throw rawValidationFailure("required fields are malformed");
  }

  let computedRawStateDigest: string;
  try {
    computedRawStateDigest = sha256GameplayCanonical(raw.rawState);
  } catch (error) {
    throw rawValidationFailure(
      `rawState is not canonical (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (!isDigest(computedRawStateDigest) || raw.rawStateDigest !== computedRawStateDigest) {
    throw rawValidationFailure("rawStateDigest does not bind rawState");
  }

  const hasControls = Object.hasOwn(raw, "appliedControls");
  const hasControlsDigest = Object.hasOwn(raw, "appliedControlsDigest");
  if (hasControls !== hasControlsDigest) {
    throw rawValidationFailure("applied controls and digest must be present together");
  }
  if (hasControls) {
    if (!isPlainRecord(raw.appliedControls)) {
      throw rawValidationFailure("appliedControls must be a plain object");
    }
    for (const [controlId, controlValue] of Object.entries(raw.appliedControls)) {
      if (
        !isSafeIdentifier(controlId) ||
        (typeof controlValue !== "boolean" &&
          (typeof controlValue !== "number" || !Number.isFinite(controlValue)))
      ) {
        throw rawValidationFailure("appliedControls is malformed");
      }
    }
    if (!isDigest(typeof raw.appliedControlsDigest === "string" ? raw.appliedControlsDigest : "")) {
      throw rawValidationFailure("appliedControlsDigest is malformed");
    }
    let computedControlsDigest: string;
    try {
      computedControlsDigest = sha256GameplayCanonical(raw.appliedControls);
    } catch (error) {
      throw rawValidationFailure(
        `appliedControls is not canonical (${error instanceof Error ? error.message : String(error)})`,
      );
    }
    if (!isDigest(computedControlsDigest) || raw.appliedControlsDigest !== computedControlsDigest) {
      throw rawValidationFailure("appliedControlsDigest does not bind appliedControls");
    }
  }

  if (Object.hasOwn(raw, "appliedDecision")) {
    const decision = raw.appliedDecision;
    if (!isPlainRecord(decision)) throw rawValidationFailure("appliedDecision must be a plain object");
    const decisionKeys = [
      "leaseId",
      "fence",
      "ownerType",
      "directiveId",
      "decisionId",
      "semanticIntentDigest",
      "mappedControlsDigest",
      "appliedControlsDigest",
    ];
    if (
      Object.keys(decision).length !== decisionKeys.length ||
      decisionKeys.some((key) => !Object.hasOwn(decision, key)) ||
      !isSafeIdentifier(decision.leaseId) ||
      !isPositiveSafeInteger(decision.fence) ||
      (decision.ownerType !== "agent" && decision.ownerType !== "certification_harness") ||
      !isSafeIdentifier(decision.directiveId) ||
      !isSafeIdentifier(decision.decisionId) ||
      !isDigest(typeof decision.semanticIntentDigest === "string" ? decision.semanticIntentDigest : "") ||
      !isDigest(typeof decision.mappedControlsDigest === "string" ? decision.mappedControlsDigest : "") ||
      !isDigest(typeof decision.appliedControlsDigest === "string" ? decision.appliedControlsDigest : "") ||
      !hasControls ||
      decision.appliedControlsDigest !== raw.appliedControlsDigest ||
      decision.fence !== raw.fence ||
      decision.ownerType !== raw.controlOwnerType
    ) {
      throw rawValidationFailure("appliedDecision does not match the atomic authority/control snapshot");
    }
  }
  if (raw.controlOwnerType === null && Object.hasOwn(raw, "appliedDecision")) {
    throw rawValidationFailure("null authority cannot carry an applied decision");
  }

  const envelopeForDigest = { ...raw };
  delete envelopeForDigest.rawEnvelopeDigest;
  delete envelopeForDigest.relaySequence;
  let computedEnvelopeDigest: string;
  try {
    computedEnvelopeDigest = sha256GameplayCanonical(envelopeForDigest);
  } catch (error) {
    throw rawValidationFailure(
      `raw envelope is not canonical (${error instanceof Error ? error.message : String(error)})`,
    );
  }
  if (!isDigest(computedEnvelopeDigest) || raw.rawEnvelopeDigest !== computedEnvelopeDigest) {
    throw rawValidationFailure("rawEnvelopeDigest does not bind the protocol envelope");
  }
}

function validateLease(lease: GameControlLeasePort, label: string): void {
  if (
    !lease.leaseId ||
    !lease.gameRunId ||
    !isPositiveSafeInteger(lease.fence) ||
    !isNonNegativeSafeInteger(lease.acquiredAtAuthorityMs) ||
    !isPositiveSafeInteger(lease.expiresAtAuthorityMs) ||
    lease.expiresAtAuthorityMs <= lease.acquiredAtAuthorityMs ||
    !isPositiveSafeInteger(lease.renewalIntervalMs)
  ) {
    throw new RehearsalFailure("rehearsal-failed", `${label} is malformed`);
  }
}

function descriptorNeutralCommand(descriptor: GameControlDescriptor): GameControlCommand {
  if (descriptor.kind === "digital") {
    return { kind: "digital", controlId: descriptor.id, pressed: false };
  }
  if (descriptor.kind === "analog") {
    return { kind: "analog", controlId: descriptor.id, value: descriptor.neutral };
  }
  throw new RehearsalFailure(
    "rehearsal-failed",
    "a pointer control has no complete-snapshot neutral release command",
  );
}

function controlValuesAreNeutral(
  raw: RawGameSamplePort,
  descriptors: GameControlDescriptor[],
): boolean {
  if (!raw.appliedControls || !isDigest(raw.appliedControlsDigest ?? "")) return false;
  const expectedIds = new Set(descriptors.map((descriptor) => descriptor.id));
  const actualIds = Object.keys(raw.appliedControls);
  if (actualIds.length !== expectedIds.size || actualIds.some((id) => !expectedIds.has(id))) {
    return false;
  }
  return descriptors.every((descriptor) => {
    const actual = raw.appliedControls?.[descriptor.id];
    if (descriptor.kind === "digital") return actual === false;
    if (descriptor.kind === "analog") return actual === descriptor.neutral;
    return false;
  });
}

function sameControlIdentity(
  receipt: Pick<
    GameControlReceiptPort,
    | "gameRunId"
    | "leaseId"
    | "fence"
    | "ownerType"
    | "directiveId"
    | "decisionId"
    | "semanticIntentDigest"
    | "sourceId"
  >,
  intent: GameControlIntentPort,
  sourceId: string,
): boolean {
  return (
    receipt.gameRunId === intent.gameRunId &&
    receipt.leaseId === intent.leaseId &&
    receipt.fence === intent.fence &&
    receipt.ownerType === "agent" &&
    receipt.directiveId === intent.directiveId &&
    receipt.decisionId === intent.decisionId &&
    receipt.semanticIntentDigest === intent.semanticIntentDigest &&
    receipt.sourceId === sourceId
  );
}

function rawMatchesTrustedRuntime(
  raw: RawGameSamplePort,
  runtime: GameplayCapabilitiesPort["runtime"],
  runtimeProvenance: GameplayCapabilitiesPort["runtimeProvenance"],
): boolean {
  return (
    raw.bridgeVersion === runtime.bridgeVersion &&
    raw.bridgeDigest === runtime.bridgeDigest &&
    raw.rawSchemaVersion === runtimeProvenance.rawSchemaVersion &&
    isNonNegativeSafeInteger(raw.relaySequence) &&
    isPositiveSafeInteger(raw.sourceObservationSequence)
  );
}

class EvidenceInbox {
  private readonly rawObservations: RawGameSamplePort[] = [];
  private readonly receipts: Array<GameControlReceiptPort | GameControlReleaseReceiptPort> = [];
  private readonly lifecycleResults: GameplayLifecycleResultPort[] = [];
  private readonly waiters = new Set<() => void>();
  private failure: RehearsalFailure | undefined;
  private expectedInitialStartResultDigest: string | undefined;

  constructor(private readonly validateRaw: (value: RawGameSamplePort) => void) {}

  addRaw(value: RawGameSamplePort): void {
    try {
      this.validateRaw(value);
    } catch (error) {
      this.fail(
        error instanceof RehearsalFailure
          ? error
          : new RehearsalFailure(
              "rehearsal-failed",
              `invalid authoritative raw observation: ${error instanceof Error ? error.message : String(error)}`,
            ),
      );
      return;
    }
    this.rawObservations.push(value);
    this.signal();
  }

  addReceipt(value: GameControlReceiptPort | GameControlReleaseReceiptPort): void {
    this.receipts.push(value);
    this.signal();
  }

  addLifecycleResult(value: GameplayLifecycleResultPort): void {
    if (
      value.protocolVersion !== "gameplay.v1" ||
      value.event !== "game.lifecycle.result" ||
      !value.gameRunId ||
      !value.sessionId
    ) {
      this.fail(new RehearsalFailure("rehearsal-failed", "invalid gameplay lifecycle result"));
      return;
    }
    this.lifecycleResults.push(value);
    if (
      value.resultKind === "initial_start" &&
      this.expectedInitialStartResultDigest !== undefined &&
      value.result.resultDigest !== this.expectedInitialStartResultDigest
    ) {
      this.fail(
        new RehearsalFailure(
          "rehearsal-failed",
          "initial-start lifecycle evidence does not match the authority result",
        ),
      );
      return;
    }
    this.signal();
  }

  fail(error: RehearsalFailure): void {
    if (!this.failure) this.failure = error;
    this.signal();
  }

  setExpectedInitialStartResult(
    sessionId: string,
    gameRunId: string,
    resultDigest: string,
  ): void {
    this.expectedInitialStartResultDigest = resultDigest;
    for (const value of this.lifecycleResults) {
      if (value.resultKind !== "initial_start") continue;
      if (
        value.sessionId !== sessionId ||
        value.gameRunId !== gameRunId ||
        value.result.resultDigest !== resultDigest
      ) {
        this.fail(
          new RehearsalFailure(
            "rehearsal-failed",
            "initial-start lifecycle evidence does not match the authority result",
          ),
        );
      }
    }
    this.signal();
  }

  async waitForInitialStart(
    sessionId: string,
    gameRunId: string,
    resultDigest: string,
    timeoutMs: number,
  ): Promise<void> {
    await this.waitFor(
      () => {
        const result = this.lifecycleResults.find(
          (value) =>
            value.resultKind === "initial_start" &&
            value.sessionId === sessionId &&
            value.gameRunId === gameRunId &&
            value.result.resultDigest === resultDigest,
        );
        return result ? true : undefined;
      },
      timeoutMs,
      "initial-start lifecycle evidence",
    );
  }

  async waitForRaw(
    predicate: (value: RawGameSamplePort) => boolean,
    timeoutMs: number,
  ): Promise<RawGameSamplePort> {
    return this.waitFor(
      () => {
        const matches = this.rawObservations.filter(predicate);
        if (matches.length === 0) return undefined;
        return matches.reduce((latest, candidate) =>
          candidate.relaySequence > latest.relaySequence ||
          (candidate.relaySequence === latest.relaySequence &&
            candidate.sourceObservationSequence > latest.sourceObservationSequence)
            ? candidate
            : latest,
        );
      },
      timeoutMs,
      "authoritative raw observation",
    );
  }

  async waitForControlProof(
    intent: GameControlIntentPort,
    sourceId: string,
    runtime: GameplayCapabilitiesPort["runtime"],
    runtimeProvenance: GameplayCapabilitiesPort["runtimeProvenance"],
    timeoutMs: number,
  ): Promise<{ receipt: GameControlReceiptPort; raw: RawGameSamplePort }> {
    return this.waitFor(
      () => {
        const matching = this.receipts.filter(
          (value): value is GameControlReceiptPort => "decisionId" in value && value.decisionId === intent.decisionId,
        );
        for (const receipt of matching) {
          if (!sameControlIdentity(receipt, intent, sourceId)) {
            throw new RehearsalFailure(
              "rehearsal-failed",
              "control receipt identity does not match the fenced decision",
            );
          }
          if (receipt.state === "rejected") {
            throw new RehearsalFailure(
              "rehearsal-failed",
              `control was rejected (${receipt.rejectionCode ?? "unknown"})`,
            );
          }
        }
        const expectedStages = ["accepted", "enqueued", "injected", "reflected"] as const;
        const stageReceipts = expectedStages.map((stage) =>
          matching.find((receipt) => receipt.state === stage),
        );
        if (stageReceipts.some((receipt) => !receipt)) return undefined;
        const completeStages = stageReceipts as GameControlReceiptPort[];
        const mappedControlsDigest = completeStages[0]!.mappedControlsDigest;
        if (!isDigest(mappedControlsDigest)) {
          throw new RehearsalFailure("rehearsal-failed", "control receipt mapped controls digest is malformed");
        }
        for (const receipt of completeStages) {
          if (receipt.observationSequence !== intent.observationSequence) {
            throw new RehearsalFailure(
              "rehearsal-failed",
              "control receipt observation sequence does not match the controller intent",
            );
          }
          if (receipt.mappedControlsDigest !== mappedControlsDigest) {
            throw new RehearsalFailure(
              "rehearsal-failed",
              "control receipt mapped controls digest changes between stages",
            );
          }
          if (!isNonNegativeSafeInteger(receipt.relaySequence) || !isPositiveSafeInteger(receipt.stageSequence)) {
            throw new RehearsalFailure("rehearsal-failed", "control receipt stage ordering is malformed");
          }
        }
        for (let index = 1; index < completeStages.length; index += 1) {
          if (completeStages[index - 1]!.stageSequence >= completeStages[index]!.stageSequence) {
            throw new RehearsalFailure(
              "rehearsal-failed",
              "control receipt stages are not strictly ordered",
            );
          }
          if (completeStages[index - 1]!.relaySequence >= completeStages[index]!.relaySequence) {
            throw new RehearsalFailure(
              "rehearsal-failed",
              "control receipt relay stages are not strictly ordered",
            );
          }
        }
        const reflected = completeStages[3]!;
        const raw = this.rawObservations.find((candidate) => {
          const applied = candidate.appliedDecision;
          return (
            candidate.gameRunId === intent.gameRunId &&
            candidate.sourceId === sourceId &&
            rawMatchesTrustedRuntime(candidate, runtime, runtimeProvenance) &&
            candidate.fence === intent.fence &&
            candidate.controlOwnerType === "agent" &&
            candidate.appliedControls !== undefined &&
            candidate.appliedControlsDigest !== undefined &&
            applied !== undefined &&
            applied.leaseId === intent.leaseId &&
            applied.fence === intent.fence &&
            applied.ownerType === "agent" &&
            applied.directiveId === intent.directiveId &&
            applied.decisionId === intent.decisionId &&
            applied.semanticIntentDigest === intent.semanticIntentDigest &&
            applied.mappedControlsDigest === mappedControlsDigest &&
            applied.appliedControlsDigest === candidate.appliedControlsDigest &&
            reflected.appliedControlsDigest === candidate.appliedControlsDigest &&
            candidate.relaySequence > reflected.relaySequence &&
            (reflected.reflectedObservationSequence === undefined ||
              reflected.reflectedObservationSequence === candidate.sourceObservationSequence)
          );
        });
        return raw ? { receipt: reflected, raw } : undefined;
      },
      timeoutMs,
      "injected/reflected control evidence and matching authoritative raw observation",
    );
  }

  async waitForNeutralReleaseProof(
    request: GameControlReleaseRequestPort,
    sourceId: string,
    descriptors: GameControlDescriptor[],
    runtime: GameplayCapabilitiesPort["runtime"],
    runtimeProvenance: GameplayCapabilitiesPort["runtimeProvenance"],
    timeoutMs: number,
  ): Promise<void> {
    await this.waitFor(
      () => {
        const matching = this.receipts.filter(
          (value): value is GameControlReleaseReceiptPort => "releaseId" in value && value.releaseId === request.releaseId,
        );
        for (const receipt of matching) {
          if (
            receipt.gameRunId !== request.gameRunId ||
            receipt.leaseId !== request.leaseId ||
            receipt.fence !== request.fence ||
            receipt.ownerType !== "agent" ||
            receipt.directiveId !== request.directiveId ||
            receipt.observationSequence !== request.observationSequence ||
            receipt.releaseDigest !== request.releaseDigest ||
            receipt.neutralSemanticIntentDigest !== request.neutralSemanticIntentDigest ||
            receipt.neutralMappedControlsDigest !== request.neutralMappedControlsDigest ||
            receipt.sourceId !== sourceId
          ) {
            throw new RehearsalFailure(
              "rehearsal-failed",
              "neutral release receipt identity does not match the fenced release",
            );
          }
          if (receipt.state === "rejected") {
            throw new RehearsalFailure(
              "rehearsal-failed",
              `neutral release was rejected (${receipt.rejectionCode ?? "unknown"})`,
            );
          }
        }
        const expectedStages = ["accepted", "enqueued", "injected", "reflected"] as const;
        const stageReceipts = expectedStages.map((stage) =>
          matching.find((receipt) => receipt.state === stage),
        );
        if (stageReceipts.some((receipt) => !receipt)) return undefined;
        const completeStages = stageReceipts as GameControlReleaseReceiptPort[];
        for (const receipt of completeStages) {
          if (!isNonNegativeSafeInteger(receipt.relaySequence) || !isPositiveSafeInteger(receipt.stageSequence)) {
            throw new RehearsalFailure("rehearsal-failed", "neutral release receipt stage ordering is malformed");
          }
        }
        for (let index = 1; index < completeStages.length; index += 1) {
          if (completeStages[index - 1]!.stageSequence >= completeStages[index]!.stageSequence) {
            throw new RehearsalFailure(
              "rehearsal-failed",
              "neutral release receipt stages are not strictly ordered",
            );
          }
          if (completeStages[index - 1]!.relaySequence >= completeStages[index]!.relaySequence) {
            throw new RehearsalFailure(
              "rehearsal-failed",
              "neutral release receipt relay stages are not strictly ordered",
            );
          }
        }
        const reflected = completeStages[3]!;
        const raw = this.rawObservations.find(
          (candidate) =>
            candidate.gameRunId === request.gameRunId &&
            candidate.sourceId === sourceId &&
            rawMatchesTrustedRuntime(candidate, runtime, runtimeProvenance) &&
            candidate.fence === request.fence &&
            candidate.controlOwnerType === "agent" &&
            candidate.appliedDecision === undefined &&
            candidate.appliedControlsDigest !== undefined &&
            candidate.appliedControlsDigest === reflected.neutralAppliedControlsDigest &&
            controlValuesAreNeutral(candidate, descriptors) &&
            candidate.relaySequence > reflected.relaySequence &&
            (reflected.reflectedObservationSequence === undefined ||
              reflected.reflectedObservationSequence === candidate.sourceObservationSequence),
        );
        return raw ? true : undefined;
      },
      timeoutMs,
      "complete neutral release evidence and matching all-neutral raw observation",
    );
  }

  private async waitFor<T>(
    read: () => T | undefined,
    timeoutMs: number,
    description: string,
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (this.failure) throw this.failure;
      const value = read();
      if (value !== undefined) return value;
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new RehearsalFailure(
          "rehearsal-failed",
          `timed out waiting for ${description}`,
        );
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.waiters.delete(wake);
          resolve();
        }, remaining);
        const wake = () => {
          clearTimeout(timer);
          this.waiters.delete(wake);
          resolve();
        };
        this.waiters.add(wake);
      });
    }
  }

  private signal(): void {
    for (const wake of this.waiters) wake();
  }
}

function validateCapabilities(
  capabilities: GameplayCapabilitiesPort,
  request: GameplayRehearsalRequest,
  profile: GameplayRehearsalProfile,
  expectedArtifacts: GameplayRehearsalDependencies["expectedArtifacts"],
): void {
  const { binding, manifest, runtime, runtimeProvenance, certificationCandidate } = capabilities;
  if (
    capabilities.protocolVersion !== "gameplay.v1" ||
    capabilities.sessionId !== request.sessionId ||
    capabilities.gameRunId !== request.gameRunId ||
    binding.gameRunId !== request.gameRunId ||
    binding.gameId !== profile.gameId ||
    capabilities.controlMode !== "fenced_agent_v1" ||
    binding.controlMode !== "fenced_agent_v1"
  ) {
    throw new RehearsalFailure("rehearsal-failed", "gameplay capabilities do not match this rehearsal binding");
  }
  if (
    manifest.gameId !== profile.gameId ||
    runtime.nativeFenceEnforcement !== true ||
    runtime.appliedControls !== true ||
    runtime.observationSchemaVersion !== manifest.observationSchemaVersion ||
    runtime.controlSchemaVersion !== manifest.controlSchemaVersion ||
    runtime.commandSemantics !== manifest.controls.commandSemantics ||
    runtime.maximumIntentAgeMs !== manifest.controls.maximumIntentAgeMs ||
    runtime.maximumHoldMs !== manifest.controls.maximumHoldMs ||
    runtime.maximumSilenceMs !== manifest.controls.maximumSilenceMs ||
    runtimeProvenance.bridgeId !== runtime.bridgeId ||
    runtimeProvenance.bridgeVersion !== runtime.bridgeVersion ||
    runtimeProvenance.bridgeDigest !== runtime.bridgeDigest ||
    runtime.bridgeDigest !== expectedArtifacts.bridgeDigest ||
    runtimeProvenance.adapterVersion !== manifest.adapterVersion ||
    runtimeProvenance.rawSchemaVersion !== manifest.observations.stateSchemaId ||
    runtimeProvenance.adapterManifestDigest !== expectedArtifacts.adapterManifestDigest ||
    certificationCandidate.gameId !== profile.gameId ||
    certificationCandidate.environment !== "local-composition" ||
    certificationCandidate.bridgeDigest !== expectedArtifacts.bridgeDigest ||
    certificationCandidate.adapterManifestDigest !== expectedArtifacts.adapterManifestDigest ||
    certificationCandidate.controllerDigest !== expectedArtifacts.controllerDigest ||
    certificationCandidate.sourceAnchorDigest !== expectedArtifacts.sourceAnchorDigest ||
    certificationCandidate.initialFixtureDigest !== expectedArtifacts.initialFixtureDigest ||
    !isDigest(certificationCandidate.candidateDigest)
  ) {
    throw new RehearsalFailure("rehearsal-failed", "gameplay capabilities are not the pinned native adapter/controller candidate");
  }
  if (
    runtime.controls.length !== manifest.controls.descriptors.length ||
    runtime.controls.some((descriptor, index) => descriptor.id !== manifest.controls.descriptors[index]?.id)
  ) {
    throw new RehearsalFailure("rehearsal-failed", "runtime controls do not match the frozen adapter manifest");
  }
}

function validateControllerArtifact(
  artifact: ControllerArtifactManifestPort,
  expectedArtifacts: GameplayRehearsalDependencies["expectedArtifacts"],
  sha256GameplayCanonical: GameplayRehearsalDependencies["sha256GameplayCanonical"],
): void {
  if (
    artifact.schemaVersion !== "gameplay-controller-artifact.v1" ||
    !artifact.packageName ||
    !artifact.controllerId ||
    !artifact.controllerVersion ||
    !artifact.entrypoint ||
    artifact.files.length === 0 ||
    artifact.artifactDigest !== expectedArtifacts.controllerDigest ||
    artifact.files.some((file) => !file.path || !isDigest(file.sha256))
  ) {
    throw new RehearsalFailure("rehearsal-failed", "controller artifact manifest is not the pinned controller artifact");
  }
  assertCanonicalSelfDigest(
    artifact,
    "artifactDigest",
    sha256GameplayCanonical,
    "controller artifact manifest",
  );
}

function validateEvidenceWindow(
  ack: GameplayEvidenceWindowAckPort,
  request: {
    transitionId: string;
    requestDigest: string;
    gameRunId: string;
    bindingId: string;
    leaseId: string;
    fence: number;
    directive: GameplayDirectivePort;
    certificationCandidateDigest: string;
  },
  capabilities: GameplayCapabilitiesPort,
  expectedArtifacts: GameplayRehearsalDependencies["expectedArtifacts"],
  controllerArtifact: ControllerArtifactManifestPort,
  sha256GameplayCanonical: GameplayRehearsalDependencies["sha256GameplayCanonical"],
): void {
  const context = ack.context;
  if (
    ack.protocolVersion !== "gameplay.v1" ||
    ack.transitionId !== request.transitionId ||
    ack.requestDigest !== request.requestDigest ||
    ack.state !== "controlling" ||
    ack.sessionId !== capabilities.sessionId ||
    ack.gameRunId !== request.gameRunId ||
    ack.bindingId !== request.bindingId ||
    ack.leaseId !== request.leaseId ||
    ack.ownerType !== "agent" ||
    ack.fence !== request.fence ||
    context.binding.bindingId !== capabilities.binding.bindingId ||
    context.binding.gameRunId !== capabilities.binding.gameRunId ||
    context.binding.sourceId !== capabilities.binding.sourceId ||
    context.binding.gameId !== capabilities.binding.gameId ||
    context.runtime.runtimeProvenanceDigest !== capabilities.runtimeProvenance.runtimeProvenanceDigest ||
    context.runtime.bridgeDigest !== expectedArtifacts.bridgeDigest ||
    context.runtime.adapterManifestDigest !== expectedArtifacts.adapterManifestDigest ||
    context.execution.controllerId !== controllerArtifact.controllerId ||
    context.execution.controllerVersion !== controllerArtifact.controllerVersion ||
    context.execution.controllerDigest !== controllerArtifact.artifactDigest ||
    context.execution.controllerDigest !== expectedArtifacts.controllerDigest ||
    context.execution.gameplayPolicyId !== request.directive.gameplayPolicyId ||
    context.execution.gameplayPolicyVersion !== request.directive.gameplayPolicyVersion ||
    context.execution.gameplayPolicyDigest !== request.directive.gameplayPolicyDigest ||
    context.execution.directiveId !== request.directive.directiveId ||
    context.execution.directiveDigest !== request.directive.directiveDigest ||
    context.certificationCandidateDigest !== request.certificationCandidateDigest ||
    !isNonNegativeSafeInteger(ack.firstRelaySequence) ||
    !isPositiveSafeInteger(ack.firstSourceObservationSequence) ||
    !isNonNegativeSafeInteger(ack.openedAtAuthorityMs)
  ) {
    throw new RehearsalFailure("rehearsal-failed", "gameplay evidence window is not the admitted fenced control context");
  }
  assertCanonicalSelfDigest(
    context.execution,
    "executionProvenanceDigest",
    sha256GameplayCanonical,
    "gameplay execution provenance",
  );
  assertCanonicalSelfDigest(
    context,
    "contextDigest",
    sha256GameplayCanonical,
    "gameplay evidence context",
  );
  assertCanonicalSelfDigest(
    ack,
    "resultDigest",
    sha256GameplayCanonical,
    "gameplay evidence-window acknowledgement",
  );
}

function validateState(
  state: GameplayRunStatePort,
  capabilities: GameplayCapabilitiesPort,
): void {
  if (
    state.protocolVersion !== "gameplay.v1" ||
    state.sessionId !== capabilities.sessionId ||
    state.gameRunId !== capabilities.gameRunId ||
    state.bindingId !== capabilities.binding.bindingId ||
    state.sourceId !== capabilities.binding.sourceId
  ) {
    throw new RehearsalFailure("rehearsal-failed", "gameplay state does not match the frozen capabilities binding");
  }
}

function validateInitialGameStartResult(
  result: InitialGameStartResultPort,
  request: InitialGameStartRequestPort,
  capabilities: GameplayCapabilitiesPort,
  sha256GameplayCanonical: GameplayRehearsalDependencies["sha256GameplayCanonical"],
): void {
  const nativeRequestDigest = sha256GameplayCanonical({
    transitionId: request.transitionId,
    command: "start",
  });
  if (
    result.protocolVersion !== "gameplay.v1" ||
    result.transitionId !== request.transitionId ||
    result.requestDigest !== request.requestDigest ||
    result.state !== "game_started" ||
    result.gameRunId !== request.gameRunId ||
    result.bindingId !== request.bindingId ||
    result.gameRunId !== capabilities.gameRunId ||
    result.bindingId !== capabilities.binding.bindingId ||
    result.lifecycleResult.status !== "applied" ||
    result.lifecycleResult.command !== "start" ||
    result.lifecycleResult.transitionId !== request.transitionId ||
    result.lifecycleResult.requestDigest !== nativeRequestDigest ||
    result.lifecycleResult.requestDigest === request.requestDigest ||
    result.lifecycleResult.runBinding.externalGameRunId !== request.gameRunId ||
    !isPositiveSafeInteger(result.sourceObservationSequence) ||
    !isDigest(result.sourceObservationDigest) ||
    !isNonNegativeSafeInteger(result.startedAtAuthorityMs)
  ) {
    throw new RehearsalFailure("rehearsal-failed", "initial game start did not bind the authority request");
  }
  assertCanonicalSelfDigest(
    result.lifecycleResult,
    "resultDigest",
    sha256GameplayCanonical,
    "initial-start lifecycle result",
  );
  assertCanonicalSelfDigest(
    result.fixture,
    "fixtureDigest",
    sha256GameplayCanonical,
    "initial-start fixture",
  );
  assertCanonicalSelfDigest(
    result,
    "resultDigest",
    sha256GameplayCanonical,
    "initial game start result",
  );
}

function validateLeaseAcquireAck(
  ack: GameLeaseAcquireAckPort,
  request: AcquireGameLeaseRequestPort,
  capabilities: GameplayCapabilitiesPort,
  sha256GameplayCanonical: GameplayRehearsalDependencies["sha256GameplayCanonical"],
): void {
  if (
    ack.protocolVersion !== "gameplay.v1" ||
    ack.transitionId !== request.transitionId ||
    ack.requestDigest !== request.requestDigest ||
    ack.lease.gameRunId !== capabilities.gameRunId ||
    ack.lease.ownerType !== "agent" ||
    ack.lease.state !== "active" ||
    !isNonNegativeSafeInteger(ack.completedAtAuthorityMs)
  ) {
    throw new RehearsalFailure("rehearsal-failed", "gameplay lease acknowledgement did not bind the authority request");
  }
  validateLease(ack.lease, "gameplay lease acknowledgement");
  assertCanonicalSelfDigest(
    ack,
    "resultDigest",
    sha256GameplayCanonical,
    "gameplay lease acknowledgement",
  );
}

function validateLeaseRenewAck(
  ack: GameLeaseRenewAckPort,
  request: GameLeaseRenewRequestPort,
  lease: GameControlLeasePort,
  sha256GameplayCanonical: GameplayRehearsalDependencies["sha256GameplayCanonical"],
): void {
  if (
    ack.protocolVersion !== "gameplay.v1" ||
    ack.renewalId !== request.renewalId ||
    ack.requestDigest !== request.requestDigest ||
    ack.lease.gameRunId !== lease.gameRunId ||
    ack.lease.leaseId !== lease.leaseId ||
    ack.lease.fence !== lease.fence ||
    ack.lease.ownerType !== "agent" ||
    ack.lease.state !== "active" ||
    !isNonNegativeSafeInteger(ack.renewedAtAuthorityMs)
  ) {
    throw new RehearsalFailure("renewal-failed", "lease renewal acknowledgement changed the fenced authority");
  }
  validateLease(ack.lease, "lease renewal acknowledgement");
  assertCanonicalSelfDigest(
    ack,
    "resultDigest",
    sha256GameplayCanonical,
    "lease renewal acknowledgement",
  );
}

function acceptedControlState(state: GameplayRunStatePort["state"]): boolean {
  return state === "game_started" || state === "certifying" || state === "rehearsal_ready";
}

function errorReason(error: unknown): string {
  return error instanceof RehearsalFailure ? error.closeReason : "rehearsal-failed";
}

export class GameplayRehearsalSupervisor {
  private readonly createId: () => string;
  private readonly nowMs: () => number;
  private readonly observationTimeoutMs: number;

  constructor(
    private readonly dependencies: GameplayRehearsalDependencies,
    private readonly profile: GameplayRehearsalProfile,
  ) {
    this.createId = dependencies.createId ?? randomUUID;
    this.nowMs = dependencies.nowMs ?? (() => performance.now());
    this.observationTimeoutMs = dependencies.observationTimeoutMs ?? DEFAULT_OBSERVATION_TIMEOUT_MS;
  }

  async run(request: GameplayRehearsalRequest): Promise<GameplayRehearsalResult> {
    assertNonEmpty(request.sessionId, "sessionId");
    assertNonEmpty(request.gameRunId, "gameRunId");
    assertNonEmpty(request.goal, "goal");
    if (!Number.isFinite(this.observationTimeoutMs) || this.observationTimeoutMs <= 0) {
      throw new RehearsalFailure("rehearsal-failed", "observationTimeoutMs must be positive");
    }

    const abort = new AbortController();
    const serializedEvidence = new SerializedEvidence();
    const inbox = new EvidenceInbox((value) =>
      validateRawGameSample(value, this.dependencies.sha256GameplayCanonical),
    );
    let subscription: Awaited<ReturnType<GameplayClientPort["subscribeGameEvidence"]>> | undefined;
    let lease: GameControlLeasePort | undefined;
    let capabilities: GameplayCapabilitiesPort | undefined;
    let lastObservationSequence = 1;
    let directiveId: string | undefined;
    let renewalTimer: ReturnType<typeof setInterval> | undefined;
    let primaryError: unknown;
    let result: GameplayRehearsalResult | undefined;

    const handlers: GameplayEvidenceHandlersPort = {
      onRawObservation: (value) => serializedEvidence.enqueue(() => inbox.addRaw(value)),
      onObservationGap: (value) =>
        serializedEvidence.enqueue(() => {
          inbox.fail(
            new RehearsalFailure(
              "observation-gap",
              `observation gap (${value.expectedSourceSequence} -> ${value.resumedAtSourceSequence})`,
            ),
          );
        }),
      onReceipt: (value) => serializedEvidence.enqueue(() => inbox.addReceipt(value)),
      onLifecycleResult: (value) => serializedEvidence.enqueue(() => inbox.addLifecycleResult(value)),
      onLeaseExpired: (value) =>
        serializedEvidence.enqueue(() => {
          inbox.fail(
            new RehearsalFailure(
              "lease-expired",
              `gameplay lease expired (${value.leaseId}/${value.fence})`,
            ),
          );
        }),
      onConnectionState: (value) =>
        serializedEvidence.enqueue(() => {
          if (value === "closed") {
            inbox.fail(new RehearsalFailure("connection-closed", "gameplay evidence transport closed"));
          }
        }),
      onFatal: (value) =>
        serializedEvidence.enqueue(() => {
          inbox.fail(
            new RehearsalFailure("rehearsal-failed", `gameplay evidence fatal: ${value.code}: ${value.message}`),
          );
        }),
    };

    try {
      subscription = await this.dependencies.client.subscribeGameEvidence(
        { sessionId: request.sessionId, gameRunId: request.gameRunId, signal: abort.signal },
        handlers,
      );
      const ready = await subscription.ready;
      if (
        ready.protocolVersion !== "gameplay.v1" ||
        ready.sessionId !== request.sessionId ||
        ready.gameRunId !== request.gameRunId
      ) {
        throw new RehearsalFailure("rehearsal-failed", "gameplay evidence subscription was not ready for this run");
      }
      lastObservationSequence = ready.firstSourceObservationSequence;

      capabilities = await this.dependencies.client.getGameCapabilities(request.sessionId);
      validateCapabilities(capabilities, request, this.profile, this.dependencies.expectedArtifacts);
      const state = await this.dependencies.client.getGameState(request.sessionId);
      validateState(state, capabilities);

      if (state.state === "neutral_preflight") {
        if (!state.bridgeReadyRecordDigest || !state.neutralPreflightResultDigest) {
          throw new RehearsalFailure("rehearsal-failed", "neutral preflight state is missing authority evidence");
        }
        const unsignedStart = {
          transitionId: this.createId(),
          gameRunId: capabilities.gameRunId,
          bindingId: capabilities.binding.bindingId,
          bridgeReadyRecordDigest: state.bridgeReadyRecordDigest,
          neutralPreflightResultDigest: state.neutralPreflightResultDigest,
        };
        const startRequest = {
          ...unsignedStart,
          requestDigest: this.digest(unsignedStart),
        };
        const start = await this.dependencies.client.startInitialGameLifecycle(
          request.sessionId,
          startRequest,
        );
        validateInitialGameStartResult(
          start,
          startRequest,
          capabilities,
          this.dependencies.sha256GameplayCanonical,
        );
        inbox.setExpectedInitialStartResult(request.sessionId, request.gameRunId, start.resultDigest);
        await inbox.waitForInitialStart(
          request.sessionId,
          request.gameRunId,
          start.resultDigest,
          this.observationTimeoutMs,
        );
      } else if (!acceptedControlState(state.state)) {
        throw new RehearsalFailure(
          "rehearsal-failed",
          `gameplay state ${state.state} cannot enter a rehearsal control loop`,
        );
      }

      // Reserve a release-usable directive ID before any lease becomes active.
      // If directive construction subsequently fails, the finally path can
      // still issue a bounded neutral release under the leased authority.
      directiveId = this.createId();
      const unsignedLease = {
        transitionId: this.createId(),
        gameRunId: capabilities.gameRunId,
        bindingId: capabilities.binding.bindingId,
      };
      const leaseRequest = {
        ...unsignedLease,
        requestDigest: this.digest(unsignedLease),
      };
      const leaseAck = await this.dependencies.client.acquireGameLease(
        request.sessionId,
        leaseRequest,
      );
      validateLeaseAcquireAck(
        leaseAck,
        leaseRequest,
        capabilities,
        this.dependencies.sha256GameplayCanonical,
      );
      lease = leaseAck.lease;
      renewalTimer = this.startRenewal(lease, inbox, request.sessionId);
      const directive = this.createDirective(request, capabilities, lease, directiveId);
      validateControllerArtifact(
        this.dependencies.controllerArtifact,
        this.dependencies.expectedArtifacts,
        this.dependencies.sha256GameplayCanonical,
      );
      const unsignedEvidenceWindow = {
        transitionId: this.createId(),
        gameRunId: capabilities.gameRunId,
        bindingId: capabilities.binding.bindingId,
        leaseId: lease.leaseId,
        fence: lease.fence,
        directive,
        controllerArtifact: this.dependencies.controllerArtifact,
        certificationCandidateDigest: capabilities.certificationCandidate.candidateDigest,
      };
      const evidenceWindowRequest = {
        ...unsignedEvidenceWindow,
        requestDigest: this.digest(unsignedEvidenceWindow),
      };
      const evidenceWindow = await this.dependencies.client.openGameplayEvidenceWindow(
        request.sessionId,
        evidenceWindowRequest,
      );
      validateEvidenceWindow(
        evidenceWindow,
        evidenceWindowRequest,
        capabilities,
        this.dependencies.expectedArtifacts,
        this.dependencies.controllerArtifact,
        this.dependencies.sha256GameplayCanonical,
      );

      const minimumBaselineSourceSequence = Math.max(
        ready.firstSourceObservationSequence,
        evidenceWindow.firstSourceObservationSequence,
      );
      const minimumBaselineRelaySequence = Math.max(
        ready.firstRelaySequence,
        evidenceWindow.firstRelaySequence,
      );
      const raw = await inbox.waitForRaw(
        (value) =>
          value.gameRunId === capabilities!.gameRunId &&
          value.sourceId === capabilities!.binding.sourceId &&
          rawMatchesTrustedRuntime(value, capabilities!.runtime, capabilities!.runtimeProvenance) &&
          Number.isSafeInteger(value.fence) &&
          value.fence >= 0 &&
          value.fence < lease!.fence &&
          value.sourceObservationSequence >= minimumBaselineSourceSequence &&
          value.relaySequence >= minimumBaselineRelaySequence &&
          controlValuesAreNeutral(value, capabilities!.runtime.controls),
        this.observationTimeoutMs,
      );
      lastObservationSequence = raw.sourceObservationSequence;
      const baseline = this.dependencies.gameplay.adapter.normalizeObservation(
        raw,
        capabilities.binding,
        capabilities.runtimeProvenance,
        evidenceWindow.context,
      );
      const decision = this.dependencies.gameplay.controller.decide({
        observation: baseline,
        directive,
        state: this.dependencies.gameplay.controller.initialState(this.dependencies.policy.snapshot),
        clock: { nowMs: this.nowMs },
      });
      const intent = decision.intent;
      this.validateControlIntent(intent, directive, baseline, capabilities, lease);

      const immediateReceipts = await this.dependencies.client.sendGameControl(request.sessionId, intent);
      await serializedEvidence.enqueue(() => {
        for (const receipt of immediateReceipts) inbox.addReceipt(receipt);
      });
      const proof = await inbox.waitForControlProof(
        intent,
        capabilities.binding.sourceId,
        capabilities.runtime,
        capabilities.runtimeProvenance,
        this.observationTimeoutMs,
      );
      lastObservationSequence = proof.raw.sourceObservationSequence;
      const reflected = this.dependencies.gameplay.adapter.normalizeObservation(
        proof.raw,
        capabilities.binding,
        capabilities.runtimeProvenance,
        evidenceWindow.context,
      );

      await this.dependencies.persistence.persistControlReflection({
        gameRunId: intent.gameRunId,
        sourceId: capabilities.binding.sourceId,
        fence: intent.fence,
        decisionId: intent.decisionId,
        directiveId: intent.directiveId,
        sourceObservationSequence: proof.raw.sourceObservationSequence,
        rawObservationDigest: proof.raw.rawEnvelopeDigest,
        reflectedReceiptId: proof.receipt.receiptId,
        reflectedObservationSequence: proof.receipt.reflectedObservationSequence ?? proof.raw.sourceObservationSequence,
      });
      await this.dependencies.persistence.persistVerifiedMasteryOutcome({
        gameId: this.profile.gameId,
        gameRunId: intent.gameRunId,
        sourceId: capabilities.binding.sourceId,
        fence: intent.fence,
        goal: directive.goal,
        strategyFamily: directive.strategyFamily,
        gameplayPolicyId: directive.gameplayPolicyId,
        gameplayPolicyVersion: directive.gameplayPolicyVersion,
        gameplayPolicyDigest: directive.gameplayPolicyDigest,
        directiveId: directive.directiveId,
        directiveDigest: directive.directiveDigest,
        controllerId: this.dependencies.controllerArtifact.controllerId,
        controllerVersion: this.dependencies.controllerArtifact.controllerVersion,
        controllerDigest: this.dependencies.controllerArtifact.artifactDigest,
        decisionId: intent.decisionId,
        baselineSourceObservationSequence: baseline.sourceObservationSequence,
        reflectedSourceObservationSequence: proof.raw.sourceObservationSequence,
        rawObservationDigest: proof.raw.rawEnvelopeDigest,
        reflectedReceiptId: proof.receipt.receiptId,
      });
      if (this.dependencies.reactions) {
        await this.dependencies.reactions.persistThenBroadcast(request.sessionId, {
          decisionId: intent.decisionId,
          gameRunId: intent.gameRunId,
          sourceObservationSequence: proof.raw.sourceObservationSequence,
          rawObservationDigest: proof.raw.rawEnvelopeDigest,
          reason: intent.reasonCode,
          reactionKind: this.profile.reactionKindFor(baseline, reflected),
        });
      }
      let ad: GameplayRehearsalResult["ad"];
      if (request.ad) {
        if (!this.dependencies.ads) {
          throw new RehearsalFailure(
            "rehearsal-failed",
            "Stream555 Ads service is required for an ad-bound rehearsal",
          );
        }
        assertNonEmpty(request.ad.adId, "adId");
        if (!isPositiveSafeInteger(request.ad.duration)) {
          throw new RehearsalFailure(
            "rehearsal-failed",
            "ad duration must be a positive safe integer",
          );
        }
        ad = await this.dependencies.ads.triggerAdBreak(
          request.ad.adId,
          { duration: request.ad.duration },
          request.sessionId,
        );
      }
      result = {
        gameRunId: intent.gameRunId,
        decisionId: intent.decisionId,
        reflectedObservationSequence: proof.receipt.reflectedObservationSequence ?? proof.raw.sourceObservationSequence,
        ...(ad ? { ad } : {}),
      };
    } catch (error) {
      primaryError = error;
    } finally {
      if (renewalTimer) clearInterval(renewalTimer);
      let releaseError: unknown;
      if (lease && capabilities && directiveId) {
        try {
          const release = this.createNeutralRelease(capabilities, lease, directiveId, lastObservationSequence);
          const immediateReceipts = await this.dependencies.client.releaseGameControls(request.sessionId, release);
          await serializedEvidence.enqueue(() => {
            for (const receipt of immediateReceipts) inbox.addReceipt(receipt);
          });
          await inbox.waitForNeutralReleaseProof(
            release,
            capabilities.binding.sourceId,
            capabilities.runtime.controls,
            capabilities.runtime,
            capabilities.runtimeProvenance,
            this.observationTimeoutMs,
          );
        } catch (error) {
          releaseError = error;
        }
      }
      abort.abort();
      if (subscription) {
        const closeReason = primaryError ? errorReason(primaryError) : releaseError ? errorReason(releaseError) : "rehearsal-complete";
        try {
          await subscription.close(closeReason);
        } catch (closeError) {
          if (!releaseError) releaseError = closeError;
        }
      }
      if (primaryError && releaseError) {
        primaryError = new AggregateError(
          [primaryError, releaseError],
          `rehearsal failed (${primaryError instanceof Error ? primaryError.message : String(primaryError)}) and neutral release was not fully proven`,
        );
      } else if (!primaryError && releaseError) {
        primaryError = releaseError;
      }
    }

    if (primaryError) throw primaryError;
    if (!result) throw new RehearsalFailure("rehearsal-failed", "rehearsal completed without a reflected decision");
    return result;
  }

  private digest(value: unknown): string {
    const digest = this.dependencies.sha256GameplayCanonical(value);
    assertDigest(digest, "gameplay SDK canonical digest");
    return digest;
  }

  private createDirective(
    request: GameplayRehearsalRequest,
    capabilities: GameplayCapabilitiesPort,
    lease: GameControlLeasePort,
    directiveId: string,
  ): GameplayDirectivePort {
    const unsigned = {
      gameRunId: capabilities.gameRunId,
      leaseId: lease.leaseId,
      fence: lease.fence,
      directiveId,
      goal: request.goal,
      strategyFamily: this.dependencies.policy.strategyFamily,
      gameplayPolicyId: this.dependencies.policy.policyId,
      gameplayPolicyVersion: this.dependencies.policy.policyVersion,
      gameplayPolicyDigest: this.dependencies.policy.policyDigest,
      policySnapshot: this.dependencies.policy.snapshot,
      recoveryPolicy: this.dependencies.policy.recoveryPolicy,
      memoryProvenanceIds: [],
      issuedAtAgentMonotonicMs: this.nowMs(),
      validForMs: capabilities.runtime.maximumIntentAgeMs,
      agentClockDomainId: "alice.performance.v1",
    };
    assertDigest(unsigned.gameplayPolicyDigest, "gameplay policy digest");
    return {
      ...unsigned,
      directiveDigest: this.digest(unsigned),
    };
  }

  private validateControlIntent(
    intent: GameControlIntentPort,
    directive: GameplayDirectivePort,
    observation: NormalizedGameplayObservationPort,
    capabilities: GameplayCapabilitiesPort,
    lease: GameControlLeasePort,
  ): void {
    if (
      intent.gameRunId !== capabilities.gameRunId ||
      intent.leaseId !== lease.leaseId ||
      intent.fence !== lease.fence ||
      intent.directiveId !== directive.directiveId ||
      intent.observationSequence !== observation.sourceObservationSequence ||
      intent.maximumAgeMs > capabilities.runtime.maximumIntentAgeMs ||
      intent.commands.length === 0
    ) {
      throw new RehearsalFailure("rehearsal-failed", "controller intent does not match the frozen gameplay authority");
    }
    assertDigest(intent.semanticIntentDigest, "controller semantic intent digest");
    const unsigned = omitRootField(intent as unknown as Record<string, unknown>, "semanticIntentDigest");
    if (this.digest(unsigned) !== intent.semanticIntentDigest) {
      throw new RehearsalFailure("rehearsal-failed", "controller semantic intent digest is not canonical SDK evidence");
    }
  }

  private createNeutralRelease(
    capabilities: GameplayCapabilitiesPort,
    lease: GameControlLeasePort,
    directiveId: string,
    observationSequence: number,
  ): GameControlReleaseRequestPort {
    const releaseId = this.createId();
    const neutralSemanticIdentity = {
      gameRunId: capabilities.gameRunId,
      leaseId: lease.leaseId,
      fence: lease.fence,
      directiveId,
      releaseId,
      observationSequence,
      kind: "release_all",
    };
    const neutral = {
      controlSchemaVersion: capabilities.runtime.controlSchemaVersion,
      commands: capabilities.runtime.controls.map(descriptorNeutralCommand),
      maximumHoldMs: 0,
    };
    const unsigned = {
      releaseId,
      gameRunId: capabilities.gameRunId,
      leaseId: lease.leaseId,
      fence: lease.fence,
      directiveId,
      observationSequence,
      neutralSemanticIntentDigest: this.digest(neutralSemanticIdentity),
      neutralMappedControlsDigest: this.digest(neutral),
    };
    return {
      ...unsigned,
      releaseDigest: this.digest(unsigned),
    };
  }

  private startRenewal(
    lease: GameControlLeasePort,
    inbox: EvidenceInbox,
    sessionId: string,
  ): ReturnType<typeof setInterval> {
    const intervalMs = Math.max(1, Math.floor(lease.renewalIntervalMs / 2));
    let renewing = false;
    return setInterval(() => {
      if (renewing) return;
      renewing = true;
      const unsigned = {
        renewalId: this.createId(),
        gameRunId: lease.gameRunId,
        leaseId: lease.leaseId,
        fence: lease.fence,
      };
      const request = { ...unsigned, requestDigest: this.digest(unsigned) };
      void this.dependencies.client
        .renewGameLease(sessionId, request)
        .then((ack) => {
          validateLeaseRenewAck(
            ack,
            request,
            lease,
            this.dependencies.sha256GameplayCanonical,
          );
        })
        .catch((error: unknown) => {
          inbox.fail(
            error instanceof RehearsalFailure
              ? error
              : new RehearsalFailure("renewal-failed", `lease renewal failed: ${String(error)}`),
          );
        })
        .finally(() => {
          renewing = false;
        });
    }, intervalMs);
  }
}

function drive555ForwardPosition(value: NormalizedGameplayObservationPort): number | undefined {
  const player = value.gameState.player;
  if (!player || typeof player !== "object" || Array.isArray(player)) return undefined;
  const z = (player as Record<string, unknown>).z;
  return typeof z === "number" && Number.isFinite(z) ? z : undefined;
}

const DRIVE555_REHEARSAL_PROFILE: GameplayRehearsalProfile = {
  gameId: "555drive",
  reactionKindFor(baseline, reflected) {
    const before = drive555ForwardPosition(baseline);
    const after = drive555ForwardPosition(reflected);
    return before !== undefined && after !== undefined && after > before ? "progress" : "watching";
  },
};

/** The game-specific entrypoint keeps 555Drive details outside the generic loop. */
export class Drive555RehearsalSupervisor {
  private readonly supervisor: GameplayRehearsalSupervisor;

  constructor(dependencies: Drive555RehearsalDependencies) {
    this.supervisor = new GameplayRehearsalSupervisor(dependencies, DRIVE555_REHEARSAL_PROFILE);
  }

  run(request: GameplayRehearsalRequest): Promise<GameplayRehearsalResult> {
    return this.supervisor.run(request);
  }
}

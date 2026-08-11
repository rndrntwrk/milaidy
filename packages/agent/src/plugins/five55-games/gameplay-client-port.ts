/**
 * Structural boundary for the versioned gameplay.v1 SDK.
 *
 * This deliberately mirrors only the authority/evidence calls used by the
 * local 555Drive rehearsal. The SDK itself is loaded separately as a pinned
 * local artifact; keeping the port structural prevents a package resolution
 * path from becoming part of Alice's runtime contract.
 */

export type GameplayRunAuthorityState =
  | "created"
  | "source_launching"
  | "runtime_preparing"
  | "bridge_ready"
  | "neutral_preflight"
  | "game_starting"
  | "game_started"
  | "composition_starting"
  | "composition_ready"
  | "certifying"
  | "rehearsal_ready"
  | "leased"
  | "controlling"
  | "stopping"
  | "aborting"
  | "stopped"
  | "failed";

export type GameControlCommand =
  | { kind: "digital"; controlId: string; pressed: boolean }
  | { kind: "analog"; controlId: string; value: number }
  | {
      kind: "pointer";
      controlId: string;
      coordinateSpace: "game-normalized";
      x: number;
      y: number;
      phase: "move" | "press" | "release";
      button?: "primary" | "secondary" | "middle";
    };

export type GameControlDescriptor =
  | { id: string; kind: "digital"; supportsHold: boolean; neutral: false }
  | { id: string; kind: "analog"; minimum: number; maximum: number; neutral: number }
  | {
      id: string;
      kind: "pointer";
      coordinateSpace: "game-normalized";
      buttons: Array<"primary" | "secondary" | "middle">;
      supportsMove: boolean;
      supportsHold: boolean;
    };

export interface GameplayBindingPort {
  bindingId: string;
  gameRunId: string;
  sourceId: string;
  gameId: string;
  controlMode: "fenced_agent_v1";
}

export interface GameRuntimeCapabilitiesPort {
  bridgeId: string;
  bridgeVersion: string;
  bridgeDigest: string;
  observationSchemaVersion: string;
  controlSchemaVersion: string;
  controls: GameControlDescriptor[];
  commandSemantics: "complete_snapshot" | "partial_events";
  nativeFenceEnforcement: boolean;
  appliedControls: boolean;
  maximumIntentAgeMs: number;
  maximumHoldMs: number;
  maximumSilenceMs: number;
}

export interface GameAdapterManifestPort {
  gameId: string;
  adapterVersion: string;
  observationSchemaVersion: string;
  controlSchemaVersion: string;
  observations: {
    stateSchemaId: string;
  };
  controls: {
    descriptors: GameControlDescriptor[];
    commandSemantics: "complete_snapshot" | "partial_events";
    maximumIntentAgeMs: number;
    maximumHoldMs: number;
    maximumSilenceMs: number;
  };
}

export interface GameplayRuntimeProvenancePort {
  bridgeId: string;
  bridgeVersion: string;
  bridgeDigest: string;
  adapterManifestDigest: string;
  adapterVersion: string;
  gameAssetDigest: string;
  rawSchemaVersion: string;
  runtimeProvenanceDigest: string;
}

export interface GameCertificationCandidatePort {
  gameId: string;
  bridgeDigest: string;
  adapterManifestDigest: string;
  controllerDigest: string;
  sourceAnchorDigest: string;
  initialFixtureDigest: string;
  environment: "local-composition";
  candidateDigest: string;
}

export interface ControllerArtifactManifestPort {
  schemaVersion: "gameplay-controller-artifact.v1";
  packageName: string;
  controllerId: string;
  controllerVersion: string;
  entrypoint: string;
  files: Array<{ path: string; sha256: string }>;
  artifactDigest: string;
}

export interface GameplayExecutionProvenancePort {
  controllerId: string;
  controllerVersion: string;
  controllerDigest: string;
  gameplayPolicyId: string;
  gameplayPolicyVersion: number;
  gameplayPolicyDigest: string;
  directiveId: string;
  directiveDigest: string;
  executionProvenanceDigest: string;
}

export interface GameplayEvidenceContextPort {
  binding: GameplayBindingPort;
  runtime: GameplayRuntimeProvenancePort;
  execution: GameplayExecutionProvenancePort;
  certificationCandidateDigest: string;
  contextDigest: string;
}

export interface GameplayCapabilitiesPort {
  protocolVersion: "gameplay.v1";
  sessionId: string;
  gameRunId: string;
  binding: GameplayBindingPort;
  controlMode: "fenced_agent_v1";
  manifest: GameAdapterManifestPort;
  runtime: GameRuntimeCapabilitiesPort;
  runtimeProvenance: GameplayRuntimeProvenancePort;
  certificationCandidate: GameCertificationCandidatePort;
}

export interface GameplayRunStatePort {
  protocolVersion: "gameplay.v1";
  sessionId: string;
  gameRunId: string;
  bindingId: string;
  sourceId: string | null;
  state: GameplayRunAuthorityState;
  bridgeReadyRecordDigest: string | null;
  neutralPreflightResultDigest: string | null;
}

export interface InitialGameStartRequestPort {
  transitionId: string;
  requestDigest: string;
  gameRunId: string;
  bindingId: string;
  bridgeReadyRecordDigest: string;
  neutralPreflightResultDigest: string;
}

export interface InitialGameStartResultPort {
  protocolVersion: "gameplay.v1";
  transitionId: string;
  requestDigest: string;
  state: "game_started";
  gameRunId: string;
  bindingId: string;
  lifecycleResult: {
    status: "applied";
    transitionId: string;
    requestDigest: string;
    command: "start";
    lifecycleRevision: number;
    runtimeRevision: number;
    certificationFixtureRevision: number;
    runBinding: {
      externalGameRunId: string;
      nativeGameRunId: string;
      nativeRunGeneration: number;
      pageInstanceId: string;
    };
    completedAtPageMonotonicMs: number;
    pageClockDomainId: string;
    resultDigest: string;
  };
  sourceObservationSequence: number;
  sourceObservationDigest: string;
  fixture: {
    lifecycle: "playing";
    trackSeed: number;
    playerX: number;
    playerZ: number;
    playerVelocityX: number;
    playerVelocityZ: number;
    physicsFrameSequence: number;
    observedAtPageMonotonicMs: number;
    pageClockDomainId: string;
    appliedControlSnapshotDigest: string;
    neutral: true;
    fixtureDigest: string;
  };
  startedAtAuthorityMs: number;
  resultDigest: string;
}

export interface AcquireGameLeaseRequestPort {
  transitionId: string;
  requestDigest: string;
  gameRunId: string;
  bindingId: string;
}

export interface GameControlLeasePort {
  leaseId: string;
  gameRunId: string;
  ownerType: "agent" | "certification_harness";
  fence: number;
  acquiredAtAuthorityMs: number;
  expiresAtAuthorityMs: number;
  renewalIntervalMs: number;
  state: "active" | "revocation_requested" | "revoked" | "expired";
}

export interface GameLeaseAcquireAckPort {
  protocolVersion: "gameplay.v1";
  transitionId: string;
  requestDigest: string;
  lease: GameControlLeasePort;
  completedAtAuthorityMs: number;
  resultDigest: string;
}

export interface GameLeaseRenewRequestPort {
  renewalId: string;
  requestDigest: string;
  gameRunId: string;
  leaseId: string;
  fence: number;
}

export interface GameLeaseRenewAckPort {
  protocolVersion: "gameplay.v1";
  renewalId: string;
  requestDigest: string;
  lease: GameControlLeasePort;
  renewedAtAuthorityMs: number;
  resultDigest: string;
}

export interface GameControlIntentPort {
  gameRunId: string;
  leaseId: string;
  fence: number;
  directiveId: string;
  decisionId: string;
  semanticIntentDigest: string;
  observationSequence: number;
  decidedAtAgentMonotonicMs: number;
  maximumAgeMs: number;
  agentClockDomainId: string;
  commands: GameControlCommand[];
  reasonCode:
    | "pursue_objective"
    | "avoid_hazard"
    | "recover"
    | "lifecycle"
    | "stop";
}

export type GameplayReceiptState =
  | "accepted"
  | "enqueued"
  | "injected"
  | "reflected"
  | "rejected";

export interface GameControlReceiptPort {
  receiptId: string;
  gameRunId: string;
  leaseId: string;
  fence: number;
  ownerType: "agent" | "certification_harness";
  directiveId: string;
  decisionId: string;
  semanticIntentDigest: string;
  mappedControlsDigest: string;
  observationSequence: number;
  sourceId: string;
  state: GameplayReceiptState;
  relaySequence: number;
  stageSequence: number;
  reflectedObservationSequence?: number;
  appliedControls?: Record<string, boolean | number>;
  appliedControlsDigest?: string;
  rejectionCode?: string;
}

export interface GameControlReleaseRequestPort {
  releaseId: string;
  releaseDigest: string;
  gameRunId: string;
  leaseId: string;
  fence: number;
  directiveId: string;
  observationSequence: number;
  neutralSemanticIntentDigest: string;
  neutralMappedControlsDigest: string;
}

export interface OpenGameplayEvidenceWindowRequestPort {
  transitionId: string;
  requestDigest: string;
  gameRunId: string;
  bindingId: string;
  leaseId: string;
  fence: number;
  directive: {
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
  };
  controllerArtifact: ControllerArtifactManifestPort;
  certificationCandidateDigest: string;
}

export interface GameplayEvidenceWindowAckPort {
  protocolVersion: "gameplay.v1";
  transitionId: string;
  requestDigest: string;
  state: "controlling";
  sessionId: string;
  gameRunId: string;
  bindingId: string;
  leaseId: string;
  ownerType: "agent";
  fence: number;
  context: GameplayEvidenceContextPort;
  firstRelaySequence: number;
  firstSourceObservationSequence: number;
  openedAtAuthorityMs: number;
  resultDigest: string;
}

export interface GameControlReleaseReceiptPort {
  receiptId: string;
  releaseId: string;
  releaseDigest: string;
  gameRunId: string;
  leaseId: string;
  ownerType: "agent" | "certification_harness";
  fence: number;
  directiveId: string;
  observationSequence: number;
  neutralSemanticIntentDigest: string;
  neutralMappedControlsDigest: string;
  sourceId: string;
  state: GameplayReceiptState;
  relaySequence: number;
  stageSequence: number;
  reflectedObservationSequence?: number;
  neutralAppliedControlsDigest?: string;
  neutralSnapshotDigest?: string;
  rejectionCode?: string;
}

export interface RawAppliedDecisionCorrelationPort {
  leaseId: string;
  fence: number;
  ownerType: "agent" | "certification_harness";
  directiveId: string;
  decisionId: string;
  semanticIntentDigest: string;
  mappedControlsDigest: string;
  appliedControlsDigest: string;
}

export interface RawGameSamplePort {
  gameRunId: string;
  sourceId: string;
  fence: number;
  controlOwnerType: "agent" | "certification_harness" | null;
  bridgeVersion: string;
  bridgeDigest: string;
  rawSchemaVersion: string;
  relaySequence: number;
  sourceObservationSequence: number;
  observedAtAuthorityMs: number;
  rawState: Record<string, unknown>;
  rawStateDigest: string;
  appliedControls?: Record<string, boolean | number>;
  appliedControlsDigest?: string;
  appliedDecision?: RawAppliedDecisionCorrelationPort;
  rawEnvelopeDigest: string;
}

export interface GameplaySubscriptionReadyPort {
  protocolVersion: "gameplay.v1";
  sessionId: string;
  gameRunId: string;
  firstRelaySequence: number;
  firstSourceObservationSequence: number;
  neutralSnapshotDigest: string;
  acceptedAtAuthorityMs: number;
  resultDigest: string;
}

export interface GameplayObservationGapPort {
  gameRunId: string;
  relaySequence: number;
  expectedSourceSequence: number;
  resumedAtSourceSequence: number;
  gapMs: number;
}

export interface GameplayLeaseExpiredPort {
  gameRunId: string;
  relaySequence: number;
  leaseId: string;
  fence: number;
  expiredAtAuthorityMs: number;
}

export interface GameplayFatalErrorPort {
  code: string;
  message: string;
  gameRunId?: string;
  evidenceDigest?: string;
}

export interface GameplayLifecycleResultPort {
  protocolVersion: "gameplay.v1";
  event: "game.lifecycle.result";
  resultKind:
    | "initial_start"
    | "stall_recovery"
    | "revocation"
    | "transport_close";
  relaySequence: number;
  sessionId: string;
  gameRunId: string;
  result: { resultDigest: string; [key: string]: unknown };
}

export interface GameplayEvidenceHandlersPort {
  onRawObservation(value: RawGameSamplePort): void | Promise<void>;
  onObservationGap(value: GameplayObservationGapPort): void | Promise<void>;
  onReceipt(value: GameControlReceiptPort | GameControlReleaseReceiptPort): void | Promise<void>;
  onLifecycleResult(value: GameplayLifecycleResultPort): void | Promise<void>;
  onLeaseExpired(value: GameplayLeaseExpiredPort): void | Promise<void>;
  onConnectionState(value: "connected" | "reconnecting" | "closed"): void | Promise<void>;
  onFatal(value: GameplayFatalErrorPort): void | Promise<void>;
}

export interface GameplayEvidenceSubscriptionPort {
  readonly ready: Promise<GameplaySubscriptionReadyPort>;
  close(reason: string): Promise<void>;
}

export interface GameplayClientPort {
  subscribeGameEvidence(
    input: { sessionId: string; gameRunId: string; signal: AbortSignal },
    handlers: GameplayEvidenceHandlersPort,
  ): Promise<GameplayEvidenceSubscriptionPort>;
  getGameCapabilities(sessionId: string): Promise<GameplayCapabilitiesPort>;
  getGameState(sessionId: string): Promise<GameplayRunStatePort>;
  startInitialGameLifecycle(
    sessionId: string,
    request: InitialGameStartRequestPort,
  ): Promise<InitialGameStartResultPort>;
  acquireGameLease(
    sessionId: string,
    request: AcquireGameLeaseRequestPort,
  ): Promise<GameLeaseAcquireAckPort>;
  renewGameLease(
    sessionId: string,
    request: GameLeaseRenewRequestPort,
  ): Promise<GameLeaseRenewAckPort>;
  openGameplayEvidenceWindow(
    sessionId: string,
    request: OpenGameplayEvidenceWindowRequestPort,
  ): Promise<GameplayEvidenceWindowAckPort>;
  sendGameControl(
    sessionId: string,
    intent: GameControlIntentPort,
  ): Promise<GameControlReceiptPort[]>;
  releaseGameControls(
    sessionId: string,
    request: GameControlReleaseRequestPort,
  ): Promise<GameControlReleaseReceiptPort[]>;
}

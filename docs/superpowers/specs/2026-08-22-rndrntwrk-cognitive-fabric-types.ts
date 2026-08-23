/**
 * RNDRNTWRK Cognitive Fabric design contracts.
 *
 * This file is a specification artifact, not an admitted runtime implementation.
 * Version all runtime-compatible derivatives.
 */

export type CorpusProjection =
  | "public"
  | "internal"
  | "diligence"
  | "restricted-security"
  | "owner-private";

export type ConsequenceLevel =
  | "informational"
  | "advisory"
  | "operational"
  | "financial"
  | "security-sensitive"
  | "irreversible";

export type QueryClass =
  | "NO_RETRIEVAL"
  | "EXACT_FACT"
  | "LOCAL_EXPLANATION"
  | "GLOBAL_SYNTHESIS"
  | "TEMPORAL_HISTORY"
  | "CURRENT_STATE"
  | "GRAPH_IMPACT"
  | "PROCEDURAL"
  | "EPISODIC"
  | "CONSEQUENTIAL_PLAN"
  | "SOCIAL_PERSONAL"
  | "CONFLICT_CHECK";

export type RetrievalMode =
  | "canonical-record"
  | "native-document"
  | "dossier-hierarchy"
  | "corpus-graph"
  | "repository-graph"
  | "temporal"
  | "dynamic-state"
  | "trajectory"
  | "procedure-skill"
  | "personal-memory";

export type CriticDecision =
  | "SUFFICIENT"
  | "EXPAND"
  | "LIVE_SOURCE_REQUIRED"
  | "CONFLICT"
  | "STALE"
  | "UNKNOWN"
  | "ACCESS_DENIED";

export interface CognitiveQueryEnvelope {
  schemaVersion: "1.0";
  requestId: string;
  traceId: string;
  actorId: string;
  aliceIdentity: string;
  projection: CorpusProjection;
  purpose: string;
  task: string;
  query: string;
  entities: Array<{
    id?: string;
    type?: string;
    name: string;
    aliases?: string[];
  }>;
  environments?: string[];
  chains?: string[];
  networks?: string[];
  time: {
    mode: "current" | "historical" | "range" | "unspecified";
    at?: string;
    from?: string;
    to?: string;
    freshnessRequired?: boolean;
    maximumAgeSeconds?: number;
  };
  consequenceLevel: ConsequenceLevel;
  allowedSourceClasses?: string[];
  deniedSourceClasses?: string[];
  latencyBudgetMs: number;
  tokenBudget: number;
  costBudgetUsd?: number;
  requireCitations: boolean;
  requireDynamicState: boolean;
  allowInferences: boolean;
  metadata?: Record<string, unknown>;
}

export interface RetrievalStep {
  id: string;
  mode: RetrievalMode;
  required: boolean;
  query: string;
  filters: {
    projection: CorpusProjection;
    recordTypes?: string[];
    nodeTypes?: string[];
    sourceClasses?: string[];
    truthClasses?: string[];
    reviewStates?: string[];
    environments?: string[];
    chains?: string[];
    networks?: string[];
    effectiveAt?: string;
  };
  limit: number;
  depth?: number;
  tokenBudget: number;
  timeoutMs: number;
  dependencies?: string[];
}

export interface RetrievalPlan {
  schemaVersion: "1.0";
  requestId: string;
  classifierVersion: string;
  queryClasses: QueryClass[];
  steps: RetrievalStep[];
  criticPolicy: string;
  fusionPolicy: string;
  maximumExpansionRounds: number;
  dynamicStateRequired: boolean;
  createdAt: string;
}

export interface SourceHandle {
  sourceId: string;
  sourceType: string;
  uri?: string;
  contentHash?: string;
  commitSha?: string;
  lines?: { start: number; end: number };
  page?: number;
  transactionId?: string;
  observationId?: string;
  receiptId?: string;
}

export interface EvidenceCandidate {
  candidateId: string;
  retrievalMode: RetrievalMode;
  subjectId?: string;
  recordId?: string;
  nodeId?: string;
  fragmentId?: string;
  statement: string;
  title?: string;
  truthClass?: string;
  authorityClass?: string;
  reviewState?: string;
  canonicalityState?: string;
  claimPermission?: string;
  projection: CorpusProjection;
  visibility: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  observedAt?: string;
  freshUntil?: string;
  stale: boolean;
  conflictIds: string[];
  supersedesIds: string[];
  sourceHandles: SourceHandle[];
  graphPath?: GraphPathReceipt;
  scores: {
    lexical?: number;
    semantic?: number;
    exactIdentifier?: number;
    authority?: number;
    evidenceStrength?: number;
    review?: number;
    temporalFit?: number;
    freshness?: number;
    graphSupport?: number;
    taskAffinity?: number;
    diversity?: number;
    contradictionPenalty?: number;
    total: number;
  };
  boundaries: string[];
  metadata?: Record<string, unknown>;
}

export interface GraphPathStep {
  edgeId: string;
  edgeType: string;
  source: string;
  target: string;
  traversedFrom: string;
  traversedTo: string;
  direction: "out" | "in";
}

export interface GraphPathReceipt {
  graphSnapshotId: string;
  projection: CorpusProjection;
  nodeIds: string[];
  steps: GraphPathStep[];
  filters?: {
    edgeTypes?: string[];
    nodeTypes?: string[];
    maxDepth?: number;
    maxFanOut?: number;
  };
  omittedEdgeCount?: number;
  sourceHandles: SourceHandle[];
  limitations: string[];
}

export interface DynamicObservation {
  schemaVersion: "1.0";
  observationId: string;
  subjectId: string;
  metricOrProperty: string;
  value: unknown;
  unit?: string;
  sourceAuthority: string;
  adapterId: string;
  adapterVersion: string;
  environment?: string;
  chain?: string;
  network?: string;
  observedAt: string;
  sourceTimestamp?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  ingestedAt: string;
  reconciledAt?: string;
  freshUntil: string;
  status:
    | "VERIFIED"
    | "OBSERVED"
    | "DEGRADED"
    | "CONFLICT"
    | "STALE"
    | "UNKNOWN";
  confidence: number;
  supersedes?: string[];
  contradicts?: string[];
  reconciles?: string[];
  sourceHandles: SourceHandle[];
  limitations: string[];
}

export interface EvidenceClaim {
  claimId: string;
  statement: string;
  supportCandidateIds: string[];
  status:
    | "SUPPORTED"
    | "PARTIALLY_SUPPORTED"
    | "CONFLICTED"
    | "STALE"
    | "UNKNOWN"
    | "ACCESS_DENIED";
  inference: boolean;
  materiality: "low" | "medium" | "high" | "critical";
  boundary?: string;
}

export interface EvidencePacket {
  schemaVersion: "1.0";
  packetId: string;
  requestId: string;
  traceId: string;
  runtimeSha: string;
  corpus: {
    corpusId: string;
    version: string;
    inputDigest: string;
    projection: CorpusProjection;
  };
  retrievalPlan: RetrievalPlan;
  critic: {
    policyVersion: string;
    decision: CriticDecision;
    reasons: string[];
    expansionRounds: number;
  };
  claims: EvidenceClaim[];
  candidates: EvidenceCandidate[];
  dynamicObservations: DynamicObservation[];
  applicablePolicies: string[];
  applicableProcedures: string[];
  priorOutcomeIds: string[];
  conflicts: Array<{
    id: string;
    candidateIds: string[];
    explanation?: string;
  }>;
  unknowns: Array<{
    question: string;
    requiredSource?: string;
    gapId?: string;
  }>;
  authorityConstraints: string[];
  sourceHandles: SourceHandle[];
  tokenCount: number;
  generatedAt: string;
}

export type MemoryCandidateKind =
  | "FACT_CANDIDATE"
  | "OBSERVATION_CANDIDATE"
  | "PREFERENCE_CANDIDATE"
  | "RELATIONSHIP_CANDIDATE"
  | "LESSON_CANDIDATE"
  | "PROCEDURE_CANDIDATE"
  | "SKILL_CANDIDATE"
  | "RETRACTION_CANDIDATE"
  | "GAP_CANDIDATE";

export interface MemoryCandidate {
  schemaVersion: "1.0";
  candidateId: string;
  kind: MemoryCandidateKind;
  subjectId: string;
  statement: string;
  sourceTrajectoryIds: string[];
  sourceReceiptIds: string[];
  sourceHandles: SourceHandle[];
  proposedProjection: CorpusProjection;
  proposedTruthClass?: string;
  proposedAuthorityClass?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  confidence: number;
  privacyClass: string;
  consequenceLevel: ConsequenceLevel;
  duplicateOf?: string[];
  conflictsWith?: string[];
  supersedes?: string[];
  requiredReviewRole: string;
  createdAt: string;
}

export interface PromotionDecision {
  schemaVersion: "1.0";
  decisionId: string;
  candidateId: string;
  outcome: "APPROVED" | "REJECTED" | "NEEDS_MORE_EVIDENCE" | "DEFERRED";
  reviewerId: string;
  reviewerRole: string;
  rationale: string;
  evidenceHandles: SourceHandle[];
  resultingRecordId?: string;
  resultingSkillId?: string;
  resultingObservationId?: string;
  signedDigest?: string;
  decidedAt: string;
}

export interface CognitiveFabricReceipt {
  schemaVersion: "1.0";
  receiptId: string;
  requestId: string;
  traceId: string;
  runtimeSha: string;
  corpusVersion: string;
  corpusDigest: string;
  projection: CorpusProjection;
  queryClasses: QueryClass[];
  routerVersion: string;
  criticVersion: string;
  fusionVersion: string;
  retrievalSteps: Array<{
    stepId: string;
    mode: RetrievalMode;
    startedAt: string;
    completedAt: string;
    candidateCount: number;
    excludedCount: number;
    error?: string;
  }>;
  packetId?: string;
  criticDecision: CriticDecision;
  citationCount: number;
  dynamicReceiptIds: string[];
  tokenUsage?: {
    input: number;
    output: number;
  };
  costUsd?: number;
  latencyMs: number;
  outcome?: {
    type: "answer" | "plan" | "action" | "abstention";
    success?: boolean;
    evaluatorIds?: string[];
  };
  createdAt: string;
}

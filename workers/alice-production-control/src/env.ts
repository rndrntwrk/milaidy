import type { EvidenceQueueEnvelope } from "./evidence";
import type { AlicePlan } from "./plan";
import type { AliceRuntimeConfigSource } from "./runtime-config";

export interface AliceWorkerEnv extends AliceRuntimeConfigSource {
  ALICE_AUTHORITY: DurableObjectNamespace;
  ALICE_SESSIONS: DurableObjectNamespace;
  ALICE_PLANS: Workflow<AlicePlan>;
  ALICE_EVIDENCE_QUEUE: Queue<EvidenceQueueEnvelope>;
  ALICE_EVIDENCE_QUEUE_HMAC_KEY: string;
  ALICE_EVIDENCE: R2Bucket;
  ALICE_VERSION: WorkerVersionMetadata;
}

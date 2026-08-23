import type { EvidenceRecord } from "./evidence";
import { SessionLedger, type SessionLedgerState } from "./session";

type SessionEvidenceOutboxDependencies = {
  current(): SessionLedger;
  replace(ledger: SessionLedger): void;
  send(record: EvidenceRecord): Promise<void>;
  persist(state: SessionLedgerState): Promise<void>;
  scheduleRetry(at: number): Promise<void>;
  now(): number;
};

const RETRY_DELAY_MS = 10_000;
const MAX_FLUSH_PER_TURN = 16;

export async function flushSessionEvidenceOutbox(
  dependencies: SessionEvidenceOutboxDependencies,
): Promise<{ complete: boolean }> {
  try {
    for (let delivered = 0; delivered < MAX_FLUSH_PER_TURN; delivered += 1) {
      const current = dependencies.current();
      const record = current.pendingEvidence()[0];
      if (!record) return { complete: true };
      await dependencies.send(record);

      // Queue delivery is a non-storage await and another Durable Object event
      // may commit while it is in flight. Always acknowledge against the
      // instance's latest ledger, never the pre-send snapshot.
      const latest = dependencies.current();
      const snapshot = latest.snapshot();
      const candidate = SessionLedger.restoreStored(
        latest.exportState(),
        snapshot.sessionId,
        snapshot.binding.releaseDigest,
      );
      candidate.ackEvidence(record.eventId);
      candidate.assertPersistable();
      await dependencies.persist(candidate.exportState());
      dependencies.replace(candidate);
    }
    if (dependencies.current().pendingEvidence().length === 0) {
      return { complete: true };
    }
  } catch {
    // The state mutation and evidence record remain in one Durable Object
    // value. A retry can resend the same event id safely if queue delivery
    // succeeded but the acknowledgement write failed.
  }
  await dependencies.scheduleRetry(dependencies.now() + RETRY_DELAY_MS);
  return { complete: false };
}

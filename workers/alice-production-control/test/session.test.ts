import { describe, expect, test } from "bun:test";

import { SessionLedger } from "../src/session";
import { flushSessionEvidenceOutbox } from "../src/session-evidence-outbox";

const binding = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};

describe("Alice durable session ledger", () => {
  test("recovers ordered session events and task state after restoration", () => {
    const ledger = SessionLedger.create("session-production-canary", binding);
    expect(
      ledger.appendEvent({
        eventId: "event-1",
        eventType: "session.started",
        payloadHash: `sha256:${"4".repeat(64)}`,
        recordedAt: 1_787_400_000_000,
      }),
    ).toEqual({ ok: true, code: "EVENT_APPENDED", sequence: 1 });
    expect(
      ledger.upsertTask({
        taskId: "task-canary",
        state: "waiting",
        checkpointHash: `sha256:${"5".repeat(64)}`,
        updatedAt: 1_787_400_001_000,
      }),
    ).toEqual({ ok: true, code: "TASK_UPSERTED", revision: 1 });

    const restored = SessionLedger.restore(
      ledger.exportState(),
      "session-production-canary",
      binding,
    );
    expect(restored.snapshot()).toMatchObject({
      sessionId: "session-production-canary",
      eventCount: 1,
      sequence: 2,
      tasks: {
        "task-canary": {
          state: "waiting",
          revision: 1,
          checkpointHash: `sha256:${"5".repeat(64)}`,
        },
      },
    });
  });

  test("makes event replay and identical task replay idempotent", () => {
    const ledger = SessionLedger.create("session-production-canary", binding);
    const event = {
      eventId: "event-1",
      eventType: "session.started",
      payloadHash: `sha256:${"4".repeat(64)}`,
      recordedAt: 1_787_400_000_000,
    };
    ledger.appendEvent(event);
    expect(ledger.appendEvent(event)).toEqual({
      ok: true,
      code: "EVENT_ALREADY_RECORDED",
      sequence: 1,
    });
    const task = {
      taskId: "task-canary",
      state: "waiting",
      checkpointHash: `sha256:${"5".repeat(64)}`,
      updatedAt: 1_787_400_001_000,
    };
    ledger.upsertTask(task);
    expect(ledger.upsertTask(task)).toEqual({
      ok: true,
      code: "TASK_ALREADY_CURRENT",
      revision: 1,
    });
  });

  test("terminally closes the exact running Workflow task after PAUSE_ALL invalidates admission", () => {
    const ledger = SessionLedger.create("session-pause-interleave", binding);
    const checkpointHash = `sha256:${"a".repeat(64)}`;
    expect(
      ledger.upsertTask({
        taskId: "plan-pause-interleave",
        state: "running",
        checkpointHash,
        updatedAt: 1_787_400_000_000,
      }),
    ).toMatchObject({ ok: true });

    const closure = {
      taskId: "plan-pause-interleave",
      state: "failed",
      checkpointHash,
      updatedAt: 1_787_400_020_000,
    } as const;
    expect(ledger.closeRunningWorkflowTask(closure)).toEqual({
      ok: true,
      code: "WORKFLOW_TASK_TERMINALLY_CLOSED",
      revision: 2,
    });
    expect(ledger.snapshot().tasks["plan-pause-interleave"]).toMatchObject({
      state: "failed",
      checkpointHash,
      revision: 2,
    });
    expect(ledger.closeRunningWorkflowTask(closure)).toEqual({
      ok: true,
      code: "WORKFLOW_TASK_TERMINAL_ALREADY_CURRENT",
      revision: 2,
    });
  });

  test("terminally closes the old release task after a release transition", () => {
    const ledger = SessionLedger.create("session-release-interleave", binding);
    const checkpointHash = `sha256:${"b".repeat(64)}`;
    ledger.upsertTask({
      taskId: "plan-release-interleave",
      state: "running",
      checkpointHash,
      updatedAt: 1_787_400_000_000,
    });

    // A new release is now current elsewhere, but terminal recovery targets
    // the old release-scoped Session Durable Object by its stored digest.
    const oldReleaseSession = SessionLedger.restoreStored(
      ledger.exportState(),
      "session-release-interleave",
      binding.releaseDigest,
    );
    expect(
      oldReleaseSession.closeRunningWorkflowTask({
        taskId: "plan-release-interleave",
        state: "cancelled",
        checkpointHash,
        updatedAt: 1_787_400_020_000,
      }),
    ).toEqual({
      ok: true,
      code: "WORKFLOW_TASK_TERMINALLY_CLOSED",
      revision: 2,
    });
    expect(oldReleaseSession.snapshot()).toMatchObject({
      binding,
      tasks: { "plan-release-interleave": { state: "cancelled" } },
    });
  });

  test("terminal Workflow closure cannot mutate a different checkpoint or non-running task", () => {
    const ledger = SessionLedger.create("session-terminal-guard", binding);
    const checkpointHash = `sha256:${"c".repeat(64)}`;
    ledger.upsertTask({
      taskId: "plan-terminal-guard",
      state: "waiting",
      checkpointHash,
      updatedAt: 1_787_400_000_000,
    });
    expect(
      ledger.closeRunningWorkflowTask({
        taskId: "plan-terminal-guard",
        state: "failed",
        checkpointHash,
        updatedAt: 1_787_400_020_000,
      }),
    ).toEqual({ ok: false, code: "WORKFLOW_TASK_NOT_RUNNING" });
    expect(
      ledger.closeRunningWorkflowTask({
        taskId: "plan-terminal-guard",
        state: "failed",
        checkpointHash: `sha256:${"d".repeat(64)}`,
        updatedAt: 1_787_400_020_000,
      }),
    ).toEqual({ ok: false, code: "WORKFLOW_TASK_CHECKPOINT_MISMATCH" });
    expect(ledger.snapshot().tasks["plan-terminal-guard"]?.state).toBe("waiting");
  });

  test("rejects an event-id collision, stale task update, and release mismatch", () => {
    const ledger = SessionLedger.create("session-production-canary", binding);
    ledger.appendEvent({
      eventId: "event-1",
      eventType: "session.started",
      payloadHash: `sha256:${"4".repeat(64)}`,
      recordedAt: 1_787_400_000_000,
    });
    expect(
      ledger.appendEvent({
        eventId: "event-1",
        eventType: "session.changed",
        payloadHash: `sha256:${"6".repeat(64)}`,
        recordedAt: 1_787_400_001_000,
      }),
    ).toEqual({ ok: false, code: "EVENT_ID_COLLISION" });

    ledger.upsertTask({
      taskId: "task-canary",
      state: "waiting",
      checkpointHash: `sha256:${"5".repeat(64)}`,
      updatedAt: 1_787_400_002_000,
    });
    expect(
      ledger.upsertTask({
        taskId: "task-canary",
        state: "running",
        checkpointHash: `sha256:${"7".repeat(64)}`,
        updatedAt: 1_787_400_001_000,
      }),
    ).toEqual({ ok: false, code: "TASK_UPDATE_STALE" });

    expect(() =>
      SessionLedger.restore(ledger.exportState(), "session-production-canary", {
        ...binding,
        releaseDigest: `sha256:${"9".repeat(64)}`,
      }),
    ).toThrow("SESSION_RELEASE_MISMATCH");
  });

  test("retains every event id needed for durable replay protection", () => {
    const ledger = SessionLedger.create("session-retention", binding);
    for (let index = 0; index < 2_050; index += 1) {
      const suffix = index.toString().padStart(4, "0");
      expect(
        ledger.appendEvent({
          eventId: `event-retained-${suffix}`,
          eventType: "research.completed",
          payloadHash: `sha256:${"4".repeat(64)}`,
          recordedAt: 1_787_400_000_000 + index,
        }).ok,
      ).toBe(true);
    }
    expect(
      ledger.appendEvent({
        eventId: "event-retained-0000",
        eventType: "research.completed",
        payloadHash: `sha256:${"4".repeat(64)}`,
        recordedAt: 1_787_400_000_000,
      }),
    ).toMatchObject({ ok: true, code: "EVENT_ALREADY_RECORDED", sequence: 1 });
    expect(ledger.snapshot().eventCount).toBe(2_050);
  });

  test("renews the Program digest without losing durable transcript or task state", () => {
    const ledger = SessionLedger.create("owner-primary", binding);
    expect(
      ledger.appendConversationTurn({
        turnId: "turn-production-0001",
        userText: "Are you online?",
        assistantText: "Alice is online.",
        requestHash: `sha256:${"7".repeat(64)}`,
        responseHash: `sha256:${"8".repeat(64)}`,
        recordedAt: 1_787_400_000_000,
      }),
    ).toEqual({ ok: true, code: "CONVERSATION_TURN_APPENDED", sequence: 1 });
    ledger.upsertTask({
      taskId: "task-renewal",
      state: "waiting",
      checkpointHash: `sha256:${"5".repeat(64)}`,
      updatedAt: 1_787_400_001_000,
    });

    const renewedBinding = {
      ...binding,
      programDigest: `sha256:${"9".repeat(64)}`,
    };
    const restored = SessionLedger.restore(
      ledger.exportState(),
      "owner-primary",
      renewedBinding,
    );
    expect(restored.snapshot()).toMatchObject({
      binding: renewedBinding,
      conversationTurnCount: 1,
      conversationTurns: [
        {
          turnId: "turn-production-0001",
          userText: "Are you online?",
          assistantText: "Alice is online.",
        },
      ],
      tasks: { "task-renewal": { state: "waiting" } },
    });
  });

  test("restores read-only recovery state without a current ProgramEnvelope", () => {
    const ledger = SessionLedger.create("owner-recovery", binding);
    ledger.appendConversationTurn({
      turnId: "turn-recovery-0001",
      userText: "Persist this before expiry.",
      assistantText: "Persisted.",
      requestHash: `sha256:${"7".repeat(64)}`,
      responseHash: `sha256:${"8".repeat(64)}`,
      recordedAt: 1_787_400_000_000,
    });
    const recovered = SessionLedger.restoreStored(
      ledger.exportState(),
      "owner-recovery",
      binding.releaseDigest,
    );
    expect(recovered.conversationContext()).toMatchObject({
      sessionId: "owner-recovery",
      recentTurns: [{ assistantText: "Persisted." }],
    });
  });

  test("explicitly rebinds a warm session on Program renewal", () => {
    const ledger = SessionLedger.create("owner-warm-renewal", binding);
    const renewed = { ...binding, programDigest: `sha256:${"9".repeat(64)}` };
    expect(ledger.rebind(renewed)).toEqual({
      ok: true,
      code: "SESSION_BINDING_RENEWED",
    });
    expect(ledger.snapshot().binding).toEqual(renewed);
    expect(ledger.rebind(renewed)).toEqual({
      ok: true,
      code: "SESSION_BINDING_ALREADY_CURRENT",
    });
  });

  test("makes durable transcript replay idempotent and rejects a turn collision", () => {
    const ledger = SessionLedger.create("owner-primary", binding);
    const turn = {
      turnId: "turn-production-0002",
      userText: "Remember this.",
      assistantText: "Recorded durably.",
      requestHash: `sha256:${"7".repeat(64)}`,
      responseHash: `sha256:${"8".repeat(64)}`,
      recordedAt: 1_787_400_000_000,
    };
    ledger.appendConversationTurn(turn);
    expect(ledger.appendConversationTurn(turn)).toEqual({
      ok: true,
      code: "CONVERSATION_TURN_ALREADY_RECORDED",
      sequence: 1,
    });
    expect(
      ledger.appendConversationTurn({ ...turn, recordedAt: turn.recordedAt + 10_000 }),
    ).toEqual({
      ok: true,
      code: "CONVERSATION_TURN_ALREADY_RECORDED",
      sequence: 1,
    });
    expect(
      ledger.appendConversationTurn({ ...turn, assistantText: "Different" }),
    ).toEqual({ ok: false, code: "CONVERSATION_TURN_COLLISION" });
  });

  test("fails before a transcript can exceed the Durable Object value boundary", () => {
    const ledger = SessionLedger.create("owner-bounded", binding);
    let result: ReturnType<typeof ledger.appendConversationTurn> | null = null;
    for (let index = 0; index < 100; index += 1) {
      result = ledger.appendConversationTurn({
        turnId: `turn-bounded-${index.toString().padStart(4, "0")}`,
        userText: `question-${index}-${"u".repeat(90_000)}`,
        assistantText: `answer-${index}-${"a".repeat(30_000)}`,
        requestHash: `sha256:${index.toString(16).padStart(64, "0")}`,
        responseHash: `sha256:${(index + 100).toString(16).padStart(64, "0")}`,
        recordedAt: 1_787_400_000_000 + index,
      });
      if (!result.ok) break;
    }
    expect(result).toEqual({ ok: false, code: "CONVERSATION_TRANSCRIPT_FULL" });
    const exported = ledger.exportState();
    expect(new TextEncoder().encode(JSON.stringify(exported)).byteLength).toBeLessThanOrEqual(
      1_500_000,
    );
    expect(() =>
      SessionLedger.restore(exported, "owner-bounded", binding),
    ).not.toThrow();
  });

  test("commits session evidence in the same recoverable ledger state", () => {
    const ledger = SessionLedger.create("owner-outbox", binding);
    expect(
      ledger.appendEvent({
        eventId: "event-outbox-0001",
        eventType: "research.completed",
        payloadHash: `sha256:${"4".repeat(64)}`,
        recordedAt: 1_787_400_000_000,
      }),
    ).toMatchObject({ ok: true, code: "EVENT_APPENDED" });
    const record = {
      schemaVersion: "alice.evidence.v1" as const,
      eventId: "evt-session-outbox-0001",
      occurredAt: new Date(1_787_400_000_000).toISOString(),
      kind: "session.event",
      actor: "owner:sha256:abc123",
      outcome: "EVENT_APPENDED",
      binding,
      subjectId: "event-outbox-0001",
      details: { sessionId: "owner-outbox", persisted: true },
    };
    expect(ledger.stageEvidence(record, 32)).toEqual({
      ok: true,
      code: "EVIDENCE_STAGED",
    });

    const restored = SessionLedger.restoreStored(
      ledger.exportState(),
      "owner-outbox",
      binding.releaseDigest,
    );
    expect(restored.pendingEvidence()).toEqual([record]);
  });

  test("retains session evidence across an injected queue failure and drains on retry", async () => {
    const ledger = SessionLedger.create("owner-outbox-retry", binding);
    const record = {
      schemaVersion: "alice.evidence.v1" as const,
      eventId: "evt-session-outbox-retry-0001",
      occurredAt: new Date(1_787_400_000_000).toISOString(),
      kind: "session.task",
      actor: "owner:sha256:abc123",
      outcome: "TASK_UPSERTED",
      binding,
      subjectId: "task-outbox-retry",
      details: { sessionId: "owner-outbox-retry", persisted: true },
    };
    expect(ledger.stageEvidence(record, 32).ok).toBe(true);
    let alarmAt = 0;
    let current = ledger;
    const failed = await flushSessionEvidenceOutbox({
      current: () => current,
      replace: (next) => {
        current = next;
      },
      send: async () => {
        throw new Error("INJECTED_QUEUE_FAILURE");
      },
      persist: async () => {
        throw new Error("must not acknowledge before send");
      },
      scheduleRetry: async (at) => {
        alarmAt = at;
      },
      now: () => 1_787_400_000_000,
    });
    expect(failed.complete).toBe(false);
    expect(current.pendingEvidence()).toEqual([record]);
    expect(alarmAt).toBeGreaterThan(1_787_400_000_000);

    const persisted: unknown[] = [];
    const retried = await flushSessionEvidenceOutbox({
      current: () => current,
      replace: (next) => {
        current = next;
      },
      send: async () => undefined,
      persist: async (state) => {
        persisted.push(state);
      },
      scheduleRetry: async () => undefined,
      now: () => 1_787_400_010_000,
    });
    expect(retried.complete).toBe(true);
    expect(current.pendingEvidence()).toEqual([]);
    expect(persisted).toHaveLength(1);
  });

  test("retains a session mutation committed while queue delivery is in flight", async () => {
    const first = {
      schemaVersion: "alice.evidence.v1" as const,
      eventId: "evt-session-concurrent-0001",
      occurredAt: new Date(1_787_400_000_000).toISOString(),
      kind: "session.event",
      actor: "owner:sha256:abc123",
      outcome: "EVENT_APPENDED",
      binding,
      subjectId: "event-session-concurrent-0001",
      details: { sessionId: "owner-outbox-concurrent", persisted: true },
    };
    const second = {
      ...first,
      eventId: "evt-session-concurrent-0002",
      occurredAt: new Date(1_787_400_000_001).toISOString(),
      subjectId: "event-session-concurrent-0002",
    };
    let current = SessionLedger.create("owner-outbox-concurrent", binding);
    expect(
      current.appendEvent({
        eventId: first.subjectId,
        eventType: "research.completed",
        payloadHash: `sha256:${"4".repeat(64)}`,
        recordedAt: 1_787_400_000_000,
      }).ok,
    ).toBe(true);
    expect(current.stageEvidence(first, 32).ok).toBe(true);

    let releaseFirstSend!: () => void;
    let markFirstSendStarted!: () => void;
    const firstSendStarted = new Promise<void>((resolve) => {
      markFirstSendStarted = resolve;
    });
    const firstSendGate = new Promise<void>((resolve) => {
      releaseFirstSend = resolve;
    });
    const delivered: string[] = [];
    const persisted: unknown[] = [];
    const flushing = flushSessionEvidenceOutbox({
      current: () => current,
      replace: (next) => {
        current = next;
      },
      send: async (record) => {
        delivered.push(record.eventId);
        if (record.eventId === first.eventId) {
          markFirstSendStarted();
          await firstSendGate;
        }
      },
      persist: async (state) => {
        persisted.push(state);
      },
      scheduleRetry: async () => undefined,
      now: () => 1_787_400_010_000,
    });

    await firstSendStarted;
    const concurrentlyCommitted = SessionLedger.restoreStored(
      current.exportState(),
      "owner-outbox-concurrent",
      binding.releaseDigest,
    );
    expect(
      concurrentlyCommitted.appendEvent({
        eventId: second.subjectId,
        eventType: "research.completed",
        payloadHash: `sha256:${"5".repeat(64)}`,
        recordedAt: 1_787_400_000_001,
      }).ok,
    ).toBe(true);
    expect(concurrentlyCommitted.stageEvidence(second, 32).ok).toBe(true);
    current = concurrentlyCommitted;
    releaseFirstSend();

    expect((await flushing).complete).toBe(true);
    expect(current.snapshot().events.map((event) => event.eventId)).toEqual([
      first.subjectId,
      second.subjectId,
    ]);
    expect(current.pendingEvidence()).toEqual([]);
    expect(delivered).toEqual([first.eventId, second.eventId]);
    expect(persisted).toHaveLength(2);
  });
});

import { describe, expect, test } from "bun:test";

import {
  AUTHORITY_PERSISTENCE_LIMITS,
  AuthorityLedger,
  type AuthorityLedgerState,
  type VerifiedRecoveryAuthorization,
} from "../src/authority";
import { createEvidenceRecord } from "../src/evidence";

const binding = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};
const baseDeploymentManifestSha256 = `sha256:${"4".repeat(64)}`;
const promotedDeploymentManifestSha256 = `sha256:${"5".repeat(64)}`;

function recoveryAuthorization(
  ledger: AuthorityLedger,
  receiptHash: string,
): VerifiedRecoveryAuthorization {
  const current = ledger.snapshot();
  return {
    receiptHash,
    currentBinding: current.binding,
    currentDeploymentManifestSha256: current.deploymentManifestSha256,
    currentReleaseEpoch: current.activeReleaseEpoch,
    currentRollbackBoundary: current.rollbackBoundary,
  };
}

function researchIntent(nonce: string) {
  return {
    intentId: `intent-${nonce}`,
    action: "research.read",
    target: "source:deployment-handoff",
    argumentHash: `sha256:${"4".repeat(64)}`,
    nonce,
    expiresAt: 1_787_400_060_000,
    ...binding,
  };
}

describe("Alice durable authority ledger", () => {
  test("persists a first-release PAUSE_ALL generation transition", () => {
    const zero = `sha256:${"0".repeat(64)}`;
    const zeroBinding = {
      programDigest: zero,
      releaseDigest: zero,
      policyHash: zero,
    };
    const ledger = AuthorityLedger.create(
      zeroBinding,
      100,
      "release:unadmitted",
      0,
      0,
      zero,
    );

    expect(ledger.snapshot().admissionGeneration).toBe(0);
    expect(
      ledger.pause(
        "all",
        1_787_400_000_000,
        "deployment-controller:pause-only",
        "pause-first-release-0001",
      ),
    ).toMatchObject({ ok: true, code: "SCOPE_PAUSED" });
    expect(ledger.snapshot().admissionGeneration).toBe(1);
    expect(() =>
      ledger.assertPersistable(AUTHORITY_PERSISTENCE_LIMITS.pauseAllBytes),
    ).not.toThrow();
    expect(() =>
      AuthorityLedger.restoreGlobal(ledger.exportState(), 100),
    ).not.toThrow();
  });

  test("makes an exact authorized intent idempotent after state restoration", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    expect(ledger.authorize(researchIntent("nonce-one"), 1_787_400_000_000)).toEqual({
      allowed: true,
      code: "AUTONOMOUS_LOW_RISK",
      risk: "low",
    });

    const restored = AuthorityLedger.restore(ledger.exportState(), binding, 100);
    expect(restored.authorize(researchIntent("nonce-one"), 1_787_400_001_000)).toEqual({
      allowed: true,
      code: "INTENT_ALREADY_AUTHORIZED",
      risk: "low",
    });
  });

  test("an idempotent intent replay still obeys expiry and PAUSE_ALL", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    const intent = researchIntent("nonce-replay-control");
    expect(ledger.authorize(intent, 1_787_400_000_000).allowed).toBe(true);
    expect(ledger.pause("all", 1_787_400_001_000, "owner-subject").ok).toBe(true);
    expect(ledger.authorize(intent, 1_787_400_002_000)).toEqual({
      allowed: false,
      code: "PAUSED_ALL",
      risk: "low",
    });
    expect(
      ledger.authorize(intent, intent.expiresAt),
    ).toEqual({ allowed: false, code: "INTENT_EXPIRED", risk: "low" });
  });

  test("an idempotent intent replay still obeys PAUSE_RELEASE", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    const intent = researchIntent("nonce-replay-release-control");
    expect(ledger.authorize(intent, 1_787_400_000_000).allowed).toBe(true);
    expect(
      ledger.pause(
        "release",
        1_787_400_001_000,
        "owner-subject",
        "pause-release-replay-0001",
      ).ok,
    ).toBe(true);
    expect(ledger.authorize(intent, 1_787_400_002_000)).toEqual({
      allowed: false,
      code: "PAUSED_RELEASE",
      risk: "low",
    });
  });

  test("persists evidence outbox records with the critical mutation until acknowledged", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    const decision = ledger.authorize(
      researchIntent("nonce-outbox-authorize"),
      1_787_400_000_000,
    );
    expect(decision.allowed).toBe(true);
    const record = createEvidenceRecord({
      eventId: "evt-outbox-authorize-0001",
      occurredAt: "2026-08-22T18:01:02.003Z",
      kind: "intent.authorization",
      actor: "owner:sha256:abcdef",
      outcome: decision.code,
      binding,
      subjectId: "intent-nonce-outbox-authorize",
      details: { allowed: true, risk: "low" },
    });
    expect(ledger.stageEvidence(record)).toEqual({
      ok: true,
      code: "EVIDENCE_STAGED",
    });

    const restored = AuthorityLedger.restoreGlobal(ledger.exportState(), 100);
    expect(restored.pendingEvidence()).toEqual([record]);
    expect(restored.ackEvidence(record.eventId)).toEqual({
      ok: true,
      code: "EVIDENCE_ACKNOWLEDGED",
    });
    expect(
      AuthorityLedger.restoreGlobal(restored.exportState(), 100).pendingEvidence(),
    ).toEqual([]);
  });

  test("reserves durable headroom so PAUSE_ALL survives an exhausted operational ledger", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    for (let index = 0; index < AUTHORITY_PERSISTENCE_LIMITS.operationalOutboxRecords; index += 1) {
      expect(
        ledger.stageEvidence(
          createEvidenceRecord({
            eventId: `evt-operational-backlog-${index.toString().padStart(4, "0")}`,
            occurredAt: new Date(1_787_400_000_000 + index).toISOString(),
            kind: "intent.authorization",
            actor: "owner:sha256:abcdef",
            outcome: "AUTONOMOUS_LOW_RISK",
            binding,
            subjectId: `intent-backlog-${index.toString().padStart(4, "0")}`,
            details: { allowed: true },
          }),
        ).ok,
      ).toBe(true);
    }
    let index = 0;
    let stateBytes = 0;
    while (stateBytes < AUTHORITY_PERSISTENCE_LIMITS.operationalBytes + 10_000) {
      for (let batchIndex = 0; batchIndex < 25; batchIndex += 1) {
        const suffix = index.toString().padStart(5, "0");
        expect(
          ledger.authorize(
            {
              ...researchIntent(`nonce-headroom-${suffix}`),
              intentId: `intent-headroom-${suffix}`,
            },
            1_787_400_000_000,
          ).allowed,
        ).toBe(true);
        index += 1;
        expect(index).toBeLessThan(5_000);
      }
      stateBytes = new TextEncoder().encode(JSON.stringify(ledger.exportState())).byteLength;
    }
    expect(() => ledger.assertPersistable()).toThrow("AUTHORITY_LEDGER_FULL");

    const paused = ledger.pause(
      "all",
      1_787_400_010_000,
      "owner:sha256:abcdef",
      "pause-all-headroom-0001",
    );
    expect(paused.ok).toBe(true);
    expect(
      ledger.stageEvidence(
        createEvidenceRecord({
          eventId: "evt-pause-all-headroom-0001",
          occurredAt: "2026-08-22T18:10:00.000Z",
          kind: "control.pause",
          actor: "owner:sha256:abcdef",
          outcome: "SCOPE_PAUSED",
          binding,
          subjectId: "scope:all",
          details: { paused: true, pauseId: "pause-all-headroom-0001" },
        }),
        AUTHORITY_PERSISTENCE_LIMITS.pauseAllOutboxRecords,
      ).ok,
    ).toBe(true);
    expect(() =>
      ledger.assertPersistable(AUTHORITY_PERSISTENCE_LIMITS.pauseAllBytes),
    ).not.toThrow();
    expect(
      ledger.authorize(researchIntent("nonce-after-headroom-pause"), 1_787_400_011_000),
    ).toMatchObject({ allowed: false, code: "PAUSED_ALL" });
    expect(
      ledger.reserveModel(
        {
          requestId: "request-after-headroom-pause",
          model: "workers-ai/@cf/openai/gpt-oss-20b",
          estimatedUnits: 1,
          ...binding,
        },
        1_787_400_011_000,
      ),
    ).toMatchObject({ allowed: false, code: "PAUSED_ALL" });
  });

  test("retains replay protection beyond the former in-memory window", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    const now = 1_787_400_000_000;
    for (let index = 0; index < 2_050; index += 1) {
      const suffix = index.toString().padStart(4, "0");
      const intent = {
        ...researchIntent(`nonce-retained-${suffix}`),
        intentId: `intent-retained-${suffix}`,
      };
      expect(ledger.authorize(intent, now).allowed).toBe(true);
    }
    expect(
      ledger.authorize(
        {
          ...researchIntent("nonce-retained-0000"),
          intentId: "intent-retained-0000",
        },
        now + 1,
      ),
    ).toEqual({
      allowed: true,
      code: "INTENT_ALREADY_AUTHORIZED",
      risk: "low",
    });
  });

  test("rejects nonce replay under a different intent id", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    ledger.authorize(researchIntent("nonce-one"), 1_787_400_000_000);
    expect(
      ledger.authorize(
        { ...researchIntent("nonce-one"), intentId: "intent-different" },
        1_787_400_001_000,
      ),
    ).toEqual({
      allowed: false,
      code: "NONCE_REPLAY",
      risk: "low",
    });
  });

  test("persists PAUSE_ALL and independently restores it with a recovery receipt", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    expect(ledger.snapshot().admissionGeneration).toBe(1);
    expect(ledger.pause("all", 1_787_400_000_000, "owner-subject", "pause-all-0001")).toMatchObject({
      ok: true,
      code: "SCOPE_PAUSED",
      pause: {
        pauseId: "pause-all-0001",
        pausedAt: 1_787_400_000_000,
        deploymentManifestSha256: baseDeploymentManifestSha256,
      },
    });
    const restored = AuthorityLedger.restore(ledger.exportState(), binding, 100);
    expect(restored.authorize(researchIntent("nonce-paused"), 1_787_400_001_000)).toEqual({
      allowed: false,
      code: "PAUSED_ALL",
      risk: "low",
    });
    expect(restored.snapshot().admissionGeneration).toBe(2);
    expect(
      restored.resume(
        "all",
        1_787_400_002_000,
        "owner-subject",
        "pause-all-wrong",
        recoveryAuthorization(restored, `sha256:${"a".repeat(64)}`),
      ),
    ).toEqual({ ok: false, code: "RECOVERY_PAUSE_MISMATCH" });
    expect(
      restored.resume(
        "all",
        1_787_400_002_000,
        "owner-subject",
        "pause-all-0001",
        recoveryAuthorization(restored, `sha256:${"a".repeat(64)}`),
      ),
    ).toEqual({ ok: true, code: "SCOPE_RESUMED" });
    expect(restored.snapshot().admissionGeneration).toBe(3);
    expect(restored.authorize(researchIntent("nonce-paused"), 1_787_400_003_000)).toEqual({
      allowed: true,
      code: "AUTONOMOUS_LOW_RISK",
      risk: "low",
    });
  });

  test("retains recovery receipt replay protection without a rolling eviction window", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    const now = 1_787_400_000_000;
    for (let index = 0; index < 300; index += 1) {
      const receiptHash = `sha256:${index.toString(16).padStart(64, "0")}`;
      const pauseId = `pause-replay-${index.toString().padStart(4, "0")}`;
      expect(ledger.pause("all", now + index * 2, "owner-subject", pauseId).ok).toBe(true);
      expect(
        ledger.resume(
          "all",
          now + index * 2 + 1,
          "owner-subject",
          pauseId,
          recoveryAuthorization(ledger, receiptHash),
        ).ok,
      ).toBe(true);
    }
    expect(ledger.pause("all", now + 1_000, "owner-subject", "pause-replay-final").ok).toBe(true);
    expect(
      ledger.resume(
        "all",
        now + 1_001,
        "owner-subject",
        "pause-replay-final",
        recoveryAuthorization(ledger, `sha256:${"0".repeat(64)}`),
      ),
    ).toEqual({ ok: false, code: "RECOVERY_RECEIPT_INVALID" });
    expect(ledger.exportState().usedRecoveryReceipts).toHaveLength(300);
  });

  test("reserves a daily model budget idempotently and preserves it across restoration", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    const request = {
      requestId: "request-one",
      model: "workers-ai/@cf/openai/gpt-oss-20b",
      estimatedUnits: 40,
      ...binding,
    };
    expect(ledger.reserveModel(request, Date.UTC(2026, 7, 22, 12))).toMatchObject({
      allowed: true,
      code: "MODEL_BUDGET_RESERVED",
      usedUnits: 40,
    });
    const restored = AuthorityLedger.restore(ledger.exportState(), binding, 100);
    expect(restored.reserveModel(request, Date.UTC(2026, 7, 22, 13))).toMatchObject({
      allowed: true,
      code: "MODEL_BUDGET_ALREADY_RESERVED",
      usedUnits: 40,
    });
    expect(
      restored.reserveModel(
        { ...request, requestId: "request-two", estimatedUnits: 61 },
        Date.UTC(2026, 7, 22, 14),
      ),
    ).toMatchObject({
      allowed: false,
      code: "MODEL_BUDGET_EXCEEDED",
      usedUnits: 40,
    });
  });

  test("reconciles a lowered budget as an explicit durable PAUSE_ALL mutation", () => {
    const day = Date.UTC(2026, 7, 22, 12);
    const ledger = AuthorityLedger.create(binding, 100);
    expect(
      ledger.reserveModel(
        {
          requestId: "request-before-budget-lower",
          model: "workers-ai/@cf/openai/gpt-oss-20b",
          estimatedUnits: 80,
          ...binding,
        },
        day,
      ).allowed,
    ).toBe(true);
    const stored = ledger.exportState();
    const restored = AuthorityLedger.restoreGlobal(stored, 50);
    expect(restored.snapshot().budget.maxUnits).toBe(100);
    expect(restored.snapshot().pausedScopes).toEqual([]);

    const reconciled = restored.reconcileBudgetLimit(50, day + 1);
    expect(reconciled).toMatchObject({
      changed: true,
      code: "BUDGET_INVARIANT_PAUSED",
      previousMaxUnits: 100,
      effectiveMaxUnits: 50,
      usedUnits: 80,
      pause: {
        pauseId: "pause-budget-invariant-3",
        pausedBy: "authority:budget-invariant",
      },
    });
    expect(restored.snapshot()).toMatchObject({
      admissionGeneration: 2,
      pausedScopes: ["all"],
      budget: { usedUnits: 80, maxUnits: 50 },
      sequence: 3,
    });
    const evicted = AuthorityLedger.restoreGlobal(restored.exportState(), 50);
    expect(evicted.snapshot().pausedScopes).toEqual(["all"]);
    expect(evicted.snapshot().budget).toMatchObject({ usedUnits: 80, maxUnits: 50 });
  });

  test("reopens a budget-invariant pause after same-window recovery and permits next-window recovery", () => {
    const day = Date.UTC(2026, 7, 22, 12);
    const ledger = AuthorityLedger.create(binding, 100);
    ledger.reserveModel(
      {
        requestId: "request-before-budget-repause",
        model: "workers-ai/@cf/openai/gpt-oss-20b",
        estimatedUnits: 80,
        ...binding,
      },
      day,
    );
    ledger.reconcileBudgetLimit(50, day + 1);
    const firstPause = ledger.activePause("all")!;
    expect(
      ledger.resume(
        "all",
        day + 2,
        "owner-subject",
        firstPause.pauseId,
        recoveryAuthorization(ledger, `sha256:${"a".repeat(64)}`),
      ),
    ).toMatchObject({
      ok: false,
      code: "BUDGET_INVARIANT_REPAUSED",
      pause: { pauseId: "pause-budget-invariant-4" },
    });
    expect(ledger.snapshot()).toMatchObject({
      admissionGeneration: 3,
      pausedScopes: ["all"],
      budget: { usedUnits: 80, maxUnits: 50 },
      sequence: 4,
    });

    const nextDay = Date.UTC(2026, 7, 23, 0, 1);
    const nextPause = ledger.activePause("all")!;
    expect(
      ledger.resume(
        "all",
        nextDay,
        "owner-subject",
        nextPause.pauseId,
        recoveryAuthorization(ledger, `sha256:${"b".repeat(64)}`),
      ),
    ).toEqual({ ok: true, code: "SCOPE_RESUMED" });
    expect(ledger.snapshot()).toMatchObject({
      pausedScopes: [],
      budget: { usedUnits: 0, maxUnits: 50 },
    });
  });

  test("fails a release promotion closed while a lowered-budget invariant pause is active", () => {
    const day = Date.UTC(2026, 7, 22, 12);
    const ledger = AuthorityLedger.create(binding, 100);
    ledger.reserveModel(
      {
        requestId: "request-before-lowered-budget-release",
        model: "workers-ai/@cf/openai/gpt-oss-20b",
        estimatedUnits: 80,
        ...binding,
      },
      day,
    );
    ledger.reconcileBudgetLimit(50, day + 1);
    expect(
      ledger.activateRelease(
        {
          binding: {
            ...binding,
            programDigest: `sha256:${"5".repeat(64)}`,
            releaseDigest: `sha256:${"6".repeat(64)}`,
          },
          deploymentManifestSha256: promotedDeploymentManifestSha256,
          releaseEpoch: 2,
          programIssuedAt: day + 2,
          rollbackBoundary: "modal:alice-runtime:v49",
        },
        50,
        day + 2,
      ),
    ).toEqual({ ok: false, code: "RELEASE_PAUSED" });
  });

  test("permits only exact release transitions under the machine deployment pause", () => {
    const now = Date.UTC(2026, 7, 22, 12);
    const candidate = {
      binding: {
        ...binding,
        programDigest: `sha256:${"5".repeat(64)}`,
        releaseDigest: `sha256:${"6".repeat(64)}`,
      },
      deploymentManifestSha256: promotedDeploymentManifestSha256,
      releaseEpoch: 2,
      programIssuedAt: now,
      rollbackBoundary: "modal:alice-runtime:v49",
    };
    const emergency = AuthorityLedger.create(
      binding,
      100,
      "modal:alice-runtime:v48",
      1,
      now - 10_000,
    );
    emergency.pause("all", now - 1, "recovery:deployment-controller");
    expect(emergency.activateRelease(candidate, 100, now)).toEqual({
      ok: false,
      code: "RELEASE_PAUSED",
    });

    const deployment = AuthorityLedger.create(
      binding,
      100,
      "modal:alice-runtime:v48",
      1,
      now - 10_000,
    );
    deployment.pause(
      "all",
      now - 1,
      "deployment-controller:pause-only",
      "pause-deployment-transition-0001",
    );
    expect(deployment.activateRelease(candidate, 100, now)).toEqual({
      ok: true,
      code: "RELEASE_ACTIVATED",
    });
    expect(deployment.snapshot().pausedScopes).toEqual(["all"]);
    expect(deployment.authorize({
      ...researchIntent("nonce-deployment-transition"),
      ...candidate.binding,
    }, now + 1)).toMatchObject({ allowed: false, code: "PAUSED_ALL" });

    const releasePaused = AuthorityLedger.restoreGlobal(
      deployment.exportState(),
      100,
    );
    releasePaused.pause(
      "release",
      now + 2,
      "owner-subject",
      "pause-release-transition-0001",
    );
    expect(releasePaused.activateRelease({
      ...candidate,
      binding: {
        ...candidate.binding,
        programDigest: `sha256:${"7".repeat(64)}`,
      },
      programIssuedAt: now + 3,
    }, 100, now + 3)).toEqual({ ok: false, code: "RELEASE_PAUSED" });
  });

  test("resets the budget only at a UTC day boundary", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    const first = {
      requestId: "request-day-one",
      model: "workers-ai/@cf/openai/gpt-oss-20b",
      estimatedUnits: 90,
      ...binding,
    };
    ledger.reserveModel(first, Date.UTC(2026, 7, 22, 23, 59));
    expect(
      ledger.reserveModel(
        { ...first, requestId: "request-day-two", estimatedUnits: 90 },
        Date.UTC(2026, 7, 23, 0, 1),
      ),
    ).toMatchObject({ allowed: true, usedUnits: 90 });
  });

  test("rejects unknown pause scopes and a restored state from another release", () => {
    const ledger = AuthorityLedger.create(binding, 100);
    expect(ledger.pause("unknown", 1_787_400_000_000, "owner-subject")).toEqual({
      ok: false,
      code: "PAUSE_SCOPE_INVALID",
    });
    expect(() =>
      AuthorityLedger.restore(
        ledger.exportState(),
        { ...binding, releaseDigest: `sha256:${"9".repeat(64)}` },
        100,
      ),
    ).toThrow("AUTHORITY_RELEASE_MISMATCH");
  });

  test("blocks release changes while paused and preserves same-day spend across promotion, renewal, and rollback", () => {
    const day = Date.UTC(2026, 7, 22, 12);
    const promotedBinding = {
      ...binding,
      programDigest: `sha256:${"5".repeat(64)}`,
      releaseDigest: `sha256:${"6".repeat(64)}`,
    };
    const renewedBinding = {
      ...promotedBinding,
      programDigest: `sha256:${"7".repeat(64)}`,
    };
    const baseRelease = {
      binding,
      deploymentManifestSha256: baseDeploymentManifestSha256,
      releaseEpoch: 1,
      programIssuedAt: day - 10_000,
      rollbackBoundary: "modal:alice-runtime:v48",
    };
    const promotedRelease = {
      binding: promotedBinding,
      deploymentManifestSha256: promotedDeploymentManifestSha256,
      releaseEpoch: 2,
      programIssuedAt: day,
      rollbackBoundary: "modal:alice-runtime:v49",
    };
    const renewedRelease = {
      ...promotedRelease,
      binding: renewedBinding,
      programIssuedAt: day + 8,
    };
    const ledger = AuthorityLedger.create(
      binding,
      100,
      baseRelease.rollbackBoundary,
      baseRelease.releaseEpoch,
      baseRelease.programIssuedAt,
    );
    expect(
      ledger.reserveModel(
        {
          requestId: "request-release-one",
          model: "workers-ai/@cf/openai/gpt-oss-20b",
          estimatedUnits: 90,
          ...binding,
        },
        day,
      ).allowed,
    ).toBe(true);
    ledger.pause("all", day + 1, "owner-subject");

    const promoted = AuthorityLedger.restoreGlobal(ledger.exportState(), 100);
    expect(promoted.activateRelease(promotedRelease, 100, day + 2)).toEqual({
      ok: false,
      code: "RELEASE_PAUSED",
    });
    expect(promoted.snapshot().binding).toEqual(binding);
    expect(promoted.authorize(researchIntent("nonce-promoted"), day + 3)).toMatchObject({
      allowed: false,
      code: "PAUSED_ALL",
    });
    expect(promoted.snapshot().budget.usedUnits).toBe(90);

    expect(
      promoted.resume(
        "all",
        day + 4,
        "owner-subject",
        `pause-test-${day + 1}`,
        recoveryAuthorization(promoted, `sha256:${"a".repeat(64)}`),
      ).ok,
    ).toBe(true);
    expect(promoted.activateRelease(promotedRelease, 100, day + 5)).toEqual({
      ok: true,
      code: "RELEASE_ACTIVATED",
    });
    expect(promoted.snapshot().budget.usedUnits).toBe(90);

    expect(
      promoted.pause("release", day + 6, "owner-subject", "pause-release-0001").ok,
    ).toBe(true);
    expect(promoted.activateRelease(renewedRelease, 100, day + 7)).toEqual({
      ok: false,
      code: "RELEASE_PAUSED",
    });
    expect(promoted.snapshot().binding).toEqual(promotedBinding);
    expect(
      promoted.resume(
        "release",
        day + 8,
        "owner-subject",
        "pause-release-0001",
        recoveryAuthorization(promoted, `sha256:${"b".repeat(64)}`),
      ).ok,
    ).toBe(true);
    expect(
      promoted.activateRelease(
        { ...renewedRelease, programIssuedAt: promotedRelease.programIssuedAt },
        100,
        day + 9,
      ),
    ).toEqual({ ok: false, code: "PROGRAM_ISSUED_AT_REPLAY" });
    expect(promoted.activateRelease(renewedRelease, 100, day + 9)).toEqual({
      ok: true,
      code: "PROGRAM_RENEWED",
    });
    expect(promoted.snapshot().budget.usedUnits).toBe(90);

    expect(promoted.activateRelease(baseRelease, 100, day + 10)).toEqual({
      ok: false,
      code: "RELEASE_ROLLBACK_AUTH_REQUIRED",
    });
    expect(
      promoted.activateRelease(baseRelease, 100, day + 10, {
        receiptHash: `sha256:${"d".repeat(64)}`,
        currentBinding: renewedBinding,
        currentDeploymentManifestSha256: `sha256:${"0".repeat(64)}`,
        currentReleaseEpoch: 2,
        currentRollbackBoundary: "modal:alice-runtime:v49",
      }),
    ).toEqual({ ok: false, code: "RELEASE_ROLLBACK_STATE_MISMATCH" });
    expect(
      promoted.activateRelease(
        baseRelease,
        100,
        day + 10,
        {
          receiptHash: `sha256:${"c".repeat(64)}`,
          currentBinding: renewedBinding,
          currentDeploymentManifestSha256: promotedDeploymentManifestSha256,
          currentReleaseEpoch: 2,
          currentRollbackBoundary: "modal:alice-runtime:v49",
        },
      ),
    ).toEqual({ ok: true, code: "RELEASE_ROLLED_BACK" });
    expect(promoted.snapshot()).toMatchObject({ pausedScopes: [], budget: { usedUnits: 90 } });
    expect(promoted.snapshot()).toMatchObject({
      activeReleaseEpoch: 1,
      highestReleaseEpoch: 2,
    });
  });

  test("rejects a resume authorization made stale by a forward release activation", () => {
    const now = Date.UTC(2026, 7, 22, 12);
    const ledger = AuthorityLedger.create(
      binding,
      100,
      "modal:alice-runtime:v48",
      1,
      now - 10_000,
    );
    expect(
      ledger.pause("model", now, "owner-subject", "pause-model-release-0001").ok,
    ).toBe(true);
    const stale = recoveryAuthorization(ledger, `sha256:${"d".repeat(64)}`);
    const promotedBinding = {
      ...binding,
      programDigest: `sha256:${"5".repeat(64)}`,
      releaseDigest: `sha256:${"6".repeat(64)}`,
    };
    expect(
      ledger.activateRelease(
        {
          binding: promotedBinding,
          deploymentManifestSha256: promotedDeploymentManifestSha256,
          releaseEpoch: 2,
          programIssuedAt: now + 1,
          rollbackBoundary: "modal:alice-runtime:v49",
        },
        100,
        now + 1,
      ),
    ).toEqual({ ok: true, code: "RELEASE_ACTIVATED" });
    expect(
      ledger.resume(
        "model",
        now + 2,
        "owner-subject",
        "pause-model-release-0001",
        stale,
      ),
    ).toEqual({ ok: false, code: "RECOVERY_CURRENT_RELEASE_MISMATCH" });
    expect(ledger.snapshot().pausedScopes).toContain("model");
  });

  test("rejects a resume authorization made stale by Program renewal", () => {
    const now = Date.UTC(2026, 7, 22, 12);
    const ledger = AuthorityLedger.create(
      binding,
      100,
      "modal:alice-runtime:v48",
      1,
      now - 10_000,
    );
    expect(
      ledger.pause("model", now, "owner-subject", "pause-model-program-0001").ok,
    ).toBe(true);
    const stale = recoveryAuthorization(ledger, `sha256:${"e".repeat(64)}`);
    expect(
      ledger.activateRelease(
        {
          binding: {
            ...binding,
            programDigest: `sha256:${"7".repeat(64)}`,
          },
          deploymentManifestSha256: baseDeploymentManifestSha256,
          releaseEpoch: 1,
          programIssuedAt: now + 1,
          rollbackBoundary: "modal:alice-runtime:v48",
        },
        100,
        now + 1,
      ),
    ).toEqual({ ok: true, code: "PROGRAM_RENEWED" });
    expect(
      ledger.resume(
        "model",
        now + 2,
        "owner-subject",
        "pause-model-program-0001",
        stale,
      ),
    ).toEqual({ ok: false, code: "RECOVERY_CURRENT_RELEASE_MISMATCH" });
    expect(ledger.snapshot().pausedScopes).toContain("model");
  });

  test("atomically rejects a verifier-to-commit release-state mismatch", () => {
    const now = Date.UTC(2026, 7, 22, 12);
    const ledger = AuthorityLedger.create(binding, 100);
    expect(
      ledger.pause("model", now, "owner-subject", "pause-model-interleave-0001").ok,
    ).toBe(true);
    const verifiedAgainstDifferentState = recoveryAuthorization(
      ledger,
      `sha256:${"f".repeat(64)}`,
    );
    verifiedAgainstDifferentState.currentDeploymentManifestSha256 =
      `sha256:${"0".repeat(64)}`;
    expect(
      ledger.resume(
        "model",
        now + 1,
        "owner-subject",
        "pause-model-interleave-0001",
        verifiedAgainstDifferentState,
      ),
    ).toEqual({ ok: false, code: "RECOVERY_CURRENT_RELEASE_MISMATCH" });
    expect(ledger.snapshot().pausedScopes).toContain("model");
    expect(ledger.exportState().usedRecoveryReceipts).toEqual([]);
  });

  test("rejects old Program replay, release epoch collisions, and rollback receipt replay", () => {
    const now = Date.UTC(2026, 7, 22, 12);
    const epochTwo = {
      binding: {
        ...binding,
        programDigest: `sha256:${"5".repeat(64)}`,
        releaseDigest: `sha256:${"6".repeat(64)}`,
      },
      deploymentManifestSha256: promotedDeploymentManifestSha256,
      releaseEpoch: 2,
      programIssuedAt: now,
      rollbackBoundary: "modal:alice-runtime:v49",
    };
    const ledger = AuthorityLedger.create(binding, 100, "modal:alice-runtime:v48", 1, now - 10_000);
    expect(ledger.activateRelease(epochTwo, 100, now)).toMatchObject({ ok: true });
    expect(
      ledger.activateRelease(
        { ...epochTwo, binding: { ...epochTwo.binding, programDigest: `sha256:${"7".repeat(64)}` }, programIssuedAt: now - 1 },
        100,
        now + 1,
      ),
    ).toEqual({ ok: false, code: "PROGRAM_ISSUED_AT_REPLAY" });
    expect(
      ledger.activateRelease(
        { ...epochTwo, binding: { ...epochTwo.binding, releaseDigest: `sha256:${"8".repeat(64)}` } },
        100,
        now + 1,
      ),
    ).toEqual({ ok: false, code: "RELEASE_EPOCH_COLLISION" });
    expect(
      ledger.activateRelease(
        { ...epochTwo, deploymentManifestSha256: `sha256:${"a".repeat(64)}` },
        100,
        now + 1,
      ),
    ).toEqual({ ok: false, code: "RELEASE_EPOCH_COLLISION" });

    const receiptHash = `sha256:${"d".repeat(64)}`;
    const epochOne = {
      binding,
      deploymentManifestSha256: baseDeploymentManifestSha256,
      releaseEpoch: 1,
      programIssuedAt: now - 10_000,
      rollbackBoundary: "modal:alice-runtime:v48",
    };
    expect(ledger.activateRelease(epochOne, 100, now + 2, {
      receiptHash,
      currentBinding: epochTwo.binding,
      currentDeploymentManifestSha256: epochTwo.deploymentManifestSha256,
      currentReleaseEpoch: 2,
      currentRollbackBoundary: epochTwo.rollbackBoundary,
    })).toEqual({
      ok: true,
      code: "RELEASE_ROLLED_BACK",
    });
    expect(
      ledger.activateRelease(epochTwo, 100, now + 3, {
        receiptHash,
        currentBinding: epochOne.binding,
        currentDeploymentManifestSha256: epochOne.deploymentManifestSha256,
        currentReleaseEpoch: 1,
        currentRollbackBoundary: epochOne.rollbackBoundary,
      }),
    ).toEqual({ ok: false, code: "RECOVERY_RECEIPT_INVALID" });
  });

  test("revokes a pre-admitted capability and preserves the revocation", () => {
    const base = AuthorityLedger.create(binding, 100).exportState();
    base.capabilities["cap-sandbox-canary"] = {
      capabilityId: "cap-sandbox-canary",
      scope: "sandbox.execute",
      target: "sandbox:production-canary",
      argumentHash: `sha256:${"8".repeat(64)}`,
      nonce: "nonce-cap-sandbox-canary",
      expiresAt: 1_787_400_120_000,
      rollbackBoundary: "sandbox:production-canary",
      revokedAt: null,
      usedAt: null,
      ...binding,
    };
    const ledger = AuthorityLedger.restore(base, binding, 100);
    expect(ledger.revokeCapability("cap-sandbox-canary", 1_787_400_000_000)).toEqual({
      ok: true,
      code: "CAPABILITY_REVOKED",
    });
    expect(ledger.revokeCapability("cap-sandbox-canary", 1_787_400_001_000)).toEqual({
      ok: true,
      code: "CAPABILITY_ALREADY_REVOKED",
    });
    expect(ledger.revokeCapability("cap-missing", 1_787_400_001_000)).toEqual({
      ok: false,
      code: "CAPABILITY_NOT_FOUND",
    });
  });

  test("revoking a capability invalidates an earlier idempotent authorization", () => {
    const base = AuthorityLedger.create(binding, 100).exportState();
    base.capabilities["cap-sandbox-replay"] = {
      capabilityId: "cap-sandbox-replay",
      scope: "sandbox.execute",
      target: "sandbox:production-canary",
      argumentHash: `sha256:${"8".repeat(64)}`,
      nonce: "nonce-cap-sandbox-replay",
      expiresAt: 1_787_400_120_000,
      rollbackBoundary: "sandbox:production-canary",
      revokedAt: null,
      usedAt: null,
      ...binding,
    };
    const intent = {
      intentId: "intent-sandbox-replay",
      action: "sandbox.execute",
      target: "sandbox:production-canary",
      argumentHash: `sha256:${"8".repeat(64)}`,
      nonce: "nonce-intent-sandbox-replay",
      expiresAt: 1_787_400_060_000,
      capabilityId: "cap-sandbox-replay",
      ...binding,
    };
    const ledger = AuthorityLedger.restore(base, binding, 100);
    expect(ledger.authorize(intent, 1_787_400_000_000).allowed).toBe(true);
    expect(ledger.revokeCapability("cap-sandbox-replay", 1_787_400_001_000).ok).toBe(true);
    expect(ledger.authorize(intent, 1_787_400_002_000)).toEqual({
      allowed: false,
      code: "CAPABILITY_REVOKED",
      risk: "low",
    });
  });

  test("fails closed when durable state is structurally invalid", () => {
    expect(() =>
      AuthorityLedger.restore({ schemaVersion: "unknown" } as AuthorityLedgerState, binding, 100),
    ).toThrow("AUTHORITY_STATE_INVALID");

    const invalidPause = AuthorityLedger.create(binding, 100).exportState();
    invalidPause.pauses.all = {} as never;
    expect(() => AuthorityLedger.restore(invalidPause, binding, 100)).toThrow(
      "AUTHORITY_STATE_INVALID",
    );
  });
});

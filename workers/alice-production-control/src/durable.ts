import { DurableObject } from "cloudflare:workers";

import {
  AUTHORITY_PERSISTENCE_LIMITS,
  AuthorityLedger,
  type AuthorityLedgerState,
  type ReleaseActivationCandidate,
  type VerifiedRecoveryAuthorization,
  type VerifiedReleaseRollbackAuthorization,
} from "./authority";
import { commitCopyOnWrite } from "./durable-transaction";
import type { AliceWorkerEnv } from "./env";
import { jsonResponse, readBoundedJson } from "./http";
import {
  loadRuntimeConfig,
  loadAuthoritySafetyConfig,
  type AliceRuntimeConfig,
  type AliceAuthoritySafetyConfig,
} from "./runtime-config";
import {
  SessionLedger,
  type ConversationTurnInput,
  type SessionLedgerState,
} from "./session";
import { flushSessionEvidenceOutbox } from "./session-evidence-outbox";
import type {
  ActionIntent,
  ModelBudgetRequest,
  ReleaseAdmission,
  ReleaseBinding,
} from "./policy";
import {
  createEvidenceQueueEnvelope,
  createEvidenceRecord,
  type EvidenceRecord,
} from "./evidence";
import {
  parseAuthorityDurableName,
  parseSessionDurableName,
  sessionDurableName,
} from "./durable-names";
import {
  verifyRecoveryReceipt,
  verifyReleaseRollbackReceipt,
} from "./recovery";
import { validatePlan, type AlicePlan } from "./plan";
import { buildAliceReleaseCheckResponse } from "./release-check";

function validBinding(value: unknown): value is ReleaseBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as ReleaseBinding;
  return (
    Object.keys(binding).sort().join(",") ===
      "policyHash,programDigest,releaseDigest" &&
    [binding.programDigest, binding.releaseDigest, binding.policyHash].every(
      (digest) => /^sha256:[a-f0-9]{64}$/.test(digest),
    )
  );
}

function validReleaseAdmission(value: unknown): value is ReleaseAdmission {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const admission = value as ReleaseAdmission;
  return (
    Object.keys(admission).sort().join(",") ===
      "admissionGeneration,binding,deploymentManifestSha256" &&
    validBinding(admission.binding) &&
    /^sha256:[a-f0-9]{64}$/.test(admission.deploymentManifestSha256) &&
    Number.isSafeInteger(admission.admissionGeneration) &&
    admission.admissionGeneration > 0
  );
}

function bindingMatches(left: ReleaseBinding, right: ReleaseBinding): boolean {
  return (
    left.programDigest === right.programDigest &&
    left.releaseDigest === right.releaseDigest &&
    left.policyHash === right.policyHash
  );
}

async function callSession(
  stub: DurableObjectStub,
  path: string,
  body?: unknown,
): Promise<{ response: Response; value: any }> {
  const response = await stub.fetch(`https://alice.internal${path}`,
    body === undefined
      ? { method: "GET" }
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
  return { response, value: await response.json() };
}

function releaseCandidate(config: AliceRuntimeConfig): ReleaseActivationCandidate {
  return {
    binding: config.binding,
    deploymentManifestSha256: config.deploymentManifestSha256,
    releaseEpoch: config.envelope.release.releaseEpoch,
    programIssuedAt: Date.parse(config.envelope.issuedAt),
    rollbackBoundary: config.envelope.release.rollbackBoundary,
  };
}

function releaseDetails(config: AliceRuntimeConfig) {
  return {
    releaseEpoch: config.envelope.release.releaseEpoch,
    sourceCommit: config.envelope.release.sourceCommit,
    deploymentControllerCommit:
      config.envelope.release.deploymentControllerCommit,
    runtimeImage: config.envelope.release.runtimeImage,
    runtimeBuildManifestSha256:
      config.envelope.release.runtimeBuildManifestSha256,
    elizaCommit: config.envelope.release.elizaCommit,
    modalRevision: config.modalRevision,
    deploymentManifestSha256: config.deploymentManifestSha256,
  };
}

export class AliceAuthority extends DurableObject<AliceWorkerEnv> {
  private readonly ready: Promise<void>;
  private readonly aliceEnv: AliceWorkerEnv;
  private readonly safety: AliceAuthoritySafetyConfig;
  private ledger!: AuthorityLedger;
  private static readonly EVIDENCE_RETRY_DELAY_MS = 10_000;
  private static readonly MAX_FLUSH_PER_TURN = 16;

  constructor(ctx: DurableObjectState, env: AliceWorkerEnv) {
    super(ctx, env);
    this.aliceEnv = env;
    this.safety = loadAuthoritySafetyConfig(env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      parseAuthorityDurableName(ctx.id.name ?? "");
      const stored = await ctx.storage.get<AuthorityLedgerState>("state");
      const restored = stored
        ? AuthorityLedger.restoreGlobal(stored, this.safety.modelDailyBudgetUnits)
        : AuthorityLedger.create(
            {
              programDigest: `sha256:${"0".repeat(64)}`,
              releaseDigest: `sha256:${"0".repeat(64)}`,
              policyHash: `sha256:${"0".repeat(64)}`,
            },
            this.safety.modelDailyBudgetUnits,
            "release:unadmitted",
            0,
            0,
          );
      if (!stored) {
        this.ledger = restored;
        await ctx.storage.put("state", this.ledger.exportState());
        return;
      }
      const candidate = AuthorityLedger.restoreGlobal(
        restored.exportState(),
        this.safety.modelDailyBudgetUnits,
      );
      const reconciled = candidate.reconcileBudgetLimit(
        this.safety.modelDailyBudgetUnits,
        Date.now(),
      );
      if (reconciled.changed) {
        const snapshot = candidate.snapshot();
        const evidence = createEvidenceRecord({
          eventId: `evt-budget-invariant-${snapshot.sequence}`,
          occurredAt: new Date(
            reconciled.pause?.pausedAt ?? Date.now(),
          ).toISOString(),
          kind: "control.budget-invariant",
          actor: "authority:budget-invariant",
          outcome: reconciled.code,
          binding: snapshot.binding,
          subjectId: "budget:daily",
          details: {
            previousMaxUnits: reconciled.previousMaxUnits,
            effectiveMaxUnits: reconciled.effectiveMaxUnits,
            usedUnits: reconciled.usedUnits,
            windowId: reconciled.windowId,
            paused: reconciled.pause !== null,
            pauseId: reconciled.pause?.pauseId ?? null,
          },
        });
        const staged = candidate.stageEvidence(
          evidence,
          AUTHORITY_PERSISTENCE_LIMITS.pauseAllOutboxRecords,
        );
        if (!staged.ok) throw new Error(staged.code);
        candidate.assertPersistable(AUTHORITY_PERSISTENCE_LIMITS.pauseAllBytes);
        await ctx.storage.put("state", candidate.exportState());
        await ctx.storage.setAlarm(
          Date.now() + AliceAuthority.EVIDENCE_RETRY_DELAY_MS,
        );
      }
      this.ledger = candidate;
    });
  }

  async alarm(): Promise<void> {
    await this.ready;
    await this.flushEvidenceOutbox();
  }

  private async requireExpectedAdmission(
    expected: unknown,
  ): Promise<
    | { ok: true; config: AliceRuntimeConfig; admission: ReleaseAdmission }
    | { ok: false; code: string }
  > {
    if (!validReleaseAdmission(expected)) {
      return { ok: false, code: "RELEASE_ADMISSION_EXPECTATION_INVALID" };
    }
    const config = await loadRuntimeConfig(this.aliceEnv);
    const snapshot = this.ledger.snapshot();
    const blockingScopes = ["all", "modal", "release"].filter((scope) =>
      snapshot.pausedScopes.includes(scope),
    );
    if (
      !bindingMatches(expected.binding, config.binding) ||
      expected.deploymentManifestSha256 !==
        config.deploymentManifestSha256 ||
      expected.admissionGeneration !== snapshot.admissionGeneration ||
      !this.ledger.releaseIsActive(releaseCandidate(config)) ||
      blockingScopes.length > 0
    ) {
      return { ok: false, code: "RELEASE_ADMISSION_CHANGED" };
    }
    return { ok: true, config, admission: structuredClone(expected) };
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/snapshot") {
        return jsonResponse({ ok: true, authority: this.ledger.snapshot() });
      }
      if (request.method === "GET" && url.pathname === "/pause/current") {
        const pause = this.ledger.activePause(url.searchParams.get("scope") ?? "");
        return pause
          ? jsonResponse({ ok: true, pause })
          : jsonResponse({ ok: false, code: "SCOPE_NOT_PAUSED" }, 404);
      }
      if (request.method === "GET" && url.pathname === "/release/check") {
        const config = await loadRuntimeConfig(this.aliceEnv);
        const candidate = releaseCandidate(config);
        const snapshot = this.ledger.snapshot();
        const releaseCheck = buildAliceReleaseCheckResponse({
          binding: config.binding,
          release: releaseDetails(config),
          releaseIsActive: this.ledger.releaseIsActive(candidate),
          pausedScopes: snapshot.pausedScopes,
          admissionGeneration: snapshot.admissionGeneration,
        });
        return jsonResponse(
          releaseCheck,
          releaseCheck.allowed ? 200 : 503,
        );
      }
      if (request.method !== "POST") return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
      const body = (await readBoundedJson(request)) as Record<string, unknown>;
      if (url.pathname === "/session/task/terminal") {
        if (!validReleaseAdmission(body.expectedAdmission)) {
          return jsonResponse(
            {
              ok: false,
              code: "RELEASE_ADMISSION_EXPECTATION_INVALID",
            },
            400,
          );
        }
        const expectedAdmission = body.expectedAdmission;
        const sessionId = String(body.sessionId ?? "");
        const actor = String(body.actor ?? "");
        if (
          !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(sessionId) ||
          actor.trim().length === 0
        ) {
          return jsonResponse(
            { ok: false, code: "SESSION_REQUEST_INVALID" },
            400,
          );
        }
        // This path deliberately does not consult current admission. It can
        // only close an already-running task in the original release-scoped
        // Session DO, so PAUSE_ALL and a release transition cannot strand a
        // durable Workflow checkpoint or admit any new work.
        const session = this.aliceEnv.ALICE_SESSIONS.getByName(
          sessionDurableName(
            sessionId,
            expectedAdmission.binding.releaseDigest,
          ),
        );
        const result = await callSession(session, "/task/terminal", {
          actor,
          expectedAdmission,
          record: body.record,
        });
        return jsonResponse(result.value, result.response.status);
      }
      if (
        url.pathname === "/session/context" ||
        url.pathname === "/session/snapshot" ||
        url.pathname === "/session/mutate"
      ) {
        const admitted = await this.requireExpectedAdmission(
          body.expectedAdmission,
        );
        if (!admitted.ok) {
          return jsonResponse(
            { ok: false, allowed: false, code: admitted.code },
            admitted.code.endsWith("INVALID") ? 400 : 503,
          );
        }
        const sessionId = String(body.sessionId ?? "");
        const actor = String(body.actor ?? "");
        if (
          !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(sessionId) ||
          actor.trim().length === 0
        ) {
          return jsonResponse({ ok: false, code: "SESSION_REQUEST_INVALID" }, 400);
        }
        const session = this.aliceEnv.ALICE_SESSIONS.getByName(
          sessionDurableName(
            sessionId,
            admitted.admission.binding.releaseDigest,
          ),
        );
        const rebound = await callSession(session, "/binding/rebind", {
          actor,
          binding: admitted.admission.binding,
        });
        if (!rebound.response.ok || rebound.value.result?.ok !== true) {
          return jsonResponse(
            { ok: false, code: "SESSION_BINDING_RENEWAL_FAILED" },
            503,
          );
        }
        if (url.pathname === "/session/context") {
          const turnId = String(body.turnId ?? "");
          if (turnId && !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(turnId)) {
            return jsonResponse({ ok: false, code: "TURN_ID_INVALID" }, 400);
          }
          const result = await callSession(
            session,
            `/conversation/context?turnId=${encodeURIComponent(turnId)}`,
          );
          return jsonResponse(result.value, result.response.status);
        }
        if (url.pathname === "/session/snapshot") {
          const result = await callSession(session, "/snapshot");
          return jsonResponse(result.value, result.response.status);
        }
        const operation = String(body.operation ?? "");
        const path = operation === "event"
          ? "/event"
          : operation === "task"
            ? "/task"
            : operation === "conversation.turn"
              ? "/conversation/turn"
              : "";
        if (!path) {
          return jsonResponse({ ok: false, code: "SESSION_OPERATION_INVALID" }, 400);
        }
        const result = await callSession(session, path, {
          actor,
          record: body.record,
        });
        return jsonResponse(result.value, result.response.status);
      }
      if (url.pathname === "/plan/create") {
        const admitted = await this.requireExpectedAdmission(
          body.expectedAdmission,
        );
        if (!admitted.ok) {
          return jsonResponse(
            { ok: false, allowed: false, code: admitted.code },
            admitted.code.endsWith("INVALID") ? 400 : 503,
          );
        }
        const plan = body.plan as AlicePlan;
        const validation = validatePlan(plan, admitted.admission);
        if (!validation.ok) {
          return jsonResponse({ ok: false, code: validation.code }, 400);
        }
        try {
          const instance = await this.aliceEnv.ALICE_PLANS.create({
            id: plan.planId,
            params: plan,
            retention: {
              successRetention: "30 days",
              errorRetention: "30 days",
            },
          });
          return jsonResponse(
            { ok: true, planId: instance.id, status: "queued" },
            202,
          );
        } catch {
          return jsonResponse(
            { ok: false, code: "PLAN_INSTANCE_CONFLICT" },
            409,
          );
        }
      }
      if (url.pathname === "/release/activate") {
        const config = await loadRuntimeConfig(this.aliceEnv);
        const candidate = releaseCandidate(config);
        const actor = String(body.actor ?? "");
        const rollbackReceipt = String(body.rollbackReceipt ?? "");
        const before = this.ledger.snapshot();
        const rollbackRequired = this.ledger.requiresReleaseRollbackReceipt(candidate);
        let rollbackAuthorization: VerifiedReleaseRollbackAuthorization | null = null;
        if (rollbackRequired) {
          if (!rollbackReceipt) {
            return jsonResponse(
              { ok: false, allowed: false, code: "RELEASE_ROLLBACK_AUTH_REQUIRED" },
              403,
            );
          }
          const verified = await verifyReleaseRollbackReceipt(rollbackReceipt, {
            recoveryToken: this.safety.recoveryToken,
            subject: actor,
            currentBinding: before.binding,
            currentDeploymentManifestSha256:
              before.deploymentManifestSha256,
            currentReleaseEpoch: before.activeReleaseEpoch,
            currentRollbackBoundary: before.rollbackBoundary,
            targetBinding: candidate.binding,
            targetDeploymentManifestSha256:
              candidate.deploymentManifestSha256,
            targetReleaseEpoch: candidate.releaseEpoch,
            targetRollbackBoundary: candidate.rollbackBoundary,
            now: Date.now(),
          });
          if (!verified.ok) {
            return jsonResponse({ ok: false, allowed: false, code: verified.code }, 403);
          }
          rollbackAuthorization = {
            receiptHash: verified.receiptHash,
            currentBinding: before.binding,
            currentDeploymentManifestSha256:
              before.deploymentManifestSha256,
            currentReleaseEpoch: before.activeReleaseEpoch,
            currentRollbackBoundary: before.rollbackBoundary,
          };
        } else if (rollbackReceipt) {
          return jsonResponse(
            { ok: false, allowed: false, code: "RELEASE_ROLLBACK_RECEIPT_UNEXPECTED" },
            400,
          );
        }
        const committed = await this.commit(
          (ledger) =>
            ledger.activateRelease(
              candidate,
              config.modelDailyBudgetUnits,
              Date.now(),
              rollbackAuthorization,
            ),
          (result) => result.ok && result.code !== "RELEASE_ALREADY_ACTIVE",
          (result, ledger) =>
            createEvidenceRecord({
              kind: "release.activation",
              actor,
              outcome: result.code,
              binding: candidate.binding,
              subjectId: `release:${candidate.binding.releaseDigest.slice("sha256:".length)}`,
              details: {
                previousReleaseEpoch: before.activeReleaseEpoch,
                releaseEpoch: candidate.releaseEpoch,
                rollbackBoundary: candidate.rollbackBoundary,
                modalRevision: config.modalRevision,
                rollbackReceiptHash: rollbackAuthorization?.receiptHash ?? null,
              },
            }),
        );
        const snapshot = this.ledger.snapshot();
        const blockingScopes = ["all", "modal", "release"].filter((scope) =>
          snapshot.pausedScopes.includes(scope),
        );
        const activationSucceeded =
          committed.result.ok &&
          this.ledger.releaseIsActive(candidate);
        const allowed = activationSucceeded && blockingScopes.length === 0;
        const deniedStatus = committed.result.code === "RELEASE_PAUSED"
          ? 503
          : committed.result.code.includes("AUTH") ||
              committed.result.code.includes("RECEIPT")
            ? 403
            : 409;
        return jsonResponse(
          {
            ok: activationSucceeded,
            allowed,
            code: allowed
              ? "RUNTIME_ADMITTED"
              : blockingScopes.length > 0
                ? "RUNTIME_PAUSED"
                : committed.result.code,
            activationCode: committed.result.code,
            blockingScopes,
            binding: activationSucceeded ? config.binding : null,
            release: activationSucceeded ? releaseDetails(config) : null,
            evidenceQueued: committed.evidenceQueued,
          },
          allowed ? 200 : activationSucceeded ? 202 : deniedStatus,
        );
      }
      if (url.pathname === "/authorize") {
        const intent = body.request as ActionIntent;
        const actor = String(body.actor ?? "");
        const committed = await this.commitAdmitted(
          (ledger) => ledger.authorize(intent, Date.now()),
          (result) => result.allowed && result.code !== "INTENT_ALREADY_AUTHORIZED",
          (result, config) =>
            createEvidenceRecord({
              kind: "intent.authorization",
              actor,
              outcome: result.code,
              binding: config.binding,
              subjectId: intent.intentId,
              details: { allowed: true, risk: result.risk },
            }),
        );
        return jsonResponse({ ok: true, decision: committed.result, evidenceQueued: committed.evidenceQueued });
      }
      if (url.pathname === "/budget") {
        const modelRequest = body.request as ModelBudgetRequest;
        const actor = String(body.actor ?? "");
        const committed = await this.commitAdmitted(
          (ledger) => ledger.reserveModel(modelRequest, Date.now()),
          (result) => result.allowed && result.code === "MODEL_BUDGET_RESERVED",
          (result, config) =>
            createEvidenceRecord({
              kind: "model.reservation",
              actor,
              outcome: result.code,
              binding: config.binding,
              subjectId: modelRequest.requestId,
              details: {
                allowed: true,
                model: modelRequest.model,
                estimatedUnits: modelRequest.estimatedUnits,
                usedUnits: result.usedUnits,
                maxUnits: result.maxUnits,
              },
            }),
        );
        return jsonResponse({ ok: true, decision: committed.result, evidenceQueued: committed.evidenceQueued });
      }
      if (url.pathname === "/pause") {
        const actor = String(body.subject ?? "");
        const scope = String(body.scope ?? "");
        const committed = await this.commit(
          (ledger) =>
            ledger.pause(
              scope,
              Date.now(),
              actor,
              String(body.pauseId ?? ""),
            ),
          (candidate) => candidate.ok && candidate.code === "SCOPE_PAUSED",
          (result, ledger) =>
            createEvidenceRecord({
              kind: "control.pause",
              actor,
              outcome: result.code,
              binding: ledger.snapshot().binding,
              subjectId: `scope:${scope}`,
              details: { paused: true, pauseId: String(result.pause?.pauseId ?? "") },
            }),
          scope === "all"
            ? {
                maxBytes: AUTHORITY_PERSISTENCE_LIMITS.pauseAllBytes,
                maxOutboxRecords:
                  AUTHORITY_PERSISTENCE_LIMITS.pauseAllOutboxRecords,
              }
            : {
                maxBytes: AUTHORITY_PERSISTENCE_LIMITS.scopedPauseBytes,
                maxOutboxRecords:
                  AUTHORITY_PERSISTENCE_LIMITS.scopedPauseOutboxRecords,
              },
        );
        return jsonResponse(
          { ok: committed.result.ok, result: committed.result, evidenceQueued: committed.evidenceQueued },
          committed.result.ok ? 200 : 400,
        );
      }
      if (url.pathname === "/resume") {
        const actor = String(body.subject ?? "");
        const scope = String(body.scope ?? "");
        const recoveryReceipt = String(body.recoveryReceipt ?? "");
        const pause = this.ledger.activePause(scope);
        if (!pause) {
          return jsonResponse({ ok: false, code: "SCOPE_NOT_PAUSED" }, 404);
        }
        const before = this.ledger.snapshot();
        const now = Date.now();
        const verified = await verifyRecoveryReceipt(recoveryReceipt, {
          recoveryToken: this.safety.recoveryToken,
          scope,
          pauseId: pause.pauseId,
          pausedAt: pause.pausedAt,
          subject: actor,
          pauseBinding: pause.binding,
          pauseDeploymentManifestSha256:
            pause.deploymentManifestSha256,
          pauseRollbackBoundary: pause.rollbackBoundary,
          currentBinding: before.binding,
          currentDeploymentManifestSha256:
            before.deploymentManifestSha256,
          currentReleaseEpoch: before.activeReleaseEpoch,
          currentRollbackBoundary: before.rollbackBoundary,
          now,
        });
        if (!verified.ok) {
          return jsonResponse({ ok: false, code: verified.code }, 403);
        }
        const recoveryAuthorization: VerifiedRecoveryAuthorization = {
          receiptHash: verified.receiptHash,
          currentBinding: before.binding,
          currentDeploymentManifestSha256:
            before.deploymentManifestSha256,
          currentReleaseEpoch: before.activeReleaseEpoch,
          currentRollbackBoundary: before.rollbackBoundary,
        };
        const committed = await this.commit(
          (ledger) =>
            ledger.resume(
              scope,
              now,
              actor,
              pause.pauseId,
              recoveryAuthorization,
            ),
          (candidate) =>
            (candidate.ok && candidate.code === "SCOPE_RESUMED") ||
            candidate.code === "BUDGET_INVARIANT_REPAUSED",
          (result, ledger) =>
            createEvidenceRecord({
              kind: "control.resume",
              actor,
              outcome: result.code,
              binding: ledger.snapshot().binding,
              subjectId: `scope:${scope}`,
              details: {
                resumed: result.code === "SCOPE_RESUMED",
                pauseId: pause.pauseId,
                recoveryReceiptHash: recoveryAuthorization.receiptHash,
                activePauseId:
                  "pause" in result ? result.pause.pauseId : null,
              },
            }),
          {
            maxBytes: AUTHORITY_PERSISTENCE_LIMITS.resumeBytes,
            maxOutboxRecords: AUTHORITY_PERSISTENCE_LIMITS.resumeOutboxRecords,
          },
        );
        return jsonResponse(
          { ok: committed.result.ok, result: committed.result, evidenceQueued: committed.evidenceQueued },
          committed.result.ok
            ? 200
            : committed.result.code === "BUDGET_INVARIANT_REPAUSED"
              ? 409
              : 400,
        );
      }
      if (url.pathname === "/capability/revoke") {
        const capabilityId = String(body.capabilityId ?? "");
        const actor = String(body.subject ?? "");
        const committed = await this.commit(
          (ledger) =>
            ledger.revokeCapability(
              capabilityId,
              Date.now(),
            ),
          (candidate) => candidate.ok && candidate.code === "CAPABILITY_REVOKED",
          (result, ledger) =>
            createEvidenceRecord({
              kind: "capability.revoke",
              actor,
              outcome: result.code,
              binding: ledger.snapshot().binding,
              subjectId: capabilityId,
              details: { revoked: true },
            }),
        );
        return jsonResponse(
          { ok: committed.result.ok, result: committed.result, evidenceQueued: committed.evidenceQueued },
          committed.result.ok ? 200 : 404,
        );
      }
      return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
    } catch (error) {
      const code = error instanceof Error ? error.message : "AUTHORITY_REQUEST_FAILED";
      const status = code.startsWith("REQUEST_BODY_")
        ? 400
        : code === "RELEASE_NOT_ADMITTED" ||
            code.startsWith("ALICE_") ||
            code.startsWith("PROGRAM_")
          ? 503
          : 500;
      return jsonResponse({ ok: false, code }, status);
    }
  }

  private async commit<TResult>(
    mutate: (ledger: AuthorityLedger) => TResult,
    shouldPersist: (result: TResult) => boolean,
    evidenceFor?: (result: TResult, ledger: AuthorityLedger) => EvidenceRecord,
    limits: {
      maxBytes: number;
      maxOutboxRecords: number;
    } = {
      maxBytes: AUTHORITY_PERSISTENCE_LIMITS.operationalBytes,
      maxOutboxRecords: AUTHORITY_PERSISTENCE_LIMITS.operationalOutboxRecords,
    },
  ): Promise<{ result: TResult; evidenceQueued: boolean }> {
    const committed = await commitCopyOnWrite(
      this.ledger,
      (ledger) => AuthorityLedger.restoreGlobal(
        ledger.exportState(),
        this.safety.modelDailyBudgetUnits,
      ),
      (ledger) => {
        const result = mutate(ledger);
        if (shouldPersist(result) && evidenceFor) {
          const staged = ledger.stageEvidence(
            evidenceFor(result, ledger),
            limits.maxOutboxRecords,
          );
          if (!staged.ok) throw new Error(staged.code);
        }
        return result;
      },
      (candidate) => {
        candidate.assertPersistable(limits.maxBytes);
        return this.ctx.storage.put("state", candidate.exportState());
      },
      shouldPersist,
    );
    this.ledger = committed.state;
    return { result: committed.result, evidenceQueued: await this.flushEvidenceOutbox() };
  }

  private async commitAdmitted<TResult>(
    mutate: (ledger: AuthorityLedger, config: AliceRuntimeConfig) => TResult,
    shouldPersist: (result: TResult) => boolean,
    evidenceFor?: (result: TResult, config: AliceRuntimeConfig) => EvidenceRecord,
  ): Promise<{ result: TResult; evidenceQueued: boolean }> {
    // Action/model operations may use only an exact, owner-admitted release.
    // Snapshot, pause, resume, and revoke remain independently available when
    // a ProgramEnvelope is expired or invalid.
    const config = await loadRuntimeConfig(this.aliceEnv);
    const committed = await commitCopyOnWrite(
      this.ledger,
      (ledger) => AuthorityLedger.restoreGlobal(
        ledger.exportState(),
        this.safety.modelDailyBudgetUnits,
      ),
      (ledger) => {
        if (!ledger.releaseIsActive(releaseCandidate(config))) {
          throw new Error("RELEASE_NOT_ADMITTED");
        }
        const result = mutate(ledger, config);
        if (shouldPersist(result) && evidenceFor) {
          const staged = ledger.stageEvidence(
            evidenceFor(result, config),
            AUTHORITY_PERSISTENCE_LIMITS.operationalOutboxRecords,
          );
          if (!staged.ok) throw new Error(staged.code);
        }
        return result;
      },
      (candidate) => {
        candidate.assertPersistable(AUTHORITY_PERSISTENCE_LIMITS.operationalBytes);
        return this.ctx.storage.put("state", candidate.exportState());
      },
      shouldPersist,
    );
    this.ledger = committed.state;
    return {
      result: committed.result,
      evidenceQueued: await this.flushEvidenceOutbox(),
    };
  }

  private async flushEvidenceOutbox(): Promise<boolean> {
    try {
      for (let delivered = 0; delivered < AliceAuthority.MAX_FLUSH_PER_TURN; delivered += 1) {
        const record = this.ledger.pendingEvidence()[0];
        if (!record) return true;
        await this.aliceEnv.ALICE_EVIDENCE_QUEUE.send(
          await createEvidenceQueueEnvelope(
            record,
            this.aliceEnv.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
          ),
          { contentType: "json" },
        );
        const candidate = AuthorityLedger.restoreGlobal(
          this.ledger.exportState(),
          this.safety.modelDailyBudgetUnits,
        );
        candidate.ackEvidence(record.eventId);
        candidate.assertPersistable(AUTHORITY_PERSISTENCE_LIMITS.pauseAllBytes);
        await this.ctx.storage.put("state", candidate.exportState());
        this.ledger = candidate;
      }
      if (this.ledger.pendingEvidence().length === 0) return true;
    } catch {
      // The committed safety mutation and its evidence remain together in the
      // Durable Object. An alarm retries queue handoff; Queue/R2 object keys are
      // idempotent if the send succeeded but the acknowledgement write failed.
    }
    await this.ctx.storage.setAlarm(Date.now() + AliceAuthority.EVIDENCE_RETRY_DELAY_MS);
    return false;
  }
}

export class AliceSession extends DurableObject<AliceWorkerEnv> {
  private readonly ready: Promise<void>;
  private readonly aliceEnv: AliceWorkerEnv;
  private sessionId!: string;
  private binding!: AliceRuntimeConfig["binding"];
  private ledger!: SessionLedger;

  constructor(ctx: DurableObjectState, env: AliceWorkerEnv) {
    super(ctx, env);
    this.aliceEnv = env;
    this.ready = ctx.blockConcurrencyWhile(async () => {
      const name = parseSessionDurableName(ctx.id.name ?? "");
      this.sessionId = name.sessionId;
      const stored = await ctx.storage.get<SessionLedgerState>("state");
      if (stored) {
        this.ledger = SessionLedger.restoreStored(
          stored,
          this.sessionId,
          name.releaseDigest,
        );
        this.binding = this.ledger.snapshot().binding;
      } else {
        const config = await loadRuntimeConfig(env);
        if (name.releaseDigest !== config.binding.releaseDigest) {
          throw new Error("SESSION_RELEASE_MISMATCH");
        }
        this.binding = config.binding;
        this.ledger = SessionLedger.create(this.sessionId, config.binding);
        await ctx.storage.put("state", this.ledger.exportState());
      }
    });
  }

  async alarm(): Promise<void> {
    await this.ready;
    await this.flushEvidenceOutbox();
  }

  async fetch(request: Request): Promise<Response> {
    await this.ready;
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/snapshot") {
        return jsonResponse({ ok: true, session: this.ledger.snapshot() });
      }
      if (request.method === "GET" && url.pathname === "/conversation/context") {
        return jsonResponse({
          ok: true,
          context: this.ledger.conversationContext(url.searchParams.get("turnId") ?? ""),
        });
      }
      if (request.method !== "POST") return jsonResponse({ ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
      const body = (await readBoundedJson(request)) as Record<string, unknown>;
      if (url.pathname === "/binding/rebind") {
        const binding = body.binding as AliceRuntimeConfig["binding"];
        const actor = String(body.actor ?? "");
        const committed = await this.commit(
          (ledger) => ledger.rebind(binding),
          (candidate) => candidate.ok && candidate.code === "SESSION_BINDING_RENEWED",
          (result, ledger) =>
            createEvidenceRecord({
              kind: "session.binding",
              actor,
              outcome: result.code,
              binding: ledger.snapshot().binding,
              subjectId: this.sessionId,
              details: { renewed: true },
            }),
        );
        if (committed.result.ok) this.binding = structuredClone(binding);
        return jsonResponse(
          {
            ok: committed.result.ok,
            result: committed.result,
            evidenceQueued: committed.evidenceQueued,
          },
          committed.result.ok ? 200 : 409,
        );
      }
      if (url.pathname === "/task/terminal") {
        const expectedAdmission = body.expectedAdmission;
        const actor = String(body.actor ?? "");
        const record = body.record as Record<string, unknown>;
        const currentBinding = this.ledger.snapshot().binding;
        if (
          !validReleaseAdmission(expectedAdmission) ||
          actor.trim().length === 0 ||
          expectedAdmission.binding.releaseDigest !==
            currentBinding.releaseDigest ||
          expectedAdmission.binding.policyHash !== currentBinding.policyHash
        ) {
          return jsonResponse(
            { ok: false, code: "WORKFLOW_TASK_TERMINAL_REQUEST_INVALID" },
            400,
          );
        }
        const committed = await this.commit(
          (ledger) => ledger.closeRunningWorkflowTask(record as never),
          (candidate) =>
            candidate.ok &&
            candidate.code === "WORKFLOW_TASK_TERMINALLY_CLOSED",
          (result, ledger) =>
            createEvidenceRecord({
              kind: "session.workflow-terminal",
              actor,
              outcome: result.code,
              binding: ledger.snapshot().binding,
              subjectId: String(record?.taskId ?? ""),
              details: {
                sessionId: this.sessionId,
                terminalOnly: true,
                state: String(record?.state ?? ""),
                checkpointHash: String(record?.checkpointHash ?? ""),
                originalProgramDigest:
                  expectedAdmission.binding.programDigest,
                deploymentManifestSha256:
                  expectedAdmission.deploymentManifestSha256,
                admissionGeneration:
                  expectedAdmission.admissionGeneration,
              },
            }),
        );
        return jsonResponse(
          {
            ok: committed.result.ok,
            result: committed.result,
            evidenceQueued: committed.evidenceQueued,
          },
          committed.result.ok ? 200 : 409,
        );
      }
      if (url.pathname === "/event") {
        const actor = String(body.actor ?? "");
        const record = body.record as Record<string, unknown>;
        const committed = await this.commit(
          (ledger) => ledger.appendEvent(record as never),
          (candidate) => candidate.ok && candidate.code === "EVENT_APPENDED",
          (result, ledger) =>
            createEvidenceRecord({
              kind: "session.event",
              actor,
              outcome: result.code,
              binding: ledger.snapshot().binding,
              subjectId: String(record?.eventId ?? ""),
              details: { sessionId: this.sessionId, persisted: true },
            }),
        );
        return jsonResponse(
          {
            ok: committed.result.ok,
            result: committed.result,
            evidenceQueued: committed.evidenceQueued,
          },
          committed.result.ok ? 200 : 400,
        );
      }
      if (url.pathname === "/task") {
        const actor = String(body.actor ?? "");
        const record = body.record as Record<string, unknown>;
        const committed = await this.commit(
          (ledger) => ledger.upsertTask(record as never),
          (candidate) => candidate.ok && candidate.code === "TASK_UPSERTED",
          (result, ledger) =>
            createEvidenceRecord({
              kind: "session.task",
              actor,
              outcome: result.code,
              binding: ledger.snapshot().binding,
              subjectId: String(record?.taskId ?? ""),
              details: { sessionId: this.sessionId, persisted: true },
            }),
        );
        return jsonResponse(
          {
            ok: committed.result.ok,
            result: committed.result,
            evidenceQueued: committed.evidenceQueued,
          },
          committed.result.ok ? 200 : 400,
        );
      }
      if (url.pathname === "/conversation/turn") {
        const actor = String(body.actor ?? "");
        const record = body.record as ConversationTurnInput;
        const committed = await this.commit(
          (ledger) => ledger.appendConversationTurn(record),
          (candidate) =>
            candidate.ok && candidate.code === "CONVERSATION_TURN_APPENDED",
          (result, ledger) =>
            createEvidenceRecord({
              kind: "session.conversation",
              actor,
              outcome: result.code,
              binding: ledger.snapshot().binding,
              subjectId: String(record?.turnId ?? ""),
              details: { sessionId: this.sessionId, persisted: true },
            }),
        );
        return jsonResponse(
          {
            ok: committed.result.ok,
            result: committed.result,
            evidenceQueued: committed.evidenceQueued,
          },
          committed.result.ok ? 200 : 400,
        );
      }
      return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
    } catch (error) {
      const code = error instanceof Error ? error.message : "SESSION_REQUEST_FAILED";
      const status = code.startsWith("REQUEST_BODY_") ? 400 : 500;
      return jsonResponse({ ok: false, code }, status);
    }
  }

  private async commit<TResult>(
    mutate: (ledger: SessionLedger) => TResult,
    shouldPersist: (result: TResult) => boolean,
    evidenceFor?: (result: TResult, ledger: SessionLedger) => EvidenceRecord,
  ): Promise<{ result: TResult; evidenceQueued: boolean }> {
    const committed = await commitCopyOnWrite(
      this.ledger,
      (ledger) => SessionLedger.restore(ledger.exportState(), this.sessionId, this.binding),
      (ledger) => {
        const result = mutate(ledger);
        if (shouldPersist(result) && evidenceFor) {
          const staged = ledger.stageEvidence(evidenceFor(result, ledger), 32);
          if (!staged.ok) throw new Error(staged.code);
        }
        return result;
      },
      (candidate) => {
        candidate.assertPersistable();
        return this.ctx.storage.put("state", candidate.exportState());
      },
      shouldPersist,
    );
    this.ledger = committed.state;
    return {
      result: committed.result,
      evidenceQueued: await this.flushEvidenceOutbox(),
    };
  }

  private async flushEvidenceOutbox(): Promise<boolean> {
    const flushed = await flushSessionEvidenceOutbox({
      current: () => this.ledger,
      replace: (ledger) => {
        this.ledger = ledger;
      },
      send: async (record) => {
        await this.aliceEnv.ALICE_EVIDENCE_QUEUE.send(
          await createEvidenceQueueEnvelope(
            record,
            this.aliceEnv.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
          ),
          { contentType: "json" },
        );
      },
      persist: (state) => this.ctx.storage.put("state", state),
      scheduleRetry: (at) => this.ctx.storage.setAlarm(at),
      now: () => Date.now(),
    });
    return flushed.complete;
  }
}

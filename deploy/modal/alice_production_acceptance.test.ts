import { describe, expect, test } from "bun:test";
import crypto from "node:crypto";

import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import { runAliceProductionAcceptance } from "./alice_production_acceptance";

const nowMs = Date.now();
const workflowId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const previousWorkflow = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  className: "AlicePlanWorkflow",
  createdOn: "2026-08-22T12:00:00.000Z",
  modifiedOn: "2026-08-22T12:00:01.000Z",
  workflowId,
  hasDag: true,
  language: "javascript",
  defaultRetention: null,
  limits: { steps: 16 },
};
const candidateWorkflow = {
  ...previousWorkflow,
  id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  createdOn: "2026-08-22T12:00:02.000Z",
  modifiedOn: "2026-08-22T12:00:02.000Z",
};

function sha(value: string) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function b64(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function fixture() {
  const binding = {
    programDigest: `sha256:${"1".repeat(64)}`,
    releaseDigest: `sha256:${"2".repeat(64)}`,
    policyHash: `sha256:${"3".repeat(64)}`,
  };
  const manifest: Record<string, any> = {
    schemaVersion: "alice.deployment-manifest.v1",
    release: {
      releaseEpoch: 1,
      modalRevision: 50,
      policyHash: binding.policyHash,
      rollbackBoundary: "modal:alice-runtime:v50",
    },
    source: {
      sourceCommit: "4".repeat(40),
      deploymentControllerCommit: "4".repeat(40),
      elizaCommit: "5".repeat(40),
      runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"6".repeat(64)}`,
      runtimeBuildManifestSha256: `sha256:${"7".repeat(64)}`,
    },
    cloudflare: {
      accessConfigSha256: `sha256:${"8".repeat(64)}`,
      accessPolicyConfigSha256: `sha256:${"9".repeat(64)}`,
    },
  };
  const deploymentManifestSha256 = sha(`${canonicalAliceJson(manifest)}\n`);
  const programAdmission = {
    schemaVersion: "alice.program-admission.v1",
    sourceCommit: manifest.source.sourceCommit,
    deploymentControllerCommit: manifest.source.deploymentControllerCommit,
    elizaCommit: manifest.source.elizaCommit,
    runtimeImage: manifest.source.runtimeImage,
    runtimeBuildManifestSha256: manifest.source.runtimeBuildManifestSha256,
    deploymentManifestSha256,
    ...binding,
    releaseEpoch: 1,
    modalRevision: 50,
    rollbackBoundary: "modal:alice-runtime:v50",
  };
  const expected = {
    binding,
    release: {
      releaseEpoch: 1,
      sourceCommit: manifest.source.sourceCommit,
      deploymentControllerCommit: manifest.source.deploymentControllerCommit,
      runtimeImage: manifest.source.runtimeImage,
      runtimeBuildManifestSha256: manifest.source.runtimeBuildManifestSha256,
      elizaCommit: manifest.source.elizaCommit,
      modalRevision: 50,
      deploymentManifestSha256,
    },
    rollbackBoundary: "modal:alice-runtime:v50",
  };
  const unadmitted = {
    binding: {
      programDigest: `sha256:${"0".repeat(64)}`,
      releaseDigest: `sha256:${"0".repeat(64)}`,
      policyHash: `sha256:${"0".repeat(64)}`,
    },
    deploymentManifestSha256: `sha256:${"0".repeat(64)}`,
    releaseEpoch: 0,
    rollbackBoundary: "release:unadmitted",
  };
  const initialPause = {
    pauseId: "pause-initial-acceptance",
    pausedAt: nowMs - 10_000,
    binding: unadmitted.binding,
    deploymentManifestSha256: unadmitted.deploymentManifestSha256,
    rollbackBoundary: unadmitted.rollbackBoundary,
  };
  const deploymentPauseEvidence = {
    schemaVersion: "alice.deployment-pause-evidence.v1",
    active: unadmitted,
    candidateExpected: expected,
    result: { pause: initialPause },
  };
  const rollbackAnchor = {
    schemaVersion: "alice.cloudflare-rollback-anchor.v5",
    previous: { workflowVersions: [previousWorkflow] },
  };
  const cloudflareRollbackProof = {
    schemaVersion: "alice.cloudflare-rollback-evidence.v1",
    accountId: "036df6c823669b8fa2f66cf4c16eeb29",
    workflowVersionContinuity: { preserved: true },
  };
  const cloudflareLiveReadback = {
    schemaVersion: "alice.cloudflare-live-readback.v1",
    accountId: "036df6c823669b8fa2f66cf4c16eeb29",
    zoneId: "7b24984479ee4cddb6c5d8a9b7a0f2c6",
    terminalSnapshotStable: true,
    provider: { continuityConfig: { workflow: { id: workflowId } } },
    workflowVersions: [previousWorkflow, candidateWorkflow],
    workers: { access: {}, control: {}, aiGateway: {} },
  };
  const modalPromotionEvidence = {
    schemaVersion: "alice.modal-promotion-evidence.v1",
    release: {
      ...expected.release,
      ...binding,
    },
    terminalProviderVersion: 53,
    rollbackForwardProof: {
      schemaVersion: "alice.modal-rollback-forward-proof.v1",
      previousProviderVersion: 49,
      candidateProviderVersion: 50,
      rollbackProviderVersion: 52,
      forwardProviderVersion: 53,
      previousGraphSha256: `sha256:${"a".repeat(64)}`,
      candidateGraphSha256: `sha256:${"b".repeat(64)}`,
    },
  };
  const ownerEmail = "owner@example.test";
  const ownerEmailSha256 = crypto.createHash("sha256")
    .update(ownerEmail).digest("base64url");
  const ownerAuthorization = `${b64({ alg: "RS256", kid: "test" })}.${b64({
    iss: "https://rndrntwrk.cloudflareaccess.com",
    aud: "alice-access-audience",
    sub: "owner-subject",
    email: ownerEmail,
    iat: Math.floor(nowMs / 1000) - 10,
    nbf: Math.floor(nowMs / 1000) - 10,
    exp: Math.floor(nowMs / 1000) + 3600,
  })}.signature`;
  return {
    binding,
    manifest,
    programAdmission,
    expected,
    deploymentPauseEvidence,
    rollbackAnchor,
    cloudflareRollbackProof,
    cloudflareLiveReadback,
    modalPromotionEvidence,
    ownerAuthorization,
    ownerAccess: {
      issuer: "https://rndrntwrk.cloudflareaccess.com",
      audience: "alice-access-audience",
      ownerEmailSha256,
    },
  };
}

function json(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(value, { status, headers });
}

function mockRuntime(
  data: ReturnType<typeof fixture>,
  options: {
    failRoot?: boolean;
    staleEvidence?: boolean;
    terminalScopedPause?: boolean;
  } = {},
) {
  const {
    failRoot = false,
    staleEvidence = false,
    terminalScopedPause = false,
  } = options;
  let activated = false;
  let paused = true;
  let chatValue: Record<string, any> | null = null;
  let pauseCount = 0;
  let resumeCount = 0;
  const sessionId = "acceptance-chat-12345678-1234-4234-8234-123456789012";
  const turnId = "turn-acceptance-12345678";
  const planId = "alice-canary-12345678123442348123456789012345";
  const workflowSessionId = "alice-canary-session-12345678123442348123456789012345";
  const intentId = "runtime-health-12345678123442348123456789012345";
  const evidenceDate = new Date(nowMs).toISOString().slice(0, 10);
  const releaseHex = data.binding.releaseDigest.slice("sha256:".length);
  const evidenceObject = (kind: string, eventId: string) => ({
    key: `${evidenceDate}/${releaseHex}/${kind}/${eventId}.json`,
    size: 512,
    uploaded: new Date(nowMs).toISOString(),
  });
  const baselineObjects = [
    evidenceObject("release.activation", "evt-baseline-activation-0001"),
  ];
  const currentRunObjects = [
    evidenceObject("control.resume", "evt-acceptance-resume-initial"),
    evidenceObject("model.reservation", "evt-acceptance-budget-reserved"),
    evidenceObject("session.conversation", "evt-acceptance-conversation"),
    evidenceObject("session.task", "evt-acceptance-task-running"),
    evidenceObject("session.task", "evt-acceptance-task-waiting"),
    evidenceObject("intent.authorization", "evt-acceptance-intent-authorized"),
    evidenceObject("control.pause", "evt-acceptance-pause-all"),
    evidenceObject("control.resume", "evt-acceptance-resume-final"),
    evidenceObject(
      "plan.created",
      `evt-plan-created-${crypto.createHash("sha256").update(`created:${planId}`).digest("hex").slice(0, 32)}`,
    ),
    evidenceObject(
      "plan.authorization",
      `evt-plan-${crypto.createHash("sha256").update(`${planId}:${intentId}`).digest("hex").slice(0, 32)}`,
    ),
  ];
  const authority = () => ({
    schemaVersion: "alice.authority-ledger.v3",
    binding: data.binding,
    deploymentManifestSha256: data.programAdmission.deploymentManifestSha256,
    admissionGeneration: 4 + pauseCount,
    activeReleaseEpoch: 1,
    rollbackBoundary: "modal:alice-runtime:v50",
    pausedScopes: paused
      ? ["all"]
      : terminalScopedPause && resumeCount >= 2
        ? ["model"]
        : [],
    budget: { maxUnits: 10_000, usedUnits: 0 },
  });
  const chatSession = () => ({
    schemaVersion: "alice.session-ledger.v1",
    sessionId,
    binding: data.binding,
    sequence: 1,
    eventCount: 0,
    events: [],
    tasks: {},
    conversationTurnCount: 1,
    conversationTurns: [{
      turnId,
      userText: "Reply with a short acknowledgement of this production canary.",
      assistantText: "Acknowledged.",
      requestHash: `sha256:${"c".repeat(64)}`,
      responseHash: `sha256:${"d".repeat(64)}`,
      recordedAt: nowMs,
      sequence: 1,
    }],
  });
  const pauseRecord = () => ({
    pauseId: "pause-owner-acceptance",
    pausedAt: nowMs + pauseCount,
    binding: data.binding,
    deploymentManifestSha256: data.programAdmission.deploymentManifestSha256,
    rollbackBoundary: "modal:alice-runtime:v50",
  });
  const fetchImpl = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    const authenticated = headers.get("cookie")?.includes("CF_Authorization=");
    const method = init.method ?? "GET";
    if (url.pathname === "/" && !authenticated) {
      return new Response("", { status: 302, headers: { location: "https://rndrntwrk.cloudflareaccess.com" } });
    }
    if (url.pathname === "/control/api/v1/release/admit" && method === "POST") {
      activated = true;
      return json({
        ok: true,
        allowed: false,
        code: "RUNTIME_PAUSED",
        activationCode: "RELEASE_ACTIVATED",
        blockingScopes: ["all"],
        binding: data.binding,
        release: data.expected.release,
        evidenceQueued: true,
      }, 202);
    }
    if (url.pathname === "/control/api/v1/pauses/all" && method === "DELETE") {
      paused = false;
      resumeCount += 1;
      return json({ ok: true, result: { ok: true, code: "SCOPE_RESUMED" }, evidenceQueued: true });
    }
    if (url.pathname === "/control/api/v1/pauses/all" && method === "POST") {
      paused = true;
      pauseCount += 1;
      return json({
        ok: true,
        result: { ok: true, code: "SCOPE_PAUSED", pause: pauseRecord() },
        evidenceQueued: true,
      });
    }
    if (url.pathname === "/" && authenticated) {
      if (failRoot) return new Response("bad", { status: 200 });
      if (paused) return json({ ok: false, code: "RUNTIME_PAUSED", blockingScopes: ["all"] }, 503);
      const nonce = "acceptance_nonce_1234567890";
      const html = `<!doctype html><main data-program-digest="${data.binding.programDigest}" data-release-digest="${data.binding.releaseDigest}" data-policy-hash="${data.binding.policyHash}" data-deployment-manifest-sha256="${data.programAdmission.deploymentManifestSha256}" data-access-config-sha256="${data.manifest.cloudflare.accessConfigSha256}" data-access-policy-config-sha256="${data.manifest.cloudflare.accessPolicyConfigSha256}"><ol id="alice-transcript"></ol><form id="alice-chat"><textarea id="alice-prompt"></textarea></form><script nonce="${nonce}">fetch("/v1/chat/completions")</script></main>`;
      return new Response(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'`,
        },
      });
    }
    if (url.pathname === "/control/health") {
      return json({
        ok: true,
        status: "ready",
        releaseAdmission: "admitted",
        authority: authority(),
        release: { ...data.expected.release, ...data.binding },
        controls: {
          highRiskActions: "disabled",
          capabilityGrant: "disabled-pending-device-bound-webauthn",
        },
      });
    }
    if (url.pathname === "/__alice_gateway/healthz") {
      return json({
        ok: true,
        releaseDigest: data.binding.releaseDigest,
        deploymentManifestSha256: data.programAdmission.deploymentManifestSha256,
      });
    }
    if (url.pathname === "/api/health") {
      return json({
        ok: true,
        ready: true,
        runtime: "ok",
        release: { ...data.expected.release, ...data.binding },
      });
    }
    if (url.pathname === "/api/alice-production/proof") {
      return json({
        schemaVersion: "alice.runtime-boundary-proof.v1",
        authorityMode: "proposer-only",
        actionExecution: "disabled",
        actionPlanning: false,
        backgroundAuthorityWorkers: "absent",
        release: { ...data.expected.release, ...data.binding },
      });
    }
    if (url.pathname === "/control/api/v1/capabilities/grant") {
      return json({ ok: false, code: "CAPABILITY_GRANT_DISABLED" }, 403);
    }
    if (url.pathname.endsWith("/capabilities/acceptance-unissued/revoke")) {
      return json({ ok: false, code: "CAPABILITY_NOT_FOUND" }, 404);
    }
    if (url.pathname === "/control/api/v1/state") {
      return json({ ok: true, authority: authority() });
    }
    if (url.pathname === "/control/api/v1/model/reserve") {
      const body = JSON.parse(String(init.body));
      return body.requestId.endsWith("-one")
        ? json({ ok: true, decision: { allowed: true, code: "MODEL_BUDGET_RESERVED" } })
        : json({ ok: true, decision: { allowed: false, code: "MODEL_BUDGET_EXCEEDED" } });
    }
    if (url.pathname === "/v1/chat/completions") {
      if (paused) return json({ ok: false, code: "RUNTIME_PAUSED", blockingScopes: ["all"] }, 503);
      chatValue ??= {
        choices: [{ message: { content: "Acknowledged." } }],
        alice_boundary: {
          authorityMode: "proposer-only",
          actionExecution: "disabled",
          tools: "disabled",
        },
      };
      return json(chatValue, 200, {
        "x-alice-durable-session-id": sessionId,
        "x-alice-durable-turn-id": turnId,
      });
    }
    if (url.pathname === `/control/api/v1/sessions/${sessionId}`) {
      return json({ ok: true, session: chatSession() });
    }
    if (url.pathname === `/control/api/v1/sessions/${workflowSessionId}`) {
      return json({
        ok: true,
        session: { tasks: { [planId]: { state: "waiting" } } },
      });
    }
    if (url.pathname === "/control/api/v1/evidence") {
      const objects = resumeCount === 0 || staleEvidence
        ? baselineObjects
        : [...baselineObjects, ...currentRunObjects];
      const cursor = url.searchParams.get("cursor");
      const page = cursor === "acceptance-page-2" ? objects.slice(5) : objects.slice(0, 5);
      return json({
        ok: true,
        releaseDigest: data.binding.releaseDigest,
        date: evidenceDate,
        objects: page,
        truncated: cursor === null && objects.length > 5,
        nextCursor: cursor === null && objects.length > 5
          ? "acceptance-page-2"
          : null,
      });
    }
    throw new Error(`unexpected request ${method} ${url.href}`);
  };
  return {
    fetchImpl,
    get paused() { return paused; },
    get pauseCount() { return pauseCount; },
    workflowCanaryImpl: async () => ({
      status: "complete",
      externalActionExecuted: false,
      binding: data.binding,
      workflowId,
      workflowVersionId: candidateWorkflow.id,
      planId,
      sessionId: workflowSessionId,
      intentId,
    }),
  };
}

function acceptanceInput(data: ReturnType<typeof fixture>, runtime: ReturnType<typeof mockRuntime>) {
  return {
    ...data,
    fetchImpl: runtime.fetchImpl,
    workflowCanaryImpl: runtime.workflowCanaryImpl,
    signReceiptImpl: async (payload: unknown) =>
      `${b64(payload)}.${"s".repeat(43)}`,
    sleepImpl: async () => {},
    now: () => nowMs,
    randomUuid: () => "12345678-1234-4234-8234-123456789012",
    controlRecoveryToken: "recovery-token-that-is-at-least-thirty-two-bytes",
    releaseAccessClientId: "release-client-id",
    releaseAccessClientSecret:
      "release-client-secret-that-is-at-least-thirty-two-bytes",
    deploymentPauseToken:
      "deployment-pause-token-that-is-at-least-thirty-two-bytes",
    cloudflareApiToken: "cloudflare-api-token",
    deploymentRunId: "123456789",
    deploymentRunAttempt: 1,
    recoveryOperatorRunId: "987654321",
    recoveryOperatorRunAttempt: 1,
    recoveryOperatorJob: "accept",
    expectedWorkflowConclusion: "success",
  };
}

describe("Alice terminal production acceptance", () => {
  test("proves authenticated UI, durable chat/task recovery, gates, pause, rollback, and provenance", async () => {
    const data = fixture();
    const runtime = mockRuntime(data);
    const evidence = await runAliceProductionAcceptance(
      acceptanceInput(data, runtime),
    );
    expect(evidence.terminal).toBe(true);
    expect(evidence.publicOrEconomicActionExecuted).toBe(false);
    expect(evidence.durableChat.idempotentReplay).toBe(true);
    expect(evidence.durableChat.recoveredAfterPauseResume).toBe(true);
    expect(evidence.failClosedGates.pauseAll).toBe("chat-denied");
    expect(evidence.provenance.modalForwardProviderVersion).toBe(53);
    expect(evidence.evidence.requiredKinds).toEqual({
      "control.pause": 1,
      "control.resume": 2,
      "intent.authorization": 1,
      "model.reservation": 1,
      "plan.authorization": 1,
      "plan.created": 1,
      "session.conversation": 1,
      "session.task": 2,
    });
    expect(evidence.evidence.persistedObjectKeys).toHaveLength(10);
    expect(evidence.finalAuthority.pausedScopes).toEqual([]);
    expect(evidence.deploymentRun).toEqual({ id: "123456789", attempt: 1 });
    expect(evidence.recoveryOperatorRun).toEqual({
      id: "987654321",
      attempt: 1,
      job: "accept",
    });
    expect(evidence.publicationContract).toEqual({
      expectedWorkflowConclusion: "success",
      artifactConsumerMustVerifyWorkflowConclusion: true,
      publicationIsFinalSuccessOnlyStep: true,
    });
    expect(runtime.paused).toBe(false);
    expect(runtime.pauseCount).toBe(1);
  });

  test("re-enters PAUSE_ALL when any post-admission acceptance check fails", async () => {
    const data = fixture();
    const runtime = mockRuntime(data, { failRoot: true });
    await expect(
      runAliceProductionAcceptance(acceptanceInput(data, runtime)),
    ).rejects.toThrow("ALICE_PRODUCTION_ACCEPTANCE_INVALID");
    expect(runtime.paused).toBe(true);
    expect(runtime.pauseCount).toBe(1);
  });

  test("rejects stale evidence that was already present before this acceptance run", async () => {
    const data = fixture();
    const runtime = mockRuntime(data, { staleEvidence: true });
    await expect(
      runAliceProductionAcceptance(acceptanceInput(data, runtime)),
    ).rejects.toThrow("ALICE_PRODUCTION_ACCEPTANCE_INVALID");
    expect(runtime.paused).toBe(true);
  });

  test("rejects and reports any scoped pause in the intended unpaused terminal state", async () => {
    const data = fixture();
    const runtime = mockRuntime(data, { terminalScopedPause: true });
    await expect(
      runAliceProductionAcceptance(acceptanceInput(data, runtime)),
    ).rejects.toThrow("ALICE_PRODUCTION_ACCEPTANCE_INVALID");
    expect(runtime.paused).toBe(true);
  });
});

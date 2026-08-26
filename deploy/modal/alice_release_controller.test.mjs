import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildAliceReleaseCheckResponse } from "../../workers/alice-production-control/src/release-check.ts";
import {
  admitAliceReleaseOwner,
  pauseAliceReleaseMachine,
  resumeAliceReleaseOwner,
  validateAliceOwnerAuthorization,
  verifyAliceDeploymentPauseEvidence,
} from "./alice_release_controller.mjs";

const binding = {
  programDigest: `sha256:${"1".repeat(64)}`,
  releaseDigest: `sha256:${"2".repeat(64)}`,
  policyHash: `sha256:${"3".repeat(64)}`,
};
const release = {
  releaseEpoch: 1,
  sourceCommit: "4".repeat(40),
  deploymentControllerCommit: "5".repeat(40),
  runtimeImage: `ghcr.io/rndrntwrk/milaidy-agent@sha256:${"6".repeat(64)}`,
  runtimeBuildManifestSha256: `sha256:${"7".repeat(64)}`,
  elizaCommit: "8".repeat(40),
  modalRevision: 49,
  deploymentManifestSha256: `sha256:${"9".repeat(64)}`,
};
const controlVersionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const candidateExpected = {
  binding,
  release,
  rollbackBoundary: "modal:alice-runtime:v49",
};

function edgeReadiness(nonce, overrides = {}) {
  return {
    schemaVersion: "alice.deployment-edge-readiness.v1",
    nonce,
    workerVersionId: controlVersionId,
    servingCandidate: candidateExpected,
    ...overrides,
  };
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

function b64(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function ownerToken(now, overrides = {}) {
  return `${b64({ alg: "RS256", kid: "test" })}.${b64({
    iss: "https://rndrntwrk.cloudflareaccess.com",
    aud: "alice-access-audience",
    sub: "owner-subject",
    email: "alice-owner@rndrntwrk.com",
    iat: now - 10,
    nbf: now - 10,
    exp: now + 300,
    ...overrides,
  })}.signature`;
}

test("validates a fresh owner authorization tuple before protected use", async () => {
  const now = 1_787_400_000;
  const ownerEmailSha256 = crypto
    .createHash("sha256")
    .update("alice-owner@rndrntwrk.com")
    .digest("base64url");
  const result = await validateAliceOwnerAuthorization(ownerToken(now), {
    issuer: "https://rndrntwrk.cloudflareaccess.com",
    audience: "alice-access-audience",
    ownerEmailSha256,
    nowSeconds: now,
  });
  assert.equal(result.expiresAt, now + 300);
  assert.match(result.actor, /^owner:sha256:[a-f0-9]{64}$/);
  await assert.rejects(
    () => validateAliceOwnerAuthorization(ownerToken(now, { exp: now - 1 }), {
      issuer: "https://rndrntwrk.cloudflareaccess.com",
      audience: "alice-access-audience",
      ownerEmailSha256,
      nowSeconds: now,
    }),
    /ALICE_OWNER_AUTHORIZATION_INVALID/,
  );
});

test("accepts the configured 24-hour Access session but rejects a longer owner token", async () => {
  const now = 1_787_400_000;
  const ownerEmailSha256 = crypto
    .createHash("sha256")
    .update("alice-owner@rndrntwrk.com")
    .digest("base64url");
  const options = {
    issuer: "https://rndrntwrk.cloudflareaccess.com",
    audience: "alice-access-audience",
    ownerEmailSha256,
    nowSeconds: now,
  };
  const accepted = await validateAliceOwnerAuthorization(
    ownerToken(now, { exp: now + 86_400 }),
    options,
  );
  assert.equal(accepted.expiresAt, now + 86_400);
  await assert.rejects(
    () => validateAliceOwnerAuthorization(
      ownerToken(now, { exp: now + 86_401 }),
      options,
    ),
    /ALICE_OWNER_AUTHORIZATION_INVALID/,
  );
});

test("machine PAUSE_ALL is confirmed by a second signed status read", async () => {
  const pause = {
    pauseId: "pause-12345678",
    pausedAt: 1_787_400_000_000,
    binding,
    deploymentManifestSha256: release.deploymentManifestSha256,
    rollbackBoundary: "modal:alice-runtime:v49",
  };
  const seen = [];
  const nonces = ["p".repeat(43), "q".repeat(43)];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), init });
    if (init.method === "POST") {
      return Response.json({
        ok: true,
        result: { ok: true, code: "SCOPE_PAUSED", pause },
        evidenceQueued: true,
      });
    }
    const paused = seen.some((entry) => entry.init.method === "POST");
    const nonce = init.headers["x-alice-deployment-edge-nonce"];
    return Response.json({
      ok: true,
      code: "DEPLOYMENT_STATUS_READ",
      authority: {
        binding,
        deploymentManifestSha256: release.deploymentManifestSha256,
        admissionGeneration: 3,
        activeReleaseEpoch: 1,
        highestReleaseEpoch: 1,
        rollbackBoundary: "modal:alice-runtime:v49",
        pausedScopes: paused ? ["all"] : [],
        activePauses: paused ? { all: pause } : {},
      },
      candidateAdmission: paused
        ? {
            ok: false,
            allowed: false,
            code: "RUNTIME_PAUSED",
            blockingScopes: ["all"],
            binding,
            release,
          }
        : {
            ok: true,
            allowed: true,
            code: "RUNTIME_ADMITTED",
            blockingScopes: [],
            binding,
            release,
          },
      edgeReadiness: edgeReadiness(nonce),
    });
  };
  const result = await pauseAliceReleaseMachine({
    fetchImpl,
    serviceClientId: "release-client-id",
    serviceClientSecret: "release-client-secret-at-least-32-bytes",
    deploymentPauseToken: "deployment-pause-token-at-least-32-bytes",
    active: {
      binding,
      deploymentManifestSha256: release.deploymentManifestSha256,
      releaseEpoch: release.releaseEpoch,
      rollbackBoundary: "modal:alice-runtime:v49",
    },
    candidateExpected,
    expectedControlVersionId: controlVersionId,
    readinessAttempts: 1,
    readinessDelayMs: 0,
    nonceFactory: () => nonces.shift(),
    sleepImpl: async () => {},
  });
  assert.deepEqual(result.pause, pause);
  assert.equal(seen.length, 3);
  assert.deepEqual(seen.map((entry) => entry.init.method), ["GET", "POST", "GET"]);
  assert.match(seen[1].url, /\/pause-all-v2$/);
  assert.deepEqual(JSON.parse(seen[1].init.body), {
    schemaVersion: "alice.deployment-pause-request.v2",
    edgeReadiness: edgeReadiness("p".repeat(43)),
  });
  assert.equal(seen[0].init.headers["cf-access-client-id"], "release-client-id");
  assert.equal(
    seen[0].init.headers["x-alice-deployment-pause-token"],
    "deployment-pause-token-at-least-32-bytes",
  );
});

test("refuses a stale edge status before any PAUSE_ALL mutation", async () => {
  let pauseMutations = 0;
  const methods = [];
  await assert.rejects(
    () => pauseAliceReleaseMachine({
      fetchImpl: async (_url, init) => {
        methods.push(init.method);
        if (init.method === "POST") pauseMutations += 1;
        return Response.json({
          ok: true,
          code: "DEPLOYMENT_STATUS_READ",
          authority: {
            binding,
            deploymentManifestSha256: release.deploymentManifestSha256,
            admissionGeneration: 3,
            activeReleaseEpoch: 1,
            highestReleaseEpoch: 1,
            rollbackBoundary: "modal:alice-runtime:v49",
            pausedScopes: [],
            activePauses: {},
          },
          candidateAdmission: {
            ok: false,
            allowed: false,
            code: "RELEASE_NOT_ADMITTED",
            blockingScopes: [],
            binding: null,
            release: null,
          },
          // This is the production-shaped stale edge: the prior Worker does
          // not expose the candidate/version readiness challenge.
        });
      },
      serviceClientId: "release-client-id",
      serviceClientSecret: "release-client-secret-at-least-32-bytes",
      deploymentPauseToken: "deployment-pause-token-at-least-32-bytes",
      active: {
        binding,
        deploymentManifestSha256: release.deploymentManifestSha256,
        releaseEpoch: release.releaseEpoch,
        rollbackBoundary: "modal:alice-runtime:v49",
      },
      candidateExpected: {
        binding,
        release,
        rollbackBoundary: "modal:alice-runtime:v49",
      },
      expectedControlVersionId: controlVersionId,
      readinessAttempts: 1,
      nonceFactory: () => "n".repeat(43),
      sleepImpl: async () => {},
    }),
    /ALICE_DEPLOYMENT_PAUSE_INVALID/,
  );
  assert.equal(pauseMutations, 0);
  assert.deepEqual(methods, ["GET"]);
});

test("first release pauses the exact unadmitted tuple while checking the signed candidate", async () => {
  const zeroBinding = {
    programDigest: `sha256:${"0".repeat(64)}`,
    releaseDigest: `sha256:${"0".repeat(64)}`,
    policyHash: `sha256:${"0".repeat(64)}`,
  };
  const pause = {
    pauseId: "pause-first-release-12345678",
    pausedAt: 1_787_400_000_000,
    binding: zeroBinding,
    deploymentManifestSha256: `sha256:${"0".repeat(64)}`,
    rollbackBoundary: "release:unadmitted",
  };
  const pausedCandidate = buildAliceReleaseCheckResponse({
    binding,
    release,
    releaseIsActive: false,
    pausedScopes: ["all"],
    admissionGeneration: 0,
  });
  const unpausedCandidate = buildAliceReleaseCheckResponse({
    binding,
    release,
    releaseIsActive: false,
    pausedScopes: [],
    admissionGeneration: 0,
  });
  const nonces = ["r".repeat(43), "s".repeat(43)];
  let paused = false;
  const result = await pauseAliceReleaseMachine({
    fetchImpl: async (_url, init) => {
      if (init.method === "POST") {
        paused = true;
        return Response.json({
          ok: true,
          result: { ok: true, code: "SCOPE_PAUSED", pause },
          evidenceQueued: true,
        });
      }
      const nonce = init.headers["x-alice-deployment-edge-nonce"];
      return Response.json({
          ok: true,
          code: "DEPLOYMENT_STATUS_READ",
          authority: {
            binding: zeroBinding,
            deploymentManifestSha256: `sha256:${"0".repeat(64)}`,
            admissionGeneration: 0,
            activeReleaseEpoch: 0,
            highestReleaseEpoch: 0,
            rollbackBoundary: "release:unadmitted",
            pausedScopes: paused ? ["all"] : [],
            activePauses: paused ? { all: pause } : {},
          },
          candidateAdmission: paused ? pausedCandidate : unpausedCandidate,
          edgeReadiness: edgeReadiness(nonce),
        });
    },
    serviceClientId: "release-client-id",
    serviceClientSecret: "release-client-secret-at-least-32-bytes",
    deploymentPauseToken: "deployment-pause-token-at-least-32-bytes",
    active: {
      binding: zeroBinding,
      deploymentManifestSha256: `sha256:${"0".repeat(64)}`,
      releaseEpoch: 0,
      rollbackBoundary: "release:unadmitted",
    },
    candidateExpected,
    expectedControlVersionId: controlVersionId,
    readinessAttempts: 1,
    readinessDelayMs: 0,
    nonceFactory: () => nonces.shift(),
    sleepImpl: async () => {},
  });
  assert.deepEqual(result.pause, pause);
  const evidence = {
    schemaVersion: "alice.deployment-pause-evidence.v1",
    observedAt: "2026-08-23T12:00:00.000Z",
    sourceCommit: release.sourceCommit,
    deploymentManifestSha256: release.deploymentManifestSha256,
    rollbackAnchorSha256: `sha256:${"f".repeat(64)}`,
    prepareControlVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    prepareEvidenceSha256: `sha256:${"d".repeat(64)}`,
    active: {
      binding: zeroBinding,
      deploymentManifestSha256: `sha256:${"0".repeat(64)}`,
      releaseEpoch: 0,
      rollbackBoundary: "release:unadmitted",
    },
    candidateExpected: {
      binding,
      release,
      rollbackBoundary: "modal:alice-runtime:v49",
    },
    result,
  };
  assert.equal(
    verifyAliceDeploymentPauseEvidence(evidence, {
      candidateExpected: evidence.candidateExpected,
      rollbackAnchorSha256: evidence.rollbackAnchorSha256,
      prepareControlVersionId: evidence.prepareControlVersionId,
      prepareEvidenceSha256: evidence.prepareEvidenceSha256,
    }),
    evidence,
  );
  assert.throws(
    () => verifyAliceDeploymentPauseEvidence(evidence, {
      candidateExpected: evidence.candidateExpected,
      rollbackAnchorSha256: `sha256:${"e".repeat(64)}`,
      prepareControlVersionId: evidence.prepareControlVersionId,
      prepareEvidenceSha256: evidence.prepareEvidenceSha256,
    }),
    /ALICE_DEPLOYMENT_PAUSE_EVIDENCE_INVALID/,
  );
});

test("admission generation is zero only for the exact unadmitted authority tuple", async () => {
  const zero = `sha256:${"0".repeat(64)}`;
  const zeroBinding = {
    programDigest: zero,
    releaseDigest: zero,
    policyHash: zero,
  };
  const cases = [
    {
      name: "nonzero generation on the unadmitted tuple",
      active: {
        binding: zeroBinding,
        deploymentManifestSha256: zero,
        releaseEpoch: 0,
        rollbackBoundary: "release:unadmitted",
      },
      authority: {
        binding: zeroBinding,
        deploymentManifestSha256: zero,
        admissionGeneration: 1,
        activeReleaseEpoch: 0,
        highestReleaseEpoch: 0,
        rollbackBoundary: "release:unadmitted",
        pausedScopes: [],
        activePauses: {},
      },
    },
    {
      name: "zero generation on an admitted tuple",
      active: {
        binding,
        deploymentManifestSha256: release.deploymentManifestSha256,
        releaseEpoch: release.releaseEpoch,
        rollbackBoundary: "modal:alice-runtime:v49",
      },
      authority: {
        binding,
        deploymentManifestSha256: release.deploymentManifestSha256,
        admissionGeneration: 0,
        activeReleaseEpoch: release.releaseEpoch,
        highestReleaseEpoch: release.releaseEpoch,
        rollbackBoundary: "modal:alice-runtime:v49",
        pausedScopes: [],
        activePauses: {},
      },
    },
  ];
  for (const fixture of cases) {
    let pauseMutations = 0;
    await assert.rejects(
      () => pauseAliceReleaseMachine({
        fetchImpl: async (_url, init) => {
          if (init.method === "POST") pauseMutations += 1;
          const nonce = init.headers["x-alice-deployment-edge-nonce"];
          return Response.json({
            ok: true,
            code: "DEPLOYMENT_STATUS_READ",
            authority: fixture.authority,
            candidateAdmission: buildAliceReleaseCheckResponse({
              binding,
              release,
              releaseIsActive: false,
              pausedScopes: [],
              admissionGeneration: fixture.authority.admissionGeneration,
            }),
            edgeReadiness: edgeReadiness(nonce),
          });
        },
        serviceClientId: "release-client-id",
        serviceClientSecret: "release-client-secret-at-least-32-bytes",
        deploymentPauseToken: "deployment-pause-token-at-least-32-bytes",
        active: fixture.active,
        candidateExpected,
        expectedControlVersionId: controlVersionId,
        readinessAttempts: 1,
        readinessDelayMs: 0,
        nonceFactory: () => "t".repeat(43),
        sleepImpl: async () => {},
      }),
      /ALICE_DEPLOYMENT_PAUSE_INVALID/,
      fixture.name,
    );
    assert.equal(pauseMutations, 0, fixture.name);
  }
});

test("deployment pause CLI validates exact persisted journals before PAUSE_ALL mutation", () => {
  const source = fs.readFileSync(
    path.join(currentDirectory, "alice_release_pause.mjs"),
    "utf8",
  );
  const preflight = source.indexOf(
    "const { active, candidateExpected } = verifyAliceFirstReleasePauseInputs({",
  );
  const mutation = source.indexOf("const result = await pauseAliceReleaseMachine({");
  const evidence = source.indexOf("const evidence = buildAliceFirstReleasePauseEvidence({");
  assert.ok(preflight >= 0 && mutation >= 0 && evidence >= 0);
  assert.ok(preflight < mutation && mutation < evidence);
  assert.match(source, /prepareEvidenceSha256/);
  assert.match(source, /anchorSha256/);
});

test("owner release transition remains PAUSE_ALL-blocked until a separate recovery phase", async () => {
  const actor = `owner:sha256:${"a".repeat(64)}`;
  const result = await admitAliceReleaseOwner({
    fetchImpl: async () => Response.json({
      ok: true,
      allowed: false,
      code: "RUNTIME_PAUSED",
      activationCode: "RELEASE_ACTIVATED",
      blockingScopes: ["all"],
      binding,
      release,
      evidenceQueued: true,
    }, { status: 202 }),
    ownerAuthorization: "masked-owner-token-with-at-least-32-bytes",
    owner: { actor, expiresAt: Math.floor(Date.now() / 1000) + 300 },
    expected: { binding, release, rollbackBoundary: "modal:alice-runtime:v49" },
    deploymentPaused: true,
  });
  assert.equal(result.code, "RELEASE_ACTIVATED");
  assert.equal(result.deploymentPaused, true);
});

test("owner resume accepts only a fresh receipt bound to the exact pause and release", async () => {
  const now = 1_787_400_000;
  const actor = `owner:sha256:${"a".repeat(64)}`;
  const pause = {
    pauseId: "pause-12345678",
    pausedAt: now * 1000 - 1000,
    binding,
    deploymentManifestSha256: release.deploymentManifestSha256,
    rollbackBoundary: "modal:alice-runtime:v49",
  };
  const payload = {
    schemaVersion: "alice.recovery-receipt.v3",
    action: "control.resume",
    scope: "all",
    pauseId: pause.pauseId,
    pausedAt: pause.pausedAt,
    subject: actor,
    pauseBinding: binding,
    pauseDeploymentManifestSha256: release.deploymentManifestSha256,
    pauseRollbackBoundary: "modal:alice-runtime:v49",
    currentBinding: binding,
    currentDeploymentManifestSha256: release.deploymentManifestSha256,
    currentReleaseEpoch: 1,
    currentRollbackBoundary: "modal:alice-runtime:v49",
    issuedAt: now * 1000 - 500,
    expiresAt: now * 1000 + 60_000,
    nonce: "nonce-12345678",
  };
  const receipt = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
  const response = await resumeAliceReleaseOwner({
    fetchImpl: async () => Response.json({
      ok: true,
      result: { ok: true, code: "SCOPE_RESUMED" },
      evidenceQueued: true,
    }),
    ownerAuthorization: "masked-owner-token",
    owner: { actor, expiresAt: now + 300 },
    recoveryReceipt: receipt,
    pause,
    pauseExpected: {
      binding,
      release,
      rollbackBoundary: "modal:alice-runtime:v49",
    },
    currentExpected: {
      binding,
      release,
      rollbackBoundary: "modal:alice-runtime:v49",
    },
    nowMs: now * 1000,
  });
  assert.equal(response.code, "SCOPE_RESUMED");
});

test("resumes a transition using distinct pause-time and current release tuples", async () => {
  const now = 1_787_400_000;
  const actor = `owner:sha256:${"a".repeat(64)}`;
  const priorBinding = {
    programDigest: `sha256:${"a".repeat(64)}`,
    releaseDigest: `sha256:${"b".repeat(64)}`,
    policyHash: `sha256:${"c".repeat(64)}`,
  };
  const priorRelease = {
    ...release,
    releaseEpoch: 1,
    deploymentManifestSha256: `sha256:${"d".repeat(64)}`,
    modalRevision: 49,
  };
  const currentBinding = {
    programDigest: `sha256:${"e".repeat(64)}`,
    releaseDigest: `sha256:${"f".repeat(64)}`,
    policyHash: `sha256:${"0".repeat(64)}`,
  };
  const currentRelease = {
    ...release,
    releaseEpoch: 2,
    deploymentManifestSha256: `sha256:${"1".repeat(64)}`,
    modalRevision: 50,
  };
  const pause = {
    pauseId: "pause-transition-12345678",
    pausedAt: now * 1000 - 1000,
    binding: priorBinding,
    deploymentManifestSha256: priorRelease.deploymentManifestSha256,
    rollbackBoundary: "modal:alice-runtime:v49",
  };
  const payload = {
    schemaVersion: "alice.recovery-receipt.v3",
    action: "control.resume",
    scope: "all",
    pauseId: pause.pauseId,
    pausedAt: pause.pausedAt,
    subject: actor,
    pauseBinding: priorBinding,
    pauseDeploymentManifestSha256: priorRelease.deploymentManifestSha256,
    pauseRollbackBoundary: "modal:alice-runtime:v49",
    currentBinding,
    currentDeploymentManifestSha256:
      currentRelease.deploymentManifestSha256,
    currentReleaseEpoch: 2,
    currentRollbackBoundary: "modal:alice-runtime:v50",
    issuedAt: now * 1000 - 500,
    expiresAt: now * 1000 + 60_000,
    nonce: "nonce-transition-12345678",
  };
  const receipt = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
  const result = await resumeAliceReleaseOwner({
    fetchImpl: async () => Response.json({
      ok: true,
      result: { ok: true, code: "SCOPE_RESUMED" },
      evidenceQueued: true,
    }),
    ownerAuthorization: "masked-owner-token",
    owner: { actor, expiresAt: now + 300 },
    recoveryReceipt: receipt,
    pause,
    pauseExpected: {
      binding: priorBinding,
      release: priorRelease,
      rollbackBoundary: "modal:alice-runtime:v49",
    },
    currentExpected: {
      binding: currentBinding,
      release: currentRelease,
      rollbackBoundary: "modal:alice-runtime:v50",
    },
    nowMs: now * 1000,
  });
  assert.equal(result.code, "SCOPE_RESUMED");
});

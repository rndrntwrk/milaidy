import crypto from "node:crypto";

const OWNER_ORIGIN = "https://alice.rndrntwrk.com";
const RELEASE_ORIGIN = "https://alice-release.rndrntwrk.com";
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const VERSION_ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const EDGE_NONCE = /^[A-Za-z0-9_-]{43}$/;
const DEPLOYMENT_STATUS_PATH =
  "/control/internal/v1/deployment/status";
const DEPLOYMENT_PAUSE_V2_PATH =
  "/control/internal/v1/deployment/pause-all-v2";

function invalid(code = "ALICE_RELEASE_CONTROLLER_INVALID") {
  throw new Error(code);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return (
    object(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",")
  );
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactBinding(value, expected) {
  return (
    object(value) &&
    Object.keys(value).sort().join(",") ===
      "policyHash,programDigest,releaseDigest" &&
    [value.programDigest, value.releaseDigest, value.policyHash].every(
      (digest) => DIGEST.test(digest ?? ""),
    ) &&
    canonical(value) === canonical(expected)
  );
}

function exactRelease(value, expected) {
  return (
    object(value) &&
    Object.keys(value).sort().join(",") ===
      "deploymentControllerCommit,deploymentManifestSha256,elizaCommit,modalRevision,releaseEpoch,runtimeBuildManifestSha256,runtimeImage,sourceCommit" &&
    Number.isSafeInteger(value.releaseEpoch) &&
    value.releaseEpoch > 0 &&
    Number.isSafeInteger(value.modalRevision) &&
    value.modalRevision >= 49 &&
    COMMIT.test(value.sourceCommit ?? "") &&
    COMMIT.test(value.deploymentControllerCommit ?? "") &&
    COMMIT.test(value.elizaCommit ?? "") &&
    DIGEST.test(value.runtimeBuildManifestSha256 ?? "") &&
    DIGEST.test(value.deploymentManifestSha256 ?? "") &&
    /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/.test(
      value.runtimeImage ?? "",
    ) &&
    canonical(value) === canonical(expected)
  );
}

function decodeBase64UrlJson(value) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) invalid();
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!object(parsed)) invalid();
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ALICE_")) throw error;
    invalid();
  }
}

function tokenPayload(token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 16_384) {
    invalid("ALICE_OWNER_AUTHORIZATION_INVALID");
  }
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    invalid("ALICE_OWNER_AUTHORIZATION_INVALID");
  }
  try {
    return decodeBase64UrlJson(parts[1]);
  } catch {
    invalid("ALICE_OWNER_AUTHORIZATION_INVALID");
  }
}

function secure(value, minimum = 16) {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= 4096 &&
    !/[\0\r\n]/.test(value)
  );
}

async function boundedJson(response, errorCode) {
  if (!(response instanceof Response)) invalid(errorCode);
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > 64 * 1024) invalid(errorCode);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 64 * 1024) invalid(errorCode);
  try {
    const value = JSON.parse(new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes));
    if (!object(value)) invalid(errorCode);
    return value;
  } catch (error) {
    if (error instanceof Error && error.message === errorCode) throw error;
    invalid(errorCode);
  }
}

function ownerHeaders(ownerAuthorization, method) {
  if (!secure(ownerAuthorization, 16)) invalid("ALICE_OWNER_AUTHORIZATION_INVALID");
  return {
    accept: "application/json",
    "cache-control": "no-store",
    cookie: `CF_Authorization=${ownerAuthorization}`,
    origin: OWNER_ORIGIN,
    "sec-fetch-site": "same-origin",
    ...(method === "GET" ? {} : { "content-type": "application/json" }),
  };
}

export async function validateAliceOwnerAuthorization(token, {
  issuer,
  audience,
  ownerEmailSha256,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const payload = tokenPayload(token);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const email = typeof payload.email === "string"
    ? payload.email.trim().toLowerCase()
    : "";
  const emailSha256 = crypto.createHash("sha256").update(email).digest("base64url");
  if (
    issuer !== "https://rndrntwrk.cloudflareaccess.com" ||
    typeof audience !== "string" ||
    audience.length < 8 ||
    !/^[A-Za-z0-9_-]{43}$/.test(ownerEmailSha256 ?? "") ||
    payload.iss !== issuer ||
    !audiences.includes(audience) ||
    typeof payload.sub !== "string" ||
    payload.sub.length < 1 ||
    emailSha256 !== ownerEmailSha256 ||
    !Number.isSafeInteger(payload.exp) ||
    payload.exp < nowSeconds + 30 ||
    payload.exp > nowSeconds + 86_400 ||
    (payload.nbf !== undefined &&
      (!Number.isSafeInteger(payload.nbf) || payload.nbf > nowSeconds + 30)) ||
    (payload.iat !== undefined &&
      (!Number.isSafeInteger(payload.iat) || payload.iat > nowSeconds + 30))
  ) {
    invalid("ALICE_OWNER_AUTHORIZATION_INVALID");
  }
  return {
    actor: `owner:sha256:${crypto.createHash("sha256").update(payload.sub).digest("hex")}`,
    expiresAt: payload.exp,
    authorizationSha256: `sha256:${crypto.createHash("sha256").update(token).digest("hex")}`,
  };
}

export async function admitAliceReleaseOwner({
  fetchImpl = globalThis.fetch,
  ownerAuthorization,
  owner,
  expected,
  rollbackReceipt = "",
  deploymentPaused = false,
}) {
  if (
    typeof fetchImpl !== "function" ||
    !owner ||
    !/^owner:sha256:[a-f0-9]{64}$/.test(owner.actor ?? "") ||
    owner.expiresAt < Math.floor(Date.now() / 1000) + 15 ||
    !exactBinding(expected?.binding, expected?.binding) ||
    !exactRelease(expected?.release, expected?.release) ||
    expected.rollbackBoundary !==
      `modal:alice-runtime:v${expected.release.modalRevision}` ||
    (rollbackReceipt && !secure(rollbackReceipt, 32)) ||
    typeof deploymentPaused !== "boolean"
  ) {
    invalid();
  }
  const headers = ownerHeaders(ownerAuthorization, "POST");
  if (rollbackReceipt) headers["x-alice-release-rollback-receipt"] = rollbackReceipt;
  const response = await fetchImpl(
    `${OWNER_ORIGIN}/control/api/v1/release/admit`,
    { method: "POST", headers, body: "{}", redirect: "manual" },
  );
  const value = await boundedJson(response, "ALICE_OWNER_RELEASE_ADMISSION_INVALID");
  const expectedActivationCodes = [
    "RELEASE_ACTIVATED",
    "RELEASE_ALREADY_ACTIVE",
    "PROGRAM_RENEWED",
    "RELEASE_ROLLED_BACK",
  ];
  if (
    !response.ok ||
    value.ok !== true ||
    value.allowed !== !deploymentPaused ||
    value.code !== (deploymentPaused ? "RUNTIME_PAUSED" : "RUNTIME_ADMITTED") ||
    !expectedActivationCodes.includes(value.activationCode) ||
    !Array.isArray(value.blockingScopes) ||
    canonical(value.blockingScopes) !==
      canonical(deploymentPaused ? ["all"] : []) ||
    !exactBinding(value.binding, expected.binding) ||
    !exactRelease(value.release, expected.release) ||
    value.evidenceQueued !== true
  ) {
    invalid("ALICE_OWNER_RELEASE_ADMISSION_INVALID");
  }
  return {
    code: value.activationCode,
    binding: value.binding,
    release: value.release,
    evidenceQueued: true,
    deploymentPaused,
  };
}

function authorityTuple(expected) {
  if (!object(expected)) return null;
  if (object(expected.release)) {
    return {
      binding: expected.binding,
      deploymentManifestSha256:
        expected.release.deploymentManifestSha256,
      releaseEpoch: expected.release.releaseEpoch,
      rollbackBoundary: expected.rollbackBoundary,
    };
  }
  return expected;
}

function validAuthorityTuple(expected) {
  const tuple = authorityTuple(expected);
  if (
    !object(tuple) ||
    !exactBinding(tuple.binding, tuple.binding) ||
    !DIGEST.test(tuple.deploymentManifestSha256 ?? "") ||
    !Number.isSafeInteger(tuple.releaseEpoch) ||
    tuple.releaseEpoch < 0 ||
    typeof tuple.rollbackBoundary !== "string"
  ) {
    return false;
  }
  if (tuple.releaseEpoch === 0) {
    const zero = `sha256:${"0".repeat(64)}`;
    return (
      tuple.binding.programDigest === zero &&
      tuple.binding.releaseDigest === zero &&
      tuple.binding.policyHash === zero &&
      tuple.deploymentManifestSha256 === zero &&
      tuple.rollbackBoundary === "release:unadmitted"
    );
  }
  return /^modal:alice-runtime:v(?:49|[5-9][0-9]|[1-9][0-9]{2,})$/.test(
    tuple.rollbackBoundary,
  );
}

function validAdmissionGeneration(expected, admissionGeneration) {
  const tuple = authorityTuple(expected);
  return Boolean(
    validAuthorityTuple(tuple) &&
    Number.isSafeInteger(admissionGeneration) &&
    (tuple.releaseEpoch === 0
      ? admissionGeneration === 0
      : admissionGeneration >= 1)
  );
}

function validPause(value, expected) {
  const tuple = authorityTuple(expected);
  return Boolean(
    validAuthorityTuple(tuple) &&
    object(value) &&
    /^pause-[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(value.pauseId ?? "") &&
    Number.isSafeInteger(value.pausedAt) &&
    value.pausedAt > 0 &&
    exactBinding(value.binding, tuple.binding) &&
    value.deploymentManifestSha256 === tuple.deploymentManifestSha256 &&
    value.rollbackBoundary === tuple.rollbackBoundary,
  );
}

export async function pauseAliceReleaseMachine({
  fetchImpl = globalThis.fetch,
  serviceClientId,
  serviceClientSecret,
  deploymentPauseToken,
  active,
  candidateExpected,
  expectedControlVersionId,
  readinessAttempts = 24,
  readinessDelayMs = 5_000,
  nonceFactory = () => crypto.randomBytes(32).toString("base64url"),
  sleepImpl = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
  if (
    typeof fetchImpl !== "function" ||
    !secure(serviceClientId, 8) ||
    !secure(serviceClientSecret, 32) ||
    !secure(deploymentPauseToken, 32) ||
    !validAuthorityTuple(active) ||
    !exactBinding(candidateExpected?.binding, candidateExpected?.binding) ||
    !exactRelease(candidateExpected?.release, candidateExpected?.release) ||
    !VERSION_ID.test(expectedControlVersionId ?? "") ||
    !Number.isSafeInteger(readinessAttempts) ||
    readinessAttempts < 1 ||
    readinessAttempts > 60 ||
    !Number.isSafeInteger(readinessDelayMs) ||
    readinessDelayMs < 0 ||
    readinessDelayMs > 30_000 ||
    typeof nonceFactory !== "function" ||
    typeof sleepImpl !== "function" ||
    candidateExpected.rollbackBoundary !==
      `modal:alice-runtime:v${candidateExpected.release.modalRevision}`
  ) {
    invalid();
  }
  const headers = {
    accept: "application/json",
    "cache-control": "no-store",
    "cf-access-client-id": serviceClientId,
    "cf-access-client-secret": serviceClientSecret,
    "x-alice-deployment-pause-token": deploymentPauseToken,
  };
  const authorityMatches = (authority) => Boolean(
    object(authority) &&
    exactBinding(authority.binding, active.binding) &&
    authority.deploymentManifestSha256 === active.deploymentManifestSha256 &&
    authority.activeReleaseEpoch === active.releaseEpoch &&
    authority.rollbackBoundary === active.rollbackBoundary &&
    validAdmissionGeneration(active, authority.admissionGeneration),
  );
  const edgeMatches = (status, nonce) => Boolean(
    exactKeys(status?.edgeReadiness, [
      "nonce",
      "schemaVersion",
      "servingCandidate",
      "workerVersionId",
    ]) &&
    status.edgeReadiness.schemaVersion ===
      "alice.deployment-edge-readiness.v1" &&
    status.edgeReadiness.nonce === nonce &&
    status.edgeReadiness.workerVersionId === expectedControlVersionId &&
    object(status.edgeReadiness.servingCandidate) &&
    exactBinding(
      status.edgeReadiness.servingCandidate.binding,
      candidateExpected.binding,
    ) &&
    exactRelease(
      status.edgeReadiness.servingCandidate.release,
      candidateExpected.release,
    ) &&
    status.edgeReadiness.servingCandidate.rollbackBoundary ===
      candidateExpected.rollbackBoundary
  );
  const readStatus = async (nonce) => {
    const response = await fetchImpl(
      `${RELEASE_ORIGIN}${DEPLOYMENT_STATUS_PATH}`,
      {
        method: "GET",
        headers: {
          ...headers,
          "x-alice-deployment-edge-nonce": nonce,
        },
        redirect: "manual",
      },
    );
    const status = await boundedJson(
      response,
      "ALICE_DEPLOYMENT_PAUSE_INVALID",
    );
    return { response, status };
  };
  const awaitStatus = async (verify) => {
    for (let attempt = 0; attempt < readinessAttempts; attempt += 1) {
      const nonce = nonceFactory();
      if (!EDGE_NONCE.test(nonce ?? "")) invalid();
      try {
        const observed = await readStatus(nonce);
        if (
          observed.response.ok &&
          observed.status.ok === true &&
          observed.status.code === "DEPLOYMENT_STATUS_READ" &&
          authorityMatches(observed.status.authority) &&
          edgeMatches(observed.status, nonce) &&
          verify(observed.status)
        ) {
          return { ...observed, nonce };
        }
      } catch {
        // A not-yet-propagated route may fail as an HTTP response or a
        // transport error. Both remain mutation-free and are bounded by the
        // same readiness-attempt ceiling.
      }
      if (attempt + 1 < readinessAttempts) await sleepImpl(readinessDelayMs);
    }
    invalid("ALICE_DEPLOYMENT_PAUSE_INVALID");
  };

  const ready = await awaitStatus(() => true);
  const pauseResponse = await fetchImpl(
    `${RELEASE_ORIGIN}${DEPLOYMENT_PAUSE_V2_PATH}`,
    {
      method: "POST",
      headers: {
        ...headers,
        "content-type": "application/json",
        "x-alice-deployment-edge-nonce": ready.nonce,
      },
      body: JSON.stringify({
        schemaVersion: "alice.deployment-pause-request.v2",
        edgeReadiness: ready.status.edgeReadiness,
      }),
      redirect: "manual",
    },
  );
  const paused = await boundedJson(pauseResponse, "ALICE_DEPLOYMENT_PAUSE_INVALID");
  if (
    !pauseResponse.ok ||
    paused.ok !== true ||
    paused.evidenceQueued !== true ||
    !object(paused.result) ||
    paused.result.ok !== true ||
    !["SCOPE_PAUSED", "SCOPE_ALREADY_PAUSED"].includes(paused.result.code) ||
    !validPause(paused.result.pause, active)
  ) {
    invalid("ALICE_DEPLOYMENT_PAUSE_INVALID");
  }
  const confirmed = await awaitStatus((status) => {
    const authority = status.authority;
    return Boolean(
      Array.isArray(authority.pausedScopes) &&
      authority.pausedScopes.includes("all") &&
      object(authority.activePauses) &&
      canonical(authority.activePauses.all) === canonical(paused.result.pause) &&
      object(status.candidateAdmission) &&
      status.candidateAdmission.ok === false &&
      status.candidateAdmission.allowed === false &&
      status.candidateAdmission.code === "RUNTIME_PAUSED" &&
      canonical(status.candidateAdmission.blockingScopes) === canonical(["all"]) &&
      exactBinding(
        status.candidateAdmission.binding,
        candidateExpected.binding,
      ) &&
      exactRelease(
        status.candidateAdmission.release,
        candidateExpected.release,
      )
    );
  });
  const statusResponse = confirmed.response;
  const status = confirmed.status;
  const authority = status.authority;
  if (
    !statusResponse.ok ||
    status.ok !== true ||
    status.code !== "DEPLOYMENT_STATUS_READ" ||
    !authorityMatches(authority) ||
    !Array.isArray(authority.pausedScopes) ||
    !authority.pausedScopes.includes("all") ||
    !object(authority.activePauses) ||
    canonical(authority.activePauses.all) !== canonical(paused.result.pause) ||
    !object(status.candidateAdmission) ||
    status.candidateAdmission.ok !== false ||
    status.candidateAdmission.allowed !== false ||
    status.candidateAdmission.code !== "RUNTIME_PAUSED" ||
    canonical(status.candidateAdmission.blockingScopes) !== canonical(["all"]) ||
    !exactBinding(
      status.candidateAdmission.binding,
      candidateExpected.binding,
    ) ||
    !exactRelease(
      status.candidateAdmission.release,
      candidateExpected.release,
    ) ||
    !edgeMatches(status, confirmed.nonce)
  ) {
    invalid("ALICE_DEPLOYMENT_PAUSE_INVALID");
  }
  return {
    pause: paused.result.pause,
    admissionGeneration: authority.admissionGeneration,
    evidenceQueued: true,
    confirmedByStatusRead: true,
    edgeReadinessConfirmed: true,
    controlVersionId: expectedControlVersionId,
  };
}

export function verifyAliceDeploymentPauseEvidence(
  value,
  {
    candidateExpected,
    rollbackAnchorSha256,
    prepareControlVersionId,
    prepareEvidenceSha256,
  },
) {
  if (
    !object(value) ||
    Object.keys(value).sort().join(",") !== [
      "active",
      "candidateExpected",
      "deploymentManifestSha256",
      "observedAt",
      "prepareControlVersionId",
      "prepareEvidenceSha256",
      "result",
      "rollbackAnchorSha256",
      "schemaVersion",
      "sourceCommit",
    ].sort().join(",") ||
    value.schemaVersion !== "alice.deployment-pause-evidence.v1" ||
    !Number.isFinite(Date.parse(value.observedAt ?? "")) ||
    new Date(value.observedAt).toISOString() !== value.observedAt ||
    !COMMIT.test(value.sourceCommit ?? "") ||
    !DIGEST.test(value.deploymentManifestSha256 ?? "") ||
    !DIGEST.test(value.rollbackAnchorSha256 ?? "") ||
    !DIGEST.test(value.prepareEvidenceSha256 ?? "") ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
      value.prepareControlVersionId ?? "",
    ) ||
    value.rollbackAnchorSha256 !== rollbackAnchorSha256 ||
    value.prepareControlVersionId !== prepareControlVersionId ||
    value.prepareEvidenceSha256 !== prepareEvidenceSha256 ||
    !validAuthorityTuple(value.active) ||
    !object(value.candidateExpected) ||
    !exactBinding(
      value.candidateExpected.binding,
      candidateExpected?.binding,
    ) ||
    !exactRelease(
      value.candidateExpected.release,
      candidateExpected?.release,
    ) ||
    value.candidateExpected.rollbackBoundary !==
      candidateExpected?.rollbackBoundary ||
    value.deploymentManifestSha256 !==
      candidateExpected?.release?.deploymentManifestSha256 ||
    value.sourceCommit !== candidateExpected?.release?.sourceCommit ||
    !object(value.result) ||
    !validPause(value.result.pause, value.active) ||
    !validAdmissionGeneration(value.active, value.result.admissionGeneration) ||
    value.result.evidenceQueued !== true ||
    value.result.confirmedByStatusRead !== true ||
    value.result.edgeReadinessConfirmed !== true ||
    value.result.controlVersionId !== prepareControlVersionId
  ) {
    invalid("ALICE_DEPLOYMENT_PAUSE_EVIDENCE_INVALID");
  }
  return value;
}

function validateRecoveryReceipt(receipt, { owner, pause, expected, nowMs }) {
  if (!secure(receipt, 32)) invalid("ALICE_RECOVERY_RECEIPT_INVALID");
  const parts = receipt.split(".");
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    invalid("ALICE_RECOVERY_RECEIPT_INVALID");
  }
  let payload;
  try {
    payload = decodeBase64UrlJson(parts[0]);
  } catch {
    invalid("ALICE_RECOVERY_RECEIPT_INVALID");
  }
  if (
    payload.schemaVersion !== "alice.recovery-receipt.v3" ||
    payload.action !== "control.resume" ||
    payload.scope !== "all" ||
    payload.pauseId !== pause.pauseId ||
    payload.pausedAt !== pause.pausedAt ||
    payload.subject !== owner.actor ||
    !exactBinding(payload.pauseBinding, pause.binding) ||
    payload.pauseDeploymentManifestSha256 !== pause.deploymentManifestSha256 ||
    payload.pauseRollbackBoundary !== pause.rollbackBoundary ||
    !exactBinding(payload.currentBinding, expected.binding) ||
    payload.currentDeploymentManifestSha256 !==
      expected.release.deploymentManifestSha256 ||
    payload.currentReleaseEpoch !== expected.release.releaseEpoch ||
    payload.currentRollbackBoundary !== expected.rollbackBoundary ||
    !Number.isSafeInteger(payload.issuedAt) ||
    !Number.isSafeInteger(payload.expiresAt) ||
    payload.issuedAt > nowMs + 30_000 ||
    payload.expiresAt < nowMs + 15_000 ||
    payload.expiresAt > nowMs + 10 * 60_000 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(payload.nonce ?? "")
  ) {
    invalid("ALICE_RECOVERY_RECEIPT_INVALID");
  }
  return payload;
}

export async function resumeAliceReleaseOwner({
  fetchImpl = globalThis.fetch,
  ownerAuthorization,
  owner,
  recoveryReceipt,
  pause,
  pauseExpected,
  currentExpected,
  nowMs = Date.now(),
}) {
  if (
    typeof fetchImpl !== "function" ||
    !owner ||
    owner.expiresAt * 1000 < nowMs + 15_000 ||
    !validPause(pause, pauseExpected) ||
    !exactBinding(currentExpected?.binding, currentExpected?.binding) ||
    !exactRelease(currentExpected?.release, currentExpected?.release) ||
    currentExpected.rollbackBoundary !==
      `modal:alice-runtime:v${currentExpected.release.modalRevision}`
  ) {
    invalid("ALICE_RECOVERY_RECEIPT_INVALID");
  }
  validateRecoveryReceipt(recoveryReceipt, {
    owner,
    pause,
    expected: currentExpected,
    nowMs,
  });
  const response = await fetchImpl(
    `${OWNER_ORIGIN}/control/api/v1/pauses/all`,
    {
      method: "DELETE",
      headers: {
        ...ownerHeaders(ownerAuthorization, "DELETE"),
        "x-alice-recovery-receipt": recoveryReceipt,
      },
      body: "{}",
      redirect: "manual",
    },
  );
  const value = await boundedJson(response, "ALICE_OWNER_RESUME_INVALID");
  if (
    !response.ok ||
    value.ok !== true ||
    value.evidenceQueued !== true ||
    !object(value.result) ||
    value.result.ok !== true ||
    value.result.code !== "SCOPE_RESUMED"
  ) {
    invalid("ALICE_OWNER_RESUME_INVALID");
  }
  return { code: value.result.code, evidenceQueued: true };
}

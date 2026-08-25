import crypto from "node:crypto";
import fs from "node:fs";

const COMMIT = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256:[a-f0-9]{64}$/u;
const OWNER_HASH = /^[A-Za-z0-9_-]{43}$/u;
const RUNTIME_IMAGE =
  /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/u;
const ARTIFACT_NAME =
  /^alice-worker-bundles-([a-f0-9]{40})-([1-9][0-9]*)-([1-9][0-9]*)$/u;
const CANONICAL_OWNER = "alice-owner@rndrntwrk.com";

function invalid(code) {
  throw new Error(code);
}

function plainObject(value) {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value),
  );
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!plainObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function bytes(value, code) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) invalid(code);
  const result = Buffer.from(value);
  if (result.byteLength < 2 || result.byteLength > 2 * 1024 * 1024) {
    invalid(code);
  }
  return result;
}

function jsonBytes(value, code) {
  const input = bytes(value, code);
  try {
    return { input, value: JSON.parse(input.toString("utf8")) };
  } catch {
    return invalid(code);
  }
}

function envelope(value, code) {
  if (
    !plainObject(value) ||
    value.success !== true ||
    !Object.hasOwn(value, "result") ||
    (Object.hasOwn(value, "errors") &&
      (!Array.isArray(value.errors) || value.errors.length !== 0)) ||
    (Object.hasOwn(value, "messages") && !Array.isArray(value.messages))
  ) {
    invalid(code);
  }
  return value.result;
}

function rfc3339OrNull(value, code) {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    invalid(code);
  }
  return value;
}

function normalizedPermissionGroups(catalog, policies) {
  if (!Array.isArray(catalog) || !Array.isArray(policies)) {
    invalid("ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID");
  }
  const byId = new Map();
  for (const group of catalog) {
    if (
      !plainObject(group) ||
      typeof group.id !== "string" ||
      group.id.length < 8 ||
      typeof group.name !== "string" ||
      !Array.isArray(group.scopes) ||
      group.scopes.some((scope) => typeof scope !== "string") ||
      byId.has(group.id)
    ) {
      invalid("ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID");
    }
    byId.set(group.id, {
      name: group.name,
      scopes: [...group.scopes].sort(),
    });
  }

  const referenced = new Set();
  for (const policy of policies) {
    if (!plainObject(policy) || !Array.isArray(policy.permission_groups)) {
      invalid("ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID");
    }
    for (const group of policy.permission_groups) {
      if (!plainObject(group) || !byId.has(group.id)) {
        invalid("ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID");
      }
      referenced.add(group.id);
    }
  }

  const normalized = [...referenced]
    .map((id) => byId.get(id))
    .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  if (
    normalized.length < 1 ||
    normalized.some(({ name }) => /(?:write|edit)$/iu.test(name.trim()))
  ) {
    invalid("ALICE_REPLAY_PROVIDER_PERMISSION_INVALID");
  }
  return normalized;
}

function normalizeCloudflareCredential(value) {
  if (!plainObject(value)) {
    invalid("ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID");
  }
  const permissionCatalog = envelope(
    value.permissionGroups,
    "ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID",
  );
  const token = envelope(
    value.token,
    "ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID",
  );
  const verify = envelope(
    value.verify,
    "ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID",
  );
  if (
    !plainObject(token) ||
    !plainObject(verify) ||
    typeof token.id !== "string" ||
    token.id.length < 8 ||
    verify.id !== token.id ||
    token.status !== "active" ||
    verify.status !== "active" ||
    !Array.isArray(token.policies)
  ) {
    invalid("ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID");
  }
  return {
    tokenIdSha256: sha256(token.id),
    status: "active",
    notBefore: rfc3339OrNull(
      token.not_before,
      "ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID",
    ),
    expiresOn: rfc3339OrNull(
      token.expires_on,
      "ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID",
    ),
    permissionGroups: normalizedPermissionGroups(
      permissionCatalog,
      token.policies,
    ),
  };
}

function normalizeCloudflareMaterializer(value) {
  if (
    !plainObject(value) ||
    value.schemaVersion !== "alice.cloudflare-provider-readback.v1" ||
    typeof value.accountId !== "string" ||
    typeof value.zoneId !== "string" ||
    !plainObject(value.provider)
  ) {
    invalid("ALICE_REPLAY_CLOUDFLARE_SNAPSHOT_INVALID");
  }
  return {
    schemaVersion: value.schemaVersion,
    accountId: value.accountId,
    zoneId: value.zoneId,
    provider: canonical(value.provider),
    ...(value.replayFullProvider === undefined
      ? {}
      : { fullProvider: canonical(value.replayFullProvider) }),
  };
}

function normalizeModal(value) {
  if (
    !plainObject(value) ||
    typeof value.appId !== "string" ||
    value.appId.length < 8 ||
    (value.appName !== undefined && value.appName !== "alice-runtime") ||
    value.environment !== "main" ||
    !Number.isSafeInteger(value.providerVersion) ||
    value.providerVersion < 1 ||
    !Array.isArray(value.providerHistory) ||
    !plainObject(value.function) ||
    !Array.isArray(value.mountedSecretObjects) ||
    !Array.isArray(value.mountedVolumeIds) ||
    !Array.isArray(value.imageObjectIds) ||
    !plainObject(value.autoscalerEnforcement)
  ) {
    invalid("ALICE_REPLAY_MODAL_SNAPSHOT_INVALID");
  }
  const sanitized = { ...structuredClone(value), appName: "alice-runtime" };
  delete sanitized.observedAt;
  return canonical(sanitized);
}

function evidenceMetric(value) {
  const serialized = Buffer.from(`${canonicalJson(value)}\n`, "utf8");
  return { bytes: serialized.byteLength, sha256: sha256(serialized) };
}

export function canonicalOwnerHash(email) {
  if (email !== CANONICAL_OWNER) invalid("ALICE_REPLAY_OWNER_INVALID");
  return crypto.createHash("sha256").update(email, "utf8").digest("base64url");
}

export function buildProviderSnapshot({
  cloudflareMaterializerBytes,
  cloudflareCredentialBytes,
  modalBytes,
}) {
  const materializer = jsonBytes(
    cloudflareMaterializerBytes,
    "ALICE_REPLAY_CLOUDFLARE_SNAPSHOT_INVALID",
  );
  const credential = jsonBytes(
    cloudflareCredentialBytes,
    "ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID",
  );
  const modal = jsonBytes(modalBytes, "ALICE_REPLAY_MODAL_SNAPSHOT_INVALID");
  const permissionCatalog = envelope(
    credential.value?.permissionGroups,
    "ALICE_REPLAY_PROVIDER_CREDENTIAL_INVALID",
  );
  const normalizedCredential = normalizeCloudflareCredential(credential.value);
  return {
    schemaVersion: "alice.provider-replay-snapshot.v1",
    cloudflare: {
      ...normalizeCloudflareMaterializer(materializer.value),
      credential: normalizedCredential,
    },
    modal: normalizeModal(modal.value),
    rawEvidence: {
      cloudflareMaterializer: evidenceMetric(materializer.value),
      cloudflarePermissionCatalog: evidenceMetric(permissionCatalog),
      cloudflareCredential: evidenceMetric({
        ...normalizedCredential,
        tokenIdSha256: normalizedCredential.tokenIdSha256,
      }),
      modal: evidenceMetric(modal.value),
    },
  };
}

function providerState(snapshot) {
  if (snapshot?.schemaVersion !== "alice.provider-replay-snapshot.v1") {
    invalid("ALICE_REPLAY_PROVIDER_STATE_INVALID");
  }
  return {
    cloudflare: snapshot.cloudflare,
    modal: snapshot.modal,
  };
}

export function compareProviderSnapshots(before, after) {
  const beforeState = canonicalJson(providerState(before));
  const afterState = canonicalJson(providerState(after));
  if (beforeState !== afterState) {
    invalid("ALICE_REPLAY_PROVIDER_STATE_CHANGED");
  }
  return { identical: true, stateSha256: sha256(beforeState) };
}

function positiveInteger(value, code) {
  if (!/^[1-9][0-9]*$/u.test(String(value ?? ""))) invalid(code);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) invalid(code);
  return parsed;
}

function readJson(filePath, code) {
  if (typeof filePath !== "string" || filePath.length === 0) invalid(code);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return invalid(code);
  }
}

export function assertReplayAdmission({
  sourceSha,
  buildRunId,
  workerArtifactName,
  workerArtifactDigest,
  runtimeImage,
  runtimeBuildManifestSha256,
  releaseEpoch,
  modalRevision,
  policyHash,
  ownerHash,
  manifestPath,
  programAdmissionPath,
  workerArtifactPath,
  wranglerConfigPaths = [],
}) {
  const artifactMatch = ARTIFACT_NAME.exec(workerArtifactName ?? "");
  const parsedBuildRunId = positiveInteger(
    buildRunId,
    "ALICE_REPLAY_ADMISSION_INVALID",
  );
  const parsedReleaseEpoch = positiveInteger(
    releaseEpoch,
    "ALICE_REPLAY_ADMISSION_INVALID",
  );
  const parsedModalRevision = positiveInteger(
    modalRevision,
    "ALICE_REPLAY_ADMISSION_INVALID",
  );
  if (
    !COMMIT.test(sourceSha ?? "") ||
    !artifactMatch ||
    artifactMatch[1] !== sourceSha ||
    Number(artifactMatch[2]) !== parsedBuildRunId ||
    !DIGEST.test(workerArtifactDigest ?? "") ||
    !RUNTIME_IMAGE.test(runtimeImage ?? "") ||
    !DIGEST.test(runtimeBuildManifestSha256 ?? "") ||
    !DIGEST.test(policyHash ?? "") ||
    !OWNER_HASH.test(ownerHash ?? "") ||
    ownerHash !== canonicalOwnerHash(CANONICAL_OWNER)
  ) {
    invalid("ALICE_REPLAY_ADMISSION_INVALID");
  }

  const manifest = readJson(manifestPath, "ALICE_REPLAY_ADMISSION_INVALID");
  const admission = readJson(
    programAdmissionPath,
    "ALICE_REPLAY_ADMISSION_INVALID",
  );
  const artifact = readJson(
    workerArtifactPath,
    "ALICE_REPLAY_ADMISSION_INVALID",
  );
  if (
    manifest?.source?.sourceCommit !== sourceSha ||
    manifest?.source?.deploymentControllerCommit !== sourceSha ||
    manifest?.source?.runtimeImage !== runtimeImage ||
    manifest?.source?.runtimeBuildManifestSha256 !==
      runtimeBuildManifestSha256 ||
    manifest?.release?.releaseEpoch !== parsedReleaseEpoch ||
    manifest?.release?.modalRevision !== parsedModalRevision ||
    manifest?.release?.policyHash !== policyHash ||
    admission?.sourceCommit !== sourceSha ||
    admission?.releaseEpoch !== parsedReleaseEpoch ||
    admission?.modalRevision !== parsedModalRevision ||
    admission?.policyHash !== policyHash ||
    admission?.runtimeImage !== runtimeImage ||
    admission?.runtimeBuildManifestSha256 !== runtimeBuildManifestSha256 ||
    artifact?.sourceCommit !== sourceSha
  ) {
    invalid("ALICE_REPLAY_ADMISSION_INVALID");
  }
  for (const configPath of wranglerConfigPaths) {
    const config = readJson(configPath, "ALICE_REPLAY_ADMISSION_INVALID");
    if (config?.vars?.ALICE_OWNER_EMAIL_SHA256 !== ownerHash) {
      invalid("ALICE_REPLAY_ADMISSION_INVALID");
    }
  }
  return {
    ok: true,
    sourceSha,
    buildRunId: parsedBuildRunId,
    workerArtifactDigest,
    runtimeImage,
    runtimeBuildManifestSha256,
  };
}

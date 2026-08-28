import {
  canonicalJson,
  digestReleaseIdentity,
  verifyProgramEnvelope,
  type ProgramEnvelope,
} from "./program";
import type { ReleaseBinding } from "./policy";
import {
  buildAliceControlEffectiveConfig,
  verifyAliceDeploymentManifestBinding,
  verifyAliceEffectiveConfigBinding,
} from "../../alice-effective-config.js";

export type AliceOwnerAccessConfigSource = {
  ALICE_ACCESS_ISSUER: string;
  ALICE_ACCESS_AUDIENCE: string;
  ALICE_OWNER_EMAIL_SHA256: string;
};

export type AliceAuthoritySafetyConfigSource = {
  ALICE_MODEL_DAILY_BUDGET_UNITS: string;
  ALICE_CONTROL_RECOVERY_TOKEN: string;
};

export type AliceInternalServiceConfigSource = {
  ALICE_ACCESS_GATEWAY_SERVICE_TOKEN: string;
  ALICE_AI_GATEWAY_SERVICE_TOKEN: string;
};

export type AliceDeploymentPauseConfigSource = AliceInternalServiceConfigSource & {
  ALICE_CONTROL_RECOVERY_TOKEN: string;
  ALICE_DEPLOYMENT_PAUSE_TOKEN: string;
};

export type AliceDeploymentControllerAccessConfigSource = {
  ALICE_ACCESS_ISSUER: string;
  ALICE_RELEASE_ACCESS_AUDIENCE: string;
  ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256: string;
};

export type AliceRuntimeConfigSource = AliceOwnerAccessConfigSource &
  AliceAuthoritySafetyConfigSource &
  AliceInternalServiceConfigSource &
  AliceDeploymentPauseConfigSource &
  AliceDeploymentControllerAccessConfigSource & {
  ALICE_PROGRAM_ENVELOPE_B64: string;
  ALICE_PROGRAM_SIGNATURE_B64: string;
  ALICE_PROGRAM_PUBLIC_JWK_B64: string;
  ALICE_MODAL_REVISION: string;
  ALICE_DEPLOYMENT_MANIFEST_SHA256: string;
  ALICE_DEPLOYMENT_MANIFEST_B64: string;
};

export type AliceOwnerAccessConfig = {
  accessIssuer: string;
  accessAudience: string;
  ownerEmailSha256: string;
};

export type AliceAuthoritySafetyConfig = {
  modelDailyBudgetUnits: number;
  recoveryToken: string;
};

export type AliceDeploymentControllerAccessConfig = {
  accessIssuer: string;
  accessAudience: string;
  serviceClientIdSha256: string;
};

export type AliceRuntimeConfig = AliceOwnerAccessConfig &
  AliceAuthoritySafetyConfig & {
  envelope: ProgramEnvelope;
  binding: ReleaseBinding;
    modalRevision: number;
    deploymentManifestSha256: string;
    capabilityBomSha256: string;
};

export type AliceTrustPins = {
  programPublicJwkSha256: string;
  policyHash: string;
};

export const ALICE_PRODUCTION_TRUST_PINS: AliceTrustPins = Object.freeze({
  programPublicJwkSha256:
    "sha256:b2aa16b88a789d0110f8e02521b15fd72b1d0df8873ffdfc1c7029c213825f5e",
  policyHash: "sha256:d91ec341a4955e0a8189c81ebe525dc3cf28f78f5da919685e66179e8adaab5a",
});

const PINNED_MAX_DAILY_BUDGET_UNITS = 10_000;

function decodeBase64UrlJson<T>(value: string): T | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    ) as T;
  } catch {
    return null;
  }
}

function validIssuer(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "" &&
      url.hostname.endsWith(".cloudflareaccess.com")
    );
  } catch {
    return false;
  }
}

async function sha256Canonical(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  const hex = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

export function loadOwnerAccessConfig(
  env: AliceOwnerAccessConfigSource,
): AliceOwnerAccessConfig {
  if (
    !validIssuer(env.ALICE_ACCESS_ISSUER) ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(env.ALICE_ACCESS_AUDIENCE) ||
    !/^[A-Za-z0-9_-]{43}$/.test(env.ALICE_OWNER_EMAIL_SHA256)
  ) {
    throw new Error("ALICE_OWNER_ACCESS_CONFIG_INVALID");
  }
  return {
    accessIssuer: env.ALICE_ACCESS_ISSUER,
    accessAudience: env.ALICE_ACCESS_AUDIENCE,
    ownerEmailSha256: env.ALICE_OWNER_EMAIL_SHA256,
  };
}

export function loadAuthoritySafetyConfig(
  env: AliceAuthoritySafetyConfigSource,
): AliceAuthoritySafetyConfig {
  const modelDailyBudgetUnits = Number(env.ALICE_MODEL_DAILY_BUDGET_UNITS);
  if (
    !Number.isInteger(modelDailyBudgetUnits) ||
    modelDailyBudgetUnits <= 0 ||
    modelDailyBudgetUnits > PINNED_MAX_DAILY_BUDGET_UNITS ||
    typeof env.ALICE_CONTROL_RECOVERY_TOKEN !== "string" ||
    env.ALICE_CONTROL_RECOVERY_TOKEN.length < 32
  ) {
    throw new Error("ALICE_AUTHORITY_SAFETY_CONFIG_INVALID");
  }
  return {
    modelDailyBudgetUnits,
    recoveryToken: env.ALICE_CONTROL_RECOVERY_TOKEN,
  };
}

export function loadDeploymentControllerAccessConfig(
  env: AliceDeploymentControllerAccessConfigSource,
): AliceDeploymentControllerAccessConfig {
  if (
    !validIssuer(env.ALICE_ACCESS_ISSUER) ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(env.ALICE_RELEASE_ACCESS_AUDIENCE) ||
    !/^[A-Za-z0-9_-]{43}$/.test(
      env.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
    )
  ) {
    throw new Error("ALICE_DEPLOYMENT_CONTROLLER_ACCESS_CONFIG_INVALID");
  }
  return {
    accessIssuer: env.ALICE_ACCESS_ISSUER,
    accessAudience: env.ALICE_RELEASE_ACCESS_AUDIENCE,
    serviceClientIdSha256: env.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
  };
}

export async function loadRuntimeConfig(
  env: AliceRuntimeConfigSource,
  now = Date.now(),
  trustPins: AliceTrustPins = ALICE_PRODUCTION_TRUST_PINS,
): Promise<AliceRuntimeConfig> {
  const ownerAccess = loadOwnerAccessConfig(env);
  const authoritySafety = loadAuthoritySafetyConfig(env);
  const deploymentControllerAccess =
    loadDeploymentControllerAccessConfig(env);
  const modalRevision = Number(env.ALICE_MODAL_REVISION);
  if (
    !Number.isInteger(modalRevision) ||
    modalRevision < 49 ||
    !/^sha256:[a-f0-9]{64}$/.test(env.ALICE_DEPLOYMENT_MANIFEST_SHA256)
  ) {
    throw new Error("ALICE_RUNTIME_CONFIG_INVALID");
  }

  const envelope = decodeBase64UrlJson<ProgramEnvelope>(env.ALICE_PROGRAM_ENVELOPE_B64);
  const publicJwk = decodeBase64UrlJson<JsonWebKey>(env.ALICE_PROGRAM_PUBLIC_JWK_B64);
  if (
    !envelope ||
    !publicJwk ||
    publicJwk.kty !== "RSA" ||
    typeof publicJwk.n !== "string" ||
    typeof publicJwk.e !== "string" ||
    "d" in publicJwk
  ) {
    throw new Error("ALICE_RUNTIME_CONFIG_INVALID");
  }

  if (
    !/^sha256:[a-f0-9]{64}$/.test(trustPins.programPublicJwkSha256) ||
    !/^sha256:[a-f0-9]{64}$/.test(trustPins.policyHash) ||
    (await sha256Canonical(publicJwk)) !== trustPins.programPublicJwkSha256
  ) {
    throw new Error("ALICE_PROGRAM_TRUST_PIN_MISMATCH");
  }
  if (envelope.release.policyHash !== trustPins.policyHash) {
    throw new Error("ALICE_POLICY_TRUST_PIN_MISMATCH");
  }
  if (
    modalRevision !== envelope.release.modalRevision ||
    env.ALICE_DEPLOYMENT_MANIFEST_SHA256 !== envelope.release.deploymentManifestSha256
  ) {
    throw new Error("ALICE_RUNTIME_CONFIG_INVALID");
  }

  const verified = await verifyProgramEnvelope(
    envelope,
    env.ALICE_PROGRAM_SIGNATURE_B64,
    publicJwk,
  );
  if (!verified.ok) throw new Error(verified.code);

  const issuedAt = Date.parse(envelope.issuedAt);
  const expiresAt = Date.parse(envelope.expiresAt);
  if (issuedAt > now + 300_000 || expiresAt <= now) {
    throw new Error("ALICE_PROGRAM_NOT_CURRENT");
  }

  const manifest = await verifyAliceDeploymentManifestBinding({
    encodedManifest: env.ALICE_DEPLOYMENT_MANIFEST_B64,
    expectedManifestSha256: env.ALICE_DEPLOYMENT_MANIFEST_SHA256,
  });
  const manifestRelease = manifest.release as Record<string, unknown>;
  const manifestSource = manifest.source as Record<string, unknown>;
  if (!/^sha256:[a-f0-9]{64}$/.test(String(manifestSource.capabilityBomSha256 ?? ""))) {
    throw new Error("ALICE_RELEASE_MANIFEST_MISMATCH");
  }
  const programReleaseIdentity = {
    releaseEpoch: envelope.release.releaseEpoch,
    modalRevision: envelope.release.modalRevision,
    policyHash: envelope.release.policyHash,
    rollbackBoundary: envelope.release.rollbackBoundary,
    sourceCommit: envelope.release.sourceCommit,
    deploymentControllerCommit:
      envelope.release.deploymentControllerCommit,
    elizaCommit: envelope.release.elizaCommit,
    runtimeImage: envelope.release.runtimeImage,
    runtimeBuildManifestSha256:
      envelope.release.runtimeBuildManifestSha256,
  };
  const manifestReleaseIdentity = {
    releaseEpoch: manifestRelease.releaseEpoch,
    modalRevision: manifestRelease.modalRevision,
    policyHash: manifestRelease.policyHash,
    rollbackBoundary: manifestRelease.rollbackBoundary,
    sourceCommit: manifestSource.sourceCommit,
    deploymentControllerCommit:
      manifestSource.deploymentControllerCommit,
    elizaCommit: manifestSource.elizaCommit,
    runtimeImage: manifestSource.runtimeImage,
    runtimeBuildManifestSha256:
      manifestSource.runtimeBuildManifestSha256,
  };
  if (
    canonicalJson(programReleaseIdentity) !==
      canonicalJson(manifestReleaseIdentity)
  ) {
    throw new Error("ALICE_RELEASE_MANIFEST_MISMATCH");
  }

  await verifyAliceEffectiveConfigBinding({
    encodedManifest: env.ALICE_DEPLOYMENT_MANIFEST_B64,
    expectedManifestSha256: env.ALICE_DEPLOYMENT_MANIFEST_SHA256,
    role: "control",
    effectiveConfig: buildAliceControlEffectiveConfig({
      accessIssuer: ownerAccess.accessIssuer,
      accessAudience: ownerAccess.accessAudience,
      ownerEmailSha256: ownerAccess.ownerEmailSha256,
      modelDailyBudgetUnits: authoritySafety.modelDailyBudgetUnits,
      modalRevision,
      releaseAccessAudience:
        deploymentControllerAccess.accessAudience,
      releaseServiceTokenIdSha256:
        deploymentControllerAccess.serviceClientIdSha256,
    }),
  });

  return {
    ...ownerAccess,
    ...authoritySafety,
    envelope,
    binding: {
      programDigest: verified.programDigest,
      releaseDigest: await digestReleaseIdentity(envelope),
      policyHash: envelope.release.policyHash,
    },
    modalRevision,
    deploymentManifestSha256: envelope.release.deploymentManifestSha256,
    capabilityBomSha256: String(manifestSource.capabilityBomSha256),
  };
}

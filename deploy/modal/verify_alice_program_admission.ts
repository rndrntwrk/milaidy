import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  ALICE_PRODUCTION_TRUST_PINS,
  loadRuntimeConfig,
  type AliceRuntimeConfigSource,
  type AliceTrustPins,
} from "../../workers/alice-production-control/src/runtime-config";
import { canonicalAliceJson } from "../../workers/alice-effective-config.js";
import { deriveAliceRuntimeReleaseCredential } from "./alice_modal_release.mjs";

const DIGEST = /^sha256:[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;

type RouteSecretSource = {
  ALICE_ACCESS_CONTROL_SERVICE_TOKEN: string;
  ALICE_ACCESS_GATEWAY_SERVICE_TOKEN: string;
  ALICE_AI_CONTROL_SERVICE_TOKEN: string;
  ALICE_AI_GATEWAY_SERVICE_TOKEN: string;
  ALICE_ACCESS_PROXY_SECRET: string;
  MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET: string;
  ALICE_MODAL_PROXY_KEY: string;
  ALICE_MODAL_PROXY_SECRET: string;
  ALICE_RUNTIME_RELEASE_TOKEN: string;
  ALICE_RUNTIME_RELEASE_TOKEN_SHA256: string;
  OPENAI_API_KEY: string;
  ALICE_DEPLOYMENT_PAUSE_TOKEN: string;
  ALICE_EVIDENCE_QUEUE_HMAC_KEY: string;
  MILADY_API_TOKEN: string;
  ELIZA_VAULT_PASSPHRASE: string;
};

type ProtectedAdmissionSecretSource = Omit<
  RouteSecretSource,
  | "ALICE_RUNTIME_RELEASE_TOKEN"
  | "ALICE_RUNTIME_RELEASE_TOKEN_SHA256"
  | "OPENAI_API_KEY"
> & {
  ALICE_RUNTIME_RELEASE_TOKEN_ROOT: string;
};

type MaterializedConfigs = {
  access: Record<string, any>;
  control: Record<string, any>;
  aiGateway: Record<string, any>;
};

function invalid(code = "ALICE_PROGRAM_ADMISSION_INVALID"): never {
  throw new Error(code);
}

function secureValue(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 4096 &&
    !/[\0\r\n]/.test(value)
  );
}

function sha256Text(value: string): string {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function exactRequiredSecrets(config: Record<string, any>, expected: string[]): boolean {
  const actual = config?.secrets?.required;
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

export function verifyAliceProtectedAdmissionSecretClosure(
  secrets: ProtectedAdmissionSecretSource,
): void {
  const root = secrets?.ALICE_RUNTIME_RELEASE_TOKEN_ROOT;
  const deploymentVisibleDomains = [
    secrets?.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
    secrets?.ALICE_AI_GATEWAY_SERVICE_TOKEN,
    secrets?.ALICE_ACCESS_PROXY_SECRET,
    secrets?.ALICE_MODAL_PROXY_KEY,
    secrets?.ALICE_MODAL_PROXY_SECRET,
    secrets?.ALICE_DEPLOYMENT_PAUSE_TOKEN,
    secrets?.MILADY_API_TOKEN,
    secrets?.ELIZA_VAULT_PASSPHRASE,
  ];
  if (
    typeof root !== "string" ||
    !/^[A-Za-z0-9_-]{32,256}$/.test(root) ||
    deploymentVisibleDomains.some((value) => value === root)
  ) {
    invalid("ALICE_RELEASE_SECRETS_INVALID");
  }
}

export function verifyAliceRouteSecretClosure(
  configs: MaterializedConfigs,
  secrets: RouteSecretSource,
  releaseDigest: string,
): void {
  const distinctSecrets = [
    secrets.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
    secrets.ALICE_AI_GATEWAY_SERVICE_TOKEN,
    secrets.ALICE_ACCESS_PROXY_SECRET,
    secrets.ALICE_MODAL_PROXY_KEY,
    secrets.ALICE_MODAL_PROXY_SECRET,
    secrets.ALICE_RUNTIME_RELEASE_TOKEN,
    secrets.ALICE_DEPLOYMENT_PAUSE_TOKEN,
    secrets.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
    secrets.MILADY_API_TOKEN,
    secrets.ELIZA_VAULT_PASSPHRASE,
  ];
  if (
    !configs ||
    !secrets ||
    !DIGEST.test(releaseDigest) ||
    !exactRequiredSecrets(configs.access, [
      "ALICE_ACCESS_CONTROL_SERVICE_TOKEN",
      "ALICE_ACCESS_PROXY_SECRET",
      "ALICE_MODAL_PROXY_KEY",
      "ALICE_MODAL_PROXY_SECRET",
    ]) ||
    !exactRequiredSecrets(configs.control, [
      "ALICE_ACCESS_GATEWAY_SERVICE_TOKEN",
      "ALICE_AI_GATEWAY_SERVICE_TOKEN",
      "ALICE_CONTROL_RECOVERY_TOKEN",
      "ALICE_DEPLOYMENT_PAUSE_TOKEN",
      "ALICE_EVIDENCE_QUEUE_HMAC_KEY",
    ]) ||
    !exactRequiredSecrets(configs.aiGateway, [
      "ALICE_AI_CONTROL_SERVICE_TOKEN",
      "ALICE_RUNTIME_RELEASE_TOKEN_SHA256",
    ]) ||
    !secureValue(secrets.ALICE_ACCESS_CONTROL_SERVICE_TOKEN) ||
    !secureValue(secrets.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN) ||
    !secureValue(secrets.ALICE_AI_CONTROL_SERVICE_TOKEN) ||
    !secureValue(secrets.ALICE_AI_GATEWAY_SERVICE_TOKEN) ||
    !secureValue(secrets.ALICE_ACCESS_PROXY_SECRET) ||
    !secureValue(secrets.MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET) ||
    !/^wk-[A-Za-z0-9_-]{16,256}$/.test(secrets.ALICE_MODAL_PROXY_KEY) ||
    !/^ws-[A-Za-z0-9_-]{16,256}$/.test(secrets.ALICE_MODAL_PROXY_SECRET) ||
    !secureValue(secrets.ALICE_RUNTIME_RELEASE_TOKEN) ||
    !secureValue(secrets.OPENAI_API_KEY) ||
    !secureValue(secrets.ALICE_DEPLOYMENT_PAUSE_TOKEN) ||
    !/^aeq1_[A-Za-z0-9_-]{43}$/.test(secrets.ALICE_EVIDENCE_QUEUE_HMAC_KEY) ||
    !secureValue(secrets.MILADY_API_TOKEN) ||
    !secureValue(secrets.ELIZA_VAULT_PASSPHRASE) ||
    !DIGEST.test(secrets.ALICE_RUNTIME_RELEASE_TOKEN_SHA256) ||
    secrets.ALICE_ACCESS_CONTROL_SERVICE_TOKEN !==
      secrets.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN ||
    secrets.ALICE_AI_CONTROL_SERVICE_TOKEN !==
      secrets.ALICE_AI_GATEWAY_SERVICE_TOKEN ||
    secrets.MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET !==
      secrets.ALICE_ACCESS_PROXY_SECRET ||
    secrets.OPENAI_API_KEY !== secrets.ALICE_RUNTIME_RELEASE_TOKEN ||
    secrets.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN ===
      secrets.ALICE_AI_GATEWAY_SERVICE_TOKEN ||
    new Set(distinctSecrets).size !== distinctSecrets.length ||
    sha256Text(
      `${releaseDigest}:${secrets.ALICE_RUNTIME_RELEASE_TOKEN}`,
    ) !== secrets.ALICE_RUNTIME_RELEASE_TOKEN_SHA256
  ) {
    invalid("ALICE_RELEASE_SECRETS_INVALID");
  }
}

export async function verifyAliceProgramAdmission({
  configs,
  secrets,
  now = Date.now(),
  trustPins = ALICE_PRODUCTION_TRUST_PINS,
}: {
  configs: MaterializedConfigs;
  secrets: ProtectedAdmissionSecretSource;
  now?: number;
  trustPins?: AliceTrustPins;
}) {
  if (!Number.isFinite(now)) invalid();
  verifyAliceProtectedAdmissionSecretClosure(secrets);
  const controlVars = configs?.control?.vars;
  if (!controlVars || typeof controlVars !== "object") invalid();
  const config = await loadRuntimeConfig(
    {
      ...controlVars,
      ALICE_CONTROL_RECOVERY_TOKEN:
        "preprovisioned-recovery-secret-not-readable-by-release",
      ALICE_DEPLOYMENT_PAUSE_TOKEN: secrets.ALICE_DEPLOYMENT_PAUSE_TOKEN,
      ALICE_ACCESS_GATEWAY_SERVICE_TOKEN:
        secrets.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
      ALICE_AI_GATEWAY_SERVICE_TOKEN:
        secrets.ALICE_AI_GATEWAY_SERVICE_TOKEN,
    } as AliceRuntimeConfigSource,
    now,
    trustPins,
  );
  const credential = deriveAliceRuntimeReleaseCredential({
    rootSecret: secrets.ALICE_RUNTIME_RELEASE_TOKEN_ROOT,
    releaseDigest: config.binding.releaseDigest,
  });
  verifyAliceRouteSecretClosure(
    configs,
    {
      ...secrets,
      ALICE_RUNTIME_RELEASE_TOKEN: credential.token,
      ALICE_RUNTIME_RELEASE_TOKEN_SHA256: credential.saltedSha256,
      ALICE_EVIDENCE_QUEUE_HMAC_KEY: credential.evidenceQueueHmacKey,
      OPENAI_API_KEY: credential.token,
    },
    config.binding.releaseDigest,
  );
  const release = config.envelope.release;
  const evidence = {
    schemaVersion: "alice.program-admission.v1",
    admittedAt: new Date(now).toISOString(),
    sourceCommit: release.sourceCommit,
    deploymentControllerCommit: release.deploymentControllerCommit,
    elizaCommit: release.elizaCommit,
    runtimeImage: release.runtimeImage,
    runtimeBuildManifestSha256: release.runtimeBuildManifestSha256,
    deploymentManifestSha256: config.deploymentManifestSha256,
    programPublicJwkSha256: trustPins.programPublicJwkSha256,
    programDigest: config.binding.programDigest,
    releaseDigest: config.binding.releaseDigest,
    policyHash: config.binding.policyHash,
    releaseEpoch: release.releaseEpoch,
    modalRevision: config.modalRevision,
    rollbackBoundary: release.rollbackBoundary,
    serviceTokenPairsVerified: true,
    runtimeReleaseTokenBindingVerified: true,
    accessProxySecretFormatVerified: true,
    modalProxyTokenPairVerified: true,
    modalRuntimeSecretMappingsVerified: true,
    recoveryKeyUnavailableToDeployment: true,
  };
  return { credential, evidence };
}

function readConfig(directory: string, role: keyof MaterializedConfigs) {
  const filePath = path.join(directory, `${role}.wrangler.json`);
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) invalid();
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  const configDir = process.env.ALICE_WRANGLER_OUTPUT_DIR;
  const outputPath = process.env.ALICE_PROGRAM_ADMISSION_EVIDENCE_PATH;
  const runtimeTokenPath = process.env.ALICE_RUNTIME_RELEASE_TOKEN_FILE;
  const runtimeTokenSha256Path =
    process.env.ALICE_RUNTIME_RELEASE_TOKEN_SHA256_FILE;
  const evidenceQueueHmacKeyPath =
    process.env.ALICE_EVIDENCE_QUEUE_HMAC_KEY_FILE;
  if (
    !configDir ||
    !path.isAbsolute(configDir) ||
    !outputPath ||
    !path.isAbsolute(outputPath) ||
    path.dirname(outputPath) === outputPath ||
    !runtimeTokenPath ||
    !path.isAbsolute(runtimeTokenPath) ||
    !runtimeTokenSha256Path ||
    !path.isAbsolute(runtimeTokenSha256Path) ||
    !evidenceQueueHmacKeyPath ||
    !path.isAbsolute(evidenceQueueHmacKeyPath) ||
    new Set([
      outputPath,
      runtimeTokenPath,
      runtimeTokenSha256Path,
      evidenceQueueHmacKeyPath,
    ]).size !== 4
  ) {
    invalid();
  }
  const configs = {
    access: readConfig(configDir, "access"),
    control: readConfig(configDir, "control"),
    aiGateway: readConfig(configDir, "aiGateway"),
  };
  const { credential, evidence } = await verifyAliceProgramAdmission({
    configs,
    secrets: process.env as any,
  });
  fs.writeFileSync(outputPath, `${canonicalAliceJson(evidence)}\n`, {
    encoding: "utf8",
    mode: 0o444,
    flag: "wx",
  });
  fs.writeFileSync(runtimeTokenPath, credential.token, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  fs.writeFileSync(runtimeTokenSha256Path, credential.saltedSha256, {
    encoding: "utf8",
    mode: 0o444,
    flag: "wx",
  });
  fs.writeFileSync(evidenceQueueHmacKeyPath, credential.evidenceQueueHmacKey, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      programDigest: evidence.programDigest,
      releaseDigest: evidence.releaseDigest,
      deploymentManifestSha256: evidence.deploymentManifestSha256,
    })}\n`,
  );
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

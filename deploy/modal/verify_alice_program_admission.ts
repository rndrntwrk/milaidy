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
  ALICE_STATE_PLANE_SERVICE_TOKEN?: string;
  ALICE_EVIDENCE_QUEUE_HMAC_KEY: string;
  MILADY_API_TOKEN: string;
  ELIZA_VAULT_PASSPHRASE: string;
  ALICE_SOURCE_COMMIT?: string;
  ALICE_DEPLOYMENT_CONTROLLER_COMMIT?: string;
  ALICE_ELIZA_COMMIT?: string;
  ALICE_POLICY_HASH?: string;
  ALICE_PROGRAM_DIGEST?: string;
  ALICE_RELEASE_DIGEST?: string;
  ALICE_RUNTIME_API_TOKEN?: string;
  ALICE_CAPABILITY_BOM_SHA256?: string;
  ALICE_RUNTIME_BUILD_MANIFEST_SHA256?: string;
  ALICE_RUNTIME_IMAGE?: string;
  ALICE_RUNTIME_REVISION?: string;
  ALICE_RUNTIME_VAULT_PASSPHRASE?: string;
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
  runtimeHost?: Record<string, any>;
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
    secrets?.ALICE_STATE_PLANE_SERVICE_TOKEN,
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
  containerMode: boolean,
): void {
  const containerAccessSecrets = [
    "ALICE_ACCESS_CONTROL_SERVICE_TOKEN",
    "ALICE_ACCESS_PROXY_SECRET",
  ];
  const containerRuntimeHostSecrets = [
    "ALICE_ACCESS_PROXY_SECRET",
    "ALICE_RUNTIME_API_TOKEN",
    "ALICE_RUNTIME_RELEASE_TOKEN",
    "ALICE_RUNTIME_VAULT_PASSPHRASE",
    "ALICE_STATE_PLANE_SERVICE_TOKEN",
    "ALICE_PROGRAM_DIGEST",
    "ALICE_RELEASE_DIGEST",
    "ALICE_POLICY_HASH",
    "ALICE_CAPABILITY_BOM_SHA256",
    "ALICE_SOURCE_COMMIT",
    "ALICE_DEPLOYMENT_CONTROLLER_COMMIT",
    "ALICE_RUNTIME_IMAGE",
    "ALICE_RUNTIME_BUILD_MANIFEST_SHA256",
    "ALICE_ELIZA_COMMIT",
    "ALICE_RUNTIME_REVISION",
  ];
  const distinctSecrets = [
    secrets.ALICE_ACCESS_GATEWAY_SERVICE_TOKEN,
    secrets.ALICE_AI_GATEWAY_SERVICE_TOKEN,
    secrets.ALICE_ACCESS_PROXY_SECRET,
    ...(containerMode
      ? []
      : [secrets.ALICE_MODAL_PROXY_KEY, secrets.ALICE_MODAL_PROXY_SECRET]),
    secrets.ALICE_RUNTIME_RELEASE_TOKEN,
    secrets.ALICE_DEPLOYMENT_PAUSE_TOKEN,
    secrets.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
    secrets.MILADY_API_TOKEN,
    secrets.ELIZA_VAULT_PASSPHRASE,
    ...(containerMode ? [secrets.ALICE_STATE_PLANE_SERVICE_TOKEN] : []),
  ];
  if (
    !configs ||
    !secrets ||
    typeof containerMode !== "boolean" ||
    !DIGEST.test(releaseDigest) ||
    !exactRequiredSecrets(
      configs.access,
      containerMode
        ? containerAccessSecrets
        : [
            "ALICE_ACCESS_CONTROL_SERVICE_TOKEN",
            "ALICE_ACCESS_PROXY_SECRET",
            "ALICE_MODAL_PROXY_KEY",
            "ALICE_MODAL_PROXY_SECRET",
          ],
    ) ||
    (containerMode &&
      !exactRequiredSecrets(
        configs.runtimeHost ?? {},
        containerRuntimeHostSecrets,
      )) ||
    !exactRequiredSecrets(configs.control, [
      "ALICE_ACCESS_GATEWAY_SERVICE_TOKEN",
      "ALICE_AI_GATEWAY_SERVICE_TOKEN",
      "ALICE_CONTROL_CONNECTOR_SERVICE_TOKEN",
      "ALICE_CONTROL_RECOVERY_TOKEN",
      "ALICE_DEPLOYMENT_PAUSE_TOKEN",
      "ALICE_EVIDENCE_QUEUE_HMAC_KEY",
      "ALICE_STATE_PLANE_SERVICE_TOKEN",
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
    (!containerMode &&
      !/^wk-[A-Za-z0-9_-]{16,256}$/.test(secrets.ALICE_MODAL_PROXY_KEY)) ||
    (!containerMode &&
      !/^ws-[A-Za-z0-9_-]{16,256}$/.test(secrets.ALICE_MODAL_PROXY_SECRET)) ||
    !secureValue(secrets.ALICE_RUNTIME_RELEASE_TOKEN) ||
    !secureValue(secrets.OPENAI_API_KEY) ||
    !secureValue(secrets.ALICE_DEPLOYMENT_PAUSE_TOKEN) ||
    !/^aeq1_[A-Za-z0-9_-]{43}$/.test(secrets.ALICE_EVIDENCE_QUEUE_HMAC_KEY) ||
    !secureValue(secrets.MILADY_API_TOKEN) ||
    !secureValue(secrets.ELIZA_VAULT_PASSPHRASE) ||
    (containerMode && !secureValue(secrets.ALICE_STATE_PLANE_SERVICE_TOKEN)) ||
    (containerMode &&
      (!COMMIT.test(secrets.ALICE_SOURCE_COMMIT ?? "") ||
        !COMMIT.test(
          secrets.ALICE_DEPLOYMENT_CONTROLLER_COMMIT ?? "",
        ) ||
        !COMMIT.test(secrets.ALICE_ELIZA_COMMIT ?? "") ||
        !DIGEST.test(secrets.ALICE_POLICY_HASH ?? "") ||
        !DIGEST.test(secrets.ALICE_PROGRAM_DIGEST ?? "") ||
        !DIGEST.test(secrets.ALICE_RELEASE_DIGEST ?? "") ||
        !DIGEST.test(secrets.ALICE_CAPABILITY_BOM_SHA256 ?? "") ||
        !DIGEST.test(
          secrets.ALICE_RUNTIME_BUILD_MANIFEST_SHA256 ?? "",
        ) ||
        !/^registry\.cloudflare\.com\/036df6c823669b8fa2f66cf4c16eeb29\/alice-runtime@sha256:[a-f0-9]{64}$/.test(
          secrets.ALICE_RUNTIME_IMAGE ?? "",
        ) ||
        !/^(?:49|[5-9][0-9]|[1-9][0-9]{2,})$/.test(
          secrets.ALICE_RUNTIME_REVISION ?? "",
        ) ||
        secrets.ALICE_RUNTIME_API_TOKEN !== secrets.MILADY_API_TOKEN ||
        secrets.ALICE_RUNTIME_VAULT_PASSPHRASE !==
          secrets.ELIZA_VAULT_PASSPHRASE)) ||
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
  const containerMode =
    config.envelope.schemaVersion === "alice.program-envelope.v2";
  verifyAliceRouteSecretClosure(
    configs,
    {
      ...secrets,
      ALICE_RUNTIME_RELEASE_TOKEN: credential.token,
      ALICE_RUNTIME_RELEASE_TOKEN_SHA256: credential.saltedSha256,
      ALICE_EVIDENCE_QUEUE_HMAC_KEY: credential.evidenceQueueHmacKey,
      OPENAI_API_KEY: credential.token,
      ALICE_SOURCE_COMMIT: config.envelope.release.sourceCommit,
      ALICE_DEPLOYMENT_CONTROLLER_COMMIT:
        config.envelope.release.deploymentControllerCommit,
      ALICE_ELIZA_COMMIT: config.envelope.release.elizaCommit,
      ALICE_POLICY_HASH: config.binding.policyHash,
      ALICE_PROGRAM_DIGEST: config.binding.programDigest,
      ALICE_RELEASE_DIGEST: config.binding.releaseDigest,
      ALICE_RUNTIME_API_TOKEN: secrets.MILADY_API_TOKEN,
      ALICE_CAPABILITY_BOM_SHA256: config.capabilityBomSha256,
      ALICE_RUNTIME_BUILD_MANIFEST_SHA256:
        config.envelope.release.runtimeBuildManifestSha256,
      ALICE_RUNTIME_IMAGE: config.envelope.release.runtimeImage,
      ALICE_RUNTIME_REVISION: String(config.runtimeRevision),
      ALICE_RUNTIME_VAULT_PASSPHRASE: secrets.ELIZA_VAULT_PASSPHRASE,
    },
    config.binding.releaseDigest,
    containerMode,
  );
  const release = config.envelope.release;
  const evidence = {
    schemaVersion: containerMode
      ? "alice.program-admission.v2"
      : "alice.program-admission.v1",
    admittedAt: new Date(now).toISOString(),
    sourceCommit: release.sourceCommit,
    deploymentControllerCommit: release.deploymentControllerCommit,
    elizaCommit: release.elizaCommit,
    runtimeImage: release.runtimeImage,
    runtimeBuildManifestSha256: release.runtimeBuildManifestSha256,
    capabilityBomSha256: config.capabilityBomSha256,
    deploymentManifestSha256: config.deploymentManifestSha256,
    programPublicJwkSha256: trustPins.programPublicJwkSha256,
    programDigest: config.binding.programDigest,
    releaseDigest: config.binding.releaseDigest,
    policyHash: config.binding.policyHash,
    releaseEpoch: release.releaseEpoch,
    ...(containerMode
      ? { runtimeRevision: config.runtimeRevision }
      : { modalRevision: config.runtimeRevision }),
    rollbackBoundary: release.rollbackBoundary,
    serviceTokenPairsVerified: true,
    runtimeReleaseTokenBindingVerified: true,
    accessProxySecretFormatVerified: true,
    ...(containerMode
      ? { containerRuntimeSecretMappingsVerified: true }
      : {
          modalProxyTokenPairVerified: true,
          modalRuntimeSecretMappingsVerified: true,
        }),
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
    runtimeHost: readConfig(configDir, "runtimeHost"),
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

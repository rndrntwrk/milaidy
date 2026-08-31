import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import {
  verifyAliceProtectedAdmissionSecretClosure,
  verifyAliceRouteSecretClosure,
} from "./verify_alice_program_admission";

const accessToken = "access-service-token-with-at-least-32-bytes";
const aiToken = "ai-service-token-with-at-least-32-bytes----";
const runtimeToken = "runtime-release-token-with-at-least-32-bytes";
const releaseDigest = `sha256:${"1".repeat(64)}`;
const configs = {
  access: {
    secrets: {
      required: [
        "ALICE_ACCESS_PROXY_SECRET",
        "ALICE_ACCESS_CONTROL_SERVICE_TOKEN",
        "ALICE_MODAL_PROXY_KEY",
        "ALICE_MODAL_PROXY_SECRET",
      ],
    },
  },
  control: {
    secrets: {
      required: [
        "ALICE_CONTROL_RECOVERY_TOKEN",
        "ALICE_CONTROL_CONNECTOR_SERVICE_TOKEN",
        "ALICE_DEPLOYMENT_PAUSE_TOKEN",
        "ALICE_EVIDENCE_QUEUE_HMAC_KEY",
        "ALICE_ACCESS_GATEWAY_SERVICE_TOKEN",
        "ALICE_AI_GATEWAY_SERVICE_TOKEN",
        "ALICE_STATE_PLANE_SERVICE_TOKEN",
      ],
    },
  },
  aiGateway: {
    secrets: {
      required: [
        "ALICE_RUNTIME_RELEASE_TOKEN_SHA256",
        "ALICE_AI_CONTROL_SERVICE_TOKEN",
      ],
    },
  },
};
const secrets = {
  ALICE_ACCESS_CONTROL_SERVICE_TOKEN: accessToken,
  ALICE_ACCESS_GATEWAY_SERVICE_TOKEN: accessToken,
  ALICE_AI_CONTROL_SERVICE_TOKEN: aiToken,
  ALICE_AI_GATEWAY_SERVICE_TOKEN: aiToken,
  ALICE_ACCESS_PROXY_SECRET: "access-proxy-secret-with-at-least-32-bytes",
  MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET:
    "access-proxy-secret-with-at-least-32-bytes",
  ALICE_MODAL_PROXY_KEY: "wk-modal-proxy-key-with-at-least-32-bytes",
  ALICE_MODAL_PROXY_SECRET: "ws-modal-proxy-secret-with-at-least-32-bytes",
  ALICE_DEPLOYMENT_PAUSE_TOKEN:
    "deployment-pause-token-with-at-least-32-bytes",
  ALICE_EVIDENCE_QUEUE_HMAC_KEY:
    "aeq1_abcdefghijklmnopqrstuvwxyzABCDEFGH123456789",
  MILADY_API_TOKEN: "direct-runtime-api-token-with-at-least-32-bytes",
  ELIZA_VAULT_PASSPHRASE: "runtime-vault-passphrase-with-at-least-32-bytes",
  ALICE_STATE_PLANE_SERVICE_TOKEN:
    "state-plane-service-token-with-at-least-32-bytes",
  ALICE_RUNTIME_RELEASE_TOKEN: runtimeToken,
  OPENAI_API_KEY: runtimeToken,
  ALICE_RUNTIME_RELEASE_TOKEN_SHA256: `sha256:${createHash("sha256")
    .update(`${releaseDigest}:${runtimeToken}`)
    .digest("hex")}`,
};
const protectedSecrets = {
  ...secrets,
  ALICE_RUNTIME_RELEASE_TOKEN_ROOT:
    "alice-runtime-release-root-distinct-1234567890",
};

describe("Alice protected Program admission", () => {
  test("binds Container Program v2 runtime secrets without a provider proxy", () => {
    const sourceCommit = "4".repeat(40);
    const runtimeImage =
      `registry.cloudflare.com/036df6c823669b8fa2f66cf4c16eeb29/alice-runtime@sha256:${"5".repeat(64)}`;
    const containerConfigs = {
      ...configs,
      access: {
        secrets: {
          required: [
            "ALICE_ACCESS_CONTROL_SERVICE_TOKEN",
            "ALICE_ACCESS_PROXY_SECRET",
          ],
        },
      },
      runtimeHost: {
        secrets: {
          required: [
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
          ],
        },
      },
    };
    expect(() =>
      verifyAliceRouteSecretClosure(
        containerConfigs,
        {
          ...secrets,
          ALICE_SOURCE_COMMIT: sourceCommit,
          ALICE_DEPLOYMENT_CONTROLLER_COMMIT: sourceCommit,
          ALICE_ELIZA_COMMIT: "6".repeat(40),
          ALICE_POLICY_HASH: `sha256:${"7".repeat(64)}`,
          ALICE_PROGRAM_DIGEST: `sha256:${"8".repeat(64)}`,
          ALICE_RELEASE_DIGEST: releaseDigest,
          ALICE_RUNTIME_API_TOKEN: secrets.MILADY_API_TOKEN,
          ALICE_CAPABILITY_BOM_SHA256: `sha256:${"a".repeat(64)}`,
          ALICE_RUNTIME_BUILD_MANIFEST_SHA256: `sha256:${"9".repeat(64)}`,
          ALICE_RUNTIME_IMAGE: runtimeImage,
          ALICE_RUNTIME_REVISION: "49",
          ALICE_RUNTIME_VAULT_PASSPHRASE: secrets.ELIZA_VAULT_PASSPHRASE,
        } as any,
        releaseDigest,
        true,
      )
    ).not.toThrow();
  });

  test("accepts only exact scoped token pairs and release-bound runtime bearer", () => {
    expect(() =>
      verifyAliceRouteSecretClosure(configs, secrets, releaseDigest, false),
    ).not.toThrow();

    for (const mutation of [
      { ALICE_ACCESS_GATEWAY_SERVICE_TOKEN: `${accessToken}-mismatch` },
      { ALICE_AI_CONTROL_SERVICE_TOKEN: accessToken },
      { ALICE_RUNTIME_RELEASE_TOKEN: `${runtimeToken}-mismatch` },
      { OPENAI_API_KEY: `${runtimeToken}-mismatch` },
      { ALICE_RUNTIME_RELEASE_TOKEN_SHA256: `sha256:${"2".repeat(64)}` },
      { ALICE_ACCESS_PROXY_SECRET: "too-short" },
      {
        MILADY_CLOUDFLARE_ACCESS_PROXY_SECRET:
          "access-proxy-secret-with-at-least-32-bytez",
      },
      { ALICE_MODAL_PROXY_KEY: "ak-wrong-token-kind-with-at-least-32-bytes" },
      { ALICE_MODAL_PROXY_SECRET: "as-wrong-token-kind-with-at-least-32-bytes" },
      { ALICE_DEPLOYMENT_PAUSE_TOKEN: accessToken },
      { MILADY_API_TOKEN: runtimeToken },
      {
        ELIZA_VAULT_PASSPHRASE:
          "direct-runtime-api-token-with-at-least-32-bytes",
      },
    ]) {
      expect(() =>
        verifyAliceRouteSecretClosure(
          configs,
          { ...secrets, ...mutation },
          releaseDigest,
          false,
        ),
      ).toThrow("ALICE_RELEASE_SECRETS_INVALID");
    }
  });

  test("rejects missing or broadened Worker secret declarations", () => {
    expect(() =>
      verifyAliceRouteSecretClosure(
        {
          ...configs,
          access: {
            secrets: {
              required: [
                ...configs.access.secrets.required,
                "UNREVIEWED_SECRET",
              ],
            },
          },
        },
        secrets,
        releaseDigest,
        false,
      ),
    ).toThrow("ALICE_RELEASE_SECRETS_INVALID");
  });

  test("keeps the control-only release root outside every runtime secret domain", () => {
    expect(() =>
      verifyAliceProtectedAdmissionSecretClosure(protectedSecrets),
    ).not.toThrow();
    for (const ALICE_RUNTIME_RELEASE_TOKEN_ROOT of [
      protectedSecrets.MILADY_API_TOKEN,
      protectedSecrets.ALICE_ACCESS_PROXY_SECRET,
    ]) {
      expect(() =>
        verifyAliceProtectedAdmissionSecretClosure({
          ...protectedSecrets,
          ALICE_RUNTIME_RELEASE_TOKEN_ROOT,
        }),
      ).toThrow("ALICE_RELEASE_SECRETS_INVALID");
    }
  });
});

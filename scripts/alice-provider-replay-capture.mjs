import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { buildCloudflareReplaySnapshot } from "./alice-provider-replay-evidence.mjs";

const ACCOUNT_ID = "036df6c823669b8fa2f66cf4c16eeb29";
const ZONE_ID = "7b24984479ee4cddb6c5d8a9b7a0f2c6";
const API_BASE = "https://api.cloudflare.com/client/v4";
const CONTROL_WORKER = "alice-production-control";
const TOKEN_ID = /^[a-f0-9]{32}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

function invalid(code) {
  throw new Error(code);
}

function absolute(value) {
  return typeof value === "string" && path.isAbsolute(value);
}

function required(value, code) {
  if (typeof value !== "string" || value.length < 1 || /[\r\n]/u.test(value)) {
    invalid(code);
  }
  return value;
}

async function imported(sourceRoot, relativePath) {
  return import(pathToFileURL(path.join(sourceRoot, relativePath)).href);
}

function readOnlyFetch(input, init = {}) {
  const request = input instanceof Request ? input : null;
  const method = String(init.method ?? request?.method ?? "GET").toUpperCase();
  const url = new URL(request?.url ?? input);
  if (method !== "GET" || url.origin !== "https://api.cloudflare.com") {
    invalid("ALICE_REPLAY_PROVIDER_MUTATION_FORBIDDEN");
  }
  return fetch(input, {
    ...init,
    method: "GET",
    redirect: "error",
    signal: init.signal ?? AbortSignal.timeout(60_000),
  });
}

async function cloudflareEnvelope(pathname, bearer) {
  const response = await readOnlyFetch(`${API_BASE}${pathname}`, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${bearer}`,
      "cache-control": "no-cache",
    },
  });
  const responseBytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || responseBytes.byteLength < 2 || responseBytes.byteLength > 2 * 1024 * 1024) {
    invalid("ALICE_REPLAY_CLOUDFLARE_CAPTURE_INVALID");
  }
  let body;
  try {
    body = JSON.parse(responseBytes.toString("utf8"));
  } catch {
    invalid("ALICE_REPLAY_CLOUDFLARE_CAPTURE_INVALID");
  }
  if (body?.success !== true || !Object.hasOwn(body, "result")) {
    invalid("ALICE_REPLAY_CLOUDFLARE_CAPTURE_INVALID");
  }
  return { body, responseBytes };
}

async function main() {
  if (process.env.ALICE_REPLAY_MUTATION_DISABLED !== "1") {
    invalid("ALICE_REPLAY_MUTATION_CUTOFF_REQUIRED");
  }
  const sourceRoot = process.env.ALICE_REPLAY_RELEASE_ROOT;
  const outputPath = process.env.ALICE_REPLAY_CAPTURE_OUTPUT;
  if (
    !absolute(sourceRoot) ||
    !absolute(outputPath) ||
    !fs.statSync(sourceRoot).isDirectory() ||
    !fs.statSync(path.dirname(outputPath)).isDirectory() ||
    fs.existsSync(outputPath)
  ) {
    invalid("ALICE_REPLAY_CAPTURE_PATH_INVALID");
  }

  const cloudflareToken = required(
    process.env.CLOUDFLARE_API_TOKEN,
    "ALICE_REPLAY_CLOUDFLARE_CREDENTIAL_INVALID",
  );
  const policyReadToken = required(
    process.env.CLOUDFLARE_TOKEN_POLICY_READ_TOKEN,
    "ALICE_REPLAY_CLOUDFLARE_CREDENTIAL_INVALID",
  );
  const verify = await cloudflareEnvelope("/user/tokens/verify", cloudflareToken);
  const tokenId = verify.body?.result?.id;
  if (!TOKEN_ID.test(tokenId ?? "") || verify.body.result.status !== "active") {
    invalid("ALICE_REPLAY_CLOUDFLARE_CREDENTIAL_INVALID");
  }
  const token = await cloudflareEnvelope(
    `/user/tokens/${tokenId}`,
    policyReadToken,
  );
  const permissionGroups = await cloudflareEnvelope(
    "/user/tokens/permission_groups",
    policyReadToken,
  );

  const liveReadback = await imported(
    sourceRoot,
    "deploy/modal/alice_cloudflare_live_readback.mjs",
  );
  const workerRollback = await imported(
    sourceRoot,
    "deploy/modal/alice_cloudflare_worker_rollback.mjs",
  );
  const traffic = await imported(
    sourceRoot,
    "deploy/modal/alice_cloudflare_traffic.mjs",
  );
  const bootstrap = await imported(
    sourceRoot,
    "deploy/modal/alice_cloudflare_bootstrap.mjs",
  );
  const continuity = await imported(
    sourceRoot,
    "deploy/modal/alice_cloudflare_continuity.mjs",
  );

  const deployments = await cloudflareEnvelope(
    `/accounts/${ACCOUNT_ID}/workers/scripts/${CONTROL_WORKER}/deployments`,
    cloudflareToken,
  );
  const activeDeployment = deployments.body?.result?.deployments?.[0];
  const activeVersionId = activeDeployment?.versions?.length === 1 &&
      activeDeployment.versions[0]?.percentage === 100
    ? activeDeployment.versions[0].version_id
    : "";
  if (!UUID.test(activeVersionId)) {
    invalid("ALICE_REPLAY_CLOUDFLARE_CAPTURE_INVALID");
  }
  const activeVersion = await cloudflareEnvelope(
    `/accounts/${ACCOUNT_ID}/workers/scripts/${CONTROL_WORKER}/versions/${activeVersionId}`,
    cloudflareToken,
  );
  const namespaceIds = bootstrap.extractAliceBootstrapNamespaceIds(
    activeVersion.body.result,
  );

  const providerState = await liveReadback.fetchAliceCloudflareProviderState({
    fetchImpl: readOnlyFetch,
    apiToken: cloudflareToken,
    ownerEmailSha256: required(
      process.env.ALICE_OWNER_EMAIL_SHA256,
      "ALICE_REPLAY_OWNER_INVALID",
    ),
    accessAudience: required(
      process.env.ALICE_ACCESS_AUDIENCE,
      "ALICE_REPLAY_ACCESS_CONFIG_INVALID",
    ),
    releaseAccessAudience: required(
      process.env.ALICE_RELEASE_ACCESS_AUDIENCE,
      "ALICE_REPLAY_ACCESS_CONFIG_INVALID",
    ),
    releaseServiceTokenIdSha256: required(
      process.env.ALICE_RELEASE_SERVICE_TOKEN_ID_SHA256,
      "ALICE_REPLAY_ACCESS_CONFIG_INVALID",
    ),
  });
  const continuityState =
    await liveReadback.fetchAliceCloudflareContinuityState({
      fetchImpl: readOnlyFetch,
      apiToken: cloudflareToken,
      expectedDurableObjectNamespaceIds: namespaceIds,
    });
  const workers =
    await workerRollback.captureAliceCloudflareWorkerRollbackState({
      fetchImpl: readOnlyFetch,
      apiToken: cloudflareToken,
    });
  const trafficState = await traffic.fetchAliceCloudflareTrafficState({
    fetchImpl: readOnlyFetch,
    apiToken: cloudflareToken,
  });
  const workflowVersions =
    await liveReadback.fetchAliceCloudflareWorkflowVersionState({
      fetchImpl: readOnlyFetch,
      apiToken: cloudflareToken,
      expectedWorkflowId: continuityState.readback.workflow.id,
    });
  const candidateContinuity =
    continuity.buildAliceCandidateCloudflareContinuityReadback(
      continuityState.readback,
    );
  const cloudflareCapture = {
    schemaVersion: "alice.cloudflare-provider-readback.v1",
    accountId: ACCOUNT_ID,
    zoneId: ZONE_ID,
    observedAt: new Date().toISOString(),
    provider: {
      ...providerState.sanitized,
      continuityBootstrapConfig: continuityState.sanitized,
      continuityCandidateConfig:
        continuity.buildAliceCloudflareContinuityConfig(candidateContinuity),
    },
    replayFullProvider: {
      durableObjectNamespaceIds: namespaceIds,
      traffic: trafficState,
      workers,
      workflowVersions,
    },
  };
  const snapshot = buildCloudflareReplaySnapshot({
    cloudflareMaterializerBytes: Buffer.from(
      `${JSON.stringify(cloudflareCapture)}\n`,
      "utf8",
    ),
    cloudflareCredentialBytes: Buffer.from(
      `${JSON.stringify({
        permissionGroups: permissionGroups.body,
        token: token.body,
        verify: verify.body,
      })}\n`,
      "utf8",
    ),
  });
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputPath,
    cloudflarePermissionCatalogBytes: permissionGroups.responseBytes.byteLength,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

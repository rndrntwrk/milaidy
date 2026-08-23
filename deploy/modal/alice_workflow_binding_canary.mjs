import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  ALICE_CLOUDFLARE_TARGET,
  canonicalAliceJson,
} from "../../workers/alice-effective-config.js";
import {
  verifyAliceCloudflareWorkflowVersionSnapshot,
} from "./alice_cloudflare_live_readback.mjs";

const API_BASE = "https://api.cloudflare.com/client/v4";
const OWNER_ORIGIN = "https://alice.rndrntwrk.com";
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

function invalid(code = "ALICE_WORKFLOW_BINDING_CANARY_INVALID") {
  throw new Error(code);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function secure(value, minimum = 16) {
  return (
    typeof value === "string" &&
    value.length >= minimum &&
    value.length <= 16_384 &&
    !/[\0\r\n]/.test(value)
  );
}

function exactBinding(value) {
  return (
    object(value) &&
    Object.keys(value).sort().join(",") ===
      "policyHash,programDigest,releaseDigest" &&
    [value.programDigest, value.releaseDigest, value.policyHash].every(
      (digest) => DIGEST.test(digest ?? ""),
    )
  );
}

async function boundedJson(response) {
  if (!(response instanceof Response)) invalid();
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > 64 * 1024) invalid();
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 2 || bytes.byteLength > 64 * 1024) invalid();
  try {
    const value = JSON.parse(new TextDecoder("utf-8", {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes));
    if (!object(value)) invalid();
    return value;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_WORKFLOW_BINDING_CANARY_INVALID"
    ) {
      throw error;
    }
    invalid();
  }
}

function parseProviderOutput(output) {
  if (typeof output !== "string") invalid();
  const bytes = Buffer.from(output, "utf8");
  if (bytes.byteLength < 2 || bytes.byteLength > 64 * 1024) invalid();
  let value;
  try {
    value = JSON.parse(output);
  } catch {
    invalid();
  }
  if (!object(value)) invalid();
  return value;
}

function verifyPlanResult(value, { planId, intentId, binding }) {
  if (
    !object(value) ||
    Object.keys(value).sort().join(",") !==
      "completed,decisions,planId,releaseDigest,schemaVersion,status" ||
    value.schemaVersion !== "alice.plan-result.v1" ||
    value.planId !== planId ||
    value.releaseDigest !== binding.releaseDigest ||
    value.status !== "authorized-awaiting-executor" ||
    value.completed !== false ||
    !Array.isArray(value.decisions) ||
    value.decisions.length !== 1 ||
    !object(value.decisions[0]) ||
    Object.keys(value.decisions[0]).sort().join(",") !== "code,intentId" ||
    value.decisions[0]?.intentId !== intentId ||
    value.decisions[0]?.code !== "INTENT_AUTHORIZED"
  ) {
    invalid();
  }
  return {
    schemaVersion: "alice.plan-result.v1",
    planId,
    releaseDigest: binding.releaseDigest,
    decisions: [{ intentId, code: "INTENT_AUTHORIZED" }],
    status: "authorized-awaiting-executor",
    completed: false,
  };
}

export function resolveAliceCandidateWorkflowVersion({
  previous,
  current,
  expectedWorkflowId,
}) {
  try {
    const before = verifyAliceCloudflareWorkflowVersionSnapshot(
      previous,
      expectedWorkflowId,
    );
    const after = verifyAliceCloudflareWorkflowVersionSnapshot(
      current,
      expectedWorkflowId,
    );
    const previousById = new Map(before.map((version) => [version.id, version]));
    for (const version of before) {
      if (
        canonicalAliceJson(after.find((candidate) => candidate.id === version.id)) !==
          canonicalAliceJson(version)
      ) {
        invalid("ALICE_WORKFLOW_CANDIDATE_VERSION_INVALID");
      }
    }
    const additions = after.filter((version) => !previousById.has(version.id));
    if (additions.length !== 1) {
      invalid("ALICE_WORKFLOW_CANDIDATE_VERSION_INVALID");
    }
    return additions[0];
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ALICE_WORKFLOW_CANDIDATE_VERSION_INVALID"
    ) {
      throw error;
    }
    invalid("ALICE_WORKFLOW_CANDIDATE_VERSION_INVALID");
  }
}

export async function runAliceWorkflowBindingCanary({
  fetchImpl = globalThis.fetch,
  sleepImpl = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = Date.now,
  randomUuid = crypto.randomUUID,
  ownerAuthorization,
  apiToken,
  binding,
  deploymentManifestSha256,
  expectedWorkflowId,
  expectedWorkflowVersionId,
  accountId = ALICE_CLOUDFLARE_TARGET.accountId,
  apiBase = API_BASE,
}) {
  if (
    typeof fetchImpl !== "function" ||
    typeof sleepImpl !== "function" ||
    typeof now !== "function" ||
    typeof randomUuid !== "function" ||
    !secure(ownerAuthorization, 32) ||
    !secure(apiToken, 16) ||
    !exactBinding(binding) ||
    !DIGEST.test(deploymentManifestSha256 ?? "") ||
    !UUID.test(expectedWorkflowId ?? "") ||
    !UUID.test(expectedWorkflowVersionId ?? "") ||
    accountId !== ALICE_CLOUDFLARE_TARGET.accountId ||
    apiBase !== API_BASE
  ) {
    invalid();
  }
  const startedAt = now();
  if (!Number.isSafeInteger(startedAt) || startedAt <= 0) invalid();
  const uuid = randomUuid();
  if (!UUID.test(uuid ?? "")) invalid();
  const suffix = uuid.replaceAll("-", "");
  const planId = `alice-canary-${suffix}`;
  const sessionId = `alice-canary-session-${suffix}`;
  const intentId = `runtime-health-${suffix}`;
  const nonce = `nonce-${suffix}`;
  const target = ALICE_CLOUDFLARE_TARGET.controlWorker;
  const argumentHash = `sha256:${crypto
    .createHash("sha256")
    .update(canonicalAliceJson({ action: "runtime.health", target }))
    .digest("hex")}`;
  const ownerHeaders = {
    accept: "application/json",
    "cache-control": "no-store",
    "content-type": "application/json",
    cookie: `CF_Authorization=${ownerAuthorization}`,
    origin: OWNER_ORIGIN,
    "sec-fetch-site": "same-origin",
  };
  const createResponse = await fetchImpl(
    `${OWNER_ORIGIN}/control/api/v1/plans`,
    {
      method: "POST",
      headers: ownerHeaders,
      redirect: "manual",
      body: JSON.stringify({
        planId,
        sessionId,
        actions: [{
          intentId,
          action: "runtime.health",
          target,
          argumentHash,
          nonce,
          expiresAt: startedAt + 120_000,
          ...binding,
        }],
      }),
    },
  );
  const created = await boundedJson(createResponse);
  if (
    createResponse.status !== 202 ||
    created.ok !== true ||
    created.planId !== planId ||
    created.status !== "queued"
  ) {
    invalid();
  }

  const providerUrl =
    `${apiBase}/accounts/${accountId}/workflows/` +
    `${ALICE_CLOUDFLARE_TARGET.planWorkflow}/instances/${planId}?order=asc`;
  let providerInstance;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const response = await fetchImpl(providerUrl, {
      method: "GET",
      headers: {
        authorization: `Bearer ${apiToken}`,
        accept: "application/json",
        "cache-control": "no-cache",
      },
    });
    const body = await boundedJson(response);
    if (!response.ok || body.success !== true || !object(body.result)) invalid();
    const instance = body.result;
    if (
      instance.id !== planId ||
      instance.versionId !== expectedWorkflowVersionId ||
      instance.trigger?.source !== "binding"
    ) {
      invalid();
    }
    if (["errored", "terminated", "rollingBack"].includes(instance.status)) {
      invalid();
    }
    if (instance.status === "complete") {
      providerInstance = instance;
      break;
    }
    if (![
      "queued",
      "running",
      "paused",
      "waitingForPause",
      "waiting",
    ].includes(instance.status)) {
      invalid();
    }
    await sleepImpl(500);
  }
  if (!providerInstance) invalid();
  const providerOutput = verifyPlanResult(
    parseProviderOutput(providerInstance.output),
    { planId, intentId, binding },
  );

  const { "content-type": _contentType, ...ownerGetHeaders } = ownerHeaders;
  const ownerStatusResponse = await fetchImpl(
    `${OWNER_ORIGIN}/control/api/v1/plans/${planId}`,
    {
      method: "GET",
      headers: ownerGetHeaders,
      redirect: "manual",
    },
  );
  const ownerStatus = await boundedJson(ownerStatusResponse);
  if (
    !ownerStatusResponse.ok ||
    ownerStatus.ok !== true ||
    ownerStatus.planId !== planId ||
    ownerStatus.status !== "complete"
  ) {
    invalid();
  }
  const ownerOutput = verifyPlanResult(ownerStatus.output, {
    planId,
    intentId,
    binding,
  });
  if (canonicalAliceJson(providerOutput) !== canonicalAliceJson(ownerOutput)) {
    invalid();
  }
  const completedAt = now();
  if (
    !Number.isSafeInteger(completedAt) ||
    completedAt < startedAt ||
    completedAt - startedAt > 60_000
  ) {
    invalid();
  }
  return {
    schemaVersion: "alice.workflow-binding-canary.v1",
    accountId,
    workflowName: ALICE_CLOUDFLARE_TARGET.planWorkflow,
    workflowId: expectedWorkflowId,
    workflowVersionId: expectedWorkflowVersionId,
    planId,
    sessionId,
    action: "runtime.health",
    intentId,
    argumentHash,
    deploymentManifestSha256,
    binding,
    triggerSource: "binding",
    status: "complete",
    result: providerOutput,
    externalActionExecuted: false,
    observedAt: new Date(completedAt).toISOString(),
    durationMs: completedAt - startedAt,
  };
}

function writeReadonly(filePath, value) {
  if (
    typeof filePath !== "string" ||
    !path.isAbsolute(filePath) ||
    !fs.existsSync(path.dirname(filePath))
  ) {
    invalid();
  }
  fs.writeFileSync(filePath, `${canonicalAliceJson(value)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o444,
  });
}

async function main() {
  let binding;
  try {
    binding = JSON.parse(process.env.ALICE_RELEASE_BINDING_JSON ?? "");
  } catch {
    invalid();
  }
  const evidence = await runAliceWorkflowBindingCanary({
    ownerAuthorization: process.env.ALICE_OWNER_AUTHORIZATION,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    binding,
    deploymentManifestSha256:
      process.env.ALICE_DEPLOYMENT_MANIFEST_SHA256,
    expectedWorkflowId: process.env.ALICE_EXPECTED_WORKFLOW_ID,
    expectedWorkflowVersionId:
      process.env.ALICE_EXPECTED_WORKFLOW_VERSION_ID,
  });
  writeReadonly(process.env.ALICE_WORKFLOW_CANARY_EVIDENCE_PATH, evidence);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}

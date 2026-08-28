import type { AliceWorkerEnv } from "./env";
import {
  createEvidenceQueueEnvelope,
  validateEvidenceRecord,
  verifyEvidenceQueueEnvelope,
  type EvidenceQueueEnvelope,
  type EvidenceRecord,
} from "./evidence";
import { persistEvidenceObject } from "./evidence-store";
import { jsonResponse, readBoundedJson } from "./http";
import { validatePlan, type AlicePlan } from "./plan";
import {
  loadRuntimeConfig,
  loadOwnerAccessConfig,
  loadDeploymentControllerAccessConfig,
  type AliceRuntimeConfig,
  type AliceOwnerAccessConfig,
} from "./runtime-config";
import { verifyAccessJwt, verifyAccessServiceJwt } from "./access";
import { validateAliceOwnerOrigin } from "./owner-origin";
import { authorityDurableName } from "./durable-names";
import type { ActionIntent, ModelBudgetRequest, ReleaseBinding } from "./policy";
import {
  authorizeDeploymentPause,
  authorizeEmergencyRecovery,
  authorizeInternalService,
  requiredInternalService,
} from "./internal-auth";
import {
  ALICE_DEPLOYMENT_PAUSE_V2_PATH,
  buildAliceDeploymentEdgeReadiness,
  executeAliceDeploymentPauseV2,
  validAliceDeploymentEdgeNonce,
} from "./deployment-edge";

export { AliceAuthority, AliceSession } from "./durable";
export { AlicePlanWorkflow } from "./workflow";

type AccessIdentity = {
  subject: string;
  emailSha256: string;
  issuer: string;
  audience: string;
};

let cachedJwks: { issuer: string; expiresAt: number; value: { keys: JsonWebKey[] } } | null = null;

function runtimeConfig(env: AliceWorkerEnv): Promise<AliceRuntimeConfig> {
  // Program-envelope expiry is an online control, so validate it on every
  // request instead of allowing a warm isolate to retain an expired release.
  return loadRuntimeConfig(env);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadAccessJwks(issuer: string): Promise<{ keys: JsonWebKey[] }> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.issuer === issuer && cachedJwks.expiresAt > now) {
    return cachedJwks.value;
  }
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("ACCESS_JWKS_UNAVAILABLE");
  const value = (await response.json()) as { keys: JsonWebKey[] };
  if (!value || !Array.isArray(value.keys)) throw new Error("ACCESS_JWKS_INVALID");
  cachedJwks = { issuer, expiresAt: now + 300_000, value };
  return value;
}

async function requireOwner(
  request: Request,
  config: AliceOwnerAccessConfig,
): Promise<
  | { ok: true; identity: AccessIdentity; actor: string }
  | { ok: false; response: Response }
> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, code: "ACCESS_TOKEN_REQUIRED" }, 401),
    };
  }
  const verified = await verifyAccessJwt(
    token,
    {
      issuer: config.accessIssuer,
      audience: config.accessAudience,
      ownerEmailSha256: config.ownerEmailSha256,
    },
    () => loadAccessJwks(config.accessIssuer),
  );
  if (!verified.ok) {
    const status = verified.code.includes("JWKS") ? 503 : 401;
    return { ok: false, response: jsonResponse({ ok: false, code: verified.code }, status) };
  }
  const subjectHash = await sha256Hex(verified.identity.subject);
  return {
    ok: true,
    identity: verified.identity,
    actor: `owner:sha256:${subjectHash}`,
  };
}

async function callDurable(
  stub: DurableObjectStub,
  path: string,
  body?: unknown,
): Promise<{ response: Response; value: any }> {
  const init: RequestInit = body === undefined
    ? { method: "GET" }
    : {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      };
  const response = await stub.fetch(`https://alice.internal${path}`, init);
  const value = await response.json();
  return { response, value };
}

async function queueEvidence(env: AliceWorkerEnv, record: EvidenceRecord): Promise<void> {
  const validation = validateEvidenceRecord(record);
  if (!validation.ok) throw new Error(validation.code);
  await env.ALICE_EVIDENCE_QUEUE.send(
    await createEvidenceQueueEnvelope(record, env.ALICE_EVIDENCE_QUEUE_HMAC_KEY),
    { contentType: "json" },
  );
}

function evidenceRecord(
  binding: ReleaseBinding,
  actor: string,
  kind: string,
  outcome: string,
  subjectId: string,
  details: Record<string, unknown>,
): EvidenceRecord {
  return {
    schemaVersion: "alice.evidence.v1",
    eventId: `evt-${crypto.randomUUID()}`,
    occurredAt: new Date().toISOString(),
    kind,
    actor,
    outcome,
    binding,
    subjectId,
    details,
  };
}

function validId(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,127}$/.test(value);
}

function validReleaseBinding(value: unknown): value is ReleaseBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as Record<string, unknown>;
  return (
    Object.keys(binding).sort().join(",") ===
      "policyHash,programDigest,releaseDigest" &&
    [binding.programDigest, binding.releaseDigest, binding.policyHash].every(
      (digest) =>
        typeof digest === "string" && /^sha256:[a-f0-9]{64}$/.test(digest),
    )
  );
}

function sanitizedDeploymentAuthoritySnapshot(value: unknown) {
  const authority = value && typeof value === "object"
    ? (value as Record<string, any>).authority
    : null;
  if (
    !authority ||
    typeof authority !== "object" ||
    Array.isArray(authority) ||
    !validReleaseBinding(authority.binding) ||
    !/^sha256:[a-f0-9]{64}$/.test(authority.deploymentManifestSha256 ?? "") ||
    !Number.isSafeInteger(authority.admissionGeneration) ||
    authority.admissionGeneration < 0 ||
    !Number.isSafeInteger(authority.activeReleaseEpoch) ||
    authority.activeReleaseEpoch < 0 ||
    !Number.isSafeInteger(authority.highestReleaseEpoch) ||
    authority.highestReleaseEpoch < authority.activeReleaseEpoch ||
    typeof authority.rollbackBoundary !== "string" ||
    authority.rollbackBoundary.length < 8 ||
    authority.rollbackBoundary.length > 256 ||
    !Array.isArray(authority.pausedScopes) ||
    !authority.activePauses ||
    typeof authority.activePauses !== "object" ||
    Array.isArray(authority.activePauses)
  ) {
    return null;
  }
  const pausedScopes = authority.pausedScopes.filter(
    (scope: unknown): scope is string =>
      typeof scope === "string" &&
      [
        "all",
        "social",
        "trading",
        "stream",
        "coding",
        "model",
        "modal",
        "signer",
        "release",
      ].includes(scope),
  );
  if (
    pausedScopes.length !== authority.pausedScopes.length ||
    new Set(pausedScopes).size !== pausedScopes.length
  ) {
    return null;
  }
  const activePauses: Record<string, unknown> = {};
  for (const [scope, record] of Object.entries(
    authority.activePauses as Record<string, any>,
  )) {
    if (
      !pausedScopes.includes(scope) ||
      !record ||
      typeof record !== "object" ||
      !/^pause-[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(
        record.pauseId ?? "",
      ) ||
      !Number.isSafeInteger(record.pausedAt) ||
      record.pausedAt <= 0 ||
      !validReleaseBinding(record.binding) ||
      !/^sha256:[a-f0-9]{64}$/.test(
        record.deploymentManifestSha256 ?? "",
      ) ||
      typeof record.rollbackBoundary !== "string" ||
      record.rollbackBoundary.length < 8 ||
      record.rollbackBoundary.length > 256
    ) {
      return null;
    }
    activePauses[scope] = {
      pauseId: record.pauseId,
      pausedAt: record.pausedAt,
      binding: record.binding,
      deploymentManifestSha256: record.deploymentManifestSha256,
      rollbackBoundary: record.rollbackBoundary,
    };
  }
  if (Object.keys(activePauses).length !== pausedScopes.length) return null;
  return {
    binding: authority.binding,
    deploymentManifestSha256: authority.deploymentManifestSha256,
    admissionGeneration: authority.admissionGeneration,
    activeReleaseEpoch: authority.activeReleaseEpoch,
    highestReleaseEpoch: authority.highestReleaseEpoch,
    rollbackBoundary: authority.rollbackBoundary,
    pausedScopes,
    activePauses,
  };
}

async function listReleaseEvidence(
  env: AliceWorkerEnv,
  releaseDigest: string,
  datePrefix: string,
  pageCursor: string | null,
): Promise<{
  objects: Array<{ key: string; size: number; uploaded: string }>;
  truncated: boolean;
  nextCursor: string | null;
}> {
  const releasePrefix = `${releaseDigest.slice("sha256:".length)}/`;
  const prefix = `${datePrefix}/${releasePrefix}`;
  const listed = await env.ALICE_EVIDENCE.list({
    prefix,
    limit: 100,
    ...(pageCursor ? { cursor: pageCursor } : {}),
  });
  if (listed.truncated && !listed.cursor) {
    throw new Error("EVIDENCE_LIST_CURSOR_MISSING");
  }
  return {
    objects: listed.objects.map((object) => ({
      key: object.key,
      size: object.size,
      uploaded: object.uploaded.toISOString(),
    })),
    truncated: listed.truncated,
    nextCursor: listed.truncated ? listed.cursor! : null,
  };
}

function validEvidenceDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

async function handleDeploymentController(
  request: Request,
  env: AliceWorkerEnv,
  config: AliceRuntimeConfig | null,
  path: string,
): Promise<Response> {
  const url = new URL(request.url);
  if (
    url.hostname !== "alice-release.rndrntwrk.com" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
  }
  const accessToken = request.headers.get("cf-access-jwt-assertion") ?? "";
  const accessConfig = loadDeploymentControllerAccessConfig(env);
  const verified = await verifyAccessServiceJwt(
    accessToken,
    {
      issuer: accessConfig.accessIssuer,
      audience: accessConfig.accessAudience,
      serviceClientIdSha256: accessConfig.serviceClientIdSha256,
    },
    () => loadAccessJwks(accessConfig.accessIssuer),
  );
  if (!verified.ok) {
    return jsonResponse(
      { ok: false, code: verified.code },
      verified.code.includes("JWKS") ? 503 : 401,
    );
  }
  const deploymentPauseToken =
    request.headers.get("x-alice-deployment-pause-token") ?? "";
  if (!authorizeDeploymentPause(deploymentPauseToken, env)) {
    return jsonResponse(
      { ok: false, code: "DEPLOYMENT_PAUSE_AUTH_REQUIRED" },
      401,
    );
  }
  const authority = env.ALICE_AUTHORITY.getByName(authorityDurableName());
  if (
    path === "/control/internal/v1/deployment/status" &&
    request.method === "GET"
  ) {
    const edgeNonce =
      request.headers.get("x-alice-deployment-edge-nonce") ?? "";
    if (!validAliceDeploymentEdgeNonce(edgeNonce)) {
      return jsonResponse(
        { ok: false, code: "DEPLOYMENT_EDGE_READINESS_REQUIRED" },
        400,
      );
    }
    const snapshotResult = await callDurable(authority, "/snapshot");
    const authoritySnapshot = snapshotResult.response.ok
      ? sanitizedDeploymentAuthoritySnapshot(snapshotResult.value)
      : null;
    if (!authoritySnapshot) {
      return jsonResponse(
        { ok: false, code: "DEPLOYMENT_STATUS_UNAVAILABLE" },
        503,
      );
    }
    let candidateAdmission: Record<string, unknown> = {
      ok: false,
      allowed: false,
      code: "RELEASE_ADMISSION_DENIED",
      blockingScopes: [],
      binding: null,
      release: null,
    };
    if (config) {
      const candidate = await callDurable(authority, "/release/check");
      const blockingScopes = Array.isArray(candidate.value?.blockingScopes)
        ? candidate.value.blockingScopes.filter(
            (scope: unknown): scope is string => typeof scope === "string",
          )
        : [];
      candidateAdmission = {
        ok: candidate.response.ok && candidate.value?.ok === true,
        allowed:
          candidate.response.ok && candidate.value?.allowed === true,
        code:
          typeof candidate.value?.code === "string"
            ? candidate.value.code
            : "RELEASE_ADMISSION_DENIED",
        blockingScopes,
        binding: validReleaseBinding(candidate.value?.binding)
          ? candidate.value.binding
          : null,
        release:
          candidate.value?.release &&
          typeof candidate.value.release === "object" &&
          !Array.isArray(candidate.value.release)
            ? candidate.value.release
            : null,
      };
    }
    return jsonResponse({
      ok: true,
      code: "DEPLOYMENT_STATUS_READ",
      authority: authoritySnapshot,
      candidateAdmission,
      edgeReadiness: config
        ? buildAliceDeploymentEdgeReadiness({
            config,
            workerVersion: env.ALICE_VERSION,
            nonce: edgeNonce,
          })
        : null,
    });
  }
  if (
    path === ALICE_DEPLOYMENT_PAUSE_V2_PATH &&
    request.method === "POST"
  ) {
    if (!config) {
      return jsonResponse(
        { ok: false, code: "DEPLOYMENT_EDGE_READINESS_MISMATCH" },
        409,
      );
    }
    const guarded = await executeAliceDeploymentPauseV2({
      path,
      method: request.method,
      headerNonce:
        request.headers.get("x-alice-deployment-edge-nonce") ?? "",
      body: await readBoundedJson(request),
      config,
      workerVersion: env.ALICE_VERSION,
      mutate: () => callDurable(authority, "/pause", {
        scope: "all",
        subject: "deployment-controller:pause-only",
        pauseId: `pause-${crypto.randomUUID()}`,
      }),
    });
    if (!guarded.ok) return jsonResponse(guarded, 409);
    const { response, value } = guarded.mutation;
    return jsonResponse(value, response.status);
  }
  return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
}

async function handleInternal(
  request: Request,
  env: AliceWorkerEnv,
  config: AliceRuntimeConfig | null,
  path: string,
): Promise<Response> {
  if (
    path === "/control/internal/v1/emergency/pause-all" &&
    request.method === "POST"
  ) {
    const recoveryToken = request.headers.get("x-alice-recovery-token") ?? "";
    if (!authorizeEmergencyRecovery(recoveryToken, env)) {
      return jsonResponse(
        { ok: false, code: "RECOVERY_AUTH_REQUIRED" },
        401,
      );
    }
    const authority = env.ALICE_AUTHORITY.getByName(authorityDurableName());
    const { response, value } = await callDurable(authority, "/pause", {
      scope: "all",
      subject: "recovery:deployment-controller",
      pauseId: `pause-${crypto.randomUUID()}`,
    });
    return jsonResponse(value, response.status);
  }
  const requiredService = requiredInternalService(request.method, path);
  if (!requiredService) {
    return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
  }
  const serviceToken = request.headers.get("x-alice-service-token") ?? "";
  if (!authorizeInternalService(requiredService, serviceToken, env)) {
    return jsonResponse({ ok: false, code: "SERVICE_AUTH_REQUIRED" }, 401);
  }
  const authority = env.ALICE_AUTHORITY.getByName(authorityDurableName());
  if (path === "/control/internal/v1/health" && request.method === "GET") {
    const { response, value } = await callDurable(authority, "/snapshot");
    const active = value.authority?.binding as ReleaseBinding | undefined;
    const exact = Boolean(
      config &&
        active &&
        active.programDigest === config.binding.programDigest &&
        active.releaseDigest === config.binding.releaseDigest &&
        active.policyHash === config.binding.policyHash &&
        value.authority?.deploymentManifestSha256 ===
          config.deploymentManifestSha256,
    );
    return jsonResponse(
      {
        ok: response.ok && exact,
        releaseAdmission: exact ? "admitted" : "denied",
        binding: exact ? config!.binding : null,
        releaseDigest: exact ? config!.binding.releaseDigest : null,
        pausedScopes: value.authority?.pausedScopes ?? [],
      },
      response.ok && exact ? 200 : 503,
    );
  }
  if (path === "/control/internal/v1/model/binding" && request.method === "GET") {
    const { response, value } = await callDurable(authority, "/snapshot");
    const active = value.authority?.binding as ReleaseBinding | undefined;
    const exact = Boolean(
      config &&
        active &&
        active.programDigest === config.binding.programDigest &&
        active.releaseDigest === config.binding.releaseDigest &&
        active.policyHash === config.binding.policyHash &&
        value.authority?.deploymentManifestSha256 ===
          config.deploymentManifestSha256,
    );
    return jsonResponse(
      {
        ok: response.ok && exact,
        binding: exact ? config!.binding : null,
        deploymentManifestSha256: exact
          ? config!.deploymentManifestSha256
          : null,
        pausedScopes: value.authority?.pausedScopes ?? [],
      },
      response.ok && exact ? 200 : 503,
    );
  }
  if (path === "/control/internal/v1/runtime/admit" && request.method === "GET") {
    if (!config) {
      return jsonResponse({ ok: false, allowed: false, code: "RELEASE_ADMISSION_DENIED" }, 503);
    }
    const { response, value } = await callDurable(authority, "/release/check");
    return jsonResponse(value, response.status);
  }
  if (path === "/control/internal/v1/model/reserve" && request.method === "POST") {
    if (!config) {
      return jsonResponse({ ok: false, code: "RELEASE_ADMISSION_DENIED" }, 503);
    }
    const body = await readBoundedJson(request);
    const { response, value } = await callDurable(authority, "/budget", {
      actor: "service:alice-ai-gateway",
      request: body,
    });
    return jsonResponse(value, response.ok ? 200 : response.status);
  }
  const sessionContextMatch = path.match(
    /^\/control\/internal\/v1\/sessions\/([^/]+)\/conversation\/context$/,
  );
  if (sessionContextMatch && request.method === "GET") {
    if (!config) {
      return jsonResponse({ ok: false, code: "RELEASE_ADMISSION_DENIED" }, 503);
    }
    const sessionId = decodeURIComponent(sessionContextMatch[1]!);
    if (!validId(sessionId)) {
      return jsonResponse({ ok: false, code: "SESSION_ID_INVALID" }, 400);
    }
    const search = new URL(request.url).searchParams;
    const turnId = search.get("turnId") ?? "";
    if (turnId && !validId(turnId)) {
      return jsonResponse({ ok: false, code: "TURN_ID_INVALID" }, 400);
    }
    const { response, value } = await callDurable(
      authority,
      "/session/context",
      {
        actor: "service:alice-access-gateway",
        sessionId,
        turnId,
        expectedAdmission: {
          binding: {
            programDigest: search.get("programDigest") ?? "",
            releaseDigest: search.get("releaseDigest") ?? "",
            policyHash: search.get("policyHash") ?? "",
          },
          deploymentManifestSha256:
            search.get("deploymentManifestSha256") ?? "",
          admissionGeneration: Number(search.get("admissionGeneration")),
        },
      },
    );
    return jsonResponse(value, response.status);
  }
  const sessionTurnMatch = path.match(
    /^\/control\/internal\/v1\/sessions\/([^/]+)\/conversation\/turn$/,
  );
  if (sessionTurnMatch && request.method === "POST") {
    if (!config) {
      return jsonResponse({ ok: false, code: "RELEASE_ADMISSION_DENIED" }, 503);
    }
    const sessionId = decodeURIComponent(sessionTurnMatch[1]!);
    if (!validId(sessionId)) {
      return jsonResponse({ ok: false, code: "SESSION_ID_INVALID" }, 400);
    }
    const body = (await readBoundedJson(request)) as Record<string, unknown>;
    const { response, value } = await callDurable(
      authority,
      "/session/mutate",
      {
        actor: "service:alice-access-gateway",
        sessionId,
        operation: "conversation.turn",
        expectedAdmission: body.expectedAdmission,
        record: body.record,
      },
    );
    return jsonResponse(value, response.status);
  }
  return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
}

async function handleOwnerApi(
  request: Request,
  env: AliceWorkerEnv,
  actor: string,
  path: string,
): Promise<Response> {
  const authority = env.ALICE_AUTHORITY.getByName(authorityDurableName());

  if (path === "/control/health" && request.method === "GET") {
    const { response, value } = await callDurable(authority, "/snapshot");
    if (!response.ok) return jsonResponse({ ok: false, code: "AUTHORITY_UNAVAILABLE" }, 503);
    const admitted = await runtimeConfig(env)
      .then((config) => ({ ok: true as const, config }))
      .catch(() => ({ ok: false as const, config: null }));
    const active = value.authority?.binding as ReleaseBinding | undefined;
    const exact = Boolean(
      admitted.ok &&
        active &&
        active.programDigest === admitted.config.binding.programDigest &&
        active.releaseDigest === admitted.config.binding.releaseDigest &&
        active.policyHash === admitted.config.binding.policyHash &&
        value.authority?.deploymentManifestSha256 ===
          admitted.config.deploymentManifestSha256,
    );
    return jsonResponse({
      ok: exact,
      status: exact ? "ready" : "release-admission-denied",
      service: "alice-production-control",
      releaseAdmission: exact ? "admitted" : "denied",
      release: admitted.ok
        ? {
            releaseEpoch: admitted.config.envelope.release.releaseEpoch,
            sourceCommit: admitted.config.envelope.release.sourceCommit,
            deploymentControllerCommit:
              admitted.config.envelope.release.deploymentControllerCommit,
            runtimeImage: admitted.config.envelope.release.runtimeImage,
            runtimeBuildManifestSha256:
              admitted.config.envelope.release.runtimeBuildManifestSha256,
            capabilityBomSha256: admitted.config.capabilityBomSha256,
            elizaCommit: admitted.config.envelope.release.elizaCommit,
            programDigest: admitted.config.binding.programDigest,
            releaseDigest: admitted.config.binding.releaseDigest,
            policyHash: admitted.config.binding.policyHash,
            modalRevision: admitted.config.modalRevision,
            deploymentManifestSha256: admitted.config.deploymentManifestSha256,
            workerVersion: env.ALICE_VERSION,
          }
        : null,
      authentication: {
        method: "cloudflare-access-jwt",
        exactOwnerBound: true,
        actor,
      },
      authority: value.authority,
      controls: {
        capabilityGrant: "disabled-pending-device-bound-webauthn",
        highRiskActions: "disabled",
        pauseScopes: [
          "all",
          "social",
          "trading",
          "stream",
          "coding",
          "model",
          "modal",
          "signer",
          "release",
        ],
      },
      resources: {
        durableAuthority: "bound",
        durableSessions: "bound",
        workflows: "bound",
        evidenceQueue: "bound",
        evidenceR2: "bound",
      },
    }, exact ? 200 : 503);
  }

  if (path === "/control/api/v1/state" && request.method === "GET") {
    const { response, value } = await callDurable(authority, "/snapshot");
    return jsonResponse(value, response.status);
  }

  if (path === "/control/api/v1/release/admit" && request.method === "POST") {
    const rollbackReceipt =
      request.headers.get("x-alice-release-rollback-receipt") ?? "";
    const { response, value } = await callDurable(authority, "/release/activate", {
      actor,
      rollbackReceipt,
    });
    return jsonResponse(value, response.status);
  }

  if (path === "/control/api/v1/intents/authorize" && request.method === "POST") {
    const body = (await readBoundedJson(request)) as ActionIntent;
    const { response, value } = await callDurable(authority, "/authorize", {
      actor,
      request: body,
    });
    return jsonResponse(value, response.status);
  }

  if (path === "/control/api/v1/model/reserve" && request.method === "POST") {
    const body = (await readBoundedJson(request)) as ModelBudgetRequest;
    const { response, value } = await callDurable(authority, "/budget", {
      actor,
      request: body,
    });
    return jsonResponse(value, response.status);
  }

  const pauseMatch = path.match(/^\/control\/api\/v1\/pauses\/([a-z]+)$/);
  if (pauseMatch && request.method === "POST") {
    const scope = pauseMatch[1]!;
    const pauseId = `pause-${crypto.randomUUID()}`;
    const { response, value } = await callDurable(authority, "/pause", {
      scope,
      subject: actor,
      pauseId,
    });
    return jsonResponse(value, response.status);
  }
  if (pauseMatch && request.method === "DELETE") {
    const recoveryReceipt = request.headers.get("x-alice-recovery-receipt") ?? "";
    const scope = pauseMatch[1]!;
    const { response, value } = await callDurable(authority, "/resume", {
      scope,
      subject: actor,
      recoveryReceipt,
    });
    return jsonResponse(value, response.status);
  }

  if (path === "/control/api/v1/capabilities/grant" && request.method === "POST") {
    const config = await runtimeConfig(env);
    const record = evidenceRecord(
      config.binding,
      actor,
      "capability.grant",
      "CAPABILITY_GRANT_DISABLED",
      "capability:unissued",
      { allowed: false, reason: "device-bound-webauthn-not-qualified" },
    );
    await queueEvidence(env, record);
    return jsonResponse(
      { ok: false, code: "CAPABILITY_GRANT_DISABLED", gate: "device-bound-webauthn" },
      403,
    );
  }

  const revokeMatch = path.match(/^\/control\/api\/v1\/capabilities\/([^/]+)\/revoke$/);
  if (revokeMatch && request.method === "POST") {
    const capabilityId = decodeURIComponent(revokeMatch[1]!);
    const { response, value } = await callDurable(authority, "/capability/revoke", {
      capabilityId,
      subject: actor,
    });
    return jsonResponse(value, response.status);
  }

  const planMatch = path.match(/^\/control\/api\/v1\/plans\/([^/]+)$/);
  if (planMatch && request.method === "GET") {
    const planId = decodeURIComponent(planMatch[1]!);
    if (!validId(planId)) return jsonResponse({ ok: false, code: "PLAN_ID_INVALID" }, 400);
    try {
      const instance = await env.ALICE_PLANS.get(planId);
      return jsonResponse({ ok: true, planId, ...(await instance.status()) });
    } catch {
      return jsonResponse({ ok: false, code: "PLAN_NOT_FOUND" }, 404);
    }
  }

  const sessionMatch = path.match(/^\/control\/api\/v1\/sessions\/([^/]+)(?:\/(events|tasks))?$/);
  if (sessionMatch && !sessionMatch[2] && request.method === "GET") {
    const sessionId = decodeURIComponent(sessionMatch[1]!);
    if (!validId(sessionId)) return jsonResponse({ ok: false, code: "SESSION_ID_INVALID" }, 400);
    const currentConfig = await runtimeConfig(env);
    const current = await callDurable(authority, "/release/check");
    if (!current.response.ok || current.value.allowed !== true) {
      return jsonResponse(current.value, current.response.status);
    }
    const { response, value } = await callDurable(
      authority,
      "/session/snapshot",
      {
        actor,
        sessionId,
        expectedAdmission: {
          binding: currentConfig.binding,
          deploymentManifestSha256:
            currentConfig.deploymentManifestSha256,
          admissionGeneration: current.value.admissionGeneration,
        },
      },
    );
    return jsonResponse(value, response.status);
  }

  if (path === "/control/api/v1/evidence" && request.method === "GET") {
    const current = await callDurable(authority, "/snapshot");
    const binding = current.value.authority?.binding as ReleaseBinding | undefined;
    if (!current.response.ok || !binding || !/^sha256:[a-f0-9]{64}$/.test(binding.releaseDigest)) {
      return jsonResponse({ ok: false, code: "AUTHORITY_UNAVAILABLE" }, 503);
    }
    const search = new URL(request.url).searchParams;
    const datePrefix = search.get("date");
    if (!datePrefix) {
      return jsonResponse({ ok: false, code: "EVIDENCE_DATE_REQUIRED" }, 400);
    }
    if (!validEvidenceDate(datePrefix)) {
      return jsonResponse({ ok: false, code: "EVIDENCE_DATE_INVALID" }, 400);
    }
    const pageCursor = search.get("cursor");
    if (pageCursor && !/^[A-Za-z0-9._~=-]{1,1024}$/.test(pageCursor)) {
      return jsonResponse({ ok: false, code: "EVIDENCE_CURSOR_INVALID" }, 400);
    }
    const listed = await listReleaseEvidence(
      env,
      binding.releaseDigest,
      datePrefix,
      pageCursor,
    );
    return jsonResponse({
      ok: true,
      releaseDigest: binding.releaseDigest,
      date: datePrefix,
      objects: listed.objects,
      truncated: listed.truncated,
      nextCursor: listed.nextCursor,
    });
  }

  const config = await runtimeConfig(env);
  const activeRelease = await callDurable(authority, "/release/check");
  if (!activeRelease.response.ok) {
    return jsonResponse(activeRelease.value, activeRelease.response.status);
  }
  const expectedAdmission = {
    binding: config.binding,
    deploymentManifestSha256: config.deploymentManifestSha256,
    admissionGeneration: activeRelease.value.admissionGeneration,
  };

  if (path === "/control/api/v1/plans" && request.method === "POST") {
    const body = (await readBoundedJson(request)) as Partial<AlicePlan>;
    const plan: AlicePlan = {
      schemaVersion: "alice.plan.v1",
      planId: String(body.planId ?? ""),
      sessionId: String(body.sessionId ?? ""),
      actor,
      requestedAt: Date.now(),
      binding: config.binding,
      deploymentManifestSha256: config.deploymentManifestSha256,
      admissionGeneration: activeRelease.value.admissionGeneration,
      actions: Array.isArray(body.actions) ? body.actions : [],
    };
    const validation = validatePlan(plan, expectedAdmission);
    if (!validation.ok) return jsonResponse({ ok: false, code: validation.code }, 400);
    const { response, value } = await callDurable(authority, "/plan/create", {
      expectedAdmission,
      plan,
    });
    return jsonResponse(value, response.status);
  }

  if (sessionMatch && sessionMatch[2] && request.method === "POST") {
    const sessionId = decodeURIComponent(sessionMatch[1]!);
    if (!validId(sessionId)) return jsonResponse({ ok: false, code: "SESSION_ID_INVALID" }, 400);
    const body = await readBoundedJson(request);
    const { response, value } = await callDurable(authority, "/session/mutate", {
      actor,
      sessionId,
      operation: sessionMatch[2] === "events" ? "event" : "task",
      expectedAdmission,
      record: body,
    });
    return jsonResponse(value, response.status);
  }

  return jsonResponse({ ok: false, code: "NOT_FOUND" }, 404);
}

async function handleFetch(
  request: Request,
  env: AliceWorkerEnv,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
    if (!path.startsWith("/control/internal/")) {
      const origin = validateAliceOwnerOrigin(request);
      if (!origin.ok) {
        return jsonResponse({ ok: false, code: origin.code }, origin.code.endsWith("HOST_DENIED") ? 404 : 403);
      }
    }
    if (path.startsWith("/control/internal/")) {
      const admitted = await runtimeConfig(env).catch(() => null);
      if (path.startsWith("/control/internal/v1/deployment/")) {
        return await handleDeploymentController(request, env, admitted, path);
      }
      return await handleInternal(request, env, admitted, path);
    }
    const owner = await requireOwner(request, loadOwnerAccessConfig(env));
    if (!owner.ok) return owner.response;
    if (path === "/control") {
      const config = await runtimeConfig(env).catch(() => null);
      const authority = env.ALICE_AUTHORITY.getByName(authorityDurableName());
      const admission = config
        ? await callDurable(authority, "/release/check")
        : null;
      const admitted = Boolean(admission?.response.ok && admission.value.allowed === true);
      return jsonResponse({
        ok: true,
        service: "alice-production-control",
        health: "/control/health",
        safetyState: "/control/api/v1/state",
        releaseAdmission: admitted ? "admitted" : "denied",
        releaseDigest: admitted ? config!.binding.releaseDigest : null,
      });
    }
    return await handleOwnerApi(request, env, owner.actor, path);
  } catch (error) {
    const code = error instanceof Error && error.message.startsWith("REQUEST_BODY_")
      ? error.message
      : "CONTROL_FAIL_CLOSED";
    const status = code.startsWith("REQUEST_BODY_") ? 400 : 503;
    console.error(JSON.stringify({ code, requestId, service: "alice-production-control" }));
    return jsonResponse({ ok: false, code, requestId }, status);
  }
}

export default {
  fetch: handleFetch,
  async queue(
    batch: MessageBatch<EvidenceQueueEnvelope>,
    env: AliceWorkerEnv,
  ): Promise<void> {
    for (const message of batch.messages) {
      try {
        const record = await verifyEvidenceQueueEnvelope(
          message.body,
          env.ALICE_EVIDENCE_QUEUE_HMAC_KEY,
        );
        await persistEvidenceObject(env.ALICE_EVIDENCE, record, message.body.mac);
        message.ack();
      } catch {
        message.retry({ delaySeconds: 10 });
      }
    }
  },
} satisfies ExportedHandler<AliceWorkerEnv, EvidenceQueueEnvelope>;

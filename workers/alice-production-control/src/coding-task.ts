import { validAliceCodingRepositoryTarget } from "./authority";
import type { ActionIntent, CapabilityGrant } from "./policy";
import { canonicalJson } from "./program";

export type AliceCodingRequest = {
  repository: string;
  baseCommit: string;
  prompt: string;
  delivery?: "pull-request";
};

export function aliceCodingAction(request: AliceCodingRequest):
  "coding.patch.sandbox" | "coding.pr.create" {
  return request.delivery === "pull-request" ? "coding.pr.create" : "coding.patch.sandbox";
}

export type PreparedAliceCodingTask = {
  taskId: string;
  request: AliceCodingRequest;
  argumentHash: string;
  intent: ActionIntent;
};

function validCodingRequest(value: unknown): value is AliceCodingRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  return (
    (Object.keys(request).sort().join(",") === "baseCommit,prompt,repository" ||
      (Object.keys(request).sort().join(",") === "baseCommit,delivery,prompt,repository" &&
        request.delivery === "pull-request")) &&
    validAliceCodingRepositoryTarget(request.repository) &&
    typeof request.baseCommit === "string" &&
    /^[a-f0-9]{40}$/.test(request.baseCommit) &&
    typeof request.prompt === "string" &&
    request.prompt.trim().length > 0 &&
    new TextEncoder().encode(request.prompt).byteLength <= 16_384
  );
}

export function parseAliceCodingRequest(value: unknown): AliceCodingRequest {
  if (!validCodingRequest(value)) throw new Error("CODING_REQUEST_INVALID");
  return value;
}

export async function aliceCodingArgumentHash(value: unknown): Promise<string> {
  parseAliceCodingRequest(value);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJson(value)),
  );
  return `sha256:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
}

/** The passkey grant is consumed only by the authority after this exact match. */
export async function prepareAliceCodingTask(
  value: unknown,
  grant: CapabilityGrant,
): Promise<PreparedAliceCodingTask> {
  const argumentHash = await aliceCodingArgumentHash(value);
  const request = value as AliceCodingRequest;
  if (
    grant.scope !== aliceCodingAction(request) ||
    grant.target !== request.repository ||
    grant.argumentHash !== argumentHash ||
    !/^cap-[a-f0-9-]{36}$/.test(grant.capabilityId)
  ) {
    throw new Error("CODING_GRANT_MISMATCH");
  }
  return {
    taskId: `task-${grant.capabilityId}`,
    request,
    argumentHash,
    intent: {
      intentId: `intent-${grant.capabilityId}`,
      action: aliceCodingAction(request),
      target: request.repository,
      argumentHash,
      nonce: grant.nonce,
      expiresAt: grant.expiresAt,
      capabilityId: grant.capabilityId,
      programDigest: grant.programDigest,
      releaseDigest: grant.releaseDigest,
      policyHash: grant.policyHash,
    },
  };
}

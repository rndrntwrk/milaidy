import { canonicalJson } from "./program";
import type { ReleaseBinding } from "./policy";

const encoder = new TextEncoder();
const PAUSE_SCOPES = new Set([
  "all",
  "social",
  "trading",
  "stream",
  "coding",
  "model",
  "modal",
  "signer",
  "release",
]);

export type RecoveryReceiptPayload = {
  schemaVersion: "alice.recovery-receipt.v3";
  action: "control.resume";
  scope: string;
  pauseId: string;
  pausedAt: number;
  subject: string;
  pauseBinding: ReleaseBinding;
  pauseDeploymentManifestSha256: string;
  pauseRollbackBoundary: string;
  currentBinding: ReleaseBinding;
  currentDeploymentManifestSha256: string;
  currentReleaseEpoch: number;
  currentRollbackBoundary: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export type RecoveryReceiptExpectation = {
  recoveryToken: string;
  scope: string;
  pauseId: string;
  pausedAt: number;
  subject: string;
  pauseBinding: ReleaseBinding;
  pauseDeploymentManifestSha256: string;
  pauseRollbackBoundary: string;
  currentBinding: ReleaseBinding;
  currentDeploymentManifestSha256: string;
  currentReleaseEpoch: number;
  currentRollbackBoundary: string;
  now: number;
};

export type ReleaseRollbackReceiptPayload = {
  schemaVersion: "alice.release-rollback-receipt.v2";
  action: "release.rollback";
  subject: string;
  currentBinding: ReleaseBinding;
  currentDeploymentManifestSha256: string;
  currentReleaseEpoch: number;
  currentRollbackBoundary: string;
  targetBinding: ReleaseBinding;
  targetDeploymentManifestSha256: string;
  targetReleaseEpoch: number;
  targetRollbackBoundary: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

export type ReleaseRollbackReceiptExpectation = {
  recoveryToken: string;
  subject: string;
  currentBinding: ReleaseBinding;
  currentDeploymentManifestSha256: string;
  currentReleaseEpoch: number;
  currentRollbackBoundary: string;
  targetBinding: ReleaseBinding;
  targetDeploymentManifestSha256: string;
  targetReleaseEpoch: number;
  targetRollbackBoundary: string;
  now: number;
};

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function validBinding(value: unknown): value is ReleaseBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as ReleaseBinding;
  return (
    Object.keys(binding).sort().join(",") === "policyHash,programDigest,releaseDigest" &&
    validDigest(binding.programDigest) &&
    validDigest(binding.releaseDigest) &&
    validDigest(binding.policyHash)
  );
}

function validPayload(value: unknown): value is RecoveryReceiptPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as RecoveryReceiptPayload;
  return (
    Object.keys(payload).sort().join(",") ===
      "action,currentBinding,currentDeploymentManifestSha256,currentReleaseEpoch,currentRollbackBoundary,expiresAt,issuedAt,nonce,pauseBinding,pauseDeploymentManifestSha256,pauseId,pauseRollbackBoundary,pausedAt,schemaVersion,scope,subject" &&
    payload.schemaVersion === "alice.recovery-receipt.v3" &&
    payload.action === "control.resume" &&
    PAUSE_SCOPES.has(payload.scope) &&
    /^pause-[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(payload.pauseId) &&
    Number.isSafeInteger(payload.pausedAt) &&
    payload.pausedAt > 0 &&
    /^owner:sha256:[a-f0-9]{64}$/.test(payload.subject) &&
    validBinding(payload.pauseBinding) &&
    validDigest(payload.pauseDeploymentManifestSha256) &&
    validRollbackBoundary(payload.pauseRollbackBoundary) &&
    validBinding(payload.currentBinding) &&
    validDigest(payload.currentDeploymentManifestSha256) &&
    Number.isSafeInteger(payload.currentReleaseEpoch) &&
    payload.currentReleaseEpoch >= 0 &&
    validRollbackBoundary(payload.currentRollbackBoundary) &&
    Number.isSafeInteger(payload.issuedAt) &&
    Number.isSafeInteger(payload.expiresAt) &&
    payload.expiresAt > payload.issuedAt &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(payload.nonce)
  );
}

function validRollbackBoundary(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 256;
}

function validReleaseRollbackPayload(
  value: unknown,
): value is ReleaseRollbackReceiptPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as ReleaseRollbackReceiptPayload;
  return (
    Object.keys(payload).sort().join(",") ===
      "action,currentBinding,currentDeploymentManifestSha256,currentReleaseEpoch,currentRollbackBoundary,expiresAt,issuedAt,nonce,schemaVersion,subject,targetBinding,targetDeploymentManifestSha256,targetReleaseEpoch,targetRollbackBoundary" &&
    payload.schemaVersion === "alice.release-rollback-receipt.v2" &&
    payload.action === "release.rollback" &&
    /^owner:sha256:[a-f0-9]{64}$/.test(payload.subject) &&
    validBinding(payload.currentBinding) &&
    validDigest(payload.currentDeploymentManifestSha256) &&
    validBinding(payload.targetBinding) &&
    validDigest(payload.targetDeploymentManifestSha256) &&
    payload.currentBinding.policyHash === payload.targetBinding.policyHash &&
    Number.isSafeInteger(payload.currentReleaseEpoch) &&
    payload.currentReleaseEpoch > 0 &&
    Number.isSafeInteger(payload.targetReleaseEpoch) &&
    payload.targetReleaseEpoch > 0 &&
    payload.currentReleaseEpoch !== payload.targetReleaseEpoch &&
    validRollbackBoundary(payload.currentRollbackBoundary) &&
    validRollbackBoundary(payload.targetRollbackBoundary) &&
    Number.isSafeInteger(payload.issuedAt) &&
    Number.isSafeInteger(payload.expiresAt) &&
    payload.expiresAt > payload.issuedAt &&
    /^[a-zA-Z0-9][a-zA-Z0-9._:-]{7,127}$/.test(payload.nonce)
  );
}

function bindingsMatch(left: ReleaseBinding, right: ReleaseBinding): boolean {
  return (
    left.programDigest === right.programDigest &&
    left.releaseDigest === right.releaseDigest &&
    left.policyHash === right.policyHash
  );
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(recoveryToken: string): Promise<CryptoKey> {
  if (typeof recoveryToken !== "string" || recoveryToken.length < 32) {
    throw new Error("RECOVERY_RECEIPT_INVALID");
  }
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(recoveryToken),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  const hex = Array.from(
    new Uint8Array(digest),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

export async function signRecoveryReceipt(
  payload: RecoveryReceiptPayload,
  recoveryToken: string,
): Promise<string> {
  if (!validPayload(payload)) throw new Error("RECOVERY_RECEIPT_INVALID");
  const key = await hmacKey(recoveryToken);
  const encodedPayload = toBase64Url(encoder.encode(canonicalJson(payload)));
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function signReleaseRollbackReceipt(
  payload: ReleaseRollbackReceiptPayload,
  recoveryToken: string,
): Promise<string> {
  if (!validReleaseRollbackPayload(payload)) {
    throw new Error("RELEASE_ROLLBACK_RECEIPT_INVALID");
  }
  let key: CryptoKey;
  try {
    key = await hmacKey(recoveryToken);
  } catch {
    throw new Error("RELEASE_ROLLBACK_RECEIPT_INVALID");
  }
  const encodedPayload = toBase64Url(encoder.encode(canonicalJson(payload)));
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload));
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyRecoveryReceipt(
  receipt: string,
  expected: RecoveryReceiptExpectation,
): Promise<
  | { ok: true; receiptHash: string }
  | {
      ok: false;
      code:
        | "RECOVERY_RECEIPT_INVALID"
        | "RECOVERY_RECEIPT_BINDING_MISMATCH"
        | "RECOVERY_RECEIPT_NOT_CURRENT";
    }
> {
  if (typeof receipt !== "string" || receipt.length < 32 || receipt.length > 4096) {
    return { ok: false, code: "RECOVERY_RECEIPT_INVALID" };
  }
  const parts = receipt.split(".");
  if (parts.length !== 2) return { ok: false, code: "RECOVERY_RECEIPT_INVALID" };
  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) {
    return { ok: false, code: "RECOVERY_RECEIPT_INVALID" };
  }
  const payloadBytes = fromBase64Url(encodedPayload);
  const signature = fromBase64Url(encodedSignature);
  if (!payloadBytes || !signature || signature.byteLength !== 32) {
    return { ok: false, code: "RECOVERY_RECEIPT_INVALID" };
  }

  let key: CryptoKey;
  try {
    key = await hmacKey(expected.recoveryToken);
  } catch {
    return { ok: false, code: "RECOVERY_RECEIPT_INVALID" };
  }
  const signatureValid = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(encodedPayload),
  );
  if (!signatureValid) return { ok: false, code: "RECOVERY_RECEIPT_INVALID" };

  let payload: RecoveryReceiptPayload;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(payloadBytes),
    );
  } catch {
    return { ok: false, code: "RECOVERY_RECEIPT_INVALID" };
  }
  if (
    !validPayload(payload) ||
    toBase64Url(encoder.encode(canonicalJson(payload))) !== encodedPayload
  ) {
    return { ok: false, code: "RECOVERY_RECEIPT_INVALID" };
  }
  if (
    payload.scope !== expected.scope ||
    payload.pauseId !== expected.pauseId ||
    payload.pausedAt !== expected.pausedAt ||
    payload.subject !== expected.subject ||
    !bindingsMatch(payload.pauseBinding, expected.pauseBinding) ||
    payload.pauseDeploymentManifestSha256 !== expected.pauseDeploymentManifestSha256 ||
    payload.pauseRollbackBoundary !== expected.pauseRollbackBoundary ||
    !bindingsMatch(payload.currentBinding, expected.currentBinding) ||
    payload.currentDeploymentManifestSha256 !== expected.currentDeploymentManifestSha256 ||
    payload.currentReleaseEpoch !== expected.currentReleaseEpoch ||
    payload.currentRollbackBoundary !== expected.currentRollbackBoundary
  ) {
    return { ok: false, code: "RECOVERY_RECEIPT_BINDING_MISMATCH" };
  }
  if (
    !Number.isSafeInteger(expected.now) ||
    payload.issuedAt > expected.now ||
    payload.expiresAt <= expected.now ||
    payload.expiresAt - payload.issuedAt > 300_000
  ) {
    return { ok: false, code: "RECOVERY_RECEIPT_NOT_CURRENT" };
  }
  return { ok: true, receiptHash: await sha256(receipt) };
}

export async function verifyReleaseRollbackReceipt(
  receipt: string,
  expected: ReleaseRollbackReceiptExpectation,
): Promise<
  | { ok: true; receiptHash: string }
  | {
      ok: false;
      code:
        | "RELEASE_ROLLBACK_RECEIPT_INVALID"
        | "RELEASE_ROLLBACK_RECEIPT_BINDING_MISMATCH"
        | "RELEASE_ROLLBACK_RECEIPT_NOT_CURRENT";
    }
> {
  if (typeof receipt !== "string" || receipt.length < 32 || receipt.length > 4096) {
    return { ok: false, code: "RELEASE_ROLLBACK_RECEIPT_INVALID" };
  }
  const parts = receipt.split(".");
  if (parts.length !== 2) {
    return { ok: false, code: "RELEASE_ROLLBACK_RECEIPT_INVALID" };
  }
  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) {
    return { ok: false, code: "RELEASE_ROLLBACK_RECEIPT_INVALID" };
  }
  const payloadBytes = fromBase64Url(encodedPayload);
  const signature = fromBase64Url(encodedSignature);
  if (!payloadBytes || !signature || signature.byteLength !== 32) {
    return { ok: false, code: "RELEASE_ROLLBACK_RECEIPT_INVALID" };
  }

  let key: CryptoKey;
  try {
    key = await hmacKey(expected.recoveryToken);
  } catch {
    return { ok: false, code: "RELEASE_ROLLBACK_RECEIPT_INVALID" };
  }
  if (
    !(await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      encoder.encode(encodedPayload),
    ))
  ) {
    return { ok: false, code: "RELEASE_ROLLBACK_RECEIPT_INVALID" };
  }

  let payload: ReleaseRollbackReceiptPayload;
  try {
    payload = JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(payloadBytes),
    );
  } catch {
    return { ok: false, code: "RELEASE_ROLLBACK_RECEIPT_INVALID" };
  }
  if (
    !validReleaseRollbackPayload(payload) ||
    toBase64Url(encoder.encode(canonicalJson(payload))) !== encodedPayload
  ) {
    return { ok: false, code: "RELEASE_ROLLBACK_RECEIPT_INVALID" };
  }
  if (
    payload.subject !== expected.subject ||
    !bindingsMatch(payload.currentBinding, expected.currentBinding) ||
    payload.currentDeploymentManifestSha256 !== expected.currentDeploymentManifestSha256 ||
    payload.currentReleaseEpoch !== expected.currentReleaseEpoch ||
    payload.currentRollbackBoundary !== expected.currentRollbackBoundary ||
    !bindingsMatch(payload.targetBinding, expected.targetBinding) ||
    payload.targetDeploymentManifestSha256 !== expected.targetDeploymentManifestSha256 ||
    payload.targetReleaseEpoch !== expected.targetReleaseEpoch ||
    payload.targetRollbackBoundary !== expected.targetRollbackBoundary
  ) {
    return { ok: false, code: "RELEASE_ROLLBACK_RECEIPT_BINDING_MISMATCH" };
  }
  if (
    !Number.isSafeInteger(expected.now) ||
    payload.issuedAt > expected.now ||
    payload.expiresAt <= expected.now ||
    payload.expiresAt - payload.issuedAt > 300_000
  ) {
    return { ok: false, code: "RELEASE_ROLLBACK_RECEIPT_NOT_CURRENT" };
  }
  return { ok: true, receiptHash: await sha256(receipt) };
}

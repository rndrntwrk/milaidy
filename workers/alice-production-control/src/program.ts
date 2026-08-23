import {
  ALICE_AUTONOMOUS_ACTIONS,
  ALICE_CAPABILITY_ACTIONS,
  ALICE_DISABLED_ACTIONS,
} from "./policy";

const encoder = new TextEncoder();

export type ProgramEnvelope = {
  schemaVersion: "alice.program-envelope.v1";
  programId: string;
  issuedAt: string;
  expiresAt: string;
  release: {
    releaseEpoch: number;
    sourceCommit: string;
    deploymentControllerCommit: string;
    runtimeImage: string;
    runtimeBuildManifestSha256: string;
    deploymentManifestSha256: string;
    elizaCommit: string;
    modalRevision: number;
    policyHash: string;
    rollbackBoundary: string;
  };
  autonomy: {
    autonomousActions: string[];
    capabilityActions: string[];
    disabledActions: string[];
  };
};

export const MAX_PROGRAM_ENVELOPE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

const EXPECTED_AUTONOMOUS_ACTIONS = new Set(ALICE_AUTONOMOUS_ACTIONS);
const EXPECTED_CAPABILITY_ACTIONS = new Set(ALICE_CAPABILITY_ACTIONS);
const EXPECTED_DISABLED_ACTIONS = new Set(ALICE_DISABLED_ACTIONS);

function serializeCanonical(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeCanonical(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => {
        const item = record[key];
        if (item === undefined) throw new TypeError("Canonical JSON rejects undefined values");
        return `${JSON.stringify(key)}:${serializeCanonical(item)}`;
      })
      .join(",")}}`;
  }
  throw new TypeError("Canonical JSON rejects unsupported values");
}

export function canonicalJson(value: unknown): string {
  return serializeCanonical(value);
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

function exactSet(actual: unknown, expected: Set<string>): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.size &&
    new Set(actual).size === expected.size &&
    actual.every((value) => typeof value === "string" && expected.has(value))
  );
}

function exactPlainObject(value: unknown, expectedKeys: string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.keys(value as Record<string, unknown>).sort().join(",") ===
      [...expectedKeys].sort().join(",")
  );
}

function validEnvelope(value: ProgramEnvelope): boolean {
  if (
    !exactPlainObject(value, [
      "autonomy",
      "expiresAt",
      "issuedAt",
      "programId",
      "release",
      "schemaVersion",
    ]) ||
    !exactPlainObject(value.release, [
      "deploymentControllerCommit",
      "deploymentManifestSha256",
      "elizaCommit",
      "modalRevision",
      "policyHash",
      "releaseEpoch",
      "rollbackBoundary",
      "runtimeBuildManifestSha256",
      "runtimeImage",
      "sourceCommit",
    ]) ||
    !exactPlainObject(value.autonomy, [
      "autonomousActions",
      "capabilityActions",
      "disabledActions",
    ])
  ) {
    return false;
  }
  const issuedAt = Date.parse(value.issuedAt);
  const expiresAt = Date.parse(value.expiresAt);
  return (
    value.schemaVersion === "alice.program-envelope.v1" &&
    typeof value.programId === "string" &&
    value.programId.length >= 8 &&
    Number.isFinite(issuedAt) &&
    Number.isFinite(expiresAt) &&
    new Date(issuedAt).toISOString() === value.issuedAt &&
    new Date(expiresAt).toISOString() === value.expiresAt &&
    expiresAt > issuedAt &&
    expiresAt - issuedAt <= MAX_PROGRAM_ENVELOPE_LIFETIME_MS &&
    Number.isSafeInteger(value.release?.releaseEpoch) &&
    value.release.releaseEpoch > 0 &&
    /^[a-f0-9]{40}$/.test(value.release?.sourceCommit) &&
    /^[a-f0-9]{40}$/.test(value.release?.deploymentControllerCommit) &&
    /^ghcr\.io\/rndrntwrk\/milaidy-agent@sha256:[a-f0-9]{64}$/.test(
      value.release?.runtimeImage,
    ) &&
    /^sha256:[a-f0-9]{64}$/.test(
      value.release?.runtimeBuildManifestSha256,
    ) &&
    /^sha256:[a-f0-9]{64}$/.test(value.release?.deploymentManifestSha256) &&
    /^[a-f0-9]{40}$/.test(value.release?.elizaCommit) &&
    Number.isInteger(value.release?.modalRevision) &&
    value.release.modalRevision >= 49 &&
    /^sha256:[a-f0-9]{64}$/.test(value.release?.policyHash) &&
    typeof value.release?.rollbackBoundary === "string" &&
    value.release.rollbackBoundary ===
      `modal:alice-runtime:v${value.release.modalRevision}` &&
    exactSet(value.autonomy?.autonomousActions, EXPECTED_AUTONOMOUS_ACTIONS) &&
    exactSet(value.autonomy?.capabilityActions, EXPECTED_CAPABILITY_ACTIONS) &&
    exactSet(value.autonomy?.disabledActions, EXPECTED_DISABLED_ACTIONS)
  );
}

export async function digestProgramEnvelope(envelope: ProgramEnvelope): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(canonicalJson(envelope)));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export async function digestReleaseIdentity(envelope: ProgramEnvelope): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(canonicalJson(envelope.release)),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

export async function verifyProgramEnvelope(
  envelope: ProgramEnvelope,
  signatureBase64Url: string,
  publicJwk: JsonWebKey,
): Promise<
  { ok: true; programDigest: string } | { ok: false; code: "PROGRAM_ENVELOPE_INVALID" | "PROGRAM_SIGNATURE_INVALID" }
> {
  if (!validEnvelope(envelope)) {
    return { ok: false, code: "PROGRAM_ENVELOPE_INVALID" };
  }
  const signature = fromBase64Url(signatureBase64Url);
  if (!signature) return { ok: false, code: "PROGRAM_SIGNATURE_INVALID" };

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      signature,
      encoder.encode(canonicalJson(envelope)),
    );
    if (!verified) return { ok: false, code: "PROGRAM_SIGNATURE_INVALID" };
  } catch {
    return { ok: false, code: "PROGRAM_SIGNATURE_INVALID" };
  }

  return { ok: true, programDigest: await digestProgramEnvelope(envelope) };
}

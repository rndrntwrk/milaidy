export const ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION =
  "alice.credential-snapshot.v1" as const;
export const ALICE_CREDENTIAL_OWNER_ID = "alice-owner-production" as const;
export const ALICE_CREDENTIAL_PROVIDER_ID = "openai-codex" as const;
export const ALICE_CREDENTIAL_MAX_FILES = 64;
export const ALICE_CREDENTIAL_MAX_FILE_BYTES = 96 * 1024;
export const ALICE_CREDENTIAL_MAX_AGGREGATE_BYTES = 128 * 1024;

export type CredentialSnapshotFileMode = 0o600 | 0o644;
export type Sha256Digest = `sha256:${string}`;

export interface AliceCredentialSnapshotFileV1 {
  relativePath: string;
  mode: CredentialSnapshotFileMode;
  size: number;
  sha256: Sha256Digest;
  bytesBase64: string;
}

export interface AliceCredentialSnapshotV1 {
  schemaVersion: typeof ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION;
  ownerId: typeof ALICE_CREDENTIAL_OWNER_ID;
  providerId: typeof ALICE_CREDENTIAL_PROVIDER_ID;
  generation: number;
  files: AliceCredentialSnapshotFileV1[];
  snapshotSha256: Sha256Digest;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface CredentialSnapshotValidationPolicy {
  ownerId?: typeof ALICE_CREDENTIAL_OWNER_ID;
  providerId?: typeof ALICE_CREDENTIAL_PROVIDER_ID;
  maxFiles?: number;
  maxFileBytes?: number;
  maxAggregateBytes?: number;
}

export type CredentialSnapshotValidationCode =
  | "credential_snapshot_invalid"
  | "credential_snapshot_schema_invalid"
  | "credential_snapshot_owner_invalid"
  | "credential_snapshot_provider_invalid"
  | "credential_snapshot_generation_invalid"
  | "credential_snapshot_timestamp_invalid"
  | "credential_snapshot_files_invalid"
  | "credential_snapshot_file_count_exceeded"
  | "credential_snapshot_file_invalid"
  | "credential_snapshot_path_invalid"
  | "credential_snapshot_path_duplicate"
  | "credential_snapshot_mode_invalid"
  | "credential_snapshot_size_invalid"
  | "credential_snapshot_file_size_exceeded"
  | "credential_snapshot_aggregate_size_exceeded"
  | "credential_snapshot_base64_invalid"
  | "credential_snapshot_size_mismatch"
  | "credential_snapshot_digest_invalid"
  | "credential_snapshot_file_digest_mismatch"
  | "credential_snapshot_digest_mismatch"
  | "credential_snapshot_account_missing";

export class CredentialStateValidationError extends Error {
  readonly code: CredentialSnapshotValidationCode;
  readonly context: Readonly<Record<string, string | number | boolean | null>>;

  constructor(
    code: CredentialSnapshotValidationCode,
    message: string,
    context: Record<string, string | number | boolean | null> = {},
  ) {
    super(message);
    this.name = "CredentialStateValidationError";
    this.code = code;
    this.context = Object.freeze({ ...context });
  }
}

function failure(
  code: CredentialSnapshotValidationCode,
  message: string,
  context?: Record<string, string | number | boolean | null>,
): never {
  throw new CredentialStateValidationError(code, message, context);
}

function compareCanonicalPath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ACCOUNT_PATH_PATTERN =
  /^auth\/openai-codex\/([A-Za-z0-9][A-Za-z0-9._@-]{0,127})\.json$/;
const FIXED_METADATA_PATHS = new Set([
  "auth/.credential-storage-generation",
  "auth/_pool-metadata.json",
]);

function validateRelativePath(value: unknown, index: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    value
      .split("/")
      .some(
        (segment) => segment === "" || segment === "." || segment === "..",
      )
  ) {
    failure(
      "credential_snapshot_path_invalid",
      "Credential snapshot contains a non-canonical relative path",
      { fileIndex: index },
    );
  }

  if (FIXED_METADATA_PATHS.has(value)) return value;

  const match = ACCOUNT_PATH_PATTERN.exec(value);
  const accountId = match?.[1];
  if (!accountId || accountId.includes("..")) {
    failure(
      "credential_snapshot_path_invalid",
      "Credential snapshot path is outside the admitted OpenAI credential inventory",
      { fileIndex: index },
    );
  }
  return value;
}

function decodeCanonicalBase64(value: unknown, index: number): Uint8Array {
  if (
    typeof value !== "string" ||
    value.length % 4 !== 0 ||
    !BASE64_PATTERN.test(value)
  ) {
    failure(
      "credential_snapshot_base64_invalid",
      "Credential snapshot file bytes are not canonical Base64",
      { fileIndex: index },
    );
  }

  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let offset = 0; offset < binary.length; offset += 1) {
      bytes[offset] = binary.charCodeAt(offset);
    }
    let roundTrip = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      roundTrip += String.fromCharCode(
        ...bytes.subarray(offset, offset + 0x8000),
      );
    }
    if (btoa(roundTrip) !== value) {
      failure(
        "credential_snapshot_base64_invalid",
        "Credential snapshot file bytes are not canonical Base64",
        { fileIndex: index },
      );
    }
    return bytes;
  } catch (error) {
    if (error instanceof CredentialStateValidationError) throw error;
    failure(
      "credential_snapshot_base64_invalid",
      "Credential snapshot file bytes are not valid Base64",
      { fileIndex: index },
    );
  }
}

function normalizeDigest(
  value: unknown,
  code: CredentialSnapshotValidationCode,
  context: Record<string, string | number | boolean | null> = {},
): Sha256Digest {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) {
    failure(code, "Credential snapshot digest is not canonical SHA-256", context);
  }
  return value as Sha256Digest;
}

export async function sha256CredentialBytes(
  bytes: ArrayBuffer | ArrayBufferView,
): Promise<Sha256Digest> {
  const view =
    bytes instanceof ArrayBuffer
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", view));
  let hex = "";
  for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
  return `sha256:${hex}`;
}

export function canonicalCredentialManifest(
  snapshot: Pick<
    AliceCredentialSnapshotV1,
    "schemaVersion" | "ownerId" | "providerId" | "generation" | "files"
  >,
): string {
  const files = [...snapshot.files]
    .map((file) => ({
      relativePath: file.relativePath,
      mode: file.mode,
      size: file.size,
      sha256: file.sha256,
    }))
    .sort((left, right) =>
      compareCanonicalPath(left.relativePath, right.relativePath),
    );

  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    ownerId: snapshot.ownerId,
    providerId: snapshot.providerId,
    generation: snapshot.generation,
    files,
  });
}

export async function validateCredentialSnapshot(
  value: unknown,
  policy: CredentialSnapshotValidationPolicy = {},
): Promise<AliceCredentialSnapshotV1> {
  if (!isRecord(value)) {
    failure("credential_snapshot_invalid", "Credential snapshot must be an object");
  }

  const ownerId = policy.ownerId ?? ALICE_CREDENTIAL_OWNER_ID;
  const providerId = policy.providerId ?? ALICE_CREDENTIAL_PROVIDER_ID;
  const maxFiles = policy.maxFiles ?? ALICE_CREDENTIAL_MAX_FILES;
  const maxFileBytes = policy.maxFileBytes ?? ALICE_CREDENTIAL_MAX_FILE_BYTES;
  const maxAggregateBytes =
    policy.maxAggregateBytes ?? ALICE_CREDENTIAL_MAX_AGGREGATE_BYTES;

  if (value.schemaVersion !== ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION) {
    failure(
      "credential_snapshot_schema_invalid",
      "Credential snapshot schema version is not admitted",
    );
  }
  if (value.ownerId !== ownerId) {
    failure(
      "credential_snapshot_owner_invalid",
      "Credential snapshot owner does not match the runtime policy",
    );
  }
  if (value.providerId !== providerId) {
    failure(
      "credential_snapshot_provider_invalid",
      "Credential snapshot provider does not match the runtime policy",
    );
  }
  if (!safeInteger(value.generation)) {
    failure(
      "credential_snapshot_generation_invalid",
      "Credential snapshot generation must be a non-negative safe integer",
    );
  }
  if (
    !safeInteger(value.createdAtMs) ||
    !safeInteger(value.updatedAtMs) ||
    value.updatedAtMs < value.createdAtMs
  ) {
    failure(
      "credential_snapshot_timestamp_invalid",
      "Credential snapshot timestamps are invalid",
    );
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    failure(
      "credential_snapshot_files_invalid",
      "Credential snapshot must contain at least one admitted file",
    );
  }
  if (value.files.length > maxFiles) {
    failure(
      "credential_snapshot_file_count_exceeded",
      "Credential snapshot exceeds the admitted file count",
      { maxFiles },
    );
  }

  const seenPaths = new Set<string>();
  const normalizedFiles: AliceCredentialSnapshotFileV1[] = [];
  let aggregateBytes = 0;
  let accountFileCount = 0;

  for (let index = 0; index < value.files.length; index += 1) {
    const candidate = value.files[index];
    if (!isRecord(candidate)) {
      failure(
        "credential_snapshot_file_invalid",
        "Credential snapshot file entry must be an object",
        { fileIndex: index },
      );
    }

    const relativePath = validateRelativePath(candidate.relativePath, index);
    if (seenPaths.has(relativePath)) {
      failure(
        "credential_snapshot_path_duplicate",
        "Credential snapshot contains a duplicate relative path",
        { fileIndex: index },
      );
    }
    seenPaths.add(relativePath);
    if (relativePath.startsWith("auth/openai-codex/")) accountFileCount += 1;

    if (candidate.mode !== 0o600 && candidate.mode !== 0o644) {
      failure(
        "credential_snapshot_mode_invalid",
        "Credential snapshot file mode is not admitted",
        { fileIndex: index },
      );
    }
    if (!safeInteger(candidate.size)) {
      failure(
        "credential_snapshot_size_invalid",
        "Credential snapshot file size must be a non-negative safe integer",
        { fileIndex: index },
      );
    }
    if (candidate.size > maxFileBytes) {
      failure(
        "credential_snapshot_file_size_exceeded",
        "Credential snapshot file exceeds the admitted decoded-byte limit",
        { fileIndex: index, maxFileBytes },
      );
    }

    const bytes = decodeCanonicalBase64(candidate.bytesBase64, index);
    if (bytes.byteLength !== candidate.size) {
      failure(
        "credential_snapshot_size_mismatch",
        "Credential snapshot file size does not match decoded bytes",
        { fileIndex: index },
      );
    }
    aggregateBytes += bytes.byteLength;
    if (aggregateBytes > maxAggregateBytes) {
      failure(
        "credential_snapshot_aggregate_size_exceeded",
        "Credential snapshot exceeds the admitted aggregate decoded-byte limit",
        { maxAggregateBytes },
      );
    }

    const sha256 = normalizeDigest(
      candidate.sha256,
      "credential_snapshot_digest_invalid",
      { fileIndex: index },
    );
    const actualSha256 = await sha256CredentialBytes(bytes);
    if (actualSha256 !== sha256) {
      failure(
        "credential_snapshot_file_digest_mismatch",
        "Credential snapshot file digest does not match decoded bytes",
        { fileIndex: index },
      );
    }

    normalizedFiles.push({
      relativePath,
      mode: candidate.mode,
      size: candidate.size,
      sha256,
      bytesBase64: candidate.bytesBase64 as string,
    });
  }

  if (accountFileCount === 0) {
    failure(
      "credential_snapshot_account_missing",
      "Credential snapshot contains no OpenAI account envelope",
    );
  }

  normalizedFiles.sort((left, right) =>
    compareCanonicalPath(left.relativePath, right.relativePath),
  );
  const snapshotSha256 = normalizeDigest(
    value.snapshotSha256,
    "credential_snapshot_digest_invalid",
  );
  const normalized: AliceCredentialSnapshotV1 = {
    schemaVersion: ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION,
    ownerId,
    providerId,
    generation: value.generation,
    files: normalizedFiles,
    snapshotSha256,
    createdAtMs: value.createdAtMs,
    updatedAtMs: value.updatedAtMs,
  };
  const actualSnapshotSha256 = await sha256CredentialBytes(
    new TextEncoder().encode(canonicalCredentialManifest(normalized)),
  );
  if (actualSnapshotSha256 !== snapshotSha256) {
    failure(
      "credential_snapshot_digest_mismatch",
      "Credential snapshot manifest digest does not match its canonical inventory",
    );
  }

  return Object.freeze({
    ...normalized,
    files: Object.freeze(
      normalizedFiles.map((file) => Object.freeze({ ...file })),
    ),
  }) as AliceCredentialSnapshotV1;
}

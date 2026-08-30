export const ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION =
  "alice.credential-snapshot.v1" as const;
export const ALICE_CREDENTIAL_OWNER_ID = "alice-owner-production" as const;
export const ALICE_CREDENTIAL_PROVIDER_ID = "openai-codex" as const;
export const ALICE_CREDENTIAL_STATE_PATH =
  "/v1/credential-state/openai-codex" as const;
export const ALICE_CREDENTIAL_MAX_FILES = 64;
export const ALICE_CREDENTIAL_MAX_FILE_BYTES = 96 * 1024;
export const ALICE_CREDENTIAL_MAX_AGGREGATE_BYTES = 128 * 1024;

export type CredentialSnapshotFileMode = 0o600 | 0o644;
export type AliceSha256Digest = `sha256:${string}`;

export interface AliceCredentialSnapshotFileV1 {
  relativePath: string;
  mode: CredentialSnapshotFileMode;
  size: number;
  sha256: AliceSha256Digest;
  bytesBase64: string;
}

export interface AliceCredentialSnapshotV1 {
  schemaVersion: typeof ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION;
  ownerId: typeof ALICE_CREDENTIAL_OWNER_ID;
  providerId: typeof ALICE_CREDENTIAL_PROVIDER_ID;
  generation: number;
  files: AliceCredentialSnapshotFileV1[];
  snapshotSha256: AliceSha256Digest;
  createdAtMs: number;
  updatedAtMs: number;
}

export type AliceCredentialStateScope =
  | "credential-bootstrap"
  | "credential-runtime"
  | "credential-release-manager";

export interface AliceCredentialStateGetSuccessV1 {
  ok: true;
  snapshot: AliceCredentialSnapshotV1;
}

export interface AliceCredentialStatePutRequestV1 {
  expectedGeneration: number | null;
  snapshot: AliceCredentialSnapshotV1;
}

export interface AliceCredentialStateDeleteRequestV1 {
  expectedGeneration: number;
}

export interface AliceCredentialStateDeleteSuccessV1 {
  ok: true;
  deleted: true;
  generation: number;
}

export interface AliceCredentialStateErrorV1 {
  ok: false;
  code: string;
  expectedGeneration?: number | null;
  actualGeneration?: number | null;
}

export function compareAliceCredentialPath(
  left: string,
  right: string,
): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalAliceCredentialManifest(
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
      compareAliceCredentialPath(left.relativePath, right.relativePath),
    );

  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    ownerId: snapshot.ownerId,
    providerId: snapshot.providerId,
    generation: snapshot.generation,
    files,
  });
}

import { describe, expect, test } from "bun:test";
import {
  ALICE_CREDENTIAL_MAX_AGGREGATE_BYTES,
  ALICE_CREDENTIAL_MAX_FILES,
  ALICE_CREDENTIAL_OWNER_ID,
  ALICE_CREDENTIAL_PROVIDER_ID,
  ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION,
  CredentialStateValidationError,
  canonicalCredentialManifest,
  sha256CredentialBytes,
  validateCredentialSnapshot,
  type AliceCredentialSnapshotV1,
} from "../src/credential-state";

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

async function credentialFile(
  relativePath: string,
  value: string,
  mode: 0o600 | 0o644 = 0o600,
) {
  const bytes = Buffer.from(value, "utf8");
  return {
    relativePath,
    mode,
    size: bytes.byteLength,
    sha256: await sha256CredentialBytes(bytes),
    bytesBase64: bytes.toString("base64"),
  } as const;
}

async function snapshot(
  overrides: Partial<AliceCredentialSnapshotV1> = {},
): Promise<AliceCredentialSnapshotV1> {
  const base: AliceCredentialSnapshotV1 = {
    schemaVersion: ALICE_CREDENTIAL_SNAPSHOT_SCHEMA_VERSION,
    ownerId: ALICE_CREDENTIAL_OWNER_ID,
    providerId: ALICE_CREDENTIAL_PROVIDER_ID,
    generation: 0,
    files: [
      await credentialFile(
        "auth/openai-codex/alice-primary.json",
        JSON.stringify({ schemaVersion: 2, ciphertext: "opaque-envelope" }),
      ),
      await credentialFile(
        "auth/.credential-storage-generation",
        "0\n",
        0o644,
      ),
    ],
    snapshotSha256: `sha256:${"0".repeat(64)}`,
    createdAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  };
  return {
    ...base,
    snapshotSha256: await sha256CredentialBytes(
      new TextEncoder().encode(canonicalCredentialManifest(base)),
    ),
  };
}

async function expectCode(
  value: unknown,
  code: string,
): Promise<CredentialStateValidationError> {
  try {
    await validateCredentialSnapshot(value);
  } catch (error) {
    expect(error).toBeInstanceOf(CredentialStateValidationError);
    expect((error as CredentialStateValidationError).code).toBe(code);
    return error as CredentialStateValidationError;
  }
  throw new Error(`Expected ${code}`);
}

describe("credential snapshot validation", () => {
  test("accepts and path-sorts a canonical opaque encrypted snapshot", async () => {
    const input = await snapshot({
      files: [
        await credentialFile("auth/_pool-metadata.json", "{}", 0o600),
        await credentialFile(
          "auth/openai-codex/alice-primary.json",
          JSON.stringify({ schemaVersion: 2, ciphertext: "opaque-envelope" }),
        ),
        await credentialFile(
          "auth/.credential-storage-generation",
          "0\n",
          0o644,
        ),
      ],
    });

    const result = await validateCredentialSnapshot(input);

    expect(result.files.map((file) => file.relativePath)).toEqual([
      "auth/.credential-storage-generation",
      "auth/_pool-metadata.json",
      "auth/openai-codex/alice-primary.json",
    ]);
    expect(result.providerId).toBe("openai-codex");
    expect(result.snapshotSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  test("rejects schema, owner, provider, and generation drift", async () => {
    await expectCode(
      { ...(await snapshot()), schemaVersion: "alice.credential-snapshot.v2" },
      "credential_snapshot_schema_invalid",
    );
    await expectCode(
      { ...(await snapshot()), ownerId: "someone-else" },
      "credential_snapshot_owner_invalid",
    );
    await expectCode(
      { ...(await snapshot()), providerId: "openai-api" },
      "credential_snapshot_provider_invalid",
    );
    await expectCode(
      { ...(await snapshot()), generation: -1 },
      "credential_snapshot_generation_invalid",
    );
    await expectCode(
      { ...(await snapshot()), generation: Number.MAX_SAFE_INTEGER + 1 },
      "credential_snapshot_generation_invalid",
    );
  });

  test("rejects traversal, backslashes, disallowed files, and unsafe account ids", async () => {
    for (const relativePath of [
      "../auth.json",
      "/auth/openai-codex/alice-primary.json",
      "auth\\openai-codex\\alice-primary.json",
      "auth/openai-codex/nested/alice-primary.json",
      "auth/openai-codex/a..b.json",
      "auth/openai-codex/.hidden.json",
      "auth/anthropic-subscription/alice-primary.json",
      "auth/openai-codex/alice-primary.tmp",
    ]) {
      const input = await snapshot({
        files: [await credentialFile(relativePath, "opaque")],
      });
      await expectCode(input, "credential_snapshot_path_invalid");
    }
  });

  test("rejects duplicate paths", async () => {
    const file = await credentialFile(
      "auth/openai-codex/alice-primary.json",
      "opaque",
    );
    await expectCode(
      await snapshot({ files: [file, { ...file }] }),
      "credential_snapshot_path_duplicate",
    );
  });

  test("rejects non-canonical base64 and declared-size mismatch", async () => {
    const nonCanonical = await snapshot();
    nonCanonical.files[0] = {
      ...nonCanonical.files[0]!,
      bytesBase64: `${nonCanonical.files[0]!.bytesBase64}\n`,
    };
    await expectCode(nonCanonical, "credential_snapshot_base64_invalid");

    const wrongSize = await snapshot();
    wrongSize.files[0] = {
      ...wrongSize.files[0]!,
      size: wrongSize.files[0]!.size + 1,
    };
    await expectCode(wrongSize, "credential_snapshot_size_mismatch");
  });

  test("rejects per-file and aggregate digest mismatch", async () => {
    const wrongFileDigest = await snapshot();
    wrongFileDigest.files[0] = {
      ...wrongFileDigest.files[0]!,
      sha256: `sha256:${"a".repeat(64)}`,
    };
    await expectCode(
      wrongFileDigest,
      "credential_snapshot_file_digest_mismatch",
    );

    const wrongSnapshotDigest = await snapshot();
    wrongSnapshotDigest.snapshotSha256 = `sha256:${"b".repeat(64)}`;
    await expectCode(
      wrongSnapshotDigest,
      "credential_snapshot_digest_mismatch",
    );
  });

  test("enforces file-count and aggregate decoded-byte limits", async () => {
    const files = await Promise.all(
      Array.from({ length: ALICE_CREDENTIAL_MAX_FILES + 1 }, (_, index) =>
        credentialFile(
          `auth/openai-codex/account-${index}.json`,
          `opaque-${index}`,
        ),
      ),
    );
    await expectCode(
      await snapshot({ files }),
      "credential_snapshot_file_count_exceeded",
    );

    const oversized = await snapshot({
      files: [
        await credentialFile(
          "auth/openai-codex/alice-primary.json",
          "x".repeat(ALICE_CREDENTIAL_MAX_AGGREGATE_BYTES + 1),
        ),
      ],
    });
    await expectCode(
      oversized,
      "credential_snapshot_file_size_exceeded",
    );
  });

  test("never includes opaque bytes in validation errors", async () => {
    const marker = "DO_NOT_ECHO_THIS_CREDENTIAL_MATERIAL";
    const input = await snapshot({
      files: [
        {
          relativePath: "../auth.json",
          mode: 0o600,
          size: marker.length,
          sha256: `sha256:${"0".repeat(64)}`,
          bytesBase64: encode(marker),
        },
      ],
    });

    const error = await expectCode(input, "credential_snapshot_path_invalid");
    expect(String(error)).not.toContain(marker);
    expect(JSON.stringify(error.context)).not.toContain(encode(marker));
  });
});

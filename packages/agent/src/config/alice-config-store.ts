import { promisify } from "node:util";
import { randomBytes, createCipheriv, createDecipheriv, pbkdf2 } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

type SqlRow = Record<string, unknown>;
type ConfigDatabase = {
  execute(query: SQL): Promise<{ rows: SqlRow[] }>;
};

const OWNER_ID = "alice-owner-production";
const TABLE = "alice_runtime_config";
const PBKDF2_ROUNDS = 210_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AAD = Buffer.from("alice-runtime-config/v1", "utf8");
const deriveKey = promisify(pbkdf2);

function decodeText(value: unknown): string {
  if (typeof value !== "string") throw new Error("ALICE_CONFIG_ROW_INVALID");
  return value;
}

async function derive(passphrase: string, salt: Buffer): Promise<Buffer> {
  return deriveKey(passphrase, salt, PBKDF2_ROUNDS, KEY_BYTES, "sha256");
}

async function seal(config: Record<string, unknown>, passphrase: string) {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", await derive(passphrase, salt), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(config), "utf8"),
    cipher.final(),
  ]);
  return {
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
    ciphertext: Buffer.concat([ciphertext, cipher.getAuthTag()]).toString("base64url"),
  };
}

async function open(row: SqlRow, passphrase: string): Promise<Record<string, unknown>> {
  try {
    const salt = Buffer.from(decodeText(row.salt), "base64url");
    const iv = Buffer.from(decodeText(row.iv), "base64url");
    const sealed = Buffer.from(decodeText(row.ciphertext), "base64url");
    if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || sealed.length < 17) {
      throw new Error("invalid ciphertext");
    }
    const decipher = createDecipheriv("aes-256-gcm", await derive(passphrase, salt), iv);
    decipher.setAAD(AAD);
    decipher.setAuthTag(sealed.subarray(-16));
    const text = Buffer.concat([
      decipher.update(sealed.subarray(0, -16)),
      decipher.final(),
    ]).toString("utf8");
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid config");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new Error("ALICE_CONFIG_DECRYPT_FAILED");
  }
}

function revision(row: SqlRow): number {
  const value = Number(row.revision);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error("ALICE_CONFIG_ROW_INVALID");
  return value;
}

export function createAliceConfigStore(input: {
  db: ConfigDatabase;
  passphrase: string;
}) {
  if (typeof input.passphrase !== "string" || input.passphrase.length < 32) {
    throw new Error("ALICE_CONFIG_PASSPHRASE_INVALID");
  }

  let initialized: Promise<void> | undefined;
  let knownRevision: number | undefined;
  const initialize = async () => {
    initialized ??= input.db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS ${TABLE} (
        owner_id TEXT PRIMARY KEY NOT NULL,
        revision INTEGER NOT NULL,
        salt TEXT NOT NULL,
        iv TEXT NOT NULL,
        ciphertext TEXT NOT NULL
      )
    `)).then(() => undefined);
    return initialized;
  };

  const load = async (): Promise<SqlRow | undefined> => {
    const result = await input.db.execute(sql`SELECT owner_id, revision, salt, iv, ciphertext
      FROM ${sql.raw(TABLE)} WHERE owner_id = ${OWNER_ID} LIMIT 1`);
    return result.rows[0];
  };

  return {
    async read(): Promise<Record<string, unknown> | null> {
      await initialize();
      const row = await load();
      if (!row) {
        knownRevision = 0;
        return null;
      }
      const value = await open(row, input.passphrase);
      knownRevision = revision(row);
      return value;
    },

    async write(config: Record<string, unknown>): Promise<void> {
      await initialize();
      let current = knownRevision === undefined ? await load() : undefined;
      if (knownRevision === undefined && current) knownRevision = revision(current);
      const expected = knownRevision;
      const sealed = await seal(config, input.passphrase);
      if (expected === undefined || expected === 0) {
        const inserted = await input.db.execute(sql`INSERT INTO ${sql.raw(TABLE)}
          (owner_id, revision, salt, iv, ciphertext)
          VALUES (${OWNER_ID}, 1, ${sealed.salt}, ${sealed.iv}, ${sealed.ciphertext})
          ON CONFLICT(owner_id) DO NOTHING RETURNING revision`);
        if (inserted.rows.length > 0) {
          knownRevision = 1;
          return;
        }
        throw new Error("ALICE_CONFIG_REVISION_CONFLICT");
      }
      {
        const updated = await input.db.execute(sql`UPDATE ${sql.raw(TABLE)}
          SET revision = ${expected + 1}, salt = ${sealed.salt}, iv = ${sealed.iv}, ciphertext = ${sealed.ciphertext}
          WHERE owner_id = ${OWNER_ID} AND revision = ${expected} RETURNING revision`);
        if (updated.rows.length > 0) {
          knownRevision = expected + 1;
          return;
        }
      }
      throw new Error("ALICE_CONFIG_REVISION_CONFLICT");
    },
  };
}

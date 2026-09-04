import {
  createCipheriv,
  createDecipheriv,
  createHash,
  pbkdf2 as deriveKey,
  randomBytes,
} from "node:crypto";
import { promisify } from "node:util";
import type { OAuthCredentials } from "./types.js";

const STATE_URL =
  "http://alice-state-plane.internal/v1/openai-codex-credentials";
const RECORD_ID = "openai-codex-credentials-v1";
const SESSION_ID = "openai-codex-production";
const SCHEMA_VERSION = "alice.openai-codex-auth-state.v1";
const ITERATIONS = 210_000;
const pbkdf2 = promisify(deriveKey);

type FetchImplementation = (request: Request) => Promise<Response>;

type SealedPayload = {
  schemaVersion: typeof SCHEMA_VERSION;
  state: "active";
  algorithm: "aes-256-gcm";
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  tag: string;
};

export interface AliceOpenAiCodexCredentialStore {
  read(): Promise<OAuthCredentials | null>;
  write(credentials: OAuthCredentials, updatedAt?: number): Promise<void>;
  delete(updatedAt?: number): Promise<void>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function validCredentials(value: unknown): value is OAuthCredentials {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    exactKeys(record, ["access", "expires", "refresh"]) &&
    typeof record.access === "string" &&
    record.access.length >= 16 &&
    !/[\r\n]/.test(record.access) &&
    typeof record.refresh === "string" &&
    record.refresh.length >= 16 &&
    !/[\r\n]/.test(record.refresh) &&
    Number.isSafeInteger(record.expires) &&
    Number(record.expires) > 0
  );
}

function validSealedPayload(value: unknown): value is SealedPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    exactKeys(record, [
      "algorithm",
      "ciphertext",
      "iterations",
      "iv",
      "kdf",
      "salt",
      "schemaVersion",
      "state",
      "tag",
    ]) &&
    record.schemaVersion === SCHEMA_VERSION &&
    record.state === "active" &&
    record.algorithm === "aes-256-gcm" &&
    record.kdf === "pbkdf2-sha256" &&
    record.iterations === ITERATIONS &&
    typeof record.salt === "string" &&
    typeof record.iv === "string" &&
    typeof record.ciphertext === "string" &&
    typeof record.tag === "string"
  );
}

async function key(passphrase: string, salt: Buffer): Promise<Buffer> {
  return (await pbkdf2(passphrase, salt, ITERATIONS, 32, "sha256")) as Buffer;
}

async function seal(
  credentials: OAuthCredentials,
  passphrase: string,
): Promise<SealedPayload> {
  if (!validCredentials(credentials)) {
    throw new Error("ALICE_OPENAI_CODEX_STATE_INVALID");
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await key(passphrase, salt), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return {
    schemaVersion: SCHEMA_VERSION,
    state: "active",
    algorithm: "aes-256-gcm",
    kdf: "pbkdf2-sha256",
    iterations: ITERATIONS,
    salt: salt.toString("base64url"),
    iv: iv.toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
  };
}

async function unseal(
  payload: unknown,
  passphrase: string,
): Promise<OAuthCredentials> {
  if (!validSealedPayload(payload)) {
    throw new Error("ALICE_OPENAI_CODEX_STATE_INVALID");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await key(passphrase, Buffer.from(payload.salt, "base64url")),
      Buffer.from(payload.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const credentials = JSON.parse(plaintext) as unknown;
    if (!validCredentials(credentials)) throw new Error("invalid");
    return credentials;
  } catch {
    throw new Error("ALICE_OPENAI_CODEX_STATE_INVALID");
  }
}

async function readEnvelope(response: Response): Promise<Record<string, unknown>> {
  if (!response.ok) throw new Error("ALICE_OPENAI_CODEX_STATE_UNAVAILABLE");
  const body = await response.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("ALICE_OPENAI_CODEX_STATE_INVALID");
  }
  return body as Record<string, unknown>;
}

export function createAliceOpenAiCodexCredentialStore(input: {
  ownerId: string;
  statePlaneUrl: string;
  passphrase: string;
  fetchImpl?: FetchImplementation;
}): AliceOpenAiCodexCredentialStore {
  if (
    input.ownerId !== "alice-owner-production" ||
    input.statePlaneUrl !== STATE_URL ||
    typeof input.passphrase !== "string" ||
    input.passphrase.length < 32
  ) {
    throw new Error("ALICE_OPENAI_CODEX_STATE_CONFIG_INVALID");
  }
  const fetchImpl = input.fetchImpl ?? fetch;
  const invoke = (operation: Record<string, unknown>) =>
    fetchImpl(
      new Request(input.statePlaneUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(operation),
      }),
    );
  const put = async (payload: Record<string, unknown>, updatedAt: number) => {
    const idempotencyKey = createHash("sha256")
      .update(`${updatedAt}\n${JSON.stringify(payload)}`)
      .digest("hex");
    const body = await readEnvelope(
      await invoke({
        operation: "record.put",
        kind: "configVersion",
        recordId: RECORD_ID,
        ownerId: input.ownerId,
        sessionId: SESSION_ID,
        payload,
        updatedAt,
        idempotencyKey: `openai-codex-${idempotencyKey}`,
      }),
    );
    if (body.ok !== true || !body.record) {
      throw new Error("ALICE_OPENAI_CODEX_STATE_INVALID");
    }
  };

  return {
    async read() {
      const body = await readEnvelope(
        await invoke({
          operation: "record.get",
          kind: "configVersion",
          recordId: RECORD_ID,
          ownerId: input.ownerId,
        }),
      );
      if (body.ok !== true) throw new Error("ALICE_OPENAI_CODEX_STATE_INVALID");
      if (body.record === null) return null;
      if (!body.record || typeof body.record !== "object" || Array.isArray(body.record)) {
        throw new Error("ALICE_OPENAI_CODEX_STATE_INVALID");
      }
      const payload = (body.record as Record<string, unknown>).payload;
      if (
        payload &&
        typeof payload === "object" &&
        !Array.isArray(payload) &&
        exactKeys(payload as Record<string, unknown>, ["schemaVersion", "state"]) &&
        (payload as Record<string, unknown>).schemaVersion === SCHEMA_VERSION &&
        (payload as Record<string, unknown>).state === "deleted"
      ) {
        return null;
      }
      return unseal(payload, input.passphrase);
    },
    async write(credentials, updatedAt = Date.now()) {
      if (!Number.isSafeInteger(updatedAt) || updatedAt <= 0) {
        throw new Error("ALICE_OPENAI_CODEX_STATE_INVALID");
      }
      await put(await seal(credentials, input.passphrase), updatedAt);
    },
    async delete(updatedAt = Date.now()) {
      if (!Number.isSafeInteger(updatedAt) || updatedAt <= 0) {
        throw new Error("ALICE_OPENAI_CODEX_STATE_INVALID");
      }
      await put({ schemaVersion: SCHEMA_VERSION, state: "deleted" }, updatedAt);
    },
  };
}

export function createAliceOpenAiCodexCredentialStoreFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): AliceOpenAiCodexCredentialStore | null {
  const ownerId = env.ALICE_STATE_OWNER_ID?.trim();
  const statePlaneUrl = env.ALICE_OPENAI_CODEX_STATE_URL?.trim();
  const passphrase = env.ELIZA_VAULT_PASSPHRASE;
  if (!ownerId && !statePlaneUrl && !passphrase) return null;
  return createAliceOpenAiCodexCredentialStore({
    ownerId: ownerId ?? "",
    statePlaneUrl: statePlaneUrl ?? "",
    passphrase: passphrase ?? "",
  });
}

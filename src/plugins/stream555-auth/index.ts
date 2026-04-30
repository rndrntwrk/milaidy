import crypto from "node:crypto";
import type {
  Action,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  Plugin,
  Provider,
  ProviderResult,
  State,
} from "@elizaos/core";
import { ethers } from "ethers";
import { deriveEvmAddress, deriveSolanaAddress } from "../../api/wallet.js";
import {
  assertFive55Capability,
  createFive55CapabilityPolicy,
} from "../../runtime/five55-capability-policy.js";
import { assertTrustedAdminForAction } from "../../runtime/trusted-admin.js";
import { exceptionAction, readParam } from "../five55-shared/action-kit.js";
import {
  STREAM555_AGENT_API_KEY_ENV,
  STREAM555_AGENT_TOKEN_ENV,
  STREAM_API_BEARER_TOKEN_ENV,
  describeAgentAuthSource,
  invalidateExchangedAgentTokenCache,
  isAgentAuthConfigured,
  resolveAgentBearer,
} from "../five55-shared/agent-auth.js";

const MODULE = "stream555.auth";
const CAPABILITY_POLICY = createFive55CapabilityPolicy();
const STREAM555_BASE_ENV = "STREAM555_BASE_URL";
const STREAM_API_ENV = "STREAM_API_URL";
const STREAM555_PUBLIC_BASE_ENV = "STREAM555_PUBLIC_BASE_URL";
const STREAM555_INTERNAL_BASE_ENV = "STREAM555_INTERNAL_BASE_URL";
const STREAM555_INTERNAL_AGENT_IDS_ENV = "STREAM555_INTERNAL_AGENT_IDS";
const STREAM555_ADMIN_API_KEY_ENV = "STREAM555_ADMIN_API_KEY";
const STREAM555_AGENT_DEFAULT_USER_ID_ENV = "STREAM555_AGENT_DEFAULT_USER_ID";
const STREAM555_WALLET_AUTH_PREFERRED_CHAIN_ENV =
  "STREAM555_WALLET_AUTH_PREFERRED_CHAIN";
const STREAM555_WALLET_AUTH_ALLOW_PROVISION_ENV =
  "STREAM555_WALLET_AUTH_ALLOW_PROVISION";
const STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN_ENV =
  "STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN";
const DEFAULT_STREAM555_PUBLIC_BASE_URL = "https://stream.rndrntwrk.com";
const DEFAULT_STREAM555_INTERNAL_BASE_URL = "http://control-plane:3000";
const DEFAULT_INTERNAL_AGENT_IDS = ["alice", "alice-internal"];

type JsonObject = Record<string, unknown>;
type WalletChainType = "evm" | "solana";
type WalletSource = "runtime_wallet" | "sw4p_linked_wallet";

interface WalletCandidate {
  chainType: WalletChainType;
  walletAddress: string;
  privateKey: string;
  source: WalletSource;
}

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

function readParamValue(
  options: HandlerOptions | undefined,
  key: string,
): string | undefined {
  const value = readParam(options, key);
  return value?.trim() ? value.trim() : undefined;
}

function getObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as JsonObject;
}

function getStringField(value: unknown, key: string): string | undefined {
  const objectValue = getObject(value);
  const field = objectValue?.[key];
  return typeof field === "string" && field.trim() ? field.trim() : undefined;
}

function isInternalAgentId(agentId: string | undefined): boolean {
  const normalized = agentId?.trim().toLowerCase();
  if (!normalized) return false;
  const configured = parseCsv(trimEnv(STREAM555_INTERNAL_AGENT_IDS_ENV))?.map(
    (entry) => entry.toLowerCase(),
  );
  const allowList = configured?.length ? configured : DEFAULT_INTERNAL_AGENT_IDS;
  return allowList.includes(normalized);
}

function resolveBaseUrl(
  runtime: IAgentRuntime,
  options?: HandlerOptions,
): string {
  const explicit =
    readParamValue(options, "baseUrl") ||
    trimEnv(STREAM555_BASE_ENV) ||
    trimEnv(STREAM_API_ENV);
  if (explicit) return explicit;

  const agentHint =
    readParamValue(options, "agentId") || runtime.agentId?.toString();
  if (isInternalAgentId(agentHint)) {
    return (
      trimEnv(STREAM555_INTERNAL_BASE_ENV) || DEFAULT_STREAM555_INTERNAL_BASE_URL
    );
  }

  return trimEnv(STREAM555_PUBLIC_BASE_ENV) || DEFAULT_STREAM555_PUBLIC_BASE_URL;
}

function resolveBaseEnvSource(): string {
  if (trimEnv(STREAM555_BASE_ENV)) return STREAM555_BASE_ENV;
  if (trimEnv(STREAM_API_ENV)) return STREAM_API_ENV;
  if (trimEnv(STREAM555_PUBLIC_BASE_ENV)) return STREAM555_PUBLIC_BASE_ENV;
  if (trimEnv(STREAM555_INTERNAL_BASE_ENV)) return STREAM555_INTERNAL_BASE_ENV;
  return `${STREAM555_BASE_ENV}|${STREAM_API_ENV}|${STREAM555_PUBLIC_BASE_ENV}|${STREAM555_INTERNAL_BASE_ENV}`;
}

function assertStreamReadAccess(): void {
  assertFive55Capability(CAPABILITY_POLICY, "stream.read");
}

function assertStreamControlAccess(
  runtime: IAgentRuntime,
  message: Memory,
  state: State | undefined,
  actionName: string,
): void {
  assertTrustedAdminForAction(runtime, message, state, actionName);
  assertFive55Capability(CAPABILITY_POLICY, "stream.control");
}

function readRuntimeSetting(
  runtime: IAgentRuntime,
  key: string,
): string | undefined {
  const fromRuntime = runtime.getSetting?.(key) as string | undefined;
  if (typeof fromRuntime === "string" && fromRuntime.trim()) {
    return fromRuntime.trim();
  }
  return trimEnv(key);
}

function normalizeEvmPrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim();
  if (!trimmed) throw new Error("EVM private key is empty");
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function collectRuntimeWalletCandidates(runtime: IAgentRuntime): WalletCandidate[] {
  const candidates: WalletCandidate[] = [];
  const solanaPrivateKey = readRuntimeSetting(runtime, "SOLANA_PRIVATE_KEY");
  if (solanaPrivateKey) {
    try {
      const walletAddress = deriveSolanaAddress(solanaPrivateKey);
      candidates.push({
        chainType: "solana",
        walletAddress,
        privateKey: solanaPrivateKey,
        source: "runtime_wallet",
      });
    } catch {
      // invalid key in env/runtime; skip and continue
    }
  }

  const evmPrivateKey = readRuntimeSetting(runtime, "EVM_PRIVATE_KEY");
  if (evmPrivateKey) {
    try {
      const normalized = normalizeEvmPrivateKey(evmPrivateKey);
      const walletAddress = deriveEvmAddress(normalized);
      candidates.push({
        chainType: "evm",
        walletAddress,
        privateKey: normalized,
        source: "runtime_wallet",
      });
    } catch {
      // invalid key in env/runtime; skip and continue
    }
  }
  return candidates;
}

function pickPreferredWallet(
  candidates: WalletCandidate[],
  preferredChain: WalletChainType,
): WalletCandidate | null {
  if (candidates.length === 0) return null;
  const preferred = candidates.find(
    (candidate) => candidate.chainType === preferredChain,
  );
  if (preferred) return preferred;
  return candidates[0] ?? null;
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_ALPHABET_MAP = new Map(
  BASE58_ALPHABET.split("").map((char, index) => [char, index]),
);

function base58Encode(bytes: Buffer): string {
  if (bytes.length === 0) return "";
  let value = BigInt(`0x${bytes.toString("hex")}`);
  const output: string[] = [];
  while (value > 0n) {
    const mod = Number(value % 58n);
    output.unshift(BASE58_ALPHABET[mod] ?? "");
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte === 0) output.unshift("1");
    else break;
  }
  return output.join("") || "1";
}

function base58Decode(value: string): Buffer {
  const normalized = value.trim();
  if (!normalized) return Buffer.alloc(0);
  let result = 0n;
  for (const char of normalized) {
    const digit = BASE58_ALPHABET_MAP.get(char);
    if (digit === undefined) {
      throw new Error("invalid base58 input");
    }
    result = result * 58n + BigInt(digit);
  }
  let hex = result.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  let buffer = hex ? Buffer.from(hex, "hex") : Buffer.alloc(0);
  let leadingOnes = 0;
  for (const char of normalized) {
    if (char === "1") leadingOnes += 1;
    else break;
  }
  if (leadingOnes > 0) {
    buffer = Buffer.concat([Buffer.alloc(leadingOnes), buffer]);
  }
  return buffer;
}

function signSolanaMessage(privateKey: string, message: string): string {
  const decoded = base58Decode(privateKey);
  const seed =
    decoded.length === 64
      ? decoded.subarray(0, 32)
      : decoded.length === 32
        ? decoded
        : null;
  if (!seed) {
    throw new Error(
      `Unsupported Solana private key length: ${decoded.length} (expected 32 or 64 bytes)`,
    );
  }

  const keyObject = crypto.createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
  const signature = crypto.sign(null, Buffer.from(message, "utf8"), keyObject);
  return base58Encode(signature);
}

async function signWalletChallenge(
  wallet: WalletCandidate,
  message: string,
): Promise<string> {
  if (wallet.chainType === "evm") {
    const signer = new ethers.Wallet(normalizeEvmPrivateKey(wallet.privateKey));
    return signer.signMessage(message);
  }
  return signSolanaMessage(wallet.privateKey, message);
}

function inferWalletChainType(value: unknown): WalletChainType {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized.includes("sol")) return "solana";
  return "evm";
}

function extractLinkedWalletCandidate(data: JsonObject | undefined): WalletCandidate | null {
  const linkedWallet = getObject(data?.linkedWallet);
  const walletAddress =
    getStringField(linkedWallet, "address") || getStringField(data, "walletAddress");
  if (!walletAddress) return null;

  const chainType = inferWalletChainType(
    getStringField(data, "chainType") ||
      getStringField(linkedWallet, "chainType") ||
      getStringField(linkedWallet, "blockchain"),
  );
  const privateKey =
    getStringField(linkedWallet, "privateKey") ||
    getStringField(linkedWallet, "secretKey") ||
    getStringField(data, "privateKey") ||
    getStringField(data, "secretKey");
  if (!privateKey) return null;

  return {
    chainType,
    walletAddress,
    privateKey: chainType === "evm" ? normalizeEvmPrivateKey(privateKey) : privateKey,
    source: "sw4p_linked_wallet",
  };
}

async function requestJson(
  method: "GET" | "POST" | "DELETE",
  base: string,
  endpoint: string,
  headers: Record<string, string>,
  body?: JsonObject,
): Promise<{
  ok: boolean;
  status: number;
  data?: JsonObject;
  rawBody: string;
}> {
  const target = new URL(endpoint, base);
  const response = await fetch(target, {
    method,
    headers,
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(body ?? {}),
  });

  const rawBody = await response.text();
  let data: JsonObject | undefined;
  try {
    const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as JsonObject;
    }
  } catch {
    // non-json response
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    rawBody,
  };
}

function getErrorDetail(result: { data?: JsonObject; rawBody: string }): string {
  const fromData = result.data?.error;
  if (typeof fromData === "string" && fromData.trim()) return fromData;
  return result.rawBody || "upstream request failed";
}

function mapFailureCode(status: number): string {
  if (status === 400) return "E_UPSTREAM_BAD_REQUEST";
  if (status === 401) return "E_UPSTREAM_UNAUTHORIZED";
  if (status === 403) return "E_UPSTREAM_FORBIDDEN";
  if (status === 404) return "E_UPSTREAM_NOT_FOUND";
  if (status === 409) return "E_UPSTREAM_CONFLICT";
  if (status === 429) return "E_UPSTREAM_RATE_LIMITED";
  if (status >= 500) return "E_UPSTREAM_SERVER";
  return "E_UPSTREAM_FAILURE";
}

function buildEnvelope({
  ok,
  action,
  status,
  message,
  data,
  details,
}: {
  ok: boolean;
  action: string;
  status: number;
  message: string;
  data?: unknown;
  details?: unknown;
}): { success: boolean; text: string } {
  return {
    success: ok,
    text: JSON.stringify({
      ok,
      code: ok ? "OK" : mapFailureCode(status),
      module: MODULE,
      action,
      message,
      status,
      retryable: status === 429 || status >= 500,
      ...(ok ? { data } : { details }),
    }),
  };
}

async function resolveManagementHeaders(
  base: string,
): Promise<Record<string, string>> {
  const adminKey = trimEnv(STREAM555_ADMIN_API_KEY_ENV);
  if (adminKey) {
    return {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-admin-key": adminKey,
    };
  }

  const bearer = await resolveAgentBearer(base);
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
  };
}

async function resolveBearerHeaders(
  base: string,
): Promise<Record<string, string>> {
  const bearer = await resolveAgentBearer(base);
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${bearer}`,
  };
}

function setActiveApiKey(apiKey: string): void {
  process.env[STREAM555_AGENT_API_KEY_ENV] = apiKey;
  delete process.env[STREAM555_AGENT_TOKEN_ENV];
  delete process.env[STREAM_API_BEARER_TOKEN_ENV];
  invalidateExchangedAgentTokenCache();
}

function setActiveBearerToken(token: string): void {
  process.env[STREAM555_AGENT_TOKEN_ENV] = token;
  delete process.env[STREAM555_AGENT_API_KEY_ENV];
  delete process.env[STREAM_API_BEARER_TOKEN_ENV];
  invalidateExchangedAgentTokenCache();
}

const stream555AuthProvider: Provider = {
  name: "stream555Auth",
  description:
    "555stream agent auth controls (API key lifecycle + linked wallet provisioning via sw4p).",
  async get(
    _runtime: IAgentRuntime,
    _message: Memory,
    _state: State,
  ): Promise<ProviderResult> {
    const baseConfigured = Boolean(
      trimEnv(STREAM555_BASE_ENV) ||
        trimEnv(STREAM_API_ENV) ||
        trimEnv(STREAM555_PUBLIC_BASE_ENV) ||
        trimEnv(STREAM555_INTERNAL_BASE_ENV),
    );
    const adminConfigured = Boolean(trimEnv(STREAM555_ADMIN_API_KEY_ENV));
    const authConfigured = isAgentAuthConfigured();
    return {
      text: [
        "## 555stream Auth Surface",
        "",
        "Actions: STREAM555_AUTH_APIKEY_CREATE, STREAM555_AUTH_APIKEY_LIST, STREAM555_AUTH_APIKEY_REVOKE, STREAM555_AUTH_APIKEY_SET_ACTIVE, STREAM555_AUTH_WALLET_LOGIN, STREAM555_AUTH_WALLET_CHALLENGE, STREAM555_AUTH_WALLET_VERIFY, STREAM555_AUTH_WALLET_PROVISION_LINKED, STREAM555_AUTH_DISCONNECT",
        `Base configured: ${baseConfigured ? "yes" : "no"} (${resolveBaseEnvSource()})`,
        `Admin API key configured: ${adminConfigured ? "yes" : "no"} (${STREAM555_ADMIN_API_KEY_ENV})`,
        `Agent auth configured: ${authConfigured ? "yes" : "no"} (${describeAgentAuthSource()})`,
      ].join("\n"),
    };
  },
};

const createApiKeyAction: Action = {
  name: "STREAM555_AUTH_APIKEY_CREATE",
  similes: [
    "STREAM555_CREATE_API_KEY",
    "STREAM555_AUTH_CREATE_KEY",
    "STREAM555_AGENT_KEY_CREATE",
  ],
  description:
    "Creates a new 555stream agent API key and can optionally set it active in local runtime env.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_APIKEY_CREATE",
      );
      const base = resolveBaseUrl(runtime, options as HandlerOptions | undefined);
      const headers = await resolveManagementHeaders(base);
      const name =
        readParam(options as HandlerOptions | undefined, "name") ||
        "milaidy-agent-key";
      const userId =
        readParam(options as HandlerOptions | undefined, "userId") ||
        trimEnv(STREAM555_AGENT_DEFAULT_USER_ID_ENV);
      const agentId = readParam(options as HandlerOptions | undefined, "agentId");
      const scopes = parseCsv(
        readParam(options as HandlerOptions | undefined, "scopes"),
      );
      const sessionIds = parseCsv(
        readParam(options as HandlerOptions | undefined, "sessionIds"),
      );
      const expiresIn = readParam(
        options as HandlerOptions | undefined,
        "expiresIn",
      );
      const spendLimitTotalRaw = readParam(
        options as HandlerOptions | undefined,
        "spendLimitTotal",
      );
      const maxLeaseMinutesRaw = readParam(
        options as HandlerOptions | undefined,
        "maxLeaseMinutes",
      );
      const setActive = parseBoolean(
        readParam(options as HandlerOptions | undefined, "setActive"),
        true,
      );
      const revealApiKey = parseBoolean(
        readParam(options as HandlerOptions | undefined, "revealApiKey"),
        false,
      );

      const spendLimitTotal = spendLimitTotalRaw
        ? Number.parseFloat(spendLimitTotalRaw)
        : undefined;
      const maxLeaseMinutes = maxLeaseMinutesRaw
        ? Number.parseInt(maxLeaseMinutesRaw, 10)
        : undefined;

      const payload: JsonObject = {
        name,
        ...(userId ? { userId } : {}),
        ...(agentId ? { agentId } : {}),
        ...(scopes ? { scopes } : {}),
        ...(sessionIds ? { sessionIds } : {}),
        ...(expiresIn ? { expiresIn } : {}),
        ...(Number.isFinite(spendLimitTotal)
          ? { spendLimitTotal }
          : {}),
        ...(Number.isFinite(maxLeaseMinutes)
          ? { maxLeaseMinutes }
          : {}),
      };

      const response = await requestJson(
        "POST",
        base,
        "/api/agent/v1/auth/apikeys",
        headers,
        payload,
      );
      if (!response.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_APIKEY_CREATE",
          status: response.status || 502,
          message: `api key creation failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }

      const rawApiKey =
        typeof response.data?.apiKey === "string" ? response.data.apiKey : null;
      if (setActive && rawApiKey) {
        setActiveApiKey(rawApiKey);
      }

      const data: JsonObject = {
        keyPrefix:
          typeof response.data?.keyPrefix === "string"
            ? response.data.keyPrefix
            : null,
        name: typeof response.data?.name === "string" ? response.data.name : name,
        userId:
          typeof response.data?.userId === "string"
            ? response.data.userId
            : userId ?? null,
        agentId:
          typeof response.data?.agentId === "string"
            ? response.data.agentId
            : agentId ?? null,
        scopes: Array.isArray(response.data?.scopes)
          ? response.data?.scopes
          : null,
        sessionIds: Array.isArray(response.data?.sessionIds)
          ? response.data?.sessionIds
          : null,
        expiresAt:
          typeof response.data?.expiresAt === "string"
            ? response.data.expiresAt
            : null,
        activeApiKeySet: Boolean(setActive && rawApiKey),
        authSource: describeAgentAuthSource(),
      };
      if (revealApiKey && rawApiKey) {
        data.apiKey = rawApiKey;
      }

      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_APIKEY_CREATE",
        status: response.status,
        message: "api key created",
        data,
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_APIKEY_CREATE", err);
    }
  },
  parameters: [
    { name: "name", description: "Key label", required: true, schema: { type: "string" as const } },
    { name: "userId", description: "Owner user id (optional if admin token infers it)", required: false, schema: { type: "string" as const } },
    { name: "agentId", description: "Optional fixed agent id for issued JWTs", required: false, schema: { type: "string" as const } },
    { name: "scopes", description: "Comma-separated scopes", required: false, schema: { type: "string" as const } },
    { name: "sessionIds", description: "Comma-separated session ids", required: false, schema: { type: "string" as const } },
    { name: "expiresIn", description: "TTL like 30d, 24h", required: false, schema: { type: "string" as const } },
    { name: "spendLimitTotal", description: "Optional lifetime credit cap", required: false, schema: { type: "string" as const } },
    { name: "maxLeaseMinutes", description: "Optional max lease duration (minutes)", required: false, schema: { type: "string" as const } },
    { name: "setActive", description: "Set created key into local runtime env (default true)", required: false, schema: { type: "string" as const } },
    { name: "revealApiKey", description: "Include raw apiKey in response (default false)", required: false, schema: { type: "string" as const } },
  ],
};

const listApiKeysAction: Action = {
  name: "STREAM555_AUTH_APIKEY_LIST",
  similes: [
    "STREAM555_LIST_API_KEYS",
    "STREAM555_AUTH_LIST_KEYS",
    "STREAM555_AGENT_KEY_LIST",
  ],
  description: "Lists 555stream agent API keys (metadata only).",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_APIKEY_LIST",
      );
      const base = resolveBaseUrl(runtime, options as HandlerOptions | undefined);
      const headers = await resolveManagementHeaders(base);
      const userId = readParam(options as HandlerOptions | undefined, "userId");
      const status = readParam(options as HandlerOptions | undefined, "status");
      const query = new URLSearchParams();
      if (userId) query.set("userId", userId);
      if (status) query.set("status", status);
      const endpoint = `/api/agent/v1/auth/apikeys${query.toString() ? `?${query.toString()}` : ""}`;
      const response = await requestJson("GET", base, endpoint, headers);
      if (!response.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_APIKEY_LIST",
          status: response.status || 502,
          message: `api key list failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }
      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_APIKEY_LIST",
        status: response.status,
        message: "api keys fetched",
        data: response.data ?? {},
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_APIKEY_LIST", err);
    }
  },
  parameters: [
    { name: "userId", description: "Optional key owner user id filter", required: false, schema: { type: "string" as const } },
    { name: "status", description: "active|revoked", required: false, schema: { type: "string" as const } },
  ],
};

const revokeApiKeyAction: Action = {
  name: "STREAM555_AUTH_APIKEY_REVOKE",
  similes: [
    "STREAM555_REVOKE_API_KEY",
    "STREAM555_AUTH_REVOKE_KEY",
    "STREAM555_AGENT_KEY_REVOKE",
  ],
  description: "Revokes a 555stream agent API key by id.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_APIKEY_REVOKE",
      );
      const keyId = readParam(options as HandlerOptions | undefined, "keyId");
      if (!keyId) throw new Error("keyId is required");
      const base = resolveBaseUrl(runtime, options as HandlerOptions | undefined);
      const headers = await resolveManagementHeaders(base);
      const response = await requestJson(
        "DELETE",
        base,
        `/api/agent/v1/auth/apikeys/${encodeURIComponent(keyId)}`,
        headers,
      );
      if (!response.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_APIKEY_REVOKE",
          status: response.status || 502,
          message: `api key revoke failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }
      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_APIKEY_REVOKE",
        status: response.status,
        message: "api key revoked",
        data: response.data ?? {},
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_APIKEY_REVOKE", err);
    }
  },
  parameters: [
    { name: "keyId", description: "API key record id", required: true, schema: { type: "string" as const } },
  ],
};

const setActiveApiKeyAction: Action = {
  name: "STREAM555_AUTH_APIKEY_SET_ACTIVE",
  similes: [
    "STREAM555_SET_ACTIVE_API_KEY",
    "STREAM555_AUTH_SET_KEY",
    "STREAM555_AGENT_KEY_SET",
  ],
  description:
    "Sets STREAM555_AGENT_API_KEY in the current runtime and optionally validates token exchange.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_APIKEY_SET_ACTIVE",
      );
      const apiKey = readParam(options as HandlerOptions | undefined, "apiKey");
      if (!apiKey) throw new Error("apiKey is required");
      if (!apiKey.startsWith("sk_ag_")) {
        throw new Error("apiKey must use sk_ag_ prefix");
      }
      const verifyExchange = parseBoolean(
        readParam(options as HandlerOptions | undefined, "verifyExchange"),
        true,
      );

      const previousApiKey = process.env[STREAM555_AGENT_API_KEY_ENV];
      const previousToken = process.env[STREAM555_AGENT_TOKEN_ENV];
      const previousLegacyToken = process.env[STREAM_API_BEARER_TOKEN_ENV];

      setActiveApiKey(apiKey);

      if (verifyExchange) {
        try {
          const base = resolveBaseUrl(
            runtime,
            options as HandlerOptions | undefined,
          );
          await resolveAgentBearer(base);
        } catch (err) {
          if (previousApiKey !== undefined) {
            process.env[STREAM555_AGENT_API_KEY_ENV] = previousApiKey;
          } else {
            delete process.env[STREAM555_AGENT_API_KEY_ENV];
          }
          if (previousToken !== undefined) {
            process.env[STREAM555_AGENT_TOKEN_ENV] = previousToken;
          } else {
            delete process.env[STREAM555_AGENT_TOKEN_ENV];
          }
          if (previousLegacyToken !== undefined) {
            process.env[STREAM_API_BEARER_TOKEN_ENV] = previousLegacyToken;
          } else {
            delete process.env[STREAM_API_BEARER_TOKEN_ENV];
          }
          invalidateExchangedAgentTokenCache();
          throw err;
        }
      }

      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_APIKEY_SET_ACTIVE",
        status: 200,
        message: "active api key updated",
        data: {
          authSource: describeAgentAuthSource(),
          verifyExchange,
        },
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_APIKEY_SET_ACTIVE", err);
    }
  },
  parameters: [
    { name: "apiKey", description: "Raw API key (sk_ag_...)", required: true, schema: { type: "string" as const } },
    { name: "verifyExchange", description: "Verify token exchange after setting (default true)", required: false, schema: { type: "string" as const } },
  ],
};

const disconnectAuthAction: Action = {
  name: "STREAM555_AUTH_DISCONNECT",
  similes: [
    "STREAM555_AUTH_LOGOUT",
    "STREAM555_AUTH_CLEAR_ACTIVE",
    "STREAM555_AUTH_DISCONNECT_ACTIVE",
  ],
  description:
    "Clears active 555stream credentials from runtime env (token + API key) without revoking server-side keys.",
  validate: async () => true,
  handler: async (runtime, message, state) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_DISCONNECT",
      );
      const previousSource = describeAgentAuthSource();
      const hadCredentials = isAgentAuthConfigured();
      delete process.env[STREAM555_AGENT_API_KEY_ENV];
      delete process.env[STREAM555_AGENT_TOKEN_ENV];
      delete process.env[STREAM_API_BEARER_TOKEN_ENV];
      invalidateExchangedAgentTokenCache();
      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_DISCONNECT",
        status: 200,
        message: hadCredentials
          ? "active stream auth cleared from runtime"
          : "no active stream auth was present",
        data: {
          cleared: hadCredentials,
          previousAuthSource: previousSource,
          authSource: describeAgentAuthSource(),
        },
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_DISCONNECT", err);
    }
  },
  parameters: [],
};

const provisionLinkedWalletAction: Action = {
  name: "STREAM555_AUTH_WALLET_PROVISION_LINKED",
  similes: [
    "STREAM555_WALLET_PROVISION_LINKED",
    "STREAM555_AUTH_LINKED_WALLET",
    "STREAM555_SW4P_LINKED_WALLET",
  ],
  description:
    "Requests linked-wallet provisioning through control-plane auth route backed by sw4p WaaS.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_WALLET_PROVISION_LINKED",
      );
      assertStreamReadAccess();
      const base = resolveBaseUrl(runtime, options as HandlerOptions | undefined);
      const headers = await resolveBearerHeaders(base);
      const targetChain = readParam(
        options as HandlerOptions | undefined,
        "targetChain",
      );
      const response = await requestJson(
        "POST",
        base,
        "/api/auth/wallets/linked",
        headers,
        {
          ...(targetChain ? { targetChain } : {}),
        },
      );
      if (!response.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_WALLET_PROVISION_LINKED",
          status: response.status || 502,
          message: `linked wallet provisioning failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }
      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_WALLET_PROVISION_LINKED",
        status: response.status,
        message: "linked wallet provisioned",
        data: response.data ?? {},
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_WALLET_PROVISION_LINKED", err);
    }
  },
  parameters: [
    { name: "targetChain", description: "base|eth|polygon|arbitrum (optional)", required: false, schema: { type: "string" as const } },
  ],
};

const walletLoginAction: Action = {
  name: "STREAM555_AUTH_WALLET_LOGIN",
  similes: [
    "STREAM555_WALLET_LOGIN",
    "STREAM555_AUTH_AUTO",
    "STREAM555_AUTH_SELF_SERVE",
  ],
  description:
    "Runs end-to-end wallet auth using local wallets (Solana preferred, EVM fallback) and sw4p linked-wallet provisioning when no local wallet exists.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(runtime, message, state, "STREAM555_AUTH_WALLET_LOGIN");
      assertStreamReadAccess();

      const handlerOptions = options as HandlerOptions | undefined;
      const base = resolveBaseUrl(runtime, handlerOptions);
      const preferredChainParam = readParam(
        handlerOptions,
        "preferredChain",
      )
        ?.trim()
        .toLowerCase();
      const preferredChainFromEnv = trimEnv(
        STREAM555_WALLET_AUTH_PREFERRED_CHAIN_ENV,
      )?.toLowerCase();
      const preferredChainSource = preferredChainParam || preferredChainFromEnv;
      const preferredChain =
        preferredChainSource === "evm" || preferredChainSource === "ethereum"
          ? "evm"
          : "solana";
      const allowProvisionDefault = parseBoolean(
        trimEnv(STREAM555_WALLET_AUTH_ALLOW_PROVISION_ENV),
        true,
      );
      const allowProvision = parseBoolean(
        readParam(handlerOptions, "allowProvision"),
        allowProvisionDefault,
      );
      const provisionTargetChain =
        readParam(handlerOptions, "provisionTargetChain")?.trim() ||
        trimEnv(STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN_ENV) ||
        "eth";
      const setActive = parseBoolean(
        readParam(handlerOptions, "setActive"),
        true,
      );
      const revealToken = parseBoolean(
        readParam(handlerOptions, "revealToken"),
        false,
      );
      const requestedAgentId = readParam(handlerOptions, "agentId")?.trim();
      const runtimeAgentId =
        typeof runtime.agentId === "string" ? runtime.agentId.trim() : "";
      const agentIdCandidate = requestedAgentId || runtimeAgentId;
      const agentIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,62}[a-zA-Z0-9]$/;
      const challengeAgentId = agentIdPattern.test(agentIdCandidate)
        ? agentIdCandidate
        : undefined;

      const runtimeCandidates = collectRuntimeWalletCandidates(runtime);
      let selectedWallet = pickPreferredWallet(runtimeCandidates, preferredChain);
      let linkedWalletProvisioned = false;
      let linkedWalletChain: string | null = null;

      if (!selectedWallet && allowProvision) {
        const managementHeaders = await resolveBearerHeaders(base);
        const provisionResponse = await requestJson(
          "POST",
          base,
          "/api/auth/wallets/linked",
          managementHeaders,
          {
            targetChain: provisionTargetChain,
          },
        );
        if (!provisionResponse.ok) {
          return buildEnvelope({
            ok: false,
            action: "STREAM555_AUTH_WALLET_LOGIN",
            status: provisionResponse.status || 502,
            message: `linked wallet provisioning failed (${provisionResponse.status}): ${getErrorDetail(provisionResponse)}`,
            details: provisionResponse.data ?? provisionResponse.rawBody,
          });
        }
        linkedWalletProvisioned = true;
        linkedWalletChain = getStringField(
          provisionResponse.data?.linkedWallet,
          "blockchain",
        ) ?? null;
        selectedWallet = extractLinkedWalletCandidate(provisionResponse.data);
        if (!selectedWallet) {
          return buildEnvelope({
            ok: false,
            action: "STREAM555_AUTH_WALLET_LOGIN",
            status: 424,
            message:
              "linked wallet was provisioned but no signing material was returned for challenge verification",
            details: provisionResponse.data ?? {},
          });
        }
      }

      if (!selectedWallet) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_WALLET_LOGIN",
          status: 412,
          message:
            "no wallet available for auth; configure SOLANA_PRIVATE_KEY/EVM_PRIVATE_KEY or enable linked-wallet provisioning",
          details: {
            preferredChain,
            allowProvision,
          },
        });
      }

      const challengeResponse = await requestJson(
        "POST",
        base,
        "/api/agent/v1/auth/wallet/challenge",
        {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        {
          walletAddress: selectedWallet.walletAddress,
          chainType: selectedWallet.chainType,
          ...(challengeAgentId ? { agentId: challengeAgentId } : {}),
        },
      );
      if (!challengeResponse.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_WALLET_LOGIN",
          status: challengeResponse.status || 502,
          message: `wallet challenge failed (${challengeResponse.status}): ${getErrorDetail(challengeResponse)}`,
          details: challengeResponse.data ?? challengeResponse.rawBody,
        });
      }
      const challengeId = getStringField(challengeResponse.data, "challengeId");
      const signMessagePayload = getStringField(challengeResponse.data, "message");
      if (!challengeId || !signMessagePayload) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_WALLET_LOGIN",
          status: 502,
          message: "wallet challenge response missing challengeId or message",
          details: challengeResponse.data ?? {},
        });
      }

      const signature = await signWalletChallenge(selectedWallet, signMessagePayload);
      const verifyResponse = await requestJson(
        "POST",
        base,
        "/api/agent/v1/auth/wallet/verify",
        {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        {
          challengeId,
          signature,
        },
      );
      if (!verifyResponse.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_WALLET_LOGIN",
          status: verifyResponse.status || 502,
          message: `wallet verify failed (${verifyResponse.status}): ${getErrorDetail(verifyResponse)}`,
          details: verifyResponse.data ?? verifyResponse.rawBody,
        });
      }

      const token =
        typeof verifyResponse.data?.token === "string"
          ? verifyResponse.data.token
          : null;
      if (setActive && token) {
        setActiveBearerToken(token);
      }

      const data: JsonObject = {
        baseUrl: base,
        walletAddress: selectedWallet.walletAddress,
        chainType: selectedWallet.chainType,
        walletSource: selectedWallet.source,
        linkedWalletProvisioned,
        linkedWalletChain,
        authSource: describeAgentAuthSource(),
        activeTokenSet: Boolean(setActive && token),
        agentId:
          typeof verifyResponse.data?.agentId === "string"
            ? verifyResponse.data.agentId
            : null,
        userId:
          typeof verifyResponse.data?.userId === "string"
            ? verifyResponse.data.userId
            : null,
        actorId:
          typeof verifyResponse.data?.actorId === "string"
            ? verifyResponse.data.actorId
            : null,
        policyId:
          typeof verifyResponse.data?.policyId === "string"
            ? verifyResponse.data.policyId
            : null,
        sessionKind:
          typeof verifyResponse.data?.sessionKind === "string"
            ? verifyResponse.data.sessionKind
            : null,
        expiresAt:
          typeof verifyResponse.data?.expiresAt === "string"
            ? verifyResponse.data.expiresAt
            : null,
        scopes: Array.isArray(verifyResponse.data?.scopes)
          ? verifyResponse.data.scopes
          : null,
      };
      if (revealToken && token) {
        data.token = token;
      }

      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_WALLET_LOGIN",
        status: verifyResponse.status,
        message: "wallet auth completed",
        data,
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_WALLET_LOGIN", err);
    }
  },
  parameters: [
    { name: "agentId", description: "Optional stable agent id for wallet challenge", required: false, schema: { type: "string" as const } },
    { name: "preferredChain", description: "solana|evm (default solana)", required: false, schema: { type: "string" as const } },
    { name: "allowProvision", description: "Allow linked-wallet provisioning when no local wallet exists (default true)", required: false, schema: { type: "string" as const } },
    { name: "provisionTargetChain", description: "sw4p linked wallet target chain when provisioning (default eth)", required: false, schema: { type: "string" as const } },
    { name: "setActive", description: "Set returned token as active runtime auth (default true)", required: false, schema: { type: "string" as const } },
    { name: "revealToken", description: "Include returned token in response envelope (default false)", required: false, schema: { type: "string" as const } },
    { name: "baseUrl", description: "Optional 555stream base URL override for this action", required: false, schema: { type: "string" as const } },
  ],
};

const walletChallengeAction: Action = {
  name: "STREAM555_AUTH_WALLET_CHALLENGE",
  similes: [
    "STREAM555_WALLET_CHALLENGE",
    "STREAM555_AUTH_CHALLENGE_WALLET",
  ],
  description:
    "Requests a wallet-sign challenge from the 555stream agent auth surface.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_WALLET_CHALLENGE",
      );
      const walletAddress = readParam(
        options as HandlerOptions | undefined,
        "walletAddress",
      );
      if (!walletAddress) {
        throw new Error("walletAddress is required");
      }
      const base = resolveBaseUrl(runtime, options as HandlerOptions | undefined);
      const chainType =
        readParam(options as HandlerOptions | undefined, "chainType") || "evm";
      const agentId = readParam(
        options as HandlerOptions | undefined,
        "agentId",
      );

      const response = await requestJson(
        "POST",
        base,
        "/api/agent/v1/auth/wallet/challenge",
        {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        {
          walletAddress,
          chainType,
          ...(agentId ? { agentId } : {}),
        },
      );
      if (!response.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_WALLET_CHALLENGE",
          status: response.status || 502,
          message: `wallet challenge failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }

      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_WALLET_CHALLENGE",
        status: response.status,
        message: "wallet challenge issued",
        data: response.data ?? {},
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_WALLET_CHALLENGE", err);
    }
  },
  parameters: [
    { name: "walletAddress", description: "Agent wallet address for sign-in", required: true, schema: { type: "string" as const } },
    { name: "chainType", description: "evm|solana (default evm)", required: false, schema: { type: "string" as const } },
    { name: "agentId", description: "Optional stable agent identifier", required: false, schema: { type: "string" as const } },
  ],
};

const walletVerifyAction: Action = {
  name: "STREAM555_AUTH_WALLET_VERIFY",
  similes: [
    "STREAM555_WALLET_VERIFY",
    "STREAM555_AUTH_VERIFY_WALLET",
  ],
  description:
    "Verifies a signed wallet challenge and can set the returned token as active runtime auth.",
  validate: async () => true,
  handler: async (runtime, message, state, options) => {
    try {
      assertStreamControlAccess(
        runtime,
        message,
        state,
        "STREAM555_AUTH_WALLET_VERIFY",
      );
      const challengeId = readParam(
        options as HandlerOptions | undefined,
        "challengeId",
      );
      const signature = readParam(
        options as HandlerOptions | undefined,
        "signature",
      );
      if (!challengeId) {
        throw new Error("challengeId is required");
      }
      if (!signature) {
        throw new Error("signature is required");
      }

      const setActive = parseBoolean(
        readParam(options as HandlerOptions | undefined, "setActive"),
        true,
      );
      const revealToken = parseBoolean(
        readParam(options as HandlerOptions | undefined, "revealToken"),
        false,
      );

      const base = resolveBaseUrl(runtime, options as HandlerOptions | undefined);
      const response = await requestJson(
        "POST",
        base,
        "/api/agent/v1/auth/wallet/verify",
        {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        {
          challengeId,
          signature,
        },
      );
      if (!response.ok) {
        return buildEnvelope({
          ok: false,
          action: "STREAM555_AUTH_WALLET_VERIFY",
          status: response.status || 502,
          message: `wallet verify failed (${response.status}): ${getErrorDetail(response)}`,
          details: response.data ?? response.rawBody,
        });
      }

      const returnedToken =
        typeof response.data?.token === "string" ? response.data.token : null;
      if (setActive && returnedToken) {
        setActiveBearerToken(returnedToken);
      }

      const data: JsonObject = {
        agentId:
          typeof response.data?.agentId === "string" ? response.data.agentId : null,
        userId:
          typeof response.data?.userId === "string" ? response.data.userId : null,
        actorId:
          typeof response.data?.actorId === "string" ? response.data.actorId : null,
        policyId:
          typeof response.data?.policyId === "string" ? response.data.policyId : null,
        sessionKind:
          typeof response.data?.sessionKind === "string"
            ? response.data.sessionKind
            : null,
        walletAddress:
          typeof response.data?.walletAddress === "string"
            ? response.data.walletAddress
            : null,
        chainType:
          typeof response.data?.chainType === "string" ? response.data.chainType : null,
        expiresAt:
          typeof response.data?.expiresAt === "string" ? response.data.expiresAt : null,
        scopes: Array.isArray(response.data?.scopes) ? response.data.scopes : null,
        activeTokenSet: Boolean(setActive && returnedToken),
        authSource: describeAgentAuthSource(),
      };
      if (revealToken && returnedToken) {
        data.token = returnedToken;
      }

      return buildEnvelope({
        ok: true,
        action: "STREAM555_AUTH_WALLET_VERIFY",
        status: response.status,
        message: "wallet challenge verified",
        data,
      });
    } catch (err) {
      return exceptionAction(MODULE, "STREAM555_AUTH_WALLET_VERIFY", err);
    }
  },
  parameters: [
    { name: "challengeId", description: "Challenge identifier returned by wallet challenge action", required: true, schema: { type: "string" as const } },
    { name: "signature", description: "Wallet signature over challenge message", required: true, schema: { type: "string" as const } },
    { name: "setActive", description: "Set returned token as active runtime auth (default true)", required: false, schema: { type: "string" as const } },
    { name: "revealToken", description: "Include returned token in response envelope (default false)", required: false, schema: { type: "string" as const } },
  ],
};

export function createStream555AuthPlugin(): Plugin {
  return {
    name: "stream555-auth",
    description:
      "555stream auth + wallet provisioning controls for API key lifecycle and sw4p linked wallets.",
    providers: [stream555AuthProvider],
    actions: [
      createApiKeyAction,
      listApiKeysAction,
      revokeApiKeyAction,
      setActiveApiKeyAction,
      disconnectAuthAction,
      walletLoginAction,
      walletChallengeAction,
      walletVerifyAction,
      provisionLinkedWalletAction,
    ],
  };
}

export default createStream555AuthPlugin;

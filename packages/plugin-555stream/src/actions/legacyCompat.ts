import crypto from 'node:crypto';
import { ethers } from 'ethers';
import type {
  Action,
  ActionExample,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from '../types/index.js';
import { StreamControlService } from '../services/StreamControlService.js';
import {
  describeAgentAuthSource,
  invalidateExchangedAgentTokenCache,
  isAgentAuthConfigured,
  resolveAgentBearer,
  setActiveBearerToken,
  STREAM555_AGENT_API_KEY_ENV,
  STREAM555_AGENT_TOKEN_ENV,
  STREAM_API_BEARER_TOKEN_ENV,
} from '../lib/agentAuth.js';

type JsonObject = Record<string, unknown>;
type WalletChainType = 'evm' | 'solana';
type WalletSource = 'runtime_wallet' | 'sw4p_linked_wallet';
type LiveLayoutMode = 'camera-full' | 'camera-hold';

interface WalletCandidate {
  chainType: WalletChainType;
  walletAddress: string;
  privateKey: string;
  source: WalletSource;
}

interface DestinationMapping {
  platformId: string;
  rtmpUrlEnv: string;
  streamKeyEnv: string;
  enabledEnv: string;
}

interface DestinationApplySuccess {
  platformId: string;
  enabled: boolean;
  configured: boolean;
}

interface DestinationApplyFailure {
  platformId: string;
  error: string;
}

interface DestinationApplySkip {
  platformId: string;
  reason: string;
}

interface DestinationApplyResult {
  attempted: number;
  applied: DestinationApplySuccess[];
  skipped: DestinationApplySkip[];
  failed: DestinationApplyFailure[];
}

interface StreamReadinessSnapshot {
  sessionId: string;
  active: boolean;
  jobId?: string;
  cfSessionId?: string;
  cloudflareConnected: boolean;
  cloudflareState?: string;
  platforms: Record<string, unknown>;
  raw?: JsonObject;
}

const DESTINATION_MAPPINGS: DestinationMapping[] = [
  {
    platformId: 'pumpfun',
    rtmpUrlEnv: 'STREAM555_DEST_PUMPFUN_RTMP_URL',
    streamKeyEnv: 'STREAM555_DEST_PUMPFUN_STREAM_KEY',
    enabledEnv: 'STREAM555_DEST_PUMPFUN_ENABLED',
  },
  {
    platformId: 'x',
    rtmpUrlEnv: 'STREAM555_DEST_X_RTMP_URL',
    streamKeyEnv: 'STREAM555_DEST_X_STREAM_KEY',
    enabledEnv: 'STREAM555_DEST_X_ENABLED',
  },
  {
    platformId: 'twitch',
    rtmpUrlEnv: 'STREAM555_DEST_TWITCH_RTMP_URL',
    streamKeyEnv: 'STREAM555_DEST_TWITCH_STREAM_KEY',
    enabledEnv: 'STREAM555_DEST_TWITCH_ENABLED',
  },
  {
    platformId: 'kick',
    rtmpUrlEnv: 'STREAM555_DEST_KICK_RTMP_URL',
    streamKeyEnv: 'STREAM555_DEST_KICK_STREAM_KEY',
    enabledEnv: 'STREAM555_DEST_KICK_ENABLED',
  },
  {
    platformId: 'youtube',
    rtmpUrlEnv: 'STREAM555_DEST_YOUTUBE_RTMP_URL',
    streamKeyEnv: 'STREAM555_DEST_YOUTUBE_STREAM_KEY',
    enabledEnv: 'STREAM555_DEST_YOUTUBE_ENABLED',
  },
  {
    platformId: 'facebook',
    rtmpUrlEnv: 'STREAM555_DEST_FACEBOOK_RTMP_URL',
    streamKeyEnv: 'STREAM555_DEST_FACEBOOK_STREAM_KEY',
    enabledEnv: 'STREAM555_DEST_FACEBOOK_ENABLED',
  },
  {
    platformId: 'custom',
    rtmpUrlEnv: 'STREAM555_DEST_CUSTOM_RTMP_URL',
    streamKeyEnv: 'STREAM555_DEST_CUSTOM_STREAM_KEY',
    enabledEnv: 'STREAM555_DEST_CUSTOM_ENABLED',
  },
];

const BASE58_ALPHABET =
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const STREAM555_DEST_SYNC_ON_GO_LIVE_ENV = 'STREAM555_DEST_SYNC_ON_GO_LIVE';
const DEFAULT_CF_CONNECT_TIMEOUT_MS = 45_000;
const DEFAULT_CF_CONNECT_POLL_MS = 5_000;
const BASE58_ALPHABET_MAP = new Map(
  BASE58_ALPHABET.split('').map((char, index) => [char, index]),
);

function getService(runtime: IAgentRuntime): StreamControlService | null {
  return (runtime.getService('stream555') as StreamControlService | undefined) ?? null;
}

function optionString(
  options: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = options?.[key];
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionNumber(
  options: Record<string, unknown> | undefined,
  key: string,
): number | undefined {
  const value = options?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseBooleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  }
  return undefined;
}

function optionBoolean(
  options: Record<string, unknown> | undefined,
  key: string,
): boolean | undefined {
  return parseBooleanValue(options?.[key]);
}

function normalizePipPosition(
  value: string | undefined,
): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'top-left' ||
    normalized === 'top-right' ||
    normalized === 'bottom-left' ||
    normalized === 'bottom-right'
  ) {
    return normalized;
  }
  return undefined;
}

function trimEnv(key: string): string | undefined {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
}

function normalizeEvmPrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim();
  if (!trimmed) throw new Error('EVM private key is empty');
  return trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
}

function base58Encode(bytes: Buffer): string {
  if (bytes.length === 0) return '';
  let value = BigInt(`0x${bytes.toString('hex')}`);
  const output: string[] = [];
  while (value > 0n) {
    const mod = Number(value % 58n);
    output.unshift(BASE58_ALPHABET[mod] ?? '');
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte === 0) output.unshift('1');
    else break;
  }
  return output.join('') || '1';
}

function base58Decode(value: string): Buffer {
  const normalized = value.trim();
  if (!normalized) return Buffer.alloc(0);
  let result = 0n;
  for (const char of normalized) {
    const digit = BASE58_ALPHABET_MAP.get(char);
    if (digit === undefined) {
      throw new Error('invalid base58 input');
    }
    result = result * 58n + BigInt(digit);
  }
  let hex = result.toString(16);
  if (hex.length % 2 !== 0) hex = `0${hex}`;
  let buffer = hex ? Buffer.from(hex, 'hex') : Buffer.alloc(0);
  let leadingOnes = 0;
  for (const char of normalized) {
    if (char === '1') leadingOnes += 1;
    else break;
  }
  if (leadingOnes > 0) {
    buffer = Buffer.concat([Buffer.alloc(leadingOnes), buffer]);
  }
  return buffer;
}

function deriveSolanaAddress(privateKeyBase58: string): string {
  const secretBytes = base58Decode(privateKeyBase58);
  if (secretBytes.length === 64) return base58Encode(secretBytes.subarray(32));
  if (secretBytes.length === 32) {
    const keyObj = crypto.createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        secretBytes,
      ]),
      format: 'der',
      type: 'pkcs8',
    });
    const pubDer = crypto
      .createPublicKey(keyObj)
      .export({ type: 'spki', format: 'der' }) as Buffer;
    return base58Encode(pubDer.subarray(12, 44));
  }
  throw new Error(`Invalid Solana secret key length: ${secretBytes.length}`);
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
      Buffer.from('302e020100300506032b657004220420', 'hex'),
      seed,
    ]),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = crypto.sign(null, Buffer.from(message, 'utf8'), keyObject);
  return base58Encode(signature);
}

async function signWalletChallenge(
  wallet: WalletCandidate,
  message: string,
): Promise<string> {
  if (wallet.chainType === 'evm') {
    const signer = new ethers.Wallet(normalizeEvmPrivateKey(wallet.privateKey));
    return signer.signMessage(message);
  }
  return signSolanaMessage(wallet.privateKey, message);
}

function inferWalletChainType(value: unknown): WalletChainType {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized.includes('sol')) return 'solana';
  return 'evm';
}

function getObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as JsonObject;
}

function getStringField(value: unknown, key: string): string | undefined {
  const objectValue = getObject(value);
  const field = objectValue?.[key];
  return typeof field === 'string' && field.trim() ? field.trim() : undefined;
}

function extractLinkedWalletCandidate(data: JsonObject | undefined): WalletCandidate | null {
  const linkedWallet = getObject(data?.linkedWallet);
  const walletAddress =
    getStringField(linkedWallet, 'address') || getStringField(data, 'walletAddress');
  if (!walletAddress) return null;

  const chainType = inferWalletChainType(
    getStringField(data, 'chainType') ||
      getStringField(linkedWallet, 'chainType') ||
      getStringField(linkedWallet, 'blockchain'),
  );
  const privateKey =
    getStringField(linkedWallet, 'privateKey') ||
    getStringField(linkedWallet, 'secretKey') ||
    getStringField(data, 'privateKey') ||
    getStringField(data, 'secretKey');
  if (!privateKey) return null;

  return {
    chainType,
    walletAddress,
    privateKey: chainType === 'evm' ? normalizeEvmPrivateKey(privateKey) : privateKey,
    source: 'sw4p_linked_wallet',
  };
}

function readRuntimeSetting(runtime: IAgentRuntime, key: string): string | undefined {
  const fromRuntime = runtime.getSetting?.(key) as string | undefined;
  if (typeof fromRuntime === 'string' && fromRuntime.trim()) {
    return fromRuntime.trim();
  }
  return trimEnv(key);
}

function collectRuntimeWalletCandidates(runtime: IAgentRuntime): WalletCandidate[] {
  const candidates: WalletCandidate[] = [];
  const solanaPrivateKey = readRuntimeSetting(runtime, 'SOLANA_PRIVATE_KEY');
  if (solanaPrivateKey) {
    try {
      const walletAddress = deriveSolanaAddress(solanaPrivateKey);
      candidates.push({
        chainType: 'solana',
        walletAddress,
        privateKey: solanaPrivateKey,
        source: 'runtime_wallet',
      });
    } catch {
      // ignored
    }
  }

  const evmPrivateKey = readRuntimeSetting(runtime, 'EVM_PRIVATE_KEY');
  if (evmPrivateKey) {
    try {
      const normalized = normalizeEvmPrivateKey(evmPrivateKey);
      const walletAddress = new ethers.Wallet(normalized).address;
      candidates.push({
        chainType: 'evm',
        walletAddress,
        privateKey: normalized,
        source: 'runtime_wallet',
      });
    } catch {
      // ignored
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

function parseJsonObject(rawBody: string): JsonObject | undefined {
  try {
    const parsed = rawBody ? (JSON.parse(rawBody) as unknown) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function requestJson(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  baseUrl: string,
  endpoint: string,
  headers: Record<string, string>,
  body?: JsonObject,
): Promise<{ ok: boolean; status: number; data?: JsonObject; rawBody: string }> {
  const target = new URL(endpoint, baseUrl);
  const response = await fetch(target, {
    method,
    headers,
    body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
  });

  const rawBody = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    data: parseJsonObject(rawBody),
    rawBody,
  };
}

function parseCsvList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const values = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (values.length === 0) return undefined;
  return [...new Set(values)];
}

function resolveSceneForLayoutMode(
  rawLayoutMode: string | undefined,
  fallbackScene: string,
): string {
  const layoutMode = rawLayoutMode?.trim().toLowerCase() as
    | LiveLayoutMode
    | undefined;
  if (layoutMode === 'camera-hold') return 'active-pip';
  if (layoutMode === 'camera-full') return 'default';
  return fallbackScene;
}

function selectDestinationMappings(
  requestedPlatforms?: string[],
): { mappings: DestinationMapping[]; unsupported: string[] } {
  if (!requestedPlatforms || requestedPlatforms.length === 0) {
    return { mappings: DESTINATION_MAPPINGS, unsupported: [] };
  }

  const mappings: DestinationMapping[] = [];
  const unsupported: string[] = [];
  for (const platformId of requestedPlatforms) {
    const mapping = DESTINATION_MAPPINGS.find((entry) => entry.platformId === platformId);
    if (mapping) {
      mappings.push(mapping);
      continue;
    }
    unsupported.push(platformId);
  }

  return { mappings, unsupported };
}

async function applyConfiguredDestinations(
  service: StreamControlService,
  sessionId: string,
  options?: Record<string, unknown>,
  requestedPlatforms?: string[],
): Promise<DestinationApplyResult> {
  const { mappings, unsupported } = selectDestinationMappings(requestedPlatforms);
  const requestedPlatformSet = new Set(requestedPlatforms ?? []);
  const applied: DestinationApplySuccess[] = [];
  const skipped: DestinationApplySkip[] = [];
  const failed: DestinationApplyFailure[] = unsupported.map((platformId) => ({
    platformId,
    error: 'unsupported_platform',
  }));

  for (const mapping of mappings) {
    const enabled =
      optionBoolean(options, mapping.enabledEnv) ??
      parseBooleanValue(trimEnv(mapping.enabledEnv)) ??
      false;
    const rtmpUrl = optionString(options, mapping.rtmpUrlEnv) ?? trimEnv(mapping.rtmpUrlEnv);
    const streamKey =
      optionString(options, mapping.streamKeyEnv) ?? trimEnv(mapping.streamKeyEnv);
    const hasConfig = Boolean(rtmpUrl?.trim()) || Boolean(streamKey?.trim()) || enabled;
    if (!hasConfig) {
      const reason = 'no_configuration';
      if (requestedPlatformSet.has(mapping.platformId)) {
        failed.push({ platformId: mapping.platformId, error: reason });
      } else {
        skipped.push({ platformId: mapping.platformId, reason });
      }
      continue;
    }

    try {
      await service.updatePlatform(
        mapping.platformId,
        {
          ...(rtmpUrl ? { rtmpUrl } : {}),
          ...(streamKey ? { streamKey } : {}),
          enabled,
        },
        sessionId,
      );
      await service.togglePlatform(mapping.platformId, enabled, sessionId);
      applied.push({
        platformId: mapping.platformId,
        enabled,
        configured: Boolean(rtmpUrl?.trim() || streamKey?.trim()),
      });
    } catch (error) {
      failed.push({
        platformId: mapping.platformId,
        error: (error as Error).message,
      });
    }
  }

  return {
    attempted: mappings.length + unsupported.length,
    applied,
    skipped,
    failed,
  };
}

async function fetchStreamReadinessSnapshot(
  baseUrl: string,
  headers: Record<string, string>,
  sessionId: string,
): Promise<StreamReadinessSnapshot> {
  const response = await requestJson(
    'GET',
    baseUrl,
    `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/status`,
    headers,
  );
  if (!response.ok) {
    throw new Error(
      `stream status check failed (${response.status}): ${getErrorDetail(response)}`,
    );
  }

  const cloudflare = getObject(response.data?.cloudflare);
  const platforms = getObject(response.data?.platforms) ?? {};

  return {
    sessionId,
    active: Boolean(response.data?.active),
    jobId: getStringField(response.data, 'jobId'),
    cfSessionId: getStringField(response.data, 'cfSessionId'),
    cloudflareConnected: Boolean(cloudflare?.isConnected),
    cloudflareState: getStringField(cloudflare, 'state'),
    platforms,
    raw: response.data,
  };
}

async function waitForStreamReadiness(
  baseUrl: string,
  headers: Record<string, string>,
  sessionId: string,
  timeoutMs = DEFAULT_CF_CONNECT_TIMEOUT_MS,
  pollMs = DEFAULT_CF_CONNECT_POLL_MS,
): Promise<{ ready: boolean; lastSnapshot?: StreamReadinessSnapshot }> {
  const deadline = Date.now() + timeoutMs;
  let lastSnapshot: StreamReadinessSnapshot | undefined;

  while (Date.now() <= deadline) {
    lastSnapshot = await fetchStreamReadinessSnapshot(baseUrl, headers, sessionId);
    if (
      lastSnapshot.active &&
      lastSnapshot.cfSessionId &&
      lastSnapshot.cloudflareConnected
    ) {
      return { ready: true, lastSnapshot };
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  return { ready: false, lastSnapshot };
}

function isAlreadyActiveDetail(detail: string): boolean {
  return /already active/i.test(detail);
}

function getErrorDetail(result: { data?: JsonObject; rawBody: string }): string {
  const fromData = result.data?.error;
  if (typeof fromData === 'string' && fromData.trim()) return fromData;
  return result.rawBody || 'upstream request failed';
}

function sendCallback(
  callback: HandlerCallback | undefined,
  success: boolean,
  text: string,
  data?: unknown,
): void {
  if (!callback) return;
  callback({
    text,
    content: success
      ? { success: true, data: data as Record<string, unknown> | undefined }
      : {
          success: false,
          error: text,
          ...(data !== undefined
            ? { data: data as Record<string, unknown> | undefined }
            : {}),
        },
  });
}

async function ensureSessionId(
  service: StreamControlService,
  requestedSessionId?: string,
): Promise<string> {
  if (requestedSessionId?.trim()) return requestedSessionId.trim();
  const bound = service.getBoundSessionId();
  if (bound) return bound;
  const configured = service.getConfig()?.defaultSessionId;
  if (configured?.trim()) return configured.trim();
  const created = await service.createOrResumeSession();
  try {
    await service.bindWebSocket(created.sessionId);
  } catch {
    // ignored
  }
  return created.sessionId;
}

function resolveBaseUrl(
  service: StreamControlService,
  options?: Record<string, unknown>,
): string {
  const fromOptions = optionString(options, 'baseUrl');
  if (fromOptions) return fromOptions;
  const fromConfig = service.getConfig()?.baseUrl;
  if (fromConfig) return fromConfig;
  const fromEnv = trimEnv('STREAM555_BASE_URL');
  if (fromEnv) return fromEnv;
  throw new Error('STREAM555_BASE_URL is required');
}

async function resolveBearerHeaders(
  service: StreamControlService,
  options?: Record<string, unknown>,
): Promise<Record<string, string>> {
  const base = resolveBaseUrl(service, options);
  const explicitBearer = optionString(options, 'bearerToken');
  let token = explicitBearer;

  if (!token && trimEnv(STREAM555_AGENT_API_KEY_ENV)) {
    token = await resolveAgentBearer(base);
  }

  if (!token) {
    token =
      trimEnv(STREAM555_AGENT_TOKEN_ENV) ||
      trimEnv(STREAM_API_BEARER_TOKEN_ENV) ||
      service.getConfig()?.agentToken ||
      (await resolveAgentBearer(base));
  }

  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

function validateService(runtime: IAgentRuntime): StreamControlService {
  const service = getService(runtime);
  if (!service) throw new Error('555stream service is not initialized');
  return service;
}

const goLiveAction: Action = {
  name: 'STREAM555_GO_LIVE',
  description:
    'Legacy compatibility alias: starts/resumes a stream session. Prefer STREAM555_STREAM_START.',
  similes: ['STREAM555_START_LIVE', 'STREAM555_STREAM_GO_LIVE'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const baseUrl = resolveBaseUrl(service, options);
      const headers = await resolveBearerHeaders(service, options);
      const inputType =
        optionString(options, 'inputType') || optionString(options, 'type') || 'screen';
      const inputUrl = optionString(options, 'inputUrl') || optionString(options, 'url');
      const scene = resolveSceneForLayoutMode(
        optionString(options, 'layoutMode'),
        optionString(options, 'scene') || 'default',
      );
      const applyDestinations =
        optionBoolean(options, 'applyDestinations') ??
        parseBooleanValue(trimEnv(STREAM555_DEST_SYNC_ON_GO_LIVE_ENV)) ??
        true;
      const destinationPlatforms = parseCsvList(optionString(options, 'destinationPlatforms'));
      const destinationSync = applyDestinations
        ? await applyConfiguredDestinations(
            service,
            sessionId,
            options,
            destinationPlatforms,
          )
        : {
            attempted: 0,
            applied: [] as DestinationApplySuccess[],
            skipped: [] as DestinationApplySkip[],
            failed: [] as DestinationApplyFailure[],
          };
      if (destinationSync.failed.length > 0) {
        sendCallback(
          callback,
          false,
          `STREAM555_GO_LIVE failed: destination sync failed for ${destinationSync.failed.length} platform(s)`,
          {
            sessionId,
            scene,
            inputType,
            destinationSync,
          },
        );
        return false;
      }

      const startResponse = await requestJson(
        'POST',
        baseUrl,
        `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/stream/start`,
        headers,
        {
          input: {
            type: inputType,
            ...(inputUrl ? { url: inputUrl } : {}),
          },
          options: { scene },
        },
      );
      let initialSnapshot: StreamReadinessSnapshot | undefined;
      const responseCfSessionId = getStringField(startResponse.data, 'cfSessionId');
      if (!startResponse.ok) {
        if (startResponse.status === 409) {
          initialSnapshot = await fetchStreamReadinessSnapshot(baseUrl, headers, sessionId);
        }
        if (!(startResponse.status === 409 && (responseCfSessionId || initialSnapshot?.cfSessionId))) {
          throw new Error(
            `stream/start failed (${startResponse.status}): ${getErrorDetail(startResponse)}`,
          );
        }
      }

      const readiness = await waitForStreamReadiness(baseUrl, headers, sessionId);
      if (!readiness.ready) {
        try {
          await service.stopStream(sessionId);
        } catch {
          // ignored
        }
        sendCallback(
          callback,
          false,
          `STREAM555_GO_LIVE failed: stream start did not reach Cloudflare connected state within ${DEFAULT_CF_CONNECT_TIMEOUT_MS}ms`,
          {
            sessionId,
            scene,
            inputType,
            destinationSync,
            streamStatus: readiness.lastSnapshot?.raw ?? initialSnapshot?.raw,
          },
        );
        return false;
      }

      const result = {
        ...(startResponse.data ?? {}),
        sessionId,
        status:
          getStringField(startResponse.data, 'status') ??
          (startResponse.status === 409 ? 'already-active' : 'started'),
        inputType,
        scene,
        cfSessionId:
          readiness.lastSnapshot?.cfSessionId ??
          responseCfSessionId ??
          initialSnapshot?.cfSessionId,
        cloudflareConnected: readiness.lastSnapshot?.cloudflareConnected ?? false,
        cloudflareState: readiness.lastSnapshot?.cloudflareState,
        destinationSync,
        platformStatuses: readiness.lastSnapshot?.platforms,
        streamStatus: readiness.lastSnapshot?.raw,
      };
      sendCallback(
        callback,
        true,
        `Legacy go-live ready for session ${sessionId}.`,
        result,
      );
      return true;
    } catch (error) {
      sendCallback(callback, false, `STREAM555_GO_LIVE failed: ${(error as Error).message}`);
      return false;
    }
  },
  examples: [] as ActionExample[][],
  parameters: [
    { name: 'sessionId', description: 'Optional session id', required: false, schema: { type: 'string' } },
    { name: 'inputType', description: 'camera|screen|website|avatar|radio|...', required: false, schema: { type: 'string' } },
    { name: 'inputUrl', description: 'Optional source url for website/rtmp/file', required: false, schema: { type: 'string' } },
    { name: 'scene', description: 'Initial scene id', required: false, schema: { type: 'string' } },
    { name: 'layoutMode', description: 'Optional Alice layout mode (camera-full|camera-hold)', required: false, schema: { type: 'string' } },
    { name: 'applyDestinations', description: 'Apply configured RTMP destinations before go-live (default true)', required: false, schema: { type: 'boolean' } },
    { name: 'destinationPlatforms', description: 'Comma-separated subset of destinations to apply before go-live', required: false, schema: { type: 'string' } },
  ],
};

const goLiveSegmentsAction: Action = {
  name: 'STREAM555_GO_LIVE_SEGMENTS',
  description:
    'Legacy compatibility alias for segmented go-live bootstrap on an active session.',
  similes: ['STREAM555_SEGMENTS_START'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const baseUrl = resolveBaseUrl(service, options);
      const headers = await resolveBearerHeaders(service, options);
      const segmentCount = optionNumber(options, 'segmentCount');
      const avgSegmentDurationMs = optionNumber(options, 'avgSegmentDurationMs');
      const segmentTypes = parseCsvList(optionString(options, 'segmentTypes'));
      const topicHints = parseCsvList(optionString(options, 'topicHints'));
      const optionsPayload: JsonObject = {
        ...(optionString(options, 'segmentIntent')
          ? { segmentIntent: optionString(options, 'segmentIntent') }
          : {}),
        ...(segmentTypes ? { segmentTypes } : {}),
        ...(topicHints ? { topicHints } : {}),
        ...(optionString(options, 'theme') ? { theme: optionString(options, 'theme') } : {}),
        ...(typeof segmentCount === 'number' ? { segmentCount: Math.floor(segmentCount) } : {}),
        ...(typeof avgSegmentDurationMs === 'number'
          ? { avgSegmentDurationMs: Math.floor(avgSegmentDurationMs) }
          : {}),
        ...(optionBoolean(options, 'autoStop') !== undefined
          ? { autoStop: optionBoolean(options, 'autoStop') }
          : {}),
      };
      const response = await requestJson(
        'POST',
        baseUrl,
        '/api/agent/v1/go-live/segments',
        headers,
        {
          sessionId,
          options: optionsPayload,
        },
      );
      if (!response.ok) {
        const detail = getErrorDetail(response);
        if (response.status === 409 && isAlreadyActiveDetail(detail)) {
          sendCallback(callback, true, 'Segment orchestration already active.', {
            sessionId,
            alreadyActive: true,
            ...(response.data ?? {}),
          });
          return true;
        }
        throw new Error(`segment bootstrap failed (${response.status}): ${detail}`);
      }

      sendCallback(
        callback,
        true,
        `Segment go-live bootstrapped for session ${sessionId}.`,
        { sessionId, ...(response.data ?? {}), segmentsEnabled: true },
      );
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_GO_LIVE_SEGMENTS failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
  parameters: [
    { name: 'sessionId', description: 'Optional session id', required: false, schema: { type: 'string' } },
    { name: 'segmentIntent', description: 'balanced|news|reaction|gaming|qa|analysis', required: false, schema: { type: 'string' } },
    { name: 'segmentTypes', description: 'Comma-separated segment type list', required: false, schema: { type: 'string' } },
    { name: 'topicHints', description: 'Comma-separated topic hints', required: false, schema: { type: 'string' } },
    { name: 'theme', description: 'Optional segment theme override', required: false, schema: { type: 'string' } },
    { name: 'segmentCount', description: 'Optional segment count', required: false, schema: { type: 'number' } },
    { name: 'avgSegmentDurationMs', description: 'Optional segment duration per segment (ms)', required: false, schema: { type: 'number' } },
    { name: 'autoStop', description: 'Stop orchestration automatically when complete', required: false, schema: { type: 'boolean' } },
  ],
};

const screenShareAction: Action = {
  name: 'STREAM555_SCREEN_SHARE',
  description:
    'Legacy compatibility alias: starts stream with screen input. Prefer STREAM555_STREAM_START with input.type=screen.',
  similes: ['STREAM555_ENABLE_SCREEN_SHARE'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const result = await service.startStream(
        { type: 'screen' },
        undefined,
        undefined,
        sessionId,
      );
      sendCallback(
        callback,
        true,
        `Screen share live on session ${sessionId}.`,
        result,
      );
      return true;
    } catch (error) {
      sendCallback(callback, false, `STREAM555_SCREEN_SHARE failed: ${(error as Error).message}`);
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const endLiveAction: Action = {
  name: 'STREAM555_END_LIVE',
  description: 'Legacy compatibility alias: stops live stream. Prefer STREAM555_STREAM_STOP.',
  similes: ['STREAM555_STOP_LIVE'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const result = await service.stopStream(sessionId);
      sendCallback(callback, true, `Live stopped for session ${sessionId}.`, result);
      return true;
    } catch (error) {
      sendCallback(callback, false, `STREAM555_END_LIVE failed: ${(error as Error).message}`);
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const destinationsApplyAction: Action = {
  name: 'STREAM555_DESTINATIONS_APPLY',
  description:
    'Applies configured destination channel RTMP + key + enabled state to platform routing in 555stream.',
  similes: ['STREAM555_CHANNELS_APPLY', 'STREAM555_DEST_SYNC'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const requestedPlatforms = parseCsvList(optionString(options, 'platforms'));
      const result = await applyConfiguredDestinations(
        service,
        sessionId,
        options,
        requestedPlatforms,
      );

      const success = result.failed.length === 0;
      sendCallback(
        callback,
        success,
        success
          ? `Destinations applied (${result.applied.length} updated, ${result.skipped.length} skipped).`
          : `Destination apply completed with ${result.failed.length} failures.`,
        { sessionId, ...result },
      );
      return success;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_DESTINATIONS_APPLY failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
  parameters: [
    { name: 'sessionId', description: 'Optional session id', required: false, schema: { type: 'string' } },
    { name: 'platforms', description: 'Optional comma-separated platform subset', required: false, schema: { type: 'string' } },
  ],
};

function buildGenericAdPayload(options: Record<string, unknown> | undefined): JsonObject {
  return {
    type: optionString(options, 'type') ?? 'l-bar',
    ...(optionString(options, 'adName') ? { name: optionString(options, 'adName') } : {}),
    ...(optionString(options, 'imageUrl') ? { imageUrl: optionString(options, 'imageUrl') } : {}),
    ...(optionString(options, 'text') ? { text: optionString(options, 'text') } : {}),
    ...(optionNumber(options, 'durationMs') ? { durationMs: optionNumber(options, 'durationMs') } : {}),
  };
}

function buildLBarPayload(options: Record<string, unknown> | undefined): JsonObject {
  return {
    adName:
      optionString(options, 'adName') ||
      optionString(options, 'brandName') ||
      'Sponsored Segment',
    brandName: optionString(options, 'brandName') || 'Sponsor',
    ...(optionString(options, 'brandId') ? { brandId: optionString(options, 'brandId') } : {}),
    ...(optionString(options, 'videoUrl') ? { videoUrl: optionString(options, 'videoUrl') } : {}),
    ...(optionString(options, 'videoAspect')
      ? { videoAspect: optionString(options, 'videoAspect') }
      : {}),
    ...(optionString(options, 'imageUrl') ? { imageUrl: optionString(options, 'imageUrl') } : {}),
    ...(optionString(options, 'text') ? { description: optionString(options, 'text') } : {}),
    ...(optionString(options, 'ctaText') ? { ctaText: optionString(options, 'ctaText') } : {}),
    ...(optionString(options, 'ctaUrl') ? { ctaUrl: optionString(options, 'ctaUrl') } : {}),
    ...(optionString(options, 'qrUrl') ? { qrUrl: optionString(options, 'qrUrl') } : {}),
    ...(optionString(options, 'logoUrl') ? { logoUrl: optionString(options, 'logoUrl') } : {}),
    ...(optionString(options, 'color') ? { color: optionString(options, 'color') } : {}),
    ...(optionString(options, 'twitter') ? { twitter: optionString(options, 'twitter') } : {}),
    ...(optionString(options, 'handle') ? { handle: optionString(options, 'handle') } : {}),
    ...(optionNumber(options, 'durationMs') ? { durationMs: optionNumber(options, 'durationMs') } : {}),
  };
}

const adCreateAction: Action = {
  name: 'STREAM555_AD_CREATE',
  description:
    'Legacy compatibility action for creating ads (supports generic + l-bar from-brand endpoint).',
  similes: ['STREAM555_CREATE_AD'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const baseUrl = resolveBaseUrl(service, options);
      const headers = await resolveBearerHeaders(service, options);
      const type = optionString(options, 'type') || 'l-bar';
      const useLBar = type.toLowerCase() === 'l-bar';
      const endpoint = useLBar
        ? `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/l-bar/from-brand`
        : `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads`;
      const payload = useLBar
        ? buildLBarPayload(options)
        : buildGenericAdPayload(options);
      const response = await requestJson('POST', baseUrl, endpoint, headers, payload);
      if (!response.ok) {
        sendCallback(
          callback,
          false,
          `STREAM555_AD_CREATE failed (${response.status}): ${getErrorDetail(response)}`,
        );
        return false;
      }
      sendCallback(callback, true, 'Ad created.', response.data ?? {});
      return true;
    } catch (error) {
      sendCallback(callback, false, `STREAM555_AD_CREATE failed: ${(error as Error).message}`);
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const adTriggerAction: Action = {
  name: 'STREAM555_AD_TRIGGER',
  description: 'Legacy compatibility action for ad break trigger by adId.',
  similes: ['STREAM555_TRIGGER_AD'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const adId = optionString(options, 'adId');
      if (!adId) {
        sendCallback(callback, false, 'STREAM555_AD_TRIGGER requires adId.');
        return false;
      }
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const durationMs = optionNumber(options, 'durationMs');
      const result = await service.triggerAdBreak(
        adId,
        durationMs ? { duration: durationMs } : undefined,
        sessionId,
      );
      sendCallback(callback, true, `Ad triggered: ${adId}`, result);
      return true;
    } catch (error) {
      sendCallback(callback, false, `STREAM555_AD_TRIGGER failed: ${(error as Error).message}`);
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const adDismissAction: Action = {
  name: 'STREAM555_AD_DISMISS',
  description: 'Legacy compatibility action for ad break dismiss.',
  similes: ['STREAM555_DISMISS_AD'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const result = await service.dismissAdBreak(sessionId);
      sendCallback(callback, true, 'Ad break dismissed.', result);
      return true;
    } catch (error) {
      sendCallback(callback, false, `STREAM555_AD_DISMISS failed: ${(error as Error).message}`);
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

function toNumeric(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

const earningsEstimateAction: Action = {
  name: 'STREAM555_EARNINGS_ESTIMATE',
  description: 'Legacy compatibility action: estimates earnings from current ad inventory stats.',
  similes: ['STREAM555_ADS_EARNINGS', 'STREAM555_EARNINGS'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const ads = await service.listAds(sessionId);
      const totals = ads.reduce(
        (acc, ad) => {
          const impressions = toNumeric((ad as Record<string, unknown>).impressions);
          const clicks = toNumeric((ad as Record<string, unknown>).clicks);
          const earnings = toNumeric((ad as Record<string, unknown>).earningsUsd);
          acc.impressions += impressions;
          acc.clicks += clicks;
          acc.earningsUsd += earnings;
          return acc;
        },
        { impressions: 0, clicks: 0, earningsUsd: 0 },
      );
      sendCallback(callback, true, 'Earnings estimate generated.', {
        sessionId,
        adCount: ads.length,
        ...totals,
      });
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_EARNINGS_ESTIMATE failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const segmentStateAction: Action = {
  name: 'STREAM555_SEGMENT_STATE',
  description: 'Legacy compatibility action: returns stream/segment state snapshot.',
  similes: ['STREAM555_SEGMENTS_STATUS'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const [session, streamStatus] = await Promise.all([
        service.getSession(sessionId),
        service.getStreamStatus(sessionId),
      ]);
      sendCallback(callback, true, 'Segment state fetched.', {
        sessionId,
        session,
        streamStatus,
      });
      return true;
    } catch (error) {
      sendCallback(callback, false, `STREAM555_SEGMENT_STATE failed: ${(error as Error).message}`);
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const segmentOverrideAction: Action = {
  name: 'STREAM555_SEGMENT_OVERRIDE',
  description: 'Legacy compatibility action: applies production-state patch override.',
  similes: ['STREAM555_OVERRIDE_SEGMENT'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const patchCandidate = (options?.patch ?? {}) as Record<string, unknown>;
      const patch = Object.keys(patchCandidate).length > 0
        ? patchCandidate
        : {
            ...(optionString(options, 'activeSceneId')
              ? { activeSceneId: optionString(options, 'activeSceneId') }
              : {}),
            ...(optionString(options, 'activeLayout')
              ? { activeLayout: optionString(options, 'activeLayout') }
              : {}),
            ...(optionString(options, 'pipPosition')
              ? { pipPosition: optionString(options, 'pipPosition') }
              : {}),
          };
      if (Object.keys(patch).length === 0) {
        sendCallback(
          callback,
          false,
          'STREAM555_SEGMENT_OVERRIDE requires patch or override fields.',
        );
        return false;
      }
      const updated = await service.patchState(patch, sessionId);
      sendCallback(callback, true, 'Segment override applied.', { sessionId, patch, updated });
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_SEGMENT_OVERRIDE failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const pipEnableAction: Action = {
  name: 'STREAM555_PIP_ENABLE',
  description: 'Legacy compatibility action: enables PiP layout with optional position.',
  similes: ['STREAM555_ENABLE_PIP'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const pipPosition = normalizePipPosition(optionString(options, 'pipPosition'));
      const patch = {
        activeLayout: 'pip' as const,
        ...(pipPosition ? { pipPosition } : {}),
      };
      const updated = await service.patchState(patch, sessionId);
      sendCallback(callback, true, 'PiP enabled.', { sessionId, updated });
      return true;
    } catch (error) {
      sendCallback(callback, false, `STREAM555_PIP_ENABLE failed: ${(error as Error).message}`);
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const adsSetupDefaultsAction: Action = {
  name: 'STREAM555_ADS_SETUP_DEFAULTS',
  description: 'Legacy compatibility action: initializes default ad templates/rotation for session.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const baseUrl = resolveBaseUrl(service, options);
      const headers = await resolveBearerHeaders(service, options);
      const response = await requestJson(
        'POST',
        baseUrl,
        `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/setup/defaults`,
        headers,
        {},
      );
      if (!response.ok) {
        sendCallback(
          callback,
          false,
          `STREAM555_ADS_SETUP_DEFAULTS failed (${response.status}): ${getErrorDetail(response)}`,
        );
        return false;
      }
      sendCallback(callback, true, 'Default ad setup completed.', response.data ?? {});
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_ADS_SETUP_DEFAULTS failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const adsRotationStartAction: Action = {
  name: 'STREAM555_ADS_ROTATION_START',
  description: 'Legacy compatibility action: starts ad rotation scheduling.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const baseUrl = resolveBaseUrl(service, options);
      const headers = await resolveBearerHeaders(service, options);
      const payload = {
        ...(optionNumber(options, 'intervalSeconds')
          ? { intervalSeconds: optionNumber(options, 'intervalSeconds') }
          : {}),
        ...(optionNumber(options, 'maxAds')
          ? { maxAds: optionNumber(options, 'maxAds') }
          : {}),
      };
      const response = await requestJson(
        'POST',
        baseUrl,
        `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/rotation/start`,
        headers,
        payload,
      );
      if (!response.ok) {
        sendCallback(
          callback,
          false,
          `STREAM555_ADS_ROTATION_START failed (${response.status}): ${getErrorDetail(response)}`,
        );
        return false;
      }
      sendCallback(callback, true, 'Ad rotation started.', response.data ?? {});
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_ADS_ROTATION_START failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const adsTriggerNextAction: Action = {
  name: 'STREAM555_ADS_TRIGGER_NEXT',
  description: 'Legacy compatibility action: triggers next ad from rotation queue.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const baseUrl = resolveBaseUrl(service, options);
      const headers = await resolveBearerHeaders(service, options);
      const response = await requestJson(
        'POST',
        baseUrl,
        `/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/ads/rotation/next`,
        headers,
        {},
      );
      if (!response.ok) {
        sendCallback(
          callback,
          false,
          `STREAM555_ADS_TRIGGER_NEXT failed (${response.status}): ${getErrorDetail(response)}`,
        );
        return false;
      }
      sendCallback(callback, true, 'Triggered next ad.', response.data ?? {});
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_ADS_TRIGGER_NEXT failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const adsStatusAction: Action = {
  name: 'STREAM555_ADS_STATUS',
  description: 'Legacy compatibility action: returns ad inventory and cooldown/status context.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const sessionId = await ensureSessionId(service, optionString(options, 'sessionId'));
      const ads = await service.listAds(sessionId);
      sendCallback(callback, true, 'Ads status fetched.', {
        sessionId,
        adCount: ads.length,
        ads,
      });
      return true;
    } catch (error) {
      sendCallback(callback, false, `STREAM555_ADS_STATUS failed: ${(error as Error).message}`);
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const adsEarningsAction: Action = {
  name: 'STREAM555_ADS_EARNINGS',
  description: 'Legacy compatibility alias for STREAM555_EARNINGS_ESTIMATE.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: earningsEstimateAction.handler,
  examples: [] as ActionExample[][],
};

const authApiKeyCreateAction: Action = {
  name: 'STREAM555_AUTH_APIKEY_CREATE',
  description: 'Creates a new API key through stream auth API.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const baseUrl = resolveBaseUrl(service, options);
      const headers = await resolveBearerHeaders(service, options);
      const payload = {
        ...(optionString(options, 'name') ? { name: optionString(options, 'name') } : {}),
        ...(optionString(options, 'expiresAt')
          ? { expiresAt: optionString(options, 'expiresAt') }
          : {}),
      };
      const response = await requestJson(
        'POST',
        baseUrl,
        '/api/agent/v1/auth/apikeys',
        headers,
        payload,
      );
      if (!response.ok) {
        sendCallback(
          callback,
          false,
          `STREAM555_AUTH_APIKEY_CREATE failed (${response.status}): ${getErrorDetail(response)}`,
        );
        return false;
      }
      sendCallback(callback, true, 'API key created.', response.data ?? {});
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_AUTH_APIKEY_CREATE failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const authApiKeyListAction: Action = {
  name: 'STREAM555_AUTH_APIKEY_LIST',
  description: 'Lists API keys from stream auth API.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const baseUrl = resolveBaseUrl(service, options);
      const headers = await resolveBearerHeaders(service, options);
      const includeRevoked = optionBoolean(options, 'includeRevoked');
      const query = new URLSearchParams();
      if (includeRevoked !== undefined) {
        query.set('includeRevoked', includeRevoked ? 'true' : 'false');
      }
      const endpoint = `/api/agent/v1/auth/apikeys${query.toString() ? `?${query.toString()}` : ''}`;
      const response = await requestJson('GET', baseUrl, endpoint, headers);
      if (!response.ok) {
        sendCallback(
          callback,
          false,
          `STREAM555_AUTH_APIKEY_LIST failed (${response.status}): ${getErrorDetail(response)}`,
        );
        return false;
      }
      sendCallback(callback, true, 'API keys fetched.', response.data ?? {});
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_AUTH_APIKEY_LIST failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const authApiKeyRevokeAction: Action = {
  name: 'STREAM555_AUTH_APIKEY_REVOKE',
  description: 'Revokes an API key by keyId.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const keyId = optionString(options, 'keyId');
      if (!keyId) {
        sendCallback(callback, false, 'STREAM555_AUTH_APIKEY_REVOKE requires keyId.');
        return false;
      }
      const service = validateService(runtime);
      const baseUrl = resolveBaseUrl(service, options);
      const headers = await resolveBearerHeaders(service, options);
      const response = await requestJson(
        'DELETE',
        baseUrl,
        `/api/agent/v1/auth/apikeys/${encodeURIComponent(keyId)}`,
        headers,
      );
      if (!response.ok) {
        sendCallback(
          callback,
          false,
          `STREAM555_AUTH_APIKEY_REVOKE failed (${response.status}): ${getErrorDetail(response)}`,
        );
        return false;
      }
      sendCallback(callback, true, `API key revoked: ${keyId}`, response.data ?? {});
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_AUTH_APIKEY_REVOKE failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const authApiKeySetActiveAction: Action = {
  name: 'STREAM555_AUTH_APIKEY_SET_ACTIVE',
  description: 'Sets STREAM555_AGENT_API_KEY as active runtime credential.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const apiKey = optionString(options, 'apiKey');
      if (!apiKey) {
        sendCallback(callback, false, 'STREAM555_AUTH_APIKEY_SET_ACTIVE requires apiKey.');
        return false;
      }
      const previousApiKey = process.env[STREAM555_AGENT_API_KEY_ENV];
      const previousToken = process.env[STREAM555_AGENT_TOKEN_ENV];
      const previousLegacyToken = process.env[STREAM_API_BEARER_TOKEN_ENV];
      process.env[STREAM555_AGENT_API_KEY_ENV] = apiKey;
      delete process.env[STREAM555_AGENT_TOKEN_ENV];
      delete process.env[STREAM_API_BEARER_TOKEN_ENV];
      invalidateExchangedAgentTokenCache();

      const verifyExchange = optionBoolean(options, 'verifyExchange') ?? true;
      if (verifyExchange) {
        try {
          const service = validateService(runtime);
          const baseUrl = resolveBaseUrl(service, options);
          await resolveAgentBearer(baseUrl);
        } catch (error) {
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
          throw error;
        }
      }

      sendCallback(callback, true, 'Active API key updated.', {
        authSource: describeAgentAuthSource(),
        verifyExchange,
      });
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_AUTH_APIKEY_SET_ACTIVE failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const authDisconnectAction: Action = {
  name: 'STREAM555_AUTH_DISCONNECT',
  description:
    'Clears active stream auth credentials from runtime environment without revoking server-side keys.',
  similes: ['STREAM555_AUTH_LOGOUT'],
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (_runtime, _message, _state, _options, callback) => {
    const previousSource = describeAgentAuthSource();
    const hadCredentials = isAgentAuthConfigured();
    delete process.env[STREAM555_AGENT_API_KEY_ENV];
    delete process.env[STREAM555_AGENT_TOKEN_ENV];
    delete process.env[STREAM_API_BEARER_TOKEN_ENV];
    invalidateExchangedAgentTokenCache();
    sendCallback(
      callback,
      true,
      hadCredentials
        ? 'Active stream auth cleared from runtime.'
        : 'No active stream auth found.',
      {
        cleared: hadCredentials,
        previousAuthSource: previousSource,
        authSource: describeAgentAuthSource(),
      },
    );
    return true;
  },
  examples: [] as ActionExample[][],
};

const authWalletProvisionLinkedAction: Action = {
  name: 'STREAM555_AUTH_WALLET_PROVISION_LINKED',
  description: 'Requests linked-wallet provisioning through /api/auth/wallets/linked.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const baseUrl = resolveBaseUrl(service, options);
      const headers = await resolveBearerHeaders(service, options);
      const targetChain = optionString(options, 'targetChain');
      const response = await requestJson(
        'POST',
        baseUrl,
        '/api/auth/wallets/linked',
        headers,
        {
          ...(targetChain ? { targetChain } : {}),
        },
      );
      if (!response.ok) {
        sendCallback(
          callback,
          false,
          `linked wallet provisioning failed (${response.status}): ${getErrorDetail(response)}`,
        );
        return false;
      }
      sendCallback(callback, true, 'linked wallet provisioned', response.data ?? {});
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_AUTH_WALLET_PROVISION_LINKED failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const authWalletChallengeAction: Action = {
  name: 'STREAM555_AUTH_WALLET_CHALLENGE',
  description: 'Requests wallet challenge payload from stream auth route.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const baseUrl = resolveBaseUrl(service, options);
      const walletAddress = optionString(options, 'walletAddress');
      if (!walletAddress) {
        sendCallback(callback, false, 'walletAddress is required');
        return false;
      }
      const chainType = optionString(options, 'chainType') ?? 'solana';
      const agentId = optionString(options, 'agentId');
      const response = await requestJson(
        'POST',
        baseUrl,
        '/api/agent/v1/auth/wallet/challenge',
        {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        {
          walletAddress,
          chainType,
          ...(agentId ? { agentId } : {}),
        },
      );
      if (!response.ok) {
        sendCallback(
          callback,
          false,
          `wallet challenge failed (${response.status}): ${getErrorDetail(response)}`,
        );
        return false;
      }
      sendCallback(callback, true, 'wallet challenge generated', response.data ?? {});
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_AUTH_WALLET_CHALLENGE failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const authWalletVerifyAction: Action = {
  name: 'STREAM555_AUTH_WALLET_VERIFY',
  description: 'Verifies signed wallet challenge and optionally sets active bearer token.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const baseUrl = resolveBaseUrl(service, options);
      const challengeId = optionString(options, 'challengeId');
      const signature = optionString(options, 'signature');
      if (!challengeId || !signature) {
        sendCallback(callback, false, 'challengeId and signature are required');
        return false;
      }
      const response = await requestJson(
        'POST',
        baseUrl,
        '/api/agent/v1/auth/wallet/verify',
        {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        { challengeId, signature },
      );
      if (!response.ok) {
        sendCallback(
          callback,
          false,
          `wallet verify failed (${response.status}): ${getErrorDetail(response)}`,
        );
        return false;
      }
      const token =
        typeof response.data?.token === 'string' ? response.data.token.trim() : '';
      const setActive = optionBoolean(options, 'setActive') ?? true;
      if (setActive && token) {
        setActiveBearerToken(token);
      }
      const revealToken = optionBoolean(options, 'revealToken') ?? false;
      sendCallback(callback, true, 'wallet verify completed', {
        ...response.data,
        ...(revealToken && token ? { token } : {}),
        activeTokenSet: Boolean(setActive && token),
        authSource: describeAgentAuthSource(),
      });
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_AUTH_WALLET_VERIFY failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

const authWalletLoginAction: Action = {
  name: 'STREAM555_AUTH_WALLET_LOGIN',
  description:
    'End-to-end wallet auth with Solana-preferred runtime key selection and linked-wallet provision fallback.',
  validate: async (runtime) => Boolean(getService(runtime)),
  handler: async (runtime, _message, _state, options, callback) => {
    try {
      const service = validateService(runtime);
      const baseUrl = resolveBaseUrl(service, options);
      const preferredChainRaw =
        optionString(options, 'preferredChain') ||
        trimEnv('STREAM555_WALLET_AUTH_PREFERRED_CHAIN') ||
        'solana';
      const preferredChain = preferredChainRaw.toLowerCase().startsWith('sol')
        ? 'solana'
        : 'evm';
      const allowProvision =
        optionBoolean(options, 'allowProvision') ??
        parseBooleanValue(trimEnv('STREAM555_WALLET_AUTH_ALLOW_PROVISION')) ??
        true;
      const provisionTargetChain =
        optionString(options, 'provisionTargetChain') ||
        trimEnv('STREAM555_WALLET_AUTH_PROVISION_TARGET_CHAIN') ||
        'eth';
      const setActive = optionBoolean(options, 'setActive') ?? true;
      const revealToken = optionBoolean(options, 'revealToken') ?? false;
      const explicitAgentId = optionString(options, 'agentId');

      const runtimeCandidates = collectRuntimeWalletCandidates(runtime);
      let selectedWallet = pickPreferredWallet(runtimeCandidates, preferredChain);
      let linkedWalletProvisioned = false;
      let linkedWalletChain: string | null = null;

      if (!selectedWallet && allowProvision) {
        const headers = await resolveBearerHeaders(service, options);
        const provisionResponse = await requestJson(
          'POST',
          baseUrl,
          '/api/auth/wallets/linked',
          headers,
          {
            targetChain: provisionTargetChain,
          },
        );
        if (!provisionResponse.ok) {
          sendCallback(
            callback,
            false,
            `linked wallet provisioning failed (${provisionResponse.status}): ${getErrorDetail(provisionResponse)}`,
          );
          return false;
        }
        linkedWalletProvisioned = true;
        linkedWalletChain = getStringField(
          provisionResponse.data?.linkedWallet,
          'chainType',
        ) ?? null;
        selectedWallet = extractLinkedWalletCandidate(provisionResponse.data);
        if (!selectedWallet) {
          sendCallback(
            callback,
            false,
            'linked wallet was provisioned but no signing material was returned for challenge verification',
          );
          return false;
        }
      }

      if (!selectedWallet) {
        sendCallback(
          callback,
          false,
          'no wallet available for auth; configure SOLANA_PRIVATE_KEY/EVM_PRIVATE_KEY or enable linked-wallet provisioning',
        );
        return false;
      }

      const challengeResponse = await requestJson(
        'POST',
        baseUrl,
        '/api/agent/v1/auth/wallet/challenge',
        {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        {
          walletAddress: selectedWallet.walletAddress,
          chainType: selectedWallet.chainType,
          ...(explicitAgentId ? { agentId: explicitAgentId } : {}),
        },
      );
      if (!challengeResponse.ok) {
        sendCallback(
          callback,
          false,
          `wallet challenge failed (${challengeResponse.status}): ${getErrorDetail(challengeResponse)}`,
        );
        return false;
      }

      const challengeId = getStringField(challengeResponse.data, 'challengeId');
      const signMessagePayload = getStringField(challengeResponse.data, 'message');
      if (!challengeId || !signMessagePayload) {
        sendCallback(callback, false, 'wallet challenge response missing challengeId or message');
        return false;
      }

      const signature = await signWalletChallenge(selectedWallet, signMessagePayload);
      const verifyResponse = await requestJson(
        'POST',
        baseUrl,
        '/api/agent/v1/auth/wallet/verify',
        {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        {
          challengeId,
          signature,
        },
      );
      if (!verifyResponse.ok) {
        sendCallback(
          callback,
          false,
          `wallet verify failed (${verifyResponse.status}): ${getErrorDetail(verifyResponse)}`,
        );
        return false;
      }

      const token =
        typeof verifyResponse.data?.token === 'string'
          ? verifyResponse.data.token
          : null;
      if (setActive && token) {
        setActiveBearerToken(token);
      }

      const data: JsonObject = {
        baseUrl,
        walletAddress: selectedWallet.walletAddress,
        chainType: selectedWallet.chainType,
        walletSource: selectedWallet.source,
        linkedWalletProvisioned,
        linkedWalletChain,
        authSource: describeAgentAuthSource(),
        activeTokenSet: Boolean(setActive && token),
        agentId:
          typeof verifyResponse.data?.agentId === 'string'
            ? verifyResponse.data.agentId
            : null,
        userId:
          typeof verifyResponse.data?.userId === 'string'
            ? verifyResponse.data.userId
            : null,
        actorId:
          typeof verifyResponse.data?.actorId === 'string'
            ? verifyResponse.data.actorId
            : null,
        policyId:
          typeof verifyResponse.data?.policyId === 'string'
            ? verifyResponse.data.policyId
            : null,
        sessionKind:
          typeof verifyResponse.data?.sessionKind === 'string'
            ? verifyResponse.data.sessionKind
            : null,
        expiresAt:
          typeof verifyResponse.data?.expiresAt === 'string'
            ? verifyResponse.data.expiresAt
            : null,
        scopes: Array.isArray(verifyResponse.data?.scopes)
          ? verifyResponse.data.scopes
          : null,
      };
      if (revealToken && token) {
        data.token = token;
      }

      sendCallback(callback, true, 'wallet auth completed', data);
      return true;
    } catch (error) {
      sendCallback(
        callback,
        false,
        `STREAM555_AUTH_WALLET_LOGIN failed: ${(error as Error).message}`,
      );
      return false;
    }
  },
  examples: [] as ActionExample[][],
};

export const legacyCompatibilityActions: Action[] = [
  goLiveAction,
  goLiveSegmentsAction,
  screenShareAction,
  endLiveAction,
  destinationsApplyAction,
  adCreateAction,
  adTriggerAction,
  adDismissAction,
  segmentStateAction,
  segmentOverrideAction,
  pipEnableAction,
  earningsEstimateAction,
  adsSetupDefaultsAction,
  adsRotationStartAction,
  adsTriggerNextAction,
  adsStatusAction,
  adsEarningsAction,
  authApiKeyCreateAction,
  authApiKeyListAction,
  authApiKeyRevokeAction,
  authApiKeySetActiveAction,
  authDisconnectAction,
  authWalletProvisionLinkedAction,
  authWalletChallengeAction,
  authWalletVerifyAction,
  authWalletLoginAction,
];

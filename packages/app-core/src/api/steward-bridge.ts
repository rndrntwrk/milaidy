import {
  type PolicyResult,
  type PolicyRule,
  type SignTransactionInput,
  type TxRecord,
  StewardApiError,
  StewardClient,
} from "@stwd/sdk";
import { normalizeEnvValueOrNull } from "../utils/env";

export interface StewardBridgeOptions {
  env?: NodeJS.ProcessEnv;
  evmAddress?: string | null;
  agentId?: string | null;
  client?: StewardClient | null;
}

export interface StewardBridgeStatus {
  configured: boolean;
  available: boolean;
  connected: boolean;
  baseUrl: string | null;
  agentId: string | null;
  evmAddress: string | null;
  error: string | null;
}

export interface StewardPendingApprovalResult {
  mode: "steward";
  pendingApproval: true;
  policyResults: PolicyResult[];
}

export interface StewardSignedTransactionResult {
  mode: "steward";
  pendingApproval: false;
  txHash: string;
}

export type StewardExecutionResult =
  | StewardPendingApprovalResult
  | StewardSignedTransactionResult;

/** Alias for steward-specific env resolution. */
const normalizeEnvValue = normalizeEnvValueOrNull;

export function resolveStewardAgentId(
  env: NodeJS.ProcessEnv = process.env,
  evmAddress?: string | null,
): string | null {
  return (
    normalizeEnvValue(env.STEWARD_AGENT_ID) ??
    normalizeEnvValue(env.MILADY_STEWARD_AGENT_ID) ??
    normalizeEnvValue(env.ELIZA_STEWARD_AGENT_ID) ??
    evmAddress?.trim() ??
    null
  );
}

export function createStewardClient(
  options: StewardBridgeOptions = {},
): StewardClient | null {
  if (options.client !== undefined) {
    return options.client;
  }

  const env = options.env ?? process.env;
  const baseUrl = normalizeEnvValue(env.STEWARD_API_URL);
  if (!baseUrl) {
    return null;
  }

  return new StewardClient({
    baseUrl,
    bearerToken: normalizeEnvValue(env.STEWARD_AGENT_TOKEN) ?? undefined,
    apiKey: normalizeEnvValue(env.STEWARD_API_KEY) ?? undefined,
    tenantId: normalizeEnvValue(env.STEWARD_TENANT_ID) ?? undefined,
  });
}

export async function getStewardBridgeStatus(
  options: StewardBridgeOptions = {},
): Promise<StewardBridgeStatus> {
  const env = options.env ?? process.env;
  const baseUrl = normalizeEnvValue(env.STEWARD_API_URL);
  const evmAddress = options.evmAddress ?? null;
  const agentId = options.agentId ?? resolveStewardAgentId(env, evmAddress);
  const client = createStewardClient(options);

  if (!baseUrl || !client) {
    return {
      configured: false,
      available: false,
      connected: false,
      baseUrl,
      agentId,
      evmAddress,
      error: null,
    };
  }

  try {
    if (agentId) {
      try {
        await client.getAgent(agentId);
      } catch (error: unknown) {
        if (
          !(error instanceof StewardApiError) ||
          ((error as StewardApiError).status !== 404 &&
            (error as StewardApiError).status !== 400)
        ) {
          throw error;
        }
      }
    } else {
      await client.listAgents();
    }

    return {
      configured: true,
      available: true,
      connected: true,
      baseUrl,
      agentId,
      evmAddress,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      available: false,
      connected: false,
      baseUrl,
      agentId,
      evmAddress,
      error: formatStewardError(error),
    };
  }
}

/** Check if Steward env vars are configured (synchronous, no network). */
export function isStewardConfigured(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const url = normalizeEnvValue(env.STEWARD_API_URL);
  const agentId = resolveStewardAgentId(env);
  return Boolean(url && agentId);
}

export function formatStewardError(error: unknown): string {
  if (error instanceof StewardApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function signTransactionWithOptionalSteward(params: {
  tx: SignTransactionInput;
  env?: NodeJS.ProcessEnv;
  evmAddress?: string | null;
  agentId?: string | null;
  client?: StewardClient | null;
}): Promise<StewardExecutionResult> {
  const env = params.env ?? process.env;
  const evmAddress = params.evmAddress ?? null;
  const agentId =
    params.agentId ?? resolveStewardAgentId(env, evmAddress) ?? null;
  const client = createStewardClient({
    env,
    evmAddress,
    agentId,
    client: params.client,
  });

  if (!client || !agentId) {
    throw new Error(
      "Steward credentials and agent ID must be provided to sign transactions.",
    );
  }

  // Basic tx shape validation before sending to steward.
  const tx = params.tx;
  if (!tx || typeof tx !== "object") {
    throw new Error("Transaction input is required and must be an object.");
  }
  if (!("to" in tx) || typeof tx.to !== "string" || !tx.to.trim()) {
    throw new Error("Transaction must include a valid 'to' address.");
  }

  const result = await client.signTransaction(agentId, tx);
  if ("txHash" in result) {
    return {
      mode: "steward",
      pendingApproval: false,
      txHash: result.txHash,
    };
  }

  if ("results" in result) {
    return {
      mode: "steward",
      pendingApproval: true,
      policyResults: result.results,
    };
  }

  throw new Error("Steward returned an unsigned transaction unexpectedly");
}

// ── Extended steward operations (not yet in @stwd/sdk) ───────────────────────

/**
 * Build auth headers for direct steward API calls.
 * Used for endpoints not yet exposed in the SDK (pending, approve, deny).
 */
function buildStewardHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Headers {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  const bearerToken = normalizeEnvValue(env.STEWARD_AGENT_TOKEN);
  const apiKey = normalizeEnvValue(env.STEWARD_API_KEY);
  const tenantId = normalizeEnvValue(env.STEWARD_TENANT_ID);

  if (bearerToken) {
    headers.set("Authorization", `Bearer ${bearerToken}`);
  } else if (apiKey) {
    headers.set("X-Steward-Key", apiKey);
  }
  if (tenantId) {
    headers.set("X-Steward-Tenant", tenantId);
  }
  return headers;
}

function getStewardBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  return normalizeEnvValue(env.STEWARD_API_URL);
}

export interface StewardPendingEntry {
  queueId: string;
  status: string;
  requestedAt: string;
  transaction: TxRecord;
}

/**
 * Fetch pending approval queue from steward.
 * Returns empty array if the endpoint is not available (404).
 */
export async function getStewardPendingApprovals(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<StewardPendingEntry[]> {
  const baseUrl = getStewardBaseUrl(env);
  if (!baseUrl) throw new Error("Steward not configured");

  const headers = buildStewardHeaders(env);
  const res = await fetch(
    `${baseUrl}/vault/${encodeURIComponent(agentId)}/pending`,
    { headers },
  );

  if (res.status === 404) return [];

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Steward pending approvals failed (${res.status}): ${errText}`);
  }

  const body = await res.json();
  return body.data ?? body ?? [];
}

/**
 * Approve a pending transaction on steward.
 */
export async function approveStewardTransaction(
  agentId: string,
  txId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ txId: string; txHash?: string }> {
  const baseUrl = getStewardBaseUrl(env);
  if (!baseUrl) throw new Error("Steward not configured");

  const headers = buildStewardHeaders(env);
  const res = await fetch(
    `${baseUrl}/vault/${encodeURIComponent(agentId)}/approve/${encodeURIComponent(txId)}`,
    { method: "POST", headers },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Steward approve failed (${res.status}): ${errText}`);
  }

  const body = await res.json();
  return body.data ?? body;
}

/**
 * Deny/reject a pending transaction on steward.
 * Uses POST /vault/:agentId/reject/:txId
 */
export async function denyStewardTransaction(
  agentId: string,
  txId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ txId: string }> {
  const baseUrl = getStewardBaseUrl(env);
  if (!baseUrl) throw new Error("Steward not configured");

  const headers = buildStewardHeaders(env);
  const res = await fetch(
    `${baseUrl}/vault/${encodeURIComponent(agentId)}/reject/${encodeURIComponent(txId)}`,
    { method: "POST", headers },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "Unknown error");
    throw new Error(`Steward deny failed (${res.status}): ${errText}`);
  }

  const body = await res.json().catch(() => ({}));
  return body.data ?? body ?? { txId };
}

/**
 * Fetch transaction history from steward.
 * Returns TxRecord[] — the full transaction objects, not just {timestamp, value}.
 */
export async function getStewardHistory(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<TxRecord[]> {
  const client = createStewardClient({ env });
  if (!client) throw new Error("Steward not configured");

  // getHistory() returns TxRecord[] from the steward API despite the SDK
  // type annotation saying StewardHistoryEntry[]. The actual API returns
  // full transaction records with id, status, request, policyResults, etc.
  const history = await client.getHistory(agentId);
  return history as unknown as TxRecord[];
}

/**
 * Provision a steward wallet for a new agent.
 * Creates the agent identity + wallet on steward, optionally with default policies.
 */
export async function provisionStewardWallet(params: {
  agentId: string;
  agentName: string;
  platformId?: string;
  defaultPolicies?: PolicyRule[];
  env?: NodeJS.ProcessEnv;
}): Promise<{ walletAddress: string }> {
  const env = params.env ?? process.env;
  const client = createStewardClient({ env });
  if (!client) {
    throw new Error("Steward not configured — cannot provision wallet");
  }

  const identity = await client.createWallet(
    params.agentId,
    params.agentName,
    params.platformId,
  );

  // Apply default policies if provided
  if (params.defaultPolicies && params.defaultPolicies.length > 0) {
    await client.setPolicies(params.agentId, params.defaultPolicies);
  }

  return { walletAddress: identity.walletAddress };
}

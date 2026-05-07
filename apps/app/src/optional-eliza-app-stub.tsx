import type {
  CompanionSceneStatus,
  CompanionShellComponentProps,
  VincentStateHookArgs,
  VincentStateHookResult,
} from "@elizaos/app-core";
import {
  DEFAULT_WALLET_RPC_SELECTIONS,
  normalizeWalletRpcSelections,
  type WalletConfigStatus,
  type WalletConfigUpdateRequest,
  type WalletRpcChain,
  type WalletRpcCredentialKey,
  type WalletRpcSelections,
} from "@elizaos/shared";
import * as THREE from "three";

/** Stub that ignores props — optional-app packages resolve here without bundled implementations. */
function EmptyComponent(_props: object): null {
  return null;
}

export const BSC_GAS_READY_THRESHOLD = 0.005;
export const BSC_GAS_THRESHOLD = 0.005;
export const HEX_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
export const PRIMARY_CHAIN_KEYS = [
  "ethereum",
  "base",
  "bsc",
  "avax",
  "solana",
] as const;
export const CHAIN_CONFIGS = {};

export function isAvaxChainName(chain: string): boolean {
  const normalized = chain.trim().toLowerCase();
  return (
    normalized === "avax" ||
    normalized === "avalanche" ||
    normalized === "c-chain" ||
    normalized === "avalanche c-chain"
  );
}

export function isBscChainName(chain: string): boolean {
  const normalized = chain.trim().toLowerCase();
  return (
    normalized === "bsc" ||
    normalized === "bnb chain" ||
    normalized === "bnb smart chain"
  );
}

export function toNormalizedAddress(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveChainKey(chain: string): string | null {
  const normalized = chain.trim().toLowerCase();
  return (PRIMARY_CHAIN_KEYS as readonly string[]).includes(normalized)
    ? normalized
    : null;
}

export function getChainConfig(): null {
  return null;
}

export function getContractLogoUrl(): null {
  return null;
}

export function getExplorerTokenUrl(): null {
  return null;
}

export function getExplorerTxUrl(): null {
  return null;
}

export function getNativeLogoUrl(): null {
  return null;
}

export function getStablecoinAddress(): null {
  return null;
}

export function chainKeyToWalletRpcChain(
  chainFocus: string,
): "evm" | "bsc" | "solana" | null {
  if (chainFocus === "bsc" || chainFocus === "solana") return chainFocus;
  if (
    chainFocus === "ethereum" ||
    chainFocus === "base" ||
    chainFocus === "avax"
  ) {
    return "evm";
  }
  return null;
}

/** Matches real `@elizaos/app-companion/ui` — stub satisfies `AppBootConfig.companionShell`. */
export function CompanionShell(_props: CompanionShellComponentProps): null {
  return null;
}
export const ChainIcon = EmptyComponent;
export const InventoryView = EmptyComponent;
export const TokenLogo = EmptyComponent;
export const GlobalEmoteOverlay = EmptyComponent;
export const InferenceCloudAlertButton = EmptyComponent;
export const LifeOpsActivitySignalsEffect = EmptyComponent;
export const AppBlockerSettingsCard = EmptyComponent;
export const LifeOpsBrowserSetupPanel = EmptyComponent;
export const LifeOpsPageView = EmptyComponent;
export const WebsiteBlockerSettingsCard = EmptyComponent;
export const ApprovalQueue = EmptyComponent;
export const StewardLogo = EmptyComponent;
export const TransactionHistory = EmptyComponent;
export const CodingAgentControlChip = EmptyComponent;
export const CodingAgentSettingsSection = EmptyComponent;
export const CodingAgentTasksPanel = EmptyComponent;
export const PtyConsoleDrawer = EmptyComponent;
export const FineTuningView = EmptyComponent;

export function createVectorBrowserRenderer(): Promise<null> {
  return Promise.resolve(null);
}

export function useInventoryData(): {
  balances: null;
  loading: boolean;
  error: null;
  refresh: () => Promise<void>;
} {
  return {
    balances: null,
    loading: false,
    error: null,
    refresh: asyncNoop,
  };
}

export const WALLET_STATUS_WIDGET = {
  id: "wallet.status",
  pluginId: "wallet",
  order: 70,
  defaultEnabled: true,
  Component: EmptyComponent,
};

export function prefetchVrmToCache(_url?: string): Promise<void> {
  return Promise.resolve();
}

export function resolveCompanionInferenceNotice(): null {
  return null;
}

export function useCompanionSceneStatus(): CompanionSceneStatus {
  return { avatarReady: false, teleportKey: "" };
}

export function useVincentState(
  _args: VincentStateHookArgs,
): VincentStateHookResult {
  return {
    vincentConnected: false,
    vincentLoginBusy: false,
    vincentLoginError: null,
    vincentConnectedAt: null,
    handleVincentLogin: async () => {},
    handleVincentDisconnect: async () => {},
    pollVincentStatus: async () => false,
  };
}

export function resolveInitialWalletRpcSelections(
  walletConfig: WalletConfigStatus | null | undefined,
): WalletRpcSelections {
  return normalizeWalletRpcSelections(
    walletConfig?.selectedRpcProviders ?? DEFAULT_WALLET_RPC_SELECTIONS,
  );
}

export function buildWalletRpcUpdateRequest(args: {
  walletConfig?: WalletConfigStatus | null;
  rpcFieldValues: Partial<Record<WalletRpcCredentialKey, string>>;
  selectedProviders:
    | WalletRpcSelections
    | Partial<Record<WalletRpcChain, string | null | undefined>>;
  selectedNetwork?: "mainnet" | "testnet";
}): WalletConfigUpdateRequest {
  return {
    selections: normalizeWalletRpcSelections(args.selectedProviders),
    walletNetwork:
      args.selectedNetwork ??
      (args.walletConfig?.walletNetwork === "testnet" ? "testnet" : "mainnet"),
    credentials: {},
  };
}

function noop(): void {}

async function asyncNoop(): Promise<void> {}

export function useWalletState(_args: object) {
  return {
    state: {
      browserEnabled: true,
      computerUseEnabled: false,
      walletEnabled: true,
      walletAddresses: null,
      walletConfig: null,
      walletBalances: null,
      walletNfts: null,
      walletLoading: false,
      walletNftsLoading: false,
      inventoryView: "tokens",
      walletExportData: null,
      walletExportVisible: false,
      walletApiKeySaving: false,
      wallets: [],
      walletPrimary: null,
      walletPrimaryRestarting: {},
      walletPrimaryPending: {},
      cloudRefreshing: false,
      inventorySort: "value",
      inventorySortDirection: "desc",
      inventoryChainFilters: {
        ethereum: true,
        base: true,
        bsc: true,
        avax: true,
        solana: true,
      },
      walletError: null,
      registryStatus: null,
      registryLoading: false,
      registryRegistering: false,
      registryError: null,
      dropStatus: null,
      dropLoading: false,
      mintInProgress: false,
      mintResult: null,
      mintError: null,
      mintShiny: false,
      whitelistStatus: null,
      whitelistLoading: false,
    },
    setBrowserEnabled: noop,
    setComputerUseEnabled: noop,
    setWalletEnabled: noop,
    setWalletAddresses: noop,
    setInventoryView: noop,
    setInventorySort: noop,
    setInventorySortDirection: noop,
    setInventoryChainFilters: noop,
    setWalletError: noop,
    setRegistryError: noop,
    setMintResult: noop,
    setMintError: noop,
    loadWalletConfig: asyncNoop,
    loadBalances: asyncNoop,
    loadNfts: asyncNoop,
    handleWalletApiKeySave: async () => false,
    setWalletPrimary: asyncNoop,
    setPrimary: asyncNoop,
    refreshCloud: asyncNoop,
    refreshCloudWallets: asyncNoop,
    handleExportKeys: asyncNoop,
    loadRegistryStatus: asyncNoop,
    registerOnChain: asyncNoop,
    syncRegistryProfile: asyncNoop,
    loadDropStatus: asyncNoop,
    mintFromDrop: asyncNoop,
    loadWhitelistStatus: asyncNoop,
  };
}

export function dispatchQueuedLifeOpsGithubCallbackFromUrl(
  _url?: string,
): void {}

export type PreflightAuthStatus =
  | "authenticated"
  | "unauthenticated"
  | "unknown";

export interface NormalizedPreflightAuth {
  status: PreflightAuthStatus;
  method?: string;
  detail?: string;
  loginHint?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizePreflightAuth(
  raw: unknown,
): NormalizedPreflightAuth | undefined {
  if (!isRecord(raw)) return undefined;
  const rawStatus = typeof raw.status === "string" ? raw.status : "";
  const status: PreflightAuthStatus =
    rawStatus === "authenticated" || rawStatus === "unauthenticated"
      ? rawStatus
      : "unknown";
  const out: NormalizedPreflightAuth = { status };
  if (typeof raw.method === "string") out.method = raw.method;
  if (typeof raw.detail === "string") out.detail = raw.detail;
  if (typeof raw.loginHint === "string") out.loginHint = raw.loginHint;
  return out;
}

export interface SanitizedAuthResult {
  launched?: boolean;
  url?: string;
  deviceCode?: string;
  instructions?: string;
}

export function sanitizeAuthResult(input: unknown): SanitizedAuthResult {
  if (!isRecord(input)) return {};
  const out: SanitizedAuthResult = {};
  if (typeof input.launched === "boolean") out.launched = input.launched;
  if (typeof input.url === "string") {
    try {
      const parsed = new URL(input.url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        out.url = input.url;
      }
    } catch {
      // Drop malformed URLs; the UI can fall back to instructions.
    }
  }
  if (typeof input.deviceCode === "string") {
    out.deviceCode = input.deviceCode;
  }
  if (typeof input.instructions === "string") {
    out.instructions = input.instructions;
  }
  return out;
}

export type CoordinationDecisionKind =
  | "respond"
  | "escalate"
  | "ignore"
  | "complete"
  | "auto_resolved"
  | "stopped";

export interface CoordinationDecision {
  timestamp: number;
  event: string;
  promptText: string;
  decision: CoordinationDecisionKind;
  response?: string;
  reasoning: string;
}

export type CoordinatorTaskStatus =
  | "active"
  | "blocked"
  | "tool_running"
  | "completed"
  | "error"
  | "stopped";

export interface TaskContext {
  threadId: string;
  taskNodeId?: string;
  sessionId: string;
  agentType: string;
  label: string;
  originalTask: string;
  workdir: string;
  repo?: string;
  originRoomId?: string;
  originMetadata?: Record<string, unknown>;
  status: CoordinatorTaskStatus;
  decisions: CoordinationDecision[];
  autoResolvedCount: number;
  registeredAt: number;
  lastActivityAt: number;
  idleCheckCount: number;
  taskDelivered: boolean;
  completionSummary?: string;
  lastSeenDecisionIndex: number;
  lastInputSentAt?: number;
  stoppedAt?: number;
}

export interface SwarmEvent {
  type: string;
  sessionId: string;
  timestamp: number;
  data: unknown;
}

export interface TaskCompletionSummary {
  sessionId: string;
  label: string;
  agentType: string;
  originalTask: string;
  status: string;
  completionSummary: string;
  [key: string]: unknown;
}

export { THREE };
